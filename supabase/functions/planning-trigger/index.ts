import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://orderflow-suite.vercel.app",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { tenant_id, order_id } = await req.json();

    if (!tenant_id || !order_id) {
      return new Response(
        JSON.stringify({ error: "tenant_id and order_id are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Fetch the order to confirm it exists and is CONFIRMED
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, status, delivery_date")
      .eq("id", order_id)
      .eq("tenant_id", tenant_id)
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ error: "Order not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (order.status !== "CONFIRMED") {
      return new Response(
        JSON.stringify({
          skipped: true,
          reason: `Order status is ${order.status}, not CONFIRMED`,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Fetch vehicles for this tenant
    const { data: vehicleRows } = await supabase
      .from("vehicles")
      .select("id, code, name, plate, type, capacity_kg, capacity_pallets, features")
      .eq("tenant_id", tenant_id)
      .eq("is_active", true);

    const vehicles = (vehicleRows ?? []).map((v: any) => ({
      id: v.code,
      code: v.code,
      name: v.name,
      plate: v.plate,
      type: v.type,
      capacityKg: v.capacity_kg,
      capacityPallets: v.capacity_pallets,
      features: v.features ?? [],
    }));

    if (vehicles.length === 0) {
      return new Response(
        JSON.stringify({
          skipped: true,
          reason: "No active vehicles found for tenant",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Fetch all confirmed orders for the same delivery date to build coord map
    const deliveryDate = order.delivery_date || new Date().toISOString().slice(0, 10);

    const { data: allOrders } = await supabase
      .from("orders")
      .select("id, geocoded_delivery_lat, geocoded_delivery_lng")
      .eq("tenant_id", tenant_id)
      .eq("delivery_date", deliveryDate)
      .eq("status", "CONFIRMED");

    const coordMap = new Map<string, { lat: number; lng: number }>();
    for (const o of allOrders ?? []) {
      if (o.geocoded_delivery_lat && o.geocoded_delivery_lng) {
        coordMap.set(o.id, {
          lat: o.geocoded_delivery_lat,
          lng: o.geocoded_delivery_lng,
        });
      }
    }

    // NOTE: In production, onOrderConfirmed would be called here.
    // Since Edge Functions cannot import frontend code directly,
    // we replicate the core logic: incremental solve + score + record.
    // For now, we record that the trigger fired and let the frontend
    // handle the actual planning via realtime subscription.

    // Record the planning trigger event
    await supabase.from("planning_events").insert({
      tenant_id,
      trigger_type: "NEW_ORDER",
      trigger_entity_id: order_id,
      orders_evaluated: 1,
      orders_assigned: 0,
      orders_changed: 0,
      confidence: 0,
      planning_duration_ms: 0,
      auto_executed: false,
    });

    return new Response(
      JSON.stringify({
        success: true,
        order_id,
        tenant_id,
        vehicles_available: vehicles.length,
        coords_available: coordMap.size,
        message: "Planning trigger recorded. Frontend will process via realtime.",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("planning-trigger error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
