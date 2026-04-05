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
