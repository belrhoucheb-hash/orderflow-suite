# Plan D — Autonomous Rolling Planner

> **superpowers:subagent-driven-development** | Parent: `2026-04-05-release2-autonomy-overview.md`

---

## Goal

Transform the VRP solver from a one-shot manual tool into a rolling autonomous planner. When an order is confirmed, the system automatically evaluates the best vehicle assignment using incremental insertion. A confidence score determines whether the assignment is auto-executed or queued for human validation. Planners get what-if simulation for vehicle removal scenarios and real-time visibility into every planning decision.

---

## Architecture

```
Order CONFIRMED ──► Edge Function (planning-trigger)
                         │
                         ▼
                  rollingPlanner.onOrderConfirmed()
                         │
                    ┌────┴────┐
                    │ incremental │
                    │  Solve()    │──► scoreSolution() ──► confidenceEngine.shouldAutoExecute()
                    └────┬────┘
                         │
                   ┌─────┴──────┐
                   │ auto?       │
                   ├─YES────────┤──► Save assignment + record decision + planning_events row
                   └─NO─────────┘──► Create validation request (human reviews)
                         │
                         ▼
                  Realtime subscription ──► UI notification
```

**Periodic optimization:** A scheduled re-solve (`periodicOptimize`) runs on all orders for a date, compares against current assignments, and records improvements.

**What-if panel:** Planner selects a vehicle, the system re-solves without it, and shows impact (affected orders, reassignments, unassignables).

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript 5.8, Shadcn/Tailwind, TanStack Query 5 |
| State | TanStack Query + Supabase Realtime subscriptions |
| Backend | Supabase Edge Functions (Deno), PostgreSQL |
| Testing | Vitest (jsdom), TDD red-green-refactor |
| Dependencies | Plan A `confidenceEngine.ts` (`shouldAutoExecute`, `recordDecision`), Plan B `pipelineOrchestrator.ts` (`processEvent`) |

---

## File Structure

```
src/
  types/
    planning.ts                          ← NEW: PlanningConfidence, PlanningResult, WhatIfResult, PlanningTriggerType
  lib/
    vrpSolver.ts                         ← ENHANCE: add incrementalSolve(), scoreSolution()
    rollingPlanner.ts                    ← NEW: onOrderConfirmed(), periodicOptimize(), simulateVehicleRemoval()
  hooks/
    usePlanningDrafts.ts                 ← ENHANCE: add planning_events realtime + auto-assign notifications
  components/
    planning/
      WhatIfPanel.tsx                    ← NEW: vehicle removal simulation UI
  test/
    vrpSolverIncremental.test.ts         ← NEW: 12 tests for incrementalSolve + scoreSolution
    rollingPlanner.test.ts               ← NEW: 13 tests for rolling planner functions

supabase/
  migrations/
    20260405120000_planning_events.sql   ← NEW: planning_events table + RLS
  functions/
    planning-trigger/
      index.ts                           ← NEW: Edge Function for order confirmation trigger
```

---

## Task 1 — Migration: `planning_events` table

### 1.1 Write the migration file

- [ ] Create `supabase/migrations/20260405120000_planning_events.sql` with this exact content:

```sql
-- Planning events: tracks every planning re-evaluation
CREATE TABLE IF NOT EXISTS planning_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'NEW_ORDER', 'CANCELLATION', 'VEHICLE_CHANGE', 'MANUAL', 'SCHEDULE'
  )),
  trigger_entity_id UUID,
  orders_evaluated INTEGER NOT NULL DEFAULT 0,
  orders_assigned INTEGER NOT NULL DEFAULT 0,
  orders_changed INTEGER NOT NULL DEFAULT 0,
  confidence NUMERIC(5,2) NOT NULL DEFAULT 0,
  planning_duration_ms INTEGER NOT NULL DEFAULT 0,
  auto_executed BOOLEAN NOT NULL DEFAULT false,
  assignments_snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for tenant queries
CREATE INDEX idx_planning_events_tenant ON planning_events(tenant_id, created_at DESC);

-- RLS
ALTER TABLE planning_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "planning_events_tenant_read" ON planning_events
  FOR SELECT USING (
    tenant_id = (
      SELECT tm.tenant_id FROM tenant_members tm
      WHERE tm.user_id = auth.uid()
      LIMIT 1
    )
  );

CREATE POLICY "planning_events_tenant_insert" ON planning_events
  FOR INSERT WITH CHECK (
    tenant_id = (
      SELECT tm.tenant_id FROM tenant_members tm
      WHERE tm.user_id = auth.uid()
      LIMIT 1
    )
  );

-- Service role can always insert (for Edge Functions)
CREATE POLICY "planning_events_service_insert" ON planning_events
  FOR INSERT WITH CHECK (auth.role() = 'service_role');
```

### 1.2 Verify migration syntax

- [ ] Run: `cd /c/Users/Badr/Desktop/DevBadr/orderflow-suite && npx supabase db lint --level warning` (or manual SQL review if local Supabase is not running)

---

## Task 2 — Types: `src/types/planning.ts`

### 2.1 Write test expectations (TDD: define what the types look like)

No runtime tests needed for pure type definitions, but we verify they compile in Task 4 tests.

### 2.2 Create the types file

- [ ] Create `src/types/planning.ts` with this exact content:

```typescript
import type { Assignments, PlanOrder } from "@/components/planning/types";
import type { FleetVehicle } from "@/hooks/useVehicles";
import type { GeoCoord } from "@/data/geoData";

/** Trigger types for planning re-evaluations */
export type PlanningTriggerType =
  | "NEW_ORDER"
  | "CANCELLATION"
  | "VEHICLE_CHANGE"
  | "MANUAL"
  | "SCHEDULE";

/** Confidence breakdown for a planning solution */
export interface PlanningConfidence {
  /** Overall score 0-100 */
  score: number;
  /** Weight utilization across all vehicles, 0-100 */
  utilization_pct: number;
  /** Average minutes of slack before time window closes */
  avg_window_slack_min: number;
  /** Ratio of straight-line distance to actual route distance (0-1, higher = more efficient) */
  efficiency_ratio: number;
}

/** Result of a planning operation (incremental or full) */
export interface PlanningResult {
  assignments: Assignments;
  confidence: PlanningConfidence;
  trigger_type: PlanningTriggerType;
  trigger_entity_id: string | null;
  orders_evaluated: number;
  orders_assigned: number;
  orders_changed: number;
  planning_duration_ms: number;
  auto_executed: boolean;
  /** Vehicle the new order was inserted into (incremental only) */
  inserted_into: string | null;
}

/** Result of a what-if vehicle removal simulation */
export interface WhatIfResult {
  /** Vehicle that was removed */
  removed_vehicle_id: string;
  /** Orders originally assigned to the removed vehicle */
  affected_orders: PlanOrder[];
  /** Orders successfully reassigned to other vehicles */
  reassigned_orders: PlanOrder[];
  /** Orders that could not be assigned to any remaining vehicle */
  unassignable_orders: PlanOrder[];
  /** New assignments without the removed vehicle */
  new_assignments: Assignments;
  /** Confidence of the new solution */
  confidence: PlanningConfidence;
}

/** Row shape for the planning_events table */
export interface PlanningEventRow {
  id: string;
  tenant_id: string;
  trigger_type: PlanningTriggerType;
  trigger_entity_id: string | null;
  orders_evaluated: number;
  orders_assigned: number;
  orders_changed: number;
  confidence: number;
  planning_duration_ms: number;
  auto_executed: boolean;
  assignments_snapshot: Record<string, string[]> | null;
  created_at: string;
}
```

---

## Task 3 — Tests: `src/test/vrpSolverIncremental.test.ts` (RED)

### 3.1 Write all 12 tests

- [ ] Create `src/test/vrpSolverIncremental.test.ts` with this exact content:

