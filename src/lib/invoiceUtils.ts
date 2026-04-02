/**
 * Utility functions for invoice calculations and formatting.
 */

/**
 * Calculate line total from quantity and unit price.
 * Rounds to 2 decimal places.
 */
export function calculateLineTotal(quantity: number, unitPrice: number): number {
  return Math.round(quantity * unitPrice * 100) / 100;
}

/**
 * Calculate invoice totals (subtotal, BTW, total) from line items.
 */
export function calculateInvoiceTotals(
  lines: { total: number }[],
  btwPercentage: number
): {
  subtotal: number;
  btwAmount: number;
  total: number;
} {
  const subtotal = Math.round(lines.reduce((sum, line) => sum + line.total, 0) * 100) / 100;
  const btwAmount = Math.round(subtotal * (btwPercentage / 100) * 100) / 100;
  const total = Math.round((subtotal + btwAmount) * 100) / 100;
  return { subtotal, btwAmount, total };
}

/**
 * Generate invoice lines from an order and associated client rates.
 *
 * Supported rate types:
 *   per_rit, per_pallet, per_km,
 *   toeslag_adr, toeslag_koel, toeslag_weekend, toeslag_spoed
 */
export function generateInvoiceLines(
  order: {
    order_number?: string;
    weight_kg?: number;
    quantity?: number;
    transport_type?: string;
    pickup_address?: string;
    delivery_address?: string;
  },
  rates: { rate_type: string; amount: number; description?: string }[]
): {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
}[] {
  const lines: {
    description: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    total: number;
  }[] = [];

  const rateMap = new Map(rates.map((r) => [r.rate_type, r]));

  // Per-rit (per trip) rate
  const perRit = rateMap.get("per_rit");
  if (perRit) {
    const pickup = order.pickup_address ?? "Ophaaladres";
    const delivery = order.delivery_address ?? "Afleveradres";
    const desc = perRit.description ?? `Transport ${pickup} → ${delivery}`;
    lines.push({
      description: desc,
      quantity: 1,
      unit: "rit",
      unitPrice: perRit.amount,
      total: calculateLineTotal(1, perRit.amount),
    });
  }

  // Per-pallet rate
  const perPallet = rateMap.get("per_pallet");
  if (perPallet && order.quantity && order.quantity > 0) {
    const desc = perPallet.description ?? "Palletvervoer";
    lines.push({
      description: desc,
      quantity: order.quantity,
      unit: "pallet",
      unitPrice: perPallet.amount,
      total: calculateLineTotal(order.quantity, perPallet.amount),
    });
  }

  // Per-km rate
  const perKm = rateMap.get("per_km");
  if (perKm) {
    // Default distance estimate when actual distance is not available
    const estimatedKm = 100;
    const desc = perKm.description ?? `Kilometervergoeding (geschat ${estimatedKm} km)`;
    lines.push({
      description: desc,
      quantity: estimatedKm,
      unit: "km",
      unitPrice: perKm.amount,
      total: calculateLineTotal(estimatedKm, perKm.amount),
    });
  }

  // Surcharges
  const surcharges: { type: string; label: string }[] = [
    { type: "toeslag_adr", label: "Toeslag ADR (gevaarlijke stoffen)" },
    { type: "toeslag_koel", label: "Toeslag koeltransport" },
    { type: "toeslag_weekend", label: "Toeslag weekend" },
    { type: "toeslag_spoed", label: "Toeslag spoed" },
  ];

  for (const surcharge of surcharges) {
    const rate = rateMap.get(surcharge.type);
    if (rate) {
      lines.push({
        description: rate.description ?? surcharge.label,
        quantity: 1,
        unit: "stuks",
        unitPrice: rate.amount,
        total: calculateLineTotal(1, rate.amount),
      });
    }
  }

  return lines;
}

/**
 * Format a number as Dutch currency: "€ 1.234,56"
 */
export function formatCurrency(amount: number): string {
  const fixed = Math.abs(amount).toFixed(2);
  const [intPart, decPart] = fixed.split(".");

  // Add thousand separators (dots) to the integer part
  const withSeparators = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  const formatted = `€ ${withSeparators},${decPart}`;
  return amount < 0 ? `- ${formatted}` : formatted;
}

/**
 * Format a date string or Date object as "dd-mm-yyyy" (Dutch format).
 */
export function formatDateNL(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}
