import { renderHook, waitFor, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
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
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc },
      React.createElement(BrowserRouter, null, children)
    );
}

import { useGPSTracking, useTimeTracking, useGeofenceCheck, useDriveTime } from "@/hooks/useDriverTracking";
import { toast as mockToast } from "sonner";

describe("useGPSTracking", () => {
  const mockWatchPosition = vi.fn();
  const mockClearWatch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(global.navigator, "geolocation", {
      value: {
        watchPosition: mockWatchPosition,
        clearWatch: mockClearWatch,
      },
      writable: true,
      configurable: true,
    });
  });

  it("returns initial state", () => {
    const { result } = renderHook(() => useGPSTracking(null), { wrapper: createWrapper() });
    expect(result.current.isTracking).toBe(false);
    expect(result.current.currentPosition).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("does nothing when driverId is null", () => {
    const { result } = renderHook(() => useGPSTracking(null), { wrapper: createWrapper() });

    act(() => {
      result.current.startTracking();
    });

    expect(result.current.isTracking).toBe(false);
    expect(mockWatchPosition).not.toHaveBeenCalled();
  });

  it("starts tracking and updates position", () => {
    mockWatchPosition.mockReturnValue(42);

    const { result } = renderHook(() => useGPSTracking("d1"), { wrapper: createWrapper() });

    act(() => {
      result.current.startTracking();
    });

    expect(result.current.isTracking).toBe(true);
    expect(mockWatchPosition).toHaveBeenCalled();

    // Simulate position update
    const successCallback = mockWatchPosition.mock.calls[0][0];
    act(() => {
      successCallback({
        coords: { latitude: 52.37, longitude: 4.90, accuracy: 10, speed: 50, heading: 180 },
      });
    });

    expect(result.current.currentPosition).toBeTruthy();
    expect(result.current.currentPosition!.latitude).toBe(52.37);
  });

  it("handles geolocation error", () => {
    mockWatchPosition.mockReturnValue(42);

    const { result } = renderHook(() => useGPSTracking("d1"), { wrapper: createWrapper() });

    act(() => {
      result.current.startTracking();
    });

    const errorCallback = mockWatchPosition.mock.calls[0][1];
    act(() => {
      errorCallback({ message: "Permission denied" });
    });

    expect(result.current.error).toBe("Permission denied");
  });

  it("stops tracking and flushes buffer", async () => {
    mockWatchPosition.mockReturnValue(42);
    mockFrom.mockImplementation(() => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
    }));

    const { result } = renderHook(() => useGPSTracking("d1"), { wrapper: createWrapper() });

    act(() => {
      result.current.startTracking();
    });

    await act(async () => {
      await result.current.stopTracking();
    });

    expect(result.current.isTracking).toBe(false);
    expect(mockClearWatch).toHaveBeenCalledWith(42);
  });

  it("sets error when geolocation not supported", () => {
    Object.defineProperty(global.navigator, "geolocation", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useGPSTracking("d1"), { wrapper: createWrapper() });

    act(() => {
      result.current.startTracking();
    });

    expect(result.current.error).toContain("niet ondersteund");
  });

  it("buffers positions and flushes to supabase on stop", async () => {
    mockWatchPosition.mockReturnValue(42);
    const mockInsert = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockImplementation(() => ({
      insert: mockInsert,
    }));

    const { result } = renderHook(() => useGPSTracking("d1"), { wrapper: createWrapper() });

    act(() => {
      result.current.startTracking();
    });

    // Simulate multiple position updates
    const successCallback = mockWatchPosition.mock.calls[0][0];
    act(() => {
      successCallback({ coords: { latitude: 52.37, longitude: 4.90, accuracy: 10, speed: 50, heading: 180 } });
      successCallback({ coords: { latitude: 52.38, longitude: 4.91, accuracy: 8, speed: 60, heading: 190 } });
    });

    await act(async () => {
      await result.current.stopTracking();
    });

    expect(mockFrom).toHaveBeenCalledWith("driver_positions");
    expect(mockInsert).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ driver_id: "d1", latitude: 52.37 }),
      expect.objectContaining({ driver_id: "d1", latitude: 52.38 }),
    ]));
  });

  it("handles insert error during flush", async () => {
    mockWatchPosition.mockReturnValue(42);
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFrom.mockImplementation(() => ({
      insert: vi.fn().mockResolvedValue({ error: { message: "insert failed" } }),
    }));

    const { result } = renderHook(() => useGPSTracking("d1"), { wrapper: createWrapper() });

    act(() => {
      result.current.startTracking();
    });

    const successCallback = mockWatchPosition.mock.calls[0][0];
    act(() => {
      successCallback({ coords: { latitude: 52.37, longitude: 4.90, accuracy: 10, speed: null, heading: null } });
    });

    await act(async () => {
      await result.current.stopTracking();
    });

    expect(consoleSpy).toHaveBeenCalledWith("[GPS] Failed to insert positions:", expect.any(Object));
    consoleSpy.mockRestore();
  });

  it("does not flush when buffer is empty", async () => {
    mockWatchPosition.mockReturnValue(42);
    mockFrom.mockImplementation(() => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
    }));

    const { result } = renderHook(() => useGPSTracking("d1"), { wrapper: createWrapper() });

    act(() => {
      result.current.startTracking();
    });

    // Stop without any position updates
    await act(async () => {
      await result.current.stopTracking();
    });

    // mockFrom should not be called with driver_positions since buffer is empty
    const driverPositionsCalls = mockFrom.mock.calls.filter((c) => c[0] === "driver_positions");
    expect(driverPositionsCalls).toHaveLength(0);
  });

  it("cleans up on unmount", () => {
    mockWatchPosition.mockReturnValue(99);

    const { result, unmount } = renderHook(() => useGPSTracking("d1"), { wrapper: createWrapper() });

    act(() => {
      result.current.startTracking();
    });

    unmount();

    expect(mockClearWatch).toHaveBeenCalledWith(99);
  });
});

