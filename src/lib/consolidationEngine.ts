/**
 * Consolidation Engine — Clustering Algorithm
 * Pure TypeScript module for order consolidation logic.
 * Clusters orders by region, filters by time window compatibility,
 * checks vehicle capacity, and builds consolidation proposals.
 */

import { haversineKm } from "@/data/geoData";
import type { GeoCoord } from "@/data/geoData";
import type { FleetVehicle } from "@/hooks/useVehicles";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConsolidatableOrder {
  id: string;
  order_number: number;
  client_name: string;
  delivery_address: string;
  delivery_postcode: string;
  weight_kg: number;
  quantity: number;
  requirements: string[];
  is_weight_per_unit: boolean;
  time_window_start: string | null;
  time_window_end: string | null;
  geocoded_delivery_lat: number | null;
  geocoded_delivery_lng: number | null;
}

export interface ConsolidationProposal {
  /** Ordered list of order IDs in this proposal */
  orderIds: string[];
  /** Region key (postcode prefix or address word) */
  region: string;
  /** Best fitting vehicle, or null if none found */
  vehicle: FleetVehicle | null;
  /** Total weight of all orders in kg */
  totalWeightKg: number;
  /** Total pallet count of all orders */
  totalPallets: number;
  /** Estimated route distance in km (sum of consecutive haversine distances) */
  estimatedDistanceKm: number;
  /** Weight utilization as a fraction 0–1 (0 if no vehicle) */
  utilizationPct: number;
  /** Human-readable warnings (capacity, time windows, missing coords) */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// 1. clusterByRegion
// ---------------------------------------------------------------------------

/**
 * Groups orders into a Map keyed by postcode region (first 2 digits of the
 * postcode). Falls back to the first word of delivery_address when no valid
 * postcode is present.
 */
export function clusterByRegion(orders: ConsolidatableOrder[]): Map<string, ConsolidatableOrder[]> {
  const clusters = new Map<string, ConsolidatableOrder[]>();

  for (const order of orders) {
    const key = _regionKey(order);
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key)!.push(order);
  }

  return clusters;
}

function _regionKey(order: ConsolidatableOrder): string {
  const pc = (order.delivery_postcode ?? "").trim();
  // Dutch postcode: 4 digits + optional space + 2 letters
  const match = pc.match(/^(\d{4})/);
  if (match) return match[1].substring(0, 2);

  // Fallback: first word of delivery address
  const addr = (order.delivery_address ?? "").trim();
  const firstWord = addr.split(/[\s,]+/)[0] ?? "unknown";
  return firstWord.toLowerCase();
}

// ---------------------------------------------------------------------------
// 2. filterByTimeWindowCompatibility
// ---------------------------------------------------------------------------

/**
 * Greedy sequential filter: keeps orders whose time window is compatible with
 * the current tour. An order without a time window is always included.
 * Two windows are compatible when they overlap (start ≤ other.end and end ≥ other.start).
 * Adds 30 minutes per stop for travel/unload time budgeting.
 */
export function filterByTimeWindowCompatibility(orders: ConsolidatableOrder[]): ConsolidatableOrder[] {
  if (orders.length === 0) return [];

  const toMinutes = (hhmm: string): number => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + (m ?? 0);
  };

  // Sliding window: track the latest possible start and earliest possible end
  // that is still reachable from all accepted orders.
  let windowStart = 0;        // earliest we can still service (minutes from midnight)
  let windowEnd = 24 * 60;    // latest we must be done
  const STOP_TIME = 30;       // minutes per stop

  const result: ConsolidatableOrder[] = [];

  for (const order of orders) {
    if (!order.time_window_start || !order.time_window_end) {
      // No constraint — always compatible
      result.push(order);
      windowStart += STOP_TIME;
      continue;
    }

    const oStart = toMinutes(order.time_window_start);
    const oEnd = toMinutes(order.time_window_end);

    // Overlap check: current route window must intersect with this order's window
    const overlapStart = Math.max(windowStart, oStart);
    const overlapEnd = Math.min(windowEnd, oEnd);

    if (overlapStart < overlapEnd) {
      // Compatible — narrow the window
      result.push(order);
      windowStart = overlapStart + STOP_TIME;
      windowEnd = overlapEnd;
    }
    // else: skip this order (incompatible window)
  }

  return result;
}

