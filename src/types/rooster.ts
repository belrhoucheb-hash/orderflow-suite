export type DriverScheduleStatus =
  | "werkt"
  | "vrij"
  | "ziek"
  | "verlof"
  | "feestdag";

export const DRIVER_SCHEDULE_STATUSES: DriverScheduleStatus[] = [
  "werkt",
  "vrij",
  "ziek",
  "verlof",
  "feestdag",
];

export const DRIVER_SCHEDULE_STATUS_LABELS: Record<DriverScheduleStatus, string> = {
  werkt: "Werkt",
  vrij: "Vrij",
  ziek: "Ziek",
  verlof: "Verlof",
  feestdag: "Feestdag",
};

export interface ShiftTemplate {
  id: string;
  tenant_id: string;
  name: string;
  default_start_time: string;
  default_end_time: string | null;
  color: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DriverSchedule {
  id: string;
  tenant_id: string;
  driver_id: string;
  date: string;
  shift_template_id: string | null;
  start_time: string | null;
  end_time: string | null;
  vehicle_id: string | null;
  status: DriverScheduleStatus;
  notitie: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface DriverScheduleUpsert {
  driver_id: string;
  date: string;
  shift_template_id?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  vehicle_id?: string | null;
  status?: DriverScheduleStatus;
  notitie?: string | null;
}

export interface ResolvedSchedule {
  schedule: DriverSchedule;
  template: ShiftTemplate | null;
  effectiveStartTime: string | null;
  effectiveEndTime: string | null;
}

export function resolveSchedule(
  schedule: DriverSchedule,
  templates: ShiftTemplate[],
): ResolvedSchedule {
  const template = schedule.shift_template_id
    ? templates.find((t) => t.id === schedule.shift_template_id) ?? null
    : null;
  return {
    schedule,
    template,
    effectiveStartTime:
      schedule.start_time ?? template?.default_start_time ?? null,
    effectiveEndTime: schedule.end_time ?? template?.default_end_time ?? null,
  };
}
