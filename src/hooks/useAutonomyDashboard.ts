import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { readDevBypassUser } from "@/lib/devSession";
import type { DecisionType } from "@/types/confidence";
import type {
  AutonomyScoreResult,
  LearningMetric,
  CorrectionEntry,
  CorrectionPattern,
  TrendDataPoint,
} from "@/types/autonomy-dashboard";

function toDisplayText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.title === "string") return record.title;
    if (typeof record.actionType === "string") return record.actionType;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value ?? "");
}

// ── Pure helpers (exported for testing) ──────────────────────────

const ALL_MODULES: DecisionType[] = [
  "ORDER_INTAKE",
  "PLANNING",
  "DISPATCH",
  "PRICING",
  "INVOICING",
  "CONSOLIDATION",
];

export function computeOverallScore(
  scores: Array<{ decision_type: string; current_score: number; total_decisions: number }>
): number {
  if (scores.length === 0) return 0;
  const totalWeight = scores.reduce((s, r) => s + r.total_decisions, 0);
  if (totalWeight === 0) return 0;
  const weightedSum = scores.reduce(
    (s, r) => s + r.current_score * r.total_decisions,
    0
  );
  return weightedSum / totalWeight;
}

export function detectCorrectionPatterns(
  corrections: CorrectionEntry[]
): CorrectionPattern[] {
  if (corrections.length === 0) return [];
  const groups = new Map<DecisionType, CorrectionEntry[]>();
  for (const c of corrections) {
    const existing = groups.get(c.decisionType) ?? [];
    existing.push(c);
    groups.set(c.decisionType, existing);
  }
  const patterns: CorrectionPattern[] = [];
  for (const [type, entries] of groups) {
    patterns.push({
      description: `${type} gecorrigeerd ${entries.length}x deze periode`,
      count: entries.length,
      decisionType: type,
      example: entries[0],
    });
  }
  patterns.sort((a, b) => b.count - a.count);
  return patterns;
}

function getWeekKey(dateStr: string): string {
  const d = new Date(dateStr);
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNum = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + yearStart.getDay() + 1) / 7
  );
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function getWeekLabel(weekKey: string): string {
  const [_year, wPart] = weekKey.split("-W");
  return `Week ${parseInt(wPart)}`;
}

function classifyResolution(
  resolution: string
): "autonomous" | "validated" | "manual" {
  if (resolution === "AUTO_EXECUTED") return "autonomous";
  if (resolution === "APPROVED") return "validated";
  return "manual";
}

function classifyLearningStatus(
  score: number,
  autonomousSince: string | null
): "autonomous" | "validation" | "learning" {
  if (autonomousSince) return "autonomous";
  if (score >= 60) return "validation";
  return "learning";
}

// ── Hooks ────────────────────────────────────────────────────────

export function useAutonomyScore() {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ["autonomy-score", tenant?.id],
    enabled: !!tenant?.id,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<AutonomyScoreResult> => {
      if (import.meta.env.DEV && readDevBypassUser()) {
        return {
          overall: 0,
          perModule: {
            ORDER_INTAKE: 0,
            PLANNING: 0,
            DISPATCH: 0,
            PRICING: 0,
            INVOICING: 0,
            CONSOLIDATION: 0,
          },
          todayStats: { autonomous: 0, validated: 0, manual: 0 },
        };
      }

      // 1. Get confidence scores per module
      const { data: scores, error: scoresErr } = await (supabase
        .from("confidence_scores" as any)
        .select("decision_type, current_score, total_decisions, approved_count, modified_count, rejected_count")
        .eq("tenant_id", tenant!.id) as any);

      if (scoresErr) throw scoresErr;
      const scoreRows = (scores ?? []) as Array<{
        decision_type: string;
        current_score: number;
        total_decisions: number;
      }>;

      // 2. Overall score
      const overall = computeOverallScore(scoreRows);

      // 3. Per-module map
      const perModule = {} as Record<DecisionType, number>;
      for (const mod of ALL_MODULES) {
        const row = scoreRows.find((r) => r.decision_type === mod);
        perModule[mod] = row?.current_score ?? 0;
      }

      // 4. Today's stats from decision_log
      const todayStr = new Date().toISOString().split("T")[0];
      const { data: todayDecisions, error: todayErr } = await (supabase
        .from("decision_log" as any)
        .select("resolution")
        .eq("tenant_id", tenant!.id)
        .gte("created_at", todayStr) as any);

      if (todayErr) throw todayErr;
      const decisions = (todayDecisions ?? []) as Array<{ resolution: string }>;

      const todayStats = { autonomous: 0, validated: 0, manual: 0 };
      for (const d of decisions) {
        const cat = classifyResolution(d.resolution);
        todayStats[cat]++;
      }

      return { overall, perModule, todayStats };
    },
  });
}

