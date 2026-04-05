# Plan A: Confidence Store & Decision Engine

> **For agentic workers:** This is a detailed implementation plan designed for `superpowers:subagent-driven-development`. Each task is independent and can be assigned to a subagent. Follow TDD strictly: write test first, run test (expect FAIL), implement, run test (expect PASS), commit. Never skip steps. Never mark done without verified test output.

---

## Goal

Build the central Confidence Store that records every AI decision, tracks human corrections, computes rolling confidence scores per decision type/client/tenant, and exposes the `shouldAutoExecute()` API that all autonomous modules (Plans B-G) will consume.

## Architecture

```
┌─────────────────────────────────────────────┐
│            Other Modules (B-G)              │
│  shouldAutoExecute() ← getConfidence()      │
├─────────────────────────────────────────────┤
│         useConfidence.ts (Hook)             │
│   TanStack Query wrappers for UI            │
├─────────────────────────────────────────────┤
│       confidenceEngine.ts (Lib)             │
│  recordDecision / resolveDecision /         │
│  getConfidence / shouldAutoExecute /        │
│  recalculateScore                           │
├─────────────────────────────────────────────┤
│       confidence.ts (Types)                 │
│  DecisionType / Resolution / interfaces     │
├─────────────────────────────────────────────┤
│         Supabase (PostgreSQL)               │
│  decision_log / confidence_scores / RLS     │
└─────────────────────────────────────────────┘
```

## Tech Stack

- TypeScript 5.8
- Supabase (PostgreSQL + RLS)
- Vitest (unit tests)
- TanStack Query 5 (hooks)
- Supabase JS client (`@supabase/supabase-js`)

---

## File Structure

### Files to CREATE

| File | Purpose |
|------|---------|
| `supabase/migrations/20260405100000_confidence_store.sql` | Migration: decision_log + confidence_scores tables + RLS |
| `src/types/confidence.ts` | TypeScript interfaces and enums |
| `src/lib/confidenceEngine.ts` | Pure business logic functions |
| `src/hooks/useConfidence.ts` | TanStack Query wrappers |
| `src/test/confidenceEngine.test.ts` | ~15 unit tests |

### Files to MODIFY

None in this plan. The autonomy config in `tenants.settings` is handled via the existing JSONB column — no ALTER needed, just a documented JSON shape.

---

## Task 1: Database Migration

### Files

- `supabase/migrations/20260405100000_confidence_store.sql`

### Steps

- [ ] **Step 1.1** Write the migration SQL file.

**File: `supabase/migrations/20260405100000_confidence_store.sql`**

```sql
-- ============================================================
-- Plan A: Confidence Store & Decision Engine
-- Creates decision_log and confidence_scores tables with RLS.
-- ============================================================

-- ─── decision_log ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.decision_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  decision_type TEXT NOT NULL CHECK (decision_type IN (
    'ORDER_INTAKE', 'PLANNING', 'DISPATCH', 'PRICING', 'INVOICING', 'CONSOLIDATION'
  )),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('order', 'trip', 'invoice')),
  entity_id UUID NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  proposed_action JSONB NOT NULL DEFAULT '{}',
  actual_action JSONB,
  input_confidence NUMERIC(5,2) CHECK (input_confidence >= 0 AND input_confidence <= 100),
  model_confidence NUMERIC(5,2) CHECK (model_confidence >= 0 AND model_confidence <= 100),
  outcome_confidence NUMERIC(5,2) CHECK (outcome_confidence >= 0 AND outcome_confidence <= 100),
  resolution TEXT CHECK (resolution IN (
    'APPROVED', 'MODIFIED', 'REJECTED', 'AUTO_EXECUTED', 'PENDING'
  )) DEFAULT 'PENDING',
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX idx_decision_log_tenant ON public.decision_log(tenant_id);
CREATE INDEX idx_decision_log_entity ON public.decision_log(entity_type, entity_id);
CREATE INDEX idx_decision_log_type_client ON public.decision_log(tenant_id, decision_type, client_id);
CREATE INDEX idx_decision_log_created ON public.decision_log(tenant_id, created_at DESC);

-- RLS
ALTER TABLE public.decision_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for decision_log"
  ON public.decision_log
  FOR ALL
  USING (tenant_id IN (
    SELECT tm.tenant_id FROM public.tenant_members tm
    WHERE tm.user_id = auth.uid()
  ))
  WITH CHECK (tenant_id IN (
    SELECT tm.tenant_id FROM public.tenant_members tm
    WHERE tm.user_id = auth.uid()
  ));

-- ─── confidence_scores ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.confidence_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  decision_type TEXT NOT NULL CHECK (decision_type IN (
    'ORDER_INTAKE', 'PLANNING', 'DISPATCH', 'PRICING', 'INVOICING', 'CONSOLIDATION'
  )),
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  current_score NUMERIC(5,2) NOT NULL DEFAULT 50.00,
  total_decisions INTEGER NOT NULL DEFAULT 0,
  approved_count INTEGER NOT NULL DEFAULT 0,
  modified_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  trend TEXT NOT NULL DEFAULT 'STABLE' CHECK (trend IN ('RISING', 'STABLE', 'FALLING')),
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, decision_type, client_id)
);

-- Handle NULL client_id uniqueness: partial unique index
-- The UNIQUE constraint above handles non-null client_id rows.
-- We need a separate unique index for rows where client_id IS NULL.
CREATE UNIQUE INDEX idx_confidence_scores_tenant_type_null_client
  ON public.confidence_scores(tenant_id, decision_type)
  WHERE client_id IS NULL;

-- Drop the table-level unique constraint and use indexes instead
-- Actually the UNIQUE(tenant_id, decision_type, client_id) treats NULL != NULL
-- so two rows with same tenant+type+NULL client would both be allowed.
-- We fix this with the partial index above. But we need to also handle non-null:
CREATE UNIQUE INDEX idx_confidence_scores_tenant_type_client
  ON public.confidence_scores(tenant_id, decision_type, client_id)
  WHERE client_id IS NOT NULL;

-- Drop the table-level UNIQUE since we handle it via indexes
ALTER TABLE public.confidence_scores DROP CONSTRAINT IF EXISTS confidence_scores_tenant_id_decision_type_client_id_key;

CREATE INDEX idx_confidence_scores_tenant ON public.confidence_scores(tenant_id);

-- RLS
ALTER TABLE public.confidence_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for confidence_scores"
  ON public.confidence_scores
  FOR ALL
  USING (tenant_id IN (
    SELECT tm.tenant_id FROM public.tenant_members tm
    WHERE tm.user_id = auth.uid()
  ))
  WITH CHECK (tenant_id IN (
    SELECT tm.tenant_id FROM public.tenant_members tm
    WHERE tm.user_id = auth.uid()
  ));
```

