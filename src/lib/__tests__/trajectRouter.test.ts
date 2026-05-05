import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Supabase mock ───────────────────────────────────────────────────────
// We implementeren een fluent-builder die we per test kunnen configureren
// door de `__setTable` helper aan te roepen. Elke `.from(tableName)` call
// geeft een nieuwe builder die de geregistreerde data teruggeeft.
//
// Query-mutators (`insert`) worden via `__onInsert` opgevangen zodat tests
// kunnen asserten welke records geschreven zouden worden.

type TableState = {
  rows: any[];
  singleRow?: any;
};

const { tables, insertedByTable, mockFrom, mockRpc, rpcCalls, rpcResponses } = vi.hoisted(() => {
  const tables = new Map<string, TableState>();
  const insertedByTable = new Map<string, any[]>();
  const rpcCalls: { name: string; args: any }[] = [];
  const rpcResponses = new Map<string, { data?: any; error?: any }>();

  function buildBuilder(tableName: string) {
    // terminal-state holders voor deze query
    const state = {
      insertPayload: null as any,
      // returned vanuit de terminal (`select().single()` of direct thenable)
      // is afgeleid van `tables` behalve voor insert (dan = insertPayload)
    };

    const builder: any = {
      select: vi.fn(() => builder),
      insert: vi.fn((payload: any) => {
        state.insertPayload = payload;
        const list = insertedByTable.get(tableName) ?? [];
        list.push(payload);
        insertedByTable.set(tableName, list);
        return builder;
      }),
      update: vi.fn(() => builder),
      delete: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      in: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      single: vi.fn(async () => {
        if (state.insertPayload) {
          // Simuleer INSERT … RETURNING *
          const rec = {
            id: state.insertPayload.id ?? `${tableName}-mock-id-${Math.random().toString(36).slice(2, 8)}`,
            ...state.insertPayload,
          };
          return { data: rec, error: null };
        }
        const t = tables.get(tableName);
        return { data: t?.singleRow ?? null, error: null };
      }),
      then: (cb: any) => {
        // Wanneer een query `await`-ed wordt zonder .single()
        if (state.insertPayload) {
          const rec = {
            id: state.insertPayload.id ?? `${tableName}-mock-id`,
            ...state.insertPayload,
          };
          return Promise.resolve(cb({ data: [rec], error: null }));
        }
        const t = tables.get(tableName);
        return Promise.resolve(cb({ data: t?.rows ?? [], error: null }));
      },
    };
    return builder;
  }

  const mockFrom = vi.fn((tableName: string) => buildBuilder(tableName));
  const mockRpc = vi.fn(async (name: string, args: any) => {
    rpcCalls.push({ name, args });
    return rpcResponses.get(name) ?? { data: null, error: null };
  });
  return { tables, insertedByTable, mockFrom, mockRpc, rpcCalls, rpcResponses };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mockFrom, rpc: mockRpc },
}));

function setTable(name: string, state: TableState) {
  tables.set(name, state);
}

function getInserts(name: string): any[] {
  return insertedByTable.get(name) ?? [];
}

import {
  matchTrajectRule,
  resolveHubAddress,
  createShipmentWithLegs,
  commitOrderDraftWithLegs,
  evaluateMatch,
  inferAfdeling,
  type TrajectRule,
  type BookingInput,
} from "@/lib/trajectRouter";

const TENANT = "tenant-xyz";

function makeRule(overrides: Partial<TrajectRule>): TrajectRule {
  return {
    id: `rule-${Math.random().toString(36).slice(2, 8)}`,
    tenant_id: TENANT,
    name: "Test rule",
    priority: 100,
    is_active: true,
    match_conditions: {},
    legs_template: [],
    ...overrides,
  };
}

beforeEach(() => {
  tables.clear();
  insertedByTable.clear();
  rpcCalls.length = 0;
  rpcResponses.clear();
  mockFrom.mockClear();
  mockRpc.mockClear();
});

// ─── evaluateMatch (pure helper) ─────────────────────────────────────────

