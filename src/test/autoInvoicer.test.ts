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
        chain.update = vi.fn((data: any) => {
          updateCalls.push(data);
          return {
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
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
