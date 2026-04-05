import { describe, it, expect } from "vitest";
import {
  detectStationaryAnomaly,
  detectLateArrival,
  calculateEtaMinutes,
} from "@/lib/anomalyDetector";
import type { DriverPosition } from "@/types/dispatch-autonomy";

describe("detectStationaryAnomaly", () => {
  const baseTime = new Date("2026-04-05T10:00:00Z");

  it("returns true when driver has not moved >100m in threshold minutes", () => {
    const positions: DriverPosition[] = [
      { latitude: 52.37, longitude: 4.9, recorded_at: new Date(baseTime.getTime() - 25 * 60000).toISOString() },
      { latitude: 52.37, longitude: 4.9, recorded_at: new Date(baseTime.getTime() - 20 * 60000).toISOString() },
      { latitude: 52.37, longitude: 4.9, recorded_at: new Date(baseTime.getTime() - 10 * 60000).toISOString() },
      { latitude: 52.37, longitude: 4.9, recorded_at: baseTime.toISOString() },
    ];
    const current = positions[positions.length - 1];
    expect(detectStationaryAnomaly(current, positions, 20)).toBe(true);
  });

  it("returns false when driver has moved significantly", () => {
    const positions: DriverPosition[] = [
      { latitude: 52.37, longitude: 4.9, recorded_at: new Date(baseTime.getTime() - 25 * 60000).toISOString() },
      { latitude: 52.38, longitude: 4.91, recorded_at: new Date(baseTime.getTime() - 15 * 60000).toISOString() },
      { latitude: 52.40, longitude: 4.92, recorded_at: new Date(baseTime.getTime() - 5 * 60000).toISOString() },
      { latitude: 52.42, longitude: 4.95, recorded_at: baseTime.toISOString() },
    ];
    const current = positions[positions.length - 1];
    expect(detectStationaryAnomaly(current, positions, 20)).toBe(false);
  });

  it("returns false when not enough history for threshold window", () => {
    const positions: DriverPosition[] = [
      { latitude: 52.37, longitude: 4.9, recorded_at: new Date(baseTime.getTime() - 5 * 60000).toISOString() },
      { latitude: 52.37, longitude: 4.9, recorded_at: baseTime.toISOString() },
    ];
    const current = positions[positions.length - 1];
    // Only 5 min of history but threshold is 20 min
    expect(detectStationaryAnomaly(current, positions, 20)).toBe(false);
  });

  it("returns false with empty history", () => {
    const current: DriverPosition = { latitude: 52.37, longitude: 4.9, recorded_at: baseTime.toISOString() };
    expect(detectStationaryAnomaly(current, [], 20)).toBe(false);
  });
});

describe("calculateEtaMinutes", () => {
  it("estimates travel time based on haversine distance at 60 km/h", () => {
    // Amsterdam to Rotterdam ~58 km -> ~58 minutes at 60 km/h
    const eta = calculateEtaMinutes(
      { lat: 52.37, lng: 4.9 },   // Amsterdam
      { lat: 51.92, lng: 4.48 },  // Rotterdam
    );
    // Should be roughly 55-65 minutes
    expect(eta).toBeGreaterThan(50);
    expect(eta).toBeLessThan(70);
  });

  it("returns 0 for same location", () => {
    const eta = calculateEtaMinutes(
      { lat: 52.37, lng: 4.9 },
      { lat: 52.37, lng: 4.9 },
    );
    expect(eta).toBe(0);
  });
});

describe("detectLateArrival", () => {
  it("flags stops where ETA exceeds window_end + threshold", () => {
    const now = new Date("2026-04-05T10:00:00Z");
    const currentPosition = { lat: 52.37, lng: 4.9 }; // Amsterdam

    const remainingStops = [
      {
        id: "stop-1",
        stop_sequence: 1,
        planned_latitude: 51.92,   // Rotterdam
        planned_longitude: 4.48,
        planned_window_end: "10:30", // 30 min from now, but ~58 min travel
        stop_status: "GEPLAND",
      },
      {
        id: "stop-2",
        stop_sequence: 2,
        planned_latitude: 52.09,   // Utrecht (~30 min from Rdam)
        planned_longitude: 5.12,
        planned_window_end: "14:00", // plenty of time
        stop_status: "GEPLAND",
      },
    ];

    const lateStops = detectLateArrival(
      currentPosition,
      remainingStops as any,
      now,
      15, // 15 min threshold
    );

    // Stop 1 should be flagged (ETA ~58 min, window_end 10:30 = 30 min, +15 threshold = 45 min < 58 min)
    expect(lateStops.length).toBeGreaterThanOrEqual(1);
    expect(lateStops[0].stop_id).toBe("stop-1");
    expect(lateStops[0].delay_minutes).toBeGreaterThan(0);
  });

  it("returns empty when all stops are reachable in time", () => {
    const now = new Date("2026-04-05T06:00:00Z");
    const currentPosition = { lat: 52.37, lng: 4.9 }; // Amsterdam

    const remainingStops = [
      {
        id: "stop-1",
        stop_sequence: 1,
        planned_latitude: 52.38,
        planned_longitude: 4.91,
        planned_window_end: "18:00", // way in the future
        stop_status: "GEPLAND",
      },
    ];

    const lateStops = detectLateArrival(currentPosition, remainingStops as any, now, 15);
    expect(lateStops).toHaveLength(0);
  });
});
