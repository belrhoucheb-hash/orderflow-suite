import { useCallback, useEffect, useState } from "react";

/**
 * Lokale stem-feature voor roadmap-connectors.
 *
 * V1 persisteert in localStorage (per browser-profiel) zodat de UX direct werkt
 * zonder backend. V2 zal een tenant-scoped tabel `connector_votes` introduceren
 * (TODO bij eerste echte usage-data) en deze hook vervangen door een Supabase
 * query. De API houden we identiek zodat de migratie wisselt zonder UI-aanpassing.
 */

const STORAGE_KEY = "orderflow_connector_votes";

interface VoteState {
  voted: Record<string, boolean>;
  baseCount: Record<string, number>;
}

// Mocked baseline-stemcount zodat de roadmap niet leeg oogt op een verse omgeving.
// Hoge stemmen = die connector heeft de meeste vraag van prospects (ongebaseerd, demo).
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

function readState(): VoteState {
  if (typeof window === "undefined") return { voted: {}, baseCount: SEED_COUNTS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { voted: {}, baseCount: SEED_COUNTS };
    const parsed = JSON.parse(raw) as Partial<VoteState>;
    return {
      voted: parsed.voted ?? {},
      baseCount: { ...SEED_COUNTS, ...(parsed.baseCount ?? {}) },
    };
  } catch {
    return { voted: {}, baseCount: SEED_COUNTS };
  }
}

function writeState(state: VoteState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage niet beschikbaar (private mode of quota), best-effort.
  }
}

export function useConnectorVotes() {
  const [state, setState] = useState<VoteState>(() => readState());

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setState(readState());
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const hasVoted = useCallback((slug: string) => state.voted[slug] === true, [state]);

  const voteCount = useCallback(
    (slug: string) => {
      const base = state.baseCount[slug] ?? 0;
      return base + (state.voted[slug] ? 1 : 0);
    },
    [state],
  );

  const toggleVote = useCallback((slug: string) => {
    setState((prev) => {
      const voted = { ...prev.voted, [slug]: !prev.voted[slug] };
      const next = { ...prev, voted };
      writeState(next);
      return next;
    });
  }, []);

  return { hasVoted, voteCount, toggleVote };
}