// ---------------------------------------------------------------------------
// 3. checkCapacityFit
// ---------------------------------------------------------------------------

/**
 * Returns true when the combined weight and pallet count of the orders fit
 * within the vehicle's capacity AND all order requirements (ADR, KOELING, etc.)
 * are covered by the vehicle's features.
 */
export function checkCapacityFit(orders: ConsolidatableOrder[], vehicle: FleetVehicle): boolean {
  const totalWeight = orders.reduce((sum, o) => {
    const unitWeight = o.is_weight_per_unit ? o.weight_kg * o.quantity : o.weight_kg;
    return sum + unitWeight;
  }, 0);

  const totalPallets = orders.reduce((sum, o) => sum + o.quantity, 0);

  if (totalWeight > vehicle.capacityKg) return false;
  if (totalPallets > vehicle.capacityPallets) return false;

  // Check special requirements
  const vehicleFeatures = (vehicle.features ?? []).map((f) => f.toUpperCase());
  for (const order of orders) {
    for (const req of order.requirements) {
      if (!vehicleFeatures.includes(req.toUpperCase())) return false;
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// 4. buildConsolidationProposals
// ---------------------------------------------------------------------------

/**
 * Full pipeline:
 * 1. Cluster orders by region
 * 2. Filter each cluster by time window compatibility
 * 3. Find the smallest vehicle that fits the cluster (weight + pallets + features)
 * 4. Estimate route distance using haversineKm
 * 5. Return one ConsolidationProposal per viable cluster (≥ 2 orders)
 */
export function buildConsolidationProposals(
  orders: ConsolidatableOrder[],
  vehicles: FleetVehicle[],
  coordMap: Map<string, GeoCoord>,
): ConsolidationProposal[] {
  const clusters = clusterByRegion(orders);
  const proposals: ConsolidationProposal[] = [];

  // Sort vehicles by capacity ascending so we pick the smallest that fits
  const sortedVehicles = [...vehicles].sort((a, b) => a.capacityKg - b.capacityKg);

  for (const [region, clusterOrders] of clusters) {
    // Skip single-order clusters — no consolidation benefit
    if (clusterOrders.length < 2) continue;

    const compatible = filterByTimeWindowCompatibility(clusterOrders);
    if (compatible.length < 2) continue;

    const warnings: string[] = [];

    const totalWeightKg = compatible.reduce((sum, o) => {
      return sum + (o.is_weight_per_unit ? o.weight_kg * o.quantity : o.weight_kg);
    }, 0);

    const totalPallets = compatible.reduce((sum, o) => sum + o.quantity, 0);

    // Find best (smallest fitting) vehicle
    const vehicle = sortedVehicles.find((v) => checkCapacityFit(compatible, v)) ?? null;

    if (!vehicle) {
      warnings.push(`No vehicle can fit all orders in region ${region} (${totalWeightKg} kg, ${totalPallets} pallets)`);
    }

    // Estimate route distance
    const estimatedDistanceKm = _estimateRouteDistance(compatible, coordMap, warnings);

    // Utilization
    const utilizationPct = vehicle ? totalWeightKg / vehicle.capacityKg : 0;

    proposals.push({
      orderIds: compatible.map((o) => o.id),
      region,
      vehicle,
      totalWeightKg,
      totalPallets,
      estimatedDistanceKm,
      utilizationPct,
      warnings,
    });
  }

  return proposals;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _estimateRouteDistance(
  orders: ConsolidatableOrder[],
  coordMap: Map<string, GeoCoord>,
  warnings: string[],
): number {
  // Build coordinate list from coordMap or from geocoded_delivery_lat/lng fields
  const coords: GeoCoord[] = [];

  for (const order of orders) {
    const mapped = coordMap.get(order.id);
    if (mapped) {
      coords.push(mapped);
    } else if (order.geocoded_delivery_lat != null && order.geocoded_delivery_lng != null) {
      coords.push({ lat: order.geocoded_delivery_lat, lng: order.geocoded_delivery_lng });
    } else {
      warnings.push(`Order ${order.id} has no coordinates — excluded from distance estimate`);
    }
  }

  if (coords.length < 2) return 0;

  // Sum consecutive distances (naive TSP approximation in insertion order)
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    total += haversineKm(coords[i], coords[i + 1]);
  }

  return Math.round(total * 10) / 10;
}
