import { type FleetVehicle } from "@/hooks/useVehicles";
import {
  type PlanOrder,
  type Assignments,
} from "./types";

// Re-export route optimizer functions so existing imports keep working
export { optimizeRoute, computeETAs, computeRouteStats } from "@/lib/routeOptimizer";

export function getTotalWeight(order: PlanOrder) {
  if (!order.weight_kg) return 0;
  if (order.is_weight_per_unit && order.quantity) return order.weight_kg * order.quantity;
  return order.weight_kg;
}

export function getCity(address: string | null) {
  if (!address) return "—";
  const parts = address.split(",").map((s) => s.trim());
  return parts[parts.length - 1] || "—";
}

export function hasTag(order: PlanOrder, tag: string) {
  return order.requirements?.some((r) => r.toUpperCase().includes(tag)) ?? false;
}

export function capacityColor(pct: number) {
  if (pct > 100) return "bg-destructive";
  if (pct > 90) return "text-amber-600";
  return "";
}

/** Explain why a vehicle has no orders assigned */
export function getEmptyReason(vehicle: FleetVehicle, allOrders: PlanOrder[], assignedIds: Set<string>): string {
  const unassigned = allOrders.filter(o => !assignedIds.has(o.id));
  if (unassigned.length === 0) return "Alle orders zijn al toegewezen.";
  const fittingOrders = unassigned.filter(o => {
    if (hasTag(o, "KOELING") && !vehicle.features.includes("KOELING")) return false;
    if (hasTag(o, "ADR") && !vehicle.features.includes("ADR")) return false;
    const w = getTotalWeight(o);
    if (w > vehicle.capacityKg) return false;
    return true;
  });
  if (fittingOrders.length === 0) {
    const koelOrders = unassigned.filter(o => hasTag(o, "KOELING"));
    const adrOrders = unassigned.filter(o => hasTag(o, "ADR"));
    if (koelOrders.length > 0 && !vehicle.features.includes("KOELING")) return "Resterende orders vereisen koeling — dit voertuig heeft geen koelinstallatie.";
    if (adrOrders.length > 0 && !vehicle.features.includes("ADR")) return "Resterende orders vereisen ADR — dit voertuig is niet ADR-uitgerust.";
    return "Geen orders passen qua capaciteit of vereisten.";
  }
  return `${fittingOrders.length} order(s) kunnen hier — sleep ze hierheen.`;
}

/** Explain why an unassigned order hasn't been placed on any vehicle */
export function getUnassignedReason(order: PlanOrder, fleetVehicles: FleetVehicle[], assignments: Assignments): string | null {
  if (!order.delivery_address || order.delivery_address === "Onbekend") return "Afleveradres ontbreekt — niet inplanbaar.";
  const reasons: string[] = [];
  for (const v of fleetVehicles) {
    if (hasTag(order, "KOELING") && !v.features.includes("KOELING")) { reasons.push(`${v.name}: geen koeling`); continue; }
    if (hasTag(order, "ADR") && !v.features.includes("ADR")) { reasons.push(`${v.name}: geen ADR`); continue; }
    const current = (assignments[v.id] ?? []).reduce((s, o) => s + getTotalWeight(o), 0);
    if (current + getTotalWeight(order) > v.capacityKg) { reasons.push(`${v.name}: vol op gewicht`); continue; }
    const pallets = (assignments[v.id] ?? []).reduce((s, o) => s + (o.quantity ?? 0), 0);
    if (pallets + (order.quantity ?? 0) > v.capacityPallets) { reasons.push(`${v.name}: vol op pallets`); continue; }
    return null; // at least one vehicle fits
  }
  return reasons.slice(0, 2).join(" · ");
}

/** Detect groups of combinable unassigned orders */
export function findCombinableGroups(orders: PlanOrder[], assignedIds: Set<string>): { key: string; orders: PlanOrder[]; savings: string }[] {
  const unassigned = orders.filter(o => !assignedIds.has(o.id));
  const groups = new Map<string, PlanOrder[]>();
  for (const o of unassigned) {
    const city = getCity(o.delivery_address).toLowerCase();
    const reqs = (o.requirements || []).sort().join(",");
    const key = `${city}|${reqs}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(o);
  }
  return [...groups.entries()]
    .filter(([, arr]) => arr.length >= 2)
    .map(([key, arr]) => ({
      key,
      orders: arr,
      savings: `${arr.length} orders naar ${getCity(arr[0].delivery_address)} — combineer tot 1 rit`,
    }));
}

