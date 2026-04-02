import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // API key check
    const apiKey = req.headers.get("x-api-key");
    const expectedKey = Deno.env.get("CREATE_ORDER_API_KEY");

    if (!expectedKey) {
      return new Response(
        JSON.stringify({ error: "API key niet geconfigureerd op de server" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!apiKey || apiKey !== expectedKey) {
      return new Response(
        JSON.stringify({ error: "Ongeldige of ontbrekende API key" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Alleen POST is toegestaan" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();

    // Validate required fields
    if (!body.client_name && !body.pickup_address && !body.delivery_address) {
      return new Response(
        JSON.stringify({ error: "Minstens client_name, pickup_address of delivery_address is verplicht" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Build order object with allowed fields only
    const allowedFields = [
      "tenant_id",
      "client_name", "pickup_address", "delivery_address", "transport_type",
      "weight_kg", "is_weight_per_unit", "quantity", "unit", "dimensions",
      "requirements", "internal_note", "source_email_from", "source_email_subject",
      "source_email_body", "status", "confidence_score", "missing_fields",
      "follow_up_draft", "attachments", "vehicle_id", "stop_sequence",
    ];

    const orderData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        orderData[field] = body[field];
      }
    }

    // Default status
    if (!orderData.status) {
      orderData.status = "DRAFT";
    }

    // Require tenant_id — reject if missing
    if (!orderData.tenant_id) {
      return new Response(
        JSON.stringify({ error: "tenant_id is verplicht" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data, error } = await supabase
      .from("orders")
      .insert(orderData)
      .select()
      .single();

    if (error) {
      console.error("Insert error:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, order: data }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("create-order error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
