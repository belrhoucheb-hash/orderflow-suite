// Spec-tests voor het bearer-token formaat van REST API v1.
//
// Bron-implementatie: supabase/functions/_shared/api/tokens.ts.
// We bevriezen hier het publieke contract: prefix, lengte, header-parsing,
// hash-stabiliteit. Externe documentatie verwijst naar deze spec.

import { describe, it, expect } from "vitest";
import { webcrypto } from "node:crypto";

const subtle = (globalThis.crypto?.subtle ?? webcrypto.subtle) as SubtleCrypto;
const TOKEN_PREFIX = "ofs_";
const TOKEN_RANDOM_LEN = 40;
const TOKEN_REGEX = /^ofs_[A-Za-z0-9_-]{40}$/;

function generateTokenPlaintext(): string {
  const bytes = new Uint8Array(30);
  webcrypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const rand = btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
    .slice(0, TOKEN_RANDOM_LEN);
  return `${TOKEN_PREFIX}${rand}`;
}

async function hashToken(plaintext: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await subtle.digest("SHA-256", enc.encode(plaintext));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function extractBearer(req: { headers: Headers }): string | null {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!header) return null;
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  return header.slice(7).trim() || null;
}

describe("bearer-token formaat", () => {
  it("token-string voldoet aan regex ofs_ + 40 base64url-chars", () => {
    const t = generateTokenPlaintext();
    expect(t).toMatch(TOKEN_REGEX);
    expect(t.length).toBe(TOKEN_PREFIX.length + TOKEN_RANDOM_LEN);
  });

  it("twee tokens zijn nooit gelijk (entropie)", () => {
    const a = generateTokenPlaintext();
    const b = generateTokenPlaintext();
    expect(a).not.toBe(b);
  });

  it("hash is deterministisch en 64 hex tekens (SHA-256)", async () => {
    const t = "ofs_known-token-value-for-test-vector-AAAAA";
    const h1 = await hashToken(t);
    const h2 = await hashToken(t);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hash verschilt zelfs bij één-karakter verschil (avalanche)", async () => {
    const a = await hashToken("ofs_same-prefix-A");
    const b = await hashToken("ofs_same-prefix-B");
    expect(a).not.toBe(b);
  });
});

describe("bearer-extractie uit Authorization-header", () => {
  function reqWith(headers: Record<string, string>) {
    return { headers: new Headers(headers) };
  }

  it("haalt token uit standaard Bearer-header", () => {
    expect(extractBearer(reqWith({ Authorization: "Bearer ofs_abc" }))).toBe("ofs_abc");
  });

  it("accepteert lowercase 'bearer'", () => {
    expect(extractBearer(reqWith({ authorization: "bearer ofs_xyz" }))).toBe("ofs_xyz");
  });

  it("returnt null zonder Authorization-header", () => {
    expect(extractBearer(reqWith({}))).toBeNull();
  });

  it("returnt null bij verkeerd schema (Basic, Token)", () => {
    expect(extractBearer(reqWith({ Authorization: "Basic ofs_abc" }))).toBeNull();
    expect(extractBearer(reqWith({ Authorization: "Token ofs_abc" }))).toBeNull();
  });

  it("returnt null bij lege Bearer-waarde", () => {
    expect(extractBearer(reqWith({ Authorization: "Bearer   " }))).toBeNull();
  });
});
