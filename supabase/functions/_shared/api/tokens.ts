// Token-helpers voor REST API v1.
//
// Plaintext-formaat: "ofs_" + 40 random base64url chars. De eerste 8
// karakters (inclusief prefix) zijn herkenbaar voor de gebruiker, de
// rest is geheim. Bij aanmaak: SHA-256 hashen, alleen hash + prefix
// opslaan. Bij verify: inkomende bearer-token hashen en matchen op
// token_hash (unieke index).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const TOKEN_PREFIX = "ofs_";
const TOKEN_RANDOM_LEN = 40;

export interface ApiToken {
  id: string;
  tenant_id: string;
  client_id: string | null;
  scopes: string[];
  expires_at: string | null;
  revoked_at: string | null;
  rotation_required_at?: string | null;
}

export interface TokenVerifyOk {
  ok: true;
  token: ApiToken;
}

export interface TokenVerifyErr {
  ok: false;
  status: number;
  error: string;
}

/** SHA-256 hex van een string. */
export async function hashToken(plaintext: string): Promise<string> {
  const encoder = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", encoder.encode(plaintext));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Genereer een nieuwe token: prefix + 40 random base64url-chars. */
export function generateTokenPlaintext(): string {
  const bytes = new Uint8Array(30);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const rand = btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
    .slice(0, TOKEN_RANDOM_LEN);
  return `${TOKEN_PREFIX}${rand}`;
}

/** Pak de eerste 8 karakters uit de plaintext voor UI-herkenning. */
export function tokenPrefix(plaintext: string): string {
  return plaintext.slice(0, 8);
}

/** Haal de bearer-token uit de Authorization-header. */
export function extractBearer(req: Request): string | null {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!header) return null;
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  return header.slice(7).trim() || null;
}

/** Valideer een bearer-token. Zoekt op token_hash, checkt revoked/expired. */
export async function verifyToken(
  supabase: SupabaseClient,
  req: Request,
): Promise<TokenVerifyOk | TokenVerifyErr> {
  const plaintext = extractBearer(req);
  if (!plaintext) {
    return { ok: false, status: 401, error: "missing_bearer_token" };
  }
  if (!plaintext.startsWith(TOKEN_PREFIX)) {
    return { ok: false, status: 401, error: "invalid_token_format" };
  }

  const hash = await hashToken(plaintext);

  const { data, error } = await supabase
    .from("api_tokens")
    .select("id, tenant_id, client_id, scopes, expires_at, revoked_at, rotation_required_at")
    .eq("token_hash", hash)
    .is("revoked_at", null)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, status: 401, error: "invalid_token" };
  }

  const token = data as ApiToken;

  if (token.expires_at && new Date(token.expires_at) < new Date()) {
    return { ok: false, status: 401, error: "token_expired" };
  }

  if (token.rotation_required_at && new Date(token.rotation_required_at) <= new Date()) {
    try {
      await supabase.rpc("log_api_token_event_from_gateway", {
        p_token_id: token.id,
        p_event_type: "rotation_required",
        p_note: "Rejected API request because token rotation is required",
        p_metadata: {},
      });
    } catch {
      // Audit logging should not change the external error shape.
    }
    return { ok: false, status: 401, error: "token_rotation_required" };
  }

  return { ok: true, token };
}

/** Update last_used_at, fire-and-forget. */
export async function touchTokenLastUsed(
  supabase: SupabaseClient,
  tokenId: string,
): Promise<void> {
  try {
    await supabase
      .from("api_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", tokenId);
  } catch {
    // Niet kritiek, fire-and-forget.
  }
}

/** Check of token een scope heeft. */
export function hasScope(token: ApiToken, required: string): boolean {
  return token.scopes.includes(required);
}
