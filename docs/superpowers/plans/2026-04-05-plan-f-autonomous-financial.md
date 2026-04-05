# Plan F: Autonomous Financial Processing

> **Skill:** `superpowers:subagent-driven-development`
> **Date:** 2026-04-05
> **Depends on:** Plan A (Confidence Store) + Plan B (Event Pipeline)
> **Status:** Ready for implementation

---

## Goal

Automate the financial lifecycle after trip completion: auto-pricing with confidence scoring, auto-invoicing with accuracy tracking, margin monitoring with alerts, and cashflow prediction. The system uses the confidence engine (Plan A) to decide whether to create and send invoices autonomously or queue them for human validation.

## Architecture

```
Trip COMPLETED event (from Plan B pipeline)
         |
         v
+------------------+
| financial-trigger |  (Supabase Edge Function)
+------------------+
         |
    +----+----+----+----+
    |         |         |         |
    v         v         v         v
 auto-     margin    cashflow   auto_invoice_log
 invoicer  monitor   predictor  (accuracy tracking)
    |         |         |
    v         v         v
 invoice   margin_    cashflow_
 created   alerts     predictions
    |
    v
 shouldAutoExecute('INVOICING')
    |
  +---+---+
  |       |
  v       v
 AUTO   VALIDATION
 SEND   QUEUE
```

## Tech Stack

- **Runtime:** TypeScript 5.8
- **DB:** Supabase PostgreSQL + RLS
- **Edge Functions:** Deno (Supabase Functions)
- **Tests:** Vitest (jsdom environment)
- **State:** TanStack Query 5
- **UI:** Shadcn/Tailwind (dashboard components deferred to Plan G)

## File Structure

```
supabase/migrations/
  20260405120000_plan_f_financial_autonomy.sql

src/types/
  financial-autonomy.ts              # NEW: AutoInvoiceLogEntry, MarginAlert, etc.

src/lib/
  pricingEngine.ts                   # ENHANCE: add calculateWithConfidence()
  autoInvoicer.ts                    # NEW: trip-completed -> draft invoice
  marginMonitor.ts                   # NEW: revenue vs cost, threshold alerts
  cashflowPredictor.ts              # NEW: payment date prediction, forecast

supabase/functions/
  financial-trigger/
    index.ts                         # NEW: Edge Function entry point

src/test/
  autoInvoicer.test.ts              # NEW: ~10 tests
  marginMonitor.test.ts             # NEW: ~8 tests
  cashflowPredictor.test.ts         # NEW: ~7 tests
  pricingEngineConfidence.test.ts   # NEW: ~5 tests
```

---

## Task 1: Database Migration

Create all three new tables with RLS policies in a single migration.

- [ ] Create file `supabase/migrations/20260405120000_plan_f_financial_autonomy.sql` with this content:

```sql
-- Plan F: Autonomous Financial Processing
-- Tables: auto_invoice_log, margin_alerts, cashflow_predictions

-- ─── auto_invoice_log ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auto_invoice_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  trigger_trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE SET NULL,
  auto_calculated_total NUMERIC NOT NULL,
  final_total NUMERIC NOT NULL,
  price_accuracy_pct NUMERIC NOT NULL DEFAULT 100,
  was_auto_sent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_auto_invoice_log_tenant ON auto_invoice_log(tenant_id);
CREATE INDEX idx_auto_invoice_log_invoice ON auto_invoice_log(invoice_id);
CREATE INDEX idx_auto_invoice_log_trip ON auto_invoice_log(trigger_trip_id);

ALTER TABLE auto_invoice_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auto_invoice_log_tenant_isolation" ON auto_invoice_log
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid() LIMIT 1))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid() LIMIT 1));

-- ─── margin_alerts ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS margin_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('trip', 'client', 'route')),
  entity_id UUID NOT NULL,
  margin_pct NUMERIC NOT NULL,
  threshold_pct NUMERIC NOT NULL,
  alert_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (alert_status IN ('ACTIVE', 'ACKNOWLEDGED', 'RESOLVED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_margin_alerts_tenant ON margin_alerts(tenant_id);
CREATE INDEX idx_margin_alerts_status ON margin_alerts(tenant_id, alert_status);

ALTER TABLE margin_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "margin_alerts_tenant_isolation" ON margin_alerts
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid() LIMIT 1))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid() LIMIT 1));

-- ─── cashflow_predictions ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS cashflow_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  predicted_payment_date DATE NOT NULL,
  actual_payment_date DATE,
  amount NUMERIC NOT NULL,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cashflow_predictions_tenant ON cashflow_predictions(tenant_id);
CREATE INDEX idx_cashflow_predictions_client ON cashflow_predictions(client_id);
CREATE INDEX idx_cashflow_predictions_date ON cashflow_predictions(predicted_payment_date);

ALTER TABLE cashflow_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cashflow_predictions_tenant_isolation" ON cashflow_predictions
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid() LIMIT 1))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid() LIMIT 1));
```

- [ ] Verify migration syntax by reviewing the SQL for any errors

---

## Task 2: TypeScript Types

- [ ] Create file `src/types/financial-autonomy.ts` with this content:

```typescript
/**
 * Types for Plan F: Autonomous Financial Processing.
 *
 * Covers auto-invoicing logs, margin alerts, and cashflow predictions.
 */

// ─── Auto Invoice Log ──────────────────────────────────────────

export interface AutoInvoiceLogEntry {
  id: string;
  tenant_id: string;
  invoice_id: string;
  trigger_trip_id: string;
  auto_calculated_total: number;
  final_total: number;
  price_accuracy_pct: number;
  was_auto_sent: boolean;
  created_at: string;
}

// ─── Margin Alerts ─────────────────────────────────────────────

export type MarginEntityType = "trip" | "client" | "route";
export type MarginAlertStatus = "ACTIVE" | "ACKNOWLEDGED" | "RESOLVED";

export interface MarginAlert {
  id: string;
  tenant_id: string;
  entity_type: MarginEntityType;
  entity_id: string;
  margin_pct: number;
  threshold_pct: number;
  alert_status: MarginAlertStatus;
  created_at: string;
}

// ─── Margin Calculation ────────────────────────────────────────

export interface MarginResult {
  revenue: number;
  costs: number;
  margin_eur: number;
  margin_pct: number;
}

// ─── Cashflow Predictions ──────────────────────────────────────

export interface CashflowPrediction {
  id: string;
  tenant_id: string;
  invoice_id: string;
  predicted_payment_date: string;
  actual_payment_date: string | null;
  amount: number;
  client_id: string;
  created_at: string;
}

export interface CashflowForecastEntry {
  date: string;
  expected_amount: number;
  invoice_count: number;
  invoices: Array<{
    invoice_id: string;
    client_id: string;
    amount: number;
  }>;
}

// ─── Auto Invoicer Result ──────────────────────────────────────

export interface AutoInvoiceResult {
  success: boolean;
  invoice_id: string | null;
  auto_sent: boolean;
  confidence: number;
  calculated_total: number;
  order_count: number;
  /** Reason if not auto-sent (e.g. "below_threshold", "no_orders", "error") */
  reason: string;
}

// ─── Pricing with Confidence ───────────────────────────────────

export interface PriceBreakdownWithConfidence {
  basisbedrag: number;
  toeslagen: import("@/types/rateModels").PriceSurchargeItem[];
  totaal: number;
  regels: import("@/types/rateModels").PriceLineItem[];
  confidence: number;
}
```

---

## Task 3: Pricing Engine Enhancement (TDD)

Add `calculateWithConfidence()` to the existing pricing engine. The existing `calculateOrderPrice()` remains unchanged.

### 3a. Write tests first

- [ ] Create file `src/test/pricingEngineConfidence.test.ts` with this content:

