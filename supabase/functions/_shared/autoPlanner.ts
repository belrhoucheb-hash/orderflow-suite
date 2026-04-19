/**
 * autoPlanner.ts - Server-side auto-plan engine voor Sprint 3.
 *
 * Pure functie zonder Supabase-dependencies, zodat hij testbaar is vanuit
 * zowel Deno (Edge Function) als vitest in de frontend. Input is een
 * snapshot van orders/drivers/vehicles/types en dagsetup, output is een
 * lijst cluster-voorstellen met per cluster een vehicle+driver+orders, plus
 * een lijst unplaced-orders met reden-tag.
 *
 * Algoritme (plan 02-plan §2.1):
 *   1. Cluster orders op postcode-prefix (PC2 default, PC3 optioneel)
 *   2. Per cluster: kies kleinste voertuig dat past op features + capaciteit
 *   3. Wijs chauffeur toe met juiste certificaten en minste planned_hours
 *   4. Respecteer contracturen-grens per chauffeur per ISO-week
 *   5. Orders die niet passen landen op unplaced met reason
 */

export type ClusterGranularity = "PC2" | "PC3";

export interface PlannerOrder {
  id: string;
  delivery_address: string | null;
  pickup_address: string | null;
  weight_kg: number | null;
  is_weight_per_unit: boolean;
  quantity: number | null;
  requirements: string[] | null;
  vehicle_type_id: string | null;
  delivery_time_window_start: string | null;
  delivery_time_window_end: string | null;
  cargo_length_cm: number | null;
  cargo_width_cm: number | null;
  cargo_height_cm: number | null;
}

export interface PlannerVehicleType {
  id: string;
  code: string;
  name: string;
  sort_order: number;
  max_length_cm: number | null;
  max_width_cm: number | null;
  max_height_cm: number | null;
  max_weight_kg: number | null;
  max_volume_m3: number | null;
  max_pallets: number | null;
  has_tailgate: boolean;
  has_cooling: boolean;
  adr_capable: boolean;
}

export interface PlannerVehicle {
  id: string;
  name: string | null;
  vehicle_type_id: string | null;
  capacity_kg: number | null;
  capacity_pallets: number | null;
  features: string[] | null;
}

export interface PlannerDriver {
  id: string;
  name: string;
  certifications: string[] | null;
  contract_hours_per_week: number | null;
  planned_hours_this_week: number;
}

export interface PlannerInput {
  date: string;
  granularity: ClusterGranularity;
  orders: PlannerOrder[];
  vehicleTypes: PlannerVehicleType[];
  vehicles: PlannerVehicle[];
  drivers: PlannerDriver[];
}

export interface ProposalCluster {
  region: string;
  vehicle_id: string;
  driver_id: string;
  orders: PlannerOrder[];
  total_weight_kg: number;
  total_volume_m3: number;
  total_pallets: number;
  estimated_duration_min: number;
  utilization_pct: number;
  vehicle_type_id: string | null;
}

export interface UnplacedOrder {
  order_id: string;
  reason:
    | "no_vehicle_type"
    | "no_matching_vehicle"
    | "no_matching_driver"
    | "over_capacity"
    | "over_contract_hours"
    | "no_address";
  detail?: string;
}

export interface PlannerResult {
  proposals: ProposalCluster[];
  unplaced: UnplacedOrder[];
}

const POSTCODE_RE = /(\d{4})\s*[A-Za-z]{2}/;
const AVG_MINUTES_PER_STOP = 30;

export function getPostcodeRegion(address: string | null, granularity: ClusterGranularity): string | null {
  if (!address) return null;
  const match = address.match(POSTCODE_RE);
  if (!match) return null;
  const pc4 = match[1];
  return granularity === "PC2" ? pc4.substring(0, 2) : pc4.substring(0, 3);
}

