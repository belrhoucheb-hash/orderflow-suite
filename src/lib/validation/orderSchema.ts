import { z } from "zod";

export const orderInputSchema = z.object({
  pickup_address: z
    .string()
    .trim()
    .min(1, "Ophaaladres is verplicht"),
  delivery_address: z
    .string()
    .trim()
    .min(1, "Afleveradres is verplicht"),
  quantity: z
    .number({ invalid_type_error: "Aantal moet een getal zijn" })
    .int("Aantal moet een heel getal zijn")
    .positive("Aantal moet groter zijn dan 0"),
  weight_kg: z
    .number({ invalid_type_error: "Gewicht moet een getal zijn" })
    .positive("Gewicht moet groter zijn dan 0"),
  department_id: z
    .string({ required_error: "Kies een afdeling" })
    .uuid("Afdeling is ongeldig"),
});

export type OrderInput = z.infer<typeof orderInputSchema>;
