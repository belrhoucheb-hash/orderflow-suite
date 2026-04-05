# Plan B: Event-Driven Pipeline

> **For agentic workers:** Follow the `superpowers:subagent-driven-development` skill. Each task is independent unless noted. Execute tasks using strict TDD: write test (red) -> run test (fail) -> implement (green) -> run test (pass) -> commit. Every code block is COMPLETE -- no placeholders, no "..." ellipsis, no "add more here" comments.

---

## Goal

Transform the current request-response flow into an event-driven pipeline where every status change triggers an autonomous evaluation: "Can I do the next step without human help?" High-confidence actions execute automatically; low-confidence actions queue for human validation.

## Architecture

```
Status change (DB trigger / webhook)
         |
    pipeline-trigger Edge Function
         |
    processEvent()
         |
    evaluateNextStep()
      |         |
  shouldAutoExecute()   (from Plan A)
      |         |
  AUTO_EXECUTE    NEEDS_VALIDATION
      |              |
  executeAction()   createValidationRequest()
      |              |
  pipeline_events   validation_queue
  (logged)          (human reviews)
```

## Tech Stack

- **Database:** Supabase PostgreSQL with RLS
- **Edge Functions:** Deno runtime, Supabase service role
- **Frontend:** React 18 + TypeScript 5.8
- **State:** TanStack Query 5
- **UI:** Shadcn/UI + Tailwind CSS
- **Tests:** Vitest (jsdom environment)

## Dependencies (from Plan A -- assume these exist)

- Table `decision_log` with columns: id, tenant_id, decision_type, entity_type, entity_id, client_id, proposed_action, actual_action, input_confidence, model_confidence, outcome_confidence, resolution, resolved_by, resolved_at, created_at
- Table `confidence_scores` with columns: id, tenant_id, decision_type, client_id, current_score, total_decisions, approved_count, modified_count, rejected_count, trend, last_updated
- Types in `src/types/confidence.ts`: DecisionType, Resolution, DecisionLogEntry, RecordDecisionInput, ShouldAutoExecuteResult
- Lib `src/lib/confidenceEngine.ts`: recordDecision(), resolveDecision(), getConfidence(), shouldAutoExecute(), recalculateScore()
- Hook `src/hooks/useConfidence.ts`: useConfidenceScores(), useDecisionLog(), useRecordDecision(), useResolveDecision()
- Tenant settings JSONB includes `autonomy.enabled`, `autonomy.global_threshold`, `autonomy.thresholds.*`

---

## File Structure

```
supabase/migrations/
  20260405120000_pipeline_events.sql          (Task 1)
  20260405120001_validation_queue.sql          (Task 2)

supabase/functions/pipeline-trigger/
  index.ts                                     (Task 6)

src/types/
  pipeline.ts                                  (Task 3)

src/lib/
  pipelineOrchestrator.ts                      (Task 5 - implementation)

src/hooks/
  useValidationQueue.ts                        (Task 7)

src/components/validation/
  ValidationBanner.tsx                         (Task 8)

src/test/
  pipelineOrchestrator.test.ts                 (Task 4 + 5)
  useValidationQueue.test.ts                   (Task 7)
  ValidationBanner.test.tsx                    (Task 8)
```

---

## Task 1: Migration -- `pipeline_events` table

**Files:** `supabase/migrations/20260405120000_pipeline_events.sql`

- [ ] **Step 1.1** Write the migration SQL

Create file `supabase/migrations/20260405120000_pipeline_events.sql`:

```sql
-- Pipeline Events: event log for every autonomous evaluation
CREATE TABLE IF NOT EXISTS pipeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('order', 'trip', 'invoice')),
  entity_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'ORDER_CREATED',
    'ORDER_CONFIRMED',
    'TRIP_PLANNED',
    'TRIP_DISPATCHED',
    'DELIVERY_COMPLETE',
    'INVOICE_READY'
  )),
  previous_status TEXT,
  new_status TEXT,
  evaluation_result TEXT CHECK (evaluation_result IN ('AUTO_EXECUTE', 'NEEDS_VALIDATION', 'BLOCKED')),
  confidence_at_evaluation NUMERIC(5,2),
  action_taken JSONB,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for querying events by entity
CREATE INDEX idx_pipeline_events_entity ON pipeline_events(tenant_id, entity_type, entity_id);

-- Index for querying events by type and time
CREATE INDEX idx_pipeline_events_type_time ON pipeline_events(tenant_id, event_type, processed_at DESC);

-- RLS
ALTER TABLE pipeline_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for pipeline_events"
  ON pipeline_events
  FOR ALL
  USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid)
  WITH CHECK (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

-- Service role bypass
CREATE POLICY "Service role bypass for pipeline_events"
  ON pipeline_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

- [ ] **Step 1.2** Verify migration syntax

```bash
cd /c/Users/Badr/Desktop/DevBadr/orderflow-suite && npx supabase db lint --level warning 2>/dev/null || echo "Lint not available -- review SQL manually"
```

- [ ] **Step 1.3** Commit

```bash
cd /c/Users/Badr/Desktop/DevBadr/orderflow-suite && git add supabase/migrations/20260405120000_pipeline_events.sql && git commit -m "feat(plan-b): add pipeline_events table migration"
```

---

## Task 2: Migration -- `validation_queue` table

**Files:** `supabase/migrations/20260405120001_validation_queue.sql`

- [ ] **Step 2.1** Write the migration SQL

Create file `supabase/migrations/20260405120001_validation_queue.sql`:

```sql
-- Validation Queue: items awaiting human approval
CREATE TABLE IF NOT EXISTS validation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  decision_log_id UUID NOT NULL REFERENCES decision_log(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('order', 'trip', 'invoice')),
  entity_id UUID NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'CONFIRM_ORDER',
    'ASSIGN_VEHICLE',
    'DISPATCH_TRIP',
    'SEND_INVOICE'
  )),
  proposed_action JSONB NOT NULL,
  confidence NUMERIC(5,2),
  priority INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED')),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fetching pending items ordered by priority
CREATE INDEX idx_validation_queue_pending ON validation_queue(tenant_id, status, priority DESC)
  WHERE status = 'PENDING';

-- Index for looking up by entity
CREATE INDEX idx_validation_queue_entity ON validation_queue(tenant_id, entity_type, entity_id);

