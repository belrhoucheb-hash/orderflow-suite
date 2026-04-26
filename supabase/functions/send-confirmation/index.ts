import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getUserAuth } from "../_shared/auth.ts";
import { corsFor, handleOptions } from "../_shared/cors.ts";
import { loadTenantSmtpConfig, sendEmailSmtp } from "../_shared/tenantMessaging.ts";

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
    const auth = await getUserAuth(req);
    if (!auth.ok) {
      return new Response(
        JSON.stringify({ error: auth.error }),
        { status: auth.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

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
    if (auth.tenantId !== order.tenant_id) {
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
    const tenantName = order.tenants?.name || "Planning";
    const tenantEmail = order.tenants?.email || "";

    lines.push(`Met vriendelijke groet,`);
    lines.push(`${tenantName} Planning`);
    lines.push(`${tenantEmail}`);

    const body = lines.join("\n");
    const subject = `Bevestiging transportorder #${orderNum} — ${tenantName}`;

    const smtpConfig = await loadTenantSmtpConfig(
      supabase,
      order.tenant_id,
      `${tenantName} Planning`,
    );
    await sendEmailSmtp({
      to: toEmail,
      subject,
      body,
      config: smtpConfig,
    });

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
