import { describe, it, expect } from "vitest";
import {
  calculateLineTotal,
  calculateInvoiceTotals,
  formatCurrency,
  formatDateNL,
  generateInvoiceLines,
  generateInvoicePDF,
  generateInvoicesCSV,
  generateUBL,
  buildInvoiceLines,
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

  it("handles fractional quantities", () => {
    expect(calculateLineTotal(1.5, 100)).toBe(150);
  });

  it("handles very small amounts", () => {
    expect(calculateLineTotal(1, 0.01)).toBe(0.01);
  });

  it("handles large quantities", () => {
    expect(calculateLineTotal(10000, 100)).toBe(1000000);
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

  it("handles 9% BTW", () => {
    const lines = [{ total: 100 }];
    const result = calculateInvoiceTotals(lines, 9);
    expect(result.subtotal).toBe(100);
    expect(result.btwAmount).toBe(9);
    expect(result.total).toBe(109);
  });

  it("handles single line", () => {
    const lines = [{ total: 500 }];
    const result = calculateInvoiceTotals(lines, 21);
    expect(result.subtotal).toBe(500);
    expect(result.btwAmount).toBe(105);
    expect(result.total).toBe(605);
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

  it("formats large amounts", () => {
    expect(formatCurrency(1000000)).toBe("\u20AC 1.000.000,00");
  });

  it("formats amounts with cents", () => {
    expect(formatCurrency(99.99)).toBe("\u20AC 99,99");
  });

  it("formats single digit amount", () => {
    expect(formatCurrency(5)).toBe("\u20AC 5,00");
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

  it("formats end of year", () => {
    expect(formatDateNL("2024-12-31")).toBe("31-12-2024");
  });

  it("formats beginning of year", () => {
    expect(formatDateNL("2024-01-01")).toBe("01-01-2024");
  });

  it("pads single digit day and month", () => {
    expect(formatDateNL("2024-02-03")).toBe("03-02-2024");
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

  it("generates a per-km line", () => {
    const order = {};
    const rates = [{ rate_type: "per_km", amount: 1.5 }];
    const lines = generateInvoiceLines(order, rates);
    expect(lines).toHaveLength(1);
    expect(lines[0].unit).toBe("km");
    expect(lines[0].quantity).toBe(100); // default estimate
    expect(lines[0].total).toBe(150);
  });

  it("generates toeslag_koel surcharge", () => {
    const order = {};
    const rates = [{ rate_type: "toeslag_koel", amount: 60 }];
    const lines = generateInvoiceLines(order, rates);
    expect(lines).toHaveLength(1);
    expect(lines[0].description).toContain("koel");
    expect(lines[0].total).toBe(60);
  });

  it("uses custom description when provided", () => {
    const order = {};
    const rates = [{ rate_type: "per_rit", amount: 100, description: "Custom transport" }];
    const lines = generateInvoiceLines(order, rates);
    expect(lines[0].description).toBe("Custom transport");
  });

  it("generates fallback addresses for per-rit when missing", () => {
    const order = {};
    const rates = [{ rate_type: "per_rit", amount: 100 }];
    const lines = generateInvoiceLines(order, rates);
    expect(lines[0].description).toContain("Ophaaladres");
    expect(lines[0].description).toContain("Afleveradres");
  });

  it("skips per-pallet when quantity is undefined", () => {
    const order = {};
    const rates = [{ rate_type: "per_pallet", amount: 25 }];
    const lines = generateInvoiceLines(order, rates);
    expect(lines).toHaveLength(0);
  });

  it("returns empty array when no rates", () => {
    const order = {};
    const lines = generateInvoiceLines(order, []);
    expect(lines).toHaveLength(0);
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

  it("works with multiple invoice lines", async () => {
    const invoice = {
      id: "test-id",
      tenant_id: "tenant-1",
      invoice_number: "FAC-2024-003",
      client_id: "client-1",
      client_name: "Multi Line B.V.",
      client_address: "Straat 1",
      client_btw_number: null,
      client_kvk_number: null,
      status: "verzonden" as const,
      invoice_date: "2024-06-01",
      due_date: "2024-07-01",
      subtotal: 1000,
      btw_percentage: 21,
      btw_amount: 210,
      total: 1210,
      notes: "Meerdere regels",
      pdf_url: null,
      created_at: "2024-06-01T10:00:00Z",
      updated_at: "2024-06-01T10:00:00Z",
      invoice_lines: [
        { id: "l1", invoice_id: "test-id", order_id: null, description: "Transport A-B", quantity: 1, unit: "rit", unit_price: 500, total: 500 },
        { id: "l2", invoice_id: "test-id", order_id: null, description: "Pallet vervoer", quantity: 10, unit: "pallet", unit_price: 50, total: 500 },
      ],
    };

    const blob = await generateInvoicePDF(invoice);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });
});

describe("generateInvoicesCSV", () => {
  it("generates CSV with header and rows", () => {
    const invoices = [
      {
        id: "inv1",
        tenant_id: "t1",
        invoice_number: "FAC-2024-001",
        client_id: "c1",
        client_name: "Klant A",
        client_address: null,
        client_btw_number: null,
        client_kvk_number: null,
        status: "concept" as const,
        invoice_date: "2024-03-15",
        due_date: "2024-04-15",
        subtotal: 500,
        btw_percentage: 21,
        btw_amount: 105,
        total: 605,
        notes: null,
        pdf_url: null,
        created_at: "2024-03-15T10:00:00Z",
        updated_at: "2024-03-15T10:00:00Z",
      },
    ];

    const csv = generateInvoicesCSV(invoices);
    expect(csv).toContain("Factuurnummer;Klant;Datum");
    expect(csv).toContain("FAC-2024-001");
    expect(csv).toContain("Klant A");
    expect(csv).toContain("500,00");
    expect(csv).toContain("605,00");
  });

  it("returns only header for empty invoices", () => {
    const csv = generateInvoicesCSV([]);
    expect(csv).toBe("Factuurnummer;Klant;Datum;Vervaldatum;Subtotaal;BTW;Totaal;Status");
  });

  it("handles invoice without due_date", () => {
    const invoices = [
      {
        id: "inv1",
        tenant_id: "t1",
        invoice_number: "FAC-001",
        client_id: "c1",
        client_name: "Test",
        client_address: null,
        client_btw_number: null,
        client_kvk_number: null,
        status: "concept" as const,
        invoice_date: "2024-01-01",
        due_date: null,
        subtotal: 100,
        btw_percentage: 21,
        btw_amount: 21,
        total: 121,
        notes: null,
        pdf_url: null,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      },
    ];
    const csv = generateInvoicesCSV(invoices);
    // Due date should be empty string in csv
    const lines = csv.split("\n");
    expect(lines).toHaveLength(2);
    const dataLine = lines[1].split(";");
    expect(dataLine[3]).toBe(""); // Empty due date
  });
});

describe("generateUBL", () => {
  const baseInvoice = {
    id: "inv1",
    tenant_id: "t1",
    invoice_number: "FAC-2024-001",
    client_id: "c1",
    client_name: "Test B.V.",
    client_address: "Straat 1, Amsterdam",
    client_btw_number: "NL123456789B01",
    client_kvk_number: "12345678",
    status: "verzonden" as const,
    invoice_date: "2024-03-15",
    due_date: "2024-04-15",
    subtotal: 500,
    btw_percentage: 21,
    btw_amount: 105,
    total: 605,
    notes: null,
    pdf_url: null,
    created_at: "2024-03-15T10:00:00Z",
    updated_at: "2024-03-15T10:00:00Z",
  };

  it("generates valid UBL XML", () => {
    const xml = generateUBL({
      ...baseInvoice,
      invoice_lines: [
        { id: "l1", invoice_id: "inv1", order_id: null, description: "Transport", quantity: 1, unit: "rit", unit_price: 500, total: 500 },
      ],
    });
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("<cbc:ID>FAC-2024-001</cbc:ID>");
    expect(xml).toContain("<cbc:IssueDate>2024-03-15</cbc:IssueDate>");
    expect(xml).toContain("<cbc:DueDate>2024-04-15</cbc:DueDate>");
    expect(xml).toContain("Test B.V.");
    expect(xml).toContain("NL123456789B01");
    expect(xml).toContain("12345678");
    expect(xml).toContain("Transport");
  });

  it("generates UBL without optional client fields", () => {
    const xml = generateUBL({
      ...baseInvoice,
      client_address: null,
      client_btw_number: null,
      client_kvk_number: null,
      due_date: null,
      invoice_lines: [],
    });
    expect(xml).toContain("FAC-2024-001");
    // The supplier always has PostalAddress, but the customer should not when address is null
    // Count occurrences: supplier has one PostalAddress, customer should not add another
    const customerSection = xml.split("AccountingCustomerParty")[1];
    expect(customerSection).not.toContain("StreetName");
    expect(customerSection).not.toContain("CompanyID");
  });

  it("escapes XML special characters", () => {
    const xml = generateUBL({
      ...baseInvoice,
      client_name: "A & B <Company>",
      invoice_lines: [
        { id: "l1", invoice_id: "inv1", order_id: null, description: 'Transport "A" -> B', quantity: 1, unit: "rit", unit_price: 100, total: 100 },
      ],
    });
    expect(xml).toContain("A &amp; B &lt;Company&gt;");
    expect(xml).toContain("Transport &quot;A&quot;");
  });
});

describe("buildInvoiceLines", () => {
  it("creates placeholder lines when no rates", () => {
    const orders = [
      { id: "o1", order_number: 1001, pickup_address: "Amsterdam, NL", delivery_address: "Rotterdam, NL", quantity: 5 },
    ];
    const lines = buildInvoiceLines(orders, []);
    expect(lines).toHaveLength(1);
    expect(lines[0].order_id).toBe("o1");
    expect(lines[0].unit_price).toBe(0);
    expect(lines[0].total).toBe(0);
    expect(lines[0].unit).toBe("rit");
    expect(lines[0].description).toContain("#1001");
  });

  it("creates per_rit lines from rates", () => {
    const orders = [{ id: "o1", order_number: 1001 }];
    const rates = [{ rate_type: "per_rit", amount: 150, description: "Rit tarief" }];
    const lines = buildInvoiceLines(orders, rates);
    expect(lines).toHaveLength(1);
    expect(lines[0].unit).toBe("rit");
    expect(lines[0].unit_price).toBe(150);
    expect(lines[0].total).toBe(150);
  });

  it("creates per_pallet lines from rates", () => {
    const orders = [{ id: "o1", order_number: 1001, quantity: 5 }];
    const rates = [{ rate_type: "per_pallet", amount: 25, description: "Pallet tarief" }];
    const lines = buildInvoiceLines(orders, rates);
    expect(lines).toHaveLength(1);
    expect(lines[0].unit).toBe("pallet");
    expect(lines[0].quantity).toBe(5);
    expect(lines[0].total).toBe(125);
  });

  it("skips per_pallet when quantity is 0", () => {
    const orders = [{ id: "o1", order_number: 1001, quantity: 0 }];
    const rates = [{ rate_type: "per_pallet", amount: 25 }];
    const lines = buildInvoiceLines(orders, rates);
    expect(lines).toHaveLength(0);
  });

  it("creates per_km lines", () => {
    const orders = [{ id: "o1", order_number: 1001 }];
    const rates = [{ rate_type: "per_km", amount: 1.5 }];
    const lines = buildInvoiceLines(orders, rates);
    expect(lines).toHaveLength(1);
    expect(lines[0].unit).toBe("km");
    expect(lines[0].quantity).toBe(150); // default km
    expect(lines[0].total).toBe(225);
  });

  it("creates surcharge lines", () => {
    const orders = [{ id: "o1", order_number: 1001 }];
    const rates = [{ rate_type: "toeslag", amount: 50, description: "Extra toeslag" }];
    const lines = buildInvoiceLines(orders, rates);
    expect(lines).toHaveLength(1);
    expect(lines[0].unit).toBe("stuk");
    expect(lines[0].total).toBe(50);
  });

  it("handles multiple orders with multiple rates", () => {
    const orders = [
      { id: "o1", order_number: 1001, quantity: 3 },
      { id: "o2", order_number: 1002, quantity: 5 },
    ];
    const rates = [
      { rate_type: "per_rit", amount: 100 },
      { rate_type: "per_pallet", amount: 20 },
    ];
    const lines = buildInvoiceLines(orders, rates);
    expect(lines).toHaveLength(4); // 2 orders x 2 rates
    expect(lines[0].order_id).toBe("o1");
    expect(lines[2].order_id).toBe("o2");
  });

  it("sets sort_order incrementally", () => {
    const orders = [
      { id: "o1", order_number: 1001, quantity: 2 },
    ];
    const rates = [
      { rate_type: "per_rit", amount: 100 },
      { rate_type: "per_pallet", amount: 20 },
    ];
    const lines = buildInvoiceLines(orders, rates);
    expect(lines[0].sort_order).toBe(0);
    expect(lines[1].sort_order).toBe(1);
  });

  it("handles unknown rate type with default values", () => {
    const orders = [{ id: "o1", order_number: 1001 }];
    const rates = [{ rate_type: "custom_rate", amount: 75, description: "Custom" }];
    const lines = buildInvoiceLines(orders, rates);
    expect(lines).toHaveLength(1);
    expect(lines[0].unit).toBe("stuk");
    expect(lines[0].quantity).toBe(1);
    expect(lines[0].total).toBe(75);
  });

  it("uses question marks for missing addresses in placeholder", () => {
    const orders = [{ id: "o1", order_number: 1001, pickup_address: null, delivery_address: null }];
    const lines = buildInvoiceLines(orders, []);
    expect(lines[0].description).toContain("?");
  });
});
