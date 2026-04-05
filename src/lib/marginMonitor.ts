/**
 * Margin Monitor for OrderFlow Suite.
 *
 * Calculates trip margins (revenue vs. costs) and creates alerts
 * when margins drop below configurable thresholds.
 */

import type { MarginResult, MarginAlert } from "@/types/financial-autonomy";

/** Round to 2 decimal places */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Trip Margin Calculation ───────────────────────────────────

/**
 * Calculate the margin for a trip.
 *
 * Revenue = sum of invoice totals for orders on this trip.
 * Costs = sum of trip_costs for this trip.
 * Margin = revenue - costs.
 *
 * @param supabase - Supabase client
 * @param tenantId - Tenant UUID
 * @param tripId - Trip UUID
 * @returns MarginResult with revenue, costs, margin_eur, margin_pct
 */
export async function calculateTripMargin(
  supabase: any,
  tenantId: string,
  tripId: string,
): Promise<MarginResult> {
  // 1. Get orders on this trip that have invoices
  const { data: orders } = await supabase
    .from("orders")
    .select("id, invoice_id")
    .eq("trip_id", tripId);

  const orderList = (orders ?? []) as Array<{ id: string; invoice_id: string | null }>;

  // 2. Sum revenue from invoices
  let revenue = 0;
  const invoiceIds = orderList
    .map((o) => o.invoice_id)
    .filter((id): id is string => id != null);

  if (invoiceIds.length > 0) {
    const { data: invoices } = await supabase
      .from("invoices")
      .select("id, total")
      .in("id", invoiceIds);

    const invoiceList = (invoices ?? []) as Array<{ id: string; total: number }>;
    revenue = round2(invoiceList.reduce((sum, inv) => sum + inv.total, 0));
  }

  // 3. Sum costs from trip_costs
  const { data: costs } = await supabase
    .from("trip_costs")
    .select("amount")
    .eq("trip_id", tripId);

  const costList = (costs ?? []) as Array<{ amount: number }>;
  const totalCosts = round2(costList.reduce((sum, c) => sum + c.amount, 0));

  // 4. Calculate margin
  const marginEur = round2(revenue - totalCosts);
  const marginPct = revenue > 0
    ? round2((marginEur / revenue) * 100)
    : 0;

  return {
    revenue,
    costs: totalCosts,
    margin_eur: marginEur,
    margin_pct: marginPct,
  };
}

// ─── Margin Threshold Check ────────────────────────────────────

/**
 * Check if a trip's margin is below the given threshold.
 *
 * If below threshold, creates a margin_alert record and returns it.
 * If above threshold, returns null.
 *
 * @param supabase - Supabase client
 * @param tenantId - Tenant UUID
 * @param tripId - Trip UUID
 * @param thresholdPct - Minimum acceptable margin percentage
 * @returns MarginAlert if threshold breached, null otherwise
 */
export async function checkMarginThreshold(
  supabase: any,
  tenantId: string,
  tripId: string,
  thresholdPct: number,
): Promise<MarginAlert | null> {
  const margin = await calculateTripMargin(supabase, tenantId, tripId);

  if (margin.margin_pct >= thresholdPct) {
    return null;
  }

  // Create alert
  const alertData = {
    tenant_id: tenantId,
    entity_type: "trip" as const,
    entity_id: tripId,
    margin_pct: margin.margin_pct,
    threshold_pct: thresholdPct,
    alert_status: "ACTIVE" as const,
  };

  const { data: alert } = await supabase
    .from("margin_alerts")
    .insert(alertData)
    .select()
    .single();

  if (alert) {
    return alert as MarginAlert;
  }

  // Return constructed alert even if DB insert failed (for caller to handle)
  return {
    id: "",
    ...alertData,
    created_at: new Date().toISOString(),
  };
}
