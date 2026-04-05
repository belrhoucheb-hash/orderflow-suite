/**
 * Convert a PriceBreakdown into invoice line items
 * compatible with the existing invoice system.
 */

import type { PriceBreakdown } from "@/types/rateModels";

export interface PricingInvoiceLine {
  order_id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total: number;
  sort_order: number;
}

/**
 * Generate invoice lines from a pricing engine breakdown.
 * Base rule lines come first, followed by surcharge lines.
 */
export function generateInvoiceLinesFromPricing(
  orderId: string,
  breakdown: PriceBreakdown,
): PricingInvoiceLine[] {
  const lines: PricingInvoiceLine[] = [];
  let sortOrder = 0;

  // Add base rule lines
  for (const regel of breakdown.regels) {
    lines.push({
      order_id: orderId,
      description: regel.description,
      quantity: regel.quantity,
      unit: regel.unit,
      unit_price: regel.unit_price,
      total: regel.total,
      sort_order: sortOrder++,
    });
  }

  // Add surcharge lines
  for (const toeslag of breakdown.toeslagen) {
    lines.push({
      order_id: orderId,
      description: `Toeslag: ${toeslag.name}`,
      quantity: 1,
      unit: "toeslag",
      unit_price: toeslag.amount,
      total: toeslag.amount,
      sort_order: sortOrder++,
    });
  }

  return lines;
}
