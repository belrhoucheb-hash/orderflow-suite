import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ClientAuditEntry {
  id: string;
  tenant_id: string;
  client_id: string;
  user_id: string | null;
  user_name: string | null;
  field: string;
  old_value: unknown;
  new_value: unknown;
  created_at: string;
}

export function useClientAudit(clientId: string | null) {
  return useQuery({
    queryKey: ["client_audit_log", clientId],
    enabled: !!clientId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_audit_log" as any)
        .select("*")
        .eq("client_id", clientId!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as ClientAuditEntry[];
    },
  });
}
