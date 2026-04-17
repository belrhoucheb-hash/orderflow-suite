/**
 * Bouw het v2 snapshot-object voor shipments.pricing.
 *
 * Afrondingsbeleid (R31): cents-conversie gebeurt pas hier. Motor levert
 * EUR-bedragen (NUMERIC, max 2 decimalen via round2). We vermenigvuldigen
 * met 100 en ronden af; subtotal_cents en total_cents zijn authoritative.
 */

import type {
  PriceBreakdown,
  PricingSnapshotV2,
  VehicleType,
  RateCard,
} from "./rateModels.ts";

export interface SnapshotInput {
  breakdown: PriceBreakdown;
  rateCard: RateCard | null;
  vehicleType: VehicleType | null;
  vehicleTypeReason: string | null;
  currency?: string;
}

function eurToCents(eur: number): number {
  return Math.round(eur * 100);
}

export function buildSnapshot(input: SnapshotInput): PricingSnapshotV2 {
  const { breakdown, rateCard, vehicleType, vehicleTypeReason } = input;
  const subtotalCents = eurToCents(breakdown.basisbedrag);
  const totalCents = eurToCents(breakdown.totaal);

  return {
    engine_version: "v2-2026-04",
    rate_card_id: rateCard?.id ?? null,
    vehicle_type_id: vehicleType?.id ?? null,
    vehicle_type_name: vehicleType?.name ?? null,
    vehicle_type_reason: vehicleTypeReason,
    line_items: breakdown.regels,
    surcharges: breakdown.toeslagen,
    subtotal_cents: subtotalCents,
    total_cents: totalCents,
    currency: input.currency ?? rateCard?.currency ?? "EUR",
    calculated_at: new Date().toISOString(),
  };
}

export function buildErrorSnapshot(error: string, reason: string): PricingSnapshotV2 {
  return {
    engine_version: "v2-2026-04",
    rate_card_id: null,
    vehicle_type_id: null,
    vehicle_type_name: null,
    vehicle_type_reason: null,
    line_items: [],
    surcharges: [],
    subtotal_cents: 0,
    total_cents: 0,
    currency: "EUR",
    calculated_at: new Date().toISOString(),
    error: `${error}: ${reason}`,
  };
}

/**
 * Onderscheid v2-snapshots van legacy RCS-specifieke snapshots (R3).
 */
export function isV2Snapshot(pricing: unknown): pricing is PricingSnapshotV2 {
  if (!pricing || typeof pricing !== "object") return false;
  const p = pricing as { engine_version?: unknown };
  return typeof p.engine_version === "string" && p.engine_version.startsWith("v2-");
}
