// Vitest benchmarks voor route- en VRP-logica.
//
// Doel: regressies in algoritmische complexity vroeg detecteren. Niet
// een vast latency-budget afdwingen (dat varieert per machine), wel een
// relatieve baseline die je in een PR-vergelijking kunt zien.
//
// Draai: npm run test:bench

import { bench, describe } from "vitest";
import { optimizeRoute, twoOptImprove, computeRouteStats } from "@/lib/routeOptimizer";
import type { GeoCoord } from "@/data/geoData";
import type { PlanOrder } from "@/components/planning/types";

function makeOrder(id: string): PlanOrder {
  return {
    id,
    order_number: Number(id),
    client_name: `c${id}`,
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

// Deterministische pseudo-random NL-coordinaten zodat runs reproduceerbaar zijn.
function seededCoords(n: number): { orders: PlanOrder[]; map: Map<string, GeoCoord> } {
  const orders: PlanOrder[] = [];
  const map = new Map<string, GeoCoord>();
  let s = 1234567;
  const next = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = 0; i < n; i++) {
    const id = `${i}`;
    orders.push(makeOrder(id));
    map.set(id, {
      lat: 51.5 + next() * 1.3, // Nederland ruwweg
      lng: 4.0 + next() * 3.0,
    });
  }
  return { orders, map };
}

describe("optimizeRoute (nearest-neighbor + 2-opt)", () => {
  const sizes = [10, 50, 150, 300, 500];
  for (const n of sizes) {
    const seed = seededCoords(n);
    bench(`${n} stops`, () => {
      optimizeRoute(seed.orders, seed.map);
    });
  }
});

describe("twoOptImprove (op nearest-neighbor seed)", () => {
  const sizes = [50, 150, 300];
  for (const n of sizes) {
    const seed = seededCoords(n);
    const initial = optimizeRoute(seed.orders, seed.map);
    bench(`2-opt op ${n} stops`, () => {
      twoOptImprove(initial, seed.map);
    });
  }
});

describe("computeRouteStats", () => {
  const seed = seededCoords(50);
  const route = optimizeRoute(seed.orders, seed.map);

  bench("stats over 50 stops", () => {
    computeRouteStats("06:00", route, seed.map);
  });
});
