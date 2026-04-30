import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";

export interface SmsSettings {
  smsProvider?: "twilio" | "messagebird";
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioFromNumber?: string;
  messageBirdApiKey?: string;
  messageBirdOriginator?: string;
  smsEvents?: Record<string, boolean>;
  smsTemplate?: string;
  hasTwilioAuthToken?: boolean;
  hasMessageBirdApiKey?: boolean;
}

export function useSmsSettings(options?: { enabled?: boolean }) {
  const { tenant } = useTenant();
  const enabled = options?.enabled ?? true;

  return useQuery({
    queryKey: ["sms_settings", tenant?.id],
    enabled: enabled && !!tenant?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<SmsSettings> => {
      const { data, error } = await supabase.rpc("get_sms_settings_ui" as any);
      if (error) throw error;
      return ((Array.isArray(data) ? data[0] : data) ?? {}) as SmsSettings;
    },
  });
}

export function useSaveSmsSettings() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (settings: SmsSettings) => {
      if (!tenant?.id) throw new Error("Geen tenant gevonden");
      const { error } = await supabase.rpc("save_sms_settings_secure" as any, {
        p_settings: settings as Record<string, unknown>,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sms_settings", tenant?.id] });
      queryClient.invalidateQueries({ queryKey: ["tenant_settings", tenant?.id, "sms"] });
    },
  });
}
