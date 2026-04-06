import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Trip, TripStop } from "@/types/dispatch";
import type {
  VehiclePosition,
  TripTrackingStatus,
  TrackingAlert,
  TrackingAlertSeverity,
} from "@/types/tracking";

// ─── Helpers (exported for testing) ────────────────────────────

/**
 * Interpolate a position between two geo-coordinates.
 * `t` ranges from 0 (start) to 1 (end).
 */
export function interpolatePosition(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
  t: number,
): { lat: number; lng: number } {
  const clamped = Math.max(0, Math.min(1, t));
  return {
    lat: lat1 + (lat2 - lat1) * clamped,
    lng: lng1 + (lng2 - lng1) * clamped,
  };
}

/**
 * Calculate heading (bearing) in degrees from point A to point B.
 */
export function calculateHeading(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  const bearing = toDeg(Math.atan2(y, x));
  return (bearing + 360) % 360;
}

/**
 * Haversine distance in km.
 */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Calculate ETA in minutes based on remaining distance and average speed.
 * Returns 0 if speed is 0 or negative.
 */
export function calculateETAMinutes(
  remainingDistanceKm: number,
  avgSpeedKmh: number,
): number {
  if (avgSpeedKmh <= 0) return 0;
  return (remainingDistanceKm / avgSpeedKmh) * 60;
}

/**
 * Detect alerts from trip tracking statuses.
 */
export function detectAlerts(
  statuses: TripTrackingStatus[],
  positions: VehiclePosition[],
  previousPositions: VehiclePosition[],
): TrackingAlert[] {
  const alerts: TrackingAlert[] = [];
  const now = new Date();

  for (const status of statuses) {
    // Delay alert: >15 min behind schedule
    if (status.delayMinutes > 15) {
      const severity: TrackingAlertSeverity =
        status.delayMinutes > 30 ? "critical" : "warning";
      alerts.push({
        id: `delay-${status.tripId}`,
        type: "delay",
        tripId: status.tripId,
        message: `Rit ${status.tripId.slice(0, 8)} heeft ${status.delayMinutes} minuten vertraging`,
        severity,
        timestamp: now.toISOString(),
      });
    }
  }

  // Idle detection: no movement for >10 min
  for (const pos of positions) {
    const prev = previousPositions.find((p) => p.vehicleId === pos.vehicleId);
    if (prev) {
      const timeDiffMs =
        new Date(pos.timestamp).getTime() - new Date(prev.timestamp).getTime();
      const timeDiffMin = timeDiffMs / 60_000;
      const distKm = haversineKm(prev.lat, prev.lng, pos.lat, pos.lng);
      // Less than 50m movement in >10 min = idle
      if (distKm < 0.05 && timeDiffMin > 10) {
        alerts.push({
          id: `idle-${pos.vehicleId}`,
          type: "idle",
          tripId: pos.tripId,
          message: `Voertuig ${pos.vehicleId.slice(0, 8)} staat al ${Math.round(timeDiffMin)} minuten stil`,
          severity: "warning",
          timestamp: now.toISOString(),
        });
      }
    }
  }

  return alerts;
}

// ─── Simulated vehicle positions along route ───────────────────

function getStopsWithCoords(trip: Trip): TripStop[] {
  const stops = ((trip as any).trip_stops || []) as TripStop[];
  return stops
    .filter((s) => s.planned_latitude != null && s.planned_longitude != null)
    .sort((a, b) => a.stop_sequence - b.stop_sequence);
}

function simulatePositionForTrip(trip: Trip): VehiclePosition | null {
  const stops = getStopsWithCoords(trip);
  if (stops.length < 2) return null;

  // Calculate how far along the trip we should be based on time
  const startTime = trip.actual_start_time || trip.planned_start_time;
  if (!startTime) return null;

  const now = Date.now();
  const start = new Date(startTime).getTime();
  const elapsed = now - start;

  // Estimate total trip time: 30 min per stop
  const totalTripMinutes = stops.length * 30;
  const totalTripMs = totalTripMinutes * 60_000;

  // Progress fraction [0, 1]
  const progress = Math.min(1, Math.max(0, elapsed / totalTripMs));

  // Map progress to segments between stops
  const segmentCount = stops.length - 1;
  const segmentProgress = progress * segmentCount;
  const segmentIndex = Math.min(
    Math.floor(segmentProgress),
    segmentCount - 1,
  );
  const t = segmentProgress - segmentIndex;

  const from = stops[segmentIndex];
  const to = stops[Math.min(segmentIndex + 1, stops.length - 1)];

  const pos = interpolatePosition(
    from.planned_latitude!,
    from.planned_longitude!,
    to.planned_latitude!,
    to.planned_longitude!,
    t,
  );

  const heading = calculateHeading(
    from.planned_latitude!,
    from.planned_longitude!,
    to.planned_latitude!,
    to.planned_longitude!,
  );

  // Simulate speed: 40-80 km/h
  const speed = 40 + Math.random() * 40;

  return {
    vehicleId: trip.vehicle_id,
    lat: pos.lat,
    lng: pos.lng,
    heading,
    speed,
    timestamp: new Date().toISOString(),
    tripId: trip.id,
  };
}

