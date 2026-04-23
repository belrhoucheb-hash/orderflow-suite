// Auth-helpers voor edge functions.
//
// Centraal: Bearer-token-validatie. Drie geldige routes:
//
//   1. user-JWT  -> getUserAuth(req): user + tenant_id uit app_metadata
//   2. service   -> isServiceRoleToken(req): cron / DB-webhook / interne call
//   3. cron-sec  -> isCronSecret(req): x-cron-secret header == env CRON_SECRET
//
// Functions kiezen welke routes ze accepteren via de helpers hieronder.
// Geen extra logging, geen side-effects.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export interface UserAuthResult {
  ok: true;
  userId: string;
  tenantId: string;
  token: string;
}

export interface AuthFailure {
  ok: false;
  status: number;
  error: string;
}

function bearerToken(req: Request): string | null {
  const header = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!header || !header.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "===".slice((payload.length + 3) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

/**
 * True als de Bearer-token een geldige service-role JWT is.
 * Geen netwerk-call: we vergelijken direct met SUPABASE_SERVICE_ROLE_KEY.
 */
export function isServiceRoleToken(req: Request): boolean {
  const token = bearerToken(req);
  if (!token) return false;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceKey && token === serviceKey) return true;
  const payload = decodeJwtPayload(token);
  return payload?.role === "service_role";
}

/**
 * True als de x-cron-secret header overeenkomt met env CRON_SECRET.
 * Geeft false als de env-var niet gezet is (geen impliciete bypass).
 */
export function isCronSecret(req: Request): boolean {
  const expected = Deno.env.get("CRON_SECRET");
  if (!expected) return false;
  const provided = req.headers.get("x-cron-secret");
  return !!provided && provided === expected;
}

/**
 * Valideer een gewone gebruiker-JWT en haal tenant_id op uit app_metadata.
 * Returnt 401 bij ontbreken/ongeldig, 401 bij ontbrekend tenant_id.
 */
export async function getUserAuth(req: Request): Promise<UserAuthResult | AuthFailure> {
  const token = bearerToken(req);
  if (!token) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    return { ok: false, status: 500, error: "Auth-env ontbreekt" };
  }

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) {
    return { ok: false, status: 401, error: "Invalid token" };
  }

  const meta = (data.user.app_metadata ?? {}) as Record<string, unknown>;
  const tenantId = typeof meta.tenant_id === "string" ? meta.tenant_id : "";
  if (!tenantId) {
    return { ok: false, status: 401, error: "Missing tenant_id in token" };
  }

  return { ok: true, userId: data.user.id, tenantId, token };
}

/**
 * Combinatie: accepteer service-role OF cron-secret. Bedoeld voor functions
 * die alleen door cron / DB-webhooks getriggerd mogen worden.
 */
export function isTrustedCaller(req: Request): boolean {
  return isServiceRoleToken(req) || isCronSecret(req);
}
