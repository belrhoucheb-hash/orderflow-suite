# Plan G: Autonomy Dashboard

> **Skill:** `superpowers:subagent-driven-development`
> **Date:** 2026-04-05
> **Status:** READY
> **Depends on:** Plan A (Confidence Engine) — tables `decision_log`, `confidence_scores`, hook `useConfidence.ts`, types in `confidence.ts`

---

## Goal

Build an **Autonomie** dashboard page that gives planners and admins full visibility into how the AI is learning: an overall autonomy score, per-module breakdowns, a live decision feed, per-client learning progress, a correction log with pattern detection, and a weekly trend chart. Also embed a summary card into the existing Dashboard page.

---

## Architecture

```
src/types/autonomy-dashboard.ts          -- LearningMetric, CorrectionEntry, TrendDataPoint, AutonomyScoreResult
src/hooks/useAutonomyDashboard.ts        -- 5 TanStack Query hooks (score, feed, learning, corrections, trend)
src/components/dashboard/AutonomyScoreCard.tsx   -- Summary card (reused on Dashboard + Autonomie page)
src/components/dashboard/DecisionFeed.tsx         -- Real-time scrolling decision list
src/components/dashboard/LearningProgress.tsx     -- Per-client learning table
src/components/dashboard/CorrectionLog.tsx        -- Corrections with pattern detection
src/components/dashboard/AutonomyTrendChart.tsx   -- Recharts AreaChart weekly trend
src/pages/Autonomie.tsx                           -- Full page with tabs
src/test/autonomyDashboard.test.ts                -- 10+ unit tests
```

**Modified files:**
- `src/App.tsx` — add lazy import + route `/autonomie`
- `src/components/AppSidebar.tsx` — add "Autonomie" nav item
- `src/pages/Dashboard.tsx` — add AutonomyScoreCard widget

---

## Tech Stack

| Layer | Tool |
|-------|------|
| UI | React 18, Shadcn (Card, Badge, Button, Progress, Tabs, Slider, ScrollArea), Tailwind |
| Charts | Recharts 2.15 (AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Area, CartesianGrid) |
| State | TanStack Query 5 |
| Backend | Supabase (PostgreSQL + Realtime) |
| Icons | Lucide (Brain, Bot, CheckCircle2, XCircle, Edit3, TrendingUp, Activity) |
| Animation | Framer Motion |
| Tests | Vitest + @testing-library/react |

---

## File Structure After Implementation

```
src/
  types/
    autonomy-dashboard.ts        [NEW]
  hooks/
    useAutonomyDashboard.ts      [NEW]
  components/
    dashboard/
      AutonomyScoreCard.tsx      [NEW]
      DecisionFeed.tsx           [NEW]
      LearningProgress.tsx       [NEW]
      CorrectionLog.tsx          [NEW]
      AutonomyTrendChart.tsx     [NEW]
  pages/
    Autonomie.tsx                [NEW]
    Dashboard.tsx                [MODIFIED]
  components/
    AppSidebar.tsx               [MODIFIED]
  App.tsx                        [MODIFIED]
  test/
    autonomyDashboard.test.ts    [NEW]
```

---

## Tasks

### Task 1: Types (`src/types/autonomy-dashboard.ts`)

- [ ] Create file `src/types/autonomy-dashboard.ts` with the following complete content:

```typescript
import type { DecisionType, Resolution } from "@/types/confidence";

export interface AutonomyScoreResult {
  overall: number;
  perModule: Record<DecisionType, number>;
  todayStats: {
    autonomous: number;
    validated: number;
    manual: number;
  };
}

export interface LearningMetric {
  clientId: string;
  clientName: string;
  totalOrders: number;
  currentConfidence: number;
  firstSeen: string;
  autonomousSince: string | null;
  status: "autonomous" | "validation" | "learning";
}

export interface CorrectionEntry {
  id: string;
  decisionType: DecisionType;
  entityId: string;
  clientId: string;
  clientName: string;
  proposedAction: string;
  actualAction: string;
  resolvedBy: string;
  resolvedAt: string;
  createdAt: string;
}

export interface CorrectionPattern {
  description: string;
  count: number;
  decisionType: DecisionType;
  example: CorrectionEntry;
}

export interface TrendDataPoint {
  week: string;
  weekLabel: string;
  ORDER_INTAKE: number;
  PLANNING: number;
  DISPATCH: number;
  PRICING: number;
  INVOICING: number;
  CONSOLIDATION: number;
  overall: number;
}
```

---

### Task 2: Tests (`src/test/autonomyDashboard.test.ts`)

- [ ] Create file `src/test/autonomyDashboard.test.ts` with the following complete content:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { createWrapper, mockSupabase } from "./testUtils";
import {
  useAutonomyScore,
  useDecisionFeed,
  useLearningProgress,
  useCorrectionLog,
  useAutonomyTrend,
  computeOverallScore,
  detectCorrectionPatterns,
} from "@/hooks/useAutonomyDashboard";
import type { DecisionType } from "@/types/confidence";

// Helper to build a chainable mock for supabase.from().select().eq()...
function chainMock(resolvedData: any) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    then: vi.fn((resolve: any) => resolve({ data: resolvedData, error: null })),
  };
  // Make it thenable so TanStack Query can await it
  chain[Symbol.for("nodejs.util.promisify.custom")] = undefined;
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("computeOverallScore", () => {
  it("returns 0 when scores array is empty", () => {
    expect(computeOverallScore([])).toBe(0);
  });

  it("calculates weighted average from confidence scores", () => {
    const scores = [
      { decision_type: "ORDER_INTAKE", current_score: 80, total_decisions: 100 },
      { decision_type: "PLANNING", current_score: 60, total_decisions: 50 },
    ];
    // Weighted: (80*100 + 60*50) / (100+50) = 11000/150 = 73.33
    const result = computeOverallScore(scores);
    expect(result).toBeCloseTo(73.33, 1);
  });

  it("handles single module", () => {
    const scores = [
      { decision_type: "DISPATCH", current_score: 95, total_decisions: 200 },
    ];
    expect(computeOverallScore(scores)).toBe(95);
  });
});

