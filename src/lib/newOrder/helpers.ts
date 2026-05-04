import {
  EMPTY_ADDRESS,
  type AddressValue,
  type AddressSuggestionOption,
} from "@/components/clients/AddressAutocomplete";
import type { Client, ClientLocation } from "@/hooks/useClients";
import type { AddressBookEntry } from "@/hooks/useAddressBook";
import type { RoutePreviewMapStop } from "@/components/orders/RoutePreviewMap";
import type { OrderRouteRuleIssue } from "@/lib/validation/orderRouteRules";
import type { FinancialTabCargo } from "@/components/orders/FinancialTab";
import type {
  CargoRow,
  FreightLine,
  GooglePlaceDetailsResult,
  PlannerLocationOption,
  RouteLegInsight,
  SmartOrderDraft,
} from "./types";

export function toIsoDate(offsetDays = 0): string {
  const next = new Date();
  next.setDate(next.getDate() + offsetDays);
  return next.toISOString().slice(0, 10);
}

export function normalizeSmartText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function findKeywordIndex(haystack: string, keywords: string[]): number {
  const lower = normalizeSmartText(haystack).toLowerCase();
  const hits = keywords
    .map((keyword) => {
      const idx = lower.indexOf(keyword.toLowerCase());
      return idx >= 0 ? idx : Number.POSITIVE_INFINITY;
    })
    .filter((idx) => Number.isFinite(idx));
  return hits.length > 0 ? Math.min(...hits) : -1;
}

export function extractClientHint(raw: string): string {
  const splitIndex = findKeywordIndex(raw, [" ophalen ", " pickup ", " laden ", " van "]);
  const beforePickup = splitIndex >= 0 ? raw.slice(0, splitIndex) : raw;
  const cleaned = beforePickup
    .replace(/\b(?:vandaag|morgen|spoed|retour|ref(?:erentie)?|po|order(?:nummer)?)\b.*$/i, "")
    .split(",")[0]
    ?.trim() ?? "";
  return cleaned;
}

export function extractSegment(raw: string, keywords: string[], untilKeywords: string[]): string {
  const normalized = normalizeSmartText(raw);
  const startPattern = new RegExp(`\\b(?:${keywords.join("|")})\\b`, "i");
  const startMatch = normalized.match(startPattern);
  if (!startMatch || startMatch.index == null) return "";

  const fromStart = normalized.slice(startMatch.index + startMatch[0].length).trim();
  const stopPattern = new RegExp(`\\b(?:${untilKeywords.join("|")})\\b`, "i");
  const stopMatch = fromStart.match(stopPattern);
  const segment = stopMatch?.index != null ? fromStart.slice(0, stopMatch.index) : fromStart;
  return segment.replace(/\s+/g, " ").trim();
}

export function extractTimeRange(segment: string): { from: string; to: string } {
  const range = segment.match(/(\d{1,2}[:.]\d{2})\s*(?:-|tot|t\/m)\s*(\d{1,2}[:.]\d{2})/i);
  if (!range) return { from: "", to: "" };
  return {
    from: range[1].replace(".", ":").padStart(5, "0"),
    to: range[2].replace(".", ":").padStart(5, "0"),
  };
}

export function extractBeforeTime(segment: string): string {
  const before = normalizeSmartText(segment).match(/\b(?:voor|before)\s*(\d{1,2}[:.]\d{2})/i);
  return before?.[1]?.replace(".", ":").padStart(5, "0") ?? "";
}

export function extractExactTime(segment: string): string {
  const normalized = normalizeSmartText(segment);
  const direct = normalized.match(/\b(?:om|at)?\s*(\d{1,2}[:.]\d{2})\b/i);
  return direct?.[1]?.replace(".", ":").padStart(5, "0") ?? "";
}

