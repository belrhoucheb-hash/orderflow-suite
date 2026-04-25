import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DriverPersonnelCardSnapshot {
  id: string;
  tenant_id: string;
  provider: string;
  driver_id: string;
  external_employee_id: string | null;
  details_json: Record<string, unknown> | null;
  contract_json: Record<string, unknown> | null;
  hours_json: Record<string, unknown> | null;
  leave_json: unknown[] | null;
  sickness_json: unknown[] | null;
  files_json: unknown[] | null;
  raw_payload: Record<string, unknown>;
  synced_at: string;
  created_at: string;
  updated_at: string;
}

export function useDriverPersonnelCard(driverId: string | null, provider = "nostradamus") {
  return useQuery({
    queryKey: ["driver_personnel_card", provider, driverId],
    enabled: !!driverId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_external_personnel_cards" as any)
        .select("*")
        .eq("driver_id", driverId!)
        .eq("provider", provider)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as DriverPersonnelCardSnapshot | null;
    },
  });
}
