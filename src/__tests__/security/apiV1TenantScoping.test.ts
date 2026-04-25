// Statische audit van de publieke REST API v1 op tenant-scoping.
//
// De gateway in supabase/functions/api-v1/index.ts gebruikt service-role
// en omzeilt RLS bewust. Daarom MOET elke handler die een tabel met
// tenant_id raakt expliciet .eq("tenant_id", token.tenant_id) toevoegen.
// Een gemiste scope = cross-tenant data lekkage.
//
// Deze test parsed de source en faalt als een handler-functie ontbreekt
// op die check. Goedkoop, statisch, vangt 95% van de regressies.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const API_V1_PATH = resolve(__dirname, "../../../supabase/functions/api-v1/index.ts");
const SOURCE = readFileSync(API_V1_PATH, "utf-8");

const TENANT_SCOPED_HANDLERS = [
  "listOrders",
  "getOrder",
  "createOrder",
  "listTrips",
  "getTrip",
  "listInvoices",
  "getInvoice",
  "listClients",
  "getClient",
];

function extractFunctionBody(name: string): string {
  const start = SOURCE.indexOf(`async function ${name}(`);
  if (start === -1) throw new Error(`Handler ${name} niet gevonden`);
  let depth = 0;
  let started = false;
  let end = start;
  for (let i = start; i < SOURCE.length; i++) {
    const c = SOURCE[i];
    if (c === "{") {
      depth++;
      started = true;
    } else if (c === "}") {
      depth--;
      if (started && depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  return SOURCE.slice(start, end);
}

describe("API v1 tenant-scoping (statisch)", () => {
  it.each(TENANT_SCOPED_HANDLERS)(
    "%s scopet expliciet op token.tenant_id",
    (handler) => {
      const body = extractFunctionBody(handler);
      // Accepteer .eq("tenant_id", token.tenant_id) in alle varianten quotes/whitespace.
      const hasTenantEq = /\.eq\(\s*["']tenant_id["']\s*,\s*token\.tenant_id\s*\)/.test(body);
      // createOrder schrijft tenant_id ipv filteren — dat is ook acceptabel.
      const writesTenantId = /tenant_id\s*:\s*token\.tenant_id/.test(body);
      expect(hasTenantEq || writesTenantId).toBe(true);
    },
  );

  it("createOrder overschrijft client_id uit body met token.client_id", () => {
    const body = extractFunctionBody("createOrder");
    expect(body).toMatch(/if\s*\(\s*token\.client_id\s*\)\s*\{[\s\S]*?body\.client_id\s*=\s*token\.client_id/);
  });

  it("getClient blokkeert cross-client lookup voor klant-tokens", () => {
    const body = extractFunctionBody("getClient");
    expect(body).toMatch(/token\.client_id\s*&&\s*token\.client_id\s*!==\s*id/);
  });

  it("trips zijn niet beschikbaar voor klant-tokens in v1", () => {
    const listBody = extractFunctionBody("listTrips");
    const getBody = extractFunctionBody("getTrip");
    expect(listBody).toMatch(/if\s*\(\s*token\.client_id\s*\)\s*\{[\s\S]*?errors\.forbidden/);
    expect(getBody).toMatch(/if\s*\(\s*token\.client_id\s*\)\s*\{[\s\S]*?errors\.forbidden/);
  });

  it("elke handler doet eerst een hasScope-check", () => {
    for (const handler of TENANT_SCOPED_HANDLERS) {
      const body = extractFunctionBody(handler);
      expect(body, `${handler} mist hasScope-check`).toMatch(/hasScope\(token,\s*["']\w+:\w+["']\)/);
    }
  });

  it("CORS preflight gebruikt geen credentials", () => {
    expect(SOURCE).not.toMatch(/Access-Control-Allow-Credentials/);
  });
});
