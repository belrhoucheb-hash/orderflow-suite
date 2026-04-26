import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { ImapFlow } from "npm:imapflow@1.0.171";
import { corsFor, handleOptions } from "../_shared/cors.ts";

const CORS_OPTIONS = {
  extraHeaders: [
    "x-supabase-client-platform",
    "x-supabase-client-platform-version",
    "x-supabase-client-runtime",
    "x-supabase-client-runtime-version",
  ],
};

// ── EML parsing helpers (shared with import-email) ──

function decodeBase64(b64: string): string {
  try {
    const binary = atob(b64.replace(/\s/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return "";
  }
}

function base64ToUint8Array(b64: string): Uint8Array {
  const clean = b64.replace(/\s/g, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

interface ParsedEmail {
  messageId: string;
  from: string;
  subject: string;
  date: string;
  body: string;
  attachments: { name: string; type: string; data: Uint8Array }[];
}

function parseEml(raw: string, messageId = ""): ParsedEmail {
  const headerEnd = raw.indexOf("\n\n");
  const headerBlock = headerEnd > 0 ? raw.substring(0, headerEnd) : "";
  const unfoldedHeaders = headerBlock.replace(/\r?\n[ \t]+/g, " ");

  const getHeader = (name: string): string => {
    const regex = new RegExp(`^${name}:\\s*(.+)$`, "im");
    const match = unfoldedHeaders.match(regex);
    return match ? match[1].trim() : "";
  };

  const from = getHeader("From");
  const subject = getHeader("Subject");
  const date = getHeader("Date");
  const mid = messageId || getHeader("Message-ID") || `auto-${Date.now()}`;

  const boundaryMatch =
    raw.match(/boundary="([^"]+)"/i) || raw.match(/boundary=([^\s;]+)/i);

  let body = "";
  const attachments: { name: string; type: string; data: Uint8Array }[] = [];

  if (!boundaryMatch) {
    body = headerEnd > 0 ? raw.substring(headerEnd + 2) : "";
    return { messageId: mid, from, subject, date, body, attachments };
  }

  const boundary = boundaryMatch[1];
  const parts = raw.split(`--${boundary}`);

  for (const part of parts) {
    if (part.startsWith("--") || part.trim() === "") continue;
    const partHeaderEnd = part.indexOf("\n\n");
    if (partHeaderEnd < 0) continue;
    const partHeaders = part.substring(0, partHeaderEnd);
    const partBody = part.substring(partHeaderEnd + 2).trim();
    const contentType =
      partHeaders.match(/Content-Type:\s*([^\s;]+)/i)?.[1] || "";
    const isAttachment = /Content-Disposition:\s*attachment/i.test(partHeaders);
    const filenameMatch =
      partHeaders.match(/filename="([^"]+)"/i) ||
      partHeaders.match(/name="([^"]+)"/i);

    if (
      contentType === "multipart/alternative" ||
      contentType === "multipart/mixed"
    ) {
      const innerBoundaryMatch =
        partHeaders.match(/boundary="([^"]+)"/i) ||
        partHeaders.match(/boundary=([^\s;]+)/i);
      if (innerBoundaryMatch) {
        const innerParts = partBody.split(`--${innerBoundaryMatch[1]}`);
        for (const innerPart of innerParts) {
          if (innerPart.startsWith("--") || innerPart.trim() === "") continue;
          const iPHeaderEnd = innerPart.indexOf("\n\n");
          if (iPHeaderEnd < 0) continue;
          const iPHeaders = innerPart.substring(0, iPHeaderEnd);
          const iPBody = innerPart.substring(iPHeaderEnd + 2).trim();
          const iContentType =
            iPHeaders.match(/Content-Type:\s*([^\s;]+)/i)?.[1] || "";
          const isBase64 =
            /Content-Transfer-Encoding:\s*base64/i.test(iPHeaders);
          if (iContentType === "text/plain" && !body) {
            body = isBase64 ? decodeBase64(iPBody) : iPBody;
          }
        }
      }
    } else if (
      isAttachment ||
      (contentType === "application/pdf" && filenameMatch)
    ) {
      attachments.push({
        name: filenameMatch?.[1] || "attachment",
        type: contentType,
        data: base64ToUint8Array(partBody),
      });
    } else if (contentType === "text/plain" && !body) {
      const isBase64 =
        /Content-Transfer-Encoding:\s*base64/i.test(partHeaders);
      body = isBase64 ? decodeBase64(partBody) : partBody;
    }
  }

  return { messageId: mid, from, subject, date, body, attachments };
}