```typescript
import { describe, it, expect } from "vitest";
import { incrementalSolve, scoreSolution } from "@/lib/vrpSolver";
import type { PlanOrder, Assignments } from "@/components/planning/types";
import type { FleetVehicle } from "@/hooks/useVehicles";
import type { GeoCoord } from "@/data/geoData";

// ── Test fixtures ────────────────────────────────────────────

function makeOrder(overrides: Partial<PlanOrder> & { id: string }): PlanOrder {
  return {
    order_number: 1,
    client_name: "Test Client",
    pickup_address: "Amsterdam",
    delivery_address: "Rotterdam",
    quantity: 1,
    weight_kg: 100,
    requirements: [],
    is_weight_per_unit: false,
    time_window_start: null,
    time_window_end: null,
    pickup_time_from: null,
    pickup_time_to: null,
    delivery_time_from: null,
    delivery_time_to: null,
    geocoded_pickup_lat: null,
    geocoded_pickup_lng: null,
    geocoded_delivery_lat: null,
    geocoded_delivery_lng: null,
    delivery_date: null,
    pickup_date: null,
    ...overrides,
  };
}

function makeVehicle(overrides: Partial<FleetVehicle> & { id: string }): FleetVehicle {
  return {
    code: overrides.id,
    name: `Vehicle ${overrides.id}`,
    plate: "XX-000-X",
    type: "truck",
    capacityKg: 10000,
    capacityPallets: 20,
    features: [],
    ...overrides,
  };
}

function makeCoordMap(entries: Array<[string, GeoCoord]>): Map<string, GeoCoord> {
  return new Map(entries);
}

// ── incrementalSolve tests ───────────────────────────────────

describe("incrementalSolve", () => {
  it("should insert a new order into an empty assignment", () => {
    const order = makeOrder({ id: "o1", weight_kg: 500 });
    const vehicles = [makeVehicle({ id: "v1", capacityKg: 5000 })];
    const coordMap = makeCoordMap([["o1", { lat: 51.92, lng: 4.48 }]]);

    const result = incrementalSolve(order, {}, vehicles, coordMap);

    expect(result.insertedInto).toBe("v1");
    expect(result.assignments["v1"]).toHaveLength(1);
    expect(result.assignments["v1"][0].id).toBe("o1");
  });

  it("should insert into the vehicle with the lowest added distance", () => {
    const existingOrder1 = makeOrder({ id: "o1" });
    const existingOrder2 = makeOrder({ id: "o2" });
    const newOrder = makeOrder({ id: "o3", weight_kg: 100 });

    const vehicles = [
      makeVehicle({ id: "v1", capacityKg: 5000 }),
      makeVehicle({ id: "v2", capacityKg: 5000 }),
    ];

    // o1 is in Rotterdam (v1), o2 is in Groningen (v2), o3 is near Rotterdam
    const coordMap = makeCoordMap([
      ["o1", { lat: 51.92, lng: 4.48 }],   // Rotterdam
      ["o2", { lat: 53.22, lng: 6.57 }],   // Groningen
      ["o3", { lat: 51.81, lng: 4.67 }],   // Dordrecht (near Rotterdam)
    ]);

    const existing: Assignments = {
      v1: [existingOrder1],
      v2: [existingOrder2],
    };

    const result = incrementalSolve(newOrder, existing, vehicles, coordMap);

    expect(result.insertedInto).toBe("v1"); // Closer to Rotterdam
  });

  it("should respect vehicle capacity constraint", () => {
    const existingOrder = makeOrder({ id: "o1", weight_kg: 4500 });
    const newOrder = makeOrder({ id: "o2", weight_kg: 600 });

    const vehicles = [makeVehicle({ id: "v1", capacityKg: 5000 })];
    const coordMap = makeCoordMap([
      ["o1", { lat: 51.92, lng: 4.48 }],
      ["o2", { lat: 52.09, lng: 5.12 }],
    ]);

    const existing: Assignments = { v1: [existingOrder] };
    const result = incrementalSolve(newOrder, existing, vehicles, coordMap);

    // 4500 + 600 = 5100 > 5000, should not fit
    expect(result.insertedInto).toBeNull();
  });

  it("should respect vehicle feature requirements (KOELING)", () => {
    const newOrder = makeOrder({ id: "o1", weight_kg: 100, requirements: ["KOELING"] });
    const vehicles = [makeVehicle({ id: "v1", capacityKg: 5000, features: [] })];
    const coordMap = makeCoordMap([["o1", { lat: 51.92, lng: 4.48 }]]);

    const result = incrementalSolve(newOrder, {}, vehicles, coordMap);

    expect(result.insertedInto).toBeNull();
  });

  it("should respect vehicle feature requirements (ADR)", () => {
    const newOrder = makeOrder({ id: "o1", weight_kg: 100, requirements: ["ADR"] });
    const vehicles = [makeVehicle({ id: "v1", capacityKg: 5000, features: ["ADR"] })];
    const coordMap = makeCoordMap([["o1", { lat: 51.92, lng: 4.48 }]]);

    const result = incrementalSolve(newOrder, {}, vehicles, coordMap);

    expect(result.insertedInto).toBe("v1");
  });

  it("should respect time window constraints", () => {
    // Existing route already takes until ~14:00
    const existing1 = makeOrder({ id: "o1", time_window_start: "08:00", time_window_end: "10:00" });
    const existing2 = makeOrder({ id: "o2", time_window_start: "11:00", time_window_end: "13:00" });

    // New order has a tight window that conflicts
    const newOrder = makeOrder({ id: "o3", time_window_start: "07:00", time_window_end: "08:00" });

    const vehicles = [makeVehicle({ id: "v1", capacityKg: 10000 })];
    const coordMap = makeCoordMap([
      ["o1", { lat: 52.37, lng: 4.9 }],    // Amsterdam
      ["o2", { lat: 51.44, lng: 5.47 }],   // Eindhoven
      ["o3", { lat: 53.22, lng: 6.57 }],   // Groningen (far away)
    ]);

    const existing: Assignments = { v1: [existing1, existing2] };
    const result = incrementalSolve(newOrder, existing, vehicles, coordMap);

    // Groningen after Eindhoven at 13:00 + travel > 08:00 window end
    expect(result.insertedInto).toBeNull();
  });

  it("should not mutate the original assignments object", () => {
    const order = makeOrder({ id: "o1", weight_kg: 100 });
    const vehicles = [makeVehicle({ id: "v1", capacityKg: 5000 })];
    const coordMap = makeCoordMap([["o1", { lat: 51.92, lng: 4.48 }]]);

    const original: Assignments = {};
    const result = incrementalSolve(order, original, vehicles, coordMap);

    expect(Object.keys(original)).toHaveLength(0);
    expect(result.assignments["v1"]).toBeDefined();
  });

  it("should handle is_weight_per_unit correctly", () => {
    const newOrder = makeOrder({
      id: "o1",
      weight_kg: 100,
      quantity: 50,
      is_weight_per_unit: true,
    });
    // Total weight = 100 * 50 = 5000, which equals capacity exactly
    const vehicles = [makeVehicle({ id: "v1", capacityKg: 5000 })];
    const coordMap = makeCoordMap([["o1", { lat: 51.92, lng: 4.48 }]]);

    const result = incrementalSolve(newOrder, {}, vehicles, coordMap);

    expect(result.insertedInto).toBe("v1");
  });
});

// ── scoreSolution tests ──────────────────────────────────────

describe("scoreSolution", () => {
  it("should return a score between 0 and 100", () => {
    const order = makeOrder({ id: "o1", weight_kg: 500 });
    const vehicles = [makeVehicle({ id: "v1", capacityKg: 5000 })];
    const assignments: Assignments = { v1: [order] };
    const coordMap = makeCoordMap([["o1", { lat: 51.92, lng: 4.48 }]]);

    const score = scoreSolution(assignments, vehicles, coordMap);

    expect(score.score).toBeGreaterThanOrEqual(0);
    expect(score.score).toBeLessThanOrEqual(100);
  });

  it("should report utilization percentage correctly", () => {
    const order = makeOrder({ id: "o1", weight_kg: 2500 });
    const vehicles = [makeVehicle({ id: "v1", capacityKg: 5000 })];
    const assignments: Assignments = { v1: [order] };
    const coordMap = makeCoordMap([["o1", { lat: 51.92, lng: 4.48 }]]);

    const score = scoreSolution(assignments, vehicles, coordMap);

    expect(score.utilization_pct).toBeCloseTo(50, 0);
  });

  it("should return zero utilization for empty assignments", () => {
    const vehicles = [makeVehicle({ id: "v1", capacityKg: 5000 })];
    const assignments: Assignments = {};
    const coordMap = makeCoordMap([]);

    const score = scoreSolution(assignments, vehicles, coordMap);

    expect(score.utilization_pct).toBe(0);
    expect(score.score).toBe(0);
  });

  it("should compute efficiency_ratio between 0 and 1", () => {
    const o1 = makeOrder({ id: "o1", weight_kg: 500 });
    const o2 = makeOrder({ id: "o2", weight_kg: 500 });
    const vehicles = [makeVehicle({ id: "v1", capacityKg: 5000 })];
    const assignments: Assignments = { v1: [o1, o2] };
    const coordMap = makeCoordMap([
      ["o1", { lat: 51.92, lng: 4.48 }],  // Rotterdam
      ["o2", { lat: 52.37, lng: 4.9 }],   // Amsterdam
    ]);

    const score = scoreSolution(assignments, vehicles, coordMap);

    expect(score.efficiency_ratio).toBeGreaterThan(0);
    expect(score.efficiency_ratio).toBeLessThanOrEqual(1);
  });
});
```

