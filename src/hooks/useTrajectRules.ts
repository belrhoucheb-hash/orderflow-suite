import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";

export interface TrajectRuleLegTemplate {
  sequence: number;
  from: string;
  to: string;
  department_code: string;
  leg_role?: string;
}

export interface TrajectRule {
  id: string;
  tenant_id: string;
  name: string;
  priority: number;
  is_active: boolean;
  match_conditions: Record<string, unknown>;
  legs_template: TrajectRuleLegTemplate[];
  created_at: string;
  updated_at: string;
}

export function useTrajectRules() {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ["traject_rules", tenant?.id],
    staleTime: 60_000,
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("traject_rules")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .order("priority", { ascending: true });

      if (error) throw error;

      return (data ?? []) as TrajectRule[];
    },
  });
}
