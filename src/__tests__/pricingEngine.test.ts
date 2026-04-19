import { describe, it, expect } from "vitest";
import { calculateOrderPrice } from "@/lib/pricingEngine";
import type { RateCard, RateRule, Surcharge, PricingOrderInput } from "@/types/rateModels";

const baseOrder: PricingOrderInput = {
  id: "order-1",
  order_number: 1001,
  client_name: "Test B.V.",
  pickup_address: "Amsterdam",
  delivery_address: "Rotterdam",
  transport_type: "standaard",
  weight_kg: 800,
  quantity: 10,
  distance_km: 80,
  stop_count: 2,
  duration_hours: 2.5,
  requirements: [],
  day_of_week: 1, // Monday
  waiting_time_min: 0,
  pickup_country: "NL",
  delivery_country: "NL",
};

const baseRateCard: RateCard = {
  id: "rc-1",
  tenant_id: "t-1",
  client_id: "c-1",
  name: "Test Tarief",
  valid_from: null,
  valid_until: null,
  is_active: true,
  currency: "EUR",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function makeRule(overrides: Partial<RateRule> & { rule_type: RateRule["rule_type"]; amount: number }): RateRule {
  return {
    id: `rr-${Math.random().toString(36).slice(2, 8)}`,
    rate_card_id: "rc-1",
    transport_type: null,
    min_amount: null,
    conditions: {},
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("calculateOrderPrice", () => {
  it("calculates PER_KM rate correctly", () => {
    const rules: RateRule[] = [makeRule({ rule_type: "PER_KM", amount: 1.85 })];
    const result = calculateOrderPrice(baseOrder, { ...baseRateCard, rate_rules: rules }, []);
    expect(result.basisbedrag).toBe(148); // 80 km * 1.85
    expect(result.regels).toHaveLength(1);
    expect(result.regels[0].unit).toBe("km");
    expect(result.regels[0].quantity).toBe(80);
    expect(result.totaal).toBe(148);
  });

  it("calculates PER_PALLET rate correctly", () => {
    const rules: RateRule[] = [makeRule({ rule_type: "PER_PALLET", amount: 25 })];
    const result = calculateOrderPrice(baseOrder, { ...baseRateCard, rate_rules: rules }, []);
    expect(result.basisbedrag).toBe(250); // 10 pallets * 25
    expect(result.regels[0].quantity).toBe(10);
  });

  it("calculates PER_KG rate correctly", () => {
    const rules: RateRule[] = [makeRule({ rule_type: "PER_KG", amount: 0.15 })];
    const result = calculateOrderPrice(baseOrder, { ...baseRateCard, rate_rules: rules }, []);
    expect(result.basisbedrag).toBe(120); // 800 kg * 0.15
  });

  it("calculates PER_UUR rate correctly", () => {
    const rules: RateRule[] = [makeRule({ rule_type: "PER_UUR", amount: 55 })];
    const result = calculateOrderPrice(baseOrder, { ...baseRateCard, rate_rules: rules }, []);
    expect(result.basisbedrag).toBe(137.5); // 2.5 hours * 55
  });

  it("calculates PER_STOP rate correctly", () => {
    const rules: RateRule[] = [makeRule({ rule_type: "PER_STOP", amount: 35 })];
    const result = calculateOrderPrice(baseOrder, { ...baseRateCard, rate_rules: rules }, []);
    expect(result.basisbedrag).toBe(70); // 2 stops * 35
  });

  it("calculates VAST_BEDRAG rate correctly", () => {
    const rules: RateRule[] = [makeRule({ rule_type: "VAST_BEDRAG", amount: 450 })];
    const result = calculateOrderPrice(baseOrder, { ...baseRateCard, rate_rules: rules }, []);
    expect(result.basisbedrag).toBe(450);
    expect(result.regels[0].quantity).toBe(1);
  });

  it("calculates ZONE_TARIEF with matching zone", () => {
    const rules: RateRule[] = [
      makeRule({
        rule_type: "ZONE_TARIEF",
        amount: 350,
        conditions: { from_zone: "NL", to_zone: "NL" },
      }),
    ];
    const result = calculateOrderPrice(baseOrder, { ...baseRateCard, rate_rules: rules }, []);
    expect(result.basisbedrag).toBe(350);
  });

  it("skips ZONE_TARIEF with non-matching zone", () => {
    const rules: RateRule[] = [
      makeRule({
        rule_type: "ZONE_TARIEF",
        amount: 650,
        conditions: { from_zone: "NL", to_zone: "DE" },
      }),
    ];
    const result = calculateOrderPrice(baseOrder, { ...baseRateCard, rate_rules: rules }, []);
    expect(result.basisbedrag).toBe(0);
    expect(result.regels).toHaveLength(0);
  });

  it("applies STAFFEL weight tier correctly", () => {
    const rules: RateRule[] = [
      makeRule({
        rule_type: "STAFFEL",
        amount: 0.15,
        conditions: { weight_from: 0, weight_to: 500 },
      }),
      makeRule({
        rule_type: "STAFFEL",
        amount: 0.12,
        conditions: { weight_from: 500, weight_to: 1000 },
      }),
    ];
    // Order weight is 800kg, falls in second tier
    const result = calculateOrderPrice(baseOrder, { ...baseRateCard, rate_rules: rules }, []);
    expect(result.basisbedrag).toBe(96); // 800 * 0.12
  });

  it("applies STAFFEL distance tier correctly", () => {
    const rules: RateRule[] = [
      makeRule({
        rule_type: "STAFFEL",
        amount: 2.10,
        conditions: { distance_from: 0, distance_to: 50 },
      }),
      makeRule({
        rule_type: "STAFFEL",
        amount: 1.85,
        conditions: { distance_from: 50, distance_to: 150 },
      }),
    ];
    // Order distance is 80km, falls in second tier
    const result = calculateOrderPrice(baseOrder, { ...baseRateCard, rate_rules: rules }, []);
    expect(result.basisbedrag).toBe(148); // 80 * 1.85
  });

  it("respects min_amount on rules", () => {
    const rules: RateRule[] = [
      makeRule({ rule_type: "PER_KM", amount: 1.85, min_amount: 200 }),
    ];
    // 80 km * 1.85 = 148, but min_amount is 200
    const result = calculateOrderPrice(baseOrder, { ...baseRateCard, rate_rules: rules }, []);
    expect(result.basisbedrag).toBe(200);
    expect(result.totaal).toBe(200);
  });

  it("filters rules by transport_type", () => {
    const rules: RateRule[] = [
      makeRule({ rule_type: "PER_KM", amount: 2.10, transport_type: "koeltransport" }),
      makeRule({ rule_type: "PER_KM", amount: 1.85, transport_type: "standaard" }),
    ];
    const result = calculateOrderPrice(baseOrder, { ...baseRateCard, rate_rules: rules }, []);
    // Only the standaard rule should match
    expect(result.regels).toHaveLength(1);
    expect(result.basisbedrag).toBe(148); // 80 * 1.85
  });

  it("includes rules with null transport_type (applies to all)", () => {
    const rules: RateRule[] = [
      makeRule({ rule_type: "VAST_BEDRAG", amount: 50, transport_type: null }),
    ];
    const result = calculateOrderPrice(baseOrder, { ...baseRateCard, rate_rules: rules }, []);
    expect(result.basisbedrag).toBe(50);
  });

  it("applies PERCENTAGE surcharge", () => {
    const rules: RateRule[] = [makeRule({ rule_type: "VAST_BEDRAG", amount: 400 })];
    const surcharges: Surcharge[] = [{
      id: "s-1",
      tenant_id: "t-1",
      name: "Dieseltoeslag",
      surcharge_type: "PERCENTAGE",
      amount: 12.5,
      applies_to: {},
      is_active: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    }];
    const result = calculateOrderPrice(baseOrder, { ...baseRateCard, rate_rules: rules }, surcharges);
    expect(result.basisbedrag).toBe(400);
    expect(result.toeslagen).toHaveLength(1);
    expect(result.toeslagen[0].amount).toBe(50); // 12.5% of 400
    expect(result.totaal).toBe(450);
  });

  it("applies VAST_BEDRAG surcharge", () => {
    const rules: RateRule[] = [makeRule({ rule_type: "VAST_BEDRAG", amount: 200 })];
    const surcharges: Surcharge[] = [{
      id: "s-1",
      tenant_id: "t-1",
      name: "ADR Toeslag",
      surcharge_type: "VAST_BEDRAG",
      amount: 75,
      applies_to: { requirements: ["ADR"] },
      is_active: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    }];
    // Order without ADR requirement
    const result = calculateOrderPrice(baseOrder, { ...baseRateCard, rate_rules: rules }, surcharges);
    expect(result.toeslagen).toHaveLength(0);
    expect(result.totaal).toBe(200);

    // Order with ADR requirement
    const adrOrder = { ...baseOrder, requirements: ["ADR"] };
    const result2 = calculateOrderPrice(adrOrder, { ...baseRateCard, rate_rules: rules }, surcharges);
    expect(result2.toeslagen).toHaveLength(1);
    expect(result2.toeslagen[0].amount).toBe(75);
    expect(result2.totaal).toBe(275);
  });

  it("applies weekend surcharge on Saturday/Sunday", () => {
    const rules: RateRule[] = [makeRule({ rule_type: "VAST_BEDRAG", amount: 300 })];
    const surcharges: Surcharge[] = [{
      id: "s-1",
      tenant_id: "t-1",
      name: "Weekendtoeslag",
      surcharge_type: "PERCENTAGE",
      amount: 25,
      applies_to: { day_of_week: [0, 6] },
      is_active: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    }];
    // Monday (day 1) - no surcharge
    const result = calculateOrderPrice(baseOrder, { ...baseRateCard, rate_rules: rules }, surcharges);
    expect(result.toeslagen).toHaveLength(0);

    // Saturday (day 6) - surcharge applies
    const satOrder = { ...baseOrder, day_of_week: 6 };
    const result2 = calculateOrderPrice(satOrder, { ...baseRateCard, rate_rules: rules }, surcharges);
    expect(result2.toeslagen).toHaveLength(1);
    expect(result2.toeslagen[0].amount).toBe(75); // 25% of 300
    expect(result2.totaal).toBe(375);
  });

  it("applies waiting time surcharge", () => {
    const rules: RateRule[] = [makeRule({ rule_type: "VAST_BEDRAG", amount: 200 })];
    const surcharges: Surcharge[] = [{
      id: "s-1",
      tenant_id: "t-1",
      name: "Wachtgeld",
      surcharge_type: "VAST_BEDRAG",
      amount: 45,
      applies_to: { waiting_time_above_min: 30 },
      is_active: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    }];
    // No waiting time
    const result = calculateOrderPrice(baseOrder, { ...baseRateCard, rate_rules: rules }, surcharges);
    expect(result.toeslagen).toHaveLength(0);

    // 45 min waiting > 30 min threshold
    const waitOrder = { ...baseOrder, waiting_time_min: 45 };
    const result2 = calculateOrderPrice(waitOrder, { ...baseRateCard, rate_rules: rules }, surcharges);
    expect(result2.toeslagen).toHaveLength(1);
    expect(result2.totaal).toBe(245);
  });

  it("applies PER_KM surcharge", () => {
    const rules: RateRule[] = [makeRule({ rule_type: "VAST_BEDRAG", amount: 200 })];
    const surcharges: Surcharge[] = [{
      id: "s-1",
      tenant_id: "t-1",
      name: "Brandstoftoeslag",
      surcharge_type: "PER_KM",
      amount: 0.15,
      applies_to: {},
      is_active: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    }];
    const result = calculateOrderPrice(baseOrder, { ...baseRateCard, rate_rules: rules }, surcharges);
    expect(result.toeslagen[0].amount).toBe(12); // 80 km * 0.15
    expect(result.totaal).toBe(212);
  });

  it("applies PER_KG surcharge", () => {
    const rules: RateRule[] = [makeRule({ rule_type: "VAST_BEDRAG", amount: 200 })];
    const surcharges: Surcharge[] = [{
      id: "s-1",
      tenant_id: "t-1",
      name: "Zwaartoeslag",
      surcharge_type: "PER_KG",
      amount: 0.05,
      applies_to: {},
      is_active: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    }];
    const result = calculateOrderPrice(baseOrder, { ...baseRateCard, rate_rules: rules }, surcharges);
    expect(result.toeslagen[0].amount).toBe(40); // 800 kg * 0.05
    expect(result.totaal).toBe(240);
  });

  it("combines multiple rules and surcharges", () => {
    const rules: RateRule[] = [
      makeRule({ rule_type: "PER_KM", amount: 1.50, sort_order: 0 }),
      makeRule({ rule_type: "PER_PALLET", amount: 10, sort_order: 1 }),
    ];
    const surcharges: Surcharge[] = [{
      id: "s-1",
      tenant_id: "t-1",
      name: "Dieseltoeslag",
      surcharge_type: "PERCENTAGE",
      amount: 10,
      applies_to: {},
      is_active: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    }];
    const result = calculateOrderPrice(baseOrder, { ...baseRateCard, rate_rules: rules }, surcharges);
    // Base: 80*1.50 + 10*10 = 120 + 100 = 220
    expect(result.basisbedrag).toBe(220);
    // Surcharge: 10% of 220 = 22
    expect(result.toeslagen[0].amount).toBe(22);
    expect(result.totaal).toBe(242);
  });

  it("returns zero breakdown for empty rules", () => {
    const result = calculateOrderPrice(baseOrder, { ...baseRateCard, rate_rules: [] }, []);
    expect(result.basisbedrag).toBe(0);
    expect(result.totaal).toBe(0);
    expect(result.regels).toHaveLength(0);
    expect(result.toeslagen).toHaveLength(0);
  });

  it("handles rate card with no rate_rules property", () => {
    const result = calculateOrderPrice(baseOrder, baseRateCard, []);
    expect(result.basisbedrag).toBe(0);
    expect(result.totaal).toBe(0);
  });

  it("skips inactive surcharges", () => {
    const rules: RateRule[] = [makeRule({ rule_type: "VAST_BEDRAG", amount: 100 })];
    const surcharges: Surcharge[] = [{
      id: "s-1",
      tenant_id: "t-1",
      name: "Inactive",
      surcharge_type: "PERCENTAGE",
      amount: 50,
      applies_to: {},
      is_active: false,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    }];
    const result = calculateOrderPrice(baseOrder, { ...baseRateCard, rate_rules: rules }, surcharges);
    expect(result.toeslagen).toHaveLength(0);
    expect(result.totaal).toBe(100);
  });

  describe("diesel_included matching", () => {
    it("picks the PER_KM rule that matches diesel_included=true", () => {
      const rules: RateRule[] = [
        makeRule({ rule_type: "PER_KM", amount: 1.16, conditions: { diesel_included: false } }),
        makeRule({ rule_type: "PER_KM", amount: 1.52, conditions: { diesel_included: true } }),
      ];
      const order = { ...baseOrder, diesel_included: true };
      const result = calculateOrderPrice(order, { ...baseRateCard, rate_rules: rules }, []);
      expect(result.regels).toHaveLength(1);
      expect(result.regels[0].unit_price).toBe(1.52);
    });

    it("picks the PER_KM rule that matches diesel_included=false", () => {
      const rules: RateRule[] = [
        makeRule({ rule_type: "PER_KM", amount: 1.16, conditions: { diesel_included: false } }),
        makeRule({ rule_type: "PER_KM", amount: 1.52, conditions: { diesel_included: true } }),
      ];
      const order = { ...baseOrder, diesel_included: false };
      const result = calculateOrderPrice(order, { ...baseRateCard, rate_rules: rules }, []);
      expect(result.regels).toHaveLength(1);
      expect(result.regels[0].unit_price).toBe(1.16);
    });

    it("matches both if caller omits diesel_included", () => {
      const rules: RateRule[] = [
        makeRule({ rule_type: "PER_KM", amount: 1.16, conditions: { diesel_included: false } }),
        makeRule({ rule_type: "PER_KM", amount: 1.52, conditions: { diesel_included: true } }),
      ];
      const result = calculateOrderPrice(baseOrder, { ...baseRateCard, rate_rules: rules }, []);
      expect(result.regels).toHaveLength(2);
    });
  });

  describe("optional purpose matching", () => {
    it("skips rule with conditions.optional=true when purpose not requested", () => {
      const rules: RateRule[] = [
        makeRule({ rule_type: "PER_KM", amount: 1.52 }),
        makeRule({ rule_type: "VAST_BEDRAG", amount: 107.5, conditions: { optional: true, purpose: "screening" } }),
      ];
      const result = calculateOrderPrice(baseOrder, { ...baseRateCard, rate_rules: rules }, []);
      expect(result.regels).toHaveLength(1);
      expect(result.basisbedrag).toBe(121.6); // alleen de PER_KM
    });

    it("includes rule with conditions.optional=true when purpose is requested", () => {
      const rules: RateRule[] = [
        makeRule({ rule_type: "PER_KM", amount: 1.52 }),
        makeRule({ rule_type: "VAST_BEDRAG", amount: 107.5, conditions: { optional: true, purpose: "screening" } }),
      ];
      const order = { ...baseOrder, include_optional_purposes: ["screening"] };
      const result = calculateOrderPrice(order, { ...baseRateCard, rate_rules: rules }, []);
      expect(result.regels).toHaveLength(2);
      expect(result.basisbedrag).toBe(229.1); // 121.6 + 107.5
    });
  });
});