describe("useTimeTracking", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns initial state when driverId is null", () => {
    const { result } = renderHook(() => useTimeTracking(null), { wrapper: createWrapper() });
    expect(result.current.isClocked).toBe(false);
    expect(result.current.isOnBreak).toBe(false);
    expect(result.current.todayEntries).toEqual([]);
  });

  it("fetches today entries and computes isClocked", async () => {
    const entries = [
      { id: "e1", driver_id: "d1", entry_type: "clock_in", recorded_at: new Date().toISOString() },
    ];
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: entries, error: null }),
    }));

    const { result } = renderHook(() => useTimeTracking("d1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isClocked).toBe(true));
    expect(result.current.isOnBreak).toBe(false);
    expect(result.current.todayEntries).toHaveLength(1);
  });

  it("detects break state", async () => {
    const entries = [
      { id: "e1", driver_id: "d1", entry_type: "clock_in", recorded_at: new Date(Date.now() - 3600000).toISOString() },
      { id: "e2", driver_id: "d1", entry_type: "break_start", recorded_at: new Date().toISOString() },
    ];
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: entries, error: null }),
    }));

    const { result } = renderHook(() => useTimeTracking("d1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isOnBreak).toBe(true));
  });

  it("detects clocked out state", async () => {
    const entries = [
      { id: "e1", driver_id: "d1", entry_type: "clock_in", recorded_at: new Date(Date.now() - 3600000).toISOString() },
      { id: "e2", driver_id: "d1", entry_type: "clock_out", recorded_at: new Date().toISOString() },
    ];
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: entries, error: null }),
    }));

    const { result } = renderHook(() => useTimeTracking("d1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isClocked).toBe(false));
  });

  it("clockIn inserts a time entry", async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    }));

    const { result } = renderHook(() => useTimeTracking("d1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.clockIn();
    });

    expect(mockFrom).toHaveBeenCalledWith("driver_time_entries");
  });

  it("clockOut inserts clock_out entry", async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    }));

    const { result } = renderHook(() => useTimeTracking("d1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.clockOut();
    });

    expect(mockFrom).toHaveBeenCalledWith("driver_time_entries");
  });

  it("startBreak inserts break_start entry", async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    }));

    const { result } = renderHook(() => useTimeTracking("d1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.startBreak();
    });

    expect(mockFrom).toHaveBeenCalledWith("driver_time_entries");
  });

  it("endBreak inserts break_end entry", async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    }));

    const { result } = renderHook(() => useTimeTracking("d1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.endBreak();
    });

    expect(mockFrom).toHaveBeenCalledWith("driver_time_entries");
  });

  it("insert throws on error", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      insert: vi.fn().mockResolvedValue({ error: { message: "insert fail" } }),
    }));

    const { result } = renderHook(() => useTimeTracking("d1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(
      act(async () => {
        await result.current.clockIn();
      })
    ).rejects.toThrow();

    consoleSpy.mockRestore();
  });

  it("does nothing when driverId is null for inserts", async () => {
    const { result } = renderHook(() => useTimeTracking(null), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.clockIn();
    });

    // Should not have called from() for insert
    const insertCalls = mockFrom.mock.calls.filter(
      (c) => c[0] === "driver_time_entries"
    );
    expect(insertCalls).toHaveLength(0);
  });

  it("calculates total hours correctly", async () => {
    const now = Date.now();
    const entries = [
      { id: "e1", driver_id: "d1", entry_type: "clock_in", recorded_at: new Date(now - 2 * 3600000).toISOString() },
      { id: "e2", driver_id: "d1", entry_type: "clock_out", recorded_at: new Date(now - 1 * 3600000).toISOString() },
    ];
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: entries, error: null }),
    }));

    const { result } = renderHook(() => useTimeTracking("d1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.totalHoursToday).toBeCloseTo(1, 0));
  });

  it("calculates hours with break deducted", async () => {
    const now = Date.now();
    const entries = [
      { id: "e1", driver_id: "d1", entry_type: "clock_in", recorded_at: new Date(now - 3 * 3600000).toISOString() },
      { id: "e2", driver_id: "d1", entry_type: "break_start", recorded_at: new Date(now - 2 * 3600000).toISOString() },
      { id: "e3", driver_id: "d1", entry_type: "break_end", recorded_at: new Date(now - 1 * 3600000).toISOString() },
      { id: "e4", driver_id: "d1", entry_type: "clock_out", recorded_at: new Date(now).toISOString() },
    ];
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: entries, error: null }),
    }));

    const { result } = renderHook(() => useTimeTracking("d1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.totalHoursToday).toBeCloseTo(2, 0)); // 3h - 1h break = 2h
  });

  it("counts up to now when still clocked in", async () => {
    const now = Date.now();
    const entries = [
      { id: "e1", driver_id: "d1", entry_type: "clock_in", recorded_at: new Date(now - 2 * 3600000).toISOString() },
    ];
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: entries, error: null }),
    }));

    const { result } = renderHook(() => useTimeTracking("d1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.totalHoursToday).toBeGreaterThan(1.9));
    expect(result.current.totalHoursToday).toBeLessThan(2.2);
  });

  it("handles currently on break (still clocked in)", async () => {
    const now = Date.now();
    const entries = [
      { id: "e1", driver_id: "d1", entry_type: "clock_in", recorded_at: new Date(now - 3 * 3600000).toISOString() },
      { id: "e2", driver_id: "d1", entry_type: "break_start", recorded_at: new Date(now - 1 * 3600000).toISOString() },
    ];
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: entries, error: null }),
    }));

    const { result } = renderHook(() => useTimeTracking("d1"), { wrapper: createWrapper() });
    await waitFor(() => {
      // 3h total - 1h on break = ~2h of work
      expect(result.current.totalHoursToday).toBeCloseTo(2, 0);
    });
  });
});

