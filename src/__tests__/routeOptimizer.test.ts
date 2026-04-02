import { describe, it, expect } from "vitest";
import {
  optimizeRoute,
  twoOptImprove,
  computeTotalDistanceKm,
} from "@/lib/routeOptimizer";
import { haversineKm, type GeoCoord } from "@/data/geoData";
import type { PlanOrder } from "@/components/planning/types";

// ─── Helper: create a minimal PlanOrder ──────────────────────────────
function makePlanOrder(id: string): PlanOrder {
  return {
    id,
    order_number: parseInt(id, 10) || 0,
    client_name: `Client ${id}`,
    pickup_address: null,
    delivery_address: null,
    quantity: null,
    weight_kg: null,
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
  };
}

// ─── Known Dutch city coordinates ────────────────────────────────────
const AMSTERDAM: GeoCoord = { lat: 52.37, lng: 4.9 };
const ROTTERDAM: GeoCoord = { lat: 51.92, lng: 4.48 };
const UTRECHT: GeoCoord = { lat: 52.09, lng: 5.12 };
const EINDHOVEN: GeoCoord = { lat: 51.44, lng: 5.47 };
const GRONINGEN: GeoCoord = { lat: 53.22, lng: 6.57 };

describe("optimizeRoute", () => {
  it("returns empty array for 0 orders", () => {
    const coordMap = new Map<string, GeoCoord>();
    const result = optimizeRoute([], coordMap);
    expect(result).toEqual([]);
  });

  it("returns the single order for 1 order", () => {
    const order = makePlanOrder("1");
    const coordMap = new Map<string, GeoCoord>([["1", AMSTERDAM]]);
    const result = optimizeRoute([order], coordMap);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("returns both orders for 2 orders", () => {
    const orders = [makePlanOrder("1"), makePlanOrder("2")];
    const coordMap = new Map<string, GeoCoord>([
      ["1", AMSTERDAM],
      ["2", ROTTERDAM],
    ]);
    const result = optimizeRoute(orders, coordMap);
    expect(result).toHaveLength(2);
    const ids = result.map((o) => o.id).sort();
    expect(ids).toEqual(["1", "2"]);
  });

  it("optimizes a 5-order route and includes all orders", () => {
    const orders = [
      makePlanOrder("1"),
      makePlanOrder("2"),
      makePlanOrder("3"),
      makePlanOrder("4"),
      makePlanOrder("5"),
    ];
    const coordMap = new Map<string, GeoCoord>([
      ["1", AMSTERDAM],
      ["2", ROTTERDAM],
      ["3", UTRECHT],
      ["4", EINDHOVEN],
      ["5", GRONINGEN],
    ]);

    const result = optimizeRoute(orders, coordMap);
    expect(result).toHaveLength(5);

    // All orders must be present
    const resultIds = result.map((o) => o.id).sort();
    expect(resultIds).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("produces a route no longer than a naive input order", () => {
    // Deliberately bad ordering: Groningen, Eindhoven, Amsterdam, Rotterdam, Utrecht
    const orders = [
      makePlanOrder("5"),
      makePlanOrder("4"),
      makePlanOrder("1"),
      makePlanOrder("2"),
      makePlanOrder("3"),
    ];
    const coordMap = new Map<string, GeoCoord>([
      ["1", AMSTERDAM],
      ["2", ROTTERDAM],
      ["3", UTRECHT],
      ["4", EINDHOVEN],
      ["5", GRONINGEN],
    ]);

    const naiveDistance = computeTotalDistanceKm(orders, coordMap);
    const optimized = optimizeRoute(orders, coordMap);
    const optimizedDistance = computeTotalDistanceKm(optimized, coordMap);

    expect(optimizedDistance).toBeLessThanOrEqual(naiveDistance);
  });
});

describe("twoOptImprove", () => {
  it("returns the same route for 0 orders", () => {
    const coordMap = new Map<string, GeoCoord>();
    const result = twoOptImprove([], coordMap);
    expect(result).toEqual([]);
  });

  it("returns the same route for 1 order", () => {
    const order = makePlanOrder("1");
    const coordMap = new Map<string, GeoCoord>([["1", AMSTERDAM]]);
    const result = twoOptImprove([order], coordMap);
    expect(result).toHaveLength(1);
  });

  it("returns the same route for 2 orders (no improvement possible)", () => {
    const orders = [makePlanOrder("1"), makePlanOrder("2")];
    const coordMap = new Map<string, GeoCoord>([
      ["1", AMSTERDAM],
      ["2", ROTTERDAM],
    ]);
    const result = twoOptImprove(orders, coordMap);
    expect(result).toHaveLength(2);
  });

  it("does not increase total distance", () => {
    const orders = [
      makePlanOrder("5"),
      makePlanOrder("4"),
      makePlanOrder("1"),
      makePlanOrder("2"),
      makePlanOrder("3"),
    ];
    const coordMap = new Map<string, GeoCoord>([
      ["1", AMSTERDAM],
      ["2", ROTTERDAM],
      ["3", UTRECHT],
      ["4", EINDHOVEN],
      ["5", GRONINGEN],
    ]);

    const originalDistance = computeTotalDistanceKm(orders, coordMap);
    const improved = twoOptImprove(orders, coordMap);
    const improvedDistance = computeTotalDistanceKm(improved, coordMap);

    expect(improvedDistance).toBeLessThanOrEqual(originalDistance + 0.01);
  });

  it("preserves all orders after improvement", () => {
    const orders = [
      makePlanOrder("1"),
      makePlanOrder("2"),
      makePlanOrder("3"),
      makePlanOrder("4"),
    ];
    const coordMap = new Map<string, GeoCoord>([
      ["1", AMSTERDAM],
      ["2", EINDHOVEN],
      ["3", GRONINGEN],
      ["4", ROTTERDAM],
    ]);

    const improved = twoOptImprove(orders, coordMap);
    const ids = improved.map((o) => o.id).sort();
    expect(ids).toEqual(["1", "2", "3", "4"]);
  });
});

describe("haversineKm (via geoData)", () => {
  it("Amsterdam to Rotterdam is approximately 57-62 km", () => {
    const dist = haversineKm(AMSTERDAM, ROTTERDAM);
    expect(dist).toBeGreaterThan(50);
    expect(dist).toBeLessThan(70);
  });

  it("same point returns 0", () => {
    const dist = haversineKm(AMSTERDAM, AMSTERDAM);
    expect(dist).toBe(0);
  });

  it("is symmetric (A->B == B->A)", () => {
    const ab = haversineKm(AMSTERDAM, EINDHOVEN);
    const ba = haversineKm(EINDHOVEN, AMSTERDAM);
    expect(ab).toBeCloseTo(ba, 10);
  });
});
