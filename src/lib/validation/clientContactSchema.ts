import { z } from "zod";

export const CLIENT_CONTACT_ROLES = ["primary", "backup", "other"] as const;
export type ClientContactRole = (typeof CLIENT_CONTACT_ROLES)[number];

export const CLIENT_CONTACT_ROLE_LABELS: Record<ClientContactRole, string> = {
  primary: "Primair",
  backup: "Backup",
  other: "Overig",
};

export const clientContactInputSchema = z.object({
  name: z.string().trim().min(1, "Naam is verplicht"),
  email: z
    .string()
    .trim()
    .email("Ongeldig e-mailadres")
    .optional()
    .or(z.literal("")),
  phone: z.string().trim().optional().or(z.literal("")),
  role: z.enum(CLIENT_CONTACT_ROLES, {
    required_error: "Rol is verplicht",
  }),
  is_active: z.boolean().default(true),
  notes: z.string().trim().optional().or(z.literal("")),
});

export type ClientContactInput = z.infer<typeof clientContactInputSchema>;