function computeOrderTotalWeight(o: PlannerOrder): number {
  const w = o.weight_kg ?? 0;
  const q = o.quantity ?? 1;
  return o.is_weight_per_unit ? w * q : w;
}

function computeOrderVolumeM3(o: PlannerOrder): number {
  if (!o.cargo_length_cm || !o.cargo_width_cm || !o.cargo_height_cm) return 0;
  const q = o.quantity ?? 1;
  return (o.cargo_length_cm * o.cargo_width_cm * o.cargo_height_cm * q) / 1_000_000;
}

function orderFeaturesRequired(o: PlannerOrder): { tailgate: boolean; cooling: boolean; adr: boolean } {
  const reqs = (o.requirements ?? []).map((r) => r.toUpperCase());
  return {
    tailgate: reqs.includes("LAADKLEP") || reqs.includes("KLEP") || reqs.includes("TAILGATE"),
    cooling: reqs.includes("KOELING") || reqs.includes("KOEL") || reqs.includes("COOLING"),
    adr: reqs.includes("ADR"),
  };
}

function vehicleTypeMatches(type: PlannerVehicleType, features: ReturnType<typeof orderFeaturesRequired>): boolean {
  if (features.tailgate && !type.has_tailgate) return false;
  if (features.cooling && !type.has_cooling) return false;
  if (features.adr && !type.adr_capable) return false;
  return true;
}

function driverMatchesOrderRequirements(driver: PlannerDriver, orders: PlannerOrder[]): boolean {
  const certs = (driver.certifications ?? []).map((c) => c.toUpperCase());
  for (const o of orders) {
    const f = orderFeaturesRequired(o);
    if (f.adr && !certs.includes("ADR")) return false;
    if (f.cooling && !certs.includes("KOELING") && !certs.includes("COOLING")) return false;
  }
  return true;
}

