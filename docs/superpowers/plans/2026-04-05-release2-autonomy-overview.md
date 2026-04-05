# Release 2 — Autonomy: Master Implementation Plan

> **For agentic workers:** This is the **overview plan**. Each subsystem (A through G) will have its own detailed implementation plan with bite-sized tasks. Use this document to understand scope, dependencies, and build order before starting any subsystem plan.

**Goal:** Transform OrderFlow Suite from an AI-assisted TMS (human operates, AI helps) to a confidence-driven autonomous TMS (AI operates, human supervises). Every decision gets a confidence score; the system acts independently above the tenant's threshold.

**Architecture:** Event-driven pipeline where every status change triggers an autonomy evaluation. A central Confidence Store tracks decision accuracy per type/client/tenant. Four autonomous modules (Order Intake, Planning, Dispatch, Financial) each consume confidence data to decide: act autonomously, request validation, or defer to human.

**Tech Stack:** React 18 + TypeScript 5.8, Supabase (PostgreSQL + Edge Functions + Realtime), Gemini 2.5 Flash, Vitest, TanStack Query 5, Tailwind + Shadcn/UI.

---

## Current State (Release 1 — Complete)

| Area | What exists | Key files |
|------|------------|-----------|
| AI email parsing | Gemini extracts orders from email/PDF, confidence 0-100, anomaly detection, client template learning after 5+ orders | `supabase/functions/parse-order/index.ts` |
| Order flow | Email → DRAFT → dispatcher review → CONFIRMED → PLANNED → DISPATCHED → DELIVERED | `src/hooks/useInbox.ts`, `src/hooks/useOrders.ts` |
| VRP solver | Greedy insertion + capacity/time-window constraints, post-optimization | `src/lib/vrpSolver.ts` |
| Pricing engine | Rate cards, rule matching, surcharges, PriceBreakdown output | `src/lib/pricingEngine.ts` |
| Consolidation | Region clustering, time-window compat, capacity check, proposals | `src/lib/consolidationEngine.ts` |
| Cost allocation | Trip cost calculation, vehicle fixed costs | `src/lib/costEngine.ts` |
| Realtime | Supabase `postgres_changes` subscriptions on orders, trips, drivers | Multiple hooks |
| Multi-tenant | RLS, tenant_members (admin/planner/chauffeur), tenant settings JSONB | `src/contexts/TenantContext.tsx` |
| Tests | 2067 tests, Vitest, 85% coverage target | `src/test/`, `vitest.config.ts` |

### What's missing for autonomy

1. **No decision tracking** — system doesn't record what it proposed vs. what the human did
2. **No outcome feedback** — no comparison of prediction vs. reality after execution
3. **No event pipeline** — status changes don't trigger autonomous next-step evaluation
4. **No per-tenant thresholds** — confidence thresholds are hardcoded (80 in Inbox)
5. **No auto-confirmation** — all orders require manual dispatcher approval
6. **No rolling planner** — VRP runs once on demand, not continuously
7. **No auto-dispatch** — dispatcher manually sends trips to drivers
8. **No auto-invoicing** — invoices created manually
9. **No autonomy visibility** — no dashboard showing automation level or learning progress

---

## Subsystem Decomposition

```
┌──────────────────────────────────────────────────────────────────┐
│                    G. AUTONOMY DASHBOARD                         │
│         (Visibility into all autonomy metrics)                   │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  C. Order Intake    D. Planning    E. Dispatch    F. Financial   │
│  (Auto-confirm)     (Rolling)      (Auto-send)   (Auto-invoice) │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│                    B. EVENT PIPELINE                              │
│         (Status change → evaluate → act or escalate)             │
├──────────────────────────────────────────────────────────────────┤
│                    A. CONFIDENCE STORE                            │
│         (Track, score, learn from every decision)                │
└──────────────────────────────────────────────────────────────────┘
```

### Build Order & Dependencies

```
Phase 1 (Foundation):     A ──→ B
Phase 2 (Modules):        C, D, F  (parallel, each depends on A+B)
Phase 3 (Execution):      E        (depends on D)
Phase 4 (Visibility):     G        (depends on A, reads from all modules)
```

---

## Plan A: Confidence Store & Decision Engine

### Purpose
Central system that records every AI decision, tracks human corrections, computes outcome confidence per decision type/client/tenant, and provides the confidence API that all other modules consume.

