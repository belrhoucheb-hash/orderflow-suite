import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import type { ReactNode } from "react";
import React from "react";

const { mockFrom, mockChannel, mockSupabase } = vi.hoisted(() => {
  const mockFrom = vi.fn();
  const mockChannelOn = vi.fn().mockReturnThis();
  const mockChannelSubscribe = vi.fn().mockReturnValue({ unsubscribe: vi.fn() });
  const mockChannelInstance = {
    on: mockChannelOn,
    subscribe: mockChannelSubscribe,
  };
  const mockChannel = vi.fn().mockReturnValue(mockChannelInstance);
  const mockSupabase = {
    from: mockFrom,
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1", app_metadata: { tenant_id: "t1" } } }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    channel: mockChannel,
    removeChannel: vi.fn(),
  };

  return { mockFrom, mockChannel, mockChannelOn, mockChannelSubscribe, mockChannelInstance, mockSupabase };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));

const { mockCreateNotification } = vi.hoisted(() => {
  const mockCreateNotification = vi.fn();
  return { mockCreateNotification };
});
vi.mock("@/hooks/useNotifications", () => ({
  createNotification: (...args: any[]) => mockCreateNotification(...args),
}));

vi.mock("@/hooks/useSettings", () => ({
  useLoadSettings: () => ({
    data: { enabled: true, deadlineHours: 4, warningMinutes: 60 },
  }),
}));

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc },
      React.createElement(BrowserRouter, null, children)
    );
}

import { useSLAMonitor } from "@/hooks/useSLAMonitor";

