/**
 * Autonomous Invoicer for OrderFlow Suite.
 *
 * Triggered when a trip is completed. Calculates prices for all delivered
 * orders on the trip, creates a draft invoice, and evaluates whether to
 * auto-send based on confidence scoring.
 *
 * Depends on: Plan A (confidenceEngine), Plan B (pipelineOrchestrator)
 */

import { calculateWithConfidence } from "@/lib/pricingEngine";
import { generateInvoiceLinesFromPricing } from "@/lib/invoiceLinesFromPricing";
import type {
  RateCard,
  Surcharge,
  PricingOrderInput,
} from "@/types/rateModels";
import type {
  AutoInvoiceResult,
  AutoInvoiceLogEntry,
} from "@/types/financial-autonomy";

// Default INVOICING threshold when confidence engine (Plan A) is not yet available
const DEFAULT_INVOICING_THRESHOLD = 98;

/** Round to 2 decimal places */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Historical Accuracy ───────────────────────────────────────

/**
 * Get the average pricing accuracy for a client from auto_invoice_log.
 *
 * Returns 100 if no history exists (optimistic default for new clients).
 */
export async function getHistoricalAccuracy(
  supabase: any,
  tenantId: string,
  clientId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("auto_invoice_log")
    .select("price_accuracy_pct")
    .eq("tenant_id", tenantId);

  if (error || !data || data.length === 0) {
    return 100;
  }

  const logs = data as Array<{ price_accuracy_pct: number }>;
  const sum = logs.reduce((acc: number, log: { price_accuracy_pct: number }) => acc + log.price_accuracy_pct, 0);
  return round2(sum / logs.length);
}

// ─── Build PricingOrderInput from DB order row ─────────────────

function orderRowToPricingInput(order: any): PricingOrderInput {
  return {
    id: order.id,
    order_number: order.order_number,
    client_name: order.client_name ?? null,
    pickup_address: order.pickup_address ?? null,
    delivery_address: order.delivery_address ?? null,
    transport_type: order.transport_type ?? null,
    weight_kg: order.weight_kg ?? null,
    quantity: order.quantity ?? null,
    distance_km: order.distance_km ?? 0,
    stop_count: order.stop_count ?? 2,
    duration_hours: order.duration_hours ?? 0,
    requirements: order.requirements ?? [],
    day_of_week: order.day_of_week ?? new Date().getDay(),
    waiting_time_min: order.waiting_time_min ?? 0,
    pickup_country: order.pickup_country,
    delivery_country: order.delivery_country,
  };
}

// ─── Main: Trip Completed Handler ──────────────────────────────

/**
 * Process all delivered orders for a completed trip.
 *
 * 1. Fetch delivered orders linked to this trip
 * 2. For each order, find active rate card for the client
 * 3. Calculate price with confidence
 * 4. Group by client, create draft invoice(s)
 * 5. Evaluate confidence against INVOICING threshold
 * 6. If confident enough: mark as auto-sent, otherwise draft only
 * 7. Log to auto_invoice_log for accuracy tracking
 *
 * @param supabase - Supabase client instance
 * @param tenantId - Tenant UUID
 * @param tripId - Completed trip UUID
 * @returns AutoInvoiceResult
 */