### New Database Objects

#### `decision_log`
Every autonomous or proposed decision the system makes.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| tenant_id | UUID FK → tenants | |
| decision_type | TEXT NOT NULL | ORDER_INTAKE / PLANNING / DISPATCH / PRICING / INVOICING / CONSOLIDATION |
| entity_type | TEXT NOT NULL | order / trip / invoice |
| entity_id | UUID NOT NULL | FK to the relevant entity |
| client_id | UUID FK → clients | NULL for non-client decisions |
| proposed_action | JSONB NOT NULL | What the system proposed |
| actual_action | JSONB | What actually happened (NULL until resolved) |
| input_confidence | NUMERIC(5,2) | How certain was the input data (0-100) |
| model_confidence | NUMERIC(5,2) | How certain was the decision model (0-100) |
| outcome_confidence | NUMERIC(5,2) | Calculated after outcome (0-100) |
| resolution | TEXT | APPROVED / MODIFIED / REJECTED / AUTO_EXECUTED / PENDING |
| resolved_by | UUID FK → auth.users | NULL if auto-executed |
| resolved_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ DEFAULT now() | |

#### `confidence_scores`
Aggregated confidence per decision type, per client, per tenant. Materialized from `decision_log`.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| tenant_id | UUID FK → tenants | |
| decision_type | TEXT NOT NULL | Same enum as decision_log |
| client_id | UUID FK → clients | NULL = tenant-wide score |
| current_score | NUMERIC(5,2) NOT NULL | Rolling average (0-100) |
| total_decisions | INTEGER DEFAULT 0 | |
| approved_count | INTEGER DEFAULT 0 | |
| modified_count | INTEGER DEFAULT 0 | |
| rejected_count | INTEGER DEFAULT 0 | |
| trend | TEXT DEFAULT 'STABLE' | RISING / STABLE / FALLING |
| last_updated | TIMESTAMPTZ DEFAULT now() | |

#### ALTER `tenants.settings` JSONB
Add autonomy configuration:

```jsonc
{
  "autonomy": {
    "enabled": false,                    // Master switch
    "global_threshold": 95,              // Default confidence threshold
    "thresholds": {                      // Per decision-type overrides
      "ORDER_INTAKE": 90,
      "PLANNING": 95,
      "DISPATCH": 95,
      "PRICING": 90,
      "INVOICING": 98
    },
    "max_autonomous_value_eur": 5000,    // Auto-act only below this order value
    "require_human_for": ["ADR", "KOELING"]  // Always human for these requirements
  }
}
```

### New Lib Module: `src/lib/confidenceEngine.ts`

```typescript
// Core functions the other modules will call:

/** Record a new decision (proposed or auto-executed) */
recordDecision(params: RecordDecisionInput): Promise<DecisionLogEntry>

/** Record what the human actually did (approve/modify/reject) */
resolveDecision(decisionId: string, resolution: Resolution, actualAction?: object): Promise<void>

/** Get current confidence for a decision type + optional client */
getConfidence(tenantId: string, decisionType: DecisionType, clientId?: string): Promise<number>

/** Should the system act autonomously for this decision? */
shouldAutoExecute(tenantId: string, decisionType: DecisionType, inputConfidence: number, clientId?: string): Promise<{ auto: boolean; reason: string }>

/** Recalculate confidence_scores from decision_log (called after resolveDecision) */
recalculateScore(tenantId: string, decisionType: DecisionType, clientId?: string): Promise<void>
```

### New Hook: `src/hooks/useConfidence.ts`

```typescript
useConfidenceScores(decisionType?: DecisionType): UseQueryResult<ConfidenceScore[]>
useDecisionLog(entityId: string): UseQueryResult<DecisionLogEntry[]>
useRecordDecision(): UseMutationResult
useResolveDecision(): UseMutationResult
```

### Integration Points
- **Inbox (useInbox.ts):** When dispatcher approves/modifies/rejects an order → `resolveDecision()`
- **Planning (Planning.tsx):** When planner changes VRP assignment → `resolveDecision()`
- **Pricing (pricingEngine.ts):** When planner adjusts auto-calculated price → `resolveDecision()`
- **All modules:** Before acting → `shouldAutoExecute()` to check threshold

