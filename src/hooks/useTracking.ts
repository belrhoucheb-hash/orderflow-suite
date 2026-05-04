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
import { parseRouteStops } from "@/lib/routeStops";
import { resolveCoordinates } from "@/data/geoData";

const VEHICLE_POSITION_COLUMNS =
  "id, trip_id, vehicle_id, driver_id, lat, lng, heading, speed, accuracy, recorded_at";

const ACTIVE_TRIP_COLUMNS =
  "id, tenant_id, trip_number, vehicle_id, driver_id, dispatch_status, planned_date, planned_start_time, actual_start_time, actual_end_time, total_distance_km, total_duration_min, dispatcher_id, dispatched_at, received_at, accepted_at, started_at, completed_at, notes, created_at, updated_at, trip_stops(id, trip_id, order_id, stop_type, stop_sequence, stop_status, planned_address, planned_time, actual_arrival_time, actual_departure_time, contact_name, contact_phone, instructions, failure_reason, notes, created_at, updated_at, predicted_eta, predicted_eta_updated_at, proof_of_delivery(id, trip_stop_id, order_id, pod_status, recipient_name, received_at, validated_at, rejection_reason))";

const TRACKING_ORDER_COLUMNS =
  "id, tenant_id, order_number, vehicle_id, driver_id, status, created_at, updated_at, time_window_start, pickup_address, delivery_address, geocoded_pickup_lat, geocoded_pickup_lng, geocoded_delivery_lat, geocoded_delivery_lng, notification_preferences";

export interface TrackingOrderContext {
  id: string;
  order_number: number | null;
  client_name: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  recipient_phone: string | null;
  notification_preferences: unknown;
  time_window_start: string | null;
  time_window_end: string | null;
  pickup_time_window_start: string | null;
  pickup_time_window_end: string | null;
  delivery_time_window_start: string | null;
  delivery_time_window_end: string | null;
}

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

