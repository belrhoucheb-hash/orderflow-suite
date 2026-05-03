import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsFor, handleOptions } from "../_shared/cors.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[a-f0-9]{64}$/i;

interface RequestBody {
  token?: unknown;
  expectedHash?: unknown;
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsFor(req), "Content-Type": "application/json" },
  });
}

async function readToken(req: Request): Promise<{ token: string | null; expectedHash: string | null }> {
  const url = new URL(req.url);
  const tokenFromQuery = url.searchParams.get("token");
  const hashFromQuery = url.searchParams.get("hash");

  if (req.method === "GET") {
    return {
      token: tokenFromQuery,
      expectedHash: hashFromQuery,
    };
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  return {
    token: typeof body.token === "string" ? body.token : tokenFromQuery,
    expectedHash: typeof body.expectedHash === "string" ? body.expectedHash : hashFromQuery,
  };
}

serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "GET" && req.method !== "POST") {
    return json(req, { error: "Method not allowed" }, 405);
  }

  const { token, expectedHash } = await readToken(req);
  if (!token || !UUID_RE.test(token)) {
    return json(req, { error: "Invalid verification token" }, 400);
  }

  if (expectedHash && !SHA256_RE.test(expectedHash)) {
    return json(req, { error: "Invalid expected hash" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return json(req, { error: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing" }, 500);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const forwardedFor = req.headers.get("x-forwarded-for") ?? "";
  const ipAddress = forwardedFor.split(",")[0]?.trim() || null;

  const { data, error } = await admin.rpc("verify_cmr_document", {
    p_verification_token: token,
    p_expected_hash: expectedHash ?? null,
    p_source: "verify-cmr-document",
    p_metadata: {
      ip_address: ipAddress,
      user_agent: req.headers.get("user-agent"),
    },
  });

  if (error) {
    console.error("verify_cmr_document failed", error);
    return json(req, { error: "Could not verify CMR document" }, 500);
  }

  const result = data ?? { valid: false, status: "not_found" };
  const status = result.valid === false ? 404 : 200;
  return json(req, result, status);
});
