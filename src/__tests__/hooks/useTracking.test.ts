import { describe, it, expect } from "vitest";
import {
  interpolatePosition,
  calculateHeading,
  haversineKm,
  distanceToRouteKm,
  calculateETAMinutes,
  detectAlerts,
} from "@/hooks/useTracking";
import type { TripTrackingStatus, VehiclePosition } from "@/types/tracking";

// ─── interpolatePosition ───────────────────────────────────────

describe("interpolatePosition", () => {
  it("returns start point at t=0", () => {
    const result = interpolatePosition(52.0, 4.0, 53.0, 5.0, 0);
    expect(result.lat).toBe(52.0);
    expect(result.lng).toBe(4.0);
  });

  it("returns end point at t=1", () => {
    const result = interpolatePosition(52.0, 4.0, 53.0, 5.0, 1);
    expect(result.lat).toBe(53.0);
    expect(result.lng).toBe(5.0);
  });

  it("returns midpoint at t=0.5", () => {
    const result = interpolatePosition(52.0, 4.0, 54.0, 6.0, 0.5);
    expect(result.lat).toBe(53.0);
    expect(result.lng).toBe(5.0);
  });

  it("clamps t values below 0", () => {
    const result = interpolatePosition(52.0, 4.0, 54.0, 6.0, -0.5);
    expect(result.lat).toBe(52.0);
    expect(result.lng).toBe(4.0);
  });

  it("clamps t values above 1", () => {
    const result = interpolatePosition(52.0, 4.0, 54.0, 6.0, 1.5);
    expect(result.lat).toBe(54.0);
    expect(result.lng).toBe(6.0);
  });
});

// ─── calculateHeading ──────────────────────────────────────────

describe("calculateHeading", () => {
  it("returns ~0 degrees for due north", () => {
    const heading = calculateHeading(52.0, 5.0, 53.0, 5.0);
    expect(heading).toBeCloseTo(0, 0);
  });

  it("returns ~90 degrees for due east", () => {
    const heading = calculateHeading(52.0, 5.0, 52.0, 6.0);
    expect(heading).toBeGreaterThan(80);
    expect(heading).toBeLessThan(100);
  });

  it("returns ~180 degrees for due south", () => {
    const heading = calculateHeading(53.0, 5.0, 52.0, 5.0);
    expect(heading).toBeCloseTo(180, 0);
  });

  it("returns a value between 0 and 360", () => {
    const heading = calculateHeading(52.0, 5.0, 51.0, 4.0);
    expect(heading).toBeGreaterThanOrEqual(0);
    expect(heading).toBeLessThan(360);
  });
});

// ─── haversineKm ───────────────────────────────────────────────

describe("haversineKm", () => {
  it("returns 0 for same point", () => {
    expect(haversineKm(52.0, 5.0, 52.0, 5.0)).toBe(0);
  });

  it("calculates Amsterdam to Rotterdam (~58 km)", () => {
    const dist = haversineKm(52.37, 4.9, 51.92, 4.48);
    expect(dist).toBeGreaterThan(50);
    expect(dist).toBeLessThan(70);
  });

  it("calculates short distance accurately", () => {
    // ~1 degree latitude is ~111 km
    const dist = haversineKm(52.0, 5.0, 53.0, 5.0);
    expect(dist).toBeGreaterThan(100);
    expect(dist).toBeLessThan(120);
  });
});

// ─── calculateETAMinutes ───────────────────────────────────────

describe("calculateETAMinutes", () => {
  it("returns correct ETA for simple case", () => {
    // 100 km at 60 km/h = 100 minutes
    expect(calculateETAMinutes(100, 60)).toBeCloseTo(100, 1);
  });

  it("returns 0 for 0 speed", () => {
    expect(calculateETAMinutes(50, 0)).toBe(0);
  });

  it("returns 0 for negative speed", () => {
    expect(calculateETAMinutes(50, -10)).toBe(0);
  });

  it("returns 0 for 0 distance", () => {
    expect(calculateETAMinutes(0, 60)).toBe(0);
  });

  it("handles realistic scenario (30 km at 50 km/h = 36 min)", () => {
    const eta = calculateETAMinutes(30, 50);
    expect(eta).toBeCloseTo(36, 1);
  });
});

describe("distanceToRouteKm", () => {
  it("returns 0 without route points", () => {
    expect(distanceToRouteKm(52.0, 5.0, [])).toBe(0);
  });

  it("returns shortest distance to route points", () => {
    const distance = distanceToRouteKm(52.37, 4.9, [
      { lat: 52.36, lng: 4.9 },
      { lat: 51.92, lng: 4.48 },
    ]);

    expect(distance).toBeGreaterThan(0);
    expect(distance).toBeLessThan(2);
  });
});

// ─── detectAlerts ──────────────────────────────────────────────