describe("useGeofenceCheck", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does nothing when position is null", () => {
    const onConfirm = vi.fn();
    renderHook(
      () => useGeofenceCheck(null, [], onConfirm),
      { wrapper: createWrapper() }
    );

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("does not trigger for stops without coordinates", () => {
    const toast = mockToast;
    const stops = [{ id: "s1", stop_status: "GEPLAND", planned_latitude: null, planned_longitude: null, stop_sequence: 1 }];
    const pos = { latitude: 52.37, longitude: 4.90, accuracy: 10, speed: null, heading: null, recorded_at: "" };

    renderHook(
      () => useGeofenceCheck(pos, stops as any, vi.fn()),
      { wrapper: createWrapper() }
    );

    expect(toast).not.toHaveBeenCalled();
  });

  it("does not trigger for stops with non-eligible status", () => {
    const toast = mockToast;
    const stops = [{
      id: "s1",
      stop_status: "AFGELEVERD",
      planned_latitude: 52.370,
      planned_longitude: 4.900,
      planned_address: "Test",
      stop_sequence: 1,
    }];
    const pos = { latitude: 52.370, longitude: 4.900, accuracy: 5, speed: null, heading: null, recorded_at: "" };

    renderHook(
      () => useGeofenceCheck(pos, stops as any, vi.fn()),
      { wrapper: createWrapper() }
    );

    expect(toast).not.toHaveBeenCalled();
  });

  it("triggers toast when within geofence radius", async () => {
    const toast = mockToast;
    const stops = [{
      id: "s1",
      stop_status: "GEPLAND",
      planned_latitude: 52.370,
      planned_longitude: 4.900,
      planned_address: "Amsterdam Central",
      stop_sequence: 1,
    }];
    const pos = { latitude: 52.370, longitude: 4.900, accuracy: 5, speed: null, heading: null, recorded_at: "" };
    const onConfirm = vi.fn();

    renderHook(
      () => useGeofenceCheck(pos, stops as any, onConfirm),
      { wrapper: createWrapper() }
    );

    expect(toast).toHaveBeenCalledWith(
      expect.stringContaining("Amsterdam Central"),
      expect.objectContaining({ action: expect.any(Object) })
    );
  });

  it("uses stop_sequence fallback when no address", () => {
    const toast = mockToast;
    const stops = [{
      id: "s1",
      stop_status: "ONDERWEG",
      planned_latitude: 52.370,
      planned_longitude: 4.900,
      planned_address: null,
      stop_sequence: 3,
    }];
    const pos = { latitude: 52.370, longitude: 4.900, accuracy: 5, speed: null, heading: null, recorded_at: "" };

    renderHook(
      () => useGeofenceCheck(pos, stops as any, vi.fn()),
      { wrapper: createWrapper() }
    );

    expect(toast).toHaveBeenCalledWith(
      expect.stringContaining("Stop #3"),
      expect.any(Object)
    );
  });

  it("does not trigger when outside geofence radius", () => {
    const toast = mockToast;
    const stops = [{
      id: "s1",
      stop_status: "GEPLAND",
      planned_latitude: 52.370,
      planned_longitude: 4.900,
      planned_address: "Far away",
      stop_sequence: 1,
    }];
    // Position far from stop (Rotterdam vs Amsterdam)
    const pos = { latitude: 51.924, longitude: 4.477, accuracy: 5, speed: null, heading: null, recorded_at: "" };

    renderHook(
      () => useGeofenceCheck(pos, stops as any, vi.fn()),
      { wrapper: createWrapper() }
    );

    expect(toast).not.toHaveBeenCalled();
  });

  it("respects cooldown period", async () => {
    const toast = mockToast;
    (toast as any).mockClear();

    const stops = [{
      id: "s1", stop_status: "GEPLAND",
      planned_latitude: 52.370, planned_longitude: 4.900,
      planned_address: "Test", stop_sequence: 1,
    }];
    const pos = { latitude: 52.370, longitude: 4.900, accuracy: 5, speed: null, heading: null, recorded_at: "" };

    const { rerender } = renderHook(
      ({ position }) => useGeofenceCheck(position, stops as any, vi.fn()),
      { wrapper: createWrapper(), initialProps: { position: pos } }
    );

    const callCount = (toast as any).mock.calls.length;

    // Re-render with same position should not re-trigger due to cooldown
    rerender({ position: { ...pos, recorded_at: "2" } });

    expect((toast as any).mock.calls.length).toBe(callCount);
  });

  it("triggers for ONDERWEG stops", () => {
    const toast = mockToast;
    const stops = [{
      id: "s1",
      stop_status: "ONDERWEG",
      planned_latitude: 52.370,
      planned_longitude: 4.900,
      planned_address: "Onderweg Addr",
      stop_sequence: 1,
    }];
    const pos = { latitude: 52.370, longitude: 4.900, accuracy: 5, speed: null, heading: null, recorded_at: "" };

    renderHook(
      () => useGeofenceCheck(pos, stops as any, vi.fn()),
      { wrapper: createWrapper() }
    );

    expect(toast).toHaveBeenCalledWith(
      expect.stringContaining("Onderweg Addr"),
      expect.any(Object)
    );
  });

  it("checks multiple stops and triggers for each within radius", () => {
    const toast = mockToast;
    const stops = [
      {
        id: "s1", stop_status: "GEPLAND",
        planned_latitude: 52.370, planned_longitude: 4.900,
        planned_address: "Stop A", stop_sequence: 1,
      },
      {
        id: "s2", stop_status: "GEPLAND",
        planned_latitude: 52.370, planned_longitude: 4.900,
        planned_address: "Stop B", stop_sequence: 2,
      },
    ];
    const pos = { latitude: 52.370, longitude: 4.900, accuracy: 5, speed: null, heading: null, recorded_at: "" };

    renderHook(
      () => useGeofenceCheck(pos, stops as any, vi.fn()),
      { wrapper: createWrapper() }
    );

    // Both stops should trigger
    expect((toast as any).mock.calls.length).toBe(2);
  });
});