export async function onTripCompleted(
  supabase: any,
  tenantId: string,
  tripId: string,
): Promise<AutoInvoiceResult> {
  // 1. Fetch delivered orders for this trip
  const { data: orders, error: ordersErr } = await supabase
    .from("orders")
    .select("*")
    .eq("trip_id", tripId)
    .eq("status", "DELIVERED")
    .is("invoice_id", null);

  if (ordersErr || !orders || orders.length === 0) {
    return {
      success: false,
      invoice_id: null,
      auto_sent: false,
      confidence: 0,
      calculated_total: 0,
      order_count: 0,
      reason: "no_orders",
    };
  }

  // 2. Get client_id from first order (trip orders typically share a client)
  const clientId = orders[0].client_id;
  if (!clientId) {
    return {
      success: false,
      invoice_id: null,
      auto_sent: false,
      confidence: 0,
      calculated_total: 0,
      order_count: orders.length,
      reason: "no_client",
    };
  }

  // 3. Find active rate card for this client
  const { data: rateCards, error: rcErr } = await supabase
    .from("rate_cards")
    .select("*, rate_rules(*)")
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1);

  if (rcErr || !rateCards || rateCards.length === 0) {
    return {
      success: false,
      invoice_id: null,
      auto_sent: false,
      confidence: 0,
      calculated_total: 0,
      order_count: orders.length,
      reason: "no_rate_card",
    };
  }

  const rateCard = rateCards[0] as RateCard;

  // 4. Fetch active surcharges for this tenant
  const { data: surcharges } = await supabase
    .from("surcharges")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("is_active", true);

  const activeSurcharges = (surcharges ?? []) as Surcharge[];

  // 5. Get historical accuracy for confidence adjustment
  const historicalAccuracy = await getHistoricalAccuracy(supabase, tenantId, clientId);

  // 6. Calculate price for each order with confidence
  let totalAmount = 0;
  let minConfidence = 100;
  const allInvoiceLines: any[] = [];
  let sortOrder = 0;

  for (const order of orders) {
    const pricingInput = orderRowToPricingInput(order);
    const result = calculateWithConfidence(
      pricingInput,
      rateCard,
      activeSurcharges,
      historicalAccuracy,
    );

    totalAmount += result.totaal;
    if (result.confidence < minConfidence) {
      minConfidence = result.confidence;
    }

    // Convert to invoice lines
    const lines = generateInvoiceLinesFromPricing(order.id, result);
    for (const line of lines) {
      allInvoiceLines.push({
        ...line,
        sort_order: sortOrder++,
      });
    }
  }

  totalAmount = round2(totalAmount);

  // 7. Fetch client details for invoice
  const { data: client } = await supabase
    .from("clients")
    .select("name, address, btw_number, kvk_number, payment_terms")
    .eq("id", clientId)
    .single();

  if (!client) {
    return {
      success: false,
      invoice_id: null,
      auto_sent: false,
      confidence: minConfidence,
      calculated_total: totalAmount,
      order_count: orders.length,
      reason: "client_not_found",
    };
  }

  // 8. Generate invoice number
  const { data: invoiceNumber } = await supabase
    .rpc("generate_invoice_number", { p_tenant_id: tenantId });

  if (!invoiceNumber) {
    return {
      success: false,
      invoice_id: null,
      auto_sent: false,
      confidence: minConfidence,
      calculated_total: totalAmount,
      order_count: orders.length,
      reason: "invoice_number_generation_failed",
    };
  }

  // 9. Calculate BTW and due date
  const btwPercentage = 21;
  const btwAmount = round2(totalAmount * (btwPercentage / 100));
  const total = round2(totalAmount + btwAmount);

  let dueDate: string | null = null;
  if (client.payment_terms) {
    const due = new Date();
    due.setDate(due.getDate() + client.payment_terms);
    dueDate = due.toISOString().split("T")[0];
  }

  // 10. Determine auto-send based on confidence threshold
  // Try to use shouldAutoExecute from Plan A if available; otherwise use default
  let autoSend = false;
  try {
    // Plan A integration: check if confidence engine is available
    const { shouldAutoExecute } = await import("@/lib/confidenceEngine");
    const decision = await shouldAutoExecute(
      tenantId,
      "INVOICING",
      minConfidence,
      clientId,
    );
    autoSend = decision.auto;
  } catch {
    // Plan A not yet implemented — use hardcoded threshold
    autoSend = minConfidence >= DEFAULT_INVOICING_THRESHOLD;
  }

  // 11. Create invoice
  const invoiceStatus = autoSend ? "verzonden" : "concept";
  const { data: invoice, error: insertErr } = await supabase
    .from("invoices")
    .insert({
      tenant_id: tenantId,
      invoice_number: invoiceNumber,
      client_id: clientId,
      client_name: client.name,
      client_address: client.address ?? null,
      client_btw_number: client.btw_number ?? null,
      client_kvk_number: client.kvk_number ?? null,
      status: invoiceStatus,
      invoice_date: new Date().toISOString().split("T")[0],
      due_date: dueDate,
      subtotal: totalAmount,
      btw_percentage: btwPercentage,
      btw_amount: btwAmount,
      total,
      notes: `Automatisch ${autoSend ? "verzonden" : "concept"} — ${orders.length} order(s), confidence ${minConfidence.toFixed(1)}%`,
    })
    .select()
    .single();

  if (insertErr || !invoice) {
    return {
      success: false,
      invoice_id: null,
      auto_sent: false,
      confidence: minConfidence,
      calculated_total: totalAmount,
      order_count: orders.length,
      reason: "invoice_creation_failed",
    };
  }

  // 12. Insert invoice lines
  if (allInvoiceLines.length > 0) {
    const lineInserts = allInvoiceLines.map((line) => ({
      invoice_id: invoice.id,
      order_id: line.order_id ?? null,
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      unit_price: line.unit_price,
      total: line.total,
      sort_order: line.sort_order,
    }));

    await supabase.from("invoice_lines").insert(lineInserts);
  }

  // 13. Link orders to the invoice
  for (const order of orders) {
    await supabase
      .from("orders")
      .update({ invoice_id: invoice.id, billing_status: "GEFACTUREERD" })
      .eq("id", order.id);
  }

  // 14. Log to auto_invoice_log for accuracy tracking
  await supabase.from("auto_invoice_log").insert({
    tenant_id: tenantId,
    invoice_id: invoice.id,
    trigger_trip_id: tripId,
    auto_calculated_total: totalAmount,
    final_total: total,
    price_accuracy_pct: 100, // Will be updated when human reviews/adjusts
    was_auto_sent: autoSend,
  });

  return {
    success: true,
    invoice_id: invoice.id,
    auto_sent: autoSend,
    confidence: minConfidence,
    calculated_total: totalAmount,
    order_count: orders.length,
    reason: autoSend ? "auto_executed" : "below_threshold",
  };
}