describe("detectCorrectionPatterns", () => {
  it("returns empty array for no corrections", () => {
    expect(detectCorrectionPatterns([])).toEqual([]);
  });

  it("groups corrections by decisionType and counts them", () => {
    const corrections = [
      { id: "1", decisionType: "PLANNING" as DecisionType, entityId: "e1", clientId: "c1", clientName: "Klant A", proposedAction: "Vehicle A", actualAction: "Vehicle B", resolvedBy: "user1", resolvedAt: "2026-04-01T10:00:00Z", createdAt: "2026-04-01T09:00:00Z" },
      { id: "2", decisionType: "PLANNING" as DecisionType, entityId: "e2", clientId: "c1", clientName: "Klant A", proposedAction: "Vehicle A", actualAction: "Vehicle C", resolvedBy: "user1", resolvedAt: "2026-04-02T10:00:00Z", createdAt: "2026-04-02T09:00:00Z" },
      { id: "3", decisionType: "PRICING" as DecisionType, entityId: "e3", clientId: "c2", clientName: "Klant B", proposedAction: "€100", actualAction: "€120", resolvedBy: "user2", resolvedAt: "2026-04-03T10:00:00Z", createdAt: "2026-04-03T09:00:00Z" },
    ];
    const patterns = detectCorrectionPatterns(corrections);
    expect(patterns.length).toBe(2);
    const planningPattern = patterns.find((p) => p.decisionType === "PLANNING");
    expect(planningPattern?.count).toBe(2);
  });

  it("sorts patterns by count descending", () => {
    const corrections = [
      { id: "1", decisionType: "PLANNING" as DecisionType, entityId: "e1", clientId: "c1", clientName: "A", proposedAction: "X", actualAction: "Y", resolvedBy: "u1", resolvedAt: "2026-04-01T10:00:00Z", createdAt: "2026-04-01T09:00:00Z" },
      { id: "2", decisionType: "DISPATCH" as DecisionType, entityId: "e2", clientId: "c2", clientName: "B", proposedAction: "X", actualAction: "Y", resolvedBy: "u1", resolvedAt: "2026-04-02T10:00:00Z", createdAt: "2026-04-02T09:00:00Z" },
      { id: "3", decisionType: "DISPATCH" as DecisionType, entityId: "e3", clientId: "c2", clientName: "B", proposedAction: "X", actualAction: "Y", resolvedBy: "u1", resolvedAt: "2026-04-03T10:00:00Z", createdAt: "2026-04-03T09:00:00Z" },
      { id: "4", decisionType: "DISPATCH" as DecisionType, entityId: "e4", clientId: "c2", clientName: "B", proposedAction: "X", actualAction: "Y", resolvedBy: "u1", resolvedAt: "2026-04-04T10:00:00Z", createdAt: "2026-04-04T09:00:00Z" },
    ];
    const patterns = detectCorrectionPatterns(corrections);
    expect(patterns[0].decisionType).toBe("DISPATCH");
    expect(patterns[0].count).toBe(3);
  });
});

describe("useAutonomyScore", () => {
  it("fetches confidence scores and computes overall + per-module scores", async () => {
    const mockScores = [
      { decision_type: "ORDER_INTAKE", current_score: 85, total_decisions: 100, approved_count: 85, modified_count: 10, rejected_count: 5 },
      { decision_type: "PLANNING", current_score: 70, total_decisions: 50, approved_count: 35, modified_count: 10, rejected_count: 5 },
    ];

    const todayStr = new Date().toISOString().split("T")[0];
    const mockTodayDecisions = [
      { resolution: "AUTO_EXECUTED" },
      { resolution: "AUTO_EXECUTED" },
      { resolution: "APPROVED" },
      { resolution: "MODIFIED" },
    ];

    let callCount = 0;
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "confidence_scores") {
        return chainMock(mockScores);
      }
      if (table === "decision_log") {
        return chainMock(mockTodayDecisions);
      }
      return chainMock([]);
    });

    const { result } = renderHook(() => useAutonomyScore(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.overall).toBeCloseTo(80, 0);
    expect(result.current.data?.perModule.ORDER_INTAKE).toBe(85);
    expect(result.current.data?.perModule.PLANNING).toBe(70);
    expect(result.current.data?.todayStats.autonomous).toBe(2);
    expect(result.current.data?.todayStats.validated).toBe(1);
    expect(result.current.data?.todayStats.manual).toBe(1);
  });
});

describe("useDecisionFeed", () => {
  it("fetches latest decisions ordered by created_at DESC", async () => {
    const mockDecisions = [
      { id: "d1", decision_type: "ORDER_INTAKE", resolution: "AUTO_EXECUTED", input_confidence: 92, created_at: "2026-04-05T10:00:00Z", proposed_action: "Accept order", entity_id: "o1", entity_type: "order", client_id: "c1" },
      { id: "d2", decision_type: "PLANNING", resolution: "MODIFIED", input_confidence: 65, created_at: "2026-04-05T09:00:00Z", proposed_action: "Assign Vehicle A", entity_id: "o2", entity_type: "order", client_id: "c2" },
    ];

    mockSupabase.from.mockImplementation(() => chainMock(mockDecisions));

    const { result } = renderHook(() => useDecisionFeed(10), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0].id).toBe("d1");
  });
});