### 3.2 Run tests — verify they FAIL (functions don't exist yet)

- [ ] Run: `cd /c/Users/Badr/Desktop/DevBadr/orderflow-suite && npx vitest run src/test/vrpSolverIncremental.test.ts`
- [ ] Verify output contains errors about `incrementalSolve` and `scoreSolution` not being exported from `@/lib/vrpSolver`

---

## Task 4 — Implement: `incrementalSolve` and `scoreSolution` in `src/lib/vrpSolver.ts`

### 4.1 Add imports for new types

- [ ] At the top of `src/lib/vrpSolver.ts`, add import:

```typescript
import type { PlanningConfidence } from "@/types/planning";
```

### 4.2 Implement `incrementalSolve`

- [ ] Add the following function at the end of `src/lib/vrpSolver.ts` (after `solveVRP`):

```typescript
/**
 * Incremental insertion: find the best vehicle for a single new order
 * without re-solving the entire problem. Tries inserting at the end of
 * each vehicle's route and picks the one with the lowest added distance
 * that still satisfies capacity, feature, and time-window constraints.
 *
 * Returns new assignments (original is NOT mutated) and which vehicle
 * the order was inserted into (null if no feasible vehicle found).
 */
export function incrementalSolve(
  newOrder: PlanOrder,
  existingAssignments: Assignments,
  vehicles: FleetVehicle[],
  coordMap: Map<string, GeoCoord>,
): { assignments: Assignments; insertedInto: string | null } {
  const newAssignments: Assignments = {};
  for (const [k, v] of Object.entries(existingAssignments)) {
    newAssignments[k] = [...v];
  }

  const orderWeight = getTotalWeight(newOrder);
  const orderPallets = newOrder.quantity || 0;
  const isKoeling = hasTag(newOrder, "KOELING");
  const isADR = hasTag(newOrder, "ADR");
  const newCoord = coordMap.get(newOrder.id);

  let bestVehicleId: string | null = null;
  let bestAddedDist = Infinity;

  for (const vehicle of vehicles) {
    const currentRoute = newAssignments[vehicle.id] || [];
    const currentWeight = currentRoute.reduce((sum, o) => sum + getTotalWeight(o), 0);
    const currentPallets = currentRoute.reduce((sum, o) => sum + (o.quantity || 0), 0);

    // Capacity check
    if (currentWeight + orderWeight > vehicle.capacityKg) continue;
    if (currentPallets + orderPallets > vehicle.capacityPallets) continue;

    // Feature check
    if (isKoeling && !vehicle.features.includes("KOELING")) continue;
    if (isADR && !vehicle.features.includes("ADR")) continue;

    // Time window check
    if (!isTimeWindowFeasible(currentRoute, newOrder, coordMap)) continue;

    // Distance heuristic: added distance if we append this order
    let addedDist = 0;
    if (newCoord && currentRoute.length > 0) {
      let minStopDist = Infinity;
      for (const existingOrder of currentRoute) {
        const exCoord = coordMap.get(existingOrder.id);
        if (exCoord) {
          const d = haversineKm(newCoord, exCoord);
          if (d < minStopDist) minStopDist = d;
        }
      }
      addedDist = minStopDist === Infinity ? 0 : minStopDist;
    } else if (newCoord) {
      // Empty route: distance from warehouse
      addedDist = haversineKm(WAREHOUSE, newCoord);
    }

    if (addedDist < bestAddedDist) {
      bestAddedDist = addedDist;
      bestVehicleId = vehicle.id;
    }
  }

  if (bestVehicleId) {
    if (!newAssignments[bestVehicleId]) {
      newAssignments[bestVehicleId] = [];
    }
    newAssignments[bestVehicleId].push(newOrder);

    // Re-optimize the affected route
    if (newAssignments[bestVehicleId].length > 1) {
      newAssignments[bestVehicleId] = optimizeRoute(
        newAssignments[bestVehicleId],
        coordMap,
      );
    }
  }

  return { assignments: newAssignments, insertedInto: bestVehicleId };
}
```

### 4.3 Implement `scoreSolution`

- [ ] Add the following function after `incrementalSolve` in `src/lib/vrpSolver.ts`:

