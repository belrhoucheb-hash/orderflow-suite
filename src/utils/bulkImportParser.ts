import * as XLSX from "xlsx";
import type { BulkImportRow, BulkImportValidation, ColumnMapping } from "@/types/bulkImport";
import { isValidAddress } from "@/components/inbox/utils";

// ── Excel Parsing ───────────────────────────────────────────────────

/** Parse an Excel (.xlsx/.xls) ArrayBuffer into { headers, rows } using the same shape as parseCSV */
export function parseExcel(buffer: ArrayBuffer): { headers: string[]; rows: string[][] } {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };

  const sheet = workbook.Sheets[sheetName];
  // Convert to array-of-arrays; raw:false gives formatted strings
  const aoa: string[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });

  if (aoa.length === 0) return { headers: [], rows: [] };

  const headers = aoa[0].map((h) => String(h).trim());
  const rows = aoa.slice(1).filter((r) => r.some((c) => String(c).trim() !== ""));

  return {
    headers,
    rows: rows.map((r) => r.map((c) => String(c).trim())),
  };
}

// ── CSV Parsing ──────────────────────────────────────────────────────

/** Detect delimiter: semicolon (Dutch/European CSVs) vs comma */
export function detectDelimiter(firstLine: string): string {
  const semicolons = (firstLine.match(/;/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  return semicolons >= commas ? ";" : ",";
}

/** Parse a single CSV line respecting quoted fields */
export function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/** Parse CSV text into BulkImportRow[]. Handles Dutch separators (semicolon delimiter, comma decimals). */
export function parseCSV(text: string): { headers: string[]; rows: string[][]; delimiter: string } {
  if (!text || !text.trim()) {
    return { headers: [], rows: [], delimiter: ";" };
  }

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { headers: [], rows: [], delimiter: ";" };
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = parseCSVLine(lines[0], delimiter);
  const rows = lines.slice(1).map((line) => parseCSVLine(line, delimiter));

  return { headers, rows, delimiter };
}

// ── Column auto-detection ────────────────────────────────────────────

/** Alias map: order field -> known Dutch/English header names */
const FIELD_ALIASES: Record<keyof BulkImportRow, string[]> = {
  pickupAddress: ["ophaaladres", "pickup", "van", "ophalen", "pickup_address", "laden", "vertrek"],
  deliveryAddress: ["afleveradres", "delivery", "naar", "leveren", "delivery_address", "lossen", "bestemming", "afleveren"],
  clientName: ["klant", "client", "opdrachtgever", "klantnaam", "customer", "bedrijf", "company"],
  weight: ["gewicht", "weight", "kg", "weight_kg", "massa"],
  quantity: ["aantal", "quantity", "stuks", "pallets", "qty", "hoeveelheid", "colli"],
  deliveryDate: ["datum", "date", "leverdatum", "delivery_date", "bezorgdatum"],
  reference: ["referentie", "reference", "ref", "ordernummer", "kenmerk"],
  notes: ["opmerkingen", "notes", "bijzonderheden", "notities", "opmerking", "remarks"],
};

/** Try to match a CSV header to an order field */
function matchHeaderToField(header: string): keyof BulkImportRow | null {
  const normalized = header.toLowerCase().trim();
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      if (normalized === alias || normalized.includes(alias)) {
        return field as keyof BulkImportRow;
      }
    }
  }
  return null;
}

/** Auto-detect column mappings from header names */
export function autoDetectColumns(headers: string[]): ColumnMapping[] {
  const usedFields = new Set<keyof BulkImportRow>();

  return headers.map((csvColumn) => {
    const field = matchHeaderToField(csvColumn);
    // Avoid mapping two columns to the same field
    if (field && !usedFields.has(field)) {
      usedFields.add(field);
      return { csvColumn, orderField: field };
    }
    return { csvColumn, orderField: null };
  });
}

// ── Row mapping ──────────────────────────────────────────────────────

