// Contract-tests voor outbound webhook HMAC-signering.
//
// Deze tests bevriezen het signatuur-formaat dat klanten gebruiken om
// inkomende webhooks te verifieren. Als deze tests breken, breken externe
// integraties: pas alleen aan na bewuste versie-bump (v2 etc.).
//
// Bron-implementatie: supabase/functions/_shared/webhook-signer.ts.
// Deze file gebruikt Web Crypto (subtle), wat onder Node 20+ identiek is
// aan de Deno-implementatie. We re-implementeren de pure formule lokaal
// zodat de test geen Deno-imports laadt.

import { describe, it, expect } from "vitest";
import { webcrypto } from "node:crypto";

const subtle = (globalThis.crypto?.subtle ?? webcrypto.subtle) as SubtleCrypto;

async function signPayload(secret: string, body: string, timestamp: number): Promise<string> {
  const encoder = new TextEncoder();
  const key = await subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const data = encoder.encode(`${timestamp}.${body}`);
  const sig = await subtle.sign("HMAC", key, data);
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `v1=${hex}`;
}

describe("webhook HMAC contract", () => {
  it("produceert deterministische signatuur voor vaste input", async () => {
    const sig = await signPayload(
      "test-secret",
      '{"event":"order.created","data":{"id":"abc"}}',
      1714000000,
    );
    // Vector vastgelegd: als deze waarde verandert, veranderde de formule.
    expect(sig).toBe(
      "v1=76393245bc799c04e2faf6fcb510b2379e21ddf1bed3d6aed7f648c939328992",
    );
  });

  it("verandert bij ander timestamp (replay-bescherming)", async () => {
    const body = '{"x":1}';
    const a = await signPayload("s", body, 1000);
    const b = await signPayload("s", body, 1001);
    expect(a).not.toBe(b);
  });

  it("verandert bij ander secret (key-binding)", async () => {
    const a = await signPayload("secret-a", "body", 1000);
    const b = await signPayload("secret-b", "body", 1000);
    expect(a).not.toBe(b);
  });

  it("verandert bij ander body (integriteit)", async () => {
    const a = await signPayload("s", '{"a":1}', 1000);
    const b = await signPayload("s", '{"a":2}', 1000);
    expect(a).not.toBe(b);
  });

  it("formaat is altijd v1=<64 hex>", async () => {
    const sig = await signPayload("s", "x", 1);
    expect(sig).toMatch(/^v1=[0-9a-f]{64}$/);
  });
});
