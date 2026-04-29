export type DriverCountryRestrictionType = "block" | "warning";

export interface DriverCountryRestrictionLike {
  driver_id: string;
  country_code: string;
  restriction_type: DriverCountryRestrictionType;
  reason?: string | null;
  active_from?: string | null;
  active_until?: string | null;
  is_active?: boolean | null;
}

export interface CountryAwareOrder {
  id: string;
  order_number?: number | null;
  pickup_country?: string | null;
  delivery_country?: string | null;
  pickup_address?: string | null;
  delivery_address?: string | null;
}

export interface DriverCountryRestrictionIssue {
  type: DriverCountryRestrictionType;
  countryCode: string;
  reason: string | null;
  orderIds: string[];
  orderNumbers: Array<number | string>;
}

const COUNTRY_ALIASES: Record<string, string[]> = {
  NL: ["NL", "NEDERLAND", "NETHERLANDS"],
  BE: ["BE", "BELGIE", "BELGIUM"],
  DE: ["DE", "DUITSLAND", "DEUTSCHLAND", "GERMANY"],
  FR: ["FR", "FRANKRIJK", "FRANCE"],
  LU: ["LU", "LUXEMBURG", "LUXEMBOURG"],
};

export function normalizeCountryCode(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toUpperCase();
  if (!trimmed) return null;
  if (/^[A-Z]{2}$/.test(trimmed)) return trimmed;
  const ascii = trimmed.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const [code, aliases] of Object.entries(COUNTRY_ALIASES)) {
    if (aliases.some((alias) => alias.normalize("NFD").replace(/[\u0300-\u036f]/g, "") === ascii)) {
      return code;
    }
  }
  return null;
}

export function inferCountryCodeFromAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  const normalized = address.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const tokens = normalized.split(/[^A-Z]+/).filter(Boolean);
  for (const [code, aliases] of Object.entries(COUNTRY_ALIASES)) {
    if (tokens.some((token) => aliases.map((alias) => alias.normalize("NFD").replace(/[\u0300-\u036f]/g, "")).includes(token))) {
      return code;
    }
  }
  return null;
}

export function getOrderCountryCodes(order: CountryAwareOrder): string[] {
  const codes = new Set<string>();
  const pickup = normalizeCountryCode(order.pickup_country) ?? inferCountryCodeFromAddress(order.pickup_address);
  const delivery = normalizeCountryCode(order.delivery_country) ?? inferCountryCodeFromAddress(order.delivery_address);
  if (pickup) codes.add(pickup);
  if (delivery) codes.add(delivery);
  return [...codes];
}

function isRestrictionActive(restriction: DriverCountryRestrictionLike, date?: string): boolean {
  if (restriction.is_active === false) return false;
  if (!date) return true;
  if (restriction.active_from && restriction.active_from > date) return false;
  if (restriction.active_until && restriction.active_until < date) return false;
  return true;
}

export function getDriverCountryRestrictionIssue(
  driverId: string | null | undefined,
  orders: CountryAwareOrder[],
  restrictions: DriverCountryRestrictionLike[],
  date?: string,
): DriverCountryRestrictionIssue | null {
  if (!driverId || orders.length === 0 || restrictions.length === 0) return null;

  const relevant = restrictions
    .filter((r) => r.driver_id === driverId && isRestrictionActive(r, date))
    .map((r) => ({ ...r, country_code: normalizeCountryCode(r.country_code) ?? r.country_code.toUpperCase() }))
    .filter((r) => /^[A-Z]{2}$/.test(r.country_code));

  const matches: Array<{ restriction: DriverCountryRestrictionLike; order: CountryAwareOrder }> = [];
  for (const order of orders) {
    const orderCountries = getOrderCountryCodes(order);
    for (const restriction of relevant) {
      if (orderCountries.includes(restriction.country_code)) {
        matches.push({ restriction, order });
      }
    }
  }

  if (matches.length === 0) return null;
  const chosen = matches.find((m) => m.restriction.restriction_type === "block") ?? matches[0];
  const sameCountryMatches = matches.filter(
    (m) =>
      m.restriction.country_code === chosen.restriction.country_code &&
      m.restriction.restriction_type === chosen.restriction.restriction_type,
  );

  return {
    type: chosen.restriction.restriction_type,
    countryCode: chosen.restriction.country_code,
    reason: chosen.restriction.reason ?? null,
    orderIds: [...new Set(sameCountryMatches.map((m) => m.order.id))],
    orderNumbers: [
      ...new Set(sameCountryMatches.map((m) => m.order.order_number ?? m.order.id)),
    ],
  };
}

export function formatDriverCountryRestrictionIssue(issue: DriverCountryRestrictionIssue): string {
  const label = issue.type === "block" ? "Blokkade" : "Waarschuwing";
  const orders = issue.orderNumbers.length > 0 ? ` voor order ${issue.orderNumbers.join(", ")}` : "";
  const reason = issue.reason ? `: ${issue.reason}` : "";
  return `${label}: chauffeur heeft landrestrictie ${issue.countryCode}${orders}${reason}`;
}
