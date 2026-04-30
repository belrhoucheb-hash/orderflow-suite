import { renderHook, waitFor, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import type { ReactNode } from "react";
import React from "react";

const { mockFrom, mockRpc, mockSupabase } = vi.hoisted(() => {
  const mockFrom = vi.fn();
  const mockRpc = vi.fn();
  const mockSupabase = {
    from: mockFrom,
    rpc: mockRpc,
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user1" } }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() }),
    removeChannel: vi.fn(),
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
  };

  return { mockFrom, mockRpc, mockSupabase };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));
vi.mock("@/lib/auditLog", () => ({ logAudit: vi.fn() }));

const { mockToast } = vi.hoisted(() => ({
  mockToast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: mockToast }));

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc },
      React.createElement(BrowserRouter, null, children)
    );
}

import {
  useInvoices,
  useInvoiceById,
  useCreateInvoice,
  useUpdateInvoiceStatus,
  useDeleteInvoice,
  useUpdateInvoiceLines,
  useCalculateOrderCost,
  useAutoInvoiceGeneration,
} from "@/hooks/useInvoices";
import { logAudit } from "@/lib/auditLog";

describe("useInvoices", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches invoices with pagination", async () => {
    const invoices = [{ id: "inv1", invoice_number: "F-2026-001", status: "concept" }];
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({ data: invoices, error: null, count: 1 }),
    }));

    const { result } = renderHook(() => useInvoices(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.invoices).toHaveLength(1);
    expect(result.current.data!.totalCount).toBe(1);
  });

  it("applies status filter", async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
    }));

    const { result } = renderHook(
      () => useInvoices({ statusFilter: "concept" }),
      { wrapper: createWrapper() }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("skips status filter when set to 'alle'", async () => {
    const invoices = [{ id: "inv1" }, { id: "inv2" }];
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({ data: invoices, error: null, count: 2 }),
    }));

    const { result } = renderHook(
      () => useInvoices({ statusFilter: "alle" }),
      { wrapper: createWrapper() }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.invoices).toHaveLength(2);
  });

  it("applies search filter", async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      or: vi.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
    }));

    const { result } = renderHook(
      () => useInvoices({ search: "Acme" }),
      { wrapper: createWrapper() }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("applies both status and search filters", async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
    }));

    const { result } = renderHook(
      () => useInvoices({ statusFilter: "concept", search: "Acme" }),
      { wrapper: createWrapper() }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("handles error", async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({ data: null, error: { message: "fail" }, count: null }),
    }));

    const { result } = renderHook(() => useInvoices(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("handles null data gracefully", async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({ data: null, error: null, count: null }),
    }));

    const { result } = renderHook(() => useInvoices(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.invoices).toEqual([]);
    expect(result.current.data!.totalCount).toBe(0);
  });

  it("uses custom page and pageSize", async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
    }));

    const { result } = renderHook(
      () => useInvoices({ page: 2, pageSize: 10 }),
      { wrapper: createWrapper() }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe("useInvoiceById", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is disabled when id is null", () => {
    const { result } = renderHook(() => useInvoiceById(null), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("fetches invoice with lines and sorts them", async () => {
    const invoice = {
      id: "inv1",
      invoice_lines: [
        { id: "l1", sort_order: 2 },
        { id: "l2", sort_order: 1 },
      ],
    };
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: invoice, error: null }),
    }));

    const { result } = renderHook(() => useInvoiceById("inv1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.invoice_lines![0].sort_order).toBe(1);
    expect(result.current.data!.invoice_lines![1].sort_order).toBe(2);
  });

  it("handles invoice without invoice_lines property", async () => {
    const invoice = { id: "inv1", status: "concept" };
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: invoice, error: null }),
    }));

    const { result } = renderHook(() => useInvoiceById("inv1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Should return as-is without crashing
    expect(result.current.data!.id).toBe("inv1");
  });

  it("falls back to fetch without lines on error", async () => {
    let callIndex = 0;
    mockFrom.mockImplementation(() => {
      callIndex++;
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue(
          callIndex === 1
            ? { data: null, error: { message: "relation not found" } }
            : { data: { id: "inv1", status: "concept" }, error: null }
        ),
      };
    });

    const { result } = renderHook(() => useInvoiceById("inv1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.invoice_lines).toEqual([]);
  });

  it("falls back returns null when fallback also returns null", async () => {
    let callIndex = 0;
    mockFrom.mockImplementation(() => {
      callIndex++;
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue(
          callIndex === 1
            ? { data: null, error: { message: "not found" } }
            : { data: null, error: null }
        ),
      };
    });

    const { result } = renderHook(() => useInvoiceById("inv-missing"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("throws when fallback query errors", async () => {
    let callIndex = 0;
    mockFrom.mockImplementation(() => {
      callIndex++;
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue(
          callIndex === 1
            ? { data: null, error: { message: "first error" } }
            : { data: null, error: { message: "fallback error" } }
        ),
      };
    });

    const { result } = renderHook(() => useInvoiceById("inv1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useUpdateInvoiceStatus", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates invoice status", async () => {
    const updated = { id: "inv1", status: "verzonden" };
    mockFrom.mockImplementation(() => ({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: updated, error: null }),
    }));

    const { result } = renderHook(() => useUpdateInvoiceStatus(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ id: "inv1", status: "verzonden" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("calls logAudit on success", async () => {
    const updated = { id: "inv1", status: "betaald" };
    mockFrom.mockImplementation(() => ({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: updated, error: null }),
    }));

    const { result } = renderHook(() => useUpdateInvoiceStatus(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ id: "inv1", status: "betaald" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
      table_name: "invoices",
      record_id: "inv1",
      action: "UPDATE",
      new_data: { status: "betaald" },
      changed_fields: ["status"],
    }));
  });

  it("handles update error", async () => {
    mockFrom.mockImplementation(() => ({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: "fail" } }),
    }));

    const { result } = renderHook(() => useUpdateInvoiceStatus(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ id: "inv1", status: "betaald" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useDeleteInvoice", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes concept invoice and unlinks orders", async () => {
    let callIndex = 0;
    mockFrom.mockImplementation((table: string) => {
      callIndex++;
      if (callIndex === 1) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { status: "concept" }, error: null }),
        };
      }
      if (callIndex === 2) {
        return {
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      return {
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      };
    });

    const { result } = renderHook(() => useDeleteInvoice(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate("inv1");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("rejects deleting non-concept invoice", async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { status: "verzonden" }, error: null }),
    }));

    const { result } = renderHook(() => useDeleteInvoice(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate("inv1");
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error!.message).toContain("concept-facturen");
  });

  it("rejects when invoice not found", async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }));

    const { result } = renderHook(() => useDeleteInvoice(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate("inv-nonexistent");
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error!.message).toContain("niet gevonden");
  });

  it("handles fetch error during status check", async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: "db error" } }),
    }));

    const { result } = renderHook(() => useDeleteInvoice(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate("inv1");
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("handles unlink orders error", async () => {
    let callIndex = 0;
    mockFrom.mockImplementation(() => {
      callIndex++;
      if (callIndex === 1) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { status: "concept" }, error: null }),
        };
      }
      return {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: { message: "unlink failed" } }),
      };
    });

    const { result } = renderHook(() => useDeleteInvoice(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate("inv1");
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("handles delete error", async () => {
    let callIndex = 0;
    mockFrom.mockImplementation(() => {
      callIndex++;
      if (callIndex === 1) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { status: "concept" }, error: null }),
        };
      }
      if (callIndex === 2) {
        return {
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      return {
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: { message: "delete failed" } }),
      };
    });

    const { result } = renderHook(() => useDeleteInvoice(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate("inv1");
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useUpdateInvoiceLines", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects editing non-concept invoice", async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { status: "verzonden" }, error: null }),
    }));

    const { result } = renderHook(() => useUpdateInvoiceLines(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ invoiceId: "inv1", lines: [], btw_percentage: 21 });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error!.message).toContain("concept-facturen");
  });

  it("rejects when invoice not found", async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }));

    const { result } = renderHook(() => useUpdateInvoiceLines(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ invoiceId: "inv1", lines: [], btw_percentage: 21 });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error!.message).toContain("niet gevonden");
  });

  it("handles fetch error during status check", async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: "fetch err" } }),
    }));

    const { result } = renderHook(() => useUpdateInvoiceLines(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ invoiceId: "inv1", lines: [], btw_percentage: 21 });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("deletes old lines, inserts new, and recalculates totals", async () => {
    let callIndex = 0;
    mockFrom.mockImplementation(() => {
      callIndex++;
      if (callIndex === 1) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { status: "concept" }, error: null }),
        };
      }
      if (callIndex === 2) {
        return {
          delete: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      if (callIndex === 3) {
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      return {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: "inv1", total: 121 }, error: null }),
      };
    });

    const lines = [{
      id: "l1", invoice_id: "inv1", order_id: null,
      description: "Test", quantity: 1, unit: "stuk",
      unit_price: 100, total: 100, sort_order: 0,
    }];

    const { result } = renderHook(() => useUpdateInvoiceLines(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ invoiceId: "inv1", lines, btw_percentage: 21 });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("handles empty lines array (no insert needed)", async () => {
    let callIndex = 0;
    mockFrom.mockImplementation(() => {
      callIndex++;
      if (callIndex === 1) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { status: "concept" }, error: null }),
        };
      }
      if (callIndex === 2) {
        return {
          delete: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      // Update invoice totals (no insert because lines is empty)
      return {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: "inv1", total: 0 }, error: null }),
      };
    });

    const { result } = renderHook(() => useUpdateInvoiceLines(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ invoiceId: "inv1", lines: [], btw_percentage: 21 });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("handles new-prefixed line ids", async () => {
    let callIndex = 0;
    mockFrom.mockImplementation(() => {
      callIndex++;
      if (callIndex === 1) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { status: "concept" }, error: null }),
        };
      }
      if (callIndex === 2) {
        return {
          delete: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      if (callIndex === 3) {
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      return {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: "inv1", total: 50 }, error: null }),
      };
    });

    const lines = [{
      id: "new-123", invoice_id: "inv1", order_id: "o1",
      description: "New line", quantity: 2, unit: "stuk",
      unit_price: 25, total: 50, sort_order: 0,
    }];

    const { result } = renderHook(() => useUpdateInvoiceLines(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ invoiceId: "inv1", lines, btw_percentage: 21 });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe("useCreateInvoice", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a new invoice with lines", async () => {
    let callIndex = 0;
    mockFrom.mockImplementation((table: string) => {
      callIndex++;
      if (table === "clients") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { name: "Acme", address: "Street 1", btw_number: "NL123", kvk_number: "456", payment_terms: 30 },
            error: null,
          }),
        };
      }
      if (table === "tenant_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { tenant_id: "t1" }, error: null }),
        };
      }
      if (table === "invoices") {
        return {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: "new-inv" }, error: null }),
        };
      }
      if (table === "invoice_lines") {
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    });

    mockRpc.mockResolvedValue({ data: "F-2026-002", error: null });

    const { result } = renderHook(() => useCreateInvoice(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({
        client_id: "c1",
        lines: [{
          order_id: "o1", description: "Transport", quantity: 1,
          unit: "rit", unit_price: 200, total: 200, sort_order: 0,
        }],
        notes: "Test invoice",
        btw_percentage: 21,
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("creates invoice without payment_terms (no due_date)", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "clients") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { name: "Beta", address: null, btw_number: null, kvk_number: null, payment_terms: null },
            error: null,
          }),
        };
      }
      if (table === "tenant_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { tenant_id: "t1" }, error: null }),
        };
      }
      if (table === "invoices") {
        return {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: "new-inv-2" }, error: null }),
        };
      }
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    });

    mockRpc.mockResolvedValue({ data: "F-2026-003", error: null });

    const { result } = renderHook(() => useCreateInvoice(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({
        client_id: "c2",
        lines: [{ order_id: null, description: "Service", quantity: 1, unit: "stuk", unit_price: 50, total: 50, sort_order: 0 }],
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("throws when client not found", async () => {
    mockFrom.mockImplementation((table: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }));

    const { result } = renderHook(() => useCreateInvoice(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ client_id: "bad", lines: [] });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error!.message).toContain("Client niet gevonden");
  });

  it("throws when user not logged in", async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === "clients") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { name: "Acme", address: null, btw_number: null, kvk_number: null, payment_terms: null },
            error: null,
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    });

    const { result } = renderHook(() => useCreateInvoice(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ client_id: "c1", lines: [] });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error!.message).toContain("Niet ingelogd");
  });

  it("throws when no tenant found for user", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "clients") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { name: "Acme", address: null, btw_number: null, kvk_number: null, payment_terms: null },
            error: null,
          }),
        };
      }
      if (table === "tenant_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    });

    const { result } = renderHook(() => useCreateInvoice(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ client_id: "c1", lines: [] });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error!.message).toContain("Geen tenant");
  });

  it("throws when invoice number generation fails", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "clients") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { name: "Acme", address: null, btw_number: null, kvk_number: null, payment_terms: null },
            error: null,
          }),
        };
      }
      if (table === "tenant_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { tenant_id: "t1" }, error: null }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    });

    mockRpc.mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => useCreateInvoice(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ client_id: "c1", lines: [] });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error!.message).toContain("factuurnummer");
  });

  it("creates invoice with empty lines array (no line insert)", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "clients") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { name: "Acme", address: null, btw_number: null, kvk_number: null, payment_terms: null },
            error: null,
          }),
        };
      }
      if (table === "tenant_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { tenant_id: "t1" }, error: null }),
        };
      }
      if (table === "invoices") {
        return {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: "new-inv-empty" }, error: null }),
        };
      }
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    });

    mockRpc.mockResolvedValue({ data: "F-2026-004", error: null });

    const { result } = renderHook(() => useCreateInvoice(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ client_id: "c1", lines: [] });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe("useCalculateOrderCost", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is disabled when orderId or clientId is null", () => {
    const { result } = renderHook(
      () => useCalculateOrderCost(null, null),
      { wrapper: createWrapper() }
    );
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("is disabled when only orderId is provided", () => {
    const { result } = renderHook(
      () => useCalculateOrderCost("o1", null),
      { wrapper: createWrapper() }
    );
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("calculates cost with per_rit rate", async () => {
    const order = { id: "o1", quantity: 5, pickup_address: "A", delivery_address: "B" };
    const rates = [{ rate_type: "per_rit", amount: 200, description: "Rit tarief", is_active: true }];

    mockFrom.mockImplementation((table: string) => {
      const chain: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn(),
      };
      if (table === "orders") {
        chain.single.mockResolvedValue({ data: order, error: null });
      } else if (table === "client_rates") {
        chain.order.mockResolvedValue({ data: rates, error: null });
      }
      return chain;
    });

    const { result } = renderHook(
      () => useCalculateOrderCost("o1", "c1"),
      { wrapper: createWrapper() }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.subtotal).toBe(200);
    expect(result.current.data!.btw).toBe(42);
    expect(result.current.data!.total).toBe(242);
    expect(result.current.data!.lines).toHaveLength(1);
  });

  it("calculates cost with per_pallet rate", async () => {
    const order = { id: "o1", quantity: 10 };
    const rates = [{ rate_type: "per_pallet", amount: 25, description: "Per pallet", is_active: true }];

    mockFrom.mockImplementation((table: string) => {
      const chain: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn(),
      };
      if (table === "orders") chain.single.mockResolvedValue({ data: order, error: null });
      else chain.order.mockResolvedValue({ data: rates, error: null });
      return chain;
    });

    const { result } = renderHook(
      () => useCalculateOrderCost("o1", "c1"),
      { wrapper: createWrapper() }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.subtotal).toBe(250);
  });

  it("skips per_pallet with 0 quantity", async () => {
    const order = { id: "o1", quantity: 0 };
    const rates = [{ rate_type: "per_pallet", amount: 25, description: "Per pallet", is_active: true }];

    mockFrom.mockImplementation((table: string) => {
      const chain: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn(),
      };
      if (table === "orders") chain.single.mockResolvedValue({ data: order, error: null });
      else chain.order.mockResolvedValue({ data: rates, error: null });
      return chain;
    });

    const { result } = renderHook(
      () => useCalculateOrderCost("o1", "c1"),
      { wrapper: createWrapper() }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.lines).toHaveLength(0);
    expect(result.current.data!.subtotal).toBe(0);
  });

  it("uses haversine distance for per_km rate with geocoded coordinates", async () => {
    const order = {
      id: "o1", quantity: 1,
      geocoded_pickup_lat: 52.3676, geocoded_pickup_lng: 4.9041,
      geocoded_delivery_lat: 51.9244, geocoded_delivery_lng: 4.4777,
    };
    const rates = [{ rate_type: "per_km", amount: 1.5, description: "Per km", is_active: true }];

    mockFrom.mockImplementation((table: string) => {
      const chain: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn(),
      };
      if (table === "orders") chain.single.mockResolvedValue({ data: order, error: null });
      else chain.order.mockResolvedValue({ data: rates, error: null });
      return chain;
    });

    const { result } = renderHook(
      () => useCalculateOrderCost("o1", "c1"),
      { wrapper: createWrapper() }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.lines[0].unit).toBe("km");
    expect(result.current.data!.lines[0].quantity).toBeGreaterThan(50);
  });

  it("uses 150km fallback when addresses present but no coords", async () => {
    const order = { id: "o1", quantity: 1, pickup_address: "Amsterdam", delivery_address: "Rotterdam" };
    const rates = [{ rate_type: "per_km", amount: 1, description: "Per km", is_active: true }];

    mockFrom.mockImplementation((table: string) => {
      const chain: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn(),
      };
      if (table === "orders") chain.single.mockResolvedValue({ data: order, error: null });
      else chain.order.mockResolvedValue({ data: rates, error: null });
      return chain;
    });

    const { result } = renderHook(
      () => useCalculateOrderCost("o1", "c1"),
      { wrapper: createWrapper() }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.lines[0].quantity).toBe(150);
  });

  it("returns 0 distance when no addresses at all for per_km", async () => {
    const order = { id: "o1", quantity: 1 };
    const rates = [{ rate_type: "per_km", amount: 1, description: "Per km", is_active: true }];

    mockFrom.mockImplementation((table: string) => {
      const chain: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn(),
      };
      if (table === "orders") chain.single.mockResolvedValue({ data: order, error: null });
      else chain.order.mockResolvedValue({ data: rates, error: null });
      return chain;
    });

    const { result } = renderHook(
      () => useCalculateOrderCost("o1", "c1"),
      { wrapper: createWrapper() }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Distance is 0, so per_km line is not included
    expect(result.current.data!.lines).toHaveLength(0);
  });

  it("handles surcharge rate type", async () => {
    const order = { id: "o1", quantity: 1 };
    const rates = [{ rate_type: "toeslag", amount: 50, description: "Weekend toeslag", is_active: true }];

    mockFrom.mockImplementation((table: string) => {
      const chain: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn(),
      };
      if (table === "orders") chain.single.mockResolvedValue({ data: order, error: null });
      else chain.order.mockResolvedValue({ data: rates, error: null });
      return chain;
    });

    const { result } = renderHook(
      () => useCalculateOrderCost("o1", "c1"),
      { wrapper: createWrapper() }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.subtotal).toBe(50);
  });

  it("handles 'surcharge' rate type", async () => {
    const order = { id: "o1", quantity: 1 };
    const rates = [{ rate_type: "surcharge", amount: 75, description: "Surcharge", is_active: true }];

    mockFrom.mockImplementation((table: string) => {
      const chain: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn(),
      };
      if (table === "orders") chain.single.mockResolvedValue({ data: order, error: null });
      else chain.order.mockResolvedValue({ data: rates, error: null });
      return chain;
    });

    const { result } = renderHook(
      () => useCalculateOrderCost("o1", "c1"),
      { wrapper: createWrapper() }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.subtotal).toBe(75);
    expect(result.current.data!.lines[0].unit).toBe("stuk");
  });

  it("handles unknown/default rate type", async () => {
    const order = { id: "o1", quantity: 1 };
    const rates = [{ rate_type: "custom_rate", amount: 100, description: "Custom", is_active: true }];

    mockFrom.mockImplementation((table: string) => {
      const chain: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn(),
      };
      if (table === "orders") chain.single.mockResolvedValue({ data: order, error: null });
      else chain.order.mockResolvedValue({ data: rates, error: null });
      return chain;
    });

    const { result } = renderHook(
      () => useCalculateOrderCost("o1", "c1"),
      { wrapper: createWrapper() }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.subtotal).toBe(100);
    expect(result.current.data!.lines[0].unit).toBe("stuk");
  });

  it("calculates with multiple rate types combined", async () => {
    const order = { id: "o1", quantity: 5, pickup_address: "A", delivery_address: "B" };
    const rates = [
      { rate_type: "per_rit", amount: 100, description: "Rit", is_active: true },
      { rate_type: "per_pallet", amount: 10, description: "Pallet", is_active: true },
      { rate_type: "toeslag", amount: 25, description: "Toeslag", is_active: true },
    ];

    mockFrom.mockImplementation((table: string) => {
      const chain: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn(),
      };
      if (table === "orders") chain.single.mockResolvedValue({ data: order, error: null });
      else chain.order.mockResolvedValue({ data: rates, error: null });
      return chain;
    });

    const { result } = renderHook(
      () => useCalculateOrderCost("o1", "c1"),
      { wrapper: createWrapper() }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // 100 + (5*10) + 25 = 175
    expect(result.current.data!.subtotal).toBe(175);
    expect(result.current.data!.lines).toHaveLength(3);
  });

  it("handles order fetch error", async () => {
    mockFrom.mockImplementation((table: string) => {
      const chain: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn(),
      };
      if (table === "orders") chain.single.mockResolvedValue({ data: null, error: { message: "not found" } });
      else chain.order.mockResolvedValue({ data: [], error: null });
      return chain;
    });

    const { result } = renderHook(
      () => useCalculateOrderCost("o1", "c1"),
      { wrapper: createWrapper() }
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("handles rates using description fallback", async () => {
    const order = { id: "o1", quantity: 1 };
    const rates = [{ rate_type: "per_rit", amount: 100, description: null, is_active: true }];

    mockFrom.mockImplementation((table: string) => {
      const chain: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn(),
      };
      if (table === "orders") chain.single.mockResolvedValue({ data: order, error: null });
      else chain.order.mockResolvedValue({ data: rates, error: null });
      return chain;
    });

    const { result } = renderHook(
      () => useCalculateOrderCost("o1", "c1"),
      { wrapper: createWrapper() }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // When description is null, falls back to rate_type
    expect(result.current.data!.lines[0].description).toBe("per_rit");
  });
});

