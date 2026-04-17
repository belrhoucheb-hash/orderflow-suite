/**
 * Voertuigselectie, TA-02 + TA-03.
 *
 * Kiest het kleinste voertuigtype dat aan alle afmetingen en feature-flags
 * (klep, koeling, ADR) van de zending voldoet. De keuze is puur tariefgericht,
 * niet planning-gericht: de daadwerkelijk ingezette wagen kan groter zijn.
 *
 * Output bevat een vehicle_type_reason string die de UI toont ter uitleg.
 */

import type { VehicleType, CargoDimensions } from "./rateModels.ts";

export interface VehicleSelectionResult {
  vehicle_type: VehicleType;
  reason: string;
}

export interface VehicleSelectionError {
  error: "no_vehicle_match";
  reason: string;
  cargo: CargoDimensions;
}

export type VehicleSelection = VehicleSelectionResult | VehicleSelectionError;

function fits(type: VehicleType, cargo: CargoDimensions): boolean {
  if (type.max_length_cm != null && cargo.length_cm > type.max_length_cm) return false;
  if (type.max_width_cm  != null && cargo.width_cm  > type.max_width_cm)  return false;
  if (type.max_height_cm != null && cargo.height_cm > type.max_height_cm) return false;
  if (type.max_weight_kg != null && cargo.weight_kg > type.max_weight_kg) return false;
  return true;
}

function meetsFeatures(type: VehicleType, cargo: CargoDimensions): boolean {
  if (cargo.requires_tailgate && !type.has_tailgate) return false;
  if (cargo.requires_cooling  && !type.has_cooling)  return false;
  if (cargo.requires_adr      && !type.adr_capable)  return false;
  return true;
}

function buildReason(type: VehicleType, cargo: CargoDimensions): string {
  const parts: string[] = [];
  parts.push(
    `Kleinste passend op ${cargo.length_cm}×${cargo.width_cm}×${cargo.height_cm} cm, ${cargo.weight_kg} kg`,
  );
  const overrides: string[] = [];
  if (cargo.requires_tailgate) overrides.push("laadklep");
  if (cargo.requires_cooling)  overrides.push("koeling");
  if (cargo.requires_adr)      overrides.push("ADR");
  if (overrides.length > 0) {
    parts.push(`met ${overrides.join(", ")}`);
  }
  return `${parts.join(" ")} → ${type.name}`;
}

/**
 * Kies het kleinste voertuigtype dat aan alle eisen voldoet.
 * Sorteert kandidaten op sort_order (laag = klein), neemt de eerste die past.
 */
export function selectSmallestVehicleType(
  types: VehicleType[],
  cargo: CargoDimensions,
): VehicleSelection {
  const activeTypes = types
    .filter((t) => t.is_active)
    .sort((a, b) => a.sort_order - b.sort_order);

  for (const type of activeTypes) {
    if (fits(type, cargo) && meetsFeatures(type, cargo)) {
      return {
        vehicle_type: type,
        reason: buildReason(type, cargo),
      };
    }
  }

  const reasons: string[] = [];
  if (cargo.requires_tailgate) reasons.push("laadklep vereist");
  if (cargo.requires_cooling)  reasons.push("koeling vereist");
  if (cargo.requires_adr)      reasons.push("ADR vereist");
  const featureNote = reasons.length > 0 ? ` (${reasons.join(", ")})` : "";

  return {
    error: "no_vehicle_match",
    reason: `Geen voertuigtype past op ${cargo.length_cm}×${cargo.width_cm}×${cargo.height_cm} cm, ${cargo.weight_kg} kg${featureNote}`,
    cargo,
  };
}
