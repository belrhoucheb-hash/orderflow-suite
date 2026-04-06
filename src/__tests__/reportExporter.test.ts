import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateCSVContent,
  type ReportOrder,
  type ReportTrip,
  type ReportInvoice,
} from "@/utils/reportExporter";

// ─── CSV generation tests ───────────────────────────────────────────

describe("generateCSVContent", () => {
  it("generates correct headers from column definitions", () => {
    const columns = [
      { key: "name", header: "Naam" },
      { key: "city", header: "Stad" },
    ];
    const data = [{ name: "Test", city: "Rotterdam" }];
    const csv = generateCSVContent(data, columns);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("Naam;Stad");
  });

  it("generates correct rows with Dutch number formatting", () => {
    const columns = [
      { key: "label", header: "Label" },
      { key: "amount", header: "Bedrag" },
    ];
    const data = [{ label: "Item A", amount: 1234.56 }];
    const csv = generateCSVContent(data, columns);
    const lines = csv.split("\n");
    // Numbers should use comma as decimal separator
    expect(lines[1]).toContain("1234,56");
  });

  it("wraps string values in quotes", () => {
    const columns = [{ key: "name", header: "Naam" }];
    const data = [{ name: "Van der Berg" }];
    const csv = generateCSVContent(data, columns);
    const lines = csv.split("\n");
    expect(lines[1]).toBe('"Van der Berg"');
  });

  it("escapes double quotes in string values", () => {
    const columns = [{ key: "desc", header: "Omschrijving" }];
    const data = [{ desc: 'Size 12"' }];
    const csv = generateCSVContent(data, columns);
    expect(csv).toContain('12""');
  });

  it("handles null/undefined values as empty string", () => {
    const columns = [
      { key: "a", header: "A" },
      { key: "b", header: "B" },
    ];
    const data = [{ a: "x", b: null }];
    const csv = generateCSVContent(data, columns);
    const lines = csv.split("\n");
    // null becomes empty
    expect(lines[1]).toBe('"x";');
  });

  it("handles empty data array", () => {
    const columns = [{ key: "name", header: "Naam" }];
    const csv = generateCSVContent([], columns);
    expect(csv).toBe("Naam");
  });

  it("handles multiple rows", () => {
    const columns = [
      { key: "id", header: "ID" },
      { key: "val", header: "Waarde" },
    ];
    const data = [
      { id: "a", val: 10 },
      { id: "b", val: 20 },
      { id: "c", val: 30 },
    ];
    const csv = generateCSVContent(data, columns);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(4); // header + 3 rows
  });

  it("uses semicolons as delimiter (Dutch Excel compatible)", () => {
    const columns = [
      { key: "a", header: "Kolom A" },
      { key: "b", header: "Kolom B" },
    ];
    const data = [{ a: "x", b: "y" }];
    const csv = generateCSVContent(data, columns);
    expect(csv).toContain(";");
    // No commas in the delimiter (commas only in decimals)
    expect(csv.split("\n")[0]).toBe("Kolom A;Kolom B");
  });
});

// ─── PDF export tests (mock jsPDF) ──────────────────────────────────

describe("exportOrderReport", () => {
  const mockDoc = {
    setFillColor: vi.fn(),
    setTextColor: vi.fn(),
    setDrawColor: vi.fn(),
    setFontSize: vi.fn(),
    setFont: vi.fn(),
    setLineWidth: vi.fn(),
    text: vi.fn(),
    rect: vi.fn(),
    line: vi.fn(),
    addPage: vi.fn(),
    splitTextToSize: vi.fn((_t: string, _w: number) => [_t]),
    internal: { getNumberOfPages: () => 1, pages: [null, {}] },
    setPage: vi.fn(),
    output: vi.fn(() => new Blob(["fake-pdf"], { type: "application/pdf" })),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.doMock("jspdf", () => ({
      default: vi.fn(() => mockDoc),
    }));
  });

  it("generates a PDF blob for orders", async () => {
    const { exportOrderReport } = await import("@/utils/reportExporter");

    // Mock DOM methods for triggerDownload
    const mockLink = {
      href: "",
      download: "",
      click: vi.fn(),
    };
    vi.spyOn(document, "createElement").mockReturnValue(mockLink as unknown as HTMLElement);
    vi.spyOn(document.body, "appendChild").mockImplementation(() => null as unknown as Node);
    vi.spyOn(document.body, "removeChild").mockImplementation(() => null as unknown as Node);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    const orders: ReportOrder[] = [
      {
        id: "1",
        order_number: "ORD-001",
        created_at: "2026-01-15T10:00:00Z",
        status: "DELIVERED",
        client_name: "Test Klant",
        weight_kg: 500,
      },
    ];

    await exportOrderReport(orders, { startDate: "2026-01-01", endDate: "2026-01-31" });

    expect(mockLink.click).toHaveBeenCalled();
    expect(mockLink.download).toMatch(/order-rapport/);
  });
});

describe("exportFinancialReport", () => {
  const mockDoc = {
    setFillColor: vi.fn(),
    setTextColor: vi.fn(),
    setDrawColor: vi.fn(),
    setFontSize: vi.fn(),
    setFont: vi.fn(),
    setLineWidth: vi.fn(),
    text: vi.fn(),
    rect: vi.fn(),
    line: vi.fn(),
    addPage: vi.fn(),
    splitTextToSize: vi.fn((_t: string, _w: number) => [_t]),
    internal: { getNumberOfPages: () => 1, pages: [null, {}] },
    setPage: vi.fn(),
    output: vi.fn(() => new Blob(["fake-pdf"], { type: "application/pdf" })),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.doMock("jspdf", () => ({
      default: vi.fn(() => mockDoc),
    }));
  });

  it("generates a PDF blob for invoices", async () => {
    const { exportFinancialReport } = await import("@/utils/reportExporter");

    const mockLink = {
      href: "",
      download: "",
      click: vi.fn(),
    };
    vi.spyOn(document, "createElement").mockReturnValue(mockLink as unknown as HTMLElement);
    vi.spyOn(document.body, "appendChild").mockImplementation(() => null as unknown as Node);
    vi.spyOn(document.body, "removeChild").mockImplementation(() => null as unknown as Node);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    const invoices: ReportInvoice[] = [
      {
        id: "1",
        invoice_number: "FAC-001",
        client_name: "Klant BV",
        invoice_date: "2026-01-15",
        subtotal: 1000,
        btw_amount: 210,
        total: 1210,
        status: "paid",
      },
    ];

    await exportFinancialReport(invoices, { startDate: "2026-01-01", endDate: "2026-01-31" });

    expect(mockLink.click).toHaveBeenCalled();
    expect(mockLink.download).toMatch(/financieel-rapport/);
  });
});
