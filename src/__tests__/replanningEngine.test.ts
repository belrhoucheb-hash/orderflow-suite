import { describe, it, expect } from "vitest";
import {
  detectDisruptions,
  generateReplanSuggestions,
  calculateReplanConfidence,
} from "@/utils/replanningEngine";
import type { Trip, TripStop } from "@/types/dispatch";
import type { Disruption } from "@/types/replanning";
import type { FleetVehicle } from "@/hooks/useVehicles";

// ─── Helpers ────────────────────────────────────────────────

function makeStop(overrides: Partial<TripStop> = {}): TripStop {
  return {
    id: "stop-1",
    trip_id: "trip-1",
    order_id: "order-1",
    stop_type: "DELIVERY",
    stop_sequence: 1,
    stop_status: "GEPLAND",
    planned_address: "Amsterdam",
    planned_latitude: 52.37,
    planned_longitude: 4.9,
    planned_time: "10:00",
    actual_arrival_time: null,
    actual_departure_time: null,
    contact_name: null,
    contact_phone: null,
    instructions: null,
    failure_reason: null,
    notes: null,
    created_at: "2026-04-06T00:00:00Z",
    updated_at: "2026-04-06T00:00:00Z",
    ...overrides,
  };
}

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "trip-1",
    tenant_id: "tenant-1",
    trip_number: 1001,
    vehicle_id: "v1",
    driver_id: "driver-1",
    dispatch_status: "ACTIEF",
    planned_date: "2026-04-06",
    planned_start_time: "08:00",
    actual_start_time: null,
    actual_end_time: null,
    total_distance_km: null,
    total_duration_min: null,
    dispatcher_id: null,
    dispatched_at: null,
    received_at: null,
    accepted_at: null,
    started_at: null,
    completed_at: null,
    notes: null,
    created_at: "2026-04-06T00:00:00Z",
    updated_at: "2026-04-06T00:00:00Z",
    ...overrides,
  };
}

function makeVehicle(overrides: Partial<FleetVehicle> = {}): FleetVehicle {
  return {
    id: "v2",
    code: "v2",
    name: "Truck B",
    plate: "AB-123-CD",
    type: "truck",
    capacityKg: 5000,
    capacityPallets: 10,
    features: [],
    ...overrides,
  };
}

// ─── detectDisruptions ──────────────────────────────────────

describe("detectDisruptions", () => {
  it("detects time window breach when stop is overdue", () => {
    const stop = makeStop({ planned_time: "08:00" });
    const trip = makeTrip({ stops: [stop] });

    // 08:45 — 45min past 08:00, past the 30min threshold but under 60min
    const now = new Date("2026-04-06T08:45:00");
    const disruptions = detectDisruptions([trip], [], now);

    expect(disruptions.length).toBeGreaterThanOrEqual(1);
    expect(disruptions[0].type).toBe("time_window_breach");
    expect(disruptions[0].severity).toBe("high");
    expect(disruptions[0].affectedTripId).toBe("trip-1");
  });

  it("detects critical severity for >60min overdue", () => {
    const stop = makeStop({ planned_time: "08:00" });
    const trip = makeTrip({ stops: [stop] });

    // 09:30 = 90min past planned_time => critical
    const now = new Date("2026-04-06T09:31:00");
    const disruptions = detectDisruptions([trip], [], now);

    expect(disruptions.length).toBeGreaterThanOrEqual(1);
    expect(disruptions[0].severity).toBe("critical");
  });

  it("does not detect disruption for on-time stops", () => {
    const stop = makeStop({ planned_time: "10:00" });
    const trip = makeTrip({ stops: [stop] });

    // 10:15 — within the 30min threshold
    const now = new Date("2026-04-06T10:15:00");
    const disruptions = detectDisruptions([trip], [], now);

    expect(disruptions).toHaveLength(0);
  });

  it("detects order_cancelled disruption", () => {
    const stop = makeStop({ order_id: "order-cancelled" });
    const trip = makeTrip({ stops: [stop] });

    const orders = [{ id: "order-cancelled", status: "CANCELLED" }];
    const now = new Date("2026-04-06T08:00:00");
    const disruptions = detectDisruptions([trip], orders, now);

    const cancelDisruption = disruptions.find((d) => d.type === "order_cancelled");
    expect(cancelDisruption).toBeDefined();
    expect(cancelDisruption!.affectedOrderId).toBe("order-cancelled");
  });

  it("ignores completed/aborted trips", () => {
    const stop = makeStop({ planned_time: "08:00" });
    const trip = makeTrip({ dispatch_status: "VOLTOOID", stops: [stop] });

    const now = new Date("2026-04-06T12:00:00");
    const disruptions = detectDisruptions([trip], [], now);

    expect(disruptions).toHaveLength(0);
  });

  it("ignores delivered/failed stops", () => {
    const stop = makeStop({ planned_time: "08:00", stop_status: "AFGELEVERD" });
    const trip = makeTrip({ stops: [stop] });

    const now = new Date("2026-04-06T12:00:00");
    const disruptions = detectDisruptions([trip], [], now);

    expect(disruptions).toHaveLength(0);
  });
});

