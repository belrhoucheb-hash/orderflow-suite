// ─── Plan E: Anomaly Detector ──────────────────────────────
// Detects execution anomalies during trip delivery.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DriverPosition,
  ExecutionAnomaly,
  LateStop,
  AnomalyType,
} from "@/types/dispatch-autonomy";
import { type GeoCoord, haversineKm } from "@/data/geoData";

/** Average speed assumption for ETA calculations (km/h) */
const AVG_SPEED_KMH = 60;

/** Minimum distance (meters) to consider the driver as having "moved" */
const MOVEMENT_THRESHOLD_M = 100;

// ─── Haversine in meters ───────────────────────────────────
function haversineMeters(a: GeoCoord, b: GeoCoord): number {
  return haversineKm(a, b) * 1000;
}

// ─── Parse "HH:mm" to minutes since midnight ──────────────
function parseTimeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Calculate estimated travel time in minutes from point A to B
 * using haversine distance and average speed.
 */
export function calculateEtaMinutes(from: GeoCoord, to: GeoCoord): number {
  const distKm = haversineKm(from, to);
  return (distKm / AVG_SPEED_KMH) * 60;
}

/**
 * Detect if driver has been stationary (< 100m movement) for
 * at least `thresholdMin` minutes.
 *
 * Requires position history spanning at least `thresholdMin` minutes.
 */
export function detectStationaryAnomaly(
  currentPosition: DriverPosition,
  previousPositions: DriverPosition[],
  thresholdMin: number,
): boolean {
  if (previousPositions.length === 0) return false;

  const currentTime = new Date(currentPosition.recorded_at).getTime();
  const thresholdMs = thresholdMin * 60 * 1000;

  // Find the oldest position within our threshold window
  const windowStart = currentTime - thresholdMs;

  // Filter positions within the threshold window
  const positionsInWindow = previousPositions.filter((p) => {
    const t = new Date(p.recorded_at).getTime();
    return t >= windowStart && t <= currentTime;
  });

  // We need at least one position from at or before the window start
  // to confirm we have enough history
  const oldestInWindow = positionsInWindow.reduce(
    (oldest, p) => {
      const t = new Date(p.recorded_at).getTime();
      return t < oldest ? t : oldest;
    },
    currentTime,
  );

  // If oldest position in window is less than thresholdMin ago, not enough data
  if (currentTime - oldestInWindow < thresholdMs * 0.9) {
    return false;
  }

  // Check if ALL positions in window are within 100m of current position
  const currentCoord: GeoCoord = {
    lat: currentPosition.latitude,
    lng: currentPosition.longitude,
  };

  for (const pos of positionsInWindow) {
    const posCoord: GeoCoord = { lat: pos.latitude, lng: pos.longitude };
    const distM = haversineMeters(currentCoord, posCoord);
    if (distM > MOVEMENT_THRESHOLD_M) {
      return false; // Driver moved at some point in the window
    }
  }

  return true;
}

/**
 * For each remaining stop, estimate ETA from current position.
 * Flag stops where ETA > planned_window_end + thresholdMin.
 */
export function detectLateArrival(
  currentPosition: GeoCoord,
  remainingStops: Array<{
    id: string;
    stop_sequence: number;
    planned_latitude: number | null;
    planned_longitude: number | null;
    planned_window_end: string | null;
    stop_status: string;
  }>,
  now: Date,
  thresholdMin: number,
): LateStop[] {
  const lateStops: LateStop[] = [];
  // Use local time to match planned_window_end which is stored as local time (e.g. "10:30")
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  for (const stop of remainingStops) {
    // Skip completed/failed stops or stops without geo/window data
    if (
      stop.stop_status !== "GEPLAND" &&
      stop.stop_status !== "ONDERWEG"
    ) {
      continue;
    }
    if (
      stop.planned_latitude == null ||
      stop.planned_longitude == null ||
      !stop.planned_window_end
    ) {
      continue;
    }

    const stopCoord: GeoCoord = {
      lat: stop.planned_latitude,
      lng: stop.planned_longitude,
    };

    const travelMin = calculateEtaMinutes(currentPosition, stopCoord);
    const etaMinutesSinceMidnight = nowMinutes + travelMin;

    const windowEndMinutes = parseTimeToMinutes(stop.planned_window_end);
    const deadline = windowEndMinutes + thresholdMin;

    if (etaMinutesSinceMidnight > deadline) {
      const delayMin = Math.round(etaMinutesSinceMidnight - windowEndMinutes);
      const etaDate = new Date(now.getTime() + travelMin * 60 * 1000);

      lateStops.push({
        stop_id: stop.id,
        stop_sequence: stop.stop_sequence,
        planned_window_end: stop.planned_window_end,
        estimated_arrival: etaDate,
        delay_minutes: delayMin,
      });
    }
  }

  return lateStops;
}

/**
 * Master evaluation: run all anomaly detectors for a driver position update.
 * Inserts new anomalies into execution_anomalies and creates notifications.
 */
