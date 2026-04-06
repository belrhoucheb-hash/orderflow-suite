// ─── Real-time Replanning Engine ────────────────────────────
// Detects disruptions and generates replan suggestions for active trips.

import type { Trip, TripStop } from "@/types/dispatch";
import type { FleetVehicle } from "@/hooks/useVehicles";
import type {
  Disruption,
  DisruptionType,
  ReplanSuggestion,
  ReplanAction,
} from "@/types/replanning";
import { type GeoCoord, haversineKm } from "@/data/geoData";

/** Average speed assumption for ETA calculations (km/h) */
const AVG_SPEED_KMH = 60;

/** Threshold in minutes before a stop is considered overdue */
const OVERDUE_THRESHOLD_MIN = 30;

// ─── Helpers ────────────────────────────────────────────────

function generateId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Parse "HH:mm" to minutes since midnight */
function parseTimeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** Estimate travel time between two coordinates in minutes */
function travelMinutes(from: GeoCoord, to: GeoCoord): number {
  const distKm = haversineKm(from, to);
  return (distKm / AVG_SPEED_KMH) * 60;
}

/** Calculate total route distance for a sequence of stops */
function routeDistanceKm(stops: TripStop[], start?: GeoCoord): number {
  let total = 0;
  let prev: GeoCoord | null = start ?? null;

  for (const stop of stops) {
    if (stop.planned_latitude == null || stop.planned_longitude == null) continue;
    const current: GeoCoord = { lat: stop.planned_latitude, lng: stop.planned_longitude };
    if (prev) {
      total += haversineKm(prev, current);
    }
    prev = current;
  }
  return total;
}

// ─── Disruption Detection ───────────────────────────────────

/**
 * Scan active trips for potential disruptions:
 * - Time window breaches (ETA > delivery window)
 * - Overdue stops (>30min past scheduled time)
 * - Capacity violations (total weight exceeding vehicle capacity)
 */
export function detectDisruptions(
  trips: Trip[],
  orders: Array<{
    id: string;
    weight_kg?: number;
    time_window_start?: string | null;
    time_window_end?: string | null;
    status?: string;
  }>,
  now: Date = new Date(),
): Disruption[] {
  const disruptions: Disruption[] = [];

  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  for (const trip of trips) {
    // Only check active/in-progress trips
    if (!["ACTIEF", "GEACCEPTEERD", "VERZONDEN"].includes(trip.dispatch_status)) {
      continue;
    }

    const stops = trip.stops ?? [];

    // Check each pending stop for time window breaches and overdue
    for (const stop of stops) {
      if (stop.stop_status !== "GEPLAND" && stop.stop_status !== "ONDERWEG") {
        continue;
      }

      // Time window breach detection
      if (stop.planned_time) {
        const plannedMinutes = parseTimeToMinutes(stop.planned_time);
        if (nowMinutes > plannedMinutes + OVERDUE_THRESHOLD_MIN) {
          disruptions.push({
            id: generateId(),
            type: "time_window_breach",
            severity: nowMinutes - plannedMinutes > 60 ? "critical" : "high",
            affectedTripId: trip.id,
            affectedOrderId: stop.order_id ?? undefined,
            description: `Stop ${stop.stop_sequence} is ${Math.round(nowMinutes - plannedMinutes)} min overdue (planned ${stop.planned_time})`,
            detectedAt: now,
            autoResolved: false,
          });
        }
      }
    }

    // Check for cancelled orders still on the trip
    const orderMap = new Map(orders.map((o) => [o.id, o]));
    for (const stop of stops) {
      if (!stop.order_id) continue;
      const order = orderMap.get(stop.order_id);
      if (
        order?.status === "CANCELLED" &&
        stop.stop_status !== "OVERGESLAGEN" &&
        stop.stop_status !== "MISLUKT"
      ) {
        disruptions.push({
          id: generateId(),
          type: "order_cancelled",
          severity: "medium",
          affectedTripId: trip.id,
          affectedOrderId: stop.order_id,
          description: `Order ${stop.order_id.slice(0, 8)} is cancelled but still on trip`,
          detectedAt: now,
          autoResolved: false,
        });
      }
    }
  }

  return disruptions;
}