### Tests
- Unit tests for confidence calculation (rolling average, trend detection)
- Unit tests for threshold evaluation (tenant config, per-type, per-client)
- Integration tests for decision lifecycle (record → resolve → recalculate)

### Estimated Scope
- 2 new tables + 1 ALTER (tenants.settings)
- 1 new lib module (~200 lines)
- 1 new hook (~100 lines)
- 1 new type file (~80 lines)
- ~15 test cases
- Supabase migration

---

## Plan B: Event-Driven Pipeline

### Purpose
Transform the current request-response flow into an event stream where every status change triggers an autonomous evaluation: "Can I do the next step without human help?"

### Architecture

```
Status change (DB trigger or Realtime)
         ↓
  Event Pipeline evaluates:
    1. What's the next step? (state machine)
    2. What's the confidence? (from Plan A)
    3. Above threshold? → Execute autonomously
    4. Below threshold? → Create validation request
         ↓
  Action: auto-execute OR notify planner
```

### New Database Objects

#### `pipeline_events`
Event log for every autonomous evaluation.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| tenant_id | UUID FK → tenants | |
| entity_type | TEXT NOT NULL | order / trip / invoice |
| entity_id | UUID NOT NULL | |
| event_type | TEXT NOT NULL | ORDER_CREATED / ORDER_CONFIRMED / TRIP_PLANNED / TRIP_DISPATCHED / DELIVERY_COMPLETE / INVOICE_READY |
| previous_status | TEXT | |
| new_status | TEXT | |
| evaluation_result | TEXT | AUTO_EXECUTE / NEEDS_VALIDATION / BLOCKED |
| confidence_at_evaluation | NUMERIC(5,2) | |
| action_taken | JSONB | What the pipeline did |
| processed_at | TIMESTAMPTZ DEFAULT now() | |

#### `validation_queue`
Items waiting for human approval (Layer 2: validation mode).

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| tenant_id | UUID FK → tenants | |
| decision_log_id | UUID FK → decision_log | |
| entity_type | TEXT NOT NULL | |
| entity_id | UUID NOT NULL | |
| action_type | TEXT NOT NULL | CONFIRM_ORDER / ASSIGN_VEHICLE / DISPATCH_TRIP / SEND_INVOICE |
| proposed_action | JSONB NOT NULL | What the system wants to do |
| confidence | NUMERIC(5,2) | |
| priority | INTEGER DEFAULT 0 | Higher = more urgent |
| status | TEXT DEFAULT 'PENDING' | PENDING / APPROVED / REJECTED / EXPIRED |
| expires_at | TIMESTAMPTZ | Auto-expire if not acted on |
| created_at | TIMESTAMPTZ DEFAULT now() | |

### New Lib Module: `src/lib/pipelineOrchestrator.ts`

```typescript
/** Evaluate what to do after a status change */
evaluateNextStep(event: PipelineEvent): Promise<EvaluationResult>

/** Execute an autonomous action */
executeAction(action: PipelineAction): Promise<void>

/** Create a validation request for the planner */
createValidationRequest(decision: DecisionLogEntry, action: PipelineAction): Promise<void>

/** Process the entire pipeline for an entity */
processEvent(tenantId: string, entityType: string, entityId: string, newStatus: string): Promise<void>
```

### New Supabase Function: `supabase/functions/pipeline-trigger/index.ts`

Lightweight Edge Function triggered by database webhooks on status changes. Calls `processEvent()` logic server-side.

### New Hook: `src/hooks/useValidationQueue.ts`

```typescript
useValidationQueue(): UseQueryResult<ValidationItem[]>
useApproveValidation(): UseMutationResult  // One-click approve
useRejectValidation(): UseMutationResult
```

### New UI Component: `src/components/validation/ValidationBanner.tsx`

Shows pending validation items as a banner/badge in the planner interface. "3 items need your approval" with one-click approve.

### Integration Points
- **Realtime subscriptions:** Listen to `orders`, `trips`, `invoices` status changes
- **Plan A:** Every evaluation calls `shouldAutoExecute()` and `recordDecision()`
- **Existing pages:** Planning, Dispatch, Facturatie get a ValidationBanner

### State Machine: Order Lifecycle with Autonomy

