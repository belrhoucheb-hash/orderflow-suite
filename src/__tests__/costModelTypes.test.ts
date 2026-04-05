import { describe, it, expect } from "vitest";
import type {
  CostType,
  CostCategory,
  CalculationMethod,
  TripCost,
  CostSource,
  VehicleFixedCost,
  TripCostBreakdown,
  MarginResult,
} from "@/types/costModels";

describe("costModels types", () => {
  it("CostType has required fields", () => {
    const ct: CostType = {
      id: "ct-1",
      tenant_id: "t-1",
      name: "Brandstof",
      category: "BRANDSTOF",
      calculation_method: "PER_KM",
      default_rate: 0.35,
      is_active: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    expect(ct.category).toBe("BRANDSTOF");
    expect(ct.calculation_method).toBe("PER_KM");
  });

  it("TripCost has required fields", () => {
    const tc: TripCost = {
      id: "tc-1",
      tenant_id: "t-1",
      trip_id: "trip-1",
      cost_type_id: "ct-1",
      amount: 45.50,
      quantity: 130,
      rate: 0.35,
      source: "AUTO",
      notes: null,
      created_at: "2026-01-01T00:00:00Z",
    };
    expect(tc.source).toBe("AUTO");
  });

  it("VehicleFixedCost has required fields", () => {
    const vfc: VehicleFixedCost = {
      id: "vfc-1",
      tenant_id: "t-1",
      vehicle_id: "v-1",
      cost_type_id: "ct-1",
      monthly_amount: 1200,
      valid_from: "2026-01-01",
      valid_until: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    expect(vfc.monthly_amount).toBe(1200);
  });

  it("TripCostBreakdown contains items and total", () => {
    const breakdown: TripCostBreakdown = {
      items: [
        { cost_type_name: "Brandstof", category: "BRANDSTOF", amount: 45.50, source: "AUTO" },
        { cost_type_name: "Chauffeur", category: "CHAUFFEUR", amount: 120, source: "AUTO" },
      ],
      total: 165.50,
    };
    expect(breakdown.items).toHaveLength(2);
    expect(breakdown.total).toBe(165.50);
  });

  it("MarginResult has revenue, cost, margin", () => {
    const margin: MarginResult = {
      revenue: 450,
      cost: 165.50,
      margin_euro: 284.50,
      margin_percentage: 63.22,
    };
    expect(margin.margin_euro).toBe(284.50);
  });

  it("COST_CATEGORIES constant has all categories", () => {
    const cats: CostCategory[] = ["BRANDSTOF", "TOL", "CHAUFFEUR", "VOERTUIG", "OVERIG"];
    expect(cats).toHaveLength(5);
  });

  it("CALCULATION_METHODS constant has all methods", () => {
    const methods: CalculationMethod[] = ["PER_KM", "PER_UUR", "PER_RIT", "PER_STOP", "HANDMATIG"];
    expect(methods).toHaveLength(5);
  });
});
