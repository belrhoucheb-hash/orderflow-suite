import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { ImapFlow } from "npm:imapflow@1.0.171";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
  supabase: any
): Promise<EmailClassification> {
  const subjectLower = subject.toLowerCase();

  // Check for cancellation keywords
  if (subjectLower.includes("annulering") || subjectLower.includes("cancel")) {
    console.log(`Rule-based: classified as cancellation (subject keyword)`);
    return "cancellation";
  }

  // Check for confirmation keywords
  if (subjectLower.includes("bevestiging") || subjectLower.includes("confirmation")) {
    console.log(`Rule-based: classified as confirmation (subject keyword)`);
    return "confirmation";
  }

  // Check if sender is a known client
  if (fromAddr) {
    const { data: knownClient } = await supabase
      .from("clients")
      .select("id")
      .eq("email", fromAddr)
      .limit(1);
    if (knownClient && knownClient.length > 0) {
      console.log(`Rule-based: classified as order (known client: ${fromAddr})`);
      return "order";
    }
  }

  // Ambiguous — needs AI classification
  return null;
}

// ── Main handler ──

async function pollInbox(): Promise<Response> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const imapHost = Deno.env.get("IMAP_HOST")!;
  const imapPort = parseInt(Deno.env.get("IMAP_PORT") || "993");
  const imapUser = Deno.env.get("IMAP_USER")!;
  const imapPass = Deno.env.get("IMAP_PASSWORD")!;

  if (!imapHost || !imapUser || !imapPass) {
    return new Response(
      JSON.stringify({ error: "IMAP credentials niet geconfigureerd" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let client: ImapFlow | null = null;
  const results: { orderNumber: number; status: string; confidence: number }[] = [];

  // Fetch a default tenant for incoming emails
  const { data: defaultTenant } = await supabase.from("tenants").select("id").eq("is_active", true).limit(1);
  const tenantId = defaultTenant?.[0]?.id || "00000000-0000-0000-0000-000000000001";

  try {
    client = new ImapFlow({
      host: imapHost,
      port: imapPort,
      secure: imapPort === 993,
      auth: { user: imapUser, pass: imapPass },
      logger: false,
    });

    await client.connect();
    console.log("IMAP connected");

    const lock = await client.getMailboxLock("INBOX");

    try {
      // Search for unseen UIDs first (non-blocking)
      const uids = await client.search({ seen: false }, { uid: true });
      console.log(`Found ${uids.length} unseen messages`);

      if (uids.length === 0) {
        lock.release();
        await client.logout();
        return new Response(
          JSON.stringify({ success: true, processed: 0, orders: [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Process max 10 emails per run to stay within timeout
      const toProcess = uids.slice(0, 10);

      for (const uid of toProcess) {
        try {
          const msg = await client.fetchOne(uid, { source: true, envelope: true }, { uid: true });
          const rawEmail = msg.source?.toString("utf-8");
          if (!rawEmail) continue;

          const fromAddr = msg.envelope?.from?.[0]?.address || "";
          const subject = msg.envelope?.subject || "";
          const messageId = msg.envelope?.messageId || `uid-${uid}`;
          console.log(`Processing: ${messageId} from ${fromAddr}`);

          // ── Thread detection: check if this is a reply to an existing order ──
          const isReply = /^(re|fw|fwd):\s*/i.test(subject);
          const cleanSubject = subject.replace(/^(re|fw|fwd):\s*/gi, "").trim();
          let parentOrder: any = null;

          if (isReply && fromAddr) {
            // Try to find the original order by matching sender + cleaned subject
            const { data: candidates } = await supabase
              .from("orders")
              .select("id, order_number, client_name, weight_kg, quantity, unit, pickup_address, delivery_address, requirements, status")
              .eq("source_email_from", fromAddr)
              .ilike("source_email_subject", `%${cleanSubject.substring(0, 60)}%`)
              .order("created_at", { ascending: false })
              .limit(1);
            
            if (candidates && candidates.length > 0) {
              parentOrder = candidates[0];
              console.log(`Thread detected: reply to order #${parentOrder.order_number}`);
            }
          }

          // Dedup check (skip for replies — those are intentional)
          if (!isReply) {
            const { data: existing } = await supabase
              .from("orders")
              .select("id")
              .eq("source_email_from", fromAddr)
              .eq("source_email_subject", subject)
              .limit(1);

            if (existing && existing.length > 0) {
              console.log(`Skipping duplicate: ${messageId}`);
              await client.messageFlagsAdd({ uid }, ["\\Seen"], { uid: true });
              continue;
            }
          }

          const parsed = parseEml(rawEmail, messageId);

          // Quick classification: rule-based first, then AI for ambiguous emails
          const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

          const ruleResult = await ruleBasedClassify(subject, fromAddr, supabase);

          if (ruleResult) {
            // Rule-based classification succeeded — skip AI call, email is transport-related
            console.log(`Rule-based classification: ${ruleResult} — skipping AI classifier`);
          } else if (GEMINI_API_KEY && parsed.body) {
            // Ambiguous email — use AI to determine if it's transport-related
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
                
                // Log AI Usage
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
                    console.log(`Skipping non-transport email: ${subject}`);
                    await client.messageFlagsAdd({ uid }, ["\\Seen"], { uid: true });
                    continue;
                  }
                }
              } else {
                await classifyResp.text(); // consume
              }
            } catch (classErr) {
              console.error("Classification error:", classErr);
              // Continue anyway if classification fails
            }
          } else if (!parsed.body && parsed.attachments.length === 0) {
            // No body and no attachments — skip
            console.log(`Skipping empty email: ${subject}`);
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
            if (uploadError) { console.error("Upload error:", uploadError); continue; }

            const { data: urlData } = supabase.storage.from("email-attachments").getPublicUrl(path);
            uploadedAttachments.push({ name: att.name, url: urlData.publicUrl, type: att.type });
          }

          // AI extraction via parse-order (do this first to determine thread type)
          const pdfUrls = uploadedAttachments.filter((a) => a.type === "application/pdf").map((a) => a.url);
          let confidence = 0;
          let extracted: any = null;
          let parseData: any = null;

          if (GEMINI_API_KEY && (parsed.body || pdfUrls.length > 0)) {
            try {
              const threadContext = parentOrder ? { parentOrder } : undefined;
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
              console.error("AI extraction error:", parseErr);
            }
          }

          const detectedThreadType = parseData?.thread_type || (parentOrder ? "update" : "new");

          // ── Reply Merging: if this is a reply that fills in missing data, update the parent order ──
          if (parentOrder && (detectedThreadType === "update" || detectedThreadType === "confirmation") && extracted) {
            console.log(`Reply merging: updating parent order #${parentOrder.order_number} (thread: ${detectedThreadType})`);

            // Build update payload: only fill in fields that were missing on the parent
            const mergeUpdate: Record<string, any> = {
              source_email_body: `${parentOrder.source_email_body || ""}\n\n── Reply ${new Date().toISOString()} ──\n${parsed.body}`,
              thread_type: detectedThreadType,
              changes_detected: parseData?.changes_detected || [],
            };

            // Fill missing fields from reply extraction
            const fieldsToMerge = [
              "pickup_address", "delivery_address", "weight_kg", "quantity",
              "unit", "dimensions", "transport_type",
            ];
            for (const field of fieldsToMerge) {
              const parentVal = parentOrder[field];
              const newVal = extracted[field];
              // Only fill if parent was empty/null and reply has data
              if ((!parentVal || parentVal === "" || parentVal === 0) && newVal && newVal !== "" && newVal !== 0) {
                mergeUpdate[field] = newVal;
              }
            }
            // For requirements, merge arrays
            if (extracted.requirements?.length > 0) {
              const existing = parentOrder.requirements || [];
              const merged = [...new Set([...existing, ...extracted.requirements])];
              mergeUpdate.requirements = merged;
            }

            // Recalculate missing fields after merge
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

            // If no more missing fields, auto-upgrade status
            if (stillMissing.length === 0 && confidence > 80) {
              mergeUpdate.status = "OPEN";
              mergeUpdate.confidence_score = Math.max(confidence, parentOrder.confidence_score || 0);
              mergeUpdate.follow_up_draft = null; // Clear follow-up since data is now complete
            }

            // If thread type is cancellation, mark as cancelled
            if (detectedThreadType === "cancellation") {
              mergeUpdate.status = "CANCELLED";
            }

            await supabase.from("orders").update(mergeUpdate).eq("id", parentOrder.id);
            console.log(`Parent order #${parentOrder.order_number} updated via reply merge. Still missing: ${stillMissing.length}`);

            await client.messageFlagsAdd({ uid }, ["\\Seen"], { uid: true });
            results.push({ orderNumber: parentOrder.order_number, status: mergeUpdate.status || parentOrder.status, confidence });
            continue; // Don't create a new draft — we merged into the parent
          }

          // ── Normal flow: create a new draft order ──
          const { data: order, error: insertError } = await supabase
            .from("orders")
            .insert({
              tenant_id: tenantId,
              status: "DRAFT",
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

          if (insertError) { console.error("Insert error:", insertError); continue; }

          // Apply extracted data to the new order
          let orderStatus = "DRAFT";
          let orderAutoApproved = false;
          if (extracted) {
            // Auto-approve logic:
            //   confidence >= 95 + known client = PENDING (auto-approved)
            //   confidence >= 80 but unknown client = DRAFT (human review)
            //   confidence < 80 = DRAFT (human review)
            let newStatus = "DRAFT";
            let autoApproved = false;

            if (confidence >= 80) {
              // Check if client is known in the database
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
                console.log(`Auto-approved: confidence=${confidence}, known client="${extracted.client_name}"`);
              } else {
                newStatus = "DRAFT";
                if (confidence >= 95 && !isKnownClient) {
                  console.log(`High confidence (${confidence}) but unknown client "${extracted.client_name}" — requires human review`);
                } else {
                  console.log(`Moderate confidence (${confidence}) — requires human review`);
                }
              }
            } else {
              console.log(`Low confidence (${confidence}) — requires human review`);
            }

            // ── Resolve client_id from client_name ──
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
                  console.error("Failed to create client:", clientErr);
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
            orderAutoApproved = autoApproved;
            console.log(`Order #${order.order_number}: confidence=${confidence}, status=${newStatus}, auto_approved=${autoApproved}, thread=${detectedThreadType}`);
          }

          await client.messageFlagsAdd({ uid }, ["\\Seen"], { uid: true });
          results.push({ orderNumber: order.order_number, status: orderStatus, confidence });
        } catch (msgErr) {
          console.error(`Error processing uid ${uid}:`, msgErr);
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
    console.log(`Poll complete: ${results.length} emails processed`);

    return new Response(
      JSON.stringify({ success: true, processed: results.length, orders: results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("poll-inbox error:", e);
    if (client) { try { await client.logout(); } catch { /* ignore */ } }
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // 50s timeout to stay within edge function limits
  const timeout = new Promise<Response>((resolve) =>
    setTimeout(() => resolve(new Response(
      JSON.stringify({ error: "Timeout na 50 seconden" }),
      { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )), 50000)
  );

  return Promise.race([pollInbox(), timeout]);
});
