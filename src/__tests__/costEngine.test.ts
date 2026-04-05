import { describe, it, expect } from "vitest";
import { calculateTripCosts, calculateMargin } from "@/lib/costEngine";
import type { CostCalculationInput, MarginResult } from "@/types/costModels";

const baseInput: CostCalculationInput = {
  trip_id: "trip-1",
  distance_km: 200,
  duration_hours: 4,
  stop_count: 3,
  fuel_consumption_per_100km: 28, // liters
  diesel_price_per_liter: 1.85,
  driver_hourly_cost: 35,
  waiting_time_hours: 0.5,
  vehicle_monthly_costs: 2400,
  working_days_per_month: 22,
};

describe("calculateTripCosts", () => {
  it("calculates fuel cost correctly", () => {
    const result = calculateTripCosts(baseInput);
    const fuel = result.items.find((i) => i.category === "BRANDSTOF");
    expect(fuel).toBeDefined();
    // 200 km * (28/100) * 1.85 = 200 * 0.28 * 1.85 = 103.6
    expect(fuel!.amount).toBe(103.6);
  });

  it("calculates driver cost correctly", () => {
    const result = calculateTripCosts(baseInput);
    const driver = result.items.find((i) => i.cost_type_name === "Chauffeurkosten");
    expect(driver).toBeDefined();
    // 4 hours * 35 = 140
    expect(driver!.amount).toBe(140);
  });

  it("calculates waiting time cost correctly", () => {
    const result = calculateTripCosts(baseInput);
    const wait = result.items.find((i) => i.cost_type_name === "Wachtgeld");
    expect(wait).toBeDefined();
    // 0.5 hours * 35 = 17.5
    expect(wait!.amount).toBe(17.5);
  });

  it("calculates vehicle fixed cost per trip correctly", () => {
    const result = calculateTripCosts(baseInput);
    const vehicle = result.items.find((i) => i.category === "VOERTUIG");
    expect(vehicle).toBeDefined();
    // 2400 / 22 = 109.09
    expect(vehicle!.amount).toBe(109.09);
  });

  it("calculates total correctly", () => {
    const result = calculateTripCosts(baseInput);
    // 103.6 + 140 + 17.5 + 109.09 = 370.19
    expect(result.total).toBe(370.19);
  });

  it("handles zero distance", () => {
    const input = { ...baseInput, distance_km: 0 };
    const result = calculateTripCosts(input);
    const fuel = result.items.find((i) => i.category === "BRANDSTOF");
    expect(fuel!.amount).toBe(0);
  });

  it("handles zero waiting time", () => {
    const input = { ...baseInput, waiting_time_hours: 0 };
    const result = calculateTripCosts(input);
    const wait = result.items.find((i) => i.cost_type_name === "Wachtgeld");
    expect(wait!.amount).toBe(0);
  });

  it("handles zero vehicle monthly costs", () => {
    const input = { ...baseInput, vehicle_monthly_costs: 0 };
    const result = calculateTripCosts(input);
    const vehicle = result.items.find((i) => i.category === "VOERTUIG");
    expect(vehicle!.amount).toBe(0);
  });
});

describe("calculateMargin", () => {
  it("calculates margin correctly", () => {
    const margin = calculateMargin(500, 300);
    expect(margin.revenue).toBe(500);
    expect(margin.cost).toBe(300);
    expect(margin.margin_euro).toBe(200);
    expect(margin.margin_percentage).toBe(40);
  });

  it("handles zero revenue", () => {
    const margin = calculateMargin(0, 100);
    expect(margin.margin_euro).toBe(-100);
    expect(margin.margin_percentage).toBe(0);
  });

  it("handles negative margin", () => {
    const margin = calculateMargin(200, 350);
    expect(margin.margin_euro).toBe(-150);
    expect(margin.margin_percentage).toBe(-75);
  });

  it("handles zero cost", () => {
    const margin = calculateMargin(500, 0);
    expect(margin.margin_euro).toBe(500);
    expect(margin.margin_percentage).toBe(100);
  });

  it("handles both zero", () => {
    const margin = calculateMargin(0, 0);
    expect(margin.margin_euro).toBe(0);
    expect(margin.margin_percentage).toBe(0);
  });
});