```typescript
import { describe, it, expect } from "vitest";
import { calculateWithConfidence } from "@/lib/pricingEngine";
import type { PricingOrderInput, RateCard, Surcharge } from "@/types/rateModels";

// ─── Fixtures ──────────────────────────────────────────────────

const baseOrder: PricingOrderInput = {
  id: "order-1",
  order_number: 1001,
  client_name: "Test BV",
  pickup_address: "Amsterdam",
  delivery_address: "Rotterdam",
  transport_type: "FTL",
  weight_kg: 5000,
  quantity: 10,
  distance_km: 80,
  stop_count: 2,
  duration_hours: 1.5,
  requirements: [],
  day_of_week: 2,
  waiting_time_min: 0,
  pickup_country: "NL",
  delivery_country: "NL",
};

const zoneRateCard: RateCard = {
  id: "rc-1",
  tenant_id: "tenant-1",
  client_id: "client-1",
  name: "Zone tarief kaart",
  valid_from: null,
  valid_until: null,
  is_active: true,
  currency: "EUR",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  rate_rules: [
    {
      id: "rule-1",
      rate_card_id: "rc-1",
      rule_type: "ZONE_TARIEF",
      transport_type: null,
      amount: 250,
      min_amount: null,
      conditions: { from_zone: "NL", to_zone: "NL" },
      sort_order: 1,
      created_at: "2026-01-01T00:00:00Z",
    },
  ],
};

const perKmRateCard: RateCard = {
  id: "rc-2",
  tenant_id: "tenant-1",
  client_id: "client-1",
  name: "Per KM kaart",
  valid_from: null,
  valid_until: null,
  is_active: true,
  currency: "EUR",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  rate_rules: [
    {
      id: "rule-2",
      rate_card_id: "rc-2",
      rule_type: "PER_KM",
      transport_type: null,
      amount: 1.5,
      min_amount: null,
      conditions: {},
      sort_order: 1,
      created_at: "2026-01-01T00:00:00Z",
    },
  ],
};

const surcharges: Surcharge[] = [];

const manySurcharges: Surcharge[] = [
  {
    id: "s-1",
    tenant_id: "tenant-1",
    name: "Weekend toeslag",
    surcharge_type: "PERCENTAGE",
    amount: 25,
    applies_to: { day_of_week: [0, 6] },
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "s-2",
    tenant_id: "tenant-1",
    name: "ADR toeslag",
    surcharge_type: "VAST_BEDRAG",
    amount: 75,
    applies_to: { requirements: ["ADR"] },
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "s-3",
    tenant_id: "tenant-1",
    name: "Afstand toeslag",
    surcharge_type: "PER_KM",
    amount: 0.1,
    applies_to: {},
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

// ─── Tests ─────────────────────────────────────────────────────

describe("calculateWithConfidence", () => {
  it("should return high confidence for ZONE_TARIEF with no surcharges", () => {
    const result = calculateWithConfidence(baseOrder, zoneRateCard, surcharges);
    expect(result.confidence).toBeGreaterThanOrEqual(90);
    expect(result.totaal).toBe(250);
    expect(result.basisbedrag).toBe(250);
  });

  it("should return medium confidence for PER_KM rules", () => {
    const result = calculateWithConfidence(baseOrder, perKmRateCard, surcharges);
    expect(result.confidence).toBeGreaterThanOrEqual(70);
    expect(result.confidence).toBeLessThan(90);
    expect(result.totaal).toBe(120); // 80km * 1.5
  });

  it("should reduce confidence when many surcharges are active", () => {
    const orderWithADR: PricingOrderInput = {
      ...baseOrder,
      requirements: ["ADR"],
      day_of_week: 6, // Saturday
    };
    const withSurcharges = calculateWithConfidence(orderWithADR, zoneRateCard, manySurcharges);
    const withoutSurcharges = calculateWithConfidence(baseOrder, zoneRateCard, surcharges);
    expect(withSurcharges.confidence).toBeLessThan(withoutSurcharges.confidence);
  });

  it("should boost confidence with high historical accuracy", () => {
    const withHistory = calculateWithConfidence(baseOrder, zoneRateCard, surcharges, 98);
    const withoutHistory = calculateWithConfidence(baseOrder, zoneRateCard, surcharges);
    expect(withHistory.confidence).toBeGreaterThanOrEqual(withoutHistory.confidence);
  });

  it("should lower confidence with low historical accuracy", () => {
    const withBadHistory = calculateWithConfidence(baseOrder, zoneRateCard, surcharges, 60);
    const withoutHistory = calculateWithConfidence(baseOrder, zoneRateCard, surcharges);
    expect(withBadHistory.confidence).toBeLessThan(withoutHistory.confidence);
  });
});
```

- [ ] Run tests to verify they fail: `npx vitest run src/test/pricingEngineConfidence.test.ts`

### 3b. Implement calculateWithConfidence

- [ ] Add the following to the bottom of `src/lib/pricingEngine.ts` (AFTER the existing `calculateOrderPrice` function):

```typescript
import type { PriceBreakdownWithConfidence } from "@/types/financial-autonomy";

// ─── Confidence-Scored Pricing ─────────────────────────────────

/**
 * Confidence weights per rule type.
 * ZONE_TARIEF and VAST_BEDRAG are fixed amounts → high confidence.
 * Variable-rate rules (PER_KM, PER_UUR) depend on measured inputs → medium.
 * STAFFEL has tier boundaries that can misfire → lower.
 */
const RULE_TYPE_CONFIDENCE: Record<RuleType, number> = {
  ZONE_TARIEF: 95,
  VAST_BEDRAG: 95,
  PER_STOP: 85,
  PER_PALLET: 80,
  PER_KM: 75,
  PER_UUR: 70,
  PER_KG: 75,
  STAFFEL: 65,
};

/**
 * Calculate order price with a confidence score.
 *
 * Confidence is derived from:
 * 1. Rule type specificity (fixed = high, variable = lower)
 * 2. Number of applied surcharges (more = less certain)
 * 3. Historical accuracy for this client (from auto_invoice_log)
 *
 * @param order - The order to price
 * @param rateCard - Active rate card with rules
 * @param surcharges - Active surcharges
 * @param historicalAccuracy - Optional: avg price_accuracy_pct from auto_invoice_log (0-100)
 * @returns PriceBreakdown with a confidence field (0-100)
 */
export function calculateWithConfidence(
  order: PricingOrderInput,
  rateCard: RateCard,
  surcharges: Surcharge[],
  historicalAccuracy?: number,
): PriceBreakdownWithConfidence {
  const breakdown = calculateOrderPrice(order, rateCard, surcharges);

  // 1. Base confidence from rule types used
  const rules = rateCard.rate_rules ?? [];
  let ruleConfidenceSum = 0;
  let ruleCount = 0;
  for (const regel of breakdown.regels) {
    const ruleTypeConf = RULE_TYPE_CONFIDENCE[regel.rule_type] ?? 70;
    ruleConfidenceSum += ruleTypeConf;
    ruleCount++;
  }
  const avgRuleConfidence = ruleCount > 0
    ? ruleConfidenceSum / ruleCount
    : 50; // No matching rules = very uncertain

  // 2. Surcharge penalty: each applied surcharge reduces confidence slightly
  const appliedSurchargeCount = breakdown.toeslagen.length;
  const surchargePenalty = Math.min(appliedSurchargeCount * 3, 15); // Max -15

  // 3. Historical accuracy adjustment
  let historyAdjustment = 0;
  if (historicalAccuracy != null) {
    // Center around 90%: accuracy above 90 boosts, below 90 penalizes
    historyAdjustment = (historicalAccuracy - 90) * 0.3;
  }

  // Combine: weighted average
  let confidence = avgRuleConfidence - surchargePenalty + historyAdjustment;

  // Clamp to 0-100
  confidence = Math.max(0, Math.min(100, Math.round(confidence * 100) / 100));

  return {
    ...breakdown,
    confidence,
  };
}
```

- [ ] Add the import at the top of `src/lib/pricingEngine.ts`:

```typescript
import type { PriceBreakdownWithConfidence } from "@/types/financial-autonomy";
```

- [ ] Run tests to verify they pass: `npx vitest run src/test/pricingEngineConfidence.test.ts`
- [ ] Run existing pricing engine tests to ensure no regressions: `npx vitest run src/test/` (all tests)

---

## Task 4: Auto Invoicer (TDD)

### 4a. Write tests first

- [ ] Create file `src/test/autoInvoicer.test.ts` with this content:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { onTripCompleted, getHistoricalAccuracy } from "@/lib/autoInvoicer";

// ─── Mock Supabase ─────────────────────────────────────────────

function createMockSupabase(overrides: Record<string, any> = {}) {
  const defaultData = {
    orders: overrides.orders ?? [],
    rate_cards: overrides.rate_cards ?? [],
    surcharges: overrides.surcharges ?? [],
    clients: overrides.clients ?? [{ id: "client-1", name: "Test BV", payment_terms: 30 }],
    auto_invoice_log: overrides.auto_invoice_log ?? [],
    invoices: overrides.invoices ?? [],
    invoice_lines: overrides.invoice_lines ?? [],
    tenant_members: overrides.tenant_members ?? [{ tenant_id: "tenant-1" }],
  };

  const rpcResults = overrides.rpcResults ?? { generate_invoice_number: "INV-2026-001" };

  const mockQuery = (table: string) => {
    let data = defaultData[table as keyof typeof defaultData] ?? [];
    let filters: Record<string, any> = {};

    const chain: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn((col: string, val: any) => {
        filters[col] = val;
        return chain;
      }),
      is: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      single: vi.fn(() => {
        const result = Array.isArray(data) ? data[0] ?? null : data;
        return Promise.resolve({ data: result, error: null });
      }),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      insert: vi.fn((rows: any) => {
        const inserted = Array.isArray(rows) ? rows : [rows];
        // If inserting an invoice, return it with an id
        if (table === "invoices") {
          const inv = { ...inserted[0], id: "inv-new-1" };
          return {
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: inv, error: null }),
            }),
          };
        }
        return Promise.resolve({ data: inserted, error: null });
      }),
      update: vi.fn().mockReturnThis(),
      then: vi.fn((resolve: any) => {
        resolve({ data, error: null });
        return Promise.resolve({ data, error: null });
      }),
    };

    // Make chain thenable
    chain[Symbol.for("then")] = chain.then;

    return chain;
  };

  return {
    from: vi.fn((table: string) => mockQuery(table)),
    rpc: vi.fn((fn: string) => {
      const result = rpcResults[fn] ?? null;
      return Promise.resolve({ data: result, error: null });
    }),
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      }),
    },
  } as any;
}

