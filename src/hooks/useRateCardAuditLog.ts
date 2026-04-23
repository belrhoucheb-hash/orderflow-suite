import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AuditAction =
  | "card_created"
  | "card_updated"
  | "card_deleted"
  | "rule_created"
  | "rule_updated"
  | "rule_deleted";

export interface AuditLogEntry {
  id: string;
  rate_card_id: string;
  rule_id: string | null;
  action: AuditAction;
  actor_user_id: string | null;
  actor_display_name: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  changed_fields: string[] | null;
  created_at: string;
}

/**
 * Haalt de audit-trail voor een tariefkaart op, meest recent eerst.
 * Joint handmatig met profiles om een leesbare actor_display_name
 * te geven.
 */
export function useRateCardAuditLog(rateCardId: string | null | undefined, limit = 50) {
  return useQuery({
    queryKey: ["rate-card-audit-log", rateCardId, limit],
    enabled: !!rateCardId,
    staleTime: 30_000,
    queryFn: async (): Promise<AuditLogEntry[]> => {
      const { data: rawLogs, error } = await (supabase as any)
        .from("rate_card_audit_log")
        .select("*")
        .eq("rate_card_id", rateCardId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;

      const logs = (rawLogs ?? []) as Array<AuditLogEntry & { actor_user_id: string | null }>;
      const actorIds = [...new Set(logs.map((l) => l.actor_user_id).filter(Boolean) as string[])];

      const nameByUser: Record<string, string> = {};
      if (actorIds.length > 0) {
        const { data: profiles } = await (supabase as any)
          .from("profiles")
          .select("user_id, display_name")
          .in("user_id", actorIds);
        for (const p of (profiles ?? []) as Array<{ user_id: string; display_name: string | null }>) {
          if (p.display_name) nameByUser[p.user_id] = p.display_name;
        }
      }

      return logs.map((l) => ({
        ...l,
        actor_display_name: l.actor_user_id ? nameByUser[l.actor_user_id] ?? null : null,
      }));
    },
  });
}
