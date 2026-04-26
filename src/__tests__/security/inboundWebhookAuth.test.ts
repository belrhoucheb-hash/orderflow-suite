// Statische audit van inbound webhook-endpoints op authenticatie.
//
// Elke endpoint die externe POSTs accepteert MOET een signature- of
// auth-check doen die NIET fail-open is.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FN_DIR = resolve(__dirname, "../../../supabase/functions");

function readFn(name: string): string {
  return readFileSync(resolve(FN_DIR, name, "index.ts"), "utf-8");
}

describe("inbound webhook auth", () => {
  it("webhook-dispatcher gebruikt isTrustedCaller en faalt-closed met 401", () => {
    const src = readFn("webhook-dispatcher");
    expect(src).toMatch(/if\s*\(\s*!isTrustedCaller\(req\)\s*\)/);
    expect(src).toMatch(/status:\s*401/);
    expect(src).toMatch(/Unauthorized/);
  });

  it("api-v1 gebruikt verifyToken vóór routing", () => {
    const src = readFn("api-v1");
    // De auth-check moet vóór de switch op resource gebeuren.
    const verifyIdx = src.indexOf("verifyToken(supabase, req)");
    const switchIdx = src.indexOf('switch (resource)');
    expect(verifyIdx).toBeGreaterThan(-1);
    expect(switchIdx).toBeGreaterThan(verifyIdx);
  });
});
