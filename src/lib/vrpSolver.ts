import { type FleetVehicle } from "@/hooks/useVehicles";
import { type PlanOrder, type Assignments } from "@/components/planning/types";
import { type GeoCoord, haversineKm } from "@/data/geoData";
import { 
  getTotalWeight, 
  hasTag, 
  optimizeRoute 
} from "@/components/planning/planningUtils";

/**
 * Intelligent Vehicle Routing Problem (VRP) Solver.
 * Uses a hybrid approach:
 * 1. Filtering by constraints (ADR, Cooling).
 * 2. Clustering by proximity (Postcode/Region).
 * 3. Capacity-aware greedy insertion.
 */
export function solveVRP(
  unassignedOrders: PlanOrder[],
  vehicles: FleetVehicle[],
  coordMap: Map<string, GeoCoord>,
  existingAssignments: Assignments = {}
): Assignments {
  const newAssignments: Assignments = { ...existingAssignments };
  
  // 1. Pre-sort orders by priority (time window, then region)
  const sortedOrders = [...unassignedOrders].sort((a, b) => {
    // Priority 1: Time Window Start (if exists)
    const timeA = a.time_window_start || "23:59";
    const timeB = b.time_window_start || "23:59";
    if (timeA !== timeB) return timeA.localeCompare(timeB);
    
    // Priority 2: Delivery address (Group by region)
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

        // Heuristic: Distance to existing stops in this vehicle
        const currentRoute = newAssignments[v.id] || [];
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
