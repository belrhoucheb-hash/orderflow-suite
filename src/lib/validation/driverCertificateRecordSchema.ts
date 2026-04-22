import { z } from "zod";

/**
 * Validatie voor één certificaat-record van een chauffeur.
 *
 * Ontwerp-keuzes:
 * - issued_date en expiry_date zijn optioneel omdat sommige certificaten
 *   onbeperkt geldig zijn (bv. diploma's); de UI moet wel kunnen markeren
 *   dat er geen einddatum is.
 * - Als beide datums aanwezig zijn moet expiry_date >= issued_date;
 *   onbedoelde omkeringen glipten er anders te makkelijk doorheen.
 * - Bestand wordt hier niet gevalideerd (type, grootte) omdat de dialog
 *   dat direct bij file-keuze doet; een zod-schema is niet de goede plek
 *   voor MIME-type-checks van File-objecten.
 * - certification_code is een vrije text-foreign-key naar
 *   driver_certifications.code (niet uuid), zo past het bij de bestaande
 *   driver_certification_expiry-tabel.
 */
const dateString = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum moet in YYYY-MM-DD formaat staan")
  .optional()
  .or(z.literal(""));

export const driverCertificateRecordSchema = z
  .object({
    certification_code: z.string().trim().min(1, "Kies een certificaat-type"),
    issued_date: dateString,
    expiry_date: dateString,
    notes: z.string().trim().max(500, "Notitie is te lang").optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    if (data.issued_date && data.expiry_date) {
      if (data.expiry_date < data.issued_date) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["expiry_date"],
          message: "Vervaldatum mag niet voor uitgiftedatum liggen",
        });
      }
    }
  });

export type DriverCertificateRecordFormInput = z.infer<typeof driverCertificateRecordSchema>;