/** Convert raw CSV rows + column mappings into BulkImportRow[] */
export function mapRowsToImportData(
  rawRows: string[][],
  mappings: ColumnMapping[]
): BulkImportRow[] {
  return rawRows.map((cells) => {
    const row: BulkImportRow = {
      pickupAddress: "",
      deliveryAddress: "",
      clientName: "",
      weight: "",
      quantity: "",
      deliveryDate: "",
      reference: "",
      notes: "",
    };

    mappings.forEach((mapping, colIdx) => {
      if (mapping.orderField && colIdx < cells.length) {
        row[mapping.orderField] = cells[colIdx]?.trim() || "";
      }
    });

    return row;
  });
}

// ── Validation ───────────────────────────────────────────────────────

/** Check if a string represents a valid positive number (handles Dutch comma decimals) */
function isValidNumber(value: string): boolean {
  if (!value.trim()) return true; // empty is ok (optional)
  const normalized = value.replace(",", ".");
  const num = Number(normalized);
  return !isNaN(num) && num >= 0;
}

/** Check if a string looks like a valid date */
function isValidDate(value: string): boolean {
  if (!value.trim()) return true; // empty is ok (optional)
  // Try common formats: dd-mm-yyyy, dd/mm/yyyy, yyyy-mm-dd, dd.mm.yyyy
  const datePatterns = [
    /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/, // dd-mm-yyyy or dd/mm/yyyy
    /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/,    // yyyy-mm-dd
  ];
  if (!datePatterns.some((p) => p.test(value.trim()))) return false;
  // Also try native parsing
  const d = new Date(value.replace(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/, "$3-$2-$1"));
  return !isNaN(d.getTime()) || !isNaN(Date.parse(value));
}

/** Find duplicate rows (same client + delivery address + date) */
function findDuplicateIndices(rows: BulkImportRow[]): Set<number> {
  const seen = new Map<string, number>();
  const duplicates = new Set<number>();

  rows.forEach((row, idx) => {
    const key = [
      row.clientName.toLowerCase(),
      row.deliveryAddress.toLowerCase(),
      row.deliveryDate.toLowerCase(),
    ].join("|");

    if (!key.replace(/\|/g, "")) return; // skip fully empty keys

    if (seen.has(key)) {
      duplicates.add(idx);
      duplicates.add(seen.get(key)!);
    } else {
      seen.set(key, idx);
    }
  });

  return duplicates;
}

/** Validate all rows and return validation results */
export function validateRows(rows: BulkImportRow[]): BulkImportValidation[] {
  const duplicateIndices = findDuplicateIndices(rows);

  return rows.map((row, idx) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields
    if (!row.clientName.trim()) {
      errors.push("Klantnaam is verplicht");
    }
    if (!row.pickupAddress.trim()) {
      errors.push("Ophaaladres is verplicht");
    }
    if (!row.deliveryAddress.trim()) {
      errors.push("Afleveradres is verplicht");
    }

    // Address validation (only if provided)
    if (row.pickupAddress.trim() && !isValidAddress(row.pickupAddress)) {
      warnings.push("Ophaaladres lijkt onvolledig (geen huisnummer of postcode)");
    }
    if (row.deliveryAddress.trim() && !isValidAddress(row.deliveryAddress)) {
      warnings.push("Afleveradres lijkt onvolledig (geen huisnummer of postcode)");
    }

    // Numeric validation
    if (row.weight && !isValidNumber(row.weight)) {
      errors.push("Gewicht is geen geldig getal");
    }
    if (row.quantity && !isValidNumber(row.quantity)) {
      errors.push("Aantal is geen geldig getal");
    }

    // Date validation
    if (row.deliveryDate && !isValidDate(row.deliveryDate)) {
      warnings.push("Leverdatum heeft een onbekend formaat");
    }

    // Duplicate detection
    if (duplicateIndices.has(idx)) {
      warnings.push("Mogelijke duplicaat (zelfde klant, adres en datum)");
    }

    return {
      row,
      rowIndex: idx,
      errors,
      warnings,
      isValid: errors.length === 0,
    };
  });
}