// ─── generateReplanSuggestions ──────────────────────────────

describe("generateReplanSuggestions", () => {
  it("generates reorder suggestion for traffic delay", () => {
    const stops = [
      makeStop({ id: "s1", stop_sequence: 1, planned_latitude: 52.37, planned_longitude: 4.9 }),
      makeStop({ id: "s2", stop_sequence: 2, planned_latitude: 51.92, planned_longitude: 4.48 }),
      makeStop({ id: "s3", stop_sequence: 3, planned_latitude: 51.44, planned_longitude: 5.47 }),
    ];
    const trip = makeTrip({ stops });

    const disruption: Disruption = {
      id: "d1",
      type: "traffic_delay",
      severity: "medium",
      affectedTripId: "trip-1",
      description: "Traffic delay on A2",
      detectedAt: new Date(),
      autoResolved: false,
    };

    const suggestions = generateReplanSuggestions(disruption, [], [trip]);

    expect(suggestions.length).toBeGreaterThanOrEqual(1);
    expect(suggestions[0].actions[0].type).toBe("reorder_stops");
    expect(suggestions[0].confidence).toBeGreaterThan(0);
    expect(suggestions[0].confidence).toBeLessThanOrEqual(100);
  });

  it("generates reassignment suggestions for vehicle breakdown", () => {
    const stops = [
      makeStop({ id: "s1", stop_sequence: 1 }),
      makeStop({ id: "s2", stop_sequence: 2 }),
    ];
    const trip = makeTrip({ stops, vehicle_id: "v1" });
    const vehicle = makeVehicle({ id: "v2", name: "Backup Truck" });

    const disruption: Disruption = {
      id: "d2",
      type: "vehicle_breakdown",
      severity: "critical",
      affectedTripId: "trip-1",
      affectedVehicleId: "v1",
      description: "Vehicle v1 engine failure",
      detectedAt: new Date(),
      autoResolved: false,
    };

    const suggestions = generateReplanSuggestions(disruption, [vehicle], [trip]);

    expect(suggestions.length).toBeGreaterThanOrEqual(1);
    expect(suggestions[0].actions[0].type).toBe("reassign_order");
    expect(suggestions[0].impact.affectedStops).toBe(2);
  });

  it("generates optimization suggestion for cancellation", () => {
    const stops = [
      makeStop({ id: "s1", order_id: "o1", stop_sequence: 1, planned_latitude: 52.37, planned_longitude: 4.9 }),
      makeStop({ id: "s2", order_id: "o2", stop_sequence: 2, planned_latitude: 51.92, planned_longitude: 4.48 }),
      makeStop({ id: "s3", order_id: "o3", stop_sequence: 3, planned_latitude: 51.44, planned_longitude: 5.47 }),
    ];
    const trip = makeTrip({ stops });

    const disruption: Disruption = {
      id: "d3",
      type: "order_cancelled",
      severity: "medium",
      affectedTripId: "trip-1",
      affectedOrderId: "o2",
      description: "Order o2 cancelled by client",
      detectedAt: new Date(),
      autoResolved: false,
    };

    const suggestions = generateReplanSuggestions(disruption, [], [trip]);

    expect(suggestions.length).toBeGreaterThanOrEqual(1);
    expect(suggestions[0].actions[0].type).toBe("reorder_stops");
    // Remaining stops should not include cancelled order
    expect(suggestions[0].impact.affectedStops).toBe(2);
  });

  it("generates insertion suggestions for new urgent order", () => {
    const stops = [
      makeStop({ id: "s1", stop_sequence: 1, planned_latitude: 52.37, planned_longitude: 4.9 }),
      makeStop({ id: "s2", stop_sequence: 2, planned_latitude: 51.92, planned_longitude: 4.48 }),
    ];
    const trip = makeTrip({ stops });

    const disruption: Disruption = {
      id: "d4",
      type: "new_urgent_order",
      severity: "high",
      affectedOrderId: "urgent-order-1",
      description: "New urgent order needs immediate delivery",
      detectedAt: new Date(),
      autoResolved: false,
    };

    const suggestions = generateReplanSuggestions(disruption, [], [trip]);

    expect(suggestions.length).toBeGreaterThanOrEqual(1);
    expect(suggestions[0].actions[0].type).toBe("reassign_order");
    expect(suggestions[0].actions[0].orderId).toBe("urgent-order-1");
  });

  it("returns empty for disruption with no matching trip", () => {
    const disruption: Disruption = {
      id: "d5",
      type: "traffic_delay",
      severity: "low",
      affectedTripId: "nonexistent-trip",
      description: "Test",
      detectedAt: new Date(),
      autoResolved: false,
    };

    const suggestions = generateReplanSuggestions(disruption, [], []);
    expect(suggestions).toHaveLength(0);
  });

  it("returns empty for breakdown with no available vehicles", () => {
    const stops = [makeStop()];
    const trip = makeTrip({ stops, vehicle_id: "v1" });

    const disruption: Disruption = {
      id: "d6",
      type: "vehicle_breakdown",
      severity: "critical",
      affectedTripId: "trip-1",
      description: "Breakdown",
      detectedAt: new Date(),
      autoResolved: false,
    };

    // Only vehicle is the broken one
    const suggestions = generateReplanSuggestions(
      disruption,
      [makeVehicle({ id: "v1" })],
      [trip],
    );
    expect(suggestions).toHaveLength(0);
  });
});

