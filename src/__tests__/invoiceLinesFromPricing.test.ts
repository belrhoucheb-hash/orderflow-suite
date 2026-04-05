import { describe, it, expect } from "vitest";
import { generateInvoiceLinesFromPricing } from "@/lib/invoiceLinesFromPricing";
import type { PriceBreakdown } from "@/types/rateModels";

describe("generateInvoiceLinesFromPricing", () => {
  it("converts price breakdown into invoice lines", () => {
    const breakdown: PriceBreakdown = {
      basisbedrag: 250,
      toeslagen: [
        { name: "Dieseltoeslag", type: "PERCENTAGE", amount: 31.25 },
      ],
      totaal: 281.25,
      regels: [
        {
          description: "PER_KM 135 km x EUR 1.85",
          quantity: 135,
          unit: "km",
          unit_price: 1.85,
          total: 249.75,
          rule_type: "PER_KM",
        },
      ],
    };

    const lines = generateInvoiceLinesFromPricing("order-1", breakdown);
    expect(lines).toHaveLength(2); // 1 regel + 1 toeslag
    expect(lines[0].order_id).toBe("order-1");
    expect(lines[0].quantity).toBe(135);
    expect(lines[0].unit).toBe("km");
    expect(lines[0].unit_price).toBe(1.85);
    expect(lines[0].total).toBe(249.75);
    expect(lines[1].description).toContain("Dieseltoeslag");
    expect(lines[1].total).toBe(31.25);
    expect(lines[1].unit).toBe("toeslag");
  });

  it("handles breakdown with no surcharges", () => {
    const breakdown: PriceBreakdown = {
      basisbedrag: 400,
      toeslagen: [],
      totaal: 400,
      regels: [
        { description: "Vast bedrag", quantity: 1, unit: "rit", unit_price: 400, total: 400, rule_type: "VAST_BEDRAG" },
      ],
    };

    const lines = generateInvoiceLinesFromPricing("order-2", breakdown);
    expect(lines).toHaveLength(1);
    expect(lines[0].total).toBe(400);
  });

  it("handles empty breakdown", () => {
    const breakdown: PriceBreakdown = {
      basisbedrag: 0,
      toeslagen: [],
      totaal: 0,
      regels: [],
    };

    const lines = generateInvoiceLinesFromPricing("order-3", breakdown);
    expect(lines).toHaveLength(0);
  });

  it("sets sort_order incrementally", () => {
    const breakdown: PriceBreakdown = {
      basisbedrag: 300,
      toeslagen: [
        { name: "ADR", type: "VAST_BEDRAG", amount: 50 },
        { name: "Weekend", type: "PERCENTAGE", amount: 75 },
      ],
      totaal: 425,
      regels: [
        { description: "Transport", quantity: 1, unit: "rit", unit_price: 300, total: 300, rule_type: "VAST_BEDRAG" },
      ],
    };

    const lines = generateInvoiceLinesFromPricing("order-4", breakdown);
    expect(lines).toHaveLength(3);
    expect(lines[0].sort_order).toBe(0);
    expect(lines[1].sort_order).toBe(1);
    expect(lines[2].sort_order).toBe(2);
  });
});