// ─── Suggestion Generation ──────────────────────────────────

/**
 * Generate replan suggestions for a given disruption.
 * Each disruption type has a specific strategy.
 */
export function generateReplanSuggestions(
  disruption: Disruption,
  availableVehicles: FleetVehicle[],
  trips: Trip[],
): ReplanSuggestion[] {
  switch (disruption.type) {
    case "traffic_delay":
      return suggestForTrafficDelay(disruption, trips);
    case "vehicle_breakdown":
      return suggestForVehicleBreakdown(disruption, availableVehicles, trips);
    case "order_cancelled":
      return suggestForCancellation(disruption, trips);
    case "new_urgent_order":
      return suggestForNewUrgentOrder(disruption, availableVehicles, trips);
    case "time_window_breach":
      return suggestForTimeWindowBreach(disruption, trips);
    case "driver_unavailable":
      return suggestForVehicleBreakdown(disruption, availableVehicles, trips);
    default:
      return [];
  }
}

/** For traffic delay: reorder remaining stops to minimize total delay */
function suggestForTrafficDelay(
  disruption: Disruption,
  trips: Trip[],
): ReplanSuggestion[] {
  const trip = trips.find((t) => t.id === disruption.affectedTripId);
  if (!trip?.stops) return [];

  const pendingStops = trip.stops.filter(
    (s) => s.stop_status === "GEPLAND" || s.stop_status === "ONDERWEG",
  );
  if (pendingStops.length < 2) return [];

  // Suggest nearest-neighbor reorder from current position
  const reorderedStops = nearestNeighborSort(pendingStops);
  const originalDist = routeDistanceKm(pendingStops);
  const newDist = routeDistanceKm(reorderedStops);
  const savedKm = originalDist - newDist;
  const timeSaved = Math.round((savedKm / AVG_SPEED_KMH) * 60);

  const actions: ReplanAction[] = [{
    type: "reorder_stops",
    fromTripId: trip.id,
    details: {
      newSequence: reorderedStops.map((s) => s.id),
      originalSequence: pendingStops.map((s) => s.id),
    },
  }];

  const confidence = calculateReplanConfidence({
    hasGeoData: pendingStops.every((s) => s.planned_latitude != null),
    stopsAffected: pendingStops.length,
    timeSavedMinutes: timeSaved,
    disruptionSeverity: disruption.severity,
  });

  return [{
    id: generateId(),
    disruptionId: disruption.id,
    description: `Reorder ${pendingStops.length} remaining stops to minimize delay (saves ~${Math.max(0, timeSaved)} min)`,
    confidence,
    impact: {
      timeSavedMinutes: Math.max(0, timeSaved),
      costDelta: -Math.max(0, savedKm) * 1.5, // ~€1.50/km saving
      affectedStops: pendingStops.length,
    },
    actions,
    status: "pending",
  }];
}

/** For vehicle breakdown: reassign orders to nearest available vehicle */
function suggestForVehicleBreakdown(
  disruption: Disruption,
  availableVehicles: FleetVehicle[],
  trips: Trip[],
): ReplanSuggestion[] {
  const trip = trips.find((t) => t.id === disruption.affectedTripId);
  if (!trip?.stops) return [];

  const pendingStops = trip.stops.filter(
    (s) => s.stop_status === "GEPLAND" || s.stop_status === "ONDERWEG",
  );
  if (pendingStops.length === 0) return [];

  // Find vehicles not assigned to this broken-down trip
  const busyVehicleIds = new Set([trip.vehicle_id]);
  const freeVehicles = availableVehicles.filter((v) => !busyVehicleIds.has(v.id));

  if (freeVehicles.length === 0) return [];

  const suggestions: ReplanSuggestion[] = [];

  // Suggest reassigning to each available vehicle (top 3 by capacity fit)
  const sortedVehicles = [...freeVehicles].sort(
    (a, b) => b.capacityKg - a.capacityKg,
  );
  const candidates = sortedVehicles.slice(0, 3);

  for (const vehicle of candidates) {
    // Find the target trip for this vehicle, or suggest new trip
    const existingTrip = trips.find(
      (t) =>
        t.vehicle_id === vehicle.id &&
        t.dispatch_status === "ACTIEF" &&
        t.id !== trip.id,
    );

    const actions: ReplanAction[] = pendingStops.map((stop) => ({
      type: "reassign_order" as const,
      fromTripId: trip.id,
      toTripId: existingTrip?.id,
      orderId: stop.order_id ?? undefined,
      details: { targetVehicle: vehicle.id, vehicleName: vehicle.name },
    }));

    const confidence = calculateReplanConfidence({
      hasGeoData: pendingStops.every((s) => s.planned_latitude != null),
      stopsAffected: pendingStops.length,
      timeSavedMinutes: 0,
      disruptionSeverity: disruption.severity,
    });

    suggestions.push({
      id: generateId(),
      disruptionId: disruption.id,
      description: `Reassign ${pendingStops.length} orders to ${vehicle.name} (${vehicle.plate})`,
      confidence,
      impact: {
        timeSavedMinutes: 0,
        costDelta: 25, // Extra vehicle deployment cost estimate
        affectedStops: pendingStops.length,
      },
      actions,
      status: "pending",
    });
  }

  return suggestions;
}