export function useDecisionFeed(limit = 20) {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ["decision-feed", tenant?.id, limit],
    enabled: !!tenant?.id,
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("decision_log" as any)
        .select("*")
        .eq("tenant_id", tenant!.id)
        .order("created_at", { ascending: false })
        .limit(limit) as any);

      if (error) throw error;
      return ((data ?? []) as Array<{
        id: string;
        decision_type: DecisionType;
        entity_type: string;
        entity_id: string;
        client_id: string;
        proposed_action: unknown;
        actual_action: unknown;
        input_confidence: number;
        model_confidence: number;
        outcome_confidence: number;
        resolution: string;
        resolved_by: string | null;
        resolved_at: string | null;
        created_at: string;
      }>).map((row) => ({
        ...row,
        proposed_action: toDisplayText(row.proposed_action),
        actual_action: toDisplayText(row.actual_action),
      }));
    },
  });
}

export function useLearningProgress(clientId?: string) {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ["learning-progress", tenant?.id, clientId],
    enabled: !!tenant?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<LearningMetric[]> => {
      let query = supabase
        .from("confidence_scores" as any)
        .select("client_id, total_decisions, current_score, last_updated, clients(name)")
        .eq("tenant_id", tenant!.id) as any;

      if (clientId) {
        query = query.eq("client_id", clientId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const rows = (data ?? []) as Array<{
        client_id: string;
        total_decisions: number;
        current_score: number;
        last_updated: string;
        clients?: { name: string } | null;
      }>;

      // Determine autonomy threshold from tenant settings
      const settings = (tenant as any)?.settings;
      const autonomyThreshold = settings?.autonomy?.global_threshold ?? 95;

      return rows
        .filter((r) => r.client_id != null)
        .map((r) => ({
          clientId: r.client_id,
          clientName: r.clients?.name ?? r.client_id,
          totalOrders: r.total_decisions,
          currentConfidence: r.current_score,
          firstSeen: r.last_updated ?? "",
          autonomousSince: r.current_score >= autonomyThreshold ? r.last_updated : null,
          status: classifyLearningStatus(r.current_score, r.current_score >= autonomyThreshold ? r.last_updated : null),
        }));
    },
  });
}

export function useCorrectionLog(days = 7) {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ["correction-log", tenant?.id, days],
    enabled: !!tenant?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<CorrectionEntry[]> => {
      const since = new Date();
      since.setDate(since.getDate() - days);

      const { data, error } = await (supabase
        .from("decision_log" as any)
        .select("id, decision_type, entity_id, client_id, proposed_action, actual_action, resolved_by, resolved_at, created_at")
        .eq("tenant_id", tenant!.id)
        .eq("resolution", "MODIFIED")
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false }) as any);

      if (error) throw error;

      return ((data ?? []) as any[]).map((r: any) => ({
        id: r.id,
        decisionType: r.decision_type as DecisionType,
        entityId: r.entity_id,
        clientId: r.client_id,
        clientName: r.client_id,
        proposedAction: toDisplayText(r.proposed_action),
        actualAction: toDisplayText(r.actual_action),
        resolvedBy: r.resolved_by ?? "",
        resolvedAt: r.resolved_at ?? "",
        createdAt: r.created_at,
      }));
    },
  });
}

export function useAutonomyTrend(weeks = 8) {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ["autonomy-trend", tenant?.id, weeks],
    enabled: !!tenant?.id,
    staleTime: 300_000,
    queryFn: async (): Promise<TrendDataPoint[]> => {
      const since = new Date();
      since.setDate(since.getDate() - weeks * 7);

      const { data, error } = await (supabase
        .from("decision_log" as any)
        .select("decision_type, input_confidence, created_at")
        .eq("tenant_id", tenant!.id)
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: true }) as any);

      if (error) throw error;

      const rows = (data ?? []) as Array<{
        decision_type: string;
        input_confidence: number;
        created_at: string;
      }>;

      // Group by week + decision_type
      const weekMap = new Map<
        string,
        Map<string, { sum: number; count: number }>
      >();

      for (const row of rows) {
        const wk = getWeekKey(row.created_at);
        if (!weekMap.has(wk)) weekMap.set(wk, new Map());
        const moduleMap = weekMap.get(wk)!;
        const key = row.decision_type;
        const existing = moduleMap.get(key) ?? { sum: 0, count: 0 };
        existing.sum += row.input_confidence;
        existing.count++;
        moduleMap.set(key, existing);
      }

      // Build trend points sorted by week
      const sortedWeeks = Array.from(weekMap.keys()).sort();
      return sortedWeeks.map((wk) => {
        const moduleMap = weekMap.get(wk)!;
        const point: any = {
          week: wk,
          weekLabel: getWeekLabel(wk),
        };
        let totalSum = 0;
        let totalCount = 0;
        for (const mod of ALL_MODULES) {
          const entry = moduleMap.get(mod);
          point[mod] = entry ? Math.round(entry.sum / entry.count) : 0;
          if (entry) {
            totalSum += entry.sum;
            totalCount += entry.count;
          }
        }
        point.overall = totalCount > 0 ? Math.round(totalSum / totalCount) : 0;
        return point as TrendDataPoint;
      });
    },
  });
}
