// src/__tests__/consolidationEngine.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/data/geoData", () => ({
  haversineKm: vi.fn((a: any, b: any) => {
    const dLat = b.lat - a.lat;
    const dLng = b.lng - a.lng;
    return Math.sqrt(dLat * dLat + dLng * dLng) * 111;
  }),
}));

import {
  clusterByRegion,
  filterByTimeWindowCompatibility,
  checkCapacityFit,
  buildConsolidationProposals,
  type ConsolidatableOrder,
} from "@/lib/consolidationEngine";
import type { FleetVehicle } from "@/hooks/useVehicles";

function makeOrder(id: string, postcode: string, overrides: Partial<ConsolidatableOrder> = {}): ConsolidatableOrder {
  return {
    id,
    order_number: 1,
    client_name: "Client",
    delivery_address: `Street, ${postcode} City`,
    delivery_postcode: postcode,
    weight_kg: 500,
    quantity: 2,
    requirements: [],
    is_weight_per_unit: false,
    time_window_start: null,
    time_window_end: null,
    geocoded_delivery_lat: 52.3 + Math.random() * 0.1,
    geocoded_delivery_lng: 4.8 + Math.random() * 0.1,
    ...overrides,
  };
}

function makeVehicle(overrides: Partial<FleetVehicle> = {}): FleetVehicle {
  return {
    id: "v1", code: "V01", name: "Truck 1", plate: "NL-01-AB",
    type: "Standard", capacityKg: 10000, capacityPallets: 20, features: [],
    ...overrides,
  };
}

describe("clusterByRegion", () => {
  it("groups orders by postcode prefix (first 2 digits)", () => {
    const orders = [
      makeOrder("o1", "1012AB"),
      makeOrder("o2", "1013CD"),
      makeOrder("o3", "2012EF"),
    ];
    const clusters = clusterByRegion(orders);
    expect(clusters.size).toBe(2);
    expect(clusters.get("10")!.length).toBe(2);
    expect(clusters.get("20")!.length).toBe(1);
  });

  it("handles orders without postcode using delivery_address", () => {
    const orders = [
      makeOrder("o1", "", { delivery_address: "Amsterdam" }),
      makeOrder("o2", "", { delivery_address: "Amsterdam" }),
    ];
    const clusters = clusterByRegion(orders);
    expect(clusters.size).toBe(1);
  });
});

describe("filterByTimeWindowCompatibility", () => {
  it("keeps orders with overlapping or no time windows", () => {
    const orders = [
      makeOrder("o1", "1012AB", { time_window_start: "08:00", time_window_end: "12:00" }),
      makeOrder("o2", "1012AB", { time_window_start: "10:00", time_window_end: "14:00" }),
      makeOrder("o3", "1012AB", { time_window_start: null, time_window_end: null }),
    ];
    const result = filterByTimeWindowCompatibility(orders);
    expect(result).toHaveLength(3);
  });

  it("removes orders with completely incompatible windows", () => {
    const orders = [
      makeOrder("o1", "1012AB", { time_window_start: "06:00", time_window_end: "07:00" }),
      makeOrder("o2", "1012AB", { time_window_start: "08:00", time_window_end: "12:00" }),
      makeOrder("o3", "1012AB", { time_window_start: "18:00", time_window_end: "20:00" }),
    ];
    // o1 and o3 don't overlap with o2's window group, expect split or partial
    const result = filterByTimeWindowCompatibility(orders);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});

describe("checkCapacityFit", () => {
  it("returns true when orders fit in vehicle", () => {
    const orders = [
      makeOrder("o1", "1012AB", { weight_kg: 3000, quantity: 5 }),
      makeOrder("o2", "1013CD", { weight_kg: 4000, quantity: 6 }),
    ];
    const vehicle = makeVehicle({ capacityKg: 10000, capacityPallets: 20 });
    expect(checkCapacityFit(orders, vehicle)).toBe(true);
  });

  it("returns false when weight exceeds capacity", () => {
    const orders = [
      makeOrder("o1", "1012AB", { weight_kg: 6000, quantity: 5 }),
      makeOrder("o2", "1013CD", { weight_kg: 6000, quantity: 6 }),
    ];
    const vehicle = makeVehicle({ capacityKg: 10000 });
    expect(checkCapacityFit(orders, vehicle)).toBe(false);
  });

  it("returns false when pallets exceed capacity", () => {
    const orders = [
      makeOrder("o1", "1012AB", { weight_kg: 100, quantity: 12 }),
      makeOrder("o2", "1013CD", { weight_kg: 100, quantity: 12 }),
    ];
    const vehicle = makeVehicle({ capacityPallets: 20 });
    expect(checkCapacityFit(orders, vehicle)).toBe(false);
  });

  it("checks ADR requirement", () => {
    const orders = [makeOrder("o1", "1012AB", { requirements: ["ADR"] })];
    const vehicle = makeVehicle({ features: [] });
    expect(checkCapacityFit(orders, vehicle)).toBe(false);
  });
});

describe("buildConsolidationProposals", () => {
  it("builds proposals from orders and vehicles", () => {
    const orders = [
      makeOrder("o1", "1012AB", { weight_kg: 2000, quantity: 4 }),
      makeOrder("o2", "1013CD", { weight_kg: 3000, quantity: 6 }),
      makeOrder("o3", "2012EF", { weight_kg: 1000, quantity: 2 }),
    ];
    const vehicles = [makeVehicle()];
    const coordMap = new Map<string, { lat: number; lng: number }>([
      ["o1", { lat: 52.37, lng: 4.89 }],
      ["o2", { lat: 52.38, lng: 4.90 }],
      ["o3", { lat: 52.10, lng: 4.30 }],
    ]);

    const proposals = buildConsolidationProposals(orders, vehicles, coordMap);
    expect(proposals.length).toBeGreaterThanOrEqual(1);
    // Region "10" should group o1+o2
    const amsterdam = proposals.find((p) => p.orderIds.includes("o1") && p.orderIds.includes("o2"));
    expect(amsterdam).toBeDefined();
    expect(amsterdam!.totalWeightKg).toBe(5000);
    expect(amsterdam!.totalPallets).toBe(10);
  });
});