```
EMAIL_RECEIVED
  → [Pipeline] Parse & extract (existing)
  → DRAFT (confidence_score set)

DRAFT
  → [Pipeline] confidence ≥ threshold?
    YES → auto-CONFIRMED + recordDecision(AUTO_EXECUTED)
    NO  → validation_queue + notify planner

CONFIRMED
  → [Pipeline] VRP assigns vehicle, confidence ≥ threshold?
    YES → auto-PLANNED + recordDecision(AUTO_EXECUTED)
    NO  → validation_queue (proposed assignment shown)

PLANNED
  → [Pipeline] dispatch time reached, confidence ≥ threshold?
    YES → auto-DISPATCHED + send to driver app
    NO  → validation_queue

DISPATCHED → DELIVERED (driver confirms, existing flow)

DELIVERED
  → [Pipeline] pricing calculated, confidence ≥ threshold?
    YES → auto-invoice generated
    NO  → validation_queue (draft invoice for review)
```

### Tests
- Unit tests for state machine transitions
- Unit tests for evaluation logic (threshold checking, action selection)
- Integration tests for full pipeline flow (status change → evaluation → action)
- Tests for validation queue lifecycle

### Estimated Scope
- 2 new tables
- 1 new Edge Function (~150 lines)
- 1 new lib module (~250 lines)
- 2 new hooks (~150 lines)
- 1 new UI component (~80 lines)
- Supabase migration
- ~20 test cases

---

## Plan C: Autonomous Order Intake

### Purpose
Orders from known clients with high confidence get confirmed automatically. The system learns client patterns, resolves addresses semantically, checks capacity, and confirms without planner involvement.

### What Changes vs. Current Flow

| Step | Current | Autonomous |
|------|---------|------------|
| Email arrives | Parse → DRAFT → wait for dispatcher | Parse → evaluate confidence → auto-CONFIRMED if threshold met |
| Client recognition | Basic name matching in Gemini prompt | Per-client template with field mappings, learned aliases, historical patterns |
| Address resolution | Geocode via Google Places | Semantic address book per client ("De veiling" = known address) |
| Capacity check | None at intake | Pre-check: is a vehicle available for this date/type? |
| Confirmation email | Dispatcher clicks "send confirmation" | Auto-send at confidence ≥ threshold |

### New Database Objects

#### `client_address_book`
Learned address aliases per client.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| tenant_id | UUID FK → tenants | |
| client_id | UUID FK → clients | |
| alias | TEXT NOT NULL | What the client writes ("De veiling", "Depot R'dam") |
| resolved_address | TEXT NOT NULL | Full resolved address |
| resolved_lat | NUMERIC | |
| resolved_lng | NUMERIC | |
| usage_count | INTEGER DEFAULT 1 | Times this alias was used |
| last_used_at | TIMESTAMPTZ | |

#### ALTER `client_extraction_templates`
Add fields for richer learning:

| Column | Type | Description |
|--------|------|-------------|
| default_transport_type | TEXT | Learned default |
| default_requirements | TEXT[] | Learned defaults (e.g., always ADR) |
| avg_weight_kg | NUMERIC | Historical average (for anomaly detection) |
| avg_quantity | NUMERIC | Historical average |
| auto_confirm_eligible | BOOLEAN DEFAULT false | Enough history to auto-confirm? |

### Changes to Existing Code

#### `supabase/functions/parse-order/index.ts`
- After extraction: look up `client_address_book` for alias resolution
- After extraction: call `shouldAutoExecute('ORDER_INTAKE', inputConfidence, clientId)`
- If auto-execute: set status = 'CONFIRMED' directly, call `send-confirmation`, record decision
- If not: set status = 'DRAFT' as before, create validation queue item

#### `src/hooks/useInbox.ts`
- When dispatcher approves: also update `client_address_book` if address was different
- When dispatcher modifies: `resolveDecision()` with MODIFIED + the corrections

#### New lib: `src/lib/addressResolver.ts`
- `resolveClientAddress(tenantId, clientId, rawAddress)` → resolved address or null
- Fuzzy matching against `client_address_book`
- Falls back to Google Places if no match

#### New lib: `src/lib/capacityPreCheck.ts`
- `checkAvailableCapacity(tenantId, date, requirements, weightKg)` → { available: boolean, suggestedVehicleId? }
- Quick check against vehicle_availability + existing trip loads for the date

