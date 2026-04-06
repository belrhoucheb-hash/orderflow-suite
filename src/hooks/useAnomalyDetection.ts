// ─── Anomaly Detection Hooks ─────────────────────────────────────

import { useCallback, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Anomaly, AnomalyCategory, AnomalyRow } from '@/types/anomaly';
import { mapRowToAnomaly } from '@/types/anomaly';

// ─── Filters ─────────────────────────────────────────────────────

export interface AnomalyFilters {
  category?: AnomalyCategory;
  severity?: Anomaly['severity'];
  entityType?: Anomaly['entityType'];
  unresolvedOnly?: boolean;
}

// ─── useAnomalies ────────────────────────────────────────────────

export function useAnomalies(filters?: AnomalyFilters) {
  return useQuery({
    queryKey: ['anomalies', filters],
    queryFn: async () => {
      let query = (supabase as any)
        .from('anomalies')
        .select('*')
        .order('detected_at', { ascending: false });

      if (filters?.category) {
        query = query.eq('category', filters.category);
      }
      if (filters?.severity) {
        query = query.eq('severity', filters.severity);
      }
      if (filters?.entityType) {
        query = query.eq('entity_type', filters.entityType);
      }
      if (filters?.unresolvedOnly !== false) {
        // Default: only show unresolved
        query = query.is('resolved_at', null);
      }

      const { data, error } = await query;
      if (error) throw error;
      return ((data ?? []) as AnomalyRow[]).map(mapRowToAnomaly);
    },
    refetchInterval: 60_000,
  });
}

// ─── resolveAnomaly ─────────────────────────────────────────────

export function useResolveAnomaly() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      resolvedBy,
    }: {
      id: string;
      resolvedBy?: string;
    }) => {
      const { error } = await (supabase as any)
        .from('anomalies')
        .update({
          resolved_at: new Date().toISOString(),
          resolved_by: resolvedBy ?? null,
          auto_resolved: !resolvedBy,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['anomalies'] });
      queryClient.invalidateQueries({ queryKey: ['anomaly-stats'] });
    },
  });
}

// ─── useAnomalyStats ────────────────────────────────────────────

export interface AnomalyStats {
  byCategory: Record<AnomalyCategory, number>;
  bySeverity: Record<Anomaly['severity'], number>;
  total: number;
  autoResolved: number;
}

export function useAnomalyStats() {
  return useQuery({
    queryKey: ['anomaly-stats'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('anomalies')
        .select('category, severity, auto_resolved, resolved_at');
      if (error) throw error;

      const rows = (data ?? []) as Array<{
        category: string;
        severity: string;
        auto_resolved: boolean;
        resolved_at: string | null;
      }>;

      const stats: AnomalyStats = {
        byCategory: { pricing: 0, timing: 0, capacity: 0, compliance: 0, pattern: 0 },
        bySeverity: { info: 0, warning: 0, critical: 0 },
        total: 0,
        autoResolved: 0,
      };

      for (const row of rows) {
        if (row.resolved_at) {
          if (row.auto_resolved) stats.autoResolved += 1;
          continue; // don't count resolved in active stats
        }
        stats.total += 1;
        const cat = row.category as AnomalyCategory;
        if (cat in stats.byCategory) stats.byCategory[cat] += 1;
        const sev = row.severity as Anomaly['severity'];
        if (sev in stats.bySeverity) stats.bySeverity[sev] += 1;
      }

      return stats;
    },
    refetchInterval: 60_000,
  });
}

// ─── useAutoResolve ─────────────────────────────────────────────
// Periodically resolves anomalies marked as auto_resolvable + info severity

export function useAutoResolve(intervalMs: number = 5 * 60 * 1000) {
  const resolveMutation = useResolveAnomaly();

  const autoResolve = useCallback(async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('anomalies')
        .select('id')
        .eq('auto_resolvable', true)
        .eq('severity', 'info')
        .is('resolved_at', null);

      if (error || !data) return;

      for (const row of data as Array<{ id: string }>) {
        resolveMutation.mutate({ id: row.id });
      }
    } catch {
      // Silently fail auto-resolve — it's best-effort
    }
  }, [resolveMutation]);

  useEffect(() => {
    const timer = setInterval(autoResolve, intervalMs);
    // Run once immediately
    autoResolve();
    return () => clearInterval(timer);
  }, [autoResolve, intervalMs]);
}

// ─── Convert Anomaly to ExceptionItem format for Exceptions page ─

export interface AnomalyAsException {
  id: string;
  type: string;
  urgency: Anomaly['severity'];
  orderNumber: string;
  clientName: string;
  description: string;
  detectedAt: Date;
  actionLabel: string;
  actionTo: string;
  source: 'anomaly';
  anomalyCategory: AnomalyCategory;
}

const entityRouteMap: Record<Anomaly['entityType'], string> = {
  order: '/orders',
  trip: '/planning',
  invoice: '/facturatie',
  vehicle: '/vloot',
  driver: '/chauffeurs',
};

export function anomalyToException(a: Anomaly): AnomalyAsException {
  const route = entityRouteMap[a.entityType] ?? '/exceptions';
  return {
    id: `anomaly-${a.id}`,
    type: a.category === 'pricing'
      ? 'Prijs'
      : a.category === 'timing'
        ? 'Timing'
        : a.category === 'capacity'
          ? 'Capaciteit'
          : a.category === 'compliance'
            ? 'Compliance'
            : 'Patroon',
    urgency: a.severity,
    orderNumber: a.entityId ? `${a.entityType}` : '-',
    clientName: (a.data?.client_name as string) ?? '',
    description: a.description,
    detectedAt: new Date(a.detectedAt),
    actionLabel: 'Bekijk details',
    actionTo: `${route}/${a.entityId}`,
    source: 'anomaly',
    anomalyCategory: a.category,
  };
}
