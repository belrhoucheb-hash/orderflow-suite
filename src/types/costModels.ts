export type CostCategory = "BRANDSTOF" | "TOL" | "CHAUFFEUR" | "VOERTUIG" | "OVERIG";
export const COST_CATEGORIES: CostCategory[] = ["BRANDSTOF", "TOL", "CHAUFFEUR", "VOERTUIG", "OVERIG"];
export const COST_CATEGORY_LABELS: Record<CostCategory, string> = { BRANDSTOF: "Brandstof", TOL: "Tolkosten", CHAUFFEUR: "Chauffeurkosten", VOERTUIG: "Voertuigkosten", OVERIG: "Overig" };

export type CalculationMethod = "PER_KM" | "PER_UUR" | "PER_RIT" | "PER_STOP" | "HANDMATIG";
export const CALCULATION_METHODS: CalculationMethod[] = ["PER_KM", "PER_UUR", "PER_RIT", "PER_STOP", "HANDMATIG"];
export const CALCULATION_METHOD_LABELS: Record<CalculationMethod, string> = { PER_KM: "Per kilometer", PER_UUR: "Per uur", PER_RIT: "Per rit", PER_STOP: "Per stop", HANDMATIG: "Handmatig" };

export type CostSource = "AUTO" | "HANDMATIG" | "IMPORT";

export interface CostType { id: string; tenant_id: string; name: string; category: CostCategory; calculation_method: CalculationMethod; default_rate: number | null; is_active: boolean; created_at: string; updated_at: string; }
export interface TripCost { id: string; tenant_id: string; trip_id: string; cost_type_id: string; amount: number; quantity: number | null; rate: number | null; source: CostSource; notes: string | null; created_at: string; cost_type?: CostType; }
export interface VehicleFixedCost { id: string; tenant_id: string; vehicle_id: string; cost_type_id: string; monthly_amount: number; valid_from: string | null; valid_until: string | null; created_at: string; updated_at: string; cost_type?: CostType; }
export interface TripCostItem { cost_type_name: string; category: CostCategory; amount: number; source: CostSource; }
export interface TripCostBreakdown { items: TripCostItem[]; total: number; }
export interface MarginResult { revenue: number; cost: number; margin_euro: number; margin_percentage: number; }
export interface CostCalculationInput { trip_id: string; distance_km: number; duration_hours: number; stop_count: number; fuel_consumption_per_100km: number; diesel_price_per_liter: number; driver_hourly_cost: number; waiting_time_hours: number; vehicle_monthly_costs: number; working_days_per_month: number; }
