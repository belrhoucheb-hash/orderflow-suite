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
 * Bouw een symmetrische distance-matrix als Float64Array.
 * Index 0 = warehouse, 1..n = stops in inputvolgorde.
 *
 * Stops zonder coördinaat krijgen afstand 0 tot alle nodes; dat plaatst
 * ze effectief naast hun buur in de optimalisatie. Het oude gedrag liet
 * `current` ongewijzigd bij missing coords; voor de matrix-aanpak is 0
 * de minst-invasieve fallback (geen kunstmatige penalty).
 */
function buildDistanceMatrix(
  stops: PlanOrder[],
  coordMap: Map<string, GeoCoord>,
): { matrix: Float64Array; n: number; size: number } {
  const n = stops.length;
  const size = n + 1;
  const coords: (GeoCoord | null)[] = [WAREHOUSE];
  for (const s of stops) coords.push(coordMap.get(s.id) ?? null);

  const matrix = new Float64Array(size * size);
  for (let i = 0; i < size; i++) {
    for (let j = i + 1; j < size; j++) {
      const a = coords[i];
      const b = coords[j];
      const d = a && b ? haversineKm(a, b) : 0;
      matrix[i * size + j] = d;
      matrix[j * size + i] = d;
    }
  }
  return { matrix, n, size };
}

/**
 * Nearest-neighbor heuristiek op een precomputed distance-matrix.
 * Vult `perm` met indices 1..n in bezoekvolgorde.
 */
function nearestNeighborPerm(
  matrix: Float64Array,
  size: number,
): Int32Array {
  const n = size - 1;
  const perm = new Int32Array(n);
  const visited = new Uint8Array(size);
  visited[0] = 1;
  let current = 0;
  for (let step = 0; step < n; step++) {
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let k = 1; k < size; k++) {
      if (visited[k]) continue;
      const d = matrix[current * size + k];
      if (d < bestDist) {
        bestDist = d;
        bestIdx = k;
      }
    }
    if (bestIdx === -1) break;
    perm[step] = bestIdx;
    visited[bestIdx] = 1;
    current = bestIdx;
  }
  return perm;
}

/**
 * 2-opt local search met O(1) delta-evaluatie en in-place reverse.
 * Muteert `perm` direct. Stopt zodra geen swap meer wint.
 */
function twoOptInPlace(
  perm: Int32Array,
  matrix: Float64Array,
  size: number,
  maxIterations: number,
): void {
  const n = perm.length;
  if (n <= 2) return;

  for (let iter = 0; iter < maxIterations; iter++) {
    let improved = false;
    for (let i = 0; i < n - 1; i++) {
      const a = i === 0 ? 0 : perm[i - 1];
      const b = perm[i];
      const ab = matrix[a * size + b];
      for (let j = i + 1; j < n; j++) {
        const c = perm[j];
        const d = j === n - 1 ? 0 : perm[j + 1];
        // Voor swap: edges (a,b) en (c,d). Na reverse van segment i..j:
        // edges (a,c) en (b,d). Delta = (a,c)+(b,d) - (a,b)-(c,d).
        const cd = matrix[c * size + d];
        const ac = matrix[a * size + c];
        const bd = matrix[b * size + d];
        if (ac + bd < ab + cd - 0.01) {
          // In-place reverse van perm[i..j].
          let lo = i;
          let hi = j;
          while (lo < hi) {
            const tmp = perm[lo];
            perm[lo] = perm[hi];
            perm[hi] = tmp;
            lo++;
            hi--;
          }
          improved = true;
          break; // herstart vanaf nieuwe i, ab is nu stale
        }
      }
      if (improved) break;
    }
    if (!improved) return;
  }
}

/**
 * Nearest-neighbor route optimization starting from warehouse, gevolgd
 * door 2-opt local search. Hergebruikt één distance-matrix voor beide
 * stappen, waarmee de hot-path O(n²) is in plaats van O(n³).
 */
export function optimizeRoute(
  routeOrders: PlanOrder[],
  coordMap: Map<string, GeoCoord>,
): PlanOrder[] {
  if (routeOrders.length <= 1) return routeOrders;

  const { matrix, size } = buildDistanceMatrix(routeOrders, coordMap);
  const perm = nearestNeighborPerm(matrix, size);
  twoOptInPlace(perm, matrix, size, 100);

  const out: PlanOrder[] = new Array(perm.length);
  for (let i = 0; i < perm.length; i++) out[i] = routeOrders[perm[i] - 1];
  return out;
}

/**
 * Check if a given ETA (HH:mm string) falls within the order's time window.
 * Returns true if within window or if no time window is set.
 */
export function isWithinTimeWindow(eta: string, order: PlanOrder): boolean {
  const [etaH, etaM] = eta.split(":").map(Number);
  const etaMinutes = etaH * 60 + etaM;
  if (order.time_window_start) {
    const [sh, sm] = order.time_window_start.split(":").map(Number);
    // We allow arriving up to 30 min early (driver can wait), but flag it
    // For strict check, early is fine (driver waits)
  }
  if (order.time_window_end) {
    const [eh, em] = order.time_window_end.split(":").map(Number);
    if (etaMinutes > eh * 60 + em) return false;
  }
  return true;
}

/**
 * Compute ETA for each stop given a start time, ordered stops, and a
 * coordinate map. Returns an ETA string, how many minutes late the
 * arrival is relative to the order's time window end (0 if on time),
 * and how many minutes the driver must wait if arriving early.
 */
export function computeETAs(
  startTime: string,
  stops: PlanOrder[],
  coordMap: Map<string, GeoCoord>,
): { eta: string; lateMinutes: number; waitMinutes: number }[] {
  const [startH, startM] = startTime.split(":").map(Number);
  let currentMinutes = startH * 60 + startM;
  let currentPos: GeoCoord = WAREHOUSE;
  const results: { eta: string; lateMinutes: number; waitMinutes: number }[] = [];

  for (const order of stops) {
    const coord = coordMap.get(order.id);
    if (coord) {
      const dist = haversineKm(currentPos, coord);
      const driveMin = (dist / AVG_SPEED_KMH) * 60;
      currentMinutes += driveMin;
    }

    // Wait time: if we arrive before time_window_start, we must wait
    let waitMin = 0;
    if (order.time_window_start) {
      const [swH, swM] = order.time_window_start.split(":").map(Number);
      const windowStart = swH * 60 + swM;
      if (currentMinutes < windowStart) {
        waitMin = Math.round(windowStart - currentMinutes);
        currentMinutes = windowStart; // driver waits until window opens
      }
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

    results.push({ eta: etaStr, lateMinutes: late, waitMinutes: waitMin });

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
 * 2-opt local search improvement voor een route. Gebruikt een precomputed
 * distance-matrix en O(1) delta-evaluatie per kandidaat-swap; stopt zodra
 * geen verbetering meer mogelijk is of maxIterations bereikt.
 * Reduceert nearest-neighbor routes meestal met 10-20% in afstand.
 */
export function twoOptImprove(
  route: PlanOrder[],
  coordMap: Map<string, GeoCoord>,
  maxIterations = 100,
): PlanOrder[] {
  if (route.length <= 2) return route;

  const { matrix, size } = buildDistanceMatrix(route, coordMap);
  const perm = new Int32Array(route.length);
  for (let i = 0; i < route.length; i++) perm[i] = i + 1;

  twoOptInPlace(perm, matrix, size, maxIterations);

  const out: PlanOrder[] = new Array(perm.length);
  for (let i = 0; i < perm.length; i++) out[i] = route[perm[i] - 1];
  return out;
}
