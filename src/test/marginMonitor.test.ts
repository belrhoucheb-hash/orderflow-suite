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
        insert: vi.fn((rows: any) => {
          const inserted = Array.isArray(rows) ? rows[0] : rows;
          return {
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { ...inserted, id: "alert-new" },
                error: null,
              }),
            }),
          };
        }),
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