describe("useAutoInvoiceGeneration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not run when disabled", async () => {
    renderHook(() => useAutoInvoiceGeneration(false), { wrapper: createWrapper() });
    await vi.advanceTimersByTimeAsync(0);
    // Should not call supabase.from at all
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("runs immediately on mount and processes ready orders", async () => {
    const orders = [
      { id: "o1", client_id: "c1", client_name: "Acme", order_number: 1, tenant_id: "t1", quantity: 5, distance_km: 100 },
    ];

    let callIndex = 0;
    mockFrom.mockImplementation((table: string) => {
      callIndex++;
      const chain: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
      };

      if (table === "orders" && callIndex === 1) {
        chain.limit.mockResolvedValue({ data: orders, error: null });
      } else if (table === "client_rates") {
        chain.order.mockResolvedValue({ data: [{ rate_type: "per_rit", amount: 200, description: "Rit", is_active: true }], error: null });
      } else if (table === "clients") {
        chain.single.mockResolvedValue({ data: { name: "Acme", address: "Street", btw_number: null, kvk_number: null, payment_terms: 14 }, error: null });
      } else if (table === "invoices") {
        chain.single.mockResolvedValue({ data: { id: "inv-auto" }, error: null });
      } else if (table === "invoice_lines") {
        chain.insert.mockResolvedValue({ error: null });
      } else if (table === "orders") {
        chain.eq.mockResolvedValue({ error: null });
      } else {
        chain.single.mockResolvedValue({ data: null, error: null });
        chain.eq.mockResolvedValue({ error: null });
        chain.limit.mockResolvedValue({ data: [], error: null });
      }
      return chain;
    });

    mockRpc.mockResolvedValue({ data: "F-2026-AUTO", error: null });

    renderHook(() => useAutoInvoiceGeneration(true), { wrapper: createWrapper() });
    await vi.advanceTimersByTimeAsync(0);

    expect(mockFrom).toHaveBeenCalled();
  });

  it("skips orders without client_id", async () => {
    const orders = [
      { id: "o1", client_id: null, client_name: "Acme", order_number: 1, tenant_id: "t1", quantity: 5, distance_km: 100 },
    ];

    mockFrom.mockImplementation((table: string) => {
      const chain: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: orders, error: null }),
        order: vi.fn().mockReturnThis(),
      };
      return chain;
    });

    renderHook(() => useAutoInvoiceGeneration(true), { wrapper: createWrapper() });
    await vi.advanceTimersByTimeAsync(0);

    // Should not attempt to create invoices (no client_rates fetch since no client_id)
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("handles empty orders list (no work to do)", async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    }));

    renderHook(() => useAutoInvoiceGeneration(true), { wrapper: createWrapper() });
    await vi.advanceTimersByTimeAsync(0);

    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("handles fetch error gracefully", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: null, error: { message: "db down" } }),
    }));

    renderHook(() => useAutoInvoiceGeneration(true), { wrapper: createWrapper() });
    await vi.advanceTimersByTimeAsync(0);

    // Should not crash
    consoleSpy.mockRestore();
  });

  it("cleans up interval on unmount", () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    }));

    const { unmount } = renderHook(() => useAutoInvoiceGeneration(true), { wrapper: createWrapper() });
    unmount();
    // No error on unmount
  });
});
