import { supabase } from "@/integrations/supabase/client";

/**
 * Check and update billing readiness for an order after delivery.
 * Called after a stop is marked AFGELEVERD.
 */
export async function checkAndUpdateBillingStatus(orderId: string): Promise<"GEREED" | "GEBLOKKEERD"> {
  // Check if POD exists
  const { data: pods } = await supabase
    .from("proof_of_delivery")
    .select("pod_status")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(1);

  const pod = pods?.[0];
  const podOk = pod && ["ONTVANGEN", "GOEDGEKEURD"].includes(pod.pod_status);

  // Check for blocking exceptions
  const { data: exceptions } = await supabase
    .from("delivery_exceptions")
    .select("id")
    .eq("order_id", orderId)
    .in("status", ["OPEN", "IN_PROGRESS"])
    .eq("blocks_billing", true)
    .limit(1);

  const hasBlockingException = (exceptions?.length || 0) > 0;

  if (!podOk) {
    await supabase.from("orders").update({
      billing_status: "GEBLOKKEERD",
      billing_blocked_reason: "POD ontbreekt of niet goedgekeurd",
    }).eq("id", orderId);
    return "GEBLOKKEERD";
  }

  if (hasBlockingException) {
    await supabase.from("orders").update({
      billing_status: "GEBLOKKEERD",
      billing_blocked_reason: "Open uitzondering blokkeert facturatie",
    }).eq("id", orderId);
    return "GEBLOKKEERD";
  }

  await supabase.from("orders").update({
    billing_status: "GEREED",
    billing_blocked_reason: null,
    billing_ready_at: new Date().toISOString(),
  }).eq("id", orderId);
  return "GEREED";
}

/**
 * After all stops in a trip are terminal, complete the trip and update orders.
 */
export async function checkTripCompletion(tripId: string): Promise<boolean> {
  const { data: stops } = await supabase
    .from("trip_stops")
    .select("id, stop_status, order_id")
    .eq("trip_id", tripId);

  if (!stops || stops.length === 0) return false;

  const terminal = ["AFGELEVERD", "MISLUKT", "OVERGESLAGEN"];
  const allDone = stops.every(s => terminal.includes(s.stop_status));

  if (!allDone) return false;

  // Complete the trip
  await supabase.from("trips").update({
    dispatch_status: "VOLTOOID",
    completed_at: new Date().toISOString(),
    actual_end_time: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", tripId);

  // Update each order
  for (const stop of stops) {
    if (!stop.order_id) continue;
    if (stop.stop_status === "AFGELEVERD") {
      await supabase.from("orders").update({ status: "DELIVERED" }).eq("id", stop.order_id);
      await checkAndUpdateBillingStatus(stop.order_id);
    }
    // MISLUKT orders stay IN_TRANSIT — exception handles resolution
  }

  return true;
}