export function extractDateValue(raw: string): string {
  const normalized = normalizeSmartText(raw).toLowerCase();
  if (/\bvandaag\b/.test(normalized)) return toIsoDate(0);
  if (/\bmorgen\b/.test(normalized)) return toIsoDate(1);

  const explicit = normalized.match(/\b(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?\b/);
  if (!explicit) return "";

  const day = Number(explicit[1]);
  const month = Number(explicit[2]);
  const currentYear = new Date().getFullYear();
  const year = explicit[3] ? Number(explicit[3].length === 2 ? `20${explicit[3]}` : explicit[3]) : currentYear;
  if (!day || !month || !year) return "";

  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

export function cleanupLocationText(value: string): string {
  return normalizeSmartText(value)
    .replace(/\b(?:vandaag|morgen)\b.*$/i, "")
    .replace(/\b(?:voor|before)\s*\d{1,2}[:.]\d{2}\b.*$/i, "")
    .replace(/\b\d{1,2}[:.]\d{2}\s*(?:-|tot)\s*\d{1,2}[:.]\d{2}\b.*$/i, "")
    .replace(/\bom\s*\d{1,2}[:.]\d{2}\b.*$/i, "")
    .replace(/\b\d+\s*(?:pallets?|colli|box|kg)\b.*$/i, "")
    .replace(/[.,;]\s*$/g, "")
    .trim();
}

export function parseSmartOrderInput(raw: string, clientMatches: Client[]): SmartOrderDraft {
  const pickupSegment = extractSegment(raw, ["ophalen", "pickup", "laden", "van"], ["afleveren", "delivery", "lossen", "naar", "vandaag", "morgen"]);
  const deliverySegment = extractSegment(raw, ["afleveren", "delivery", "lossen", "naar"], ["vandaag", "morgen", "spoed", "retour", "ref", "po"]);
  const pickupRange = extractTimeRange(raw);
  const deliveryRange = extractTimeRange(deliverySegment);
  const pickupExact = extractExactTime(pickupSegment);
  const deliveryExact = extractExactTime(deliverySegment || raw);
  const deliveryBefore = extractBeforeTime(deliverySegment || raw);
  const weightMatch = raw.match(/(\d+(?:[.,]\d+)?)\s*kg\b/i);
  const palletMatch = raw.match(/(\d+)\s*pallets?\b/i);
  const colliMatch = raw.match(/(\d+)\s*colli\b/i);
  const boxMatch = raw.match(/(\d+)\s*box(?:en)?\b/i);
  const referenceMatch = raw.match(/\b(?:ref(?:erentie)?|po|order(?:nummer)?)\s*[:#-]?\s*([A-Za-z0-9/_-]+)/i);
  const parsedDate = extractDateValue(raw);
  const matchedClient = clientMatches.find((client) => raw.toLowerCase().includes(client.name.toLowerCase()))
    ?? clientMatches.find((client) => extractClientHint(raw).toLowerCase().includes(client.name.toLowerCase()))
    ?? clientMatches[0]
    ?? null;

  const quantityMatch = palletMatch ?? colliMatch ?? boxMatch;
  const unit = palletMatch ? "Pallets" : colliMatch ? "Colli" : "Box";

  const draft: SmartOrderDraft = {
    raw,
    clientHint: matchedClient?.name ?? extractClientHint(raw),
    pickupHint: cleanupLocationText(pickupSegment),
    deliveryHint: cleanupLocationText(deliverySegment),
    pickupDate: parsedDate,
    pickupFrom: pickupRange.from || pickupExact,
    pickupTo: pickupRange.to,
    deliveryDate: parsedDate,
    deliveryBefore: deliveryBefore || deliveryRange.to || deliveryExact,
    quantity: quantityMatch?.[1] ?? "",
    unit,
    weightKg: weightMatch?.[1]?.replace(",", ".") ?? "",
    reference: referenceMatch?.[1] ?? "",
    priority: /\bspoed|express\b/i.test(raw) ? "Spoed" : /\bretour\b/i.test(raw) ? "Retour" : "Standaard",
    missing: [],
    matchedClientId: matchedClient?.id ?? null,
    matchedClientName: matchedClient?.name ?? null,
  };

  draft.missing = [
    !draft.clientHint && "klant",
    !draft.pickupHint && "ophaaladres",
    !draft.deliveryHint && "afleveradres",
    !draft.quantity && "aantal",
    !draft.weightKg && "gewicht",
    !draft.pickupDate && !draft.deliveryDate && !draft.pickupFrom && !draft.deliveryBefore && "datum/tijd",
  ].filter(Boolean) as string[];

  return draft;
}

export function normalizeLookup(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function addressLooksIncompleteWarning(address: AddressValue, composed: string | null | undefined): string | null {
  if (!composed?.trim()) return null;
  if (!address.street || (!address.zipcode && !address.city)) {
    return "Adres is onvolledig: controleer straat, postcode en plaats.";
  }
  if (address.zipcode && address.city && !/\d/.test(address.zipcode)) {
    return "Postcode lijkt niet te kloppen bij de plaats.";
  }
  return null;
}

export function cargoRowIssue(row: CargoRow, index: number): string | null {
  const hasAnyValue = Boolean(row.aantal || row.gewicht || row.omschrijving || row.adr || row.lengte || row.breedte || row.hoogte);
  if (!hasAnyValue) return null;
  const label = `Ladingregel ${index + 1}`;
  if (!row.eenheid) return `${label}: eenheid is verplicht.`;
  if ((parseInt(row.aantal, 10) || 0) <= 0) return `${label}: aantal moet groter zijn dan 0.`;
  if ((parseFloat(row.gewicht) || 0) <= 0) return `${label}: gewicht moet groter zijn dan 0.`;
  return null;
}

export function vehicleCapacityIssue(
  vehicleType: string,
  cargo: FinancialTabCargo,
): string | null {
  if (!vehicleType) return null;
  const normalized = vehicleType.toLowerCase();
  const capacity = normalized.includes("bestel")
    ? { label: "Bestelbus", maxWeightKg: 1200, maxPallets: 6, maxLengthCm: 420, maxWidthCm: 180, maxHeightCm: 190 }
    : normalized.includes("trailer")
      ? { label: "Trailer", maxWeightKg: 24000, maxPallets: 33, maxLengthCm: 1360, maxWidthCm: 250, maxHeightCm: 280 }
      : normalized.includes("vracht")
        ? { label: "Vrachtwagen", maxWeightKg: 12000, maxPallets: 18, maxLengthCm: 750, maxWidthCm: 245, maxHeightCm: 260 }
        : null;
  if (!capacity) return null;
  if (cargo.totalWeightKg > capacity.maxWeightKg) {
    return `Voertuig ongeschikt: ${capacity.label} kan maximaal ${capacity.maxWeightKg.toLocaleString("nl-NL")} kg laden.`;
  }
  if ((cargo.unit || "").toLowerCase().includes("pallet") && (cargo.totalQuantity ?? 0) > capacity.maxPallets) {
    return `Voertuig ongeschikt: ${capacity.label} heeft maximaal ${capacity.maxPallets} palletplaatsen.`;
  }
  if (cargo.maxLengthCm > capacity.maxLengthCm || cargo.maxWidthCm > capacity.maxWidthCm || cargo.maxHeightCm > capacity.maxHeightCm) {
    return `Voertuig ongeschikt: afmetingen passen niet globaal in ${capacity.label}.`;
  }
  return null;
}

export function routeQuestionForIssue(issue: OrderRouteRuleIssue | undefined): 1 | 2 | 3 | 4 {
  if (!issue) return 4;
  if (issue.key === "route_duplicate") return issue.label === "Levermoment" ? 2 : 4;
  if (issue.key === "pickup_time_window") return 3;
  return 4;
}

export function toRad(value: number): number {
  return (value * Math.PI) / 180;
}

export function roadDistanceKm(
  from: Pick<FreightLine, "lat" | "lng">,
  to: Pick<FreightLine, "lat" | "lng">,
): number | null {
  if (from.lat == null || from.lng == null || to.lat == null || to.lng == null) return null;
  const earthKm = 6371;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const straightKm = 2 * earthKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.max(1, straightKm * 1.28);
}

export function totalRouteDistanceKm(stops: RoutePreviewMapStop[]): number | null {
  const mappedStops = stops.filter((stop) => stop.line?.lat != null && stop.line?.lng != null);
  if (mappedStops.length < 2 || mappedStops.length !== stops.length) return null;

  let total = 0;
  for (let index = 0; index < mappedStops.length - 1; index += 1) {
    const from = mappedStops[index].line;
    const to = mappedStops[index + 1].line;
    if (!from || !to) return null;
    const distance = roadDistanceKm(from, to);
    if (distance == null) return null;
    total += distance;
  }

  return Math.round(total * 10) / 10;
}

export function routeAverageSpeedKmh(vehicle: string): number {
  const normalized = vehicle.toLowerCase();
  if (normalized.includes("bus")) return 72;
  if (normalized.includes("vracht") || normalized.includes("truck")) return 62;
  return 66;
}

export function parseRouteDeparture(line: FreightLine): Date | null {
  if (!line.datum || !line.tijd) return null;
  const date = new Date(`${line.datum}T${line.tijd}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDuration(minutes: number): string {
  const rounded = Math.max(1, Math.round(minutes));
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  if (hours <= 0) return `${mins} min`;
  return `${hours}u ${mins.toString().padStart(2, "0")}`;
}

export function formatEta(date: Date): string {
  return date.toLocaleString("nl-NL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function buildRouteLegInsights(
  stops: RoutePreviewMapStop[],
  vehicle: string,
): RouteLegInsight[] {
  const speed = routeAverageSpeedKmh(vehicle);
  return stops.slice(0, -1).map((stop, index) => {
    const next = stops[index + 1];
    const from = stop.line;
    const to = next.line;
    const distance = from && to ? roadDistanceKm(from, to) : null;
    const minutes = distance == null ? null : (distance / speed) * 60;
    const departure = from ? parseRouteDeparture(from) : null;
    const eta = departure && minutes != null
      ? new Date(departure.getTime() + minutes * 60_000)
      : null;

    return {
      id: `${stop.id}-${next.id}`,
      fromLabel: stop.label,
      toLabel: next.label,
      distanceLabel: distance == null ? "GPS nodig" : `± ${Math.round(distance)} km`,
      durationLabel: minutes == null ? "ETA volgt" : `± ${formatDuration(minutes)}`,
      etaLabel: eta ? `ETA ${formatEta(eta)}` : "Datum/tijd nodig",
      hasGps: distance != null,
    };
  });
}

export function addressTextFromUnknown(address: unknown): string {
  if (typeof address === "string") return address.trim();
  if (!address || typeof address !== "object") return "";

  const record = address as Record<string, unknown>;
  if (typeof record.display === "string" && record.display.trim()) {
    return record.display.trim();
  }

  return [
    [record.street, record.house_number, record.house_number_suffix].filter((part) => typeof part === "string" && part.trim()).join(" "),
    [record.zipcode, record.city].filter((part) => typeof part === "string" && part.trim()).join(" "),
    typeof record.country === "string" ? record.country : "",
  ]
    .filter((part) => part.trim())
    .join(", ")
    .trim();
}

export function bestEffortAddressValue(address: unknown, fallbackCountry = "NL"): AddressValue {
  const trimmed = addressTextFromUnknown(address);
  if (!trimmed) return { ...EMPTY_ADDRESS, country: fallbackCountry };
  const parts = trimmed.split(",").map((part) => part.trim()).filter(Boolean);
  const streetPart = parts[0] ?? trimmed;
  const streetMatch = streetPart.match(/^(.*?)(?:\s+(\d+[A-Za-z]?))(?:\s+([A-Za-z0-9-]+))?$/);
  const postcodeMatch = trimmed.match(/\b\d{4}\s?[A-Z]{2}\b/i);
  const countryMatch = parts[parts.length - 1]?.length === 2 ? parts[parts.length - 1].toUpperCase() : fallbackCountry;
  const cityPart = parts.length > 1 ? parts[1].replace(/\b\d{4}\s?[A-Z]{2}\b/i, "").trim() : "";

  return {
    street: streetMatch?.[1]?.trim() || streetPart,
    house_number: streetMatch?.[2]?.trim() || "",
    house_number_suffix: streetMatch?.[3]?.trim() || "",
    zipcode: postcodeMatch?.[0]?.toUpperCase() || "",
    city: cityPart,
    country: countryMatch || fallbackCountry,
    lat: null,
    lng: null,
    coords_manual: false,
  };
}

export function addressValueFromGoogleDetails(
  details: GooglePlaceDetailsResult,
  fallbackAddress: string,
): AddressValue {
  return {
    ...bestEffortAddressValue(details.formatted_address || fallbackAddress, details.country || "NL"),
    street: details.street || details.formatted_address || fallbackAddress,
    house_number: details.house_number || "",
    house_number_suffix: "",
    zipcode: details.zipcode || "",
    city: details.city || "",
    country: details.country || "NL",
    lat: typeof details.lat === "number" ? details.lat : null,
    lng: typeof details.lng === "number" ? details.lng : null,
    coords_manual: false,
  };
}

export function composeSearchLabel(address: AddressValue): string {
  return [address.street, address.house_number, address.house_number_suffix].filter(Boolean).join(" ");
}

export function shouldLearnAlias(alias: string, resolvedAddress: string): boolean {
  const normalizedAlias = normalizeLookup(alias);
  if (normalizedAlias.length < 3) return false;
  return normalizedAlias !== normalizeLookup(resolvedAddress);
}

export function sanitizeFreightLine(line: FreightLine): FreightLine {
  const vehicleTypeLabel = typeof line.vehicleTypeLabel === "string" ? line.vehicleTypeLabel : null;
  const vehicleTypeId = typeof line.vehicleTypeId === "string" ? line.vehicleTypeId : null;
  return {
    ...line,
    locatie: addressTextFromUnknown(line.locatie),
    vehicleTypeId,
    vehicleTypeLabel,
  };
}

export function hasUsableAddress(addr: AddressValue): boolean {
  const street = addr.street.trim();
  const hasLocality = Boolean(addr.zipcode.trim() || addr.city.trim());
  const hasResolvedLocation = addr.lat != null && addr.lng != null;
  const looksLikeFullGoogleLabel = street.includes(",");

  return Boolean(street && (hasLocality || hasResolvedLocation || looksLikeFullGoogleLabel));
}

export function addressValueFromFreightLine(line: FreightLine | null | undefined): AddressValue {
  if (!line?.locatie) {
    return { ...EMPTY_ADDRESS, country: "NL" };
  }
  return {
    ...bestEffortAddressValue(line.locatie),
    lat: line.lat ?? null,
    lng: line.lng ?? null,
    coords_manual: line.coords_manual ?? false,
  };
}

export function addressFromClientRecord(client: Client | null | undefined, type: "main" | "shipping"): AddressValue {
  if (!client) return { ...EMPTY_ADDRESS };
  if (type === "shipping") {
    return {
      street: client.shipping_street || "",
      house_number: client.shipping_house_number || "",
      house_number_suffix: client.shipping_house_number_suffix || "",
      zipcode: client.shipping_zipcode || "",
      city: client.shipping_city || "",
      country: client.shipping_country || "NL",
      lat: client.shipping_lat,
      lng: client.shipping_lng,
      coords_manual: client.shipping_coords_manual,
    };
  }
  return {
    street: client.street || "",
    house_number: client.house_number || "",
    house_number_suffix: client.house_number_suffix || "",
    zipcode: client.zipcode || "",
    city: client.city || "",
    country: client.country || "NL",
    lat: client.lat,
    lng: client.lng,
    coords_manual: client.coords_manual,
  };
}

export function addressFromAddressBookEntry(entry: AddressBookEntry): AddressValue {
  return {
    street: entry.street || "",
    house_number: entry.house_number || "",
    house_number_suffix: entry.house_number_suffix || "",
    zipcode: entry.zipcode || "",
    city: entry.city || "",
    country: entry.country || "NL",
    lat: entry.lat,
    lng: entry.lng,
    coords_manual: entry.coords_manual,
  };
}

export function addressFromClientLocation(location: ClientLocation): AddressValue {
  return {
    street: location.street || "",
    house_number: location.house_number || "",
    house_number_suffix: location.house_number_suffix || "",
    zipcode: location.zipcode || "",
    city: location.city || "",
    country: location.country || "NL",
    lat: location.lat,
    lng: location.lng,
    coords_manual: location.coords_manual,
  };
}

export function toAddressSuggestionOption(option: PlannerLocationOption): AddressSuggestionOption {
  return {
    id: option.id,
    title: option.label,
    subtitle: option.subtitle,
    badge: option.badge,
    value: option.value,
  };
}
