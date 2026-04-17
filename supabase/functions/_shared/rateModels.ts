// Canoniek voor zowel frontend als Edge Function. Geen Supabase-imports, geen Node-APIs.
// Frontend herexporteert dit via src/types/rateModels.ts.

// ─── Rate Card Types ────────────────────────────────────────

export type RuleType =
  | "PER_KM"
  | "PER_UUR"
  | "PER_STOP"
  | "PER_PALLET"
  | "PER_KG"
  | "VAST_BEDRAG"
  | "ZONE_TARIEF"
  | "STAFFEL";

export const RULE_TYPES: RuleType[] = [
  "PER_KM", "PER_UUR", "PER_STOP", "PER_PALLET",
  "PER_KG", "VAST_BEDRAG", "ZONE_TARIEF", "STAFFEL",
];

export const RULE_TYPE_LABELS: Record<RuleType, string> = {
  PER_KM: "Per kilometer",
  PER_UUR: "Per uur",
  PER_STOP: "Per stop",
  PER_PALLET: "Per pallet",
  PER_KG: "Per kilogram",
  VAST_BEDRAG: "Vast bedrag",
  ZONE_TARIEF: "Zone tarief",
  STAFFEL: "Staffel (gestaffeld)",
};

export const RULE_TYPE_UNITS: Record<RuleType, string> = {
  PER_KM: "km",
  PER_UUR: "uur",
  PER_STOP: "stop",
  PER_PALLET: "pallet",
  PER_KG: "kg",
  VAST_BEDRAG: "rit",
  ZONE_TARIEF: "rit",
  STAFFEL: "stuk",
};

export type SurchargeType = "PERCENTAGE" | "VAST_BEDRAG" | "PER_KM" | "PER_KG";

export const SURCHARGE_TYPES: SurchargeType[] = [
  "PERCENTAGE", "VAST_BEDRAG", "PER_KM", "PER_KG",
];

export const SURCHARGE_TYPE_LABELS: Record<SurchargeType, string> = {
  PERCENTAGE: "Percentage (%)",
  VAST_BEDRAG: "Vast bedrag",
  PER_KM: "Per kilometer",
  PER_KG: "Per kilogram",
};

// ─── Conditions JSONB Shapes ────────────────────────────────

export interface RateRuleConditions {
  weight_from?: number;
  weight_to?: number;
  distance_from?: number;
  distance_to?: number;
  from_zone?: string;
  to_zone?: string;
  transport_type?: string;
}

export interface SurchargeAppliesTo {
  requirements?: string[];
  day_of_week?: number[];
  waiting_time_above_min?: number;
  transport_type?: string;
}

// ─── Vehicle Type ───────────────────────────────────────────

export type DayType = "weekday" | "saturday" | "sunday" | "holiday" | "any";

export interface VehicleType {
  id: string;
  tenant_id: string;
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
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Table Row Types ────────────────────────────────────────

export interface RateCard {
  id: string;
  tenant_id: string;
  client_id: string | null;
  name: string;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
  currency: string;
  created_at: string;
  updated_at: string;
  // Joined
  rate_rules?: RateRule[];
  client?: { name: string } | null;
}

export interface RateRule {
  id: string;
  rate_card_id: string;
  rule_type: RuleType;
  transport_type: string | null;
  vehicle_type_id?: string | null;
  amount: number;
  min_amount: number | null;
  conditions: RateRuleConditions;
  sort_order: number;
  created_at: string;
}

export interface Surcharge {
  id: string;
  tenant_id: string;
  name: string;
  surcharge_type: SurchargeType;
  amount: number;
  applies_to: SurchargeAppliesTo;
  time_from?: string | null;
  time_to?: string | null;
  day_type?: DayType;
  sort_order?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Order Charges (add-ons achteraf) ───────────────────────

export type OrderChargeType =
  | "waiting"
  | "toll"
  | "extra_stop"
  | "correction"
  | "manual"
  | "other";

export const ORDER_CHARGE_TYPE_LABELS: Record<OrderChargeType, string> = {
  waiting: "Wachtkosten",
  toll: "Tolkosten",
  extra_stop: "Extra stop",
  correction: "Correctie",
  manual: "Handmatig",
  other: "Overig",
};

export interface OrderCharge {
  id: string;
  tenant_id: string;
  order_id: string;
  charge_type: OrderChargeType;
  description: string;
  source_description: string | null;
  quantity: number | null;
  unit: string | null;
  unit_price_cents: number | null;
  amount_cents: number;
  created_by: string | null;
  created_at: string;
}

// ─── Price Calculation Output ───────────────────────────────

export interface PriceLineItem {
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total: number;
  rule_type: RuleType;
}

export interface PriceSurchargeItem {
  name: string;
  type: SurchargeType;
  amount: number;
}

export interface PriceBreakdown {
  basisbedrag: number;
  toeslagen: PriceSurchargeItem[];
  totaal: number;
  regels: PriceLineItem[];
}

export interface PriceBreakdownWithConfidence extends PriceBreakdown {
  confidence: number;
}

// ─── Input Types for Price Engine ───────────────────────────

export interface PricingOrderInput {
  id: string;
  order_number: number | string;
  client_name: string | null;
  pickup_address: string | null;
  delivery_address: string | null;
  transport_type: string | null;
  weight_kg: number | null;
  quantity: number | null;
  distance_km: number;
  stop_count: number;
  duration_hours: number;
  requirements: string[];
  day_of_week: number;
  waiting_time_min: number;
  pickup_country?: string;
  delivery_country?: string;
  // Nieuw in Sprint 2: voor voertuigselectie en tijd-toeslagen
  pickup_date?: string;       // ISO datum voor rate_card valid_from/valid_until en day_type
  pickup_time_local?: string; // HH:mm (Europe/Amsterdam) voor time_from/time_to matching
  cargo_dimensions?: CargoDimensions;
  vehicle_type_id?: string | null;
}

export interface CargoDimensions {
  length_cm: number;
  width_cm: number;
  height_cm: number;
  weight_kg: number;
  requires_tailgate: boolean;
  requires_cooling: boolean;
  requires_adr: boolean;
}

// ─── Snapshot-schema (shipments.pricing v2) ─────────────────

export interface PricingSnapshotV2 {
  engine_version: "v2-2026-04";
  rate_card_id: string | null;
  vehicle_type_id: string | null;
  vehicle_type_name: string | null;
  vehicle_type_reason: string | null;
  line_items: PriceLineItem[];
  surcharges: PriceSurchargeItem[];
  subtotal_cents: number;
  total_cents: number;
  currency: string;
  calculated_at: string;
  locked?: boolean;
  override?: {
    amount_cents: number;
    reason: string;
    by_user: string | null;
    at: string;
  };
  error?: string;
}