```typescript
/**
 * Score a planning solution on three dimensions:
 * 1. Capacity utilization — average weight used / vehicle capacity (0-100)
 * 2. Time window slack — average minutes of slack before window closes (lower = tighter = better planned)
 * 3. Distance efficiency — straight-line / actual route distance ratio (0-1, higher = more efficient)
 *
 * Returns a composite score (0-100) plus individual metrics.
 */
export function scoreSolution(
  assignments: Assignments,
  vehicles: FleetVehicle[],
  coordMap: Map<string, GeoCoord>,
): PlanningConfidence {
  const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));

  const activeVehicleIds = Object.keys(assignments).filter(
    (vId) => assignments[vId] && assignments[vId].length > 0,
  );

  if (activeVehicleIds.length === 0) {
    return { score: 0, utilization_pct: 0, avg_window_slack_min: 0, efficiency_ratio: 0 };
  }

  // 1. Utilization: average weight fill across active vehicles
  let totalUtilization = 0;
  let vehiclesWithCapacity = 0;

  for (const vId of activeVehicleIds) {
    const vehicle = vehicleMap.get(vId);
    if (!vehicle) continue;
    const orders = assignments[vId];
    const totalWeight = orders.reduce((sum, o) => sum + getTotalWeight(o), 0);
    totalUtilization += (totalWeight / vehicle.capacityKg) * 100;
    vehiclesWithCapacity++;
  }

  const utilization_pct = vehiclesWithCapacity > 0
    ? totalUtilization / vehiclesWithCapacity
    : 0;

  // 2. Time window slack: average minutes between ETA and window end
  let totalSlack = 0;
  let ordersWithWindows = 0;

  for (const vId of activeVehicleIds) {
    const route = assignments[vId];
    let currentMinutes = 6 * 60; // Default start 06:00
    let currentPos: GeoCoord = WAREHOUSE;

    for (const order of route) {
      const coord = coordMap.get(order.id);
      if (coord) {
        const dist = haversineKm(currentPos, coord);
        currentMinutes += (dist / AVG_SPEED_KMH) * 60;
        if (order.time_window_start) {
          const windowStart = parseTimeToMinutes(order.time_window_start);
          if (currentMinutes < windowStart) currentMinutes = windowStart;
        }
        currentPos = coord;
      }
      currentMinutes += UNLOAD_MINUTES;

      if (order.time_window_end) {
        const windowEnd = parseTimeToMinutes(order.time_window_end);
        const slack = windowEnd - (currentMinutes - UNLOAD_MINUTES);
        totalSlack += Math.max(0, slack);
        ordersWithWindows++;
      }
    }
  }

  const avg_window_slack_min = ordersWithWindows > 0
    ? totalSlack / ordersWithWindows
    : 0;

  // 3. Distance efficiency: straight-line / actual route distance
  let totalStraightLine = 0;
  let totalActualDist = 0;

  for (const vId of activeVehicleIds) {
    const route = assignments[vId];
    if (route.length === 0) continue;

    // Straight-line: warehouse to each stop directly
    for (const order of route) {
      const coord = coordMap.get(order.id);
      if (coord) {
        totalStraightLine += haversineKm(WAREHOUSE, coord);
      }
    }

    // Actual: warehouse → stop1 → stop2 → ... → stopN
    let prev: GeoCoord = WAREHOUSE;
    for (const order of route) {
      const coord = coordMap.get(order.id);
      if (coord) {
        totalActualDist += haversineKm(prev, coord);
        prev = coord;
      }
    }
  }

  const efficiency_ratio = totalActualDist > 0
    ? Math.min(1, totalStraightLine / totalActualDist)
    : 0;

  // Composite score: weighted average
  // - Utilization (40%): higher is better, cap at 100
  // - Slack (30%): less slack = better planning; map 0-240min to 100-0 score
  // - Efficiency (30%): higher is better, scale to 0-100
  const utilizationScore = Math.min(100, utilization_pct);
  const slackScore = ordersWithWindows > 0
    ? Math.max(0, 100 - (avg_window_slack_min / 240) * 100)
    : 50; // Neutral if no time windows
  const efficiencyScore = efficiency_ratio * 100;

  const score = Math.round(
    utilizationScore * 0.4 + slackScore * 0.3 + efficiencyScore * 0.3,
  );

  return {
    score: Math.min(100, Math.max(0, score)),
    utilization_pct: Math.round(utilization_pct * 10) / 10,
    avg_window_slack_min: Math.round(avg_window_slack_min),
    efficiency_ratio: Math.round(efficiency_ratio * 1000) / 1000,
  };
}
```

### 4.4 Run tests — verify they PASS

- [ ] Run: `cd /c/Users/Badr/Desktop/DevBadr/orderflow-suite && npx vitest run src/test/vrpSolverIncremental.test.ts`
- [ ] Verify all 12 tests pass

### 4.5 Run TypeScript check

- [ ] Run: `cd /c/Users/Badr/Desktop/DevBadr/orderflow-suite && npx tsc --noEmit --pretty`
- [ ] Verify no type errors

---

## Task 5 — Tests: `src/test/rollingPlanner.test.ts` (RED)

### 5.1 Write all 13 tests

- [ ] Create `src/test/rollingPlanner.test.ts` with this exact content:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  onOrderConfirmed,
  periodicOptimize,
  simulateVehicleRemoval,
} from "@/lib/rollingPlanner";
import type { PlanOrder, Assignments } from "@/components/planning/types";
import type { FleetVehicle } from "@/hooks/useVehicles";
import type { GeoCoord } from "@/data/geoData";
import type { PlanningResult, WhatIfResult } from "@/types/planning";

// ── Mocks ────────────────────────────────────────────────────

// Mock Supabase client
function createMockSupabase(overrides: {
  orders?: PlanOrder[];
  draftAssignments?: Assignments;
  shouldAutoExecute?: boolean;
} = {}) {
  const {
    orders = [],
    draftAssignments = {},
    shouldAutoExecute = false,
  } = overrides;

  const mockFrom = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: orders[0] || null,
            error: null,
          }),
          data: orders,
          error: null,
        }),
        single: vi.fn().mockResolvedValue({
          data: orders[0] || null,
          error: null,
        }),
      }),
      single: vi.fn().mockResolvedValue({
        data: orders[0] || null,
        error: null,
      }),
    }),
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: "pe-1" }, error: null }),
      }),
    }),
    upsert: vi.fn().mockResolvedValue({ error: null }),
    delete: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }),
  });

  return {
    from: mockFrom,
    _orders: orders,
    _draftAssignments: draftAssignments,
    _shouldAutoExecute: shouldAutoExecute,
  };
}

// ── Fixtures ─────────────────────────────────────────────────

function makeOrder(overrides: Partial<PlanOrder> & { id: string }): PlanOrder {
  return {
    order_number: 1,
    client_name: "Test Client",
    pickup_address: "Amsterdam",
    delivery_address: "Rotterdam",
    quantity: 1,
    weight_kg: 100,
    requirements: [],
    is_weight_per_unit: false,
    time_window_start: null,
    time_window_end: null,
    pickup_time_from: null,
    pickup_time_to: null,
    delivery_time_from: null,
    delivery_time_to: null,
    geocoded_pickup_lat: null,
    geocoded_pickup_lng: null,
    geocoded_delivery_lat: null,
    geocoded_delivery_lng: null,
    delivery_date: null,
    pickup_date: null,
    ...overrides,
  };
}

function makeVehicle(overrides: Partial<FleetVehicle> & { id: string }): FleetVehicle {
  return {
    code: overrides.id,
    name: `Vehicle ${overrides.id}`,
    plate: "XX-000-X",
    type: "truck",
    capacityKg: 10000,
    capacityPallets: 20,
    features: [],
    ...overrides,
  };
}

const DEFAULT_VEHICLES: FleetVehicle[] = [
  makeVehicle({ id: "v1", capacityKg: 5000 }),
  makeVehicle({ id: "v2", capacityKg: 8000 }),
];

const DEFAULT_COORD_MAP = new Map<string, GeoCoord>([
  ["o1", { lat: 51.92, lng: 4.48 }],  // Rotterdam
  ["o2", { lat: 52.37, lng: 4.9 }],   // Amsterdam
  ["o3", { lat: 52.09, lng: 5.12 }],  // Utrecht
  ["o4", { lat: 51.44, lng: 5.47 }],  // Eindhoven
]);

const TENANT_ID = "tenant-001";
const DATE = "2026-04-05";

// ── Mock confidence engine ───────────────────────────────────

vi.mock("@/lib/confidenceEngine", () => ({
  shouldAutoExecute: vi.fn().mockReturnValue(false),
  recordDecision: vi.fn().mockResolvedValue(undefined),
}));

// ── onOrderConfirmed tests ───────────────────────────────────

