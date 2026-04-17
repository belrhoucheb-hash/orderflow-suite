/**
 * Types for Plan F: Autonomous Financial Processing.
 *
 * Covers auto-invoicing logs, margin alerts, and cashflow predictions.
 */

// ─── Auto Invoice Log ───────��──────────────────────────────────

export interface AutoInvoiceLogEntry {
  id: string;
  tenant_id: string;
  invoice_id: string;
  trigger_trip_id: string;
  auto_calculated_total: number;
  final_total: number;
  price_accuracy_pct: number;
  was_auto_sent: boolean;
  created_at: string;
}

// ─── Margin Alerts ────��────────────────────────────────────────

export type MarginEntityType = "trip" | "client" | "route";
export type MarginAlertStatus = "ACTIVE" | "ACKNOWLEDGED" | "RESOLVED";

export interface MarginAlert {
  id: string;
  tenant_id: string;
  entity_type: MarginEntityType;
  entity_id: string;
  margin_pct: number;
  threshold_pct: number;
  alert_status: MarginAlertStatus;
  created_at: string;
}

// ─── Margin Calculation ─────────────��──────────────────────────

export interface MarginResult {
  revenue: number;
  costs: number;
  margin_eur: number;
  margin_pct: number;
}

// ─── Cashflow Predictions ──────���───────────────────────────────

export interface CashflowPrediction {
  id: string;
  tenant_id: string;
  invoice_id: string;
  predicted_payment_date: string;
  actual_payment_date: string | null;
  amount: number;
  client_id: string;
  created_at: string;
}

export interface CashflowForecastEntry {
  date: string;
  expected_amount: number;
  invoice_count: number;
  invoices: Array<{
    invoice_id: string;
    client_id: string;
    amount: number;
  }>;
}

// ─── Auto Invoicer Result ───────────���──────────────────────────

export interface AutoInvoiceResult {
  success: boolean;
  invoice_id: string | null;
  auto_sent: boolean;
  confidence: number;
  calculated_total: number;
  order_count: number;
  /** Reason if not auto-sent (e.g. "below_threshold", "no_orders", "error") */
  reason: string;
}

// ─── Pricing with Confidence ───────────────────────────────────
// Canoniek gedefinieerd in _shared/rateModels.ts, re-export voor bestaande imports.
export type { PriceBreakdownWithConfidence } from "@/types/rateModels";
