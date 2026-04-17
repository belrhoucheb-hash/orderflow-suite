import { describe, it, expect } from "vitest";
import {
  buildSnapshot,
  buildErrorSnapshot,
  isV2Snapshot,
} from "../../supabase/functions/_shared/pricingSnapshot";
import type { PriceBreakdown, RateCard, VehicleType } from "@/types/rateModels";

describe("buildSnapshot", () => {
  const breakdown: PriceBreakdown = {
    basisbedrag: 123.45,
    totaal: 145.67,
    regels: [
      {
        description: "PER KM 80 km x EUR 1.54",
        quantity: 80,
        unit: "km",
        unit_price: 1.54,
        total: 123.2,
        rule_type: "PER_KM",
      },
    ],
    toeslagen: [
      { name: "Weekendtoeslag", type: "PERCENTAGE", amount: 22.22 },
    ],
  };

  const rateCard: RateCard = {
    id: "rc-1",
    tenant_id: "t-1",
    client_id: "c-1",
    name: "Klant A",
    valid_from: null,
    valid_until: null,
    is_active: true,
    currency: "EUR",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };

  const vehicleType: VehicleType = {
    id: "vt-1",
    tenant_id: "t-1",
    code: "van",
    name: "Bestelbus",
    sort_order: 20,
    max_length_cm: 300,
    max_width_cm: 180,
    max_height_cm: 190,
    max_weight_kg: 1500,
    max_volume_m3: 10.26,
    max_pallets: 6,
    has_tailgate: false,
    has_cooling: false,
    adr_capable: false,
    is_active: true,
    created_at: "2026-04-18T00:00:00Z",
    updated_at: "2026-04-18T00:00:00Z",
  };

  it("converteert EUR naar cents met correcte afronding", () => {
    const snap = buildSnapshot({
      breakdown,
      rateCard,
      vehicleType,
      vehicleTypeReason: "Test reden",
    });
    expect(snap.subtotal_cents).toBe(12345); // 123.45 * 100
    expect(snap.total_cents).toBe(14567);    // 145.67 * 100
  });

  it("zet engine_version op v2-2026-04", () => {
    const snap = buildSnapshot({
      breakdown,
      rateCard,
      vehicleType,
      vehicleTypeReason: null,
    });
    expect(snap.engine_version).toBe("v2-2026-04");
  });

  it("rondt .5 cent naar boven (bankers rounding niet gebruikt)", () => {
    // 0.005 * 100 = 0.5, Math.round(0.5) = 1 in JS
    const snap = buildSnapshot({
      breakdown: { ...breakdown, basisbedrag: 0.005, totaal: 0.005 },
      rateCard,
      vehicleType,
      vehicleTypeReason: null,
    });
    expect(snap.total_cents).toBe(1);
  });
});

describe("buildErrorSnapshot", () => {
  it("geeft error-snapshot met v2-versie", () => {
    const snap = buildErrorSnapshot("no_vehicle_match", "Niks past");
    expect(snap.engine_version).toBe("v2-2026-04");
    expect(snap.error).toBe("no_vehicle_match: Niks past");
    expect(snap.total_cents).toBe(0);
  });
});

describe("isV2Snapshot", () => {
  it("herkent v2-snapshot", () => {
    expect(isV2Snapshot({ engine_version: "v2-2026-04" })).toBe(true);
  });

  it("herkent legacy RCS-snapshot niet als v2", () => {
    expect(isV2Snapshot({ mode: "standard", matrix_tariff: 1.5 })).toBe(false);
  });

  it("herkent null of undefined niet als v2", () => {
    expect(isV2Snapshot(null)).toBe(false);
    expect(isV2Snapshot(undefined)).toBe(false);
  });
});