// ─── Real vehicle positions from Supabase ─────────────────────

/**
 * Fetch the latest real GPS position per trip from the `vehicle_positions` table.
 * Returns a map of tripId -> VehiclePosition.
 * Polls every 15s.
 */
export function useRealVehiclePositions(tripIds: string[]) {
  return useQuery({
    queryKey: ["real-vehicle-positions", tripIds.join(",")],
    staleTime: 10_000,
    refetchInterval: 15_000,
    enabled: tripIds.length > 0,
    queryFn: async () => {
      // Fetch the latest position for each trip using a single query
      // ordered by recorded_at DESC, then deduplicate client-side
      const { data, error } = await supabase
        .from("vehicle_positions" as any)
        .select("*")
        .in("trip_id", tripIds)
        .order("recorded_at", { ascending: false })
        .limit(tripIds.length * 5); // buffer for multiple entries

      if (error) throw error;

      // Deduplicate: keep only the latest position per trip_id
      const posMap = new Map<string, VehiclePosition>();
      for (const row of data || []) {
        const tripId = row.trip_id as string;
        if (!posMap.has(tripId)) {
          posMap.set(tripId, {
            vehicleId: (row.vehicle_id as string) || "",
            lat: Number(row.lat),
            lng: Number(row.lng),
            heading: Number(row.heading) || 0,
            speed: Number(row.speed) || 0,
            timestamp: row.recorded_at as string,
            tripId,
          });
        }
      }

      return posMap;
    },
  });
}

// ─── Hooks ─────────────────────────────────────────────────────

/**
 * Fetch all active trips (IN_TRANSIT-like statuses: VERZONDEN, ACTIEF, GEACCEPTEERD).
 * Polls every 30s.
 */
export function useActiveTrips() {
  return useQuery({
    queryKey: ["active-tracking-trips"],
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trips")
        .select("*, trip_stops(*, proof_of_delivery(*))")
        .in("dispatch_status", ["VERZONDEN", "GEACCEPTEERD", "ACTIEF"])
        .order("planned_start_time", { ascending: true });
      if (error) throw error;
      return (data || []) as Trip[];
    },
  });
}

/**
 * Vehicle positions for active trips.
 * Prefers real GPS positions from `vehicle_positions` when available,
 * falls back to simulated positions for trips without real data.
 * Polls every 15s.
 */
export function useVehiclePositions(trips: Trip[]) {
  const tripIds = trips.map((t) => t.id);
  const { data: realPositions } = useRealVehiclePositions(tripIds);

  return useQuery({
    queryKey: [
      "vehicle-positions",
      tripIds.join(","),
      realPositions ? Array.from(realPositions.keys()).join(",") : "",
    ],
    staleTime: 10_000,
    refetchInterval: 15_000,
    enabled: trips.length > 0,
    queryFn: () => {
      const positions: VehiclePosition[] = [];
      for (const trip of trips) {
        // Prefer real position when available
        const realPos = realPositions?.get(trip.id);
        if (realPos) {
          positions.push(realPos);
        } else {
          // Fall back to simulated position
          const simPos = simulatePositionForTrip(trip);
          if (simPos) positions.push(simPos);
        }
      }
      return positions;
    },
  });
}

/**
 * Build TripTrackingStatus for each active trip.
 */
