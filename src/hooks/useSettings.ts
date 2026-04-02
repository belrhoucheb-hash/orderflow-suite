import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";

export type SettingsCategory = "integrations" | "notifications" | "sms" | "general";

export function useLoadSettings<T = Record<string, unknown>>(category: SettingsCategory) {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ["tenant_settings", tenant?.id, category],
    enabled: !!tenant?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_settings" as any)
        .select("settings")
        .eq("tenant_id", tenant!.id)
        .eq("category", category)
        .maybeSingle();

      if (error) throw error;
      return (data?.settings ?? {}) as T;
    },
  });
}

export function useSaveSettings(category: SettingsCategory) {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (settings: Record<string, unknown>) => {
      if (!tenant?.id) throw new Error("Geen tenant gevonden");

      const { error } = await supabase
        .from("tenant_settings" as any)
        .upsert(
          {
            tenant_id: tenant.id,
            category,
            settings,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "tenant_id,category" }
        );

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["tenant_settings", tenant?.id, category],
      });
    },
  });
}
