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

// Form-side superset voor NewOrder: department wordt in de UI als code
// (OPS/EXPORT/IMPORT) ingevoerd in plaats van UUID, dus hier vervangen we
// `department_id` door `afdeling` en voegen we klant- en eenheid-velden toe.
// Backend-consumers blijven `orderInputSchema` gebruiken.
export const UNIT_VALUES = ["Pallets", "Colli", "Box"] as const;

// Gestructureerd adres, parallel aan de gecomposeerde string `pickup_address`.
// Google Places geeft in de suggestielijst niet altijd postcode terug. Daarom
// mag de volledige adresregel als fallback de volledigheid dragen.
const structuredAddressSchema = z.object({
  street: z.string().trim(),
  zipcode: z.string().trim(),
  city: z.string().trim(),
});

// Een geldig order-adres moet tenminste een huisnummer of postcode bevatten
// (minstens één cijfer) en uit meer dan één woord bestaan, anders is het
// slechts een plaatsnaam. Zie `isValidAddress` in components/inbox/utils.ts.
function normalizeAddress(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export const orderFormSchema = orderInputSchema
  .omit({ department_id: true })
  .extend({
    client_name: z.string().trim().min(1, "Klantnaam is verplicht"),
    unit: z.enum(UNIT_VALUES, {
      errorMap: () => ({ message: `Eenheid moet een van ${UNIT_VALUES.join(", ")} zijn` }),
    }),
    afdeling: z.string().trim().min(1, "Kies een afdeling, wordt normaal automatisch bepaald uit het traject"),
    pickup_structured: structuredAddressSchema,
    delivery_structured: structuredAddressSchema,
  })
  .superRefine((data, ctx) => {
    if (normalizeAddress(data.pickup_address) === normalizeAddress(data.delivery_address)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["delivery_address"],
        message: "Afleveradres mag niet hetzelfde zijn als ophaaladres",
      });
    }
  });

export type OrderFormInput = z.infer<typeof orderFormSchema>;
