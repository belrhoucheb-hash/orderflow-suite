import { type FleetVehicle } from "@/hooks/useVehicles";
import { type PlanOrder, type Assignments, WAREHOUSE, AVG_SPEED_KMH, UNLOAD_MINUTES } from "@/components/planning/types";
import { type GeoCoord, haversineKm } from "@/data/geoData";
import {
  getTotalWeight,
  hasTag,
  optimizeRoute
} from "@/components/planning/planningUtils";

/** Parse "HH:mm" to minutes since midnight. */
function parseTimeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Compute the ETA (in minutes since midnight) for a new order if it were
 * appended at the end of the given route, starting from a default 06:00.
 */
function estimateETAForAppend(
  route: PlanOrder[],
  newOrder: PlanOrder,
  coordMap: Map<string, GeoCoord>,
  startMinutes: number = 6 * 60,
): number {
  let currentMinutes = startMinutes;
  let currentPos: GeoCoord = WAREHOUSE;

  for (const order of route) {
    const coord = coordMap.get(order.id);
    if (coord) {
      const dist = haversineKm(currentPos, coord);
      currentMinutes += (dist / AVG_SPEED_KMH) * 60;
      // If we arrive before time_window_start, wait
      if (order.time_window_start) {
        const windowStart = parseTimeToMinutes(order.time_window_start);
        if (currentMinutes < windowStart) currentMinutes = windowStart;
      }
      currentPos = coord;
    }
    currentMinutes += UNLOAD_MINUTES;
  }

  // Now compute arrival for the new order
  const newCoord = coordMap.get(newOrder.id);
  if (newCoord) {
    const dist = haversineKm(currentPos, newCoord);
    currentMinutes += (dist / AVG_SPEED_KMH) * 60;
  }

  return currentMinutes;
}

/**
 * Check if appending an order to the route violates its time window end.
 * Returns true if the insertion is feasible.
 */
function isTimeWindowFeasible(
  route: PlanOrder[],
  newOrder: PlanOrder,
  coordMap: Map<string, GeoCoord>,
): boolean {
  if (!newOrder.time_window_end) return true;
  const eta = estimateETAForAppend(route, newOrder, coordMap);
  const windowEnd = parseTimeToMinutes(newOrder.time_window_end);
  return eta <= windowEnd;
}

/**
 * Compute a priority score for time-window urgency.
 * Orders with tighter windows get a lower (higher-priority) score.
 * Orders without a time window get a neutral high value.
 */
function timeWindowUrgency(order: PlanOrder): number {
  if (!order.time_window_end) return 9999;
  const endMin = parseTimeToMinutes(order.time_window_end);
  if (order.time_window_start) {
    const startMin = parseTimeToMinutes(order.time_window_start);
    const span = endMin - startMin;
    // Tighter window = lower score = higher priority
    return span;
  }
  return endMin;
}

/**
 * Intelligent Vehicle Routing Problem (VRP) Solver.
 * Uses a hybrid approach:
 * 1. Filtering by constraints (ADR, Cooling).
 * 2. Clustering by proximity (Postcode/Region).
 * 3. Capacity-aware greedy insertion with time window validation.
 */
export function solveVRP(
  unassignedOrders: PlanOrder[],
  vehicles: FleetVehicle[],
  coordMap: Map<string, GeoCoord>,
  existingAssignments: Assignments = {}
): Assignments {
  const newAssignments: Assignments = { ...existingAssignments };
  
  // 1. Pre-sort orders by priority (tight time windows first, then early deadline, then region)
  const sortedOrders = [...unassignedOrders].sort((a, b) => {
    // Priority 1: Time window urgency (tighter windows first)
    const urgA = timeWindowUrgency(a);
    const urgB = timeWindowUrgency(b);
    if (urgA !== urgB) return urgA - urgB;

    // Priority 2: Time Window End (earlier deadline first)
    const endA = a.time_window_end || "23:59";
    const endB = b.time_window_end || "23:59";
    if (endA !== endB) return endA.localeCompare(endB);

    // Priority 3: Delivery address (Group by region)
    return (a.delivery_address || "").localeCompare(b.delivery_address || "");
  });

  // 2. Pre-calculate vehicle status
  const vehicleStates = vehicles.map(v => {
    const currentOrders = newAssignments[v.id] || [];
    return {
      vehicle: v,
      currentWeight: currentOrders.reduce((sum, o) => sum + getTotalWeight(o), 0),
      currentPallets: currentOrders.reduce((sum, o) => sum + (o.quantity || 0), 0),
    };
  });

  // Sort vehicles by capacity (try to fill smaller ones first if possible, or vice versa? 
  // Custom: Fill by capacity ratio to keep fleet balanced)
  
  const placedIds = new Set<string>();

  for (const order of sortedOrders) {
    if (placedIds.has(order.id)) continue;

    const orderWeight = getTotalWeight(order);
    const orderPallets = order.quantity || 0;
    const isKoeling = hasTag(order, "KOELING");
    const isADR = hasTag(order, "ADR");

    let bestVehicleIdx = -1;
    let minAddedDist = Infinity;

    for (let i = 0; i < vehicleStates.length; i++) {
        const state = vehicleStates[i];
        const v = state.vehicle;

        // Constraint Checks
        if (state.currentWeight + orderWeight > v.capacityKg) continue;
        if (state.currentPallets + orderPallets > v.capacityPallets) continue;
        if (isKoeling && !v.features.includes("KOELING")) continue;
        if (isADR && !v.features.includes("ADR")) continue;

        // Time Window Check: verify appending this order won't violate its deadline
        const currentRoute = newAssignments[v.id] || [];
        if (!isTimeWindowFeasible(currentRoute, order, coordMap)) continue;

        // Heuristic: Distance to existing stops in this vehicle
        let addedDist = 0;
        
        const orderCoord = coordMap.get(order.id);
        if (orderCoord && currentRoute.length > 0) {
            // Calculate distance to the "centroid" or last stop of the current route
            // For simplicity, we check distance to the nearest existing stop in that vehicle
            let minStopDist = Infinity;
            for (const existingObj of currentRoute) {
                const exCoord = coordMap.get(existingObj.id);
                if (exCoord) {
                    const d = haversineKm(orderCoord, exCoord);
                    if (d < minStopDist) minStopDist = d;
                }
            }
            addedDist = minStopDist;
        }

        // Penalty for switching regions too much if already has a region
        if (addedDist < minAddedDist) {
            minAddedDist = addedDist;
            bestVehicleIdx = i;
        }
    }

    if (bestVehicleIdx !== -1) {
        const state = vehicleStates[bestVehicleIdx];
        const vId = state.vehicle.id;
        
        if (!newAssignments[vId]) newAssignments[vId] = [];
        newAssignments[vId].push(order);
        
        state.currentWeight += orderWeight;
        state.currentPallets += orderPallets;
        placedIds.add(order.id);
    }
  }

  // 3. Post-Process: Optimize individual routes using Nearest Neighbor
  for (const vId of Object.keys(newAssignments)) {
    if (newAssignments[vId].length > 1) {
      newAssignments[vId] = optimizeRoute(newAssignments[vId], coordMap);
    }
  }

  return newAssignments;
}
