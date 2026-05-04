// Hooks voor connector_audit_log: lezen + insert.
//
// `logConnectorAuditEvent` is een fire-and-forget helper die best-effort
// een audit-rij schrijft. Crash-bestendig: errors worden alleen gelogd.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";

export type AuditAction =
  | "connect"
  | "disconnect"
  | "credential_update"
  | "mapping_save"
  | "manual_sync"
  | "manual_replay"
  | "threshold_change";

export interface AuditLogRow {
  id: string;
  tenant_id: string;
  provider: string;
  user_id: string | null;
  action: AuditAction;
  details: Record<string, unknown>;
  created_at: string;
}

export function useConnectorAuditLog(provider: string) {
  const { tenant } = useTenant();
  return useQuery({
    queryKey: ["connector_audit_log", tenant?.id, provider],
    enabled: !!tenant?.id,
    staleTime: 10_000,
    queryFn: async (): Promise<AuditLogRow[]> => {
      const { data, error } = await supabase
        .from("connector_audit_log" as never)
        .select("*")
        .eq("tenant_id", tenant!.id)
        .eq("provider", provider)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as AuditLogRow[];
    },
  });
}

export async function logConnectorAuditEvent(input: {
  tenantId: string;
  provider: string;
  action: AuditAction;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    await supabase.from("connector_audit_log" as never).insert({
      tenant_id: input.tenantId,
      provider: input.provider,
      action: input.action,
      details: input.details ?? {},
    } as never);
  } catch (err) {
    // Audit-log is best-effort. Geen toast, geen throw, gewoon door.
    if (typeof console !== "undefined") {
      console.warn("[connector audit log] insert failed", err);
    }
  }
}

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  connect: "Verbonden",
  disconnect: "Losgekoppeld",
  credential_update: "Credentials bijgewerkt",
  mapping_save: "Mapping opgeslagen",
  manual_sync: "Handmatige sync",
  manual_replay: "Event opnieuw verstuurd",
  threshold_change: "Drempel aangepast",
};
