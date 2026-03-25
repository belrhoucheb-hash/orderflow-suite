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

          // Quick AI classification: is this a transport/logistics email?
          const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
          if (LOVABLE_API_KEY && parsed.body) {
            try {
              const classifyResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
                method: "POST",
                headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                  model: "google/gemini-2.5-flash-lite",
                  messages: [
                    { role: "system", content: "Je bent een e-mail classifier. Bepaal of een e-mail gaat over transport, logistiek, verzending of orders. Antwoord ALLEEN met 'JA' of 'NEE'." },
                    { role: "user", content: `Onderwerp: ${subject}\nVan: ${fromAddr}\n\n${parsed.body.substring(0, 500)}` },
                  ],
                }),
              });
              if (classifyResp.ok) {
                const classifyResult = await classifyResp.json();
                const answer = classifyResult.choices?.[0]?.message?.content?.trim().toUpperCase() || "";
                if (answer.startsWith("NEE")) {
                  console.log(`Skipping non-transport email: ${subject}`);
                  await client.messageFlagsAdd({ uid }, ["\\Seen"], { uid: true });
                  continue;
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

          // Create draft order (link to parent if reply)
          const { data: order, error: insertError } = await supabase
            .from("orders")
            .insert({
              status: "DRAFT",
              source_email_from: fromAddr || parsed.from,
              source_email_subject: subject || parsed.subject,
              source_email_body: parsed.body,
              received_at: msg.envelope?.date ? new Date(msg.envelope.date).toISOString() : new Date().toISOString(),
              attachments: uploadedAttachments,
              thread_type: parentOrder ? "update" : "new",
              parent_order_id: parentOrder?.id || null,
            })
            .select("id, order_number")
            .single();

          if (insertError) { console.error("Insert error:", insertError); continue; }

          // AI extraction via parse-order
          const pdfUrls = uploadedAttachments.filter((a) => a.type === "application/pdf").map((a) => a.url);
          let confidence = 0;

          if (LOVABLE_API_KEY && (parsed.body || pdfUrls.length > 0)) {
            try {
              const threadContext = parentOrder ? { parentOrder } : undefined;
              const parseResp = await fetch(`${supabaseUrl}/functions/v1/parse-order`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseKey}` },
                body: JSON.stringify({ emailBody: parsed.body, pdfUrls, threadContext }),
              });

              if (parseResp.ok) {
                const { extracted } = await parseResp.json();
                if (extracted) {
                  confidence = extracted.confidence_score || 0;
                  const newStatus = confidence > 90 ? "OPEN" : "DRAFT";

                  await supabase.from("orders").update({
                    client_name: extracted.client_name || null,
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
                  }).eq("id", order.id);

                  console.log(`Order #${order.order_number}: confidence=${confidence}, status=${newStatus}`);
                }
              } else {
                console.error("parse-order failed:", parseResp.status);
                await parseResp.text(); // consume body
              }
            } catch (parseErr) {
              console.error("AI extraction error:", parseErr);
            }
          }

          await client.messageFlagsAdd({ uid }, ["\\Seen"], { uid: true });
          results.push({ orderNumber: order.order_number, status: confidence > 90 ? "OPEN" : "DRAFT", confidence });
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
