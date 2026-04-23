import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { AuditLogEntry } from "@/hooks/useRateCardAuditLog";

/**
 * Draait een audit-log-entry terug:
 * - `card_updated`/`rule_updated`: update de rij met de voor-state uit
 *   `before_data`. Resulteert in een nieuwe audit-entry (via trigger),
 *   zodat de rollback zelf ook gelogd staat.
 * - `card_created`/`rule_created`: delete de aangemaakte rij.
 * - `card_deleted`/`rule_deleted`: out-of-scope voor v1 omdat een delete
 *   van een kaart ook de bijbehorende regels wiste, en die herstellen
 *   vraagt meer orchestratie (multiple inserts, FK-volgorde). Werpt een
 *   duidelijke fout zodat de UI dit pad kan verbergen.
 */

// Velden die we niet mogen overschrijven bij een rollback-update.
// id en created_at zijn immutable, tenant_id/rate_card_id zijn sowieso
// tenant-gescopeerd en mogen niet wijzigen.
const SKIP_KEYS = new Set(["id", "created_at", "updated_at", "tenant_id", "rate_card_id"]);

function sanitizePatch(data: Record<string, unknown> | null): Record<string, unknown> {
  if (!data) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (SKIP_KEYS.has(k)) continue;
    out[k] = v;
  }
  return out;
}

export function useRollbackAuditEntry() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (entry: AuditLogEntry) => {
      if (entry.action === "card_updated") {
        if (!entry.before_data) throw new Error("Geen voor-state beschikbaar, kan niet terugdraaien.");
        const { error } = await (supabase as any)
          .from("rate_cards")
          .update(sanitizePatch(entry.before_data))
          .eq("id", entry.rate_card_id);
        if (error) throw error;
        return;
      }

      if (entry.action === "rule_updated") {
        if (!entry.before_data || !entry.rule_id) {
          throw new Error("Geen voor-state beschikbaar, kan niet terugdraaien.");
        }
        const { error } = await (supabase as any)
          .from("rate_rules")
          .update(sanitizePatch(entry.before_data))
          .eq("id", entry.rule_id);
        if (error) throw error;
        return;
      }

      if (entry.action === "card_created") {
        const { error } = await (supabase as any)
          .from("rate_cards")
          .delete()
          .eq("id", entry.rate_card_id);
        if (error) throw error;
        return;
      }

      if (entry.action === "rule_created") {
        if (!entry.rule_id) throw new Error("Regel-id ontbreekt in audit-log.");
        const { error } = await (supabase as any)
          .from("rate_rules")
          .delete()
          .eq("id", entry.rule_id);
        if (error) throw error;
        return;
      }

      throw new Error(
        "Verwijderde kaarten of regels kunnen niet automatisch hersteld worden. Maak handmatig een nieuwe aan.",
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rate_cards"] });
      qc.invalidateQueries({ queryKey: ["rate-card-audit-log"] });
      toast.success("Wijziging teruggedraaid");
    },
    onError: (err: Error) => {
      toast.error("Terugdraaien mislukt", { description: err.message ?? "Probeer het opnieuw." });
    },
  });
}
