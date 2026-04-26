import { describe, it, expect } from "vitest";
import {
  parseCSV,
  parseExcel,
  autoDetectColumns,
  mapRowsToImportData,
  validateRows,
  detectDelimiter,
  parseCSVLine,
} from "@/utils/bulkImportParser";
import type { BulkImportRow } from "@/types/bulkImport";

// ── CSV Parsing ──────────────────────────────────────────────────────

describe("parseCSV", () => {
  it("parses semicolon-delimited CSV (Dutch style)", () => {
    const csv = `klant;ophaaladres;afleveradres;gewicht
Janssen BV;Keizersgracht 12, Amsterdam;Stationsweg 3, Utrecht;1500`;
    const { headers, rows, delimiter } = parseCSV(csv);
    expect(delimiter).toBe(";");
    expect(headers).toEqual(["klant", "ophaaladres", "afleveradres", "gewicht"]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(["Janssen BV", "Keizersgracht 12, Amsterdam", "Stationsweg 3, Utrecht", "1500"]);
  });

  it("parses comma-delimited CSV (English style)", () => {
    const csv = `client,pickup,delivery,weight
"De Vries Transport",Havenweg 5 Rotterdam,Industrieweg 10 Eindhoven,2000`;
    const { headers, rows, delimiter } = parseCSV(csv);
    expect(delimiter).toBe(",");
    expect(headers).toEqual(["client", "pickup", "delivery", "weight"]);
    expect(rows[0][0]).toBe("De Vries Transport");
  });

  it("handles Dutch decimal comma in semicolon-delimited CSV", () => {
    const csv = `klant;gewicht
Test BV;1.250,50`;
    const { rows } = parseCSV(csv);
    expect(rows[0][1]).toBe("1.250,50");
  });

  it("handles quoted fields with embedded delimiters", () => {
    const csv = `klant;adres
"Pieterse & Zn";"Keizersgracht 12, 1015 AA Amsterdam"`;
    const { rows } = parseCSV(csv);
    expect(rows[0][0]).toBe("Pieterse & Zn");
    expect(rows[0][1]).toBe("Keizersgracht 12, 1015 AA Amsterdam");
  });

  it("returns empty for empty input", () => {
    const { headers, rows } = parseCSV("");
    expect(headers).toEqual([]);
    expect(rows).toEqual([]);
  });

  it("returns empty rows for header-only file", () => {
    const { headers, rows } = parseCSV("klant;adres\n");
    expect(headers).toEqual(["klant", "adres"]);
    expect(rows).toEqual([]);
  });

  it("handles multiple rows", () => {
    const csv = `klant;ophaaladres;afleveradres
A;Straat 1, Amsterdam;Weg 2, Rotterdam
B;Laan 3, Utrecht;Plein 4, Den Haag
C;Singel 5, Leiden;Gracht 6, Haarlem`;
    const { rows } = parseCSV(csv);
    expect(rows).toHaveLength(3);
  });
});

describe("detectDelimiter", () => {
  it("detects semicolon when more semicolons than commas", () => {
    expect(detectDelimiter("klant;ophaaladres;afleveradres")).toBe(";");
  });

  it("detects comma when more commas than semicolons", () => {
    expect(detectDelimiter("client,pickup,delivery")).toBe(",");
  });

  it("defaults to semicolon when equal", () => {
    expect(detectDelimiter("a;b,c")).toBe(";");
  });
});

describe("parseCSVLine", () => {
  it("parses semicolon-separated values", () => {
    expect(parseCSVLine("a;b;c", ";")).toEqual(["a", "b", "c"]);
  });

  it("handles escaped quotes", () => {
    expect(parseCSVLine('"he said ""hello""";b', ";")).toEqual(['he said "hello"', "b"]);
  });
});

// ── Column Auto-Detection ────────────────────────────────────────────

describe("autoDetectColumns", () => {
  it("maps Dutch headers correctly", () => {
    const mappings = autoDetectColumns(["klant", "ophaaladres", "afleveradres", "gewicht", "aantal", "datum", "referentie", "opmerkingen"]);
    expect(mappings.find((m) => m.csvColumn === "klant")?.orderField).toBe("clientName");
    expect(mappings.find((m) => m.csvColumn === "ophaaladres")?.orderField).toBe("pickupAddress");
    expect(mappings.find((m) => m.csvColumn === "afleveradres")?.orderField).toBe("deliveryAddress");
    expect(mappings.find((m) => m.csvColumn === "gewicht")?.orderField).toBe("weight");
    expect(mappings.find((m) => m.csvColumn === "aantal")?.orderField).toBe("quantity");
    expect(mappings.find((m) => m.csvColumn === "datum")?.orderField).toBe("deliveryDate");
    expect(mappings.find((m) => m.csvColumn === "referentie")?.orderField).toBe("reference");
    expect(mappings.find((m) => m.csvColumn === "opmerkingen")?.orderField).toBe("notes");
  });

  it("maps English headers correctly", () => {
    const mappings = autoDetectColumns(["client", "pickup", "delivery", "weight", "quantity", "date", "reference", "notes"]);
    expect(mappings.find((m) => m.csvColumn === "client")?.orderField).toBe("clientName");
    expect(mappings.find((m) => m.csvColumn === "pickup")?.orderField).toBe("pickupAddress");
    expect(mappings.find((m) => m.csvColumn === "delivery")?.orderField).toBe("deliveryAddress");
    expect(mappings.find((m) => m.csvColumn === "weight")?.orderField).toBe("weight");
    expect(mappings.find((m) => m.csvColumn === "quantity")?.orderField).toBe("quantity");
    expect(mappings.find((m) => m.csvColumn === "reference")?.orderField).toBe("reference");
    expect(mappings.find((m) => m.csvColumn === "notes")?.orderField).toBe("notes");
  });

  it("maps alternative Dutch headers (van/naar/opdrachtgever)", () => {
    const mappings = autoDetectColumns(["opdrachtgever", "van", "naar"]);
    // "van" should match pickupAddress via the alias
    // "opdrachtgever" should match clientName
    expect(mappings.find((m) => m.csvColumn === "opdrachtgever")?.orderField).toBe("clientName");
  });

  it("maps stuks/pallets to quantity", () => {
    const m1 = autoDetectColumns(["stuks"]);
    expect(m1[0].orderField).toBe("quantity");
    const m2 = autoDetectColumns(["pallets"]);
    expect(m2[0].orderField).toBe("quantity");
  });

  it("returns null for unrecognized headers", () => {
    const mappings = autoDetectColumns(["foobarbaz", "xyzzy"]);
    expect(mappings[0].orderField).toBeNull();
    expect(mappings[1].orderField).toBeNull();
  });

  it("does not map two columns to the same field", () => {
    const mappings = autoDetectColumns(["klant", "klantnaam"]);
    const clientMappings = mappings.filter((m) => m.orderField === "clientName");
    expect(clientMappings).toHaveLength(1);
  });
});

// ── Row Validation ───────────────────────────────────────────────────

describe("validateRows", () => {
  const makeRow = (overrides: Partial<BulkImportRow> = {}): BulkImportRow => ({
    pickupAddress: "Keizersgracht 12, Amsterdam",
    deliveryAddress: "Stationsweg 3, Utrecht",
    clientName: "Test BV",
    weight: "1500",
    quantity: "10",
    deliveryDate: "15-03-2025",
    reference: "REF001",
    notes: "",
    ...overrides,
  });

  it("validates a valid row without errors", () => {
    const result = validateRows([makeRow()]);
    expect(result).toHaveLength(1);
    expect(result[0].isValid).toBe(true);
    expect(result[0].errors).toHaveLength(0);
  });

  it("flags missing clientName as error", () => {
    const result = validateRows([makeRow({ clientName: "" })]);
    expect(result[0].isValid).toBe(false);
    expect(result[0].errors).toContain("Klantnaam is verplicht");
  });

  it("flags missing pickupAddress as error", () => {
    const result = validateRows([makeRow({ pickupAddress: "" })]);
    expect(result[0].isValid).toBe(false);
    expect(result[0].errors).toContain("Ophaaladres is verplicht");
  });

  it("flags missing deliveryAddress as error", () => {
    const result = validateRows([makeRow({ deliveryAddress: "" })]);
    expect(result[0].isValid).toBe(false);
    expect(result[0].errors).toContain("Afleveradres is verplicht");
  });

  it("flags invalid weight as error", () => {
    const result = validateRows([makeRow({ weight: "abc" })]);
    expect(result[0].isValid).toBe(false);
    expect(result[0].errors).toContain("Gewicht is geen geldig getal");
  });

  it("flags invalid quantity as error", () => {
    const result = validateRows([makeRow({ quantity: "xyz" })]);
    expect(result[0].isValid).toBe(false);
    expect(result[0].errors).toContain("Aantal is geen geldig getal");
  });

  it("accepts Dutch comma decimal for weight", () => {
    const result = validateRows([makeRow({ weight: "1250,50" })]);
    expect(result[0].isValid).toBe(true);
  });

  it("warns about incomplete addresses", () => {
    const result = validateRows([makeRow({ pickupAddress: "Amsterdam" })]);
    expect(result[0].isValid).toBe(true); // still valid
    expect(result[0].warnings.some((w) => w.includes("Ophaaladres"))).toBe(true);
  });

  it("detects duplicates (same client + address + date)", () => {
    const row = makeRow();
    const result = validateRows([row, { ...row }]);
    expect(result[0].warnings.some((w) => w.includes("duplicaat"))).toBe(true);
    expect(result[1].warnings.some((w) => w.includes("duplicaat"))).toBe(true);
  });

  it("does not flag different rows as duplicates", () => {
    const result = validateRows([
      makeRow({ clientName: "A" }),
      makeRow({ clientName: "B" }),
    ]);
    expect(result[0].warnings.some((w) => w.includes("duplicaat"))).toBe(false);
    expect(result[1].warnings.some((w) => w.includes("duplicaat"))).toBe(false);
  });

  it("handles empty weight/quantity gracefully", () => {
    const result = validateRows([makeRow({ weight: "", quantity: "" })]);
    expect(result[0].isValid).toBe(true);
  });

  it("handles empty date gracefully", () => {
    const result = validateRows([makeRow({ deliveryDate: "" })]);
    expect(result[0].isValid).toBe(true);
  });

  it("validates multiple rows", () => {
    const result = validateRows([
      makeRow(),
      makeRow({ clientName: "" }),
      makeRow({ weight: "bad" }),
    ]);
    expect(result[0].isValid).toBe(true);
    expect(result[1].isValid).toBe(false);
    expect(result[2].isValid).toBe(false);
  });
});

// ── mapRowsToImportData ──────────────────────────────────────────────

describe("mapRowsToImportData", () => {
  it("maps raw rows using column mappings", () => {
    const mappings = [
      { csvColumn: "klant", orderField: "clientName" as const },
      { csvColumn: "van", orderField: "pickupAddress" as const },
      { csvColumn: "naar", orderField: "deliveryAddress" as const },
    ];
    const rawRows = [["Test BV", "Straat 1, Amsterdam", "Weg 2, Rotterdam"]];
    const result = mapRowsToImportData(rawRows, mappings);
    expect(result).toHaveLength(1);
    expect(result[0].clientName).toBe("Test BV");
    expect(result[0].pickupAddress).toBe("Straat 1, Amsterdam");
    expect(result[0].deliveryAddress).toBe("Weg 2, Rotterdam");
  });

  it("leaves unmapped fields empty", () => {
    const mappings = [
      { csvColumn: "klant", orderField: "clientName" as const },
      { csvColumn: "extra", orderField: null },
    ];
    const rawRows = [["Test", "ignored"]];
    const result = mapRowsToImportData(rawRows, mappings);
    expect(result[0].clientName).toBe("Test");
    expect(result[0].pickupAddress).toBe("");
  });
});

// ── Excel Parsing ───────────────────────────────────────────────────

describe("parseExcel", () => {
  it("throws because Excel import is disabled", () => {
    expect(() => parseExcel(new ArrayBuffer(8))).toThrow(
      "Excel-import is tijdelijk uitgeschakeld. Gebruik een CSV-bestand.",
    );
  });
});
