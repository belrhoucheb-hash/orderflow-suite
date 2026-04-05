// ─── Plan E: Realtime Replanner ────────────────────────────
// Re-optimizes trip stop order when delays are detected.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TripStop } from "@/types/dispatch";
import type { GeoCoord } from "@/data/geoData";
import type { ReplanResult, ReplanChange } from "@/types/dispatch-autonomy";
import { reoptimizeStopOrder } from "@/lib/rollingPlanner";
import { detectLateArrival } from "@/lib/anomalyDetector";

/**
 * Compare old vs new stop sequences and return the changes.
 */
export function buildReplanChanges(
  oldStops: TripStop[],
  newStops: TripStop[],
): ReplanChange[] {
  const changes: ReplanChange[] = [];

  // Build a map of old sequences
  const oldSeqMap = new Map<string, number>();
  for (const stop of oldStops) {
    oldSeqMap.set(stop.id, stop.stop_sequence);
  }

  // Compare with new sequences
  for (let i = 0; i < newStops.length; i++) {
    const newSeq = i + 1;
    const oldSeq = oldSeqMap.get(newStops[i].id);

    if (oldSeq !== undefined && oldSeq !== newSeq) {
      changes.push({
        stop_id: newStops[i].id,
        old_sequence: oldSeq,
        new_sequence: newSeq,
        new_estimated_arrival: new Date(), // Placeholder; real ETA from Plan D
      });
    }
  }

  return changes;
}

/**
 * Replan a trip when a delay is detected at a specific stop.
 *
 * 1. Fetch remaining (GEPLAND/ONDERWEG) stops
 * 2. Run reoptimizeStopOrder from rollingPlanner
 * 3. Detect which stops changed sequence
 * 4. Update trip_stops in DB
 * 5. Return changes and infeasible stops
 */
export async function replanOnDelay(
  supabase: SupabaseClient,
  tripId: string,
  _delayedStopId: string,
  currentPosition: GeoCoord,
  lateThresholdMin = 15,
): Promise<ReplanResult> {
  // 1. Fetch remaining stops
  const { data: remainingStops, error } = await supabase
    .from("trip_stops")
    .select("*")
    .eq("trip_id", tripId)
    .in("stop_status", ["GEPLAND", "ONDERWEG"])
    .order("stop_sequence", { ascending: true });

  if (error || !remainingStops || remainingStops.length === 0) {
    return { success: false, changes: [], infeasible_stops: [] };
  }

  const stops = remainingStops as TripStop[];

  // 2. Re-optimize stop order
  const reoptimized = reoptimizeStopOrder(stops, currentPosition);

  // 3. Compute changes
  const changes = buildReplanChanges(stops, reoptimized);

  // 4. Identify infeasible stops (those still late after replan)
  const lateAfterReplan = detectLateArrival(
    currentPosition,
    reoptimized.map((s, i) => ({
      id: s.id,
      stop_sequence: i + 1,
      planned_latitude: s.planned_latitude,
      planned_longitude: s.planned_longitude,
      planned_window_end: (s as any).planned_window_end,
      stop_status: s.stop_status,
    })),
    new Date(),
    lateThresholdMin,
  );

  const infeasibleStopIds = lateAfterReplan.map((ls) => ls.stop_id);

  // 5. If there are changes, update the DB
  if (changes.length > 0) {
    for (const change of changes) {
      await supabase
        .from("trip_stops")
        .update({ stop_sequence: change.new_sequence })
        .eq("id", change.stop_id);
    }
  }

  return {
    success: true,
    changes,
    infeasible_stops: infeasibleStopIds,
  };
}

/**
 * Notify relevant stakeholders about replan changes.
 * Creates in-app notifications for the planner.
 */
export async function notifyStakeholders(
  supabase: SupabaseClient,
  tenantId: string,
  _tripId: string,
  changes: ReplanChange[],
  infeasibleStops: string[],
): Promise<void> {
  if (changes.length === 0 && infeasibleStops.length === 0) return;

  const parts: string[] = [];

  if (changes.length > 0) {
    parts.push(
      `${changes.length} stop(s) zijn opnieuw geordend voor optimale route.`,
    );
  }

  if (infeasibleStops.length > 0) {
    parts.push(
      `${infeasibleStops.length} stop(s) kunnen niet meer binnen het tijdvenster bereikt worden.`,
    );
  }

  const message = parts.join(" ");

  await supabase.from("notifications").insert({
    tenant_id: tenantId,
    type: "REPLAN",
    title: "Rit automatisch herplannen",
    message,
    is_read: false,
  });

  // If there are infeasible stops, create a higher-priority notification
  if (infeasibleStops.length > 0) {
    await supabase.from("notifications").insert({
      tenant_id: tenantId,
      type: "ANOMALY",
      title: "Onbereikbare stops gedetecteerd",
      message: `${infeasibleStops.length} stop(s) kunnen het tijdvenster niet meer halen. Handmatige interventie vereist.`,
      is_read: false,
    });
  }
}