export function distanceToRouteKm(
  lat: number,
  lng: number,
  routePoints: Array<{ lat: number; lng: number }>,
): number {
  if (routePoints.length === 0) return 0;

  let minDistance = Number.POSITIVE_INFINITY;
  for (const point of routePoints) {
    minDistance = Math.min(minDistance, haversineKm(lat, lng, point.lat, point.lng));
  }
  return Number.isFinite(minDistance) ? minDistance : 0;
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
    const position = positions.find((pos) => pos.tripId === status.tripId);

    if (!position) {
      alerts.push({
        id: `gps-missing-${status.tripId}`,
        type: "gps_missing",
        tripId: status.tripId,
        message: `${status.tripLabel} heeft geen GPS-positie`,
        severity: "warning",
        timestamp: now.toISOString(),
      });
    } else {
      if (position.source === "simulated") {
        alerts.push({
          id: `gps-fallback-${status.tripId}`,
          type: "gps_missing",
          tripId: status.tripId,
          message: `${status.tripLabel} gebruikt fallbackpositie - controleer voertuigtracking`,
          severity: "info",
          timestamp: now.toISOString(),
        });
      }

      const ageMinutes =
        (now.getTime() - new Date(position.timestamp).getTime()) / 60_000;
      if (position.source === "real" && ageMinutes > 10) {
        alerts.push({
          id: `gps-stale-${status.tripId}`,
          type: "gps_stale",
          tripId: status.tripId,
          message: `${status.tripLabel} GPS is ${Math.round(ageMinutes)} minuten oud`,
          severity: ageMinutes > 20 ? "critical" : "warning",
          timestamp: now.toISOString(),
        });
      }

      if ((position.deviationKm ?? 0) > 2) {
        alerts.push({
          id: `deviation-${status.tripId}`,
          type: "deviation",
          tripId: status.tripId,
          message: `${status.tripLabel} wijkt ${position.deviationKm?.toFixed(1)} km af van de route`,
          severity: (position.deviationKm ?? 0) > 5 ? "critical" : "warning",
          timestamp: now.toISOString(),
        });
      }
    }

    // Delay alert: >15 min behind schedule
    if (status.delayMinutes > 15) {
      const severity: TrackingAlertSeverity =
        status.delayMinutes > 30 ? "critical" : "warning";
      alerts.push({
        id: `delay-${status.tripId}`,
        type: "delay",
        tripId: status.tripId,
        message: `${status.tripLabel} heeft ${status.delayMinutes} minuten vertraging`,
        severity,
        timestamp: now.toISOString(),
      });
    }

    if (status.etaWindowDeltaMinutes && status.etaWindowDeltaMinutes > 0) {
      alerts.push({
        id: `eta-window-${status.tripId}`,
        type: "eta_window",
        tripId: status.tripId,
        message: `${status.tripLabel} ETA valt ${status.etaWindowDeltaMinutes} minuten buiten tijdvenster`,
        severity: status.etaWindowDeltaMinutes > 20 ? "critical" : "warning",
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

  // If we have no stops with coordinates, try to use a single stop or default
  if (stops.length === 0) {
    // Last resort: place the marker at a default Netherlands position
    return {
      vehicleId: trip.vehicle_id,
      lat: 52.0 + Math.random() * 0.4,
      lng: 4.8 + Math.random() * 0.6,
      heading: 0,
      speed: 0,
      timestamp: new Date().toISOString(),
      tripId: trip.id,
      source: "simulated",
    };
  }

  if (stops.length < 2) {
    // Only one stop with coordinates — place the marker there
    return {
      vehicleId: trip.vehicle_id,
      lat: stops[0].planned_latitude!,
      lng: stops[0].planned_longitude!,
      heading: 0,
      speed: 0,
      timestamp: new Date().toISOString(),
      tripId: trip.id,
      source: "simulated",
    };
  }

  // Calculate how far along the trip we should be based on time
  const startTime = trip.actual_start_time || trip.planned_start_time;
  if (!startTime) {
    // No start time — place the marker at the first stop
    return {
      vehicleId: trip.vehicle_id,
      lat: stops[0].planned_latitude!,
      lng: stops[0].planned_longitude!,
      heading: 0,
      speed: 0,
      timestamp: new Date().toISOString(),
      tripId: trip.id,
      source: "simulated",
    };
  }

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
    source: "simulated",
  };
}

// ─── Real vehicle positions from Supabase ─────────────────────

/**
 * Fetch the latest real GPS position per trip from the `vehicle_positions` table.
 * Returns a map of tripId -> VehiclePosition.
 * When positions lack trip_id, falls back to matching by vehicle_id.
 * Polls every 15s.
 */
export function useRealVehiclePositions(
  tripIds: string[],
  vehicleToTripMap?: Map<string, string>,
) {
  const vehicleIds = vehicleToTripMap
    ? Array.from(vehicleToTripMap.keys())
    : [];
  return useQuery({
    queryKey: [
      "real-vehicle-positions",
      tripIds.join(","),
      vehicleIds.join(","),
    ],
    staleTime: 10_000,
    refetchInterval: 15_000,
    enabled: tripIds.length > 0,
    queryFn: async () => {
      const posMap = new Map<string, VehiclePosition>();

      // 1. Try fetching by trip_id first
      const { data: tripData } = await supabase
        .from("vehicle_positions" as any)
        .select(VEHICLE_POSITION_COLUMNS)
        .in("trip_id", tripIds)
        .order("recorded_at", { ascending: false })
        .limit(tripIds.length * 5);

      for (const row of tripData || []) {
        const tripId = row.trip_id as string;
        if (tripId && !posMap.has(tripId)) {
          posMap.set(tripId, {
            vehicleId: (row.vehicle_id as string) || "",
            driverId: (row.driver_id as string | null) ?? null,
            lat: Number(row.lat),
            lng: Number(row.lng),
            heading: Number(row.heading) || 0,
            speed: Number(row.speed) || 0,
            accuracy: row.accuracy == null ? null : Number(row.accuracy),
            timestamp: row.recorded_at as string,
            tripId,
            source: "real",
          });
        }
      }

      // 2. Fallback: fetch by vehicle_id for trips that have no position yet
      if (vehicleToTripMap && vehicleToTripMap.size > 0) {
        const missingVehicleIds = vehicleIds.filter((vid) => {
          const tid = vehicleToTripMap.get(vid);
          return tid && !posMap.has(tid);
        });

        if (missingVehicleIds.length > 0) {
          const { data: vehData } = await supabase
            .from("vehicle_positions" as any)
            .select(VEHICLE_POSITION_COLUMNS)
            .in("vehicle_id", missingVehicleIds)
            .order("recorded_at", { ascending: false })
            .limit(missingVehicleIds.length * 5);

          for (const row of vehData || []) {
            const vehicleId = row.vehicle_id as string;
            const tripId = vehicleToTripMap.get(vehicleId);
            if (tripId && !posMap.has(tripId)) {
              posMap.set(tripId, {
                vehicleId,
                driverId: (row.driver_id as string | null) ?? null,
                lat: Number(row.lat),
                lng: Number(row.lng),
                heading: Number(row.heading) || 0,
                speed: Number(row.speed) || 0,
                accuracy: row.accuracy == null ? null : Number(row.accuracy),
                timestamp: row.recorded_at as string,
                tripId,
                source: "real",
              });
            }
          }
        }
      }

      return posMap;
    },
  });
}

// ─── Hooks ─────────────────────────────────────────────────────

/**
 * Fetch all active trips (IN_TRANSIT-like statuses: VERZONDEN, ACTIEF, GEACCEPTEERD).
 * Falls back to orders with IN_TRANSIT status when no trips exist.
 * Polls every 30s.
 */
export function useActiveTrips() {
  return useQuery({
    queryKey: ["active-tracking-trips"],
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      // 1. Try trips table first (dispatch workflow)
      const { data: tripData, error: tripError } = await supabase
        .from("trips")
        .select(ACTIVE_TRIP_COLUMNS)
        .in("dispatch_status", ["VERZONDEN", "GEACCEPTEERD", "ACTIEF"])
        .order("planned_start_time", { ascending: true });

      if (!tripError && tripData && tripData.length > 0) {
        return tripData as Trip[];
      }

      // 2. Fallback: query orders with IN_TRANSIT status that have a vehicle assigned
      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .select(TRACKING_ORDER_COLUMNS)
        .eq("status", "IN_TRANSIT")
        .order("created_at", { ascending: true });

      if (orderError) throw orderError;

      // Map orders to Trip-like objects so the rest of the tracking pipeline works
      return ((orderData || []) as any[])
        .filter((o) => o.vehicle_id)
        .map((o) => ({
          id: o.id,
          tenant_id: o.tenant_id,
          trip_number: o.order_number ?? 0,
          vehicle_id: o.vehicle_id,
          driver_id: o.driver_id ?? null,
          dispatch_status: "ACTIEF" as const,
          planned_date: o.created_at?.split("T")[0] ?? "",
          planned_start_time: o.time_window_start ?? null,
          actual_start_time: o.created_at ?? null,
          actual_end_time: null,
          total_distance_km: null,
          total_duration_min: null,
          dispatcher_id: null,
          dispatched_at: null,
          received_at: null,
          accepted_at: null,
          started_at: o.created_at ?? null,
          completed_at: null,
          notes: null,
          created_at: o.created_at,
          updated_at: o.updated_at,
          // Synthesize trip_stops from order pickup/intermediate/delivery for route display
          trip_stops: (() => {
            let seq = 1;
            const stops: TripStop[] = [];

            if (o.pickup_address) {
              stops.push({
                id: `${o.id}-pickup`,
                trip_id: o.id,
                order_id: o.id,
                stop_type: "PICKUP",
                stop_sequence: seq++,
                stop_status: "AFGELEVERD",
                planned_address: o.pickup_address,
                planned_latitude: o.pickup_lat ?? o.geocoded_pickup_lat ?? null,
                planned_longitude: o.pickup_lng ?? o.geocoded_pickup_lng ?? null,
                planned_time: null,
                actual_arrival_time: null,
                actual_departure_time: null,
                contact_name: null,
                contact_phone: null,
                instructions: null,
                failure_reason: null,
                notes: null,
                created_at: o.created_at,
                updated_at: o.updated_at,
              });
            }

            for (const stop of parseRouteStops(o.notification_preferences)) {
              const coords = resolveCoordinates(stop.address);
              stops.push({
                id: `${o.id}-${stop.id}`,
                trip_id: o.id,
                order_id: o.id,
                stop_type: "INTERMEDIATE",
                stop_sequence: seq++,
                stop_status: "GEPLAND",
                planned_address: stop.address,
                planned_latitude: coords.lat ?? null,
                planned_longitude: coords.lng ?? null,
                planned_time: null,
                actual_arrival_time: null,
                actual_departure_time: null,
                contact_name: null,
                contact_phone: null,
                instructions: null,
                failure_reason: null,
                notes: null,
                created_at: o.created_at,
                updated_at: o.updated_at,
              });
            }

            if (o.delivery_address) {
              stops.push({
                id: `${o.id}-delivery`,
                trip_id: o.id,
                order_id: o.id,
                stop_type: "DELIVERY",
                stop_sequence: seq++,
                stop_status: "GEPLAND",
                planned_address: o.delivery_address,
                planned_latitude: o.delivery_lat ?? o.geocoded_delivery_lat ?? null,
                planned_longitude: o.delivery_lng ?? o.geocoded_delivery_lng ?? null,
                planned_time: null,
                actual_arrival_time: null,
                actual_departure_time: null,
                contact_name: null,
                contact_phone: null,
                instructions: null,
                failure_reason: null,
                notes: null,
                created_at: o.created_at,
                updated_at: o.updated_at,
              });
            }

            return stops;
          })(),
        })) as Trip[];
    },
  });
}

export function useTrackingOrderContext(orderId: string | null) {
  return useQuery({
    queryKey: ["tracking-order-context", orderId],
    staleTime: 30_000,
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, order_number, client_name, recipient_name, recipient_email, recipient_phone, notification_preferences, time_window_start, time_window_end, pickup_time_window_start, pickup_time_window_end, delivery_time_window_start, delivery_time_window_end",
        )
        .eq("id", orderId!)
        .maybeSingle();

      if (error) throw error;
      return (data ?? null) as TrackingOrderContext | null;
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
  // Build a vehicle_id -> trip_id map so we can match positions by vehicle
  const vehicleToTripMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of trips) {
      if (t.vehicle_id) m.set(t.vehicle_id, t.id);
    }
    return m;
  }, [trips]);
  const { data: realPositions } = useRealVehiclePositions(
    tripIds,
    vehicleToTripMap,
  );

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
          const routePoints = getStopsWithCoords(trip).map((stop) => ({
            lat: stop.planned_latitude!,
            lng: stop.planned_longitude!,
          }));
          positions.push({
            ...realPos,
            deviationKm: distanceToRouteKm(realPos.lat, realPos.lng, routePoints),
          });
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
      const currentStop =
        currentStopIndex < totalStops ? sortedStops[currentStopIndex] : null;
      if (currentStop?.planned_time) {
        const plannedTime = new Date(currentStop.planned_time).getTime();
        if (Number.isFinite(plannedTime)) {
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
      let etaWindowDeltaMinutes = 0;
      const remainingStops = totalStops - currentStopIndex;
      if (remainingStops > 0) {
        const etaMinutes = remainingStops * 25; // ~25 min per remaining stop
        const etaDate = new Date(Date.now() + etaMinutes * 60_000);
        eta = etaDate.toLocaleTimeString("nl-NL", {
          hour: "2-digit",
          minute: "2-digit",
        });
        if (currentStop?.planned_time) {
          const plannedArrival = new Date(currentStop.planned_time).getTime();
          if (Number.isFinite(plannedArrival)) {
            etaWindowDeltaMinutes = Math.max(
              0,
              Math.round((etaDate.getTime() - plannedArrival) / 60_000),
            );
          }
        }
      }

      const tripNumber = (trip as any).trip_number ?? (trip as any).order_number;
      const tripLabel = tripNumber
        ? `Rit #${tripNumber}`
        : `Rit ${trip.id.slice(0, 8)}`;

      return {
        tripId: trip.id,
        tripLabel,
        vehicleId: trip.vehicle_id,
        driverName: driverMap.get(trip.driver_id || "") || "Onbekend",
        currentStopIndex,
        totalStops,
        status,
        eta,
        delayMinutes,
        etaWindowDeltaMinutes,
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
