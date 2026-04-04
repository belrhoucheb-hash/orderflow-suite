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

function makeChain(resolvedValue: { data: any; error: any }) {
  const single = vi.fn().mockResolvedValue(resolvedValue);
  const chain: Record<string, any> = { single };
  ["select", "insert", "update", "delete", "eq", "order", "limit", "or", "not", "ilike", "range"].forEach((m) => {
    chain[m] = vi.fn().mockReturnValue(chain);
  });
  // Make the chain itself awaitable (for queries that don't end in .single())
  chain.then = (resolve: any) => resolve(resolvedValue);
  return chain;
}

import {
  usePackagingBalances,
  useClientPackagingBalance,
  usePackagingMovements,
  useCreatePackagingMovement,
  useDeletePackagingMovement,
  useLoadingUnits,
} from "@/hooks/usePackaging";

describe("usePackagingBalances", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns loading state initially", () => {
    const chain = makeChain({ data: [], error: null });
    // Make it never resolve
    chain.then = undefined;
    chain.order = vi.fn().mockReturnValue(new Promise(() => {}));
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => usePackagingBalances(), { wrapper: createWrapper() });
    expect(result.current.isLoading).toBe(true);
  });

  it("fetches packaging balances", async () => {
    const balances = [
      { tenant_id: "t1", client_id: "c1", loading_unit_id: "lu1", loading_unit_name: "Pallet", loading_unit_code: "PAL", client_name: "Klant A", balance: 5, total_movements: 3, last_movement_at: "2026-01-01" },
    ];
    const chain = makeChain({ data: balances, error: null });
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => usePackagingBalances(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].balance).toBe(5);
  });
});

describe("useClientPackagingBalance", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is disabled when clientId is empty", () => {
    mockFrom.mockReturnValue(makeChain({ data: [], error: null }));
    const { result } = renderHook(() => useClientPackagingBalance(""), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("fetches balance for a client", async () => {
    const chain = makeChain({ data: [{ client_id: "c1", balance: 3 }], error: null });
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => useClientPackagingBalance("c1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
  });
});

describe("usePackagingMovements", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches and maps movements with joined data", async () => {
    const rows = [{
      id: "m1", tenant_id: "t1", client_id: "c1", order_id: null, trip_stop_id: null,
      loading_unit_id: "lu1", direction: "UIT", quantity: 2, recorded_by: null,
      recorded_at: "2026-01-01T10:00:00Z", notes: null, created_at: "2026-01-01T10:00:00Z",
      loading_units: { name: "Pallet", code: "PAL" },
      clients: { name: "Klant A" },
    }];
    const chain = makeChain({ data: rows, error: null });
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => usePackagingMovements({ clientId: "c1" }), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].direction).toBe("UIT");
    expect(result.current.data![0].loading_unit?.name).toBe("Pallet");
    expect(result.current.data![0].client?.name).toBe("Klant A");
  });
});

describe("useCreatePackagingMovement", () => {
  beforeEach(() => vi.clearAllMocks());

  it("inserts a movement and invalidates caches", async () => {
    const newMovement = { id: "m-new", tenant_id: "t1", client_id: "c1", loading_unit_id: "lu1", direction: "UIT", quantity: 1 };
    const chain = makeChain({ data: newMovement, error: null });
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => useCreatePackagingMovement(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync({
        tenant_id: "t1",
        client_id: "c1",
        loading_unit_id: "lu1",
        direction: "UIT",
        quantity: 1,
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe("useDeletePackagingMovement", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes a movement by id", async () => {
    const chain = makeChain({ data: null, error: null });
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => useDeletePackagingMovement(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync("m1");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe("useLoadingUnits", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches active loading units", async () => {
    const units = [
      { id: "lu1", name: "Pallet", code: "PAL", default_weight_kg: 25 },
      { id: "lu2", name: "Rol", code: "ROL", default_weight_kg: 10 },
    ];
    const chain = makeChain({ data: units, error: null });
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => useLoadingUnits(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data![0].code).toBe("PAL");
  });
});
