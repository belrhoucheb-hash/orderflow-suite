/**
 * Pure route calculation functions extracted from planning utilities.
 * Contains haversine distance, nearest-neighbor route optimization,
 * ETA computation, and route statistics.
 */

import {
  haversineKm,
  type GeoCoord,
} from "@/data/geoData";
import {
  type PlanOrder,
  WAREHOUSE,
  AVG_SPEED_KMH,
  UNLOAD_MINUTES,
  MAX_DRIVE_MINUTES,
} from "@/components/planning/types";

// Re-export haversine for convenience
export { haversineKm } from "@/data/geoData";

/**
 * Nearest-neighbor route optimization starting from warehouse.
 * Orders are sorted so that each successive stop is the closest
 * unvisited stop to the current position.
 */
export function optimizeRoute(
  routeOrders: PlanOrder[],
  coordMap: Map<string, GeoCoord>,
): PlanOrder[] {
  if (routeOrders.length <= 1) return routeOrders;

  // Step 1: Nearest-neighbor heuristic for initial route
  const remaining = [...routeOrders];
  const result: PlanOrder[] = [];
  let current: GeoCoord = WAREHOUSE;

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const coord = coordMap.get(remaining[i].id);
      if (!coord) continue;
      const d = haversineKm(current, coord);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const next = remaining.splice(bestIdx, 1)[0];
    result.push(next);
    current = coordMap.get(next.id) || current;
  }

  // Step 2: 2-opt local search improvement
  return twoOptImprove(result, coordMap);
}

/**
 * Compute ETA for each stop given a start time, ordered stops, and a
 * coordinate map. Returns an ETA string and how many minutes late the
 * arrival is relative to the order's time window end (0 if on time).
 */
export function computeETAs(
  startTime: string,
  stops: PlanOrder[],
  coordMap: Map<string, GeoCoord>,
): { eta: string; lateMinutes: number }[] {
  const [startH, startM] = startTime.split(":").map(Number);
  let currentMinutes = startH * 60 + startM;
  let currentPos: GeoCoord = WAREHOUSE;
  const results: { eta: string; lateMinutes: number }[] = [];

  for (const order of stops) {
    const coord = coordMap.get(order.id);
    if (coord) {
      const dist = haversineKm(currentPos, coord);
      const driveMin = (dist / AVG_SPEED_KMH) * 60;
      currentMinutes += driveMin;
    }
    const etaH = Math.floor(currentMinutes / 60) % 24;
    const etaM = Math.floor(currentMinutes % 60);
    const etaStr = `${String(etaH).padStart(2, "0")}:${String(etaM).padStart(2, "0")}`;

    // Check against actual time window end
    let late = 0;
    if (order.time_window_end) {
      const [endH, endM2] = order.time_window_end.split(":").map(Number);
      const windowEnd = endH * 60 + endM2;
      late = currentMinutes > windowEnd ? Math.round(currentMinutes - windowEnd) : 0;
    }

    results.push({ eta: etaStr, lateMinutes: late });

    // Add unload time
    currentMinutes += UNLOAD_MINUTES;
    if (coord) currentPos = coord;
  }
  return results;
}

/**
 * Compute total route distance and time (including return to warehouse).
 */
export function computeRouteStats(
  startTime: string,
  stops: PlanOrder[],
  coordMap: Map<string, GeoCoord>,
): { totalKm: number; returnKm: number; totalMinutes: number; exceedsDriveLimit: boolean } {
  let totalKm = 0;
  let currentPos: GeoCoord = WAREHOUSE;

  for (const order of stops) {
    const coord = coordMap.get(order.id);
    if (coord) {
      totalKm += haversineKm(currentPos, coord);
      currentPos = coord;
    }
  }

  // Return trip: last stop back to warehouse
  const returnKm = stops.length > 0 ? haversineKm(currentPos, WAREHOUSE) : 0;
  const roundTripKm = totalKm + returnKm;

  const driveMinutes = (roundTripKm / AVG_SPEED_KMH) * 60;
  const unloadMinutes = stops.length * UNLOAD_MINUTES;
  const totalMinutes = driveMinutes + unloadMinutes;

  return {
    totalKm: Math.round(roundTripKm),
    returnKm: Math.round(returnKm),
    totalMinutes: Math.round(totalMinutes),
    exceedsDriveLimit: totalMinutes > MAX_DRIVE_MINUTES,
  };
}

/**
 * Compute the total distance (in km) of a sequence of stops,
 * starting and ending at the warehouse.
 */
export function computeTotalDistanceKm(
  stops: PlanOrder[],
  coordMap: Map<string, GeoCoord>,
): number {
  let totalKm = 0;
  let currentPos: GeoCoord = WAREHOUSE;

  for (const order of stops) {
    const coord = coordMap.get(order.id);
    if (coord) {
      totalKm += haversineKm(currentPos, coord);
      currentPos = coord;
    }
  }
  // Return to warehouse
  if (stops.length > 0) {
    totalKm += haversineKm(currentPos, WAREHOUSE);
  }
  return totalKm;
}

/**
 * 2-opt local search improvement for a route.
 * Takes an existing ordered route and tries reversing segments to reduce
 * total distance (warehouse -> stops -> warehouse).
 * Repeats until no improvement is found or maxIterations is reached.
 * Typically reduces nearest-neighbor routes by 10-20%.
 */
export function twoOptImprove(
  route: PlanOrder[],
  coordMap: Map<string, GeoCoord>,
  maxIterations = 100,
): PlanOrder[] {
  if (route.length <= 2) return route;

  // Build a coords array: [warehouse, stop0, stop1, ..., stopN, warehouse]
  // We only need the order IDs to resolve coords; unresolvable stops keep their position.
  let improved = [...route];
  let bestDistance = computeTotalDistanceKm(improved, coordMap);

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    let foundImprovement = false;

    for (let i = 0; i < improved.length - 1; i++) {
      for (let j = i + 1; j < improved.length; j++) {
        // Reverse the segment between i and j (inclusive)
        const candidate = [...improved];
        const segment = candidate.splice(i, j - i + 1);
        segment.reverse();
        candidate.splice(i, 0, ...segment);

        const candidateDistance = computeTotalDistanceKm(candidate, coordMap);
        if (candidateDistance < bestDistance - 0.01) {
          // Accept improvement (0.01 km threshold to avoid floating-point churn)
          improved = candidate;
          bestDistance = candidateDistance;
          foundImprovement = true;
        }
      }
    }

    if (!foundImprovement) break;
  }

  return improved;
}