export function runAutoPlanner(input: PlannerInput): PlannerResult {
  const { orders, vehicleTypes, vehicles, drivers, granularity } = input;

  const typesById = new Map(vehicleTypes.map((t) => [t.id, t]));
  const typesBySortAsc = [...vehicleTypes].sort((a, b) => a.sort_order - b.sort_order);

  const usedVehicles = new Set<string>();
  const driverUsage = new Map<string, number>();
  drivers.forEach((d) => driverUsage.set(d.id, d.planned_hours_this_week));

  const unplaced: UnplacedOrder[] = [];
  const regionToOrders = new Map<string, PlannerOrder[]>();

  for (const o of orders) {
    const region = getPostcodeRegion(o.delivery_address, granularity);
    if (!region) {
      unplaced.push({ order_id: o.id, reason: "no_address" });
      continue;
    }
    if (!regionToOrders.has(region)) regionToOrders.set(region, []);
    regionToOrders.get(region)!.push(o);
  }

  const proposals: ProposalCluster[] = [];

  const regionKeys = [...regionToOrders.keys()].sort((a, b) => (regionToOrders.get(b)!.length - regionToOrders.get(a)!.length));

  for (const region of regionKeys) {
    const clusterOrders = regionToOrders.get(region)!;
    const required = clusterOrders.map(orderFeaturesRequired).reduce(
      (acc, f) => ({ tailgate: acc.tailgate || f.tailgate, cooling: acc.cooling || f.cooling, adr: acc.adr || f.adr }),
      { tailgate: false, cooling: false, adr: false },
    );

    const totalWeight = clusterOrders.reduce((s, o) => s + computeOrderTotalWeight(o), 0);
    const totalVolume = clusterOrders.reduce((s, o) => s + computeOrderVolumeM3(o), 0);
    const totalPallets = clusterOrders.reduce((s, o) => s + (o.quantity ?? 0), 0);

    const candidateType = typesBySortAsc.find((t) => {
      if (!vehicleTypeMatches(t, required)) return false;
      if (t.max_weight_kg !== null && totalWeight > t.max_weight_kg) return false;
      if (t.max_volume_m3 !== null && totalVolume > t.max_volume_m3) return false;
      if (t.max_pallets !== null && totalPallets > t.max_pallets) return false;
      return true;
    });

    if (!candidateType) {
      clusterOrders.forEach((o) => unplaced.push({ order_id: o.id, reason: "over_capacity", detail: `regio ${region}` }));
      continue;
    }

    // Zoek kleinste vrije voertuig dat qua type gelijk is aan of groter dan
    // het gekozen candidateType. Voertuig met onbekend type is een wildcard.
    const vehicleRanked = vehicles
      .filter((v) => !usedVehicles.has(v.id))
      .map((v) => {
        if (v.vehicle_type_id === null) return { vehicle: v, rank: Infinity };
        const type = typesById.get(v.vehicle_type_id);
        if (!type) return { vehicle: v, rank: Infinity };
        if (!vehicleTypeMatches(type, required)) return null;
        if (type.max_weight_kg !== null && totalWeight > type.max_weight_kg) return null;
        if (type.max_volume_m3 !== null && totalVolume > type.max_volume_m3) return null;
        if (type.max_pallets !== null && totalPallets > type.max_pallets) return null;
        if (type.sort_order < candidateType.sort_order) return null;
        return { vehicle: v, rank: type.sort_order };
      })
      .filter((x): x is { vehicle: PlannerVehicle; rank: number } => x !== null)
      .sort((a, b) => a.rank - b.rank);

    const vehicle = vehicleRanked[0]?.vehicle;
    if (!vehicle) {
      clusterOrders.forEach((o) =>
        unplaced.push({ order_id: o.id, reason: "no_matching_vehicle", detail: `type ${candidateType.code} niet vrij` }),
      );
      continue;
    }

    const estDuration = clusterOrders.length * AVG_MINUTES_PER_STOP * 2;
    const estHours = estDuration / 60;

    const driverCandidates = drivers
      .filter((d) => driverMatchesOrderRequirements(d, clusterOrders))
      .filter((d) => {
        if (d.contract_hours_per_week === null || d.contract_hours_per_week === undefined) return true;
        const used = driverUsage.get(d.id) ?? 0;
        return used + estHours <= d.contract_hours_per_week;
      })
      .sort((a, b) => (driverUsage.get(a.id) ?? 0) - (driverUsage.get(b.id) ?? 0));

    const driver = driverCandidates[0];
    if (!driver) {
      clusterOrders.forEach((o) =>
        unplaced.push({ order_id: o.id, reason: "no_matching_driver", detail: `regio ${region}` }),
      );
      continue;
    }

    usedVehicles.add(vehicle.id);
    driverUsage.set(driver.id, (driverUsage.get(driver.id) ?? 0) + estHours);

    const weightCap = candidateType.max_weight_kg ?? vehicle.capacity_kg ?? 0;
    const volumeCap = candidateType.max_volume_m3 ?? 0;
    const palletCap = candidateType.max_pallets ?? vehicle.capacity_pallets ?? 0;

    const utilWeight = weightCap > 0 ? (totalWeight / weightCap) * 100 : 0;
    const utilVolume = volumeCap > 0 ? (totalVolume / volumeCap) * 100 : 0;
    const utilPallets = palletCap > 0 ? (totalPallets / palletCap) * 100 : 0;
    const utilization = Math.max(utilWeight, utilVolume, utilPallets);

    proposals.push({
      region,
      vehicle_id: vehicle.id,
      driver_id: driver.id,
      orders: clusterOrders,
      total_weight_kg: Math.round(totalWeight * 100) / 100,
      total_volume_m3: Math.round(totalVolume * 100) / 100,
      total_pallets: totalPallets,
      estimated_duration_min: estDuration,
      utilization_pct: Math.round(utilization * 10) / 10,
      vehicle_type_id: candidateType.id,
    });
  }

  return { proposals, unplaced };
}
