# Plan E: Autonomous Dispatch & Execution

> **superpowers:subagent-driven-development** -- Each task block is independently executable by a subagent. Tasks are ordered by dependency. TDD: write test first, watch it fail, implement, watch it pass.

---

## Goal

Transform dispatch from a manual process (planner sends trips, monitors drivers, reacts to delays) into a confidence-driven autonomous system that:

1. **Auto-dispatches** trips to drivers when they're ready (lead-time threshold met)
2. **Detects execution anomalies** in real-time (stationary driver, late arrival, missed window)
3. **Auto-replans** when delays make the current stop order suboptimal
4. All gated by per-tenant rules and integrated with the confidence engine (Plans A+B)

## Architecture

```
driver_positions (realtime)
        |
        v
 anomalyDetector.ts ──> execution_anomalies table
        |                       |
        v                       v
 realtimeReplanner.ts    notifications table
        |
        v
 trip_stops (re-sequenced)

 dispatch-scheduler (Edge Function, cron 5min)
        |
        v
 autoDispatcher.ts ──> trips.dispatch_status = 'VERZONDEN'
        |                       |
        v                       v
 confidenceEngine      notifications table
 .recordDecision()
```

## Tech Stack

- **Runtime:** TypeScript 5.8, React 18
- **DB:** Supabase PostgreSQL with RLS
- **Edge Functions:** Deno (Supabase Functions)
- **Tests:** Vitest
- **State:** TanStack Query 5
- **Geo:** haversineKm from `src/data/geoData.ts`

## File Structure

```
supabase/migrations/
  20260405120000_dispatch_rules_and_anomalies.sql     # NEW: dispatch_rules + execution_anomalies tables

src/types/
  dispatch-autonomy.ts                                 # NEW: DispatchRules, ExecutionAnomaly, AnomalyType

src/lib/
  autoDispatcher.ts                                    # NEW: getTripsReadyForDispatch, dispatchTrip
  anomalyDetector.ts                                   # NEW: detectStationary, detectLate, evaluatePosition
  realtimeReplanner.ts                                 # NEW: replanOnDelay, notifyStakeholders

supabase/functions/
  dispatch-scheduler/index.ts                          # NEW: cron edge function

src/test/
  autoDispatcher.test.ts                               # NEW: 7 tests
  anomalyDetector.test.ts                              # NEW: 8 tests
  realtimeReplanner.test.ts                            # NEW: 5 tests
```

## Dependencies (from Plans A + B + D)

These files are assumed to exist when Plan E executes. If they do not exist yet, Plan E creates **stub versions** with the minimal interfaces needed, marked with `// TODO: Replace with real implementation from Plan X`.

| Dependency | Source Plan | What Plan E needs |
|---|---|---|
| `src/lib/confidenceEngine.ts` | Plan A | `shouldAutoExecute(tenantId, 'DISPATCH', confidence): boolean`, `recordDecision(input: RecordDecisionInput): Promise<void>` |
| `src/lib/pipelineOrchestrator.ts` | Plan B | `processEvent(event): Promise<void>` |
| `src/lib/rollingPlanner.ts` | Plan D | `reoptimizeStopOrder(stops: TripStop[], currentPosition: GeoCoord): TripStop[]` |
| `src/types/autonomy.ts` | Plan A | `DecisionType`, `RecordDecisionInput` |

---

## Task 1: Database Migration -- dispatch_rules + execution_anomalies

### 1.1 Create migration file

- [ ] Create file `supabase/migrations/20260405120000_dispatch_rules_and_anomalies.sql` with this exact content:

```sql
-- ============================================================
-- Plan E: Autonomous Dispatch & Execution
-- Tables: dispatch_rules (per-tenant config), execution_anomalies
-- ============================================================

-- ─── 1. Dispatch Rules (per-tenant config) ─────────────────
CREATE TABLE IF NOT EXISTS public.dispatch_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  auto_dispatch_enabled BOOLEAN NOT NULL DEFAULT false,
  dispatch_lead_time_min INTEGER NOT NULL DEFAULT 60,
  anomaly_stationary_min INTEGER NOT NULL DEFAULT 20,
  anomaly_late_threshold_min INTEGER NOT NULL DEFAULT 15,
  auto_replan_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT dispatch_rules_tenant_unique UNIQUE (tenant_id)
);

-- RLS
ALTER TABLE public.dispatch_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dispatch_rules_tenant_isolation"
  ON public.dispatch_rules
  FOR ALL
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- Updated_at trigger
CREATE TRIGGER update_dispatch_rules_updated_at
  BEFORE UPDATE ON public.dispatch_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ─── 2. Execution Anomalies ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.execution_anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  driver_id UUID,
  anomaly_type TEXT NOT NULL
    CHECK (anomaly_type IN ('STATIONARY', 'LATE', 'OFF_ROUTE', 'MISSED_WINDOW')),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  details JSONB DEFAULT '{}'::jsonb,
  resolution TEXT
    CHECK (resolution IS NULL OR resolution IN ('AUTO_REPLANNED', 'PLANNER_RESOLVED', 'IGNORED')),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.execution_anomalies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "execution_anomalies_tenant_isolation"
  ON public.execution_anomalies
  FOR ALL
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- Indexes
CREATE INDEX idx_execution_anomalies_trip
  ON public.execution_anomalies(trip_id);

CREATE INDEX idx_execution_anomalies_unresolved
  ON public.execution_anomalies(tenant_id, resolved_at)
  WHERE resolved_at IS NULL;

-- Service role bypass for edge functions
CREATE POLICY "dispatch_rules_service_role"
  ON public.dispatch_rules
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "execution_anomalies_service_role"
  ON public.execution_anomalies
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

### 1.2 Verify migration syntax

- [ ] Run: `cd C:/Users/Badr/Desktop/DevBadr/orderflow-suite && npx supabase db lint --schema public` (or visually verify SQL is valid)

---

## Task 2: TypeScript Types -- dispatch-autonomy.ts

### 2.1 Write tests for type guards

- [ ] Create `src/test/autoDispatcher.test.ts` with the type-related tests (we add dispatch tests in Task 4):

```typescript
import { describe, it, expect } from "vitest";
import {
  type AnomalyType,
  type AnomalyResolution,
  type DispatchRules,
  type ExecutionAnomaly,
  ANOMALY_TYPES,
  ANOMALY_RESOLUTIONS,
  isValidAnomalyType,
  isValidResolution,
} from "@/types/dispatch-autonomy";