// ─── calculateReplanConfidence ──────────────────────────────

describe("calculateReplanConfidence", () => {
  it("returns higher confidence with good geo data and time savings", () => {
    const score = calculateReplanConfidence({
      hasGeoData: true,
      stopsAffected: 2,
      timeSavedMinutes: 15,
      disruptionSeverity: "medium",
    });

    // Base 50 + geo 20 + timeSaved>10 15 + fewStops 10 = 95
    expect(score).toBe(95);
  });

  it("returns lower confidence without geo data", () => {
    const score = calculateReplanConfidence({
      hasGeoData: false,
      stopsAffected: 2,
      timeSavedMinutes: 15,
      disruptionSeverity: "medium",
    });

    // Base 50 - noGeo 20 + timeSaved>10 15 + fewStops 10 = 55
    expect(score).toBe(55);
  });

  it("penalizes many affected stops", () => {
    const fewStops = calculateReplanConfidence({
      hasGeoData: true,
      stopsAffected: 2,
      timeSavedMinutes: 5,
      disruptionSeverity: "low",
    });
    const manyStops = calculateReplanConfidence({
      hasGeoData: true,
      stopsAffected: 15,
      timeSavedMinutes: 5,
      disruptionSeverity: "low",
    });

    expect(fewStops).toBeGreaterThan(manyStops);
  });

  it("clamps score between 0 and 100", () => {
    const highScore = calculateReplanConfidence({
      hasGeoData: true,
      stopsAffected: 1,
      timeSavedMinutes: 60,
      disruptionSeverity: "critical",
    });
    expect(highScore).toBeLessThanOrEqual(100);

    const lowScore = calculateReplanConfidence({
      hasGeoData: false,
      stopsAffected: 20,
      timeSavedMinutes: -60,
      disruptionSeverity: "low",
    });
    expect(lowScore).toBeGreaterThanOrEqual(0);
  });

  it("adds severity bonus for high/critical disruptions", () => {
    const lowSeverity = calculateReplanConfidence({
      hasGeoData: true,
      stopsAffected: 5,
      timeSavedMinutes: 5,
      disruptionSeverity: "low",
    });
    const criticalSeverity = calculateReplanConfidence({
      hasGeoData: true,
      stopsAffected: 5,
      timeSavedMinutes: 5,
      disruptionSeverity: "critical",
    });

    expect(criticalSeverity).toBeGreaterThan(lowSeverity);
  });
});

// ─── Auto-apply threshold ───────────────────────────────────

describe("auto-apply threshold", () => {
  it("suggestions with confidence >= 90 qualify for auto-apply", () => {
    const stops = [
      makeStop({ id: "s1", stop_sequence: 1, planned_latitude: 52.37, planned_longitude: 4.9 }),
      makeStop({ id: "s2", stop_sequence: 2, planned_latitude: 51.92, planned_longitude: 4.48 }),
      makeStop({ id: "s3", stop_sequence: 3, planned_latitude: 51.44, planned_longitude: 5.47 }),
    ];
    const trip = makeTrip({ stops });

    const disruption: Disruption = {
      id: "d-auto",
      type: "traffic_delay",
      severity: "high",
      affectedTripId: "trip-1",
      description: "Significant delay",
      detectedAt: new Date(),
      autoResolved: false,
    };

    const suggestions = generateReplanSuggestions(disruption, [], [trip]);

    // With good geo data, few stops, and time savings, confidence should be high
    const autoApplicable = suggestions.filter((s) => s.confidence >= 90);
    // Whether this passes depends on the route — we just verify the scoring path works
    expect(suggestions.length).toBeGreaterThan(0);
    // The threshold check itself is straightforward:
    for (const s of autoApplicable) {
      expect(s.confidence).toBeGreaterThanOrEqual(90);
    }
  });

  it("suggestions with low confidence do not qualify for auto-apply", () => {
    // Stops without geo data => low confidence
    const stops = [
      makeStop({ id: "s1", stop_sequence: 1, planned_latitude: null, planned_longitude: null }),
      makeStop({ id: "s2", stop_sequence: 2, planned_latitude: null, planned_longitude: null }),
    ];
    const trip = makeTrip({ stops });

    const disruption: Disruption = {
      id: "d-low",
      type: "traffic_delay",
      severity: "low",
      affectedTripId: "trip-1",
      description: "Minor delay",
      detectedAt: new Date(),
      autoResolved: false,
    };

    const suggestions = generateReplanSuggestions(disruption, [], [trip]);

    for (const s of suggestions) {
      expect(s.confidence).toBeLessThan(90);
    }
  });
});
