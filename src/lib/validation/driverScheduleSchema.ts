import { z } from "zod";
import { DRIVER_SCHEDULE_STATUSES } from "@/types/rooster";

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const optionalTime = z
  .string()
  .regex(timeRegex, "Tijd moet uu:mm zijn")
  .optional()
  .nullable()
  .or(z.literal(""));

const optionalUuid = z.string().uuid().optional().nullable().or(z.literal(""));

export const driverScheduleInputSchema = z
  .object({
    driver_id: z.string().uuid("Ongeldige chauffeur"),
    date: z.string().regex(dateRegex, "Datum moet yyyy-mm-dd zijn"),
    shift_template_id: optionalUuid,
    start_time: optionalTime,
    end_time: optionalTime,
    vehicle_id: optionalUuid,
    status: z.enum(DRIVER_SCHEDULE_STATUSES as [string, ...string[]]).default("werkt"),
    notitie: z
      .string()
      .trim()
      .max(500, "Notitie mag max 500 tekens zijn")
      .optional()
      .nullable()
      .or(z.literal("")),
  })
  .transform((v) => ({
    driver_id: v.driver_id,
    date: v.date,
    shift_template_id: v.shift_template_id === "" ? null : v.shift_template_id ?? null,
    start_time: v.start_time === "" ? null : v.start_time ?? null,
    end_time: v.end_time === "" ? null : v.end_time ?? null,
    vehicle_id: v.vehicle_id === "" ? null : v.vehicle_id ?? null,
    status: v.status,
    notitie: v.notitie === "" ? null : v.notitie ?? null,
  }));

export type DriverScheduleInput = z.infer<typeof driverScheduleInputSchema>;