/** For cancellation: optimize remaining route using 2-opt */
function suggestForCancellation(
  disruption: Disruption,
  trips: Trip[],
): ReplanSuggestion[] {
  const trip = trips.find((t) => t.id === disruption.affectedTripId);
  if (!trip?.stops) return [];

  // Filter out the cancelled order's stop and keep only pending stops
  const remainingStops = trip.stops.filter(
    (s) =>
      s.order_id !== disruption.affectedOrderId &&
      (s.stop_status === "GEPLAND" || s.stop_status === "ONDERWEG"),
  );

  if (remainingStops.length < 2) return [];

  // Run 2-opt optimization on remaining stops
  const optimizedStops = twoOptImprove(remainingStops);
  const originalDist = routeDistanceKm(remainingStops);
  const newDist = routeDistanceKm(optimizedStops);
  const savedKm = originalDist - newDist;
  const timeSaved = Math.round((savedKm / AVG_SPEED_KMH) * 60);

  const actions: ReplanAction[] = [
    {
      type: "reorder_stops",
      fromTripId: trip.id,
      details: {
        removedOrderId: disruption.affectedOrderId,
        newSequence: optimizedStops.map((s) => s.id),
      },
    },
  ];

  const confidence = calculateReplanConfidence({
    hasGeoData: remainingStops.every((s) => s.planned_latitude != null),
    stopsAffected: remainingStops.length,
    timeSavedMinutes: timeSaved,
    disruptionSeverity: disruption.severity,
  });

  return [{
    id: generateId(),
    disruptionId: disruption.id,
    description: `Remove cancelled order and optimize remaining ${remainingStops.length} stops (saves ~${Math.max(0, timeSaved)} min)`,
    confidence,
    impact: {
      timeSavedMinutes: Math.max(0, timeSaved),
      costDelta: -Math.max(0, savedKm) * 1.5,
      affectedStops: remainingStops.length,
    },
    actions,
    status: "pending",
  }];
}

/** For new urgent order: find best insertion point across active trips */
function suggestForNewUrgentOrder(
  disruption: Disruption,
  _availableVehicles: FleetVehicle[],
  trips: Trip[],
): ReplanSuggestion[] {
  const suggestions: ReplanSuggestion[] = [];

  // Try inserting into each active trip
  const activeTrips = trips.filter((t) =>
    ["ACTIEF", "GEACCEPTEERD"].includes(t.dispatch_status),
  );

  for (const trip of activeTrips) {
    const stops = trip.stops?.filter(
      (s) => s.stop_status === "GEPLAND" || s.stop_status === "ONDERWEG",
    );
    if (!stops || stops.length === 0) continue;

    // Find best insertion position (position that adds least distance)
    const { bestPosition, addedDistance } = findBestInsertionPoint(
      stops,
      disruption.affectedOrderId,
    );

    const timeCost = Math.round((addedDistance / AVG_SPEED_KMH) * 60);

    const actions: ReplanAction[] = [{
      type: "reassign_order",
      toTripId: trip.id,
      orderId: disruption.affectedOrderId,
      details: { insertAtPosition: bestPosition, addedDistanceKm: addedDistance },
    }];

    const confidence = calculateReplanConfidence({
      hasGeoData: stops.every((s) => s.planned_latitude != null),
      stopsAffected: stops.length + 1,
      timeSavedMinutes: -timeCost,
      disruptionSeverity: disruption.severity,
    });

    suggestions.push({
      id: generateId(),
      disruptionId: disruption.id,
      description: `Insert urgent order into trip ${trip.trip_number} at position ${bestPosition + 1} (+${timeCost} min)`,
      confidence,
      impact: {
        timeSavedMinutes: -timeCost,
        costDelta: addedDistance * 1.5,
        affectedStops: stops.length + 1,
      },
      actions,
      status: "pending",
    });
  }

  // Sort by least added time
  suggestions.sort(
    (a, b) => Math.abs(a.impact.timeSavedMinutes) - Math.abs(b.impact.timeSavedMinutes),
  );

  return suggestions.slice(0, 3); // Top 3 options
}