describe("evaluateMatch", () => {
  it("returns true when default:true", () => {
    const booking: BookingInput = { pickup_address: "X", delivery_address: "Y" };
    expect(evaluateMatch(booking, { default: true })).toBe(true);
  });

  it("matches delivery_address_contains case-insensitively", () => {
    const booking: BookingInput = {
      pickup_address: "Amsterdam",
      delivery_address: "royalty cargo EXPORT warehouse, Schiphol",
    };
    expect(
      evaluateMatch(booking, { delivery_address_contains: ["RCS Export", "Royalty Cargo Export"] }),
    ).toBe(true);
  });

  it("returns false when no condition matches", () => {
    const booking: BookingInput = {
      pickup_address: "Amsterdam",
      delivery_address: "Rotterdam",
    };
    expect(
      evaluateMatch(booking, { delivery_address_contains: ["RCS Export"] }),
    ).toBe(false);
  });

  it("matches afdeling_equals case-insensitively", () => {
    const booking: BookingInput = {
      pickup_address: "hoofdweg 1",
      delivery_address: "dubai",
      afdeling: "export",
    };
    expect(evaluateMatch(booking, { afdeling_equals: "EXPORT" })).toBe(true);
    expect(evaluateMatch(booking, { afdeling_equals: "OPS" })).toBe(false);
  });

  it("returns false for afdeling_equals when booking has no afdeling", () => {
    const booking: BookingInput = {
      pickup_address: "hoofdweg 1",
      delivery_address: "dubai",
    };
    expect(evaluateMatch(booking, { afdeling_equals: "EXPORT" })).toBe(false);
  });

  it("ANDs multiple conditions", () => {
    const booking: BookingInput = {
      pickup_address: "RCS Hub Schiphol",
      delivery_address: "Antwerp",
    };
    expect(
      evaluateMatch(booking, {
        pickup_address_contains: ["RCS Hub"],
        delivery_address_contains: ["Antwerp"],
      }),
    ).toBe(true);

    expect(
      evaluateMatch(booking, {
        pickup_address_contains: ["RCS Hub"],
        delivery_address_contains: ["Rotterdam"],
      }),
    ).toBe(false);
  });
});

// ─── inferAfdeling ───────────────────────────────────────────────────────

describe("inferAfdeling", () => {
  it("returns null when either address missing", () => {
    expect(inferAfdeling(null, "RCS export")).toBeNull();
    expect(inferAfdeling("hoofdweg 1", "")).toBeNull();
  });

  it("returns EXPORT when delivery is RCS export", () => {
    expect(inferAfdeling("hoofdweg 1", "RCS Export Schiphol")).toBe("EXPORT");
    expect(inferAfdeling("hoofdweg 1", "royalty cargo export")).toBe("EXPORT");
  });

  it("returns OPS when delivery is RCS import", () => {
    expect(inferAfdeling("hoofdweg 1", "RCS Import Schiphol")).toBe("OPS");
  });

  it("returns IMPORT when pickup is RCS Import", () => {
    expect(
      inferAfdeling("RCS Import Schiphol", "Coolsingel 10, 3011 AD Rotterdam"),
    ).toBe("IMPORT");
  });

  it("returns IMPORT when pickup is rcs_import case-variant", () => {
    expect(inferAfdeling("rcs_import schiphol", "Rotterdam")).toBe("IMPORT");
  });

  it("returns OPS when no RCS involved", () => {
    expect(inferAfdeling("hoofdweg 1", "Rotterdam")).toBe("OPS");
    expect(inferAfdeling("hoofdweg 1", "Dubai, UAE")).toBe("OPS");
  });
});

// ─── matchTrajectRule ────────────────────────────────────────────────────

