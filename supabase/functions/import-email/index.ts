import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

let emitOrderEvent: any = async () => {};
try {
  const ep = await import("../_shared/eventPipeline.ts");
  emitOrderEvent = ep.emitOrderEvent;
} catch { /* shared module not available */ }

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://orderflow-suite.vercel.app",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
  from: string;
  subject: string;
  date: string;
  body: string;
  attachments: { name: string; type: string; data: Uint8Array }[];
}

function parseEml(raw: string): ParsedEmail {
  // Split headers and body at first double newline
  const headerEnd = raw.indexOf("\n\n");
  const headerBlock = headerEnd > 0 ? raw.substring(0, headerEnd) : "";
  
  // Unfold headers (continuation lines start with space/tab)
  const unfoldedHeaders = headerBlock.replace(/\r?\n[ \t]+/g, " ");

  const getHeader = (name: string): string => {
    const regex = new RegExp(`^${name}:\\s*(.+)$`, "im");
    const match = unfoldedHeaders.match(regex);
    return match ? match[1].trim() : "";
  };

  const from = getHeader("From");
  const subject = getHeader("Subject");
  const date = getHeader("Date");

  // Find boundary
  const boundaryMatch = raw.match(/boundary="([^"]+)"/i) || raw.match(/boundary=([^\s;]+)/i);
  
  let body = "";
  const attachments: { name: string; type: string; data: Uint8Array }[] = [];

  if (!boundaryMatch) {
    // Simple email, no MIME parts
    body = headerEnd > 0 ? raw.substring(headerEnd + 2) : "";
    return { from, subject, date, body, attachments };
  }

  const boundary = boundaryMatch[1];
  const parts = raw.split(`--${boundary}`);

  for (const part of parts) {
    if (part.startsWith("--") || part.trim() === "") continue;

    const partHeaderEnd = part.indexOf("\n\n");
    if (partHeaderEnd < 0) continue;
    const partHeaders = part.substring(0, partHeaderEnd);
    const partBody = part.substring(partHeaderEnd + 2).trim();

    const contentType = partHeaders.match(/Content-Type:\s*([^\s;]+)/i)?.[1] || "";
    const isAttachment = /Content-Disposition:\s*attachment/i.test(partHeaders);
    const filenameMatch = partHeaders.match(/filename="([^"]+)"/i) || partHeaders.match(/name="([^"]+)"/i);

    if (contentType === "multipart/alternative" || contentType === "multipart/mixed") {
      // Nested multipart - find inner boundary and recurse text parts
      const innerBoundaryMatch = partHeaders.match(/boundary="([^"]+)"/i) || partHeaders.match(/boundary=([^\s;]+)/i);
      if (innerBoundaryMatch) {
        const innerBoundary = innerBoundaryMatch[1];
        const innerParts = partBody.split(`--${innerBoundary}`);
        for (const innerPart of innerParts) {
          if (innerPart.startsWith("--") || innerPart.trim() === "") continue;
          const iPHeaderEnd = innerPart.indexOf("\n\n");
          if (iPHeaderEnd < 0) continue;
          const iPHeaders = innerPart.substring(0, iPHeaderEnd);
          const iPBody = innerPart.substring(iPHeaderEnd + 2).trim();
          const iContentType = iPHeaders.match(/Content-Type:\s*([^\s;]+)/i)?.[1] || "";
          const isBase64 = /Content-Transfer-Encoding:\s*base64/i.test(iPHeaders);

          if (iContentType === "text/plain" && !body) {
            body = isBase64 ? decodeBase64(iPBody) : iPBody;
          }
        }
      }
    } else if (isAttachment || (contentType === "application/pdf" && filenameMatch)) {
      // Attachment
      const name = filenameMatch?.[1] || "attachment";
      attachments.push({
        name,
        type: contentType,
        data: base64ToUint8Array(partBody),
      });
    } else if (contentType === "text/plain" && !body) {
      const isBase64 = /Content-Transfer-Encoding:\s*base64/i.test(partHeaders);
      body = isBase64 ? decodeBase64(partBody) : partBody;
    }
  }

  return { from, subject, date, body, attachments };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return new Response(JSON.stringify({ error: "Geen .eml bestand meegegeven" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawEmail = await file.text();
    console.log(`Received .eml file, size: ${rawEmail.length} chars`);

    const parsed = parseEml(rawEmail);
    console.log(`Parsed: from=${parsed.from}, subject=${parsed.subject}, attachments=${parsed.attachments.length}`);

    // Initialize Supabase client with service role for storage uploads
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Decode JWT from Auth Header — require authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    let tenantIdStr = "";
    const token = authHeader.replace("Bearer ", "");
    const parts = token.split('.');
    if (parts.length === 3) {
      try {
        const payload = JSON.parse(atob(parts[1]));
        if (payload.app_metadata?.tenant_id) {
          tenantIdStr = payload.app_metadata.tenant_id;
        }
      } catch(e) {}
    }

    if (!tenantIdStr) {
      return new Response(JSON.stringify({ error: "Missing tenant_id in token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Upload attachments to storage
    const uploadedAttachments: { name: string; url: string; type: string }[] = [];
    const timestamp = Date.now();

    for (const att of parsed.attachments) {
      const path = `imports/${timestamp}_${att.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      console.log(`Uploading attachment: ${att.name} (${att.data.length} bytes) to ${path}`);

      const { error: uploadError } = await supabase.storage
        .from("email-attachments")
        .upload(path, att.data, { contentType: att.type, upsert: true });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        continue;
      }

      const { data: urlData } = supabase.storage.from("email-attachments").getPublicUrl(path);
      uploadedAttachments.push({
        name: att.name,
        url: urlData.publicUrl,
        type: att.type,
      });
      console.log(`Uploaded: ${urlData.publicUrl}`);
    }

    // §27: orders.department_id is NOT NULL. Bij binnenkomst van een mail
    // weten we de echte afdeling nog niet, dus starten we op OPS. Parse-order
    // werkt dit bij zodra extractie een EXPORT-adres detecteert.
    const { data: opsDept, error: deptErr } = await supabase
      .from("departments")
      .select("id")
      .eq("tenant_id", tenantIdStr)
      .eq("code", "OPS")
      .single();
    if (deptErr || !opsDept) {
      console.error("Kon OPS-department niet vinden voor tenant:", tenantIdStr, deptErr);
      return new Response(JSON.stringify({ error: "OPS-department ontbreekt voor deze tenant" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create draft order
    const { data: order, error: insertError } = await supabase
      .from("orders")
      .insert({
        tenant_id: tenantIdStr,
        status: "DRAFT",
        department_id: opsDept.id,
        source_email_from: parsed.from,
        source_email_subject: parsed.subject,
        source_email_body: parsed.body,
        received_at: parsed.date ? new Date(parsed.date).toISOString() : new Date().toISOString(),
        attachments: uploadedAttachments,
      })
      .select("id, order_number")
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: "Kon draft order niet aanmaken: " + insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Draft order created: #${order.order_number}`);

    // Emit email_received event into the pipeline
    emitOrderEvent(supabase, {
      tenantId: tenantIdStr,
      orderId: order.id,
      eventType: "email_received",
      actorType: "system",
      eventData: {
        subject: parsed.subject,
        from: parsed.from,
        attachments: uploadedAttachments.length,
      },
    }).catch((e) => console.error("Event pipeline error:", e));

    return new Response(JSON.stringify({
      success: true,
      order_id: order.id,
      order_number: order.order_number,
      attachments_uploaded: uploadedAttachments.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("import-email error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
