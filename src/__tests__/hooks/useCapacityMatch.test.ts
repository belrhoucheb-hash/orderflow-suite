import { renderHook } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import type { ReactNode } from "react";
import React from "react";

// Mock the dependent hooks
vi.mock("@/hooks/useVehicles", () => ({
  useVehicles: () => ({
    data: [
      { id: "v1", code: "V01", name: "Sprinter", plate: "AB", type: "bus", capacityKg: 3000, capacityPallets: 8, features: ["koeling"] },
      { id: "v2", code: "V02", name: "Truck", plate: "CD", type: "truck", capacityKg: 20000, capacityPallets: 33, features: ["adr"] },
      { id: "v3", code: "V03", name: "Small Van", plate: "EF", type: "van", capacityKg: 1000, capacityPallets: 4, features: [] },
    ],
  }),
}));

vi.mock("@/hooks/useDrivers", () => ({
  useDrivers: () => ({
    data: [
      { id: "d1", name: "Jan", current_vehicle_id: "v2", certifications: ["ADR"], status: "beschikbaar" },
      { id: "d2", name: "Piet", current_vehicle_id: "v1", certifications: [], status: "beschikbaar" },
    ],
  }),
}));

const { mockSupabase } = vi.hoisted(() => {
  const mockSupabase = {
    from: vi.fn(),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() }),
    removeChannel: vi.fn(),
  };
  return { mockSupabase };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc },
      React.createElement(BrowserRouter, null, children)
    );
}

import { useCapacityMatch } from "@/hooks/useCapacityMatch";

describe("useCapacityMatch", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns empty array when input is null", () => {
    const { result } = renderHook(() => useCapacityMatch(null), { wrapper: createWrapper() });
    expect(result.current).toEqual([]);
  });

  it("returns all vehicles when no special requirements", () => {
    const { result } = renderHook(
      () => useCapacityMatch({ requirements: [], weightKg: 500, quantity: 2, unit: "Pallets" }),
      { wrapper: createWrapper() }
    );

    expect(result.current.length).toBe(3);
    // Should be sorted by score descending
    expect(result.current[0].score).toBeGreaterThanOrEqual(result.current[1].score);
  });

  it("filters out vehicles without ADR when ADR is required", () => {
    const { result } = renderHook(
      () => useCapacityMatch({ requirements: ["ADR"], weightKg: 1000, quantity: 5, unit: "Pallets" }),
      { wrapper: createWrapper() }
    );

    // Only v2 (features: adr) and v1 (driver d2 has no ADR, but v1 has no adr feature either)
    // v2 has ADR feature + driver Jan with ADR cert
    // v3 has no ADR -> excluded
    // v1 has koeling but no ADR feature, driver Piet has no ADR cert -> excluded
    const vehicleIds = result.current.map((m) => m.vehicle.id);
    expect(vehicleIds).toContain("v2");
    expect(vehicleIds).not.toContain("v3");
  });

  it("filters out vehicles without koeling when cooling is required", () => {
    const { result } = renderHook(
      () => useCapacityMatch({ requirements: ["koeling"], weightKg: 500, quantity: 2, unit: "Pallets" }),
      { wrapper: createWrapper() }
    );

    const vehicleIds = result.current.map((m) => m.vehicle.id);
    expect(vehicleIds).toContain("v1"); // has koeling
    expect(vehicleIds).not.toContain("v2"); // no koeling
    expect(vehicleIds).not.toContain("v3"); // no koeling
  });

  it("adds overweight warning when weight exceeds capacity", () => {
    const { result } = renderHook(
      () => useCapacityMatch({ requirements: [], weightKg: 5000, quantity: 0, unit: "Stuks" }),
      { wrapper: createWrapper() }
    );

    // v3 (1000kg) and v1 (3000kg) should have overweight warnings
    const v3Match = result.current.find((m) => m.vehicle.id === "v3");
    expect(v3Match?.warnings.some((w) => w.includes("Overgewicht"))).toBe(true);

    const v1Match = result.current.find((m) => m.vehicle.id === "v1");
    expect(v1Match?.warnings.some((w) => w.includes("Overgewicht"))).toBe(true);
  });

  it("adds good utilization reason for 60-100% capacity", () => {
    const { result } = renderHook(
      () => useCapacityMatch({ requirements: [], weightKg: 2000, quantity: 0, unit: "Stuks" }),
      { wrapper: createWrapper() }
    );

    // v1 has 3000kg capacity, 2000/3000 = 67% -> good utilization
    const v1Match = result.current.find((m) => m.vehicle.id === "v1");
    expect(v1Match?.reasons.some((r) => r.includes("benutting"))).toBe(true);
  });

  it("adds low utilization warning for < 30% capacity", () => {
    const { result } = renderHook(
      () => useCapacityMatch({ requirements: [], weightKg: 100, quantity: 0, unit: "Stuks" }),
      { wrapper: createWrapper() }
    );

    // v2 has 20000kg capacity, 100/20000 = 0.5% -> very low
    const v2Match = result.current.find((m) => m.vehicle.id === "v2");
    expect(v2Match?.warnings.some((w) => w.includes("benutting"))).toBe(true);
  });

  it("adds pallet warnings when exceeding capacity", () => {
    const { result } = renderHook(
      () => useCapacityMatch({ requirements: [], weightKg: 0, quantity: 10, unit: "Pallets" }),
      { wrapper: createWrapper() }
    );

    // v3 has 4 pallets -> warning
    const v3Match = result.current.find((m) => m.vehicle.id === "v3");
    expect(v3Match?.warnings.some((w) => w.includes("palletplaatsen"))).toBe(true);
  });

  it("adds pallet remaining reason when under capacity", () => {
    const { result } = renderHook(
      () => useCapacityMatch({ requirements: [], weightKg: 0, quantity: 5, unit: "Pallets" }),
      { wrapper: createWrapper() }
    );

    // v1 has 8 pallets, 5 needed -> 3 over
    const v1Match = result.current.find((m) => m.vehicle.id === "v1");
    expect(v1Match?.reasons.some((r) => r.includes("palletplaatsen over"))).toBe(true);
  });

  it("links driver to vehicle and shows certifications", () => {
    const { result } = renderHook(
      () => useCapacityMatch({ requirements: ["ADR"], weightKg: 1000, quantity: 5, unit: "Pallets" }),
      { wrapper: createWrapper() }
    );

    const v2Match = result.current.find((m) => m.vehicle.id === "v2");
    expect(v2Match?.driver?.name).toBe("Jan");
    expect(v2Match?.reasons.some((r) => r.includes("ADR-gecertificeerd"))).toBe(true);
  });

  it("scores are clamped between 0 and 100", () => {
    const { result } = renderHook(
      () => useCapacityMatch({ requirements: [], weightKg: 0, quantity: 0, unit: "Stuks" }),
      { wrapper: createWrapper() }
    );

    for (const match of result.current) {
      expect(match.score).toBeGreaterThanOrEqual(0);
      expect(match.score).toBeLessThanOrEqual(100);
    }
  });

  it("adds 'Beschikbaar' reason when no specific reasons", () => {
    const { result } = renderHook(
      () => useCapacityMatch({ requirements: [], weightKg: 0, quantity: 0, unit: "Stuks" }),
      { wrapper: createWrapper() }
    );

    // Vehicles with no specific matches should have "Beschikbaar"
    const v3Match = result.current.find((m) => m.vehicle.id === "v3");
    expect(v3Match?.reasons).toContain("Beschikbaar");
  });
});
