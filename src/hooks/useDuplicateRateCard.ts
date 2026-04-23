import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTenant } from "@/contexts/TenantContext";
import type { RateCard, RateRule } from "@/types/rateModels";

export interface DuplicateRateCardInput {
  sourceCardId: string;
  newName?: string;
}

export function useDuplicateRateCard() {
  const queryClient = useQueryClient();
  const { tenant } = useTenant();

  return useMutation({
    mutationFn: async ({ sourceCardId, newName }: DuplicateRateCardInput) => {
      if (!tenant?.id) {
        throw new Error("Geen tenant beschikbaar voor duplicatie");
      }

      // 1. Lees bron-kaart inclusief regels
      const { data: source, error: sourceErr } = await supabase
        .from("rate_cards" as any)
        .select("*, rate_rules(*)")
        .eq("id", sourceCardId)
        .single();

      if (sourceErr) throw sourceErr;
      if (!source) throw new Error("Bron-tariefkaart niet gevonden");

      const sourceCard = source as RateCard;
      const targetName = newName?.trim() || `${sourceCard.name} (kopie)`;

      // 2. Maak nieuwe rate_card aan, inactief zodat admin eerst reviewt
      const { data: created, error: createErr } = await supabase
        .from("rate_cards" as any)
        .insert({
          tenant_id: tenant.id,
          client_id: sourceCard.client_id ?? null,
          name: targetName,
          valid_from: sourceCard.valid_from ?? null,
          valid_until: sourceCard.valid_until ?? null,
          currency: sourceCard.currency ?? "EUR",
          is_active: false,
        })
        .select()
        .single();

      if (createErr) throw createErr;
      const newCard = created as RateCard;

      // 3. Kopieer alle regels naar de nieuwe kaart
      const sourceRules = (sourceCard.rate_rules ?? []) as RateRule[];
      if (sourceRules.length > 0) {
        const inserts = sourceRules
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((rule, idx) => ({
            rate_card_id: newCard.id,
            rule_type: rule.rule_type,
            transport_type: rule.transport_type ?? null,
            vehicle_type_id: rule.vehicle_type_id ?? null,
            amount: rule.amount,
            min_amount: rule.min_amount ?? null,
            conditions: rule.conditions ?? {},
            sort_order: rule.sort_order ?? idx,
          }));

        const { error: rulesErr } = await supabase
          .from("rate_rules" as any)
          .insert(inserts);

        if (rulesErr) throw rulesErr;
      }

      return { newCard, copiedRules: sourceRules.length };
    },
    onSuccess: ({ newCard }) => {
      queryClient.invalidateQueries({ queryKey: ["rate_cards"] });
      toast.success(`Tariefkaart gedupliceerd als "${newCard.name}"`);
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : "Onbekende fout";
      toast.error(`Fout bij dupliceren tariefkaart: ${msg}`);
    },
  });
}
