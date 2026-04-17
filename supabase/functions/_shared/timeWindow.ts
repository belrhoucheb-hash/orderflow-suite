/**
 * Tijd- en dagtype-matching voor toeslagen (TA-04).
 *
 * Timezone (R9): alle matching gebeurt in Europe/Amsterdam. De caller levert
 * pickup_time_local als "HH:mm" voor nu-kaf simpel string-compare, en
 * pickup_date als ISO-datum (YYYY-MM-DD) voor day_type afleiding.
 *
 * Als order.pickup_time_local of pickup_date ontbreekt: behandel als "match"
 * voor tijd/dag zodat een surcharge zonder time_from/time_to/day_type niet
 * wordt geblokkeerd door een order zonder tijd-info.
 */

import type { Surcharge, PricingOrderInput, DayType } from "./rateModels.ts";

/**
 * Vergelijk "HH:mm" strings als getallen. "07:30" -> 730.
 */
function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10));
  return h * 60 + m;
}

/**
 * Check of pickup_time binnen [time_from, time_to) valt.
 * Over-midnight vensters (bijv. 22:00-06:00) worden correct afgehandeld.
 */
export function timeInWindow(
  pickupHHmm: string,
  timeFrom: string,
  timeTo: string,
): boolean {
  const pickup = hhmmToMinutes(pickupHHmm);
  const from = hhmmToMinutes(timeFrom);
  const to = hhmmToMinutes(timeTo);

  if (from === to) return true;
  if (from < to) {
    // Normaal venster, bijv. 08:00-18:00
    return pickup >= from && pickup < to;
  }
  // Over-midnight, bijv. 22:00-06:00
  return pickup >= from || pickup < to;
}

/**
 * Leid day_type af uit een ISO-datum.
 * Feestdagen worden deze sprint niet gedetecteerd (zie R10), dus holiday-rijen
 * staan default op is_active = false. Een holiday-datum wordt hier als weekday
 * beschouwd tenzij het een zaterdag/zondag is.
 */
export function getDayType(isoDate: string): DayType {
  const d = new Date(isoDate + "T12:00:00");
  const day = d.getDay();
  if (day === 6) return "saturday";
  if (day === 0) return "sunday";
  return "weekday";
}

/**
 * Check of een surcharge op basis van tijd/dag van toepassing is.
 * Return true als geen tijd- of dagvoorwaarden zijn gezet, of als ze matchen.
 */
export function surchargeMatchesTime(
  surcharge: Surcharge,
  order: PricingOrderInput,
): boolean {
  // Tijd-venster check
  if (surcharge.time_from && surcharge.time_to) {
    if (!order.pickup_time_local) return false;
    if (!timeInWindow(order.pickup_time_local, surcharge.time_from, surcharge.time_to)) {
      return false;
    }
  }

  // Day-type check
  const dayType = surcharge.day_type ?? "any";
  if (dayType !== "any") {
    if (!order.pickup_date) return false;
    const orderDayType = getDayType(order.pickup_date);
    if (dayType !== orderDayType) return false;
  }

  return true;
}
