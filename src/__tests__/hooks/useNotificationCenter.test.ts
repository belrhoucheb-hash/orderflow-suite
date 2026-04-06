import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import type { ReactNode } from "react";
import React from "react";

// ─── Hoisted mocks ──────────────────────────────────────────────────

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
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    channel: mockChannel,
    removeChannel: vi.fn(),
  };
  return { mockFrom, mockChannel, mockSupabase };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));

// ─── Helpers ────────────────────────────────────────────────────────

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) =>
    React.createElement(
      QueryClientProvider,
      { client: qc },
      React.createElement(BrowserRouter, null, children)
    );
}

// ─── Import after mocks ─────────────────────────────────────────────

import { useNotificationCenter, generateNotificationFromEvent } from "@/hooks/useNotificationCenter";

// ─── Tests: generateNotificationFromEvent (pure function) ───────────

describe("generateNotificationFromEvent", () => {
  it("generates Dutch notification for new order (INSERT)", () => {
    const result = generateNotificationFromEvent("orders", "INSERT", {
      id: "order-abc",
      client_name: "Bakkerij De Jong",
      order_number: 42,
      created_at: "2026-04-01T00:00:00Z",
    });

    expect(result).not.toBeNull();
    expect(result!.type).toBe("order_new");
    expect(result!.title).toBe("Nieuwe order ontvangen");
    expect(result!.message).toContain("Bakkerij De Jong");
    expect(result!.entityType).toBe("order");
    expect(result!.entityId).toBe("order-abc");
    expect(result!.read).toBe(false);
    expect(result!.severity).toBe("info");
  });

  it("generates Dutch notification for order status change", () => {
    const result = generateNotificationFromEvent(
      "orders",
      "UPDATE",
      {
        id: "order-abc",
        order_number: 42,
        status: "PLANNED",
        created_at: "2026-04-01T00:00:00Z",
      },
      { status: "PENDING" }
    );

    expect(result).not.toBeNull();
    expect(result!.type).toBe("order_status_change");
    expect(result!.title).toBe("Order status gewijzigd");
    expect(result!.message).toContain("status gewijzigd naar PLANNED");
    expect(result!.entityType).toBe("order");
  });

  it("generates Dutch notification for AI auto-approved order", () => {
    const result = generateNotificationFromEvent(
      "orders",
      "UPDATE",
      {
        id: "order-xyz",
        order_number: 99,
        status: "APPROVED",
        ai_approved: true,
        created_at: "2026-04-01T00:00:00Z",
      },
      { status: "PENDING" }
    );

    expect(result).not.toBeNull();
    expect(result!.type).toBe("ai_auto_approved");
    expect(result!.title).toBe("AI automatische goedkeuring");
    expect(result!.message).toContain("automatisch goedgekeurd");
    expect(result!.severity).toBe("success");
  });

  it("generates Dutch notification for trip dispatched", () => {
    const result = generateNotificationFromEvent("trips", "INSERT", {
      id: "trip-12345678-abcd",
      driver_name: "Jan Pietersen",
      status: "DISPATCHED",
    });

    expect(result).not.toBeNull();
    expect(result!.type).toBe("trip_dispatched");
    expect(result!.title).toBe("Rit verzonden");
    expect(result!.message).toContain("Jan Pietersen");
    expect(result!.entityType).toBe("trip");
  });

  it("generates Dutch notification for anomaly detected", () => {
    const result = generateNotificationFromEvent("anomalies", "INSERT", {
      id: "anomaly-1",
      title: "Gewicht overschrijding",
      entity_id: "order-abc",
    });

    expect(result).not.toBeNull();
    expect(result!.type).toBe("anomaly_detected");
    expect(result!.title).toBe("Anomalie gedetecteerd");
    expect(result!.message).toContain("Waarschuwing: Gewicht overschrijding");
    expect(result!.severity).toBe("warning");
    expect(result!.entityType).toBe("anomaly");
  });

  it("returns null for unrecognized table", () => {
    const result = generateNotificationFromEvent("unknown_table", "INSERT", { id: "x" });
    expect(result).toBeNull();
  });

  it("returns null for order UPDATE without status change", () => {
    const result = generateNotificationFromEvent(
      "orders",
      "UPDATE",
      { id: "order-abc", status: "PENDING", order_number: 1, created_at: "2026-01-01" },
      { status: "PENDING" }
    );
    expect(result).toBeNull();
  });

  it("returns null for anomaly UPDATE (only INSERT generates)", () => {
    const result = generateNotificationFromEvent("anomalies", "UPDATE", {
      id: "anomaly-1",
      title: "Updated",
    });
    expect(result).toBeNull();
  });
});

// ─── Tests: useNotificationCenter hook ──────────────────────────────

describe("useNotificationCenter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
    }));
  });

  it("initializes with empty notifications and zero unread count", async () => {
    const { result } = renderHook(() => useNotificationCenter(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.notifications).toEqual([]);
    expect(result.current.unreadCount).toBe(0);
  });

  it("sets up realtime channels for orders, trips, anomalies, and notifications", async () => {
    const { result } = renderHook(() => useNotificationCenter(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // The hook uses useRealtimeSubscription for 4 tables + useNotifications has its own channel
    // At minimum we expect multiple channel subscriptions
    await waitFor(() => expect(mockChannel).toHaveBeenCalled());
    const channelCalls = mockChannel.mock.calls.map((c: any[]) => c[0] as string);

    // Should have channels containing "orders", "trips", "anomalies", "notifications"
    expect(channelCalls.some((name: string) => name.includes("orders"))).toBe(true);
    expect(channelCalls.some((name: string) => name.includes("trips"))).toBe(true);
    expect(channelCalls.some((name: string) => name.includes("anomalies"))).toBe(true);
    expect(channelCalls.some((name: string) => name.includes("notifications"))).toBe(true);
  });

  it("provides markAsRead function", async () => {
    const { result } = renderHook(() => useNotificationCenter(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(typeof result.current.markAsRead).toBe("function");
  });

  it("provides markAllAsRead function", async () => {
    const { result } = renderHook(() => useNotificationCenter(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(typeof result.current.markAllAsRead).toBe("function");
  });

  it("provides dismiss function", async () => {
    const { result } = renderHook(() => useNotificationCenter(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(typeof result.current.dismiss).toBe("function");
  });

  it("merges DB notifications into the list", async () => {
    const dbNotifications = [
      { id: "n1", type: "order", title: "DB Notification", message: "Test", is_read: false, created_at: "2026-04-01T10:00:00Z", icon: "bell", order_id: "o1", metadata: {} },
    ];

    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: dbNotifications, error: null }),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
    }));

    const { result } = renderHook(() => useNotificationCenter(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.notifications.length).toBeGreaterThan(0));
    expect(result.current.notifications[0].title).toBe("DB Notification");
    expect(result.current.unreadCount).toBeGreaterThanOrEqual(1);
  });

  it("cleans up channels on unmount", async () => {
    const { result, unmount } = renderHook(() => useNotificationCenter(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    unmount();
    expect(mockSupabase.removeChannel).toHaveBeenCalled();
  });
});