-- RLS
ALTER TABLE validation_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for validation_queue"
  ON validation_queue
  FOR ALL
  USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid)
  WITH CHECK (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

-- Service role bypass
CREATE POLICY "Service role bypass for validation_queue"
  ON validation_queue
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

- [ ] **Step 2.2** Commit

```bash
cd /c/Users/Badr/Desktop/DevBadr/orderflow-suite && git add supabase/migrations/20260405120001_validation_queue.sql && git commit -m "feat(plan-b): add validation_queue table migration"
```

---

## Task 3: Types -- `src/types/pipeline.ts`

**Files:** `src/types/pipeline.ts`

- [ ] **Step 3.1** Write the pipeline types file

Create file `src/types/pipeline.ts`:

```typescript
// ─── Event-Driven Pipeline Types ─────────────────────────────

/** Events that trigger pipeline evaluation */
export type EventType =
  | "ORDER_CREATED"
  | "ORDER_CONFIRMED"
  | "TRIP_PLANNED"
  | "TRIP_DISPATCHED"
  | "DELIVERY_COMPLETE"
  | "INVOICE_READY";

/** Entity types the pipeline operates on */
export type PipelineEntityType = "order" | "trip" | "invoice";

/** Result of evaluating whether to auto-execute */
export type EvaluationResult = "AUTO_EXECUTE" | "NEEDS_VALIDATION" | "BLOCKED";

/** Action types the pipeline can propose */
export type PipelineActionType =
  | "CONFIRM_ORDER"
  | "ASSIGN_VEHICLE"
  | "DISPATCH_TRIP"
  | "SEND_INVOICE";

/** Validation queue item statuses */
export type ValidationStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";

/** A logged pipeline event */
export interface PipelineEvent {
  id: string;
  tenant_id: string;
  entity_type: PipelineEntityType;
  entity_id: string;
  event_type: EventType;
  previous_status: string | null;
  new_status: string | null;
  evaluation_result: EvaluationResult | null;
  confidence_at_evaluation: number | null;
  action_taken: Record<string, unknown> | null;
  processed_at: string;
}

/** A proposed action the pipeline wants to execute */
export interface PipelineAction {
  tenantId: string;
  entityType: PipelineEntityType;
  entityId: string;
  actionType: PipelineActionType;
  payload: Record<string, unknown>;
}

/** A validation queue item awaiting human approval */
export interface ValidationItem {
  id: string;
  tenant_id: string;
  decision_log_id: string;
  entity_type: PipelineEntityType;
  entity_id: string;
  action_type: PipelineActionType;
  proposed_action: Record<string, unknown>;
  confidence: number | null;
  priority: number;
  status: ValidationStatus;
  expires_at: string | null;
  created_at: string;
}

/** Maps event types to their corresponding next action */
export const EVENT_TO_ACTION: Record<EventType, PipelineActionType | null> = {
  ORDER_CREATED: "CONFIRM_ORDER",
  ORDER_CONFIRMED: "ASSIGN_VEHICLE",
  TRIP_PLANNED: "DISPATCH_TRIP",
  TRIP_DISPATCHED: null, // No auto-action; wait for delivery
  DELIVERY_COMPLETE: "SEND_INVOICE",
  INVOICE_READY: null, // Terminal
};

/** Maps event types to the decision type used by the confidence engine */
export const EVENT_TO_DECISION_TYPE: Record<EventType, string> = {
  ORDER_CREATED: "ORDER_INTAKE",
  ORDER_CONFIRMED: "PLANNING",
  TRIP_PLANNED: "DISPATCH",
  TRIP_DISPATCHED: "DISPATCH",
  DELIVERY_COMPLETE: "INVOICING",
  INVOICE_READY: "INVOICING",
};

/** Maps order statuses to pipeline event types */
export const STATUS_TO_EVENT: Record<string, EventType> = {
  DRAFT: "ORDER_CREATED",
  PENDING: "ORDER_CREATED",
  CONFIRMED: "ORDER_CONFIRMED",
  PLANNED: "TRIP_PLANNED",
  DISPATCHED: "TRIP_DISPATCHED",
  IN_TRANSIT: "TRIP_DISPATCHED",
  DELIVERED: "DELIVERY_COMPLETE",
};
```

- [ ] **Step 3.2** Run TSC to verify types compile

```bash
cd /c/Users/Badr/Desktop/DevBadr/orderflow-suite && npx tsc --noEmit
```

Expected: no errors related to `src/types/pipeline.ts`.

- [ ] **Step 3.3** Commit

```bash
cd /c/Users/Badr/Desktop/DevBadr/orderflow-suite && git add src/types/pipeline.ts && git commit -m "feat(plan-b): add pipeline types (EventType, EvaluationResult, PipelineAction, ValidationItem)"
```

---

## Task 4: Tests -- `src/test/pipelineOrchestrator.test.ts` (RED phase)

**Files:** `src/test/pipelineOrchestrator.test.ts`

**Note:** Write ALL tests first. They will fail because the implementation does not exist yet. This is the TDD red phase.

- [ ] **Step 4.1** Write the complete test file

Create file `src/test/pipelineOrchestrator.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  evaluateNextStep,
  executeAction,
  createValidationRequest,
  processEvent,
  determineEventType,
  determineNextAction,
} from "@/lib/pipelineOrchestrator";
import type { PipelineAction } from "@/types/pipeline";

// ─── Mock Supabase client ────────────────────────────────────

function createMockChain(resolvedValue: { data: unknown; error: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);
  chain.maybeSingle = vi.fn().mockResolvedValue(resolvedValue);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.then = vi.fn((cb) => cb(resolvedValue));
  return chain;
}

function createMockSupabase(fromOverrides?: Record<string, ReturnType<typeof createMockChain>>) {
  const defaultChain = createMockChain({ data: null, error: null });
  return {
    from: vi.fn((table: string) => {
      if (fromOverrides && fromOverrides[table]) return fromOverrides[table];
      return defaultChain;
    }),
  } as unknown as SupabaseClient;
}

// ─── Mock confidenceEngine ───────────────────────────────────

vi.mock("@/lib/confidenceEngine", () => ({
  shouldAutoExecute: vi.fn(),
  recordDecision: vi.fn().mockResolvedValue({ id: "decision-1", tenant_id: "t-1" }),
  resolveDecision: vi.fn().mockResolvedValue(undefined),
  getConfidence: vi.fn().mockResolvedValue(85),
}));

import { shouldAutoExecute, recordDecision, resolveDecision, getConfidence } from "@/lib/confidenceEngine";

const mockShouldAutoExecute = vi.mocked(shouldAutoExecute);
const mockRecordDecision = vi.mocked(recordDecision);
const mockGetConfidence = vi.mocked(getConfidence);

beforeEach(() => {
  vi.clearAllMocks();
  mockRecordDecision.mockResolvedValue({ id: "decision-1", tenant_id: "t-1" } as any);
  mockGetConfidence.mockResolvedValue(85);
});

// ─── determineEventType ──────────────────────────────────────

describe("determineEventType", () => {
  it("maps DRAFT status to ORDER_CREATED", () => {
    expect(determineEventType("order", "DRAFT")).toBe("ORDER_CREATED");
  });

  it("maps PENDING status to ORDER_CREATED", () => {
    expect(determineEventType("order", "PENDING")).toBe("ORDER_CREATED");
  });

  it("maps CONFIRMED status to ORDER_CONFIRMED", () => {
    expect(determineEventType("order", "CONFIRMED")).toBe("ORDER_CONFIRMED");
  });

  it("maps PLANNED status to TRIP_PLANNED", () => {
    expect(determineEventType("trip", "PLANNED")).toBe("TRIP_PLANNED");
  });

  it("maps DISPATCHED status to TRIP_DISPATCHED", () => {
    expect(determineEventType("trip", "DISPATCHED")).toBe("TRIP_DISPATCHED");
  });

  it("maps IN_TRANSIT status to TRIP_DISPATCHED", () => {
    expect(determineEventType("trip", "IN_TRANSIT")).toBe("TRIP_DISPATCHED");
  });

  it("maps DELIVERED status to DELIVERY_COMPLETE", () => {
    expect(determineEventType("order", "DELIVERED")).toBe("DELIVERY_COMPLETE");
  });

  it("returns null for unknown status", () => {
    expect(determineEventType("order", "UNKNOWN_STATUS")).toBeNull();
  });
});

// ─── determineNextAction ─────────────────────────────────────

describe("determineNextAction", () => {
  it("returns CONFIRM_ORDER for ORDER_CREATED", () => {
    expect(determineNextAction("ORDER_CREATED")).toBe("CONFIRM_ORDER");
  });

  it("returns ASSIGN_VEHICLE for ORDER_CONFIRMED", () => {
    expect(determineNextAction("ORDER_CONFIRMED")).toBe("ASSIGN_VEHICLE");
  });

  it("returns DISPATCH_TRIP for TRIP_PLANNED", () => {
    expect(determineNextAction("TRIP_PLANNED")).toBe("DISPATCH_TRIP");
  });

  it("returns SEND_INVOICE for DELIVERY_COMPLETE", () => {
    expect(determineNextAction("DELIVERY_COMPLETE")).toBe("SEND_INVOICE");
  });

  it("returns null for TRIP_DISPATCHED (no auto-action)", () => {
    expect(determineNextAction("TRIP_DISPATCHED")).toBeNull();
  });

  it("returns null for INVOICE_READY (terminal)", () => {
    expect(determineNextAction("INVOICE_READY")).toBeNull();
  });
});

// ─── evaluateNextStep ────────────────────────────────────────

describe("evaluateNextStep", () => {
  it("returns AUTO_EXECUTE when confidence is above threshold", async () => {
    mockShouldAutoExecute.mockResolvedValue({ auto: true, reason: "Above threshold" });
    const sb = createMockSupabase();

    const result = await evaluateNextStep(sb, "t-1", "order", "o-1", "CONFIRMED");

    expect(result.evaluationResult).toBe("AUTO_EXECUTE");
    expect(result.action).not.toBeNull();
    expect(result.action!.actionType).toBe("ASSIGN_VEHICLE");
  });

  it("returns NEEDS_VALIDATION when confidence is below threshold", async () => {
    mockShouldAutoExecute.mockResolvedValue({ auto: false, reason: "Below threshold" });
    const sb = createMockSupabase();

    const result = await evaluateNextStep(sb, "t-1", "order", "o-1", "CONFIRMED");

    expect(result.evaluationResult).toBe("NEEDS_VALIDATION");
    expect(result.action).not.toBeNull();
  });

  it("returns BLOCKED when no action maps to the event type", async () => {
    const sb = createMockSupabase();

    const result = await evaluateNextStep(sb, "t-1", "trip", "trip-1", "DISPATCHED");

    expect(result.evaluationResult).toBe("BLOCKED");
    expect(result.action).toBeNull();
  });

  it("returns BLOCKED when status is unknown", async () => {
    const sb = createMockSupabase();

    const result = await evaluateNextStep(sb, "t-1", "order", "o-1", "CANCELLED");

    expect(result.evaluationResult).toBe("BLOCKED");
    expect(result.action).toBeNull();
  });

  it("passes correct decision type to shouldAutoExecute", async () => {
    mockShouldAutoExecute.mockResolvedValue({ auto: true, reason: "OK" });
    const sb = createMockSupabase();

    await evaluateNextStep(sb, "t-1", "order", "o-1", "DRAFT");

    expect(mockShouldAutoExecute).toHaveBeenCalledWith(
      "t-1",
      "ORDER_INTAKE",
      expect.any(Number),
      undefined
    );
  });
});

// ─── executeAction ───────────────────────────────────────────

describe("executeAction", () => {
  it("updates order status for CONFIRM_ORDER", async () => {
    const ordersChain = createMockChain({ data: { id: "o-1", status: "CONFIRMED" }, error: null });
    const sb = createMockSupabase({ orders: ordersChain });

    const action: PipelineAction = {
      tenantId: "t-1",
      entityType: "order",
      entityId: "o-1",
      actionType: "CONFIRM_ORDER",
      payload: { status: "CONFIRMED" },
    };

    await executeAction(sb, action);

    expect(sb.from).toHaveBeenCalledWith("orders");
    expect(ordersChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "CONFIRMED" })
    );
  });

  it("throws on supabase error", async () => {
    const ordersChain = createMockChain({ data: null, error: { message: "DB error" } });
    const sb = createMockSupabase({ orders: ordersChain });

    const action: PipelineAction = {
      tenantId: "t-1",
      entityType: "order",
      entityId: "o-1",
      actionType: "CONFIRM_ORDER",
      payload: { status: "CONFIRMED" },
    };

    await expect(executeAction(sb, action)).rejects.toThrow("DB error");
  });
});

// ─── createValidationRequest ─────────────────────────────────

describe("createValidationRequest", () => {
  it("inserts into validation_queue with correct data", async () => {
    const vqChain = createMockChain({ data: { id: "vq-1" }, error: null });
    const sb = createMockSupabase({ validation_queue: vqChain });

    await createValidationRequest(
      sb,
      "t-1",
      "decision-1",
      "order",
      "o-1",
      "CONFIRM_ORDER",
      { status: "CONFIRMED" },
      78.5
    );

    expect(sb.from).toHaveBeenCalledWith("validation_queue");
    expect(vqChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: "t-1",
        decision_log_id: "decision-1",
        entity_type: "order",
        entity_id: "o-1",
        action_type: "CONFIRM_ORDER",
        proposed_action: { status: "CONFIRMED" },
        confidence: 78.5,
        status: "PENDING",
      })
    );
  });

  it("sets priority based on action_type", async () => {
    const vqChain = createMockChain({ data: { id: "vq-1" }, error: null });
    const sb = createMockSupabase({ validation_queue: vqChain });

    await createValidationRequest(
      sb, "t-1", "d-1", "order", "o-1", "CONFIRM_ORDER", {}, 50
    );

    expect(vqChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ priority: expect.any(Number) })
    );
  });

  it("throws on supabase error", async () => {
    const vqChain = createMockChain({ data: null, error: { message: "Insert failed" } });
    const sb = createMockSupabase({ validation_queue: vqChain });

    await expect(
      createValidationRequest(sb, "t-1", "d-1", "order", "o-1", "CONFIRM_ORDER", {}, 50)
    ).rejects.toThrow("Insert failed");
  });
});

// ─── processEvent ────────────────────────────────────────────

describe("processEvent", () => {
  it("auto-executes when confidence is high", async () => {
    mockShouldAutoExecute.mockResolvedValue({ auto: true, reason: "OK" });
    const peChain = createMockChain({ data: { id: "pe-1" }, error: null });
    const ordersChain = createMockChain({ data: { id: "o-1", status: "CONFIRMED" }, error: null });
    const sb = createMockSupabase({
      pipeline_events: peChain,
      orders: ordersChain,
    });

    await processEvent(sb, "t-1", "order", "o-1", "DRAFT", "CONFIRMED");

    // Should have logged a pipeline event
    expect(sb.from).toHaveBeenCalledWith("pipeline_events");
    expect(peChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        evaluation_result: "AUTO_EXECUTE",
        event_type: "ORDER_CONFIRMED",
      })
    );

    // Should have recorded a decision
    expect(mockRecordDecision).toHaveBeenCalled();
  });

  it("creates validation request when confidence is low", async () => {
    mockShouldAutoExecute.mockResolvedValue({ auto: false, reason: "Below threshold" });
    const peChain = createMockChain({ data: { id: "pe-1" }, error: null });
    const vqChain = createMockChain({ data: { id: "vq-1" }, error: null });
    const sb = createMockSupabase({
      pipeline_events: peChain,
      validation_queue: vqChain,
    });

    await processEvent(sb, "t-1", "order", "o-1", "DRAFT", "CONFIRMED");

    // Should log pipeline event as NEEDS_VALIDATION
    expect(peChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        evaluation_result: "NEEDS_VALIDATION",
      })
    );

    // Should insert into validation_queue
    expect(sb.from).toHaveBeenCalledWith("validation_queue");
  });

  it("logs BLOCKED for events with no next action", async () => {
    const peChain = createMockChain({ data: { id: "pe-1" }, error: null });
    const sb = createMockSupabase({ pipeline_events: peChain });

    await processEvent(sb, "t-1", "trip", "trip-1", "PLANNED", "DISPATCHED");

    expect(peChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        evaluation_result: "BLOCKED",
        event_type: "TRIP_DISPATCHED",
      })
    );

    // Should NOT call shouldAutoExecute for blocked events
    expect(mockShouldAutoExecute).not.toHaveBeenCalled();
  });

  it("handles unknown status gracefully", async () => {
    const peChain = createMockChain({ data: { id: "pe-1" }, error: null });
    const sb = createMockSupabase({ pipeline_events: peChain });

    await processEvent(sb, "t-1", "order", "o-1", "CONFIRMED", "CANCELLED");

    expect(peChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        evaluation_result: "BLOCKED",
      })
    );
  });

  it("uses previous_status and new_status in pipeline event log", async () => {
    mockShouldAutoExecute.mockResolvedValue({ auto: true, reason: "OK" });
    const peChain = createMockChain({ data: { id: "pe-1" }, error: null });
    const ordersChain = createMockChain({ data: { id: "o-1" }, error: null });
    const sb = createMockSupabase({
      pipeline_events: peChain,
      orders: ordersChain,
    });

    await processEvent(sb, "t-1", "order", "o-1", "DRAFT", "PENDING");

    expect(peChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        previous_status: "DRAFT",
        new_status: "PENDING",
      })
    );
  });
});
```

- [ ] **Step 4.2** Run tests (expect failure -- module not found)

```bash
cd /c/Users/Badr/Desktop/DevBadr/orderflow-suite && npx vitest run src/test/pipelineOrchestrator.test.ts 2>&1
```

Expected output: FAIL -- Cannot find module `@/lib/pipelineOrchestrator` (or similar import error). This confirms TDD red phase.

- [ ] **Step 4.3** Commit the test file

```bash
cd /c/Users/Badr/Desktop/DevBadr/orderflow-suite && git add src/test/pipelineOrchestrator.test.ts && git commit -m "test(plan-b): add pipelineOrchestrator tests (red phase -- 20 cases)"
```

---

## Task 5: Implementation -- `src/lib/pipelineOrchestrator.ts` (GREEN phase)

**Files:** `src/lib/pipelineOrchestrator.ts`

**Depends on:** Task 3 (types), Task 4 (tests)

- [ ] **Step 5.1** Write the complete pipelineOrchestrator implementation

Create file `src/lib/pipelineOrchestrator.ts`:

```typescript
// ─── Event-Driven Pipeline Orchestrator ──────────────────────
//
// Main entry point for autonomous evaluation. Every status change
// flows through processEvent() which evaluates whether to act
// autonomously or queue for human validation.
//
// Dependencies: Plan A confidenceEngine (recordDecision, shouldAutoExecute, getConfidence)

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  EventType,
  EvaluationResult,
  PipelineAction,
  PipelineActionType,
  PipelineEntityType,
} from "@/types/pipeline";
import {
  EVENT_TO_ACTION,
  EVENT_TO_DECISION_TYPE,
  STATUS_TO_EVENT,
} from "@/types/pipeline";
import {
  shouldAutoExecute,
  recordDecision,
  getConfidence,
} from "@/lib/confidenceEngine";

// ─── Priority map for validation queue ordering ──────────────

const ACTION_PRIORITY: Record<PipelineActionType, number> = {
  CONFIRM_ORDER: 10,
  ASSIGN_VEHICLE: 5,
  DISPATCH_TRIP: 8,
  SEND_INVOICE: 3,
};

// ─── Public helpers ──────────────────────────────────────────

/**
 * Map a status string to a pipeline EventType.
 * Returns null if the status is not recognized.
 */
export function determineEventType(
  _entityType: PipelineEntityType | string,
  newStatus: string
): EventType | null {
  return (STATUS_TO_EVENT[newStatus] as EventType) ?? null;
}

/**
 * Determine the next action for a given event type.
 * Returns null if no autonomous action is possible (e.g., waiting for external input).
 */
export function determineNextAction(eventType: EventType): PipelineActionType | null {
  return EVENT_TO_ACTION[eventType] ?? null;
}

// ─── Core pipeline functions ─────────────────────────────────

export interface EvaluationOutput {
  evaluationResult: EvaluationResult;
  action: PipelineAction | null;
  confidence: number;
  eventType: EventType | null;
}

/**
 * Evaluate what should happen after a status change.
 *
 * 1. Determine the event type from the new status
 * 2. Look up the next action for that event
 * 3. If no action -> BLOCKED
 * 4. Check confidence via shouldAutoExecute
 * 5. Return AUTO_EXECUTE or NEEDS_VALIDATION
 */
export async function evaluateNextStep(
  supabase: SupabaseClient,
  tenantId: string,
  entityType: PipelineEntityType | string,
  entityId: string,
  newStatus: string
): Promise<EvaluationOutput> {
  const eventType = determineEventType(entityType, newStatus);

  if (!eventType) {
    return {
      evaluationResult: "BLOCKED",
      action: null,
      confidence: 0,
      eventType: null,
    };
  }

  const actionType = determineNextAction(eventType);

  if (!actionType) {
    return {
      evaluationResult: "BLOCKED",
      action: null,
      confidence: 0,
      eventType,
    };
  }

  const decisionType = EVENT_TO_DECISION_TYPE[eventType];
  const confidence = await getConfidence(tenantId, decisionType);

  const { auto } = await shouldAutoExecute(
    tenantId,
    decisionType,
    confidence,
    undefined
  );

  const action: PipelineAction = {
    tenantId,
    entityType: entityType as PipelineEntityType,
    entityId,
    actionType,
    payload: buildActionPayload(actionType, entityId),
  };

  return {
    evaluationResult: auto ? "AUTO_EXECUTE" : "NEEDS_VALIDATION",
    action,
    confidence,
    eventType,
  };
}

/**
 * Execute an autonomous action by updating the relevant entity.
 * Each action type maps to a specific database operation.
 */
export async function executeAction(
  supabase: SupabaseClient,
  action: PipelineAction
): Promise<void> {
  const { entityType, entityId, actionType, payload } = action;

  switch (actionType) {
    case "CONFIRM_ORDER": {
      const { error } = await supabase
        .from("orders")
        .update({ status: "CONFIRMED", ...payload })
        .eq("id", entityId);
      if (error) throw new Error(error.message);
      break;
    }
    case "ASSIGN_VEHICLE": {
      const { error } = await supabase
        .from("orders")
        .update({ status: "PLANNED", ...payload })
        .eq("id", entityId);
      if (error) throw new Error(error.message);
      break;
    }
    case "DISPATCH_TRIP": {
      const { error } = await supabase
        .from("trips")
        .update({ dispatch_status: "VERZONDEN", ...payload })
        .eq("id", entityId);
      if (error) throw new Error(error.message);
      break;
    }
    case "SEND_INVOICE": {
      const { error } = await supabase
        .from("invoices")
        .update({ status: "verzonden", ...payload })
        .eq("id", entityId);
      if (error) throw new Error(error.message);
      break;
    }
    default: {
      const _exhaustive: never = actionType;
      throw new Error(`Unknown action type: ${_exhaustive}`);
    }
  }
}

/**
 * Create a validation request in the validation_queue for human review.
 */
export async function createValidationRequest(
  supabase: SupabaseClient,
  tenantId: string,
  decisionLogId: string,
  entityType: PipelineEntityType | string,
  entityId: string,
  actionType: PipelineActionType | string,
  proposedAction: Record<string, unknown>,
  confidence: number
): Promise<void> {
  const priority = ACTION_PRIORITY[actionType as PipelineActionType] ?? 0;

  // Expire validation after 4 hours if not acted on
  const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase.from("validation_queue").insert({
    tenant_id: tenantId,
    decision_log_id: decisionLogId,
    entity_type: entityType,
    entity_id: entityId,
    action_type: actionType,
    proposed_action: proposedAction,
    confidence,
    priority,
    status: "PENDING",
    expires_at: expiresAt,
  });

  if (error) throw new Error(error.message);
}

/**
 * Main pipeline entry point. Called on every status change.
 *
 * Flow:
 * 1. Evaluate what to do next
 * 2. Record decision in confidence store
 * 3. Execute autonomously OR create validation request
 * 4. Log the pipeline event
 */
export async function processEvent(
  supabase: SupabaseClient,
  tenantId: string,
  entityType: PipelineEntityType | string,
  entityId: string,
  previousStatus: string,
  newStatus: string
): Promise<void> {
  const evaluation = await evaluateNextStep(
    supabase,
    tenantId,
    entityType,
    entityId,
    newStatus
  );

  if (evaluation.evaluationResult === "BLOCKED") {
    // Log the blocked event and return
    await logPipelineEvent(supabase, {
      tenant_id: tenantId,
      entity_type: entityType,
      entity_id: entityId,
      event_type: evaluation.eventType ?? determineEventType(entityType, newStatus) ?? newStatus,
      previous_status: previousStatus,
      new_status: newStatus,
      evaluation_result: "BLOCKED",
      confidence_at_evaluation: evaluation.confidence,
      action_taken: null,
    });
    return;
  }

  // Record the decision in the confidence store (Plan A)
  const decisionType = evaluation.eventType
    ? EVENT_TO_DECISION_TYPE[evaluation.eventType]
    : "ORDER_INTAKE";

  const decision = await recordDecision({
    tenantId,
    decisionType,
    entityType: entityType as PipelineEntityType,
    entityId,
    proposedAction: evaluation.action!.payload,
    inputConfidence: evaluation.confidence,
  });

  if (evaluation.evaluationResult === "AUTO_EXECUTE") {
    // Execute the action autonomously
    await executeAction(supabase, evaluation.action!);

    await logPipelineEvent(supabase, {
      tenant_id: tenantId,
      entity_type: entityType,
      entity_id: entityId,
      event_type: evaluation.eventType!,
      previous_status: previousStatus,
      new_status: newStatus,
      evaluation_result: "AUTO_EXECUTE",
      confidence_at_evaluation: evaluation.confidence,
      action_taken: {
        actionType: evaluation.action!.actionType,
        payload: evaluation.action!.payload,
        decisionId: decision.id,
      },
    });
  } else {
    // NEEDS_VALIDATION -- queue for human review
    await createValidationRequest(
      supabase,
      tenantId,
      decision.id,
      entityType,
      entityId,
      evaluation.action!.actionType,
      evaluation.action!.payload,
      evaluation.confidence
    );

    await logPipelineEvent(supabase, {
      tenant_id: tenantId,
      entity_type: entityType,
      entity_id: entityId,
      event_type: evaluation.eventType!,
      previous_status: previousStatus,
      new_status: newStatus,
      evaluation_result: "NEEDS_VALIDATION",
      confidence_at_evaluation: evaluation.confidence,
      action_taken: {
        actionType: evaluation.action!.actionType,
        proposedPayload: evaluation.action!.payload,
        decisionId: decision.id,
        validationRequired: true,
      },
    });
  }
}

// ─── Internal helpers ────────────────────────────────────────

/**
 * Build the action payload based on the action type.
 * These are minimal payloads; the downstream modules (Plan C, D, E, F)
 * will enrich them with VRP results, pricing, etc.
 */
function buildActionPayload(
  actionType: PipelineActionType,
  entityId: string
): Record<string, unknown> {
  switch (actionType) {
    case "CONFIRM_ORDER":
      return { status: "CONFIRMED", entityId };
    case "ASSIGN_VEHICLE":
      return { status: "PLANNED", entityId };
    case "DISPATCH_TRIP":
      return { dispatch_status: "VERZONDEN", entityId };
    case "SEND_INVOICE":
      return { status: "verzonden", entityId };
    default:
      return { entityId };
  }
}

/**
 * Log a pipeline event to the pipeline_events table.
 */
async function logPipelineEvent(
  supabase: SupabaseClient,
  event: {
    tenant_id: string;
    entity_type: string;
    entity_id: string;
    event_type: string;
    previous_status: string;
    new_status: string;
    evaluation_result: string;
    confidence_at_evaluation: number;
    action_taken: Record<string, unknown> | null;
  }
): Promise<void> {
  const { error } = await supabase.from("pipeline_events").insert(event);
  if (error) {
    console.warn("Failed to log pipeline event:", error.message);
  }
}
```

- [ ] **Step 5.2** Run TSC to verify no type errors

```bash
cd /c/Users/Badr/Desktop/DevBadr/orderflow-suite && npx tsc --noEmit
```

Expected: no errors related to `src/lib/pipelineOrchestrator.ts` or `src/types/pipeline.ts`.

- [ ] **Step 5.3** Run the tests (expect GREEN)

```bash
cd /c/Users/Badr/Desktop/DevBadr/orderflow-suite && npx vitest run src/test/pipelineOrchestrator.test.ts 2>&1
```

Expected output: all 20 tests pass.

```
 ✓ src/test/pipelineOrchestrator.test.ts (20)
   ✓ determineEventType (8)
   ✓ determineNextAction (6)
   ✓ evaluateNextStep (5)
   ✓ executeAction (2)
   ✓ createValidationRequest (3)
   ✓ processEvent (5)

Test Files  1 passed (1)
Tests  20 passed (20)
```

- [ ] **Step 5.4** Commit

```bash
cd /c/Users/Badr/Desktop/DevBadr/orderflow-suite && git add src/lib/pipelineOrchestrator.ts && git commit -m "feat(plan-b): implement pipelineOrchestrator — evaluate, execute, validate pipeline"
```

---

## Task 6: Edge Function -- `supabase/functions/pipeline-trigger/index.ts`

**Files:** `supabase/functions/pipeline-trigger/index.ts`

- [ ] **Step 6.1** Write the Edge Function

Create file `supabase/functions/pipeline-trigger/index.ts`:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Pipeline Trigger Edge Function
 *
 * Receives a webhook payload when an order/trip/invoice status changes.
 * Evaluates whether the system should act autonomously or queue for
 * human validation.
 *
 * Expected payload:
 * {
 *   tenant_id: string,
 *   entity_type: "order" | "trip" | "invoice",
 *   entity_id: string,
 *   previous_status: string,
 *   new_status: string
 * }
 *
 * Also supports Supabase Database Webhook format:
 * {
 *   type: "UPDATE",
 *   table: "orders",
 *   record: { id, tenant_id, status, ... },
 *   old_record: { id, tenant_id, status, ... }
 * }
 */

interface DirectPayload {
  tenant_id: string;
  entity_type: "order" | "trip" | "invoice";
  entity_id: string;
  previous_status: string;
  new_status: string;
}

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: Record<string, unknown>;
  old_record: Record<string, unknown>;
}

