// ─── Plan E: Auto-Dispatcher ───────────────────────────────
// Automatically dispatches trips to drivers when within lead time.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Trip, TripStop } from "@/types/dispatch";
import { recordDecision } from "@/lib/confidenceEngine";

/**
 * Get trips that are ready to be dispatched:
 * - Status is VERZENDKLAAR
 * - Planned date is today
 * - First stop's planned_time minus now <= leadTimeMin
 */
export async function getTripsReadyForDispatch(
  supabase: SupabaseClient,
  tenantId: string,
  now: Date,
  leadTimeMin: number,
): Promise<Trip[]> {
  const todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD

  const { data, error } = await supabase
    .from("trips")
    .select("*, trip_stops(*)")
    .eq("tenant_id", tenantId)
    .eq("dispatch_status", "VERZENDKLAAR")
    .eq("planned_date", todayStr)
    .order("planned_start_time", { ascending: true });

  if (error) {
    console.error("[autoDispatcher] Failed to fetch trips:", error);
    return [];
  }

  const trips = (data || []) as Trip[];

  // Filter: first stop must be within lead time
  return trips.filter((trip) => {
    const stops = trip.stops || (trip as any).trip_stops || [];
    if (stops.length === 0) return false;

    // Sort by sequence, get first stop
    const sorted = [...stops].sort(
      (a: TripStop, b: TripStop) => a.stop_sequence - b.stop_sequence,
    );
    const firstStop = sorted[0];

    if (!firstStop.planned_time) return false;

    const plannedTime = new Date(firstStop.planned_time);
    const diffMin = (plannedTime.getTime() - now.getTime()) / (1000 * 60);

    // Ready if the first stop is within leadTimeMin from now (and not already past)
    return diffMin >= 0 && diffMin <= leadTimeMin;
  });
}

/**
 * Dispatch a single trip:
 * 1. Update dispatch_status to VERZONDEN
 * 2. Set dispatched_at timestamp
 * 3. Create in-app notification for driver
 * 4. Record decision in confidence engine
 */
export async function dispatchTrip(
  supabase: SupabaseClient,
  tripId: string,
): Promise<void> {
  // Fetch trip to get tenant_id, driver_id, trip_number
  const { data: trip, error: fetchErr } = await supabase
    .from("trips")
    .select("id, tenant_id, driver_id, trip_number")
    .eq("id", tripId)
    .single();

  if (fetchErr || !trip) {
    console.error("[autoDispatcher] Trip not found:", tripId, fetchErr);
    return;
  }

  const now = new Date().toISOString();

  // 1. Update trip status
  const { error: updateErr } = await supabase
    .from("trips")
    .update({
      dispatch_status: "VERZONDEN",
      dispatched_at: now,
    })
    .eq("id", tripId);

  if (updateErr) {
    console.error("[autoDispatcher] Failed to update trip:", updateErr);
    return;
  }

  // 2. Create notification for driver
  if (trip.driver_id) {
    await supabase.from("notifications").insert({
      tenant_id: trip.tenant_id,
      type: "DISPATCH",
      title: "Nieuwe rit toegewezen",
      message: `Rit #${trip.trip_number} is aan u toegewezen. Bekijk de details.`,
      user_id: trip.driver_id,
      is_read: false,
    });
  }

  // 3. Record decision in confidence engine
  try {
    await recordDecision(supabase, {
      tenantId: trip.tenant_id,
      decisionType: "DISPATCH",
      entityType: "trip",
      entityId: tripId,
      proposedAction: { action: "AUTO_DISPATCH", trip_id: tripId },
      inputConfidence: 100, // Auto-dispatch is rule-based, always 100
      modelConfidence: 100,
      resolution: "AUTO_EXECUTED",
    });
  } catch (err) {
    // Non-critical: don't fail dispatch if recording fails
    console.error("[autoDispatcher] Failed to record decision:", err);
  }
}