describe("useLearningProgress", () => {
  it("fetches per-client learning metrics and computes status", async () => {
    const mockData = [
      { client_id: "c1", client_name: "Klant A", total_decisions: 50, current_score: 90, first_seen: "2026-01-01T00:00:00Z", autonomous_since: "2026-03-01T00:00:00Z" },
      { client_id: "c2", client_name: "Klant B", total_decisions: 10, current_score: 45, first_seen: "2026-03-15T00:00:00Z", autonomous_since: null },
    ];

    mockSupabase.from.mockImplementation(() => chainMock(mockData));

    const { result } = renderHook(() => useLearningProgress(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0].status).toBe("autonomous");
    expect(result.current.data?.[1].status).toBe("learning");
  });
});

describe("useCorrectionLog", () => {
  it("fetches corrections from the last N days", async () => {
    const mockCorrections = [
      { id: "c1", decision_type: "PLANNING", entity_id: "e1", client_id: "c1", proposed_action: "Vehicle A", actual_action: "Vehicle B", resolved_by: "user1", resolved_at: "2026-04-04T10:00:00Z", created_at: "2026-04-04T09:00:00Z" },
    ];

    mockSupabase.from.mockImplementation(() => chainMock(mockCorrections));

    const { result } = renderHook(() => useCorrectionLog(7), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
  });
});

describe("useAutonomyTrend", () => {
  it("fetches and aggregates weekly trend data", async () => {
    const mockLog = [
      { decision_type: "ORDER_INTAKE", input_confidence: 80, created_at: "2026-03-30T10:00:00Z" },
      { decision_type: "ORDER_INTAKE", input_confidence: 90, created_at: "2026-03-31T10:00:00Z" },
      { decision_type: "PLANNING", input_confidence: 70, created_at: "2026-03-30T10:00:00Z" },
    ];

    mockSupabase.from.mockImplementation(() => chainMock(mockLog));

    const { result } = renderHook(() => useAutonomyTrend(8), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeDefined();
    expect(Array.isArray(result.current.data)).toBe(true);
  });
});
```

- [ ] Run tests (expect FAIL — hooks not yet implemented):

```bash
cd C:/Users/Badr/Desktop/DevBadr/orderflow-suite && npx vitest run src/test/autonomyDashboard.test.ts
```

---

### Task 3: Hook (`src/hooks/useAutonomyDashboard.ts`)

- [ ] Create file `src/hooks/useAutonomyDashboard.ts` with the following complete content:

```typescript
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import type { DecisionType } from "@/types/confidence";
import type {
  AutonomyScoreResult,
  LearningMetric,
  CorrectionEntry,
  CorrectionPattern,
  TrendDataPoint,
} from "@/types/autonomy-dashboard";

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
  const [year, wPart] = weekKey.split("-W");
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
      // 1. Get confidence scores per module
      const { data: scores, error: scoresErr } = await supabase
        .from("confidence_scores" as any)
        .select("decision_type, current_score, total_decisions, approved_count, modified_count, rejected_count")
        .eq("tenant_id", tenant!.id);

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
      const { data: todayDecisions, error: todayErr } = await supabase
        .from("decision_log" as any)
        .select("resolution")
        .eq("tenant_id", tenant!.id)
        .gte("created_at", todayStr);

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
      const { data, error } = await supabase
        .from("decision_log" as any)
        .select("*")
        .eq("tenant_id", tenant!.id)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        decision_type: DecisionType;
        entity_type: string;
        entity_id: string;
        client_id: string;
        proposed_action: string;
        actual_action: string;
        input_confidence: number;
        model_confidence: number;
        outcome_confidence: number;
        resolution: string;
        resolved_by: string | null;
        resolved_at: string | null;
        created_at: string;
      }>;
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
        .select("client_id, total_decisions, current_score")
        .eq("tenant_id", tenant!.id);

      if (clientId) {
        query = query.eq("client_id", clientId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const rows = (data ?? []) as Array<{
        client_id: string;
        client_name?: string;
        total_decisions: number;
        current_score: number;
        first_seen?: string;
        autonomous_since?: string | null;
      }>;

      return rows.map((r) => ({
        clientId: r.client_id,
        clientName: r.client_name ?? r.client_id,
        totalOrders: r.total_decisions,
        currentConfidence: r.current_score,
        firstSeen: r.first_seen ?? "",
        autonomousSince: r.autonomous_since ?? null,
        status: classifyLearningStatus(r.current_score, r.autonomous_since ?? null),
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

      const { data, error } = await supabase
        .from("decision_log" as any)
        .select("id, decision_type, entity_id, client_id, proposed_action, actual_action, resolved_by, resolved_at, created_at")
        .eq("tenant_id", tenant!.id)
        .eq("resolution", "MODIFIED")
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false });

      if (error) throw error;

      return ((data ?? []) as any[]).map((r) => ({
        id: r.id,
        decisionType: r.decision_type as DecisionType,
        entityId: r.entity_id,
        clientId: r.client_id,
        clientName: r.client_id,
        proposedAction: r.proposed_action,
        actualAction: r.actual_action,
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

      const { data, error } = await supabase
        .from("decision_log" as any)
        .select("decision_type, input_confidence, created_at")
        .eq("tenant_id", tenant!.id)
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: true });

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
```

- [ ] Run tests (expect PASS for pure function tests, hooks may need mock adjustments):

```bash
cd C:/Users/Badr/Desktop/DevBadr/orderflow-suite && npx vitest run src/test/autonomyDashboard.test.ts
```

- [ ] Fix any failing tests until all 10 pass.

---

### Task 4: AutonomyScoreCard (`src/components/dashboard/AutonomyScoreCard.tsx`)

- [ ] Create file `src/components/dashboard/AutonomyScoreCard.tsx` with the following complete content:

```tsx
import { Brain, Bot, CheckCircle2, Edit3, XCircle } from "lucide-react";
import { motion } from "framer-motion";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useAutonomyScore } from "@/hooks/useAutonomyDashboard";
import type { DecisionType } from "@/types/confidence";

const MODULE_LABELS: Record<DecisionType, string> = {
  ORDER_INTAKE: "Order Intake",
  PLANNING: "Planning",
  DISPATCH: "Dispatch",
  PRICING: "Pricing",
  INVOICING: "Facturatie",
  CONSOLIDATION: "Consolidatie",
};

function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-amber-600";
  return "text-red-500";
}

function progressColor(score: number): string {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 60) return "bg-amber-500";
  return "bg-red-500";
}

interface AutonomyScoreCardProps {
  compact?: boolean;
}

export function AutonomyScoreCard({ compact = false }: AutonomyScoreCardProps) {
  const { data, isLoading } = useAutonomyScore();

  if (isLoading || !data) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-xl border border-border/40 shadow-sm p-4"
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="h-6 w-6 rounded-md bg-violet-500/10 flex items-center justify-center">
            <Brain className="h-3.5 w-3.5 text-violet-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold font-display">AI Autonomie</h2>
            <p className="text-xs text-muted-foreground">Laden...</p>
          </div>
        </div>
        <div className="animate-pulse space-y-2">
          <div className="h-8 bg-muted/50 rounded" />
          <div className="h-2 bg-muted/50 rounded" />
        </div>
      </motion.div>
    );
  }

  const overall = Math.round(data.overall);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.06 }}
      className="bg-card rounded-xl border border-border/40 shadow-sm p-4"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="h-6 w-6 rounded-md bg-violet-500/10 flex items-center justify-center">
          <Brain className="h-3.5 w-3.5 text-violet-600" />
        </div>
        <div>
          <h2 className="text-sm font-semibold font-display">AI Autonomie</h2>
          <p className="text-xs text-muted-foreground">Gemiddelde betrouwbaarheid</p>
        </div>
      </div>

      {/* Overall score */}
      <div className="flex items-end gap-3 mb-3">
        <span className={`text-3xl font-bold font-display tabular-nums ${scoreColor(overall)}`}>
          {overall}%
        </span>
        <div className="flex-1">
          <Progress value={overall} className="h-2" />
        </div>
      </div>

      {/* Today stats */}
      <div className="flex gap-3 mb-3">
        <div className="flex items-center gap-1.5">
          <Bot className="h-3.5 w-3.5 text-emerald-500" />
          <span className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{data.todayStats.autonomous}</span> autonoom
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-blue-500" />
          <span className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{data.todayStats.validated}</span> gevalideerd
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Edit3 className="h-3.5 w-3.5 text-amber-500" />
          <span className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{data.todayStats.manual}</span> handmatig
          </span>
        </div>
      </div>

      {/* Per-module breakdown (hidden in compact mode) */}
      {!compact && (
        <div className="space-y-1.5 pt-2 border-t border-border/30">
          {Object.entries(data.perModule).map(([mod, score]) => (
            <div key={mod} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-24 truncate">
                {MODULE_LABELS[mod as DecisionType]}
              </span>
              <div className="flex-1">
                <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${progressColor(score)}`}
                    style={{ width: `${score}%` }}
                  />
                </div>
              </div>
              <span className={`text-xs font-medium tabular-nums w-8 text-right ${scoreColor(score)}`}>
                {Math.round(score)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
```

---

### Task 5: DecisionFeed (`src/components/dashboard/DecisionFeed.tsx`)

- [ ] Create file `src/components/dashboard/DecisionFeed.tsx` with the following complete content:

```tsx
import { Bot, CheckCircle2, Edit3, XCircle, Clock } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useDecisionFeed } from "@/hooks/useAutonomyDashboard";
import type { DecisionType } from "@/types/confidence";

const DECISION_TYPE_LABELS: Record<DecisionType, string> = {
  ORDER_INTAKE: "Order Intake",
  PLANNING: "Planning",
  DISPATCH: "Dispatch",
  PRICING: "Pricing",
  INVOICING: "Facturatie",
  CONSOLIDATION: "Consolidatie",
};

const RESOLUTION_CONFIG: Record<string, { icon: typeof Bot; color: string; bg: string; label: string }> = {
  AUTO_EXECUTED: { icon: Bot, color: "text-emerald-600", bg: "bg-emerald-500/10", label: "Autonoom" },
  APPROVED: { icon: CheckCircle2, color: "text-blue-600", bg: "bg-blue-500/10", label: "Goedgekeurd" },
  MODIFIED: { icon: Edit3, color: "text-amber-600", bg: "bg-amber-500/10", label: "Aangepast" },
  REJECTED: { icon: XCircle, color: "text-red-600", bg: "bg-red-500/10", label: "Afgewezen" },
  PENDING: { icon: Clock, color: "text-gray-500", bg: "bg-gray-500/10", label: "Wachtend" },
};

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Vandaag";
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Gisteren";
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

interface DecisionFeedProps {
  limit?: number;
  maxHeight?: string;
}

export function DecisionFeed({ limit = 20, maxHeight = "400px" }: DecisionFeedProps) {
  const { data: decisions, isLoading } = useDecisionFeed(limit);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="animate-pulse flex items-center gap-3 p-2">
            <div className="h-8 w-8 rounded-full bg-muted/50" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 bg-muted/50 rounded w-3/4" />
              <div className="h-2 bg-muted/50 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!decisions || decisions.length === 0) {
    return (
      <div className="text-center py-8">
        <Bot className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">Nog geen beslissingen</p>
      </div>
    );
  }

  return (
    <ScrollArea style={{ maxHeight }} className="pr-2">
      <div className="space-y-1">
        {decisions.map((decision) => {
          const config = RESOLUTION_CONFIG[decision.resolution] ?? RESOLUTION_CONFIG.PENDING;
          const Icon = config.icon;
          return (
            <div
              key={decision.id}
              className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/30 transition-colors"
            >
              <div className={`h-8 w-8 rounded-full ${config.bg} flex items-center justify-center shrink-0`}>
                <Icon className={`h-4 w-4 ${config.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground truncate">
                    {decision.proposed_action}
                  </span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                    {DECISION_TYPE_LABELS[decision.decision_type] ?? decision.decision_type}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-xs font-medium ${config.color}`}>
                    {config.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {Math.round(decision.input_confidence)}% confidence
                  </span>
                  <span className="text-xs text-muted-foreground/60">
                    {formatDate(decision.created_at)} {formatTime(decision.created_at)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
```

---

### Task 6: LearningProgress (`src/components/dashboard/LearningProgress.tsx`)

- [ ] Create file `src/components/dashboard/LearningProgress.tsx` with the following complete content:

```tsx
import { useState } from "react";
import { GraduationCap, Bot, Eye, BookOpen } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLearningProgress } from "@/hooks/useAutonomyDashboard";
import type { LearningMetric } from "@/types/autonomy-dashboard";

const STATUS_CONFIG: Record<
  LearningMetric["status"],
  { label: string; icon: typeof Bot; color: string; variant: "default" | "secondary" | "outline" }
> = {
  autonomous: { label: "Autonoom", icon: Bot, color: "text-emerald-600", variant: "default" },
  validation: { label: "Validatie", icon: Eye, color: "text-blue-600", variant: "secondary" },
  learning: { label: "Leren", icon: BookOpen, color: "text-amber-600", variant: "outline" },
};

type FilterStatus = "all" | LearningMetric["status"];

export function LearningProgress() {
  const { data: metrics, isLoading } = useLearningProgress();
  const [filter, setFilter] = useState<FilterStatus>("all");

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="animate-pulse p-3 rounded-lg bg-muted/30">
            <div className="h-4 bg-muted/50 rounded w-1/3 mb-2" />
            <div className="h-2 bg-muted/50 rounded w-full" />
          </div>
        ))}
      </div>
    );
  }

  const filtered = metrics?.filter(
    (m) => filter === "all" || m.status === filter
  ) ?? [];

  const counts = {
    all: metrics?.length ?? 0,
    autonomous: metrics?.filter((m) => m.status === "autonomous").length ?? 0,
    validation: metrics?.filter((m) => m.status === "validation").length ?? 0,
    learning: metrics?.filter((m) => m.status === "learning").length ?? 0,
  };

  return (
    <div>
      {/* Filter buttons */}
      <div className="flex gap-2 mb-4">
        {(["all", "autonomous", "validation", "learning"] as FilterStatus[]).map((status) => (
          <Button
            key={status}
            variant={filter === status ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setFilter(status)}
          >
            {status === "all" ? "Alle" : STATUS_CONFIG[status].label}
            <span className="ml-1 text-muted-foreground">({counts[status]})</span>
          </Button>
        ))}
      </div>

      {/* Client list */}
      {filtered.length === 0 ? (
        <div className="text-center py-8">
          <GraduationCap className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Geen klanten gevonden</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((metric) => {
            const statusCfg = STATUS_CONFIG[metric.status];
            const StatusIcon = statusCfg.icon;
            return (
              <div
                key={metric.clientId}
                className="flex items-center gap-3 p-3 rounded-lg bg-muted/20 border border-border/30"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">
                      {metric.clientName}
                    </span>
                    <Badge variant={statusCfg.variant} className="text-[10px] px-1.5 py-0">
                      <StatusIcon className="h-3 w-3 mr-1" />
                      {statusCfg.label}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 mt-1.5">
                    <span className="text-xs text-muted-foreground">
                      {metric.totalOrders} orders
                    </span>
                    {metric.autonomousSince && (
                      <span className="text-xs text-emerald-600">
                        Autonoom sinds {new Date(metric.autonomousSince).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="w-20">
                    <Progress value={metric.currentConfidence} className="h-1.5" />
                  </div>
                  <span className="text-xs font-medium tabular-nums w-8 text-right">
                    {Math.round(metric.currentConfidence)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

---

### Task 7: CorrectionLog (`src/components/dashboard/CorrectionLog.tsx`)

- [ ] Create file `src/components/dashboard/CorrectionLog.tsx` with the following complete content:

```tsx
import { Edit3, AlertTriangle, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCorrectionLog } from "@/hooks/useAutonomyDashboard";
import { detectCorrectionPatterns } from "@/hooks/useAutonomyDashboard";
import type { DecisionType } from "@/types/confidence";

const TYPE_LABELS: Record<DecisionType, string> = {
  ORDER_INTAKE: "Order Intake",
  PLANNING: "Planning",
  DISPATCH: "Dispatch",
  PRICING: "Pricing",
  INVOICING: "Facturatie",
  CONSOLIDATION: "Consolidatie",
};

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface CorrectionLogProps {
  days?: number;
}

export function CorrectionLog({ days = 7 }: CorrectionLogProps) {
  const { data: corrections, isLoading } = useCorrectionLog(days);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="animate-pulse p-3 rounded-lg bg-muted/30">
            <div className="h-4 bg-muted/50 rounded w-2/3 mb-2" />
            <div className="h-3 bg-muted/50 rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  const patterns = detectCorrectionPatterns(corrections ?? []);

  return (
    <div className="space-y-4">
      {/* Detected patterns */}
      {patterns.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Patronen gedetecteerd
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="space-y-1.5">
              {patterns.map((pattern) => (
                <div
                  key={pattern.decisionType}
                  className="flex items-center gap-2 text-sm"
                >
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {TYPE_LABELS[pattern.decisionType]}
                  </Badge>
                  <span className="text-muted-foreground">{pattern.description}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Correction list */}
      {(!corrections || corrections.length === 0) ? (
        <div className="text-center py-8">
          <Edit3 className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            Geen correcties in de afgelopen {days} dagen
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {corrections.map((correction) => (
            <div
              key={correction.id}
              className="p-3 rounded-lg bg-muted/20 border border-border/30"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {TYPE_LABELS[correction.decisionType]}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(correction.createdAt)}
                </span>
                {correction.resolvedBy && (
                  <span className="text-xs text-muted-foreground ml-auto">
                    door {correction.resolvedBy}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-red-500/80 line-through truncate max-w-[40%]">
                  {correction.proposedAction}
                </span>
                <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-emerald-600 font-medium truncate max-w-[40%]">
                  {correction.actualAction}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

### Task 8: AutonomyTrendChart (`src/components/dashboard/AutonomyTrendChart.tsx`)

- [ ] Create file `src/components/dashboard/AutonomyTrendChart.tsx` with the following complete content:

```tsx
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useAutonomyTrend } from "@/hooks/useAutonomyDashboard";
import type { DecisionType } from "@/types/confidence";

const MODULE_COLORS: Record<DecisionType, string> = {
  ORDER_INTAKE: "#3b82f6",
  PLANNING: "#8b5cf6",
  DISPATCH: "#f59e0b",
  PRICING: "#10b981",
  INVOICING: "#ef4444",
  CONSOLIDATION: "#6366f1",
};

const MODULE_LABELS: Record<DecisionType, string> = {
  ORDER_INTAKE: "Order Intake",
  PLANNING: "Planning",
  DISPATCH: "Dispatch",
  PRICING: "Pricing",
  INVOICING: "Facturatie",
  CONSOLIDATION: "Consolidatie",
};

interface AutonomyTrendChartProps {
  weeks?: number;
  height?: number;
}

export function AutonomyTrendChart({ weeks = 8, height = 300 }: AutonomyTrendChartProps) {
  const { data: trendData, isLoading } = useAutonomyTrend(weeks);

  if (isLoading) {
    return (
      <div className="animate-pulse" style={{ height }}>
        <div className="h-full bg-muted/30 rounded-lg" />
      </div>
    );
  }

  if (!trendData || trendData.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted-foreground"
        style={{ height }}
      >
        Nog geen trendgegevens beschikbaar
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={trendData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
        <XAxis
          dataKey="weekLabel"
          tick={{ fontSize: 11 }}
          className="text-muted-foreground"
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fontSize: 11 }}
          className="text-muted-foreground"
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            fontSize: "12px",
          }}
          formatter={(value: number, name: string) => [
            `${Math.round(value)}%`,
            MODULE_LABELS[name as DecisionType] ?? name,
          ]}
        />
        <Legend
          formatter={(value: string) => (
            <span className="text-xs">
              {MODULE_LABELS[value as DecisionType] ?? value}
            </span>
          )}
        />
        {(Object.keys(MODULE_COLORS) as DecisionType[]).map((mod) => (
          <Area
            key={mod}
            type="monotone"
            dataKey={mod}
            stroke={MODULE_COLORS[mod]}
            fill={MODULE_COLORS[mod]}
            fillOpacity={0.1}
            strokeWidth={2}
          />
        ))}
        <Area
          type="monotone"
          dataKey="overall"
          stroke="#000"
          fill="none"
          strokeWidth={2}
          strokeDasharray="5 5"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
```

---

### Task 9: Autonomie Page (`src/pages/Autonomie.tsx`)

- [ ] Create file `src/pages/Autonomie.tsx` with the following complete content:

```tsx
import { useState } from "react";
import { Brain, Activity, GraduationCap, Edit3, Settings, List } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/PageHeader";
import { AutonomyScoreCard } from "@/components/dashboard/AutonomyScoreCard";
import { DecisionFeed } from "@/components/dashboard/DecisionFeed";
import { LearningProgress } from "@/components/dashboard/LearningProgress";
import { CorrectionLog } from "@/components/dashboard/CorrectionLog";
import { AutonomyTrendChart } from "@/components/dashboard/AutonomyTrendChart";
import { useDecisionFeed } from "@/hooks/useAutonomyDashboard";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { DecisionType } from "@/types/confidence";

const ALL_MODULES: DecisionType[] = [
  "ORDER_INTAKE",
  "PLANNING",
  "DISPATCH",
  "PRICING",
  "INVOICING",
  "CONSOLIDATION",
];

const MODULE_LABELS: Record<DecisionType, string> = {
  ORDER_INTAKE: "Order Intake",
  PLANNING: "Planning",
  DISPATCH: "Dispatch",
  PRICING: "Pricing",
  INVOICING: "Facturatie",
  CONSOLIDATION: "Consolidatie",
};

const RESOLUTION_COLORS: Record<string, string> = {
  AUTO_EXECUTED: "text-emerald-600",
  APPROVED: "text-blue-600",
  MODIFIED: "text-amber-600",
  REJECTED: "text-red-600",
  PENDING: "text-gray-500",
};

// ── Settings Tab ─────────────────────────────────────────────────

function ThresholdSettings() {
  const { tenant } = useTenant();
  const settings = (tenant?.settings as any)?.autonomy?.thresholds ?? {};

  const [thresholds, setThresholds] = useState<Record<DecisionType, number>>(() => {
    const defaults: Record<DecisionType, number> = {
      ORDER_INTAKE: 80,
      PLANNING: 80,
      DISPATCH: 80,
      PRICING: 85,
      INVOICING: 85,
      CONSOLIDATION: 80,
    };
    for (const mod of ALL_MODULES) {
      if (settings[mod] !== undefined) defaults[mod] = settings[mod];
    }
    return defaults;
  });

  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!tenant?.id) return;
    setSaving(true);
    try {
      const currentSettings = (tenant.settings as any) ?? {};
      const newSettings = {
        ...currentSettings,
        autonomy: {
          ...(currentSettings.autonomy ?? {}),
          thresholds,
        },
      };

      const { error } = await supabase
        .from("tenants" as any)
        .update({ settings: newSettings })
        .eq("id", tenant.id);

      if (error) throw error;
      toast.success("Drempelwaarden opgeslagen");
    } catch (err) {
      toast.error("Fout bij opslaan drempelwaarden");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Settings className="h-4 w-4" />
          Autonomie Drempelwaarden
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Stel per module in bij welk betrouwbaarheidspercentage het systeem autonoom mag handelen.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {ALL_MODULES.map((mod) => (
          <div key={mod} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{MODULE_LABELS[mod]}</span>
              <Badge variant="outline" className="tabular-nums">
                {thresholds[mod]}%
              </Badge>
            </div>
            <Slider
              value={[thresholds[mod]]}
              onValueChange={([val]) =>
                setThresholds((prev) => ({ ...prev, [mod]: val }))
              }
              min={50}
              max={99}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>50% (voorzichtig)</span>
              <span>99% (streng)</span>
            </div>
          </div>
        ))}
        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? "Opslaan..." : "Drempelwaarden opslaan"}
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Full Decision Table ──────────────────────────────────────────

function DecisionTable() {
  const { data: decisions, isLoading } = useDecisionFeed(100);
  const [typeFilter, setTypeFilter] = useState<DecisionType | "all">("all");
  const [resolutionFilter, setResolutionFilter] = useState<string>("all");

  const filtered = (decisions ?? []).filter((d) => {
    if (typeFilter !== "all" && d.decision_type !== typeFilter) return false;
    if (resolutionFilter !== "all" && d.resolution !== resolutionFilter) return false;
    return true;
  });

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as DecisionType | "all")}
        >
          <option value="all">Alle types</option>
          {ALL_MODULES.map((mod) => (
            <option key={mod} value={mod}>
              {MODULE_LABELS[mod]}
            </option>
          ))}
        </select>
        <select
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          value={resolutionFilter}
          onChange={(e) => setResolutionFilter(e.target.value)}
        >
          <option value="all">Alle resoluties</option>
          <option value="AUTO_EXECUTED">Autonoom</option>
          <option value="APPROVED">Goedgekeurd</option>
          <option value="MODIFIED">Aangepast</option>
          <option value="REJECTED">Afgewezen</option>
          <option value="PENDING">Wachtend</option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="animate-pulse space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 bg-muted/30 rounded" />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border/40">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/30 bg-muted/20">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Type</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Actie</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Resolutie</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Confidence</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Datum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {filtered.map((d) => (
                <tr key={d.id} className="hover:bg-muted/10">
                  <td className="px-3 py-2">
                    <Badge variant="outline" className="text-[10px]">
                      {MODULE_LABELS[d.decision_type] ?? d.decision_type}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-foreground truncate max-w-[200px]">
                    {d.proposed_action}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`font-medium ${RESOLUTION_COLORS[d.resolution] ?? ""}`}>
                      {d.resolution}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {Math.round(d.input_confidence)}%
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">
                    {new Date(d.created_at).toLocaleDateString("nl-NL", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                    Geen beslissingen gevonden
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────

const Autonomie = () => {
  return (
    <div className="page-container">
      <PageHeader
        title="AI Autonomie"
        subtitle="Inzicht in hoe het systeem leert en zelfstandig beslissingen neemt"
      />

      {/* Top: Score Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-1">
          <AutonomyScoreCard />
        </div>
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                Trend (8 weken)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AutonomyTrendChart weeks={8} height={220} />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview" className="gap-1.5">
            <Activity className="h-3.5 w-3.5" /> Overzicht
          </TabsTrigger>
          <TabsTrigger value="decisions" className="gap-1.5">
            <List className="h-3.5 w-3.5" /> Beslissingen
          </TabsTrigger>
          <TabsTrigger value="learning" className="gap-1.5">
            <GraduationCap className="h-3.5 w-3.5" /> Leerproces
          </TabsTrigger>
          <TabsTrigger value="corrections" className="gap-1.5">
            <Edit3 className="h-3.5 w-3.5" /> Correcties
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5">
            <Settings className="h-3.5 w-3.5" /> Instellingen
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Recente Beslissingen</CardTitle>
              </CardHeader>
              <CardContent>
                <DecisionFeed limit={15} maxHeight="350px" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Correcties (7 dagen)</CardTitle>
              </CardHeader>
              <CardContent>
                <CorrectionLog days={7} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Decisions Tab */}
        <TabsContent value="decisions">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Alle Beslissingen</CardTitle>
            </CardHeader>
            <CardContent>
              <DecisionTable />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Learning Tab */}
        <TabsContent value="learning">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-muted-foreground" />
                Leerproces per klant
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Hoe snel het systeem per klant leert en zelfstandig wordt
              </p>
            </CardHeader>
            <CardContent>
              <LearningProgress />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Corrections Tab */}
        <TabsContent value="corrections">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Edit3 className="h-4 w-4 text-muted-foreground" />
                Planner Correcties
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Waar heeft de planner de AI-voorstellen aangepast?
              </p>
            </CardHeader>
            <CardContent>
              <CorrectionLog days={30} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings">
          <div className="max-w-xl">
            <ThresholdSettings />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Autonomie;
```

---

### Task 10: Modify `src/App.tsx` — Add route

- [ ] Add lazy import after the existing lazy imports (after line 61, the `Dispatch` import):

```typescript
const Autonomie = lazy(() => import("@/pages/Autonomie"));
```

- [ ] Add route inside the admin+planner `<Route>` group (after the `/exceptions` route, line 108):

```tsx
<Route path="/autonomie" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><Autonomie /></Suspense></ErrorBoundary>} />
```

---

### Task 11: Modify `src/components/AppSidebar.tsx` — Add nav item

- [ ] Add `Brain` to the lucide-react import on line 1:

Change:
```typescript
import { LayoutDashboard, Inbox, Package, Building2, Truck, Map, Route, LogOut, Users, Settings, BarChart3, Receipt, Moon, Sun, Container, Shield, Send } from "lucide-react";
```
To:
```typescript
import { LayoutDashboard, Inbox, Package, Building2, Truck, Map, Route, LogOut, Users, Settings, BarChart3, Receipt, Moon, Sun, Container, Shield, Send, Brain } from "lucide-react";
```

- [ ] Add `Autonomie` item to `mainItems` array (after the `Uitzonderingen` entry, before `Facturatie`):

Add this line after `{ title: "Uitzonderingen", url: "/exceptions", icon: Shield },`:
```typescript
  { title: "Autonomie", url: "/autonomie", icon: Brain },
```

---

### Task 12: Modify `src/pages/Dashboard.tsx` — Add AutonomyScoreCard widget

- [ ] Add import at the top of Dashboard.tsx (after the existing dashboard widget imports, around line 16):

```typescript
import { AutonomyScoreCard } from "@/components/dashboard/AutonomyScoreCard";
```

- [ ] Add the AutonomyScoreCard widget in the grid layout. After the MarginWidget section (after line 108, `</div>` closing the margin grid), add:

```tsx
      {/* AI Autonomy widget */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AutonomyScoreCard compact />
      </div>
```

---

### Task 13: Run all tests + type check

- [ ] Run the autonomy dashboard tests:

```bash
cd C:/Users/Badr/Desktop/DevBadr/orderflow-suite && npx vitest run src/test/autonomyDashboard.test.ts
```

- [ ] Run TypeScript compiler check:

```bash
cd C:/Users/Badr/Desktop/DevBadr/orderflow-suite && npx tsc --noEmit
```

- [ ] Fix any type errors or test failures.

- [ ] Run all tests to ensure no regressions:

```bash
cd C:/Users/Badr/Desktop/DevBadr/orderflow-suite && npx vitest run
```

---

### Task 14: Commit

- [ ] Stage all new + modified files:

```bash
cd C:/Users/Badr/Desktop/DevBadr/orderflow-suite && git add \
  src/types/autonomy-dashboard.ts \
  src/hooks/useAutonomyDashboard.ts \
  src/components/dashboard/AutonomyScoreCard.tsx \
  src/components/dashboard/DecisionFeed.tsx \
  src/components/dashboard/LearningProgress.tsx \
  src/components/dashboard/CorrectionLog.tsx \
  src/components/dashboard/AutonomyTrendChart.tsx \
  src/pages/Autonomie.tsx \
  src/pages/Dashboard.tsx \
  src/components/AppSidebar.tsx \
  src/App.tsx \
  src/test/autonomyDashboard.test.ts
```

- [ ] Commit:

```bash
cd C:/Users/Badr/Desktop/DevBadr/orderflow-suite && git commit -m "feat: add Autonomie dashboard — Plan G

- Add autonomy score, decision feed, learning progress, correction log, trend chart
- New /autonomie page with 5 tabs (overview, decisions, learning, corrections, settings)
- Embed compact AutonomyScoreCard on main Dashboard
- Add sidebar nav item with Brain icon
- 10+ unit tests for hook logic and pattern detection"
```

---

## Verification Checklist

| Check | Command |
|-------|---------|
| Types compile | `npx tsc --noEmit` |
| Unit tests pass | `npx vitest run src/test/autonomyDashboard.test.ts` |
| No regressions | `npx vitest run` |
| Route accessible | Navigate to `/autonomie` in browser |
| Dashboard widget | Check AutonomyScoreCard on `/` |
| Sidebar link | Verify "Autonomie" with Brain icon in sidebar |

---

## Dependency Map

```
confidence.ts (Plan A)
    |
    v
autonomy-dashboard.ts (types)
    |
    v
useAutonomyDashboard.ts (hooks) ---- confidence_scores table (Plan A)
    |                            ---- decision_log table (Plan A)
    v
AutonomyScoreCard.tsx ---|
DecisionFeed.tsx --------|
LearningProgress.tsx ----|---> Autonomie.tsx (page)
CorrectionLog.tsx -------|      |
AutonomyTrendChart.tsx --|      v
                            App.tsx (route)
                            AppSidebar.tsx (nav)
                            Dashboard.tsx (widget)
```
