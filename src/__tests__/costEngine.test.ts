import { describe, it, expect } from "vitest";
import { calculateTripCosts, calculateMargin } from "@/lib/costEngine";
import type { CostCalculationInput } from "@/types/costModels";

const baseInput: CostCalculationInput = {
  trip_id: "trip-1", distance_km: 200, duration_hours: 4, stop_count: 3,
  fuel_consumption_per_100km: 28, diesel_price_per_liter: 1.85,
  driver_hourly_cost: 35, waiting_time_hours: 0.5,
  vehicle_monthly_costs: 2400, working_days_per_month: 22,
};

describe("calculateTripCosts", () => {
  it("calculates fuel cost correctly", () => { const r = calculateTripCosts(baseInput); expect(r.items.find(i => i.category === "BRANDSTOF")!.amount).toBe(103.6); });
  it("calculates driver cost correctly", () => { const r = calculateTripCosts(baseInput); expect(r.items.find(i => i.cost_type_name === "Chauffeurkosten")!.amount).toBe(140); });
  it("calculates waiting time cost correctly", () => { const r = calculateTripCosts(baseInput); expect(r.items.find(i => i.cost_type_name === "Wachtgeld")!.amount).toBe(17.5); });
  it("calculates vehicle fixed cost per trip correctly", () => { const r = calculateTripCosts(baseInput); expect(r.items.find(i => i.category === "VOERTUIG")!.amount).toBe(109.09); });
  it("calculates total correctly", () => { expect(calculateTripCosts(baseInput).total).toBe(370.19); });
  it("handles zero distance", () => { expect(calculateTripCosts({ ...baseInput, distance_km: 0 }).items.find(i => i.category === "BRANDSTOF")!.amount).toBe(0); });
  it("handles zero waiting time", () => { expect(calculateTripCosts({ ...baseInput, waiting_time_hours: 0 }).items.find(i => i.cost_type_name === "Wachtgeld")!.amount).toBe(0); });
  it("handles zero vehicle monthly costs", () => { expect(calculateTripCosts({ ...baseInput, vehicle_monthly_costs: 0 }).items.find(i => i.category === "VOERTUIG")!.amount).toBe(0); });
});

describe("calculateMargin", () => {
  it("calculates margin correctly", () => { const m = calculateMargin(500, 300); expect(m.margin_euro).toBe(200); expect(m.margin_percentage).toBe(40); });
  it("handles zero revenue", () => { expect(calculateMargin(0, 100).margin_percentage).toBe(0); });
  it("handles negative margin", () => { const m = calculateMargin(200, 350); expect(m.margin_euro).toBe(-150); expect(m.margin_percentage).toBe(-75); });
  it("handles zero cost", () => { expect(calculateMargin(500, 0).margin_percentage).toBe(100); });
  it("handles both zero", () => { expect(calculateMargin(0, 0).margin_euro).toBe(0); });
});
