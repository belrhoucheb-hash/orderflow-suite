// src/__tests__/consolidationToTrip.test.ts
import { describe, it, expect } from "vitest";
import { buildTripFromGroup, type TripInput } from "@/lib/consolidationToTrip";
import type { ConsolidationGroup } from "@/types/consolidation";

describe("buildTripFromGroup", () => {
  it("creates correct trip input from approved group", () => {
    const group: ConsolidationGroup = {
      id: "g1",
      tenant_id: "t1",
      name: "Regio Amsterdam 04-apr",
      planned_date: "2026-04-04",
      status: "GOEDGEKEURD",
      vehicle_id: "v1",
      total_weight_kg: 5000,
      total_pallets: 12,
      total_distance_km: 85.5,
      estimated_duration_min: 180,
      utilization_pct: 72.5,
      created_by: "u1",
      created_at: "",
      updated_at: "",
      orders: [
        { id: "co1", group_id: "g1", order_id: "o1", stop_sequence: 1, pickup_sequence: null, created_at: "", order: { id: "o1", order_number: 101, client_name: "Bakkerij B", delivery_address: "Straat 1, Amsterdam", weight_kg: 2000, quantity: 4, requirements: [], time_window_start: "08:00", time_window_end: "12:00" } },
        { id: "co2", group_id: "g1", order_id: "o2", stop_sequence: 2, pickup_sequence: null, created_at: "", order: { id: "o2", order_number: 102, client_name: "Slagerij S", delivery_address: "Straat 2, Amsterdam", weight_kg: 3000, quantity: 8, requirements: [], time_window_start: null, time_window_end: null } },
      ],
    };

    const result = buildTripFromGroup(group);

    expect(result.trip.tenant_id).toBe("t1");
    expect(result.trip.vehicle_id).toBe("v1");
    expect(result.trip.planned_date).toBe("2026-04-04");
    expect(result.trip.dispatch_status).toBe("CONCEPT");
    expect(result.trip.total_distance_km).toBe(85.5);
    expect(result.stops).toHaveLength(2);
    expect(result.stops[0].order_id).toBe("o1");
    expect(result.stops[0].stop_sequence).toBe(1);
    expect(result.stops[0].stop_type).toBe("DELIVERY");
    expect(result.stops[0].planned_address).toBe("Straat 1, Amsterdam");
    expect(result.stops[0].planned_window_start).toBe("08:00");
    expect(result.stops[0].planned_window_end).toBe("12:00");
    expect(result.stops[1].stop_sequence).toBe(2);
  });

  it("throws if group has no vehicle", () => {
    const group: ConsolidationGroup = {
      id: "g1", tenant_id: "t1", name: "Test", planned_date: "2026-04-04",
      status: "GOEDGEKEURD", vehicle_id: null, total_weight_kg: 0,
      total_pallets: 0, total_distance_km: 0, estimated_duration_min: 0,
      utilization_pct: 0, created_by: null, created_at: "", updated_at: "",
      orders: [],
    };
    expect(() => buildTripFromGroup(group)).toThrow("Geen voertuig toegewezen");
  });
});
