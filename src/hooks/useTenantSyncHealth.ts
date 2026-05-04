// Aggregate-hook over alle integration_sync_log rijen van de tenant in de
// laatste 5 minuten. Wordt gebruikt door HealthBanner (globale storing-pill)
// en de per-card status-badge in de marketplace.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";

export interface ConnectorHealth {
  provider: string;
  total: number;
  failed: number;
  avgLatency: number | null;
  lastEventAt: string | null;
  status: "ok" | "degraded" | "down";
}

export interface TenantSyncHealth {
  byProvider: Record<string, ConnectorHealth>;
  globalIncident: boolean;
  affectedProviders: string[];
  refreshedAt: number;
}

interface RawRow {
  provider: string;
  status: "SUCCESS" | "FAILED" | "SKIPPED";
  duration_ms: number | null;
  started_at: string;
}

const FIVE_MIN_MS = 5 * 60 * 1000;
const HEALTH_WINDOW_MIN = 5;
const FAILURE_THRESHOLD_PER_PROVIDER = 5;
const LATENCY_AMBER_MS = 1500;

export function useTenantSyncHealth() {
  const { tenant } = useTenant();
  return useQuery({
    queryKey: ["tenant_sync_health", tenant?.id],
    enabled: !!tenant?.id,
    refetchInterval: 30_000,
    staleTime: 15_000,
    queryFn: async (): Promise<TenantSyncHealth> => {
      const since = new Date(Date.now() - FIVE_MIN_MS).toISOString();
      const { data, error } = await supabase
        .from("integration_sync_log" as never)
        .select("provider, status, duration_ms, started_at")
        .eq("tenant_id", tenant!.id)
        .gte("started_at", since)
        .order("started_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return aggregate((data ?? []) as unknown as RawRow[]);
    },
  });
}

export function aggregate(rows: RawRow[]): TenantSyncHealth {
  const byProvider: Record<string, ConnectorHealth> = {};
  for (const row of rows) {
    let h = byProvider[row.provider];
    if (!h) {
      h = byProvider[row.provider] = {
        provider: row.provider,
        total: 0,
        failed: 0,
        avgLatency: 0,
        lastEventAt: null,
        status: "ok",
      };
    }
    h.total += 1;
    if (row.status === "FAILED") h.failed += 1;
    if (row.duration_ms != null) {
      h.avgLatency = ((h.avgLatency ?? 0) * (h.total - 1) + row.duration_ms) / h.total;
    }
    if (!h.lastEventAt || row.started_at > h.lastEventAt) h.lastEventAt = row.started_at;
  }
  for (const slug of Object.keys(byProvider)) {
    const h = byProvider[slug];
    h.avgLatency = h.avgLatency != null ? Math.round(h.avgLatency) : null;
    h.status = h.failed >= FAILURE_THRESHOLD_PER_PROVIDER
      ? "down"
      : (h.avgLatency ?? 0) >= LATENCY_AMBER_MS || (h.failed > 0 && h.failed / Math.max(1, h.total) >= 0.2)
        ? "degraded"
        : "ok";
  }
  const downProviders = Object.values(byProvider).filter((h) => h.status === "down").map((h) => h.provider);
  return {
    byProvider,
    globalIncident: downProviders.length > 1,
    affectedProviders: downProviders,
    refreshedAt: Date.now(),
  };
}

export const HEALTH_CONSTANTS = {
  WINDOW_MIN: HEALTH_WINDOW_MIN,
  FAILURE_THRESHOLD: FAILURE_THRESHOLD_PER_PROVIDER,
  LATENCY_AMBER_MS,
};
