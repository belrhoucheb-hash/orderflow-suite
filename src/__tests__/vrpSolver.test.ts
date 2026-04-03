import { describe, it, expect, vi } from "vitest";

// ─── Mock dependencies ────────────────────────────────────────────────

vi.mock("@/components/planning/planningUtils", () => ({
  getTotalWeight: vi.fn((order: any) => {
    if (!order.weight_kg) return 0;
    if (order.is_weight_per_unit && order.quantity) return order.weight_kg * order.quantity;
    return order.weight_kg;
  }),
  hasTag: vi.fn((order: any, tag: string) => {
    return order.requirements?.some((r: string) => r.toUpperCase().includes(tag)) ?? false;
  }),
  optimizeRoute: vi.fn((orders: any[]) => orders),
}));

vi.mock("@/data/geoData", () => ({
  haversineKm: vi.fn((a: any, b: any) => {
    // Simple Euclidean approximation for testing
    const dLat = b.lat - a.lat;
    const dLng = b.lng - a.lng;
    return Math.sqrt(dLat * dLat + dLng * dLng) * 111;
  }),
}));

vi.mock("@/components/planning/types", () => ({
  WAREHOUSE: { lat: 52.3, lng: 4.76 },
  AVG_SPEED_KMH: 60,
  UNLOAD_MINUTES: 30,
  MAX_DRIVE_MINUTES: 540,
  DISTANCE_WARN_KM: 150,
}));

import { solveVRP } from "@/lib/vrpSolver";
import { optimizeRoute } from "@/components/planning/planningUtils";
import type { FleetVehicle } from "@/hooks/useVehicles";

// ─── Helpers ──────────────────────────────────────────────────────────

function makeVehicle(overrides: Partial<FleetVehicle> = {}): FleetVehicle {
  return {
    id: "v1",
    code: "V01",
    name: "Truck 1",
    plate: "NL-01-AB",
    type: "Standard",
    capacityKg: 10000,
    capacityPallets: 20,
    features: [],
    ...overrides,
  };
}

