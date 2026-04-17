import { describe, it, expect } from "vitest";
import {
  timeInWindow,
  getDayType,
  surchargeMatchesTime,
} from "../../supabase/functions/_shared/timeWindow";
import type { Surcharge, PricingOrderInput } from "@/types/rateModels";

describe("timeInWindow", () => {
  it("matcht 07:30 binnen 06:00-08:00", () => {
    expect(timeInWindow("07:30", "06:00", "08:00")).toBe(true);
  });

  it("matcht 08:00 niet binnen 06:00-08:00 (exclusief einde)", () => {
    expect(timeInWindow("08:00", "06:00", "08:00")).toBe(false);
  });

  it("matcht 23:30 binnen nachtvenster 22:00-06:00", () => {
    expect(timeInWindow("23:30", "22:00", "06:00")).toBe(true);
  });

  it("matcht 02:00 binnen nachtvenster 22:00-06:00", () => {
    expect(timeInWindow("02:00", "22:00", "06:00")).toBe(true);
  });

  it("matcht 12:00 niet binnen nachtvenster 22:00-06:00", () => {
    expect(timeInWindow("12:00", "22:00", "06:00")).toBe(false);
  });
});

describe("getDayType", () => {
  it("zaterdag 2026-05-02", () => {
    expect(getDayType("2026-05-02")).toBe("saturday");
  });
  it("zondag 2026-05-03", () => {
    expect(getDayType("2026-05-03")).toBe("sunday");
  });
  it("maandag is weekday", () => {
    expect(getDayType("2026-05-04")).toBe("weekday");
  });
});

function makeOrder(overrides: Partial<PricingOrderInput> = {}): PricingOrderInput {
  return {
    id: "o-1",
    order_number: 1,
    client_name: null,
    pickup_address: null,
    delivery_address: null,
    transport_type: null,
    weight_kg: null,
    quantity: null,
    distance_km: 0,
    stop_count: 1,
    duration_hours: 0,
    requirements: [],
    day_of_week: 1,
    waiting_time_min: 0,
    ...overrides,
  };
}

function makeSurcharge(overrides: Partial<Surcharge>): Surcharge {
  return {
    id: "s-1",
    tenant_id: "t-1",
    name: "Test",
    surcharge_type: "PERCENTAGE",
    amount: 10,
    applies_to: {},
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("surchargeMatchesTime", () => {
  it("matcht wanneer geen tijd/dag voorwaarden gezet zijn", () => {
    expect(surchargeMatchesTime(makeSurcharge({}), makeOrder())).toBe(true);
  });

  it("matcht zaterdagtoeslag op zaterdag", () => {
    const order = makeOrder({ pickup_date: "2026-05-02" });
    const surcharge = makeSurcharge({ day_type: "saturday" });
    expect(surchargeMatchesTime(surcharge, order)).toBe(true);
  });

  it("matcht zaterdagtoeslag niet op maandag", () => {
    const order = makeOrder({ pickup_date: "2026-05-04" });
    const surcharge = makeSurcharge({ day_type: "saturday" });
    expect(surchargeMatchesTime(surcharge, order)).toBe(false);
  });

  it("matcht ochtendtoeslag op 07:00", () => {
    const order = makeOrder({ pickup_time_local: "07:00" });
    const surcharge = makeSurcharge({ time_from: "00:00", time_to: "08:00" });
    expect(surchargeMatchesTime(surcharge, order)).toBe(true);
  });

  it("matcht nacht-venster over middernacht op 01:30", () => {
    const order = makeOrder({ pickup_time_local: "01:30" });
    const surcharge = makeSurcharge({ time_from: "22:00", time_to: "06:00" });
    expect(surchargeMatchesTime(surcharge, order)).toBe(true);
  });

  it("matcht gecombineerde zaterdag-ochtend-toeslag", () => {
    const order = makeOrder({ pickup_date: "2026-05-02", pickup_time_local: "07:00" });
    const surcharge = makeSurcharge({
      day_type: "saturday",
      time_from: "00:00",
      time_to: "08:00",
    });
    expect(surchargeMatchesTime(surcharge, order)).toBe(true);
  });

  it("blokkeert tijd-venster zonder pickup_time_local", () => {
    const order = makeOrder();
    const surcharge = makeSurcharge({ time_from: "00:00", time_to: "08:00" });
    expect(surchargeMatchesTime(surcharge, order)).toBe(false);
  });
});
