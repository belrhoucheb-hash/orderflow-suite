import { renderHook, waitFor, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import type { ReactNode } from "react";
import React from "react";

const { mockFrom, mockSupabase } = vi.hoisted(() => {
  const mockFrom = vi.fn();
  const mockSupabase = {
    from: mockFrom,
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() }),
    removeChannel: vi.fn(),
  };

  return { mockFrom, mockSupabase };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc },
      React.createElement(BrowserRouter, null, children)
    );
}

import {
  useOrderCorrections,
  useClientCorrectionStats,
  useFieldCorrectionRate,
  useSaveCorrection,
  fieldLabel,
} from "@/hooks/useAICorrections";

describe("fieldLabel", () => {
  it("returns known label for known fields", () => {
    expect(fieldLabel("pickupAddress")).toBe("Ophaaladres");
    expect(fieldLabel("deliveryAddress")).toBe("Afleveradres");
    expect(fieldLabel("quantity")).toBe("Aantal");
    expect(fieldLabel("weight")).toBe("Gewicht");
  });

  it("returns field name for unknown fields", () => {
    expect(fieldLabel("unknownField")).toBe("unknownField");
  });
});

describe("useOrderCorrections", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is disabled when orderId is null", () => {
    const { result } = renderHook(() => useOrderCorrections(null), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("fetches corrections for an order", async () => {
    const corrections = [
      { id: "c1", field_name: "pickupAddress", ai_value: "A", corrected_value: "B" },
    ];
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: corrections, error: null }),
    }));

    const { result } = renderHook(() => useOrderCorrections("o1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
  });

  it("returns empty array when no corrections", async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    }));

    const { result } = renderHook(() => useOrderCorrections("o1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});

describe("useClientCorrectionStats", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is disabled when clientName is null", () => {
    const { result } = renderHook(() => useClientCorrectionStats(null), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("returns stats with field counts and accuracy", async () => {
    const corrections = [
      { field_name: "pickupAddress" },
      { field_name: "pickupAddress" },
      { field_name: "weight" },
    ];

    let callIndex = 0;
    mockFrom.mockImplementation((table: string) => {
      callIndex++;
      const chain: any = {
        select: vi.fn().mockReturnThis(),
        ilike: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
      };
      if (callIndex === 1) {
        // ai_corrections
        chain.ilike.mockResolvedValue({ data: corrections, error: null });
      } else {
        // orders count
        chain.gt.mockResolvedValue({ count: 10 });
      }
      return chain;
    });

    const { result } = renderHook(
      () => useClientCorrectionStats("Acme"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.totalCorrections).toBe(3);
    expect(result.current.data!.topFields).toHaveLength(2);
    expect(result.current.data!.topFields[0].field_name).toBe("pickupAddress");
    expect(result.current.data!.topFields[0].count).toBe(2);
    // Accuracy: (10*6 - 3) / (10*6) * 100 = 95%
    expect(result.current.data!.clientAccuracy).toBe(95);
  });

  it("returns empty stats when no corrections found", async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockResolvedValue({ data: [], error: null }),
    }));

    const { result } = renderHook(
      () => useClientCorrectionStats("Nobody"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.totalCorrections).toBe(0);
    expect(result.current.data!.clientAccuracy).toBeNull();
  });
});

describe("useFieldCorrectionRate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is disabled when either param is null", () => {
    const { result: r1 } = renderHook(() => useFieldCorrectionRate(null, "weight"), { wrapper: createWrapper() });
    expect(r1.current.fetchStatus).toBe("idle");

    const { result: r2 } = renderHook(() => useFieldCorrectionRate("Acme", null), { wrapper: createWrapper() });
    expect(r2.current.fetchStatus).toBe("idle");
  });

  it("calculates correction rate", async () => {
    let callIndex = 0;
    mockFrom.mockImplementation(() => {
      callIndex++;
      const chain: any = {
        select: vi.fn().mockReturnThis(),
        ilike: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
      };
      if (callIndex === 1) {
        // correction count
        chain.eq.mockResolvedValue({ count: 3 });
      } else {
        // order count
        chain.gt.mockResolvedValue({ count: 10 });
      }
      return chain;
    });

    const { result } = renderHook(
      () => useFieldCorrectionRate("Acme", "pickupAddress"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.correctionRate).toBe(30); // 3/10 * 100
    expect(result.current.data!.corrections).toBe(3);
    expect(result.current.data!.totalOrders).toBe(10);
  });

  it("returns null when no orders", async () => {
    let callIndex = 0;
    mockFrom.mockImplementation(() => {
      callIndex++;
      const chain: any = {
        select: vi.fn().mockReturnThis(),
        ilike: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
      };
      if (callIndex === 1) {
        chain.eq.mockResolvedValue({ count: 0 });
      } else {
        chain.gt.mockResolvedValue({ count: 0 });
      }
      return chain;
    });

    const { result } = renderHook(
      () => useFieldCorrectionRate("Nobody", "weight"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});

describe("useSaveCorrection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("saves a correction", async () => {
    mockFrom.mockImplementation(() => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { tenant_id: "t1" }, error: null }),
    }));

    const { result } = renderHook(() => useSaveCorrection(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({
        orderId: "o1",
        clientName: "Acme",
        fieldName: "pickupAddress",
        aiValue: "Amsterdam",
        correctedValue: "Rotterdam",
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("skips when correctedValue is empty", async () => {
    const { result } = renderHook(() => useSaveCorrection(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({
        orderId: "o1",
        clientName: "Acme",
        fieldName: "weight",
        aiValue: "100",
        correctedValue: "",
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("skips when values are identical", async () => {
    const { result } = renderHook(() => useSaveCorrection(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({
        orderId: "o1",
        clientName: "Acme",
        fieldName: "weight",
        aiValue: "100",
        correctedValue: "100",
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("resolves tenant_id from order when not provided", async () => {
    let callIndex = 0;
    mockFrom.mockImplementation((table: string) => {
      callIndex++;
      if (table === "orders") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { tenant_id: "t-resolved" }, error: null }),
        };
      }
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    });

    const { result } = renderHook(() => useSaveCorrection(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({
        orderId: "o1",
        clientName: "Acme",
        fieldName: "weight",
        aiValue: "100",
        correctedValue: "200",
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFrom).toHaveBeenCalledWith("orders");
  });
});
