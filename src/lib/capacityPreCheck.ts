import type { SupabaseClient } from "@supabase/supabase-js";

export interface CapacityCheckResult {
  /** Whether there is at least one vehicle with sufficient remaining capacity */
  available: boolean;
  /** The vehicle ID with the most remaining capacity, or null */
  suggestedVehicleId: string | null;
  /** Human-readable reason (Dutch) */
  reason: string;
}

interface VehicleRow {
  id: string;
  capacity_kg: number;
  capacity_pallets: number | null;
  features: string[];
}

interface TripLoadRow {
  vehicle_id: string;
  total_weight_kg: number;
  total_pallets: number;
}

/**
 * Quick capacity pre-check at order intake time.
 *
 * Queries vehicles with matching features, subtracts already-assigned load
 * for the given date from trips, and returns the first vehicle with enough
 * remaining capacity.
 *
 * @param supabase - Supabase client (service role or user)
 * @param tenantId - Tenant UUID
 * @param date - The date to check (ISO 8601 date string, e.g. "2026-04-10")
 * @param requirements - Required vehicle features (e.g. ["Koeling", "ADR"])
 * @param weightKg - Required weight capacity in kg
 * @param palletCount - Required pallet count (optional)
 */
export async function checkAvailableCapacity(
  supabase: SupabaseClient,
  tenantId: string,
  date: string,
  requirements: string[],
  weightKg: number,
  palletCount?: number
): Promise<CapacityCheckResult> {
  try {
    // ── Step 1: Find vehicles that match requirements ──
    let vehicleQuery = supabase
      .from("vehicles")
      .select("id, capacity_kg, capacity_pallets, features")
      .eq("tenant_id", tenantId);

    let vehicleResult;
    if (requirements.length > 0) {
      vehicleResult = await vehicleQuery.contains("features", requirements);
    } else {
      vehicleResult = await vehicleQuery;
    }

    const { data: vehicles, error: vehicleError } = vehicleResult;

    if (vehicleError || !vehicles || vehicles.length === 0) {
      return {
        available: false,
        suggestedVehicleId: null,
        reason: vehicleError
          ? `Capaciteitscontrole fout: ${vehicleError.message}`
          : `Geen voertuig gevonden met vereisten: ${requirements.join(", ") || "geen"}`,
      };
    }

    const vehicleIds = vehicles.map((v: VehicleRow) => v.id);

    // ── Step 2: Check vehicle availability for the date ──
    const { data: unavailable } = await supabase
      .from("vehicle_availability")
      .select("vehicle_id, status")
      .eq("date", date)
      .eq("status", "unavailable")
      .in("vehicle_id", vehicleIds);

    const unavailableIds = new Set(
      (unavailable || []).map((u: any) => u.vehicle_id)
    );
    const availableVehicles = vehicles.filter(
      (v: VehicleRow) => !unavailableIds.has(v.id)
    );

    if (availableVehicles.length === 0) {
      return {
        available: false,
        suggestedVehicleId: null,
        reason: `Alle ${vehicles.length} voertuig(en) met juiste vereisten zijn niet beschikbaar op ${date}`,
      };
    }

    // ── Step 3: Get existing trip loads for available vehicles on this date ──
    const availableIds = availableVehicles.map((v: VehicleRow) => v.id);

    const { data: existingTrips } = await supabase
      .from("trips")
      .select("vehicle_id, total_weight_kg, total_pallets")
      .eq("date", date)
      .in("vehicle_id", availableIds);

    // Build a map of used capacity per vehicle
    const usedCapacity = new Map<string, { weight: number; pallets: number }>();
    for (const trip of existingTrips || []) {
      const t = trip as TripLoadRow;
      const existing = usedCapacity.get(t.vehicle_id) || {
        weight: 0,
        pallets: 0,
      };
      existing.weight += t.total_weight_kg || 0;
      existing.pallets += t.total_pallets || 0;
      usedCapacity.set(t.vehicle_id, existing);
    }

    // ── Step 4: Find vehicles with enough remaining capacity ──
    // Sort by most remaining capacity (prefer emptier vehicles)
    type VehicleWithRemaining = VehicleRow & {
      remainingKg: number;
      remainingPallets: number;
    };

    const candidates: VehicleWithRemaining[] = availableVehicles
      .map((v: VehicleRow) => {
        const used = usedCapacity.get(v.id) || { weight: 0, pallets: 0 };
        return {
          ...v,
          remainingKg: (v.capacity_kg || 0) - used.weight,
          remainingPallets: (v.capacity_pallets || 0) - used.pallets,
        };
      })
      .filter((v: VehicleWithRemaining) => {
        // Weight check (skip if weight is 0 — unknown weight)
        if (weightKg > 0 && v.remainingKg < weightKg) return false;
        // Pallet check (skip if palletCount not provided)
        if (
          palletCount &&
          palletCount > 0 &&
          v.capacity_pallets &&
          v.remainingPallets < palletCount
        )
          return false;
        return true;
      })
      .sort(
        (a: VehicleWithRemaining, b: VehicleWithRemaining) =>
          b.remainingKg - a.remainingKg
      );

    if (candidates.length === 0) {
      return {
        available: false,
        suggestedVehicleId: null,
        reason: `Geen voertuig met voldoende resterende capaciteit op ${date} (nodig: ${weightKg}kg${palletCount ? `, ${palletCount} pallets` : ""})`,
      };
    }

    const best = candidates[0];
    return {
      available: true,
      suggestedVehicleId: best.id,
      reason: `Voertuig beschikbaar: ${best.remainingKg}kg/${best.remainingPallets} pallets resterend`,
    };
  } catch (err: any) {
    return {
      available: false,
      suggestedVehicleId: null,
      reason: `Capaciteitscontrole fout: ${err.message || "onbekend"}`,
    };
  }
}
