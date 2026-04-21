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

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({
    tenant: { id: "00000000-0000-0000-0000-000000000001", name: "Test" },
    loading: false,
  }),
}));

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc },
      React.createElement(BrowserRouter, null, children)
    );
}

function makeChain(resolvedValue: any = { data: [], error: null }) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue(resolvedValue),
    single: vi.fn().mockResolvedValue(resolvedValue),
    contains: vi.fn().mockReturnThis(),
  };
  chain.select.mockReturnValue(chain);
  chain.insert.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  chain.delete.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.contains.mockReturnValue(chain);
  return chain;
}

import { useDrivers, useAvailableDrivers } from "@/hooks/useDrivers";

describe("useDrivers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches drivers list", async () => {
    const drivers = [
      { id: "d1", name: "Jan", status: "beschikbaar", certifications: [] },
      { id: "d2", name: "Piet", status: "onderweg", certifications: ["ADR"] },
    ];
    mockFrom.mockReturnValue(makeChain({ data: drivers, error: null }));

    const { result } = renderHook(() => useDrivers(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data![0].name).toBe("Jan");
  });

  it("returns error on fetch failure", async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: "fail" } }));

    const { result } = renderHook(() => useDrivers(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("createDriver mutation calls insert and invalidates", async () => {
    const newDriver = { id: "d3", name: "Klaas" };
    const chain = makeChain({ data: newDriver, error: null });
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => useDrivers(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.createDriver.mutate({ name: "Klaas" });
    });

    await waitFor(() => expect(result.current.createDriver.isSuccess).toBe(true));
  });

  it("updateDriver mutation calls update with id", async () => {
    const updated = { id: "d1", name: "Jan Updated" };
    const chain = makeChain({ data: updated, error: null });
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => useDrivers(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.updateDriver.mutate({ id: "d1", name: "Jan Updated" });
    });

    await waitFor(() => expect(result.current.updateDriver.isSuccess).toBe(true));
  });

  it("deleteDriver mutation calls delete", async () => {
    const chain = makeChain({ data: null, error: null });
    chain.eq.mockResolvedValue({ error: null });
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => useDrivers(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.deleteDriver.mutate("d1");
    });

    await waitFor(() => expect(result.current.deleteDriver.isSuccess).toBe(true));
  });

  it("deleteDriver handles error", async () => {
    const chain = makeChain({ data: null, error: null });
    chain.delete.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: { message: "FK constraint" } }) });
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => useDrivers(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.deleteDriver.mutate("d1");
    });

    await waitFor(() => expect(result.current.deleteDriver.isError).toBe(true));
  });
});

describe("useAvailableDrivers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches available drivers with no certifications filter", async () => {
    const drivers = [{ id: "d1", name: "Jan", status: "beschikbaar" }];
    mockFrom.mockReturnValue(makeChain({ data: drivers, error: null }));

    const { result } = renderHook(() => useAvailableDrivers(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(drivers);
  });

  it("fetches available drivers with certifications filter", async () => {
    const drivers = [{ id: "d1", name: "Jan", certifications: ["ADR"] }];
    mockFrom.mockReturnValue(makeChain({ data: drivers, error: null }));

    const { result } = renderHook(() => useAvailableDrivers(["ADR"]), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(drivers);
  });

  it("handles error", async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: "fail" } }));

    const { result } = renderHook(() => useAvailableDrivers(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
