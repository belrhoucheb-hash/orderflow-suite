import { renderHook, waitFor, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import type { ReactNode } from "react";
import React from "react";

const { mockFrom, mockChannel, mockSupabase } = vi.hoisted(() => {
  const mockFrom = vi.fn();
  const mockChannel = vi.fn().mockReturnValue({
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
  });
  const mockSupabase = {
    from: mockFrom,
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    channel: mockChannel,
    removeChannel: vi.fn(),
  };

  return { mockFrom, mockChannel, mockSupabase };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));
vi.mock("@/components/planning/PlanningDateNav", () => ({
  toDateString: (d: Date) => d.toISOString().split("T")[0],
}));

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc },
      React.createElement(BrowserRouter, null, children)
    );
}

// Mock localStorage
const localStorageMock: Record<string, string> = {};
const originalGetItem = Storage.prototype.getItem;
const originalSetItem = Storage.prototype.setItem;
const originalRemoveItem = Storage.prototype.removeItem;

beforeEach(() => {
  Storage.prototype.getItem = vi.fn((key: string) => localStorageMock[key] || null);
  Storage.prototype.setItem = vi.fn((key: string, value: string) => { localStorageMock[key] = value; });
  Storage.prototype.removeItem = vi.fn((key: string) => { delete localStorageMock[key]; });
});

afterEach(() => {
  Storage.prototype.getItem = originalGetItem;
  Storage.prototype.setItem = originalSetItem;
  Storage.prototype.removeItem = originalRemoveItem;
  Object.keys(localStorageMock).forEach((k) => delete localStorageMock[k]);
});

import {
  useLoadPlanningDraft,
  useSavePlanningDraft,
  useDeletePlanningDraft,
  collectWeekDrafts,
  usePlanningDraftsRealtime,
} from "@/hooks/usePlanningDrafts";

