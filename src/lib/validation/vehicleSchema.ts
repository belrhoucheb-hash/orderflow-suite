import { z } from "zod";

const optionalText = z.string().trim().optional().or(z.literal(""));

const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum moet yyyy-mm-dd zijn")
  .optional()
  .or(z.literal(""));

/**
 * Nederlands kenteken, ruim: 4 tot 8 tekens, letters/cijfers en streepjes.
 * Echte kentekenreeksen variëren per sidecode, dus we zijn hier bewust
 * tolerant en valideren vooral op aanwezigheid en acceptabele tekens.
 */
const plateRegex = /^[A-Z0-9-]{4,10}$/i;

/**
 * Vaste enum voor voertuigtypes. De UI laat types uit de database zien,
 * maar dit is de canonieke set voor tariefmatrix en planning.
 */
export const VEHICLE_TYPE_VALUES = ["busje", "bakwagen", "koelwagen", "trekker"] as const;
export const vehicleTypeEnum = z.enum(VEHICLE_TYPE_VALUES);
export type VehicleTypeCode = z.infer<typeof vehicleTypeEnum>;

const optionalPositiveInt = z
  .number()
  .int("Moet een heel getal zijn")
  .min(0, "Kan niet negatief zijn")
  .optional();

export const vehicleInputSchema = z.object({
  name: z.string().trim().min(1, "Naam is verplicht"),
  plate: z
    .string()
    .trim()
    .superRefine((val, ctx) => {
      if (!val) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Kenteken is verplicht" });
        return;
      }
      if (!plateRegex.test(val)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Ongeldig kenteken" });
      }
    }),
  type: z.string().trim().min(1, "Kies een voertuigtype"),
  capacity_kg: z
    .number()
    .min(0, "Gewicht kan niet negatief zijn")
    .optional(),
  load_length_cm: optionalPositiveInt,
  load_width_cm: optionalPositiveInt,
  load_height_cm: optionalPositiveInt,
});

export type VehicleInput = z.infer<typeof vehicleInputSchema>;

export const vehicleDocumentInputSchema = z.object({
  doc_type: z.string().trim().min(1, "Type document is verplicht"),
  expiry_date: optionalDate,
  notes: optionalText,
});

export type VehicleDocumentInput = z.infer<typeof vehicleDocumentInputSchema>;

export const vehicleMaintenanceInputSchema = z.object({
  maintenance_type: z.string().trim().min(1, "Type onderhoud is verplicht"),
  scheduled_date: z
    .string()
    .trim()
    .superRefine((val, ctx) => {
      if (!val) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Geplande datum is verplicht",
        });
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Datum moet yyyy-mm-dd zijn",
        });
      }
    }),
  cost: z
    .number()
    .min(0, "Kosten kunnen niet negatief zijn")
    .optional(),
  description: optionalText,
});

export type VehicleMaintenanceInput = z.infer<typeof vehicleMaintenanceInputSchema>;
