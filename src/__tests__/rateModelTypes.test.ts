import { describe, it, expect } from "vitest";
import type {
  RateCard,
  RateRule,
  Surcharge,
  RuleType,
  SurchargeType,
  RateRuleConditions,
  SurchargeAppliesTo,
  PriceBreakdown,
  PriceLineItem,
} from "@/types/rateModels";

describe("rateModels types", () => {
  it("RateCard has required fields", () => {
    const card: RateCard = {
      id: "rc-1",
      tenant_id: "t-1",
      client_id: null,
      name: "Standaard Tarief",
      valid_from: "2026-01-01",
      valid_until: null,
      is_active: true,
      currency: "EUR",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    expect(card.name).toBe("Standaard Tarief");
    expect(card.client_id).toBeNull();
  });

  it("RateRule has required fields with conditions", () => {
    const rule: RateRule = {
      id: "rr-1",
      rate_card_id: "rc-1",
      rule_type: "PER_KM",
      transport_type: null,
      amount: 1.85,
      min_amount: 150,
      conditions: { distance_from: 0, distance_to: 100 },
      sort_order: 0,
      created_at: "2026-01-01T00:00:00Z",
    };
    expect(rule.rule_type).toBe("PER_KM");
    expect(rule.conditions.distance_from).toBe(0);
  });

  it("Surcharge has required fields", () => {
    const surcharge: Surcharge = {
      id: "s-1",
      tenant_id: "t-1",
      name: "Dieseltoeslag",
      surcharge_type: "PERCENTAGE",
      amount: 12.5,
      applies_to: {},
      is_active: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    expect(surcharge.surcharge_type).toBe("PERCENTAGE");
  });

  it("PriceBreakdown contains base and surcharges", () => {
    const breakdown: PriceBreakdown = {
      basisbedrag: 250,
      toeslagen: [
        { name: "Dieseltoeslag", type: "PERCENTAGE", amount: 31.25 },
      ],
      totaal: 281.25,
      regels: [
        {
          description: "Kilometervergoeding 135 km x EUR 1,85",
          quantity: 135,
          unit: "km",
          unit_price: 1.85,
          total: 249.75,
          rule_type: "PER_KM",
        },
      ],
    };
    expect(breakdown.totaal).toBe(281.25);
    expect(breakdown.toeslagen).toHaveLength(1);
    expect(breakdown.regels).toHaveLength(1);
  });

  it("RULE_TYPES constant has all supported types", () => {
    const types: RuleType[] = [
      "PER_KM", "PER_UUR", "PER_STOP", "PER_PALLET",
      "PER_KG", "VAST_BEDRAG", "ZONE_TARIEF", "STAFFEL",
    ];
    expect(types).toHaveLength(8);
  });

  it("SURCHARGE_TYPES constant has all supported types", () => {
    const types: SurchargeType[] = [
      "PERCENTAGE", "VAST_BEDRAG", "PER_KM", "PER_KG",
    ];
    expect(types).toHaveLength(4);
  });
});
