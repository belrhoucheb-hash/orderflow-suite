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
  useTenant: () => ({ tenant: { id: "tenant-1", name: "Test" }, loading: false }),
}));

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc },
      React.createElement(BrowserRouter, null, children),
    );
}

import { useDriverSchedules } from "@/hooks/useDriverSchedules";

describe("useDriverSchedules", () => {
  beforeEach(() => vi.clearAllMocks());

  it("bulkUpsert retourneert vroeg met lege array zonder Supabase-call", async () => {
    // Bij lege input willen we geen enkele from()-call richting `driver_schedules` upsert
    const upsertSpy = vi.fn();
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      upsert: upsertSpy,
      insert: vi.fn(),
    }));

    const { result } = renderHook(
      () => useDriverSchedules("2026-05-01", "2026-05-07"),
      { wrapper: createWrapper() },
    );

    let returned: unknown;
    await act(async () => {
      returned = await result.current.bulkUpsert.mutateAsync([]);
    });

    expect(returned).toEqual([]);
    // Er mag géén upsert-aanroep plaatsvinden voor lege input
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it("upsertSchedule roept upsert aan met onConflict 'tenant_id,driver_id,date'", async () => {
    const upsertSpy = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "sched-1",
            tenant_id: "tenant-1",
            driver_id: "driver-1",
            date: "2026-05-01",
            status: "werkt",
          },
          error: null,
        }),
      }),
    });

    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      upsert: upsertSpy,
    }));

    const { result } = renderHook(
      () => useDriverSchedules("2026-05-01", "2026-05-07"),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      await result.current.upsertSchedule.mutateAsync({
        driver_id: "driver-1",
        date: "2026-05-01",
        status: "werkt",
      });
    });

    expect(upsertSpy).toHaveBeenCalledTimes(1);
    const [payload, options] = upsertSpy.mock.calls[0];
    expect(options).toEqual({ onConflict: "tenant_id,driver_id,date" });
    // Payload moet tenant_id bevatten (useTenantInsert injecteert die)
    expect(payload).toMatchObject({
      driver_id: "driver-1",
      date: "2026-05-01",
      tenant_id: "tenant-1",
    });
  });

  it("bulkUpsert roept upsert aan met onConflict 'tenant_id,driver_id,date' bij niet-lege input", async () => {
    const upsertSpy = vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
    });

    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      upsert: upsertSpy,
    }));

    const { result } = renderHook(
      () => useDriverSchedules("2026-05-01", "2026-05-07"),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      await result.current.bulkUpsert.mutateAsync([
        { driver_id: "driver-1", date: "2026-05-01", status: "werkt" },
        { driver_id: "driver-2", date: "2026-05-01", status: "vrij" },
      ]);
    });

    expect(upsertSpy).toHaveBeenCalledTimes(1);
    const [payload, options] = upsertSpy.mock.calls[0];
    expect(options).toEqual({ onConflict: "tenant_id,driver_id,date" });
    expect(Array.isArray(payload)).toBe(true);
    expect(payload).toHaveLength(2);
    expect(payload[0]).toMatchObject({ tenant_id: "tenant-1", driver_id: "driver-1" });
  });

  it("de list-query voert een date-range select uit", async () => {
    const orderSpy = vi.fn().mockResolvedValue({
      data: [{ id: "s1", tenant_id: "tenant-1", driver_id: "d1", date: "2026-05-02", status: "werkt" }],
      error: null,
    });
    const lteSpy = vi.fn().mockReturnValue({ order: orderSpy });
    const gteSpy = vi.fn().mockReturnValue({ lte: lteSpy });
    const selectSpy = vi.fn().mockReturnValue({ gte: gteSpy });

    mockFrom.mockImplementation(() => ({
      select: selectSpy,
      upsert: vi.fn(),
    }));

    const { result } = renderHook(
      () => useDriverSchedules("2026-05-01", "2026-05-07"),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(gteSpy).toHaveBeenCalledWith("date", "2026-05-01");
    expect(lteSpy).toHaveBeenCalledWith("date", "2026-05-07");
    expect(orderSpy).toHaveBeenCalledWith("date", { ascending: true });
    expect(result.current.schedules).toHaveLength(1);
  });
});
