import { renderHook, waitFor } from "@testing-library/react";
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

import { useVehicles } from "@/hooks/useVehicles";

describe("useVehicles", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches and maps vehicles correctly", async () => {
    const dbVehicles = [
      {
        id: "v-uuid-1",
        code: "V01",
        name: "Sprinter",
        plate: "AB-123-CD",
        type: "bestelbus",
        capacity_kg: 3500,
        capacity_pallets: 8,
        features: ["koeling"],
      },
    ];

    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: dbVehicles, error: null }),
    }));

    const { result } = renderHook(() => useVehicles(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    const v = result.current.data![0];
    expect(v.id).toBe("V01"); // mapped from code
    expect(v.code).toBe("V01");
    expect(v.capacityKg).toBe(3500);
    expect(v.capacityPallets).toBe(8);
    expect(v.features).toEqual(["koeling"]);
  });

  it("returns empty array when data is null", async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: null }),
    }));

    const { result } = renderHook(() => useVehicles(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("handles null features gracefully", async () => {
    const dbVehicles = [
      {
        id: "v2", code: "V02", name: "Truck", plate: "EF-456-GH",
        type: "vrachtwagen", capacity_kg: 10000, capacity_pallets: 20, features: null,
      },
    ];

    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: dbVehicles, error: null }),
    }));

    const { result } = renderHook(() => useVehicles(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data![0].features).toEqual([]);
  });

  it("throws on supabase error", async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: { message: "fail" } }),
    }));

    const { result } = renderHook(() => useVehicles(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
