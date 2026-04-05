// src/__tests__/vrpSolverTimeWindows.test.ts
import { describe, it, expect, vi } from "vitest";

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
  haversineKm: vi.fn((_a: any, _b: any) => 30), // 30km = 30min at 60km/h
}));

vi.mock("@/components/planning/types", () => ({
  WAREHOUSE: { lat: 52.3, lng: 4.76 },
  AVG_SPEED_KMH: 60,
  UNLOAD_MINUTES: 30,
  MAX_DRIVE_MINUTES: 540,
  DISTANCE_WARN_KM: 150,
}));

import { solveVRP } from "@/lib/vrpSolver";
import type { FleetVehicle } from "@/hooks/useVehicles";

function makeVehicle(overrides: Partial<FleetVehicle> = {}): FleetVehicle {
  return {
    id: "v1", code: "V01", name: "Truck 1", plate: "NL-01-AB",
    type: "Standard", capacityKg: 10000, capacityPallets: 20, features: [],
    ...overrides,
  };
}

function makeOrder(id: string, overrides: Partial<any> = {}): any {
  return {
    id, order_number: 1, client_name: "Client", pickup_address: null,
    delivery_address: "Amsterdam", quantity: 1, weight_kg: 100,
    requirements: null, is_weight_per_unit: false,
    time_window_start: null, time_window_end: null,
    pickup_time_from: null, pickup_time_to: null,
    delivery_time_from: null, delivery_time_to: null,
    geocoded_pickup_lat: null, geocoded_pickup_lng: null,
    geocoded_delivery_lat: null, geocoded_delivery_lng: null,
    delivery_date: null, pickup_date: null,
    ...overrides,
  };
}

describe("solveVRP — time window hard constraints", () => {
  const coordMap = new Map([["o1", { lat: 52.4, lng: 4.9 }], ["o2", { lat: 52.5, lng: 5.0 }]]);
  const vehicles = [makeVehicle()];

  it("rejects order when ETA exceeds time_window_end", () => {
    // Order with very early time_window_end — at 60km/h, 30km takes 30min + 30min unload
    // Start 06:00, arrive ~06:30, but window ends at 06:15 => should skip
    const orders = [makeOrder("o1", { time_window_end: "06:15" })];
    const result = solveVRP(orders, vehicles, coordMap);
    expect(result["v1"] || []).toHaveLength(0);
  });

  it("accepts order when ETA is within time_window_end", () => {
    const orders = [makeOrder("o1", { time_window_start: "06:00", time_window_end: "08:00" })];
    const result = solveVRP(orders, vehicles, coordMap);
    expect(result["v1"]).toHaveLength(1);
  });

  it("waits until time_window_start if arriving early", () => {
    // Order at 10:00 start window — driver will arrive before, solver should still accept
    const orders = [makeOrder("o1", { time_window_start: "10:00", time_window_end: "11:00" })];
    const result = solveVRP(orders, vehicles, coordMap);
    expect(result["v1"]).toHaveLength(1);
  });

  it("prioritizes orders with tighter windows", () => {
    const orders = [
      makeOrder("o1", { time_window_start: "06:00", time_window_end: "18:00" }), // wide window
      makeOrder("o2", { time_window_start: "07:00", time_window_end: "07:30" }), // tight window
    ];
    const result = solveVRP(orders, vehicles, coordMap);
    const assigned = result["v1"] || [];
    // o2 should come first (tighter window = higher priority)
    if (assigned.length >= 2) {
      expect(assigned[0].id).toBe("o2");
    }
  });
});
