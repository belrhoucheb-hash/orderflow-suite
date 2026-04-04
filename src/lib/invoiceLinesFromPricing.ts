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

export function generateInvoiceLinesFromPricing(
  orderId: string,
  breakdown: PriceBreakdown,
): PricingInvoiceLine[] {
  const lines: PricingInvoiceLine[] = [];
  let sortOrder = 0;

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
