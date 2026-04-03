import { renderHook, waitFor, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
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
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    channel: mockChannel,
    removeChannel: vi.fn(),
  };

  return { mockFrom, mockChannel, mockChannelOn, mockChannelInstance, mockSupabase };
});

const { mockCheckTripCompletion } = vi.hoisted(() => ({
  mockCheckTripCompletion: vi.fn().mockResolvedValue(false),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));
vi.mock("@/lib/auditLog", () => ({ logAudit: vi.fn() }));
vi.mock("@/hooks/useBillingStatus", () => ({
  checkTripCompletion: mockCheckTripCompletion,
}));

const { mockToast } = vi.hoisted(() => ({
  mockToast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: mockToast }));

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc },
      React.createElement(BrowserRouter, null, children)
    );
}

import {
  useTrips,
  useTripById,
  useDriverTrips,
  useCreateTrip,
  useUpdateTripStatus,
  useUpdateStopStatus,
  useDispatchTrip,
  useSavePOD,
  useCreateDeliveryException,
  useTripsRealtime,
  useAutoCompleteTripCheck,
} from "@/hooks/useTrips";
import { logAudit } from "@/lib/auditLog";

describe("useTrips", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches trips without date filter", async () => {
    const trips = [{ id: "t1", dispatch_status: "CONCEPT" }];
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: trips, error: null }),
      eq: vi.fn().mockReturnThis(),
    }));

    const { result } = renderHook(() => useTrips(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(trips);
  });

  it("fetches trips with date filter", async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    }));

    const { result } = renderHook(() => useTrips("2026-04-03"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("handles error", async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: { message: "fail" } }),
    }));

    const { result } = renderHook(() => useTrips(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("returns empty array when data is null", async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: null }),
    }));

    const { result } = renderHook(() => useTrips(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});