// ── Retry helper with exponential backoff for 429 errors ──
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const resp = await fetch(url, options);
    if (resp.status === 429 && attempt < maxRetries) {
      const backoff = Math.pow(2, attempt) * 1000 + Math.random() * 500;
      console.warn(`429 rate-limited, retrying in ${Math.round(backoff)}ms (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise((r) => setTimeout(r, backoff));
      continue;
    }
    return resp;
  }
  return fetch(url, options);
}

// ── Gemini API helper ──
function geminiUrl(): string {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY is not configured");
  return `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
}

function parseGeminiResponse(json: any): string | null {
  return json?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
}

// ── Rule-based pre-classification ──
type EmailClassification = "cancellation" | "confirmation" | "order" | null;

async function ruleBasedClassify(
  subject: string,
  fromAddr: string,
  supabase: any,
  tenantId: string
): Promise<EmailClassification> {
  const subjectLower = subject.toLowerCase();

  if (subjectLower.includes("annulering") || subjectLower.includes("cancel")) {
    return "cancellation";
  }

  if (subjectLower.includes("bevestiging") || subjectLower.includes("confirmation")) {
    return "confirmation";
  }

  if (fromAddr) {
    const { data: knownClient } = await supabase
      .from("clients")
      .select("id")
      .eq("email", fromAddr)
      .eq("tenant_id", tenantId)
      .limit(1);
    if (knownClient && knownClient.length > 0) {
      return "order";
    }
  }

  return null;
}

// ── Inbox config + lifecycle ──

interface InboxConfig {
  id: string;
  tenantId: string;
  label: string;
  host: string;
  port: number;
  username: string;
  password: string;
  folder: string;
}

interface InboxResult {
  label: string;
  tenantId: string;
  processed: number;
  orders: { orderNumber: number; status: string; confidence: number }[];
  error?: string;
}

// Backoff: <3 failures = immediate, 3 = 15m, 4 = 1h, 5+ = 6h
function computeNextPollAt(failures: number): string | null {
  if (failures < 3) return null;
  const minutes = failures === 3 ? 15 : failures === 4 ? 60 : 360;
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

async function loadInboxConfigs(supabase: any): Promise<InboxConfig[]> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("tenant_inboxes")
    .select("id, tenant_id, label, host, port, username, folder, next_poll_at, password_secret_id")
    .eq("is_active", true)
    .or(`next_poll_at.is.null,next_poll_at.lte.${nowIso}`);

  if (error) {
    console.error("Failed to load tenant_inboxes:", error.message);
    return [];
  }

  const configs: InboxConfig[] = [];
  for (const row of data || []) {
    if (!row.password_secret_id) {
      console.warn(`Inbox ${row.label}: no password set, skipping`);
      continue;
    }
    const { data: pwData, error: pwErr } = await supabase.rpc("get_tenant_inbox_password", {
      p_inbox_id: row.id,
    });
    if (pwErr || !pwData) {
      console.error(`Inbox ${row.label}: decrypt failed`);
      await markInboxError(supabase, row.id, "decrypt_failed");
      continue;
    }
    configs.push({
      id: row.id,
      tenantId: row.tenant_id,
      label: row.label,
      host: row.host,
      port: row.port,
      username: row.username,
      password: pwData,
      folder: row.folder || "INBOX",
    });
  }
  return configs;
}

async function markInboxError(supabase: any, inboxId: string, errorMsg: string) {
  const { data } = await supabase
    .from("tenant_inboxes")
    .select("consecutive_failures")
    .eq("id", inboxId)
    .single();
  const failures = (data?.consecutive_failures ?? 0) + 1;
  const update: Record<string, any> = {
    last_polled_at: new Date().toISOString(),
    last_error: errorMsg.substring(0, 500),
    consecutive_failures: failures,
    next_poll_at: computeNextPollAt(failures),
  };
  // Auto-deactivate on repeated decrypt failures, likely key rotation
  if (errorMsg === "decrypt_failed" && failures >= 3) {
    update.is_active = false;
  }
  await supabase.from("tenant_inboxes").update(update).eq("id", inboxId);
}

async function markInboxSuccess(supabase: any, inboxId: string) {
  await supabase.from("tenant_inboxes").update({
    last_polled_at: new Date().toISOString(),
    last_error: null,
    consecutive_failures: 0,
    next_poll_at: null,
  }).eq("id", inboxId);
}

// ── Single-inbox polling (core logic) ──

async function pollOneInbox(config: InboxConfig, supabase: any): Promise<InboxResult> {
  const result: InboxResult = {
    label: config.label,
    tenantId: config.tenantId,
    processed: 0,
    orders: [],
  };

  const tenantId = config.tenantId;

  // §27: orders.department_id is NOT NULL. Bij binnenkomst van een mail weten we
  // de echte afdeling nog niet (parse-order werkt het later bij). Fallback: OPS.
  const { data: opsDept } = await supabase
    .from("departments")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("code", "OPS")
    .single();
  if (!opsDept) {
    throw new Error(`OPS-department ontbreekt voor tenant ${tenantId}`);
  }
  const opsDeptId: string = opsDept.id;

  let client: ImapFlow | null = null;
  try {
    client = new ImapFlow({
      host: config.host,
      port: config.port,
      secure: config.port === 993,
      auth: { user: config.username, pass: config.password },
      logger: false,
    });

    await client.connect();

    const lock = await client.getMailboxLock(config.folder);

    try {
      const uids = await client.search({ seen: false }, { uid: true });

      if (uids.length === 0) {
        lock.release();
        await client.logout();
        return result;
      }

      const toProcess = uids.slice(0, 10);

      for (const uid of toProcess) {
        try {
          const msg = await client.fetchOne(uid, { source: true, envelope: true }, { uid: true });
          const rawEmail = msg.source?.toString("utf-8");
          if (!rawEmail) continue;

          const fromAddr = msg.envelope?.from?.[0]?.address || "";
          const subject = msg.envelope?.subject || "";
          const messageId = msg.envelope?.messageId || `uid-${uid}`;

          // ── Thread detection ──
          const isReply = /^(re|fw|fwd):\s*/i.test(subject);
          const cleanSubject = subject.replace(/^(re|fw|fwd):\s*/gi, "").trim();
          let parentOrder: any = null;

          if (isReply && fromAddr) {
            const { data: candidates } = await supabase
              .from("orders")
              .select("id, order_number, client_name, weight_kg, quantity, unit, pickup_address, delivery_address, requirements, status")
              .eq("source_email_from", fromAddr)
              .eq("tenant_id", tenantId)
              .ilike("source_email_subject", `%${cleanSubject.substring(0, 60)}%`)
              .order("created_at", { ascending: false })
              .limit(1);

            if (candidates && candidates.length > 0) {
              parentOrder = candidates[0];
            }
          }

          if (!isReply) {
            const { data: existing } = await supabase
              .from("orders")
              .select("id")
              .eq("source_email_from", fromAddr)
              .eq("source_email_subject", subject)
              .eq("tenant_id", tenantId)
              .limit(1);

            if (existing && existing.length > 0) {
              await client.messageFlagsAdd({ uid }, ["\\Seen"], { uid: true });
              continue;
            }
          }

          const parsed = parseEml(rawEmail, messageId);

          const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
          const ruleResult = await ruleBasedClassify(subject, fromAddr, supabase, tenantId);

          if (ruleResult) {
            // Rule-based classification succeeded, skip AI classifier
          } else if (GEMINI_API_KEY && parsed.body) {
            try {
              const classifyResp = await fetchWithRetry(geminiUrl(), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  systemInstruction: { parts: [{ text: "Je bent een e-mail classifier. Bepaal of een e-mail gaat over transport, logistiek, verzending of orders. Antwoord ALLEEN met JSON: {\"is_transport\": true} of {\"is_transport\": false}" }] },
                  contents: [{ role: "user", parts: [{ text: `Onderwerp: ${subject}\nVan: ${fromAddr}\n\n${parsed.body.substring(0, 500)}` }] }],
                  generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
                }),
              });
              if (classifyResp.ok) {
                const classifyResult = await classifyResp.json();

                const usage = classifyResult.usageMetadata;
                if (usage && tenantId) {
                  const inputTokens = usage.promptTokenCount || 0;
                  const outputTokens = usage.candidatesTokenCount || 0;
                  const cost = (inputTokens / 1_000_000) * 0.075 + (outputTokens / 1_000_000) * 0.3;
                  await supabase.from("ai_usage_log").insert({
                    tenant_id: tenantId,
                    function_name: "poll-inbox-classify",
                    model: "gemini-2.5-flash",
                    input_tokens: inputTokens,
                    output_tokens: outputTokens,
                    cost_estimate: cost
                  });
                }

                const text = parseGeminiResponse(classifyResult);
                if (text) {
                  const parsed_result = JSON.parse(text);
                  if (parsed_result.is_transport === false) {
                    await client.messageFlagsAdd({ uid }, ["\\Seen"], { uid: true });
                    continue;
                  }
                }
              } else {
                await classifyResp.text();
              }
            } catch (classErr) {
              console.error("Classification error:", classErr instanceof Error ? classErr.message : "unknown");
            }
          } else if (!parsed.body && parsed.attachments.length === 0) {
            await client.messageFlagsAdd({ uid }, ["\\Seen"], { uid: true });
            continue;
          }

          // Upload attachments
          const uploadedAttachments: { name: string; url: string; type: string }[] = [];
          const timestamp = Date.now();

          for (const att of parsed.attachments) {
            const path = `imports/${timestamp}_${att.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
            const { error: uploadError } = await supabase.storage
              .from("email-attachments")
              .upload(path, att.data, { contentType: att.type, upsert: true });
            if (uploadError) { console.error("Upload error:", uploadError.message); continue; }

            const { data: urlData } = supabase.storage.from("email-attachments").getPublicUrl(path);
            uploadedAttachments.push({ name: att.name, url: urlData.publicUrl, type: att.type });
          }

          // AI extraction via parse-order
          const pdfUrls = uploadedAttachments.filter((a) => a.type === "application/pdf").map((a) => a.url);
          let confidence = 0;
          let extracted: any = null;
          let parseData: any = null;

          if (GEMINI_API_KEY && (parsed.body || pdfUrls.length > 0)) {
            try {
              const threadContext = parentOrder ? { parentOrder } : undefined;
              const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
              const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
              const parseResp = await fetch(`${supabaseUrl}/functions/v1/parse-order`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseKey}` },
                body: JSON.stringify({ emailBody: parsed.body, pdfUrls, threadContext, tenantId }),
              });

              if (parseResp.ok) {
                parseData = await parseResp.json();
                extracted = parseData.extracted;
                if (extracted) confidence = extracted.confidence_score || 0;
              } else {
                console.error("parse-order failed:", parseResp.status);
                await parseResp.text();
              }
            } catch (parseErr) {
              console.error("AI extraction error:", parseErr instanceof Error ? parseErr.message : "unknown");
            }
          }

          const detectedThreadType = parseData?.thread_type || (parentOrder ? "update" : "new");

          // ── Reply merging ──
          if (parentOrder && (detectedThreadType === "update" || detectedThreadType === "confirmation") && extracted) {
            const mergeUpdate: Record<string, any> = {
              source_email_body: `${parentOrder.source_email_body || ""}\n\n── Reply ${new Date().toISOString()} ──\n${parsed.body}`,
              thread_type: detectedThreadType,
              changes_detected: parseData?.changes_detected || [],
            };

            const fieldsToMerge = [
              "pickup_address", "delivery_address", "weight_kg", "quantity",
              "unit", "dimensions", "transport_type",
            ];
            for (const field of fieldsToMerge) {
              const parentVal = parentOrder[field];
              const newVal = extracted[field];
              if ((!parentVal || parentVal === "" || parentVal === 0) && newVal && newVal !== "" && newVal !== 0) {
                mergeUpdate[field] = newVal;
              }
            }
            if (extracted.requirements?.length > 0) {
              const existing = parentOrder.requirements || [];
              const merged = [...new Set([...existing, ...extracted.requirements])];
              mergeUpdate.requirements = merged;
            }

            const requiredFields = ["client_name", "pickup_address", "delivery_address", "quantity", "weight_kg", "dimensions"];
            const mergedOrder = { ...parentOrder, ...mergeUpdate };
            const stillMissing = requiredFields.filter(f => {
              const val = mergedOrder[f];
              return val === undefined || val === null || val === "" || val === 0;
            });
            const missingLabels: Record<string, string> = {
              client_name: "Klantnaam", pickup_address: "Ophaaladres", delivery_address: "Afleveradres",
              quantity: "Aantal", weight_kg: "Gewicht", dimensions: "Afmetingen (LxBxH)",
            };
            mergeUpdate.missing_fields = stillMissing.map(f => missingLabels[f] || f);

            if (stillMissing.length === 0 && confidence > 80) {
              mergeUpdate.status = "OPEN";
              mergeUpdate.confidence_score = Math.max(confidence, parentOrder.confidence_score || 0);
              mergeUpdate.follow_up_draft = null;
            }

            if (detectedThreadType === "cancellation") {
              mergeUpdate.status = "CANCELLED";
            }

            await supabase.from("orders").update(mergeUpdate).eq("id", parentOrder.id);

            await client.messageFlagsAdd({ uid }, ["\\Seen"], { uid: true });
            result.orders.push({ orderNumber: parentOrder.order_number, status: mergeUpdate.status || parentOrder.status, confidence });
            result.processed++;
            continue;
          }

          // ── Normal flow: create a new draft order ──
          const { data: order, error: insertError } = await supabase
            .from("orders")
            .insert({
              tenant_id: tenantId,
              status: "DRAFT",
              department_id: opsDeptId,
              source_email_from: fromAddr || parsed.from,
              source_email_subject: subject || parsed.subject,
              source_email_body: parsed.body,
              received_at: msg.envelope?.date ? new Date(msg.envelope.date).toISOString() : new Date().toISOString(),
              attachments: uploadedAttachments,
              thread_type: detectedThreadType,
              parent_order_id: parentOrder?.id || null,
            })
            .select("id, order_number")
            .single();

          if (insertError) { console.error("Insert error:", insertError.message); continue; }

          let orderStatus = "DRAFT";
          if (extracted) {
            let newStatus = "DRAFT";
            let autoApproved = false;

            if (confidence >= 80) {
              let isKnownClient = false;
              if (extracted.client_name) {
                const { data: knownClient } = await supabase
                  .from("clients")
                  .select("id")
                  .ilike("name", `%${extracted.client_name}%`)
                  .eq("tenant_id", tenantId)
                  .limit(1);
                isKnownClient = !!(knownClient && knownClient.length > 0);
              }

              if (confidence >= 95 && isKnownClient) {
                newStatus = "PENDING";
                autoApproved = true;
              }
            }

            let clientId: string | null = null;
            if (extracted.client_name) {
              const { data: existingClient } = await supabase
                .from("clients")
                .select("id")
                .ilike("name", `%${extracted.client_name}%`)
                .eq("tenant_id", tenantId)
                .limit(1);

              if (existingClient && existingClient.length > 0) {
                clientId = existingClient[0].id;
              } else {
                const { data: newClient, error: clientErr } = await supabase
                  .from("clients")
                  .insert({ name: extracted.client_name, tenant_id: tenantId })
                  .select("id")
                  .single();
                if (clientErr) {
                  console.error("Failed to create client:", clientErr.message);
                } else {
                  clientId = newClient.id;
                }
              }
            }

            await supabase.from("orders").update({
              client_name: extracted.client_name || null,
              client_id: clientId,
              transport_type: extracted.transport_type || null,
              pickup_address: extracted.pickup_address || null,
              delivery_address: extracted.delivery_address || null,
              quantity: extracted.quantity || null,
              unit: extracted.unit || null,
              weight_kg: extracted.weight_kg || null,
              is_weight_per_unit: extracted.is_weight_per_unit || false,
              dimensions: extracted.dimensions || null,
              requirements: extracted.requirements || [],
              confidence_score: confidence,
              status: newStatus,
              auto_approved: autoApproved,
              thread_type: detectedThreadType,
              changes_detected: parseData?.changes_detected || [],
              anomalies: parseData?.anomalies || [],
              missing_fields: parseData?.missing_fields || [],
              follow_up_draft: parseData?.follow_up_draft || null,
            }).eq("id", order.id);

            orderStatus = newStatus;
          }

          await client.messageFlagsAdd({ uid }, ["\\Seen"], { uid: true });
          result.orders.push({ orderNumber: order.order_number, status: orderStatus, confidence });
          result.processed++;
        } catch (msgErr) {
          console.error(`Error processing uid ${uid}:`, msgErr instanceof Error ? msgErr.message : "unknown");
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
    return result;
  } catch (e) {
    if (client) { try { await client.logout(); } catch { /* ignore */ } }
    throw e;
  }
}

