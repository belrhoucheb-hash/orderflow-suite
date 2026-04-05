import { describe, it, expect } from "vitest";
import { calculateWithConfidence } from "@/lib/pricingEngine";
import type { PricingOrderInput, RateCard, Surcharge } from "@/types/rateModels";

// ─── Fixtures ──────────────────────────────────────────────────

const baseOrder: PricingOrderInput = {
  id: "order-1",
  order_number: 1001,
  client_name: "Test BV",
  pickup_address: "Amsterdam",
  delivery_address: "Rotterdam",
  transport_type: "FTL",
  weight_kg: 5000,
  quantity: 10,
  distance_km: 80,
  stop_count: 2,
  duration_hours: 1.5,
  requirements: [],
  day_of_week: 2,
  waiting_time_min: 0,
  pickup_country: "NL",
  delivery_country: "NL",
};

const zoneRateCard: RateCard = {
  id: "rc-1",
  tenant_id: "tenant-1",
  client_id: "client-1",
  name: "Zone tarief kaart",
  valid_from: null,
  valid_until: null,
  is_active: true,
  currency: "EUR",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  rate_rules: [
    {
      id: "rule-1",
      rate_card_id: "rc-1",
      rule_type: "ZONE_TARIEF",
      transport_type: null,
      amount: 250,
      min_amount: null,
      conditions: { from_zone: "NL", to_zone: "NL" },
      sort_order: 1,
      created_at: "2026-01-01T00:00:00Z",
    },
  ],
};

const perKmRateCard: RateCard = {
  id: "rc-2",
  tenant_id: "tenant-1",
  client_id: "client-1",
  name: "Per KM kaart",
  valid_from: null,
  valid_until: null,
  is_active: true,
  currency: "EUR",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  rate_rules: [
    {
      id: "rule-2",
      rate_card_id: "rc-2",
      rule_type: "PER_KM",
      transport_type: null,
      amount: 1.5,
      min_amount: null,
      conditions: {},
      sort_order: 1,
      created_at: "2026-01-01T00:00:00Z",
    },
  ],
};

const surcharges: Surcharge[] = [];

const manySurcharges: Surcharge[] = [
  {
    id: "s-1",
    tenant_id: "tenant-1",
    name: "Weekend toeslag",
    surcharge_type: "PERCENTAGE",
    amount: 25,
    applies_to: { day_of_week: [0, 6] },
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "s-2",
    tenant_id: "tenant-1",
    name: "ADR toeslag",
    surcharge_type: "VAST_BEDRAG",
    amount: 75,
    applies_to: { requirements: ["ADR"] },
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "s-3",
    tenant_id: "tenant-1",
    name: "Afstand toeslag",
    surcharge_type: "PER_KM",
    amount: 0.1,
    applies_to: {},
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

// ─── Tests ─────────────────────────────────────────────────────

describe("calculateWithConfidence", () => {
  it("should return high confidence for ZONE_TARIEF with no surcharges", () => {
    const result = calculateWithConfidence(baseOrder, zoneRateCard, surcharges);
    expect(result.confidence).toBeGreaterThanOrEqual(90);
    expect(result.totaal).toBe(250);
    expect(result.basisbedrag).toBe(250);
  });

  it("should return medium confidence for PER_KM rules", () => {
    const result = calculateWithConfidence(baseOrder, perKmRateCard, surcharges);
    expect(result.confidence).toBeGreaterThanOrEqual(70);
    expect(result.confidence).toBeLessThan(90);
    expect(result.totaal).toBe(120); // 80km * 1.5
  });

  it("should reduce confidence when many surcharges are active", () => {
    const orderWithADR: PricingOrderInput = {
      ...baseOrder,
      requirements: ["ADR"],
      day_of_week: 6, // Saturday
    };
    const withSurcharges = calculateWithConfidence(orderWithADR, zoneRateCard, manySurcharges);
    const withoutSurcharges = calculateWithConfidence(baseOrder, zoneRateCard, surcharges);
    expect(withSurcharges.confidence).toBeLessThan(withoutSurcharges.confidence);
  });

  it("should boost confidence with high historical accuracy", () => {
    const withHistory = calculateWithConfidence(baseOrder, zoneRateCard, surcharges, 98);
    const withoutHistory = calculateWithConfidence(baseOrder, zoneRateCard, surcharges);
    expect(withHistory.confidence).toBeGreaterThanOrEqual(withoutHistory.confidence);
  });

  it("should lower confidence with low historical accuracy", () => {
    const withBadHistory = calculateWithConfidence(baseOrder, zoneRateCard, surcharges, 60);
    const withoutHistory = calculateWithConfidence(baseOrder, zoneRateCard, surcharges);
    expect(withBadHistory.confidence).toBeLessThan(withoutHistory.confidence);
  });
});