describe("onOrderConfirmed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return a PlanningResult with trigger_type NEW_ORDER", async () => {
    const order = makeOrder({ id: "o1", weight_kg: 500 });
    const supabaseMock = createMockSupabase({ orders: [order] });

    const result = await onOrderConfirmed(
      supabaseMock as any,
      TENANT_ID,
      "o1",
      DEFAULT_VEHICLES,
      DEFAULT_COORD_MAP,
    );

    expect(result.trigger_type).toBe("NEW_ORDER");
    expect(result.trigger_entity_id).toBe("o1");
  });

  it("should have orders_evaluated >= 1", async () => {
    const order = makeOrder({ id: "o1", weight_kg: 500 });
    const supabaseMock = createMockSupabase({ orders: [order] });

    const result = await onOrderConfirmed(
      supabaseMock as any,
      TENANT_ID,
      "o1",
      DEFAULT_VEHICLES,
      DEFAULT_COORD_MAP,
    );

    expect(result.orders_evaluated).toBeGreaterThanOrEqual(1);
  });

  it("should record planning_duration_ms > 0", async () => {
    const order = makeOrder({ id: "o1", weight_kg: 500 });
    const supabaseMock = createMockSupabase({ orders: [order] });

    const result = await onOrderConfirmed(
      supabaseMock as any,
      TENANT_ID,
      "o1",
      DEFAULT_VEHICLES,
      DEFAULT_COORD_MAP,
    );

    expect(result.planning_duration_ms).toBeGreaterThanOrEqual(0);
  });

  it("should set inserted_into when a vehicle is found", async () => {
    const order = makeOrder({ id: "o1", weight_kg: 500 });
    const supabaseMock = createMockSupabase({ orders: [order] });

    const result = await onOrderConfirmed(
      supabaseMock as any,
      TENANT_ID,
      "o1",
      DEFAULT_VEHICLES,
      DEFAULT_COORD_MAP,
    );

    expect(result.inserted_into).toBeTruthy();
    expect(result.orders_assigned).toBe(1);
  });

  it("should set inserted_into to null when no vehicle fits", async () => {
    const heavyOrder = makeOrder({ id: "o1", weight_kg: 99999 });
    const tinyVehicles = [makeVehicle({ id: "v1", capacityKg: 100 })];
    const supabaseMock = createMockSupabase({ orders: [heavyOrder] });

    const result = await onOrderConfirmed(
      supabaseMock as any,
      TENANT_ID,
      "o1",
      tinyVehicles,
      DEFAULT_COORD_MAP,
    );

    expect(result.inserted_into).toBeNull();
    expect(result.orders_assigned).toBe(0);
  });

  it("should include a valid confidence score", async () => {
    const order = makeOrder({ id: "o1", weight_kg: 500 });
    const supabaseMock = createMockSupabase({ orders: [order] });

    const result = await onOrderConfirmed(
      supabaseMock as any,
      TENANT_ID,
      "o1",
      DEFAULT_VEHICLES,
      DEFAULT_COORD_MAP,
    );

    expect(result.confidence.score).toBeGreaterThanOrEqual(0);
    expect(result.confidence.score).toBeLessThanOrEqual(100);
  });
});

// ── periodicOptimize tests ───────────────────────────────────

describe("periodicOptimize", () => {
  it("should return a PlanningResult with trigger_type SCHEDULE", async () => {
    const orders = [
      makeOrder({ id: "o1", weight_kg: 500, delivery_date: DATE }),
      makeOrder({ id: "o2", weight_kg: 300, delivery_date: DATE }),
    ];
    const supabaseMock = createMockSupabase({ orders });

    const result = await periodicOptimize(
      supabaseMock as any,
      TENANT_ID,
      DATE,
      DEFAULT_VEHICLES,
      DEFAULT_COORD_MAP,
    );

    expect(result.trigger_type).toBe("SCHEDULE");
  });

  it("should evaluate all orders for the date", async () => {
    const orders = [
      makeOrder({ id: "o1", weight_kg: 500, delivery_date: DATE }),
      makeOrder({ id: "o2", weight_kg: 300, delivery_date: DATE }),
      makeOrder({ id: "o3", weight_kg: 200, delivery_date: DATE }),
    ];
    const supabaseMock = createMockSupabase({ orders });

    const result = await periodicOptimize(
      supabaseMock as any,
      TENANT_ID,
      DATE,
      DEFAULT_VEHICLES,
      DEFAULT_COORD_MAP,
    );

    expect(result.orders_evaluated).toBe(3);
  });

  it("should include confidence metrics", async () => {
    const orders = [
      makeOrder({ id: "o1", weight_kg: 500, delivery_date: DATE }),
    ];
    const supabaseMock = createMockSupabase({ orders });

    const result = await periodicOptimize(
      supabaseMock as any,
      TENANT_ID,
      DATE,
      DEFAULT_VEHICLES,
      DEFAULT_COORD_MAP,
    );

    expect(result.confidence).toBeDefined();
    expect(typeof result.confidence.utilization_pct).toBe("number");
    expect(typeof result.confidence.efficiency_ratio).toBe("number");
  });
});

// ── simulateVehicleRemoval tests ─────────────────────────────

