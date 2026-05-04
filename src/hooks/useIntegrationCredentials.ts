import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { logConnectorAuditEvent } from "@/hooks/useConnectorAuditLog";

export type IntegrationProvider =
  | "snelstart"
  | "exact_online"
  | "twinfield"
  | "samsara"
  | "nostradamus"
  | "smtp";

export interface IntegrationCredentialRow<T = Record<string, unknown>> {
  enabled: boolean;
  credentials: T;
}

export function useIntegrationCredentials<T = Record<string, unknown>>(
  provider: IntegrationProvider,
  options?: { enabled?: boolean },
) {
  const { tenant } = useTenant();
  const enabled = options?.enabled ?? true;

  return useQuery({
    queryKey: ["integration_credentials", tenant?.id, provider],
    enabled: enabled && !!tenant?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<IntegrationCredentialRow<T>> => {
      const { data, error } = await supabase.rpc("get_integration_credentials_ui" as any, {
        p_provider: provider,
      });

      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as any;
      return {
        enabled: row?.enabled ?? false,
        credentials: (row?.credentials ?? {}) as T,
      };
    },
  });
}

export function useSaveIntegrationCredentials<T = Record<string, unknown>>(
  provider: IntegrationProvider,
) {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { enabled: boolean; credentials: T }) => {
      if (!tenant?.id) throw new Error("Geen tenant gevonden");

      const { error } = await supabase.rpc("save_integration_credentials_secure" as any, {
        p_provider: provider,
        p_enabled: input.enabled,
        p_credentials: input.credentials as unknown as Record<string, unknown>,
      });

      if (error) throw error;

      // Audit-trail: best-effort log van credential-update + connect/disconnect.
      void logConnectorAuditEvent({
        tenantId: tenant.id,
        provider,
        action: input.enabled ? "credential_update" : "disconnect",
        details: { enabled: input.enabled, fields: Object.keys((input.credentials ?? {}) as object) },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["integration_credentials", tenant?.id, provider],
      });
      queryClient.invalidateQueries({ queryKey: ["connector_audit_log"] });
    },
  });
}