- [ ] **Step 1.2** Verify migration syntax is valid (manual review or `supabase db reset` if local Supabase is running).

```bash
# If local Supabase is available:
npx supabase db reset
```

- [ ] **Step 1.3** Commit the migration.

```bash
git add supabase/migrations/20260405100000_confidence_store.sql
git commit -m "feat(plan-a): add decision_log and confidence_scores tables with RLS"
```

---

## Task 2: TypeScript Types

### Files

- `src/types/confidence.ts`

### Steps

- [ ] **Step 2.1** Create the types file with all interfaces and enums.

**File: `src/types/confidence.ts`**

```typescript
// ─── Confidence Store & Decision Engine Types ───────────────

export type DecisionType =
  | "ORDER_INTAKE"
  | "PLANNING"
  | "DISPATCH"
  | "PRICING"
  | "INVOICING"
  | "CONSOLIDATION";

export const DECISION_TYPES: DecisionType[] = [
  "ORDER_INTAKE",
  "PLANNING",
  "DISPATCH",
  "PRICING",
  "INVOICING",
  "CONSOLIDATION",
];

export const DECISION_TYPE_LABELS: Record<DecisionType, string> = {
  ORDER_INTAKE: "Order Intake",
  PLANNING: "Planning",
  DISPATCH: "Dispatch",
  PRICING: "Pricing",
  INVOICING: "Invoicing",
  CONSOLIDATION: "Consolidation",
};

export type Resolution =
  | "APPROVED"
  | "MODIFIED"
  | "REJECTED"
  | "AUTO_EXECUTED"
  | "PENDING";

export type EntityType = "order" | "trip" | "invoice";

export type Trend = "RISING" | "STABLE" | "FALLING";

// ─── Table Row Types ────────────────────────────────────────

export interface DecisionLogEntry {
  id: string;
  tenant_id: string;
  decision_type: DecisionType;
  entity_type: EntityType;
  entity_id: string;
  client_id: string | null;
  proposed_action: Record<string, unknown>;
  actual_action: Record<string, unknown> | null;
  input_confidence: number | null;
  model_confidence: number | null;
  outcome_confidence: number | null;
  resolution: Resolution;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface ConfidenceScore {
  id: string;
  tenant_id: string;
  decision_type: DecisionType;
  client_id: string | null;
  current_score: number;
  total_decisions: number;
  approved_count: number;
  modified_count: number;
  rejected_count: number;
  trend: Trend;
  last_updated: string;
}

// ─── Autonomy Config (stored in tenants.settings JSONB) ─────

export interface AutonomyThresholds {
  ORDER_INTAKE?: number;
  PLANNING?: number;
  DISPATCH?: number;
  PRICING?: number;
  INVOICING?: number;
  CONSOLIDATION?: number;
}

export interface AutonomyConfig {
  enabled: boolean;
  global_threshold: number;
  thresholds: AutonomyThresholds;
  max_autonomous_value_eur: number;
  require_human_for: string[];
}

export const DEFAULT_AUTONOMY_CONFIG: AutonomyConfig = {
  enabled: false,
  global_threshold: 95,
  thresholds: {
    ORDER_INTAKE: 90,
    PLANNING: 95,
    DISPATCH: 95,
    PRICING: 90,
    INVOICING: 98,
  },
  max_autonomous_value_eur: 5000,
  require_human_for: ["ADR", "KOELING"],
};

// ─── Input / Output Types ───────────────────────────────────

export interface RecordDecisionInput {
  tenantId: string;
  decisionType: DecisionType;
  entityType: EntityType;
  entityId: string;
  clientId?: string | null;
  proposedAction: Record<string, unknown>;
  inputConfidence: number;
  modelConfidence: number;
  resolution?: Resolution;
}

export interface ShouldAutoExecuteResult {
  auto: boolean;
  reason: string;
  inputConfidence: number;
  outcomeConfidence: number;
  threshold: number;
  combinedScore: number;
}
```

