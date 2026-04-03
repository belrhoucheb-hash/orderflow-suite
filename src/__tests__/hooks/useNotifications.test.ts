import { renderHook, waitFor, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
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
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    channel: mockChannel,
    removeChannel: vi.fn(),
  };

  return { mockFrom, mockChannel, mockSupabase };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc },
      React.createElement(BrowserRouter, null, children)
    );
}

import { useNotifications, createNotification } from "@/hooks/useNotifications";

describe("useNotifications", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches notifications after resolving user id", async () => {
    const notifications = [
      { id: "n1", type: "order", title: "New Order", is_read: false },
      { id: "n2", type: "sla", title: "SLA Warning", is_read: true },
    ];

    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: notifications, error: null }),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
    }));

    const { result } = renderHook(() => useNotifications(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.notifications).toHaveLength(2));
    expect(result.current.unreadCount).toBe(1);
    expect(result.current.isLoading).toBe(false);
  });

  it("returns empty when no user", async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });

    const { result } = renderHook(() => useNotifications(), { wrapper: createWrapper() });

    // Should stay empty since no user id
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.notifications).toEqual([]);
  });

  it("markAsRead updates a notification", async () => {
    const notifications = [
      { id: "n1", type: "order", title: "Test", is_read: false },
    ];
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: notifications, error: null }),
      update: vi.fn().mockReturnThis(),
    }));

    const { result } = renderHook(() => useNotifications(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.notifications).toHaveLength(1));

    await act(async () => {
      await result.current.markAsRead("n1");
    });

    expect(mockFrom).toHaveBeenCalledWith("notifications");
  });

  it("markAllAsRead updates all unread", async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      update: vi.fn().mockReturnThis(),
    }));

    const { result } = renderHook(() => useNotifications(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.markAllAsRead();
    });

    expect(mockFrom).toHaveBeenCalledWith("notifications");
  });

  it("deleteNotification removes a notification", async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      delete: vi.fn().mockReturnThis(),
    }));

    const { result } = renderHook(() => useNotifications(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.deleteNotification("n1");
    });

    expect(mockFrom).toHaveBeenCalledWith("notifications");
  });

  it("clearAll removes read notifications", async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      delete: vi.fn().mockReturnThis(),
    }));

    const { result } = renderHook(() => useNotifications(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.clearAll();
    });

    expect(mockFrom).toHaveBeenCalledWith("notifications");
  });

  it("sets up realtime subscription", async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    }));

    const { result, unmount } = renderHook(() => useNotifications(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Wait for userId to be set and channel to be created
    await waitFor(() => expect(mockChannel).toHaveBeenCalled());
    unmount();
    expect(mockSupabase.removeChannel).toHaveBeenCalled();
  });
});

describe("createNotification", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a notification with resolved tenant_id", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1", app_metadata: { tenant_id: "t1" } } },
      error: null,
    });
    mockFrom.mockImplementation(() => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { tenant_id: "t1" }, error: null }),
    }));

    await createNotification({
      type: "test",
      title: "Test",
      message: "Test notification",
    });

    expect(mockFrom).toHaveBeenCalledWith("notifications");
  });

  it("resolves tenant_id from tenant_members if not in app_metadata", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1", app_metadata: {} } },
      error: null,
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "tenant_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { tenant_id: "t-from-members" }, error: null }),
        };
      }
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    });

    await createNotification({
      type: "test",
      title: "Test",
      message: "Test",
    });

    expect(mockFrom).toHaveBeenCalledWith("tenant_members");
    expect(mockFrom).toHaveBeenCalledWith("notifications");
  });

  it("skips when no tenant_id available", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1", app_metadata: {} } },
      error: null,
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "tenant_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    });

    await createNotification({ type: "test", title: "Test", message: "Test" });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("no tenant_id"));
    consoleSpy.mockRestore();
  });

  it("handles errors gracefully without crashing", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockSupabase.auth.getUser.mockRejectedValue(new Error("Network error"));

    await createNotification({ type: "test", title: "Test", message: "Test" });

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
