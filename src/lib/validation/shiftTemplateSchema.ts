import { z } from "zod";

const hexColorRegex = /^#[0-9a-f]{6}$/i;
const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

const timeField = z
  .string()
  .regex(timeRegex, "Tijd moet uu:mm zijn");

export const shiftTemplateInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Naam is verplicht")
      .max(40, "Naam mag max 40 tekens zijn"),
    default_start_time: timeField,
    default_end_time: timeField.optional().nullable().or(z.literal("")),
    color: z.string().regex(hexColorRegex, "Kleur moet hex zijn, bv #94a3b8"),
    sort_order: z.number().int().min(0).default(0),
    is_active: z.boolean().default(true),
  })
  .transform((v) => ({
    ...v,
    default_end_time: v.default_end_time === "" ? null : v.default_end_time ?? null,
  }));

export type ShiftTemplateInput = z.infer<typeof shiftTemplateInputSchema>;