### Tests
- Address resolver: fuzzy matching, alias learning, fallback to geocode
- Capacity pre-check: available/unavailable scenarios
- Auto-confirm flow: high confidence → auto-confirmed → decision logged
- Below threshold: stays DRAFT → validation queue
- Client template enrichment after corrections

### Estimated Scope
- 1 new table + 1 ALTER
- 2 new lib modules (~150 lines each)
- Modify parse-order Edge Function (~50 lines added)
- Modify useInbox hook (~30 lines added)
- ~20 test cases

---

## Plan D: Autonomous Planning

### Purpose
Instead of running VRP once on demand, the system continuously optimizes as orders arrive. New orders trigger re-evaluation. The planner reviews only when the system is uncertain.

### What Changes vs. Current Flow

| Step | Current | Autonomous |
|------|---------|------------|
| Planning trigger | Planner clicks "Auto-plan" | Every new CONFIRMED order triggers VRP re-evaluation |
| VRP execution | Once, on the set of unassigned orders | Rolling: re-run on every change (new order, cancellation, vehicle breakdown) |
| Assignment | Planner reviews full board, adjusts | System assigns if confidence ≥ threshold, else → validation queue |
| Consolidation | Planner clicks "Auto-groeperen" | System auto-groups compatible orders as they arrive |
| What-if | Not available | Planner asks "what if vehicle X is unavailable tomorrow?" |

### New Database Objects

#### `planning_events`
Tracks every planning re-evaluation.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| tenant_id | UUID FK → tenants | |
| trigger_type | TEXT NOT NULL | NEW_ORDER / CANCELLATION / VEHICLE_CHANGE / MANUAL / SCHEDULE |
| trigger_entity_id | UUID | The order/vehicle that triggered re-plan |
| orders_evaluated | INTEGER | |
| orders_assigned | INTEGER | |
| orders_changed | INTEGER | How many existing assignments changed |
| confidence | NUMERIC(5,2) | Overall planning confidence |
| planning_duration_ms | INTEGER | |
| created_at | TIMESTAMPTZ DEFAULT now() | |

### Changes to Existing Code

#### `src/lib/vrpSolver.ts` — Enhance
- Add `incrementalSolve(newOrder, existingAssignments, vehicles, coordMap)` — insert one order into existing plan without full re-solve
- Add `scoreSolution(assignments)` → confidence score based on: capacity utilization, time window slack, distance efficiency
- Return `PlanningConfidence` alongside `Assignments`

#### New lib: `src/lib/rollingPlanner.ts`

```typescript
/** Called when a new order is confirmed — decides whether to re-plan */
onOrderConfirmed(tenantId: string, orderId: string): Promise<PlanningResult>

/** Called on schedule (e.g., every 15 min) to optimize existing plans */
periodicOptimize(tenantId: string, date: string): Promise<PlanningResult>

/** What-if: simulate removing a vehicle and show impact */
simulateVehicleRemoval(tenantId: string, vehicleId: string, date: string): Promise<WhatIfResult>
```

#### New Edge Function: `supabase/functions/planning-trigger/index.ts`
- Listens for orders with status = CONFIRMED
- Calls rolling planner logic
- Records decision in confidence store

#### `src/hooks/usePlanningDrafts.ts` — Enhance
- Subscribe to autonomous planning events
- Show "System assigned 3 orders" notifications
- Allow planner to undo autonomous assignments

#### New UI: `src/components/planning/WhatIfPanel.tsx`
- Select a vehicle → "Remove from planning tomorrow"
- Show: affected orders, proposed reassignments, unassignable orders

### Tests
- Incremental solve: adding one order to existing plan
- Solution scoring: high utilization + tight windows = high confidence
- Rolling planner: new order triggers re-evaluation
- What-if: vehicle removal impact calculation
- Confidence → auto-assign vs. validation queue

### Estimated Scope
- 1 new table
- 1 new Edge Function (~100 lines)
- 1 new lib module (~300 lines)
- Enhance vrpSolver (~100 lines added)
- Enhance usePlanningDrafts hook (~50 lines)
- 1 new UI component (~150 lines)
- ~25 test cases

---

## Plan E: Autonomous Dispatch & Execution

### Purpose
Automatically send trips to drivers at the right time, detect anomalies during execution, and handle disruptions with real-time replanning.

### What Changes vs. Current Flow