describe("matchTrajectRule", () => {
  it("picks rule with lowest priority-number when multiple match", async () => {
    const highPrio = makeRule({
      id: "rule-high-prio",
      name: "Export split",
      priority: 10,
      match_conditions: { delivery_address_contains: ["RCS Export"] },
      legs_template: [
        { sequence: 1, from: "pickup", to: "hub", department_code: "OPS", leg_role: "OPS_PICKUP" },
        { sequence: 2, from: "hub", to: "delivery", department_code: "EXPORT", leg_role: "EXPORT_LEG" },
      ],
    });
    const fallback = makeRule({
      id: "rule-fallback",
      name: "Default",
      priority: 1000,
      match_conditions: { default: true },
      legs_template: [
        { sequence: 1, from: "pickup", to: "delivery", department_code: "OPS", leg_role: "SINGLE" },
      ],
    });
    // Rules komen in priority-ASC volgorde door `.order()` — het mock geeft
    // ze gewoon terug zoals we ze hier zetten.
    setTable("traject_rules", { rows: [highPrio, fallback] });

    const rule = await matchTrajectRule(
      { pickup_address: "Amsterdam", delivery_address: "RCS Export Schiphol" },
      TENANT,
    );

    expect(rule).not.toBeNull();
    expect(rule!.id).toBe("rule-high-prio");
  });

  it("matches delivery_address_contains case-insensitively", async () => {
    const rule = makeRule({
      priority: 10,
      match_conditions: { delivery_address_contains: ["RCS Export"] },
      legs_template: [
        { sequence: 1, from: "pickup", to: "delivery", department_code: "EXPORT", leg_role: "SINGLE" },
      ],
    });
    setTable("traject_rules", { rows: [rule] });

    const result = await matchTrajectRule(
      { pickup_address: "A", delivery_address: "rcs export hub" },
      TENANT,
    );
    expect(result).not.toBeNull();
    expect(result!.id).toBe(rule.id);
  });

  it("falls back to default-rule when nothing else matches", async () => {
    const specific = makeRule({
      id: "rule-specific",
      priority: 10,
      match_conditions: { delivery_address_contains: ["RCS Export"] },
      legs_template: [
        { sequence: 1, from: "pickup", to: "delivery", department_code: "EXPORT", leg_role: "SINGLE" },
      ],
    });
    const fallback = makeRule({
      id: "rule-default",
      priority: 1000,
      match_conditions: { default: true },
      legs_template: [
        { sequence: 1, from: "pickup", to: "delivery", department_code: "OPS", leg_role: "SINGLE" },
      ],
    });
    setTable("traject_rules", { rows: [specific, fallback] });

    const result = await matchTrajectRule(
      { pickup_address: "Utrecht", delivery_address: "Rotterdam" },
      TENANT,
    );
    expect(result).not.toBeNull();
    expect(result!.id).toBe("rule-default");
  });

  it("returns null when no rule matches", async () => {
    const specific = makeRule({
      priority: 10,
      match_conditions: { delivery_address_contains: ["RCS Export"] },
      legs_template: [
        { sequence: 1, from: "pickup", to: "delivery", department_code: "EXPORT", leg_role: "SINGLE" },
      ],
    });
    setTable("traject_rules", { rows: [specific] });

    const result = await matchTrajectRule(
      { pickup_address: "Utrecht", delivery_address: "Rotterdam" },
      TENANT,
    );
    expect(result).toBeNull();
  });
});

// ─── resolveHubAddress ───────────────────────────────────────────────────

describe("resolveHubAddress", () => {
  it("returns configured hub address from tenant settings", async () => {
    setTable("tenants", {
      rows: [],
      singleRow: { settings: { rcs_hub_address: "My Custom Hub, Rotterdam" } },
    });
    const addr = await resolveHubAddress(TENANT);
    expect(addr).toBe("My Custom Hub, Rotterdam");
  });

  it("returns fallback when settings missing", async () => {
    setTable("tenants", { rows: [], singleRow: { settings: {} } });
    const addr = await resolveHubAddress(TENANT);
    expect(addr).toBe("Royalty Cargo Solutions, Schiphol");
  });
});

// ─── createShipmentWithLegs ──────────────────────────────────────────────

