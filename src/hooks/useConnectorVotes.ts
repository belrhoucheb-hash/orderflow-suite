import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";

/**
 * Roadmap-stem voor connectoren. Tenant-scoped persistentie in
 * `connector_votes` met aggregate-view `connector_votes_aggregate`.
 *
 * De UI verwacht een telling per provider en een `hasVoted`-vlag voor de
 * huidige gebruiker. We doen dat in twee queries: een aggregate (voor de
 * totalen) en een lijstje van eigen votes (voor de toggle-state). Beide
 * worden door React Query gecached en geïnvalideerd na een toggle.
 *
 * SEED_COUNTS dient als display-only fallback zodat een lege tenant niet
 * met enkel "0 stemmen" oogt. Zodra er echte votes binnenkomen worden de
 * seed-tellingen er bovenop opgeteld voor presentatie. De primaire bron
 * blijft de DB.
 */

// Display-only baseline zodat de roadmap niet leeg oogt op een verse omgeving.
// Hoge stemmen = die connector heeft de meeste vraag van prospects (demo-cijfers).
const SEED_COUNTS: Record<string, number> = {
  twinfield: 41,
  afas: 28,
  yuki: 19,
  moneybird: 23,
  e_boekhouden: 12,
  visma: 7,
  webfleet: 34,
  samsara: 22,
  geotab: 9,
  tomtom_telematics: 14,
  mix_telematics: 5,
  microsoft_teams: 18,
  whatsapp_business: 31,
  twilio: 11,
  shopify: 26,
  sap_business_one: 8,
};

interface AggregateRow {
  provider: string | null;
  total_votes: number | null;
}

interface OwnVoteRow {
  provider: string;
}

export function useConnectorVotes() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const tenantId = tenant?.id ?? null;

  const aggregateQuery = useQuery({
    queryKey: ["connector_votes_aggregate", tenantId],
    enabled: !!tenantId,
    staleTime: 30_000,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from("connector_votes_aggregate")
        .select("provider, total_votes");
      if (error) throw error;
      const out: Record<string, number> = {};
      for (const row of (data ?? []) as AggregateRow[]) {
        if (!row.provider) continue;
        out[row.provider] = Number(row.total_votes ?? 0);
      }
      return out;
    },
  });

  const ownVotesQuery = useQuery({
    queryKey: ["connector_votes_own", tenantId],
    enabled: !!tenantId,
    staleTime: 30_000,
    queryFn: async (): Promise<Set<string>> => {
      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;
      if (!userId || !tenantId) return new Set<string>();
      const { data, error } = await supabase
        .from("connector_votes")
        .select("provider")
        .eq("tenant_id", tenantId)
        .eq("user_id", userId);
      if (error) throw error;
      return new Set<string>(((data ?? []) as OwnVoteRow[]).map((r) => r.provider));
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (slug: string) => {
      if (!tenantId) throw new Error("Geen tenant beschikbaar");
      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;
      if (!userId) throw new Error("Niet ingelogd");

      const alreadyVoted = ownVotesQuery.data?.has(slug) ?? false;

      if (alreadyVoted) {
        const { error } = await supabase
          .from("connector_votes")
          .delete()
          .eq("tenant_id", tenantId)
          .eq("user_id", userId)
          .eq("provider", slug);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("connector_votes")
          .insert({ tenant_id: tenantId, user_id: userId, provider: slug });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connector_votes_aggregate", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["connector_votes_own", tenantId] });
    },
  });

  const hasVoted = useCallback(
    (slug: string) => ownVotesQuery.data?.has(slug) ?? false,
    [ownVotesQuery.data],
  );

  const voteCount = useCallback(
    (slug: string) => {
      const dbCount = aggregateQuery.data?.[slug] ?? 0;
      const seed = SEED_COUNTS[slug] ?? 0;
      return seed + dbCount;
    },
    [aggregateQuery.data],
  );

  const toggleVote = useCallback(
    (slug: string) => {
      toggleMutation.mutate(slug);
    },
    [toggleMutation],
  );

  return { hasVoted, voteCount, toggleVote };
}