// ─── Status-to-event mapping (mirrors src/types/pipeline.ts) ─

const STATUS_TO_EVENT: Record<string, string> = {
  DRAFT: "ORDER_CREATED",
  PENDING: "ORDER_CREATED",
  CONFIRMED: "ORDER_CONFIRMED",
  PLANNED: "TRIP_PLANNED",
  DISPATCHED: "TRIP_DISPATCHED",
  IN_TRANSIT: "TRIP_DISPATCHED",
  DELIVERED: "DELIVERY_COMPLETE",
};

const EVENT_TO_ACTION: Record<string, string | null> = {
  ORDER_CREATED: "CONFIRM_ORDER",
  ORDER_CONFIRMED: "ASSIGN_VEHICLE",
  TRIP_PLANNED: "DISPATCH_TRIP",
  TRIP_DISPATCHED: null,
  DELIVERY_COMPLETE: "SEND_INVOICE",
  INVOICE_READY: null,
};

const EVENT_TO_DECISION_TYPE: Record<string, string> = {
  ORDER_CREATED: "ORDER_INTAKE",
  ORDER_CONFIRMED: "PLANNING",
  TRIP_PLANNED: "DISPATCH",
  TRIP_DISPATCHED: "DISPATCH",
  DELIVERY_COMPLETE: "INVOICING",
  INVOICE_READY: "INVOICING",
};