- [ ] **Step 2.2** Run TypeScript check to verify types compile.

```bash
npx tsc --noEmit
```

Expected: no errors related to `src/types/confidence.ts`.

- [ ] **Step 2.3** Commit the types file.

```bash
git add src/types/confidence.ts
git commit -m "feat(plan-a): add TypeScript types for confidence store"
```

---

## Task 3: Confidence Engine — Tests (TDD Red Phase)

### Files

- `src/test/confidenceEngine.test.ts`

### Steps

- [ ] **Step 3.1** Write all 15 test cases. These test the pure logic functions in `confidenceEngine.ts`. We mock the Supabase client to avoid database calls.

**File: `src/test/confidenceEngine.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  recordDecision,
  resolveDecision,
  getConfidence,
  shouldAutoExecute,
  recalculateScore,
  computeScoreFromCounts,
  computeTrend,
} from "@/lib/confidenceEngine";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DecisionType, Resolution, AutonomyConfig } from "@/types/confidence";
import { DEFAULT_AUTONOMY_CONFIG } from "@/types/confidence";

// ─── Mock Supabase Client ───────────────────────────────────

function createMockSupabase(overrides: Record<string, unknown> = {}) {
  const chainable = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockReturnThis(),
    ...overrides,
  };

  return {
    from: vi.fn(() => chainable),
    _chain: chainable,
  } as unknown as SupabaseClient & { _chain: typeof chainable };
}

// ─── Pure Function Tests ────────────────────────────────────

describe("confidenceEngine — pure functions", () => {
  describe("computeScoreFromCounts", () => {
    it("should return 50 when no decisions exist", () => {
      const score = computeScoreFromCounts(0, 0, 0);
      expect(score).toBe(50);
    });

    it("should return 100 when all decisions are approved", () => {
      const score = computeScoreFromCounts(10, 0, 0);
      expect(score).toBe(100);
    });

    it("should return 0 when all decisions are rejected", () => {
      const score = computeScoreFromCounts(0, 0, 5);
      expect(score).toBe(0);
    });

    it("should weight modified as partial approval (0.5)", () => {
      // 5 approved + 5 modified (worth 2.5) out of 10 total = 75
      const score = computeScoreFromCounts(5, 5, 0);
      expect(score).toBe(75);
    });

    it("should calculate mixed scenario correctly", () => {
      // 7 approved + 2 modified (worth 1.0) + 1 rejected = 10 total
      // score = (7 + 1.0) / 10 * 100 = 80
      const score = computeScoreFromCounts(7, 2, 1);
      expect(score).toBe(80);
    });
  });

  describe("computeTrend", () => {
    it("should return STABLE when fewer than 5 recent decisions", () => {
      const recentResolutions: Resolution[] = ["APPROVED", "APPROVED"];
      const previousResolutions: Resolution[] = [];
      expect(computeTrend(recentResolutions, previousResolutions)).toBe("STABLE");
    });

    it("should return RISING when recent score > previous score by >5", () => {
      // Recent: 10 approved = 100%
      const recent: Resolution[] = Array(10).fill("APPROVED");
      // Previous: 5 approved + 5 rejected = 50%
      const previous: Resolution[] = [
        ...Array(5).fill("APPROVED"),
        ...Array(5).fill("REJECTED"),
      ];
      expect(computeTrend(recent, previous)).toBe("RISING");
    });

    it("should return FALLING when recent score < previous score by >5", () => {
      // Recent: 5 approved + 5 rejected = 50%
      const recent: Resolution[] = [
        ...Array(5).fill("APPROVED"),
        ...Array(5).fill("REJECTED"),
      ];
      // Previous: 10 approved = 100%
      const previous: Resolution[] = Array(10).fill("APPROVED");
      expect(computeTrend(recent, previous)).toBe("FALLING");
    });

    it("should return STABLE when scores are within 5 points", () => {
      // Recent: 9 approved + 1 modified = 95%
      const recent: Resolution[] = [...Array(9).fill("APPROVED"), "MODIFIED"];
      // Previous: 10 approved = 100%
      const previous: Resolution[] = Array(10).fill("APPROVED");
      expect(computeTrend(recent, previous)).toBe("STABLE");
    });
  });
});

// ─── Supabase Integration Tests (mocked) ────────────────────

describe("confidenceEngine — recordDecision", () => {
  it("should insert a decision_log row and return the entry", async () => {
    const insertedRow = {
      id: "dec-001",
      tenant_id: "t-1",
      decision_type: "ORDER_INTAKE",
      entity_type: "order",
      entity_id: "ord-1",
      client_id: null,
      proposed_action: { action: "confirm" },
      actual_action: null,
      input_confidence: 92,
      model_confidence: 88,
      outcome_confidence: null,
      resolution: "PENDING",
      resolved_by: null,
      resolved_at: null,
      created_at: "2026-04-05T10:00:00Z",
    };

    const mock = createMockSupabase();
    mock._chain.select.mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: insertedRow, error: null }),
    });
    mock._chain.insert.mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: insertedRow, error: null }),
      }),
    });

    const result = await recordDecision(mock, {
      tenantId: "t-1",
      decisionType: "ORDER_INTAKE",
      entityType: "order",
      entityId: "ord-1",
      proposedAction: { action: "confirm" },
      inputConfidence: 92,
      modelConfidence: 88,
    });

    expect(mock.from).toHaveBeenCalledWith("decision_log");
    expect(result.id).toBe("dec-001");
    expect(result.resolution).toBe("PENDING");
  });

  it("should throw on Supabase error", async () => {
    const mock = createMockSupabase();
    mock._chain.insert.mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: null, error: { message: "RLS violation" } }),
      }),
    });

    await expect(
      recordDecision(mock, {
        tenantId: "t-1",
        decisionType: "ORDER_INTAKE",
        entityType: "order",
        entityId: "ord-1",
        proposedAction: {},
        inputConfidence: 50,
        modelConfidence: 50,
      })
    ).rejects.toThrow("RLS violation");
  });
});

describe("confidenceEngine — resolveDecision", () => {
  it("should update decision_log with resolution and actual_action", async () => {
    const mock = createMockSupabase();

    // Mock the update chain
    const updateEq2 = vi.fn().mockResolvedValue({ error: null });
    const updateEq1 = vi.fn().mockReturnValue({ eq: updateEq2 });
    mock._chain.update.mockReturnValue({ eq: updateEq1 });

    // Mock the select chain for reading the updated row (to get tenant_id, decision_type, client_id)
    const selectData = {
      tenant_id: "t-1",
      decision_type: "ORDER_INTAKE",
      client_id: null,
    };
    // We need two from() calls: one for update, one for select
    let callCount = 0;
    mock.from = vi.fn(() => {
      callCount++;
      if (callCount === 1) {
        // update call
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        } as any;
      }
      if (callCount === 2) {
        // select call to get decision details
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: selectData, error: null }),
            }),
          }),
        } as any;
      }
      // recalculateScore calls — see below
      return mock._chain as any;
    });

    await resolveDecision(mock, "dec-001", "APPROVED", { action: "confirmed_as_is" });

    // First call should be update on decision_log
    expect(mock.from).toHaveBeenCalledWith("decision_log");
  });
});

describe("confidenceEngine — getConfidence", () => {
  it("should return current_score from confidence_scores table", async () => {
    const mock = createMockSupabase();
    mock._chain.maybeSingle.mockResolvedValue({
      data: { current_score: 87.5 },
      error: null,
    });

    const score = await getConfidence(mock, "t-1", "ORDER_INTAKE");
    expect(score).toBe(87.5);
    expect(mock.from).toHaveBeenCalledWith("confidence_scores");
  });

  it("should return 50 when no confidence_scores row exists", async () => {
    const mock = createMockSupabase();
    mock._chain.maybeSingle.mockResolvedValue({ data: null, error: null });

    const score = await getConfidence(mock, "t-1", "ORDER_INTAKE");
    expect(score).toBe(50);
  });

  it("should filter by client_id when provided", async () => {
    const mock = createMockSupabase();
    mock._chain.maybeSingle.mockResolvedValue({
      data: { current_score: 94.0 },
      error: null,
    });

    const score = await getConfidence(mock, "t-1", "ORDER_INTAKE", "client-1");
    expect(score).toBe(94.0);
    expect(mock._chain.eq).toHaveBeenCalledWith("client_id", "client-1");
  });
});

describe("confidenceEngine — shouldAutoExecute", () => {
  it("should return auto=true when combined score >= threshold", async () => {
    const mock = createMockSupabase();

    // Mock getConfidence (confidence_scores lookup)
    mock._chain.maybeSingle.mockResolvedValue({
      data: { current_score: 95 },
      error: null,
    });

    const config: AutonomyConfig = {
      ...DEFAULT_AUTONOMY_CONFIG,
      enabled: true,
      thresholds: { ORDER_INTAKE: 90 },
    };

    const result = await shouldAutoExecute(mock, config, "t-1", "ORDER_INTAKE", 95);

    expect(result.auto).toBe(true);
    expect(result.combinedScore).toBeGreaterThanOrEqual(90);
  });

  it("should return auto=false when autonomy is disabled", async () => {
    const mock = createMockSupabase();
    mock._chain.maybeSingle.mockResolvedValue({
      data: { current_score: 99 },
      error: null,
    });

    const config: AutonomyConfig = {
      ...DEFAULT_AUTONOMY_CONFIG,
      enabled: false,
    };

    const result = await shouldAutoExecute(mock, config, "t-1", "ORDER_INTAKE", 99);

    expect(result.auto).toBe(false);
    expect(result.reason).toContain("disabled");
  });

  it("should return auto=false when combined score < threshold", async () => {
    const mock = createMockSupabase();
    mock._chain.maybeSingle.mockResolvedValue({
      data: { current_score: 60 },
      error: null,
    });

    const config: AutonomyConfig = {
      ...DEFAULT_AUTONOMY_CONFIG,
      enabled: true,
      thresholds: { ORDER_INTAKE: 90 },
    };

    const result = await shouldAutoExecute(mock, config, "t-1", "ORDER_INTAKE", 70);

    expect(result.auto).toBe(false);
    expect(result.combinedScore).toBeLessThan(90);
  });

  it("should use global_threshold when no per-type threshold is set", async () => {
    const mock = createMockSupabase();
    mock._chain.maybeSingle.mockResolvedValue({
      data: { current_score: 96 },
      error: null,
    });

    const config: AutonomyConfig = {
      enabled: true,
      global_threshold: 95,
      thresholds: {}, // no per-type override for CONSOLIDATION
      max_autonomous_value_eur: 5000,
      require_human_for: [],
    };

    const result = await shouldAutoExecute(mock, config, "t-1", "CONSOLIDATION", 96);

    expect(result.threshold).toBe(95);
    expect(result.auto).toBe(true);
  });
});
```

