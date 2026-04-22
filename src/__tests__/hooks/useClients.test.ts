import { renderHook, waitFor, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import type { ReactNode } from "react";

// ── Supabase mock ──
const { mockSelect, mockInsert, mockUpdate, mockDelete, mockEq, mockOrder, mockLimit, mockOr, mockNot, mockIlike, mockSingle, mockFrom, mockSupabase } = vi.hoisted(() => {
  const mockSelect = vi.fn().mockReturnThis();
  const mockInsert = vi.fn().mockReturnThis();
  const mockUpdate = vi.fn().mockReturnThis();
  const mockDelete = vi.fn().mockReturnThis();
  const mockEq = vi.fn().mockReturnThis();
  const mockOrder = vi.fn().mockReturnThis();
  const mockLimit = vi.fn().mockReturnThis();
  const mockOr = vi.fn().mockReturnThis();
  const mockNot = vi.fn().mockReturnThis();
  const mockIlike = vi.fn().mockReturnThis();
  const mockSingle = vi.fn();

  const mockFrom = vi.fn().mockReturnValue({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    eq: mockEq,
    order: mockOrder,
    limit: mockLimit,
    or: mockOr,
    not: mockNot,
    ilike: mockIlike,
    single: mockSingle,
  });

  // Chain all methods to return the same chainable object
  const chainable = {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    eq: mockEq,
    order: mockOrder,
    limit: mockLimit,
    or: mockOr,
    not: mockNot,
    ilike: mockIlike,
    single: mockSingle,
  };
  Object.values(chainable).forEach((fn) => {
    if (fn !== mockSingle) {
      fn.mockReturnValue(chainable);
    }
  });

  const mockSupabase = {
    from: mockFrom,
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() }),
    removeChannel: vi.fn(),
  };

  return { mockSelect, mockInsert, mockUpdate, mockDelete, mockEq, mockOrder, mockLimit, mockOr, mockNot, mockIlike, mockSingle, mockFrom, mockSupabase };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({
    tenant: { id: "00000000-0000-0000-0000-000000000001", name: "Test" },
    loading: false,
  }),
}));

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) => {
    const { createElement } = require("react");
    return createElement(QueryClientProvider, { client: qc },
      createElement(BrowserRouter, null, children)
    );
  };
}

import {
  useClients,
  useClientsList,
  useClientLocations,
  useClientRates,
  useClientOrders,
  useCreateClient,
  useRevenueYtd,
  useClientStats,
} from "@/hooks/useClients";

describe("useClients", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns loading state initially", () => {
    // Make the query hang
    mockLimit.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useClients(), { wrapper: createWrapper() });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it("fetches clients without counts in array-mode", async () => {
    const clients = [
      { id: "1", name: "Acme Corp", email: "a@a.com", is_active: true },
      { id: "2", name: "Beta Inc", email: "b@b.com", is_active: true },
    ];
    mockFrom.mockImplementation(() => {
      const chain: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: clients, error: null }),
      };
      return chain;
    });

    const { result } = renderHook(() => useClients(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(2);
  });

  it("applies search filter", async () => {
    mockFrom.mockImplementation((table: string) => {
      // Build a fully chainable mock where every method returns the chain
      // and the chain itself is thenable (like Supabase query builders)
      const makeThenable = (data: any) => {
        const chain: any = {};
        const methods = ["select", "order", "limit", "or", "not", "eq"];
        methods.forEach(m => { chain[m] = vi.fn().mockReturnValue(chain); });
        // Make the chain thenable (awaitable) like Supabase PostgREST
        chain.then = vi.fn().mockImplementation((resolve: any, reject?: any) =>
          Promise.resolve(data).then(resolve, reject)
        );
        return chain;
      };
      if (table === "clients") {
        return makeThenable({ data: [], error: null });
      } else {
        return makeThenable({ data: [], error: null });
      }
    });

    const { result } = renderHook(() => useClients("test"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFrom).toHaveBeenCalledWith("clients");
  });

  it("throws on supabase error", async () => {
    mockFrom.mockImplementation((table: string) => {
      const chain: any = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      };
      if (table === "clients") {
        chain.limit.mockResolvedValue({ data: null, error: { message: "DB error" } });
      } else {
        chain.not.mockResolvedValue({ data: [], error: null });
      }
      return chain;
    });

    const { result } = renderHook(() => useClients(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useClientsList", () => {
  beforeEach(() => vi.clearAllMocks());

  function makeThenable(data: any) {
    const chain: any = {};
    const methods = ["select", "order", "limit", "or", "not", "eq", "gte", "range"];
    methods.forEach((m) => {
      chain[m] = vi.fn().mockReturnValue(chain);
    });
    chain.then = vi.fn().mockImplementation((resolve: any, reject?: any) =>
      Promise.resolve(data).then(resolve, reject),
    );
    return chain;
  }

  it("joins active-order counts + last_order_at via client_id", async () => {
    const clients = [
      { id: "1", name: "Acme Corp", is_active: true },
      { id: "2", name: "Beta Inc", is_active: true },
    ];
    const activeOrders = [{ client_id: "1" }, { client_id: "1" }];
    const allOrders = [
      { client_id: "1", created_at: "2026-04-20T12:00:00Z" },
      { client_id: "1", created_at: "2026-03-15T12:00:00Z" },
    ];

    let ordersCall = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "clients") {
        return makeThenable({ data: clients, count: 2, error: null });
      }
      if (table === "orders") {
        ordersCall += 1;
        const payload =
          ordersCall === 1
            ? { data: activeOrders, error: null }
            : { data: allOrders, error: null };
        return makeThenable(payload);
      }
      return makeThenable({ data: [], error: null });
    });

    const { result } = renderHook(() => useClientsList(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.clients).toHaveLength(2);
    expect(result.current.data!.clients[0].active_order_count).toBe(2);
    expect(result.current.data!.clients[0].last_order_at).toBe("2026-04-20T12:00:00Z");
    expect(result.current.data!.clients[1].active_order_count).toBe(0);
    expect(result.current.data!.clients[1].last_order_at).toBeNull();
    expect(result.current.data!.clients[1].is_dormant).toBe(true);
    expect(result.current.data!.totalCount).toBe(2);
  });

  it("excludeert klanten met recente orders als dormantOnly actief is", async () => {
    const clients = [{ id: "99", name: "Oude Klant", is_active: true }];
    const recent = [{ client_id: "42" }];

    let ordersCall = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "clients") {
        return makeThenable({ data: clients, count: 1, error: null });
      }
      if (table === "orders") {
        ordersCall += 1;
        if (ordersCall === 1) {
          // recent-orders voor dormantExcludeIds
          return makeThenable({ data: recent, error: null });
        }
        return makeThenable({ data: [], error: null });
      }
      return makeThenable({ data: [], error: null });
    });

    const { result } = renderHook(
      () => useClientsList({ dormantOnly: true }),
      { wrapper: createWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.clients[0].is_dormant).toBe(true);
    expect(result.current.data!.totalCount).toBe(1);
  });
});

