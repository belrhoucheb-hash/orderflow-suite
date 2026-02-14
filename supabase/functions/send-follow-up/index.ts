import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const { orderId, toEmail, subject, body } = await req.json();

    if (!orderId || !toEmail || !body) {
      return new Response(
        JSON.stringify({ error: "orderId, toEmail en body zijn verplicht" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check SMTP configuration
    const smtpHost = Deno.env.get("SMTP_HOST");
    const smtpPort = Deno.env.get("SMTP_PORT");
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPassword = Deno.env.get("SMTP_PASSWORD");

    if (!smtpHost || !smtpUser || !smtpPassword) {
      return new Response(
        JSON.stringify({ error: "SMTP is nog niet geconfigureerd. Voeg SMTP_HOST, SMTP_USER en SMTP_PASSWORD toe als secrets." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const port = parseInt(smtpPort || "587", 10);

    // Build the email using raw SMTP over TCP (Deno.connect)
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const conn = await Deno.connect({ hostname: smtpHost, port });
    
    // Helper to send and read SMTP
    async function sendLine(line: string) {
      await conn.write(encoder.encode(line + "\r\n"));
    }
    async function readResponse(): Promise<string> {
      const buf = new Uint8Array(1024);
      const n = await conn.read(buf);
      return n ? decoder.decode(buf.subarray(0, n)) : "";
    }

    // SMTP handshake
    await readResponse(); // greeting
    await sendLine(`EHLO localhost`);
    await readResponse();

    // STARTTLS if port 587
    if (port === 587) {
      await sendLine("STARTTLS");
      await readResponse();
      const tlsConn = await Deno.startTls(conn, { hostname: smtpHost });
      // Re-assign for TLS communication
      const tlsEncoder = new TextEncoder();
      const tlsDecoder = new TextDecoder();

      async function tlsSend(line: string) {
        await tlsConn.write(tlsEncoder.encode(line + "\r\n"));
      }
      async function tlsRead(): Promise<string> {
        const buf = new Uint8Array(4096);
        const n = await tlsConn.read(buf);
        return n ? tlsDecoder.decode(buf.subarray(0, n)) : "";
      }

      await tlsSend(`EHLO localhost`);
      await tlsRead();

      // AUTH LOGIN
      await tlsSend("AUTH LOGIN");
      await tlsRead();
      await tlsSend(btoa(smtpUser));
      await tlsRead();
      await tlsSend(btoa(smtpPassword));
      const authResp = await tlsRead();
      if (!authResp.startsWith("235")) {
        tlsConn.close();
        return new Response(
          JSON.stringify({ error: "SMTP authenticatie mislukt" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await tlsSend(`MAIL FROM:<${smtpUser}>`);
      await tlsRead();
      await tlsSend(`RCPT TO:<${toEmail}>`);
      await tlsRead();
      await tlsSend("DATA");
      await tlsRead();

      const emailContent = [
        `From: ${smtpUser}`,
        `To: ${toEmail}`,
        `Subject: ${subject || "Aanvullende informatie nodig voor uw transportaanvraag"}`,
        `Content-Type: text/plain; charset=UTF-8`,
        ``,
        body,
        `.`,
      ].join("\r\n");

      await tlsSend(emailContent);
      await tlsRead();
      await tlsSend("QUIT");
      tlsConn.close();
    } else {
      // Plain SMTP (port 25 / 465 with implicit TLS not handled here)
      // AUTH LOGIN
      await sendLine("AUTH LOGIN");
      await readResponse();
      await sendLine(btoa(smtpUser));
      await readResponse();
      await sendLine(btoa(smtpPassword));
      const authResp = await readResponse();
      if (!authResp.startsWith("235")) {
        conn.close();
        return new Response(
          JSON.stringify({ error: "SMTP authenticatie mislukt" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await sendLine(`MAIL FROM:<${smtpUser}>`);
      await readResponse();
      await sendLine(`RCPT TO:<${toEmail}>`);
      await readResponse();
      await sendLine("DATA");
      await readResponse();

      const emailContent = [
        `From: ${smtpUser}`,
        `To: ${toEmail}`,
        `Subject: ${subject || "Aanvullende informatie nodig voor uw transportaanvraag"}`,
        `Content-Type: text/plain; charset=UTF-8`,
        ``,
        body,
        `.`,
      ].join("\r\n");

      await sendLine(emailContent);
      await readResponse();
      await sendLine("QUIT");
      conn.close();
    }

    // Update order with sent timestamp
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    await supabase
      .from("orders")
      .update({ follow_up_sent_at: new Date().toISOString() })
      .eq("id", orderId);

    return new Response(
      JSON.stringify({ success: true, message: "Follow-up e-mail verzonden" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("send-follow-up error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