- [ ] **Step 3.2** Run the tests — expect ALL to FAIL (module not found).

```bash
npx vitest run src/test/confidenceEngine.test.ts
```

Expected output: all tests fail with `Cannot find module '@/lib/confidenceEngine'`.

- [ ] **Step 3.3** Commit the failing tests.

```bash
git add src/test/confidenceEngine.test.ts
git commit -m "test(plan-a): add 15 test cases for confidence engine (red phase)"
```

---

## Task 4: Confidence Engine — Implementation (TDD Green Phase)

### Files

- `src/lib/confidenceEngine.ts`

### Steps

- [ ] **Step 4.1** Create the confidence engine with all 5 functions plus 2 pure helpers.

**File: `src/lib/confidenceEngine.ts`**

```typescript
/**
 * Confidence Store & Decision Engine for OrderFlow Suite.
 *
 * Core module that records AI decisions, tracks human corrections,
 * computes rolling confidence scores, and determines whether the
 * system should act autonomously for a given decision.
 *
 * All functions take a Supabase client as first argument so they
 * can be used from both client-side hooks and server-side Edge Functions.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DecisionType,
  Resolution,
  Trend,
  DecisionLogEntry,
  AutonomyConfig,
  RecordDecisionInput,
  ShouldAutoExecuteResult,
} from "@/types/confidence";

// ─── Pure Helper Functions ──────────────────────────────────

/**
 * Compute a confidence score from decision counts.
 * Approved = 1.0, Modified = 0.5, Rejected = 0.0.
 * Returns 50 (neutral) when no decisions exist.
 */
export function computeScoreFromCounts(
  approved: number,
  modified: number,
  rejected: number
): number {
  const total = approved + modified + rejected;
  if (total === 0) return 50;
  const weighted = approved * 1.0 + modified * 0.5 + rejected * 0.0;
  return Math.round((weighted / total) * 100);
}

/**
 * Compute trend by comparing recent resolutions vs. previous resolutions.
 * Returns STABLE if fewer than 5 recent decisions.
 * RISING if recent score > previous by >5 points.
 * FALLING if recent score < previous by >5 points.
 */
export function computeTrend(
  recentResolutions: Resolution[],
  previousResolutions: Resolution[]
): Trend {
  if (recentResolutions.length < 5) return "STABLE";

  const scoreFromResolutions = (resolutions: Resolution[]): number => {
    let approved = 0;
    let modified = 0;
    let rejected = 0;
    for (const r of resolutions) {
      if (r === "APPROVED" || r === "AUTO_EXECUTED") approved++;
      else if (r === "MODIFIED") modified++;
      else if (r === "REJECTED") rejected++;
    }
    return computeScoreFromCounts(approved, modified, rejected);
  };

  const recentScore = scoreFromResolutions(recentResolutions);
  const previousScore =
    previousResolutions.length > 0
      ? scoreFromResolutions(previousResolutions)
      : recentScore; // No history to compare → STABLE

  const diff = recentScore - previousScore;
  if (diff > 5) return "RISING";
  if (diff < -5) return "FALLING";
  return "STABLE";
}

// ─── Database Functions ─────────────────────────────────────

/**
 * Record a new decision (proposed or auto-executed) in the decision_log.
 */
export async function recordDecision(
  supabase: SupabaseClient,
  params: RecordDecisionInput
): Promise<DecisionLogEntry> {
  const { data, error } = await supabase
    .from("decision_log")
    .insert({
      tenant_id: params.tenantId,
      decision_type: params.decisionType,
      entity_type: params.entityType,
      entity_id: params.entityId,
      client_id: params.clientId ?? null,
      proposed_action: params.proposedAction,
      input_confidence: params.inputConfidence,
      model_confidence: params.modelConfidence,
      resolution: params.resolution ?? "PENDING",
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as DecisionLogEntry;
}

/**
 * Resolve a decision: update the decision_log row with the outcome,
 * then recalculate the confidence score for this tenant+type+client.
 */
export async function resolveDecision(
  supabase: SupabaseClient,
  decisionId: string,
  resolution: Resolution,
  actualAction?: Record<string, unknown>
): Promise<void> {
  // 1. Update the decision_log row
  const { error: updateError } = await supabase
    .from("decision_log")
    .update({
      resolution,
      actual_action: actualAction ?? null,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", decisionId);

  if (updateError) throw new Error(updateError.message);

  // 2. Read the decision to get tenant_id, decision_type, client_id
  const { data: decision, error: readError } = await supabase
    .from("decision_log")
    .select("tenant_id, decision_type, client_id")
    .eq("id", decisionId)
    .single();

  if (readError) throw new Error(readError.message);

  // 3. Recalculate confidence scores
  await recalculateScore(
    supabase,
    decision.tenant_id,
    decision.decision_type as DecisionType,
    decision.client_id ?? undefined
  );

  // 4. Also recalculate tenant-wide score (client_id = null) if this was for a specific client
  if (decision.client_id) {
    await recalculateScore(
      supabase,
      decision.tenant_id,
      decision.decision_type as DecisionType
    );
  }
}

/**
 * Get the current confidence score for a decision type + optional client.
 * Returns 50 (neutral) if no data exists yet.
 */
export async function getConfidence(
  supabase: SupabaseClient,
  tenantId: string,
  decisionType: DecisionType,
  clientId?: string
): Promise<number> {
  let query = supabase
    .from("confidence_scores")
    .select("current_score")
    .eq("tenant_id", tenantId)
    .eq("decision_type", decisionType);

  if (clientId) {
    query = query.eq("client_id", clientId);
  } else {
    query = query.is("client_id", null);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  return data?.current_score ?? 50;
}

/**
 * Determine whether the system should auto-execute a decision.
 *
 * Combined score = (inputConfidence + outcomeConfidence) / 2
 * where outcomeConfidence is the historical accuracy from confidence_scores.
 *
 * Auto-execute when: autonomy is enabled AND combinedScore >= threshold.
 */
export async function shouldAutoExecute(
  supabase: SupabaseClient,
  config: AutonomyConfig,
  tenantId: string,
  decisionType: DecisionType,
  inputConfidence: number,
  clientId?: string
): Promise<ShouldAutoExecuteResult> {
  // Check master switch
  if (!config.enabled) {
    return {
      auto: false,
      reason: "Autonomy is disabled for this tenant",
      inputConfidence,
      outcomeConfidence: 0,
      threshold: 0,
      combinedScore: 0,
    };
  }

  // Get historical outcome confidence
  const outcomeConfidence = await getConfidence(
    supabase,
    tenantId,
    decisionType,
    clientId
  );

  // Combined score: average of input confidence and historical outcome confidence
  const combinedScore = Math.round((inputConfidence + outcomeConfidence) / 2);

  // Determine threshold: per-type override or global
  const threshold =
    config.thresholds[decisionType as keyof typeof config.thresholds] ??
    config.global_threshold;

  const auto = combinedScore >= threshold;

  return {
    auto,
    reason: auto
      ? `Combined score ${combinedScore} >= threshold ${threshold}`
      : `Combined score ${combinedScore} < threshold ${threshold}`,
    inputConfidence,
    outcomeConfidence,
    threshold,
    combinedScore,
  };
}

/**
 * Recalculate the confidence_scores row for a given tenant+type+client
 * from the decision_log. Upserts the result.
 *
 * Score formula: (approved + 0.5 * modified) / (approved + modified + rejected) * 100
 * Trend: compare last 20 resolved decisions vs. previous 20.
 */
export async function recalculateScore(
  supabase: SupabaseClient,
  tenantId: string,
  decisionType: DecisionType,
  clientId?: string
): Promise<void> {
  // 1. Count resolved decisions by resolution type
  let countQuery = supabase
    .from("decision_log")
    .select("resolution")
    .eq("tenant_id", tenantId)
    .eq("decision_type", decisionType)
    .in("resolution", ["APPROVED", "MODIFIED", "REJECTED", "AUTO_EXECUTED"]);

  if (clientId) {
    countQuery = countQuery.eq("client_id", clientId);
  } else {
    countQuery = countQuery.is("client_id", null);
  }

  const { data: allResolved, error: countError } = await countQuery;
  if (countError) throw new Error(countError.message);

  const rows = allResolved || [];

  let approved = 0;
  let modified = 0;
  let rejected = 0;

  for (const row of rows) {
    if (row.resolution === "APPROVED" || row.resolution === "AUTO_EXECUTED") approved++;
    else if (row.resolution === "MODIFIED") modified++;
    else if (row.resolution === "REJECTED") rejected++;
  }

  const currentScore = computeScoreFromCounts(approved, modified, rejected);
  const totalDecisions = approved + modified + rejected;

  // 2. Compute trend: last 20 vs. previous 20 resolved decisions
  let trendQuery = supabase
    .from("decision_log")
    .select("resolution")
    .eq("tenant_id", tenantId)
    .eq("decision_type", decisionType)
    .in("resolution", ["APPROVED", "MODIFIED", "REJECTED", "AUTO_EXECUTED"])
    .order("created_at", { ascending: false })
    .limit(40);

  if (clientId) {
    trendQuery = trendQuery.eq("client_id", clientId);
  } else {
    trendQuery = trendQuery.is("client_id", null);
  }

  const { data: trendData, error: trendError } = await trendQuery;
  if (trendError) throw new Error(trendError.message);

  const trendRows = trendData || [];
  const recentResolutions = trendRows
    .slice(0, 20)
    .map((r) => r.resolution as Resolution);
  const previousResolutions = trendRows
    .slice(20, 40)
    .map((r) => r.resolution as Resolution);

  const trend = computeTrend(recentResolutions, previousResolutions);

  // 3. Upsert confidence_scores
  const { error: upsertError } = await supabase
    .from("confidence_scores")
    .upsert(
      {
        tenant_id: tenantId,
        decision_type: decisionType,
        client_id: clientId ?? null,
        current_score: currentScore,
        total_decisions: totalDecisions,
        approved_count: approved,
        modified_count: modified,
        rejected_count: rejected,
        trend,
        last_updated: new Date().toISOString(),
      },
      {
        onConflict: "tenant_id,decision_type,client_id",
      }
    );

  if (upsertError) throw new Error(upsertError.message);
}
```