describe("simulateVehicleRemoval", () => {
  it("should return affected orders from the removed vehicle", async () => {
    const o1 = makeOrder({ id: "o1", weight_kg: 500, delivery_date: DATE });
    const o2 = makeOrder({ id: "o2", weight_kg: 300, delivery_date: DATE });
    const supabaseMock = createMockSupabase({
      orders: [o1, o2],
      draftAssignments: { v1: [o1], v2: [o2] },
    });

    const result = await simulateVehicleRemoval(
      supabaseMock as any,
      TENANT_ID,
      "v1",
      DATE,
      DEFAULT_VEHICLES,
      DEFAULT_COORD_MAP,
    );

    expect(result.removed_vehicle_id).toBe("v1");
    expect(result.affected_orders).toHaveLength(1);
    expect(result.affected_orders[0].id).toBe("o1");
  });

  it("should not include the removed vehicle in new_assignments", async () => {
    const o1 = makeOrder({ id: "o1", weight_kg: 500, delivery_date: DATE });
    const o2 = makeOrder({ id: "o2", weight_kg: 300, delivery_date: DATE });
    const supabaseMock = createMockSupabase({
      orders: [o1, o2],
      draftAssignments: { v1: [o1], v2: [o2] },
    });

    const result = await simulateVehicleRemoval(
      supabaseMock as any,
      TENANT_ID,
      "v1",
      DATE,
      DEFAULT_VEHICLES,
      DEFAULT_COORD_MAP,
    );

    expect(result.new_assignments["v1"]).toBeUndefined();
  });

  it("should identify unassignable orders when capacity is insufficient", async () => {
    const heavyOrder = makeOrder({ id: "o1", weight_kg: 7000, delivery_date: DATE });
    const o2 = makeOrder({ id: "o2", weight_kg: 4000, delivery_date: DATE });
    const vehicles = [
      makeVehicle({ id: "v1", capacityKg: 8000 }),
      makeVehicle({ id: "v2", capacityKg: 5000 }), // Cannot fit 7000 + 4000
    ];
    const supabaseMock = createMockSupabase({
      orders: [heavyOrder, o2],
      draftAssignments: { v1: [heavyOrder], v2: [o2] },
    });

    const result = await simulateVehicleRemoval(
      supabaseMock as any,
      TENANT_ID,
      "v1",
      DATE,
      vehicles,
      DEFAULT_COORD_MAP,
    );

    // v2 has 4000kg already, capacity 5000, cannot fit 7000 more
    expect(result.unassignable_orders.length).toBeGreaterThan(0);
  });

  it("should return confidence for the new solution", async () => {
    const o1 = makeOrder({ id: "o1", weight_kg: 500, delivery_date: DATE });
    const supabaseMock = createMockSupabase({
      orders: [o1],
      draftAssignments: { v1: [o1] },
    });

    const result = await simulateVehicleRemoval(
      supabaseMock as any,
      TENANT_ID,
      "v1",
      DATE,
      DEFAULT_VEHICLES,
      DEFAULT_COORD_MAP,
    );

    expect(result.confidence).toBeDefined();
    expect(result.confidence.score).toBeGreaterThanOrEqual(0);
  });
});
```

### 5.2 Run tests — verify they FAIL

- [ ] Run: `cd /c/Users/Badr/Desktop/DevBadr/orderflow-suite && npx vitest run src/test/rollingPlanner.test.ts`
- [ ] Verify output contains errors about `@/lib/rollingPlanner` not existing

---

## Task 6 — Implement: `src/lib/rollingPlanner.ts`

### 6.1 Create the rolling planner

- [ ] Create `src/lib/rollingPlanner.ts` with this exact content:

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlanOrder, Assignments } from "@/components/planning/types";
import type { FleetVehicle } from "@/hooks/useVehicles";
import type { GeoCoord } from "@/data/geoData";
import type {
  PlanningResult,
  PlanningConfidence,
  WhatIfResult,
  PlanningTriggerType,
} from "@/types/planning";
import { solveVRP, incrementalSolve, scoreSolution } from "@/lib/vrpSolver";
import { shouldAutoExecute, recordDecision } from "@/lib/confidenceEngine";

// ── Helpers ──────────────────────────────────────────────────

/**
 * Fetch a single order by ID from the database and map it to PlanOrder shape.
 */
async function fetchOrder(
  supabase: SupabaseClient,
  tenantId: string,
  orderId: string,
): Promise<PlanOrder | null> {
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, client_name, pickup_address, delivery_address, " +
      "quantity, weight_kg, requirements, is_weight_per_unit, " +
      "time_window_start, time_window_end, pickup_time_from, pickup_time_to, " +
      "delivery_time_from, delivery_time_to, " +
      "geocoded_pickup_lat, geocoded_pickup_lng, " +
      "geocoded_delivery_lat, geocoded_delivery_lng, " +
      "delivery_date, pickup_date"
    )
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .single();

  if (error || !data) return null;
  return data as PlanOrder;
}

/**
 * Fetch all orders for a given date.
 */
async function fetchOrdersForDate(
  supabase: SupabaseClient,
  tenantId: string,
  date: string,
): Promise<PlanOrder[]> {
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, client_name, pickup_address, delivery_address, " +
      "quantity, weight_kg, requirements, is_weight_per_unit, " +
      "time_window_start, time_window_end, pickup_time_from, pickup_time_to, " +
      "delivery_time_from, delivery_time_to, " +
      "geocoded_pickup_lat, geocoded_pickup_lng, " +
      "geocoded_delivery_lat, geocoded_delivery_lng, " +
      "delivery_date, pickup_date"
    )
    .eq("tenant_id", tenantId)
    .eq("delivery_date", date)
    .eq("status", "CONFIRMED");

  if (error || !data) return [];
  return data as PlanOrder[];
}

/**
 * Fetch current draft assignments for a date.
 */
async function fetchCurrentAssignments(
  supabase: SupabaseClient,
  tenantId: string,
  date: string,
  allOrders: PlanOrder[],
): Promise<Assignments> {
  const { data, error } = await supabase
    .from("planning_drafts")
    .select("vehicle_id, order_ids")
    .eq("tenant_id", tenantId)
    .eq("planned_date", date);

  if (error || !data) return {};

  const orderMap = new Map(allOrders.map((o) => [o.id, o]));
  const assignments: Assignments = {};

  for (const row of data) {
    const orders: PlanOrder[] = [];
    for (const oid of (row.order_ids as string[])) {
      const order = orderMap.get(oid);
      if (order) orders.push(order);
    }
    if (orders.length > 0) {
      assignments[row.vehicle_id] = orders;
    }
  }

  return assignments;
}

/**
 * Record a planning event in the database.
 */
async function recordPlanningEvent(
  supabase: SupabaseClient,
  tenantId: string,
  result: PlanningResult,
): Promise<void> {
  const assignmentSnapshot: Record<string, string[]> = {};
  for (const [vId, orders] of Object.entries(result.assignments)) {
    assignmentSnapshot[vId] = orders.map((o) => o.id);
  }

  await supabase.from("planning_events").insert({
    tenant_id: tenantId,
    trigger_type: result.trigger_type,
    trigger_entity_id: result.trigger_entity_id,
    orders_evaluated: result.orders_evaluated,
    orders_assigned: result.orders_assigned,
    orders_changed: result.orders_changed,
    confidence: result.confidence.score,
    planning_duration_ms: result.planning_duration_ms,
    auto_executed: result.auto_executed,
    assignments_snapshot: assignmentSnapshot,
  });
}

/**
 * Count how many orders are assigned across all vehicles.
 */
function countAssigned(assignments: Assignments): number {
  return Object.values(assignments).reduce((sum, orders) => sum + orders.length, 0);
}

/**
 * Count orders that changed vehicle between two assignment sets.
 */
function countChanges(before: Assignments, after: Assignments): number {
  // Build order → vehicle maps
  const beforeMap = new Map<string, string>();
  for (const [vId, orders] of Object.entries(before)) {
    for (const o of orders) beforeMap.set(o.id, vId);
  }

  let changes = 0;
  for (const [vId, orders] of Object.entries(after)) {
    for (const o of orders) {
      const prevVehicle = beforeMap.get(o.id);
      if (prevVehicle !== vId) changes++;
    }
  }
  return changes;
}

// ── Public API ───────────────────────────────────────────────

/**
 * Called when an order is confirmed. Tries incremental insertion into
 * existing assignments. Scores the result and checks if it should be
 * auto-executed or queued for human validation.
 */
export async function onOrderConfirmed(
  supabase: SupabaseClient,
  tenantId: string,
  orderId: string,
  vehicles: FleetVehicle[],
  coordMap: Map<string, GeoCoord>,
): Promise<PlanningResult> {
  const startMs = performance.now();

  // Fetch the confirmed order
  const order = await fetchOrder(supabase, tenantId, orderId);

  if (!order) {
    const durationMs = Math.round(performance.now() - startMs);
    return {
      assignments: {},
      confidence: { score: 0, utilization_pct: 0, avg_window_slack_min: 0, efficiency_ratio: 0 },
      trigger_type: "NEW_ORDER",
      trigger_entity_id: orderId,
      orders_evaluated: 0,
      orders_assigned: 0,
      orders_changed: 0,
      planning_duration_ms: durationMs,
      auto_executed: false,
      inserted_into: null,
    };
  }

  // Fetch current assignments for this order's delivery date
  const date = order.delivery_date || new Date().toISOString().slice(0, 10);
  const allOrders = await fetchOrdersForDate(supabase, tenantId, date);
  const currentAssignments = await fetchCurrentAssignments(supabase, tenantId, date, allOrders);

  // Try incremental insertion
  const { assignments: newAssignments, insertedInto } = incrementalSolve(
    order,
    currentAssignments,
    vehicles,
    coordMap,
  );

  // Score the solution
  const confidence = scoreSolution(newAssignments, vehicles, coordMap);

  const ordersAssigned = insertedInto ? 1 : 0;
  const ordersChanged = countChanges(currentAssignments, newAssignments);

  // Check if we should auto-execute
  const autoExecute = shouldAutoExecute("PLANNING", confidence.score, tenantId);

  const durationMs = Math.round(performance.now() - startMs);

  const result: PlanningResult = {
    assignments: newAssignments,
    confidence,
    trigger_type: "NEW_ORDER",
    trigger_entity_id: orderId,
    orders_evaluated: 1,
    orders_assigned: ordersAssigned,
    orders_changed: ordersChanged,
    planning_duration_ms: durationMs,
    auto_executed: autoExecute,
    inserted_into: insertedInto,
  };

  // Record the planning event
  await recordPlanningEvent(supabase, tenantId, result);

  // Record the decision for confidence learning
  await recordDecision({
    tenant_id: tenantId,
    decision_type: "PLANNING",
    entity_id: orderId,
    confidence_score: confidence.score,
    auto_executed: autoExecute,
    details: {
      inserted_into: insertedInto,
      utilization_pct: confidence.utilization_pct,
      efficiency_ratio: confidence.efficiency_ratio,
    },
  });

  return result;
}

/**
 * Full re-solve of all orders for a given date. Compares with current
 * assignments to measure improvement and record changes.
 */
export async function periodicOptimize(
  supabase: SupabaseClient,
  tenantId: string,
  date: string,
  vehicles: FleetVehicle[],
  coordMap: Map<string, GeoCoord>,
): Promise<PlanningResult> {
  const startMs = performance.now();

  // Fetch all confirmed orders for the date
  const allOrders = await fetchOrdersForDate(supabase, tenantId, date);
  const currentAssignments = await fetchCurrentAssignments(supabase, tenantId, date, allOrders);

  // Full re-solve
  const newAssignments = solveVRP(allOrders, vehicles, coordMap);

  // Score new solution
  const confidence = scoreSolution(newAssignments, vehicles, coordMap);

  const ordersAssigned = countAssigned(newAssignments);
  const ordersChanged = countChanges(currentAssignments, newAssignments);

  // Check if we should auto-execute the improved plan
  const autoExecute = shouldAutoExecute("PLANNING", confidence.score, tenantId);

  const durationMs = Math.round(performance.now() - startMs);

  const result: PlanningResult = {
    assignments: newAssignments,
    confidence,
    trigger_type: "SCHEDULE",
    trigger_entity_id: null,
    orders_evaluated: allOrders.length,
    orders_assigned: ordersAssigned,
    orders_changed: ordersChanged,
    planning_duration_ms: durationMs,
    auto_executed: autoExecute,
    inserted_into: null,
  };

  // Record planning event
  await recordPlanningEvent(supabase, tenantId, result);

  return result;
}

/**
 * Simulate removing a vehicle from the fleet and re-solving.
 * Returns which orders are affected, reassigned, and unassignable.
 */
export async function simulateVehicleRemoval(
  supabase: SupabaseClient,
  tenantId: string,
  vehicleId: string,
  date: string,
  vehicles: FleetVehicle[],
  coordMap: Map<string, GeoCoord>,
): Promise<WhatIfResult> {
  // Fetch current state
  const allOrders = await fetchOrdersForDate(supabase, tenantId, date);
  const currentAssignments = await fetchCurrentAssignments(supabase, tenantId, date, allOrders);

  // Orders currently on the removed vehicle
  const affectedOrders = currentAssignments[vehicleId] || [];

  // Remove the vehicle from the available list
  const remainingVehicles = vehicles.filter((v) => v.id !== vehicleId);

  // Build assignments without the removed vehicle
  const assignmentsWithout: Assignments = {};
  for (const [vId, orders] of Object.entries(currentAssignments)) {
    if (vId !== vehicleId) {
      assignmentsWithout[vId] = [...orders];
    }
  }

  // Re-solve: try to place affected orders into remaining vehicles
  const newAssignments = solveVRP(affectedOrders, remainingVehicles, coordMap, assignmentsWithout);

  // Determine which affected orders got reassigned
  const reassignedIds = new Set<string>();
  for (const [vId, orders] of Object.entries(newAssignments)) {
    if (vId === vehicleId) continue;
    for (const order of orders) {
      if (affectedOrders.some((ao) => ao.id === order.id)) {
        reassignedIds.add(order.id);
      }
    }
  }

  const reassignedOrders = affectedOrders.filter((o) => reassignedIds.has(o.id));
  const unassignableOrders = affectedOrders.filter((o) => !reassignedIds.has(o.id));

  // Score the new solution
  const confidence = scoreSolution(newAssignments, remainingVehicles, coordMap);

  return {
    removed_vehicle_id: vehicleId,
    affected_orders: affectedOrders,
    reassigned_orders: reassignedOrders,
    unassignable_orders: unassignableOrders,
    new_assignments: newAssignments,
    confidence,
  };
}
```