export function useTripTrackingStatuses(
  trips: Trip[],
  driverMap: Map<string, string>,
): TripTrackingStatus[] {
  return useMemo(() => {
    return trips.map((trip) => {
      const stops = ((trip as any).trip_stops || []) as TripStop[];
      const sortedStops = [...stops].sort(
        (a, b) => a.stop_sequence - b.stop_sequence,
      );
      const completedStops = sortedStops.filter(
        (s) =>
          s.stop_status === "AFGELEVERD" ||
          s.stop_status === "MISLUKT" ||
          s.stop_status === "OVERGESLAGEN",
      );
      const currentStopIndex = completedStops.length;
      const totalStops = sortedStops.length;

      // Calculate delay: compare actual progress with planned time
      let delayMinutes = 0;
      if (currentStopIndex < totalStops) {
        const currentStop = sortedStops[currentStopIndex];
        if (currentStop?.planned_time) {
          const plannedTime = new Date(currentStop.planned_time).getTime();
          const now = Date.now();
          const diffMin = (now - plannedTime) / 60_000;
          delayMinutes = Math.max(0, Math.round(diffMin));
        }
      }

      // Determine status
      let status: TripTrackingStatus["status"] = "on_time";
      if (delayMinutes > 30) status = "critical";
      else if (delayMinutes > 15) status = "delayed";

      // Calculate ETA for last stop
      let eta = "";
      const remainingStops = totalStops - currentStopIndex;
      if (remainingStops > 0) {
        const etaMinutes = remainingStops * 25; // ~25 min per remaining stop
        const etaDate = new Date(Date.now() + etaMinutes * 60_000);
        eta = etaDate.toLocaleTimeString("nl-NL", {
          hour: "2-digit",
          minute: "2-digit",
        });
      }

      return {
        tripId: trip.id,
        vehicleId: trip.vehicle_id,
        driverName: driverMap.get(trip.driver_id || "") || "Onbekend",
        currentStopIndex,
        totalStops,
        status,
        eta,
        delayMinutes,
        lastUpdate: new Date().toISOString(),
      };
    });
  }, [trips, driverMap]);
}

/**
 * Calculate ETA for a specific trip based on remaining stops and average speed.
 */
export function useTripETA(
  trip: Trip | null,
  position: VehiclePosition | null,
): { etaMinutes: number; etaTime: string } {
  return useMemo(() => {
    if (!trip || !position) return { etaMinutes: 0, etaTime: "--:--" };

    const stops = getStopsWithCoords(trip);
    const completedCount = ((trip as any).trip_stops || []).filter(
      (s: TripStop) =>
        s.stop_status === "AFGELEVERD" ||
        s.stop_status === "MISLUKT" ||
        s.stop_status === "OVERGESLAGEN",
    ).length;

    // Sum remaining distances
    let totalRemainingKm = 0;
    const remainingStops = stops.filter(
      (s) => s.stop_sequence > completedCount,
    );
    if (remainingStops.length > 0) {
      // Distance from current position to next stop
      totalRemainingKm += haversineKm(
        position.lat,
        position.lng,
        remainingStops[0].planned_latitude!,
        remainingStops[0].planned_longitude!,
      );
      // Distance between remaining stops
      for (let i = 0; i < remainingStops.length - 1; i++) {
        totalRemainingKm += haversineKm(
          remainingStops[i].planned_latitude!,
          remainingStops[i].planned_longitude!,
          remainingStops[i + 1].planned_latitude!,
          remainingStops[i + 1].planned_longitude!,
        );
      }
    }

    // Add ~5 min per stop for loading/unloading
    const stopTimeMinutes = remainingStops.length * 5;
    const avgSpeed = position.speed > 0 ? position.speed : 50;
    const driveMinutes = calculateETAMinutes(totalRemainingKm, avgSpeed);
    const totalMinutes = Math.round(driveMinutes + stopTimeMinutes);

    const etaDate = new Date(Date.now() + totalMinutes * 60_000);
    const etaTime = etaDate.toLocaleTimeString("nl-NL", {
      hour: "2-digit",
      minute: "2-digit",
    });

    return { etaMinutes: totalMinutes, etaTime };
  }, [trip, position]);
}

/**
 * Generate tracking alerts from current trip statuses and positions.
 */
export function useTrackingAlerts(
  statuses: TripTrackingStatus[],
  positions: VehiclePosition[],
  previousPositions: VehiclePosition[],
): TrackingAlert[] {
  return useMemo(
    () => detectAlerts(statuses, positions, previousPositions),
    [statuses, positions, previousPositions],
  );
}