- [ ] **Step 4.2** Run the tests — expect all to PASS.

```bash
npx vitest run src/test/confidenceEngine.test.ts
```

Expected output: 15 tests pass (5 computeScoreFromCounts + 4 computeTrend + 2 recordDecision + 1 resolveDecision + 3 getConfidence + 4 shouldAutoExecute = ~15 tests, some in nested describes).

- [ ] **Step 4.3** Run TypeScript check to verify no type errors.

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4.4** Commit the implementation.

```bash
git add src/lib/confidenceEngine.ts
git commit -m "feat(plan-a): implement confidence engine — recordDecision, resolveDecision, getConfidence, shouldAutoExecute, recalculateScore"
```

---

## Task 5: TanStack Query Hook

### Files

- `src/hooks/useConfidence.ts`

### Steps

- [ ] **Step 5.1** Create the hook file with all 4 hooks.

**File: `src/hooks/useConfidence.ts`**

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import {
  recordDecision,
  resolveDecision,
} from "@/lib/confidenceEngine";
import type {
  DecisionType,
  Resolution,
  DecisionLogEntry,
  ConfidenceScore,
  RecordDecisionInput,
} from "@/types/confidence";

// ─── Query Keys ─────────────────────────────────────────────

const CONFIDENCE_KEYS = {
  all: ["confidence"] as const,
  scores: (tenantId: string, decisionType?: DecisionType) =>
    ["confidence", "scores", tenantId, decisionType] as const,
  log: (entityId: string) =>
    ["confidence", "log", entityId] as const,
};

