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

export type IntegrationEnvironment = "test" | "live";

export interface IntegrationCredentialRow<T = Record<string, unknown>> {
  enabled: boolean;
  credentials: T;
  environment?: IntegrationEnvironment;
  expiresAt?: string | null;
}

export function useIntegrationCredentials<T = Record<string, unknown>>(
  provider: IntegrationProvider,
  environment?: IntegrationEnvironment,
  options?: { enabled?: boolean },
) {
  const { tenant } = useTenant();
  const enabled = options?.enabled ?? true;
  const env = environment ?? "live";

  return useQuery({
    queryKey: ["integration_credentials", tenant?.id, provider, env],
    enabled: enabled && !!tenant?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<IntegrationCredentialRow<T>> => {
      // Backwards-compat: zonder environment de oorspronkelijke RPC-signature
      // gebruiken. De environment-overload is alleen nodig voor 'test'.
      const args: Record<string, unknown> =
        environment === undefined
          ? { p_provider: provider }
          : { p_provider: provider, p_environment: env };
      const { data, error } = await supabase.rpc("get_integration_credentials_ui" as any, args);

      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as any;
      const base: IntegrationCredentialRow<T> = {
        enabled: row?.enabled ?? false,
        credentials: (row?.credentials ?? {}) as T,
      };
      // Alleen extra velden meegeven als environment expliciet is gevraagd,
      // zodat callers die de hook al gebruiken (en hun tests) niet breken.
      if (environment !== undefined) {
        base.environment = (row?.environment ?? env) as IntegrationEnvironment;
        base.expiresAt = (row?.expires_at ?? null) as string | null;
      }
      return base;
    },
  });
}

export function useSaveIntegrationCredentials<T = Record<string, unknown>>(
  provider: IntegrationProvider,
  environment?: IntegrationEnvironment,
) {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      enabled: boolean;
      credentials: T;
      expiresAt?: string | null;
    }) => {
      if (!tenant?.id) throw new Error("Geen tenant gevonden");

      const baseArgs: Record<string, unknown> = {
        p_provider: provider,
        p_enabled: input.enabled,
        p_credentials: input.credentials as unknown as Record<string, unknown>,
      };

      // Backwards-compat: environment + expiresAt alleen meegeven als expliciet
      // gevraagd, anders gedraagt de mutation zich identiek aan vóór deze
      // sprint zodat bestaande callers en tests niet breken.
      const args =
        environment === undefined && input.expiresAt === undefined
          ? baseArgs
          : {
              ...baseArgs,
              p_tenant_id: tenant.id,
              p_environment: environment ?? "live",
              p_expires_at: input.expiresAt ?? null,
            };

      const { error } = await supabase.rpc("save_integration_credentials_secure" as any, args);

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
