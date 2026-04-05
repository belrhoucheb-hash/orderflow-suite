/**
 * Cost Calculation Engine for OrderFlow Suite.
 *
 * Pure functions — no Supabase dependency.
 * Calculates trip costs from vehicle, driver, and operational data.
 */

import type {
  CostCalculationInput,
  TripCostBreakdown,
  TripCostItem,
  MarginResult,
} from "@/types/costModels";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Calculate all trip costs from input parameters.
 *
 * Auto-calculated costs:
 * - Fuel: distance_km x (fuel_consumption/100) x diesel_price
 * - Driver: duration_hours x hourly_cost
 * - Wait time: waiting_time_hours x driver_hourly_cost
 * - Vehicle (fixed): monthly_total / working_days
 */
export function calculateTripCosts(input: CostCalculationInput): TripCostBreakdown {
  const items: TripCostItem[] = [];

  // 1. Fuel cost
  const fuelLiters = input.distance_km * (input.fuel_consumption_per_100km / 100);
  const fuelCost = round2(fuelLiters * input.diesel_price_per_liter);
  items.push({
    cost_type_name: "Brandstof",
    category: "BRANDSTOF",
    amount: fuelCost,
    source: "AUTO",
  });

  // 2. Driver cost
  const driverCost = round2(input.duration_hours * input.driver_hourly_cost);
  items.push({
    cost_type_name: "Chauffeurkosten",
    category: "CHAUFFEUR",
    amount: driverCost,
    source: "AUTO",
  });

  // 3. Waiting time cost
  const waitCost = round2(input.waiting_time_hours * input.driver_hourly_cost);
  items.push({
    cost_type_name: "Wachtgeld",
    category: "CHAUFFEUR",
    amount: waitCost,
    source: "AUTO",
  });

  // 4. Vehicle fixed cost per trip
  const vehicleDailyCost = input.working_days_per_month > 0
    ? round2(input.vehicle_monthly_costs / input.working_days_per_month)
    : 0;
  items.push({
    cost_type_name: "Voertuigkosten (vast)",
    category: "VOERTUIG",
    amount: vehicleDailyCost,
    source: "AUTO",
  });

  const total = round2(items.reduce((sum, item) => sum + item.amount, 0));

  return { items, total };
}

/**
 * Calculate margin from revenue and cost.
 */
export function calculateMargin(revenue: number, cost: number): MarginResult {
  const marginEuro = round2(revenue - cost);
  const marginPercentage = revenue > 0
    ? round2((marginEuro / revenue) * 100)
    : (cost > 0 ? 0 : 0);

  return {
    revenue,
    cost,
    margin_euro: marginEuro,
    margin_percentage: marginPercentage,
  };
}