// ─── useConfidenceScores ────────────────────────────────────

/**
 * Fetch aggregated confidence scores, optionally filtered by decision type.
 */
export function useConfidenceScores(decisionType?: DecisionType) {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: CONFIDENCE_KEYS.scores(tenant?.id ?? "", decisionType),
    enabled: !!tenant?.id,
    staleTime: 30_000,
    queryFn: async () => {
      let query = supabase
        .from("confidence_scores")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .order("decision_type");

      if (decisionType) {
        query = query.eq("decision_type", decisionType);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as ConfidenceScore[];
    },
  });
}

// ─── useDecisionLog ─────────────────────────────────────────

/**
 * Fetch the decision log for a specific entity (order, trip, or invoice).
 */
export function useDecisionLog(entityId: string) {
  return useQuery({
    queryKey: CONFIDENCE_KEYS.log(entityId),
    enabled: !!entityId,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("decision_log")
        .select("*")
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as DecisionLogEntry[];
    },
  });
}

// ─── useRecordDecision ──────────────────────────────────────

/**
 * Mutation to record a new decision in the decision_log.
 */
export function useRecordDecision() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: RecordDecisionInput) => {
      return recordDecision(supabase, params);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: CONFIDENCE_KEYS.log(variables.entityId),
      });
    },
  });
}

