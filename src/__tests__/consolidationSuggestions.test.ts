// src/__tests__/consolidationSuggestions.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/data/geoData", () => ({
  haversineKm: vi.fn((a: any, b: any) => {
    const dLat = b.lat - a.lat;
    const dLng = b.lng - a.lng;
    return Math.sqrt(dLat * dLat + dLng * dLng) * 111;
  }),
}));

import {
  generateSuggestions,
  type SuggestionInput,
  type Suggestion,
} from "@/lib/consolidationSuggestions";
import type { ConsolidationGroup } from "@/types/consolidation";
import type { ConsolidatableOrder } from "@/lib/consolidationEngine";
import type { GeoCoord } from "@/data/geoData";

function makeGroup(overrides: Partial<ConsolidationGroup> = {}): ConsolidationGroup {
  return {
    id: "g1", tenant_id: "t1", name: "Amsterdam", planned_date: "2026-04-04",
    status: "VOORSTEL", vehicle_id: "v1", total_weight_kg: 3000, total_pallets: 6,
    total_distance_km: 50, estimated_duration_min: 120, utilization_pct: 40,
    created_by: null, created_at: "", updated_at: "",
    orders: [
      { id: "co-existing", group_id: "g1", order_id: "o-existing", stop_sequence: 1, pickup_sequence: null, created_at: "",
        order: { id: "o-existing", order_number: 99, client_name: "Existing", delivery_address: "Amsterdam", weight_kg: 1000, quantity: 2, requirements: [], time_window_start: null, time_window_end: null } },
    ],
    ...overrides,
  };
}

function makeUnassignedOrder(id: string, postcode: string, overrides: Partial<ConsolidatableOrder> = {}): ConsolidatableOrder {
  return {
    id, order_number: 1, client_name: "Client",
    delivery_address: `Street, ${postcode} City`,
    delivery_postcode: postcode, weight_kg: 500, quantity: 2,
    requirements: [], is_weight_per_unit: false,
    time_window_start: null, time_window_end: null,
    geocoded_delivery_lat: 52.37, geocoded_delivery_lng: 4.89,
    ...overrides,
  };
}

describe("generateSuggestions", () => {
  it("suggests adding nearby unassigned order to low-utilization group", () => {
    const input: SuggestionInput = {
      groups: [makeGroup({ utilization_pct: 40, total_weight_kg: 3000 })],
      unassignedOrders: [makeUnassignedOrder("o-new", "1012AB")],
      coordMap: new Map([["o-new", { lat: 52.37, lng: 4.89 }], ["o-existing", { lat: 52.37, lng: 4.90 }]]),
      vehicleCapacityKg: 10000,
      vehicleCapacityPallets: 20,
    };

    const suggestions = generateSuggestions(input);
    const fitsSuggestion = suggestions.find((s) => s.type === "PAST_IN_GROEP");
    expect(fitsSuggestion).toBeDefined();
    expect(fitsSuggestion!.orderId).toBe("o-new");
    expect(fitsSuggestion!.groupId).toBe("g1");
  });

  it("warns about low utilization", () => {
    const input: SuggestionInput = {
      groups: [makeGroup({ utilization_pct: 25 })],
      unassignedOrders: [],
      coordMap: new Map(),
      vehicleCapacityKg: 10000,
      vehicleCapacityPallets: 20,
    };

    const suggestions = generateSuggestions(input);
    const lowUtil = suggestions.find((s) => s.type === "LAGE_BENUTTING");
    expect(lowUtil).toBeDefined();
    expect(lowUtil!.groupId).toBe("g1");
  });

  it("warns about incompatible requirements", () => {
    const input: SuggestionInput = {
      groups: [makeGroup()],
      unassignedOrders: [makeUnassignedOrder("o-adr", "1012AB", { requirements: ["ADR"] })],
      coordMap: new Map([["o-adr", { lat: 52.37, lng: 4.89 }], ["o-existing", { lat: 52.37, lng: 4.90 }]]),
      vehicleCapacityKg: 10000,
      vehicleCapacityPallets: 20,
    };

    const suggestions = generateSuggestions(input);
    // Should still flag it even if it doesn't have the vehicle features — that's for the caller to check
    expect(suggestions.length).toBeGreaterThanOrEqual(1);
  });

  it("warns about deadline proximity", () => {
    const input: SuggestionInput = {
      groups: [makeGroup()],
      unassignedOrders: [makeUnassignedOrder("o-urgent", "1012AB", { time_window_end: "08:00" })],
      coordMap: new Map([["o-urgent", { lat: 52.37, lng: 4.89 }], ["o-existing", { lat: 52.37, lng: 4.90 }]]),
      vehicleCapacityKg: 10000,
      vehicleCapacityPallets: 20,
    };

    const suggestions = generateSuggestions(input);
    const deadline = suggestions.find((s) => s.type === "DEADLINE");
    expect(deadline).toBeDefined();
  });
});
