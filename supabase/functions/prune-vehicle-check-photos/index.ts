// Prune voertuigcheck-foto's ouder dan N dagen (status OK, geen baseline-seed).
//
// Input:  ?days=180  (query-param, optioneel; default 180)
// Output: { deleted_count, deleted_bytes_estimate, days_threshold }
//
// Auth: verify_jwt=true (alleen geauthenticeerde planner/admin mag triggeren).
// Storage-objecten verwijderen vereist service-role; we gebruiken daarom een
// server-side service-role client, niet de caller-token.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const ALLOWED_ORIGINS = new Set([
  "https://orderflow-suite.vercel.app",
  "http://localhost:8080",
  "http://localhost:8081",
  "http://localhost:5173",
  "http://127.0.0.1:8080",
]);

function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : "https://orderflow-suite.vercel.app";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsFor(req) });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      return new Response(
        JSON.stringify({ error: "SUPABASE_URL of SUPABASE_SERVICE_ROLE_KEY ontbreekt" }),
        { status: 500, headers: { ...corsFor(req), "Content-Type": "application/json" } },
      );
    }

    const url = new URL(req.url);
    const daysParam = url.searchParams.get("days");
    let days = 180;
    if (daysParam !== null) {
      const parsed = parseInt(daysParam, 10);
      if (!Number.isFinite(parsed) || parsed < 1) {
        return new Response(
          JSON.stringify({ error: "days moet een geheel getal >= 1 zijn" }),
          { status: 400, headers: { ...corsFor(req), "Content-Type": "application/json" } },
        );
      }
      days = parsed;
    }

    const executedBy = req.headers.get("x-executed-by") ?? "edge-function";

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await admin.rpc("prune_vehicle_check_photos", {
      days_threshold: days,
    });

    if (error) {
      console.error("prune_vehicle_check_photos RPC error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsFor(req), "Content-Type": "application/json" },
      });
    }

    const row = Array.isArray(data) ? data[0] : data;
    const deletedCount: number = row?.deleted_count ?? 0;
    const deletedBytes: number = row?.deleted_bytes_estimate ?? 0;

    const { error: logErr } = await admin
      .from("vehicle_check_retention_log")
      .insert({
        days_threshold: days,
        deleted_count: deletedCount,
        deleted_bytes_estimate: deletedBytes,
        executed_by: executedBy,
      });
    if (logErr) console.error("retention_log insert error:", logErr);

    return new Response(
      JSON.stringify({
        deleted_count: deletedCount,
        deleted_bytes_estimate: deletedBytes,
        days_threshold: days,
      }),
      { headers: { ...corsFor(req), "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsFor(req), "Content-Type": "application/json" },
    });
  }
});