// ─── useResolveDecision ─────────────────────────────────────

/**
 * Mutation to resolve a decision (approve/modify/reject).
 * Invalidates both the decision log and confidence scores queries.
 */
export function useResolveDecision() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      decisionId: string;
      resolution: Resolution;
      actualAction?: Record<string, unknown>;
    }) => {
      return resolveDecision(
        supabase,
        params.decisionId,
        params.resolution,
        params.actualAction
      );
    },
    onSuccess: () => {
      // Invalidate all confidence-related queries since scores may have changed
      queryClient.invalidateQueries({ queryKey: CONFIDENCE_KEYS.all });
    },
  });
}
```

- [ ] **Step 5.2** Run TypeScript check to verify no type errors.

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5.3** Commit the hook.

```bash
git add src/hooks/useConfidence.ts
git commit -m "feat(plan-a): add useConfidence hook — useConfidenceScores, useDecisionLog, useRecordDecision, useResolveDecision"
```

---

## Task 6: Run Full Test Suite

### Steps

- [ ] **Step 6.1** Run the full test suite to verify nothing is broken.

```bash
npx vitest run
```

Expected: all existing tests pass, plus the 15 new confidence engine tests.

- [ ] **Step 6.2** Run TypeScript check on the entire project.

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6.3** Final commit if any adjustments were needed.

```bash
# Only if Step 6.1 or 6.2 required fixes:
git add -A
git commit -m "fix(plan-a): address test/type issues found during full suite run"
```

---

## Verification Checklist

Before marking Plan A as complete, verify ALL of the following:

- [ ] Migration file exists at `supabase/migrations/20260405100000_confidence_store.sql`
- [ ] `decision_log` table has correct columns, constraints, indexes, and RLS policy
- [ ] `confidence_scores` table has correct columns, unique indexes (handling NULL client_id), and RLS policy
- [ ] `src/types/confidence.ts` exports: DecisionType, Resolution, EntityType, Trend, DecisionLogEntry, ConfidenceScore, AutonomyConfig, DEFAULT_AUTONOMY_CONFIG, RecordDecisionInput, ShouldAutoExecuteResult
- [ ] `src/lib/confidenceEngine.ts` exports: computeScoreFromCounts, computeTrend, recordDecision, resolveDecision, getConfidence, shouldAutoExecute, recalculateScore
- [ ] `src/hooks/useConfidence.ts` exports: useConfidenceScores, useDecisionLog, useRecordDecision, useResolveDecision
- [ ] `src/test/confidenceEngine.test.ts` has ~15 tests and ALL pass
- [ ] `npx vitest run` passes with no regressions
- [ ] `npx tsc --noEmit` passes with no errors
- [ ] All code is committed with descriptive commit messages

---

## Autonomy Config Reference

The following JSON structure should be stored in the `tenants.settings` JSONB column under the `autonomy` key. No ALTER is needed — the column already accepts arbitrary JSONB. The `AutonomyConfig` TypeScript interface in `src/types/confidence.ts` defines the shape:

```jsonc
{
  "autonomy": {
    "enabled": false,
    "global_threshold": 95,
    "thresholds": {
      "ORDER_INTAKE": 90,
      "PLANNING": 95,
      "DISPATCH": 95,
      "PRICING": 90,
      "INVOICING": 98
    },
    "max_autonomous_value_eur": 5000,
    "require_human_for": ["ADR", "KOELING"]
  }
}
```

This config is read by `shouldAutoExecute()` and will be exposed via the existing `useLoadSettings` / `useSaveSettings` hooks in a future Plan G (Autonomy Dashboard) task.