function makeOrder(overrides: Partial<any> = {}): any {
  return {
    id: "o1",
    order_number: 1,
    client_name: "Client A",
    pickup_address: "Warehouse",
    delivery_address: "Amsterdam, NL",
    quantity: 2,
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

function makeCoordMap(entries: [string, { lat: number; lng: number }][]): Map<string, { lat: number; lng: number }> {
  return new Map(entries);
}

// ─── Tests ────────────────────────────────────────────────────────────

describe("solveVRP", () => {
  it("assigns a single order to a single vehicle", () => {
    const vehicles = [makeVehicle()];
    const orders = [makeOrder()];
    const coordMap = makeCoordMap([["o1", { lat: 52.37, lng: 4.9 }]]);

    const result = solveVRP(orders, vehicles, coordMap);

    expect(result["v1"]).toBeDefined();
    expect(result["v1"]).toHaveLength(1);
    expect(result["v1"][0].id).toBe("o1");
  });

  it("returns empty assignments when no orders are provided", () => {
    const vehicles = [makeVehicle()];
    const result = solveVRP([], vehicles, makeCoordMap([]));

    expect(Object.keys(result)).toHaveLength(0);
  });

  it("returns existing assignments when no orders are provided", () => {
    const vehicles = [makeVehicle()];
    const existing = { v1: [makeOrder()] };
    const result = solveVRP([], vehicles, makeCoordMap([]), existing);

    expect(result["v1"]).toHaveLength(1);
  });

  it("respects weight capacity constraints", () => {
    const vehicles = [makeVehicle({ capacityKg: 400 })];
    const orders = [makeOrder({ id: "o1", weight_kg: 500 })];
    const coordMap = makeCoordMap([["o1", { lat: 52.37, lng: 4.9 }]]);

    const result = solveVRP(orders, vehicles, coordMap);

    // Order is too heavy for the vehicle
    expect(result["v1"]).toBeUndefined();
  });

  it("respects pallet capacity constraints", () => {
    const vehicles = [makeVehicle({ capacityPallets: 1 })];
    const orders = [makeOrder({ id: "o1", quantity: 5 })];
    const coordMap = makeCoordMap([["o1", { lat: 52.37, lng: 4.9 }]]);

    const result = solveVRP(orders, vehicles, coordMap);

    expect(result["v1"]).toBeUndefined();
  });

  it("respects KOELING requirement", () => {
    const vehicles = [makeVehicle({ features: [] })];
    const orders = [makeOrder({ id: "o1", requirements: ["KOELING"] })];
    const coordMap = makeCoordMap([["o1", { lat: 52.37, lng: 4.9 }]]);

    const result = solveVRP(orders, vehicles, coordMap);

    expect(result["v1"]).toBeUndefined();
  });

  it("assigns KOELING order to vehicle with KOELING feature", () => {
    const vehicles = [makeVehicle({ features: ["KOELING"] })];
    const orders = [makeOrder({ id: "o1", requirements: ["KOELING"] })];
    const coordMap = makeCoordMap([["o1", { lat: 52.37, lng: 4.9 }]]);

    const result = solveVRP(orders, vehicles, coordMap);

    expect(result["v1"]).toHaveLength(1);
  });

  it("respects ADR requirement", () => {
    const vehicles = [makeVehicle({ features: [] })];
    const orders = [makeOrder({ id: "o1", requirements: ["ADR"] })];
    const coordMap = makeCoordMap([["o1", { lat: 52.37, lng: 4.9 }]]);

    const result = solveVRP(orders, vehicles, coordMap);

    expect(result["v1"]).toBeUndefined();
  });

  it("assigns ADR order to vehicle with ADR feature", () => {
    const vehicles = [makeVehicle({ features: ["ADR"] })];
    const orders = [makeOrder({ id: "o1", requirements: ["ADR"] })];
    const coordMap = makeCoordMap([["o1", { lat: 52.37, lng: 4.9 }]]);

    const result = solveVRP(orders, vehicles, coordMap);

    expect(result["v1"]).toHaveLength(1);
  });

  it("assigns multiple orders to the same vehicle when capacity allows", () => {
    const vehicles = [makeVehicle({ capacityKg: 10000, capacityPallets: 20 })];
    const orders = [
      makeOrder({ id: "o1", weight_kg: 200, quantity: 2 }),
      makeOrder({ id: "o2", weight_kg: 300, quantity: 3 }),
    ];
    const coordMap = makeCoordMap([
      ["o1", { lat: 52.37, lng: 4.9 }],
      ["o2", { lat: 52.38, lng: 4.91 }],
    ]);

    const result = solveVRP(orders, vehicles, coordMap);

    expect(result["v1"]).toHaveLength(2);
  });

  it("distributes orders across vehicles when one is full", () => {
    const vehicles = [
      makeVehicle({ id: "v1", capacityKg: 600, capacityPallets: 20 }),
      makeVehicle({ id: "v2", capacityKg: 600, capacityPallets: 20 }),
    ];
    const orders = [
      makeOrder({ id: "o1", weight_kg: 500, quantity: 1 }),
      makeOrder({ id: "o2", weight_kg: 500, quantity: 1 }),
    ];
    const coordMap = makeCoordMap([
      ["o1", { lat: 52.37, lng: 4.9 }],
      ["o2", { lat: 52.38, lng: 4.91 }],
    ]);

    const result = solveVRP(orders, vehicles, coordMap);

    // Each vehicle should get one order since 500 + 500 > 600
    const totalAssigned =
      (result["v1"]?.length || 0) + (result["v2"]?.length || 0);
    expect(totalAssigned).toBe(2);
  });

  it("preserves existing assignments", () => {
    const existingOrder = makeOrder({ id: "existing" });
    const existing = { v1: [existingOrder] };
    const vehicles = [makeVehicle({ capacityKg: 10000 })];
    const newOrders = [makeOrder({ id: "o1", weight_kg: 200 })];
    const coordMap = makeCoordMap([
      ["existing", { lat: 52.37, lng: 4.9 }],
      ["o1", { lat: 52.38, lng: 4.91 }],
    ]);

    const result = solveVRP(newOrders, vehicles, coordMap, existing);

    expect(result["v1"]).toBeDefined();
    expect(result["v1"].some((o: any) => o.id === "existing")).toBe(true);
    expect(result["v1"].some((o: any) => o.id === "o1")).toBe(true);
  });

  it("does not assign duplicate orders", () => {
    const vehicles = [makeVehicle()];
    const orders = [makeOrder({ id: "o1" }), makeOrder({ id: "o1" })];
    const coordMap = makeCoordMap([["o1", { lat: 52.37, lng: 4.9 }]]);

    const result = solveVRP(orders, vehicles, coordMap);

    expect(result["v1"]).toHaveLength(1);
  });

  it("sorts orders by time window urgency (tighter windows first)", () => {
    const vehicles = [makeVehicle({ capacityKg: 10000, capacityPallets: 20 })];
    const orders = [
      makeOrder({
        id: "o-wide",
        weight_kg: 100,
        time_window_start: "06:00",
        time_window_end: "18:00",
      }),
      makeOrder({
        id: "o-tight",
        weight_kg: 100,
        time_window_start: "10:00",
        time_window_end: "11:00",
      }),
    ];
    const coordMap = makeCoordMap([
      ["o-wide", { lat: 52.37, lng: 4.9 }],
      ["o-tight", { lat: 52.38, lng: 4.91 }],
    ]);

    const result = solveVRP(orders, vehicles, coordMap);

    // Both should be assigned
    expect(result["v1"]).toHaveLength(2);
  });

  it("prefers closer vehicles based on distance heuristic", () => {
    const vehicles = [
      makeVehicle({ id: "v-far", capacityKg: 10000, capacityPallets: 20 }),
      makeVehicle({ id: "v-near", capacityKg: 10000, capacityPallets: 20 }),
    ];
    // Both vehicles have existing orders - v-near's order is closer to the new order
    const farOrder = makeOrder({ id: "o-far-existing" });
    const nearOrder = makeOrder({ id: "o-near-existing" });
    const existing = {
      "v-far": [farOrder],
      "v-near": [nearOrder],
    };
    // New order near Amsterdam
    const orders = [makeOrder({ id: "o-new", weight_kg: 100 })];
    const coordMap = makeCoordMap([
      ["o-far-existing", { lat: 50.0, lng: 3.0 }],    // far away (Belgium)
      ["o-near-existing", { lat: 52.37, lng: 4.9 }],   // Amsterdam
      ["o-new", { lat: 52.38, lng: 4.91 }],             // near Amsterdam
    ]);

    const result = solveVRP(orders, vehicles, coordMap, existing);

    // Should prefer v-near because its existing order is closer to o-new
    expect(result["v-near"]).toBeDefined();
    expect(result["v-near"].some((o: any) => o.id === "o-new")).toBe(true);
  });

  it("handles orders without coordinates in coordMap", () => {
    const vehicles = [makeVehicle()];
    const orders = [makeOrder({ id: "o1" })];
    // Empty coord map - no coordinates for the order
    const coordMap = makeCoordMap([]);

    const result = solveVRP(orders, vehicles, coordMap);

    // Should still assign since distance defaults to 0
    expect(result["v1"]).toHaveLength(1);
  });

  it("handles time window that makes order infeasible", () => {
    const vehicles = [makeVehicle()];
    // Order with a time window that has already passed (very early)
    const orders = [
      makeOrder({
        id: "o1",
        time_window_end: "00:01",
      }),
    ];
    const coordMap = makeCoordMap([["o1", { lat: 52.37, lng: 4.9 }]]);

    const result = solveVRP(orders, vehicles, coordMap);

    // Default start is 06:00, so 00:01 is infeasible
    expect(result["v1"]).toBeUndefined();
  });

  it("handles orders with only time_window_end (no start)", () => {
    const vehicles = [makeVehicle()];
    const orders = [
      makeOrder({ id: "o1", time_window_end: "23:59" }),
    ];
    const coordMap = makeCoordMap([["o1", { lat: 52.37, lng: 4.9 }]]);

    const result = solveVRP(orders, vehicles, coordMap);

    expect(result["v1"]).toHaveLength(1);
  });

  it("handles orders with only time_window_start (no end)", () => {
    const vehicles = [makeVehicle()];
    const orders = [
      makeOrder({ id: "o1", time_window_start: "08:00" }),
    ];
    const coordMap = makeCoordMap([["o1", { lat: 52.37, lng: 4.9 }]]);

    const result = solveVRP(orders, vehicles, coordMap);

    // No time_window_end means always feasible
    expect(result["v1"]).toHaveLength(1);
  });

  it("handles zero weight orders", () => {
    const vehicles = [makeVehicle({ capacityKg: 100 })];
    const orders = [makeOrder({ id: "o1", weight_kg: 0, quantity: 0 })];
    const coordMap = makeCoordMap([["o1", { lat: 52.37, lng: 4.9 }]]);

    const result = solveVRP(orders, vehicles, coordMap);

    expect(result["v1"]).toHaveLength(1);
  });

  it("handles null weight orders", () => {
    const vehicles = [makeVehicle({ capacityKg: 100 })];
    const orders = [makeOrder({ id: "o1", weight_kg: null, quantity: null })];
    const coordMap = makeCoordMap([["o1", { lat: 52.37, lng: 4.9 }]]);

    const result = solveVRP(orders, vehicles, coordMap);

    expect(result["v1"]).toHaveLength(1);
  });

  it("handles is_weight_per_unit calculation", () => {
    const vehicles = [makeVehicle({ capacityKg: 500 })];
    // 100kg * 10 units = 1000kg, exceeds 500kg capacity
    const orders = [
      makeOrder({ id: "o1", weight_kg: 100, quantity: 10, is_weight_per_unit: true }),
    ];
    const coordMap = makeCoordMap([["o1", { lat: 52.37, lng: 4.9 }]]);

    const result = solveVRP(orders, vehicles, coordMap);

    expect(result["v1"]).toBeUndefined();
  });

  it("accumulates weight across multiple assigned orders", () => {
    const vehicles = [makeVehicle({ id: "v1", capacityKg: 900 })];
    const orders = [
      makeOrder({ id: "o1", weight_kg: 400 }),
      makeOrder({ id: "o2", weight_kg: 400 }),
      makeOrder({ id: "o3", weight_kg: 400 }),
    ];
    const coordMap = makeCoordMap([
      ["o1", { lat: 52.37, lng: 4.9 }],
      ["o2", { lat: 52.38, lng: 4.91 }],
      ["o3", { lat: 52.39, lng: 4.92 }],
    ]);

    const result = solveVRP(orders, vehicles, coordMap);

    // Only 2 fit: 400 + 400 = 800 <= 900, 800 + 400 = 1200 > 900
    expect(result["v1"]).toHaveLength(2);
  });

  it("accumulates pallets across multiple assigned orders", () => {
    const vehicles = [makeVehicle({ id: "v1", capacityPallets: 5 })];
    const orders = [
      makeOrder({ id: "o1", weight_kg: 10, quantity: 3 }),
      makeOrder({ id: "o2", weight_kg: 10, quantity: 3 }),
    ];
    const coordMap = makeCoordMap([
      ["o1", { lat: 52.37, lng: 4.9 }],
      ["o2", { lat: 52.38, lng: 4.91 }],
    ]);

    const result = solveVRP(orders, vehicles, coordMap);

    // 3 + 3 = 6 > 5, so only 1 fits
    expect(result["v1"]).toHaveLength(1);
  });

  it("sorts by delivery address as tiebreaker", () => {
    const vehicles = [makeVehicle({ capacityKg: 10000, capacityPallets: 20 })];
    const orders = [
      makeOrder({ id: "o-z", delivery_address: "Zwolle" }),
      makeOrder({ id: "o-a", delivery_address: "Amsterdam" }),
    ];
    const coordMap = makeCoordMap([
      ["o-z", { lat: 52.52, lng: 6.09 }],
      ["o-a", { lat: 52.37, lng: 4.9 }],
    ]);

    const result = solveVRP(orders, vehicles, coordMap);

    expect(result["v1"]).toHaveLength(2);
  });

  it("handles empty vehicles array", () => {
    const orders = [makeOrder()];
    const coordMap = makeCoordMap([["o1", { lat: 52.37, lng: 4.9 }]]);

    const result = solveVRP(orders, [], coordMap);

    // No vehicles, no assignments
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("handles null delivery_address in sorting", () => {
    const vehicles = [makeVehicle()];
    const orders = [
      makeOrder({ id: "o1", delivery_address: null }),
      makeOrder({ id: "o2", delivery_address: "Amsterdam" }),
    ];
    const coordMap = makeCoordMap([
      ["o1", { lat: 52.37, lng: 4.9 }],
      ["o2", { lat: 52.38, lng: 4.91 }],
    ]);

    const result = solveVRP(orders, vehicles, coordMap);

    expect(result["v1"]).toHaveLength(2);
  });

  it("handles time_window_start waiting behavior", () => {
    const vehicles = [makeVehicle()];
    // First order has window starting at 12:00, second at 14:00
    const orders = [
      makeOrder({
        id: "o1",
        time_window_start: "12:00",
        time_window_end: "14:00",
      }),
      makeOrder({
        id: "o2",
        time_window_start: "14:00",
        time_window_end: "23:59",
      }),
    ];
    const coordMap = makeCoordMap([
      ["o1", { lat: 52.37, lng: 4.9 }],
      ["o2", { lat: 52.38, lng: 4.91 }],
    ]);

    const result = solveVRP(orders, vehicles, coordMap);

    expect(result["v1"]).toBeDefined();
  });

  it("post-processes routes with optimizeRoute for multi-stop routes", () => {
    (optimizeRoute as any).mockClear();
    const vehicles = [makeVehicle()];
    const orders = [
      makeOrder({ id: "o1", weight_kg: 100 }),
      makeOrder({ id: "o2", weight_kg: 100 }),
    ];
    const coordMap = makeCoordMap([
      ["o1", { lat: 52.37, lng: 4.9 }],
      ["o2", { lat: 52.38, lng: 4.91 }],
    ]);

    solveVRP(orders, vehicles, coordMap);

    expect(optimizeRoute).toHaveBeenCalled();
  });

  it("does not call optimizeRoute for single-stop routes", () => {
    (optimizeRoute as any).mockClear();

    const vehicles = [makeVehicle()];
    const orders = [makeOrder({ id: "o1" })];
    const coordMap = makeCoordMap([["o1", { lat: 52.37, lng: 4.9 }]]);

    solveVRP(orders, vehicles, coordMap);

    expect(optimizeRoute).not.toHaveBeenCalled();
  });

  it("handles existing assignments that already consume capacity", () => {
    const existingOrder = makeOrder({ id: "existing", weight_kg: 800 });
    const existing = { v1: [existingOrder] };
    const vehicles = [makeVehicle({ capacityKg: 1000 })];
    // New order: 300kg, total would be 1100 > 1000
    const orders = [makeOrder({ id: "o-new", weight_kg: 300 })];
    const coordMap = makeCoordMap([["o-new", { lat: 52.37, lng: 4.9 }]]);

    const result = solveVRP(orders, vehicles, coordMap, existing);

    // Should not add because 800 + 300 > 1000
    expect(result["v1"]).toHaveLength(1);
    expect(result["v1"][0].id).toBe("existing");
  });
});