const ACTION_PRIORITY: Record<string, number> = {
  CONFIRM_ORDER: 10,
  ASSIGN_VEHICLE: 5,
  DISPATCH_TRIP: 8,
  SEND_INVOICE: 3,
};

// ─── Table-to-entity mapping ─────────────────────────────────

const TABLE_TO_ENTITY: Record<string, string> = {
  orders: "order",
  trips: "trip",
  invoices: "invoice",
};

// ─── Status field per table ──────────────────────────────────

const TABLE_STATUS_FIELD: Record<string, string> = {
  orders: "status",
  trips: "dispatch_status",
  invoices: "status",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();

    // ─── Normalize payload ───────────────────────────────────
    let tenantId: string;
    let entityType: string;
    let entityId: string;
    let previousStatus: string;
    let newStatus: string;

    if (body.type && body.table && body.record) {
      // Database webhook format
      const webhook = body as WebhookPayload;

      if (webhook.type !== "UPDATE") {
        return new Response(
          JSON.stringify({ skipped: true, reason: "Only UPDATE events trigger pipeline" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const statusField = TABLE_STATUS_FIELD[webhook.table] ?? "status";
      const oldStatus = String(webhook.old_record[statusField] ?? "");
      const curStatus = String(webhook.record[statusField] ?? "");

      if (oldStatus === curStatus) {
        return new Response(
          JSON.stringify({ skipped: true, reason: "Status did not change" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      tenantId = String(webhook.record.tenant_id);
      entityType = TABLE_TO_ENTITY[webhook.table] ?? webhook.table;
      entityId = String(webhook.record.id);
      previousStatus = oldStatus;
      newStatus = curStatus;
    } else {
      // Direct payload format
      const direct = body as DirectPayload;
      tenantId = direct.tenant_id;
      entityType = direct.entity_type;
      entityId = direct.entity_id;
      previousStatus = direct.previous_status;
      newStatus = direct.new_status;
    }

    if (!tenantId || !entityType || !entityId || !newStatus) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: tenant_id, entity_type, entity_id, new_status" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Check if autonomy is enabled for this tenant ────────
    const { data: tenant, error: tenantErr } = await supabase
      .from("tenants")
      .select("settings")
      .eq("id", tenantId)
      .single();

    if (tenantErr) {
      return new Response(
        JSON.stringify({ error: `Tenant lookup failed: ${tenantErr.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const settings = (tenant?.settings as Record<string, unknown>) ?? {};
    const autonomy = (settings.autonomy as Record<string, unknown>) ?? {};

    if (!autonomy.enabled) {
      // Log event but skip evaluation
      await supabase.from("pipeline_events").insert({
        tenant_id: tenantId,
        entity_type: entityType,
        entity_id: entityId,
        event_type: STATUS_TO_EVENT[newStatus] ?? newStatus,
        previous_status: previousStatus,
        new_status: newStatus,
        evaluation_result: "BLOCKED",
        confidence_at_evaluation: null,
        action_taken: { reason: "Autonomy disabled for tenant" },
      });

      return new Response(
        JSON.stringify({ skipped: true, reason: "Autonomy not enabled for tenant" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Evaluate next step ──────────────────────────────────
    const eventType = STATUS_TO_EVENT[newStatus] ?? null;

    if (!eventType) {
      await supabase.from("pipeline_events").insert({
        tenant_id: tenantId,
        entity_type: entityType,
        entity_id: entityId,
        event_type: newStatus,
        previous_status: previousStatus,
        new_status: newStatus,
        evaluation_result: "BLOCKED",
        confidence_at_evaluation: null,
        action_taken: { reason: "No event mapping for status" },
      });

      return new Response(
        JSON.stringify({ result: "BLOCKED", reason: "No event mapping for status" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const actionType = EVENT_TO_ACTION[eventType];

    if (!actionType) {
      await supabase.from("pipeline_events").insert({
        tenant_id: tenantId,
        entity_type: entityType,
        entity_id: entityId,
        event_type: eventType,
        previous_status: previousStatus,
        new_status: newStatus,
        evaluation_result: "BLOCKED",
        confidence_at_evaluation: null,
        action_taken: { reason: "No action for this event type" },
      });

      return new Response(
        JSON.stringify({ result: "BLOCKED", reason: "No action for this event type" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Get confidence score ────────────────────────────────
    const decisionType = EVENT_TO_DECISION_TYPE[eventType];

    const { data: scoreRow } = await supabase
      .from("confidence_scores")
      .select("current_score")
      .eq("tenant_id", tenantId)
      .eq("decision_type", decisionType)
      .is("client_id", null)
      .maybeSingle();

    const confidence = scoreRow?.current_score ?? 50; // Default 50 for new tenants

    // ─── Check threshold ─────────────────────────────────────
    const thresholds = (autonomy.thresholds as Record<string, number>) ?? {};
    const threshold = thresholds[decisionType]
      ?? (autonomy.global_threshold as number)
      ?? 95;

    const shouldAuto = confidence >= threshold;

    // ─── Record decision ─────────────────────────────────────
    const { data: decision, error: decisionErr } = await supabase
      .from("decision_log")
      .insert({
        tenant_id: tenantId,
        decision_type: decisionType,
        entity_type: entityType,
        entity_id: entityId,
        proposed_action: { actionType, status: newStatus },
        input_confidence: confidence,
        model_confidence: confidence,
        resolution: shouldAuto ? "AUTO_EXECUTED" : "PENDING",
      })
      .select()
      .single();

    if (decisionErr) {
      console.error("Failed to record decision:", decisionErr);
      return new Response(
        JSON.stringify({ error: `Decision logging failed: ${decisionErr.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (shouldAuto) {
      // ─── Auto-execute ──────────────────────────────────────
      let execError: string | null = null;

      try {
        switch (actionType) {
          case "CONFIRM_ORDER":
            await supabase.from("orders").update({ status: "CONFIRMED" }).eq("id", entityId);
            break;
          case "ASSIGN_VEHICLE":
            await supabase.from("orders").update({ status: "PLANNED" }).eq("id", entityId);
            break;
          case "DISPATCH_TRIP":
            await supabase.from("trips").update({ dispatch_status: "VERZONDEN" }).eq("id", entityId);
            break;
          case "SEND_INVOICE":
            await supabase.from("invoices").update({ status: "verzonden" }).eq("id", entityId);
            break;
        }
      } catch (e) {
        execError = e instanceof Error ? e.message : String(e);
      }

      await supabase.from("pipeline_events").insert({
        tenant_id: tenantId,
        entity_type: entityType,
        entity_id: entityId,
        event_type: eventType,
        previous_status: previousStatus,
        new_status: newStatus,
        evaluation_result: execError ? "BLOCKED" : "AUTO_EXECUTE",
        confidence_at_evaluation: confidence,
        action_taken: {
          actionType,
          decisionId: decision.id,
          error: execError,
        },
      });

      return new Response(
        JSON.stringify({
          result: execError ? "BLOCKED" : "AUTO_EXECUTE",
          actionType,
          confidence,
          decisionId: decision.id,
          error: execError,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      // ─── Create validation request ─────────────────────────
      const priority = ACTION_PRIORITY[actionType] ?? 0;
      const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();

      const { error: vqErr } = await supabase.from("validation_queue").insert({
        tenant_id: tenantId,
        decision_log_id: decision.id,
        entity_type: entityType,
        entity_id: entityId,
        action_type: actionType,
        proposed_action: { actionType, status: newStatus },
        confidence,
        priority,
        status: "PENDING",
        expires_at: expiresAt,
      });

      if (vqErr) {
        console.error("Failed to create validation request:", vqErr);
      }

      await supabase.from("pipeline_events").insert({
        tenant_id: tenantId,
        entity_type: entityType,
        entity_id: entityId,
        event_type: eventType,
        previous_status: previousStatus,
        new_status: newStatus,
        evaluation_result: "NEEDS_VALIDATION",
        confidence_at_evaluation: confidence,
        action_taken: {
          actionType,
          decisionId: decision.id,
          validationRequired: true,
        },
      });

      return new Response(
        JSON.stringify({
          result: "NEEDS_VALIDATION",
          actionType,
          confidence,
          threshold,
          decisionId: decision.id,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (e) {
    console.error("pipeline-trigger error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

- [ ] **Step 6.2** Commit

```bash
cd /c/Users/Badr/Desktop/DevBadr/orderflow-suite && git add supabase/functions/pipeline-trigger/index.ts && git commit -m "feat(plan-b): add pipeline-trigger Edge Function — webhook handler for status changes"
```

---

## Task 7: Hook + Tests -- `src/hooks/useValidationQueue.ts`

**Files:** `src/hooks/useValidationQueue.ts`, `src/test/useValidationQueue.test.ts`

- [ ] **Step 7.1** Write the hook tests (RED phase)

Create file `src/test/useValidationQueue.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { mockSupabase, createWrapper } from "./testUtils";

// Ensure supabase mock is in place
vi.mock("@/integrations/supabase/client", () => ({
  supabase: mockSupabase,
}));

// Mock confidenceEngine
vi.mock("@/lib/confidenceEngine", () => ({
  resolveDecision: vi.fn().mockResolvedValue(undefined),
}));

// Mock pipelineOrchestrator
vi.mock("@/lib/pipelineOrchestrator", () => ({
  executeAction: vi.fn().mockResolvedValue(undefined),
}));

import {
  useValidationQueue,
  useValidationCount,
  useApproveValidation,
  useRejectValidation,
} from "@/hooks/useValidationQueue";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useValidationQueue", () => {
  it("queries validation_queue for PENDING items", async () => {
    const mockData = [
      {
        id: "vq-1",
        tenant_id: "t-1",
        decision_log_id: "d-1",
        entity_type: "order",
        entity_id: "o-1",
        action_type: "CONFIRM_ORDER",
        proposed_action: { status: "CONFIRMED" },
        confidence: 78,
        priority: 10,
        status: "PENDING",
        expires_at: null,
        created_at: "2026-04-05T12:00:00Z",
      },
    ];

    // Override the chain to return data at the end
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: mockData, error: null }),
    };
    mockSupabase.from.mockReturnValue(chain as any);

    const { result } = renderHook(() => useValidationQueue(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockSupabase.from).toHaveBeenCalledWith("validation_queue");
    expect(chain.eq).toHaveBeenCalledWith("status", "PENDING");
  });
});

describe("useValidationCount", () => {
  it("returns count of PENDING items", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ count: 5, error: null }),
    };
    mockSupabase.from.mockReturnValue(chain as any);

    const { result } = renderHook(() => useValidationCount(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockSupabase.from).toHaveBeenCalledWith("validation_queue");
  });
});

describe("useApproveValidation", () => {
  it("is a mutation hook", () => {
    const { result } = renderHook(() => useApproveValidation(), {
      wrapper: createWrapper(),
    });

    expect(result.current.mutateAsync).toBeDefined();
    expect(typeof result.current.mutateAsync).toBe("function");
  });
});

describe("useRejectValidation", () => {
  it("is a mutation hook", () => {
    const { result } = renderHook(() => useRejectValidation(), {
      wrapper: createWrapper(),
    });

    expect(result.current.mutateAsync).toBeDefined();
    expect(typeof result.current.mutateAsync).toBe("function");
  });
});
```

- [ ] **Step 7.2** Run tests (expect RED)

```bash
cd /c/Users/Badr/Desktop/DevBadr/orderflow-suite && npx vitest run src/test/useValidationQueue.test.ts 2>&1
```

Expected: FAIL -- Cannot find module `@/hooks/useValidationQueue`.

- [ ] **Step 7.3** Implement the hook

Create file `src/hooks/useValidationQueue.ts`:

```typescript
// ─── Validation Queue Hooks ──────────────────────────────────
//
// TanStack Query hooks for managing the validation queue.
// Dispatchers/planners use these to approve or reject pipeline
// proposals that need human verification.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ValidationItem, PipelineAction } from "@/types/pipeline";
import { resolveDecision } from "@/lib/confidenceEngine";
import { executeAction } from "@/lib/pipelineOrchestrator";

const VALIDATION_QUEUE_KEY = ["validation_queue"] as const;
const VALIDATION_COUNT_KEY = ["validation_queue", "count"] as const;

/**
 * Fetch all PENDING validation items, ordered by priority DESC.
 */
export function useValidationQueue() {
  return useQuery({
    queryKey: [...VALIDATION_QUEUE_KEY],
    staleTime: 10_000,
    refetchInterval: 30_000, // Poll every 30s for new items
    queryFn: async () => {
      const { data, error } = await supabase
        .from("validation_queue")
        .select("*")
        .eq("status", "PENDING")
        .order("priority", { ascending: false });

      if (error) throw error;
      return (data ?? []) as ValidationItem[];
    },
  });
}

/**
 * Get the count of PENDING validation items (for badge display).
 */
export function useValidationCount() {
  return useQuery({
    queryKey: [...VALIDATION_COUNT_KEY],
    staleTime: 10_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("validation_queue")
        .select("*", { count: "exact", head: true })
        .eq("status", "PENDING");

      if (error) throw error;
      return count ?? 0;
    },
  });
}

/**
 * Approve a validation item:
 * 1. Update validation_queue status to APPROVED
 * 2. Resolve the decision in the confidence store as APPROVED
 * 3. Execute the proposed action
 */
export function useApproveValidation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (item: ValidationItem) => {
      // 1. Update validation queue
      const { error: updateErr } = await supabase
        .from("validation_queue")
        .update({ status: "APPROVED" })
        .eq("id", item.id);

      if (updateErr) throw updateErr;

      // 2. Resolve the decision as APPROVED in confidence store
      await resolveDecision(item.decision_log_id, "APPROVED", item.proposed_action);

      // 3. Execute the proposed action
      const action: PipelineAction = {
        tenantId: item.tenant_id,
        entityType: item.entity_type,
        entityId: item.entity_id,
        actionType: item.action_type,
        payload: item.proposed_action,
      };

      await executeAction(supabase as any, action);

      return item;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...VALIDATION_QUEUE_KEY] });
      queryClient.invalidateQueries({ queryKey: [...VALIDATION_COUNT_KEY] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["trips"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

/**
 * Reject a validation item:
 * 1. Update validation_queue status to REJECTED
 * 2. Resolve the decision in the confidence store as REJECTED
 */
export function useRejectValidation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (item: ValidationItem) => {
      // 1. Update validation queue
      const { error: updateErr } = await supabase
        .from("validation_queue")
        .update({ status: "REJECTED" })
        .eq("id", item.id);

      if (updateErr) throw updateErr;

      // 2. Resolve the decision as REJECTED in confidence store
      await resolveDecision(item.decision_log_id, "REJECTED");

      return item;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...VALIDATION_QUEUE_KEY] });
      queryClient.invalidateQueries({ queryKey: [...VALIDATION_COUNT_KEY] });
    },
  });
}
```

- [ ] **Step 7.4** Run tests (expect GREEN)

```bash
cd /c/Users/Badr/Desktop/DevBadr/orderflow-suite && npx vitest run src/test/useValidationQueue.test.ts 2>&1
```

Expected output: all 4 tests pass.

- [ ] **Step 7.5** Commit

```bash
cd /c/Users/Badr/Desktop/DevBadr/orderflow-suite && git add src/hooks/useValidationQueue.ts src/test/useValidationQueue.test.ts && git commit -m "feat(plan-b): add useValidationQueue hook with approve/reject mutations + tests"
```

---

## Task 8: UI Component + Tests -- `src/components/validation/ValidationBanner.tsx`

**Files:** `src/components/validation/ValidationBanner.tsx`, `src/test/ValidationBanner.test.tsx`

- [ ] **Step 8.1** Write the component test (RED phase)

Create file `src/test/ValidationBanner.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "./testUtils";

// Mock the hooks
const mockValidationQueue = {
  data: [] as any[],
  isLoading: false,
  isSuccess: true,
};

const mockValidationCount = {
  data: 0,
  isLoading: false,
  isSuccess: true,
};

const mockApprove = {
  mutateAsync: vi.fn().mockResolvedValue(undefined),
  isPending: false,
};

const mockReject = {
  mutateAsync: vi.fn().mockResolvedValue(undefined),
  isPending: false,
};

vi.mock("@/hooks/useValidationQueue", () => ({
  useValidationQueue: () => mockValidationQueue,
  useValidationCount: () => mockValidationCount,
  useApproveValidation: () => mockApprove,
  useRejectValidation: () => mockReject,
}));

// Must import after mock
import { ValidationBanner } from "@/components/validation/ValidationBanner";

beforeEach(() => {
  vi.clearAllMocks();
  mockValidationQueue.data = [];
  mockValidationCount.data = 0;
});

describe("ValidationBanner", () => {
  it("renders nothing when there are no pending items", () => {
    const { container } = renderWithProviders(<ValidationBanner />);
    expect(container.textContent).toBe("");
  });

  it("shows the pending count badge when items exist", () => {
    mockValidationCount.data = 3;
    mockValidationQueue.data = [
      {
        id: "vq-1",
        tenant_id: "t-1",
        decision_log_id: "d-1",
        entity_type: "order",
        entity_id: "o-1",
        action_type: "CONFIRM_ORDER",
        proposed_action: { status: "CONFIRMED" },
        confidence: 78,
        priority: 10,
        status: "PENDING",
        expires_at: null,
        created_at: "2026-04-05T12:00:00Z",
      },
      {
        id: "vq-2",
        tenant_id: "t-1",
        decision_log_id: "d-2",
        entity_type: "trip",
        entity_id: "trip-1",
        action_type: "DISPATCH_TRIP",
        proposed_action: { dispatch_status: "VERZONDEN" },
        confidence: 72,
        priority: 8,
        status: "PENDING",
        expires_at: null,
        created_at: "2026-04-05T12:05:00Z",
      },
      {
        id: "vq-3",
        tenant_id: "t-1",
        decision_log_id: "d-3",
        entity_type: "order",
        entity_id: "o-2",
        action_type: "ASSIGN_VEHICLE",
        proposed_action: { status: "PLANNED" },
        confidence: 65,
        priority: 5,
        status: "PENDING",
        expires_at: null,
        created_at: "2026-04-05T12:10:00Z",
      },
    ];

    renderWithProviders(<ValidationBanner />);

    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("shows action type labels in the list", () => {
    mockValidationCount.data = 1;
    mockValidationQueue.data = [
      {
        id: "vq-1",
        tenant_id: "t-1",
        decision_log_id: "d-1",
        entity_type: "order",
        entity_id: "o-1",
        action_type: "CONFIRM_ORDER",
        proposed_action: { status: "CONFIRMED" },
        confidence: 78,
        priority: 10,
        status: "PENDING",
        expires_at: null,
        created_at: "2026-04-05T12:00:00Z",
      },
    ];

    renderWithProviders(<ValidationBanner />);

    // The banner should show something about confirming an order
    expect(screen.getByText(/bevestig/i)).toBeInTheDocument();
  });

  it("shows confidence percentage", () => {
    mockValidationCount.data = 1;
    mockValidationQueue.data = [
      {
        id: "vq-1",
        tenant_id: "t-1",
        decision_log_id: "d-1",
        entity_type: "order",
        entity_id: "o-1",
        action_type: "CONFIRM_ORDER",
        proposed_action: { status: "CONFIRMED" },
        confidence: 78,
        priority: 10,
        status: "PENDING",
        expires_at: null,
        created_at: "2026-04-05T12:00:00Z",
      },
    ];

    renderWithProviders(<ValidationBanner />);

    expect(screen.getByText(/78%/)).toBeInTheDocument();
  });

  it("calls approve mutation when approve button is clicked", async () => {
    const user = userEvent.setup();
    mockValidationCount.data = 1;
    mockValidationQueue.data = [
      {
        id: "vq-1",
        tenant_id: "t-1",
        decision_log_id: "d-1",
        entity_type: "order",
        entity_id: "o-1",
        action_type: "CONFIRM_ORDER",
        proposed_action: { status: "CONFIRMED" },
        confidence: 78,
        priority: 10,
        status: "PENDING",
        expires_at: null,
        created_at: "2026-04-05T12:00:00Z",
      },
    ];

    renderWithProviders(<ValidationBanner />);

    const approveButton = screen.getByRole("button", { name: /goedkeuren/i });
    await user.click(approveButton);

    expect(mockApprove.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ id: "vq-1" })
    );
  });

  it("calls reject mutation when reject button is clicked", async () => {
    const user = userEvent.setup();
    mockValidationCount.data = 1;
    mockValidationQueue.data = [
      {
        id: "vq-1",
        tenant_id: "t-1",
        decision_log_id: "d-1",
        entity_type: "order",
        entity_id: "o-1",
        action_type: "CONFIRM_ORDER",
        proposed_action: { status: "CONFIRMED" },
        confidence: 78,
        priority: 10,
        status: "PENDING",
        expires_at: null,
        created_at: "2026-04-05T12:00:00Z",
      },
    ];

    renderWithProviders(<ValidationBanner />);

    const rejectButton = screen.getByRole("button", { name: /afwijzen/i });
    await user.click(rejectButton);

    expect(mockReject.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ id: "vq-1" })
    );
  });
});
```

- [ ] **Step 8.2** Run tests (expect RED)

```bash
cd /c/Users/Badr/Desktop/DevBadr/orderflow-suite && npx vitest run src/test/ValidationBanner.test.tsx 2>&1
```

Expected: FAIL -- Cannot find module `@/components/validation/ValidationBanner`.

- [ ] **Step 8.3** Implement the ValidationBanner component

Create file `src/components/validation/ValidationBanner.tsx`:

```tsx
// ─── Validation Banner ───────────────────────────────────────
//
// Shows pending validation items as a collapsible banner.
// Dispatchers see a badge with pending count and can expand
// to one-click approve or reject each item.

import { useState } from "react";
import { ChevronDown, ChevronUp, Check, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  useValidationQueue,
  useValidationCount,
  useApproveValidation,
  useRejectValidation,
} from "@/hooks/useValidationQueue";
import type { ValidationItem } from "@/types/pipeline";

// ─── Action labels (Dutch) ───────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  CONFIRM_ORDER: "Order bevestigen",
  ASSIGN_VEHICLE: "Voertuig toewijzen",
  DISPATCH_TRIP: "Rit verzenden",
  SEND_INVOICE: "Factuur versturen",
};

const ENTITY_LABELS: Record<string, string> = {
  order: "Order",
  trip: "Rit",
  invoice: "Factuur",
};

export function ValidationBanner() {
  const [expanded, setExpanded] = useState(false);
  const { data: items = [] } = useValidationQueue();
  const { data: count = 0 } = useValidationCount();
  const approveMutation = useApproveValidation();
  const rejectMutation = useRejectValidation();

  if (count === 0) return null;

  const handleApprove = async (item: ValidationItem) => {
    try {
      await approveMutation.mutateAsync(item);
    } catch (err) {
      console.error("Approve failed:", err);
    }
  };

  const handleReject = async (item: ValidationItem) => {
    try {
      await rejectMutation.mutateAsync(item);
    } catch (err) {
      console.error("Reject failed:", err);
    }
  };

  return (
    <div className="border border-amber-200 bg-amber-50 rounded-lg p-3 mb-4">
      {/* Header with badge */}
      <button
        className="flex items-center justify-between w-full text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <span className="text-sm font-medium text-amber-800">
            Validatie vereist
          </span>
          <Badge
            variant="secondary"
            className="bg-amber-200 text-amber-900 hover:bg-amber-200"
          >
            {count}
          </Badge>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-amber-600" />
        ) : (
          <ChevronDown className="h-4 w-4 text-amber-600" />
        )}
      </button>

      {/* Expanded item list */}
      {expanded && (
        <div className="mt-3 space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between bg-white rounded-md border border-amber-100 p-2"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900">
                  {ACTION_LABELS[item.action_type] ?? item.action_type}
                </div>
                <div className="text-xs text-gray-500">
                  {ENTITY_LABELS[item.entity_type] ?? item.entity_type}{" "}
                  &middot; Vertrouwen:{" "}
                  <span
                    className={
                      (item.confidence ?? 0) >= 80
                        ? "text-green-600"
                        : (item.confidence ?? 0) >= 60
                          ? "text-amber-600"
                          : "text-red-600"
                    }
                  >
                    {item.confidence ?? 0}%
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1 ml-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-green-700 border-green-200 hover:bg-green-50"
                  onClick={() => handleApprove(item)}
                  disabled={approveMutation.isPending}
                  aria-label="Goedkeuren"
                >
                  <Check className="h-3.5 w-3.5 mr-1" />
                  Goedkeuren
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-red-700 border-red-200 hover:bg-red-50"
                  onClick={() => handleReject(item)}
                  disabled={rejectMutation.isPending}
                  aria-label="Afwijzen"
                >
                  <X className="h-3.5 w-3.5 mr-1" />
                  Afwijzen
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 8.4** Run TSC to verify no type errors

```bash
cd /c/Users/Badr/Desktop/DevBadr/orderflow-suite && npx tsc --noEmit
```

- [ ] **Step 8.5** Run tests (expect GREEN)

```bash
cd /c/Users/Badr/Desktop/DevBadr/orderflow-suite && npx vitest run src/test/ValidationBanner.test.tsx 2>&1
```

Expected output: all 6 tests pass.

```
 ✓ src/test/ValidationBanner.test.tsx (6)
   ✓ ValidationBanner (6)

Test Files  1 passed (1)
Tests  6 passed (6)
```

- [ ] **Step 8.6** Commit

```bash
cd /c/Users/Badr/Desktop/DevBadr/orderflow-suite && git add src/components/validation/ValidationBanner.tsx src/test/ValidationBanner.test.tsx && git commit -m "feat(plan-b): add ValidationBanner component with approve/reject UI + tests"
```

---

## Task 9: Full test suite verification

**Depends on:** All previous tasks

- [ ] **Step 9.1** Run ALL Plan B tests together

```bash
cd /c/Users/Badr/Desktop/DevBadr/orderflow-suite && npx vitest run src/test/pipelineOrchestrator.test.ts src/test/useValidationQueue.test.ts src/test/ValidationBanner.test.tsx 2>&1
```

Expected:

```
 ✓ src/test/pipelineOrchestrator.test.ts (20)
 ✓ src/test/useValidationQueue.test.ts (4)
 ✓ src/test/ValidationBanner.test.tsx (6)

Test Files  3 passed (3)
Tests  30 passed (30)
```

- [ ] **Step 9.2** Run full TSC check

```bash
cd /c/Users/Badr/Desktop/DevBadr/orderflow-suite && npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 9.3** Run existing test suite to verify no regressions

```bash
cd /c/Users/Badr/Desktop/DevBadr/orderflow-suite && npx vitest run 2>&1
```

Expected: all existing tests still pass, plus 30 new tests.

- [ ] **Step 9.4** Final commit combining any remaining changes

```bash
cd /c/Users/Badr/Desktop/DevBadr/orderflow-suite && git add -A && git status
```

If there are staged changes:

```bash
cd /c/Users/Badr/Desktop/DevBadr/orderflow-suite && git commit -m "chore(plan-b): final verification — all 30 Plan B tests passing"
```

---

## Summary

| Deliverable | File | Lines (est.) |
|---|---|---|
| Migration: pipeline_events | `supabase/migrations/20260405120000_pipeline_events.sql` | ~30 |
| Migration: validation_queue | `supabase/migrations/20260405120001_validation_queue.sql` | ~35 |
| Types | `src/types/pipeline.ts` | ~95 |
| Orchestrator lib | `src/lib/pipelineOrchestrator.ts` | ~230 |
| Edge Function | `supabase/functions/pipeline-trigger/index.ts` | ~290 |
| Validation hook | `src/hooks/useValidationQueue.ts` | ~115 |
| ValidationBanner UI | `src/components/validation/ValidationBanner.tsx` | ~130 |
| Orchestrator tests | `src/test/pipelineOrchestrator.test.ts` | ~280 |
| Hook tests | `src/test/useValidationQueue.test.ts` | ~80 |
| Banner tests | `src/test/ValidationBanner.test.tsx` | ~170 |
| **Total** | **10 files** | **~1455** |

**Test cases:** 30 total (20 orchestrator + 4 hook + 6 UI)

**Commits:** 8 incremental commits following TDD red-green-commit cycle

**Dependencies consumed from Plan A:**
- `confidenceEngine.ts`: shouldAutoExecute(), recordDecision(), resolveDecision(), getConfidence()
- `confidence.ts` types: DecisionType, Resolution, DecisionLogEntry, RecordDecisionInput
- Tables: decision_log, confidence_scores, tenants.settings.autonomy
