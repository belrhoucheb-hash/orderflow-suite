import { describe, it, expect } from "vitest";
import {
  hashToken,
  generateTokenPlaintext,
  tokenPrefix,
  extractBearer,
  hasScope,
  type ApiToken,
} from "../../supabase/functions/_shared/api/tokens";
import {
  shapeOrder,
  shapeTrip,
  shapeInvoice,
  shapeClient,
} from "../../supabase/functions/_shared/api/shapers";

describe("hashToken", () => {
  it("geeft een stabiele SHA-256 hex", async () => {
    const h = await hashToken("abc");
    expect(h).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("geeft verschillende hashes voor verschillende inputs", async () => {
    const a = await hashToken("one");
    const b = await hashToken("two");
    expect(a).not.toEqual(b);
  });
});

describe("generateTokenPlaintext", () => {
  it("heeft de ofs_ prefix en is lang genoeg", () => {
    const t = generateTokenPlaintext();
    expect(t.startsWith("ofs_")).toBe(true);
    expect(t.length).toBeGreaterThanOrEqual(40);
    expect(t).toMatch(/^ofs_[A-Za-z0-9_-]+$/);
  });

  it("geeft telkens een andere waarde", () => {
    const a = generateTokenPlaintext();
    const b = generateTokenPlaintext();
    expect(a).not.toEqual(b);
  });
});

describe("tokenPrefix", () => {
  it("geeft de eerste 8 karakters", () => {
    expect(tokenPrefix("ofs_abcdefghij")).toBe("ofs_abcd");
  });
});

describe("extractBearer", () => {
  const mkReq = (h: Record<string, string> = {}) =>
    new Request("https://example.com", { headers: h });

  it("haalt de token uit een Authorization header", () => {
    expect(extractBearer(mkReq({ Authorization: "Bearer ofs_xyz" }))).toBe("ofs_xyz");
    expect(extractBearer(mkReq({ authorization: "bearer ofs_xyz" }))).toBe("ofs_xyz");
  });

  it("geeft null zonder header of verkeerd schema", () => {
    expect(extractBearer(mkReq({}))).toBeNull();
    expect(extractBearer(mkReq({ Authorization: "Basic abc" }))).toBeNull();
  });

  it("geeft null voor lege token", () => {
    expect(extractBearer(mkReq({ Authorization: "Bearer  " }))).toBeNull();
  });
});

describe("hasScope", () => {
  const token: ApiToken = {
    id: "t-1",
    tenant_id: "tn-1",
    client_id: null,
    scopes: ["orders:read", "invoices:read"],
    expires_at: null,
    revoked_at: null,
    rotation_required_at: null,
  };

  it("true als scope aanwezig", () => {
    expect(hasScope(token, "orders:read")).toBe(true);
  });

  it("false als scope ontbreekt", () => {
    expect(hasScope(token, "orders:write")).toBe(false);
  });
});

describe("shapeOrder", () => {
  it("laat geen tenant_id door", () => {
    const shaped = shapeOrder({
      id: "o-1",
      tenant_id: "should-not-leak",
      order_number: 42,
      status: "CONFIRMED",
      client_name: "Acme",
      client_id: "c-1",
      pickup_address: "A-straat 1",
      delivery_address: "B-plein 2",
      delivery_date: "2026-04-25",
      weight_kg: 100,
      quantity: 5,
      unit: "pallet",
      transport_type: null,
      reference: "PO-123",
      notes: null,
      created_at: "2026-04-23T10:00:00Z",
      updated_at: null,
    });
    expect(shaped).not.toHaveProperty("tenant_id");
    expect(shaped.id).toBe("o-1");
    expect(shaped.client_name).toBe("Acme");
    expect(shaped.weight_kg).toBe(100);
  });

  it("werkt met minimale input", () => {
    const shaped = shapeOrder({ id: "o-2", created_at: "2026-04-23T10:00:00Z" });
    expect(shaped.id).toBe("o-2");
    expect(shaped.status).toBe("DRAFT");
    expect(shaped.client_name).toBeNull();
  });
});

describe("shapeTrip / shapeInvoice / shapeClient", () => {
  it("trip laat geen tenant_id door", () => {
    const s = shapeTrip({
      id: "t-1",
      tenant_id: "leak",
      trip_number: 10,
      status: "COMPLETED",
      dispatch_status: "VERZONDEN",
      planned_date: "2026-04-24",
      driver_id: "d-1",
      vehicle_id: "v-1",
      created_at: "2026-04-23T10:00:00Z",
    });
    expect(s).not.toHaveProperty("tenant_id");
    expect(s.trip_number).toBe(10);
  });

  it("invoice berekent defaults", () => {
    const s = shapeInvoice({
      id: "i-1",
      invoice_number: "F-2026-001",
      status: "concept",
      client_id: "c-1",
      client_name: "Acme",
      invoice_date: "2026-04-23",
      due_date: null,
      subtotal: 123.45,
      btw_amount: 25.92,
      btw_percentage: 21,
      total: 149.37,
      created_at: "2026-04-23T10:00:00Z",
    });
    expect(s).not.toHaveProperty("tenant_id");
    expect(s.total).toBeCloseTo(149.37);
  });

  it("client laat geen tenant_id door", () => {
    const s = shapeClient({
      id: "c-1",
      tenant_id: "leak",
      name: "Acme",
      address: "A-straat 1",
      city: "Rotterdam",
      country: "NL",
      email: "info@acme.nl",
      phone: "+31...",
      kvk_number: "12345678",
      btw_number: "NL...",
      is_active: true,
      created_at: "2026-04-23T10:00:00Z",
    });
    expect(s).not.toHaveProperty("tenant_id");
    expect(s.name).toBe("Acme");
    expect(s.is_active).toBe(true);
  });
});