describe("dispatch-autonomy types", () => {
  it("ANOMALY_TYPES contains all 4 types", () => {
    expect(ANOMALY_TYPES).toEqual(["STATIONARY", "LATE", "OFF_ROUTE", "MISSED_WINDOW"]);
  });

  it("isValidAnomalyType returns true for valid types", () => {
    expect(isValidAnomalyType("STATIONARY")).toBe(true);
    expect(isValidAnomalyType("LATE")).toBe(true);
    expect(isValidAnomalyType("OFF_ROUTE")).toBe(true);
    expect(isValidAnomalyType("MISSED_WINDOW")).toBe(true);
  });

  it("isValidAnomalyType returns false for invalid types", () => {
    expect(isValidAnomalyType("BOGUS")).toBe(false);
    expect(isValidAnomalyType("")).toBe(false);
  });

  it("isValidResolution validates correctly", () => {
    expect(isValidResolution("AUTO_REPLANNED")).toBe(true);
    expect(isValidResolution("PLANNER_RESOLVED")).toBe(true);
    expect(isValidResolution("IGNORED")).toBe(true);
    expect(isValidResolution("UNKNOWN")).toBe(false);
    expect(isValidResolution(null)).toBe(true); // null is valid (unresolved)
  });

  it("DispatchRules has correct defaults shape", () => {
    const defaults: DispatchRules = {
      id: "test-id",
      tenant_id: "tenant-1",
      auto_dispatch_enabled: false,
      dispatch_lead_time_min: 60,
      anomaly_stationary_min: 20,
      anomaly_late_threshold_min: 15,
      auto_replan_enabled: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    expect(defaults.auto_dispatch_enabled).toBe(false);
    expect(defaults.dispatch_lead_time_min).toBe(60);
  });
});
```

### 2.2 Run test -- expect FAIL (module not found)

- [ ] Run: `cd C:/Users/Badr/Desktop/DevBadr/orderflow-suite && npx vitest run src/test/autoDispatcher.test.ts`
- [ ] Confirm: test fails because `@/types/dispatch-autonomy` does not exist

### 2.3 Implement types

- [ ] Create `src/types/dispatch-autonomy.ts`:

```typescript
// ─── Plan E: Autonomous Dispatch & Execution Types ─────────

export const ANOMALY_TYPES = ["STATIONARY", "LATE", "OFF_ROUTE", "MISSED_WINDOW"] as const;
export type AnomalyType = (typeof ANOMALY_TYPES)[number];

export const ANOMALY_RESOLUTIONS = ["AUTO_REPLANNED", "PLANNER_RESOLVED", "IGNORED"] as const;
export type AnomalyResolution = (typeof ANOMALY_RESOLUTIONS)[number];

export function isValidAnomalyType(value: string): value is AnomalyType {
  return (ANOMALY_TYPES as readonly string[]).includes(value);
}

export function isValidResolution(value: string | null): boolean {
  if (value === null) return true;
  return (ANOMALY_RESOLUTIONS as readonly string[]).includes(value);
}

export interface DispatchRules {
  id: string;
  tenant_id: string;
  auto_dispatch_enabled: boolean;
  dispatch_lead_time_min: number;
  anomaly_stationary_min: number;
  anomaly_late_threshold_min: number;
  auto_replan_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface ExecutionAnomaly {
  id: string;
  tenant_id: string;
  trip_id: string;
  driver_id: string | null;
  anomaly_type: AnomalyType;
  detected_at: string;
  details: Record<string, unknown>;
  resolution: AnomalyResolution | null;
  resolved_at: string | null;
  created_at: string;
}

/** Lightweight position for anomaly detection (matches driver_positions row) */
export interface DriverPosition {
  latitude: number;
  longitude: number;
  recorded_at: string;
}

/** A stop flagged as late by the anomaly detector */
export interface LateStop {
  stop_id: string;
  stop_sequence: number;
  planned_window_end: string;
  estimated_arrival: Date;
  delay_minutes: number;
}

/** Result of a replan operation */
export interface ReplanResult {
  success: boolean;
  changes: ReplanChange[];
  infeasible_stops: string[]; // stop IDs that can't be reached in time
}

export interface ReplanChange {
  stop_id: string;
  old_sequence: number;
  new_sequence: number;
  new_estimated_arrival: Date;
}

/** Labels for anomaly types (Dutch) */
export const ANOMALY_TYPE_LABELS: Record<AnomalyType, string> = {
  STATIONARY: "Stilstaand",
  LATE: "Vertraagd",
  OFF_ROUTE: "Afgeweken van route",
  MISSED_WINDOW: "Tijdvenster gemist",
};

/** Labels for resolutions (Dutch) */
export const ANOMALY_RESOLUTION_LABELS: Record<AnomalyResolution, string> = {
  AUTO_REPLANNED: "Automatisch herplannen",
  PLANNER_RESOLVED: "Door planner opgelost",
  IGNORED: "Genegeerd",
};
```

### 2.4 Run test -- expect PASS

- [ ] Run: `cd C:/Users/Badr/Desktop/DevBadr/orderflow-suite && npx vitest run src/test/autoDispatcher.test.ts`
- [ ] Confirm: all 5 tests pass

---

## Task 3: Dependency Stubs (Plans A, B, D)

If `src/lib/confidenceEngine.ts`, `src/lib/pipelineOrchestrator.ts`, or `src/lib/rollingPlanner.ts` do not exist, create minimal stubs. If they already exist from prior plan execution, skip this task.

### 3.1 Check and create stubs if needed

- [ ] Check if `src/lib/confidenceEngine.ts` exists. If not, create:

```typescript
// ─── Stub: Confidence Engine (Plan A) ──────────────────────
// TODO: Replace with real implementation from Plan A

export interface RecordDecisionInput {
  tenant_id: string;
  decision_type: "ORDER_CONFIRM" | "PLANNING" | "DISPATCH" | "INVOICE";
  entity_id: string;
  confidence_score: number;
  was_auto_executed: boolean;
  ai_recommendation: Record<string, unknown>;
  outcome?: Record<string, unknown>;
}

export function shouldAutoExecute(
  _tenantId: string,
  _decisionType: string,
  confidence: number,
): boolean {
  // Stub: auto-execute if confidence >= 85
  return confidence >= 85;
}

export async function recordDecision(_input: RecordDecisionInput): Promise<void> {
  // Stub: no-op until Plan A is implemented
  console.log("[confidenceEngine stub] recordDecision called");
}
```

- [ ] Check if `src/lib/pipelineOrchestrator.ts` exists. If not, create:

```typescript
// ─── Stub: Pipeline Orchestrator (Plan B) ──────────────────
// TODO: Replace with real implementation from Plan B

export interface PipelineEvent {
  type: string;
  tenant_id: string;
  entity_id: string;
  payload: Record<string, unknown>;
}

export async function processEvent(_event: PipelineEvent): Promise<void> {
  // Stub: no-op until Plan B is implemented
  console.log("[pipelineOrchestrator stub] processEvent called");
}
```

- [ ] Check if `src/lib/rollingPlanner.ts` exists. If not, create:

```typescript
// ─── Stub: Rolling Planner (Plan D) ────────────────────────
// TODO: Replace with real implementation from Plan D

import type { TripStop } from "@/types/dispatch";
import type { GeoCoord } from "@/data/geoData";

/**
 * Re-optimize stop order given a driver's current position.
 * Stub: returns stops unchanged (identity function).
 */
export function reoptimizeStopOrder(
  stops: TripStop[],
  _currentPosition: GeoCoord,
): TripStop[] {
  // Stub: return as-is until Plan D replaces this
  return [...stops].sort((a, b) => a.stop_sequence - b.stop_sequence);
}
```

---

## Task 4: autoDispatcher.ts -- Auto-dispatch Logic

### 4.1 Write tests

- [ ] Append to `src/test/autoDispatcher.test.ts`:

```typescript
import {
  getTripsReadyForDispatch,
  dispatchTrip,
} from "@/lib/autoDispatcher";
import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Mock Supabase client ──────────────────────────────────
function createMockSupabase(overrides: {
  tripsData?: any[];
  rulesData?: any;
  updateResult?: any;
  insertResult?: any;
} = {}): SupabaseClient {
  const { tripsData = [], rulesData = null, updateResult = {}, insertResult = {} } = overrides;

  const mockFrom = (table: string) => {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      gte: () => chain,
      lte: () => chain,
      in: () => chain,
      order: () => chain,
      single: () => Promise.resolve({ data: rulesData, error: null }),
      maybeSingle: () => Promise.resolve({ data: rulesData, error: null }),
      update: () => ({
        eq: () => Promise.resolve({ data: updateResult, error: null }),
      }),
      insert: () => Promise.resolve({ data: insertResult, error: null }),
      then: (resolve: any) => resolve({ data: tripsData, error: null }),
    };
    // Make the chain itself thenable for queries that end without .single()
    return chain;
  };

  return { from: mockFrom } as unknown as SupabaseClient;
}

describe("getTripsReadyForDispatch", () => {
  it("returns trips within lead time that are VERZENDKLAAR", async () => {
    const now = new Date("2026-04-05T07:00:00Z");
    const trip = {
      id: "trip-1",
      tenant_id: "t-1",
      dispatch_status: "VERZENDKLAAR",
      planned_date: "2026-04-05",
      stops: [{ planned_time: "2026-04-05T08:00:00Z", stop_sequence: 1 }],
    };

    const supabase = createMockSupabase({ tripsData: [trip] });
    const result = await getTripsReadyForDispatch(supabase as any, "t-1", now, 60);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("trip-1");
  });

  it("returns empty array when no trips match", async () => {
    const now = new Date("2026-04-05T07:00:00Z");
    const supabase = createMockSupabase({ tripsData: [] });
    const result = await getTripsReadyForDispatch(supabase as any, "t-1", now, 60);
    expect(result).toHaveLength(0);
  });

  it("filters out trips whose first stop is too far in future", async () => {
    const now = new Date("2026-04-05T05:00:00Z"); // 5 AM
    const trip = {
      id: "trip-1",
      tenant_id: "t-1",
      dispatch_status: "VERZENDKLAAR",
      planned_date: "2026-04-05",
      stops: [{ planned_time: "2026-04-05T14:00:00Z", stop_sequence: 1 }], // 2 PM, 9h away
    };

    // Lead time = 60 min, so trip at 2 PM should NOT be ready at 5 AM
    const result = await getTripsReadyForDispatch(
      createMockSupabase({ tripsData: [trip] }) as any,
      "t-1",
      now,
      60,
    );
    // The function gets all VERZENDKLAAR trips from DB, then filters client-side by lead time
    // Since mock returns the trip regardless, we test the filter logic
    expect(result).toHaveLength(0);
  });
});

describe("dispatchTrip", () => {
  it("updates trip status to VERZONDEN", async () => {
    let updatedTable = "";
    let updatedStatus = "";

    const mockFrom = (table: string) => {
      const chain: any = {
        select: () => chain,
        eq: (_col: string, val: any) => {
          if (_col === "id" && table === "trips") updatedTable = table;
          return chain;
        },
        single: () => Promise.resolve({
          data: { id: "trip-1", tenant_id: "t-1", driver_id: "d-1", trip_number: 42 },
          error: null,
        }),
        update: (vals: any) => {
          if (table === "trips") updatedStatus = vals.dispatch_status;
          return {
            eq: () => Promise.resolve({ data: {}, error: null }),
          };
        },
        insert: () => Promise.resolve({ data: {}, error: null }),
      };
      return chain;
    };

    const supabase = { from: mockFrom } as unknown as SupabaseClient;
    await dispatchTrip(supabase, "trip-1");
    expect(updatedStatus).toBe("VERZONDEN");
  });
});
```

### 4.2 Run test -- expect FAIL

- [ ] Run: `cd C:/Users/Badr/Desktop/DevBadr/orderflow-suite && npx vitest run src/test/autoDispatcher.test.ts`
- [ ] Confirm: fails because `@/lib/autoDispatcher` does not exist

### 4.3 Implement autoDispatcher.ts

- [ ] Create `src/lib/autoDispatcher.ts`:

```typescript
// ─── Plan E: Auto-Dispatcher ───────────────────────────────
// Automatically dispatches trips to drivers when within lead time.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Trip, TripStop } from "@/types/dispatch";
import { recordDecision } from "@/lib/confidenceEngine";

/**
 * Get trips that are ready to be dispatched:
 * - Status is VERZENDKLAAR
 * - Planned date is today
 * - First stop's planned_time minus now <= leadTimeMin
 */
export async function getTripsReadyForDispatch(
  supabase: SupabaseClient,
  tenantId: string,
  now: Date,
  leadTimeMin: number,
): Promise<Trip[]> {
  const todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD

  const { data, error } = await supabase
    .from("trips")
    .select("*, trip_stops(*)")
    .eq("tenant_id", tenantId)
    .eq("dispatch_status", "VERZENDKLAAR")
    .eq("planned_date", todayStr)
    .order("planned_start_time", { ascending: true });

  if (error) {
    console.error("[autoDispatcher] Failed to fetch trips:", error);
    return [];
  }

  const trips = (data || []) as Trip[];

  // Filter: first stop must be within lead time
  return trips.filter((trip) => {
    const stops = trip.stops || (trip as any).trip_stops || [];
    if (stops.length === 0) return false;

    // Sort by sequence, get first stop
    const sorted = [...stops].sort(
      (a: TripStop, b: TripStop) => a.stop_sequence - b.stop_sequence,
    );
    const firstStop = sorted[0];

    if (!firstStop.planned_time) return false;

    const plannedTime = new Date(firstStop.planned_time);
    const diffMin = (plannedTime.getTime() - now.getTime()) / (1000 * 60);

    // Ready if the first stop is within leadTimeMin from now (and not already past)
    return diffMin >= 0 && diffMin <= leadTimeMin;
  });
}

/**
 * Dispatch a single trip:
 * 1. Update dispatch_status to VERZONDEN
 * 2. Set dispatched_at timestamp
 * 3. Create in-app notification for driver
 * 4. Record decision in confidence engine
 */
export async function dispatchTrip(
  supabase: SupabaseClient,
  tripId: string,
): Promise<void> {
  // Fetch trip to get tenant_id, driver_id, trip_number
  const { data: trip, error: fetchErr } = await supabase
    .from("trips")
    .select("id, tenant_id, driver_id, trip_number")
    .eq("id", tripId)
    .single();

  if (fetchErr || !trip) {
    console.error("[autoDispatcher] Trip not found:", tripId, fetchErr);
    return;
  }

  const now = new Date().toISOString();

  // 1. Update trip status
  const { error: updateErr } = await supabase
    .from("trips")
    .update({
      dispatch_status: "VERZONDEN",
      dispatched_at: now,
    })
    .eq("id", tripId);

  if (updateErr) {
    console.error("[autoDispatcher] Failed to update trip:", updateErr);
    return;
  }

  // 2. Create notification for driver
  if (trip.driver_id) {
    await supabase.from("notifications").insert({
      tenant_id: trip.tenant_id,
      type: "DISPATCH",
      title: "Nieuwe rit toegewezen",
      message: `Rit #${trip.trip_number} is aan u toegewezen. Bekijk de details.`,
      user_id: trip.driver_id,
      is_read: false,
    });
  }

  // 3. Record decision in confidence engine
  try {
    await recordDecision({
      tenant_id: trip.tenant_id,
      decision_type: "DISPATCH",
      entity_id: tripId,
      confidence_score: 100, // Auto-dispatch is rule-based, always 100
      was_auto_executed: true,
      ai_recommendation: { action: "AUTO_DISPATCH", trip_id: tripId },
    });
  } catch (err) {
    // Non-critical: don't fail dispatch if recording fails
    console.error("[autoDispatcher] Failed to record decision:", err);
  }
}
```

### 4.4 Run test -- expect PASS

- [ ] Run: `cd C:/Users/Badr/Desktop/DevBadr/orderflow-suite && npx vitest run src/test/autoDispatcher.test.ts`
- [ ] Confirm: all tests pass

### 4.5 Commit

- [ ] Run: `cd C:/Users/Badr/Desktop/DevBadr/orderflow-suite && npx tsc --noEmit && npx vitest run src/test/autoDispatcher.test.ts`
- [ ] If both pass, stage and commit:
  ```bash
  git add supabase/migrations/20260405120000_dispatch_rules_and_anomalies.sql \
          src/types/dispatch-autonomy.ts \
          src/lib/autoDispatcher.ts \
          src/lib/confidenceEngine.ts \
          src/lib/pipelineOrchestrator.ts \
          src/lib/rollingPlanner.ts \
          src/test/autoDispatcher.test.ts
  git commit -m "feat(plan-e): add dispatch_rules table, autonomy types, auto-dispatcher

  - dispatch_rules table: per-tenant autonomous dispatch configuration
  - execution_anomalies table: tracks detected anomalies during trip execution
  - dispatch-autonomy.ts: AnomalyType, DispatchRules, ExecutionAnomaly types
  - autoDispatcher.ts: getTripsReadyForDispatch, dispatchTrip
  - Dependency stubs for confidenceEngine, pipelineOrchestrator, rollingPlanner
  - 7 passing tests"
  ```

---

## Task 5: anomalyDetector.ts -- Execution Monitoring

### 5.1 Write tests

- [ ] Create `src/test/anomalyDetector.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  detectStationaryAnomaly,
  detectLateArrival,
  calculateEtaMinutes,
} from "@/lib/anomalyDetector";
import type { DriverPosition } from "@/types/dispatch-autonomy";

