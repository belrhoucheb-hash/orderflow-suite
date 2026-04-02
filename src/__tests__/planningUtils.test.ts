import { describe, it, expect } from "vitest";
import {
  getTotalWeight,
  getCity,
  hasTag,
  capacityColor,
  getEmptyReason,
  findCombinableGroups,
} from "@/components/planning/planningUtils";
import type { PlanOrder } from "@/components/planning/types";
import type { FleetVehicle } from "@/hooks/useVehicles";

// ─── Helpers ──────────────────────────────────────────────────────────

function makeOrder(overrides: Partial<PlanOrder> = {}): PlanOrder {
  return {
    id: "order-1",
    order_number: 1001,
    client_name: "Test Klant",
    pickup_address: "Straat 1, Amsterdam",
    delivery_address: "Weg 2, Rotterdam",
    quantity: 10,
    weight_kg: 500,
    requirements: null,
    is_weight_per_unit: false,
    time_window_start: null,
    time_window_end: null,
    pickup_time_from: null,
    pickup_time_to: null,
    delivery_time_from: null,
    delivery_time_to: null,
    geocoded_pickup_lat: null,
    geocoded_pickup_lng: null,
    geocoded_delivery_lat: null,
    geocoded_delivery_lng: null,
    delivery_date: null,
    pickup_date: null,
    ...overrides,
  };
}

function makeVehicle(overrides: Partial<FleetVehicle> = {}): FleetVehicle {
  return {
    id: "v1",
    code: "V1",
    name: "Vrachtwagen 1",
    plate: "AB-123-CD",
    type: "truck",
    capacityKg: 10000,
    capacityPallets: 33,
    features: [],
    ...overrides,
  };
}

// ─── getTotalWeight ──────────────────────────────────────────────────

describe("getTotalWeight", () => {
  it("returns weight_kg when not per unit", () => {
    const order = makeOrder({ weight_kg: 500, is_weight_per_unit: false });
    expect(getTotalWeight(order)).toBe(500);
  });

  it("multiplies weight_kg by quantity when is_weight_per_unit is true", () => {
    const order = makeOrder({ weight_kg: 25, quantity: 10, is_weight_per_unit: true });
    expect(getTotalWeight(order)).toBe(250);
  });

  it("returns 0 when weight_kg is null", () => {
    const order = makeOrder({ weight_kg: null });
    expect(getTotalWeight(order)).toBe(0);
  });

  it("returns 0 when weight_kg is 0", () => {
    const order = makeOrder({ weight_kg: 0 });
    expect(getTotalWeight(order)).toBe(0);
  });

  it("returns weight_kg when is_weight_per_unit but quantity is null", () => {
    const order = makeOrder({ weight_kg: 100, is_weight_per_unit: true, quantity: null });
    expect(getTotalWeight(order)).toBe(100);
  });
});

// ─── getCity ─────────────────────────────────────────────────────────

describe("getCity", () => {
  it("extracts the last part of a comma-separated address", () => {
    expect(getCity("Straat 1, 1234 AB, Amsterdam")).toBe("Amsterdam");
  });

  it("returns the whole string when no comma", () => {
    expect(getCity("Amsterdam")).toBe("Amsterdam");
  });

  it("returns dash for null address", () => {
    expect(getCity(null)).toBe("\u2014");
  });

  it("trims whitespace from city name", () => {
    expect(getCity("Straat 1,  Rotterdam  ")).toBe("Rotterdam");
  });

  it("returns dash for empty string after split", () => {
    expect(getCity(",")).toBe("\u2014");
  });
});

// ─── hasTag ──────────────────────────────────────────────────────────

describe("hasTag", () => {
  it("returns true when requirement matches tag", () => {
    const order = makeOrder({ requirements: ["KOELING", "FRAGILE"] });
    expect(hasTag(order, "KOELING")).toBe(true);
  });

  it("is case-insensitive (uppercases tag)", () => {
    const order = makeOrder({ requirements: ["koeling"] });
    expect(hasTag(order, "KOELING")).toBe(true);
  });

  it("returns false when tag is absent", () => {
    const order = makeOrder({ requirements: ["FRAGILE"] });
    expect(hasTag(order, "ADR")).toBe(false);
  });

  it("returns false when requirements is null", () => {
    const order = makeOrder({ requirements: null });
    expect(hasTag(order, "ADR")).toBe(false);
  });

  it("returns false when requirements is empty", () => {
    const order = makeOrder({ requirements: [] });
    expect(hasTag(order, "KOELING")).toBe(false);
  });
});

