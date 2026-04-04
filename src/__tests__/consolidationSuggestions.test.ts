import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock haversineKm from geoData
vi.mock("@/data/geoData", () => ({
  haversineKm: vi.fn((a: any, b: any) => {
    // Return a predictable distance based on test scenario
    // We'll override per test using mockReturnValue
    return 0;
  }),
}));

import { generateSuggestions } from "@/lib/consolidationSuggestions";
import type { SuggestionInput } from "@/lib/consolidationSuggestions";
import type { ConsolidatableOrder } from "@/lib/consolidationEngine";
import type { ConsolidationGroup } from "@/types/consolidation";
import { haversineKm } from "@/data/geoData";

const mockHaversine = haversineKm as ReturnType<typeof vi.fn>;

// Helper to build a ConsolidatableOrder
function makeOrder(overrides: Partial<ConsolidatableOrder> = {}): ConsolidatableOrder {
  return {
    id: "o1",
    order_number: 1001,
    client_name: "Klant A",
    delivery_address: "Teststraat 1",
    delivery_postcode: "3011",
    weight_kg: 200,
    quantity: 2,
    requirements: [],
    is_weight_per_unit: false,
    time_window_start: null,
    time_window_end: null,
    geocoded_delivery_lat: 52.0,
    geocoded_delivery_lng: 4.5,
    ...overrides,
  };
}

// Helper to build a ConsolidationGroup
function makeGroup(overrides: Partial<ConsolidationGroup> = {}): ConsolidationGroup {
  return {
    id: "g1",
    tenant_id: "t1",
    name: "Groep Test",
    planned_date: "2026-04-04",
    status: "VOORSTEL",
    vehicle_id: "v1",
    total_weight_kg: 300,
    total_pallets: 3,
    total_distance_km: 20,
    estimated_duration_min: 60,
    utilization_pct: 0.30, // 30% — low utilization
    created_by: null,
    created_at: "2026-04-01T10:00:00Z",
    updated_at: "2026-04-01T10:00:00Z",
    orders: [
      {
        id: "co1",
        group_id: "g1",
        order_id: "o1",
        stop_sequence: 1,
        pickup_sequence: null,
        created_at: "2026-04-01T10:00:00Z",
        order: {
          id: "o1",
          order_number: 1001,
          client_name: "Klant A",
          delivery_address: "Teststraat 1",
          weight_kg: 300,
          quantity: 3,
          requirements: [],
          time_window_start: null,
          time_window_end: null,
        },
      },
    ],
    vehicle: { name: "Truck A", plate: "AB-123-CD", capacityKg: 1000, capacityPallets: 10 },
    ...overrides,
  };
}

beforeEach(() => {
  mockHaversine.mockReturnValue(0);
});

describe("generateSuggestions", () => {
  it("suggests adding a nearby unassigned order to a low-utilization group", () => {
    // Group with 30% utilization (< 40% threshold)
    const group = makeGroup({ utilization_pct: 0.30 });
    // Unassigned order that is nearby (< 30km)
    const unassigned = makeOrder({
      id: "unassigned-1",
      weight_kg: 100,
      quantity: 1,
      geocoded_delivery_lat: 52.01,
      geocoded_delivery_lng: 4.51,
    });

    // haversineKm returns 5km (nearby)
    mockHaversine.mockReturnValue(5);

    const input: SuggestionInput = {
      groups: [group],
      unassignedOrders: [unassigned],
    };

    const suggestions = generateSuggestions(input);
    const addToGroup = suggestions.filter((s) => s.type === "PAST_IN_GROEP");
    expect(addToGroup.length).toBeGreaterThan(0);
    expect(addToGroup[0].groupId).toBe("g1");
    expect(addToGroup[0].orderId).toBe("unassigned-1");
  });

  it("warns about low utilization group (< 40%)", () => {
    const group = makeGroup({ utilization_pct: 0.25 });

    const input: SuggestionInput = {
      groups: [group],
      unassignedOrders: [],
    };

    const suggestions = generateSuggestions(input);
    const lageBenuttings = suggestions.filter((s) => s.type === "LAGE_BENUTTING");
    expect(lageBenuttings.length).toBeGreaterThan(0);
    expect(lageBenuttings[0].groupId).toBe("g1");
  });

  it("warns about incompatible special requirements between orders in a group", () => {
    const group = makeGroup({
      orders: [
        {
          id: "co1",
          group_id: "g1",
          order_id: "o1",
          stop_sequence: 1,
          pickup_sequence: null,
          created_at: "2026-04-01T10:00:00Z",
          order: {
            id: "o1",
            order_number: 1001,
            client_name: "Klant A",
            delivery_address: "Addr 1",
            weight_kg: 300,
            quantity: 3,
            requirements: ["ADR"],
            time_window_start: null,
            time_window_end: null,
          },
        },
        {
          id: "co2",
          group_id: "g1",
          order_id: "o2",
          stop_sequence: 2,
          pickup_sequence: null,
          created_at: "2026-04-01T10:00:00Z",
          order: {
            id: "o2",
            order_number: 1002,
            client_name: "Klant B",
            delivery_address: "Addr 2",
            weight_kg: 300,
            quantity: 3,
            requirements: ["KOELING"],
            time_window_start: null,
            time_window_end: null,
          },
        },
      ],
    });

    const input: SuggestionInput = {
      groups: [group],
      unassignedOrders: [],
    };

    const suggestions = generateSuggestions(input);
    const incompatible = suggestions.filter((s) => s.type === "INCOMPATIBEL");
    expect(incompatible.length).toBeGreaterThan(0);
    expect(incompatible[0].groupId).toBe("g1");
  });

  it("warns about orders with tight deadline (time_window_end before 08:00)", () => {
    const group = makeGroup({
      utilization_pct: 0.80, // not low utilization
      orders: [
        {
          id: "co1",
          group_id: "g1",
          order_id: "o1",
          stop_sequence: 1,
          pickup_sequence: null,
          created_at: "2026-04-01T10:00:00Z",
          order: {
            id: "o1",
            order_number: 1001,
            client_name: "Klant A",
            delivery_address: "Addr 1",
            weight_kg: 300,
            quantity: 3,
            requirements: [],
            time_window_start: "06:00",
            time_window_end: "07:30", // tight — before 08:00
          },
        },
      ],
    });

    const input: SuggestionInput = {
      groups: [group],
      unassignedOrders: [],
    };

    const suggestions = generateSuggestions(input);
    const deadline = suggestions.filter((s) => s.type === "DEADLINE");
    expect(deadline.length).toBeGreaterThan(0);
    expect(deadline[0].groupId).toBe("g1");
  });
});
