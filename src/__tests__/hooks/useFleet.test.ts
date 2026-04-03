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

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc },
      React.createElement(BrowserRouter, null, children)
    );
}

function makeChain(resolvedValue: any = { data: [], error: null }) {
  const chain: any = {};
  const methods = ["select", "insert", "update", "delete", "eq", "order", "is", "lte", "gte", "in", "not", "single", "upsert"];
  methods.forEach((m) => {
    chain[m] = vi.fn().mockReturnValue(chain);
  });
  // The terminal call resolves
  chain.order.mockResolvedValue(resolvedValue);
  chain.single.mockResolvedValue(resolvedValue);
  chain.insert.mockResolvedValue(resolvedValue);
  return chain;
}

import {
  useFleetVehicles,
  useVehicleById,
  useVehicleDocuments,
  useVehicleMaintenance,
  useCreateMaintenance,
  useCompleteMaintenance,
  useUpcomingMaintenance,
  useCreateDocument,
  useVehicleAvailability,
  useAddVehicle,
  useUpdateVehicle,
  useVehicleUtilization,
} from "@/hooks/useFleet";

describe("useFleetVehicles", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches and maps vehicles from DB", async () => {
    const dbData = [{
      id: "uuid1", code: "V01", name: "Sprinter", plate: "AB-12-CD",
      type: "bestelbus", brand: "Mercedes", build_year: 2020,
      capacity_kg: 3000, capacity_pallets: 6,
      cargo_length_cm: 400, cargo_width_cm: 200, cargo_height_cm: 200,
      features: ["koeling"], status: "beschikbaar",
      assigned_driver: "driver1", fuel_consumption: 12.5, is_active: true,
    }];
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: dbData, error: null }),
    }));

    const { result } = renderHook(() => useFleetVehicles(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const v = result.current.data![0];
    expect(v.id).toBe("uuid1");
    expect(v.capacityKg).toBe(3000);
    expect(v.buildYear).toBe(2020);
    expect(v.cargoLengthCm).toBe(400);
    expect(v.features).toEqual(["koeling"]);
    expect(v.isActive).toBe(true);
  });

  it("handles null features and status defaults", async () => {
    const dbData = [{ id: "uuid2", code: "V02", name: "T", plate: "X", type: "t", features: null, status: null, is_active: true }];
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: dbData, error: null }),
    }));

    const { result } = renderHook(() => useFleetVehicles(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data![0].features).toEqual([]);
    expect(result.current.data![0].status).toBe("beschikbaar");
  });
});

describe("useVehicleById", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is disabled when id is undefined", () => {
    const { result } = renderHook(() => useVehicleById(undefined), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("fetches a single vehicle", async () => {
    const dbVehicle = {
      id: "uuid1", code: "V01", name: "Sprinter", plate: "AB", type: "bus",
      features: null, status: null, is_active: true,
    };
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: dbVehicle, error: null }),
    }));

    const { result } = renderHook(() => useVehicleById("uuid1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.code).toBe("V01");
    expect(result.current.data!.status).toBe("beschikbaar");
  });
});

describe("useVehicleDocuments", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is disabled when vehicleId is undefined", () => {
    const { result } = renderHook(() => useVehicleDocuments(undefined), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("fetches documents", async () => {
    const docs = [{ id: "d1", doc_type: "APK" }];
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: docs, error: null }),
    }));

    const { result } = renderHook(() => useVehicleDocuments("v1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(docs);
  });
});

describe("useVehicleMaintenance", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is disabled when vehicleId is undefined", () => {
    const { result } = renderHook(() => useVehicleMaintenance(undefined), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("fetches maintenance records", async () => {
    const records = [{ id: "m1", maintenance_type: "oil_change" }];
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: records, error: null }),
    }));

    const { result } = renderHook(() => useVehicleMaintenance("v1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(records);
  });
});

