/** Parsed row from a CSV/Excel bulk import */
export interface BulkImportRow {
  pickupAddress: string;
  deliveryAddress: string;
  clientName: string;
  weight: string;
  quantity: string;
  deliveryDate: string;
  reference: string;
  notes: string;
}

/** Validation result for a single import row */
export interface BulkImportValidation {
  row: BulkImportRow;
  rowIndex: number;
  errors: string[];
  warnings: string[];
  isValid: boolean;
}

/** Summary result after import completes */
export interface BulkImportResult {
  total: number;
  imported: number;
  skipped: number;
  errors: { rowIndex: number; message: string }[];
}

/** Maps a CSV column header to an order field */
export interface ColumnMapping {
  csvColumn: string;
  orderField: keyof BulkImportRow | null;
}

/** All recognized order field names */
export const ORDER_FIELDS: { value: keyof BulkImportRow; label: string }[] = [
  { value: "clientName", label: "Klant" },
  { value: "pickupAddress", label: "Ophaaladres" },
  { value: "deliveryAddress", label: "Afleveradres" },
  { value: "weight", label: "Gewicht (kg)" },
  { value: "quantity", label: "Aantal" },
  { value: "deliveryDate", label: "Leverdatum" },
  { value: "reference", label: "Referentie" },
  { value: "notes", label: "Opmerkingen" },
];