describe("useDriveTime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => vi.useRealTimers());

  it("returns green status for short drive time", () => {
    const entries = [
      { id: "e1", driver_id: "d1", entry_type: "clock_in" as const, recorded_at: new Date(Date.now() - 1 * 3600000).toISOString() },
    ];

    const { result } = renderHook(
      () => useDriveTime(true, false, entries),
      { wrapper: createWrapper() }
    );

    expect(result.current.statusColor).toBe("green");
    expect(result.current.mandatoryBreak).toBe(false);
    expect(result.current.dailyLimitReached).toBe(false);
    expect(result.current.continuousDriveH).toBeGreaterThan(0);
  });

  it("returns orange status near 4h", () => {
    const entries = [
      { id: "e1", driver_id: "d1", entry_type: "clock_in" as const, recorded_at: new Date(Date.now() - 4.1 * 3600000).toISOString() },
    ];

    const { result } = renderHook(
      () => useDriveTime(true, false, entries),
      { wrapper: createWrapper() }
    );

    expect(result.current.statusColor).toBe("orange");
    expect(result.current.warning).toContain("pauze");
  });

  it("returns orange for 3.5h+ drive time (before warning threshold)", () => {
    const entries = [
      { id: "e1", driver_id: "d1", entry_type: "clock_in" as const, recorded_at: new Date(Date.now() - 3.6 * 3600000).toISOString() },
    ];

    const { result } = renderHook(
      () => useDriveTime(true, false, entries),
      { wrapper: createWrapper() }
    );

    expect(result.current.statusColor).toBe("orange");
  });

  it("returns red status and mandatory break at 4.5h+", () => {
    const entries = [
      { id: "e1", driver_id: "d1", entry_type: "clock_in" as const, recorded_at: new Date(Date.now() - 5 * 3600000).toISOString() },
    ];

    const { result } = renderHook(
      () => useDriveTime(true, false, entries),
      { wrapper: createWrapper() }
    );

    expect(result.current.statusColor).toBe("red");
    expect(result.current.mandatoryBreak).toBe(true);
  });

  it("returns red status at daily limit (9h+)", () => {
    const now = Date.now();
    const entries = [
      { id: "e1", driver_id: "d1", entry_type: "clock_in" as const, recorded_at: new Date(now - 10 * 3600000).toISOString() },
    ];

    const { result } = renderHook(
      () => useDriveTime(true, false, entries),
      { wrapper: createWrapper() }
    );

    expect(result.current.dailyLimitReached).toBe(true);
    expect(result.current.statusColor).toBe("red");
    expect(result.current.warning).toContain("DAGELIJKSE RIJTIJDLIMIET");
  });

  it("resets continuous time after a long break (>=45min)", () => {
    const now = Date.now();
    const entries = [
      { id: "e1", driver_id: "d1", entry_type: "clock_in" as const, recorded_at: new Date(now - 6 * 3600000).toISOString() },
      { id: "e2", driver_id: "d1", entry_type: "break_start" as const, recorded_at: new Date(now - 5 * 3600000).toISOString() },
      { id: "e3", driver_id: "d1", entry_type: "break_end" as const, recorded_at: new Date(now - 4 * 3600000).toISOString() },
    ];

    const { result } = renderHook(
      () => useDriveTime(true, false, entries),
      { wrapper: createWrapper() }
    );

    expect(result.current.continuousDriveH).toBeCloseTo(4, 0);
    expect(result.current.dailyDriveH).toBeCloseTo(5, 0);
  });

  it("does not reset continuous time for short break (<45min)", () => {
    const now = Date.now();
    const entries = [
      { id: "e1", driver_id: "d1", entry_type: "clock_in" as const, recorded_at: new Date(now - 3 * 3600000).toISOString() },
      { id: "e2", driver_id: "d1", entry_type: "break_start" as const, recorded_at: new Date(now - 2 * 3600000).toISOString() },
      { id: "e3", driver_id: "d1", entry_type: "break_end" as const, recorded_at: new Date(now - 1.5 * 3600000).toISOString() }, // 30min break
    ];

    const { result } = renderHook(
      () => useDriveTime(true, false, entries),
      { wrapper: createWrapper() }
    );

    // Continuous should still count the pre-break time (minus break)
    // Total clocked: 3h, break: 30m, so ~2.5h work. Continuous: about 2.5h (short break doesn't reset)
    expect(result.current.continuousDriveH).toBeGreaterThan(2);
    expect(result.current.dailyDriveH).toBeCloseTo(2.5, 0);
  });

  it("does not tick when not driving", () => {
    const entries: any[] = [];

    const { result } = renderHook(
      () => useDriveTime(false, false, entries),
      { wrapper: createWrapper() }
    );

    expect(result.current.continuousDriveH).toBe(0);
    expect(result.current.dailyDriveH).toBe(0);
  });

  it("does not tick when on break", () => {
    const entries = [
      { id: "e1", driver_id: "d1", entry_type: "clock_in" as const, recorded_at: new Date(Date.now() - 1 * 3600000).toISOString() },
      { id: "e2", driver_id: "d1", entry_type: "break_start" as const, recorded_at: new Date().toISOString() },
    ];

    const { result } = renderHook(
      () => useDriveTime(true, true, entries),
      { wrapper: createWrapper() }
    );

    // Should still compute from entries but no live ticking
    expect(result.current.continuousDriveH).toBeGreaterThanOrEqual(0);
  });

  it("warning message shows minutes remaining before mandatory break", () => {
    // 4h15m of driving = 15 minutes before mandatory break
    const entries = [
      { id: "e1", driver_id: "d1", entry_type: "clock_in" as const, recorded_at: new Date(Date.now() - 4.25 * 3600000).toISOString() },
    ];

    const { result } = renderHook(
      () => useDriveTime(true, false, entries),
      { wrapper: createWrapper() }
    );

    expect(result.current.statusColor).toBe("orange");
    expect(result.current.warning).toMatch(/\d+ minuten/);
  });

  it("handles complete clock-in/clock-out cycle for daily calculation", () => {
    const now = Date.now();
    const entries = [
      { id: "e1", driver_id: "d1", entry_type: "clock_in" as const, recorded_at: new Date(now - 8 * 3600000).toISOString() },
      { id: "e2", driver_id: "d1", entry_type: "clock_out" as const, recorded_at: new Date(now - 5 * 3600000).toISOString() },
      { id: "e3", driver_id: "d1", entry_type: "clock_in" as const, recorded_at: new Date(now - 4 * 3600000).toISOString() },
      { id: "e4", driver_id: "d1", entry_type: "clock_out" as const, recorded_at: new Date(now - 2 * 3600000).toISOString() },
    ];

    const { result } = renderHook(
      () => useDriveTime(false, false, entries),
      { wrapper: createWrapper() }
    );

    // First shift: 3h, second shift: 2h, total: 5h
    expect(result.current.dailyDriveH).toBeCloseTo(5, 0);
    // Since clocked out, continuous should be from last completed block
  });

  it("handles drive_start/drive_end entries (no-ops)", () => {
    const now = Date.now();
    const entries = [
      { id: "e1", driver_id: "d1", entry_type: "clock_in" as const, recorded_at: new Date(now - 2 * 3600000).toISOString() },
      { id: "e2", driver_id: "d1", entry_type: "drive_start" as const, recorded_at: new Date(now - 1.5 * 3600000).toISOString() },
      { id: "e3", driver_id: "d1", entry_type: "drive_end" as const, recorded_at: new Date(now - 1 * 3600000).toISOString() },
      { id: "e4", driver_id: "d1", entry_type: "clock_out" as const, recorded_at: new Date(now).toISOString() },
    ];

    const { result } = renderHook(
      () => useDriveTime(false, false, entries),
      { wrapper: createWrapper() }
    );

    // drive_start/drive_end are no-ops, total should be 2h
    expect(result.current.dailyDriveH).toBeCloseTo(2, 0);
  });
});