describe("useCreateMaintenance", () => {
  beforeEach(() => vi.clearAllMocks());

  it("inserts maintenance record", async () => {
    mockFrom.mockImplementation(() => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
    }));

    const { result } = renderHook(() => useCreateMaintenance(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({
        vehicle_id: "v1",
        maintenance_type: "oil_change",
        scheduled_date: "2026-04-10",
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("handles insert error", async () => {
    mockFrom.mockImplementation(() => ({
      insert: vi.fn().mockResolvedValue({ error: { message: "fail" } }),
    }));

    const { result } = renderHook(() => useCreateMaintenance(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({
        vehicle_id: "v1",
        maintenance_type: "oil_change",
        scheduled_date: "2026-04-10",
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useCompleteMaintenance", () => {
  beforeEach(() => vi.clearAllMocks());

  it("completes a maintenance record", async () => {
    mockFrom.mockImplementation(() => ({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    }));

    const { result } = renderHook(() => useCompleteMaintenance(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ id: "m1", vehicleId: "v1" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe("useUpcomingMaintenance", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches overdue maintenance", async () => {
    const records = [{ id: "m1", vehicles: { name: "Sprinter", plate: "AB-12" } }];
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: records, error: null }),
    }));

    const { result } = renderHook(() => useUpcomingMaintenance(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(records);
  });
});

describe("useCreateDocument", () => {
  beforeEach(() => vi.clearAllMocks());

  it("inserts a document", async () => {
    mockFrom.mockImplementation(() => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
    }));

    const { result } = renderHook(() => useCreateDocument(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ vehicle_id: "v1", doc_type: "APK" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe("useVehicleAvailability", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is disabled when vehicleId is undefined", () => {
    const { result } = renderHook(() => useVehicleAvailability(undefined), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("fetches availability with date range", async () => {
    const avail = [{ id: "a1", date: "2026-04-10", status: "available" }];
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: avail, error: null }),
    }));

    const { result } = renderHook(
      () => useVehicleAvailability("v1", "2026-04-01", "2026-04-30"),
      { wrapper: createWrapper() }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(avail);
  });

  it("fetches availability without date range", async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    }));

    const { result } = renderHook(
      () => useVehicleAvailability("v1"),
      { wrapper: createWrapper() }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe("useAddVehicle", () => {
  beforeEach(() => vi.clearAllMocks());

  it("inserts a vehicle", async () => {
    mockFrom.mockImplementation(() => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
    }));

    const { result } = renderHook(() => useAddVehicle(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ code: "V03", name: "New Van", plate: "XY-99-ZZ", type: "bestelbus" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe("useUpdateVehicle", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates a vehicle", async () => {
    mockFrom.mockImplementation(() => ({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    }));

    const { result } = renderHook(() => useUpdateVehicle(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ id: "v1", name: "Updated Van" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe("useVehicleUtilization", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns empty object when no active trips", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "trips") {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      return { select: vi.fn().mockReturnThis() };
    });

    const { result } = renderHook(() => useVehicleUtilization(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({});
  });

  it("calculates utilization percentages", async () => {
    const trips = [
      { vehicle_id: "v1", trip_stops: [{ order_id: "o1" }, { order_id: "o2" }] },
    ];
    const orders = [
      { id: "o1", weight_kg: 500 },
      { id: "o2", weight_kg: 300 },
    ];
    const vehicles = [{ id: "v1", capacity_kg: 1000 }];

    mockFrom.mockImplementation((table: string) => {
      const chain: any = {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      };
      if (table === "trips") {
        chain.in.mockResolvedValue({ data: trips, error: null });
      } else if (table === "orders") {
        chain.in.mockResolvedValue({ data: orders, error: null });
      } else if (table === "vehicles") {
        chain.in.mockResolvedValue({ data: vehicles, error: null });
      }
      return chain;
    });

    const { result } = renderHook(() => useVehicleUtilization(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!["v1"]).toBe(80); // (500+300)/1000 * 100
  });

  it("caps utilization at 100%", async () => {
    const trips = [
      { vehicle_id: "v1", trip_stops: [{ order_id: "o1" }] },
    ];
    const orders = [{ id: "o1", weight_kg: 2000 }];
    const vehicles = [{ id: "v1", capacity_kg: 1000 }];

    mockFrom.mockImplementation((table: string) => {
      const chain: any = {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
      };
      if (table === "trips") chain.in.mockResolvedValue({ data: trips, error: null });
      else if (table === "orders") chain.in.mockResolvedValue({ data: orders, error: null });
      else if (table === "vehicles") chain.in.mockResolvedValue({ data: vehicles, error: null });
      return chain;
    });

    const { result } = renderHook(() => useVehicleUtilization(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!["v1"]).toBe(100);
  });

  it("returns 0 for vehicles with 0 capacity", async () => {
    const trips = [
      { vehicle_id: "v1", trip_stops: [{ order_id: "o1" }] },
    ];
    const orders = [{ id: "o1", weight_kg: 100 }];
    const vehicles = [{ id: "v1", capacity_kg: 0 }];

    mockFrom.mockImplementation((table: string) => {
      const chain: any = {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
      };
      if (table === "trips") chain.in.mockResolvedValue({ data: trips, error: null });
      else if (table === "orders") chain.in.mockResolvedValue({ data: orders, error: null });
      else if (table === "vehicles") chain.in.mockResolvedValue({ data: vehicles, error: null });
      return chain;
    });

    const { result } = renderHook(() => useVehicleUtilization(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!["v1"]).toBe(0);
  });
});