// Per-inbox timeout wrapper, isolates slow/broken inboxes from the rest.
async function pollOneInboxWithTimeout(config: InboxConfig, supabase: any): Promise<InboxResult> {
  const PER_INBOX_TIMEOUT = 30_000;
  return await Promise.race([
    pollOneInbox(config, supabase),
    new Promise<InboxResult>((_, reject) =>
      setTimeout(() => reject(new Error("inbox_timeout_30s")), PER_INBOX_TIMEOUT),
    ),
  ]);
}

// ── Main handler ──

async function pollAllInboxes(corsHeaders: Record<string, string>): Promise<Response> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const configs = await loadInboxConfigs(supabase);
  if (configs.length === 0) {
    return new Response(
      JSON.stringify({ success: true, processed: 0, inboxes: 0, orders: [] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const outcomes = await Promise.allSettled(
    configs.map((cfg) => pollOneInboxWithTimeout(cfg, supabase)),
  );

  const summaries: InboxResult[] = [];
  for (let i = 0; i < configs.length; i++) {
    const cfg = configs[i];
    const outcome = outcomes[i];
    if (outcome.status === "fulfilled") {
      summaries.push(outcome.value);
      await markInboxSuccess(supabase, cfg.id);
    } else {
      const errMsg = outcome.reason instanceof Error ? outcome.reason.message : "unknown";
      console.error(`Inbox ${cfg.label} failed: ${errMsg}`);
      summaries.push({ label: cfg.label, tenantId: cfg.tenantId, processed: 0, orders: [], error: errMsg });
      await markInboxError(supabase, cfg.id, errMsg);
    }
  }

  const totalProcessed = summaries.reduce((sum, s) => sum + s.processed, 0);
  const allOrders = summaries.flatMap((s) => s.orders);

  return new Response(
    JSON.stringify({
      success: true,
      inboxes: configs.length,
      processed: totalProcessed,
      orders: allOrders,
      per_inbox: summaries.map((s) => ({
        label: s.label,
        processed: s.processed,
        error: s.error,
      })),
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

serve(async (req) => {
  const preflight = handleOptions(req, CORS_OPTIONS);
  if (preflight) return preflight;
  const corsHeaders = corsFor(req, CORS_OPTIONS);

  const timeout = new Promise<Response>((resolve) =>
    setTimeout(() => resolve(new Response(
      JSON.stringify({ error: "Timeout na 50 seconden" }),
      { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )), 50_000),
  );

  try {
    return await Promise.race([pollAllInboxes(corsHeaders), timeout]);
  } catch (e) {
    console.error("poll-inbox fatal:", e instanceof Error ? e.message : "unknown");
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