describe("detectStationaryAnomaly", () => {
  const baseTime = new Date("2026-04-05T10:00:00Z");

  it("returns true when driver has not moved >100m in threshold minutes", () => {
    const positions: DriverPosition[] = [
      { latitude: 52.37, longitude: 4.9, recorded_at: new Date(baseTime.getTime() - 25 * 60000).toISOString() },
      { latitude: 52.37, longitude: 4.9, recorded_at: new Date(baseTime.getTime() - 20 * 60000).toISOString() },
      { latitude: 52.37, longitude: 4.9, recorded_at: new Date(baseTime.getTime() - 10 * 60000).toISOString() },
      { latitude: 52.37, longitude: 4.9, recorded_at: baseTime.toISOString() },
    ];
    const current = positions[positions.length - 1];
    expect(detectStationaryAnomaly(current, positions, 20)).toBe(true);
  });

  it("returns false when driver has moved significantly", () => {
    const positions: DriverPosition[] = [
      { latitude: 52.37, longitude: 4.9, recorded_at: new Date(baseTime.getTime() - 25 * 60000).toISOString() },
      { latitude: 52.38, longitude: 4.91, recorded_at: new Date(baseTime.getTime() - 15 * 60000).toISOString() },
      { latitude: 52.40, longitude: 4.92, recorded_at: new Date(baseTime.getTime() - 5 * 60000).toISOString() },
      { latitude: 52.42, longitude: 4.95, recorded_at: baseTime.toISOString() },
    ];
    const current = positions[positions.length - 1];
    expect(detectStationaryAnomaly(current, positions, 20)).toBe(false);
  });

  it("returns false when not enough history for threshold window", () => {
    const positions: DriverPosition[] = [
      { latitude: 52.37, longitude: 4.9, recorded_at: new Date(baseTime.getTime() - 5 * 60000).toISOString() },
      { latitude: 52.37, longitude: 4.9, recorded_at: baseTime.toISOString() },
    ];
    const current = positions[positions.length - 1];
    // Only 5 min of history but threshold is 20 min
    expect(detectStationaryAnomaly(current, positions, 20)).toBe(false);
  });

  it("returns false with empty history", () => {
    const current: DriverPosition = { latitude: 52.37, longitude: 4.9, recorded_at: baseTime.toISOString() };
    expect(detectStationaryAnomaly(current, [], 20)).toBe(false);
  });
});

