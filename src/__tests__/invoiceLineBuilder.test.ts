import { describe, it, expect } from "vitest";
import {
  buildInvoiceLines,
  type BuildLineOrder,
  type BuildLineRate,
} from "@/lib/invoiceUtils";

// ─── Helpers ──────────────────────────────────────────────────────────

function makeOrder(overrides: Partial<BuildLineOrder> = {}): BuildLineOrder {
  return {
    id: "order-1",
    order_number: 1001,
    pickup_address: "Straat 1, Amsterdam",
    delivery_address: "Weg 2, Rotterdam",
    quantity: 10,
    ...overrides,
  };
}

// ─── No rates (placeholder lines) ───────────────────────────────────

describe("buildInvoiceLines — no rates", () => {
  it("creates a placeholder line per order with zero amounts", () => {
    const orders = [makeOrder()];
    const lines = buildInvoiceLines(orders, []);
    expect(lines).toHaveLength(1);
    expect(lines[0].unit_price).toBe(0);
    expect(lines[0].total).toBe(0);
    expect(lines[0].unit).toBe("rit");
    expect(lines[0].quantity).toBe(1);
    expect(lines[0].order_id).toBe("order-1");
  });

  it("creates one placeholder per order when multiple orders", () => {
    const orders = [makeOrder({ id: "o1" }), makeOrder({ id: "o2" })];
    const lines = buildInvoiceLines(orders, []);
    expect(lines).toHaveLength(2);
    expect(lines[0].order_id).toBe("o1");
    expect(lines[1].order_id).toBe("o2");
  });

  it("uses pickup/delivery addresses in description", () => {
    const orders = [makeOrder({ pickup_address: "Keizersgracht 1, Amsterdam", delivery_address: "Coolsingel 5, Rotterdam" })];
    const lines = buildInvoiceLines(orders, []);
    expect(lines[0].description).toContain("Keizersgracht 1");
    expect(lines[0].description).toContain("Coolsingel 5");
  });

  it("uses ? when addresses are null", () => {
    const orders = [makeOrder({ pickup_address: null, delivery_address: null })];
    const lines = buildInvoiceLines(orders, []);
    expect(lines[0].description).toContain("?");
  });
});

// ─── per_rit rate ───────────────────────────────────────────────────

describe("buildInvoiceLines — per_rit", () => {
  it("creates a single rit line per order", () => {
    const orders = [makeOrder()];
    const rates: BuildLineRate[] = [{ rate_type: "per_rit", amount: 250 }];
    const lines = buildInvoiceLines(orders, rates);
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(1);
    expect(lines[0].unit).toBe("rit");
    expect(lines[0].unit_price).toBe(250);
    expect(lines[0].total).toBe(250);
  });
});

// ─── per_pallet rate ────────────────────────────────────────────────

describe("buildInvoiceLines — per_pallet", () => {
  it("uses order quantity as line quantity", () => {
    const orders = [makeOrder({ quantity: 8 })];
    const rates: BuildLineRate[] = [{ rate_type: "per_pallet", amount: 15 }];
    const lines = buildInvoiceLines(orders, rates);
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(8);
    expect(lines[0].unit).toBe("pallet");
    expect(lines[0].total).toBe(120);
  });

  it("skips pallet line when quantity is 0", () => {
    const orders = [makeOrder({ quantity: 0 })];
    const rates: BuildLineRate[] = [{ rate_type: "per_pallet", amount: 15 }];
    const lines = buildInvoiceLines(orders, rates);
    expect(lines).toHaveLength(0);
  });

  it("skips pallet line when quantity is null", () => {
    const orders = [makeOrder({ quantity: null })];
    const rates: BuildLineRate[] = [{ rate_type: "per_pallet", amount: 15 }];
    const lines = buildInvoiceLines(orders, rates);
    expect(lines).toHaveLength(0);
  });
});

// ─── per_km rate ────────────────────────────────────────────────────

