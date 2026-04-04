import { describe, it, expect } from "vitest";
import { buildTripFromGroup } from "@/lib/consolidationToTrip";
import type { ConsolidationGroup } from "@/types/consolidation";

const mockGroup: ConsolidationGroup = {
  id: "g1",
  tenant_id: "t1",
  name: "Groep Rotterdam Noord",
  planned_date: "2026-04-04",
  status: "GOEDGEKEURD",
  vehicle_id: "v1",
  total_weight_kg: 1200,
  total_pallets: 8,
  total_distance_km: 45,
  estimated_duration_min: 90,
  utilization_pct: 0.60,
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
        delivery_address: "Coolsingel 1, Rotterdam",
        weight_kg: 600,
        quantity: 4,
        requirements: [],
        time_window_start: "08:00",
        time_window_end: "12:00",
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
        delivery_address: "Blaak 10, Rotterdam",
        weight_kg: 600,
        quantity: 4,
        requirements: [],
        time_window_start: null,
        time_window_end: null,
      },
    },
  ],
};

describe("buildTripFromGroup", () => {
  it("builds correct TripInput and StopInputs from approved group", () => {
    const { trip, stops } = buildTripFromGroup(mockGroup);

    // Trip fields
    expect(trip.vehicle_id).toBe("v1");
    expect(trip.planned_date).toBe("2026-04-04");
    expect(trip.dispatch_status).toBe("CONCEPT");

    // Stops
    expect(stops).toHaveLength(2);
    expect(stops[0].order_id).toBe("o1");
    expect(stops[0].stop_type).toBe("DELIVERY");
    expect(stops[0].planned_address).toBe("Coolsingel 1, Rotterdam");
    expect(stops[0].stop_sequence).toBe(1);
    expect(stops[0].planned_time).toBe("08:00");

    expect(stops[1].order_id).toBe("o2");
    expect(stops[1].stop_type).toBe("DELIVERY");
    expect(stops[1].planned_address).toBe("Blaak 10, Rotterdam");
    expect(stops[1].stop_sequence).toBe(2);
    expect(stops[1].planned_time).toBeNull();
  });

  it("throws if no vehicle_id assigned to group", () => {
    const groupNoVehicle: ConsolidationGroup = { ...mockGroup, vehicle_id: null };
    expect(() => buildTripFromGroup(groupNoVehicle)).toThrow(/voertuig/i);
  });
});