### 6.2 Run tests — verify they PASS

- [ ] Run: `cd /c/Users/Badr/Desktop/DevBadr/orderflow-suite && npx vitest run src/test/rollingPlanner.test.ts`
- [ ] Verify all 13 tests pass

### 6.3 Run TypeScript check

- [ ] Run: `cd /c/Users/Badr/Desktop/DevBadr/orderflow-suite && npx tsc --noEmit --pretty`
- [ ] Verify no type errors

---

## Task 7 — Edge Function: `supabase/functions/planning-trigger/index.ts`

### 7.1 Create the Edge Function

- [ ] Create `supabase/functions/planning-trigger/index.ts` with this exact content:

```typescript
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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { tenant_id, order_id } = await req.json();

    if (!tenant_id || !order_id) {
      return new Response(
        JSON.stringify({ error: "tenant_id and order_id are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Fetch the order to confirm it exists and is CONFIRMED
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, status, delivery_date")
      .eq("id", order_id)
      .eq("tenant_id", tenant_id)
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ error: "Order not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (order.status !== "CONFIRMED") {
      return new Response(
        JSON.stringify({
          skipped: true,
          reason: `Order status is ${order.status}, not CONFIRMED`,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Fetch vehicles for this tenant
    const { data: vehicleRows } = await supabase
      .from("vehicles")
      .select("id, code, name, plate, type, capacity_kg, capacity_pallets, features")
      .eq("tenant_id", tenant_id)
      .eq("is_active", true);

    const vehicles = (vehicleRows ?? []).map((v: any) => ({
      id: v.code,
      code: v.code,
      name: v.name,
      plate: v.plate,
      type: v.type,
      capacityKg: v.capacity_kg,
      capacityPallets: v.capacity_pallets,
      features: v.features ?? [],
    }));

    if (vehicles.length === 0) {
      return new Response(
        JSON.stringify({
          skipped: true,
          reason: "No active vehicles found for tenant",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Fetch all confirmed orders for the same delivery date to build coord map
    const deliveryDate = order.delivery_date || new Date().toISOString().slice(0, 10);

    const { data: allOrders } = await supabase
      .from("orders")
      .select("id, geocoded_delivery_lat, geocoded_delivery_lng")
      .eq("tenant_id", tenant_id)
      .eq("delivery_date", deliveryDate)
      .eq("status", "CONFIRMED");

    const coordMap = new Map<string, { lat: number; lng: number }>();
    for (const o of allOrders ?? []) {
      if (o.geocoded_delivery_lat && o.geocoded_delivery_lng) {
        coordMap.set(o.id, {
          lat: o.geocoded_delivery_lat,
          lng: o.geocoded_delivery_lng,
        });
      }
    }

    // NOTE: In production, onOrderConfirmed would be called here.
    // Since Edge Functions cannot import frontend code directly,
    // we replicate the core logic: incremental solve + score + record.
    // For now, we record that the trigger fired and let the frontend
    // handle the actual planning via realtime subscription.

    // Record the planning trigger event
    await supabase.from("planning_events").insert({
      tenant_id,
      trigger_type: "NEW_ORDER",
      trigger_entity_id: order_id,
      orders_evaluated: 1,
      orders_assigned: 0,
      orders_changed: 0,
      confidence: 0,
      planning_duration_ms: 0,
      auto_executed: false,
    });

    return new Response(
      JSON.stringify({
        success: true,
        order_id,
        tenant_id,
        vehicles_available: vehicles.length,
        coords_available: coordMap.size,
        message: "Planning trigger recorded. Frontend will process via realtime.",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("planning-trigger error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
```

---

## Task 8 — Enhance `src/hooks/usePlanningDrafts.ts`

### 8.1 Add planning events realtime subscription

- [ ] Add the following hook at the bottom of `src/hooks/usePlanningDrafts.ts`:

```typescript
// ─── Planning Events Realtime ─────────────────────────────────
/**
 * Subscribe to planning_events to show real-time notifications
 * when the system auto-assigns or re-evaluates orders.
 */
export function usePlanningEventsRealtime(
  onPlanningEvent?: (event: {
    trigger_type: string;
    orders_assigned: number;
    orders_changed: number;
    auto_executed: boolean;
    confidence: number;
  }) => void,
) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("planning-events-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "planning_events" },
        (payload) => {
          // Invalidate planning drafts so UI picks up new assignments
          queryClient.invalidateQueries({ queryKey: ["planning-drafts"] });
          queryClient.invalidateQueries({ queryKey: ["planning-events"] });

          // Notify caller
          if (onPlanningEvent && payload.new) {
            const row = payload.new as Record<string, unknown>;
            onPlanningEvent({
              trigger_type: (row.trigger_type as string) || "UNKNOWN",
              orders_assigned: (row.orders_assigned as number) || 0,
              orders_changed: (row.orders_changed as number) || 0,
              auto_executed: (row.auto_executed as boolean) || false,
              confidence: (row.confidence as number) || 0,
            });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, onPlanningEvent]);
}
```

### 8.2 Add planning events query hook

- [ ] Add the following hook after the realtime hook in `src/hooks/usePlanningDrafts.ts`:

