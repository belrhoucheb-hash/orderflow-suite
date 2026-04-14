import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";

export interface Department {
  id: string;
  code: string;
  name: string;
  color: string | null;
}

export function useDepartments() {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ["departments", tenant?.id],
    staleTime: 60_000,
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("departments")
        .select("id, code, name, color")
        .eq("tenant_id", tenant!.id)
        .eq("is_active", true)
        .order("code", { ascending: true });

      if (error) throw error;

      return (data ?? []).map((d: any) => ({
        id: d.id,
        code: d.code,
        name: d.name,
        color: d.color ?? null,
      })) as Department[];
    },
  });
}
