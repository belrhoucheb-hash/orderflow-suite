import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";

export type IntegrationProvider =
  | "snelstart"
  | "exact_online"
  | "twinfield"
  | "samsara";

export interface IntegrationCredentialRow<T = Record<string, unknown>> {
  enabled: boolean;
  credentials: T;
}

export function useIntegrationCredentials<T = Record<string, unknown>>(
  provider: IntegrationProvider,
) {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ["integration_credentials", tenant?.id, provider],
    enabled: !!tenant?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<IntegrationCredentialRow<T>> => {
      const { data, error } = await supabase
        .from("integration_credentials" as any)
        .select("enabled, credentials")
        .eq("tenant_id", tenant!.id)
        .eq("provider", provider)
        .maybeSingle();

      if (error) throw error;
      return {
        enabled: (data as any)?.enabled ?? false,
        credentials: ((data as any)?.credentials ?? {}) as T,
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

      const { error } = await supabase
        .from("integration_credentials" as any)
        .upsert(
          {
            tenant_id: tenant.id,
            provider,
            enabled: input.enabled,
            credentials: input.credentials as unknown as Record<string, unknown>,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "tenant_id,provider" },
        );

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["integration_credentials", tenant?.id, provider],
      });
    },
  });
}