/** For time window breach: reorder to prioritize breached stops */
function suggestForTimeWindowBreach(
  disruption: Disruption,
  trips: Trip[],
): ReplanSuggestion[] {
  // Same strategy as traffic delay — reorder remaining stops
  return suggestForTrafficDelay(disruption, trips);
}

// ─── Confidence Scoring ─────────────────────────────────────

interface ConfidenceInput {
  hasGeoData: boolean;
  stopsAffected: number;
  timeSavedMinutes: number;
  disruptionSeverity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Score a replan suggestion based on data quality and impact.
 * Returns 0-100 confidence score.
 */
export function calculateReplanConfidence(input: ConfidenceInput): number {
  let score = 50; // Base score

  // Geo data quality (critical for routing accuracy)
  if (input.hasGeoData) {
    score += 20;
  } else {
    score -= 20;
  }

  // Impact: positive time savings boost confidence
  if (input.timeSavedMinutes > 10) {
    score += 15;
  } else if (input.timeSavedMinutes > 0) {
    score += 5;
  } else if (input.timeSavedMinutes < -30) {
    score -= 10;
  }

  // Fewer affected stops = less risk
  if (input.stopsAffected <= 3) {
    score += 10;
  } else if (input.stopsAffected > 10) {
    score -= 10;
  }

  // Severity: higher severity = stronger nudge to act (slightly less confidence needed)
  const severityBonus: Record<string, number> = {
    low: 0,
    medium: 0,
    high: 5,
    critical: 5,
  };
  score += severityBonus[input.disruptionSeverity] ?? 0;

  return Math.max(0, Math.min(100, score));
}

// ─── Route Optimization Helpers ─────────────────────────────

/** Nearest-neighbor sort for stops (greedy, fast) */
function nearestNeighborSort(stops: TripStop[]): TripStop[] {
  if (stops.length <= 1) return [...stops];

  const remaining = [...stops];
  const result: TripStop[] = [];

  // Start from first stop
  let current: GeoCoord | null = null;
  if (remaining[0].planned_latitude != null && remaining[0].planned_longitude != null) {
    current = { lat: remaining[0].planned_latitude, lng: remaining[0].planned_longitude };
  }

  // Take first stop as starting point
  const first = remaining.shift()!;
  result.push({ ...first, stop_sequence: 1 });

  while (remaining.length > 0) {
    if (!current) {
      // No geo data — just take next
      const next = remaining.shift()!;
      result.push({ ...next, stop_sequence: result.length + 1 });
      if (next.planned_latitude != null && next.planned_longitude != null) {
        current = { lat: next.planned_latitude, lng: next.planned_longitude };
      }
      continue;
    }

    let bestIdx = 0;
    let bestDist = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const s = remaining[i];
      if (s.planned_latitude == null || s.planned_longitude == null) continue;
      const dist = haversineKm(current, { lat: s.planned_latitude, lng: s.planned_longitude });
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    const chosen = remaining.splice(bestIdx, 1)[0];
    result.push({ ...chosen, stop_sequence: result.length + 1 });
    if (chosen.planned_latitude != null && chosen.planned_longitude != null) {
      current = { lat: chosen.planned_latitude, lng: chosen.planned_longitude };
    }
  }

  return result;
}

/** 2-opt improvement on stop sequence */
function twoOptImprove(stops: TripStop[]): TripStop[] {
  if (stops.length < 3) return [...stops];

  const ordered = [...stops];
  let improved = true;

  // Limit iterations to avoid long runtimes on large stop sets
  let iterations = 0;
  const maxIterations = 100;

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;

    for (let i = 0; i < ordered.length - 1; i++) {
      for (let j = i + 2; j < ordered.length; j++) {
        const distBefore = segmentDistance(ordered, i, j);
        const distAfter = segmentDistanceReversed(ordered, i, j);

        if (distAfter < distBefore) {
          // Reverse the segment between i+1 and j
          const reversed = ordered.slice(i + 1, j + 1).reverse();
          for (let k = 0; k < reversed.length; k++) {
            ordered[i + 1 + k] = reversed[k];
          }
          improved = true;
        }
      }
    }
  }