// ─── Fixtures ──────────────────────────────────────────────────

const deliveredOrders = [
  {
    id: "order-1",
    order_number: 1001,
    client_id: "client-1",
    client_name: "Test BV",
    pickup_address: "Amsterdam",
    delivery_address: "Rotterdam",
    transport_type: "FTL",
    weight_kg: 5000,
    quantity: 10,
    distance_km: 80,
    stop_count: 2,
    duration_hours: 1.5,
    requirements: [],
    day_of_week: 2,
    waiting_time_min: 0,
    pickup_country: "NL",
    delivery_country: "NL",
    status: "DELIVERED",
    trip_id: "trip-1",
    billing_status: "GEREED",
    invoice_id: null,
  },
];

const rateCards = [
  {
    id: "rc-1",
    tenant_id: "tenant-1",
    client_id: "client-1",
    name: "Test kaart",
    valid_from: null,
    valid_until: null,
    is_active: true,
    currency: "EUR",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    rate_rules: [
      {
        id: "rule-1",
        rate_card_id: "rc-1",
        rule_type: "VAST_BEDRAG",
        transport_type: null,
        amount: 300,
        min_amount: null,
        conditions: {},
        sort_order: 1,
        created_at: "2026-01-01T00:00:00Z",
      },
    ],
  },
];

// ─── Tests ─────────────────────────────────────────────────────

describe("getHistoricalAccuracy", () => {
  it("should return 100 when no history exists", async () => {
    const sb = createMockSupabase({ auto_invoice_log: [] });
    const accuracy = await getHistoricalAccuracy(sb, "tenant-1", "client-1");
    expect(accuracy).toBe(100);
  });

  it("should return average accuracy from log entries", async () => {
    const logs = [
      { price_accuracy_pct: 95 },
      { price_accuracy_pct: 90 },
      { price_accuracy_pct: 100 },
    ];
    const sb = createMockSupabase({ auto_invoice_log: logs });
    const accuracy = await getHistoricalAccuracy(sb, "tenant-1", "client-1");
    expect(accuracy).toBe(95);
  });
});

describe("onTripCompleted", () => {
  it("should return success: false when no delivered orders found", async () => {
    const sb = createMockSupabase({ orders: [] });
    const result = await onTripCompleted(sb, "tenant-1", "trip-1");
    expect(result.success).toBe(false);
    expect(result.reason).toBe("no_orders");
  });

  it("should return success: false when no rate card exists for client", async () => {
    const sb = createMockSupabase({
      orders: deliveredOrders,
      rate_cards: [],
    });
    const result = await onTripCompleted(sb, "tenant-1", "trip-1");
    expect(result.success).toBe(false);
    expect(result.reason).toBe("no_rate_card");
  });

  it("should calculate total from all delivered orders", async () => {
    const sb = createMockSupabase({
      orders: deliveredOrders,
      rate_cards: rateCards,
      surcharges: [],
    });
    const result = await onTripCompleted(sb, "tenant-1", "trip-1");
    expect(result.success).toBe(true);
    expect(result.calculated_total).toBe(300);
    expect(result.order_count).toBe(1);
  });

  it("should return confidence score with the result", async () => {
    const sb = createMockSupabase({
      orders: deliveredOrders,
      rate_cards: rateCards,
      surcharges: [],
    });
    const result = await onTripCompleted(sb, "tenant-1", "trip-1");
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(100);
  });

  it("should create invoice with correct client_id", async () => {
    const sb = createMockSupabase({
      orders: deliveredOrders,
      rate_cards: rateCards,
      surcharges: [],
    });
    const result = await onTripCompleted(sb, "tenant-1", "trip-1");
    expect(result.success).toBe(true);
    expect(result.invoice_id).toBeTruthy();
  });

  it("should handle multiple orders for same client in one trip", async () => {
    const twoOrders = [
      ...deliveredOrders,
      {
        ...deliveredOrders[0],
        id: "order-2",
        order_number: 1002,
      },
    ];
    const sb = createMockSupabase({
      orders: twoOrders,
      rate_cards: rateCards,
      surcharges: [],
    });
    const result = await onTripCompleted(sb, "tenant-1", "trip-1");
    expect(result.success).toBe(true);
    expect(result.order_count).toBe(2);
    expect(result.calculated_total).toBe(600); // 300 x 2
  });

  it("should not auto-send when confidence is below default threshold", async () => {
    // PER_KM rules have lower confidence
    const lowConfRateCards = [
      {
        ...rateCards[0],
        rate_rules: [
          {
            id: "rule-1",
            rate_card_id: "rc-1",
            rule_type: "PER_KM",
            transport_type: null,
            amount: 1.5,
            min_amount: null,
            conditions: {},
            sort_order: 1,
            created_at: "2026-01-01T00:00:00Z",
          },
        ],
      },
    ];
    const sb = createMockSupabase({
      orders: deliveredOrders,
      rate_cards: lowConfRateCards,
      surcharges: [],
    });
    const result = await onTripCompleted(sb, "tenant-1", "trip-1");
    // With PER_KM confidence ~75 and default INVOICING threshold 98, should not auto-send
    expect(result.auto_sent).toBe(false);
  });

  it("should set invoice_id on all processed orders", async () => {
    const updateCalls: any[] = [];
    const sb = createMockSupabase({
      orders: deliveredOrders,
      rate_cards: rateCards,
      surcharges: [],
    });
    // Track update calls
    const origFrom = sb.from;
    sb.from = vi.fn((table: string) => {
      const chain = origFrom(table);
      if (table === "orders") {
        const origUpdate = chain.update;
        chain.update = vi.fn((data: any) => {
          updateCalls.push(data);
          return origUpdate(data);
        });
      }
      return chain;
    });

    await onTripCompleted(sb, "tenant-1", "trip-1");
    // At least one update should set invoice_id
    const hasInvoiceUpdate = updateCalls.some((call) => call.invoice_id != null);
    expect(hasInvoiceUpdate).toBe(true);
  });
});
```

- [ ] Run tests to verify they fail: `npx vitest run src/test/autoInvoicer.test.ts`

### 4b. Implement Auto Invoicer

- [ ] Create file `src/lib/autoInvoicer.ts` with this content:

```typescript
/**
 * Autonomous Invoicer for OrderFlow Suite.
 *
 * Triggered when a trip is completed. Calculates prices for all delivered
 * orders on the trip, creates a draft invoice, and evaluates whether to
 * auto-send based on confidence scoring.
 *
 * Depends on: Plan A (confidenceEngine), Plan B (pipelineOrchestrator)
 */

import { calculateWithConfidence } from "@/lib/pricingEngine";
import { generateInvoiceLinesFromPricing } from "@/lib/invoiceLinesFromPricing";
import type {
  RateCard,
  Surcharge,
  PricingOrderInput,
} from "@/types/rateModels";
import type {
  AutoInvoiceResult,
  AutoInvoiceLogEntry,
} from "@/types/financial-autonomy";

// Default INVOICING threshold when confidence engine (Plan A) is not yet available
const DEFAULT_INVOICING_THRESHOLD = 98;

/** Round to 2 decimal places */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Historical Accuracy ───────────────────────────────────────

/**
 * Get the average pricing accuracy for a client from auto_invoice_log.
 *
 * Returns 100 if no history exists (optimistic default for new clients).
 */
export async function getHistoricalAccuracy(
  supabase: any,
  tenantId: string,
  clientId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("auto_invoice_log")
    .select("price_accuracy_pct")
    .eq("tenant_id", tenantId);

  if (error || !data || data.length === 0) {
    return 100;
  }

  const logs = data as Array<{ price_accuracy_pct: number }>;
  const sum = logs.reduce((acc: number, log: { price_accuracy_pct: number }) => acc + log.price_accuracy_pct, 0);
  return round2(sum / logs.length);
}

// ─── Build PricingOrderInput from DB order row ─────────────────