describe("createShipmentWithLegs", () => {
  it("creates shipment + 2 orders for a split rule", async () => {
    const rule = makeRule({
      id: "rule-split",
      name: "Export split",
      priority: 10,
      match_conditions: { delivery_address_contains: ["RCS Export"] },
      legs_template: [
        { sequence: 1, from: "pickup", to: "hub", department_code: "OPS", leg_role: "OPS_PICKUP" },
        { sequence: 2, from: "hub", to: "delivery", department_code: "EXPORT", leg_role: "EXPORT_LEG" },
      ],
    });
    setTable("traject_rules", { rows: [rule] });
    setTable("tenants", {
      rows: [],
      singleRow: { settings: { rcs_hub_address: "HUB-ADDR" } },
    });
    setTable("departments", {
      rows: [
        { id: "dept-ops-id", code: "OPS" },
        { id: "dept-export-id", code: "EXPORT" },
      ],
    });

    const booking: BookingInput = {
      pickup_address: "Klantlocatie 1, Utrecht",
      delivery_address: "RCS Export Schiphol",
      client_id: "client-1",
      client_name: "Acme BV",
      weight_kg: 500,
      quantity: 2,
    };

    const result = await createShipmentWithLegs(booking, TENANT);

    // Shipment
    expect(result.shipment).toBeTruthy();
    expect(result.shipment.tenant_id).toBe(TENANT);
    expect(result.shipment.traject_rule_id).toBe("rule-split");
    expect(result.shipment.status).toBe("PENDING");
    expect(result.shipment.origin_address).toBe("Klantlocatie 1, Utrecht");
    expect(result.shipment.destination_address).toBe("RCS Export Schiphol");

    // Legs
    expect(result.legs).toHaveLength(2);

    const leg1 = result.legs[0];
    expect(leg1.leg_number).toBe(1);
    expect(leg1.leg_role).toBe("OPS_PICKUP");
    expect(leg1.department_id).toBe("dept-ops-id");
    expect(leg1.pickup_address).toBe("Klantlocatie 1, Utrecht");
    expect(leg1.delivery_address).toBe("HUB-ADDR");
    expect(leg1.status).toBe("PENDING");
    expect(leg1.shipment_id).toBe(result.shipment.id);

    const leg2 = result.legs[1];
    expect(leg2.leg_number).toBe(2);
    expect(leg2.leg_role).toBe("EXPORT_LEG");
    expect(leg2.department_id).toBe("dept-export-id");
    expect(leg2.pickup_address).toBe("HUB-ADDR");
    expect(leg2.delivery_address).toBe("RCS Export Schiphol");

    // Controleer dat de orders in de `orders`-tabel zijn ge-insert
    const orderInserts = getInserts("orders");
    expect(orderInserts).toHaveLength(2);
    expect(orderInserts[0].leg_number).toBe(1);
    expect(orderInserts[1].leg_number).toBe(2);

    // Shipment-insert moet exact 1 keer gebeurd zijn
    const shipmentInserts = getInserts("shipments");
    expect(shipmentInserts).toHaveLength(1);
    expect(shipmentInserts[0].traject_rule_id).toBe("rule-split");
  });

  it("throws when no rule matches", async () => {
    const specific = makeRule({
      priority: 10,
      match_conditions: { delivery_address_contains: ["RCS Export"] },
      legs_template: [
        { sequence: 1, from: "pickup", to: "delivery", department_code: "OPS", leg_role: "SINGLE" },
      ],
    });
    setTable("traject_rules", { rows: [specific] });

    await expect(
      createShipmentWithLegs(
        { pickup_address: "Utrecht", delivery_address: "Rotterdam" },
        TENANT,
      ),
    ).rejects.toThrow(/Geen traject-rule/i);
  });

  it("creates a single leg for a default (fallback) rule", async () => {
    const fallback = makeRule({
      id: "rule-default",
      priority: 1000,
      match_conditions: { default: true },
      legs_template: [
        { sequence: 1, from: "pickup", to: "delivery", department_code: "OPS", leg_role: "SINGLE" },
      ],
    });
    setTable("traject_rules", { rows: [fallback] });
    setTable("departments", { rows: [{ id: "dept-ops-id", code: "OPS" }] });

    const result = await createShipmentWithLegs(
      { pickup_address: "Amsterdam", delivery_address: "Rotterdam" },
      TENANT,
    );

    expect(result.legs).toHaveLength(1);
    expect(result.legs[0].leg_number).toBe(1);
    expect(result.legs[0].leg_role).toBe("SINGLE");
    expect(result.legs[0].department_id).toBe("dept-ops-id");
    expect(result.legs[0].pickup_address).toBe("Amsterdam");
    expect(result.legs[0].delivery_address).toBe("Rotterdam");
  });

  it("creates EXPORT placeholder leg where leg-2 from/to both resolve to delivery_address", async () => {
    const rule = makeRule({
      id: "rule-export-afdeling",
      name: "Export via afdeling",
      priority: 20,
      match_conditions: { afdeling_equals: "EXPORT" },
      legs_template: [
        { sequence: 1, from: "pickup", to: "delivery", department_code: "OPS", leg_role: "OPS_PICKUP" },
        { sequence: 2, from: "delivery", to: "delivery", department_code: "EXPORT", leg_role: "EXPORT_LEG" },
      ],
    });
    setTable("traject_rules", { rows: [rule] });
    setTable("departments", {
      rows: [
        { id: "dept-ops-id", code: "OPS" },
        { id: "dept-export-id", code: "EXPORT" },
      ],
    });

    const result = await createShipmentWithLegs(
      {
        pickup_address: "hoofdweg 1",
        delivery_address: "RCS Export",
        afdeling: "EXPORT",
      },
      TENANT,
    );

    expect(result.legs).toHaveLength(2);
    const leg2 = result.legs[1];
    expect(leg2.pickup_address).toBe("RCS Export");
    expect(leg2.delivery_address).toBe("RCS Export");
    expect(leg2.pickup_address).toBe(leg2.delivery_address);
  });

  // ─── Hub-gating: klant-coordinaten alleen op eerste/laatste leg ─────────
  //
  // Kritische business-regel: hub-legs mogen GEEN klant-straatnaam/lat/lng
  // krijgen, anders navigeert de chauffeur op de hub-leg naar de klant in
  // plaats van naar de hub. Deze tests borgen `trajectRouter.ts:487-508`.

  it("hub-split route: alleen pickup-leg krijgt klant-pickup-coords, alleen delivery-leg krijgt klant-delivery-coords", async () => {
    const rule = makeRule({
      id: "rule-hub-split",
      name: "Export split via hub",
      priority: 10,
      match_conditions: { delivery_address_contains: ["RCS Export"] },
      legs_template: [
        { sequence: 1, from: "pickup", to: "hub", department_code: "OPS", leg_role: "OPS_PICKUP" },
        { sequence: 2, from: "hub", to: "delivery", department_code: "EXPORT", leg_role: "EXPORT_LEG" },
      ],
    });
    setTable("traject_rules", { rows: [rule] });
    setTable("tenants", {
      rows: [],
      singleRow: { settings: { rcs_hub_address: "HUB-ADDR" } },
    });
    setTable("departments", {
      rows: [
        { id: "dept-ops-id", code: "OPS" },
        { id: "dept-export-id", code: "EXPORT" },
      ],
    });

    const booking: BookingInput = {
      pickup_address: "Klantlocatie 1, Utrecht",
      delivery_address: "RCS Export Schiphol",
      pickup_street: "Klantstraat 1",
      pickup_house_number: "1",
      pickup_zipcode: "3500 AB",
      pickup_city: "Utrecht",
      pickup_country: "NL",
      pickup_lat: 52.1,
      pickup_lng: 5.1,
      pickup_coords_manual: false,
      delivery_street: "Exportweg 99",
      delivery_house_number: "99",
      delivery_zipcode: "1118 ZZ",
      delivery_city: "Schiphol",
      delivery_country: "NL",
      delivery_lat: 52.3,
      delivery_lng: 4.76,
      delivery_coords_manual: false,
    };

    await createShipmentWithLegs(booking, TENANT);

    const orderInserts = getInserts("orders");
    expect(orderInserts).toHaveLength(2);

    // Leg 1: pickup -> hub. Pickup-kant MOET klant-coords krijgen,
    // delivery-kant mag die NIET krijgen (het is de hub).
    const leg1 = orderInserts[0];
    expect(leg1.leg_number).toBe(1);
    expect(leg1.pickup_street).toBe("Klantstraat 1");
    expect(leg1.pickup_city).toBe("Utrecht");
    expect(leg1.geocoded_pickup_lat).toBe(52.1);
    expect(leg1.geocoded_pickup_lng).toBe(5.1);
    expect(leg1.pickup_coords_manual).toBe(false);

    expect(leg1.delivery_street).toBeUndefined();
    expect(leg1.delivery_city).toBeUndefined();
    expect(leg1.geocoded_delivery_lat).toBeUndefined();
    expect(leg1.geocoded_delivery_lng).toBeUndefined();
    expect(leg1.delivery_coords_manual).toBeUndefined();

    // Leg 2: hub -> delivery. Pickup-kant (de hub) mag GEEN klant-coords
    // hebben, delivery-kant MOET ze hebben.
    const leg2 = orderInserts[1];
    expect(leg2.leg_number).toBe(2);
    expect(leg2.pickup_street).toBeUndefined();
    expect(leg2.pickup_city).toBeUndefined();
    expect(leg2.geocoded_pickup_lat).toBeUndefined();
    expect(leg2.geocoded_pickup_lng).toBeUndefined();
    expect(leg2.pickup_coords_manual).toBeUndefined();

    expect(leg2.delivery_street).toBe("Exportweg 99");
    expect(leg2.delivery_city).toBe("Schiphol");
    expect(leg2.geocoded_delivery_lat).toBe(52.3);
    expect(leg2.geocoded_delivery_lng).toBe(4.76);
    expect(leg2.delivery_coords_manual).toBe(false);
  });

  it("direct traject (pickup -> delivery): beide velden op dezelfde leg, klant-coords volledig ingevuld", async () => {
    const fallback = makeRule({
      id: "rule-direct",
      priority: 1000,
      match_conditions: { default: true },
      legs_template: [
        { sequence: 1, from: "pickup", to: "delivery", department_code: "OPS", leg_role: "SINGLE" },
      ],
    });
    setTable("traject_rules", { rows: [fallback] });
    setTable("departments", { rows: [{ id: "dept-ops-id", code: "OPS" }] });

    const booking: BookingInput = {
      pickup_address: "Amsterdam",
      delivery_address: "Rotterdam",
      pickup_street: "Herengracht 1",
      pickup_city: "Amsterdam",
      pickup_lat: 52.37,
      pickup_lng: 4.89,
      pickup_coords_manual: false,
      delivery_street: "Coolsingel 10",
      delivery_city: "Rotterdam",
      delivery_lat: 51.92,
      delivery_lng: 4.48,
      delivery_coords_manual: false,
    };

    await createShipmentWithLegs(booking, TENANT);

    const orderInserts = getInserts("orders");
    expect(orderInserts).toHaveLength(1);

    const leg = orderInserts[0];
    expect(leg.pickup_street).toBe("Herengracht 1");
    expect(leg.pickup_city).toBe("Amsterdam");
    expect(leg.geocoded_pickup_lat).toBe(52.37);
    expect(leg.geocoded_pickup_lng).toBe(4.89);
    expect(leg.pickup_coords_manual).toBe(false);

    expect(leg.delivery_street).toBe("Coolsingel 10");
    expect(leg.delivery_city).toBe("Rotterdam");
    expect(leg.geocoded_delivery_lat).toBe(51.92);
    expect(leg.geocoded_delivery_lng).toBe(4.48);
    expect(leg.delivery_coords_manual).toBe(false);
  });

  it("pickup_coords_manual=true wordt doorgegeven aan de pickup-leg", async () => {
    const rule = makeRule({
      id: "rule-hub-manual",
      priority: 10,
      match_conditions: { delivery_address_contains: ["RCS Export"] },
      legs_template: [
        { sequence: 1, from: "pickup", to: "hub", department_code: "OPS", leg_role: "OPS_PICKUP" },
        { sequence: 2, from: "hub", to: "delivery", department_code: "EXPORT", leg_role: "EXPORT_LEG" },
      ],
    });
    setTable("traject_rules", { rows: [rule] });
    setTable("tenants", {
      rows: [],
      singleRow: { settings: { rcs_hub_address: "HUB-ADDR" } },
    });
    setTable("departments", {
      rows: [
        { id: "dept-ops-id", code: "OPS" },
        { id: "dept-export-id", code: "EXPORT" },
      ],
    });

    const booking: BookingInput = {
      pickup_address: "Klantlocatie 1, Utrecht",
      delivery_address: "RCS Export Schiphol",
      pickup_lat: 52.1,
      pickup_lng: 5.1,
      pickup_coords_manual: true,
      delivery_lat: 52.3,
      delivery_lng: 4.76,
      delivery_coords_manual: true,
    };

    await createShipmentWithLegs(booking, TENANT);

    const orderInserts = getInserts("orders");
    expect(orderInserts).toHaveLength(2);

    expect(orderInserts[0].pickup_coords_manual).toBe(true);
    expect(orderInserts[0].delivery_coords_manual).toBeUndefined();

    expect(orderInserts[1].pickup_coords_manual).toBeUndefined();
    expect(orderInserts[1].delivery_coords_manual).toBe(true);
  });

  it("uses final_delivery_address as leg-2 delivery for EXPORT multi-drop bookings", async () => {
    const rule = makeRule({
      id: "rule-export-multi-drop",
      name: "Export multi-drop via afdeling",
      priority: 20,
      match_conditions: { afdeling_equals: "EXPORT" },
      legs_template: [
        { sequence: 1, from: "pickup", to: "delivery", department_code: "OPS", leg_role: "OPS_PICKUP" },
        { sequence: 2, from: "delivery", to: "delivery", department_code: "EXPORT", leg_role: "EXPORT_LEG" },
      ],
    });
    setTable("traject_rules", { rows: [rule] });
    setTable("departments", {
      rows: [
        { id: "dept-ops-id", code: "OPS" },
        { id: "dept-export-id", code: "EXPORT" },
      ],
    });

    const result = await createShipmentWithLegs(
      {
        pickup_address: "Hoofdweg 1",
        delivery_address: "RCS Export",
        final_delivery_address: "Dubai, UAE",
        afdeling: "EXPORT",
      },
      TENANT,
    );

    expect(result.legs).toHaveLength(2);

    const leg1 = result.legs[0];
    expect(leg1.pickup_address).toBe("Hoofdweg 1");
    expect(leg1.delivery_address).toBe("RCS Export");

    const leg2 = result.legs[1];
    expect(leg2.pickup_address).toBe("RCS Export");
    expect(leg2.delivery_address).toBe("Dubai, UAE");
  });
});