| Step | Current | Autonomous |
|------|---------|------------|
| Dispatch | Planner manually sends trip to driver | Auto-dispatch X minutes before first stop (configurable) |
| Driver tracking | Location logged, shown on map | Anomaly detection: stationary too long, wrong route, behind schedule |
| Disruption | Planner manually reassigns | System detects delay → re-plans remaining stops → informs stakeholders |
| POD | Driver taps "delivered" + photo | Geofence auto-detects arrival, driver confirms with one tap |

### New Database Objects

#### `dispatch_rules`
Per-tenant dispatch automation config.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| tenant_id | UUID FK → tenants | |
| auto_dispatch_enabled | BOOLEAN DEFAULT false | |
| dispatch_lead_time_min | INTEGER DEFAULT 60 | Send trip X min before first stop |
| anomaly_stationary_min | INTEGER DEFAULT 20 | Alert if driver stationary this long |
| anomaly_late_threshold_min | INTEGER DEFAULT 15 | Alert if ETA exceeds window by this much |
| auto_replan_enabled | BOOLEAN DEFAULT false | Auto-replan on disruptions |

#### `execution_anomalies`
Detected anomalies during trip execution.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| tenant_id | UUID FK → tenants | |
| trip_id | UUID FK → trips | |
| driver_id | UUID FK → drivers | |
| anomaly_type | TEXT NOT NULL | STATIONARY / LATE / OFF_ROUTE / MISSED_WINDOW |
| detected_at | TIMESTAMPTZ DEFAULT now() | |
| details | JSONB | Location, expected vs actual, etc. |
| resolution | TEXT | AUTO_REPLANNED / PLANNER_RESOLVED / IGNORED |
| resolved_at | TIMESTAMPTZ | |

### New Lib Modules

#### `src/lib/autoDispatcher.ts`
- `getTripsReadyForDispatch(tenantId, now)` → trips where first stop is within lead_time
- `dispatchTrip(tripId)` → push to driver app, update status, record decision

#### `src/lib/anomalyDetector.ts`
- `evaluateDriverPosition(driverId, position, currentTrip)` → anomalies[]
- `detectLateArrivals(tripId)` → stops where ETA > window_end
- Runs on each `driver_positions` insert

#### `src/lib/realtimeReplanner.ts`
- `replanOnDelay(tripId, delayedStopId)` → reorder remaining stops or reassign to another vehicle
- `notifyStakeholders(changes)` → trigger notifications for affected recipients

### New Edge Function: `supabase/functions/dispatch-scheduler/index.ts`
- Runs on cron (every 5 min) or on `trips` status change
- Checks dispatch_rules → auto-dispatches eligible trips

### Tests
- Auto-dispatch timing logic
- Anomaly detection: stationary, late, off-route scenarios
- Replanning: delay propagation through remaining stops
- Notification triggers on disruption

### Estimated Scope
- 2 new tables
- 3 new lib modules (~400 lines total)
- 1 new Edge Function (~100 lines)
- Modify driver tracking hook (~50 lines)
- ~20 test cases

---

## Plan F: Autonomous Financial Processing

### Purpose
When a trip completes, automatically calculate price, generate invoice, monitor margins, and predict cashflow — with human review only when confidence is below threshold.

### What Changes vs. Current Flow

| Step | Current | Autonomous |
|------|---------|------------|
| Price calculation | Planner reviews pricing before invoice | Auto-calculate on trip completion, auto-approve at confidence ≥ threshold |
| Invoice creation | Manual: select orders → generate invoice | Auto-generate draft invoice when all orders in a trip are delivered |
| Invoice sending | Planner reviews and clicks send | At confidence ≥ threshold (high, e.g. 98%): auto-send |
| Margin check | Manual via rapportage page | Real-time alert when trip margin < configurable threshold |
| Cashflow | Not available | Predict incoming payments based on invoice due dates + client payment history |

### New Database Objects

#### `auto_invoice_log`
Tracks auto-generated invoices and their accuracy.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| tenant_id | UUID FK → tenants | |
| invoice_id | UUID FK → invoices | |
| trigger_trip_id | UUID FK → trips | |
| auto_calculated_total | NUMERIC | What the system calculated |
| final_total | NUMERIC | What was actually invoiced (after human review) |
| price_accuracy_pct | NUMERIC | |
| was_auto_sent | BOOLEAN DEFAULT false | |
| created_at | TIMESTAMPTZ DEFAULT now() | |

