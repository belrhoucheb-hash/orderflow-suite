// HMAC-signed state-parameter voor OAuth-flows.
//
// Format: `${tenantId}.${expiresEpochSeconds}.${hexHmacSha256}`
// Secret: env var OAUTH_STATE_SECRET (verplicht).

const STATE_TTL_SECONDS = 600;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function signOAuthState(tenantId: string): Promise<string> {
  if (!UUID_RE.test(tenantId)) throw new Error("Ongeldige tenant_id voor OAuth state");
  const secret = Deno.env.get("OAUTH_STATE_SECRET");
  if (!secret) throw new Error("OAUTH_STATE_SECRET ontbreekt op de server");
  const expires = Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS;
  const msg = `${tenantId}.${expires}`;
  const sig = await hmac(secret, msg);
  return `${msg}.${sig}`;
}

export async function verifyOAuthState(
  state: string,
): Promise<{ tenantId: string } | null> {
  const secret = Deno.env.get("OAUTH_STATE_SECRET");
  if (!secret) return null;
  const parts = state.split(".");
  if (parts.length !== 3) return null;
  const [tenantId, expStr, providedSig] = parts;
  if (!UUID_RE.test(tenantId)) return null;
  const expires = Number(expStr);
  if (!Number.isFinite(expires)) return null;
  if (Math.floor(Date.now() / 1000) > expires) return null;
  const msg = `${tenantId}.${expires}`;
  const expectedSig = await hmac(secret, msg);
  if (!constantTimeEqual(providedSig, expectedSig)) return null;
  return { tenantId };
}

async function hmac(secret: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
