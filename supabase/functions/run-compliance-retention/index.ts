import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { isTrustedCaller } from "../_shared/auth.ts";
import { corsFor, handleOptions } from "../_shared/cors.ts";

const CORS_OPTIONS = { extraHeaders: ["x-cron-secret", "x-executed-by"] };

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsFor(req, CORS_OPTIONS), "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  const preflight = handleOptions(req, CORS_OPTIONS);
  if (preflight) return preflight;

  if (!isTrustedCaller(req)) {
    return json(req, { error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return json(req, { error: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing" }, 500);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const executedBy = req.headers.get("x-executed-by") ?? "edge-function";
  const { data, error } = await admin.rpc("run_compliance_retention", {
    p_executed_by: executedBy,
  });

  if (error) {
    console.error("run_compliance_retention failed", error);
    return json(req, { error: error.message }, 500);
  }

  return json(req, data ?? {});
});