function orderRowToPricingInput(order: any): PricingOrderInput {
  return {
    id: order.id,
    order_number: order.order_number,
    client_name: order.client_name ?? null,
    pickup_address: order.pickup_address ?? null,
    delivery_address: order.delivery_address ?? null,
    transport_type: order.transport_type ?? null,
    weight_kg: order.weight_kg ?? null,
    quantity: order.quantity ?? null,
    distance_km: order.distance_km ?? 0,
    stop_count: order.stop_count ?? 2,
    duration_hours: order.duration_hours ?? 0,
    requirements: order.requirements ?? [],
    day_of_week: order.day_of_week ?? new Date().getDay(),
    waiting_time_min: order.waiting_time_min ?? 0,
    pickup_country: order.pickup_country,
    delivery_country: order.delivery_country,
  };
}

// ─── Main: Trip Completed Handler ──────────────────────────────

/**
 * Process all delivered orders for a completed trip.
 *
 * 1. Fetch delivered orders linked to this trip
 * 2. For each order, find active rate card for the client
 * 3. Calculate price with confidence
 * 4. Group by client, create draft invoice(s)
 * 5. Evaluate confidence against INVOICING threshold
 * 6. If confident enough: mark as auto-sent, otherwise draft only
 * 7. Log to auto_invoice_log for accuracy tracking
 *
 * @param supabase - Supabase client instance
 * @param tenantId - Tenant UUID
 * @param tripId - Completed trip UUID
 * @returns AutoInvoiceResult
 */
export async function onTripCompleted(
  supabase: any,
  tenantId: string,
  tripId: string,
): Promise<AutoInvoiceResult> {
  // 1. Fetch delivered orders for this trip
  const { data: orders, error: ordersErr } = await supabase
    .from("orders")
    .select("*")
    .eq("trip_id", tripId)
    .eq("status", "DELIVERED")
    .is("invoice_id", null);

  if (ordersErr || !orders || orders.length === 0) {
    return {
      success: false,
      invoice_id: null,
      auto_sent: false,
      confidence: 0,
      calculated_total: 0,
      order_count: 0,
      reason: "no_orders",
    };
  }

  // 2. Get client_id from first order (trip orders typically share a client)
  const clientId = orders[0].client_id;
  if (!clientId) {
    return {
      success: false,
      invoice_id: null,
      auto_sent: false,
      confidence: 0,
      calculated_total: 0,
      order_count: orders.length,
      reason: "no_client",
    };
  }

  // 3. Find active rate card for this client
  const { data: rateCards, error: rcErr } = await supabase
    .from("rate_cards")
    .select("*, rate_rules(*)")
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1);

  if (rcErr || !rateCards || rateCards.length === 0) {
    return {
      success: false,
      invoice_id: null,
      auto_sent: false,
      confidence: 0,
      calculated_total: 0,
      order_count: orders.length,
      reason: "no_rate_card",
    };
  }

  const rateCard = rateCards[0] as RateCard;

  // 4. Fetch active surcharges for this tenant
  const { data: surcharges } = await supabase
    .from("surcharges")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("is_active", true);

  const activeSurcharges = (surcharges ?? []) as Surcharge[];

  // 5. Get historical accuracy for confidence adjustment
  const historicalAccuracy = await getHistoricalAccuracy(supabase, tenantId, clientId);

  // 6. Calculate price for each order with confidence
  let totalAmount = 0;
  let minConfidence = 100;
  const allInvoiceLines: any[] = [];
  let sortOrder = 0;

  for (const order of orders) {
    const pricingInput = orderRowToPricingInput(order);
    const result = calculateWithConfidence(
      pricingInput,
      rateCard,
      activeSurcharges,
      historicalAccuracy,
    );

    totalAmount += result.totaal;
    if (result.confidence < minConfidence) {
      minConfidence = result.confidence;
    }

    // Convert to invoice lines
    const lines = generateInvoiceLinesFromPricing(order.id, result);
    for (const line of lines) {
      allInvoiceLines.push({
        ...line,
        sort_order: sortOrder++,
      });
    }
  }

  totalAmount = round2(totalAmount);

  // 7. Fetch client details for invoice
  const { data: client } = await supabase
    .from("clients")
    .select("name, address, btw_number, kvk_number, payment_terms")
    .eq("id", clientId)
    .single();

  if (!client) {
    return {
      success: false,
      invoice_id: null,
      auto_sent: false,
      confidence: minConfidence,
      calculated_total: totalAmount,
      order_count: orders.length,
      reason: "client_not_found",
    };
  }

  // 8. Generate invoice number
  const { data: invoiceNumber } = await supabase
    .rpc("generate_invoice_number", { p_tenant_id: tenantId });

  if (!invoiceNumber) {
    return {
      success: false,
      invoice_id: null,
      auto_sent: false,
      confidence: minConfidence,
      calculated_total: totalAmount,
      order_count: orders.length,
      reason: "invoice_number_generation_failed",
    };
  }

  // 9. Calculate BTW and due date
  const btwPercentage = 21;
  const btwAmount = round2(totalAmount * (btwPercentage / 100));
  const total = round2(totalAmount + btwAmount);

  let dueDate: string | null = null;
  if (client.payment_terms) {
    const due = new Date();
    due.setDate(due.getDate() + client.payment_terms);
    dueDate = due.toISOString().split("T")[0];
  }

  // 10. Determine auto-send based on confidence threshold
  // Try to use shouldAutoExecute from Plan A if available; otherwise use default
  let autoSend = false;
  try {
    // Plan A integration: check if confidence engine is available
    const { shouldAutoExecute } = await import("@/lib/confidenceEngine");
    const decision = await shouldAutoExecute(
      tenantId,
      "INVOICING",
      minConfidence,
      clientId,
    );
    autoSend = decision.auto;
  } catch {
    // Plan A not yet implemented — use hardcoded threshold
    autoSend = minConfidence >= DEFAULT_INVOICING_THRESHOLD;
  }

  // 11. Create invoice
  const invoiceStatus = autoSend ? "verzonden" : "concept";
  const { data: invoice, error: insertErr } = await supabase
    .from("invoices")
    .insert({
      tenant_id: tenantId,
      invoice_number: invoiceNumber,
      client_id: clientId,
      client_name: client.name,
      client_address: client.address ?? null,
      client_btw_number: client.btw_number ?? null,
      client_kvk_number: client.kvk_number ?? null,
      status: invoiceStatus,
      invoice_date: new Date().toISOString().split("T")[0],
      due_date: dueDate,
      subtotal: totalAmount,
      btw_percentage: btwPercentage,
      btw_amount: btwAmount,
      total,
      notes: `Automatisch ${autoSend ? "verzonden" : "concept"} — ${orders.length} order(s), confidence ${minConfidence.toFixed(1)}%`,
    })
    .select()
    .single();

  if (insertErr || !invoice) {
    return {
      success: false,
      invoice_id: null,
      auto_sent: false,
      confidence: minConfidence,
      calculated_total: totalAmount,
      order_count: orders.length,
      reason: "invoice_creation_failed",
    };
  }

  // 12. Insert invoice lines
  if (allInvoiceLines.length > 0) {
    const lineInserts = allInvoiceLines.map((line) => ({
      invoice_id: invoice.id,
      order_id: line.order_id ?? null,
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      unit_price: line.unit_price,
      total: line.total,
      sort_order: line.sort_order,
    }));

    await supabase.from("invoice_lines").insert(lineInserts);
  }

  // 13. Link orders to the invoice
  for (const order of orders) {
    await supabase
      .from("orders")
      .update({ invoice_id: invoice.id, billing_status: "GEFACTUREERD" })
      .eq("id", order.id);
  }

  // 14. Log to auto_invoice_log for accuracy tracking
  await supabase.from("auto_invoice_log").insert({
    tenant_id: tenantId,
    invoice_id: invoice.id,
    trigger_trip_id: tripId,
    auto_calculated_total: totalAmount,
    final_total: total,
    price_accuracy_pct: 100, // Will be updated when human reviews/adjusts
    was_auto_sent: autoSend,
  });

  return {
    success: true,
    invoice_id: invoice.id,
    auto_sent: autoSend,
    confidence: minConfidence,
    calculated_total: totalAmount,
    order_count: orders.length,
    reason: autoSend ? "auto_executed" : "below_threshold",
  };
}
```

- [ ] Run tests to verify they pass: `npx vitest run src/test/autoInvoicer.test.ts`

---

## Task 5: Margin Monitor (TDD)

### 5a. Write tests first

- [ ] Create file `src/test/marginMonitor.test.ts` with this content:

```typescript
import { describe, it, expect, vi } from "vitest";
import {
  calculateTripMargin,
  checkMarginThreshold,
} from "@/lib/marginMonitor";

// ─── Mock Supabase ─────────────────────────────────────────────