// ─── capacityColor ───────────────────────────────────────────────────

describe("capacityColor", () => {
  it("returns destructive class for >100%", () => {
    expect(capacityColor(101)).toBe("bg-destructive");
  });

  it("returns amber class for 91-100%", () => {
    expect(capacityColor(95)).toBe("text-amber-600");
  });

  it("returns empty string for <=90%", () => {
    expect(capacityColor(90)).toBe("");
    expect(capacityColor(50)).toBe("");
  });
});

// ─── getEmptyReason ──────────────────────────────────────────────────

describe("getEmptyReason", () => {
  it("explains when all orders are already assigned", () => {
    const vehicle = makeVehicle();
    const orders = [makeOrder({ id: "o1" })];
    const assigned = new Set(["o1"]);
    expect(getEmptyReason(vehicle, orders, assigned)).toBe("Alle orders zijn al toegewezen.");
  });

  it("explains when vehicle lacks KOELING for remaining orders", () => {
    const vehicle = makeVehicle({ features: [] });
    const orders = [makeOrder({ id: "o1", requirements: ["KOELING"] })];
    const assigned = new Set<string>();
    expect(getEmptyReason(vehicle, orders, assigned)).toContain("koeling");
  });

  it("explains when vehicle lacks ADR for remaining orders", () => {
    const vehicle = makeVehicle({ features: [] });
    const orders = [makeOrder({ id: "o1", requirements: ["ADR"] })];
    const assigned = new Set<string>();
    expect(getEmptyReason(vehicle, orders, assigned)).toContain("ADR");
  });

  it("explains when no orders fit capacity", () => {
    const vehicle = makeVehicle({ capacityKg: 10 });
    const orders = [makeOrder({ id: "o1", weight_kg: 500 })];
    const assigned = new Set<string>();
    expect(getEmptyReason(vehicle, orders, assigned)).toContain("capaciteit");
  });

  it("suggests dragging when fitting orders exist", () => {
    const vehicle = makeVehicle({ capacityKg: 10000, features: ["KOELING"] });
    const orders = [makeOrder({ id: "o1", weight_kg: 100, requirements: ["KOELING"] })];
    const assigned = new Set<string>();
    expect(getEmptyReason(vehicle, orders, assigned)).toContain("sleep ze hierheen");
  });
});

// ─── findCombinableGroups ────────────────────────────────────────────

describe("findCombinableGroups", () => {
  it("groups orders going to the same city", () => {
    const orders = [
      makeOrder({ id: "o1", delivery_address: "Straat 1, Rotterdam" }),
      makeOrder({ id: "o2", delivery_address: "Weg 2, Rotterdam" }),
    ];
    const assigned = new Set<string>();
    const groups = findCombinableGroups(orders, assigned);
    expect(groups).toHaveLength(1);
    expect(groups[0].orders).toHaveLength(2);
    expect(groups[0].savings).toContain("Rotterdam");
  });

  it("does not group if only 1 order per city", () => {
    const orders = [
      makeOrder({ id: "o1", delivery_address: "Straat 1, Rotterdam" }),
      makeOrder({ id: "o2", delivery_address: "Weg 2, Amsterdam" }),
    ];
    const groups = findCombinableGroups(orders, new Set<string>());
    expect(groups).toHaveLength(0);
  });

  it("excludes already-assigned orders from groups", () => {
    const orders = [
      makeOrder({ id: "o1", delivery_address: "Straat 1, Rotterdam" }),
      makeOrder({ id: "o2", delivery_address: "Weg 2, Rotterdam" }),
    ];
    const assigned = new Set(["o1"]);
    const groups = findCombinableGroups(orders, assigned);
    expect(groups).toHaveLength(0);
  });

  it("separates orders with different requirements even if same city", () => {
    const orders = [
      makeOrder({ id: "o1", delivery_address: "Straat 1, Rotterdam", requirements: ["KOELING"] }),
      makeOrder({ id: "o2", delivery_address: "Weg 2, Rotterdam", requirements: ["ADR"] }),
    ];
    const groups = findCombinableGroups(orders, new Set<string>());
    expect(groups).toHaveLength(0);
  });
});