describe("buildInvoiceLines — per_km", () => {
  it("uses 150 km as default quantity", () => {
    const orders = [makeOrder()];
    const rates: BuildLineRate[] = [{ rate_type: "per_km", amount: 1.5 }];
    const lines = buildInvoiceLines(orders, rates);
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(150);
    expect(lines[0].unit).toBe("km");
    expect(lines[0].total).toBe(225);
  });
});

// ─── surcharge / toeslag rate ───────────────────────────────────────

describe("buildInvoiceLines — surcharges", () => {
  it("handles toeslag rate type", () => {
    const orders = [makeOrder()];
    const rates: BuildLineRate[] = [{ rate_type: "toeslag", amount: 50, description: "ADR toeslag" }];
    const lines = buildInvoiceLines(orders, rates);
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(1);
    expect(lines[0].unit).toBe("stuk");
    expect(lines[0].total).toBe(50);
    expect(lines[0].description).toContain("ADR toeslag");
  });

  it("handles surcharge rate type", () => {
    const orders = [makeOrder()];
    const rates: BuildLineRate[] = [{ rate_type: "surcharge", amount: 75 }];
    const lines = buildInvoiceLines(orders, rates);
    expect(lines).toHaveLength(1);
    expect(lines[0].unit).toBe("stuk");
    expect(lines[0].total).toBe(75);
  });
});

// ─── Multiple rates per order ───────────────────────────────────────

describe("buildInvoiceLines — multiple rates", () => {
  it("creates one line per rate per order", () => {
    const orders = [makeOrder({ quantity: 5 })];
    const rates: BuildLineRate[] = [
      { rate_type: "per_rit", amount: 100 },
      { rate_type: "per_pallet", amount: 20 },
      { rate_type: "toeslag", amount: 30 },
    ];
    const lines = buildInvoiceLines(orders, rates);
    expect(lines).toHaveLength(3);
    expect(lines[0].total).toBe(100); // per_rit: 1 * 100
    expect(lines[1].total).toBe(100); // per_pallet: 5 * 20
    expect(lines[2].total).toBe(30);  // toeslag: 1 * 30
  });

  it("assigns incrementing sort_order across all lines", () => {
    const orders = [makeOrder({ id: "o1" }), makeOrder({ id: "o2" })];
    const rates: BuildLineRate[] = [{ rate_type: "per_rit", amount: 100 }];
    const lines = buildInvoiceLines(orders, rates);
    expect(lines[0].sort_order).toBe(0);
    expect(lines[1].sort_order).toBe(1);
  });
});

// ─── Unknown rate type ──────────────────────────────────────────────

describe("buildInvoiceLines — unknown rate type", () => {
  it("includes unknown rate types with default stuk unit", () => {
    const orders = [makeOrder()];
    const rates: BuildLineRate[] = [{ rate_type: "custom_fee", amount: 42 }];
    const lines = buildInvoiceLines(orders, rates);
    expect(lines).toHaveLength(1);
    expect(lines[0].unit).toBe("stuk");
    expect(lines[0].total).toBe(42);
  });
});

// ─── Empty orders ───────────────────────────────────────────────────

describe("buildInvoiceLines — empty inputs", () => {
  it("returns empty array for no orders", () => {
    const rates: BuildLineRate[] = [{ rate_type: "per_rit", amount: 100 }];
    const lines = buildInvoiceLines([], rates);
    expect(lines).toHaveLength(0);
  });

  it("returns empty array for no orders and no rates", () => {
    const lines = buildInvoiceLines([], []);
    expect(lines).toHaveLength(0);
  });
});

// ─── Rounding ───────────────────────────────────────────────────────

describe("buildInvoiceLines — rounding", () => {
  it("rounds line totals to 2 decimal places", () => {
    const orders = [makeOrder({ quantity: 3 })];
    const rates: BuildLineRate[] = [{ rate_type: "per_pallet", amount: 10.333 }];
    const lines = buildInvoiceLines(orders, rates);
    // 3 * 10.333 = 30.999 -> rounds to 31.00
    expect(lines[0].total).toBe(31);
  });
});