#### `margin_alerts`
Proactive margin warnings.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| tenant_id | UUID FK → tenants | |
| entity_type | TEXT NOT NULL | trip / client / route |
| entity_id | UUID NOT NULL | |
| margin_pct | NUMERIC | Calculated margin |
| threshold_pct | NUMERIC | Tenant's threshold |
| alert_status | TEXT DEFAULT 'ACTIVE' | ACTIVE / ACKNOWLEDGED / RESOLVED |
| created_at | TIMESTAMPTZ DEFAULT now() | |

#### `cashflow_predictions`
Forward-looking payment predictions.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| tenant_id | UUID FK → tenants | |
| invoice_id | UUID FK → invoices | |
| predicted_payment_date | DATE | Based on client payment terms + history |
| actual_payment_date | DATE | Filled when paid |
| amount | NUMERIC | |
| client_id | UUID FK → clients | |

#### ALTER `tenants.settings` JSONB (add to autonomy section)
```jsonc
{
  "autonomy": {
    "financial": {
      "auto_invoice_enabled": false,
      "auto_send_threshold": 98,
      "min_margin_pct": 15,
      "margin_alert_enabled": true
    }
  }
}
```

### Changes to Existing Code

#### `src/lib/pricingEngine.ts` — Enhance
- Add `calculateWithConfidence(order, rateCard, surcharges)` → `PriceBreakdown & { confidence: number }`
- Confidence based on: rule match specificity, historical price accuracy for this client, number of surcharges applied

#### New lib: `src/lib/autoInvoicer.ts`
- `onTripCompleted(tripId)` → calculate prices for all orders, generate draft invoice, evaluate confidence
- `evaluateInvoiceConfidence(invoice, trip)` → score based on pricing confidence + past accuracy

#### New lib: `src/lib/marginMonitor.ts`
- `calculateTripMargin(tripId)` → { revenue, costs, margin_eur, margin_pct }
- `checkMarginThreshold(tripId, tenantSettings)` → create alert if below threshold

#### New lib: `src/lib/cashflowPredictor.ts`
- `predictPaymentDate(invoiceId)` → based on client's payment_terms + historical avg days to pay
- `getCashflowForecast(tenantId, days)` → daily expected inflow for next N days

### New Edge Function: `supabase/functions/financial-trigger/index.ts`
- Triggered on trip status = COMPLETED
- Runs auto-pricing → auto-invoice → margin check → cashflow update

### Tests
- Pricing confidence calculation
- Auto-invoice generation on trip completion
- Margin alert thresholds
- Cashflow prediction accuracy
- Full flow: trip completes → invoice generated → decision logged

### Estimated Scope
- 3 new tables + 1 ALTER
- 4 new lib modules (~500 lines total)
- 1 new Edge Function (~100 lines)
- Enhance pricingEngine (~50 lines)
- ~25 test cases

---

## Plan G: Autonomy Dashboard

### Purpose
Give the tenant owner/planner full visibility into how autonomous the system is, what it's learning, where it needs improvement, and what decisions it made.

### UI Components

#### Main Dashboard Widget: `src/components/dashboard/AutonomyScoreCard.tsx`
```
AUTONOMY SCORE: 73%
████████████████████░░░░░░░  73/100

Order Intake     ████████████░  89%
Planning         ██████████░░░  71%
Dispatch         █████████░░░░  65%
Invoicing        ████████░░░░░  62%

Today: 34 autonomous / 8 validated / 2 manual
This week: 2 corrections by planner
```

#### Decision Feed: `src/components/dashboard/DecisionFeed.tsx`
Real-time feed of autonomous actions:
- "Auto-confirmed order #1842 from Van der Berg (confidence: 94%)"
- "Waiting for approval: trip assignment for ADR order #1845 (confidence: 82%)"
- "Auto-invoice #INV-2026-0891 sent to Fresh Express (confidence: 99%)"

#### Learning Progress: `src/components/dashboard/LearningProgress.tsx`
Per-client learning curve:
- "Van der Berg: 47 orders processed, 94% confidence, autonomous since week 8"
- "Fresh Express: 12 orders processed, 78% confidence, still in validation mode"

