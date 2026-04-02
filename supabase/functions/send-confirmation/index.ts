import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// TODO: replace with tenant_settings lookup when multi-tenant is wired up
const COMPANY_NAME = "Royalty Cargo";
const COMPANY_PLANNING_EMAIL = "planning@royaltycargo.nl";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

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
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify the user's JWT token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authUser) {
      return new Response(
        JSON.stringify({ error: "Ongeldige of verlopen sessie" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { orderId } = await req.json();

    if (!orderId) {
      return new Response(
        JSON.stringify({ error: "orderId is verplicht" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the order
    const { data: order, error: fetchError } = await supabase
      .from("orders")
      .select("*, tenants(name, email)")
      .eq("id", orderId)
      .single();

    if (fetchError || !order) {
      return new Response(
        JSON.stringify({ error: "Order niet gevonden" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify tenant isolation
    const userTenantId = authUser.app_metadata?.tenant_id;
    if (userTenantId && order.tenant_id && userTenantId !== order.tenant_id) {
      return new Response(
        JSON.stringify({ error: "Geen toegang tot deze order" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract recipient email
    const senderEmail = order.source_email_from || "";
    const emailMatch = senderEmail.match(/<([^>]+)>/);
    const toEmail = emailMatch ? emailMatch[1] : senderEmail;

    if (!toEmail || !toEmail.includes("@")) {
      return new Response(
        JSON.stringify({ error: "Geen geldig e-mailadres beschikbaar", skipped: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check SMTP configuration
    const smtpHost = Deno.env.get("SMTP_HOST");
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPassword = Deno.env.get("SMTP_PASSWORD");
    const smtpPort = parseInt(Deno.env.get("SMTP_PORT") || "587", 10);

    if (!smtpHost || !smtpUser || !smtpPassword) {
      return new Response(
        JSON.stringify({ error: "SMTP is nog niet geconfigureerd" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build confirmation email body
    const clientName = order.client_name || "Geachte heer/mevrouw";
    const orderNum = order.order_number;
    const lines: string[] = [
      `Beste ${clientName},`,
      ``,
      `Hierbij bevestigen wij de ontvangst en verwerking van uw transportaanvraag.`,
      ``,
      `═══════════════════════════════════`,
      `  ORDERBEVESTIGING #${orderNum}`,
      `═══════════════════════════════════`,
      ``,
    ];

    if (order.pickup_address) lines.push(`📍 Ophalen:    ${order.pickup_address}`);
    if (order.delivery_address) lines.push(`📍 Leveren:    ${order.delivery_address}`);
    if (order.quantity && order.unit) lines.push(`📦 Lading:     ${order.quantity} ${order.unit}`);
    if (order.weight_kg) {
      const weightLabel = order.is_weight_per_unit ? `${order.weight_kg} kg per eenheid` : `${order.weight_kg} kg totaal`;
      lines.push(`⚖️  Gewicht:    ${weightLabel}`);
    }
    if (order.dimensions) lines.push(`📐 Afmetingen: ${order.dimensions}`);
    if (order.transport_type) {
      const typeLabel = order.transport_type === "warehouse-air" || order.transport_type === "WAREHOUSE_AIR" ? "Warehouse → Air" : "Direct Transport";
      lines.push(`🚛 Type:       ${typeLabel}`);
    }
    if (order.requirements && order.requirements.length > 0) {
      lines.push(`⚠️  Vereisten:  ${order.requirements.join(", ")}`);
    }

    lines.push(``);
    lines.push(`───────────────────────────────────`);
    lines.push(``);
    lines.push(`Uw transport wordt nu ingepland. U ontvangt een update zodra een voertuig en chauffeur zijn toegewezen.`);
    lines.push(``);
    lines.push(`Heeft u vragen of wijzigingen? Reageer dan op deze e-mail met vermelding van ordernummer #${orderNum}.`);
    lines.push(``);
    const tenantName = order.tenants?.name || COMPANY_NAME;
    const tenantEmail = order.tenants?.email || COMPANY_PLANNING_EMAIL;

    lines.push(`Met vriendelijke groet,`);
    lines.push(`${tenantName} Planning`);
    lines.push(`${tenantEmail}`);

    const body = lines.join("\n");
    const subject = `Bevestiging transportorder #${orderNum} — ${tenantName}`;

    // Send via SMTP
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const conn = await Deno.connect({ hostname: smtpHost, port: smtpPort });

    async function sendLine(line: string) {
      await conn.write(encoder.encode(line + "\r\n"));
    }
    async function readResponse(): Promise<string> {
      const buf = new Uint8Array(1024);
      const n = await conn.read(buf);
      return n ? decoder.decode(buf.subarray(0, n)) : "";
    }

    await readResponse(); // greeting
    await sendLine(`EHLO localhost`);
    await readResponse();

    if (smtpPort === 587) {
      await sendLine("STARTTLS");
      await readResponse();
      const tlsConn = await Deno.startTls(conn, { hostname: smtpHost });
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
        `From: ${tenantName} Planning <${smtpUser}>`,
        `To: ${toEmail}`,
        `Subject: ${subject}`,
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
      const mailFromResp = await readResponse();
      if (!mailFromResp.startsWith("2")) {
        conn.close();
        throw new Error(`SMTP MAIL FROM afgewezen: ${mailFromResp.trim()}`);
      }
      await sendLine(`RCPT TO:<${toEmail}>`);
      const rcptResp = await readResponse();
      if (!rcptResp.startsWith("2")) {
        conn.close();
        throw new Error(`SMTP RCPT TO afgewezen: ${rcptResp.trim()}`);
      }
      await sendLine("DATA");
      const dataResp = await readResponse();
      if (!dataResp.startsWith("3")) {
        conn.close();
        throw new Error(`SMTP DATA afgewezen: ${dataResp.trim()}`);
      }

      const emailContent = [
        `From: ${tenantName} Planning <${smtpUser}>`,
        `To: ${toEmail}`,
        `Subject: ${subject}`,
        `Content-Type: text/plain; charset=UTF-8`,
        ``,
        body,
        `.`,
      ].join("\r\n");

      await sendLine(emailContent);
      const sendResp = await readResponse();
      if (!sendResp.startsWith("2")) {
        conn.close();
        throw new Error(`SMTP verzending mislukt: ${sendResp.trim()}`);
      }
      await sendLine("QUIT");
      conn.close();
    }

    return new Response(
      JSON.stringify({ success: true, message: `Bevestiging verzonden naar ${toEmail}` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("send-confirmation error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
