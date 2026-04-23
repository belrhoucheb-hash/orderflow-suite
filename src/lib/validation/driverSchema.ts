import { z } from "zod";

const optionalText = z.string().trim().optional().or(z.literal(""));
const optionalEmail = z
  .string()
  .trim()
  .email("Ongeldig e-mailadres")
  .optional()
  .or(z.literal(""));

// Nederlands telefoonnummer, liberale regex: internationale prefix optioneel,
// spaties en streepjes toegestaan, minstens 8 cijfers.
const optionalPhone = z
  .string()
  .trim()
  .regex(/^[+]?[0-9\s\-()]{8,}$/, "Ongeldig telefoonnummer")
  .optional()
  .or(z.literal(""));

const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum moet yyyy-mm-dd zijn")
  .optional()
  .or(z.literal(""));

/**
 * BSN elfproef: som van cijferposities (9×a + 8×b + ... + 2×h − 1×i)
 * moet deelbaar door 11 zijn. 9 cijfers.
 */
export function isValidBsn(bsn: string): boolean {
  const digits = bsn.replace(/\D/g, "");
  if (digits.length !== 9) return false;
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    sum += parseInt(digits[i], 10) * (9 - i);
  }
  sum -= parseInt(digits[8], 10);
  return sum % 11 === 0;
}

/**
 * IBAN checksum via mod-97. Simpel: verplaats eerste 4 tekens naar eind,
 * letters naar 10..35, mod 97 moet 1 zijn.
 */
export function isValidIban(iban: string): boolean {
  const clean = iban.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(clean)) return false;
  const rearranged = clean.slice(4) + clean.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (c) =>
    (c.charCodeAt(0) - 55).toString(),
  );
  // big-number mod via chunks
  let remainder = 0;
  for (let i = 0; i < numeric.length; i += 7) {
    const block = remainder.toString() + numeric.slice(i, i + 7);
    remainder = Number(block) % 97;
  }
  return remainder === 1;
}

// Parse yyyy-mm-dd als lokale midnight, NIET als UTC. Voorkomt off-by-one
// bij tijdzones >UTC of DST-overgangen.
function parseIsoDateLocal(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

function ageInYears(isoDate: string): number {
  const birth = parseIsoDateLocal(isoDate);
  if (!birth) return 0;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export const driverBaseSchema = z.object({
    name: z.string().trim().min(1, "Naam is verplicht"),
    email: optionalEmail,
    phone: optionalPhone,

    // Adres
    street: optionalText,
    house_number: optionalText,
    house_number_suffix: optionalText,
    zipcode: optionalText,
    city: optionalText,
    country: z.string().trim().default("NL"),

    // Legitimatie
    legitimation_type: z.enum(["rijbewijs", "paspoort", "id-kaart"]).nullable().optional(),
    license_number: optionalText,
    legitimation_expiry_date: optionalDate,
    code95_expiry_date: optionalDate,

    // Persoonsgegevens
    birth_date: optionalDate,

    // Administratie
    bsn: optionalText,
    iban: optionalText,
    personnel_number: optionalText,

    // Arbeid
    hire_date: optionalDate,
    termination_date: optionalDate,
    contract_hours_per_week: z
      .number()
      .int()
      .min(0, "Contracturen mogen niet negatief zijn")
      .max(48, "Maximaal 48 uur per week (CAO)")
      .nullable()
      .optional(),
    employment_type: z
      .enum(["vast", "flex", "ingehuurd", "zzp", "uitzendkracht"])
      .default("vast"),

    // Certificeringen
    certifications: z.array(z.string()).default([]),

    // Noodcontact
    emergency_contact_name: optionalText,
    emergency_contact_relation: z
      .enum(["partner", "ouder", "kind", "broer-zus", "overig"])
      .nullable()
      .optional()
      .or(z.literal("")),
    emergency_contact_phone: optionalPhone,
  });

export const driverSchema = driverBaseSchema
  .superRefine((data, ctx) => {
    if (data.bsn && data.bsn.trim() !== "" && !isValidBsn(data.bsn)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bsn"],
        message: "BSN ongeldig (11-proef mislukt)",
      });
    }

    if (data.iban && data.iban.trim() !== "" && !isValidIban(data.iban)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["iban"],
        message: "IBAN ongeldig (checksum mislukt)",
      });
    }

    if (data.birth_date && data.birth_date.trim() !== "") {
      const age = ageInYears(data.birth_date);
      if (age < 18) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["birth_date"],
          message: "Chauffeur moet minstens 18 jaar zijn",
        });
      }
    }

    if (
      data.hire_date &&
      data.termination_date &&
      data.hire_date.trim() !== "" &&
      data.termination_date.trim() !== "" &&
      data.termination_date < data.hire_date
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["termination_date"],
        message: "Uitdienst moet na indienst zijn",
      });
    }

    if (
      data.hire_date &&
      data.hire_date.trim() !== "" &&
      data.hire_date > new Date().toISOString().slice(0, 10)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["hire_date"],
        message: "Indienstdatum kan niet in de toekomst liggen",
      });
    }
  });

export type DriverInput = z.infer<typeof driverSchema>;

/** Masker een BSN voor weergave: laat laatste 4 cijfers zien. */
export function maskBsn(bsn: string | null | undefined): string {
  if (!bsn) return "";
  const digits = bsn.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  return `${"*".repeat(digits.length - 4)}${digits.slice(-4)}`;
}

/** Aantal dagen tot een datum vanaf vandaag. Negatief = al verlopen. */
export function daysUntil(isoDate: string | null | undefined): number | null {
  if (!isoDate) return null;
  const d = parseIsoDateLocal(isoDate);
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}