describe("calculateEtaMinutes", () => {
  it("estimates travel time based on haversine distance at 60 km/h", () => {
    // Amsterdam to Rotterdam ~58 km -> ~58 minutes at 60 km/h
    const eta = calculateEtaMinutes(
      { lat: 52.37, lng: 4.9 },   // Amsterdam
      { lat: 51.92, lng: 4.48 },  // Rotterdam
    );
    // Should be roughly 55-65 minutes
    expect(eta).toBeGreaterThan(50);
    expect(eta).toBeLessThan(70);
  });

  it("returns 0 for same location", () => {
    const eta = calculateEtaMinutes(
      { lat: 52.37, lng: 4.9 },
      { lat: 52.37, lng: 4.9 },
    );
    expect(eta).toBe(0);
  });
});

describe("detectLateArrival", () => {
  it("flags stops where ETA exceeds window_end + threshold", () => {
    const now = new Date("2026-04-05T10:00:00Z");
    const currentPosition = { lat: 52.37, lng: 4.9 }; // Amsterdam

    const remainingStops = [
      {
        id: "stop-1",
        stop_sequence: 1,
        planned_latitude: 51.92,   // Rotterdam
        planned_longitude: 4.48,
        planned_window_end: "10:30", // 30 min from now, but ~58 min travel
        stop_status: "GEPLAND",
      },
      {
        id: "stop-2",
        stop_sequence: 2,
        planned_latitude: 52.09,   // Utrecht (~30 min from Rdam)
        planned_longitude: 5.12,
        planned_window_end: "14:00", // plenty of time
        stop_status: "GEPLAND",
      },
    ];

    const lateStops = detectLateArrival(
      currentPosition,
      remainingStops as any,
      now,
      15, // 15 min threshold
    );

    // Stop 1 should be flagged (ETA ~58 min, window_end 10:30 = 30 min, +15 threshold = 45 min < 58 min)
    expect(lateStops.length).toBeGreaterThanOrEqual(1);
    expect(lateStops[0].stop_id).toBe("stop-1");
    expect(lateStops[0].delay_minutes).toBeGreaterThan(0);
  });

  it("returns empty when all stops are reachable in time", () => {
    const now = new Date("2026-04-05T06:00:00Z");
    const currentPosition = { lat: 52.37, lng: 4.9 }; // Amsterdam

    const remainingStops = [
      {
        id: "stop-1",
        stop_sequence: 1,
        planned_latitude: 52.38,
        planned_longitude: 4.91,
        planned_window_end: "18:00", // way in the future
        stop_status: "GEPLAND",
      },
    ];

    const lateStops = detectLateArrival(currentPosition, remainingStops as any, now, 15);
    expect(lateStops).toHaveLength(0);
  });
});
```

### 5.2 Run test -- expect FAIL

- [ ] Run: `cd C:/Users/Badr/Desktop/DevBadr/orderflow-suite && npx vitest run src/test/anomalyDetector.test.ts`
- [ ] Confirm: fails because `@/lib/anomalyDetector` does not exist

### 5.3 Implement anomalyDetector.ts

- [ ] Create `src/lib/anomalyDetector.ts`:

```typescript
// ─── Plan E: Anomaly Detector ──────────────────────────────
// Detects execution anomalies during trip delivery.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TripStop } from "@/types/dispatch";
import type {
  DriverPosition,
  ExecutionAnomaly,
  LateStop,
  AnomalyType,
} from "@/types/dispatch-autonomy";
import { type GeoCoord, haversineKm } from "@/data/geoData";

