import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsFor, handleOptions } from "../_shared/cors.ts";

const CORS_OPTIONS = {
  extraHeaders: [
    "x-supabase-client-platform",
    "x-supabase-client-platform-version",
    "x-supabase-client-runtime",
    "x-supabase-client-runtime-version",
  ],
};

serve(async (req) => {
  const preflight = handleOptions(req, CORS_OPTIONS);
  if (preflight) return preflight;
  const corsHeaders = corsFor(req, CORS_OPTIONS);

  try {
    // Verify JWT authorization
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authenticatie vereist" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authClient = createClient(supabaseUrl, supabaseKey);

    // Verify the user's JWT token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: authUser }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authUser) {
      return new Response(
        JSON.stringify({ error: "Ongeldige of verlopen sessie" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { orderId, toEmail, subject, body } = await req.json();

    if (!orderId || !toEmail || !body) {
      return new Response(
        JSON.stringify({ error: "orderId, toEmail en body zijn verplicht" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the user has access to this order (tenant isolation)
    const { data: order, error: orderError } = await authClient
      .from("orders")
      .select("id, tenant_id")
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ error: "Order niet gevonden" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userTenantId = authUser.app_metadata?.tenant_id;
    if (userTenantId && order.tenant_id && userTenantId !== order.tenant_id) {
      return new Response(
        JSON.stringify({ error: "Geen toegang tot deze order" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
      const mailFromResp = await tlsRead();
      if (!mailFromResp.startsWith("2")) {
        tlsConn.close();
        throw new Error(`SMTP MAIL FROM afgewezen: ${mailFromResp.trim()}`);
      }
      await tlsSend(`RCPT TO:<${toEmail}>`);
      const rcptResp = await tlsRead();
      if (!rcptResp.startsWith("2")) {
        tlsConn.close();
        throw new Error(`SMTP RCPT TO afgewezen: ${rcptResp.trim()}`);
      }
      await tlsSend("DATA");
      const dataResp = await tlsRead();
      if (!dataResp.startsWith("3")) {
        tlsConn.close();
        throw new Error(`SMTP DATA afgewezen: ${dataResp.trim()}`);
      }

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
      const sendResp = await tlsRead();
      if (!sendResp.startsWith("2")) {
        tlsConn.close();
        throw new Error(`SMTP verzending mislukt: ${sendResp.trim()}`);
      }
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
      const mailFromResp2 = await readResponse();
      if (!mailFromResp2.startsWith("2")) {
        conn.close();
        throw new Error(`SMTP MAIL FROM afgewezen: ${mailFromResp2.trim()}`);
      }
      await sendLine(`RCPT TO:<${toEmail}>`);
      const rcptResp2 = await readResponse();
      if (!rcptResp2.startsWith("2")) {
        conn.close();
        throw new Error(`SMTP RCPT TO afgewezen: ${rcptResp2.trim()}`);
      }
      await sendLine("DATA");
      const dataResp2 = await readResponse();
      if (!dataResp2.startsWith("3")) {
        conn.close();
        throw new Error(`SMTP DATA afgewezen: ${dataResp2.trim()}`);
      }

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
      const sendResp2 = await readResponse();
      if (!sendResp2.startsWith("2")) {
        conn.close();
        throw new Error(`SMTP verzending mislukt: ${sendResp2.trim()}`);
      }
      await sendLine("QUIT");
      conn.close();
    }

    // Update order with sent timestamp
    await authClient
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
