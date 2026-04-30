import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { RateCard, RateRule } from "@/types/rateModels";

// ─── List Rate Cards ────────────────────────────────────────

export interface UseRateCardsOptions {
  clientId?: string | null;
  activeOnly?: boolean;
}

export function useRateCards(options: UseRateCardsOptions = {}) {
  const { clientId, activeOnly = true } = options;

  return useQuery({
    queryKey: ["rate_cards", { clientId, activeOnly }],
    staleTime: 5 * 60_000,
    refetchOnMount: false,
    queryFn: async () => {
      let query = supabase
        .from("rate_cards" as any)
        .select(`
          id,
          tenant_id,
          client_id,
          name,
          valid_from,
          valid_until,
          currency,
          is_active,
          created_at,
          updated_at,
          rate_rules(
            id,
            rate_card_id,
            rule_type,
            transport_type,
            amount,
            min_amount,
            conditions,
            sort_order,
            created_at
          ),
          clients(name)
        `)
        .order("created_at", { ascending: false });

      if (activeOnly) {
        query = query.eq("is_active", true);
      }

      if (clientId !== undefined) {
        if (clientId === null) {
          query = query.is("client_id", null);
        } else {
          query = query.eq("client_id", clientId);
        }
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data ?? []).map((rc: any) => ({
        ...rc,
        client: rc.clients ?? null,
        rate_rules: (rc.rate_rules ?? []).sort(
          (a: RateRule, b: RateRule) => a.sort_order - b.sort_order,
        ),
      })) as RateCard[];
    },
  });
}

// ─── Single Rate Card ───────────────────────────────────────

export function useRateCardById(id: string | null) {
  return useQuery({
    queryKey: ["rate_cards", id],
    enabled: !!id,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rate_cards" as any)
        .select("*, rate_rules(*), clients(name)")
        .eq("id", id!)
        .single();

      if (error) throw error;
      if (!data) return null;

      return {
        ...data,
        client: (data as any).clients ?? null,
        rate_rules: ((data as any).rate_rules ?? []).sort(
          (a: RateRule, b: RateRule) => a.sort_order - b.sort_order,
        ),
      } as RateCard;
    },
  });
}

// ─── Find Best Rate Card for Client ─────────────────────────

export function useClientRateCard(clientId: string | null) {
  return useQuery({
    queryKey: ["rate_cards", "client", clientId],
    enabled: !!clientId,
    staleTime: 15_000,
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];

      // Try client-specific first
      const { data: clientCard } = await supabase
        .from("rate_cards" as any)
        .select("*, rate_rules(*)")
        .eq("client_id", clientId!)
        .eq("is_active", true)
        .or(`valid_from.is.null,valid_from.lte.${today}`)
        .or(`valid_until.is.null,valid_until.gte.${today}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (clientCard) {
        return {
          ...clientCard,
          rate_rules: ((clientCard as any).rate_rules ?? []).sort(
            (a: RateRule, b: RateRule) => a.sort_order - b.sort_order,
          ),
        } as RateCard;
      }

      // Fallback to default (client_id IS NULL)
      const { data: defaultCard } = await supabase
        .from("rate_cards" as any)
        .select("*, rate_rules(*)")
        .is("client_id", null)
        .eq("is_active", true)
        .or(`valid_from.is.null,valid_from.lte.${today}`)
        .or(`valid_until.is.null,valid_until.gte.${today}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!defaultCard) return null;

      return {
        ...defaultCard,
        rate_rules: ((defaultCard as any).rate_rules ?? []).sort(
          (a: RateRule, b: RateRule) => a.sort_order - b.sort_order,
        ),
      } as RateCard;
    },
  });
}

// ─── Create Rate Card ───────────────────────────────────────

export interface CreateRateCardInput {
  tenant_id: string;
  client_id?: string | null;
  name: string;
  valid_from?: string | null;
  valid_until?: string | null;
  currency?: string;
}

export function useCreateRateCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateRateCardInput) => {
      const { data, error } = await supabase
        .from("rate_cards" as any)
        .insert({
          tenant_id: input.tenant_id,
          client_id: input.client_id ?? null,
          name: input.name,
          valid_from: input.valid_from ?? null,
          valid_until: input.valid_until ?? null,
          currency: input.currency ?? "EUR",
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;
      return data as RateCard;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rate_cards"] });
      queryClient.invalidateQueries({ queryKey: ["rate-card-audit-log"] });
      toast.success("Tariefkaart aangemaakt");
    },
    onError: () => {
      toast.error("Fout bij aanmaken tariefkaart");
    },
  });
}

// ─── Update Rate Card ───────────────────────────────────────

export function useUpdateRateCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<CreateRateCardInput> & { is_active?: boolean } }) => {
      const { data, error } = await supabase
        .from("rate_cards" as any)
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as RateCard;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["rate_cards"] });
      queryClient.invalidateQueries({ queryKey: ["rate_cards", variables.id] });
      toast.success("Tariefkaart bijgewerkt");
    },
    onError: () => {
      toast.error("Fout bij bijwerken tariefkaart");
    },
  });
}

// ─── Delete Rate Card ───────────────────────────────────────

export function useDeleteRateCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("rate_cards" as any)
        .delete()
        .eq("id", id);

      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rate_cards"] });
      queryClient.invalidateQueries({ queryKey: ["rate-card-audit-log"] });
      toast.success("Tariefkaart verwijderd");
    },
    onError: () => {
      toast.error("Fout bij verwijderen tariefkaart");
    },
  });
}

// ─── Upsert Rate Rules ──────────────────────────────────────

export function useUpsertRateRules() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      rateCardId,
      rules,
    }: {
      rateCardId: string;
      rules: Omit<RateRule, "id" | "created_at">[];
    }) => {
      // Delete existing rules
      const { error: deleteErr } = await supabase
        .from("rate_rules" as any)
        .delete()
        .eq("rate_card_id", rateCardId);

      if (deleteErr) throw deleteErr;

      // Insert new rules
      if (rules.length > 0) {
        const inserts = rules.map((rule, idx) => ({
          rate_card_id: rateCardId,
          rule_type: rule.rule_type,
          transport_type: rule.transport_type ?? null,
          amount: rule.amount,
          min_amount: rule.min_amount ?? null,
          conditions: rule.conditions ?? {},
          sort_order: rule.sort_order ?? idx,
        }));

        const { error: insertErr } = await supabase
          .from("rate_rules" as any)
          .insert(inserts);

        if (insertErr) throw insertErr;
      }

      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rate_cards"] });
      queryClient.invalidateQueries({ queryKey: ["rate-card-audit-log"] });
      toast.success("Tariefregels opgeslagen");
    },
    onError: () => {
      toast.error("Fout bij opslaan tariefregels");
    },
  });
}