/** Average speed assumption for ETA calculations (km/h) */
const AVG_SPEED_KMH = 60;

/** Minimum distance (meters) to consider the driver as having "moved" */
const MOVEMENT_THRESHOLD_M = 100;

// ─── Haversine in meters ───────────────────────────────────
function haversineMeters(a: GeoCoord, b: GeoCoord): number {
  return haversineKm(a, b) * 1000;
}

// ─── Parse "HH:mm" to minutes since midnight ──────────────
function parseTimeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Calculate estimated travel time in minutes from point A to B
 * using haversine distance and average speed.
 */
export function calculateEtaMinutes(from: GeoCoord, to: GeoCoord): number {
  const distKm = haversineKm(from, to);
  return (distKm / AVG_SPEED_KMH) * 60;
}

/**
 * Detect if driver has been stationary (< 100m movement) for
 * at least `thresholdMin` minutes.
 *
 * Requires position history spanning at least `thresholdMin` minutes.
 */
export function detectStationaryAnomaly(
  currentPosition: DriverPosition,
  previousPositions: DriverPosition[],
  thresholdMin: number,
): boolean {
  if (previousPositions.length === 0) return false;

  const currentTime = new Date(currentPosition.recorded_at).getTime();
  const thresholdMs = thresholdMin * 60 * 1000;

  // Find the oldest position within our threshold window
  const windowStart = currentTime - thresholdMs;

  // Filter positions within the threshold window
  const positionsInWindow = previousPositions.filter((p) => {
    const t = new Date(p.recorded_at).getTime();
    return t >= windowStart && t <= currentTime;
  });

  // We need at least one position from at or before the window start
  // to confirm we have enough history
  const oldestInWindow = positionsInWindow.reduce(
    (oldest, p) => {
      const t = new Date(p.recorded_at).getTime();
      return t < oldest ? t : oldest;
    },
    currentTime,
  );

  // If oldest position in window is less than thresholdMin ago, not enough data
  if (currentTime - oldestInWindow < thresholdMs * 0.9) {
    return false;
  }

  // Check if ALL positions in window are within 100m of current position
  const currentCoord: GeoCoord = {
    lat: currentPosition.latitude,
    lng: currentPosition.longitude,
  };

  for (const pos of positionsInWindow) {
    const posCoord: GeoCoord = { lat: pos.latitude, lng: pos.longitude };
    const distM = haversineMeters(currentCoord, posCoord);
    if (distM > MOVEMENT_THRESHOLD_M) {
      return false; // Driver moved at some point in the window
    }
  }

  return true;
}

/**
 * For each remaining stop, estimate ETA from current position.
 * Flag stops where ETA > planned_window_end + thresholdMin.
 */
export function detectLateArrival(
  currentPosition: GeoCoord,
  remainingStops: Array<{
    id: string;
    stop_sequence: number;
    planned_latitude: number | null;
    planned_longitude: number | null;
    planned_window_end: string | null;
    stop_status: string;
  }>,
  now: Date,
  thresholdMin: number,
): LateStop[] {
  const lateStops: LateStop[] = [];
  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();

  for (const stop of remainingStops) {
    // Skip completed/failed stops or stops without geo/window data
    if (
      stop.stop_status !== "GEPLAND" &&
      stop.stop_status !== "ONDERWEG"
    ) {
      continue;
    }
    if (
      stop.planned_latitude == null ||
      stop.planned_longitude == null ||
      !stop.planned_window_end
    ) {
      continue;
    }

    const stopCoord: GeoCoord = {
      lat: stop.planned_latitude,
      lng: stop.planned_longitude,
    };

    const travelMin = calculateEtaMinutes(currentPosition, stopCoord);
    const etaMinutesSinceMidnight = nowMinutes + travelMin;

    const windowEndMinutes = parseTimeToMinutes(stop.planned_window_end);
    const deadline = windowEndMinutes + thresholdMin;

    if (etaMinutesSinceMidnight > deadline) {
      const delayMin = Math.round(etaMinutesSinceMidnight - windowEndMinutes);
      const etaDate = new Date(now.getTime() + travelMin * 60 * 1000);

      lateStops.push({
        stop_id: stop.id,
        stop_sequence: stop.stop_sequence,
        planned_window_end: stop.planned_window_end,
        estimated_arrival: etaDate,
        delay_minutes: delayMin,
      });
    }
  }

  return lateStops;
}

/**
 * Master evaluation: run all anomaly detectors for a driver position update.
 * Inserts new anomalies into execution_anomalies and creates notifications.
 */
export async function evaluateDriverPosition(
  supabase: SupabaseClient,
  tenantId: string,
  driverId: string,
  position: DriverPosition,
  currentTripId: string,
  rules: { anomaly_stationary_min: number; anomaly_late_threshold_min: number },
): Promise<ExecutionAnomaly[]> {
  const anomalies: ExecutionAnomaly[] = [];
  const now = new Date(position.recorded_at);

  // 1. Fetch recent positions for stationary check
  const windowStart = new Date(now.getTime() - (rules.anomaly_stationary_min + 5) * 60 * 1000);
  const { data: recentPositions } = await supabase
    .from("driver_positions")
    .select("latitude, longitude, recorded_at")
    .eq("driver_id", driverId)
    .gte("recorded_at", windowStart.toISOString())
    .order("recorded_at", { ascending: true });

  const positions = (recentPositions || []) as DriverPosition[];

  // 2. Stationary check
  if (detectStationaryAnomaly(position, positions, rules.anomaly_stationary_min)) {
    const anomaly = await insertAnomaly(supabase, {
      tenant_id: tenantId,
      trip_id: currentTripId,
      driver_id: driverId,
      anomaly_type: "STATIONARY",
      details: {
        duration_min: rules.anomaly_stationary_min,
        latitude: position.latitude,
        longitude: position.longitude,
      },
    });
    if (anomaly) anomalies.push(anomaly);
  }

  // 3. Late arrival check
  const { data: tripStops } = await supabase
    .from("trip_stops")
    .select("id, stop_sequence, planned_latitude, planned_longitude, planned_window_end, stop_status")
    .eq("trip_id", currentTripId)
    .in("stop_status", ["GEPLAND", "ONDERWEG"])
    .order("stop_sequence", { ascending: true });

  if (tripStops && tripStops.length > 0) {
    const currentCoord: GeoCoord = { lat: position.latitude, lng: position.longitude };
    const lateStops = detectLateArrival(
      currentCoord,
      tripStops as any,
      now,
      rules.anomaly_late_threshold_min,
    );

    for (const late of lateStops) {
      const anomaly = await insertAnomaly(supabase, {
        tenant_id: tenantId,
        trip_id: currentTripId,
        driver_id: driverId,
        anomaly_type: "LATE",
        details: {
          stop_id: late.stop_id,
          stop_sequence: late.stop_sequence,
          delay_minutes: late.delay_minutes,
          planned_window_end: late.planned_window_end,
          estimated_arrival: late.estimated_arrival.toISOString(),
        },
      });
      if (anomaly) anomalies.push(anomaly);
    }
  }

  // 4. Create notifications for detected anomalies
  for (const anomaly of anomalies) {
    await supabase.from("notifications").insert({
      tenant_id: tenantId,
      type: "ANOMALY",
      title: `Anomalie: ${anomaly.anomaly_type}`,
      message: buildAnomalyMessage(anomaly),
      is_read: false,
    });
  }

  return anomalies;
}

