/**
 * Rate card selectie (G1, G2, R25, R27).
 *
 * Selecteert de juiste rate_card voor een order uit een lijst van actieve
 * kandidaten, op basis van:
 *   - geldigheid op order.pickup_date (niet now(), voor historische juistheid)
 *   - specificiteit score (klant > traject > voertuigtype > basis)
 *   - tie-break op sort_order (als aanwezig) of created_at
 *
 * Pure functie, geen Supabase dependency. Caller doet de database-fetch.
 */

import type { RateCard, RateRule, PricingOrderInput } from "./rateModels.ts";

export interface RateCardSelection {
  card: RateCard;
  score: number;
  reason: string;
}

export interface RateCardSelectionError {
  error: "no_rate_card" | "ambiguous_rate_cards";
  reason: string;
  candidates?: string[];
}

export type RateCardResult = RateCardSelection | RateCardSelectionError;

function isValidOn(card: RateCard, pickupDate: string | undefined): boolean {
  if (!pickupDate) return true;
  if (card.valid_from && pickupDate < card.valid_from) return false;
  if (card.valid_until && pickupDate > card.valid_until) return false;
  return true;
}

function hasTrajectMatch(card: RateCard, order: PricingOrderInput): boolean {
  const rules = card.rate_rules ?? [];
  const pickupCountry = order.pickup_country ?? "";
  const deliveryCountry = order.delivery_country ?? "";
  return rules.some((r: RateRule) => {
    const { from_zone, to_zone } = r.conditions;
    if (!from_zone && !to_zone) return false;
    if (from_zone && from_zone !== pickupCountry) return false;
    if (to_zone && to_zone !== deliveryCountry) return false;
    return true;
  });
}

function hasVehicleTypeMatch(card: RateCard, order: PricingOrderInput): boolean {
  if (!order.vehicle_type_id) return false;
  const rules = card.rate_rules ?? [];
  return rules.some((r: RateRule) => r.vehicle_type_id === order.vehicle_type_id);
}

function scoreCard(card: RateCard, order: PricingOrderInput, clientId: string | null): number {
  let score = 1; // basis
  if (clientId && card.client_id === clientId) score += 1000;
  if (hasTrajectMatch(card, order)) score += 100;
  if (hasVehicleTypeMatch(card, order)) score += 10;
  return score;
}

/**
 * Kies de beste rate_card voor een order uit de kandidaten.
 *
 * @param candidates Alle actieve rate_cards voor de tenant, inclusief
 *                   client-specifieke én tenant-default (client_id IS NULL).
 * @param order Input met pickup_date voor geldigheid en pickup/delivery_country
 *              voor traject-match.
 * @param clientId Klant van de order. Null als klant onbekend.
 */
export function selectRateCard(
  candidates: RateCard[],
  order: PricingOrderInput,
  clientId: string | null,
): RateCardResult {
  const active = candidates.filter((c) => c.is_active);
  const valid = active.filter((c) => isValidOn(c, order.pickup_date));
  const eligible = valid.filter(
    (c) => c.client_id === clientId || c.client_id === null,
  );

  if (eligible.length === 0) {
    if (valid.length === 0 && active.length > 0) {
      return {
        error: "no_rate_card",
        reason: `Geen tariefkaart geldig op ${order.pickup_date ?? "onbekende datum"}.`,
      };
    }
    return {
      error: "no_rate_card",
      reason: clientId
        ? "Geen tariefkaart gekoppeld aan deze klant, en geen tenant-default."
        : "Geen tariefkaart beschikbaar.",
    };
  }

  const scored = eligible.map((c) => ({ card: c, score: scoreCard(c, order, clientId) }));
  const maxScore = Math.max(...scored.map((s) => s.score));
  const top = scored.filter((s) => s.score === maxScore);

  if (top.length > 1) {
    const withSort = top.filter((s) => s.card).sort((a, b) => {
      const sa = (a.card as unknown as { sort_order?: number }).sort_order ?? 0;
      const sb = (b.card as unknown as { sort_order?: number }).sort_order ?? 0;
      return sb - sa;
    });
    const [first, second] = withSort;
    const firstSort = (first.card as unknown as { sort_order?: number }).sort_order ?? 0;
    const secondSort = (second.card as unknown as { sort_order?: number }).sort_order ?? 0;
    if (firstSort === secondSort) {
      return {
        error: "ambiguous_rate_cards",
        reason:
          `Meerdere tariefkaarten hebben dezelfde prioriteit voor deze order (${top.length}). ` +
          `Stel een sort_order in of deactiveer een van de kaarten.`,
        candidates: top.map((s) => s.card.id),
      };
    }
    return {
      card: first.card,
      score: first.score,
      reason: buildReason(first.card, first.score, clientId),
    };
  }

  const winner = top[0];
  return {
    card: winner.card,
    score: winner.score,
    reason: buildReason(winner.card, winner.score, clientId),
  };
}

function buildReason(card: RateCard, score: number, clientId: string | null): string {
  const parts: string[] = [];
  if (clientId && card.client_id === clientId) parts.push("klant-specifiek");
  if (score >= 1100) parts.push("traject-match");
  if (score === 1 || score === 101 || score === 11) parts.push("tenant-default");
  const label = parts.length > 0 ? parts.join(", ") : "basis";
  return `${card.name} (${label})`;
}