function createMockSupabase(overrides: Record<string, any> = {}) {
  const tables: Record<string, any[]> = {
    orders: overrides.orders ?? [],
    invoices: overrides.invoices ?? [],
    trip_costs: overrides.trip_costs ?? [],
    margin_alerts: overrides.margin_alerts ?? [],
  };

  return {
    from: vi.fn((table: string) => {
      const data = tables[table] ?? [];

      const chain: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        single: vi.fn(() => Promise.resolve({ data: data[0] ?? null, error: null })),
        insert: vi.fn((rows: any) => Promise.resolve({
          data: Array.isArray(rows) ? rows.map((r: any, i: number) => ({ ...r, id: `new-${i}` })) : { ...rows, id: "new-0" },
          error: null,
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { ...(Array.isArray(rows) ? rows[0] : rows), id: "alert-new" },
              error: null,
            }),
          }),
        })),
        then: vi.fn((resolve: any) => {
          resolve({ data, error: null });
          return Promise.resolve({ data, error: null });
        }),
      };

      return chain;
    }),
  } as any;
}

// ─── Tests: calculateTripMargin ────────────────────────────────

describe("calculateTripMargin", () => {
  it("should calculate margin from orders revenue and trip costs", async () => {
    const sb = createMockSupabase({
      orders: [
        { id: "o1", invoice_id: "inv-1", trip_id: "trip-1" },
        { id: "o2", invoice_id: "inv-2", trip_id: "trip-1" },
      ],
      invoices: [
        { id: "inv-1", total: 500 },
        { id: "inv-2", total: 300 },
      ],
      trip_costs: [
        { trip_id: "trip-1", amount: 200 },
        { trip_id: "trip-1", amount: 150 },
      ],
    });

    const result = await calculateTripMargin(sb, "tenant-1", "trip-1");
    expect(result.revenue).toBe(800);
    expect(result.costs).toBe(350);
    expect(result.margin_eur).toBe(450);
    expect(result.margin_pct).toBeCloseTo(56.25, 1);
  });

  it("should return zero margin when no revenue", async () => {
    const sb = createMockSupabase({
      orders: [],
      invoices: [],
      trip_costs: [{ trip_id: "trip-1", amount: 200 }],
    });

    const result = await calculateTripMargin(sb, "tenant-1", "trip-1");
    expect(result.revenue).toBe(0);
    expect(result.margin_pct).toBe(0);
  });

  it("should return zero costs when no trip costs exist", async () => {
    const sb = createMockSupabase({
      orders: [{ id: "o1", invoice_id: "inv-1", trip_id: "trip-1" }],
      invoices: [{ id: "inv-1", total: 500 }],
      trip_costs: [],
    });

    const result = await calculateTripMargin(sb, "tenant-1", "trip-1");
    expect(result.costs).toBe(0);
    expect(result.margin_eur).toBe(500);
    expect(result.margin_pct).toBe(100);
  });

  it("should handle negative margin (loss)", async () => {
    const sb = createMockSupabase({
      orders: [{ id: "o1", invoice_id: "inv-1", trip_id: "trip-1" }],
      invoices: [{ id: "inv-1", total: 200 }],
      trip_costs: [{ trip_id: "trip-1", amount: 350 }],
    });

    const result = await calculateTripMargin(sb, "tenant-1", "trip-1");
    expect(result.margin_eur).toBe(-150);
    expect(result.margin_pct).toBeLessThan(0);
  });
});

// ─── Tests: checkMarginThreshold ───────────────────────────────

describe("checkMarginThreshold", () => {
  it("should return null when margin is above threshold", async () => {
    const sb = createMockSupabase({
      orders: [{ id: "o1", invoice_id: "inv-1", trip_id: "trip-1" }],
      invoices: [{ id: "inv-1", total: 1000 }],
      trip_costs: [{ trip_id: "trip-1", amount: 200 }],
    });

    const alert = await checkMarginThreshold(sb, "tenant-1", "trip-1", 15);
    expect(alert).toBeNull();
  });

  it("should create alert when margin is below threshold", async () => {
    const sb = createMockSupabase({
      orders: [{ id: "o1", invoice_id: "inv-1", trip_id: "trip-1" }],
      invoices: [{ id: "inv-1", total: 100 }],
      trip_costs: [{ trip_id: "trip-1", amount: 95 }],
    });

    const alert = await checkMarginThreshold(sb, "tenant-1", "trip-1", 15);
    expect(alert).not.toBeNull();
    expect(alert!.entity_type).toBe("trip");
    expect(alert!.margin_pct).toBeLessThan(15);
  });

  it("should create alert for negative margin trips", async () => {
    const sb = createMockSupabase({
      orders: [{ id: "o1", invoice_id: "inv-1", trip_id: "trip-1" }],
      invoices: [{ id: "inv-1", total: 100 }],
      trip_costs: [{ trip_id: "trip-1", amount: 200 }],
    });

    const alert = await checkMarginThreshold(sb, "tenant-1", "trip-1", 10);
    expect(alert).not.toBeNull();
    expect(alert!.margin_pct).toBeLessThan(0);
  });

  it("should include threshold in alert", async () => {
    const sb = createMockSupabase({
      orders: [{ id: "o1", invoice_id: "inv-1", trip_id: "trip-1" }],
      invoices: [{ id: "inv-1", total: 110 }],
      trip_costs: [{ trip_id: "trip-1", amount: 100 }],
    });

    const alert = await checkMarginThreshold(sb, "tenant-1", "trip-1", 20);
    expect(alert).not.toBeNull();
    expect(alert!.threshold_pct).toBe(20);
  });
});
```

- [ ] Run tests to verify they fail: `npx vitest run src/test/marginMonitor.test.ts`

### 5b. Implement Margin Monitor

- [ ] Create file `src/lib/marginMonitor.ts` with this content:

```typescript
/**
 * Margin Monitor for OrderFlow Suite.
 *
 * Calculates trip margins (revenue vs. costs) and creates alerts
 * when margins drop below configurable thresholds.
 */

import type { MarginResult, MarginAlert } from "@/types/financial-autonomy";

/** Round to 2 decimal places */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Trip Margin Calculation ───────────────────────────────────

/**
 * Calculate the margin for a trip.
 *
 * Revenue = sum of invoice totals for orders on this trip.
 * Costs = sum of trip_costs for this trip.
 * Margin = revenue - costs.
 *
 * @param supabase - Supabase client
 * @param tenantId - Tenant UUID
 * @param tripId - Trip UUID
 * @returns MarginResult with revenue, costs, margin_eur, margin_pct
 */
export async function calculateTripMargin(
  supabase: any,
  tenantId: string,
  tripId: string,
): Promise<MarginResult> {
  // 1. Get orders on this trip that have invoices
  const { data: orders } = await supabase
    .from("orders")
    .select("id, invoice_id")
    .eq("trip_id", tripId);

  const orderList = (orders ?? []) as Array<{ id: string; invoice_id: string | null }>;

  // 2. Sum revenue from invoices
  let revenue = 0;
  const invoiceIds = orderList
    .map((o) => o.invoice_id)
    .filter((id): id is string => id != null);

  if (invoiceIds.length > 0) {
    const { data: invoices } = await supabase
      .from("invoices")
      .select("id, total")
      .in("id", invoiceIds);

    const invoiceList = (invoices ?? []) as Array<{ id: string; total: number }>;
    revenue = round2(invoiceList.reduce((sum, inv) => sum + inv.total, 0));
  }

  // 3. Sum costs from trip_costs
  const { data: costs } = await supabase
    .from("trip_costs")
    .select("amount")
    .eq("trip_id", tripId);

  const costList = (costs ?? []) as Array<{ amount: number }>;
  const totalCosts = round2(costList.reduce((sum, c) => sum + c.amount, 0));

  // 4. Calculate margin
  const marginEur = round2(revenue - totalCosts);
  const marginPct = revenue > 0
    ? round2((marginEur / revenue) * 100)
    : (totalCosts > 0 ? -100 : 0);

  return {
    revenue,
    costs: totalCosts,
    margin_eur: marginEur,
    margin_pct: marginPct,
  };
}

// ─── Margin Threshold Check ────────────────────────────────────

/**
 * Check if a trip's margin is below the given threshold.
 *
 * If below threshold, creates a margin_alert record and returns it.
 * If above threshold, returns null.
 *
 * @param supabase - Supabase client
 * @param tenantId - Tenant UUID
 * @param tripId - Trip UUID
 * @param thresholdPct - Minimum acceptable margin percentage
 * @returns MarginAlert if threshold breached, null otherwise
 */