#### Correction Log: `src/components/dashboard/CorrectionLog.tsx`
What the planner changed vs. what the system proposed:
- Shows patterns: "You've changed vehicle assignment for ADR orders 4 times this week → system is learning"

### New Page: `src/pages/Autonomie.tsx`
Full-page autonomy management:
- Score overview per module
- Tenant threshold configuration (sliders per decision type)
- Decision history with filters
- Client-level autonomy drill-down
- Trend charts (weekly autonomy progression)

### New Hook: `src/hooks/useAutonomyDashboard.ts`
```typescript
useAutonomyScore(): { overall: number, perModule: Record<DecisionType, number> }
useDecisionFeed(limit?: number): DecisionLogEntry[]
useLearningProgress(clientId?: string): LearningMetric[]
useCorrectionLog(dateRange?: DateRange): CorrectionEntry[]
useAutonomyTrend(weeks?: number): TrendDataPoint[]
```

### Tests
- Score aggregation from confidence_scores table
- Trend calculation (weekly rolling)
- Correction pattern detection

### Estimated Scope
- 0 new tables (reads from Plan A's tables)
- 1 new page (~200 lines)
- 4 new dashboard components (~400 lines total)
- 1 new hook (~150 lines)
- ~10 test cases

---

## Summary: Total New Database Objects

### New Tables (10)
1. `decision_log` (A)
2. `confidence_scores` (A)
3. `pipeline_events` (B)
4. `validation_queue` (B)
5. `client_address_book` (C)
6. `planning_events` (D)
7. `dispatch_rules` (E)
8. `execution_anomalies` (E)
9. `auto_invoice_log` (F)
10. `margin_alerts` (F)
11. `cashflow_predictions` (F)

### ALTER Existing Tables
- `tenants.settings` JSONB — add autonomy config (A, F)
- `client_extraction_templates` — add learning fields (C)

### New Edge Functions (4)
1. `pipeline-trigger` (B)
2. `planning-trigger` (D)
3. `dispatch-scheduler` (E)
4. `financial-trigger` (F)

### New Lib Modules (12)
1. `confidenceEngine.ts` (A)
2. `pipelineOrchestrator.ts` (B)
3. `addressResolver.ts` (C)
4. `capacityPreCheck.ts` (C)
5. `rollingPlanner.ts` (D)
6. `autoDispatcher.ts` (E)
7. `anomalyDetector.ts` (E)
8. `realtimeReplanner.ts` (E)
9. `autoInvoicer.ts` (F)
10. `marginMonitor.ts` (F)
11. `cashflowPredictor.ts` (F)
12. Enhanced: `vrpSolver.ts` (D), `pricingEngine.ts` (F)

### New Hooks (5)
1. `useConfidence.ts` (A)
2. `useValidationQueue.ts` (B)
3. `usePlanningEvents.ts` (D)
4. `useAutonomyDashboard.ts` (G)
5. Enhanced: `useInbox.ts` (C), `usePlanningDrafts.ts` (D)

### New UI Components (7)
1. `ValidationBanner.tsx` (B)
2. `WhatIfPanel.tsx` (D)
3. `AutonomyScoreCard.tsx` (G)
4. `DecisionFeed.tsx` (G)
5. `LearningProgress.tsx` (G)
6. `CorrectionLog.tsx` (G)
7. `Autonomie.tsx` page (G)

### New Pages (1)
1. `/autonomie` — Autonomy management dashboard (G)

### Estimated Test Cases
- Plan A: ~15
- Plan B: ~20
- Plan C: ~20
- Plan D: ~25
- Plan E: ~20
- Plan F: ~25
- Plan G: ~10
- **Total: ~135 new test cases**

---

## Recommended Execution Timeline

```
Week 1-2:  Plan A (Confidence Store) — foundation for everything
Week 2-3:  Plan B (Event Pipeline) — enables all autonomous modules
Week 3-4:  Plan C (Order Intake) — highest impact, most data to learn from
Week 4-6:  Plan D (Planning) — complex, needs most iteration
Week 5-6:  Plan F (Financial) — can parallel with D
Week 6-7:  Plan E (Dispatch) — depends on D being stable
Week 7-8:  Plan G (Dashboard) — reads from everything, build last
```

**Total estimated: ~2200 lines new code, ~135 tests, 11 new tables, 4 Edge Functions.**
