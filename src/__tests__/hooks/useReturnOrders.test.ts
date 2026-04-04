import { renderHook, waitFor, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import type { ReactNode } from "react";

// ── Supabase mock ──
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
  return ({ children }: { children: ReactNode }) => {
    const { createElement } = require("react");
    return createElement(QueryClientProvider, { client: qc },
      createElement(BrowserRouter, null, children)
    );
  };
}

import { useCreateReturnOrder, useReturnOrders } from "@/hooks/useReturnOrders";

const parentOrder = {
  id: "parent-1",
  tenant_id: "tenant-1",
  order_number: 42,
  order_type: "ZENDING",
  status: "PENDING",
  priority: "normaal",
  client_name: "Test Klant",
  pickup_address: "Ophaaladres 1, Amsterdam",
  delivery_address: "Afleveradres 2, Rotterdam",
  geocoded_pickup_lat: 52.3,
  geocoded_pickup_lng: 4.9,
  geocoded_delivery_lat: 51.9,
  geocoded_delivery_lng: 4.5,
  quantity: 5,
  unit: "pallet",
  weight_kg: 100,
  is_weight_per_unit: false,
  requirements: [],
  transport_type: "wegvervoer",
  internal_note: null,
  source_email_from: "klant@test.nl",
};

function makeChain(finalValue: { data: any; error: any }) {
  const single = vi.fn().mockResolvedValue(finalValue);
  const chain: Record<string, any> = { single };
  ["select", "insert", "update", "delete", "eq", "order", "limit", "or", "not", "ilike", "range"].forEach((m) => {
    chain[m] = vi.fn().mockReturnValue(chain);
  });
  return chain;
}

describe("useCreateReturnOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches parent order and creates a reversed RETOUR order", async () => {
    // First call (select single) returns parent
    const fetchChain = makeChain({ data: parentOrder, error: null });
    // Second call (insert + select + single) returns new order
    const insertChain = makeChain({
      data: { ...parentOrder, id: "return-1", order_type: "RETOUR", return_reason: "BESCHADIGD" },
      error: null,
    });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return fetchChain;
      return insertChain;
    });

    const { result } = renderHook(() => useCreateReturnOrder(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync({
        parentOrderId: "parent-1",
        returnReason: "BESCHADIGD",
        notes: "Test retour",
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(callCount).toBe(2);
  });

  it("throws when parent order fetch fails", async () => {
    const errorChain = makeChain({ data: null, error: { message: "Not found" } });
    mockFrom.mockReturnValue(errorChain);

    const { result } = renderHook(() => useCreateReturnOrder(), { wrapper: createWrapper() });

    await act(async () => {
      try {
        await result.current.mutateAsync({ parentOrderId: "nonexistent", returnReason: "OVERIG" });
      } catch {
        // expected to throw
      }
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useReturnOrders", () => {
  it("returns correct query config for parentOrderId", () => {
    const config = useReturnOrders("parent-1");
    expect(config.queryKey).toEqual(["orders", "returns", "parent-1"]);
    expect(config.enabled).toBe(true);
  });

  it("returns disabled when parentOrderId is empty", () => {
    const config = useReturnOrders("");
    expect(config.enabled).toBe(false);
  });
});