describe("detectAlerts", () => {
  const baseStatus: TripTrackingStatus = {
    tripId: "trip-1",
    tripLabel: "Rit #1001",
    vehicleId: "veh-1",
    driverName: "Test Driver",
    currentStopIndex: 2,
    totalStops: 5,
    status: "on_time",
    eta: "14:30",
    delayMinutes: 0,
    lastUpdate: new Date().toISOString(),
  };

  const livePosition: VehiclePosition = {
    vehicleId: "veh-1",
    lat: 52.37,
    lng: 4.9,
    heading: 0,
    speed: 50,
    timestamp: new Date().toISOString(),
    tripId: "trip-1",
    source: "real",
  };

  it("generates no alerts for on-time trips", () => {
    const alerts = detectAlerts([baseStatus], [livePosition], []);
    expect(alerts).toHaveLength(0);
  });

  it("generates delay alert when >15 min behind", () => {
    const delayed = { ...baseStatus, delayMinutes: 20, status: "delayed" as const };
    const alerts = detectAlerts([delayed], [livePosition], []);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe("delay");
    expect(alerts[0].severity).toBe("warning");
  });

  it("generates critical delay alert when >30 min behind", () => {
    const critical = { ...baseStatus, delayMinutes: 45, status: "critical" as const };
    const alerts = detectAlerts([critical], [livePosition], []);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe("delay");
    expect(alerts[0].severity).toBe("critical");
  });

  it("generates fallback GPS alert for simulated positions", () => {
    const alerts = detectAlerts(
      [baseStatus],
      [{ ...livePosition, source: "simulated" }],
      [],
    );

    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe("gps_missing");
    expect(alerts[0].severity).toBe("info");
  });

  it("generates stale GPS alert for old real positions", () => {
    const alerts = detectAlerts(
      [baseStatus],
      [
        {
          ...livePosition,
          timestamp: new Date(Date.now() - 12 * 60_000).toISOString(),
        },
      ],
      [],
    );

    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe("gps_stale");
    expect(alerts[0].severity).toBe("warning");
  });

  it("generates route deviation alert", () => {
    const alerts = detectAlerts(
      [baseStatus],
      [{ ...livePosition, deviationKm: 3.4 }],
      [],
    );

    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe("deviation");
    expect(alerts[0].severity).toBe("warning");
  });

  it("generates ETA window alert", () => {
    const alerts = detectAlerts(
      [{ ...baseStatus, etaWindowDeltaMinutes: 18 }],
      [livePosition],
      [],
    );

    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe("eta_window");
    expect(alerts[0].severity).toBe("warning");
  });

  it("generates idle alert when vehicle has not moved for >10 min", () => {
    const now = new Date();
    const fifteenMinAgo = new Date(now.getTime() - 15 * 60_000);

    const currentPos: VehiclePosition = {
      vehicleId: "veh-1",
      lat: 52.37,
      lng: 4.9,
      heading: 0,
      speed: 0,
      timestamp: now.toISOString(),
      tripId: "trip-1",
    };

    const prevPos: VehiclePosition = {
      vehicleId: "veh-1",
      lat: 52.37,
      lng: 4.9, // Same position
      heading: 0,
      speed: 0,
      timestamp: fifteenMinAgo.toISOString(),
      tripId: "trip-1",
    };

    const alerts = detectAlerts([], [currentPos], [prevPos]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe("idle");
    expect(alerts[0].severity).toBe("warning");
  });

  it("does not generate idle alert when vehicle has moved", () => {
    const now = new Date();
    const fifteenMinAgo = new Date(now.getTime() - 15 * 60_000);

    const currentPos: VehiclePosition = {
      vehicleId: "veh-1",
      lat: 52.50, // Moved significantly
      lng: 5.1,
      heading: 45,
      speed: 60,
      timestamp: now.toISOString(),
      tripId: "trip-1",
    };

    const prevPos: VehiclePosition = {
      vehicleId: "veh-1",
      lat: 52.37,
      lng: 4.9,
      heading: 0,
      speed: 60,
      timestamp: fifteenMinAgo.toISOString(),
      tripId: "trip-1",
    };

    const alerts = detectAlerts([], [currentPos], [prevPos]);
    expect(alerts).toHaveLength(0);
  });

  it("generates both delay and idle alerts simultaneously", () => {
    const now = new Date();
    const fifteenMinAgo = new Date(now.getTime() - 15 * 60_000);

    const delayed = { ...baseStatus, delayMinutes: 25, status: "delayed" as const };

    const currentPos: VehiclePosition = {
      vehicleId: "veh-1",
      lat: 52.37,
      lng: 4.9,
      heading: 0,
      speed: 0,
      timestamp: now.toISOString(),
      tripId: "trip-1",
    };

    const prevPos: VehiclePosition = {
      vehicleId: "veh-1",
      lat: 52.37,
      lng: 4.9,
      heading: 0,
      speed: 0,
      timestamp: fifteenMinAgo.toISOString(),
      tripId: "trip-1",
    };

    const alerts = detectAlerts([delayed], [currentPos], [prevPos]);
    expect(alerts).toHaveLength(2);
    const types = alerts.map((a) => a.type);
    expect(types).toContain("delay");
    expect(types).toContain("idle");
  });
});
