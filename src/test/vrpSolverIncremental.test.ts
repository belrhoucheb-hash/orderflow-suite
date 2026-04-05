import { describe, it, expect } from "vitest";
import { incrementalSolve, scoreSolution } from "@/lib/vrpSolver";
import type { PlanOrder, Assignments } from "@/components/planning/types";
import type { FleetVehicle } from "@/hooks/useVehicles";
import type { GeoCoord } from "@/data/geoData";

// -- Test fixtures ────────────────────────────────────────────

function makeOrder(overrides: Partial<PlanOrder> & { id: string }): PlanOrder {
  return {
    order_number: 1,
    client_name: "Test Client",
    pickup_address: "Amsterdam",
    delivery_address: "Rotterdam",
    quantity: 1,
    weight_kg: 100,
    requirements: [],
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

function makeVehicle(overrides: Partial<FleetVehicle> & { id: string }): FleetVehicle {
  return {
    code: overrides.id,
    name: `Vehicle ${overrides.id}`,
    plate: "XX-000-X",
    type: "truck",
    capacityKg: 10000,
    capacityPallets: 20,
    features: [],
    ...overrides,
  };
}

function makeCoordMap(entries: Array<[string, GeoCoord]>): Map<string, GeoCoord> {
  return new Map(entries);
}

// -- incrementalSolve tests ───────────────────────────────────

describe("incrementalSolve", () => {
  it("should insert a new order into an empty assignment", () => {
    const order = makeOrder({ id: "o1", weight_kg: 500 });
    const vehicles = [makeVehicle({ id: "v1", capacityKg: 5000 })];
    const coordMap = makeCoordMap([["o1", { lat: 51.92, lng: 4.48 }]]);

    const result = incrementalSolve(order, {}, vehicles, coordMap);

    expect(result.insertedInto).toBe("v1");
    expect(result.assignments["v1"]).toHaveLength(1);
    expect(result.assignments["v1"][0].id).toBe("o1");
  });

  it("should insert into the vehicle with the lowest added distance", () => {
    const existingOrder1 = makeOrder({ id: "o1" });
    const existingOrder2 = makeOrder({ id: "o2" });
    const newOrder = makeOrder({ id: "o3", weight_kg: 100 });

    const vehicles = [
      makeVehicle({ id: "v1", capacityKg: 5000 }),
      makeVehicle({ id: "v2", capacityKg: 5000 }),
    ];

    // o1 is in Rotterdam (v1), o2 is in Groningen (v2), o3 is near Rotterdam
    const coordMap = makeCoordMap([
      ["o1", { lat: 51.92, lng: 4.48 }],   // Rotterdam
      ["o2", { lat: 53.22, lng: 6.57 }],   // Groningen
      ["o3", { lat: 51.81, lng: 4.67 }],   // Dordrecht (near Rotterdam)
    ]);

    const existing: Assignments = {
      v1: [existingOrder1],
      v2: [existingOrder2],
    };

    const result = incrementalSolve(newOrder, existing, vehicles, coordMap);

    expect(result.insertedInto).toBe("v1"); // Closer to Rotterdam
  });

  it("should respect vehicle capacity constraint", () => {
    const existingOrder = makeOrder({ id: "o1", weight_kg: 4500 });
    const newOrder = makeOrder({ id: "o2", weight_kg: 600 });

    const vehicles = [makeVehicle({ id: "v1", capacityKg: 5000 })];
    const coordMap = makeCoordMap([
      ["o1", { lat: 51.92, lng: 4.48 }],
      ["o2", { lat: 52.09, lng: 5.12 }],
    ]);

    const existing: Assignments = { v1: [existingOrder] };
    const result = incrementalSolve(newOrder, existing, vehicles, coordMap);

    // 4500 + 600 = 5100 > 5000, should not fit
    expect(result.insertedInto).toBeNull();
  });

  it("should respect vehicle feature requirements (KOELING)", () => {
    const newOrder = makeOrder({ id: "o1", weight_kg: 100, requirements: ["KOELING"] });
    const vehicles = [makeVehicle({ id: "v1", capacityKg: 5000, features: [] })];
    const coordMap = makeCoordMap([["o1", { lat: 51.92, lng: 4.48 }]]);

    const result = incrementalSolve(newOrder, {}, vehicles, coordMap);

    expect(result.insertedInto).toBeNull();
  });

  it("should respect vehicle feature requirements (ADR)", () => {
    const newOrder = makeOrder({ id: "o1", weight_kg: 100, requirements: ["ADR"] });
    const vehicles = [makeVehicle({ id: "v1", capacityKg: 5000, features: ["ADR"] })];
    const coordMap = makeCoordMap([["o1", { lat: 51.92, lng: 4.48 }]]);

    const result = incrementalSolve(newOrder, {}, vehicles, coordMap);

    expect(result.insertedInto).toBe("v1");
  });

  it("should respect time window constraints", () => {
    // Existing route already takes until ~14:00
    const existing1 = makeOrder({ id: "o1", time_window_start: "08:00", time_window_end: "10:00" });
    const existing2 = makeOrder({ id: "o2", time_window_start: "11:00", time_window_end: "13:00" });

    // New order has a tight window that conflicts
    const newOrder = makeOrder({ id: "o3", time_window_start: "07:00", time_window_end: "08:00" });

    const vehicles = [makeVehicle({ id: "v1", capacityKg: 10000 })];
    const coordMap = makeCoordMap([
      ["o1", { lat: 52.37, lng: 4.9 }],    // Amsterdam
      ["o2", { lat: 51.44, lng: 5.47 }],   // Eindhoven
      ["o3", { lat: 53.22, lng: 6.57 }],   // Groningen (far away)
    ]);

    const existing: Assignments = { v1: [existing1, existing2] };
    const result = incrementalSolve(newOrder, existing, vehicles, coordMap);

    // Groningen after Eindhoven at 13:00 + travel > 08:00 window end
    expect(result.insertedInto).toBeNull();
  });

  it("should not mutate the original assignments object", () => {
    const order = makeOrder({ id: "o1", weight_kg: 100 });
    const vehicles = [makeVehicle({ id: "v1", capacityKg: 5000 })];
    const coordMap = makeCoordMap([["o1", { lat: 51.92, lng: 4.48 }]]);

    const original: Assignments = {};
    const result = incrementalSolve(order, original, vehicles, coordMap);

    expect(Object.keys(original)).toHaveLength(0);
    expect(result.assignments["v1"]).toBeDefined();
  });

  it("should handle is_weight_per_unit correctly", () => {
    const newOrder = makeOrder({
      id: "o1",
      weight_kg: 100,
      quantity: 50,
      is_weight_per_unit: true,
    });
    // Total weight = 100 * 50 = 5000, which equals capacity exactly
    const vehicles = [makeVehicle({ id: "v1", capacityKg: 5000, capacityPallets: 50 })];
    const coordMap = makeCoordMap([["o1", { lat: 51.92, lng: 4.48 }]]);

    const result = incrementalSolve(newOrder, {}, vehicles, coordMap);

    expect(result.insertedInto).toBe("v1");
  });
});

// -- scoreSolution tests ──────────────────────────────────────

describe("scoreSolution", () => {
  it("should return a score between 0 and 100", () => {
    const order = makeOrder({ id: "o1", weight_kg: 500 });
    const vehicles = [makeVehicle({ id: "v1", capacityKg: 5000 })];
    const assignments: Assignments = { v1: [order] };
    const coordMap = makeCoordMap([["o1", { lat: 51.92, lng: 4.48 }]]);

    const score = scoreSolution(assignments, vehicles, coordMap);

    expect(score.score).toBeGreaterThanOrEqual(0);
    expect(score.score).toBeLessThanOrEqual(100);
  });

  it("should report utilization percentage correctly", () => {
    const order = makeOrder({ id: "o1", weight_kg: 2500 });
    const vehicles = [makeVehicle({ id: "v1", capacityKg: 5000 })];
    const assignments: Assignments = { v1: [order] };
    const coordMap = makeCoordMap([["o1", { lat: 51.92, lng: 4.48 }]]);

    const score = scoreSolution(assignments, vehicles, coordMap);

    expect(score.utilization_pct).toBeCloseTo(50, 0);
  });

  it("should return zero utilization for empty assignments", () => {
    const vehicles = [makeVehicle({ id: "v1", capacityKg: 5000 })];
    const assignments: Assignments = {};
    const coordMap = makeCoordMap([]);

    const score = scoreSolution(assignments, vehicles, coordMap);

    expect(score.utilization_pct).toBe(0);
    expect(score.score).toBe(0);
  });

  it("should compute efficiency_ratio between 0 and 1", () => {
    const o1 = makeOrder({ id: "o1", weight_kg: 500 });
    const o2 = makeOrder({ id: "o2", weight_kg: 500 });
    const vehicles = [makeVehicle({ id: "v1", capacityKg: 5000 })];
    const assignments: Assignments = { v1: [o1, o2] };
    const coordMap = makeCoordMap([
      ["o1", { lat: 51.92, lng: 4.48 }],  // Rotterdam
      ["o2", { lat: 52.37, lng: 4.9 }],   // Amsterdam
    ]);

    const score = scoreSolution(assignments, vehicles, coordMap);

    expect(score.efficiency_ratio).toBeGreaterThan(0);
    expect(score.efficiency_ratio).toBeLessThanOrEqual(1);
  });
});