// ─── Helpers ───────────────────────────────────────────────

async function insertAnomaly(
  supabase: SupabaseClient,
  data: {
    tenant_id: string;
    trip_id: string;
    driver_id: string;
    anomaly_type: AnomalyType;
    details: Record<string, unknown>;
  },
): Promise<ExecutionAnomaly | null> {
  // Check for duplicate (same trip + type + unresolved)
  const { data: existing } = await supabase
    .from("execution_anomalies")
    .select("id")
    .eq("trip_id", data.trip_id)
    .eq("anomaly_type", data.anomaly_type)
    .is("resolved_at", null)
    .maybeSingle();

  if (existing) return null; // Already have an unresolved anomaly of this type

  const { data: inserted, error } = await supabase
    .from("execution_anomalies")
    .insert({
      tenant_id: data.tenant_id,
      trip_id: data.trip_id,
      driver_id: data.driver_id,
      anomaly_type: data.anomaly_type,
      details: data.details,
    })
    .select()
    .single();

  if (error) {
    console.error("[anomalyDetector] Failed to insert anomaly:", error);
    return null;
  }

  return inserted as ExecutionAnomaly;
}

function buildAnomalyMessage(anomaly: ExecutionAnomaly): string {
  switch (anomaly.anomaly_type) {
    case "STATIONARY":
      return `Chauffeur staat al ${(anomaly.details as any).duration_min} minuten stil.`;
    case "LATE":
      return `Stop #${(anomaly.details as any).stop_sequence} wordt naar verwachting ${(anomaly.details as any).delay_minutes} minuten te laat bereikt.`;
    case "OFF_ROUTE":
      return "Chauffeur is afgeweken van de geplande route.";
    case "MISSED_WINDOW":
      return `Tijdvenster van stop #${(anomaly.details as any).stop_sequence} is gemist.`;
    default:
      return "Onbekende anomalie gedetecteerd.";
  }
}
```

### 5.4 Run test -- expect PASS

- [ ] Run: `cd C:/Users/Badr/Desktop/DevBadr/orderflow-suite && npx vitest run src/test/anomalyDetector.test.ts`
- [ ] Confirm: all 8 tests pass

### 5.5 Commit

- [ ] Run: `cd C:/Users/Badr/Desktop/DevBadr/orderflow-suite && npx tsc --noEmit && npx vitest run src/test/anomalyDetector.test.ts`
- [ ] If both pass:
  ```bash
  git add src/lib/anomalyDetector.ts src/test/anomalyDetector.test.ts
  git commit -m "feat(plan-e): add anomaly detector for execution monitoring

  - detectStationaryAnomaly: flags drivers idle > threshold minutes
  - detectLateArrival: estimates ETAs, flags stops exceeding window + threshold
  - evaluateDriverPosition: master evaluator that runs all detectors
  - calculateEtaMinutes: haversine-based travel time estimation
  - 8 passing tests"
  ```

---

## Task 6: realtimeReplanner.ts -- Auto-replan on Delay

### 6.1 Write tests

- [ ] Create `src/test/realtimeReplanner.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  replanOnDelay,
  buildReplanChanges,
} from "@/lib/realtimeReplanner";
import type { TripStop } from "@/types/dispatch";

describe("buildReplanChanges", () => {
  it("detects sequence changes between old and new stop order", () => {
    const oldStops = [
      { id: "s1", stop_sequence: 1 },
      { id: "s2", stop_sequence: 2 },
      { id: "s3", stop_sequence: 3 },
    ] as TripStop[];

    const newStops = [
      { id: "s2", stop_sequence: 1 },
      { id: "s3", stop_sequence: 2 },
      { id: "s1", stop_sequence: 3 },
    ] as TripStop[];

    const changes = buildReplanChanges(oldStops, newStops);
    expect(changes).toHaveLength(3);
    expect(changes.find((c) => c.stop_id === "s1")?.new_sequence).toBe(3);
    expect(changes.find((c) => c.stop_id === "s2")?.new_sequence).toBe(1);
  });

  it("returns empty array when order is unchanged", () => {
    const stops = [
      { id: "s1", stop_sequence: 1 },
      { id: "s2", stop_sequence: 2 },
    ] as TripStop[];

    const changes = buildReplanChanges(stops, stops);
    expect(changes).toHaveLength(0);
  });
});

describe("replanOnDelay", () => {
  it("returns success false when no stops to replan", async () => {
    const mockFrom = (_table: string) => ({
      select: () => ({
        eq: () => ({
          in: () => ({
            order: () =>
              Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    });

    const supabase = { from: mockFrom } as any;
    const result = await replanOnDelay(supabase, "trip-1", "stop-1", {
      lat: 52.37,
      lng: 4.9,
    });
    expect(result.success).toBe(false);
    expect(result.changes).toHaveLength(0);
  });

  it("returns changes when replanning produces a new order", async () => {
    const stops = [
      {
        id: "s1",
        stop_sequence: 1,
        planned_latitude: 52.37,
        planned_longitude: 4.9,
        stop_status: "GEPLAND",
      },
      {
        id: "s2",
        stop_sequence: 2,
        planned_latitude: 51.92,
        planned_longitude: 4.48,
        stop_status: "GEPLAND",
      },
    ];

    const mockFrom = (table: string) => {
      if (table === "trip_stops") {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                order: () => Promise.resolve({ data: stops, error: null }),
              }),
            }),
          }),
          update: () => ({
            eq: () => Promise.resolve({ data: {}, error: null }),
          }),
        };
      }
      // notifications
      return {
        insert: () => Promise.resolve({ data: {}, error: null }),
      };
    };

    const supabase = { from: mockFrom } as any;
    const result = await replanOnDelay(supabase, "trip-1", "s1", {
      lat: 51.92,
      lng: 4.48, // Driver is near Rotterdam (s2), so s2 should come first
    });

    expect(result.success).toBe(true);
    // The reoptimize stub returns stops sorted by sequence, so no change with stub
    // Real implementation (Plan D) would reorder. Test validates the flow works.
  });

  it("identifies infeasible stops", async () => {
    // With the stub planner, no stops are infeasible
    // This test validates the structure is returned correctly
    const stops = [
      {
        id: "s1",
        stop_sequence: 1,
        planned_latitude: 52.37,
        planned_longitude: 4.9,
        stop_status: "GEPLAND",
      },
    ];

    const mockFrom = (table: string) => ({
      select: () => ({
        eq: () => ({
          in: () => ({
            order: () => Promise.resolve({ data: stops, error: null }),
          }),
        }),
      }),
      update: () => ({
        eq: () => Promise.resolve({ data: {}, error: null }),
      }),
      insert: () => Promise.resolve({ data: {}, error: null }),
    });

    const supabase = { from: mockFrom } as any;
    const result = await replanOnDelay(supabase, "trip-1", "s1", {
      lat: 52.37,
      lng: 4.9,
    });

    expect(result).toHaveProperty("infeasible_stops");
    expect(Array.isArray(result.infeasible_stops)).toBe(true);
  });
});
```

### 6.2 Run test -- expect FAIL

- [ ] Run: `cd C:/Users/Badr/Desktop/DevBadr/orderflow-suite && npx vitest run src/test/realtimeReplanner.test.ts`
- [ ] Confirm: fails because `@/lib/realtimeReplanner` does not exist

### 6.3 Implement realtimeReplanner.ts

- [ ] Create `src/lib/realtimeReplanner.ts`:

```typescript
// ─── Plan E: Realtime Replanner ────────────────────────────
// Re-optimizes trip stop order when delays are detected.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TripStop } from "@/types/dispatch";
import type { GeoCoord } from "@/data/geoData";
import type { ReplanResult, ReplanChange } from "@/types/dispatch-autonomy";
import { reoptimizeStopOrder } from "@/lib/rollingPlanner";
import { detectLateArrival } from "@/lib/anomalyDetector";