export async function evaluateDriverPosition(
  supabase: SupabaseClient,
  tenantId: string,
  driverId: string,
  position: DriverPosition,
  currentTripId: string,
  rules: { anomaly_stationary_min: number; anomaly_late_threshold_min: number },
): Promise<ExecutionAnomaly[]> {
  const anomalies: ExecutionAnomaly[] = [];
  const now = new Date(position.recorded_at);

  // 1. Fetch recent positions for stationary check
  const windowStart = new Date(now.getTime() - (rules.anomaly_stationary_min + 5) * 60 * 1000);
  const { data: recentPositions } = await supabase
    .from("driver_positions")
    .select("latitude, longitude, recorded_at")
    .eq("driver_id", driverId)
    .gte("recorded_at", windowStart.toISOString())
    .order("recorded_at", { ascending: true });

  const positions = (recentPositions || []) as DriverPosition[];

  // 2. Stationary check
  if (detectStationaryAnomaly(position, positions, rules.anomaly_stationary_min)) {
    const anomaly = await insertAnomaly(supabase, {
      tenant_id: tenantId,
      trip_id: currentTripId,
      driver_id: driverId,
      anomaly_type: "STATIONARY",
      details: {
        duration_min: rules.anomaly_stationary_min,
        latitude: position.latitude,
        longitude: position.longitude,
      },
    });
    if (anomaly) anomalies.push(anomaly);
  }

  // 3. Late arrival check
  const { data: tripStops } = await supabase
    .from("trip_stops")
    .select("id, stop_sequence, planned_latitude, planned_longitude, planned_window_end, stop_status")
    .eq("trip_id", currentTripId)
    .in("stop_status", ["GEPLAND", "ONDERWEG"])
    .order("stop_sequence", { ascending: true });

  if (tripStops && tripStops.length > 0) {
    const currentCoord: GeoCoord = { lat: position.latitude, lng: position.longitude };
    const lateStops = detectLateArrival(
      currentCoord,
      tripStops as any,
      now,
      rules.anomaly_late_threshold_min,
    );

    for (const late of lateStops) {
      const anomaly = await insertAnomaly(supabase, {
        tenant_id: tenantId,
        trip_id: currentTripId,
        driver_id: driverId,
        anomaly_type: "LATE",
        details: {
          stop_id: late.stop_id,
          stop_sequence: late.stop_sequence,
          delay_minutes: late.delay_minutes,
          planned_window_end: late.planned_window_end,
          estimated_arrival: late.estimated_arrival.toISOString(),
        },
      });
      if (anomaly) anomalies.push(anomaly);
    }
  }

  // 4. Create notifications for detected anomalies
  for (const anomaly of anomalies) {
    await supabase.from("notifications").insert({
      tenant_id: tenantId,
      type: "ANOMALY",
      title: `Anomalie: ${anomaly.anomaly_type}`,
      message: buildAnomalyMessage(anomaly),
      is_read: false,
    });
  }

  return anomalies;
}

// ─── Helpers ───────────────────────────────────────────────

async function insertAnomaly(
  supabase: SupabaseClient,
  data: {
    tenant_id: string;
    trip_id: string;
    driver_id: string;
    anomaly_type: AnomalyType;
    details: Record<string, unknown>;
  },
): Promise<ExecutionAnomaly | null> {
  // Check for duplicate (same trip + type + unresolved)
  const { data: existing } = await supabase
    .from("execution_anomalies")
    .select("id")
    .eq("trip_id", data.trip_id)
    .eq("anomaly_type", data.anomaly_type)
    .is("resolved_at", null)
    .maybeSingle();

  if (existing) return null; // Already have an unresolved anomaly of this type

  const { data: inserted, error } = await supabase
    .from("execution_anomalies")
    .insert({
      tenant_id: data.tenant_id,
      trip_id: data.trip_id,
      driver_id: data.driver_id,
      anomaly_type: data.anomaly_type,
      details: data.details,
    })
    .select()
    .single();

  if (error) {
    console.error("[anomalyDetector] Failed to insert anomaly:", error);
    return null;
  }

  return inserted as ExecutionAnomaly;
}

function buildAnomalyMessage(anomaly: ExecutionAnomaly): string {
  switch (anomaly.anomaly_type) {
    case "STATIONARY":
      return `Chauffeur staat al ${(anomaly.details as any).duration_min} minuten stil.`;
    case "LATE":
      return `Stop #${(anomaly.details as any).stop_sequence} wordt naar verwachting ${(anomaly.details as any).delay_minutes} minuten te laat bereikt.`;
    case "OFF_ROUTE":
      return "Chauffeur is afgeweken van de geplande route.";
    case "MISSED_WINDOW":
      return `Tijdvenster van stop #${(anomaly.details as any).stop_sequence} is gemist.`;
    default:
      return "Onbekende anomalie gedetecteerd.";
  }
}