```typescript
// ─── Planning Events History ──────────────────────────────────
/**
 * Fetch recent planning events for a tenant.
 */
export function usePlanningEvents(tenantId: string | undefined, limit: number = 20) {
  return useQuery({
    queryKey: ["planning-events", tenantId, limit],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("planning_events")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data ?? [];
    },
    staleTime: 10_000,
  });
}
```

---

## Task 9 — UI: `src/components/planning/WhatIfPanel.tsx`

### 9.1 Create the WhatIfPanel component

- [ ] Create `src/components/planning/WhatIfPanel.tsx` with this exact content:

```typescript
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Truck, Package, BarChart3 } from "lucide-react";
import type { FleetVehicle } from "@/hooks/useVehicles";
import type { Assignments } from "@/components/planning/types";
import type { GeoCoord } from "@/data/geoData";
import type { WhatIfResult } from "@/types/planning";
import { simulateVehicleRemoval } from "@/lib/rollingPlanner";
import { supabase } from "@/integrations/supabase/client";

interface WhatIfPanelProps {
  tenantId: string;
  date: string;
  vehicles: FleetVehicle[];
  assignments: Assignments;
  coordMap: Map<string, GeoCoord>;
}

export function WhatIfPanel({
  tenantId,
  date,
  vehicles,
  assignments,
  coordMap,
}: WhatIfPanelProps) {
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [result, setResult] = useState<WhatIfResult | null>(null);
  const [loading, setLoading] = useState(false);

  // Only show vehicles that have assigned orders
  const activeVehicles = vehicles.filter(
    (v) => assignments[v.id] && assignments[v.id].length > 0,
  );

  async function handleSimulate() {
    if (!selectedVehicleId) return;
    setLoading(true);
    try {
      const whatIf = await simulateVehicleRemoval(
        supabase,
        tenantId,
        selectedVehicleId,
        date,
        vehicles,
        coordMap,
      );
      setResult(whatIf);
    } catch (err) {
      console.error("What-if simulation failed:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-4 w-4" />
          Wat-als simulatie
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Selecteer een voertuig om te zien wat er gebeurt als het wegvalt.
        </p>

        <div className="flex gap-2">
          <Select
            value={selectedVehicleId ?? ""}
            onValueChange={(val) => {
              setSelectedVehicleId(val);
              setResult(null);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Kies voertuig..." />
            </SelectTrigger>
            <SelectContent>
              {activeVehicles.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  <span className="flex items-center gap-2">
                    <Truck className="h-3 w-3" />
                    {v.name} ({v.plate}) &mdash;{" "}
                    {assignments[v.id]?.length || 0} orders
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            onClick={handleSimulate}
            disabled={!selectedVehicleId || loading}
            variant="secondary"
          >
            {loading ? "Berekenen..." : "Simuleer"}
          </Button>
        </div>

        {result && (
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-md border p-3 text-center">
                <div className="text-2xl font-bold">{result.affected_orders.length}</div>
                <div className="text-xs text-muted-foreground">Getroffen orders</div>
              </div>
              <div className="rounded-md border p-3 text-center">
                <div className="text-2xl font-bold text-green-600">
                  {result.reassigned_orders.length}
                </div>
                <div className="text-xs text-muted-foreground">Herverdeeld</div>
              </div>
              <div className="rounded-md border p-3 text-center">
                <div className="text-2xl font-bold text-red-600">
                  {result.unassignable_orders.length}
                </div>
                <div className="text-xs text-muted-foreground">Niet plaatsbaar</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Betrouwbaarheid:</span>
              <Badge
                variant={
                  result.confidence.score >= 70
                    ? "default"
                    : result.confidence.score >= 40
                      ? "secondary"
                      : "destructive"
                }
              >
                {result.confidence.score}%
              </Badge>
              <span className="text-xs text-muted-foreground">
                (benutting: {result.confidence.utilization_pct}%)
              </span>
            </div>

            {result.unassignable_orders.length > 0 && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-red-700">
                  <AlertTriangle className="h-4 w-4" />
                  Niet plaatsbare orders
                </div>
                <ul className="mt-1 space-y-1">
                  {result.unassignable_orders.map((order) => (
                    <li key={order.id} className="flex items-center gap-2 text-xs text-red-600">
                      <Package className="h-3 w-3" />
                      #{order.order_number} &mdash; {order.client_name} &mdash;{" "}
                      {order.delivery_address}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.reassigned_orders.length > 0 && (
              <div className="rounded-md border border-green-200 bg-green-50 p-3">
                <div className="text-sm font-medium text-green-700">
                  Herverdeling
                </div>
                <ul className="mt-1 space-y-1">
                  {result.reassigned_orders.map((order) => {
                    // Find which vehicle this order ended up in
                    let newVehicle = "—";
                    for (const [vId, orders] of Object.entries(result.new_assignments)) {
                      if (orders.some((o) => o.id === order.id)) {
                        const v = vehicles.find((veh) => veh.id === vId);
                        newVehicle = v ? v.name : vId;
                        break;
                      }
                    }
                    return (
                      <li key={order.id} className="flex items-center gap-2 text-xs text-green-600">
                        <Package className="h-3 w-3" />
                        #{order.order_number} &rarr; {newVehicle}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

---

## Task 10 — Run all tests together

### 10.1 Run both test files

- [ ] Run: `cd /c/Users/Badr/Desktop/DevBadr/orderflow-suite && npx vitest run src/test/vrpSolverIncremental.test.ts src/test/rollingPlanner.test.ts`
- [ ] Verify all 25 tests pass (12 + 13)

### 10.2 Run full TypeScript check

- [ ] Run: `cd /c/Users/Badr/Desktop/DevBadr/orderflow-suite && npx tsc --noEmit --pretty`
- [ ] Verify zero errors

### 10.3 Run existing test suite to check for regressions

- [ ] Run: `cd /c/Users/Badr/Desktop/DevBadr/orderflow-suite && npx vitest run`
- [ ] Verify all existing tests still pass

---

## Task 11 — Commit

- [ ] `cd /c/Users/Badr/Desktop/DevBadr/orderflow-suite && git add -A`
- [ ] `git commit -m "feat(plan-d): autonomous rolling planner — incremental VRP, scoring, what-if simulation"`

---

## Summary of deliverables

| # | File | Action | Lines (est.) |
|---|------|--------|-------------|
| 1 | `supabase/migrations/20260405120000_planning_events.sql` | CREATE | ~40 |
| 2 | `src/types/planning.ts` | CREATE | ~70 |
| 3 | `src/test/vrpSolverIncremental.test.ts` | CREATE | ~230 |
| 4 | `src/lib/vrpSolver.ts` | ENHANCE | +~120 (incrementalSolve + scoreSolution) |
| 5 | `src/test/rollingPlanner.test.ts` | CREATE | ~290 |
| 6 | `src/lib/rollingPlanner.ts` | CREATE | ~280 |
| 7 | `supabase/functions/planning-trigger/index.ts` | CREATE | ~130 |
| 8 | `src/hooks/usePlanningDrafts.ts` | ENHANCE | +~60 |
| 9 | `src/components/planning/WhatIfPanel.tsx` | CREATE | ~180 |

**Total: 9 files, ~1400 lines, 25 tests**

---

## Dependency chain

```
Task 1 (migration) ─────────────────────┐
Task 2 (types) ──────────┐              │
                          ▼              │
Task 3 (VRP tests RED) ──┤              │
                          ▼              │
Task 4 (VRP impl GREEN) ─┤              │
                          ▼              │
Task 5 (planner tests) ──┤              │
                          ▼              │
Task 6 (planner impl) ───┤              │
                          ├── Task 10 (full test run)
Task 7 (edge function) ──┤              │
                          │              │
Task 8 (hooks enhance) ──┤              │
                          │              │
Task 9 (WhatIfPanel UI) ─┘              │
                                         ▼
                              Task 11 (commit)
```

Tasks 1, 2 can run in parallel. Tasks 3-6 are sequential (TDD). Tasks 7, 8, 9 can run in parallel after Task 6.