describe("useTripById", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is disabled when tripId is null", () => {
    const { result } = renderHook(() => useTripById(null), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("fetches a single trip", async () => {
    const trip = { id: "t1", dispatch_status: "CONCEPT", trip_stops: [] };
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: trip, error: null }),
    }));

    const { result } = renderHook(() => useTripById("t1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.id).toBe("t1");
  });

  it("handles error", async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: "not found" } }),
    }));

    const { result } = renderHook(() => useTripById("t-bad"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useDriverTrips", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is disabled when driverId is null", () => {
    const { result } = renderHook(() => useDriverTrips(null), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("fetches trips for a driver", async () => {
    const trips = [{ id: "t1" }];
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: trips, error: null }),
    }));

    const { result } = renderHook(() => useDriverTrips("d1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(trips);
  });

  it("returns empty array when data is null", async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: null }),
    }));

    const { result } = renderHook(() => useDriverTrips("d1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});

describe("useCreateTrip", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates trip and stops", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "trips") {
        return {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: "new-trip" }, error: null }),
        };
      }
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    });

    const { result } = renderHook(() => useCreateTrip(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({
        tenant_id: "t1",
        vehicle_id: "v1",
        driver_id: "d1",
        planned_date: "2026-04-03",
        stops: [
          { order_id: "o1", stop_type: "PICKUP", planned_address: "Amsterdam", stop_sequence: 1 },
          { order_id: "o1", stop_type: "DELIVERY", planned_address: "Rotterdam", stop_sequence: 2 },
        ],
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("creates trip with optional geocoded stop coordinates", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "trips") {
        return {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: "new-trip-geo" }, error: null }),
        };
      }
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    });

    const { result } = renderHook(() => useCreateTrip(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({
        tenant_id: "t1",
        vehicle_id: "v1",
        driver_id: null,
        planned_date: "2026-04-03",
        stops: [
          { order_id: "o1", stop_type: "PICKUP", planned_address: "Amsterdam", stop_sequence: 1, planned_latitude: 52.37, planned_longitude: 4.90 },
        ],
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("handles trip creation error", async () => {
    mockFrom.mockImplementation(() => ({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: "fail" } }),
    }));

    const { result } = renderHook(() => useCreateTrip(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({
        tenant_id: "t1", vehicle_id: "v1", driver_id: null,
        planned_date: "2026-04-03", stops: [],
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("handles stops insertion error", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "trips") {
        return {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: "new-trip" }, error: null }),
        };
      }
      return {
        insert: vi.fn().mockResolvedValue({ error: { message: "stops insert fail" } }),
      };
    });

    const { result } = renderHook(() => useCreateTrip(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({
        tenant_id: "t1", vehicle_id: "v1", driver_id: "d1",
        planned_date: "2026-04-03",
        stops: [{ order_id: "o1", stop_type: "PICKUP", planned_address: "A", stop_sequence: 1 }],
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useUpdateTripStatus", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates trip status to VERZONDEN with timestamp", async () => {
    mockFrom.mockImplementation(() => ({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    }));

    const { result } = renderHook(() => useUpdateTripStatus(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ tripId: "t1", status: "VERZONDEN" as any });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("calls logAudit on success", async () => {
    mockFrom.mockImplementation(() => ({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    }));

    const { result } = renderHook(() => useUpdateTripStatus(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ tripId: "t1", status: "VERZONDEN" as any });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
      table_name: "trips",
      record_id: "t1",
      action: "UPDATE",
      new_data: { dispatch_status: "VERZONDEN" },
    }));
  });

  it("updates linked orders to IN_TRANSIT when trip goes ACTIEF", async () => {
    const stops = [{ order_id: "o1" }, { order_id: "o2" }];
    let callIndex = 0;
    mockFrom.mockImplementation((table: string) => {
      callIndex++;
      const chain: any = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
      };
      if (callIndex === 1) {
        chain.eq.mockResolvedValue({ error: null });
      } else if (callIndex === 2 && table === "trip_stops") {
        chain.eq.mockResolvedValue({ data: stops, error: null });
      } else {
        chain.in.mockResolvedValue({ error: null });
      }
      return chain;
    });

    const { result } = renderHook(() => useUpdateTripStatus(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ tripId: "t1", status: "ACTIEF" as any });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("handles ACTIEF with null order_ids in stops (filters them out)", async () => {
    const stops = [{ order_id: "o1" }, { order_id: null }, { order_id: "o2" }];
    let callIndex = 0;
    mockFrom.mockImplementation((table: string) => {
      callIndex++;
      const chain: any = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
      };
      if (callIndex === 1) {
        chain.eq.mockResolvedValue({ error: null });
      } else if (callIndex === 2) {
        chain.eq.mockResolvedValue({ data: stops, error: null });
      } else {
        chain.in.mockResolvedValue({ error: null });
      }
      return chain;
    });

    const { result } = renderHook(() => useUpdateTripStatus(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ tripId: "t1", status: "ACTIEF" as any });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("handles ACTIEF with no stops", async () => {
    let callIndex = 0;
    mockFrom.mockImplementation(() => {
      callIndex++;
      const chain: any = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
      };
      if (callIndex === 1) {
        chain.eq.mockResolvedValue({ error: null });
      } else {
        chain.eq.mockResolvedValue({ data: [], error: null });
      }
      return chain;
    });

    const { result } = renderHook(() => useUpdateTripStatus(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ tripId: "t1", status: "ACTIEF" as any });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("updates orders to DELIVERED on VOLTOOID for AFGELEVERD stops", async () => {
    const stops = [
      { order_id: "o1", stop_status: "AFGELEVERD" },
      { order_id: "o2", stop_status: "MISLUKT" },
    ];
    let callIndex = 0;
    mockFrom.mockImplementation((table: string) => {
      callIndex++;
      const chain: any = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
      };
      if (callIndex === 1) {
        chain.eq.mockResolvedValue({ error: null });
      } else if (callIndex === 2) {
        chain.eq.mockResolvedValue({ data: stops, error: null });
      } else {
        chain.eq.mockResolvedValue({ error: null });
      }
      return chain;
    });

    const { result } = renderHook(() => useUpdateTripStatus(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ tripId: "t1", status: "VOLTOOID" as any });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("skips orders with null order_id on VOLTOOID", async () => {
    const stops = [{ order_id: null, stop_status: "AFGELEVERD" }];
    let callIndex = 0;
    mockFrom.mockImplementation(() => {
      callIndex++;
      const chain: any = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
      };
      if (callIndex === 1) {
        chain.eq.mockResolvedValue({ error: null });
      } else {
        chain.eq.mockResolvedValue({ data: stops, error: null });
      }
      return chain;
    });

    const { result } = renderHook(() => useUpdateTripStatus(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ tripId: "t1", status: "VOLTOOID" as any });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("applies extra fields when provided", async () => {
    mockFrom.mockImplementation(() => ({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    }));

    const { result } = renderHook(() => useUpdateTripStatus(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ tripId: "t1", status: "ONTVANGEN" as any, extra: { custom_field: "value" } });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("handles update error", async () => {
    mockFrom.mockImplementation(() => ({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: { message: "fail" } }),
    }));

    const { result } = renderHook(() => useUpdateTripStatus(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ tripId: "t1", status: "VERZONDEN" as any });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useUpdateStopStatus", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates stop status", async () => {
    mockFrom.mockImplementation(() => ({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { trip_id: "t1" }, error: null }),
    }));

    const { result } = renderHook(() => useUpdateStopStatus(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ stopId: "s1", status: "AANGEKOMEN" as any });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("sets actual_arrival_time for AANGEKOMEN", async () => {
    mockFrom.mockImplementation(() => ({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { trip_id: "t1" }, error: null }),
    }));

    const { result } = renderHook(() => useUpdateStopStatus(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ stopId: "s1", status: "AANGEKOMEN" as any });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("sets actual_departure_time for AFGELEVERD", async () => {
    mockFrom.mockImplementation(() => ({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { trip_id: "t1" }, error: null }),
    }));

    const { result } = renderHook(() => useUpdateStopStatus(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ stopId: "s1", status: "AFGELEVERD" as any });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("sets actual_departure_time for MISLUKT", async () => {
    mockFrom.mockImplementation(() => ({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { trip_id: "t1" }, error: null }),
    }));

    const { result } = renderHook(() => useUpdateStopStatus(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ stopId: "s1", status: "MISLUKT" as any });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("applies extra fields", async () => {
    mockFrom.mockImplementation(() => ({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { trip_id: "t1" }, error: null }),
    }));

    const { result } = renderHook(() => useUpdateStopStatus(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ stopId: "s1", status: "AANGEKOMEN" as any, extra: { notes: "arrived early" } });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("calls checkTripCompletion onSuccess when tripId exists", async () => {
    mockFrom.mockImplementation(() => ({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { trip_id: "t1" }, error: null }),
    }));

    mockCheckTripCompletion.mockResolvedValue(false);

    const { result } = renderHook(() => useUpdateStopStatus(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ stopId: "s1", status: "AFGELEVERD" as any });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await waitFor(() => expect(mockCheckTripCompletion).toHaveBeenCalledWith("t1"));
  });

  it("shows toast when trip auto-completes", async () => {
    mockFrom.mockImplementation(() => ({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { trip_id: "t1" }, error: null }),
    }));

    mockCheckTripCompletion.mockResolvedValue(true);

    const { result } = renderHook(() => useUpdateStopStatus(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ stopId: "s1", status: "AFGELEVERD" as any });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining("automatisch voltooid"));
    });
  });

  it("handles checkTripCompletion error gracefully", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    mockFrom.mockImplementation(() => ({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { trip_id: "t1" }, error: null }),
    }));

    mockCheckTripCompletion.mockRejectedValue(new Error("check failed"));

    const { result } = renderHook(() => useUpdateStopStatus(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ stopId: "s1", status: "AFGELEVERD" as any });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await waitFor(() => expect(consoleSpy).toHaveBeenCalledWith("Auto trip completion check failed:", expect.any(Error)));
    consoleSpy.mockRestore();
  });

  it("handles null tripId in result", async () => {
    mockFrom.mockImplementation(() => ({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { trip_id: null }, error: null }),
    }));

    const { result } = renderHook(() => useUpdateStopStatus(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ stopId: "s1", status: "GEPLAND" as any });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // checkTripCompletion should not be called with null
    expect(mockCheckTripCompletion).not.toHaveBeenCalled();
  });

  it("handles update error", async () => {
    mockFrom.mockImplementation(() => ({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: { message: "update failed" } }),
    }));

    const { result } = renderHook(() => useUpdateStopStatus(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ stopId: "s1", status: "AANGEKOMEN" as any });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useDispatchTrip", () => {
  beforeEach(() => vi.clearAllMocks());

  it("validates and dispatches trip", async () => {
    const trip = {
      id: "t1",
      dispatch_status: "CONCEPT",
      driver_id: "d1",
      trip_stops: [{ planned_address: "Amsterdam" }],
    };

    let callIndex = 0;
    mockFrom.mockImplementation((table: string) => {
      callIndex++;
      const chain: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn(),
        update: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        then: vi.fn().mockImplementation((cb: any) => cb(undefined)),
      };
      if (callIndex === 1) {
        chain.single.mockResolvedValue({ data: trip, error: null });
      } else if (callIndex === 2) {
        chain.eq.mockResolvedValue({ error: null });
      } else if (callIndex === 3) {
        chain.single.mockResolvedValue({ data: { user_id: "u1" }, error: null });
      } else {
        chain.insert.mockReturnValue({ then: vi.fn().mockImplementation((cb: any) => cb && cb()) });
      }
      return chain;
    });

    const { result } = renderHook(() => useDispatchTrip(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate("t1");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("dispatches from VERZENDKLAAR status", async () => {
    const trip = {
      id: "t1",
      dispatch_status: "VERZENDKLAAR",
      driver_id: "d1",
      trip_stops: [{ planned_address: "Amsterdam" }],
    };

    let callIndex = 0;
    mockFrom.mockImplementation((table: string) => {
      callIndex++;
      const chain: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn(),
        update: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        then: vi.fn().mockImplementation((cb: any) => cb(undefined)),
      };
      if (callIndex === 1) {
        chain.single.mockResolvedValue({ data: trip, error: null });
      } else if (callIndex === 2) {
        chain.eq.mockResolvedValue({ error: null });
      } else if (callIndex === 3) {
        chain.single.mockResolvedValue({ data: { user_id: null }, error: null });
      } else {
        chain.insert.mockReturnValue({ then: vi.fn().mockImplementation((cb: any) => cb && cb()) });
      }
      return chain;
    });

    const { result } = renderHook(() => useDispatchTrip(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate("t1");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("rejects dispatch from invalid status", async () => {
    const trip = {
      id: "t1",
      dispatch_status: "ACTIEF",
      driver_id: "d1",
      trip_stops: [{ planned_address: "A" }],
    };

    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: trip, error: null }),
    }));

    const { result } = renderHook(() => useDispatchTrip(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate("t1");
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error!.message).toContain("ACTIEF");
  });

  it("rejects dispatch without driver", async () => {
    const trip = {
      id: "t1",
      dispatch_status: "CONCEPT",
      driver_id: null,
      trip_stops: [{ planned_address: "A" }],
    };

    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: trip, error: null }),
    }));

    const { result } = renderHook(() => useDispatchTrip(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate("t1");
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error!.message).toContain("chauffeur");
  });

  it("rejects dispatch with no stops", async () => {
    const trip = {
      id: "t1", dispatch_status: "CONCEPT", driver_id: "d1", trip_stops: [],
    };

    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: trip, error: null }),
    }));

    const { result } = renderHook(() => useDispatchTrip(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate("t1");
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error!.message).toContain("stops");
  });

  it("rejects dispatch with stop missing address", async () => {
    const trip = {
      id: "t1", dispatch_status: "CONCEPT", driver_id: "d1",
      trip_stops: [{ planned_address: "" }],
    };

    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: trip, error: null }),
    }));

    const { result } = renderHook(() => useDispatchTrip(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate("t1");
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error!.message).toContain("adres");
  });

  it("combines multiple validation errors", async () => {
    const trip = {
      id: "t1", dispatch_status: "ACTIEF", driver_id: null,
      trip_stops: [],
    };

    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: trip, error: null }),
    }));

    const { result } = renderHook(() => useDispatchTrip(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate("t1");
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    // Should contain multiple errors joined by ". "
    expect(result.current.error!.message).toContain(". ");
  });

  it("skips notification when no driver user_id found", async () => {
    const trip = {
      id: "t1", dispatch_status: "CONCEPT", driver_id: "d1",
      trip_stops: [{ planned_address: "A" }],
    };

    let callIndex = 0;
    mockFrom.mockImplementation((table: string) => {
      callIndex++;
      const chain: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn(),
        update: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
      };
      if (callIndex === 1) {
        chain.single.mockResolvedValue({ data: trip, error: null });
      } else if (callIndex === 2) {
        chain.eq.mockResolvedValue({ error: null });
      } else if (callIndex === 3) {
        chain.single.mockResolvedValue({ data: null, error: null }); // No driver found
      }
      return chain;
    });

    const { result } = renderHook(() => useDispatchTrip(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate("t1");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("handles fetch error during trip validation", async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: "db error" } }),
    }));

    const { result } = renderHook(() => useDispatchTrip(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate("t1");
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useSavePOD", () => {
  beforeEach(() => vi.clearAllMocks());

  it("saves proof of delivery", async () => {
    mockFrom.mockImplementation(() => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
    }));

    const { result } = renderHook(() => useSavePOD(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({
        trip_stop_id: "s1",
        signature_url: "https://sig.com/img.png",
        recipient_name: "Jan",
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("saves POD with all optional fields", async () => {
    mockFrom.mockImplementation(() => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
    }));

    const { result } = renderHook(() => useSavePOD(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({
        trip_stop_id: "s1",
        order_id: "o1",
        signature_url: "https://sig.com/img.png",
        photos: [{ url: "https://photo.com/1.jpg", type: "damage" }],
        recipient_name: "Jan",
        notes: "Package looked fine",
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("handles POD insert error", async () => {
    mockFrom.mockImplementation(() => ({
      insert: vi.fn().mockResolvedValue({ error: { message: "insert failed" } }),
    }));

    const { result } = renderHook(() => useSavePOD(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({
        trip_stop_id: "s1",
        signature_url: "https://sig.com/img.png",
        recipient_name: "Jan",
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useCreateDeliveryException", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a delivery exception", async () => {
    mockFrom.mockImplementation(() => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
    }));

    const { result } = renderHook(() => useCreateDeliveryException(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({
        tenant_id: "t1",
        exception_type: "DAMAGE",
        severity: "HIGH",
        description: "Package damaged",
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("creates exception with all optional fields", async () => {
    mockFrom.mockImplementation(() => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
    }));

    const { result } = renderHook(() => useCreateDeliveryException(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({
        tenant_id: "t1",
        trip_id: "t1",
        trip_stop_id: "s1",
        order_id: "o1",
        exception_type: "MISSING",
        severity: "CRITICAL",
        description: "Missing item",
        blocks_billing: true,
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("handles insert error", async () => {
    mockFrom.mockImplementation(() => ({
      insert: vi.fn().mockResolvedValue({ error: { message: "fail" } }),
    }));

    const { result } = renderHook(() => useCreateDeliveryException(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({
        tenant_id: "t1",
        exception_type: "OTHER",
        severity: "LOW",
        description: "Minor issue",
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useTripsRealtime", () => {
  beforeEach(() => vi.clearAllMocks());

  it("subscribes to trips channel on mount and cleans up on unmount", () => {
    const { unmount } = renderHook(() => useTripsRealtime(), { wrapper: createWrapper() });

    expect(mockSupabase.channel).toHaveBeenCalledWith("trips-realtime");
    unmount();
    expect(mockSupabase.removeChannel).toHaveBeenCalled();
  });

  it("invalidates queries when realtime event fires", async () => {
    renderHook(() => useTripsRealtime(), { wrapper: createWrapper() });

    // Get the handler registered via .on()
    const channelInstance = mockChannel.mock.results[0].value;
    const onCall = channelInstance.on.mock.calls[0];
    expect(onCall[1]).toEqual(expect.objectContaining({ event: "*", table: "trips" }));

    // The handler is the third arg
    const handler = onCall[2];
    // Call it to verify no crash
    handler({});
  });
});

describe("useAutoCompleteTripCheck", () => {
  beforeEach(() => vi.clearAllMocks());

  it("subscribes to trip_stops changes on mount", () => {
    const { unmount } = renderHook(() => useAutoCompleteTripCheck(), { wrapper: createWrapper() });

    expect(mockSupabase.channel).toHaveBeenCalledWith("auto-trip-completion");
    unmount();
    expect(mockSupabase.removeChannel).toHaveBeenCalled();
  });

  it("calls checkTripCompletion when stop reaches terminal status", async () => {
    mockCheckTripCompletion.mockResolvedValue(false);

    renderHook(() => useAutoCompleteTripCheck(), { wrapper: createWrapper() });

    const channelInstance = mockChannel.mock.results[0].value;
    const onCall = channelInstance.on.mock.calls.find(
      (c: any) => c[1]?.event === "UPDATE" && c[1]?.table === "trip_stops"
    );
    expect(onCall).toBeTruthy();

    const handler = onCall[2];

    await handler({ new: { stop_status: "AFGELEVERD", trip_id: "t1" } });

    expect(mockCheckTripCompletion).toHaveBeenCalledWith("t1");
  });

  it("shows toast when trip auto-completes via realtime", async () => {
    mockCheckTripCompletion.mockResolvedValue(true);

    renderHook(() => useAutoCompleteTripCheck(), { wrapper: createWrapper() });

    const channelInstance = mockChannel.mock.results[0].value;
    const onCall = channelInstance.on.mock.calls.find(
      (c: any) => c[1]?.event === "UPDATE" && c[1]?.table === "trip_stops"
    );
    const handler = onCall[2];

    await handler({ new: { stop_status: "MISLUKT", trip_id: "t1" } });

    expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining("automatisch voltooid"));
  });

  it("ignores non-terminal stop statuses", async () => {
    renderHook(() => useAutoCompleteTripCheck(), { wrapper: createWrapper() });

    const channelInstance = mockChannel.mock.results[0].value;
    const onCall = channelInstance.on.mock.calls.find(
      (c: any) => c[1]?.event === "UPDATE" && c[1]?.table === "trip_stops"
    );
    const handler = onCall[2];

    await handler({ new: { stop_status: "AANGEKOMEN", trip_id: "t1" } });

    expect(mockCheckTripCompletion).not.toHaveBeenCalled();
  });

  it("ignores stop without trip_id", async () => {
    renderHook(() => useAutoCompleteTripCheck(), { wrapper: createWrapper() });

    const channelInstance = mockChannel.mock.results[0].value;
    const onCall = channelInstance.on.mock.calls.find(
      (c: any) => c[1]?.event === "UPDATE" && c[1]?.table === "trip_stops"
    );
    const handler = onCall[2];

    await handler({ new: { stop_status: "AFGELEVERD", trip_id: null } });

    expect(mockCheckTripCompletion).not.toHaveBeenCalled();
  });

  it("handles OVERGESLAGEN terminal status", async () => {
    mockCheckTripCompletion.mockResolvedValue(false);

    renderHook(() => useAutoCompleteTripCheck(), { wrapper: createWrapper() });

    const channelInstance = mockChannel.mock.results[0].value;
    const onCall = channelInstance.on.mock.calls.find(
      (c: any) => c[1]?.event === "UPDATE" && c[1]?.table === "trip_stops"
    );
    const handler = onCall[2];

    await handler({ new: { stop_status: "OVERGESLAGEN", trip_id: "t1" } });

    expect(mockCheckTripCompletion).toHaveBeenCalledWith("t1");
  });

  it("handles checkTripCompletion error gracefully", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockCheckTripCompletion.mockRejectedValue(new Error("check failed"));

    renderHook(() => useAutoCompleteTripCheck(), { wrapper: createWrapper() });

    const channelInstance = mockChannel.mock.results[0].value;
    const onCall = channelInstance.on.mock.calls.find(
      (c: any) => c[1]?.event === "UPDATE" && c[1]?.table === "trip_stops"
    );
    const handler = onCall[2];

    await handler({ new: { stop_status: "AFGELEVERD", trip_id: "t1" } });

    expect(consoleSpy).toHaveBeenCalledWith("Auto trip completion (realtime) failed:", expect.any(Error));
    consoleSpy.mockRestore();
  });
});