describe("commitOrderDraftWithLegs", () => {
  it("stuurt decimale weight_kg (1247,5 kg luchtvracht) ongewijzigd door naar de RPC", async () => {
    rpcResponses.set("commit_order_draft_v1", {
      data: { shipment: { id: "ship-1" }, legs: [{ id: "order-1", weight_kg: 1247.5 }], idempotent: false },
      error: null,
    });

    const result = await commitOrderDraftWithLegs({
      draftId: "draft-1",
      tenantId: TENANT,
      expectedUpdatedAt: "2026-05-05T10:00:00Z",
      booking: {
        pickup_address: "Schiphol",
        delivery_address: "Dubai",
        weight_kg: 1247.5,
        quantity: 3,
        unit: "Pallet",
      } as BookingInput,
      payload: {},
      validationResult: { blockers: [] },
      manualOverrides: {},
    });

    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].name).toBe("commit_order_draft_v1");
    // Bug-regressie: zonder de numeric-migratie zou 1247.5 hier 1247 worden (RPC ::integer cast).
    expect(rpcCalls[0].args.p_booking.weight_kg).toBe(1247.5);
    expect(result.shipment.id).toBe("ship-1");
    expect(result.idempotent).toBe(false);
  });

  it("gooit een Error met de RPC-melding bij DRAFT_CONFLICT zodat de UI op 'conflict' kan zetten", async () => {
    rpcResponses.set("commit_order_draft_v1", {
      data: null,
      error: { message: "DRAFT_CONFLICT: Deze order is zojuist aangepast door een andere sessie." },
    });

    await expect(
      commitOrderDraftWithLegs({
        draftId: "draft-1",
        tenantId: TENANT,
        booking: { pickup_address: "A", delivery_address: "B" } as BookingInput,
        payload: {},
        validationResult: { blockers: [] },
        manualOverrides: {},
      }),
    ).rejects.toThrow(/DRAFT_CONFLICT/);
  });
});
