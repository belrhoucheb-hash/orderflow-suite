import type {
  RateCard, RateRule, Surcharge, PricingOrderInput,
  PriceBreakdown, PriceLineItem, PriceSurchargeItem, RuleType,
} from "@/types/rateModels";
import { RULE_TYPE_UNITS } from "@/types/rateModels";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function matchesTransportType(rule: RateRule, order: PricingOrderInput): boolean {
  if (!rule.transport_type) return true;
  return rule.transport_type === order.transport_type;
}

function matchesZone(rule: RateRule, order: PricingOrderInput): boolean {
  const { from_zone, to_zone } = rule.conditions;
  if (!from_zone && !to_zone) return true;
  if (from_zone && from_zone !== (order.pickup_country ?? "")) return false;
  if (to_zone && to_zone !== (order.delivery_country ?? "")) return false;
  return true;
}

function matchesStaffelTier(rule: RateRule, order: PricingOrderInput): boolean {
  const { weight_from, weight_to, distance_from, distance_to } = rule.conditions;
  if (weight_from != null && weight_to != null) {
    const weight = order.weight_kg ?? 0;
    return weight >= weight_from && weight < weight_to;
  }
  if (distance_from != null && distance_to != null) {
    return order.distance_km >= distance_from && order.distance_km < distance_to;
  }
  return true;
}

function getQuantityForRule(ruleType: RuleType, order: PricingOrderInput): number {
  switch (ruleType) {
    case "PER_KM": return order.distance_km;
    case "PER_UUR": return order.duration_hours;
    case "PER_STOP": return order.stop_count;
    case "PER_PALLET": return order.quantity ?? 0;
    case "PER_KG": return order.weight_kg ?? 0;
    case "VAST_BEDRAG": return 1;
    case "ZONE_TARIEF": return 1;
    case "STAFFEL": return 0;
    default: return 0;
  }
}

function getStaffelQuantity(rule: RateRule, order: PricingOrderInput): number {
  const { weight_from, weight_to, distance_from, distance_to } = rule.conditions;
  if (weight_from != null && weight_to != null) return order.weight_kg ?? 0;
  if (distance_from != null && distance_to != null) return order.distance_km;
  return 1;
}

function getStaffelUnit(rule: RateRule): string {
  if (rule.conditions.weight_from != null) return "kg";
  if (rule.conditions.distance_from != null) return "km";
  return "stuk";
}

function surchargeApplies(surcharge: Surcharge, order: PricingOrderInput): boolean {
  if (!surcharge.is_active) return false;
  const a = surcharge.applies_to;
  if (!a || Object.keys(a).length === 0) return true;
  if (a.requirements && a.requirements.length > 0) {
    if (!a.requirements.every((req) => order.requirements.includes(req))) return false;
  }
  if (a.day_of_week && a.day_of_week.length > 0) {
    if (!a.day_of_week.includes(order.day_of_week)) return false;
  }
  if (a.waiting_time_above_min != null) {
    if (order.waiting_time_min <= a.waiting_time_above_min) return false;
  }
  if (a.transport_type) {
    if (a.transport_type !== order.transport_type) return false;
  }
  return true;
}

function calculateSurchargeAmount(surcharge: Surcharge, baseAmount: number, order: PricingOrderInput): number {
  switch (surcharge.surcharge_type) {
    case "PERCENTAGE": return round2(baseAmount * (surcharge.amount / 100));
    case "VAST_BEDRAG": return round2(surcharge.amount);
    case "PER_KM": return round2(order.distance_km * surcharge.amount);
    case "PER_KG": return round2((order.weight_kg ?? 0) * surcharge.amount);
    default: return 0;
  }
}

export function calculateOrderPrice(
  order: PricingOrderInput,
  rateCard: RateCard,
  surcharges: Surcharge[],
): PriceBreakdown {
  const rules = rateCard.rate_rules ?? [];
  const regels: PriceLineItem[] = [];
  const sortedRules = [...rules].sort((a, b) => a.sort_order - b.sort_order);

  for (const rule of sortedRules) {
    if (!matchesTransportType(rule, order)) continue;

    let quantity: number;
    let unit: string;
    let description: string;

    switch (rule.rule_type) {
      case "ZONE_TARIEF": {
        if (!matchesZone(rule, order)) continue;
        quantity = 1;
        unit = RULE_TYPE_UNITS.ZONE_TARIEF;
        const from = rule.conditions.from_zone ?? "?";
        const to = rule.conditions.to_zone ?? "?";
        description = `Zone tarief ${from} → ${to}`;
        break;
      }
      case "STAFFEL": {
        if (!matchesStaffelTier(rule, order)) continue;
        quantity = getStaffelQuantity(rule, order);
        unit = getStaffelUnit(rule);
        const tierDesc = rule.conditions.weight_from != null
          ? `${rule.conditions.weight_from}-${rule.conditions.weight_to} kg`
          : `${rule.conditions.distance_from}-${rule.conditions.distance_to} km`;
        description = `Staffeltarief (${tierDesc})`;
        break;
      }
      default: {
        quantity = getQuantityForRule(rule.rule_type, order);
        unit = RULE_TYPE_UNITS[rule.rule_type] ?? "stuk";
        description = `${rule.rule_type.replace(/_/g, " ")} ${quantity} ${unit} x EUR ${rule.amount}`;
        break;
      }
    }

    if (quantity <= 0) continue;
    let lineTotal = round2(quantity * rule.amount);
    if (rule.min_amount != null && lineTotal < rule.min_amount) {
      lineTotal = round2(rule.min_amount);
    }
    regels.push({ description, quantity, unit, unit_price: rule.amount, total: lineTotal, rule_type: rule.rule_type });
  }

  const basisbedrag = round2(regels.reduce((sum, r) => sum + r.total, 0));
  const toeslagen: PriceSurchargeItem[] = [];
  for (const surcharge of surcharges) {
    if (!surchargeApplies(surcharge, order)) continue;
    const amount = calculateSurchargeAmount(surcharge, basisbedrag, order);
    if (amount > 0) toeslagen.push({ name: surcharge.name, type: surcharge.surcharge_type, amount });
  }
  const surchargeTotal = round2(toeslagen.reduce((sum, t) => sum + t.amount, 0));
  const totaal = round2(basisbedrag + surchargeTotal);
  return { basisbedrag, toeslagen, totaal, regels };
}
