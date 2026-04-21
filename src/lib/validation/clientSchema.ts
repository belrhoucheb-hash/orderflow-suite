import { z } from "zod";

const optionalEmail = z
  .string()
  .trim()
  .email("Ongeldig e-mailadres")
  .optional()
  .or(z.literal(""));

const optionalText = z.string().trim().optional().or(z.literal(""));

const addressSchema = z.object({
  street: optionalText,
  house_number: optionalText,
  house_number_suffix: optionalText,
  zipcode: optionalText,
  city: optionalText,
  country: z.string().trim().min(1).default("NL"),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  coords_manual: z.boolean().default(false),
});

export type AddressFields = z.infer<typeof addressSchema>;

export const clientInputSchema = z
  .object({
    name: z.string().trim().min(1, "Bedrijfsnaam is verplicht"),
    contact_person: optionalText,
    email: optionalEmail,
    phone: optionalText,
    kvk_number: optionalText,
    btw_number: optionalText,
    payment_terms: z
      .number()
      .int()
      .nonnegative("Betaaltermijn kan niet negatief zijn")
      .optional()
      .default(30),

    main_address: addressSchema,

    billing_same_as_main: z.boolean().default(true),
    billing_email: optionalEmail,
    billing_address: addressSchema,

    shipping_same_as_main: z.boolean().default(true),
    shipping_address: addressSchema,
  })
  .superRefine((data, ctx) => {
    const main = data.main_address;
    if (main.lat === null || main.lng === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["main_address", "lat"],
        message: "Selecteer een adres uit de suggesties of sleep de pin, zodat coordinaten bekend zijn",
      });
    }
    if (!main.street || !main.city) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["main_address", "street"],
        message: "Hoofdadres is verplicht",
      });
    }

    if (!data.billing_same_as_main) {
      const b = data.billing_address;
      if (b.lat === null || b.lng === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["billing_address", "lat"],
          message: "Selecteer een factuuradres uit de suggesties of sleep de pin",
        });
      }
      if (!b.street || !b.city) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["billing_address", "street"],
          message: "Factuuradres is verplicht wanneer afwijkend van hoofdadres",
        });
      }
    }

    if (!data.shipping_same_as_main) {
      const s = data.shipping_address;
      if (s.lat === null || s.lng === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["shipping_address", "lat"],
          message: "Selecteer een postadres uit de suggesties of sleep de pin",
        });
      }
      if (!s.street || !s.city) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["shipping_address", "street"],
          message: "Postadres is verplicht wanneer afwijkend van hoofdadres",
        });
      }
    }
  });

export type ClientInput = z.infer<typeof clientInputSchema>;

export function composeAddressString(a: AddressFields): string {
  return [a.street, a.house_number, a.house_number_suffix].filter(Boolean).join(" ").trim();
}
