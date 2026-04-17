import { describe, it, expect } from "vitest";
import { selectRateCard } from "../../supabase/functions/_shared/rateCardSelector";
import type { RateCard, PricingOrderInput } from "@/types/rateModels";

function card(overrides: Partial<RateCard> & { id: string }): RateCard {
  return {
    tenant_id: "t-1",
    client_id: null,
    name: overrides.id,
    valid_from: null,
    valid_until: null,
    is_active: true,
    currency: "EUR",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    rate_rules: [],
    ...overrides,
  };
}

function order(overrides: Partial<PricingOrderInput> = {}): PricingOrderInput {
  return {
    id: "o-1",
    order_number: 1,
    client_name: null,
    pickup_address: null,
    delivery_address: null,
    transport_type: null,
    weight_kg: null,
    quantity: null,
    distance_km: 100,
    stop_count: 2,
    duration_hours: 1,
    requirements: [],
    day_of_week: 1,
    waiting_time_min: 0,
    pickup_country: "NL",
    delivery_country: "NL",
    ...overrides,
  };
}

describe("selectRateCard", () => {
  it("kiest klant-specifiek boven tenant-default", () => {
    const cards = [
      card({ id: "default", client_id: null }),
      card({ id: "klant-a", client_id: "c-1" }),
    ];
    const result = selectRateCard(cards, order(), "c-1");
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.card.id).toBe("klant-a");
    }
  });

  it("valt terug op tenant-default als klant geen card heeft", () => {
    const cards = [card({ id: "default", client_id: null })];
    const result = selectRateCard(cards, order(), "c-1");
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.card.id).toBe("default");
    }
  });

  it("geeft no_rate_card als er niets is", () => {
    const result = selectRateCard([], order(), "c-1");
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toBe("no_rate_card");
    }
  });

  it("matcht valid_from/valid_until tegen pickup_date, niet now()", () => {
    const cards = [
      card({ id: "jan", client_id: "c-1", valid_from: "2026-01-01", valid_until: "2026-01-31" }),
      card({ id: "feb", client_id: "c-1", valid_from: "2026-02-01", valid_until: "2026-02-28" }),
    ];
    // Order met pickup in januari moet januari-card krijgen
    const result = selectRateCard(cards, order({ pickup_date: "2026-01-15" }), "c-1");
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.card.id).toBe("jan");
    }
  });

  it("scoret traject-match hoger", () => {
    const cards = [
      card({
        id: "algemeen",
        client_id: "c-1",
      }),
      card({
        id: "traject",
        client_id: "c-1",
        rate_rules: [
          {
            id: "r-1",
            rate_card_id: "traject",
            rule_type: "VAST_BEDRAG",
            transport_type: null,
            amount: 300,
            min_amount: null,
            conditions: { from_zone: "NL", to_zone: "DE" },
            sort_order: 0,
            created_at: "2026-01-01T00:00:00Z",
          },
        ],
      }),
    ];
    const result = selectRateCard(
      cards,
      order({ pickup_country: "NL", delivery_country: "DE" }),
      "c-1",
    );
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.card.id).toBe("traject");
    }
  });

  it("detecteert ambiguous bij gelijke score", () => {
    const cards = [
      card({ id: "a", client_id: "c-1" }),
      card({ id: "b", client_id: "c-1" }),
    ];
    const result = selectRateCard(cards, order(), "c-1");
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toBe("ambiguous_rate_cards");
      expect(result.candidates).toHaveLength(2);
    }
  });

  it("slaat inactieve cards over", () => {
    const cards = [
      card({ id: "uit", client_id: "c-1", is_active: false }),
      card({ id: "aan", client_id: "c-1" }),
    ];
    const result = selectRateCard(cards, order(), "c-1");
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.card.id).toBe("aan");
    }
  });
});
