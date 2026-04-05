/**
 * Cashflow Predictor for OrderFlow Suite.
 *
 * Predicts when invoices will be paid based on:
 * - Client payment terms
 * - Historical payment lateness per client
 *
 * Provides a forecast of expected incoming payments over N days.
 */

import type {
  CashflowForecastEntry,
} from "@/types/financial-autonomy";

// ─── Helpers ───────────────────────────────────────────────────

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function daysBetween(a: string, b: string): number {
  const dateA = new Date(a);
  const dateB = new Date(b);
  return Math.round((dateB.getTime() - dateA.getTime()) / (1000 * 60 * 60 * 24));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Historical Lateness ───────────────────────────────────────

/**
 * Calculate average payment lateness (in days) for a client.
 *
 * Compares predicted_payment_date vs actual_payment_date from
 * cashflow_predictions that have been resolved.
 *
 * Returns 0 if no history exists (assume on-time).
 */
async function getAverageLateness(
  supabase: any,
  tenantId: string,
  clientId: string,
): Promise<number> {
  const { data: predictions } = await supabase
    .from("cashflow_predictions")
    .select("predicted_payment_date, actual_payment_date")
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId);

  const resolved = ((predictions ?? []) as Array<{
    predicted_payment_date: string;
    actual_payment_date: string | null;
  }>).filter((p) => p.actual_payment_date != null);

  if (resolved.length === 0) return 0;

  const totalLateDays = resolved.reduce((sum, p) => {
    const late = daysBetween(p.predicted_payment_date, p.actual_payment_date!);
    return sum + Math.max(0, late); // Only count late, not early
  }, 0);

  return Math.round(totalLateDays / resolved.length);
}

// ─── Payment Date Prediction ───────────────────────────────────

/**
 * Predict when an invoice will be paid.
 *
 * Formula: invoice_date + payment_terms + avg_historical_lateness
 *
 * Also inserts/updates a cashflow_predictions record for tracking.
 *
 * @param supabase - Supabase client
 * @param tenantId - Tenant UUID
 * @param invoiceId - Invoice UUID
 * @returns Predicted payment Date
 */
export async function predictPaymentDate(
  supabase: any,
  tenantId: string,
  invoiceId: string,
): Promise<Date> {
  // 1. Fetch invoice
  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, client_id, invoice_date, total, status")
    .eq("id", invoiceId)
    .single();

  if (!invoice) {
    throw new Error(`Invoice ${invoiceId} niet gevonden`);
  }

  // 2. Fetch client payment terms
  const { data: client } = await supabase
    .from("clients")
    .select("id, payment_terms")
    .eq("id", invoice.client_id)
    .single();

  const paymentTerms = client?.payment_terms ?? 30; // Default 30 days

  // 3. Get historical lateness for this client
  const avgLateness = await getAverageLateness(supabase, tenantId, invoice.client_id);

  // 4. Calculate predicted date
  const invoiceDate = new Date(invoice.invoice_date);
  const predictedDate = addDays(invoiceDate, paymentTerms + avgLateness);

  // 5. Store prediction
  await supabase.from("cashflow_predictions").insert({
    tenant_id: tenantId,
    invoice_id: invoiceId,
    predicted_payment_date: predictedDate.toISOString().split("T")[0],
    actual_payment_date: null,
    amount: invoice.total,
    client_id: invoice.client_id,
  });

  return predictedDate;
}

// ─── Cashflow Forecast ─────────────────────────────────────────

/**
 * Get a cashflow forecast for the next N days.
 *
 * Groups all unpaid cashflow_predictions by predicted_payment_date
 * and returns daily totals, sorted by date.
 *
 * @param supabase - Supabase client
 * @param tenantId - Tenant UUID
 * @param days - Number of days to forecast
 * @returns Array of CashflowForecastEntry, sorted by date ascending
 */
export async function getCashflowForecast(
  supabase: any,
  tenantId: string,
  days: number,
): Promise<CashflowForecastEntry[]> {
  const today = new Date();
  const endDate = addDays(today, days);

  // Fetch unpaid predictions within the forecast window
  const todayStr = today.toISOString().split("T")[0];
  const endDateStr = endDate.toISOString().split("T")[0];

  const { data: predictions } = await supabase
    .from("cashflow_predictions")
    .select("invoice_id, client_id, predicted_payment_date, amount, actual_payment_date")
    .eq("tenant_id", tenantId)
    .is("actual_payment_date", null)
    .gte("predicted_payment_date", todayStr)
    .lte("predicted_payment_date", endDateStr);

  const allPredictions = ((predictions ?? []) as Array<{
    invoice_id: string;
    client_id: string;
    predicted_payment_date: string;
    amount: number;
    actual_payment_date: string | null;
  }>).filter((p) => p.actual_payment_date == null);

  if (allPredictions.length === 0) {
    return [];
  }

  // Group by date
  const byDate = new Map<string, CashflowForecastEntry>();

  for (const prediction of allPredictions) {
    const date = prediction.predicted_payment_date;
    const existing = byDate.get(date);

    if (existing) {
      existing.expected_amount = round2(existing.expected_amount + prediction.amount);
      existing.invoice_count += 1;
      existing.invoices.push({
        invoice_id: prediction.invoice_id,
        client_id: prediction.client_id,
        amount: prediction.amount,
      });
    } else {
      byDate.set(date, {
        date,
        expected_amount: prediction.amount,
        invoice_count: 1,
        invoices: [
          {
            invoice_id: prediction.invoice_id,
            client_id: prediction.client_id,
            amount: prediction.amount,
          },
        ],
      });
    }
  }

  // Sort by date ascending
  const entries = Array.from(byDate.values());
  entries.sort((a, b) => a.date.localeCompare(b.date));

  return entries;
}