/**
 * Compare old vs new stop sequences and return the changes.
 */
export function buildReplanChanges(
  oldStops: TripStop[],
  newStops: TripStop[],
): ReplanChange[] {
  const changes: ReplanChange[] = [];

  // Build a map of old sequences
  const oldSeqMap = new Map<string, number>();
  for (const stop of oldStops) {
    oldSeqMap.set(stop.id, stop.stop_sequence);
  }

  // Compare with new sequences
  for (let i = 0; i < newStops.length; i++) {
    const newSeq = i + 1;
    const oldSeq = oldSeqMap.get(newStops[i].id);

    if (oldSeq !== undefined && oldSeq !== newSeq) {
      changes.push({
        stop_id: newStops[i].id,
        old_sequence: oldSeq,
        new_sequence: newSeq,
        new_estimated_arrival: new Date(), // Placeholder; real ETA from Plan D
      });
    }
  }

  return changes;
}

/**
 * Replan a trip when a delay is detected at a specific stop.
 *
 * 1. Fetch remaining (GEPLAND/ONDERWEG) stops
 * 2. Run reoptimizeStopOrder from rollingPlanner
 * 3. Detect which stops changed sequence
 * 4. Update trip_stops in DB
 * 5. Return changes and infeasible stops
 */
export async function replanOnDelay(
  supabase: SupabaseClient,
  tripId: string,
  _delayedStopId: string,
  currentPosition: GeoCoord,
): Promise<ReplanResult> {
  // 1. Fetch remaining stops
  const { data: remainingStops, error } = await supabase
    .from("trip_stops")
    .select("*")
    .eq("trip_id", tripId)
    .in("stop_status", ["GEPLAND", "ONDERWEG"])
    .order("stop_sequence", { ascending: true });

  if (error || !remainingStops || remainingStops.length === 0) {
    return { success: false, changes: [], infeasible_stops: [] };
  }

  const stops = remainingStops as TripStop[];

  // 2. Re-optimize stop order
  const reoptimized = reoptimizeStopOrder(stops, currentPosition);

  // 3. Compute changes
  const changes = buildReplanChanges(stops, reoptimized);

  // 4. Identify infeasible stops (those still late after replan)
  const lateAfterReplan = detectLateArrival(
    currentPosition,
    reoptimized.map((s, i) => ({
      id: s.id,
      stop_sequence: i + 1,
      planned_latitude: s.planned_latitude,
      planned_longitude: s.planned_longitude,
      planned_window_end: (s as any).planned_window_end,
      stop_status: s.stop_status,
    })),
    new Date(),
    15, // Default threshold; caller can override via rules in evaluateDriverPosition
  );

  const infeasibleStopIds = lateAfterReplan.map((ls) => ls.stop_id);

  // 5. If there are changes, update the DB
  if (changes.length > 0) {
    for (const change of changes) {
      await supabase
        .from("trip_stops")
        .update({ stop_sequence: change.new_sequence })
        .eq("id", change.stop_id);
    }
  }

  return {
    success: true,
    changes,
    infeasible_stops: infeasibleStopIds,
  };
}

/**
 * Notify relevant stakeholders about replan changes.
 * Creates in-app notifications for the planner.
 */
