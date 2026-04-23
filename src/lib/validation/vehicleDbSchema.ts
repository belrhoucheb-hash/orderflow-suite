import { z } from "zod";

/**
 * Zod-schemas voor DB-rijen uit voertuig-gerelateerde tabellen.
 *
 * Deze schemas valideren de ruwe vorm zoals Supabase hem teruggeeft
 * (snake_case, nullable velden). De `useFleet`-hooks parsen elk resultaat
 * hiermee, zodat schema-drift in Postgres als runtime error opvalt
 * in plaats van stil door te lekken via `any`-casts.
 *
 * Om test-fixtures (zoals `{ id: "d1", doc_type: "APK" }`) te blijven
 * accepteren staan niet-kritieke velden op `.nullish()`. Kritiek is
 * alleen wat de UI/mapper nodig heeft.
 */

const isoDate = z.string();
const isoTimestamp = z.string();

export const vehicleRowSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  plate: z.string(),
  type: z.string(),
  brand: z.string().nullish(),
  build_year: z.number().int().nullish(),
  capacity_kg: z.number().nullish(),
  capacity_pallets: z.number().nullish(),
  features: z.array(z.string()).nullish(),
  status: z.string().nullish(),
  assigned_driver: z.string().nullish(),
  fuel_consumption: z.number().nullish(),
  is_active: z.boolean(),
});

export type VehicleRow = z.infer<typeof vehicleRowSchema>;

export const vehicleDocumentRowSchema = z.object({
  id: z.string(),
  vehicle_id: z.string().nullish(),
  doc_type: z.string(),
  document_name: z.string().nullish(),
  issued_date: isoDate.nullish(),
  expiry_date: isoDate.nullish(),
  file_url: z.string().nullish(),
  notes: z.string().nullish(),
  created_at: isoTimestamp.nullish(),
});

export type VehicleDocumentRow = z.infer<typeof vehicleDocumentRowSchema>;

export const vehicleMaintenanceRowSchema = z.object({
  id: z.string(),
  vehicle_id: z.string().nullish(),
  maintenance_type: z.string().nullish(),
  description: z.string().nullish(),
  mileage_km: z.number().int().nullish(),
  scheduled_date: isoDate.nullish(),
  completed_date: isoDate.nullish(),
  cost: z.number().nullish(),
  created_at: isoTimestamp.nullish(),
});

export type VehicleMaintenanceRow = z.infer<typeof vehicleMaintenanceRowSchema>;

export const vehicleMaintenanceWithVehicleRowSchema = vehicleMaintenanceRowSchema.extend({
  vehicles: z
    .object({
      name: z.string(),
      plate: z.string(),
    })
    .nullish(),
});

export type VehicleMaintenanceWithVehicleRow = z.infer<
  typeof vehicleMaintenanceWithVehicleRowSchema
>;

export const vehicleAvailabilityRowSchema = z.object({
  id: z.string(),
  vehicle_id: z.string().nullish(),
  date: isoDate,
  status: z.string().nullish(),
  reason: z.string().nullish(),
});

export type VehicleAvailabilityRow = z.infer<typeof vehicleAvailabilityRowSchema>;

/**
 * Parse een array-resultaat met een row-schema. Bij parse-fout gooit
 * de functie een Error met duidelijke Nederlandse melding zodat
 * react-query het via de bestaande QueryError-UI kan tonen.
 */
export function parseRows<T>(
  schema: z.ZodType<T>,
  rows: unknown[] | null | undefined,
  context: string,
): T[] {
  if (!rows) return [];
  const result = z.array(schema).safeParse(rows);
  if (!result.success) {
    throw new Error(
      `Onverwacht databaseformaat bij ${context}. ${result.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }
  return result.data;
}

/** Parse één rij; gooit bij parse-fout een Error. */
export function parseRow<T>(
  schema: z.ZodType<T>,
  row: unknown,
  context: string,
): T {
  const result = schema.safeParse(row);
  if (!result.success) {
    throw new Error(
      `Onverwacht databaseformaat bij ${context}. ${result.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }
  return result.data;
}