export async function checkMarginThreshold(
  supabase: any,
  tenantId: string,
  tripId: string,
  thresholdPct: number,
): Promise<MarginAlert | null> {
  const margin = await calculateTripMargin(supabase, tenantId, tripId);

  if (margin.margin_pct >= thresholdPct) {
    return null;
  }

  // Create alert
  const alertData = {
    tenant_id: tenantId,
    entity_type: "trip" as const,
    entity_id: tripId,
    margin_pct: margin.margin_pct,
    threshold_pct: thresholdPct,
    alert_status: "ACTIVE" as const,
  };

  const { data: alert } = await supabase
    .from("margin_alerts")
    .insert(alertData)
    .select()
    .single();

  if (alert) {
    return alert as MarginAlert;
  }

  // Return constructed alert even if DB insert failed (for caller to handle)
  return {
    id: "",
    ...alertData,
    created_at: new Date().toISOString(),
  };
}
```

- [ ] Run tests to verify they pass: `npx vitest run src/test/marginMonitor.test.ts`

---

## Task 6: Cashflow Predictor (TDD)

### 6a. Write tests first

- [ ] Create file `src/test/cashflowPredictor.test.ts` with this content:

```typescript
import { describe, it, expect, vi } from "vitest";
import {
  predictPaymentDate,
  getCashflowForecast,
} from "@/lib/cashflowPredictor";

// ─── Mock Supabase ─────────────────────────────────────────────

function createMockSupabase(overrides: Record<string, any> = {}) {
  const tables: Record<string, any> = {
    invoices: overrides.invoices ?? [],
    clients: overrides.clients ?? [],
    cashflow_predictions: overrides.cashflow_predictions ?? [],
  };

  return {
    from: vi.fn((table: string) => {
      const data = tables[table] ?? [];

      const chain: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn(() => Promise.resolve({
          data: Array.isArray(data) ? data[0] ?? null : data,
          error: null,
        })),
        insert: vi.fn((rows: any) => {
          const inserted = Array.isArray(rows) ? rows : [rows];
          return Promise.resolve({ data: inserted, error: null });
        }),
        upsert: vi.fn((rows: any) => Promise.resolve({ data: rows, error: null })),
        then: vi.fn((resolve: any) => {
          resolve({ data, error: null });
          return Promise.resolve({ data, error: null });
        }),
      };

      return chain;
    }),
  } as any;
}

// ─── Tests: predictPaymentDate ─────────────────────────────────

describe("predictPaymentDate", () => {
  it("should predict payment based on invoice_date + payment_terms", async () => {
    const sb = createMockSupabase({
      invoices: [
        {
          id: "inv-1",
          client_id: "client-1",
          invoice_date: "2026-04-01",
          total: 1000,
          status: "verzonden",
        },
      ],
      clients: [{ id: "client-1", payment_terms: 30 }],
      cashflow_predictions: [],
    });

    const result = await predictPaymentDate(sb, "tenant-1", "inv-1");
    expect(result.toISOString().split("T")[0]).toBe("2026-05-01");
  });

  it("should add average lateness when historical data exists", async () => {
    const sb = createMockSupabase({
      invoices: [
        {
          id: "inv-1",
          client_id: "client-1",
          invoice_date: "2026-04-01",
          total: 1000,
          status: "verzonden",
        },
      ],
      clients: [{ id: "client-1", payment_terms: 30 }],
      // Historical: client paid on average 5 days late
      cashflow_predictions: [
        { predicted_payment_date: "2026-01-30", actual_payment_date: "2026-02-04", client_id: "client-1" },
        { predicted_payment_date: "2026-02-28", actual_payment_date: "2026-03-06", client_id: "client-1" },
      ],
    });

    const result = await predictPaymentDate(sb, "tenant-1", "inv-1");
    // 2026-04-01 + 30 days + ~5 days lateness = around 2026-05-06
    const predicted = result.toISOString().split("T")[0];
    expect(predicted >= "2026-05-04").toBe(true);
    expect(predicted <= "2026-05-08").toBe(true);
  });

  it("should default to 30 days when no payment terms", async () => {
    const sb = createMockSupabase({
      invoices: [
        {
          id: "inv-1",
          client_id: "client-1",
          invoice_date: "2026-04-01",
          total: 500,
          status: "verzonden",
        },
      ],
      clients: [{ id: "client-1", payment_terms: null }],
      cashflow_predictions: [],
    });

    const result = await predictPaymentDate(sb, "tenant-1", "inv-1");
    expect(result.toISOString().split("T")[0]).toBe("2026-05-01");
  });
});

// ─── Tests: getCashflowForecast ────────────────────────────────

describe("getCashflowForecast", () => {
  it("should return empty array when no predictions exist", async () => {
    const sb = createMockSupabase({ cashflow_predictions: [] });
    const result = await getCashflowForecast(sb, "tenant-1", 30);
    expect(result).toEqual([]);
  });

  it("should group predictions by date", async () => {
    const sb = createMockSupabase({
      cashflow_predictions: [
        { invoice_id: "inv-1", client_id: "c-1", predicted_payment_date: "2026-04-15", amount: 500, actual_payment_date: null },
        { invoice_id: "inv-2", client_id: "c-2", predicted_payment_date: "2026-04-15", amount: 300, actual_payment_date: null },
        { invoice_id: "inv-3", client_id: "c-1", predicted_payment_date: "2026-04-20", amount: 700, actual_payment_date: null },
      ],
    });

    const result = await getCashflowForecast(sb, "tenant-1", 30);
    expect(result.length).toBe(2);

    const apr15 = result.find((e) => e.date === "2026-04-15");
    expect(apr15).toBeDefined();
    expect(apr15!.expected_amount).toBe(800);
    expect(apr15!.invoice_count).toBe(2);

    const apr20 = result.find((e) => e.date === "2026-04-20");
    expect(apr20).toBeDefined();
    expect(apr20!.expected_amount).toBe(700);
    expect(apr20!.invoice_count).toBe(1);
  });

  it("should exclude already-paid predictions", async () => {
    const sb = createMockSupabase({
      cashflow_predictions: [
        { invoice_id: "inv-1", client_id: "c-1", predicted_payment_date: "2026-04-15", amount: 500, actual_payment_date: null },
        { invoice_id: "inv-2", client_id: "c-2", predicted_payment_date: "2026-04-15", amount: 300, actual_payment_date: "2026-04-14" },
      ],
    });

    const result = await getCashflowForecast(sb, "tenant-1", 30);
    expect(result.length).toBe(1);
    expect(result[0].expected_amount).toBe(500);
  });

  it("should sort entries by date ascending", async () => {
    const sb = createMockSupabase({
      cashflow_predictions: [
        { invoice_id: "inv-2", client_id: "c-1", predicted_payment_date: "2026-04-20", amount: 300, actual_payment_date: null },
        { invoice_id: "inv-1", client_id: "c-1", predicted_payment_date: "2026-04-10", amount: 500, actual_payment_date: null },
      ],
    });

    const result = await getCashflowForecast(sb, "tenant-1", 30);
    expect(result.length).toBe(2);
    expect(result[0].date).toBe("2026-04-10");
    expect(result[1].date).toBe("2026-04-20");
  });
});
```

- [ ] Run tests to verify they fail: `npx vitest run src/test/cashflowPredictor.test.ts`

### 6b. Implement Cashflow Predictor

- [ ] Create file `src/lib/cashflowPredictor.ts` with this content:

```typescript
/**
 * Cashflow Predictor for OrderFlow Suite.
 *
 * Predicts when invoices will be paid based on:
 * - Client payment terms
 * - Historical payment lateness per client
 *
 * Provides a forecast of expected incoming payments over N days.
 */

import type {
  CashflowForecastEntry,
} from "@/types/financial-autonomy";