describe("useClientStats", () => {
  beforeEach(() => vi.clearAllMocks());

  function makeThenable(data: any) {
    const chain: any = {};
    const methods = ["select", "eq", "gte", "not"];
    methods.forEach((m) => {
      chain[m] = vi.fn().mockReturnValue(chain);
    });
    chain.then = vi.fn().mockImplementation((resolve: any, reject?: any) =>
      Promise.resolve(data).then(resolve, reject),
    );
    return chain;
  }

  it("telt actief, inactief en slapend", async () => {
    const clients = [
      { id: "a", is_active: true },
      { id: "b", is_active: true },
      { id: "c", is_active: false },
    ];
    const recent = [{ client_id: "a" }];

    mockFrom.mockImplementation((table: string) => {
      if (table === "clients") return makeThenable({ data: clients, error: null });
      if (table === "orders") return makeThenable({ data: recent, error: null });
      return makeThenable({ data: [], error: null });
    });

    const { result } = renderHook(() => useClientStats(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      total: 3,
      active: 2,
      inactive: 1,
      // a heeft recent order, b niet, c is inactief, dus 1 slapend
      dormant: 1,
    });
  });
});

describe("useClientLocations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is disabled when clientId is null", () => {
    const { result } = renderHook(() => useClientLocations(null), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("fetches locations for a client", async () => {
    const locations = [{ id: "loc1", label: "Warehouse A" }];
    mockFrom.mockImplementation(() => {
      const chain: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: locations, error: null }),
      };
      return chain;
    });

    const { result } = renderHook(() => useClientLocations("client-1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(locations);
  });

  it("throws on error", async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: { message: "fail" } }),
    }));

    const { result } = renderHook(() => useClientLocations("c1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useClientRates", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is disabled when clientId is null", () => {
    const { result } = renderHook(() => useClientRates(null), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("fetches rates for a client", async () => {
    const rates = [{ id: "r1", rate_type: "per_km", amount: 1.5 }];
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: rates, error: null }),
    }));

    const { result } = renderHook(() => useClientRates("c1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(rates);
  });
});

describe("useClientOrders", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is disabled when clientId is null", () => {
    const { result } = renderHook(() => useClientOrders(null), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("fetches orders for a client by id", async () => {
    const orders = [{ id: "o1", order_number: 42, status: "DRAFT" }];
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: orders, error: null }),
    }));

    const { result } = renderHook(() => useClientOrders("client-1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(orders);
  });
});

describe("useRevenueYtd", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is disabled when clientId is null", () => {
    const { result } = renderHook(() => useRevenueYtd(null), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("sums invoices.total voor de lopende jaar-periode", async () => {
    const rows = [{ total: 125.5 }, { total: 74.5 }, { total: 0 }];
    mockFrom.mockImplementation(() => {
      const chain: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        gte: vi.fn().mockResolvedValue({ data: rows, error: null }),
      };
      return chain;
    });

    const { result } = renderHook(() => useRevenueYtd("c1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(200);
  });

  it("geeft 0 terug als er geen facturen zijn", async () => {
    mockFrom.mockImplementation(() => {
      const chain: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        gte: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
      return chain;
    });

    const { result } = renderHook(() => useRevenueYtd("c1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(0);
  });
});

describe("useCreateClient", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a client and invalidates queries", async () => {
    const newClient = { id: "new1", name: "New Corp" };
    mockFrom.mockImplementation(() => ({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: newClient, error: null }),
    }));

    const { result } = renderHook(() => useCreateClient(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ name: "New Corp" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(newClient);
  });

  it("handles creation error", async () => {
    mockFrom.mockImplementation(() => ({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: "duplicate" } }),
    }));

    const { result } = renderHook(() => useCreateClient(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ name: "Dup Corp" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
