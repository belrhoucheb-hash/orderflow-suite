import { type FleetVehicle } from "@/hooks/useVehicles";
import { type GeoCoord, haversineKm } from "@/data/geoData";
import type { ConsolidationProposal } from "@/types/consolidation";

export interface ConsolidatableOrder {
  id: string;
  order_number: number;
  client_name: string;
  delivery_address: string | null;
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

function extractPostcodePrefix(order: ConsolidatableOrder): string {
  if (order.delivery_postcode && order.delivery_postcode.length >= 2) {
    return order.delivery_postcode.substring(0, 2);
  }
  // Fallback: use first word of delivery_address as grouping key
  return (order.delivery_address || "ONBEKEND").split(/[\s,]/)[0];
}

function parseMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function getTotalWeight(order: ConsolidatableOrder): number {
  if (!order.weight_kg) return 0;
  if (order.is_weight_per_unit && order.quantity) return order.weight_kg * order.quantity;
  return order.weight_kg;
}

/**
 * Step 1: Cluster orders by region (postcode prefix, first 2 digits).
 */
export function clusterByRegion(orders: ConsolidatableOrder[]): Map<string, ConsolidatableOrder[]> {
  const clusters = new Map<string, ConsolidatableOrder[]>();
  for (const order of orders) {
    const key = extractPostcodePrefix(order);
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key)!.push(order);
  }
  return clusters;
}

/**
 * Step 2: Filter orders by time window compatibility.
 * Returns the largest subset of orders whose time windows overlap enough
 * to be served sequentially (allowing ~30min per stop).
 */
export function filterByTimeWindowCompatibility(orders: ConsolidatableOrder[]): ConsolidatableOrder[] {
  const withWindows = orders.filter((o) => o.time_window_start && o.time_window_end);
  const withoutWindows = orders.filter((o) => !o.time_window_start || !o.time_window_end);

  if (withWindows.length === 0) return orders;

  // Sort by window start
  const sorted = [...withWindows].sort((a, b) => {
    return parseMinutes(a.time_window_start!) - parseMinutes(b.time_window_start!);
  });

  // Greedy: keep orders that can be visited sequentially (30min per stop)
  const compatible: ConsolidatableOrder[] = [sorted[0]];
  let currentEndMin = parseMinutes(sorted[0].time_window_end!);

  for (let i = 1; i < sorted.length; i++) {
    const startMin = parseMinutes(sorted[i].time_window_start!);
    const endMin = parseMinutes(sorted[i].time_window_end!);
    // Check: can we reach this stop? We need the previous stop's window to overlap
    // such that after ~30min of service we can still arrive within this stop's window
    const earliestArrival = parseMinutes(sorted[i - 1].time_window_start!) + 30;
    if (earliestArrival <= endMin) {
      compatible.push(sorted[i]);
      currentEndMin = Math.min(currentEndMin, endMin);
    }
  }

  return [...compatible, ...withoutWindows];
}

/**
 * Step 3: Check if orders fit in a vehicle (weight, pallets, requirements).
 */
export function checkCapacityFit(orders: ConsolidatableOrder[], vehicle: FleetVehicle): boolean {
  const totalWeight = orders.reduce((sum, o) => sum + getTotalWeight(o), 0);
  const totalPallets = orders.reduce((sum, o) => sum + (o.quantity || 0), 0);

  if (totalWeight > vehicle.capacityKg) return false;
  if (totalPallets > vehicle.capacityPallets) return false;

  const vehicleFeatures = vehicle.features.map((f) => f.toUpperCase());
  for (const order of orders) {
    for (const req of order.requirements) {
      const reqUpper = req.toUpperCase();
      if (reqUpper === "ADR" && !vehicleFeatures.includes("ADR")) return false;
      if (reqUpper === "KOELING" && !vehicleFeatures.includes("KOELING")) return false;
    }
  }

  return true;
}

/**
 * Step 4+5: Build consolidation proposals from unassigned orders.
 * Clusters by region -> filters by time window -> checks capacity -> matches vehicle.
 */
export function buildConsolidationProposals(
  orders: ConsolidatableOrder[],
  vehicles: FleetVehicle[],
  coordMap: Map<string, GeoCoord>,
): ConsolidationProposal[] {
  const clusters = clusterByRegion(orders);
  const proposals: ConsolidationProposal[] = [];

  for (const [regionKey, clusterOrders] of clusters) {
    if (clusterOrders.length < 1) continue;

    const compatibleOrders = filterByTimeWindowCompatibility(clusterOrders);
    if (compatibleOrders.length === 0) continue;

    const totalWeight = compatibleOrders.reduce((sum, o) => sum + getTotalWeight(o), 0);
    const totalPallets = compatibleOrders.reduce((sum, o) => sum + (o.quantity || 0), 0);

    // Estimate distance: sum of haversine between consecutive geocoded stops
    let totalDistance = 0;
    const geocoded = compatibleOrders.filter((o) => o.geocoded_delivery_lat && o.geocoded_delivery_lng);
    for (let i = 1; i < geocoded.length; i++) {
      const prev: GeoCoord = { lat: geocoded[i - 1].geocoded_delivery_lat!, lng: geocoded[i - 1].geocoded_delivery_lng! };
      const curr: GeoCoord = { lat: geocoded[i].geocoded_delivery_lat!, lng: geocoded[i].geocoded_delivery_lng! };
      totalDistance += haversineKm(prev, curr);
    }

    const estimatedDuration = Math.round((totalDistance / 60) * 60 + compatibleOrders.length * 30);

    // Find best vehicle
    let suggestedVehicleId: string | null = null;
    let bestUtilization = 0;
    for (const v of vehicles) {
      if (checkCapacityFit(compatibleOrders, v)) {
        const utilization = Math.max(
          totalWeight / v.capacityKg,
          totalPallets / v.capacityPallets,
        ) * 100;
        if (utilization > bestUtilization) {
          bestUtilization = utilization;
          suggestedVehicleId = v.id;
        }
      }
    }

    const warnings: string[] = [];
    if (bestUtilization < 40) warnings.push("Lage benutting: overweeg meer orders toe te voegen");
    if (bestUtilization > 95) warnings.push("Bijna vol: weinig marge voor extra orders");
    if (!suggestedVehicleId) warnings.push("Geen geschikt voertuig gevonden");

    const regionCityMap: Record<string, string> = {
      "10": "Amsterdam", "20": "Rotterdam", "25": "Den Haag",
      "30": "Utrecht", "50": "Eindhoven", "60": "Arnhem",
      "65": "Nijmegen", "70": "Enschede", "80": "Zwolle",
      "90": "Groningen",
    };
    const regionName = regionCityMap[regionKey] || `Regio ${regionKey}`;

    proposals.push({
      regionName,
      orderIds: compatibleOrders.map((o) => o.id),
      totalWeightKg: totalWeight,
      totalPallets,
      estimatedDistanceKm: Math.round(totalDistance * 10) / 10,
      estimatedDurationMin: estimatedDuration,
      utilizationPct: Math.round(bestUtilization * 10) / 10,
      suggestedVehicleId,
      warnings,
    });
  }

  return proposals.sort((a, b) => b.utilizationPct - a.utilizationPct);
}
