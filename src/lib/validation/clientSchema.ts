import { z } from "zod";

const optionalEmail = z
  .string()
  .trim()
  .email("Ongeldig e-mailadres")
  .optional()
  .or(z.literal(""));

const optionalText = z.string().trim().optional().or(z.literal(""));

export const clientInputSchema = z
  .object({
    name: z.string().trim().min(1, "Bedrijfsnaam is verplicht"),
    contact_person: optionalText,
    email: optionalEmail,
    phone: optionalText,
    address: optionalText,
    zipcode: optionalText,
    city: optionalText,
    country: z.string().trim().min(1).default("NL"),
    kvk_number: optionalText,
    btw_number: optionalText,
    payment_terms: z
      .number()
      .int()
      .nonnegative("Betaaltermijn kan niet negatief zijn")
      .optional()
      .default(30),

    billing_same_as_main: z.boolean().default(true),
    billing_email: optionalEmail,
    billing_address: optionalText,
    billing_zipcode: optionalText,
    billing_city: optionalText,
    billing_country: optionalText,

    shipping_same_as_main: z.boolean().default(true),
    shipping_address: optionalText,
    shipping_zipcode: optionalText,
    shipping_city: optionalText,
    shipping_country: optionalText,
  })
  .superRefine((data, ctx) => {
    if (!data.billing_same_as_main) {
      if (!data.billing_address || data.billing_address.trim() === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["billing_address"],
          message: "Factuuradres is verplicht wanneer afwijkend van hoofdadres",
        });
      }
      if (!data.billing_city || data.billing_city.trim() === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["billing_city"],
          message: "Factuurplaats is verplicht wanneer afwijkend van hoofdadres",
        });
      }
    }
    if (!data.shipping_same_as_main) {
      if (!data.shipping_address || data.shipping_address.trim() === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["shipping_address"],
          message: "Postadres is verplicht wanneer afwijkend van hoofdadres",
        });
      }
      if (!data.shipping_city || data.shipping_city.trim() === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["shipping_city"],
          message: "Postplaats is verplicht wanneer afwijkend van hoofdadres",
        });
      }
    }
  });

export type ClientInput = z.infer<typeof clientInputSchema>;
