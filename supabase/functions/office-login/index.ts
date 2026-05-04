// Server-side wrapper voor de office-login flow.
//
// Probleem (pentest HIGH-2): de account-lockout uit `office_login_policy`
// werd alleen client-side afgedwongen vanuit src/pages/Login.tsx. Een
// attacker kon /auth/v1/token?grant_type=password rechtstreeks aanroepen
// en zo ongelimiteerd brute-forcen, omdat de RPC-bookkeeping nooit liep.
//
// Oplossing: deze edge function is de enige route die de UI gebruikt om in
// te loggen. Hij raadpleegt de policy server-side, blokkeert vergrendelde
// accounts vóórdat hij Supabase Auth aanroept, registreert iedere poging
// (success of fail) via record_office_login_attempt en heeft een eigen
// in-memory throttle per IP en per email tegen brute-force op de wrapper
// zelf.
//
// Deze function is bewust pre-auth (`verify_jwt = false` in config.toml).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const PER_IP_LIMIT = 10;
const PER_EMAIL_LIMIT = 8;
const THROTTLE_WINDOW_MS = 60_000;

// Pre-auth endpoint dus simpele wildcard CORS volstaat (geen cookies, alleen
// JSON body met credentials in de POST). De origin check zou hier alleen
// extra friction toevoegen voor mobile / dev clients zonder reele baat.
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Vary": "Origin",
};

interface ThrottleEntry {
  count: number;
  resetAt: number;
}

const ipBuckets = new Map<string, ThrottleEntry>();
const emailBuckets = new Map<string, ThrottleEntry>();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("cf-connecting-ip")
    ?? req.headers.get("x-real-ip")
    ?? "unknown";
}

export function checkBucket(
  store: Map<string, ThrottleEntry>,
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): boolean {
  const entry = store.get(key);
  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= limit) {
    return false;
  }
  entry.count += 1;
  return true;
}

function pruneBuckets(now: number = Date.now()) {
  for (const [key, entry] of ipBuckets) {
    if (entry.resetAt <= now) ipBuckets.delete(key);
  }
  for (const [key, entry] of emailBuckets) {
    if (entry.resetAt <= now) emailBuckets.delete(key);
  }
}

interface PolicyRow {
  locked_until: string | null;
  failed_count: number | null;
  login_protection_enabled: boolean | null;
  max_login_attempts: number | null;
  lockout_minutes: number | null;
  requires_2fa: boolean | null;
  verification_method: string | null;
}

async function fetchPolicy(
  admin: ReturnType<typeof createClient>,
  email: string,
): Promise<PolicyRow | null> {
  const { data, error } = await admin.rpc("office_login_policy", { p_email: email });
  if (error) {
    console.error("office_login_policy rpc faalde", error);
    return null;
  }
  if (!data) return null;
  if (Array.isArray(data)) {
    return (data[0] ?? null) as PolicyRow | null;
  }
  return data as PolicyRow;
}

async function recordAttempt(
  admin: ReturnType<typeof createClient>,
  email: string,
  success: boolean,
  policy: PolicyRow | null,
): Promise<void> {
  const max = policy?.max_login_attempts ?? 5;
  const lockout = policy?.lockout_minutes ?? 15;
  const { error } = await admin.rpc("record_office_login_attempt", {
    p_email: email,
    p_success: success,
    p_max_attempts: max,
    p_lockout_minutes: lockout,
  });
  if (error) {
    console.error("record_office_login_attempt rpc faalde", error);
  }
}

async function signInWithPassword(email: string, password: string): Promise<{
  status: number;
  body: unknown;
}> {
  const url = `${SUPABASE_URL}/auth/v1/token?grant_type=password`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
    },
    body: JSON.stringify({ email, password }),
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
    console.error("office-login: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY of SUPABASE_ANON_KEY ontbreekt");
    return jsonResponse(500, { error: "configuration_error" });
  }

  let payload: { email?: unknown; password?: unknown };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse(400, { error: "invalid_json" });
  }

  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const password = typeof payload.password === "string" ? payload.password : "";

  if (!email || !password) {
    return jsonResponse(400, { error: "missing_credentials" });
  }

  pruneBuckets();
  const ip = clientIp(req);
  if (!checkBucket(ipBuckets, ip, PER_IP_LIMIT, THROTTLE_WINDOW_MS)) {
    return jsonResponse(429, { error: "ip_throttled", retry_after_seconds: 60 });
  }
  if (!checkBucket(emailBuckets, email, PER_EMAIL_LIMIT, THROTTLE_WINDOW_MS)) {
    return jsonResponse(429, { error: "email_throttled", retry_after_seconds: 60 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const policy = await fetchPolicy(admin, email);

  if (
    policy?.login_protection_enabled !== false
    && policy?.locked_until
    && new Date(policy.locked_until).getTime() > Date.now()
  ) {
    return new Response(
      JSON.stringify({ error: "locked", unlock_at: policy.locked_until }),
      {
        status: 423,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  }

  const auth = await signInWithPassword(email, password);

  if (auth.status >= 200 && auth.status < 300 && auth.body && typeof auth.body === "object") {
    if (policy?.login_protection_enabled !== false) {
      await recordAttempt(admin, email, true, policy);
    }
    return jsonResponse(200, auth.body);
  }

  if (policy?.login_protection_enabled !== false) {
    await recordAttempt(admin, email, false, policy);
  }

  // We refreshen de policy zodat de UI direct kan zien of deze poging de
  // lockout heeft getriggerd.
  const refreshed = await fetchPolicy(admin, email);
  if (
    refreshed?.login_protection_enabled !== false
    && refreshed?.locked_until
    && new Date(refreshed.locked_until).getTime() > Date.now()
  ) {
    return new Response(
      JSON.stringify({ error: "locked", unlock_at: refreshed.locked_until }),
      {
        status: 423,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  }

  return jsonResponse(401, { error: "invalid_credentials" });
});