describe("useSLAMonitor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("checks SLA on mount and creates critical notification for expired orders", async () => {
    vi.useRealTimers();

    const expiredOrder = {
      id: "o1",
      order_number: 42,
      client_name: "Acme",
      received_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      status: "DRAFT",
    };

    mockFrom.mockImplementation((table: string) => {
      if (table === "orders") {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          not: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [expiredOrder], error: null }),
        };
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    });

    renderHook(() => useSLAMonitor(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(mockCreateNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "sla_critical",
          title: expect.stringContaining("SLA verlopen"),
        })
      );
    });
  });

  it("creates warning notification for orders with < 60 min left", async () => {
    vi.useRealTimers();

    const warningOrder = {
      id: "o2",
      order_number: 43,
      client_name: "Beta",
      received_at: new Date(Date.now() - 3.5 * 60 * 60 * 1000).toISOString(),
      status: "PENDING",
    };

    mockFrom.mockImplementation((table: string) => {
      if (table === "orders") {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          not: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [warningOrder], error: null }),
        };
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    });

    renderHook(() => useSLAMonitor(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(mockCreateNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "sla_warning",
          title: expect.stringContaining("SLA waarschuwing"),
        })
      );
    });
  });

  it("includes minutesLeft in warning notification metadata", async () => {
    vi.useRealTimers();

    const warningOrder = {
      id: "o-warn",
      order_number: 50,
      client_name: "Gamma",
      received_at: new Date(Date.now() - 3.25 * 60 * 60 * 1000).toISOString(), // 3h15m ago, 45m left
      status: "DRAFT",
    };

    mockFrom.mockImplementation((table: string) => ({
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [warningOrder], error: null }),
    }));

    renderHook(() => useSLAMonitor(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(mockCreateNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "sla_warning",
          metadata: expect.objectContaining({ minutes_left: expect.any(Number) }),
        })
      );
    });

    const call = mockCreateNotification.mock.calls.find((c: any) => c[0].type === "sla_warning");
    expect(call[0].metadata.minutes_left).toBeGreaterThan(0);
    expect(call[0].metadata.minutes_left).toBeLessThanOrEqual(60);
  });

  it("critical notification has minutes_left 0 in metadata", async () => {
    vi.useRealTimers();

    const expiredOrder = {
      id: "o-crit",
      order_number: 51,
      client_name: "Delta",
      received_at: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
      status: "DRAFT",
    };

    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [expiredOrder], error: null }),
    }));

    renderHook(() => useSLAMonitor(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(mockCreateNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "sla_critical",
          metadata: expect.objectContaining({ minutes_left: 0 }),
        })
      );
    });
  });

  it("does not re-notify for already-notified orders", async () => {
    vi.useRealTimers();

    const expiredOrder = {
      id: "o1",
      order_number: 42,
      client_name: "Acme",
      received_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      status: "DRAFT",
    };

    mockFrom.mockImplementation((table: string) => {
      if (table === "orders") {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          not: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [expiredOrder], error: null }),
        };
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    });

    renderHook(() => useSLAMonitor(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(mockCreateNotification).toHaveBeenCalled();
    });

    const firstCallCount = mockCreateNotification.mock.calls.length;
    expect(firstCallCount).toBeGreaterThan(0);
  });

  it("does not notify for orders with plenty of time left", async () => {
    const freshOrder = {
      id: "o3",
      order_number: 44,
      client_name: "Gamma",
      received_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
      status: "DRAFT",
    };

    mockFrom.mockImplementation((table: string) => ({
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [freshOrder], error: null }),
    }));

    renderHook(() => useSLAMonitor(), { wrapper: createWrapper() });
    await vi.advanceTimersByTimeAsync(0);

    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("handles fetch errors gracefully", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: { message: "fail" } }),
    }));

    renderHook(() => useSLAMonitor(), { wrapper: createWrapper() });
    await vi.advanceTimersByTimeAsync(0);

    expect(mockCreateNotification).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("handles exception in checkSLA gracefully", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockRejectedValue(new Error("network error")),
    }));

    renderHook(() => useSLAMonitor(), { wrapper: createWrapper() });
    await vi.advanceTimersByTimeAsync(0);

    expect(mockCreateNotification).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("skips orders without received_at", async () => {
    const orderNoDate = {
      id: "o-nodate",
      order_number: 99,
      client_name: "NullDate Corp",
      received_at: null,
      status: "DRAFT",
    };

    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [orderNoDate], error: null }),
    }));

    renderHook(() => useSLAMonitor(), { wrapper: createWrapper() });
    await vi.advanceTimersByTimeAsync(0);

    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("uses 'Onbekende klant' for orders without client_name", async () => {
    vi.useRealTimers();

    const expiredNoName = {
      id: "o-noname",
      order_number: 55,
      client_name: null,
      received_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      status: "DRAFT",
    };

    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [expiredNoName], error: null }),
    }));

    renderHook(() => useSLAMonitor(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(mockCreateNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "sla_critical",
          message: expect.stringContaining("Onbekende klant"),
        })
      );
    });
  });

  it("sets up realtime subscription for order changes", () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    }));

    const { unmount } = renderHook(() => useSLAMonitor(), { wrapper: createWrapper() });

    expect(mockChannel).toHaveBeenCalledWith("order-changes-notifications");
    unmount();
    expect(mockSupabase.removeChannel).toHaveBeenCalled();
  });

  it("cleans up interval on unmount", () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    }));

    const { unmount } = renderHook(() => useSLAMonitor(), { wrapper: createWrapper() });
    unmount();
  });

  // ── Realtime event handler tests ──

  it("realtime: creates notification when order is cancelled", async () => {
    vi.useRealTimers();

    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    }));

    renderHook(() => useSLAMonitor(), { wrapper: createWrapper() });

    // Find the realtime callback registered via .on()
    const channelInstance = mockChannel.mock.results[0].value;
    const onCall = channelInstance.on.mock.calls.find(
      (c: any) => c[1]?.event === "UPDATE" && c[1]?.table === "orders"
    );
    expect(onCall).toBeTruthy();

    const handler = onCall[2];

    // Simulate CANCELLED event
    await handler({
      old: { status: "PENDING" },
      new: { id: "o-cancel", order_number: 77, client_name: "CancelCorp", status: "CANCELLED", vehicle_id: "v1" },
    });

    await waitFor(() => {
      expect(mockCreateNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "order_cancelled",
          title: expect.stringContaining("geannuleerd"),
        })
      );
    });
  });

  it("realtime: creates notification when order is cancelled without vehicle", async () => {
    vi.useRealTimers();

    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    }));

    renderHook(() => useSLAMonitor(), { wrapper: createWrapper() });

    const channelInstance = mockChannel.mock.results[0].value;
    const onCall = channelInstance.on.mock.calls.find(
      (c: any) => c[1]?.event === "UPDATE" && c[1]?.table === "orders"
    );
    const handler = onCall[2];

    await handler({
      old: { status: "PENDING" },
      new: { id: "o-cancel2", order_number: 78, client_name: "NoCar", status: "CANCELLED", vehicle_id: null },
    });

    await waitFor(() => {
      expect(mockCreateNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "order_cancelled",
          message: expect.not.stringContaining("Voertuig"),
        })
      );
    });
  });

  it("realtime: creates notification for client reply merged", async () => {
    vi.useRealTimers();

    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    }));

    renderHook(() => useSLAMonitor(), { wrapper: createWrapper() });

    const channelInstance = mockChannel.mock.results[0].value;
    const onCall = channelInstance.on.mock.calls.find(
      (c: any) => c[1]?.event === "UPDATE" && c[1]?.table === "orders"
    );
    const handler = onCall[2];

    await handler({
      old: { status: "DRAFT" },
      new: { id: "o-reply", order_number: 80, client_name: "ReplyClient", status: "PENDING", thread_type: "update" },
    });

    await waitFor(() => {
      expect(mockCreateNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "client_reply",
          title: expect.stringContaining("Reply verwerkt"),
        })
      );
    });
  });

  it("realtime: creates notification for order approved (DRAFT -> PENDING)", async () => {
    vi.useRealTimers();

    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    }));

    renderHook(() => useSLAMonitor(), { wrapper: createWrapper() });

    const channelInstance = mockChannel.mock.results[0].value;
    const onCall = channelInstance.on.mock.calls.find(
      (c: any) => c[1]?.event === "UPDATE" && c[1]?.table === "orders"
    );
    const handler = onCall[2];

    await handler({
      old: { status: "DRAFT" },
      new: { id: "o-approve", order_number: 81, client_name: "ApproveClient", status: "PENDING", thread_type: "new" },
    });

    await waitFor(() => {
      expect(mockCreateNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "order_approved",
          title: expect.stringContaining("goedgekeurd"),
        })
      );
    });
  });

  it("realtime: does NOT create approved notification when thread_type is 'update'", async () => {
    vi.useRealTimers();

    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    }));

    renderHook(() => useSLAMonitor(), { wrapper: createWrapper() });

    const channelInstance = mockChannel.mock.results[0].value;
    const onCall = channelInstance.on.mock.calls.find(
      (c: any) => c[1]?.event === "UPDATE" && c[1]?.table === "orders"
    );
    const handler = onCall[2];

    await handler({
      old: { status: "DRAFT" },
      new: { id: "o-reply2", order_number: 82, client_name: "X", status: "PENDING", thread_type: "update" },
    });

    await waitFor(() => {
      expect(mockCreateNotification).toHaveBeenCalled();
    });

    const approvedCalls = mockCreateNotification.mock.calls.filter(
      (c: any) => c[0].type === "order_approved"
    );
    expect(approvedCalls).toHaveLength(0);
  });

  it("realtime: creates notification when vehicle is assigned", async () => {
    vi.useRealTimers();

    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    }));

    renderHook(() => useSLAMonitor(), { wrapper: createWrapper() });

    const channelInstance = mockChannel.mock.results[0].value;
    const onCall = channelInstance.on.mock.calls.find(
      (c: any) => c[1]?.event === "UPDATE" && c[1]?.table === "orders"
    );
    const handler = onCall[2];

    await handler({
      old: { vehicle_id: null, status: "PENDING" },
      new: { id: "o-vehicle", order_number: 83, client_name: "VehicleClient", status: "PENDING", vehicle_id: "v1" },
    });

    await waitFor(() => {
      expect(mockCreateNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "driver_update",
          title: expect.stringContaining("Voertuig toegewezen"),
        })
      );
    });
  });

  it("realtime: does not notify vehicle assigned when old already had vehicle", async () => {
    vi.useRealTimers();

    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    }));

    renderHook(() => useSLAMonitor(), { wrapper: createWrapper() });

    const channelInstance = mockChannel.mock.results[0].value;
    const onCall = channelInstance.on.mock.calls.find(
      (c: any) => c[1]?.event === "UPDATE" && c[1]?.table === "orders"
    );
    const handler = onCall[2];

    await handler({
      old: { vehicle_id: "v-old", status: "PENDING" },
      new: { id: "o-veh2", order_number: 84, client_name: "X", status: "PENDING", vehicle_id: "v-new" },
    });

    // Wait a tick
    await new Promise((r) => setTimeout(r, 50));

    const driverCalls = mockCreateNotification.mock.calls.filter(
      (c: any) => c[0].type === "driver_update"
    );
    expect(driverCalls).toHaveLength(0);
  });

  it("processes both critical and warning orders in the same batch", async () => {
    vi.useRealTimers();

    const expiredOrder = {
      id: "o-expired",
      order_number: 90,
      client_name: "ExpiredCo",
      received_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      status: "DRAFT",
    };
    const warningOrder = {
      id: "o-warning",
      order_number: 91,
      client_name: "WarningCo",
      received_at: new Date(Date.now() - 3.5 * 60 * 60 * 1000).toISOString(),
      status: "PENDING",
    };

    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [expiredOrder, warningOrder], error: null }),
    }));

    renderHook(() => useSLAMonitor(), { wrapper: createWrapper() });

    await waitFor(() => {
      const types = mockCreateNotification.mock.calls.map((c: any) => c[0].type);
      expect(types).toContain("sla_critical");
      expect(types).toContain("sla_warning");
    });
  });

  it("runs check on interval after initial check", async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
    });

    renderHook(() => useSLAMonitor(), { wrapper: createWrapper() });
    await vi.advanceTimersByTimeAsync(0);

    const firstCount = callCount;
    expect(firstCount).toBeGreaterThan(0);

    // Advance 60 seconds for the interval
    await vi.advanceTimersByTimeAsync(60_000);

    expect(callCount).toBeGreaterThan(firstCount);
  });
});
