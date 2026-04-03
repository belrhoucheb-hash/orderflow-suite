import { describe, it, expect } from "vitest";
import {
  calculateLineTotal,
  calculateInvoiceTotals,
  formatCurrency,
  formatDateNL,
  generateInvoiceLines,
  generateInvoicePDF,
} from "@/lib/invoiceUtils";

describe("calculateLineTotal", () => {
  it("multiplies quantity by unit price", () => {
    expect(calculateLineTotal(10, 25)).toBe(250);
  });

  it("rounds to 2 decimal places", () => {
    // 3 * 1.005 = 3.0149999... in IEEE 754, rounds to 3.01
    expect(calculateLineTotal(3, 1.005)).toBe(3.01);
    // A cleaner rounding example:
    expect(calculateLineTotal(1, 9.999)).toBe(10);
  });

  it("handles zero quantity", () => {
    expect(calculateLineTotal(0, 100)).toBe(0);
  });

  it("handles zero price", () => {
    expect(calculateLineTotal(5, 0)).toBe(0);
  });
});

describe("calculateInvoiceTotals", () => {
  it("calculates subtotal, BTW and total correctly", () => {
    const lines = [{ total: 100 }, { total: 200 }, { total: 50 }];
    const result = calculateInvoiceTotals(lines, 21);
    expect(result.subtotal).toBe(350);
    expect(result.btwAmount).toBe(73.5);
    expect(result.total).toBe(423.5);
  });

  it("handles 0% BTW", () => {
    const lines = [{ total: 200 }];
    const result = calculateInvoiceTotals(lines, 0);
    expect(result.subtotal).toBe(200);
    expect(result.btwAmount).toBe(0);
    expect(result.total).toBe(200);
  });

  it("handles empty lines", () => {
    const result = calculateInvoiceTotals([], 21);
    expect(result.subtotal).toBe(0);
    expect(result.btwAmount).toBe(0);
    expect(result.total).toBe(0);
  });
});

describe("formatCurrency", () => {
  it("formats a simple amount", () => {
    expect(formatCurrency(100)).toBe("\u20AC 100,00");
  });

  it("formats thousands with dot separator", () => {
    expect(formatCurrency(1234.56)).toBe("\u20AC 1.234,56");
  });

  it("formats negative amounts", () => {
    expect(formatCurrency(-50)).toBe("- \u20AC 50,00");
  });

  it("formats zero", () => {
    expect(formatCurrency(0)).toBe("\u20AC 0,00");
  });
});

describe("formatDateNL", () => {
  it("formats a date string as dd-mm-yyyy", () => {
    expect(formatDateNL("2024-03-15")).toBe("15-03-2024");
  });

  it("formats a Date object", () => {
    const d = new Date(2024, 0, 5); // Jan 5, 2024
    expect(formatDateNL(d)).toBe("05-01-2024");
  });
});

describe("generateInvoiceLines", () => {
  it("generates a per-rit line", () => {
    const order = { pickup_address: "Amsterdam", delivery_address: "Rotterdam" };
    const rates = [{ rate_type: "per_rit", amount: 150 }];
    const lines = generateInvoiceLines(order, rates);
    expect(lines).toHaveLength(1);
    expect(lines[0].unit).toBe("rit");
    expect(lines[0].total).toBe(150);
  });

  it("generates a per-pallet line based on quantity", () => {
    const order = { quantity: 5 };
    const rates = [{ rate_type: "per_pallet", amount: 25 }];
    const lines = generateInvoiceLines(order, rates);
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(5);
    expect(lines[0].total).toBe(125);
  });

  it("skips per-pallet if quantity is 0", () => {
    const order = { quantity: 0 };
    const rates = [{ rate_type: "per_pallet", amount: 25 }];
    const lines = generateInvoiceLines(order, rates);
    expect(lines).toHaveLength(0);
  });

  it("generates surcharge lines", () => {
    const order = {};
    const rates = [
      { rate_type: "toeslag_adr", amount: 50 },
      { rate_type: "toeslag_spoed", amount: 75 },
    ];
    const lines = generateInvoiceLines(order, rates);
    expect(lines).toHaveLength(2);
    expect(lines[0].description).toContain("ADR");
    expect(lines[1].description).toContain("spoed");
  });

  it("generates multiple line types together", () => {
    const order = { pickup_address: "A", delivery_address: "B", quantity: 3 };
    const rates = [
      { rate_type: "per_rit", amount: 100 },
      { rate_type: "per_pallet", amount: 20 },
      { rate_type: "toeslag_weekend", amount: 30 },
    ];
    const lines = generateInvoiceLines(order, rates);
    expect(lines).toHaveLength(3);
  });
});

describe("generateInvoicePDF", () => {
  it("returns a Blob without crashing", async () => {
    const invoice = {
      id: "test-id",
      tenant_id: "tenant-1",
      invoice_number: "FAC-2024-001",
      client_id: "client-1",
      client_name: "Test Klant B.V.",
      client_address: "Teststraat 1, 1234 AB Amsterdam",
      client_btw_number: "NL123456789B01",
      client_kvk_number: "12345678",
      status: "concept" as const,
      invoice_date: "2024-03-15",
      due_date: "2024-04-15",
      subtotal: 500,
      btw_percentage: 21,
      btw_amount: 105,
      total: 605,
      notes: "Testfactuur",
      pdf_url: null,
      created_at: "2024-03-15T10:00:00Z",
      updated_at: "2024-03-15T10:00:00Z",
      invoice_lines: [
        {
          id: "line-1",
          invoice_id: "test-id",
          order_id: null,
          description: "Transport Amsterdam - Rotterdam",
          quantity: 1,
          unit: "rit",
          unit_price: 500,
          total: 500,
        },
      ],
    };

    const blob = await generateInvoicePDF(invoice);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it("works with no invoice lines", async () => {
    const invoice = {
      id: "test-id",
      tenant_id: "tenant-1",
      invoice_number: "FAC-2024-002",
      client_id: "client-1",
      client_name: "Lege Factuur B.V.",
      client_address: null,
      client_btw_number: null,
      client_kvk_number: null,
      status: "concept" as const,
      invoice_date: "2024-03-15",
      due_date: null,
      subtotal: 0,
      btw_percentage: 21,
      btw_amount: 0,
      total: 0,
      notes: null,
      pdf_url: null,
      created_at: "2024-03-15T10:00:00Z",
      updated_at: "2024-03-15T10:00:00Z",
      invoice_lines: [],
    };

    const blob = await generateInvoicePDF(invoice);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });
});
