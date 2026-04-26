export interface SlaSettings {
  enabled: boolean;
  deadlineHours: number;
  warningMinutes: number;
}

export const DEFAULT_SLA_SETTINGS: SlaSettings = {
  enabled: true,
  deadlineHours: 4,
  warningMinutes: 60,
};

export function normalizeSlaSettings(input?: Partial<SlaSettings> | null): SlaSettings {
  return {
    enabled: input?.enabled ?? DEFAULT_SLA_SETTINGS.enabled,
    deadlineHours: Number.isFinite(input?.deadlineHours)
      ? Math.max(1, Number(input?.deadlineHours))
      : DEFAULT_SLA_SETTINGS.deadlineHours,
    warningMinutes: Number.isFinite(input?.warningMinutes)
      ? Math.max(5, Number(input?.warningMinutes))
      : DEFAULT_SLA_SETTINGS.warningMinutes,
  };
}
