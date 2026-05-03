import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getUserAuth } from "../_shared/auth.ts";
import { corsFor, handleOptions } from "../_shared/cors.ts";

const BUCKET = "pod-files";
const SIGNED_URL_TTL_SECONDS = 5 * 60;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface RequestBody {
  path?: unknown;
  orderId?: unknown;
  purpose?: unknown;
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsFor(req), "Content-Type": "application/json" },
  });
}

function normalizeStoragePath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/^\/+/, "");
  if (!trimmed || trimmed.includes("..") || /^(https?:|data:|blob:)/i.test(trimmed)) {
    return null;
  }
  return trimmed;
}

serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return json(req, { error: "Method not allowed" }, 405);
  }

  const auth = await getUserAuth(req);
  if (!auth.ok) {
    return json(req, { error: auth.error }, auth.status);
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "Invalid JSON body" }, 400);
  }

  const storagePath = normalizeStoragePath(body.path);
  if (!storagePath) {
    return json(req, { error: "Invalid POD storage path" }, 400);
  }

  if (!storagePath.startsWith(`${auth.tenantId}/`)) {
    return json(req, { error: "Forbidden" }, 403);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return json(req, { error: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing" }, 500);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    console.error("createSignedUrl failed", error);
    return json(req, { error: "Could not create signed POD URL" }, 404);
  }

  const orderId = typeof body.orderId === "string" && UUID_RE.test(body.orderId)
    ? body.orderId
    : null;
  const purpose = typeof body.purpose === "string" && body.purpose.length <= 32
    ? body.purpose
    : "view";

  const forwardedFor = req.headers.get("x-forwarded-for") ?? "";
  const ipAddress = forwardedFor.split(",")[0]?.trim() || null;
  const userAgent = req.headers.get("user-agent");

  const { error: logError } = await admin.from("pod_access_log").insert({
    tenant_id: auth.tenantId,
    user_id: auth.userId,
    order_id: orderId,
    storage_path: storagePath,
    action: "signed_url",
    purpose,
    ip_address: ipAddress,
    user_agent: userAgent,
  });
  if (logError) console.error("pod_access_log insert failed", logError);

  return json(req, {
    signedUrl: data.signedUrl,
    expiresIn: SIGNED_URL_TTL_SECONDS,
  });
});