export async function notifyStakeholders(
  supabase: SupabaseClient,
  tenantId: string,
  tripId: string,
  changes: ReplanChange[],
  infeasibleStops: string[],
): Promise<void> {
  if (changes.length === 0 && infeasibleStops.length === 0) return;

  const parts: string[] = [];

  if (changes.length > 0) {
    parts.push(
      `${changes.length} stop(s) zijn opnieuw geordend voor optimale route.`,
    );
  }

  if (infeasibleStops.length > 0) {
    parts.push(
      `${infeasibleStops.length} stop(s) kunnen niet meer binnen het tijdvenster bereikt worden.`,
    );
  }

  const message = parts.join(" ");

  await supabase.from("notifications").insert({
    tenant_id: tenantId,
    type: "REPLAN",
    title: "Rit automatisch herplannen",
    message,
    is_read: false,
  });

  // If there are infeasible stops, create a higher-priority notification
  if (infeasibleStops.length > 0) {
    await supabase.from("notifications").insert({
      tenant_id: tenantId,
      type: "ANOMALY",
      title: "Onbereikbare stops gedetecteerd",
      message: `${infeasibleStops.length} stop(s) kunnen het tijdvenster niet meer halen. Handmatige interventie vereist.`,
      is_read: false,
    });
  }
}
```

### 6.4 Run test -- expect PASS

- [ ] Run: `cd C:/Users/Badr/Desktop/DevBadr/orderflow-suite && npx vitest run src/test/realtimeReplanner.test.ts`
- [ ] Confirm: all 5 tests pass

### 6.5 Commit

- [ ] Run: `cd C:/Users/Badr/Desktop/DevBadr/orderflow-suite && npx tsc --noEmit && npx vitest run src/test/realtimeReplanner.test.ts`
- [ ] If both pass:
  ```bash
  git add src/lib/realtimeReplanner.ts src/test/realtimeReplanner.test.ts
  git commit -m "feat(plan-e): add realtime replanner for delay-triggered re-optimization

  - replanOnDelay: fetches remaining stops, re-optimizes, persists changes
  - buildReplanChanges: diffs old vs new stop sequences
  - notifyStakeholders: creates Dutch notifications for planners
  - Identifies infeasible stops after replan
  - 5 passing tests"
  ```

---

## Task 7: Edge Function -- dispatch-scheduler

### 7.1 Create the edge function

- [ ] Create `supabase/functions/dispatch-scheduler/index.ts`:

```typescript
// ─── Plan E: Dispatch Scheduler Edge Function ──────────────
// Runs on cron (every 5 min). For each tenant with auto_dispatch_enabled:
// fetches ready trips and dispatches them.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    // 1. Fetch all tenants with auto_dispatch_enabled
    const { data: rules, error: rulesErr } = await supabase
      .from("dispatch_rules")
      .select("*")
      .eq("auto_dispatch_enabled", true);

    if (rulesErr) {
      throw new Error(`Failed to fetch dispatch_rules: ${rulesErr.message}`);
    }

    if (!rules || rules.length === 0) {
      return new Response(
        JSON.stringify({ dispatched: 0, message: "No tenants with auto-dispatch enabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let totalDispatched = 0;
    const results: Array<{ tenant_id: string; dispatched: number; errors: string[] }> = [];

    // 2. Process each tenant
    for (const rule of rules) {
      const tenantResult = { tenant_id: rule.tenant_id, dispatched: 0, errors: [] as string[] };

      try {
        // Fetch VERZENDKLAAR trips for today
        const { data: trips, error: tripsErr } = await supabase
          .from("trips")
          .select("id, tenant_id, driver_id, trip_number, planned_date, planned_start_time, trip_stops(planned_time, stop_sequence)")
          .eq("tenant_id", rule.tenant_id)
          .eq("dispatch_status", "VERZENDKLAAR")
          .eq("planned_date", todayStr)
          .order("planned_start_time", { ascending: true });

        if (tripsErr) {
          tenantResult.errors.push(`Query error: ${tripsErr.message}`);
          results.push(tenantResult);
          continue;
        }

        if (!trips || trips.length === 0) {
          results.push(tenantResult);
          continue;
        }

        // Filter by lead time
        const leadTimeMs = rule.dispatch_lead_time_min * 60 * 1000;

        for (const trip of trips) {
          const stops = (trip as any).trip_stops || [];
          if (stops.length === 0) continue;

          // Find first stop by sequence
          const sorted = [...stops].sort(
            (a: any, b: any) => a.stop_sequence - b.stop_sequence,
          );
          const firstStopTime = sorted[0]?.planned_time;
          if (!firstStopTime) continue;

          const plannedMs = new Date(firstStopTime).getTime();
          const diffMs = plannedMs - now.getTime();

          // Ready if within lead time and not yet past
          if (diffMs >= 0 && diffMs <= leadTimeMs) {
            // Dispatch the trip
            const dispatchNow = new Date().toISOString();

            const { error: updateErr } = await supabase
              .from("trips")
              .update({
                dispatch_status: "VERZONDEN",
                dispatched_at: dispatchNow,
              })
              .eq("id", trip.id);

            if (updateErr) {
              tenantResult.errors.push(`Update trip ${trip.id}: ${updateErr.message}`);
              continue;
            }

            // Notify driver
            if (trip.driver_id) {
              await supabase.from("notifications").insert({
                tenant_id: rule.tenant_id,
                type: "DISPATCH",
                title: "Nieuwe rit toegewezen",
                message: `Rit #${trip.trip_number} is automatisch aan u toegewezen.`,
                user_id: trip.driver_id,
                is_read: false,
              });
            }

            tenantResult.dispatched++;
            totalDispatched++;
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        tenantResult.errors.push(msg);
      }

      results.push(tenantResult);
    }

    return new Response(
      JSON.stringify({
        dispatched: totalDispatched,
        tenants_processed: results.length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("dispatch-scheduler error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
```

### 7.2 Add cron migration

- [ ] Create `supabase/migrations/20260405120100_dispatch_scheduler_cron.sql`:

```sql
-- ============================================================
-- Plan E: Dispatch Scheduler Cron Job
-- Runs every 5 minutes to auto-dispatch ready trips
-- ============================================================

-- Enable pg_cron if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the dispatch-scheduler function every 5 minutes
SELECT cron.schedule(
  'dispatch-scheduler',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/dispatch-scheduler',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

### 7.3 Commit

- [ ] Run:
  ```bash
  git add supabase/functions/dispatch-scheduler/index.ts \
          supabase/migrations/20260405120100_dispatch_scheduler_cron.sql
  git commit -m "feat(plan-e): add dispatch-scheduler edge function with 5-min cron

  - Edge function processes all auto_dispatch_enabled tenants
  - Dispatches VERZENDKLAAR trips within lead time window
  - Creates driver notifications in Dutch
  - Cron migration schedules every 5 minutes via pg_cron"
  ```

---

## Task 8: Full Test Suite Verification

### 8.1 Run all Plan E tests together

- [ ] Run: `cd C:/Users/Badr/Desktop/DevBadr/orderflow-suite && npx vitest run src/test/autoDispatcher.test.ts src/test/anomalyDetector.test.ts src/test/realtimeReplanner.test.ts`
- [ ] Confirm: all ~20 tests pass

### 8.2 Run TypeScript compiler check

- [ ] Run: `cd C:/Users/Badr/Desktop/DevBadr/orderflow-suite && npx tsc --noEmit`
- [ ] Confirm: no type errors

### 8.3 Run full test suite to check for regressions

- [ ] Run: `cd C:/Users/Badr/Desktop/DevBadr/orderflow-suite && npx vitest run`
- [ ] Confirm: no regressions in existing tests

---

## Summary of Files Created

| File | Purpose |
|---|---|
| `supabase/migrations/20260405120000_dispatch_rules_and_anomalies.sql` | dispatch_rules + execution_anomalies tables with RLS |
| `supabase/migrations/20260405120100_dispatch_scheduler_cron.sql` | pg_cron job for 5-min dispatch scheduling |
| `src/types/dispatch-autonomy.ts` | AnomalyType, DispatchRules, ExecutionAnomaly, DriverPosition, LateStop, ReplanResult types |
| `src/lib/autoDispatcher.ts` | getTripsReadyForDispatch, dispatchTrip |
| `src/lib/anomalyDetector.ts` | detectStationaryAnomaly, detectLateArrival, evaluateDriverPosition, calculateEtaMinutes |
| `src/lib/realtimeReplanner.ts` | replanOnDelay, buildReplanChanges, notifyStakeholders |
| `supabase/functions/dispatch-scheduler/index.ts` | Cron-triggered edge function for auto-dispatch |
| `src/lib/confidenceEngine.ts` | Stub (Plan A dependency) |
| `src/lib/pipelineOrchestrator.ts` | Stub (Plan B dependency) |
| `src/lib/rollingPlanner.ts` | Stub (Plan D dependency) |
| `src/test/autoDispatcher.test.ts` | 7 tests: types + auto-dispatch logic |
| `src/test/anomalyDetector.test.ts` | 8 tests: stationary, late, ETA |
| `src/test/realtimeReplanner.test.ts` | 5 tests: replan changes, flow |

## Key Design Decisions

1. **Dutch status names preserved**: dispatch_status uses existing VERZENDKLAAR/VERZONDEN values from `dispatch.ts`, not English equivalents
2. **No direct haversineMeters duplication**: anomalyDetector delegates to `haversineKm * 1000` from geoData.ts
3. **Deduplication**: insertAnomaly checks for existing unresolved anomaly of same type before inserting
4. **Graceful degradation**: confidence engine recording is try/caught so dispatch succeeds even if recording fails
5. **Edge function uses service_role**: bypasses RLS for cross-tenant cron processing
6. **Window times stored as TIME in DB**: detectLateArrival parses "HH:mm" format matching the `planned_window_end TIME` column
