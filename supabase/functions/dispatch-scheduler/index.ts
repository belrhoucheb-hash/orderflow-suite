// ─── Plan E: Dispatch Scheduler Edge Function ──────────────
// Runs on cron (every 5 min). For each tenant with auto_dispatch_enabled:
// fetches ready trips and dispatches them.

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
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    // 1. Fetch all tenants with auto_dispatch_enabled
    const { data: rules, error: rulesErr } = await supabase
      .from("dispatch_rules")
      .select("*")
      .eq("auto_dispatch_enabled", true);

    if (rulesErr) {
      throw new Error(`Failed to fetch dispatch_rules: ${rulesErr.message}`);
    }

    if (!rules || rules.length === 0) {
      return new Response(
        JSON.stringify({ dispatched: 0, message: "No tenants with auto-dispatch enabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let totalDispatched = 0;
    const results: Array<{ tenant_id: string; dispatched: number; errors: string[] }> = [];

    // 2. Process each tenant
    for (const rule of rules) {
      const tenantResult = { tenant_id: rule.tenant_id, dispatched: 0, errors: [] as string[] };

      try {
        // Fetch VERZENDKLAAR trips for today
        const { data: trips, error: tripsErr } = await supabase
          .from("trips")
          .select("id, tenant_id, driver_id, trip_number, planned_date, planned_start_time, trip_stops(planned_time, stop_sequence)")
          .eq("tenant_id", rule.tenant_id)
          .eq("dispatch_status", "VERZENDKLAAR")
          .eq("planned_date", todayStr)
          .order("planned_start_time", { ascending: true });

        if (tripsErr) {
          tenantResult.errors.push(`Query error: ${tripsErr.message}`);
          results.push(tenantResult);
          continue;
        }

        if (!trips || trips.length === 0) {
          results.push(tenantResult);
          continue;
        }

        // Filter by lead time
        const leadTimeMs = rule.dispatch_lead_time_min * 60 * 1000;

        for (const trip of trips) {
          const stops = (trip as any).trip_stops || [];
          if (stops.length === 0) continue;

          // Find first stop by sequence
          const sorted = [...stops].sort(
            (a: any, b: any) => a.stop_sequence - b.stop_sequence,
          );
          const firstStopTime = sorted[0]?.planned_time;
          if (!firstStopTime) continue;

          const plannedMs = new Date(firstStopTime).getTime();
          const diffMs = plannedMs - now.getTime();

          // Ready if within lead time and not yet past
          if (diffMs >= 0 && diffMs <= leadTimeMs) {
            // Dispatch the trip
            const dispatchNow = new Date().toISOString();

            const { error: updateErr } = await supabase
              .from("trips")
              .update({
                dispatch_status: "VERZONDEN",
                dispatched_at: dispatchNow,
              })
              .eq("id", trip.id);

            if (updateErr) {
              tenantResult.errors.push(`Update trip ${trip.id}: ${updateErr.message}`);
              continue;
            }

            // Notify driver
            if (trip.driver_id) {
              await supabase.from("notifications").insert({
                tenant_id: rule.tenant_id,
                type: "DISPATCH",
                title: "Nieuwe rit toegewezen",
                message: `Rit #${trip.trip_number} is automatisch aan u toegewezen.`,
                user_id: trip.driver_id,
                is_read: false,
              });
            }

            // Record decision in confidence store for feedback loop
            await supabase.from("decision_log").insert({
              tenant_id: rule.tenant_id,
              decision_type: "DISPATCH",
              entity_type: "trip",
              entity_id: trip.id,
              proposed_action: { action: "auto_dispatch", trip_number: trip.trip_number },
              input_confidence: 100,
              model_confidence: 100,
              resolution: "AUTO_EXECUTED",
              resolved_at: dispatchNow,
            });

            tenantResult.dispatched++;
            totalDispatched++;
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        tenantResult.errors.push(msg);
      }

      results.push(tenantResult);
    }

    return new Response(
      JSON.stringify({
        dispatched: totalDispatched,
        tenants_processed: results.length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("dispatch-scheduler error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