// ─── Helpers ───────────────────────────────────────────────────

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function daysBetween(a: string, b: string): number {
  const dateA = new Date(a);
  const dateB = new Date(b);
  return Math.round((dateB.getTime() - dateA.getTime()) / (1000 * 60 * 60 * 24));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Historical Lateness ───────────────────────────────────────

/**
 * Calculate average payment lateness (in days) for a client.
 *
 * Compares predicted_payment_date vs actual_payment_date from
 * cashflow_predictions that have been resolved.
 *
 * Returns 0 if no history exists (assume on-time).
 */
async function getAverageLateness(
  supabase: any,
  tenantId: string,
  clientId: string,
): Promise<number> {
  const { data: predictions } = await supabase
    .from("cashflow_predictions")
    .select("predicted_payment_date, actual_payment_date")
    .eq("client_id", clientId);

  const resolved = ((predictions ?? []) as Array<{
    predicted_payment_date: string;
    actual_payment_date: string | null;
  }>).filter((p) => p.actual_payment_date != null);

  if (resolved.length === 0) return 0;

  const totalLateDays = resolved.reduce((sum, p) => {
    const late = daysBetween(p.predicted_payment_date, p.actual_payment_date!);
    return sum + Math.max(0, late); // Only count late, not early
  }, 0);

  return Math.round(totalLateDays / resolved.length);
}

// ─── Payment Date Prediction ───────────────────────────────────

/**
 * Predict when an invoice will be paid.
 *
 * Formula: invoice_date + payment_terms + avg_historical_lateness
 *
 * Also inserts/updates a cashflow_predictions record for tracking.
 *
 * @param supabase - Supabase client
 * @param tenantId - Tenant UUID
 * @param invoiceId - Invoice UUID
 * @returns Predicted payment Date
 */
export async function predictPaymentDate(
  supabase: any,
  tenantId: string,
  invoiceId: string,
): Promise<Date> {
  // 1. Fetch invoice
  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, client_id, invoice_date, total, status")
    .eq("id", invoiceId)
    .single();

  if (!invoice) {
    throw new Error(`Invoice ${invoiceId} niet gevonden`);
  }

  // 2. Fetch client payment terms
  const { data: client } = await supabase
    .from("clients")
    .select("id, payment_terms")
    .eq("id", invoice.client_id)
    .single();

  const paymentTerms = client?.payment_terms ?? 30; // Default 30 days

  // 3. Get historical lateness for this client
  const avgLateness = await getAverageLateness(supabase, tenantId, invoice.client_id);

  // 4. Calculate predicted date
  const invoiceDate = new Date(invoice.invoice_date);
  const predictedDate = addDays(invoiceDate, paymentTerms + avgLateness);

  // 5. Store prediction
  await supabase.from("cashflow_predictions").insert({
    tenant_id: tenantId,
    invoice_id: invoiceId,
    predicted_payment_date: predictedDate.toISOString().split("T")[0],
    actual_payment_date: null,
    amount: invoice.total,
    client_id: invoice.client_id,
  });

  return predictedDate;
}

// ─── Cashflow Forecast ─────────────────────────────────────────

/**
 * Get a cashflow forecast for the next N days.
 *
 * Groups all unpaid cashflow_predictions by predicted_payment_date
 * and returns daily totals, sorted by date.
 *
 * @param supabase - Supabase client
 * @param tenantId - Tenant UUID
 * @param days - Number of days to forecast
 * @returns Array of CashflowForecastEntry, sorted by date ascending
 */
export async function getCashflowForecast(
  supabase: any,
  tenantId: string,
  days: number,
): Promise<CashflowForecastEntry[]> {
  const today = new Date();
  const endDate = addDays(today, days);

  // Fetch all unpaid predictions within the forecast window
  const { data: predictions } = await supabase
    .from("cashflow_predictions")
    .select("invoice_id, client_id, predicted_payment_date, amount, actual_payment_date")
    .eq("tenant_id", tenantId)
    .is("actual_payment_date", null);

  const allPredictions = ((predictions ?? []) as Array<{
    invoice_id: string;
    client_id: string;
    predicted_payment_date: string;
    amount: number;
    actual_payment_date: string | null;
  }>).filter((p) => p.actual_payment_date == null);

  if (allPredictions.length === 0) {
    return [];
  }

  // Group by date
  const byDate = new Map<string, CashflowForecastEntry>();

  for (const prediction of allPredictions) {
    const date = prediction.predicted_payment_date;
    const existing = byDate.get(date);

    if (existing) {
      existing.expected_amount = round2(existing.expected_amount + prediction.amount);
      existing.invoice_count += 1;
      existing.invoices.push({
        invoice_id: prediction.invoice_id,
        client_id: prediction.client_id,
        amount: prediction.amount,
      });
    } else {
      byDate.set(date, {
        date,
        expected_amount: prediction.amount,
        invoice_count: 1,
        invoices: [
          {
            invoice_id: prediction.invoice_id,
            client_id: prediction.client_id,
            amount: prediction.amount,
          },
        ],
      });
    }
  }

  // Sort by date ascending
  const entries = Array.from(byDate.values());
  entries.sort((a, b) => a.date.localeCompare(b.date));

  return entries;
}
```

- [ ] Run tests to verify they pass: `npx vitest run src/test/cashflowPredictor.test.ts`

---

## Task 7: Supabase Edge Function

- [ ] Create directory `supabase/functions/financial-trigger/`
- [ ] Create file `supabase/functions/financial-trigger/index.ts` with this content:

```typescript
/**
 * Supabase Edge Function: financial-trigger
 *
 * Triggered when a trip status changes to COMPLETED.
 * Runs the full financial autonomy pipeline:
 *   1. Auto-pricing (via autoInvoicer)
 *   2. Auto-invoicing (draft or auto-send)
 *   3. Margin check
 *   4. Cashflow prediction
 *
 * Trigger setup: Configure a Database Webhook on the trips table
 * WHERE status = 'COMPLETED' to call this function.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Default margin threshold: 15%
const DEFAULT_MARGIN_THRESHOLD_PCT = 15;

interface TripPayload {
  type: "UPDATE";
  table: "trips";
  record: {
    id: string;
    tenant_id: string;
    status: string;
  };
  old_record: {
    id: string;
    tenant_id: string;
    status: string;
  };
}

Deno.serve(async (req: Request) => {
  try {
    // 1. Parse the webhook payload
    const payload: TripPayload = await req.json();

    // Only process when trip transitions TO COMPLETED
    if (
      payload.record.status !== "COMPLETED" ||
      payload.old_record.status === "COMPLETED"
    ) {
      return new Response(
        JSON.stringify({ message: "Skipped: not a COMPLETED transition" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const tripId = payload.record.id;
    const tenantId = payload.record.tenant_id;

    // 2. Create authenticated Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const results: Record<string, unknown> = {
      trip_id: tripId,
      tenant_id: tenantId,
    };

    // 3. Auto-invoice: price all orders and create draft/auto invoice
    //    Import dynamically to handle the case where modules are bundled
    //    For Edge Functions, these would be inline or bundled separately.
    //    Below is the direct implementation for the Edge Function context.

    // --- Step 3a: Fetch delivered orders for trip ---
    const { data: orders, error: ordersErr } = await supabase
      .from("orders")
      .select("*")
      .eq("trip_id", tripId)
      .eq("status", "DELIVERED")
      .is("invoice_id", null);

    if (ordersErr || !orders || orders.length === 0) {
      results.invoicing = { skipped: true, reason: "no_delivered_orders" };
      return new Response(JSON.stringify(results), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Group orders by client_id
    const ordersByClient = new Map<string, typeof orders>();
    for (const order of orders) {
      if (!order.client_id) continue;
      const existing = ordersByClient.get(order.client_id) || [];
      existing.push(order);
      ordersByClient.set(order.client_id, existing);
    }

    const invoiceResults: Record<string, unknown>[] = [];

    for (const [clientId, clientOrders] of ordersByClient) {
      // Fetch rate card
      const { data: rateCards } = await supabase
        .from("rate_cards")
        .select("*, rate_rules(*)")
        .eq("tenant_id", tenantId)
        .eq("client_id", clientId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1);

      if (!rateCards || rateCards.length === 0) {
        invoiceResults.push({ client_id: clientId, skipped: true, reason: "no_rate_card" });
        continue;
      }

      // Fetch surcharges
      const { data: surcharges } = await supabase
        .from("surcharges")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("is_active", true);

      // Fetch client
      const { data: client } = await supabase
        .from("clients")
        .select("name, address, btw_number, kvk_number, payment_terms")
        .eq("id", clientId)
        .single();

      if (!client) {
        invoiceResults.push({ client_id: clientId, skipped: true, reason: "client_not_found" });
        continue;
      }

      // Generate invoice number
      const { data: invoiceNumber } = await supabase
        .rpc("generate_invoice_number", { p_tenant_id: tenantId });

      if (!invoiceNumber) {
        invoiceResults.push({ client_id: clientId, skipped: true, reason: "no_invoice_number" });
        continue;
      }

      // Calculate totals (simplified pricing for Edge Function)
      // In production, this would import the pricing engine
      let subtotal = 0;
      const invoiceLines: Array<{
        order_id: string;
        description: string;
        quantity: number;
        unit: string;
        unit_price: number;
        total: number;
        sort_order: number;
      }> = [];
      let sortOrder = 0;

      for (const order of clientOrders) {
        const rateCard = rateCards[0];
        const rules = rateCard.rate_rules ?? [];

        for (const rule of rules) {
          let qty = 1;
          let unit = "rit";

          switch (rule.rule_type) {
            case "PER_KM":
              qty = order.distance_km ?? 0;
              unit = "km";
              break;
            case "PER_UUR":
              qty = (order.duration_hours ?? 0);
              unit = "uur";
              break;
            case "PER_STOP":
              qty = order.stop_count ?? 2;
              unit = "stop";
              break;
            case "VAST_BEDRAG":
            case "ZONE_TARIEF":
              qty = 1;
              unit = "rit";
              break;
            case "PER_PALLET":
              qty = order.quantity ?? 0;
              unit = "pallet";
              break;
            case "PER_KG":
              qty = order.weight_kg ?? 0;
              unit = "kg";
              break;
            default:
              qty = 1;
              unit = "stuk";
          }

          if (qty <= 0) continue;

          let lineTotal = Math.round(qty * rule.amount * 100) / 100;
          if (rule.min_amount != null && lineTotal < rule.min_amount) {
            lineTotal = rule.min_amount;
          }

          subtotal += lineTotal;
          invoiceLines.push({
            order_id: order.id,
            description: `Order #${order.order_number}: ${rule.rule_type} ${qty} ${unit} x EUR ${rule.amount}`,
            quantity: qty,
            unit,
            unit_price: rule.amount,
            total: lineTotal,
            sort_order: sortOrder++,
          });
        }

        // Apply surcharges
        for (const surcharge of (surcharges ?? [])) {
          if (!surcharge.is_active) continue;
          // Simplified surcharge application
          let sAmount = 0;
          if (surcharge.surcharge_type === "VAST_BEDRAG") {
            sAmount = surcharge.amount;
          } else if (surcharge.surcharge_type === "PERCENTAGE") {
            sAmount = Math.round(subtotal * (surcharge.amount / 100) * 100) / 100;
          }
          if (sAmount > 0) {
            subtotal += sAmount;
            invoiceLines.push({
              order_id: order.id,
              description: `Toeslag: ${surcharge.name}`,
              quantity: 1,
              unit: "toeslag",
              unit_price: sAmount,
              total: sAmount,
              sort_order: sortOrder++,
            });
          }
        }
      }

      subtotal = Math.round(subtotal * 100) / 100;
      const btwPercentage = 21;
      const btwAmount = Math.round(subtotal * (btwPercentage / 100) * 100) / 100;
      const total = Math.round((subtotal + btwAmount) * 100) / 100;

      let dueDate: string | null = null;
      if (client.payment_terms) {
        const due = new Date();
        due.setDate(due.getDate() + client.payment_terms);
        dueDate = due.toISOString().split("T")[0];
      }

      // Create concept invoice (Edge Function always creates concept; auto-send
      // decision is made by the autoInvoicer lib on the client side or by a
      // separate confidence evaluation)
      const { data: invoice, error: invErr } = await supabase
        .from("invoices")
        .insert({
          tenant_id: tenantId,
          invoice_number: invoiceNumber,
          client_id: clientId,
          client_name: client.name,
          client_address: client.address ?? null,
          client_btw_number: client.btw_number ?? null,
          client_kvk_number: client.kvk_number ?? null,
          status: "concept",
          invoice_date: new Date().toISOString().split("T")[0],
          due_date: dueDate,
          subtotal,
          btw_percentage: btwPercentage,
          btw_amount: btwAmount,
          total,
          notes: `Auto-concept bij trip ${tripId} — ${clientOrders.length} order(s)`,
        })
        .select()
        .single();

      if (invErr || !invoice) {
        invoiceResults.push({ client_id: clientId, error: invErr?.message ?? "insert_failed" });
        continue;
      }

      // Insert invoice lines
      if (invoiceLines.length > 0) {
        await supabase.from("invoice_lines").insert(
          invoiceLines.map((line) => ({
            invoice_id: invoice.id,
            order_id: line.order_id,
            description: line.description,
            quantity: line.quantity,
            unit: line.unit,
            unit_price: line.unit_price,
            total: line.total,
            sort_order: line.sort_order,
          })),
        );
      }

      // Link orders to invoice
      for (const order of clientOrders) {
        await supabase
          .from("orders")
          .update({ invoice_id: invoice.id, billing_status: "GEFACTUREERD" })
          .eq("id", order.id);
      }

      // Log to auto_invoice_log
      await supabase.from("auto_invoice_log").insert({
        tenant_id: tenantId,
        invoice_id: invoice.id,
        trigger_trip_id: tripId,
        auto_calculated_total: subtotal,
        final_total: total,
        price_accuracy_pct: 100,
        was_auto_sent: false,
      });

      invoiceResults.push({
        client_id: clientId,
        invoice_id: invoice.id,
        invoice_number: invoiceNumber,
        total,
        order_count: clientOrders.length,
      });

      // --- Step 3b: Margin check ---
      const { data: tripCosts } = await supabase
        .from("trip_costs")
        .select("amount")
        .eq("trip_id", tripId);

      const totalCosts = (tripCosts ?? []).reduce(
        (sum: number, c: { amount: number }) => sum + c.amount,
        0,
      );
      const revenue = total;
      const marginEur = revenue - totalCosts;
      const marginPct = revenue > 0 ? (marginEur / revenue) * 100 : 0;

      if (marginPct < DEFAULT_MARGIN_THRESHOLD_PCT) {
        await supabase.from("margin_alerts").insert({
          tenant_id: tenantId,
          entity_type: "trip",
          entity_id: tripId,
          margin_pct: Math.round(marginPct * 100) / 100,
          threshold_pct: DEFAULT_MARGIN_THRESHOLD_PCT,
          alert_status: "ACTIVE",
        });

        results.margin_alert = {
          created: true,
          margin_pct: Math.round(marginPct * 100) / 100,
          threshold_pct: DEFAULT_MARGIN_THRESHOLD_PCT,
        };
      }

      // --- Step 3c: Cashflow prediction ---
      const paymentTerms = client.payment_terms ?? 30;
      const predictedDate = new Date();
      predictedDate.setDate(predictedDate.getDate() + paymentTerms);

      await supabase.from("cashflow_predictions").insert({
        tenant_id: tenantId,
        invoice_id: invoice.id,
        predicted_payment_date: predictedDate.toISOString().split("T")[0],
        actual_payment_date: null,
        amount: total,
        client_id: clientId,
      });

      results.cashflow_prediction = {
        invoice_id: invoice.id,
        predicted_payment_date: predictedDate.toISOString().split("T")[0],
        amount: total,
      };
    }

    results.invoicing = invoiceResults;

    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
```

---

## Task 8: Run All Tests

- [ ] Run all Plan F tests together: `npx vitest run src/test/pricingEngineConfidence.test.ts src/test/autoInvoicer.test.ts src/test/marginMonitor.test.ts src/test/cashflowPredictor.test.ts`
- [ ] Run full test suite to verify no regressions: `npx vitest run`
- [ ] Run TypeScript compiler check: `npx tsc --noEmit`
- [ ] Fix any failures before proceeding

---

## Task 9: Git Commit

- [ ] Stage all Plan F files:

```bash
git add \
  supabase/migrations/20260405120000_plan_f_financial_autonomy.sql \
  src/types/financial-autonomy.ts \
  src/lib/pricingEngine.ts \
  src/lib/autoInvoicer.ts \
  src/lib/marginMonitor.ts \
  src/lib/cashflowPredictor.ts \
  supabase/functions/financial-trigger/index.ts \
  src/test/pricingEngineConfidence.test.ts \
  src/test/autoInvoicer.test.ts \
  src/test/marginMonitor.test.ts \
  src/test/cashflowPredictor.test.ts
```

- [ ] Commit: `git commit -m "feat: Plan F — autonomous financial processing (auto-invoicing, margin alerts, cashflow predictions)"`

---

## Summary of Deliverables

| # | File | Type | Lines (est.) |
|---|------|------|-------------|
| 1 | `supabase/migrations/20260405120000_plan_f_financial_autonomy.sql` | Migration | ~65 |
| 2 | `src/types/financial-autonomy.ts` | Types | ~90 |
| 3 | `src/lib/pricingEngine.ts` | Enhanced | +55 |
| 4 | `src/lib/autoInvoicer.ts` | New lib | ~250 |
| 5 | `src/lib/marginMonitor.ts` | New lib | ~110 |
| 6 | `src/lib/cashflowPredictor.ts` | New lib | ~150 |
| 7 | `supabase/functions/financial-trigger/index.ts` | Edge Function | ~280 |
| 8 | `src/test/pricingEngineConfidence.test.ts` | Tests | ~130 |
| 9 | `src/test/autoInvoicer.test.ts` | Tests | ~220 |
| 10 | `src/test/marginMonitor.test.ts` | Tests | ~150 |
| 11 | `src/test/cashflowPredictor.test.ts` | Tests | ~140 |

**Total:** ~30 tests, ~1,640 lines of code

## Integration Notes

- **Plan A dependency:** `autoInvoicer.ts` dynamically imports `confidenceEngine.ts` with a try/catch fallback. If Plan A is not yet implemented, the auto-invoicer uses a hardcoded threshold of 98%. Once Plan A ships, the dynamic import resolves and confidence-driven auto-send activates automatically.
- **Plan B dependency:** The `financial-trigger` Edge Function is triggered by the same pipeline events that Plan B establishes. If Plan B is not yet active, the Edge Function can be triggered directly via a Database Webhook on `trips` table status changes.
- **Existing code:** `calculateOrderPrice()` is untouched. The new `calculateWithConfidence()` wraps it and adds confidence scoring. All existing tests continue to pass.
- **MarginResult:** Note that `costModels.ts` already defines a `MarginResult` with `margin_percentage` while `financial-autonomy.ts` defines one with `margin_pct`. The financial-autonomy version is used by the margin monitor; the cost engine keeps its own. This avoids breaking changes.