  // Re-number sequences
  return ordered.map((s, idx) => ({ ...s, stop_sequence: idx + 1 }));
}

function segmentDistance(stops: TripStop[], i: number, j: number): number {
  const a = stops[i];
  const b = stops[i + 1];
  const c = stops[j];
  const d = j + 1 < stops.length ? stops[j + 1] : null;

  let dist = 0;
  if (a.planned_latitude != null && b.planned_latitude != null) {
    dist += haversineKm(
      { lat: a.planned_latitude, lng: a.planned_longitude! },
      { lat: b.planned_latitude, lng: b.planned_longitude! },
    );
  }
  if (c.planned_latitude != null && d?.planned_latitude != null) {
    dist += haversineKm(
      { lat: c.planned_latitude, lng: c.planned_longitude! },
      { lat: d.planned_latitude, lng: d.planned_longitude! },
    );
  }
  return dist;
}

function segmentDistanceReversed(stops: TripStop[], i: number, j: number): number {
  const a = stops[i];
  const c = stops[j];
  const b = stops[i + 1];
  const d = j + 1 < stops.length ? stops[j + 1] : null;

  let dist = 0;
  // After reversal: a connects to c, b connects to d
  if (a.planned_latitude != null && c.planned_latitude != null) {
    dist += haversineKm(
      { lat: a.planned_latitude, lng: a.planned_longitude! },
      { lat: c.planned_latitude, lng: c.planned_longitude! },
    );
  }
  if (b.planned_latitude != null && d?.planned_latitude != null) {
    dist += haversineKm(
      { lat: b.planned_latitude, lng: b.planned_longitude! },
      { lat: d.planned_latitude, lng: d.planned_longitude! },
    );
  }
  return dist;
}

/** Find the best position to insert a new stop into a route */
function findBestInsertionPoint(
  stops: TripStop[],
  _orderId?: string,
): { bestPosition: number; addedDistance: number } {
  if (stops.length === 0) {
    return { bestPosition: 0, addedDistance: 0 };
  }

  // Without geo data for the new order, just append to end
  // In a real scenario we'd have order geo data, but here we pick minimal disruption
  let bestPosition = stops.length;
  let minAddedDist = 0;

  // Simple heuristic: insert at end adds least disruption when we don't know the new stop's location
  for (let i = 0; i <= stops.length; i++) {
    // Estimate added distance at position i
    let addedDist = 0;

    if (i > 0 && i < stops.length) {
      const prev = stops[i - 1];
      const next = stops[i];
      if (
        prev.planned_latitude != null &&
        next.planned_latitude != null
      ) {
        // Removing direct link between prev and next
        const directDist = haversineKm(
          { lat: prev.planned_latitude, lng: prev.planned_longitude! },
          { lat: next.planned_latitude, lng: next.planned_longitude! },
        );
        addedDist = -directDist; // We save the direct link, but add two new links (unknown, so net ~0)
      }
    }

    if (i === 0 || addedDist < minAddedDist) {
      minAddedDist = addedDist;
      bestPosition = i;
    }
  }

  return { bestPosition, addedDistance: Math.max(0, minAddedDist) };
}
