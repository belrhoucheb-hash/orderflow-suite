import { useLoadSettings, useSaveSettings } from "./useSettings";
import {
  DEFAULT_ETA_NOTIFICATION_SETTINGS,
  type EtaNotificationSettings,
} from "@/types/notifications";

const ETA_CATEGORY = "eta_notifications";

export function useLoadEtaSettings() {
  const { data, ...rest } = useLoadSettings<Partial<EtaNotificationSettings>>(ETA_CATEGORY);
  return {
    ...rest,
    data: { ...DEFAULT_ETA_NOTIFICATION_SETTINGS, ...(data ?? {}) } as EtaNotificationSettings,
  };
}

export function useSaveEtaSettings() {
  return useSaveSettings(ETA_CATEGORY);
}
