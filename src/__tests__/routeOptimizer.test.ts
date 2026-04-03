import { describe, it, expect } from "vitest";
import {
  optimizeRoute,
  twoOptImprove,
  computeTotalDistanceKm,
  isWithinTimeWindow,
  computeETAs,
  computeRouteStats,
} from "@/lib/routeOptimizer";
import { haversineKm, type GeoCoord } from "@/data/geoData";
import type { PlanOrder } from "@/components/planning/types";

// ─── Helper: create a minimal PlanOrder ──────────────────────────────
function makePlanOrder(id: string, overrides: Partial<PlanOrder> = {}): PlanOrder {
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
    ...overrides,
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

  it("handles orders without coordinates gracefully", () => {
    const orders = [makePlanOrder("1"), makePlanOrder("2"), makePlanOrder("3")];
    // Only 1 and 3 have coords, 2 does not
    const coordMap = new Map<string, GeoCoord>([
      ["1", AMSTERDAM],
      ["3", UTRECHT],
    ]);
    const result = optimizeRoute(orders, coordMap);
    expect(result).toHaveLength(3);
    const ids = result.map((o) => o.id).sort();
    expect(ids).toEqual(["1", "2", "3"]);
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

  it("respects maxIterations limit", () => {
    const orders = [
      makePlanOrder("1"),
      makePlanOrder("2"),
      makePlanOrder("3"),
    ];
    const coordMap = new Map<string, GeoCoord>([
      ["1", AMSTERDAM],
      ["2", ROTTERDAM],
      ["3", UTRECHT],
    ]);
    // With maxIterations=1, should still return a valid route
    const result = twoOptImprove(orders, coordMap, 1);
    expect(result).toHaveLength(3);
    const ids = result.map((o) => o.id).sort();
    expect(ids).toEqual(["1", "2", "3"]);
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

describe("computeTotalDistanceKm", () => {
  it("returns 0 for empty stops", () => {
    const result = computeTotalDistanceKm([], new Map());
    expect(result).toBe(0);
  });

  it("returns round trip distance for a single stop", () => {
    const orders = [makePlanOrder("1")];
    const coordMap = new Map<string, GeoCoord>([["1", AMSTERDAM]]);
    const dist = computeTotalDistanceKm(orders, coordMap);
    expect(dist).toBeGreaterThan(0); // warehouse -> Amsterdam -> warehouse
  });

  it("returns consistent distance for same route", () => {
    const orders = [makePlanOrder("1"), makePlanOrder("2")];
    const coordMap = new Map<string, GeoCoord>([
      ["1", AMSTERDAM],
      ["2", ROTTERDAM],
    ]);
    const dist1 = computeTotalDistanceKm(orders, coordMap);
    const dist2 = computeTotalDistanceKm(orders, coordMap);
    expect(dist1).toBe(dist2);
  });

  it("handles orders without coords", () => {
    const orders = [makePlanOrder("1"), makePlanOrder("2")];
    const coordMap = new Map<string, GeoCoord>([["1", AMSTERDAM]]);
    // Order "2" has no coords, should be skipped
    const dist = computeTotalDistanceKm(orders, coordMap);
    expect(dist).toBeGreaterThan(0);
  });
});

describe("isWithinTimeWindow", () => {
  it("returns true when no time window is set", () => {
    const order = makePlanOrder("1");
    expect(isWithinTimeWindow("10:00", order)).toBe(true);
  });

  it("returns true when ETA is before window end", () => {
    const order = makePlanOrder("1", { time_window_end: "12:00" });
    expect(isWithinTimeWindow("10:00", order)).toBe(true);
  });

  it("returns false when ETA is after window end", () => {
    const order = makePlanOrder("1", { time_window_end: "12:00" });
    expect(isWithinTimeWindow("13:00", order)).toBe(false);
  });

  it("returns true when ETA equals window end exactly", () => {
    const order = makePlanOrder("1", { time_window_end: "12:00" });
    expect(isWithinTimeWindow("12:00", order)).toBe(true);
  });

  it("returns true when only start window is set", () => {
    const order = makePlanOrder("1", { time_window_start: "08:00" });
    expect(isWithinTimeWindow("10:00", order)).toBe(true);
  });

  it("returns true when ETA is within full window", () => {
    const order = makePlanOrder("1", { time_window_start: "08:00", time_window_end: "12:00" });
    expect(isWithinTimeWindow("10:00", order)).toBe(true);
  });
});

describe("computeETAs", () => {
  it("returns empty array for empty stops", () => {
    const result = computeETAs("08:00", [], new Map());
    expect(result).toEqual([]);
  });

  it("returns ETAs for a single stop", () => {
    const orders = [makePlanOrder("1")];
    const coordMap = new Map<string, GeoCoord>([["1", AMSTERDAM]]);
    const result = computeETAs("08:00", orders, coordMap);
    expect(result).toHaveLength(1);
    expect(result[0].eta).toMatch(/^\d{2}:\d{2}$/);
    expect(result[0].lateMinutes).toBe(0);
    expect(result[0].waitMinutes).toBe(0);
  });

  it("computes late minutes when ETA is after window end", () => {
    const orders = [makePlanOrder("1", { time_window_end: "08:01" })];
    const coordMap = new Map<string, GeoCoord>([["1", GRONINGEN]]); // Far away
    const result = computeETAs("08:00", orders, coordMap);
    expect(result).toHaveLength(1);
    // Groningen is ~160km from warehouse, at 60km/h ~160min, so arrival ~10:40
    expect(result[0].lateMinutes).toBeGreaterThan(0);
  });

  it("computes wait minutes when arriving before window start", () => {
    // Window starts at 12:00, but we start at 08:00 with a nearby stop
    const orders = [makePlanOrder("1", { time_window_start: "12:00" })];
    const coordMap = new Map<string, GeoCoord>([["1", AMSTERDAM]]); // Close to warehouse
    const result = computeETAs("08:00", orders, coordMap);
    expect(result).toHaveLength(1);
    expect(result[0].waitMinutes).toBeGreaterThan(0);
  });

  it("returns multiple ETAs for multiple stops", () => {
    const orders = [makePlanOrder("1"), makePlanOrder("2")];
    const coordMap = new Map<string, GeoCoord>([
      ["1", AMSTERDAM],
      ["2", ROTTERDAM],
    ]);
    const result = computeETAs("08:00", orders, coordMap);
    expect(result).toHaveLength(2);
    // Second ETA should be later than first
    const eta1Min = parseInt(result[0].eta.split(":")[0]) * 60 + parseInt(result[0].eta.split(":")[1]);
    const eta2Min = parseInt(result[1].eta.split(":")[0]) * 60 + parseInt(result[1].eta.split(":")[1]);
    expect(eta2Min).toBeGreaterThan(eta1Min);
  });
});

describe("computeRouteStats", () => {
  it("returns zeroes for empty stops", () => {
    const result = computeRouteStats("08:00", [], new Map());
    expect(result.totalKm).toBe(0);
    expect(result.returnKm).toBe(0);
    expect(result.totalMinutes).toBe(0);
    expect(result.exceedsDriveLimit).toBe(false);
  });

  it("returns positive values for a single stop", () => {
    const orders = [makePlanOrder("1")];
    const coordMap = new Map<string, GeoCoord>([["1", AMSTERDAM]]);
    const result = computeRouteStats("08:00", orders, coordMap);
    expect(result.totalKm).toBeGreaterThan(0);
    expect(result.returnKm).toBeGreaterThan(0);
    expect(result.totalMinutes).toBeGreaterThan(0);
  });

  it("includes unload time in total minutes", () => {
    const orders = [makePlanOrder("1"), makePlanOrder("2")];
    const coordMap = new Map<string, GeoCoord>([
      ["1", AMSTERDAM],
      ["2", ROTTERDAM],
    ]);
    const result = computeRouteStats("08:00", orders, coordMap);
    // 2 stops x 30 min unload = 60 min minimum
    expect(result.totalMinutes).toBeGreaterThanOrEqual(60);
  });

  it("detects exceeding drive limit", () => {
    // Create many far-away stops to exceed 9 hours
    const orders = [];
    const coordMap = new Map<string, GeoCoord>();
    const cities = [AMSTERDAM, GRONINGEN, EINDHOVEN, AMSTERDAM, GRONINGEN, EINDHOVEN, AMSTERDAM, GRONINGEN, EINDHOVEN, AMSTERDAM, GRONINGEN];
    for (let i = 0; i < cities.length; i++) {
      const id = String(i + 1);
      orders.push(makePlanOrder(id));
      coordMap.set(id, cities[i]);
    }
    const result = computeRouteStats("08:00", orders, coordMap);
    // 11 stops with 30 min unload = 330 min unload + drive time
    expect(result.exceedsDriveLimit).toBe(true);
  });
});
