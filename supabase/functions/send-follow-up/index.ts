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
    const authClient = createClient(supabaseUrl, supabaseKey);

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

    if (auth.tenantId !== order.tenant_id) {
      return new Response(
        JSON.stringify({ error: "Geen toegang tot deze order" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const smtpConfig = await loadTenantSmtpConfig(authClient, order.tenant_id, "Planning");
    await sendEmailSmtp({
      to: toEmail,
      subject: subject || "Aanvullende informatie nodig voor uw transportaanvraag",
      body,
      config: smtpConfig,
    });

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
