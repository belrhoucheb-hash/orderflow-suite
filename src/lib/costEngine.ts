import type { CostCalculationInput, TripCostBreakdown, TripCostItem, MarginResult } from "@/types/costModels";

function round2(n: number): number { return Math.round(n * 100) / 100; }

export function calculateTripCosts(input: CostCalculationInput): TripCostBreakdown {
  const items: TripCostItem[] = [];
  items.push({ cost_type_name: "Brandstof", category: "BRANDSTOF", amount: round2(input.distance_km * (input.fuel_consumption_per_100km / 100) * input.diesel_price_per_liter), source: "AUTO" });
  items.push({ cost_type_name: "Chauffeurkosten", category: "CHAUFFEUR", amount: round2(input.duration_hours * input.driver_hourly_cost), source: "AUTO" });
  items.push({ cost_type_name: "Wachtgeld", category: "CHAUFFEUR", amount: round2(input.waiting_time_hours * input.driver_hourly_cost), source: "AUTO" });
  const vehicleDaily = input.working_days_per_month > 0 ? round2(input.vehicle_monthly_costs / input.working_days_per_month) : 0;
  items.push({ cost_type_name: "Voertuigkosten (vast)", category: "VOERTUIG", amount: vehicleDaily, source: "AUTO" });
  return { items, total: round2(items.reduce((s, i) => s + i.amount, 0)) };
}

export function calculateMargin(revenue: number, cost: number): MarginResult {
  const me = round2(revenue - cost);
  const mp = revenue > 0 ? round2((me / revenue) * 100) : 0;
  return { revenue, cost, margin_euro: me, margin_percentage: mp };
}