describe("useLoadPlanningDraft", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is disabled when tenantId is undefined", () => {
    const { result } = renderHook(
      () => useLoadPlanningDraft("2026-04-03", undefined),
      { wrapper: createWrapper() }
    );
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("is disabled when date is empty", () => {
    const { result } = renderHook(
      () => useLoadPlanningDraft("", "tenant-1"),
      { wrapper: createWrapper() }
    );
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("loads draft from supabase", async () => {
    const rows = [
      { id: "pd1", vehicle_id: "v1", order_ids: ["o1", "o2"], driver_id: "d1", start_time: "08:00" },
      { id: "pd2", vehicle_id: "v2", order_ids: ["o3"], driver_id: null, start_time: null },
    ];

    mockFrom.mockImplementation(() => {
      const chain: any = {
        select: vi.fn(),
        eq: vi.fn(),
      };
      chain.select.mockReturnValue(chain);
      // first eq returns chain, second eq resolves promise
      let eqCalls = 0;
      chain.eq.mockImplementation(() => {
        eqCalls++;
        if (eqCalls >= 2) {
          return Promise.resolve({ data: rows, error: null });
        }
        return chain;
      });
      return chain;
    });

    const { result } = renderHook(
      () => useLoadPlanningDraft("2026-04-03", "tenant-1"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.assignments?.v1).toEqual(["o1", "o2"]);
    expect(result.current.data?.drivers?.v1).toBe("d1");
    expect(result.current.data?.startTimes?.v1).toBe("08:00");
  });

  it("falls back to localStorage when supabase returns no data", async () => {
    mockFrom.mockImplementation(() => {
      const chain: any = { select: vi.fn().mockReturnThis() };
      let eqCount = 0;
      chain.eq = vi.fn().mockImplementation(() => {
        eqCount++;
        if (eqCount >= 2) return Promise.resolve({ data: [], error: null });
        return chain;
      });
      return chain;
    });

    // Seed localStorage
    localStorageMock["planning-draft-2026-04-03"] = JSON.stringify({ v1: ["o1"] });

    const { result } = renderHook(
      () => useLoadPlanningDraft("2026-04-03", "tenant-1"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.assignments?.v1).toEqual(["o1"]);
  });

  it("falls back to localStorage on supabase error", async () => {
    mockFrom.mockImplementation(() => {
      const chain: any = { select: vi.fn().mockReturnThis() };
      let eqCount = 0;
      chain.eq = vi.fn().mockImplementation(() => {
        eqCount++;
        if (eqCount >= 2) return Promise.resolve({ data: null, error: { message: "network" } });
        return chain;
      });
      return chain;
    });

    localStorageMock["planning-draft-2026-04-03"] = JSON.stringify({ v1: ["o1"] });

    const { result } = renderHook(
      () => useLoadPlanningDraft("2026-04-03", "tenant-1"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.assignments?.v1).toEqual(["o1"]);
  });

  it("returns null when no data anywhere", async () => {
    mockFrom.mockImplementation(() => {
      const chain: any = { select: vi.fn().mockReturnThis() };
      let eqCount = 0;
      chain.eq = vi.fn().mockImplementation(() => {
        eqCount++;
        if (eqCount >= 2) return Promise.resolve({ data: [], error: null });
        return chain;
      });
      return chain;
    });

    const { result } = renderHook(
      () => useLoadPlanningDraft("2026-04-03", "tenant-1"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});

describe("useSavePlanningDraft", () => {
  beforeEach(() => vi.clearAllMocks());

  it("saves draft to localStorage and supabase", async () => {
    mockFrom.mockImplementation((table: string) => ({
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      not: vi.fn().mockResolvedValue({ error: null }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }));

    const { result } = renderHook(() => useSavePlanningDraft(), { wrapper: createWrapper() });

    const assignments = { v1: [{ id: "o1" }] } as any;

    await act(async () => {
      result.current.mutate({
        tenantId: "t1",
        date: "2026-04-03",
        assignments,
        startTimes: { v1: "08:00" },
        drivers: { v1: "d1" },
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Should have written to localStorage
    expect(Storage.prototype.setItem).toHaveBeenCalled();
  });

  it("handles supabase error gracefully (localStorage still saves)", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockFrom.mockImplementation(() => ({
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      not: vi.fn().mockResolvedValue({ error: null }),
      upsert: vi.fn().mockResolvedValue({ error: { message: "fail" } }),
    }));

    const { result } = renderHook(() => useSavePlanningDraft(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({
        tenantId: "t1",
        date: "2026-04-03",
        assignments: { v1: [{ id: "o1" }] } as any,
        startTimes: {},
        drivers: {},
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    // localStorage should still have been written
    expect(Storage.prototype.setItem).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe("useDeletePlanningDraft", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes from localStorage and supabase", async () => {
    mockFrom.mockImplementation(() => ({
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    }));
    // Final eq resolves
    mockFrom.mockImplementation(() => {
      const chain: any = { delete: vi.fn().mockReturnThis() };
      let eqCount = 0;
      chain.eq = vi.fn().mockImplementation(() => {
        eqCount++;
        if (eqCount >= 2) return Promise.resolve({ error: null });
        return chain;
      });
      return chain;
    });

    localStorageMock["planning-draft-2026-04-03"] = "{}";

    const { result } = renderHook(() => useDeletePlanningDraft(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ tenantId: "t1", date: "2026-04-03" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(Storage.prototype.removeItem).toHaveBeenCalled();
  });
});

describe("collectWeekDrafts", () => {
  it("collects drafts for 7 days from localStorage", () => {
    // Seed a Monday draft
    localStorageMock["planning-draft-2026-03-30"] = JSON.stringify({ v1: ["o1"] });

    const result = collectWeekDrafts("2026-03-30");
    expect(result["2026-03-30"]).toEqual({ v1: ["o1"] });
  });

  it("returns empty when no drafts in localStorage", () => {
    const result = collectWeekDrafts("2026-03-30");
    expect(Object.keys(result)).toHaveLength(0);
  });
});

describe("usePlanningDraftsRealtime", () => {
  beforeEach(() => vi.clearAllMocks());

  it("subscribes to planning_drafts changes", () => {
    const { unmount } = renderHook(() => usePlanningDraftsRealtime(), { wrapper: createWrapper() });

    expect(mockChannel).toHaveBeenCalledWith("planning-drafts-realtime");
    unmount();
    expect(mockSupabase.removeChannel).toHaveBeenCalled();
  });
});
