import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Save, X, Check, Printer, Download, Mail, Plus, Trash2, Clock, Route, ChevronDown, Sparkles, ArrowRight, CircleAlert, CheckCircle2, ClipboardPaste, Truck, Search, Pencil } from "lucide-react";
import { AddressAutocomplete as LegacyAddressAutocomplete } from "@/components/AddressAutocomplete";
import {
  AddressAutocomplete,
  EMPTY_ADDRESS,
  type AddressValue,
  type AddressResolvedSelection,
  type AddressSuggestionOption,
} from "@/components/clients/AddressAutocomplete";
import { composeAddressString } from "@/lib/validation/clientSchema";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverAnchor } from "@/components/ui/popover";
import { toast } from "sonner";
import { ZodError } from "zod";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { useTenantOptional } from "@/contexts/TenantContext";
import { useAuthOptional } from "@/contexts/AuthContext";
import {
  useClient,
  useClients,
  useClientLocations,
  useClientOrders,
  useTenantLocationSearch,
  type Client,
  type ClientLocation,
} from "@/hooks/useClients";
import { useClientContacts } from "@/hooks/useClientContacts";
import { commitOrderDraftWithLegs, createShipmentWithLegs, inferAfdelingAsync, type BookingInput } from "@/lib/trajectRouter";
import { previewLegs, type TrajectPreview } from "@/lib/trajectPreview";
import { supabase } from "@/integrations/supabase/client";
import { TRACKABLE_FIELDS, defaultExpectedBy } from "@/hooks/useOrderInfoRequests";
import { learnAddress, resolveClientAddress } from "@/lib/addressResolver";
import { orderFormSchema } from "@/lib/validation/orderSchema";
import { getOrderRouteRuleIssues, type OrderRouteRuleIssue } from "@/lib/validation/orderRouteRules";
import {
  ORDER_PRICING_ENGINE_VERSION,
  ORDER_VALIDATION_ENGINE_VERSION,
  validateOrderDraft,
  type OrderDraft,
  type ReadinessIssue,
  type ReadinessSeverity,
} from "@/lib/orderDraft";
import { useAddressSuggestions } from "@/hooks/useAddressSuggestions";
import {
  useAddressBookSearch,
  useUpsertAddressBookEntry,
  type AddressBookEntry,
} from "@/hooks/useAddressBook";
import { buildAddressBookKey } from "@/lib/addressBook";
// Orders-audit is server-side via trigger `audit_orders`.
import { LuxeDatePicker } from "@/components/LuxeDatePicker";
import { LuxeTimePicker } from "@/components/LuxeTimePicker";
import type { FinancialTabPayload, FinancialTabCargo } from "@/components/orders/FinancialTab";
import { IntakeSourceBadge } from "@/components/intake/IntakeSourceBadge";
import type { RoutePreviewMapStop } from "@/components/orders/RoutePreviewMap";

const FinancialTab = lazy(() =>
  import("@/components/orders/FinancialTab").then((module) => ({ default: module.FinancialTab })),
);
const RoutePreviewMap = lazy(() =>
  import("@/components/orders/RoutePreviewMap").then((module) => ({ default: module.RoutePreviewMap })),
);

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debouncedValue;
}

type MainTab = "algemeen" | "financieel" | "vrachtdossier";
type BottomTab = "vrachmeen" | "additionele_diensten" | "overige_referenties";
type WizardStep = "intake" | "route" | "cargo" | "financial" | "review";
type ServerDraftLifecycleStatus = "DRAFT" | "PENDING" | "NEEDS_REVIEW" | "PLANNED" | "CANCELLED" | "ON_HOLD" | "ABANDONED";
type DraftSaveStatus = "idle" | "creating" | "saving" | "saved" | "error" | "conflict";

interface FreightLine {
  id: string;
  activiteit: "Laden" | "Lossen";
  companyName?: string;
  locatie: string;
  datum: string;
  tijd: string;
  tijdTot: string;
  referentie: string;
  contactLocatie: string;
  opmerkingen: string;
  driverInstructions?: string;
  requiresTailLift?: boolean;
  temperatureControlled?: boolean;
  photoRequired?: boolean;
  // Optionele coord-info per leg, voorbereidend voor hub-routing
  // op afstand en betere Webfleet-export per stop.
  lat?: number | null;
  lng?: number | null;
  coords_manual?: boolean;
}

type RouteStopKind = "pickup" | "stop" | "delivery";

interface RouteStopModel {
  id: string;
  sequence: number;
  kind: RouteStopKind;
  line: FreightLine;
  title: string;
  shortTitle: string;
  fallback: string;
  missingAddress: boolean;
  missingDate: boolean;
  isFinal: boolean;
}

interface FreightSummaryItem {
  id: string;
  aankomstdatum: string;
  aantal: string;
  bestemming: string;
  gewicht: string;
  laadreferentie: string;
  losreferentie: string;
  tijdslot: string;
  eenheid: string;
  afmetingen: string;
}

interface CargoRow {
  id: string;
  aantal: string;
  eenheid: string;
  gewicht: string;
  lengte: string;
  breedte: string;
  hoogte: string;
  stapelbaar: boolean;
  adr: string;
  omschrijving: string;
}

interface PlannerLocationOption {
  id: string;
  label: string;
  subtitle: string;
  badge: string;
  value: AddressValue;
  addressString: string;
  companyName?: string;
  contactHint?: string;
  notesHint?: string;
  driverInstructions?: string;
  requiresTailLift?: boolean;
  temperatureControlled?: boolean;
  photoRequired?: boolean;
  timeWindowStart?: string | null;
  timeWindowEnd?: string | null;
}

interface PlannerTemplate {
  id: string;
  label: string;
  description: string;
  transportType?: string;
  prioriteit?: string;
  afdeling?: string;
  voertuigtype?: string;
  klepNodig?: boolean;
  shipmentSecure?: boolean;
}

interface SmartOrderDraft {
  raw: string;
  clientHint: string;
  pickupHint: string;
  deliveryHint: string;
  pickupDate: string;
  pickupFrom: string;
  pickupTo: string;
  deliveryDate: string;
  deliveryBefore: string;
  quantity: string;
  unit: "Pallets" | "Colli" | "Box";
  weightKg: string;
  reference: string;
  priority: "Standaard" | "Spoed" | "Retour";
  missing: string[];
  matchedClientId?: string | null;
  matchedClientName?: string | null;
}

const today = new Date().toISOString().split("T")[0];
const todayFormatted = new Date().toLocaleDateString("nl-NL", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

const QUICK_TEMPLATES: PlannerTemplate[] = [
  {
    id: "standard-pallet",
    label: "Standaard palletzending",
    description: "Normale rit met standaard prioriteit en LTL-profiel.",
    transportType: "LTL",
    prioriteit: "Standaard",
    voertuigtype: "Vrachtwagen",
    shipmentSecure: true,
  },
  {
    id: "express",
    label: "Express rit",
    description: "Spoedtransport met expressinstelling en hogere prioriteit.",
    transportType: "Express",
    prioriteit: "Spoed",
    voertuigtype: "Bestelbus",
    shipmentSecure: true,
  },
  {
    id: "return",
    label: "Retour ophalen",
    description: "Retourstroom met standaard prioriteit en laadklep-optie aan.",
    transportType: "LTL",
    prioriteit: "Retour",
    voertuigtype: "Vrachtwagen",
    klepNodig: true,
    shipmentSecure: true,
  },
  {
    id: "export",
    label: "Luchtvracht export",
    description: "Exportsjabloon met EXPORT-afdeling en snelle afhandeling.",
    transportType: "Luchtvracht",
    prioriteit: "Spoed",
    afdeling: "EXPORT",
    voertuigtype: "Bestelbus",
    shipmentSecure: false,
  },
];

const WIZARD_STEPS: { key: WizardStep; label: string; hint: string }[] = [
  { key: "intake", label: "Klant", hint: "Opdrachtgever kiezen" },
  { key: "route", label: "Route", hint: "Stops, adressen en tijdvensters" },
  { key: "cargo", label: "Transport", hint: "Lading, gewicht en voertuig" },
  { key: "financial", label: "Tarief", hint: "Prijs en toeslagen" },
  { key: "review", label: "Controle", hint: "Valideren en aanmaken" },
];

function toIsoDate(offsetDays = 0): string {
  const next = new Date();
  next.setDate(next.getDate() + offsetDays);
  return next.toISOString().slice(0, 10);
}

function normalizeSmartText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findKeywordIndex(haystack: string, keywords: string[]): number {
  const lower = normalizeSmartText(haystack).toLowerCase();
  const hits = keywords
    .map((keyword) => {
      const idx = lower.indexOf(keyword.toLowerCase());
      return idx >= 0 ? idx : Number.POSITIVE_INFINITY;
    })
    .filter((idx) => Number.isFinite(idx));
  return hits.length > 0 ? Math.min(...hits) : -1;
}

function extractClientHint(raw: string): string {
  const splitIndex = findKeywordIndex(raw, [" ophalen ", " pickup ", " laden ", " van "]);
  const beforePickup = splitIndex >= 0 ? raw.slice(0, splitIndex) : raw;
  const cleaned = beforePickup
    .replace(/\b(?:vandaag|morgen|spoed|retour|ref(?:erentie)?|po|order(?:nummer)?)\b.*$/i, "")
    .split(",")[0]
    ?.trim() ?? "";
  return cleaned;
}

function extractSegment(raw: string, keywords: string[], untilKeywords: string[]): string {
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

function extractTimeRange(segment: string): { from: string; to: string } {
  const range = segment.match(/(\d{1,2}[:.]\d{2})\s*(?:-|tot|t\/m)\s*(\d{1,2}[:.]\d{2})/i);
  if (!range) return { from: "", to: "" };
  return {
    from: range[1].replace(".", ":").padStart(5, "0"),
    to: range[2].replace(".", ":").padStart(5, "0"),
  };
}

function extractBeforeTime(segment: string): string {
  const before = normalizeSmartText(segment).match(/\b(?:voor|before)\s*(\d{1,2}[:.]\d{2})/i);
  return before?.[1]?.replace(".", ":").padStart(5, "0") ?? "";
}

function extractExactTime(segment: string): string {
  const normalized = normalizeSmartText(segment);
  const direct = normalized.match(/\b(?:om|at)?\s*(\d{1,2}[:.]\d{2})\b/i);
  return direct?.[1]?.replace(".", ":").padStart(5, "0") ?? "";
}

function extractDateValue(raw: string): string {
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

function cleanupLocationText(value: string): string {
  return normalizeSmartText(value)
    .replace(/\b(?:vandaag|morgen)\b.*$/i, "")
    .replace(/\b(?:voor|before)\s*\d{1,2}[:.]\d{2}\b.*$/i, "")
    .replace(/\b\d{1,2}[:.]\d{2}\s*(?:-|tot)\s*\d{1,2}[:.]\d{2}\b.*$/i, "")
    .replace(/\bom\s*\d{1,2}[:.]\d{2}\b.*$/i, "")
    .replace(/\b\d+\s*(?:pallets?|colli|box|kg)\b.*$/i, "")
    .replace(/[.,;]\s*$/g, "")
    .trim();
}

function parseSmartOrderInput(raw: string, clientMatches: Client[]): SmartOrderDraft {
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

function normalizeLookup(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function addressLooksIncompleteWarning(address: AddressValue, composed: string | null | undefined): string | null {
  if (!composed?.trim()) return null;
  if (!address.street || (!address.zipcode && !address.city)) {
    return "Adres is onvolledig: controleer straat, postcode en plaats.";
  }
  if (address.zipcode && address.city && !/\d/.test(address.zipcode)) {
    return "Postcode lijkt niet te kloppen bij de plaats.";
  }
  return null;
}

function cargoRowIssue(row: CargoRow, index: number): string | null {
  const hasAnyValue = Boolean(row.aantal || row.gewicht || row.omschrijving || row.adr || row.lengte || row.breedte || row.hoogte);
  if (!hasAnyValue) return null;
  const label = `Ladingregel ${index + 1}`;
  if (!row.eenheid) return `${label}: eenheid is verplicht.`;
  if ((parseInt(row.aantal) || 0) <= 0) return `${label}: aantal moet groter zijn dan 0.`;
  if ((parseFloat(row.gewicht) || 0) <= 0) return `${label}: gewicht moet groter zijn dan 0.`;
  return null;
}

function vehicleCapacityIssue(
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

function routeQuestionForIssue(issue: OrderRouteRuleIssue | undefined): 1 | 2 | 3 | 4 {
  if (!issue) return 4;
  if (issue.key === "route_duplicate") return issue.label === "Levermoment" ? 2 : 4;
  if (issue.key === "pickup_time_window") return 3;
  return 4;
}

interface RouteLegInsight {
  id: string;
  fromLabel: string;
  toLabel: string;
  distanceLabel: string;
  durationLabel: string;
  etaLabel: string;
  hasGps: boolean;
}

interface GooglePlaceDetailsResult {
  formatted_address?: string;
  street?: string;
  house_number?: string;
  zipcode?: string;
  city?: string;
  country?: string;
  lat?: number | null;
  lng?: number | null;
}

function toRad(value: number): number {
  return (value * Math.PI) / 180;
}

function roadDistanceKm(
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

function totalRouteDistanceKm(stops: RoutePreviewMapStop[]): number | null {
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

function routeAverageSpeedKmh(vehicle: string): number {
  const normalized = vehicle.toLowerCase();
  if (normalized.includes("bus")) return 72;
  if (normalized.includes("vracht") || normalized.includes("truck")) return 62;
  return 66;
}

function parseRouteDeparture(line: FreightLine): Date | null {
  if (!line.datum || !line.tijd) return null;
  const date = new Date(`${line.datum}T${line.tijd}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDuration(minutes: number): string {
  const rounded = Math.max(1, Math.round(minutes));
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  if (hours <= 0) return `${mins} min`;
  return `${hours}u ${mins.toString().padStart(2, "0")}`;
}

function formatEta(date: Date): string {
  return date.toLocaleString("nl-NL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildRouteLegInsights(
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

function addressValueFromGoogleDetails(
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

function composeSearchLabel(address: AddressValue): string {
  return [address.street, address.house_number, address.house_number_suffix].filter(Boolean).join(" ");
}

function shouldLearnAlias(alias: string, resolvedAddress: string): boolean {
  const normalizedAlias = normalizeLookup(alias);
  if (normalizedAlias.length < 3) return false;
  return normalizedAlias !== normalizeLookup(resolvedAddress);
}

function bestEffortAddressValue(address: string | null | undefined, fallbackCountry = "NL"): AddressValue {
  if (!address) return { ...EMPTY_ADDRESS, country: fallbackCountry };
  const trimmed = address.trim();
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

function hasUsableAddress(addr: AddressValue): boolean {
  const street = addr.street.trim();
  const hasLocality = Boolean(addr.zipcode.trim() || addr.city.trim());
  const hasResolvedLocation = addr.lat != null && addr.lng != null;
  const looksLikeFullGoogleLabel = street.includes(",");

  return Boolean(street && (hasLocality || hasResolvedLocation || looksLikeFullGoogleLabel));
}

function addressValueFromFreightLine(line: FreightLine | null | undefined): AddressValue {
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

function addressFromClientRecord(client: Client | null | undefined, type: "main" | "shipping"): AddressValue {
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

function addressFromAddressBookEntry(entry: AddressBookEntry): AddressValue {
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

function addressFromClientLocation(location: ClientLocation): AddressValue {
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

function toAddressSuggestionOption(option: PlannerLocationOption): AddressSuggestionOption {
  return {
    id: option.id,
    title: option.label,
    subtitle: option.subtitle,
    badge: option.badge,
    value: option.value,
  };
}

const NewOrder = () => {
  const navigate = useNavigate();
  const { tenant } = useTenantOptional();
  const { user } = useAuthOptional();
  const [searchParams] = useSearchParams();
  const initialClientId = searchParams.get("client_id");
  const fromOrderId = searchParams.get("from_order_id");
  const [saving, setSaving] = useState(false);
  const [trajectPreview, setTrajectPreview] = useState<TrajectPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [mainTab, setMainTab] = useState<MainTab>("algemeen");
  const [bottomTab, setBottomTab] = useState<BottomTab>("vrachmeen");
  const [wizardStep, setWizardStep] = useState<WizardStep>("intake");
  const [intakeActiveQuestion, setIntakeActiveQuestion] = useState<1 | 2>(1);
  const [intakeManualBack, setIntakeManualBack] = useState(false);
  const [routeActiveQuestion, setRouteActiveQuestion] = useState<1 | 2 | 3 | 4>(1);
  const [routeManualBack, setRouteManualBack] = useState(false);
  const [cargoActiveQuestion, setCargoActiveQuestion] = useState<1 | 2 | 3 | 4>(1);
  const [cargoManualBack, setCargoManualBack] = useState(false);
  const [reviewActiveQuestion, setReviewActiveQuestion] = useState<1 | 2 | 3>(1);
  const [smartInput, setSmartInput] = useState("");
  const [smartApplied, setSmartApplied] = useState(false);

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  const clearError = useCallback((field: string) => {
    setErrors(prev => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  // Form state
  const [clientName, setClientName] = useState("");
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientQuestionConfirmed, setClientQuestionConfirmed] = useState(false);
  const [clientOpen, setClientOpen] = useState(false);
  const clientListToggleUntilRef = useRef(0);
  const { data: clientSuggestions = [] } = useClients(clientName.trim() || undefined);
  const clientListOpen = clientOpen && clientSuggestions.length > 0;
  const smartClientLookup = useMemo(() => extractClientHint(smartInput), [smartInput]);
  const { data: smartClientMatches = [] } = useClients(smartClientLookup || undefined);
  const { data: selectedClient } = useClient(clientId);
  const { data: clientLocations = [] } = useClientLocations(clientId);
  const { data: addressSuggestions } = useAddressSuggestions(clientName.trim() || null, clientId || null);
  const { data: clientContacts = [] } = useClientContacts(clientId);
  const [contactpersoon, setContactpersoon] = useState("");
  const [prioriteit, setPrioriteit] = useState("Standaard");
  const [klantReferentie, setKlantReferentie] = useState("");
  const [transportType, setTransportType] = useState("");
  const [transportTypeManual, setTransportTypeManual] = useState(false);
  const [afdeling, setAfdeling] = useState("");
  const [afdelingManual, setAfdelingManual] = useState(false);
  const [inferredAfdeling, setInferredAfdeling] = useState<string | null>(null);
  const [voertuigtype, setVoertuigtype] = useState("");
  const [voertuigtypeManual, setVoertuigtypeManual] = useState(false);
  const [chauffeur, setChauffeur] = useState("");
  const [mrnDoc, setMrnDoc] = useState("");
  const [referentie, setReferentie] = useState("");
  const [draftRestored, setDraftRestored] = useState(false);
  const [lastDraftSavedAt, setLastDraftSavedAt] = useState<string | null>(null);
  const [serverDraftId, setServerDraftId] = useState<string | null>(null);
  const [serverDraftReady, setServerDraftReady] = useState(false);
  const [serverDraftUpdatedAt, setServerDraftUpdatedAt] = useState<string | null>(null);
  const [serverDraftUpdatedBy, setServerDraftUpdatedBy] = useState<string | null>(null);
  const [draftSaveStatus, setDraftSaveStatus] = useState<DraftSaveStatus>("idle");
  const [draftSaveError, setDraftSaveError] = useState<string | null>(null);
  const [serverBaselineSignature, setServerBaselineSignature] = useState<string | null>(null);
  const serverDraftCreateStartedRef = useRef(false);
  const draftAutosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pickupLookup, setPickupLookup] = useState("");
  const [deliveryLookup, setDeliveryLookup] = useState("");

  // Detailed freight entry
  const [quantity, setQuantity] = useState("");
  const [transportEenheid, setTransportEenheid] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [afstand, setAfstand] = useState("");
  const [totaleDuur, setTotaleDuur] = useState("");
  const [afmetingen, setAfmetingen] = useState("");

  // Time windows
  const [pickupTimeFrom, setPickupTimeFrom] = useState("");
  const [pickupTimeTo, setPickupTimeTo] = useState("");
  const [deliveryTimeFrom, setDeliveryTimeFrom] = useState("");
  const [deliveryTimeTo, setDeliveryTimeTo] = useState("");

  // Freight summary (items added via "Toevoegen aan Vrachtlijst")
  const [freightSummary, setFreightSummary] = useState<FreightSummaryItem[]>([]);

  // §22 Info-tracking: welke velden "volgt van klant"
  const [infoFollows, setInfoFollows] = useState<Record<string, boolean>>({});
  const [infoContactName, setInfoContactName] = useState("");
  const [infoContactEmail, setInfoContactEmail] = useState("");

  const toggleInfoFollow = (fieldName: string) => {
    setInfoFollows(prev => ({ ...prev, [fieldName]: !prev[fieldName] }));
  };

  // Klep / laadklep
  const [klepNodig, setKlepNodig] = useState(false);

  // PMT (EDD / X-RAY) — conditioneel bij luchtvracht
  const [shipmentSecure, setShipmentSecure] = useState(true);
  const [pmtMethode, setPmtMethode] = useState<"" | "edd" | "xray">("");
  const [pmtOperator, setPmtOperator] = useState("");
  const [pmtReferentie, setPmtReferentie] = useState("");
  const [pmtDatum, setPmtDatum] = useState("");
  const [pmtLocatie, setPmtLocatie] = useState("");
  const [pmtSeal, setPmtSeal] = useState("");
  const [pmtByCustomer, setPmtByCustomer] = useState(true);
  const showPmt = transportType === "Luchtvracht";

  // Financieel state, gevuld door FinancialTab via onPricingChange.
  const [pricingPayload, setPricingPayload] = useState<FinancialTabPayload>({ cents: null, details: null });

  // Freight lines
  const [freightLines, setFreightLines] = useState<FreightLine[]>([
    { id: "1", activiteit: "Laden", locatie: "", datum: "", tijd: "", tijdTot: "", referentie: "", contactLocatie: "", opmerkingen: "" },
    { id: "2", activiteit: "Lossen", locatie: "", datum: "", tijd: "", tijdTot: "", referentie: "", contactLocatie: "", opmerkingen: "" },
  ]);

  // Gestructureerd pickup- en delivery-adres met Google autocomplete + sleepbare pin.
  // Deze staan naast `freightLines[n].locatie` (plain string) zodat de bestaande
  // trajectRouter-preview en validatie blijven werken, terwijl chauffeurs
  // via lat/lng exact weten waar ze moeten zijn (Jaimy's Webfleet/TomTom-issue).
  const [pickupAddr, setPickupAddr] = useState<AddressValue>({ ...EMPTY_ADDRESS });
  const [deliveryAddr, setDeliveryAddr] = useState<AddressValue>({ ...EMPTY_ADDRESS });
  const [pickupAddressBookLabel, setPickupAddressBookLabel] = useState<{ label: string; key: string } | null>(null);
  const [deliveryAddressBookLabel, setDeliveryAddressBookLabel] = useState<{ label: string; key: string } | null>(null);
  const { data: pickupClientMatches = [] } = useClients(pickupLookup.trim() || undefined);
  const { data: deliveryClientMatches = [] } = useClients(deliveryLookup.trim() || undefined);
  const { data: pickupLocationMatches = [] } = useTenantLocationSearch(pickupLookup);
  const { data: deliveryLocationMatches = [] } = useTenantLocationSearch(deliveryLookup);
  const { data: pickupAddressBookMatches = [] } = useAddressBookSearch(pickupLookup);
  const { data: deliveryAddressBookMatches = [] } = useAddressBookSearch(deliveryLookup);
  const upsertAddressBookEntry = useUpsertAddressBookEntry();
  const draftStorageKey = useMemo(() => {
    if (!tenant?.id || initialClientId || fromOrderId) return null;
    return `new-order-draft:${tenant.id}`;
  }, [tenant?.id, initialClientId, fromOrderId]);
  const serverDraftStorageKey = useMemo(() => {
    if (!tenant?.id || initialClientId || fromOrderId) return null;
    return `new-order-draft-id:${tenant.id}`;
  }, [tenant?.id, initialClientId, fromOrderId]);

  // Prefill vanuit ?client_id=, geïnitieerd vanuit de klantenlijst of
  // klant-detail ("Nieuwe order voor deze klant"). We fetchen de klant en
  // zijn laatste order, en vullen daarmee pickup/delivery/unit/afdeling/
  // vehicle_type/priority/requirements voor. Datum, tijd, gewicht, aantal
  // en referenties blijven leeg — die zijn per order uniek en prefillen
  // zou silent errors verbergen.
  const prefillApplied = useRef(false);
  const clientDefaultsAppliedRef = useRef<string | null>(null);
  const learnedAliasKeysRef = useRef(new Set<string>());
  const routeGpsResolveAttemptsRef = useRef(new Set<string>());
  const { data: prefillClient } = useClient(initialClientId);
  const { data: prefillOrders } = useClientOrders(initialClientId);

  useEffect(() => {
    if (!clientId) clientDefaultsAppliedRef.current = null;
  }, [clientId]);

  const addFreightLine = () => {
    setFreightLines(prev => [...prev, {
      id: crypto.randomUUID(), activiteit: "Lossen", locatie: "", datum: "", tijd: "", tijdTot: "", referentie: "", contactLocatie: "", opmerkingen: "",
      lat: null, lng: null, coords_manual: false,
    }]);
  };

  const removeFreightLine = (id: string) => {
    if (freightLines.length <= 1) return;
    setFreightLines(prev => prev.filter(l => l.id !== id));
  };

  // Eerste Laden/Lossen freightLine, gekoppeld aan het gestructureerde
  // pickup/delivery-adres (incl. lat/lng, postcode, plaats).
  const primaryLadenId = useMemo(
    () => freightLines.find(l => l.activiteit === "Laden")?.id ?? null,
    [freightLines],
  );
  const primaryLossenId = useMemo(
    () => freightLines.find(l => l.activiteit === "Lossen")?.id ?? null,
    [freightLines],
  );

  const handlePickupAddrChange = useCallback((v: AddressValue) => {
    setPickupAddr(v);
    setPickupAddressBookLabel((prev) => {
      if (!prev) return null;
      return prev.key === buildAddressBookKey(v) ? prev : null;
    });
    clearError("pickup_address");
    const composed = hasUsableAddress(v) ? composeAddressString(v, { includeLocality: true }) : "";
    // Sync plain-string locatie zodat trajectRouter-preview, isValidAddress
    // en afdeling-inferentie blijven werken zonder aanpassingen. Daarnaast
    // ook lat/lng/coords_manual op de leg zetten voor toekomstige hub-routing
    // en Webfleet-export per stop.
    if (primaryLadenId) {
      setFreightLines(prev => prev.map(l => l.id === primaryLadenId ? {
        ...l, locatie: composed, lat: v.lat, lng: v.lng, coords_manual: v.coords_manual,
      } : l));
    }
  }, [clearError, primaryLadenId]);

  const handleDeliveryAddrChange = useCallback((v: AddressValue) => {
    setDeliveryAddr(v);
    setDeliveryAddressBookLabel((prev) => {
      if (!prev) return null;
      return prev.key === buildAddressBookKey(v) ? prev : null;
    });
    clearError("delivery_address");
    const composed = hasUsableAddress(v) ? composeAddressString(v, { includeLocality: true }) : "";
    if (primaryLossenId) {
      setFreightLines(prev => prev.map(l => l.id === primaryLossenId ? {
        ...l, locatie: composed, lat: v.lat, lng: v.lng, coords_manual: v.coords_manual,
      } : l));
    }
  }, [clearError, primaryLossenId]);

  const applyPlannerLocation = useCallback((
    kind: "pickup" | "delivery",
    option: PlannerLocationOption,
  ) => {
    if (kind === "pickup") {
      handlePickupAddrChange(option.value);
      setPickupLookup(option.label);
      if (primaryLadenId) {
        setFreightLines(prev => prev.map(line => line.id === primaryLadenId ? {
          ...line,
          companyName: option.companyName || option.label || line.companyName,
          contactLocatie: line.contactLocatie || option.contactHint || "",
          opmerkingen: line.opmerkingen || option.notesHint || "",
          driverInstructions: option.driverInstructions || line.driverInstructions || "",
          requiresTailLift: option.requiresTailLift ?? line.requiresTailLift,
          temperatureControlled: option.temperatureControlled ?? line.temperatureControlled,
          photoRequired: option.photoRequired ?? line.photoRequired,
          tijd: line.tijd || option.timeWindowStart || "",
          tijdTot: line.tijdTot || option.timeWindowEnd || "",
        } : line));
      }
      return;
    }

    handleDeliveryAddrChange(option.value);
    setDeliveryLookup(option.label);
    if (primaryLossenId) {
      setFreightLines(prev => prev.map(line => line.id === primaryLossenId ? {
        ...line,
        companyName: option.companyName || option.label || line.companyName,
        contactLocatie: line.contactLocatie || option.contactHint || "",
        opmerkingen: line.opmerkingen || option.notesHint || "",
        driverInstructions: option.driverInstructions || line.driverInstructions || "",
        requiresTailLift: option.requiresTailLift ?? line.requiresTailLift,
        temperatureControlled: option.temperatureControlled ?? line.temperatureControlled,
        photoRequired: option.photoRequired ?? line.photoRequired,
        tijd: line.tijd || option.timeWindowStart || "",
        tijdTot: line.tijdTot || option.timeWindowEnd || "",
      } : line));
    }
  }, [handleDeliveryAddrChange, handlePickupAddrChange, primaryLadenId, primaryLossenId]);

  const updateFreightLine = <K extends keyof FreightLine>(id: string, field: K, value: FreightLine[K]) => {
    setFreightLines(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));
    if (field === "datum" || field === "tijd" || field === "tijdTot") {
      setErrors(prev => {
        if (!prev.pickup_time_window && !prev.delivery_time_window && !prev.route_sequence) return prev;
        const next = { ...prev };
        delete next.pickup_time_window;
        delete next.delivery_time_window;
        delete next.route_sequence;
        return next;
      });
    }
    // Wanneer iets de locatie-string van de primaire Laden/Lossen-regel wijzigt
    // buiten de Google-adres-flow om, kunnen adres en lat/lng uiteenlopen.
    // Markeer coords dan als handmatig zodat chauffeurs geen verouderde
    // coordinaten krijgen en de planner het verschil ziet.
    if (field === "locatie") {
      setErrors(prev => {
        if (!prev.route_duplicate) return prev;
        const next = { ...prev };
        delete next.route_duplicate;
        return next;
      });
      if (id === primaryLadenId) {
        setPickupAddr(prev => (prev.coords_manual ? prev : { ...prev, coords_manual: true }));
      } else if (id === primaryLossenId) {
        setDeliveryAddr(prev => (prev.coords_manual ? prev : { ...prev, coords_manual: true }));
      }
    }
  };

  const updateFreightLineAddress = useCallback((id: string, value: AddressValue, option?: PlannerLocationOption) => {
    const composed =
      option?.addressString ||
      (hasUsableAddress(value) ? composeAddressString(value, { includeLocality: true }) : "") ||
      composeSearchLabel(value) ||
      value.street;

    setFreightLines(prev => prev.map(line => line.id === id ? {
      ...line,
      companyName: option?.companyName || option?.label || line.companyName,
      locatie: composed,
      lat: value.lat,
      lng: value.lng,
      coords_manual: value.coords_manual,
      opmerkingen: option?.notesHint || line.opmerkingen,
      driverInstructions: option?.driverInstructions || line.driverInstructions,
      requiresTailLift: option?.requiresTailLift ?? line.requiresTailLift,
      temperatureControlled: option?.temperatureControlled ?? line.temperatureControlled,
      photoRequired: option?.photoRequired ?? line.photoRequired,
      tijd: option?.timeWindowStart || line.tijd,
      tijdTot: option?.timeWindowEnd || line.tijdTot,
    } : line));
    setErrors(prev => {
      if (!prev.route_duplicate && !prev.delivery_address) return prev;
      const next = { ...prev };
      delete next.route_duplicate;
      delete next.delivery_address;
      return next;
    });
  }, []);

  const maybeLearnClientAlias = useCallback(async (selection: AddressResolvedSelection) => {
    if (!tenant?.id || !clientId) return;
    const alias = selection.searchTerm.trim();
    const resolvedAddress = composeAddressString(selection.value, { includeLocality: true });
    if (!shouldLearnAlias(alias, resolvedAddress)) return;

    const cacheKey = `${clientId}:${normalizeLookup(alias)}:${normalizeLookup(resolvedAddress)}`;
    if (learnedAliasKeysRef.current.has(cacheKey)) return;
    learnedAliasKeysRef.current.add(cacheKey);

    try {
      await learnAddress(
        supabase,
        tenant.id,
        clientId,
        alias,
        resolvedAddress,
        selection.value.lat,
        selection.value.lng,
      );
    } catch (error) {
      learnedAliasKeysRef.current.delete(cacheKey);
      console.warn("Failed to learn client address alias", error);
    }
  }, [clientId, tenant?.id]);

  const tryResolveLearnedAddress = useCallback(async (
    kind: "pickup" | "delivery",
    searchTerm: string,
  ) => {
    if (!tenant?.id || !clientId) return;
    const alias = searchTerm.trim();
    if (alias.length < 3) return;

    const resolved = await resolveClientAddress(supabase, tenant.id, clientId, alias);
    if (!resolved) return;

    const nextValue = {
      ...bestEffortAddressValue(resolved.resolved_address),
      lat: resolved.resolved_lat,
      lng: resolved.resolved_lng,
      coords_manual: false,
    };

    if (kind === "pickup") {
      handlePickupAddrChange(nextValue);
      return;
    }

    handleDeliveryAddrChange(nextValue);
  }, [clientId, handleDeliveryAddrChange, handlePickupAddrChange, tenant?.id]);

  // Bij blur checken we of de drie kritische velden gevuld zijn. Zo niet,
  // dan zetten we meteen een error neer zodat de gebruiker niet pas bij
  // submit ziet dat straat, postcode of plaats ontbreken.
    const validateStructuredAddress = (addr: AddressValue): string | null => {
      if (!hasUsableAddress(addr)) {
        return "Vul minimaal straat en postcode of plaats in";
      }
      return null;
    };
  const handlePickupAddrBlur = () => {
    const err = validateStructuredAddress(pickupAddr);
    if (err) setErrors(prev => ({ ...prev, pickup_address: err }));
  };
  const handleDeliveryAddrBlur = () => {
    const err = validateStructuredAddress(deliveryAddr);
    if (err) setErrors(prev => ({ ...prev, delivery_address: err }));
  };

  useEffect(() => {
    if (!tenant?.id || !clientId) return;
    const term = pickupLookup.trim();
    if (term.length < 3) return;

    const currentSearch = composeSearchLabel(pickupAddr);
    const currentResolved = composeAddressString(pickupAddr, { includeLocality: true });
    if ([currentSearch, currentResolved].some(value => normalizeLookup(value) === normalizeLookup(term))) {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void tryResolveLearnedAddress("pickup", term).catch((error) => {
        if (!cancelled) console.warn("Failed to resolve learned pickup address", error);
      });
    }, 280);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [clientId, pickupAddr, pickupLookup, tenant?.id, tryResolveLearnedAddress]);

  useEffect(() => {
    if (!tenant?.id || !clientId) return;
    const term = deliveryLookup.trim();
    if (term.length < 3) return;

    const currentSearch = composeSearchLabel(deliveryAddr);
    const currentResolved = composeAddressString(deliveryAddr, { includeLocality: true });
    if ([currentSearch, currentResolved].some(value => normalizeLookup(value) === normalizeLookup(term))) {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void tryResolveLearnedAddress("delivery", term).catch((error) => {
        if (!cancelled) console.warn("Failed to resolve learned delivery address", error);
      });
    }, 280);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [clientId, deliveryAddr, deliveryLookup, tenant?.id, tryResolveLearnedAddress]);

  const pickupQuickOptions = useMemo<PlannerLocationOption[]>(() => {
    const options: PlannerLocationOption[] = [];
    if (selectedClient) {
      const shippingAddress = addressFromClientRecord(selectedClient, "shipping");
      const shippingComposed = composeAddressString(shippingAddress, { includeLocality: true });
      if (shippingComposed) {
        options.push({
          id: `client-shipping-${selectedClient.id}`,
          label: `${selectedClient.name} · standaard ophaaladres`,
          subtitle: shippingComposed,
          badge: "Klantdefault",
          value: shippingAddress,
          addressString: shippingComposed,
          companyName: selectedClient.name,
          contactHint: selectedClient.contact_person || undefined,
        });
      }

      const mainAddress = addressFromClientRecord(selectedClient, "main");
      const mainComposed = composeAddressString(mainAddress, { includeLocality: true });
      if (mainComposed && mainComposed !== shippingComposed) {
        options.push({
          id: `client-main-${selectedClient.id}`,
          label: `${selectedClient.name} · hoofdadres`,
          subtitle: mainComposed,
          badge: "Klant",
          value: mainAddress,
          addressString: mainComposed,
          companyName: selectedClient.name,
          contactHint: selectedClient.contact_person || undefined,
        });
      }
    }

    clientLocations.forEach((location) => {
      const value = addressFromClientLocation(location);
      const composed = composeAddressString(value, { includeLocality: true }) || location.address;
      options.push({
        id: `location-${location.id}`,
        label: location.label,
        subtitle: composed,
        badge: location.location_type || "Locatie",
        value,
        addressString: composed,
        companyName: selectedClient?.name || undefined,
        notesHint: location.notes || undefined,
        driverInstructions: location.notes || undefined,
        timeWindowStart: location.time_window_start,
        timeWindowEnd: location.time_window_end,
      });
    });

    addressSuggestions?.pickup?.forEach((suggestion, index) => {
      options.push({
        id: `pickup-history-${index}`,
        label: suggestion.address,
        subtitle: `Gebruikt in ${suggestion.frequency} eerdere order${suggestion.frequency > 1 ? "s" : ""}`,
        badge: "Recent",
        value: bestEffortAddressValue(suggestion.address),
        addressString: suggestion.address,
        companyName: clientName || undefined,
      });
    });

    pickupClientMatches.forEach((client) => {
      const shipping = addressFromClientRecord(client, "shipping");
      const shippingComposed = composeAddressString(shipping, { includeLocality: true });
      if (shippingComposed) {
        options.push({
          id: `pickup-client-match-${client.id}`,
          label: client.name,
          subtitle: shippingComposed,
          badge: "Bedrijf",
          value: shipping,
          addressString: shippingComposed,
          companyName: client.name,
          contactHint: client.contact_person || undefined,
        });
      }
    });

    pickupLocationMatches.forEach((location) => {
      const value = addressFromClientLocation(location);
      const composed = composeAddressString(value, { includeLocality: true }) || location.address;
      options.push({
        id: `pickup-global-location-${location.id}`,
        label: location.client_name ? `${location.client_name} · ${location.label}` : location.label,
        subtitle: composed,
        badge: "Locatie",
        value,
        addressString: composed,
        companyName: location.client_name || undefined,
        notesHint: location.notes || undefined,
        driverInstructions: location.notes || undefined,
        timeWindowStart: location.time_window_start,
        timeWindowEnd: location.time_window_end,
      });
    });

    pickupAddressBookMatches.forEach((entry) => {
      const value = addressFromAddressBookEntry(entry);
      const composed = composeAddressString(value, { includeLocality: true }) || entry.address;
      options.push({
        id: `pickup-address-book-${entry.id}`,
        label: entry.company_name || entry.label,
        subtitle: composed,
        badge: "Adresboek",
        value,
        addressString: composed,
        companyName: entry.company_name || entry.label,
        notesHint: entry.notes || undefined,
        driverInstructions: entry.driver_instructions || entry.notes || undefined,
        requiresTailLift: entry.requires_tail_lift,
        temperatureControlled: entry.temperature_controlled,
        photoRequired: entry.photo_required,
        timeWindowStart: entry.time_window_start,
        timeWindowEnd: entry.time_window_end,
      });
    });

    const seen = new Set<string>();
    return options.filter((option) => {
      const key = `${normalizeLookup(option.label)}|${normalizeLookup(option.addressString || option.label)}`;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [addressSuggestions?.pickup, clientLocations, clientName, pickupAddressBookMatches, pickupClientMatches, pickupLocationMatches, selectedClient]);

  const deliveryQuickOptions = useMemo<PlannerLocationOption[]>(() => {
    const options: PlannerLocationOption[] = [];
    clientLocations.forEach((location) => {
      const value = addressFromClientLocation(location);
      const composed = composeAddressString(value, { includeLocality: true }) || location.address;
      options.push({
        id: `delivery-location-${location.id}`,
        label: location.label,
        subtitle: composed,
        badge: location.location_type || "Locatie",
        value,
        addressString: composed,
        companyName: selectedClient?.name || undefined,
        notesHint: location.notes || undefined,
        driverInstructions: location.notes || undefined,
        timeWindowStart: location.time_window_start,
        timeWindowEnd: location.time_window_end,
      });
    });

    addressSuggestions?.delivery?.forEach((suggestion, index) => {
      options.push({
        id: `delivery-history-${index}`,
        label: suggestion.address,
        subtitle: `Gebruikt in ${suggestion.frequency} eerdere order${suggestion.frequency > 1 ? "s" : ""}`,
        badge: "Recent",
        value: bestEffortAddressValue(suggestion.address),
        addressString: suggestion.address,
        companyName: clientName || undefined,
      });
    });

    deliveryClientMatches.forEach((client) => {
      const shipping = addressFromClientRecord(client, "shipping");
      const shippingComposed = composeAddressString(shipping, { includeLocality: true });
      if (shippingComposed) {
        options.push({
          id: `delivery-client-match-${client.id}`,
          label: client.name,
          subtitle: shippingComposed,
          badge: "Bedrijf",
          value: shipping,
          addressString: shippingComposed,
          companyName: client.name,
          contactHint: client.contact_person || undefined,
        });
      }
    });

    deliveryLocationMatches.forEach((location) => {
      const value = addressFromClientLocation(location);
      const composed = composeAddressString(value, { includeLocality: true }) || location.address;
      options.push({
        id: `delivery-global-location-${location.id}`,
        label: location.client_name ? `${location.client_name} · ${location.label}` : location.label,
        subtitle: composed,
        badge: "Locatie",
        value,
        addressString: composed,
        companyName: location.client_name || undefined,
        notesHint: location.notes || undefined,
        driverInstructions: location.notes || undefined,
        timeWindowStart: location.time_window_start,
        timeWindowEnd: location.time_window_end,
      });
    });

    deliveryAddressBookMatches.forEach((entry) => {
      const value = addressFromAddressBookEntry(entry);
      const composed = composeAddressString(value, { includeLocality: true }) || entry.address;
      options.push({
        id: `delivery-address-book-${entry.id}`,
        label: entry.company_name || entry.label,
        subtitle: composed,
        badge: "Adresboek",
        value,
        addressString: composed,
        companyName: entry.company_name || entry.label,
        notesHint: entry.notes || undefined,
        driverInstructions: entry.driver_instructions || entry.notes || undefined,
        requiresTailLift: entry.requires_tail_lift,
        temperatureControlled: entry.temperature_controlled,
        photoRequired: entry.photo_required,
        timeWindowStart: entry.time_window_start,
        timeWindowEnd: entry.time_window_end,
      });
    });

    const seen = new Set<string>();
    return options.filter((option) => {
      const key = `${normalizeLookup(option.label)}|${normalizeLookup(option.addressString || option.label)}`;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [addressSuggestions?.delivery, clientLocations, clientName, deliveryAddressBookMatches, deliveryClientMatches, deliveryLocationMatches, selectedClient?.name]);

  const addToFreightSummary = () => {
    const ladenLine = freightLines.find(f => f.activiteit === "Laden");
    const lossenLine = freightLines.find(f => f.activiteit === "Lossen");
    if (!quantity && !lossenLine?.locatie && !weightKg) {
      toast.error("Vul minimaal aantal, bestemming of gewicht in");
      return;
    }
    const item: FreightSummaryItem = {
      id: crypto.randomUUID(),
      aankomstdatum: lossenLine?.datum || ladenLine?.datum || "",
      aantal: quantity ? `${quantity} ${transportEenheid || "stuks"}` : "",
      bestemming: lossenLine?.locatie || "",
      gewicht: weightKg ? `${weightKg} kg` : "",
      laadreferentie: ladenLine?.referentie || "",
      losreferentie: lossenLine?.referentie || "",
      tijdslot: [pickupTimeFrom, pickupTimeTo].filter(Boolean).join(" - ") || "",
      eenheid: transportEenheid || "",
      afmetingen: afmetingen || "",
    };
    setFreightSummary(prev => [...prev, item]);
    // Reset detail fields
    setQuantity("");
    setWeightKg("");
    setAfstand("");
    setTotaleDuur("");
    setAfmetingen("");
    toast.success("Item toegevoegd aan vrachtlijst");
  };

  const removeFromFreightSummary = (id: string) => {
    setFreightSummary(prev => prev.filter(item => item.id !== id));
  };

  // Cargo rows — multi-row lading-invoer
  const [cargoRows, setCargoRows] = useState<CargoRow[]>([
    { id: "1", aantal: "", eenheid: "Pallets", gewicht: "", lengte: "", breedte: "", hoogte: "", stapelbaar: true, adr: "", omschrijving: "" },
  ]);
  const [cargoSameDimensions, setCargoSameDimensions] = useState(true);

  useEffect(() => {
    setCargoRows(prev => {
      const first = prev[0] ?? { id: "1", aantal: "", eenheid: "Pallets", gewicht: "", lengte: "", breedte: "", hoogte: "", stapelbaar: true, adr: "", omschrijving: "" };
      const unitCount = Math.max(1, Math.min(50, parseInt(first.aantal || quantity || "1", 10) || 1));

      if (cargoSameDimensions) {
        if (prev.length === 1) return prev;
        const totalAantal = prev.reduce((sum, row) => sum + (parseInt(row.aantal, 10) || 0), 0) || unitCount;
        return [{
          ...first,
          aantal: String(totalAantal),
          gewicht: first.gewicht || prev.find(row => row.gewicht)?.gewicht || "",
        }];
      }

      if (prev.length === unitCount && prev.every(row => row.aantal === "1")) return prev;
      return Array.from({ length: unitCount }, (_, index) => {
        const existing = prev[index];
        return {
          ...(existing ?? first),
          id: existing?.id ?? crypto.randomUUID(),
          aantal: "1",
          eenheid: first.eenheid || existing?.eenheid || "Pallets",
          gewicht: index === 0 ? (existing?.gewicht || first.gewicht || "") : (existing?.gewicht || ""),
          lengte: existing?.lengte || (index === 0 ? first.lengte : ""),
          breedte: existing?.breedte || (index === 0 ? first.breedte : ""),
          hoogte: existing?.hoogte || (index === 0 ? first.hoogte : ""),
          stapelbaar: existing?.stapelbaar ?? first.stapelbaar ?? true,
          adr: existing?.adr || "",
          omschrijving: existing?.omschrijving || "",
        };
      });
    });
  }, [cargoSameDimensions, quantity]);

  const addCargoRow = () => {
    setCargoRows(prev => {
      const template = cargoSameDimensions ? prev[0] : null;
      return [...prev, {
        id: crypto.randomUUID(),
        aantal: "",
        eenheid: prev[0]?.eenheid || "Pallets",
        gewicht: "",
        lengte: template?.lengte || "",
        breedte: template?.breedte || "",
        hoogte: template?.hoogte || "",
        stapelbaar: true,
        adr: "",
        omschrijving: "",
      }];
    });
  };
  const removeCargoRow = (id: string) => {
    if (cargoRows.length <= 1) return;
    setCargoRows(prev => prev.filter(r => r.id !== id));
  };
  const updateCargoRow = <K extends keyof CargoRow>(id: string, field: K, value: CargoRow[K]) => {
    setCargoRows(prev => {
      const next = prev.map(r => r.id === id ? { ...r, [field]: value } : r);
      if (!cargoSameDimensions || !["lengte", "breedte", "hoogte"].includes(String(field))) return next;
      const template = next.find(r => r.id === id);
      if (!template) return next;
      return next.map((row) => ({
        ...row,
        lengte: template.lengte,
        breedte: template.breedte,
        hoogte: template.hoogte,
      }));
    });
  };

  // Aggregated cargo totals (gebruikt door handleSave om de bestaande quantity/weight/unit state
  // te voeden zonder de Supabase-integratie te breken).
  const cargoTotals = useMemo(() => {
    const totAantal = cargoRows.reduce((s, r) => s + (parseInt(r.aantal) || 0), 0);
    const totGewicht = cargoRows.reduce((s, r) => s + (parseFloat(r.gewicht) || 0), 0);
    const primaryUnit = cargoRows.find(r => r.aantal && r.eenheid)?.eenheid || cargoRows[0]?.eenheid || "";
    return { totAantal, totGewicht, primaryUnit };
  }, [cargoRows]);

  // Sync cargo totals into legacy quantity/weight/unit state zodra de gebruiker iets typt
  // in de cargo-rows. Zo blijft handleSave + validatie ongewijzigd werken.
  useEffect(() => {
    if (cargoTotals.totAantal > 0) setQuantity(String(cargoTotals.totAantal));
    if (cargoTotals.totGewicht > 0) setWeightKg(String(cargoTotals.totGewicht));
    if (cargoTotals.primaryUnit) setTransportEenheid(cargoTotals.primaryUnit);
  }, [cargoTotals.totAantal, cargoTotals.totGewicht, cargoTotals.primaryUnit]);

  // Cargo-samenvatting voor FinancialTab, voertuigkeuze op basis van lading.
  const financialCargo: FinancialTabCargo = useMemo(() => ({
    totalQuantity: cargoTotals.totAantal,
    unit: cargoTotals.primaryUnit || transportEenheid,
    totalWeightKg: cargoTotals.totGewicht,
    maxLengthCm: Math.max(0, ...cargoRows.map(r => parseFloat(r.lengte) || 0)),
    maxWidthCm: Math.max(0, ...cargoRows.map(r => parseFloat(r.breedte) || 0)),
    maxHeightCm: Math.max(0, ...cargoRows.map(r => parseFloat(r.hoogte) || 0)),
    requiresTailgate: klepNodig,
  }), [cargoRows, cargoTotals.primaryUnit, cargoTotals.totAantal, cargoTotals.totGewicht, klepNodig, transportEenheid]);

  const financialPickupLine = freightLines.find(f => f.activiteit === "Laden");
  const financialPickupDate = financialPickupLine?.datum || undefined;
  const financialPickupTime = financialPickupLine?.tijd || undefined;
  const suggestedTransportType = useMemo(() => {
    if (prioriteit === "Spoed") return "Express";
    if (cargoTotals.totGewicht >= 7000 || cargoTotals.totAantal >= 18) return "FTL";
    if (cargoTotals.totGewicht > 0) return "LTL";
    return "";
  }, [cargoTotals.totAantal, cargoTotals.totGewicht, prioriteit]);
  const suggestedVehicleType = useMemo(() => {
    if (financialCargo.maxLengthCm >= 1200 || cargoTotals.totGewicht >= 10000) return "Trailer";
    if (cargoTotals.totGewicht >= 1200 || klepNodig || cargoTotals.totAantal >= 6) return "Vrachtwagen";
    if (cargoTotals.totGewicht > 0 || prioriteit === "Spoed") return "Bestelbus";
    return "";
  }, [cargoTotals.totAantal, cargoTotals.totGewicht, financialCargo.maxLengthCm, klepNodig, prioriteit]);

  useEffect(() => {
    if (afdelingManual || !transportType) return;
    const nextAfdeling = transportType === "Luchtvracht" ? "EXPORT" : "OPS";
    setAfdeling(prev => prev === nextAfdeling ? prev : nextAfdeling);
  }, [afdelingManual, transportType]);

  const orderDraft = useMemo<OrderDraft>(() => {
    const sortedLossen = freightLines.filter((line) => line.activiteit === "Lossen");
    const stops = freightLines
      .map((line) => {
        const isPickup = line.activiteit === "Laden";
        const deliveryIndex = isPickup ? -1 : sortedLossen.findIndex((delivery) => delivery.id === line.id);
        const isFinalDelivery = !isPickup && deliveryIndex === sortedLossen.length - 1;
        const address = addressValueFromFreightLine(line);
        return {
          id: line.id,
          type: isPickup ? "pickup" as const : isFinalDelivery ? "delivery" as const : "stop" as const,
          label: isPickup ? "Ophalen" : isFinalDelivery ? "Eindbestemming" : `Stop ${deliveryIndex + 1}`,
          sequence: isPickup ? 0 : deliveryIndex + 1,
          address: {
            display: line.locatie || "",
            street: address.street,
            zipcode: address.zipcode,
            city: address.city,
            lat: line.lat ?? address.lat,
            lng: line.lng ?? address.lng,
            source: line.coords_manual || address.coords_manual ? "manual" as const : (line.lat != null && line.lng != null) || address.lat != null ? "google" as const : null,
          },
          date: line.datum || null,
          timeFrom: line.tijd || null,
          timeTo: line.tijdTot || null,
        };
      })
      .sort((a, b) => a.sequence - b.sequence);

    const cargoLines = cargoRows
      .filter((row) => row.aantal || row.gewicht || row.eenheid || row.omschrijving || row.lengte || row.breedte || row.hoogte)
      .map((row) => ({
        id: row.id,
        quantity: parseInt(row.aantal) || 0,
        unit: row.eenheid || "",
        weightKg: parseFloat(row.gewicht) || 0,
        lengthCm: parseFloat(row.lengte) || 0,
        widthCm: parseFloat(row.breedte) || 0,
        heightCm: parseFloat(row.hoogte) || 0,
      }));

    return {
      clientId,
      clientName,
      contactName: contactpersoon || null,
      stops,
      cargoLines,
      transport: {
        type: transportType || null,
        department: afdeling || null,
        vehicleType: voertuigtype || null,
        secure: shipmentSecure,
        pmtMethod: pmtMethode || null,
        manualOverrides: {
          transportType: transportTypeManual,
          department: afdelingManual,
          vehicleType: voertuigtypeManual,
        },
      },
      pricing: { totalCents: pricingPayload.cents },
    };
  }, [
    afdeling,
    afdelingManual,
    cargoRows,
    clientId,
    clientName,
    contactpersoon,
    freightLines,
    pmtMethode,
    pricingPayload.cents,
    shipmentSecure,
    transportType,
    transportTypeManual,
    voertuigtype,
    voertuigtypeManual,
  ]);
  const debouncedOrderDraft = useDebouncedValue(orderDraft, 300);
  const orderReadiness = useMemo(() => validateOrderDraft(debouncedOrderDraft), [debouncedOrderDraft]);
  const routeRuleIssues = useMemo(() => getOrderRouteRuleIssues(freightLines), [freightLines]);
  const cargoRuleIssues = useMemo(
    () => cargoRows.map(cargoRowIssue).filter(Boolean) as string[],
    [cargoRows],
  );
  const vehicleRuleIssue = useMemo(
    () => vehicleCapacityIssue(voertuigtype, financialCargo),
    [financialCargo, voertuigtype],
  );
  const plannerWarnings = useMemo(
    () => orderReadiness.warnings.map((warning) => warning.label),
    [orderReadiness.warnings],
  );

  const plannerSummary = useMemo(() => {
    const pickupLine = freightLines.find(f => f.activiteit === "Laden");
    const deliveryLine = freightLines.find(f => f.activiteit === "Lossen");
    return [
      { label: "Klant", value: clientName || "Nog niet gekozen" },
      { label: "Route", value: [pickupLine?.locatie, deliveryLine?.locatie].filter(Boolean).join(" → ") || "Nog geen route" },
      { label: "Lading", value: cargoTotals.totAantal > 0 || cargoTotals.totGewicht > 0 ? `${cargoTotals.totAantal || 0} ${transportEenheid || "eenheden"} · ${cargoTotals.totGewicht || 0} kg` : "Nog leeg" },
      { label: "Transport", value: [transportType || suggestedTransportType, voertuigtype || suggestedVehicleType].filter(Boolean).join(" · ") || "Wordt voorgesteld" },
      { label: "Afdeling", value: afdeling || inferredAfdeling || "Nog onbekend" },
      { label: "Prijs", value: pricingPayload.cents != null ? `€ ${(pricingPayload.cents / 100).toFixed(2)}` : "Nog geen prijs" },
    ];
  }, [afdeling, clientName, cargoTotals.totAantal, cargoTotals.totGewicht, freightLines, inferredAfdeling, pricingPayload.cents, suggestedTransportType, suggestedVehicleType, transportEenheid, transportType, voertuigtype]);

  // ─── Unsaved-changes-bewaking ────────────────────────────────────────
  // Baseline wordt gezet zodra prefill klaar is (of meteen als er geen
  // prefill is). Elke state-wijziging daarna kantelt `dirty`. We gebruiken
  // een serialized signature zodat nieuwe form-velden geen expliciete
  // onChange-hook vereisen.
  const smartDraft = useMemo(
    () => parseSmartOrderInput(smartInput, smartClientMatches),
    [smartClientMatches, smartInput],
  );

  const wizardMissing = useMemo(
    () => Array.from(new Set(orderReadiness.blockers.map((blocker) => blocker.key))),
    [orderReadiness.blockers],
  );

  const vehicleMatchScore = useMemo(() => {
    if (!suggestedVehicleType && !voertuigtype) return 0;
    if (voertuigtype && suggestedVehicleType && voertuigtype === suggestedVehicleType) return 92;
    if (voertuigtype && suggestedVehicleType && voertuigtype !== suggestedVehicleType) return 76;
    return suggestedVehicleType ? 88 : 0;
  }, [suggestedVehicleType, voertuigtype]);

  const wizardStepIndex = WIZARD_STEPS.findIndex((step) => step.key === wizardStep);
  const wizardProgress = Math.round(((wizardStepIndex + 1) / WIZARD_STEPS.length) * 100);
  const pickupLine = freightLines.find(f => f.activiteit === "Laden");
  const deliveryLine = freightLines.find(f => f.activiteit === "Lossen");
  const extraDeliveryLines = freightLines.filter(f => f.activiteit === "Lossen").slice(1);
  const deliveryStops = [deliveryLine, ...extraDeliveryLines].filter(Boolean) as FreightLine[];
  const routeStops = useMemo<RouteStopModel[]>(() => {
    const pickup = freightLines.find(line => line.activiteit === "Laden");
    const deliveries = freightLines.filter(line => line.activiteit === "Lossen");
    const stops: RouteStopModel[] = [];

    if (pickup) {
      stops.push({
        id: pickup.id,
        sequence: 1,
        kind: "pickup",
        line: pickup,
        title: "Ophalen",
        shortTitle: "L",
        fallback: "Ophaaladres kiezen",
        missingAddress: !pickup.locatie,
        missingDate: !pickup.datum,
        isFinal: false,
      });
    }

    deliveries.forEach((line, index) => {
      const hasMultipleDeliveries = deliveries.length > 1;
      const isFinal = index === deliveries.length - 1;
      const kind: RouteStopKind = isFinal ? "delivery" : "stop";
      const title = !hasMultipleDeliveries
        ? "Afleveren"
        : isFinal
          ? "Eindbestemming"
          : `Stop ${index + 1}`;

      stops.push({
        id: line.id,
        sequence: stops.length + 1,
        kind,
        line,
        title,
        shortTitle: kind === "delivery" ? "B" : String(index + 1),
        fallback: kind === "delivery" ? "Afleveradres kiezen" : "Stop invullen",
        missingAddress: !line.locatie,
        missingDate: !line.datum,
        isFinal,
      });
    });

    return stops;
  }, [freightLines]);
  const locationDisplay = (line: FreightLine | undefined, fallbackLabel: string, fallbackAddress: string) => {
    const address = line?.locatie?.trim() || fallbackAddress;
    const company = line?.companyName?.trim() || (line?.locatie ? clientName.trim() : "") || fallbackLabel;
    return { company, address };
  };
  const pickupRouteIssue = routeRuleIssues.find((issue) => issue.lineId === pickupLine?.id);
  const primaryDeliveryRouteIssue = routeRuleIssues.find((issue) => issue.lineId === deliveryLine?.id && issue.key !== "route_duplicate");
  const isMultiLegRoute = deliveryStops.length > 1;
  const getDeliveryStopLabel = (index: number, total = deliveryStops.length) => {
    if (total <= 1) return "Afleveren";
    if (index === total - 1) return "Eindbestemming";
    return `Stop ${index + 1}`;
  };
  const routeLocationSummary = [
    ...routeStops.map(stop => stop.line.locatie),
  ].filter(Boolean).join(" -> ");
  const clientInputReady = clientName.trim().length >= 2;
  const clientAnswered = Boolean(clientId || (clientQuestionConfirmed && clientInputReady));
  const cargoReady = cargoTotals.totAantal > 0 && cargoTotals.totGewicht > 0;
  const missingClient = !clientAnswered;
  const missingPickupAddress = !pickupLine?.locatie;
  const missingDeliveryAddress = !deliveryLine?.locatie;
  const pickupAndDeliverySame = Boolean(
    pickupLine?.locatie &&
    deliveryLine?.locatie &&
    normalizeLookup(pickupLine.locatie) === normalizeLookup(deliveryLine.locatie),
  );
  const missingQuantity = !cargoTotals.totAantal;
  const missingWeight = !cargoTotals.totGewicht;
  const missingPickupTimeWindow = !pickupLine?.datum;
  const missingDeliveryTimeWindow = !deliveryLine?.datum;
  const missingTimeWindow = missingPickupTimeWindow || missingDeliveryTimeWindow;
  const routeReady = Boolean(
    clientAnswered &&
    pickupLine?.locatie &&
    deliveryLine?.locatie &&
    !pickupAndDeliverySame &&
    !missingTimeWindow &&
    routeRuleIssues.length === 0,
  );
  const routePreviewStops = routeStops.map((stop) => ({
    id: stop.id,
    label: stop.title,
    shortLabel: stop.shortTitle,
    line: stop.line,
    missingAddress: stop.missingAddress,
    missingDate: stop.missingDate,
    issue: routeRuleIssues.find((issue) => issue.lineId === stop.line.id),
    onClick: () => {
      if (stop.kind === "pickup") {
        focusWizardTarget("pickup");
        return;
      }
      if (stop.line.id === deliveryLine?.id) {
        focusWizardTarget("delivery");
        return;
      }
      setWizardStep("route");
      setRouteManualBack(true);
      setRouteActiveQuestion(4);
    },
    fallback: stop.fallback,
  }));
  const routeMapStops = routePreviewStops.filter(stop => stop.line?.locatie);
  const routeMapPlottedCount = routeMapStops.filter(stop => stop.line?.lat != null && stop.line?.lng != null).length;
  const routeMapMissingGpsCount = Math.max(routeMapStops.length - routeMapPlottedCount, 0);
  const routeMapStatusLabel = routeMapStops.length === 0
    ? "Route preview"
    : routeMapMissingGpsCount > 0
      ? `${routeMapPlottedCount}/${routeMapStops.length} GPS-punten`
      : "Kaart op GPS-punten";
  const routeLegInsights = buildRouteLegInsights(routeMapStops, voertuigtype || suggestedVehicleType || "");
  useEffect(() => {
    if (!supabase.functions?.invoke) return;
    const missingGpsStops = routeMapStops.filter((stop) => {
      const line = stop.line;
      return line?.id && line.locatie && (line.lat == null || line.lng == null);
    });
    if (missingGpsStops.length === 0) return;

    missingGpsStops.forEach((stop) => {
      const line = stop.line;
      if (!line) return;
      const query = line.locatie.trim();
      const cacheKey = `${line.id}:${normalizeLookup(query)}`;
      if (query.length < 4 || routeGpsResolveAttemptsRef.current.has(cacheKey)) return;
      routeGpsResolveAttemptsRef.current.add(cacheKey);

      void (async () => {
        try {
          const { data: searchData, error: searchError } = await supabase.functions.invoke("google-places", {
            body: { input: query },
          });
          if (searchError) throw new Error(searchError.message);
          const predictions = (searchData as { predictions?: Array<{ place_id?: string }> })?.predictions ?? [];
          const placeId = predictions[0]?.place_id;
          if (!placeId) return;

          const { data: detailsData, error: detailsError } = await supabase.functions.invoke("google-places-business", {
            body: { mode: "details", place_id: placeId },
          });
          if (detailsError) throw new Error(detailsError.message);
          const details = (detailsData as { result?: GooglePlaceDetailsResult | null })?.result;
          if (!details || details.lat == null || details.lng == null) return;

          updateFreightLineAddress(line.id, addressValueFromGoogleDetails(details, query));
        } catch (error) {
          routeGpsResolveAttemptsRef.current.delete(cacheKey);
          console.warn("Kon route-adres niet automatisch naar GPS omzetten", error);
        }
      })();
    });
  }, [routeMapStops, updateFreightLineAddress]);
  const requiredTextClass = (missing: boolean) => missing ? "text-red-600" : "text-foreground";
  const previewTextClass = (missing: boolean) => missing ? "text-red-600" : "text-foreground";
  const requiredFieldClass = (missing: boolean) => missing ? "border-red-200 bg-red-50/40 placeholder:text-red-500" : "";
  const wizardMissingLabel: Record<string, string> = {
    klant: "Klant kiezen",
    ophaaladres: "Ophaaladres kiezen",
    afleveradres: "Afleveradres kiezen",
    adrescontrole: "Ander afleveradres kiezen",
    aantal: "Aantal invullen",
    gewicht: "Gewicht invullen",
    eenheid: "Eenheid kiezen",
    pickupdatum: "Ophaaldatum kiezen",
    ladingregel: "Ladingregel herstellen",
    tijdvenster: "Tijdvenster plannen",
    tijdvolgorde: "Tijdvolgorde corrigeren",
    voertuig: "Voertuig aanpassen",
    screening: "EDD/X-RAY kiezen",
    tarief: "Tarief controleren",
  };
  const pricingLabel = pricingPayload.cents != null
    ? `EUR ${(pricingPayload.cents / 100).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "Nog geen tarief";
  const pmtLabel = !showPmt
    ? "Niet nodig"
    : shipmentSecure
      ? "Secure"
      : pmtMethode
        ? pmtMethode === "edd" ? "EDD" : "X-RAY"
        : "Screening kiezen";
  const currentFlowCue =
    wizardStep === "intake"
      ? "Start met de opdrachtgever"
      : wizardStep === "route"
        ? missingPickupAddress
          ? "Kies het ophaaladres"
          : missingDeliveryAddress
            ? "Route gestart: kies afleveradres"
            : missingPickupTimeWindow
              ? "Route staat: plan laadmoment"
              : missingDeliveryTimeWindow
                ? "Route staat: plan levermoment"
              : "Route compleet"
          : wizardStep === "cargo"
            ? missingQuantity
              ? "Vul de lading"
              : missingWeight
                ? "Aantal staat: voeg gewicht toe"
                : "Lading compleet"
            : wizardStep === "financial"
              ? pricingPayload.cents != null
                ? "Tarief staat klaar"
                : "Controleer het tarief"
          : wizardMissing.length
            ? "Controleer open punten"
            : "Klaar om aan te maken";
  const clientNeedsConfirmation = clientInputReady && !clientAnswered;
  const intakeQuestion = missingClient
    ? { step: "Klant", title: "Voor welke klant is deze order?", hint: "Typ minimaal 2 tekens en bevestig met Enter of Volgende stap." }
    : { step: "Referentie", title: "Welke referentie en instructies horen erbij?", hint: "Vul alleen aan wat de planner straks nodig heeft." };
  const routeQuestion = missingPickupAddress
    ? { step: "Ophaaladres", title: "Waar wordt de lading opgehaald?", hint: "Begin met het laadadres. De loslocatie komt daarna." }
    : missingDeliveryAddress
      ? { step: "Volgende stop", title: "Wat is de volgende stop of eindbestemming?", hint: "Dit kan een losadres, warehouse, crossdock of eindbestemming zijn." }
      : missingPickupTimeWindow
        ? { step: "Laadmoment", title: "Wanneer wordt de lading opgehaald?", hint: "Kies datum en tijdvenster voor laden." }
        : { step: "Levermoment", title: "Wanneer moet de lading daar zijn?", hint: "Kies datum en tijdvenster voor lossen of overdracht." };
  const cargoQuestion = missingQuantity
    ? { step: "Aantal", title: "Hoeveel eenheden vervoer je?", hint: "Start met het aantal pallets, colli of boxen." }
    : missingWeight
      ? { step: "Gewicht", title: "Wat is het totale gewicht?", hint: "Daarmee kunnen voertuig en planning meteen worden ingeschat." }
      : { step: "Klaar", title: "Lading staat goed genoeg voor planning", hint: "Je kunt nu details zoals afmetingen, ADR of voertuig aanvullen." };
  const routeSuggestedQuestion = missingPickupAddress
    ? 1
    : missingDeliveryAddress
      ? 2
      : missingPickupTimeWindow
        ? 3
        : missingDeliveryTimeWindow
          ? 4
          : routeQuestionForIssue(routeRuleIssues[0]);
  const cargoHasDimensions = cargoSameDimensions
    ? Boolean(cargoRows[0]?.lengte && cargoRows[0]?.breedte && cargoRows[0]?.hoogte)
    : cargoRows.length > 0 && cargoRows.every((row) => row.lengte && row.breedte && row.hoogte);
  const cargoSuggestedQuestion = missingQuantity ? 1 : !cargoHasDimensions ? 2 : missingWeight ? 3 : 4;

  useEffect(() => {
    if (!clientAnswered) {
      setIntakeActiveQuestion(1);
      setIntakeManualBack(false);
    }
  }, [clientAnswered, intakeManualBack]);

  useEffect(() => {
    setRouteActiveQuestion((current) => {
      if (current > routeSuggestedQuestion) return routeSuggestedQuestion as 1 | 2 | 3 | 4;
      return current;
    });
    if (routeActiveQuestion > routeSuggestedQuestion) setRouteManualBack(false);
  }, [routeActiveQuestion, routeSuggestedQuestion]);

  useEffect(() => {
    if (cargoActiveQuestion > cargoSuggestedQuestion) {
      setCargoManualBack(false);
      setCargoActiveQuestion(cargoSuggestedQuestion as 1 | 2 | 3 | 4);
    }
  }, [cargoActiveQuestion, cargoSuggestedQuestion]);

  const wizardStepStatus = useCallback((key: WizardStep) => {
    if (key === "intake") return clientAnswered ? "Compleet" : "Nog invullen";
    if (key === "route") return routeReady ? "Compleet" : "Nog invullen";
    if (key === "cargo") return cargoReady ? "Compleet" : "Nog invullen";
    if (key === "financial") return pricingPayload.cents != null ? "Tarief klaar" : "Controleren";
    return wizardMissing.length === 0 ? "Klaar voor aanmaken" : `${wizardMissing.length} open`;
  }, [cargoReady, clientAnswered, pricingPayload.cents, routeReady, wizardMissing.length]);

  const applySmartDraft = useCallback(() => {
    if (!smartInput.trim()) {
      toast.error("Plak eerst ordertekst of intake-informatie");
      return;
    }

    const nextDraft = parseSmartOrderInput(smartInput, smartClientMatches);

    if (nextDraft.matchedClientId && nextDraft.matchedClientName) {
      setClientId(nextDraft.matchedClientId);
      setClientName(nextDraft.matchedClientName);
      setClientOpen(false);
    } else if (nextDraft.clientHint) {
      setClientName(nextDraft.clientHint);
    }

    setPrioriteit(nextDraft.priority);
    if (nextDraft.reference) setKlantReferentie(nextDraft.reference);

    if (nextDraft.pickupHint) {
      handlePickupAddrChange(bestEffortAddressValue(nextDraft.pickupHint));
      setPickupLookup(nextDraft.pickupHint);
    }
    if (nextDraft.deliveryHint) {
      handleDeliveryAddrChange(bestEffortAddressValue(nextDraft.deliveryHint));
      setDeliveryLookup(nextDraft.deliveryHint);
    }

    setFreightLines(prev => prev.map((line) => {
      if (line.activiteit === "Laden") {
        return {
          ...line,
          locatie: nextDraft.pickupHint || line.locatie,
          datum: nextDraft.pickupDate || line.datum,
          tijd: nextDraft.pickupFrom || line.tijd,
          tijdTot: nextDraft.pickupTo || line.tijdTot,
        };
      }
      if (line.activiteit === "Lossen") {
        return {
          ...line,
          locatie: nextDraft.deliveryHint || line.locatie,
          datum: nextDraft.deliveryDate || nextDraft.pickupDate || line.datum,
          tijdTot: nextDraft.deliveryBefore || line.tijdTot,
        };
      }
      return line;
    }));

    setCargoRows(prev => {
      const first = prev[0] ?? {
        id: crypto.randomUUID(),
        aantal: "",
        eenheid: "Pallets" as const,
        gewicht: "",
        lengte: "",
        breedte: "",
        hoogte: "",
        stapelbaar: true,
        adr: "",
        omschrijving: "",
      };
      return [{
        ...first,
        aantal: nextDraft.quantity || first.aantal,
        eenheid: nextDraft.unit || first.eenheid,
        gewicht: nextDraft.weightKg || first.gewicht,
        omschrijving: first.omschrijving || (nextDraft.reference ? `Ref ${nextDraft.reference}` : ""),
      }];
    });

    setSmartApplied(true);
    setWizardStep("route");
    setMainTab("algemeen");
    toast.success("Ordervoorstel ingevuld", {
      description: nextDraft.missing.length > 0
        ? `Nog aanvullen: ${nextDraft.missing.join(", ")}`
        : "Route, klant en lading zijn voorgesteld.",
    });
  }, [handleDeliveryAddrChange, handlePickupAddrChange, smartClientMatches, smartInput]);

  const goToNextWizardStep = useCallback(() => {
    if (wizardStep === "intake" && intakeActiveQuestion === 1 && !clientAnswered) {
      if (clientInputReady) {
        setClientQuestionConfirmed(true);
        setIntakeManualBack(false);
        setWizardStep("route");
        setRouteActiveQuestion(routeSuggestedQuestion as 1 | 2 | 3 | 4);
      } else {
        setErrors(prev => ({ ...prev, client_name: "Typ minimaal 2 tekens of kies een klant uit de lijst." }));
      }
      return;
    }
    if (wizardStep === "intake" && intakeActiveQuestion === 1 && clientAnswered) {
      setIntakeManualBack(false);
      setWizardStep("route");
      setRouteActiveQuestion(routeSuggestedQuestion as 1 | 2 | 3 | 4);
      return;
    }
    if (wizardStep === "route") {
      if (routeActiveQuestion === 1 && missingPickupAddress) {
        toast.error("Ophaaladres ontbreekt", { description: "Kies eerst waar de lading wordt opgehaald." });
        return;
      }
      if (routeActiveQuestion === 2 && missingDeliveryAddress) {
        toast.error("Volgende stop ontbreekt", { description: "Kies een losadres, warehouse of eindbestemming." });
        return;
      }
      if (routeActiveQuestion >= 2 && pickupAndDeliverySame) {
        setErrors(prev => ({
          ...prev,
          delivery_address: "Afleveradres mag niet hetzelfde zijn als ophaaladres.",
        }));
        setRouteManualBack(true);
        setRouteActiveQuestion(2);
        toast.error("Adrescontrole", { description: "Ophalen en afleveren moeten verschillende locaties zijn." });
        return;
      }
      if (routeActiveQuestion === 3 && missingPickupTimeWindow) {
        toast.error("Laadmoment ontbreekt", { description: "Kies minimaal de datum waarop wordt opgehaald." });
        return;
      }
      if (routeActiveQuestion === 4 && missingDeliveryTimeWindow) {
        toast.error("Levermoment ontbreekt", { description: "Kies minimaal de datum waarop geleverd of overgedragen wordt." });
        return;
      }
      const blockingRouteIssue = routeRuleIssues.find((issue) => routeActiveQuestion >= routeQuestionForIssue(issue));
      if (blockingRouteIssue) {
        const errorKey = blockingRouteIssue.key === "route_duplicate" ? "delivery_address" : blockingRouteIssue.key;
        setErrors(prev => ({
          ...prev,
          [errorKey]: blockingRouteIssue.message,
        }));
        setRouteManualBack(true);
        setRouteActiveQuestion(routeQuestionForIssue(blockingRouteIssue));
        toast.error("Routecontrole", { description: blockingRouteIssue.message });
        return;
      }
    }
    if (wizardStep === "route" && routeActiveQuestion < routeSuggestedQuestion) {
      setRouteManualBack(false);
      setRouteActiveQuestion(routeSuggestedQuestion as 1 | 2 | 3 | 4);
      return;
    }
    if (wizardStep === "cargo" && cargoActiveQuestion < cargoSuggestedQuestion) {
      setCargoManualBack(false);
      setCargoActiveQuestion(cargoSuggestedQuestion as 1 | 2 | 3 | 4);
      return;
    }
    setWizardStep((current) => {
      if (current === "intake") return "route";
      if (current === "route") return "cargo";
      if (current === "cargo") return "financial";
      if (current === "financial") return "review";
      return "review";
    });
  }, [cargoActiveQuestion, cargoSuggestedQuestion, clientAnswered, clientInputReady, intakeActiveQuestion, missingDeliveryAddress, missingDeliveryTimeWindow, missingPickupAddress, missingPickupTimeWindow, pickupAndDeliverySame, routeActiveQuestion, routeRuleIssues, routeSuggestedQuestion, wizardStep]);

  const goToPreviousWizardStep = useCallback(() => {
    if (wizardStep === "intake" && intakeActiveQuestion === 2) {
      setIntakeManualBack(true);
      setIntakeActiveQuestion(1);
      return;
    }
    if (wizardStep === "route" && routeActiveQuestion > 1) {
      setRouteManualBack(true);
      setRouteActiveQuestion((routeActiveQuestion - 1) as 1 | 2 | 3 | 4);
      return;
    }
    if (wizardStep === "cargo" && cargoActiveQuestion > 1) {
      setCargoManualBack(true);
      setCargoActiveQuestion((cargoActiveQuestion - 1) as 1 | 2 | 3 | 4);
      return;
    }
    if (wizardStep === "review" && reviewActiveQuestion > 1) {
      setReviewActiveQuestion((reviewActiveQuestion - 1) as 1 | 2 | 3);
      return;
    }
    if (wizardStep === "review") {
      setWizardStep("financial");
      return;
    }
    if (wizardStep === "financial") {
      setWizardStep("cargo");
      setCargoManualBack(true);
      setCargoActiveQuestion(4);
      return;
    }
    if (wizardStep === "cargo") {
      setWizardStep("route");
      setRouteManualBack(true);
      setRouteActiveQuestion(missingPickupTimeWindow ? 3 : 4);
      return;
    }
    if (wizardStep === "route") {
      setWizardStep("intake");
      setIntakeManualBack(true);
      setIntakeActiveQuestion(1);
    }
  }, [cargoActiveQuestion, intakeActiveQuestion, missingPickupTimeWindow, reviewActiveQuestion, routeActiveQuestion, wizardStep]);

  const [prefillReady, setPrefillReady] = useState(!initialClientId && !fromOrderId);
  const [dirty, setDirty] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const baselineSignatureRef = useRef<string | null>(null);
  const skipDirtyGuardRef = useRef(false);
  const flowHydratedRef = useRef(false);

  const formSignature = useMemo(() => JSON.stringify({
    clientName, clientId, contactpersoon, prioriteit, klantReferentie,
    transportType, afdeling, afdelingManual, voertuigtype, chauffeur, mrnDoc, referentie,
    quantity, transportEenheid, weightKg, afstand, totaleDuur, afmetingen,
    pickupTimeFrom, pickupTimeTo, deliveryTimeFrom, deliveryTimeTo,
    freightLines, freightSummary, cargoRows, pickupAddr, deliveryAddr,
    klepNodig, shipmentSecure, pmtMethode, pmtOperator, pmtReferentie,
    pmtDatum, pmtLocatie, pmtSeal, pmtByCustomer,
    infoFollows, infoContactName, infoContactEmail, pricingPayload,
  }), [
    clientName, clientId, contactpersoon, prioriteit, klantReferentie,
    transportType, afdeling, afdelingManual, voertuigtype, chauffeur, mrnDoc, referentie,
    quantity, transportEenheid, weightKg, afstand, totaleDuur, afmetingen,
    pickupTimeFrom, pickupTimeTo, deliveryTimeFrom, deliveryTimeTo,
    freightLines, freightSummary, cargoRows, pickupAddr, deliveryAddr,
    klepNodig, shipmentSecure, pmtMethode, pmtOperator, pmtReferentie,
    pmtDatum, pmtLocatie, pmtSeal, pmtByCustomer,
    infoFollows, infoContactName, infoContactEmail, pricingPayload,
  ]);

  const draftPayload = useMemo(() => ({
    clientName,
    clientId,
    contactpersoon,
    prioriteit,
    klantReferentie,
    transportType,
    transportTypeManual,
    afdeling,
    afdelingManual,
    voertuigtype,
    voertuigtypeManual,
    referentie,
    cargoRows,
    freightLines,
    pickupAddr,
    deliveryAddr,
    transportEenheid,
    quantity,
    weightKg,
    klepNodig,
    shipmentSecure,
  }), [
    afdeling,
    afdelingManual,
    cargoRows,
    clientId,
    clientName,
    contactpersoon,
    deliveryAddr,
    freightLines,
    klantReferentie,
    klepNodig,
    pickupAddr,
    prioriteit,
    quantity,
    referentie,
    shipmentSecure,
    transportEenheid,
    transportType,
    transportTypeManual,
    voertuigtype,
    voertuigtypeManual,
    weightKg,
  ]);

  useEffect(() => {
    if (!draftStorageKey || !prefillReady || draftRestored) return;
    const raw = window.localStorage.getItem(draftStorageKey);
    if (!raw) {
      setDraftRestored(true);
      return;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<typeof draftPayload> & { savedAt?: string };
      if (parsed.clientName) {
        setClientName(parsed.clientName);
        if (parsed.clientName.trim().length >= 2) setClientQuestionConfirmed(true);
      }
      if (parsed.clientId) setClientId(parsed.clientId);
      if (parsed.contactpersoon) setContactpersoon(parsed.contactpersoon);
      if (parsed.prioriteit) setPrioriteit(parsed.prioriteit);
      if (parsed.klantReferentie) setKlantReferentie(parsed.klantReferentie);
      if (parsed.transportType) setTransportType(parsed.transportType);
      if (typeof parsed.transportTypeManual === "boolean") setTransportTypeManual(parsed.transportTypeManual);
      if (parsed.afdeling) setAfdeling(parsed.afdeling);
      if (typeof parsed.afdelingManual === "boolean") setAfdelingManual(parsed.afdelingManual);
      if (parsed.voertuigtype) setVoertuigtype(parsed.voertuigtype);
      if (typeof parsed.voertuigtypeManual === "boolean") setVoertuigtypeManual(parsed.voertuigtypeManual);
      if (parsed.referentie) setReferentie(parsed.referentie);
      if (parsed.transportEenheid) setTransportEenheid(parsed.transportEenheid);
      if (parsed.quantity) setQuantity(parsed.quantity);
      if (parsed.weightKg) setWeightKg(parsed.weightKg);
      if (Array.isArray(parsed.cargoRows) && parsed.cargoRows.length > 0) setCargoRows(parsed.cargoRows);
      if (Array.isArray(parsed.freightLines) && parsed.freightLines.length > 0) setFreightLines(parsed.freightLines);
      if (parsed.pickupAddr) setPickupAddr({ ...EMPTY_ADDRESS, ...parsed.pickupAddr });
      if (parsed.deliveryAddr) setDeliveryAddr({ ...EMPTY_ADDRESS, ...parsed.deliveryAddr });
      if (typeof parsed.klepNodig === "boolean") setKlepNodig(parsed.klepNodig);
      if (typeof parsed.shipmentSecure === "boolean") setShipmentSecure(parsed.shipmentSecure);
      if (parsed.savedAt) setLastDraftSavedAt(parsed.savedAt);
      toast.success("Concept hersteld", {
        description: "Je vorige handmatige invoer is teruggezet in het formulier.",
      });
    } catch {
      window.localStorage.removeItem(draftStorageKey);
    } finally {
      setDraftRestored(true);
    }
  }, [draftPayload, draftRestored, draftStorageKey, prefillReady]);

  useEffect(() => {
    if (!draftRestored || flowHydratedRef.current) return;
    flowHydratedRef.current = true;

    const restoredClientAnswered = clientAnswered || clientName.trim().length >= 2;
    if (!restoredClientAnswered) {
      setWizardStep("intake");
      setIntakeActiveQuestion(1);
      return;
    }

    if (missingPickupAddress) {
      setWizardStep("route");
      setRouteActiveQuestion(1);
      return;
    }

    if (missingDeliveryAddress) {
      setWizardStep("route");
      setRouteActiveQuestion(2);
      return;
    }

    if (missingTimeWindow) {
      setWizardStep("route");
      setRouteActiveQuestion(missingPickupTimeWindow ? 3 : 4);
      return;
    }

    if (missingQuantity) {
      setWizardStep("cargo");
      setCargoActiveQuestion(1);
      return;
    }

    if (!cargoHasDimensions) {
      setWizardStep("cargo");
      setCargoActiveQuestion(2);
      return;
    }

    if (missingWeight) {
      setWizardStep("cargo");
      setCargoActiveQuestion(3);
      return;
    }

    if (!(transportType || suggestedTransportType) || !(voertuigtype || suggestedVehicleType) || !afdeling) {
      setWizardStep("cargo");
      setCargoActiveQuestion(4);
      return;
    }

    if (pricingPayload.cents == null) {
      setWizardStep("financial");
      return;
    }

    setWizardStep("review");
    setReviewActiveQuestion(1);
  }, [
    afdeling,
    clientAnswered,
    clientName,
    draftRestored,
    missingDeliveryAddress,
    missingPickupAddress,
    missingPickupTimeWindow,
    missingQuantity,
    cargoHasDimensions,
    missingTimeWindow,
    missingWeight,
    pricingPayload.cents,
    suggestedTransportType,
    suggestedVehicleType,
    transportType,
    voertuigtype,
  ]);

  useEffect(() => {
    if (!draftRestored || intakeManualBack || wizardStep !== "intake" || !clientAnswered) return;

    if (missingPickupAddress) {
      setWizardStep("route");
      setRouteActiveQuestion(1);
      return;
    }

    if (missingDeliveryAddress) {
      setWizardStep("route");
      setRouteActiveQuestion(2);
      return;
    }

    if (missingTimeWindow) {
      setWizardStep("route");
      setRouteActiveQuestion(missingPickupTimeWindow ? 3 : 4);
      return;
    }

    if (missingQuantity) {
      setWizardStep("cargo");
      setCargoActiveQuestion(1);
      return;
    }

    if (!cargoHasDimensions) {
      setWizardStep("cargo");
      setCargoActiveQuestion(2);
      return;
    }

    if (missingWeight) {
      setWizardStep("cargo");
      setCargoActiveQuestion(3);
      return;
    }

    if (!(transportType || suggestedTransportType) || !(voertuigtype || suggestedVehicleType) || !afdeling) {
      setWizardStep("cargo");
      setCargoActiveQuestion(4);
      return;
    }

    if (pricingPayload.cents == null) {
      setWizardStep("financial");
      return;
    }

    setWizardStep("review");
    setReviewActiveQuestion(1);
  }, [
    afdeling,
    clientAnswered,
    draftRestored,
    intakeManualBack,
    cargoHasDimensions,
    missingDeliveryAddress,
    missingPickupAddress,
    missingPickupTimeWindow,
    missingQuantity,
    missingTimeWindow,
    missingWeight,
    pricingPayload.cents,
    suggestedTransportType,
    suggestedVehicleType,
    transportType,
    voertuigtype,
    wizardStep,
  ]);

  useEffect(() => {
    if (!draftStorageKey || !prefillReady || !draftRestored) return;
    const timer = window.setTimeout(() => {
      const savedAt = new Date().toISOString();
      window.localStorage.setItem(draftStorageKey, JSON.stringify({ ...draftPayload, savedAt }));
      setLastDraftSavedAt(savedAt);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [draftPayload, draftRestored, draftStorageKey, prefillReady]);

  useEffect(() => {
    if (!prefillReady) return;
    if (baselineSignatureRef.current !== null) {
      setDirty(formSignature !== baselineSignatureRef.current);
      return;
    }
    // Kleine delay zodat alle prefill-setters in dezelfde batch afronden.
    const t = setTimeout(() => {
      baselineSignatureRef.current = formSignature;
    }, 50);
    return () => clearTimeout(t);
  }, [prefillReady, formSignature]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const attemptCancel = () => {
    if (dirty && !skipDirtyGuardRef.current) {
      setShowUnsavedDialog(true);
      return;
    }
    navigate("/orders");
  };

  type WizardFocusTarget = "client" | "pickup" | "delivery" | "quantity" | "dimensions" | "weight" | "time" | "transport" | "security" | "pricing";

  const openWizardFocusTarget = (target: WizardFocusTarget) => {
    setMainTab("algemeen");

    if (target === "client") {
      setWizardStep("intake");
      setIntakeManualBack(true);
      setIntakeActiveQuestion(1);
    }
    if (target === "pickup") {
      setWizardStep("route");
      setRouteManualBack(true);
      setRouteActiveQuestion(1);
    }
    if (target === "delivery") {
      setWizardStep("route");
      setRouteManualBack(true);
      setRouteActiveQuestion(2);
    }
    if (target === "time") {
      setWizardStep("route");
      setRouteManualBack(true);
      setRouteActiveQuestion(
        missingPickupTimeWindow
          ? 3
          : missingDeliveryTimeWindow
            ? 4
            : routeQuestionForIssue(routeRuleIssues[0]),
      );
    }
    if (target === "quantity") {
      setWizardStep("cargo");
      setCargoManualBack(true);
      setCargoActiveQuestion(1);
    }
    if (target === "weight") {
      setWizardStep("cargo");
      setCargoManualBack(true);
      setCargoActiveQuestion(3);
    }
    if (target === "dimensions") {
      setWizardStep("cargo");
      setCargoManualBack(true);
      setCargoActiveQuestion(2);
    }
    if (target === "transport" || target === "security") {
      setWizardStep("cargo");
      setCargoManualBack(true);
      setCargoActiveQuestion(4);
    }
    if (target === "pricing") {
      setWizardStep("financial");
    }

    window.setTimeout(() => {
      const selectorByTarget: Record<WizardFocusTarget, string> = {
        client: "input[placeholder^='Typ klantnaam']",
        pickup: "input[placeholder='Typ bedrijfsnaam, straat of dockadres']",
        delivery: "input[placeholder^='Typ warehouse']",
        quantity: "input[placeholder='Bijv. 6']",
        weight: "input[placeholder='Bijv. 850']",
        time: "input[type='date'], input[type='time']",
        transport: "[role='combobox']",
        security: "button[aria-checked]",
        pricing: "input[placeholder='0']",
      };
      const element = document.querySelector<HTMLElement>(selectorByTarget[target]);
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
      element?.focus();
    }, 150);
  };

  const validationTargetByErrorKey: Record<string, WizardFocusTarget> = {
    client_name: "client",
    pickup_address: "pickup",
    pickup_structured: "pickup",
    delivery_address: "delivery",
    delivery_structured: "delivery",
    quantity: "quantity",
    unit: "quantity",
    weight_kg: "weight",
    afdeling: "transport",
    pickup_time_window: "time",
    delivery_time_window: "time",
    route_sequence: "time",
    route_duplicate: "delivery",
    vehicle_capacity: "transport",
    pmt_method: "security",
  };

  const readinessItems = orderReadiness.issues as Array<ReadinessIssue & { target: WizardFocusTarget; severity: ReadinessSeverity }>;
  const readinessBlockers = orderReadiness.blockers;
  const readinessWarnings = orderReadiness.warnings;
  const readinessInfos = orderReadiness.infos;
  const readinessStatus = orderReadiness.status;
  const readinessTone = readinessBlockers.length > 0 ? "red" : readinessWarnings.length > 0 ? "amber" : "green";
  const readinessTitle = readinessBlockers.length > 0
    ? `${readinessBlockers.length} punt${readinessBlockers.length > 1 ? "en" : ""} nodig voor ready`
    : readinessWarnings.length > 0
      ? "Ready met aandachtspunten"
      : "Ready voor planning";

  const validationSnapshot = useMemo(() => ({
    engineVersion: ORDER_VALIDATION_ENGINE_VERSION,
    status: orderReadiness.status,
    persistedStatus: orderReadiness.persistedStatus,
    score: orderReadiness.score,
    blockers: orderReadiness.blockers.map(({ id, key, label, detail, severity, target }) => ({ id, key, label, detail, severity, target })),
    warnings: orderReadiness.warnings.map(({ id, key, label, detail, severity, target }) => ({ id, key, label, detail, severity, target })),
    infos: orderReadiness.infos.map(({ id, key, label, detail, severity, target }) => ({ id, key, label, detail, severity, target })),
    validatedAt: new Date().toISOString(),
  }), [orderReadiness]);

  const manualOverridesSnapshot = useMemo(() => ({
    transport_type: transportTypeManual && transportType
      ? { value: transportType, reason: "Handmatig ingesteld door planner" }
      : null,
    vehicle_type: voertuigtypeManual && voertuigtype
      ? { value: voertuigtype, reason: "Handmatig ingesteld door planner" }
      : null,
    afdeling: afdelingManual && afdeling
      ? { value: afdeling, reason: "Handmatig ingesteld door planner" }
      : null,
  }), [afdeling, afdelingManual, transportType, transportTypeManual, voertuigtype, voertuigtypeManual]);

  const serverDraftPayload = useMemo(() => ({
    lifecycle: {
      model: "draft-shipment-trip",
      draftStatus: readinessStatus,
    },
    validationEngineVersion: ORDER_VALIDATION_ENGINE_VERSION,
    pricingEngineVersion: ORDER_PRICING_ENGINE_VERSION,
    orderDraft,
    form: draftPayload,
    wizard: {
      step: wizardStep,
      intakeActiveQuestion,
      routeActiveQuestion,
      cargoActiveQuestion,
      reviewActiveQuestion,
    },
    pricingPayload,
    observability: {
      step: wizardStep,
      score: orderReadiness.score,
      blockers: orderReadiness.blockers.length,
      warnings: orderReadiness.warnings.length,
      infos: orderReadiness.infos.length,
    },
    savedAt: new Date().toISOString(),
  }), [
    cargoActiveQuestion,
    draftPayload,
    intakeActiveQuestion,
    orderDraft,
    orderReadiness.blockers.length,
    orderReadiness.infos.length,
    orderReadiness.score,
    orderReadiness.warnings.length,
    pricingPayload,
    readinessStatus,
    reviewActiveQuestion,
    routeActiveQuestion,
    wizardStep,
  ]);

  const describeDraftEditor = useCallback((updatedBy?: string | null) => {
    if (!updatedBy) return "een andere sessie";
    if (updatedBy === user?.id) return "jouw andere sessie";
    return "een andere gebruiker";
  }, [user?.id]);

  const upsertServerDraft = useCallback(async (nextStatus: ServerDraftLifecycleStatus = "DRAFT", committedShipmentId?: string | null) => {
    if (!tenant?.id || initialClientId || fromOrderId) return null;
    let draftId = serverDraftId;
    const actorId = user?.id ?? null;
    const payload = {
      tenant_id: tenant.id,
      status: nextStatus,
      payload: serverDraftPayload,
      validation_result: validationSnapshot,
      manual_overrides: manualOverridesSnapshot,
      validation_engine_version: ORDER_VALIDATION_ENGINE_VERSION,
      pricing_engine_version: ORDER_PRICING_ENGINE_VERSION,
      updated_by: actorId,
      last_activity_at: new Date().toISOString(),
      analytics: (serverDraftPayload as any).observability ?? {},
      ...(committedShipmentId && draftId
        ? {
            committed_shipment_id: committedShipmentId,
            committed_at: new Date().toISOString(),
            commit_idempotency_key: `draft:${draftId}`,
          }
        : {}),
    };

    if (!draftId) {
      const { data, error } = await (supabase as any)
        .from("order_drafts")
        .insert({ ...payload, created_by: actorId })
        .select("id, updated_at, updated_by")
        .single();
      if (error) throw error;
      draftId = data?.id ?? null;
      if (draftId) {
        setServerDraftId(draftId);
        setServerDraftUpdatedAt(data?.updated_at ?? null);
        setServerDraftUpdatedBy(data?.updated_by ?? null);
        setServerBaselineSignature(formSignature);
        if (serverDraftStorageKey) window.localStorage.setItem(serverDraftStorageKey, draftId);
      }
      return draftId;
    }

    let updateQuery = (supabase as any)
      .from("order_drafts")
      .update(payload)
      .eq("id", draftId)
      .eq("tenant_id", tenant.id);
    if (serverDraftUpdatedAt) {
      updateQuery = updateQuery.eq("updated_at", serverDraftUpdatedAt);
    }
    const { data: updatedDraft, error } = await updateQuery
      .select("id, updated_at, updated_by")
      .maybeSingle();
    if (error) throw error;
    if (!updatedDraft?.id) {
      const { data: latestDraft, error: latestError } = await (supabase as any)
        .from("order_drafts")
        .select("id, updated_at, updated_by")
        .eq("id", draftId)
        .eq("tenant_id", tenant.id)
        .maybeSingle();
      if (latestError) throw latestError;
      if (latestDraft?.id) {
        setServerDraftUpdatedAt(latestDraft.updated_at ?? null);
        setServerDraftUpdatedBy(latestDraft.updated_by ?? null);
        setDraftSaveStatus("conflict");
        const message = `Deze order is zojuist aangepast door ${describeDraftEditor(latestDraft.updated_by)}.`;
        setDraftSaveError(message);
        throw new Error(message);
      }
      if (serverDraftStorageKey) window.localStorage.removeItem(serverDraftStorageKey);
      setServerDraftId(null);
      setServerDraftUpdatedAt(null);
      setServerDraftUpdatedBy(null);
      const { data, error: insertError } = await (supabase as any)
        .from("order_drafts")
        .insert({ ...payload, created_by: actorId })
        .select("id, updated_at, updated_by")
        .single();
      if (insertError) throw insertError;
      draftId = data?.id ?? null;
      if (draftId) {
        setServerDraftId(draftId);
        setServerDraftUpdatedAt(data?.updated_at ?? null);
        setServerDraftUpdatedBy(data?.updated_by ?? null);
        setServerBaselineSignature(formSignature);
        if (serverDraftStorageKey) window.localStorage.setItem(serverDraftStorageKey, draftId);
      }
    } else {
      setServerDraftUpdatedAt(updatedDraft.updated_at ?? null);
      setServerDraftUpdatedBy(updatedDraft.updated_by ?? null);
      setServerBaselineSignature(formSignature);
    }
    return draftId;
  }, [
    describeDraftEditor,
    formSignature,
    fromOrderId,
    initialClientId,
    manualOverridesSnapshot,
    serverDraftUpdatedAt,
    serverDraftId,
    serverDraftPayload,
    serverDraftStorageKey,
    tenant?.id,
    user?.id,
    validationSnapshot,
  ]);

  useEffect(() => {
    if (!tenant?.id || initialClientId || fromOrderId || !serverDraftStorageKey || serverDraftReady || serverDraftCreateStartedRef.current) return;
    serverDraftCreateStartedRef.current = true;
    const existingDraftId = window.localStorage.getItem(serverDraftStorageKey);
    if (existingDraftId) {
      void (async () => {
        try {
          setDraftSaveStatus("creating");
          const { data, error } = await (supabase as any)
            .from("order_drafts")
            .select("id, updated_at, updated_by")
            .eq("id", existingDraftId)
            .eq("tenant_id", tenant.id)
            .maybeSingle();
          if (error) throw error;
          if (!data?.id) {
            window.localStorage.removeItem(serverDraftStorageKey);
            const { data: created, error: createError } = await (supabase as any)
              .from("order_drafts")
              .insert({
                tenant_id: tenant.id,
                status: "DRAFT",
                payload: serverDraftPayload,
                validation_result: validationSnapshot,
                manual_overrides: manualOverridesSnapshot,
                validation_engine_version: ORDER_VALIDATION_ENGINE_VERSION,
                pricing_engine_version: ORDER_PRICING_ENGINE_VERSION,
                last_activity_at: new Date().toISOString(),
                analytics: (serverDraftPayload as any).observability ?? {},
                created_by: user?.id ?? null,
                updated_by: user?.id ?? null,
              })
              .select("id, updated_at, updated_by")
              .single();
            if (createError) throw createError;
            if (created?.id) {
              setServerDraftId(created.id);
              setServerDraftUpdatedAt(created.updated_at ?? null);
              setServerDraftUpdatedBy(created.updated_by ?? null);
              setServerBaselineSignature(formSignature);
              window.localStorage.setItem(serverDraftStorageKey, created.id);
            }
            setDraftSaveStatus("saved");
            return;
          }
          setServerDraftId(data.id);
          setServerDraftUpdatedAt(data.updated_at ?? null);
          setServerDraftUpdatedBy(data.updated_by ?? null);
          setServerBaselineSignature(formSignature);
          setDraftSaveStatus("saved");
        } catch (error) {
          console.warn("[NewOrder] server draft kon niet worden hervat:", error);
          setDraftSaveStatus("error");
          setDraftSaveError("Serverconcept kon niet worden hervat.");
        } finally {
          setServerDraftReady(true);
        }
      })();
      return;
    }

    void (async () => {
      try {
        setDraftSaveStatus("creating");
        const { data, error } = await (supabase as any)
          .from("order_drafts")
          .insert({
            tenant_id: tenant.id,
            status: "DRAFT",
            payload: serverDraftPayload,
            validation_result: validationSnapshot,
            manual_overrides: manualOverridesSnapshot,
            validation_engine_version: ORDER_VALIDATION_ENGINE_VERSION,
            pricing_engine_version: ORDER_PRICING_ENGINE_VERSION,
            last_activity_at: new Date().toISOString(),
            analytics: (serverDraftPayload as any).observability ?? {},
            created_by: user?.id ?? null,
            updated_by: user?.id ?? null,
          })
          .select("id, updated_at, updated_by")
          .single();
        if (error) throw error;
        const id = data?.id ?? null;
        if (id) {
          setServerDraftId(id);
          setServerDraftUpdatedAt(data?.updated_at ?? null);
          setServerDraftUpdatedBy(data?.updated_by ?? null);
          setServerBaselineSignature(formSignature);
          window.localStorage.setItem(serverDraftStorageKey, id);
        }
        setDraftSaveStatus("saved");
        setServerDraftReady(true);
      } catch (error) {
        console.warn("[NewOrder] server draft kon niet worden aangemaakt:", error);
        setDraftSaveStatus("error");
        setDraftSaveError("Serverconcept kon niet worden aangemaakt.");
        serverDraftCreateStartedRef.current = false;
        setServerDraftReady(true);
      }
    })();
  }, [
    fromOrderId,
    initialClientId,
    manualOverridesSnapshot,
    serverDraftReady,
    serverDraftStorageKey,
    serverDraftPayload,
    formSignature,
    tenant?.id,
    user?.id,
    validationSnapshot,
  ]);

  useEffect(() => {
    if (!serverDraftReady || !serverDraftId || !draftRestored || !prefillReady || initialClientId || fromOrderId) return;
    if (serverBaselineSignature === formSignature) return;
    if (draftAutosaveTimerRef.current) window.clearTimeout(draftAutosaveTimerRef.current);
    draftAutosaveTimerRef.current = window.setTimeout(() => {
      setDraftSaveStatus("saving");
      setDraftSaveError(null);
      void upsertServerDraft("DRAFT")
        .then(() => {
          setLastDraftSavedAt(new Date().toISOString());
          setDraftSaveStatus("saved");
        })
        .catch((error) => {
          console.warn("[NewOrder] server draft autosave faalde:", error);
          if (error instanceof Error && error.message.startsWith("Deze order is zojuist aangepast")) {
            setDraftSaveStatus("conflict");
            setDraftSaveError(error.message);
          } else {
            setDraftSaveStatus("error");
            setDraftSaveError("Opslaan mislukt - probeer opnieuw.");
          }
        });
    }, 1400);
    return () => {
      if (draftAutosaveTimerRef.current) window.clearTimeout(draftAutosaveTimerRef.current);
    };
  }, [
    draftRestored,
    formSignature,
    fromOrderId,
    initialClientId,
    prefillReady,
    serverDraftId,
    serverDraftReady,
    serverBaselineSignature,
    upsertServerDraft,
  ]);

  // 8.12 - Save ALL form fields to the database, not just a subset.
  // Fields without a dedicated DB column are stored in the `attachments` JSON
  // column as structured metadata so nothing is lost.
  const handleSave = async (andClose: boolean) => {
    const pickupLine = freightLines.find(f => f.activiteit === "Laden");
    const deliveryLine = freightLines.find(f => f.activiteit === "Lossen");

    if (!andClose) {
      if (draftStorageKey) {
        window.localStorage.setItem(draftStorageKey, JSON.stringify({ ...draftPayload, savedAt: new Date().toISOString() }));
      }
      setDraftSaveStatus("saving");
      setDraftSaveError(null);
      try {
        await upsertServerDraft("DRAFT");
      } catch (error) {
        console.warn("[NewOrder] server draft opslaan faalde:", error);
        const message = error instanceof Error && error.message.startsWith("Deze order is zojuist aangepast")
          ? error.message
          : "Opslaan mislukt - probeer opnieuw.";
        setDraftSaveStatus(error instanceof Error && error.message.startsWith("Deze order is zojuist aangepast") ? "conflict" : "error");
        setDraftSaveError(message);
        toast.error(message);
        return;
      }
      setDraftSaveStatus("saved");
      setLastDraftSavedAt(new Date().toISOString());
      setDirty(false);
      toast.success("Concept opgeslagen", {
        description: serverDraftId ? `Draft ${serverDraftId.slice(0, 8)} blijft veilig bewaard.` : "De order blijft als draft staan totdat je gereedmeldt.",
      });
      return;
    }

    if (orderReadiness.blockers.length > 0) {
      const firstBlocker = orderReadiness.blockers[0];
      focusWizardTarget(firstBlocker.target as WizardFocusTarget);
      toast.error(`${orderReadiness.blockers.length} punt${orderReadiness.blockers.length > 1 ? "en" : ""} nodig om gereed te melden`, {
        description: orderReadiness.blockers.map((blocker) => blocker.label).join(" | "),
      });
      return;
    }

    // Centrale validatie via orderFormSchema.parse. De schema dekt nu ook de
    // gestructureerde adres-checks (street/zipcode/city plus de "is geen losse
    // plaatsnaam"-regel) via superRefine, dus elke ZodError vertaalt direct
    // naar een UI-veldfout zonder parallelle if/else-ketens.
    const quantityNum = cargoTotals.totAantal || (quantity ? parseInt(quantity) : NaN);
    const weightNum = cargoTotals.totGewicht || (weightKg ? parseFloat(weightKg) : NaN);
    try {
      orderFormSchema.parse({
        client_name: clientName,
        pickup_address: pickupLine?.locatie ?? "",
        delivery_address: deliveryLine?.locatie ?? "",
        quantity: Number.isFinite(quantityNum) ? quantityNum : undefined,
        weight_kg: Number.isFinite(weightNum) ? weightNum : undefined,
        unit: cargoTotals.primaryUnit || transportEenheid,
        afdeling: afdeling,
        pickup_structured: {
          street: pickupAddr.street,
          zipcode: pickupAddr.zipcode,
          city: pickupAddr.city,
        },
        delivery_structured: {
          street: deliveryAddr.street,
          zipcode: deliveryAddr.zipcode,
          city: deliveryAddr.city,
        },
      });
    } catch (err) {
      if (err instanceof ZodError) {
        const newErrors: Record<string, string> = {};
        for (const issue of err.issues) {
          const key = issue.path[0]?.toString();
          if (key && !newErrors[key]) newErrors[key] = issue.message;
        }
        setErrors(newErrors);
        const firstErrorKey = Object.keys(newErrors)[0];
        openWizardFocusTarget(validationTargetByErrorKey[firstErrorKey] ?? "client");
        const count = Object.keys(newErrors).length;
        toast.error(`Formulier bevat ${count} validatiefout${count > 1 ? "en" : ""}`, {
          description: Object.values(newErrors).join(" | "),
        });
        return;
      }
      throw err;
    }

    const ruleErrors: Record<string, string> = {};
    if (!pickupLine?.datum) {
      ruleErrors.pickup_time_window = "Pickup datum is verplicht.";
    }
    if (cargoRuleIssues.length > 0) {
      ruleErrors.quantity = cargoRuleIssues[0];
    }
    if (vehicleRuleIssue) {
      ruleErrors.vehicle_capacity = vehicleRuleIssue;
    }
    if (showPmt && !shipmentSecure && !pmtMethode) {
      ruleErrors.pmt_method = "Kies EDD of X-RAY als luchtvracht niet Secure is.";
    }
    if (Object.keys(ruleErrors).length > 0) {
      setErrors(ruleErrors);
      const firstErrorKey = Object.keys(ruleErrors)[0];
      openWizardFocusTarget(validationTargetByErrorKey[firstErrorKey] ?? "client");
      const count = Object.keys(ruleErrors).length;
      toast.error(`Formulier bevat ${count} validatiefout${count > 1 ? "en" : ""}`, {
        description: Object.values(ruleErrors).join(" | "),
      });
      return;
    }

    if (routeRuleIssues.length > 0) {
      const routeErrors = routeRuleIssues.reduce<Record<string, string>>((acc, issue) => {
        const key = issue.key === "route_duplicate" ? "delivery_address" : issue.key;
        if (!acc[key]) acc[key] = issue.message;
        return acc;
      }, {});
      setErrors(routeErrors);
      const firstErrorKey = Object.keys(routeErrors)[0];
      openWizardFocusTarget(validationTargetByErrorKey[firstErrorKey] ?? "time");
      const count = Object.keys(routeErrors).length;
      toast.error(`Route bevat ${count} logische fout${count > 1 ? "en" : ""}`, {
        description: Object.values(routeErrors).join(" | "),
      });
      return;
    }

    setErrors({});
    setSaving(true);
    try {
      if (!tenant?.id) throw new Error("Geen actieve tenant gevonden");
      if (serverDraftId) {
        const { data: draftRow, error: draftFetchError } = await (supabase as any)
          .from("order_drafts")
          .select("committed_shipment_id, updated_at, updated_by")
          .eq("id", serverDraftId)
          .eq("tenant_id", tenant.id)
          .maybeSingle();
        if (draftFetchError) throw draftFetchError;
        if (draftRow?.updated_at && serverDraftUpdatedAt && draftRow.updated_at !== serverDraftUpdatedAt) {
          const message = `Deze order is zojuist aangepast door ${describeDraftEditor(draftRow.updated_by)}.`;
          setDraftSaveStatus("conflict");
          setDraftSaveError(message);
          toast.error(message, {
            description: "Gereedmelden is gestopt zodat we geen oudere lokale versie committen.",
          });
          return;
        }
        if (draftRow?.updated_at) {
          setServerDraftUpdatedAt(draftRow.updated_at);
          setServerDraftUpdatedBy(draftRow.updated_by ?? null);
        }
        if (draftRow?.committed_shipment_id) {
          toast.info("Deze draft was al gereedgemeld", {
            description: "Ik voorkom een dubbele order en open de orderlijst.",
          });
          setDirty(false);
          skipDirtyGuardRef.current = true;
          navigate("/orders");
          return;
        }
      }

      const lossenLocaties = freightLines
        .filter(f => f.activiteit === "Lossen" && f.locatie?.trim())
        .map(f => f.locatie.trim());
      const finalDeliveryAddress =
        lossenLocaties.length >= 2 ? lossenLocaties[lossenLocaties.length - 1] : undefined;

      // §24 Pricing wiring, payload komt uit FinancialTab via onPricingChange.

      // §25 Cargo-detail als JSONB array
      const cargoPayload = cargoRows
        .filter(r => r.aantal || r.gewicht)
        .map(r => ({
          aantal: parseInt(r.aantal) || 0,
          eenheid: r.eenheid || null,
          gewicht: parseFloat(r.gewicht) || 0,
          lengte: parseFloat(r.lengte) || null,
          breedte: parseFloat(r.breedte) || null,
          hoogte: parseFloat(r.hoogte) || null,
          stapelbaar: r.stapelbaar,
          adr: r.adr || null,
          omschrijving: r.omschrijving || null,
        }));

      // §25 PMT-gegevens als JSONB
      const pmtPayload = showPmt ? {
        secure: shipmentSecure,
        methode: shipmentSecure ? null : (pmtMethode || null),
        operator: pmtOperator.trim() || null,
        referentie: pmtReferentie.trim() || null,
        datum: pmtDatum || null,
        locatie: pmtLocatie.trim() || null,
        seal: pmtSeal.trim() || null,
        by_customer: pmtByCustomer,
      } : null;

      // §25 Dimensions samengesteld uit cargo-rij afmetingen
      const dimParts = cargoRows
        .filter(r => r.lengte && r.breedte && r.hoogte)
        .map(r => `${r.lengte}×${r.breedte}×${r.hoogte}cm`);
      const dimensionsStr = dimParts.length > 0 ? dimParts.join(", ") : (afmetingen || null);

      // Requirements array
      const reqs: string[] = [];
      const routeRequiresTailLift = freightLines.some((line) => line.requiresTailLift);
      const routeRequiresTemperature = freightLines.some((line) => line.temperatureControlled);
      const routeRequiresPhotos = freightLines.some((line) => line.photoRequired);
      if (klepNodig || routeRequiresTailLift) reqs.push("laadklep");
      if (routeRequiresTemperature) reqs.push("temperatuur");
      if (routeRequiresPhotos) reqs.push("fotos_verplicht");
      const distanceKm = totalRouteDistanceKm(routeMapStops);
      const resolvedTransportType = transportType || suggestedTransportType || null;
      const resolvedVehicleType = voertuigtype || suggestedVehicleType || null;

      const booking: BookingInput = {
        pickup_address: pickupLine?.locatie || null,
        delivery_address: deliveryLine?.locatie || null,
        final_delivery_address: finalDeliveryAddress,
        source: "INTERN",
        status: readinessStatus,
        client_name: clientName.trim(),
        client_id: clientId,
        transport_type: resolvedTransportType,
        afdeling: afdeling || null,
        distance_km: distanceKm,
        weight_kg: weightKg ? parseInt(weightKg) : null,
        quantity: quantity ? parseInt(quantity) : null,
        unit: transportEenheid || null,
        priority: prioriteit || null,
        requirements: reqs.length > 0 ? reqs : null,
        pickup_time_window_start: pickupLine?.tijd || pickupTimeFrom || null,
        pickup_time_window_end: pickupLine?.tijdTot || pickupTimeTo || null,
        delivery_time_window_start: deliveryLine?.tijd || deliveryTimeFrom || null,
        delivery_time_window_end: deliveryLine?.tijdTot || deliveryTimeTo || null,
        notes: referentie.trim() || null,
        price_total_cents: pricingPayload.cents,
        pricing: pricingPayload.details,
        // §25 Shipment-level velden
        contact_person: contactpersoon || null,
        vehicle_type: resolvedVehicleType,
        client_reference: klantReferentie.trim() || null,
        mrn_document: mrnDoc.trim() || null,
        requires_tail_lift: klepNodig || routeRequiresTailLift,
        pmt: pmtPayload,
        cargo: cargoPayload.length > 0 ? cargoPayload : null,
        // Per-leg detail
        pickup_date_str: pickupLine?.datum || null,
        delivery_date_str: deliveryLine?.datum || null,
        pickup_reference: pickupLine?.referentie || null,
        delivery_reference: deliveryLine?.referentie || null,
        pickup_contact: pickupLine?.contactLocatie || null,
        delivery_contact: deliveryLine?.contactLocatie || null,
        pickup_notes: pickupLine?.opmerkingen || null,
        delivery_notes: deliveryLine?.opmerkingen || null,
        dimensions: dimensionsStr,
        pickup_street: pickupAddr.street || null,
        pickup_house_number: pickupAddr.house_number || null,
        pickup_house_number_suffix: pickupAddr.house_number_suffix || null,
        pickup_zipcode: pickupAddr.zipcode || null,
        pickup_city: pickupAddr.city || null,
        pickup_country: pickupAddr.country || null,
        pickup_lat: pickupAddr.lat,
        pickup_lng: pickupAddr.lng,
        pickup_coords_manual: pickupAddr.coords_manual,
        delivery_street: deliveryAddr.street || null,
        delivery_house_number: deliveryAddr.house_number || null,
        delivery_house_number_suffix: deliveryAddr.house_number_suffix || null,
        delivery_zipcode: deliveryAddr.zipcode || null,
        delivery_city: deliveryAddr.city || null,
        delivery_country: deliveryAddr.country || null,
        delivery_lat: deliveryAddr.lat,
        delivery_lng: deliveryAddr.lng,
        delivery_coords_manual: deliveryAddr.coords_manual,
        manual_overrides: {
          transport_type: transportTypeManual && transportType
            ? { value: transportType, reason: "Handmatig ingesteld door planner" }
            : null,
          vehicle_type: voertuigtypeManual && voertuigtype
            ? { value: voertuigtype, reason: "Handmatig ingesteld door planner" }
            : null,
          afdeling: afdelingManual && afdeling
            ? { value: afdeling, reason: "Handmatig ingesteld door planner" }
            : null,
        },
      };

      const { shipment, legs, idempotent } = serverDraftId
        ? await commitOrderDraftWithLegs({
            draftId: serverDraftId,
            tenantId: tenant.id,
            expectedUpdatedAt: serverDraftUpdatedAt,
            booking,
            payload: serverDraftPayload as Record<string, unknown>,
            validationResult: validationSnapshot as Record<string, unknown>,
            manualOverrides: manualOverridesSnapshot,
            commitKey: `draft:${serverDraftId}`,
          })
        : await createShipmentWithLegs(booking, tenant.id);
      const addressBookWrites: Array<Promise<unknown>> = [];
      const pickupAddressBookLabelValue =
        pickupAddressBookLabel?.key === buildAddressBookKey(pickupAddr)
          ? pickupAddressBookLabel.label
          : null;
      const deliveryAddressBookLabelValue =
        deliveryAddressBookLabel?.key === buildAddressBookKey(deliveryAddr)
          ? deliveryAddressBookLabel.label
          : null;
      if (pickupLine?.locatie) {
        addressBookWrites.push(upsertAddressBookEntry.mutateAsync({
          label: pickupAddressBookLabelValue || pickupLine.locatie,
          company_name: pickupLine.companyName || pickupAddressBookLabelValue || clientName || null,
          address: pickupLine.locatie,
          street: pickupAddr.street,
          house_number: pickupAddr.house_number,
          house_number_suffix: pickupAddr.house_number_suffix,
          zipcode: pickupAddr.zipcode,
          city: pickupAddr.city,
          country: pickupAddr.country,
          lat: pickupAddr.lat,
          lng: pickupAddr.lng,
          coords_manual: pickupAddr.coords_manual,
          location_type: "pickup",
          notes: pickupLine.opmerkingen || null,
          driver_instructions: pickupLine.driverInstructions || pickupLine.opmerkingen || null,
          requires_tail_lift: Boolean(pickupLine.requiresTailLift),
          temperature_controlled: Boolean(pickupLine.temperatureControlled),
          photo_required: Boolean(pickupLine.photoRequired),
          time_window_start: pickupLine.tijd || null,
          time_window_end: pickupLine.tijdTot || null,
          source: "order",
        }));
      }
      if (deliveryLine?.locatie) {
        addressBookWrites.push(upsertAddressBookEntry.mutateAsync({
          label: deliveryAddressBookLabelValue || deliveryLine.locatie,
          company_name: deliveryLine.companyName || deliveryAddressBookLabelValue || clientName || null,
          address: deliveryLine.locatie,
          street: deliveryAddr.street,
          house_number: deliveryAddr.house_number,
          house_number_suffix: deliveryAddr.house_number_suffix,
          zipcode: deliveryAddr.zipcode,
          city: deliveryAddr.city,
          country: deliveryAddr.country,
          lat: deliveryAddr.lat,
          lng: deliveryAddr.lng,
          coords_manual: deliveryAddr.coords_manual,
          location_type: "delivery",
          notes: deliveryLine.opmerkingen || null,
          driver_instructions: deliveryLine.driverInstructions || deliveryLine.opmerkingen || null,
          requires_tail_lift: Boolean(deliveryLine.requiresTailLift),
          temperature_controlled: Boolean(deliveryLine.temperatureControlled),
          photo_required: Boolean(deliveryLine.photoRequired),
          time_window_start: deliveryLine.tijd || null,
          time_window_end: deliveryLine.tijdTot || null,
          source: "order",
        }));
      }
      for (const line of extraDeliveryLines) {
        if (!line.locatie) continue;
        const value = addressValueFromFreightLine(line);
        addressBookWrites.push(upsertAddressBookEntry.mutateAsync({
          label: line.companyName || line.locatie,
          company_name: line.companyName || clientName || null,
          address: line.locatie,
          street: value.street,
          house_number: value.house_number,
          house_number_suffix: value.house_number_suffix,
          zipcode: value.zipcode,
          city: value.city,
          country: value.country,
          lat: value.lat,
          lng: value.lng,
          coords_manual: value.coords_manual,
          location_type: "delivery",
          notes: line.opmerkingen || null,
          driver_instructions: line.driverInstructions || line.opmerkingen || null,
          requires_tail_lift: Boolean(line.requiresTailLift),
          temperature_controlled: Boolean(line.temperatureControlled),
          photo_required: Boolean(line.photoRequired),
          time_window_start: line.tijd || null,
          time_window_end: line.tijdTot || null,
          source: "order",
        }));
      }
      if (addressBookWrites.length > 0) {
        await Promise.all(addressBookWrites).catch((error) => {
          console.warn("[NewOrder] adresboek bijwerken faalde:", error);
          toast.warning("Order opgeslagen, maar adresboek kon niet volledig worden bijgewerkt");
        });
      }
      // Audit wordt server-side door trigger `audit_orders` per leg-INSERT geschreven.

      // §22 Info-tracking: insert info-requests voor elk veld dat "volgt van klant"
      const checkedFields = TRACKABLE_FIELDS.filter(f => infoFollows[f.name]);
      if (checkedFields.length > 0 && legs.length > 0) {
        const pickupIso = (() => {
          const d = pickupLine?.datum;
          const t = pickupLine?.tijd || pickupTimeFrom;
          if (!d) return null;
          const combined = t ? `${d}T${t}:00` : `${d}T08:00:00`;
          const parsed = new Date(combined);
          return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
        })();
        const expected_by = defaultExpectedBy(pickupIso);
        const rows = legs.flatMap((leg: any) =>
          checkedFields.map(f => ({
            tenant_id: tenant.id,
            order_id: leg.id,
            field_name: f.name,
            field_label: f.label,
            status: "PENDING",
            promised_by_name: infoContactName.trim() || (contactpersoon || null),
            promised_by_email: infoContactEmail.trim() || null,
            expected_by,
          }))
        );
        const { error: infoErr } = await (supabase as any)
          .from("order_info_requests")
          .insert(rows);
        if (infoErr) {
          console.warn("[NewOrder] info-request insert faalde:", infoErr);
          toast.warning("Order opgeslagen, maar info-tracking kon niet worden aangemaakt");
        }
      }

      // Auto-rappel voor EXPORT placeholder leg-2: pickup === delivery betekent
      // dat de echte eindbestemming (Dubai, etc.) nog volgt van de klant.
      let exportRappelCreated = false;
      if (
        legs.length === 2 &&
        (legs[1] as any).leg_role === "EXPORT_LEG" &&
        (legs[1] as any).pickup_address &&
        (legs[1] as any).pickup_address === (legs[1] as any).delivery_address
      ) {
        try {
          const { data: existing } = await (supabase as any)
            .from("order_info_requests")
            .select("id")
            .eq("order_id", (legs[1] as any).id)
            .eq("field_name", "delivery_address")
            .eq("status", "PENDING")
            .maybeSingle();
          if (!existing) {
            const leg0Start = (legs[0] as any).time_window_start as string | null | undefined;
            const base = leg0Start ? new Date(leg0Start) : new Date(Date.now() + 24 * 3600 * 1000);
            const expected_by = leg0Start
              ? new Date(base.getTime() - 24 * 3600 * 1000).toISOString()
              : base.toISOString();
            const { error: rappelErr } = await (supabase as any)
              .from("order_info_requests")
              .insert({
                order_id: (legs[1] as any).id,
                tenant_id: tenant.id,
                field_name: "delivery_address",
                field_label: "Eindbestemming export",
                status: "PENDING",
                expected_by,
                promised_by_name: null,
              });
            if (rappelErr) {
              console.warn("[NewOrder] export-rappel insert faalde:", rappelErr);
            } else {
              exportRappelCreated = true;
            }
          }
        } catch (e) {
          console.warn("[NewOrder] export-rappel check faalde:", e);
        }
      }

      const baseMsg =
        idempotent
          ? "Deze draft was al gereedgemeld"
          : legs.length > 1
          ? `Order gereedgemeld met ${legs.length} legs (${legs.map((l) => l.leg_role).join(" + ")})`
          : "Order gereedgemeld";
      toast.success(
        exportRappelCreated ? `${baseMsg} — Rappel voor eindbestemming is aangemaakt` : baseMsg,
      );
      // Na gereedmelden altijd wegnavigeren; dezelfde draft_id blijft idempotent
      // en voorkomt dat refresh of dubbelklikken een dubbele order maakt.
      skipDirtyGuardRef.current = true;
      setDirty(false);
      if (draftStorageKey) {
        window.localStorage.removeItem(draftStorageKey);
      }
      if (serverDraftStorageKey) {
        window.localStorage.removeItem(serverDraftStorageKey);
      }
      if (andClose) {
        navigate("/orders");
      } else if (legs[0]?.id) {
        navigate(`/orders/${legs[0].id}`);
      } else {
        navigate("/orders");
      }
    } catch (e: any) {
      const message = e?.message || "Fout bij opslaan";
      if (message.includes("DRAFT_CONFLICT")) {
        setDraftSaveStatus("conflict");
        setDraftSaveError("Deze order is zojuist aangepast door een andere sessie.");
        toast.error("Deze order is zojuist aangepast door een andere sessie.", {
          description: "Gereedmelden is gestopt zodat we geen oudere lokale versie committen.",
        });
      } else {
        toast.error(message);
      }
    } finally { setSaving(false); }
  };
  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void handleSaveRef.current(e.shiftKey);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Prefill-flow: wacht tot klant-data binnen is (orders mag leeg zijn) en
  // pas eenmalig toe. Client_name/client_id zetten is genoeg — bij ontbreken
  // van vorige orders blijven alle andere velden leeg.
  useEffect(() => {
    if (!initialClientId || prefillApplied.current) return;
    if (!prefillClient) return;

    prefillApplied.current = true;
    setClientId(prefillClient.id);
    setClientName(prefillClient.name);
    if (prefillClient.contact_person) setContactpersoon(prefillClient.contact_person);

    const last = prefillOrders?.[0] as any;
    if (!last) return;

    // Map order-record terug naar form-state. Voorzichtig met mapping van
    // NL-labels uit eerdere form-waarden: de order-record gebruikt database-
    // waarden die afwijken (bv. transport_type).
    if (last.transport_type) setTransportType(last.transport_type);
    if (last.vehicle_type) setVoertuigtype(last.vehicle_type);
    if (last.priority) setPrioriteit(last.priority);
    if (last.unit) setTransportEenheid(last.unit);
    if (Array.isArray(last.requirements) && last.requirements.includes("laadklep")) {
      setKlepNodig(true);
    }
    if (last.pickup_address || last.delivery_address) {
      if (last.pickup_address) {
        setPickupAddr(bestEffortAddressValue(last.pickup_address, prefillClient.country || "NL"));
      }
      if (last.delivery_address) {
        setDeliveryAddr(bestEffortAddressValue(last.delivery_address, prefillClient.country || "NL"));
      }
      setFreightLines((prev) =>
        prev.map((l) => {
          if (l.activiteit === "Laden" && last.pickup_address) {
            return { ...l, locatie: last.pickup_address };
          }
          if (l.activiteit === "Lossen" && last.delivery_address) {
            return { ...l, locatie: last.delivery_address };
          }
          return l;
        }),
      );
    }
    const orderLabel = last.order_number
      ? `RCS-${new Date(last.created_at).getFullYear()}-${String(last.order_number).padStart(4, "0")}`
      : "laatste order";
    toast.success(`Voorgevuld op basis van ${orderLabel}`, {
      description: "Pas tijden, referenties en lading aan voor deze nieuwe order.",
    });
    setPrefillReady(true);
  }, [initialClientId, prefillClient, prefillOrders]);

  // Als de klant geen vorige order heeft, of als er geen prefillClient is na
  // een tijdje, moeten we alsnog de baseline vastleggen zodat de unsaved-
  // warning niet stuk gaat wachten op een prefill die nooit komt.
  useEffect(() => {
    if (!initialClientId && !fromOrderId) return;
    if (prefillReady) return;
    const t = setTimeout(() => setPrefillReady(true), 1500);
    return () => clearTimeout(t);
  }, [initialClientId, fromOrderId, prefillReady]);

  useEffect(() => {
    if (!clientId || !selectedClient) return;
    if (clientDefaultsAppliedRef.current === clientId) return;
    if (initialClientId || fromOrderId) return;

    clientDefaultsAppliedRef.current = clientId;
    if (!pickupAddr.street) {
      const shipping = addressFromClientRecord(selectedClient, "shipping");
      const fallback = composeAddressString(shipping, { includeLocality: true })
        ? shipping
        : addressFromClientRecord(selectedClient, "main");
      if (composeAddressString(fallback, { includeLocality: true })) {
        handlePickupAddrChange(fallback);
      }
    }
    if (!deliveryAddr.street && clientLocations.length === 1) {
      applyPlannerLocation("delivery", {
        id: `autofill-${clientLocations[0].id}`,
        label: clientLocations[0].label,
        subtitle: clientLocations[0].address,
        badge: "Klantlocatie",
        value: addressFromClientLocation(clientLocations[0]),
        addressString: clientLocations[0].address,
        notesHint: clientLocations[0].notes || undefined,
        timeWindowStart: clientLocations[0].time_window_start,
        timeWindowEnd: clientLocations[0].time_window_end,
      });
    }
  }, [applyPlannerLocation, clientId, clientLocations, deliveryAddr.street, fromOrderId, handlePickupAddrChange, initialClientId, pickupAddr.street, selectedClient]);

  // Prefill vanuit ?from_order_id=: kopieer pickup, delivery, requirements,
  // afdeling, vehicle_type, order_type en klant-identificatie van een
  // bestaande order naar dit formulier. Datum, tijden, gewicht, aantal en
  // referenties blijven leeg, anders zou een tweede identieke order stilzwijgend
  // worden aangemaakt zonder dat de planner nieuwe tijden ingeeft.
  const fromOrderApplied = useRef(false);
  useEffect(() => {
    if (!fromOrderId || fromOrderApplied.current) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("id", fromOrderId)
        .single();
      if (cancelled) return;
      if (error || !data) {
        toast.error("Kon bronorder niet laden", { description: error?.message });
        setPrefillReady(true);
        return;
      }
      fromOrderApplied.current = true;
      const src: any = data;
      if (src.client_id) setClientId(src.client_id);
      if (src.client_name) setClientName(src.client_name);
      if (src.contact_person) setContactpersoon(src.contact_person);
      if (src.priority) setPrioriteit(src.priority);
      if (src.transport_type) setTransportType(src.transport_type);
      if (src.vehicle_type) setVoertuigtype(src.vehicle_type);
      if (src.unit) setTransportEenheid(src.unit);
      if (Array.isArray(src.requirements) && src.requirements.includes("laadklep")) {
        setKlepNodig(true);
      }
      if (src.pickup_address || src.delivery_address) {
        if (src.pickup_address) {
          setPickupAddr(bestEffortAddressValue(src.pickup_address));
        }
        if (src.delivery_address) {
          setDeliveryAddr(bestEffortAddressValue(src.delivery_address));
        }
        setFreightLines((prev) =>
          prev.map((l) => {
            if (l.activiteit === "Laden" && src.pickup_address) {
              return { ...l, locatie: src.pickup_address };
            }
            if (l.activiteit === "Lossen" && src.delivery_address) {
              return { ...l, locatie: src.delivery_address };
            }
            return l;
          }),
        );
      }
      const label = src.order_number
        ? `RCS-${new Date(src.created_at).getFullYear()}-${String(src.order_number).padStart(4, "0")}`
        : "bronorder";
      toast.success(`Gedupliceerd van ${label}`, {
        description: "Vul tijden, gewicht en referenties in voor deze nieuwe order.",
      });
      setPrefillReady(true);
    })();
    return () => { cancelled = true; };
  }, [fromOrderId]);

  // Auto-infer afdeling. De inferred-waarde houden we altijd bij, ook als de
  // planner handmatig overrulet, zodat we een "Overschreven door planner"-hint
  // kunnen tonen met de automatische suggestie erbij.
  useEffect(() => {
    const pickup = freightLines.find((f) => f.activiteit === "Laden")?.locatie || "";
    const delivery = freightLines.find((f) => f.activiteit === "Lossen")?.locatie || "";
    if (!pickup || !delivery) return;
    let cancelled = false;
    inferAfdelingAsync(pickup, delivery, tenant?.id).then((inferred) => {
      if (cancelled) return;
      setInferredAfdeling(inferred ?? null);
    });
    return () => { cancelled = true; };
  }, [freightLines, afdelingManual, tenant?.id]);

  // Live traject-preview zodra beide adressen ingevuld zijn.
  useEffect(() => {
    const pickup = freightLines.find((f) => f.activiteit === "Laden")?.locatie || "";
    const delivery = freightLines.find((f) => f.activiteit === "Lossen")?.locatie || "";
    if (!tenant?.id || !pickup || !delivery) {
      setTrajectPreview(null);
      return;
    }
    // Debounce 400ms: voorkomt dat preview bij elke letter een DB-roundtrip doet
    // + stopt ook de flickerende "geen rule gevonden"-melding tijdens typen.
    let cancelled = false;
    const timer = setTimeout(() => {
      setPreviewLoading(true);
      previewLegs(
        {
          pickup_address: pickup,
          delivery_address: delivery,
          client_name: clientName.trim(),
          afdeling: afdeling || null,
        },
        tenant.id,
      )
        .then((p) => {
          if (!cancelled) setTrajectPreview(p);
        })
        .catch(() => {
          if (!cancelled) setTrajectPreview(null);
        })
        .finally(() => {
          if (!cancelled) setPreviewLoading(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [freightLines, clientName, afdeling, tenant?.id]);

  const mainTabs: { key: MainTab; label: string }[] = [
    { key: "algemeen", label: "Algemeen" },
    { key: "financieel", label: "Financieel" },
    { key: "vrachtdossier", label: "Vrachtdossier" },
  ];

  const bottomTabs: { key: BottomTab; label: string }[] = [
    { key: "vrachmeen", label: "VRACHMEEN" },
    { key: "additionele_diensten", label: "ADDITIONELE DIENSTEN" },
    { key: "overige_referenties", label: "OVERIGE REFERENTIES" },
  ];

  const wizardNextActionLabel =
    wizardStep === "intake" && intakeActiveQuestion === 1
      ? clientNeedsConfirmation
        ? "Bevestig klant"
        : "Volgende stap"
      : wizardStep === "intake"
        ? "Voeg route toe"
        : wizardStep === "route"
          ? routeActiveQuestion === 1
            ? "Bevestig ophaaladres"
            : routeActiveQuestion === 2
              ? "Bevestig stop"
              : routeActiveQuestion === 3
                ? "Plan levermoment"
                : "Plan lading"
            : wizardStep === "cargo"
              ? cargoActiveQuestion === 1
                ? "Bevestig aantal"
              : cargoActiveQuestion === 2
                ? "Bevestig afmetingen"
                : cargoActiveQuestion === 3
                  ? "Bevestig gewicht"
                  : "Bereken tarief"
            : wizardStep === "financial"
              ? "Ga naar controle"
            : "Controleer order";
  const canGoBackInUberflow =
    wizardStep === "intake"
      ? intakeActiveQuestion > 1
      : wizardStep === "route"
        ? true
        : wizardStep === "cargo"
          ? true
          : true;
  const flowLabelClass = "mb-2 block text-sm font-medium text-muted-foreground";
  const flowInputClass = "h-14 rounded-2xl border-[hsl(var(--gold)_/_0.22)] bg-white px-4 text-base shadow-[inset_0_1px_0_hsl(var(--gold)_/_0.10),0_12px_34px_-30px_hsl(var(--gold-deep)_/_0.65)] transition focus-visible:border-[hsl(var(--gold)_/_0.62)] focus-visible:ring-4 focus-visible:ring-[hsl(var(--gold)_/_0.18)]";

  const renderQuestionPrompt = (
    question: { step: string; title: string; hint: string },
    _complete = false,
    _ready = false,
  ) => (
    <div className="mb-7">
      <div className="max-w-2xl text-[1.45rem] font-semibold leading-tight text-foreground md:text-[1.7rem]" style={{ fontFamily: "var(--font-display)" }}>
        {question.title}
      </div>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{question.hint}</p>
    </div>
  );

  const renderLocationOperationalDetails = (line: FreightLine | undefined, title: string) => {
    if (!line) return null;
    return (
      <div className="mt-5 rounded-2xl border border-[hsl(var(--gold)_/_0.16)] bg-white p-4 shadow-[0_18px_44px_-38px_hsl(var(--gold-deep)_/_0.55)]">
        <div className="mb-4 flex flex-col gap-2 border-b border-[hsl(var(--gold)_/_0.12)] pb-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))]" style={{ fontFamily: "var(--font-display)" }}>
              Adresboek
            </div>
            <div className="mt-1 text-sm font-semibold text-foreground">{title}</div>
          </div>
          <div className="max-w-[16rem] text-right text-[11px] leading-5 text-muted-foreground">
            Bij aanmaken wordt dit adres bijgewerkt in het adresboek.
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className={flowLabelClass}>Bedrijfsnaam op deze locatie</label>
            <Input
              value={line.companyName || ""}
              onChange={(e) => updateFreightLine(line.id, "companyName", e.target.value)}
              placeholder={clientName || "Bijv. warehouse, klant of terminal"}
              className={flowInputClass}
            />
          </div>
          <div>
            <label className={flowLabelClass}>Adres zichtbaar voor planner</label>
            <Input
              value={line.locatie}
              onChange={(e) => updateFreightLine(line.id, "locatie", e.target.value)}
              placeholder="Straat, huisnummer, postcode, plaats"
              className={flowInputClass}
            />
          </div>
        </div>
      </div>
    );
  };

  const conversationalCardClass = (level = 0) => cn(
    "relative animate-in fade-in slide-in-from-bottom-3 duration-500 rounded-[2rem] p-6 md:p-9",
    level === 0 && "border border-[hsl(var(--gold)_/_0.18)] bg-[linear-gradient(180deg,#fff_0%,#fff_72%,hsl(var(--gold-soft)_/_0.16)_100%)] shadow-[0_24px_70px_-54px_hsl(var(--foreground)_/_0.7),0_0_0_1px_hsl(var(--gold)_/_0.08)]",
    level > 0 && "ml-5 md:ml-10",
    level > 0 && "before:absolute before:-left-5 before:top-0 before:h-full before:w-px before:bg-[hsl(var(--gold)_/_0.32)] md:before:-left-6",
    level > 0 && "after:absolute after:-left-5 after:top-8 after:h-px after:w-5 after:bg-[hsl(var(--gold)_/_0.32)] md:after:-left-6 md:after:w-6",
  );

  const uberFlowShellClass = "relative overflow-hidden rounded-[2.25rem] border border-[hsl(var(--gold)_/_0.16)] bg-[radial-gradient(circle_at_84%_0%,hsl(var(--gold-soft)_/_0.28),transparent_30%),#fff] p-6 shadow-[0_30px_95px_-70px_hsl(var(--foreground)_/_0.75),0_0_0_1px_hsl(var(--gold)_/_0.08)] md:p-8";

  const renderCollapsedAnswer = (
    label: string,
    value: string,
    onEdit: () => void,
    mutedValue?: string,
  ) => {
    const [primaryValue, secondaryValue] = (value || mutedValue || "Ingevuld").split("\n");
    return (
      <button
        type="button"
        onClick={onEdit}
        className="flex w-full animate-in fade-in slide-in-from-top-1 items-center justify-between gap-3 rounded-2xl bg-white/90 px-4 py-3 text-left shadow-[inset_0_0_0_1px_hsl(var(--gold)_/_0.18),0_14px_36px_-32px_hsl(var(--gold-deep)_/_0.58)] transition hover:bg-[hsl(var(--gold-soft)_/_0.18)] focus:outline-none focus:ring-4 focus:ring-[hsl(var(--gold)_/_0.16)]"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--gold))] text-[#17130b] shadow-[0_6px_18px_-10px_hsl(var(--gold-deep)_/_0.75)]">
            <Check className="h-3 w-3" />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-medium text-muted-foreground">{label}</span>
            <span className="block truncate text-sm font-semibold text-foreground">{primaryValue}</span>
            {secondaryValue && (
              <span className="block truncate text-xs text-muted-foreground">{secondaryValue}</span>
            )}
          </span>
        </span>
        <span className="shrink-0 text-[11px] font-semibold text-[hsl(var(--gold-deep))]">Wijzig</span>
      </button>
    );
  };

  const renderCollapsedFacts = (
    facts: Array<{ label: string; value: string; onEdit: () => void }>,
  ) => (
    <div className="flex w-full animate-in fade-in slide-in-from-top-1 items-center justify-between gap-3 rounded-2xl bg-white/90 px-4 py-3 shadow-[inset_0_0_0_1px_hsl(var(--gold)_/_0.18),0_14px_36px_-32px_hsl(var(--gold-deep)_/_0.58)]">
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
        {facts.map((fact) => (
          <button
            key={fact.label}
            type="button"
            onClick={fact.onEdit}
            className="inline-flex min-w-0 items-center gap-2 rounded-full px-1 py-0.5 text-left transition hover:bg-[hsl(var(--gold-soft)_/_0.28)] focus:outline-none focus:ring-4 focus:ring-[hsl(var(--gold)_/_0.16)]"
          >
            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--gold))] text-[#17130b]">
              <Check className="h-3 w-3" />
            </span>
            <span className="truncate text-sm font-medium text-foreground">{fact.value}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={facts[0]?.onEdit}
        aria-label="Wijzig afgeronde transportgegevens"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[hsl(var(--gold-deep))] transition hover:bg-[hsl(var(--gold-soft)_/_0.36)] hover:text-foreground focus:outline-none focus:ring-4 focus:ring-[hsl(var(--gold)_/_0.16)]"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  const renderUberStepHeader = (label: string, title: string, _hint: string) => (
    <div className="mb-8 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))]">
          {label}
        </div>
        <h2 className="mt-2 text-[1.45rem] font-semibold leading-tight text-foreground" style={{ fontFamily: "var(--font-display)" }}>
          {title}
        </h2>
      </div>
      <div className="shrink-0 rounded-full border border-[hsl(var(--gold)_/_0.22)] bg-[hsl(var(--gold-soft)_/_0.36)] px-3 py-1 text-xs font-semibold text-[hsl(var(--gold-deep))]">
        {wizardProgress}%
      </div>
    </div>
  );

  const renderWizardFooter = () => {
    const showCreate = wizardStep === "review" && reviewActiveQuestion === 2;
    const showContinue = wizardStep !== "review";
    const inlineTransportControls = wizardStep === "cargo" && cargoActiveQuestion >= 4 && !missingQuantity && !missingWeight;
    if (inlineTransportControls) return null;
    if (!canGoBackInUberflow && !showCreate && !showContinue) return null;

    return (
      <div className="mt-6 flex items-center justify-between gap-2 flex-wrap">
        {canGoBackInUberflow && (
          <button
            type="button"
            onClick={goToPreviousWizardStep}
            className="inline-flex items-center justify-center rounded-full border border-border/60 bg-white px-4 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted/50 hover:text-foreground"
          >
            Vorige vraag
          </button>
        )}
        {showCreate ? (
          <button
            type="button"
            onClick={() => handleSave(true)}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--gold-deep))] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_16px_36px_-24px_hsl(var(--gold-deep)_/_0.85)] transition hover:bg-[hsl(var(--gold))] hover:text-[#17130b] disabled:opacity-50"
          >
            Order gereedmelden
            <ArrowRight className="h-4 w-4" />
          </button>
        ) : showContinue ? (
          <button
            type="button"
            onClick={goToNextWizardStep}
            className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--gold-deep))] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_16px_36px_-24px_hsl(var(--gold-deep)_/_0.85)] transition hover:bg-[hsl(var(--gold))] hover:text-[#17130b]"
          >
            {wizardNextActionLabel}
            <ArrowRight className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    );
  };

  const renderProductionFinancialTab = () => (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-[hsl(var(--gold)_/_0.14)] bg-white/80 p-6 shadow-sm">
          <div className="text-[11px] font-semibold tracking-[0.18em] text-[hsl(var(--gold-deep))]">TARIEF</div>
          <div className="mt-2 text-lg font-semibold">Tariefmodule laden...</div>
          <div className="mt-1 text-sm text-muted-foreground">De intake blijft alvast bruikbaar terwijl pricing wordt opgehaald.</div>
        </div>
      }
    >
      <FinancialTab
        tenantId={tenant?.id}
        clientId={clientId}
        cargo={financialCargo}
        pickupDate={financialPickupDate}
        pickupTime={financialPickupTime}
        transportType={transportType}
        initialPricing={pricingPayload}
        onPricingChange={setPricingPayload}
      />
    </Suspense>
  );

  const focusWizardTarget = useCallback((target: "client" | "pickup" | "delivery" | "quantity" | "dimensions" | "weight" | "time" | "security" | "pricing") => {
    setMainTab("algemeen");

    if (target === "client") {
      setWizardStep("intake");
      setIntakeManualBack(true);
      setIntakeActiveQuestion(1);
    }
    if (target === "pickup") {
      setWizardStep("route");
      setRouteManualBack(true);
      setRouteActiveQuestion(1);
    }
    if (target === "delivery") {
      setWizardStep("route");
      setRouteManualBack(true);
      setRouteActiveQuestion(2);
    }
    if (target === "time") {
      setWizardStep("route");
      setRouteManualBack(true);
      setRouteActiveQuestion(
        missingPickupTimeWindow
          ? 3
          : missingDeliveryTimeWindow
            ? 4
            : routeQuestionForIssue(routeRuleIssues[0]),
      );
    }
    if (target === "quantity") {
      setWizardStep("cargo");
      setCargoManualBack(true);
      setCargoActiveQuestion(1);
    }
    if (target === "weight") {
      setWizardStep("cargo");
      setCargoManualBack(true);
      setCargoActiveQuestion(3);
    }
    if (target === "dimensions") {
      setWizardStep("cargo");
      setCargoManualBack(true);
      setCargoActiveQuestion(2);
    }
    if (target === "security") {
      setWizardStep("cargo");
      setCargoManualBack(true);
      setCargoActiveQuestion(4);
    }
    if (target === "pricing") {
      setWizardStep("financial");
    }

    window.setTimeout(() => {
      const selectorByTarget: Record<typeof target, string> = {
        client: "input[placeholder='Typ klantnaam of kies uit lijst…']",
        pickup: "input[placeholder='Typ bedrijfsnaam, straat of dockadres']",
        delivery: "input[placeholder^='Typ warehouse']",
        quantity: "input[placeholder='Bijv. 6']",
        dimensions: "input[placeholder='Lengte cm'], input[type='number']",
        weight: "input[placeholder='Bijv. 850']",
        time: "input[type='date'], input[type='time']",
        security: "button[role='switch']",
        pricing: "input[placeholder='0']",
      };
      const element = document.querySelector<HTMLElement>(selectorByTarget[target]);
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
      element?.focus();
    }, 120);
  }, [missingDeliveryTimeWindow, missingPickupTimeWindow, routeRuleIssues]);

  const goToWizardModule = useCallback((step: WizardStep) => {
    setMainTab("algemeen");
    setWizardStep(step);
    if (step === "intake") {
      setIntakeManualBack(true);
      setIntakeActiveQuestion(1);
      return;
    }
    if (step === "route") {
      setRouteManualBack(true);
      setRouteActiveQuestion((routeSuggestedQuestion || 1) as 1 | 2 | 3 | 4);
      return;
    }
    if (step === "cargo") {
      setCargoManualBack(true);
      setCargoActiveQuestion((cargoSuggestedQuestion || 1) as 1 | 2 | 3 | 4);
      return;
    }
    setReviewActiveQuestion(1);
  }, [cargoSuggestedQuestion, routeSuggestedQuestion]);

  const renderFlowModules = (variant: "side" | "top" = "side") => {
    const isSide = variant === "side";

    return (
      <div className={cn(
        "relative overflow-hidden bg-[linear-gradient(145deg,#11100e_0%,#15110a_54%,#0f0e0c_100%)] p-4 text-white",
        isSide
          ? "rounded-none border-y border-white/8 shadow-none"
          : "rounded-2xl shadow-[0_24px_65px_-48px_hsl(var(--foreground)_/_0.82)] lg:hidden",
      )}>
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[hsl(var(--gold)_/_0.72)] to-transparent" />
        <span className="pointer-events-none absolute -right-12 -top-16 h-36 w-36 rounded-full bg-[hsl(var(--gold)_/_0.12)] blur-3xl" />
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold)_/_0.88)]">Ritflow</div>
            <div className="mt-0.5 text-sm font-medium text-white">{readinessTitle}</div>
          </div>
          <span className="rounded-full border border-[hsl(var(--gold)_/_0.24)] bg-[hsl(var(--gold)_/_0.12)] px-2.5 py-1 text-[11px] font-semibold text-[hsl(var(--gold)_/_0.92)]">
            {wizardProgress}%
          </span>
        </div>

        <div className={cn(isSide ? "relative space-y-1.5" : "grid grid-cols-4 gap-2")}>
          {isSide && <span className="absolute bottom-7 left-[0.9rem] top-7 w-px bg-gradient-to-b from-[hsl(var(--gold)_/_0.55)] via-[hsl(var(--gold)_/_0.22)] to-white/5" />}
          {WIZARD_STEPS.map((step, index) => {
            const active = step.key === wizardStep;
            const stepStatus = wizardStepStatus(step.key);
            const done = stepStatus.includes("Compleet") || stepStatus.includes("Klaar") || stepStatus.includes("Tarief klaar");

            return (
              <button
                key={step.key}
                type="button"
                onClick={() => goToWizardModule(step.key)}
                className={cn(
                  "group relative w-full text-left transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold)_/_0.35)]",
                  isSide
                    ? "flex items-center gap-3 rounded-xl border border-transparent px-2.5 py-2.5 hover:bg-[hsl(var(--gold)_/_0.08)]"
                    : "rounded-2xl border border-transparent bg-white/5 px-2 py-2 text-center hover:bg-[hsl(var(--gold)_/_0.08)]",
                  active && (isSide
                    ? "border-[hsl(var(--gold)_/_0.20)] bg-[hsl(var(--gold)_/_0.12)] text-white shadow-[inset_2px_0_0_hsl(var(--gold)_/_0.86),0_16px_36px_-30px_hsl(var(--gold)_/_0.8)]"
                    : "border-[hsl(var(--gold)_/_0.18)] bg-[hsl(var(--gold)_/_0.12)] text-white shadow-[inset_0_-2px_0_hsl(var(--gold)_/_0.86)]"),
                )}
              >
                <span className={cn(
                  "relative z-10 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-all duration-300",
                  done
                    ? "bg-[hsl(var(--gold))] text-[#17130b] shadow-[0_8px_22px_-12px_hsl(var(--gold)_/_0.9)]"
                    : active
                      ? "bg-[hsl(var(--gold-soft))] text-[hsl(var(--gold-deep))] ring-1 ring-[hsl(var(--gold)_/_0.45)]"
                      : "bg-white/8 text-white/55 ring-1 ring-white/10",
                  !isSide && "mx-auto mb-1",
                )}>
                  <span className="relative z-10">{done ? <Check className="h-3.5 w-3.5" /> : index + 1}</span>
                </span>
                <span className={cn("min-w-0", isSide ? "flex-1" : "block")}>
                  <span className={cn(
                    "block font-semibold",
                    isSide ? "text-sm" : "text-[11px]",
                    !active && "text-white/86",
                  )}>{step.label}</span>
                  {isSide && (
                    !done || active ? (
                      <span className={cn(
                        "mt-0.5 block truncate text-xs",
                        active ? "text-[hsl(var(--gold)_/_0.78)]" : "text-white/42",
                      )}>
                        {stepStatus}
                      </span>
                    ) : null
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderMobileOrderPreview = () => (
    <div className="sticky top-0 z-20 -mx-4 mb-4 border-b border-border/60 bg-white/95 px-4 py-3 shadow-sm backdrop-blur xl:hidden">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            const firstMissing = wizardMissing[0];
            const targetByItem: Record<string, WizardFocusTarget> = {
              klant: "client",
              ophaaladres: "pickup",
              afleveradres: "delivery",
              adrescontrole: "delivery",
              aantal: "quantity",
              gewicht: "weight",
              eenheid: "quantity",
              pickupdatum: "time",
              ladingregel: "quantity",
              tijdvenster: "time",
              tijdvolgorde: "time",
              voertuig: "transport",
              screening: "security",
              tarief: "pricing",
            };
            if (firstMissing) focusWizardTarget(targetByItem[firstMissing] ?? "client");
          }}
          className="min-w-0 flex-1 text-left"
        >
          <div className="truncate text-sm font-semibold text-foreground">{clientName || "Nieuwe opdracht"}</div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">{currentFlowCue}</div>
        </button>
        <div className={cn(
          "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold",
          readinessTone === "red"
            ? "bg-red-50 text-red-700"
            : readinessTone === "amber"
              ? "bg-amber-50 text-amber-800"
              : "bg-emerald-50 text-emerald-700",
        )}>
          {readinessBlockers.length ? `${readinessBlockers.length} nodig` : "Ready"}
        </div>
      </div>
      {readinessItems.length > 0 && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {readinessItems.slice(0, 4).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => focusWizardTarget(item.target)}
              className={cn(
                "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium",
                item.severity === "BLOCKER"
                  ? "border-red-200 bg-red-50 text-red-700"
                  : item.severity === "WARNING"
                    ? "border-amber-200 bg-amber-50 text-amber-800"
                    : "border-slate-200 bg-slate-50 text-slate-600",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const hasLocalServerDrift = Boolean(serverBaselineSignature && formSignature !== serverBaselineSignature);
  const draftSaveCopy = (() => {
    if (draftSaveStatus === "creating") return "Concept starten...";
    if (draftSaveStatus === "saving") return "Opslaan...";
    if (draftSaveStatus === "conflict") return draftSaveError || "Deze order is zojuist aangepast door een andere gebruiker.";
    if (draftSaveStatus === "error") return draftSaveError || "Opslaan mislukt - probeer opnieuw.";
    if (hasLocalServerDrift) return "Lokale wijzigingen nog niet opgeslagen";
    if (lastDraftSavedAt) return `Opgeslagen om ${new Date(lastDraftSavedAt).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}`;
    if (serverDraftUpdatedAt) return "Serverconcept actief";
    return "Ctrl/Cmd+S concept";
  })();
  const draftSaveClassName = cn(
    "text-[11px] font-medium",
    draftSaveStatus === "error" || draftSaveStatus === "conflict"
      ? "text-red-600"
      : draftSaveStatus === "saving" || draftSaveStatus === "creating" || hasLocalServerDrift
        ? "text-[hsl(var(--gold-deep))]"
        : "text-muted-foreground",
  );

  const renderOrderPreview = () => (
    <aside className="hidden lg:block">
      <div className="sticky top-4 overflow-hidden rounded-2xl border border-[hsl(var(--gold)_/_0.14)] bg-white shadow-[0_22px_60px_-42px_hsl(var(--foreground)_/_0.65),0_0_0_1px_hsl(var(--gold)_/_0.08)]">
        <div className="relative overflow-hidden bg-[linear-gradient(145deg,#11100e_0%,#15110a_58%,#0f0e0c_100%)] px-5 py-4 text-white">
          <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[hsl(var(--gold)_/_0.74)] to-transparent" />
          <span className="pointer-events-none absolute -right-10 -top-14 h-32 w-32 rounded-full bg-[hsl(var(--gold)_/_0.13)] blur-3xl" />
          <div className="relative text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold)_/_0.86)]">Order preview</div>
          <div className={cn("mt-2 text-lg font-semibold", missingClient ? "text-red-200" : "text-white")}>{clientName || "Nieuwe opdracht"}</div>
          <div className="mt-1 text-xs text-white/60">{klantReferentie || "Referentie volgt"}</div>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-[hsl(var(--gold)_/_0.22)] bg-[hsl(var(--gold)_/_0.10)] px-3 py-1 text-[11px] font-medium text-[hsl(var(--gold)_/_0.90)]">
            <span className={cn(
              "h-1.5 w-1.5 rounded-full",
              readinessTone === "red" ? "bg-red-300" : readinessTone === "amber" ? "bg-amber-300" : "bg-[hsl(var(--gold))]",
            )} />
            {readinessStatus}
          </div>
        </div>

        {renderFlowModules("side")}

        <div className="space-y-4 p-5">
          <div>
            <div className="mb-3 text-xs font-medium text-muted-foreground">Route</div>
            <div className="mb-4 overflow-hidden rounded-2xl border border-[hsl(var(--gold)_/_0.16)] bg-[linear-gradient(135deg,#f8f6f1_0%,#ece7dc_52%,#f9f7f2_100%)] p-3 shadow-inner">
              <div className="relative overflow-hidden rounded-xl">
                {routeMapPlottedCount > 0 ? (
                  <Suspense
                    fallback={
                      <div className="relative h-32 rounded-xl bg-[linear-gradient(90deg,hsl(var(--gold)_/_0.08)_1px,transparent_1px),linear-gradient(0deg,hsl(var(--gold)_/_0.08)_1px,transparent_1px)] bg-[length:22px_22px]">
                        <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-muted-foreground">
                          Kaart laden...
                        </div>
                      </div>
                    }
                  >
                    <RoutePreviewMap stops={routeMapStops} />
                  </Suspense>
                ) : (
                  <div className="relative h-32 rounded-xl bg-[linear-gradient(90deg,hsl(var(--gold)_/_0.08)_1px,transparent_1px),linear-gradient(0deg,hsl(var(--gold)_/_0.08)_1px,transparent_1px)] bg-[length:22px_22px]">
                    <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-muted-foreground">
                      Kaart verschijnt zodra GPS-punten bekend zijn
                    </div>
                  </div>
                )}
                <div className="absolute bottom-2 left-3 rounded-full bg-white/85 px-2.5 py-1 text-[10px] font-semibold text-[hsl(var(--gold-deep))] shadow-sm">
                  {routeMapStatusLabel}
                </div>
              </div>
              {routeMapMissingGpsCount > 0 && (
                <div className="mt-2 rounded-xl border border-[hsl(var(--gold)_/_0.18)] bg-white/70 px-3 py-2 text-[11px] font-medium text-[hsl(var(--gold-deep))]">
                  {routeMapMissingGpsCount} stop{routeMapMissingGpsCount > 1 ? "s" : ""} zonder GPS-punt. Kies een Google-suggestie om die op de kaart te plotten.
                </div>
              )}
              {routeLegInsights.length > 0 && (
                <div className="mt-2 overflow-hidden rounded-xl border border-[hsl(var(--gold)_/_0.12)] bg-white/55">
                  {routeLegInsights.map((leg) => (
                    <div
                      key={leg.id}
                      className="border-b border-[hsl(var(--gold)_/_0.10)] px-3 py-2 last:border-b-0"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[11px] font-semibold text-foreground">
                          {leg.fromLabel} {"->"} {leg.toLabel}
                        </span>
                        <span className={cn("shrink-0 text-[11px] font-semibold", leg.hasGps ? "text-[hsl(var(--gold-deep))]" : "text-red-600")}>
                          {leg.distanceLabel}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span>{leg.durationLabel}</span>
                        <span>{leg.etaLabel}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="relative space-y-3 pl-6">
              <span className="absolute bottom-5 left-[0.45rem] top-5 w-px bg-border/70" />
              {routePreviewStops.map((stop) => (
                <button
                  key={stop.id}
                  type="button"
                  onClick={stop.onClick}
                  className="relative block w-full rounded-lg px-2 py-1 text-left transition hover:bg-muted/60 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold)_/_0.45)]"
                >
                  <span className={cn("absolute -left-6 top-1 h-3 w-3 rounded-full ring-4", stop.missingAddress || stop.issue ? "bg-red-500 ring-red-100" : "bg-[hsl(var(--gold))] ring-[hsl(var(--gold-soft))]")} />
                  <div className="text-xs font-medium text-muted-foreground">{stop.label}</div>
                  <div className={cn("mt-0.5 text-sm font-medium", previewTextClass(stop.missingAddress))}>{stop.line?.locatie || stop.fallback}</div>
                  {stop.issue && (
                    <div className="mt-1 text-xs font-medium text-red-600">{stop.issue.message}</div>
                  )}
                  <div className={cn("mt-1 text-xs", stop.missingDate ? "text-muted-foreground" : "text-foreground")}>{[stop.line?.datum, stop.line?.tijd, stop.line?.tijdTot].filter(Boolean).join(" · ") || "Tijdvenster volgt"}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-[hsl(var(--gold)_/_0.14)] bg-[hsl(var(--gold-soft)_/_0.20)] p-3">
              <div className="text-[11px] font-medium text-muted-foreground">Lading</div>
              <div className={cn("mt-1 text-sm font-semibold", previewTextClass(missingQuantity))}>{cargoTotals.totAantal || 0} {cargoTotals.primaryUnit || "eenheden"}</div>
              <div className={cn("text-xs", previewTextClass(missingWeight))}>{cargoTotals.totGewicht || 0} kg</div>
            </div>
            <div className="rounded-xl border border-[hsl(var(--gold)_/_0.14)] bg-[hsl(var(--gold-soft)_/_0.20)] p-3">
              <div className="text-[11px] font-medium text-muted-foreground">Voertuig</div>
              <div className="mt-1 text-sm font-semibold">{voertuigtype || suggestedVehicleType || "Volgt"}</div>
              <div className="text-xs text-muted-foreground">{vehicleMatchScore ? `${vehicleMatchScore}% match` : "Nog geen match"}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => focusWizardTarget("security")}
              className="rounded-xl border border-[hsl(var(--gold)_/_0.14)] bg-white p-3 text-left transition hover:bg-[hsl(var(--gold-soft)_/_0.22)] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold)_/_0.35)]"
            >
              <div className="text-[11px] font-medium text-muted-foreground">Security</div>
              <div className={cn("mt-1 text-sm font-semibold", showPmt && !shipmentSecure && !pmtMethode ? "text-red-600" : "text-foreground")}>
                {pmtLabel}
              </div>
              <div className="text-xs text-muted-foreground">{showPmt ? "Luchtvracht" : "Niet van toepassing"}</div>
            </button>
            <button
              type="button"
              onClick={() => focusWizardTarget("pricing")}
              className="rounded-xl border border-[hsl(var(--gold)_/_0.14)] bg-white p-3 text-left transition hover:bg-[hsl(var(--gold-soft)_/_0.22)] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold)_/_0.35)]"
            >
              <div className="text-[11px] font-medium text-muted-foreground">Tarief</div>
              <div className={cn("mt-1 text-sm font-semibold", pricingPayload.cents == null ? "text-red-600" : "text-foreground")}>
                {pricingLabel}
              </div>
              <div className="text-xs text-muted-foreground">{pricingPayload.details ? "Tarief gekoppeld" : "Klik om te prijzen"}</div>
            </button>
          </div>

          <div className={cn(
            "rounded-xl border p-4",
            readinessTone === "red"
              ? "border-red-200 bg-red-50/70"
              : readinessTone === "amber"
                ? "border-amber-200 bg-amber-50/70"
                : "border-emerald-200 bg-emerald-50/70",
          )}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Order readiness</div>
                <div className="mt-1 text-sm font-semibold">{readinessTitle}</div>
              </div>
              <span className={cn(
                "shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold",
                readinessTone === "red"
                  ? "bg-red-100 text-red-700"
                  : readinessTone === "amber"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-emerald-100 text-emerald-700",
              )}>
                {readinessStatus}
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {readinessItems.length > 0 ? readinessItems.slice(0, 7).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => focusWizardTarget(item.target)}
                  className="flex w-full items-start gap-2 rounded-lg bg-white/70 px-3 py-2 text-left transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold)_/_0.35)]"
                >
                  <span className={cn(
                    "mt-1 h-2 w-2 shrink-0 rounded-full",
                    item.severity === "BLOCKER" ? "bg-red-500" : item.severity === "WARNING" ? "bg-amber-500" : "bg-slate-400",
                  )} />
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-foreground">{item.label}</span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">{item.detail}</span>
                  </span>
                </button>
              )) : (
                <span className="text-xs text-muted-foreground">Alles klaar voor planning.</span>
              )}
            </div>
            {(readinessBlockers.length > 0 || readinessWarnings.length > 0 || readinessInfos.length > 0) && (
              <div className="mt-3 flex gap-2 text-[10px] font-semibold text-muted-foreground">
                <span>{readinessBlockers.length} blocker</span>
                <span>{readinessWarnings.length} warning</span>
                <span>{readinessInfos.length} info</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="-m-6 min-h-[calc(100vh-3rem)] flex flex-col bg-[#f6f4f0]">
      {/* ── Header ── */}
      <div className="relative shrink-0">
        <span
          className="absolute top-0 left-0 right-0 h-px pointer-events-none"
          style={{ background: "linear-gradient(90deg, transparent, hsl(var(--foreground) / 0.12), transparent)" }}
        />
        <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-4 px-6 py-7">
          <div>
            <div className="mb-1.5 text-xs font-semibold text-[hsl(var(--gold-deep))]">
              Orders / Nieuwe order
            </div>
            <h1 className="text-[2rem] font-semibold tracking-tight text-foreground leading-tight" style={{ fontFamily: "var(--font-display)" }}>
              Bouw de rit
            </h1>
            <div className="hidden">
              <IntakeSourceBadge source="MANUAL" className="text-xs px-2 py-0.5" />
              <span className="text-xs text-muted-foreground">Zelfde intake-taal als inbox en portal</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={cn("hidden max-w-[220px] truncate text-right md:block", draftSaveClassName)} title={draftSaveError || draftSaveCopy}>
              {draftSaveCopy}
            </div>
            <button
              type="button"
              onClick={attemptCancel}
              className="inline-flex h-10 items-center justify-center rounded-full border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-[0_8px_22px_-18px_hsl(var(--foreground)_/_0.45)] transition hover:border-slate-500 hover:bg-slate-950 hover:text-white active:translate-y-px active:bg-black focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-300/60"
            >
              Annuleren
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="hidden"
            >
              Afdrukken
            </button>
            <button
              type="button"
              onClick={() => handleSave(false)}
              disabled={saving}
              className="inline-flex h-10 items-center justify-center rounded-full border border-[hsl(var(--gold)_/_0.42)] bg-[hsl(var(--gold-soft)_/_0.20)] px-4 text-sm font-semibold text-[hsl(var(--gold-deep))] shadow-[0_12px_30px_-22px_hsl(var(--gold-deep)_/_0.85)] transition hover:border-[hsl(var(--gold)_/_0.72)] hover:bg-[hsl(var(--gold-deep))] hover:text-white active:translate-y-px active:bg-[hsl(var(--gold))] active:text-[#17130b] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[hsl(var(--gold)_/_0.24)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Bewaar concept
            </button>
            <button
              type="button"
              onClick={() => handleSave(true)}
              disabled={saving}
              className="hidden"
              style={{
                background: "linear-gradient(180deg, hsl(0 78% 48%) 0%, hsl(0 78% 38%) 100%)",
                boxShadow: "0 1px 2px hsl(var(--primary) / 0.4), 0 4px 12px -2px hsl(var(--primary) / 0.3), inset 0 1px 0 hsl(0 0% 100% / 0.2), inset 0 -1px 0 hsl(0 0% 0% / 0.1)",
              }}
            >
              Order gereedmelden
            </button>
          </div>
        </div>

        {/* ── Main tabs ── */}
        <div className="hidden px-6 shrink-0 overflow-x-auto whitespace-nowrap border-t border-border/40">
          {mainTabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setMainTab(tab.key)}
              className={cn(
                "relative px-4 py-3 text-xs font-medium tracking-wide transition-colors border-b-2 -mb-px shrink-0",
                mainTab === tab.key
                  ? "text-foreground border-foreground"
                  : "text-muted-foreground border-transparent hover:text-foreground"
              )}
              style={mainTab === tab.key ? { fontFamily: "var(--font-display)" } : undefined}
            >
              {tab.label}
              {mainTab === tab.key && (
                <span className="absolute left-1/2 -translate-x-1/2 -bottom-[5px] w-[3px] h-[3px] rounded-full bg-[hsl(var(--gold))]" />
              )}
            </button>
          ))}
        </div>

        {false && mainTab === "algemeen" && (
          <div className="border-t border-border/40 bg-muted/20 px-6 py-3">
            <div className="mx-auto max-w-[1320px]">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-white px-3 py-2 shadow-sm">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">
                    {WIZARD_STEPS[wizardStepIndex]?.label}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      Stap {wizardStepIndex + 1} van {WIZARD_STEPS.length}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{WIZARD_STEPS[wizardStepIndex]?.hint}</div>
                </div>
                <div className="hidden min-w-[160px] overflow-hidden rounded-full bg-muted shadow-inner sm:block">
                  <div
                    className="h-1.5 rounded-full bg-[hsl(var(--gold))] transition-all"
                    style={{ width: `${wizardProgress}%` }}
                  />
                </div>
              </div>
              <div className="mt-2 grid grid-cols-4 overflow-hidden rounded-lg border border-border/60 bg-white shadow-sm">
                {WIZARD_STEPS.map((step, index) => {
                  const active = step.key === wizardStep;
                  const stepStatus = wizardStepStatus(step.key);
                  const done = stepStatus.includes("Compleet") || stepStatus.includes("Klaar") || stepStatus.includes("Tarief klaar");
                  return (
                    <button
                      key={step.key}
                      type="button"
                      onClick={() => setWizardStep(step.key)}
                      className={cn(
                        "min-h-[54px] border-r border-border/50 px-2 py-2 text-left transition-all last:border-r-0 sm:px-3",
                        active
                          ? "bg-[hsl(var(--gold-soft)_/_0.45)]"
                          : "bg-white hover:bg-muted/30",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                          done || active ? "bg-[hsl(var(--gold-soft))] text-[hsl(var(--gold-deep))]" : "bg-muted text-muted-foreground",
                        )}>
                          {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-semibold sm:text-sm">{step.label}</span>
                          <span className={cn(
                            "hidden text-[11px] sm:block",
                            stepStatus.includes("Compleet") || stepStatus.includes("Klaar") || stepStatus.includes("Tarief klaar")
                              ? "text-foreground"
                              : "text-amber-700",
                          )}>
                            {stepStatus}
                          </span>
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto">
        {mainTab === "algemeen" && (
          <div className="mx-auto grid max-w-[1120px] gap-6 px-6 pb-10 pt-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0 space-y-6">
            {renderFlowModules("top")}
            {false && renderMobileOrderPreview()}
            {false && (
            <section className="grid gap-5 xl:grid-cols-[1.65fr_0.95fr]" aria-hidden="true">
              <div className="card--luxe p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
                  <div>
                    <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))] mb-1" style={{ fontFamily: "var(--font-display)" }}>
                      <Sparkles className="h-3.5 w-3.5" />
                      Slimme intake
                    </div>
                    <h3 className="section-title">Plak intake, krijg een ordervoorstel</h3>
                    <p className="text-xs text-muted-foreground mt-1">Geen extra wizard-schermen. Gewoon bovenaan plakken, voorstel laten invullen en daarna direct verder in het formulier.</p>
                  </div>
                  <div className={draftSaveClassName} title={serverDraftUpdatedBy ? `Laatste serverwijziging: ${describeDraftEditor(serverDraftUpdatedBy)}` : undefined}>
                    {draftSaveCopy}
                  </div>
                </div>

                <div className="rounded-2xl border border-border/60 bg-white p-4">
                  <Textarea
                    value={smartInput}
                    onChange={(e) => setSmartInput(e.target.value)}
                    rows={3}
                    placeholder="Plak klantnaam, adres, ordermail of referentie..."
                    className="resize-none border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
                  />
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={applySmartDraft}
                      className="inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--gold-deep))] px-4 py-2 text-sm font-medium text-white transition hover:opacity-95"
                    >
                      <ClipboardPaste className="h-4 w-4" />
                      Voorstel invullen
                    </button>
                    <span className="text-xs text-muted-foreground">
                      Herkent klant, route, pallets/colli, gewicht, referentie en globale tijdslogica.
                    </span>
                  </div>
                </div>

                {smartInput.trim() && (
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-xl border border-border/60 bg-muted/10 px-4 py-3">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Klant</div>
                      <div className="mt-1 text-sm font-medium">{smartDraft.matchedClientName || smartDraft.clientHint || "Nog niet herkend"}</div>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-muted/10 px-4 py-3">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Ophalen</div>
                      <div className="mt-1 text-sm font-medium">{smartDraft.pickupHint || "Ontbreekt"}</div>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-muted/10 px-4 py-3">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Afleveren</div>
                      <div className="mt-1 text-sm font-medium">{smartDraft.deliveryHint || "Ontbreekt"}</div>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-muted/10 px-4 py-3">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Lading</div>
                      <div className="mt-1 text-sm font-medium">
                        {smartDraft.quantity || smartDraft.weightKg
                          ? `${smartDraft.quantity || "?"} ${smartDraft.unit.toLowerCase()} · ${smartDraft.weightKg || "?"} kg`
                          : "Nog leeg"}
                      </div>
                    </div>
                  </div>
                )}

                {smartDraft.missing.length > 0 && smartInput.trim() && (
                  <div className="mt-4 rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3">
                    <div className="inline-flex items-center gap-2 text-xs font-semibold text-amber-800">
                      <CircleAlert className="h-3.5 w-3.5" />
                      Nog aan te vullen
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {smartDraft.missing.map((item) => (
                        <span key={item} className="rounded-full border border-amber-300/60 bg-white px-3 py-1 text-xs text-amber-900">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <aside className="card--luxe p-5 xl:sticky xl:top-5 h-fit">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))] mb-1" style={{ fontFamily: "var(--font-display)" }}>
                  Planner snapshot
                </div>
                <h3 className="section-title">Voorstel & controle</h3>
                <div className="mt-4 space-y-3">
                  {plannerSummary.map((item) => (
                    <div key={item.label} className="flex items-start justify-between gap-3 border-b border-border/40 pb-2 last:border-b-0 last:pb-0">
                      <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{item.label}</span>
                      <span className="text-sm text-right">{item.value}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-2xl border border-border/60 bg-white p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Truck className="h-4 w-4 text-[hsl(var(--gold-deep))]" />
                    Voertuigmatch
                  </div>
                  <div className="mt-3 text-2xl font-semibold">{voertuigtype || suggestedVehicleType || "Nog geen voorstel"}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {vehicleMatchScore > 0 ? `${vehicleMatchScore}% match op basis van gewicht, lengte, laadklep en prioriteit.` : "Vul route of lading in voor een voertuigsuggestie."}
                  </div>
                </div>
                {plannerWarnings.length > 0 && (
                  <div className="mt-4 rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-3">
                    <div className="text-xs font-semibold text-amber-800">Planner-waarschuwingen</div>
                    <div className="mt-2 space-y-1">
                      {plannerWarnings.map((warning) => (
                        <p key={warning} className="text-xs text-amber-900">{warning}</p>
                      ))}
                    </div>
                  </div>
                )}
                <div className="mt-4 rounded-xl border border-border/60 bg-muted/20 px-3 py-3">
                  <div className="text-xs font-semibold">Nog aan te vullen</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {wizardMissing.length > 0 ? wizardMissing.map((item) => (
                      <span key={item} className="rounded-full border border-border/60 bg-white px-3 py-1 text-[11px]">
                        {item}
                      </span>
                    )) : (
                      <span className="text-xs text-emerald-700">Compleet voor aanmaken</span>
                    )}
                  </div>
                </div>
              </aside>
            </section>
            )}
            <section className="hidden">
              <div className="card--luxe p-5">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))] mb-1" style={{ fontFamily: "var(--font-display)" }}>
                      Planner quick start
                    </div>
                    <h3 className="section-title">Snelle orderstart</h3>
                    <p className="text-xs text-muted-foreground mt-1">Kies een template, hervat een concept en laat het systeem route en middelen voorstellen.</p>
                  </div>
                  <div className={draftSaveClassName} title={serverDraftUpdatedBy ? `Laatste serverwijziging: ${describeDraftEditor(serverDraftUpdatedBy)}` : undefined}>
                    {draftSaveCopy}
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {QUICK_TEMPLATES.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => {
                        if (template.transportType) {
                          setTransportType(template.transportType);
                          setTransportTypeManual(false);
                        }
                        if (template.prioriteit) setPrioriteit(template.prioriteit);
                        if (template.afdeling) {
                          setAfdeling(template.afdeling);
                          setAfdelingManual(true);
                        }
                        if (template.voertuigtype) {
                          setVoertuigtype(template.voertuigtype);
                          setVoertuigtypeManual(false);
                        }
                        if (typeof template.klepNodig === "boolean") setKlepNodig(template.klepNodig);
                        if (typeof template.shipmentSecure === "boolean") setShipmentSecure(template.shipmentSecure);
                        toast.success(`${template.label} toegepast`);
                      }}
                      className="rounded-2xl border border-border/60 bg-white p-4 text-left transition-all hover:-translate-y-px hover:border-[hsl(var(--gold)_/_0.45)]"
                    >
                      <div className="text-sm font-semibold">{template.label}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{template.description}</div>
                    </button>
                  ))}
                </div>
              </div>
              <aside className="card--luxe p-5 xl:sticky xl:top-5 h-fit">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))] mb-1" style={{ fontFamily: "var(--font-display)" }}>
                  Planner snapshot
                </div>
                <h3 className="section-title">Direct overzicht</h3>
                <div className="mt-4 space-y-3">
                  {plannerSummary.map((item) => (
                    <div key={item.label} className="flex items-start justify-between gap-3 border-b border-border/40 pb-2 last:border-b-0 last:pb-0">
                      <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{item.label}</span>
                      <span className="text-sm text-right">{item.value}</span>
                    </div>
                  ))}
                </div>
                {plannerWarnings.length > 0 && (
                  <div className="mt-4 rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-3">
                    <div className="text-xs font-semibold text-amber-800">Planner-waarschuwingen</div>
                    <div className="mt-2 space-y-1">
                      {plannerWarnings.map((warning) => (
                        <p key={warning} className="text-xs text-amber-900">{warning}</p>
                      ))}
                    </div>
                  </div>
                )}
              </aside>
            </section>
            {/* ══ Chapter I · Klant & order ══ */}
            {wizardStep === "intake" && (
            <>
            <section className={uberFlowShellClass}>
              {renderUberStepHeader("01 · Opdracht", "Start met de opdrachtgever", "Een keuze tegelijk. Zodra dit klopt, schuift de volgende vraag erin.")}
              {false && <span className="card-chapter">I</span>}
              {false && <div className="mb-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))] mb-1" style={{ fontFamily: "var(--font-display)" }}>
                  01 · Klant &amp; order
                </div>
                <h3 className="section-title">Klantgegevens &amp; referentie</h3>
                <p className="text-xs text-muted-foreground mt-1">Wie is de klant en waar verwijs je naar.</p>
              </div>}
              <div className="space-y-4">
                {(
                <div className={conversationalCardClass(0)}>
                  {renderQuestionPrompt(
                    { step: "Klant", title: "Voor welke klant is deze order?", hint: "Typ minimaal 2 tekens. Druk Enter of kies een klant uit de lijst." },
                    !missingClient,
                    clientNeedsConfirmation,
                  )}
                  <label className={cn(
                    flowLabelClass,
                    clientNeedsConfirmation ? "text-[hsl(var(--gold-deep))]" : requiredTextClass(missingClient),
                  )}>Klant <span className={clientNeedsConfirmation ? "text-[hsl(var(--gold-deep))]" : "text-red-600"}>*</span></label>
                <Popover
                  open={clientListOpen}
                  onOpenChange={(open) => {
                    if (open && Date.now() < clientListToggleUntilRef.current) return;
                    setClientOpen(open);
                  }}
                >
                    <PopoverAnchor asChild>
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={clientName}
                          onChange={e => {
                            setClientName(e.target.value);
                            setClientQuestionConfirmed(false);
                            if (clientId) setClientId(null);
                            setContactpersoon("");
                            setClientOpen(true);
                            clearError("client_name");
                          }}
                          onKeyDown={e => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              if (clientInputReady) {
                                setClientQuestionConfirmed(true);
                                setIntakeManualBack(false);
                                setWizardStep("route");
                                setRouteActiveQuestion(routeSuggestedQuestion as 1 | 2 | 3 | 4);
                                setClientOpen(false);
                                clearError("client_name");
                              } else {
                                setErrors(prev => ({ ...prev, client_name: "Typ minimaal 2 tekens of kies een klant uit de lijst." }));
                              }
                            }
                          }}
                          onFocus={() => {
                            if (Date.now() < clientListToggleUntilRef.current) return;
                            if (clientSuggestions.length > 0) setClientOpen(true);
                          }}
                          placeholder="Typ klantnaam of kies uit lijst…"
                          className={cn(
                            flowInputClass,
                            "pl-11 pr-11",
                            missingClient && !clientNeedsConfirmation && requiredFieldClass(true),
                            clientNeedsConfirmation && "border-[hsl(var(--gold)_/_0.45)] bg-white",
                            errors.client_name && !clientNeedsConfirmation && "border-red-500",
                          )}
                          autoComplete="off"
                        />
                        <button
                          type="button"
                          aria-label={clientListOpen ? "Verberg klantenlijst" : "Toon klantenlijst"}
                          aria-expanded={clientListOpen}
                          onPointerDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const nextOpen = !clientListOpen;
                            clientListToggleUntilRef.current = Date.now() + (nextOpen ? 0 : 350);
                            setClientOpen(nextOpen);
                          }}
                          className="absolute right-1.5 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground"
                        >
                          <ChevronDown className={cn("h-4 w-4 transition-transform", clientListOpen && "rotate-180")} />
                        </button>
                      </div>
                    </PopoverAnchor>
                    <PopoverContent
                      align="start"
                      onOpenAutoFocus={e => e.preventDefault()}
                      className="p-1 w-[--radix-popover-trigger-width] max-h-64 overflow-y-auto"
                    >
                      {clientSuggestions.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setClientName(c.name);
                            setClientId(c.id);
                            setClientQuestionConfirmed(true);
                            setContactpersoon(c.contact_person ?? "");
                            setClientOpen(false);
                            clearError("client_name");
                            setIntakeManualBack(false);
                            setWizardStep("route");
                            setRouteActiveQuestion(routeSuggestedQuestion as 1 | 2 | 3 | 4);
                          }}
                          className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent focus:bg-accent focus:outline-none"
                        >
                          <div className="font-medium">{c.name}</div>
                          {(c.city || c.email) && (
                            <div className="text-[11px] text-muted-foreground">
                              {[c.city, c.email].filter(Boolean).join(" · ")}
                            </div>
                          )}
                        </button>
                      ))}
                    </PopoverContent>
                  </Popover>
                  {(errors.client_name || missingClient) && (
                    <span className={cn("mt-1 block text-[11px]", clientNeedsConfirmation ? "text-[hsl(var(--gold-deep))]" : "text-red-500")}>
                      {clientNeedsConfirmation
                        ? "Klantnaam staat klaar. Druk Enter om de volgende vraag te openen."
                        : errors.client_name || "Typ minimaal 2 tekens of kies een klant uit de lijst."}
                    </span>
                  )}
                </div>
                )}

                {false && intakeActiveQuestion === 2 && clientAnswered && renderCollapsedAnswer(
                  "Klant",
                  clientName,
                  () => {
                    setIntakeManualBack(true);
                    setIntakeActiveQuestion(1);
                  },
                )}

                {false && intakeActiveQuestion === 2 && (
                <div className={conversationalCardClass(0)}>
                  {renderQuestionPrompt(
                    { step: "Referentie", title: "Welke referentie en instructies horen erbij?", hint: "Deze stap blijft bewerkbaar terwijl je verdergaat." },
                    true,
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-x-5 gap-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Contactpersoon</label>
                  <Select value={contactpersoon} onValueChange={setContactpersoon} disabled={!clientId}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder={clientId ? "—" : "Kies eerst klant"} /></SelectTrigger>
                    <SelectContent>
                      {clientContacts.filter(ct => ct.is_active).map(ct => (
                        <SelectItem key={ct.id} value={ct.name}>
                          {ct.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Prioriteit</label>
                  <Select value={prioriteit} onValueChange={setPrioriteit}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Standaard">Standaard</SelectItem>
                      <SelectItem value="Spoed">Spoed</SelectItem>
                      <SelectItem value="Retour">Retour</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Klant-referentie</label>
                  <Input
                    value={klantReferentie}
                    onChange={e => setKlantReferentie(e.target.value)}
                    placeholder="PO-nummer of bestelreferentie"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Opmerkingen voor planner</label>
                  <Textarea
                    value={referentie}
                    onChange={e => setReferentie(e.target.value)}
                    rows={2}
                    placeholder="Bijzonderheden, instructies…"
                    className="text-sm resize-none"
                  />
                </div>
                  </div>
                </div>
                )}
              </div>
              {selectedClient && (
                <div className="mt-4 rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
                  {clientLocations.length > 0
                    ? `${clientLocations.length} vaste locaties beschikbaar voor deze klant. Zoek op bedrijfsnaam of kies een snelle locatie bij ophaal/aflever.`
                    : "Nog geen vaste locaties voor deze klant. Eerdere orderadressen en handmatige invoer blijven beschikbaar."}
                </div>
              )}
              {renderWizardFooter()}
            </section>

{/* ══ Chapter II · Vrachtplanning ══ */}
            </>
            )}

            {wizardStep === "route" && (
            <>
            <section className={uberFlowShellClass}>
              {renderUberStepHeader("02 · Route", "Bouw de rit op", "Single leg: ophalen en afleveren. Multi-leg: stops toevoegen tot de eindbestemming klopt.")}
              {false && <span className="card-chapter">II</span>}
              {false && <div className="mb-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))] mb-1" style={{ fontFamily: "var(--font-display)" }}>
                  02 · Vrachtplanning
                </div>
                <h3 className="section-title">Laad- en losstops</h3>
                <p className="text-xs text-muted-foreground mt-1">Adres, datum en tijdvenster per stop.</p>
              </div>}
              <div className="space-y-5">
                {clientAnswered && renderCollapsedAnswer(
                  "Klant",
                  clientName,
                  () => {
                    setWizardStep("intake");
                    setIntakeManualBack(true);
                    setIntakeActiveQuestion(1);
                  },
                )}

                <div className="rounded-2xl border border-[hsl(var(--gold)_/_0.16)] bg-white/80 px-4 py-3 shadow-[0_14px_32px_rgba(15,23,42,0.045)]">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-semibold tracking-[0.14em] text-[hsl(var(--gold-deep))]">Stops-first route</div>
                      <div className="text-xs text-muted-foreground">Elke locatie is een stop in dezelfde rit.</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <div className="rounded-full border border-[hsl(var(--gold)_/_0.18)] bg-[hsl(var(--gold-soft)_/_0.30)] px-2.5 py-1 text-[11px] font-semibold text-[hsl(var(--gold-deep))]">
                        {routeStops.filter(stop => !stop.missingAddress).length}/{routeStops.length} locaties
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (missingDeliveryAddress) {
                            setRouteManualBack(true);
                            setRouteActiveQuestion(2);
                            return;
                          }
                          addFreightLine();
                          setRouteManualBack(true);
                          setRouteActiveQuestion(4);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--gold))] px-3 py-1.5 text-[11px] font-semibold text-white shadow-[0_8px_20px_hsl(var(--gold)_/_0.25)] transition hover:bg-[hsl(var(--gold-deep))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold)_/_0.35)]"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Tussenstop toevoegen
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {routeStops.map((stop) => {
                      const hasIssue = routeRuleIssues.some((issue) => issue.lineId === stop.line.id);
                      const isCurrent =
                        (routeActiveQuestion === 1 && stop.kind === "pickup") ||
                        (routeActiveQuestion === 2 && stop.line.id === deliveryLine?.id) ||
                        (routeActiveQuestion === 4 && stop.kind !== "pickup");
                      const canClearStop = stop.kind === "delivery";
                      const display = locationDisplay(stop.line, stop.title, stop.fallback);

                      return (
                        <div
                          key={stop.id}
                          className={cn(
                            "group inline-flex min-w-0 items-center gap-1 rounded-full border py-1.5 pl-2 pr-2 text-left text-xs transition",
                            isCurrent
                              ? "border-[hsl(var(--gold)_/_0.42)] bg-[hsl(var(--gold-soft)_/_0.42)] text-foreground shadow-sm"
                              : "border-border/70 bg-white text-muted-foreground hover:border-[hsl(var(--gold)_/_0.25)] hover:bg-[hsl(var(--gold-soft)_/_0.22)]",
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              if (stop.kind === "pickup") {
                                setRouteManualBack(true);
                                setRouteActiveQuestion(1);
                                return;
                              }
                              if (stop.line.id === deliveryLine?.id) {
                                setRouteManualBack(true);
                                setRouteActiveQuestion(2);
                                return;
                              }
                              setRouteManualBack(true);
                              setRouteActiveQuestion(4);
                            }}
                            className="inline-flex min-w-0 items-center gap-2 rounded-full px-1.5 py-0.5 text-left focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold)_/_0.35)]"
                          >
                            <span className={cn(
                              "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                              stop.missingAddress || hasIssue ? "bg-red-50 text-red-600" : "bg-[hsl(var(--gold))] text-white",
                            )}>
                              {stop.shortTitle}
                            </span>
                            <span className="min-w-0">
                              <span className="block font-semibold">{stop.line.locatie ? `${stop.title} · ${display.company}` : stop.title}</span>
                              <span className={cn("block max-w-[15rem] truncate", stop.missingAddress ? "text-red-600" : "text-muted-foreground")}>
                                {display.address}
                              </span>
                            </span>
                          </button>
                          {canClearStop && (
                            <button
                              type="button"
                              aria-label="Eindbestemming wissen"
                              onClick={() => {
                                if (extraDeliveryLines.some(line => line.id === stop.line.id)) {
                                  removeFreightLine(stop.line.id);
                                } else {
                                  handleDeliveryAddrChange(EMPTY_ADDRESS);
                                  setDeliveryLookup("");
                                }
                                setRouteManualBack(true);
                                setRouteActiveQuestion(2);
                              }}
                              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-80 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-red-200"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {routeActiveQuestion > 1 && renderCollapsedAnswer(
                  "Ophalen",
                  pickupLine?.locatie
                    ? `${locationDisplay(pickupLine, "Ophalen", "Ophaaladres ingevuld").company}\n${locationDisplay(pickupLine, "Ophalen", "Ophaaladres ingevuld").address}`
                    : "",
                  () => {
                    setRouteManualBack(true);
                    setRouteActiveQuestion(1);
                  },
                  "Ophaaladres ingevuld",
                )}

                {routeActiveQuestion === 1 && (
                <div className={conversationalCardClass(0)}>
                  {renderQuestionPrompt(
                    { step: "Ophaaladres", title: "Waar wordt de lading opgehaald?", hint: "Kies het adres en vul de bedrijfsnaam in. Bijzonderheden beheer je per adres in het adresboek." },
                    !missingPickupAddress,
                  )}
                  <div className={cn(flowLabelClass, requiredTextClass(missingPickupAddress))}>
                    Ophaaladres
                  </div>
                  <AddressAutocomplete
                     value={pickupAddr}
                     onChange={handlePickupAddrChange}
                     onBlur={handlePickupAddrBlur}
                     error={errors.pickup_address}
                     searchLabel="Zoek ophaaladres"
                     searchPlaceholder="Typ bedrijfsnaam, straat of dockadres"
                     compactFlow
                     onSearchInputChange={(value) => {
                       setPickupLookup(value);
                       clearError("pickup_address");
                     }}
                     quickOptions={pickupQuickOptions.map(toAddressSuggestionOption)}
                     onQuickSelect={(option) => {
                       const selected = pickupQuickOptions.find(item => item.id === option.id);
                       if (selected) applyPlannerLocation("pickup", selected);
                       setPickupAddressBookLabel({ label: option.title, key: buildAddressBookKey(option.value) });
                       setRouteManualBack(false);
                     }}
                     onResolvedSelection={(selection) => {
                       void maybeLearnClientAlias(selection);
                       if (primaryLadenId) {
                         setFreightLines(prev => prev.map(line => line.id === primaryLadenId ? {
                           ...line,
                           companyName: line.companyName || clientName,
                         } : line));
                       }
                       setPickupAddressBookLabel({
                         label: selection.searchTerm || composeAddressString(selection.value, { includeLocality: true }),
                         key: buildAddressBookKey(selection.value),
                       });
                       setRouteManualBack(false);
                    }}
                    />
                    {renderLocationOperationalDetails(pickupLine, "Ophaal-/laadadres")}
                  </div>
                )}
                  {routeActiveQuestion > 2 && renderCollapsedAnswer(
                    getDeliveryStopLabel(0),
                    deliveryLine?.locatie
                      ? `${locationDisplay(deliveryLine, getDeliveryStopLabel(0), "Afleveradres ingevuld").company}\n${locationDisplay(deliveryLine, getDeliveryStopLabel(0), "Afleveradres ingevuld").address}`
                      : "",
                    () => {
                      setRouteManualBack(true);
                      setRouteActiveQuestion(2);
                    },
                    "Afleveradres ingevuld",
                  )}

                  {routeActiveQuestion === 2 && (
                  <div className={conversationalCardClass(0)}>
                    {renderQuestionPrompt(
                      { step: "Volgende stop", title: "Wat is de volgende stop of eindbestemming?", hint: "Bij een single leg is dit afleveren. Bij multi-leg is dit de eerste stop." },
                      !missingDeliveryAddress,
                    )}
                    <div className={cn(flowLabelClass, requiredTextClass(missingDeliveryAddress))}>
                      {isMultiLegRoute ? "Stop 1" : "Afleveradres"}
                    </div>
                    <AddressAutocomplete
                      value={deliveryAddr}
                      onChange={handleDeliveryAddrChange}
                      onBlur={handleDeliveryAddrBlur}
                      error={errors.delivery_address}
                     searchLabel="Zoek stop of eindbestemming"
                     searchPlaceholder="Typ warehouse, stad, straat of eindbestemming"
                      compactFlow
                      blockedAddresses={pickupLine?.locatie ? [pickupLine.locatie] : []}
                      blockedMessage="Afleveradres mag niet hetzelfde zijn als het ophaaladres."
                      onSearchInputChange={(value) => {
                        setDeliveryLookup(value);
                        clearError("delivery_address");
                      }}
                      quickOptions={deliveryQuickOptions.map(toAddressSuggestionOption)}
                      onQuickSelect={(option) => {
                        const selected = deliveryQuickOptions.find(item => item.id === option.id);
                        if (selected) applyPlannerLocation("delivery", selected);
                        setDeliveryAddressBookLabel({ label: option.title, key: buildAddressBookKey(option.value) });
                        const nextAddress = normalizeLookup(selected?.addressString || option.title || option.value.street);
                        if (pickupLine?.locatie && nextAddress === normalizeLookup(pickupLine.locatie)) {
                          setErrors(prev => ({ ...prev, delivery_address: "Afleveradres mag niet hetzelfde zijn als ophaaladres." }));
                          toast.error("Adrescontrole", { description: "Kies een andere stop dan het ophaaladres." });
                          setRouteManualBack(true);
                          setRouteActiveQuestion(2);
                          return;
                        }
                        setRouteManualBack(false);
                      }}
                      onResolvedSelection={(selection) => {
                        void maybeLearnClientAlias(selection);
                        if (primaryLossenId) {
                          setFreightLines(prev => prev.map(line => line.id === primaryLossenId ? {
                            ...line,
                            companyName: line.companyName || clientName,
                          } : line));
                        }
                        setDeliveryAddressBookLabel({
                          label: selection.searchTerm || composeAddressString(selection.value, { includeLocality: true }),
                          key: buildAddressBookKey(selection.value),
                        });
                        const nextAddress = normalizeLookup(composeAddressString(selection.value, { includeLocality: true }) || selection.searchTerm);
                        if (pickupLine?.locatie && nextAddress === normalizeLookup(pickupLine.locatie)) {
                          setErrors(prev => ({ ...prev, delivery_address: "Afleveradres mag niet hetzelfde zijn als ophaaladres." }));
                          toast.error("Adrescontrole", { description: "Kies een andere stop dan het ophaaladres." });
                          setRouteManualBack(true);
                          setRouteActiveQuestion(2);
                          return;
                        }
                        setRouteManualBack(false);
                      }}
                    />
                    {renderLocationOperationalDetails(deliveryLine, isMultiLegRoute ? "Stop 1 / afleveradres" : "Afleveradres")}
                  </div>
                  )}
              {routeActiveQuestion > 3 && renderCollapsedAnswer(
                "Laadmoment",
                [pickupLine?.datum, pickupLine?.tijd, pickupLine?.tijdTot].filter(Boolean).join(" · ") || "Laadmoment ingevuld",
                () => {
                  setRouteManualBack(true);
                  setRouteActiveQuestion(3);
                },
                "Ophaaltijd ingevuld",
              )}

              {routeActiveQuestion === 3 && (
              <div className={conversationalCardClass(0)}>
              {renderQuestionPrompt(
                { step: "Laadmoment", title: "Wanneer wordt de lading opgehaald?", hint: "Kies het laadmoment. Daarna verschijnt de vraag voor levering of overdracht." },
                !missingPickupTimeWindow,
              )}
              {pickupLine && (
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <label className={cn(flowLabelClass, requiredTextClass(missingPickupTimeWindow))}>Datum</label>
                    <LuxeDatePicker
                      value={pickupLine.datum}
                      onChange={v => {
                        setRouteManualBack(false);
                        updateFreightLine(pickupLine.id, "datum", v);
                      }}
                    />
                  </div>
                  <div>
                    <label className={flowLabelClass}>Tijd van</label>
                    <LuxeTimePicker
                      value={pickupLine.tijd}
                      onChange={v => {
                        setRouteManualBack(false);
                        updateFreightLine(pickupLine.id, "tijd", v);
                      }}
                    />
                  </div>
                  <div>
                    <label className={flowLabelClass}>Tijd tot</label>
                    <LuxeTimePicker
                      value={pickupLine.tijdTot}
                      onChange={v => {
                        setRouteManualBack(false);
                        updateFreightLine(pickupLine.id, "tijdTot", v);
                      }}
                    />
                  </div>
                </div>
              )}
              {(errors.pickup_time_window || pickupRouteIssue?.message) && (
                <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                  {errors.pickup_time_window || pickupRouteIssue?.message}
                </p>
              )}
              </div>
              )}

              {routeActiveQuestion === 4 && (
              <div className={conversationalCardClass(0)}>
              {renderQuestionPrompt(
                { step: "Levermoment", title: "Wanneer moet de lading daar zijn?", hint: "Gebruik dit voor lossen, warehouse-overdracht of eindbestemming." },
                !missingDeliveryTimeWindow,
              )}
              {deliveryLine && (
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <label className={cn(flowLabelClass, requiredTextClass(missingDeliveryTimeWindow))}>Datum</label>
                    <LuxeDatePicker
                      value={deliveryLine.datum}
                      onChange={v => {
                        setRouteManualBack(false);
                        updateFreightLine(deliveryLine.id, "datum", v);
                      }}
                    />
                  </div>
                  <div>
                    <label className={flowLabelClass}>Tijd van</label>
                    <LuxeTimePicker
                      value={deliveryLine.tijd}
                      onChange={v => {
                        setRouteManualBack(false);
                        updateFreightLine(deliveryLine.id, "tijd", v);
                      }}
                    />
                  </div>
                  <div>
                    <label className={flowLabelClass}>Tijd tot</label>
                    <LuxeTimePicker
                      value={deliveryLine.tijdTot}
                      onChange={v => {
                        setRouteManualBack(false);
                        updateFreightLine(deliveryLine.id, "tijdTot", v);
                      }}
                    />
                  </div>
                </div>
              )}
              {(errors.delivery_time_window || errors.route_sequence || primaryDeliveryRouteIssue?.message) && (
                <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                  {errors.delivery_time_window || errors.route_sequence || primaryDeliveryRouteIssue?.message}
                </p>
              )}
              <div className="mt-4 rounded-2xl border border-[hsl(var(--gold)_/_0.18)] bg-[hsl(var(--gold-soft)_/_0.18)] px-4 py-3 text-xs text-muted-foreground">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <span>Meerdere stops, bijvoorbeeld ophalen {"->"} warehouse {"->"} Dubai, blijven onderdeel van dezelfde rit. De laatste stop wordt straks als eindbestemming gebruikt.</span>
                  <button
                    type="button"
                    onClick={addFreightLine}
                    className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-[hsl(var(--gold)_/_0.28)] bg-white px-3 py-1.5 text-xs font-semibold text-[hsl(var(--gold-deep))] transition hover:bg-[hsl(var(--gold-soft)_/_0.32)]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Stop toevoegen
                  </button>
                </div>
              </div>
              {extraDeliveryLines.length > 0 && (
                <div className="mt-4 space-y-3">
                  {extraDeliveryLines.map((line, index) => (
                    <div key={line.id} className="rounded-2xl border border-[hsl(var(--gold)_/_0.16)] bg-white p-4 shadow-[0_16px_34px_rgba(15,23,42,0.07)]">
                      <div className="mb-4 flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-foreground">{getDeliveryStopLabel(index + 1)}</div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {index + 1 === deliveryStops.length - 1 ? "Laatste stop van de rit" : "Warehouse, crossdock of tussenstop"}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFreightLine(line.id)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-red-50 hover:text-red-600"
                          aria-label="Extra stop verwijderen"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="grid gap-4">
                        <div className="min-w-0">
                          <label className={flowLabelClass}>{getDeliveryStopLabel(index + 1)}</label>
                          <AddressAutocomplete
                            value={addressValueFromFreightLine(line)}
                            onChange={(value) => updateFreightLineAddress(line.id, value)}
                            searchLabel="Zoek stop of eindbestemming"
                            searchPlaceholder="Typ warehouse, stad, straat of eindbestemming"
                            compactFlow
                            blockedAddresses={[
                              pickupLine?.locatie,
                              ...deliveryStops
                                .filter((stop) => stop.id !== line.id)
                                .map((stop) => stop.locatie),
                            ].filter(Boolean) as string[]}
                            blockedMessage="Deze stop staat al in de rit."
                            onSearchInputChange={(value) => {
                              setDeliveryLookup(value);
                              clearError("delivery_address");
                            }}
                            quickOptions={deliveryQuickOptions.map(toAddressSuggestionOption)}
                            onQuickSelect={(option) => {
                              const selected = deliveryQuickOptions.find(item => item.id === option.id);
                              if (selected) updateFreightLineAddress(line.id, selected.value, selected);
                            }}
                            onResolvedSelection={(selection) => {
                              void maybeLearnClientAlias(selection);
                              updateFreightLineAddress(line.id, selection.value);
                            }}
                          />
                          {renderLocationOperationalDetails(line, getDeliveryStopLabel(index + 1))}
                        </div>
                        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
                          <div className="min-w-0">
                            <label className={flowLabelClass}>Datum</label>
                            <LuxeDatePicker
                              value={line.datum}
                              onChange={v => updateFreightLine(line.id, "datum", v)}
                            />
                          </div>
                          <div className="min-w-0">
                            <label className={flowLabelClass}>Tijd van</label>
                            <LuxeTimePicker
                              value={line.tijd}
                              onChange={v => updateFreightLine(line.id, "tijd", v)}
                            />
                          </div>
                          <div className="min-w-0">
                            <label className={flowLabelClass}>Tijd tot</label>
                            <LuxeTimePicker
                              value={line.tijdTot}
                              onChange={v => updateFreightLine(line.id, "tijdTot", v)}
                            />
                          </div>
                        </div>
                      </div>
                      {routeRuleIssues.find((issue) => issue.lineId === line.id) && (
                        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                          {routeRuleIssues.find((issue) => issue.lineId === line.id)?.message}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
              </div>
              )}
              </div>

              {false && !missingPickupAddress && !missingDeliveryAddress && (
              <div className="pt-4">
                <button
                  type="button"
                  onClick={addFreightLine}
                  className="text-xs text-[hsl(var(--gold-deep))] hover:text-foreground font-medium inline-flex items-center gap-1.5 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" /> Tussenstop toevoegen
                </button>
              </div>
              )}
              {renderWizardFooter()}
            </section>

            {/* ── Traject-preview (onder stops) ── */}
            {false && (trajectPreview || previewLoading) && (
              <div className="card--luxe p-5 relative">
                {previewLoading && !trajectPreview && (
                  <div className="text-xs text-muted-foreground">Traject wordt berekend…</div>
                )}
                {trajectPreview && trajectPreview.matched && trajectPreview.legs.length > 0 && (
                  <div className="flex items-start gap-3">
                    <span className="w-7 h-7 rounded-lg bg-[hsl(var(--gold-soft))] text-[hsl(var(--gold-deep))] inline-flex items-center justify-center shrink-0 mt-0.5">
                      <Route className="h-3.5 w-3.5" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold flex items-center gap-2 flex-wrap">
                        <span>
                          {trajectPreview.legs.length > 1
                            ? `Boeking wordt gesplitst in ${trajectPreview.legs.length} legs`
                            : `Traject: ${trajectPreview.rule?.name ?? ""}`}
                        </span>
                        {afdeling && (
                          <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-md bg-[hsl(var(--gold-soft))] text-[hsl(var(--gold-deep))] border border-[hsl(var(--gold)_/_0.25)]">
                            {afdeling}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 space-y-1.5">
                        {trajectPreview.legs.map((leg) => (
                          <div key={leg.sequence} className="flex items-center gap-2 text-xs">
                            <span className="w-5 h-5 rounded-md bg-[hsl(var(--muted)_/_0.5)] text-muted-foreground inline-flex items-center justify-center text-[10px] font-bold shrink-0">
                              {leg.sequence}
                            </span>
                            <span className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-[hsl(var(--gold-soft)_/_0.5)] text-[hsl(var(--gold-deep))] border border-[hsl(var(--gold)_/_0.15)]">
                              {leg.department_code}
                            </span>
                            <span className="text-muted-foreground truncate">{leg.from || "?"} → {leg.to || "?"}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                {trajectPreview && !trajectPreview.matched && trajectPreview.reason && (
                  <div className="flex items-start gap-3">
                    <span className="w-7 h-7 rounded-lg bg-[hsl(var(--muted))] text-muted-foreground inline-flex items-center justify-center shrink-0 mt-0.5">
                      <Route className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-xs text-muted-foreground">{trajectPreview.reason}</span>
                  </div>
                )}
              </div>
            )}

            {/* ══ Chapter III · Transport ══ */}
            </>
            )}

            {wizardStep === "cargo" && (
            <>
            {false && !missingQuantity && !missingWeight && (
            <section className="card--luxe p-6 relative">
              <span className="card-chapter">II</span>
              <div className="mb-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))] mb-1" style={{ fontFamily: "var(--font-display)" }}>
                  03 · Transport
                </div>
                <h3 className="section-title">Type en voertuig</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Afdeling wordt automatisch bepaald door het traject{afdeling ? ` (${afdeling})` : ""}. Chauffeur wordt later toegewezen.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-x-5 gap-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Transport type <span className="text-red-600">*</span></label>
                  <Select value={transportType} onValueChange={(value) => { setTransportType(value); setTransportTypeManual(true); }}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecteer…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FTL">FTL</SelectItem>
                      <SelectItem value="LTL">LTL</SelectItem>
                      <SelectItem value="Koel">Koel</SelectItem>
                      <SelectItem value="Express">Express</SelectItem>
                      <SelectItem value="Luchtvracht">Luchtvracht</SelectItem>
                    </SelectContent>
                  </Select>
                  {suggestedTransportType && (
                    <span className="text-[10px] text-muted-foreground mt-0.5 block">
                      Voorstel: {suggestedTransportType} op basis van prioriteit en lading
                    </span>
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Voertuigtype</label>
                  <Select value={voertuigtype} onValueChange={(value) => { setVoertuigtype(value); setVoertuigtypeManual(true); }}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecteer…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Vrachtwagen">Vrachtwagen</SelectItem>
                      <SelectItem value="Bestelbus">Bestelbus</SelectItem>
                      <SelectItem value="Trailer">Trailer</SelectItem>
                    </SelectContent>
                  </Select>
                  {suggestedVehicleType && (
                    <span className="text-[10px] text-muted-foreground mt-0.5 block">
                      Voorstel: {suggestedVehicleType} op basis van gewicht, lengte en laadklep
                    </span>
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Afdeling <span className="text-red-600">*</span></label>
                  <Select
                    value={afdeling || undefined}
                    onValueChange={v => { setAfdeling(v); setAfdelingManual(true); clearError("afdeling"); }}
                  >
                    <SelectTrigger className={cn("h-9 text-sm", errors.afdeling && "border-red-500")}>
                      <SelectValue placeholder="Selecteer…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OPS">Operations</SelectItem>
                      <SelectItem value="EXPORT">Export</SelectItem>
                      <SelectItem value="IMPORT">Import</SelectItem>
                    </SelectContent>
                  </Select>
                  {!afdelingManual && afdeling && (
                    <span className="text-[10px] text-[hsl(var(--gold-deep))] tracking-wider mt-0.5 block">
                      Automatisch bepaald op basis van traject
                    </span>
                  )}
                  {afdelingManual && inferredAfdeling && inferredAfdeling !== afdeling && (
                    <span className="text-[10px] text-amber-600 tracking-wider mt-0.5 block">
                      Overschreven door planner, automatisch zou {inferredAfdeling} zijn
                    </span>
                  )}
                  {afdelingManual && (
                    <button
                      type="button"
                      onClick={() => setAfdelingManual(false)}
                      className="text-[10px] text-muted-foreground hover:text-foreground underline mt-0.5 block"
                    >
                      Terug naar automatische detectie
                    </button>
                  )}
                  {errors.afdeling && <span className="text-[11px] text-red-500">{errors.afdeling}</span>}
                </div>
              </div>
            </section>
            )}

            
            {/* ══ Chapter IV · Lading ══ */}
            <section className={uberFlowShellClass}>
              {renderUberStepHeader("03 · Transport", "Wat gaat er mee?", "Begin met aantal en gewicht. Details komen pas als de basis klopt.")}
              {false && <span className="card-chapter">IV</span>}
              {false && <div className="mb-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))] mb-1" style={{ fontFamily: "var(--font-display)" }}>
                  04 · Lading
                </div>
                <h3 className="section-title">Wat wordt er vervoerd</h3>
                <p className="text-xs text-muted-foreground mt-1">Voeg meerdere regels toe voor verschillende soorten lading.</p>
              </div>}
              {cargoActiveQuestion > 1 && (
                <div className={cn("mb-8", cargoActiveQuestion >= 3 && "mb-10")}>
                  {renderCollapsedFacts([
                    {
                      label: "Aantal",
                      value: `${cargoTotals.totAantal || 0} ${cargoTotals.primaryUnit || transportEenheid || "eenheden"}`,
                      onEdit: () => {
                        setCargoManualBack(true);
                        setCargoActiveQuestion(1);
                      },
                    },
                    ...(cargoActiveQuestion > 2 ? [{
                      label: "Afmetingen",
                      value: cargoSameDimensions
                        ? `${cargoRows[0]?.lengte || "-"}x${cargoRows[0]?.breedte || "-"}x${cargoRows[0]?.hoogte || "-"} cm`
                        : `${cargoRows.filter(row => row.lengte && row.breedte && row.hoogte).length} regels`,
                      onEdit: () => {
                        setCargoManualBack(true);
                        setCargoActiveQuestion(2);
                      },
                    }] : []),
                    ...(cargoActiveQuestion > 3 ? [{
                      label: "Gewicht",
                      value: `${cargoTotals.totGewicht || 0} kg`,
                      onEdit: () => {
                        setCargoManualBack(true);
                        setCargoActiveQuestion(3);
                      },
                    }] : []),
                  ])}
                </div>
              )}

              {cargoActiveQuestion === 1 && cargoRows.slice(0, 1).map(row => (
                <div key={row.id} className={cn(
                  conversationalCardClass(0),
                  "mb-4",
                  missingQuantity && "border-red-200 bg-red-50/40",
                )}>
                  {renderQuestionPrompt(
                    { step: "Aantal", title: "Hoeveel eenheden vervoer je?", hint: "Na een geldig aantal verschijnt automatisch de gewichtsvraag." },
                    !missingQuantity,
                  )}
                  <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
                  <div>
                    <label className={cn(flowLabelClass, requiredTextClass(missingQuantity))}>Aantal eenheden</label>
                    <Input
                      type="number"
                      value={row.aantal}
                      onChange={e => { updateCargoRow(row.id, "aantal", e.target.value); clearError("quantity"); }}
                      onKeyDown={e => {
                        if (e.key === "Enter" && Number(row.aantal) > 0) {
                          e.preventDefault();
                          setCargoManualBack(false);
                          setCargoActiveQuestion(2);
                        }
                      }}
                      placeholder="Bijv. 6"
                      className={cn(flowInputClass, "tabular-nums", requiredFieldClass(missingQuantity))}
                    />
                  </div>
                  <div>
                    <label className={flowLabelClass}>Eenheid</label>
                    <Select value={row.eenheid} onValueChange={v => { updateCargoRow(row.id, "eenheid", v); clearError("unit"); }}>
                      <SelectTrigger className={flowInputClass}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Pallets">Pallets</SelectItem>
                        <SelectItem value="Colli">Colli</SelectItem>
                        <SelectItem value="Box">Box</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  </div>
                </div>
              ))}

              {cargoActiveQuestion === 2 && (
                <div className={cn(conversationalCardClass(0), "mb-4")}>
                  {renderQuestionPrompt(
                    {
                      step: "Afmetingen",
                      title: "Wat zijn de afmetingen per eenheid?",
                      hint: "Vul lengte, breedte en hoogte in. Als alle eenheden hetzelfde zijn, gebruik je de schakelaar hieronder.",
                    },
                    cargoHasDimensions,
                  )}
                  <label className="mb-4 flex w-fit items-center gap-3 rounded-2xl border border-[hsl(var(--gold)_/_0.18)] bg-white px-4 py-3 text-sm font-medium text-foreground shadow-[0_12px_30px_-28px_hsl(var(--gold-deep)_/_0.55)]">
                    <input
                      type="checkbox"
                      checked={cargoSameDimensions}
                      onChange={(e) => setCargoSameDimensions(e.target.checked)}
                      className="h-4 w-4 rounded border-[hsl(var(--gold)_/_0.35)] text-[hsl(var(--gold-deep))]"
                    />
                    <span>Alle eenheden hebben dezelfde afmetingen</span>
                  </label>
                  <div className="space-y-3">
                    {(cargoSameDimensions ? cargoRows.slice(0, 1) : cargoRows).map((row, index) => (
                      <div key={row.id} className="rounded-2xl border border-[hsl(var(--gold)_/_0.14)] bg-white p-4">
                        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-[hsl(var(--gold-deep))]">
                          {cargoSameDimensions ? "Afmetingen voor alle eenheden" : `Ladingregel ${index + 1}`}
                        </div>
                        <div className="grid gap-3 md:grid-cols-3">
                          <div>
                            <label className={flowLabelClass}>Lengte cm</label>
                            <Input type="number" value={row.lengte} onChange={e => updateCargoRow(row.id, "lengte", e.target.value)} className={cn(flowInputClass, "tabular-nums")} />
                          </div>
                          <div>
                            <label className={flowLabelClass}>Breedte cm</label>
                            <Input type="number" value={row.breedte} onChange={e => updateCargoRow(row.id, "breedte", e.target.value)} className={cn(flowInputClass, "tabular-nums")} />
                          </div>
                          <div>
                            <label className={flowLabelClass}>Hoogte cm</label>
                            <Input
                              type="number"
                              value={row.hoogte}
                              onChange={e => updateCargoRow(row.id, "hoogte", e.target.value)}
                              onKeyDown={e => {
                                if (e.key === "Enter" && (row.lengte || row.breedte || row.hoogte)) {
                                  e.preventDefault();
                                  setCargoManualBack(false);
                                  setCargoActiveQuestion(3);
                                }
                              }}
                              className={cn(flowInputClass, "tabular-nums")}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setCargoManualBack(false);
                        setCargoActiveQuestion(3);
                      }}
                      className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--gold-deep))] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_16px_36px_-24px_hsl(var(--gold-deep)_/_0.85)] transition hover:bg-[hsl(var(--gold))] hover:text-[#17130b]"
                    >
                      Gewicht invullen
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}

              {cargoActiveQuestion === 3 && cargoRows.slice(0, 1).map(row => (
                <div key={row.id} className={cn(
                  conversationalCardClass(0),
                  "mb-4",
                  missingWeight ? "border-red-200 bg-red-50/40" : "border-border/60 bg-white",
                )}>
                  {renderQuestionPrompt(
                    { step: "Gewicht", title: "Wat is het totale gewicht?", hint: "Na een geldig gewicht verschijnen de detailvelden en voertuigkeuzes." },
                    !missingWeight,
                  )}
                  <label className={cn(flowLabelClass, requiredTextClass(missingWeight))}>Gewicht totaal in kg</label>
                  <Input
                    type="number"
                    value={row.gewicht}
                    onChange={e => { updateCargoRow(row.id, "gewicht", e.target.value); clearError("weight_kg"); }}
                    onKeyDown={e => {
                      if (e.key === "Enter" && Number(row.gewicht) > 0) {
                        e.preventDefault();
                        setCargoManualBack(false);
                        setCargoActiveQuestion(4);
                      }
                    }}
                    placeholder="Bijv. 850"
                    className={cn(flowInputClass, "max-w-xs tabular-nums", requiredFieldClass(missingWeight))}
                  />
                </div>
              ))}

              {cargoActiveQuestion >= 4 && !missingQuantity && !missingWeight && (
                <div className={cn(conversationalCardClass(0), "mb-4")}>
                  {renderQuestionPrompt(
                    {
                      step: "Transport",
                      title: "Welk transport past hierbij?",
                      hint: "We doen alvast een voorstel. Pas alleen aan als de planner bewust wil afwijken.",
                    },
                    Boolean((transportType || suggestedTransportType) && (voertuigtype || suggestedVehicleType) && afdeling),
                    Boolean((transportType || suggestedTransportType) && (voertuigtype || suggestedVehicleType)),
                  )}

                  <div className="grid gap-4 md:grid-cols-3">
                    <div>
                      <label className={flowLabelClass}>
                        Transport type <span className="text-red-600">*</span>
                      </label>
                      <Select value={transportType} onValueChange={(value) => { setTransportType(value); setTransportTypeManual(true); }}>
                        <SelectTrigger className={flowInputClass}>
                          <SelectValue placeholder="Selecteer..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="FTL">FTL</SelectItem>
                          <SelectItem value="LTL">LTL</SelectItem>
                          <SelectItem value="Koel">Koel</SelectItem>
                          <SelectItem value="Express">Express</SelectItem>
                          <SelectItem value="Luchtvracht">Luchtvracht</SelectItem>
                        </SelectContent>
                      </Select>
                      {suggestedTransportType && (
                        <span className="mt-1 block text-[10px] tracking-wider text-[hsl(var(--gold-deep))]">
                          Voorstel: {suggestedTransportType}
                        </span>
                      )}
                      {transportTypeManual && transportType && (
                        <span className="mt-1 block text-[10px] tracking-wider text-muted-foreground">
                          Handmatig ingesteld door planner
                        </span>
                      )}
                    </div>

                    <div>
                      <label className={flowLabelClass}>
                        Voertuigtype
                      </label>
                      <Select value={voertuigtype} onValueChange={(value) => { setVoertuigtype(value); setVoertuigtypeManual(true); }}>
                        <SelectTrigger className={flowInputClass}>
                          <SelectValue placeholder="Selecteer..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Vrachtwagen">Vrachtwagen</SelectItem>
                          <SelectItem value="Bestelbus">Bestelbus</SelectItem>
                          <SelectItem value="Trailer">Trailer</SelectItem>
                        </SelectContent>
                      </Select>
                      {suggestedVehicleType && (
                        <span className="mt-1 block text-[10px] tracking-wider text-[hsl(var(--gold-deep))]">
                          Voorstel: {suggestedVehicleType}
                        </span>
                      )}
                      {voertuigtypeManual && voertuigtype && (
                        <span className="mt-1 block text-[10px] tracking-wider text-muted-foreground">
                          Handmatig ingesteld door planner
                        </span>
                      )}
                    </div>

                    <div>
                      <label className={cn(flowLabelClass, requiredTextClass(!afdeling))}>
                        Afdeling <span className="text-red-600">*</span>
                      </label>
                      <Select
                        value={afdeling || undefined}
                        onValueChange={v => { setAfdeling(v); setAfdelingManual(true); clearError("afdeling"); }}
                      >
                        <SelectTrigger className={cn(flowInputClass, errors.afdeling && "border-red-500")}>
                          <SelectValue placeholder="Selecteer..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="OPS">Operations</SelectItem>
                          <SelectItem value="EXPORT">Export</SelectItem>
                          <SelectItem value="IMPORT">Import</SelectItem>
                        </SelectContent>
                      </Select>
                      {!afdelingManual && afdeling && (
                        <span className="mt-1 block text-[10px] tracking-wider text-[hsl(var(--gold-deep))]">
                          Automatisch bepaald op basis van traject
                        </span>
                      )}
                      {afdelingManual && inferredAfdeling && inferredAfdeling !== afdeling && (
                        <span className="mt-1 block text-[10px] tracking-wider text-red-600">
                          Overschreven door planner, automatisch zou {inferredAfdeling} zijn
                        </span>
                      )}
                      {afdelingManual && afdeling && (
                        <span className="mt-1 block text-[10px] tracking-wider text-muted-foreground">
                          Handmatig ingesteld door planner
                        </span>
                      )}
                      {errors.afdeling && <span className="text-[11px] text-red-500">{errors.afdeling}</span>}
                    </div>
                  </div>

                  {showPmt && (
                    <div className="mt-6 rounded-2xl border border-[hsl(var(--gold)_/_0.18)] bg-[hsl(var(--gold-soft)_/_0.18)] p-4">
                      <div className="mb-4">
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--gold-deep))]">
                            Luchtvracht security
                          </div>
                          <div className="mt-1 text-sm font-semibold text-foreground">Kies direct Secure, EDD of X-RAY</div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Bij EDD of X-RAY verschijnen de PMT-gegevens voor de RCS-verklaring.
                          </p>
                        </div>
                      </div>

                      {true && (
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                            {(["secure", "edd", "xray"] as const).map((method) => (
                              <button
                                key={method}
                                type="button"
                                onClick={() => {
                                  if (method === "secure") {
                                    setShipmentSecure(true);
                                    setPmtMethode("");
                                    return;
                                  }
                                  setShipmentSecure(false);
                                  setPmtMethode(method);
                                }}
                                className={cn(
                                  "flex min-h-[132px] min-w-0 flex-col rounded-2xl border bg-white p-4 text-left transition hover:border-[hsl(var(--gold)_/_0.45)] hover:bg-[hsl(var(--gold-soft)_/_0.20)]",
                                  (method === "secure" ? shipmentSecure : !shipmentSecure && pmtMethode === method)
                                    ? "border-[hsl(var(--gold)_/_0.65)] shadow-[inset_0_0_0_1px_hsl(var(--gold)_/_0.20)]"
                                    : "border-border/70",
                                )}
                              >
                                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--gold-soft))] text-sm font-semibold text-[hsl(var(--gold-deep))]">
                                  {method === "secure" ? "OK" : method === "edd" ? "EDD" : "XR"}
                                </span>
                                <span className="mt-4 min-w-0">
                                  <span className="block break-words text-base font-semibold leading-tight">
                                    {method === "secure" ? "Secure" : method === "edd" ? "EDD · Hondenscan" : "X-RAY · Rontgenscan"}
                                  </span>
                                  <span className="hidden">
                                    {method === "edd" ? "EDD · Hondenscan" : "X-RAY · Rontgenscan"}
                                  </span>
                                  <span className="mt-2 block max-w-[18rem] break-words text-sm leading-relaxed text-muted-foreground">
                                    {method === "secure" ? "Al beveiligd aangeleverd" : method === "edd" ? "Screening via operator/hondenteam" : "Screening via rontgenstraat"}
                                  </span>
                                  <span className="hidden">
                                    {method === "edd" ? "Screening via operator/hondenteam" : "Screening via rontgenstraat"}
                                  </span>
                                </span>
                              </button>
                            ))}
                          </div>

                          {pmtMethode && (
                            <div className="grid gap-4 md:grid-cols-2">
                              <div>
                                <label className={flowLabelClass}>Operator / screeningsbedrijf</label>
                                <Input
                                  value={pmtOperator}
                                  onChange={e => setPmtOperator(e.target.value)}
                                  placeholder="Bijv. Schiphol Cargo Security"
                                  className={flowInputClass}
                                />
                              </div>
                              <div>
                                <label className={flowLabelClass}>PMT-referentie</label>
                                <Input
                                  value={pmtReferentie}
                                  onChange={e => setPmtReferentie(e.target.value)}
                                  placeholder="PMT-2026-..."
                                  className={flowInputClass}
                                />
                              </div>
                              <div>
                                <label className={flowLabelClass}>Datum screening</label>
                                <LuxeDatePicker value={pmtDatum} onChange={setPmtDatum} />
                              </div>
                              <div>
                                <label className={flowLabelClass}>Locatie screening</label>
                                <Input
                                  value={pmtLocatie}
                                  onChange={e => setPmtLocatie(e.target.value)}
                                  placeholder="Bijv. Schiphol Zuidoost"
                                  className={flowInputClass}
                                />
                              </div>
                              <div>
                                <label className={flowLabelClass}>Seal-nummer</label>
                                <Input
                                  value={pmtSeal}
                                  onChange={e => setPmtSeal(e.target.value)}
                                  placeholder="Optioneel"
                                  className={flowInputClass}
                                />
                              </div>
                              <div>
                                <label className={flowLabelClass}>Keuze bepaald door klant</label>
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={pmtByCustomer}
                                  onClick={() => setPmtByCustomer(!pmtByCustomer)}
                                  className={cn(
                                    "inline-flex min-h-14 w-full min-w-0 items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm font-medium transition",
                                    pmtByCustomer
                                      ? "border-[hsl(var(--gold)_/_0.35)] bg-[hsl(var(--gold-soft)_/_0.28)] text-[hsl(var(--gold-deep))]"
                                      : "border-border/70 bg-white text-muted-foreground",
                                  )}
                                >
                                  <span className="min-w-0 text-left leading-snug">{pmtByCustomer ? "Bevestigd door klant" : "Niet bevestigd"}</span>
                                  <span className={cn(
                                    "relative h-6 w-11 shrink-0 rounded-full transition",
                                    pmtByCustomer ? "bg-[hsl(var(--gold))]" : "bg-border",
                                  )}>
                                    <span className={cn(
                                      "pointer-events-none absolute left-0.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow-sm transition-transform",
                                      pmtByCustomer ? "translate-x-5" : "translate-x-0",
                                    )} />
                                  </span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mt-5 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setCargoManualBack(true);
                        setCargoActiveQuestion(3);
                      }}
                      className="inline-flex items-center justify-center rounded-full border border-[hsl(var(--gold)_/_0.18)] bg-white px-4 py-2 text-sm font-medium text-muted-foreground transition hover:bg-[hsl(var(--gold-soft)_/_0.24)] hover:text-foreground"
                    >
                      Vorige vraag
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setWizardStep("financial");
                      }}
                      className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--gold-deep))] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_16px_36px_-24px_hsl(var(--gold-deep)_/_0.85)] transition hover:bg-[hsl(var(--gold))] hover:text-[#17130b]"
                    >
                      Bereken tarief
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}

              {false && !missingQuantity && !missingWeight && (
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-xs min-w-[900px]">
                  <thead>
                    <tr className="border-b border-border/60 text-muted-foreground">
                      <th className={cn("text-left font-semibold py-2 pr-2 w-[80px]", requiredTextClass(missingQuantity))}>Aantal eenheden <span className="text-red-600">*</span></th>
                      <th className="text-left font-semibold py-2 pr-2 w-[120px]">Eenheid <span className="text-red-600">*</span></th>
                      <th className={cn("text-left font-semibold py-2 pr-2 w-[100px]", requiredTextClass(missingWeight))}>Gewicht (kg) <span className="text-red-600">*</span></th>
                      <th className="text-left font-semibold py-2 pr-2 w-[180px]">L × B × H (cm)</th>
                      <th className="text-center font-semibold py-2 pr-2 w-[90px]">Stapelbaar</th>
                      <th className="text-left font-semibold py-2 pr-2 w-[110px]">ADR / UN</th>
                      <th className="text-left font-semibold py-2 pr-2">Omschrijving</th>
                      <th className="w-[36px]" />
                    </tr>
                  </thead>
                  <tbody>
                    {cargoRows.map(row => (
                      <tr key={row.id} className="border-b border-border/40">
                        <td className="py-2 pr-2">
                          <Input
                            type="number"
                            value={row.aantal}
                            onChange={e => { updateCargoRow(row.id, "aantal", e.target.value); clearError("quantity"); }}
                            placeholder="0"
                            className={cn("h-9 text-xs tabular-nums", requiredFieldClass(missingQuantity && !row.aantal))}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <Select value={row.eenheid} onValueChange={v => { updateCargoRow(row.id, "eenheid", v); clearError("unit"); }}>
                            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Pallets">Pallets</SelectItem>
                              <SelectItem value="Colli">Colli</SelectItem>
                              <SelectItem value="Box">Box</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="py-2 pr-2">
                          <Input
                            type="number"
                            value={row.gewicht}
                            onChange={e => { updateCargoRow(row.id, "gewicht", e.target.value); clearError("weight_kg"); }}
                            placeholder="0"
                            className={cn("h-9 text-xs tabular-nums", requiredFieldClass(missingWeight && !row.gewicht))}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <div className="dim-group">
                            <Input type="number" value={row.lengte} onChange={e => updateCargoRow(row.id, "lengte", e.target.value)} className="h-9 text-xs tabular-nums w-[56px] px-1.5" />
                            <span className="dim-sep">×</span>
                            <Input type="number" value={row.breedte} onChange={e => updateCargoRow(row.id, "breedte", e.target.value)} className="h-9 text-xs tabular-nums w-[56px] px-1.5" />
                            <span className="dim-sep">×</span>
                            <Input type="number" value={row.hoogte} onChange={e => updateCargoRow(row.id, "hoogte", e.target.value)} className="h-9 text-xs tabular-nums w-[56px] px-1.5" />
                          </div>
                        </td>
                        <td className="py-2 pr-2 text-center">
                          <label className="toggle">
                            <input
                              type="checkbox"
                              checked={row.stapelbaar}
                              onChange={e => updateCargoRow(row.id, "stapelbaar", e.target.checked)}
                            />
                            <span></span>
                          </label>
                        </td>
                        <td className="py-2 pr-2">
                          <Input
                            value={row.adr}
                            onChange={e => updateCargoRow(row.id, "adr", e.target.value)}
                            placeholder="—"
                            className="h-9 text-xs tabular-nums"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <Input
                            value={row.omschrijving}
                            onChange={e => updateCargoRow(row.id, "omschrijving", e.target.value)}
                            className="h-9 text-xs"
                          />
                        </td>
                        <td className="py-2">
                          <button
                            onClick={() => removeCargoRow(row.id)}
                            className="text-muted-foreground hover:text-destructive transition-colors p-1"
                            aria-label="Regel verwijderen"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              )}

              {false && !missingQuantity && !missingWeight && (
              <>
              <div className="mb-4">
                <button
                  type="button"
                  onClick={addCargoRow}
                  className="text-xs text-[hsl(var(--gold-deep))] hover:text-foreground font-medium inline-flex items-center gap-1 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" /> Lading-regel toevoegen
                </button>
              </div>

              {/* Klep / laadklep toggle */}
              <div className="flex items-center gap-3 mb-4">
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={klepNodig}
                    onChange={e => setKlepNodig(e.target.checked)}
                  />
                  <span></span>
                </label>
                <span className="text-xs font-medium text-foreground">Klep / laadklep nodig</span>
              </div>

              {(errors.quantity || errors.weight_kg || errors.unit) && (
                <div className="text-xs text-red-500 mb-3 space-y-0.5">
                  {errors.quantity && <div>{errors.quantity}</div>}
                  {errors.weight_kg && <div>{errors.weight_kg}</div>}
                  {errors.unit && <div>{errors.unit}</div>}
                </div>
              )}

              {/* Totalen */}
              <div className="cargo-summary">
                <div className="sum-card">
                  <span className="sum-label">Totaal aantal</span>
                  <span className="sum-value">{cargoTotals.totAantal} <span className="sum-unit">{cargoTotals.primaryUnit || "stuks"}</span></span>
                </div>
                <div className="sum-card">
                  <span className="sum-label">Totaal gewicht</span>
                  <span className="sum-value">{cargoTotals.totGewicht.toLocaleString("nl-NL")} <span className="sum-unit">kg</span></span>
                </div>
                <div className="sum-card">
                  <span className="sum-label">Afstand</span>
                  <span className="sum-value">{afstand || "-"} <span className="sum-unit">km</span></span>
                </div>
                <div className="sum-card">
                  <span className="sum-label">Duur</span>
                  <span className="sum-value">{totaleDuur || "-"}</span>
                </div>
              </div>
              </>
              )}
              {renderWizardFooter()}
            </section>

            {/* ══ Chapter V · Luchtvracht-beveiliging (PMT) ══ */}
            {false && showPmt && (
            <section className="card--luxe p-6 relative">
              <span className="card-chapter">V</span>
              <div className="mb-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))] mb-1" style={{ fontFamily: "var(--font-display)" }}>
                  05 · Luchtvracht-beveiliging
                </div>
                <h3 className="section-title">PMT · EDD of X-RAY</h3>
                <p className="text-xs text-muted-foreground mt-1">Verschijnt automatisch bij luchtvracht. Standaard gaat de sectie uit van een vooraf beveiligde zending.</p>
              </div>

              {/* Secure toggle */}
              <div className="flex items-center justify-between p-4 rounded-[0.875rem] bg-[hsl(var(--muted)_/_0.3)] border border-[hsl(var(--border)_/_0.5)] mb-4">
                <div>
                  <div className="text-[0.9375rem] font-semibold" style={{ fontFamily: "var(--font-display)" }}>Zending is vooraf beveiligd (Secure)</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Uitzetten wanneer screening nog moet gebeuren, er wordt dan een PMT-traject gestart.</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={shipmentSecure}
                  onClick={() => setShipmentSecure(!shipmentSecure)}
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                    shipmentSecure ? "bg-[hsl(var(--gold))]" : "bg-[hsl(var(--border))]",
                  )}
                >
                  <span className={cn(
                    "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
                    shipmentSecure ? "translate-x-5" : "translate-x-0",
                  )} />
                </button>
              </div>

              {/* PMT-methode + gegevens (als NIET secure) */}
              {!shipmentSecure && (
                <div className="space-y-4">
                  <div className="text-xs font-medium text-muted-foreground tracking-wider uppercase mb-2">PMT-methode</div>
                  <div className="grid grid-cols-2 gap-2.5">
                    {(["edd", "xray"] as const).map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPmtMethode(m)}
                        className={cn(
                          "flex items-center gap-3 p-4 rounded-xl border transition-all text-left",
                          pmtMethode === m
                            ? "border-[hsl(var(--gold))] bg-[hsl(var(--gold-soft)_/_0.4)] shadow-[0_0_0_1px_hsl(var(--gold)_/_0.3)]"
                            : "border-[hsl(var(--border)_/_0.5)] bg-white hover:border-[hsl(var(--gold)_/_0.4)]",
                        )}
                      >
                        <span className="w-8 h-8 rounded-lg bg-[hsl(var(--gold-soft))] text-[hsl(var(--gold-deep))] inline-flex items-center justify-center shrink-0">
                          {m === "edd" ? (
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11H7a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-2M9 11V7a3 3 0 116 0v4M9 11h6"/></svg>
                          ) : (
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M6 11v6M10 11v6M14 11v6M18 11v6"/></svg>
                          )}
                        </span>
                        <span className="text-sm font-semibold">{m === "edd" ? "EDD · Hondenscan" : "X-RAY · Röntgenscan"}</span>
                      </button>
                    ))}
                  </div>

                  {pmtMethode && (
                    <div className="pt-2 space-y-4">
                      <div className="text-xs font-medium text-muted-foreground tracking-wider uppercase">PMT-gegevens voor RCS-verklaring</div>
                      <div className="grid grid-cols-2 gap-x-5 gap-y-4">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground block mb-1.5">Operator / screeningsbedrijf</label>
                          <Input value={pmtOperator} onChange={e => setPmtOperator(e.target.value)} placeholder="Bv. Schiphol Cargo Security BV" className="h-9 text-sm" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground block mb-1.5">PMT-referentienummer</label>
                          <Input value={pmtReferentie} onChange={e => setPmtReferentie(e.target.value)} placeholder="PMT-2026-…" className="h-9 text-sm tabular-nums" style={{ fontFamily: "var(--font-display)" }} />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground block mb-1.5">Datum / tijd screening</label>
                          <LuxeDatePicker value={pmtDatum} onChange={setPmtDatum} />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground block mb-1.5">Locatie screening</label>
                          <Input value={pmtLocatie} onChange={e => setPmtLocatie(e.target.value)} placeholder="Bv. Schiphol Zuidoost, Gebouw 4" className="h-9 text-sm" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground block mb-1.5">Seal-nummer (na screening)</label>
                          <Input value={pmtSeal} onChange={e => setPmtSeal(e.target.value)} placeholder="Optioneel, wordt later ingevuld" className="h-9 text-sm tabular-nums" style={{ fontFamily: "var(--font-display)" }} />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground block mb-1.5">PMT-keuze bepaald door klant</label>
                          <div className="flex items-center gap-3 h-[42px]">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={pmtByCustomer}
                              onClick={() => setPmtByCustomer(!pmtByCustomer)}
                              className={cn(
                                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                                pmtByCustomer ? "bg-[hsl(var(--gold))]" : "bg-[hsl(var(--border))]",
                              )}
                            >
                              <span className={cn(
                                "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
                                pmtByCustomer ? "translate-x-5" : "translate-x-0",
                              )} />
                            </button>
                            <span className="text-[0.8125rem] text-muted-foreground">{pmtByCustomer ? "Bevestigd door klant" : "Niet bevestigd"}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
            )}

            {/* ═��� Chapter VI · Info volgt van klant ══ */}
            {false && (
            <section className="card--luxe p-6 relative" style={{ background: "linear-gradient(135deg, hsl(var(--card)) 0%, hsl(45 60% 96%) 100%)" }}>
              <span className="card-chapter">VI</span>
              <div className="mb-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))] mb-1" style={{ fontFamily: "var(--font-display)" }}>
                  06 · Info volgt nog
                </div>
                <h3 className="section-title">Info volgt nog van klant <span className="text-[11px] font-normal text-muted-foreground">(optioneel, blokkeert inplannen niet)</span></h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Aangevinkte velden komen op de rappellijst. T-4u vóór pickup stuurt het systeem een herinnering, T-1u escalatie naar planner.
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-2">
                {TRACKABLE_FIELDS.map(f => (
                  <label key={f.name} className="flex items-center gap-2 text-xs cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={!!infoFollows[f.name]}
                      onChange={() => toggleInfoFollow(f.name)}
                      className="h-3.5 w-3.5 rounded border-border accent-amber-600"
                    />
                    <span>{f.label}</span>
                  </label>
                ))}
              </div>
              {Object.values(infoFollows).some(Boolean) && (
                <div className="mt-4 pt-4 border-t border-amber-200/60 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] text-muted-foreground font-medium block mb-1">Contactpersoon die levert</label>
                    <Input
                      value={infoContactName}
                      onChange={e => setInfoContactName(e.target.value)}
                      placeholder="Naam"
                      className="h-9 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground font-medium block mb-1">E-mail voor herinneringen</label>
                    <Input
                      type="email"
                      value={infoContactEmail}
                      onChange={e => setInfoContactEmail(e.target.value)}
                      placeholder="klant@voorbeeld.nl"
                      className="h-9 text-xs"
                    />
                  </div>
                </div>
              )}
              {renderWizardFooter()}
            </section>
            )}

            </>
            )}

            {wizardStep === "financial" && (
              <section className={uberFlowShellClass}>
                {renderUberStepHeader("04 · Financieel", "Controleer het tarief", "Dezelfde tariefmotor als productie, direct na transport.")}

                <div className="mb-5 space-y-3">
                  {renderCollapsedAnswer("Klant", clientName || "Nog geen klant", () => {
                    setWizardStep("intake");
                    setIntakeManualBack(true);
                    setIntakeActiveQuestion(1);
                  })}
                  {renderCollapsedAnswer("Route", routeLocationSummary || `${pickupLine?.locatie || "Ophaaladres"} -> ${deliveryLine?.locatie || "Afleveradres"}`, () => {
                    setWizardStep("route");
                    setRouteManualBack(true);
                    setRouteActiveQuestion(missingPickupAddress ? 1 : missingDeliveryAddress ? 2 : missingPickupTimeWindow ? 3 : 4);
                  })}
                  {renderCollapsedAnswer("Transport", `${cargoTotals.totAantal || 0} ${cargoTotals.primaryUnit || "eenheden"} · ${cargoTotals.totGewicht || 0} kg · ${transportType || suggestedTransportType || "transport volgt"}`, () => {
                    setWizardStep("cargo");
                    setCargoManualBack(true);
                    setCargoActiveQuestion(4);
                  })}
                  {showPmt && renderCollapsedAnswer("Security", pmtLabel, () => {
                    setWizardStep("cargo");
                    setCargoManualBack(true);
                    setCargoActiveQuestion(4);
                  })}
                </div>

                <div className={cn(conversationalCardClass(0), "mb-4 overflow-hidden")}>
                  {renderQuestionPrompt(
                    {
                      step: "Tarief",
                      title: "Klopt het financiele voorstel?",
                      hint: "Controleer tarief, toeslagen en eventuele afwijking voordat je naar de eindcontrole gaat.",
                    },
                    pricingPayload.cents != null,
                    true,
                  )}
                  <div className="-mx-6 -mb-6 md:-mx-9 md:-mb-9">
                    {renderProductionFinancialTab()}
                  </div>
                </div>

                {renderWizardFooter()}
              </section>
            )}

            {wizardStep === "review" && (
              <section className={uberFlowShellClass}>
                {renderUberStepHeader("05 · Controle", "Klaar om te plannen?", "Laatste check op opdrachtgever, route, lading en plannerregels.")}
                {false && <span className="card-chapter">IV</span>}
                {false && <div className="mb-5 flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))] mb-1" style={{ fontFamily: "var(--font-display)" }}>
                      04 · Controle
                    </div>
                    <h3 className="section-title">Order klaarzetten voor planning</h3>
                    <p className="text-xs text-muted-foreground mt-1">Laatste check op klant, route, lading en plannerregels.</p>
                  </div>
                  <div className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium",
                    wizardMissing.length === 0
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-amber-200 bg-amber-50 text-amber-800",
                  )}>
                    {wizardMissing.length === 0 ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleAlert className="h-3.5 w-3.5" />}
                    {wizardMissing.length === 0 ? "Compleet" : `${wizardMissing.length} aandachtspunten`}
                  </div>
                </div>}

                <div className="mb-5 space-y-3">
                  {renderCollapsedAnswer("Klant", clientName || "Nog geen klant", () => {
                    setWizardStep("intake");
                    setIntakeManualBack(true);
                    setIntakeActiveQuestion(1);
                  })}
                  {renderCollapsedAnswer("Route", routeLocationSummary || `${pickupLine?.locatie || "Ophaaladres"} -> ${deliveryLine?.locatie || "Afleveradres"}`, () => {
                    setWizardStep("route");
                    setRouteManualBack(true);
                    setRouteActiveQuestion(missingPickupAddress ? 1 : missingDeliveryAddress ? 2 : missingPickupTimeWindow ? 3 : 4);
                  })}
                  {renderCollapsedAnswer("Lading", `${cargoTotals.totAantal || 0} ${cargoTotals.primaryUnit || "eenheden"} · ${cargoTotals.totGewicht || 0} kg`, () => {
                    setWizardStep("cargo");
                    setCargoManualBack(true);
                    setCargoActiveQuestion(missingQuantity ? 1 : !cargoHasDimensions ? 2 : missingWeight ? 3 : 4);
                  })}
                  {showPmt && renderCollapsedAnswer("Security", pmtLabel, () => {
                    setWizardStep("cargo");
                    setCargoManualBack(true);
                    setCargoActiveQuestion(4);
                  })}
                  {renderCollapsedAnswer("Financieel", pricingLabel, () => setWizardStep("financial"))}
                </div>

                {reviewActiveQuestion > 1 && renderCollapsedAnswer(
                  "Referentie",
                  klantReferentie.trim() || "Geen klantreferentie",
                  () => setReviewActiveQuestion(1),
                )}

                {false && reviewActiveQuestion > 2 && renderCollapsedAnswer(
                  "Planner",
                  referentie.trim() || "Geen planner-opmerking",
                  () => setReviewActiveQuestion(2),
                )}

                {reviewActiveQuestion === 1 && (
                  <div className={cn(conversationalCardClass(0), "mb-4")}>
                    {renderQuestionPrompt(
                      {
                        step: "Referentie",
                        title: "Welke referentie hoort bij deze order?",
                        hint: "Optioneel. Vul een PO-nummer in en druk Enter, of sla deze vraag over.",
                      },
                      Boolean(klantReferentie.trim()),
                      true,
                    )}
                    <label className={flowLabelClass}>Klant-referentie</label>
                    <Input
                      value={klantReferentie}
                      onChange={e => setKlantReferentie(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          setReviewActiveQuestion(2);
                        }
                      }}
                      placeholder="PO-nummer of bestelreferentie"
                      className={flowInputClass}
                    />
                    <div className="mt-4 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setReviewActiveQuestion(2)}
                        className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--gold-deep))] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[hsl(var(--gold))] hover:text-[#17130b]"
                      >
                        {klantReferentie.trim() ? "Gebruik referentie" : "Geen referentie"}
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}

                {reviewActiveQuestion === 2 && (
                  <div className={cn(conversationalCardClass(0), "mb-4")}>
                    {renderQuestionPrompt(
                      {
                        step: "Planner",
                        title: "Moet de planner nog iets weten?",
                        hint: "Optioneel. Laat leeg als de rit direct ingepland kan worden.",
                      },
                      Boolean(referentie.trim()),
                      true,
                    )}
                    <label className={flowLabelClass}>Opmerking voor planner</label>
                    <Textarea
                      value={referentie}
                      onChange={e => setReferentie(e.target.value)}
                      rows={3}
                      placeholder="Bijzonderheden, instructies..."
                      className="min-h-28 resize-none rounded-2xl border-border/70 bg-white px-4 py-3 text-base shadow-[inset_0_1px_0_hsl(var(--foreground)_/_0.04)] transition focus-visible:border-[hsl(var(--gold)_/_0.45)] focus-visible:ring-4 focus-visible:ring-[hsl(var(--gold)_/_0.14)]"
                    />
                    {false && <div className="mt-4 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setReviewActiveQuestion(3)}
                        className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--gold-deep))] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[hsl(var(--gold))] hover:text-[#17130b]"
                      >
                        Controleer tarief
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>}
                  </div>
                )}

                {false && reviewActiveQuestion === 3 && (
                  <div className={cn(conversationalCardClass(0), "mb-4 overflow-hidden")}>
                    {renderQuestionPrompt(
                      {
                        step: "Financieel",
                        title: "Klopt het financiele voorstel?",
                        hint: "Gebruik de tariefmotor of vul een afwijkend tarief in. Dit blijft gekoppeld aan dezelfde order.",
                      },
                      pricingPayload.cents != null,
                      true,
                    )}
                    <div className="-mx-6 -mb-6 md:-mx-9 md:-mb-9">
                      {renderProductionFinancialTab()}
                    </div>
                  </div>
                )}

                {false && <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                  <div className="rounded-lg border border-border/60 bg-white p-4">
                    <div className="text-sm font-semibold">Samenvatting</div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {plannerSummary.map((item) => (
                        <div key={item.label} className="rounded-lg border border-border/50 bg-muted/20 px-4 py-3">
                          <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{item.label}</div>
                          <div className="mt-1 text-sm font-medium">{item.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-lg border border-border/60 bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold">Route</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {routeLocationSummary || `${pickupLine?.locatie || "Ophaaladres ontbreekt"} -> ${deliveryLine?.locatie || "Afleveradres ontbreekt"}`}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setWizardStep("route")}
                          className="rounded-md border border-border/60 px-3 py-1.5 text-xs font-medium hover:bg-muted/50"
                        >
                          Bewerken
                        </button>
                      </div>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold">Lading & planning</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {cargoTotals.totAantal || 0} {cargoTotals.primaryUnit || "eenheden"} · {cargoTotals.totGewicht || 0} kg · {voertuigtype || suggestedVehicleType || "voertuig volgt"}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setWizardStep("cargo")}
                          className="rounded-md border border-border/60 px-3 py-1.5 text-xs font-medium hover:bg-muted/50"
                        >
                          Bewerken
                        </button>
                      </div>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
                      <div className="text-sm font-semibold">Nog aan te vullen</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {wizardMissing.length > 0 ? wizardMissing.map((item) => (
                          <span key={item} className="rounded-full border border-border/60 bg-white px-3 py-1 text-[11px]">
                            {wizardMissingLabel[item] ?? item}
                          </span>
                        )) : (
                          <span className="text-xs text-emerald-700">Geen open basisvelden.</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>}
                {renderWizardFooter()}
              </section>
            )}

            {false && (
            <section className="-mt-5 rounded-b-2xl border border-t-0 border-border/60 bg-card px-6 py-4 shadow-[0_12px_28px_-24px_hsl(var(--foreground)_/_0.45)]">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">
                    {wizardStep === "intake" && "Vul opdrachtgever en orderreferentie in"}
                    {wizardStep === "route" && "Werk stops, adressen en tijdvensters bij"}
                    {wizardStep === "cargo" && "Vul lading, voertuig en aanvullende regels aan"}
                    {wizardStep === "review" && "Controleer of de order klaar is om aan te maken"}
                  </div>
                  <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
                    {wizardMissing.length > 0
                      ? `Er missen nog ${wizardMissing.join(", ")}.`
                      : "De basis is compleet. Je kunt nu opslaan of direct aanmaken."}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={goToPreviousWizardStep}
                    disabled={wizardStep === "intake"}
                    className="inline-flex items-center justify-center rounded-xl border border-border/60 bg-white px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Vorige stap
                  </button>
                  {wizardStep !== "review" ? (
                    <button
                      type="button"
                      onClick={() => {
                        goToNextWizardStep();
                      }}
                      className="inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--gold-deep))] px-4 py-2 text-sm font-medium text-white transition hover:opacity-95"
                    >
                      {wizardNextActionLabel}
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSave(true)}
                      disabled={saving}
                      className="inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--gold-deep))] px-4 py-2 text-sm font-medium text-white transition hover:opacity-95 disabled:opacity-50"
                    >
                      Order gereedmelden
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </section>
            )}
            </div>
            {renderOrderPreview()}
          </div>
        )}

        {mainTab === "financieel" && (
          renderProductionFinancialTab()
        )}

        {mainTab === "vrachtdossier" && (
          <div className="max-w-[1320px] mx-auto px-6 pt-4 pb-8 space-y-5">
            <section className="card--luxe p-6 relative">
              <span className="card-chapter">I</span>
              <div className="mb-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))] mb-1" style={{ fontFamily: "var(--font-display)" }}>
                  01 · Vrachtoverzicht
                </div>
                <h3 className="section-title">Samenvatting van deze order</h3>
                <p className="text-xs text-muted-foreground mt-1">Read-only preview van de ingevoerde vracht- en ladingregels.</p>
              </div>

              {freightLines.filter(l => l.locatie).length === 0 && cargoRows.every(r => !r.aantal && !r.gewicht) ? (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  Geen vrachtgegevens ingevoerd. Ga naar Algemeen om vracht- en ladingregels toe te voegen.
                </p>
              ) : (
                <div className="space-y-5">
                  {freightLines.filter(l => l.locatie).length > 0 && (
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-2">Vrachtplanning</div>
                      <div className="overflow-x-auto rounded-lg border border-border/60">
                        <table className="w-full text-xs min-w-[560px]">
                          <thead>
                            <tr className="bg-muted/30 border-b border-border/60">
                              <th className="px-3 py-2 text-left font-semibold">Activiteit</th>
                              <th className="px-3 py-2 text-left font-semibold">Locatie</th>
                              <th className="px-3 py-2 text-left font-semibold">Datum</th>
                              <th className="px-3 py-2 text-left font-semibold">Tijd</th>
                              <th className="px-3 py-2 text-left font-semibold">Referentie</th>
                            </tr>
                          </thead>
                          <tbody>
                            {freightLines.filter(l => l.locatie).map(l => (
                              <tr key={l.id} className="border-b border-border/40">
                                <td className="px-3 py-2">{l.activiteit}</td>
                                <td className="px-3 py-2">{l.locatie}</td>
                                <td className="px-3 py-2">{l.datum}</td>
                                <td className="px-3 py-2">{[l.tijd, l.tijdTot].filter(Boolean).join(" → ")}</td>
                                <td className="px-3 py-2">{l.referentie}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {cargoRows.some(r => r.aantal || r.gewicht) && (
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-2">Lading</div>
                      <div className="overflow-x-auto rounded-lg border border-border/60">
                        <table className="w-full text-xs min-w-[560px]">
                          <thead>
                            <tr className="bg-muted/30 border-b border-border/60">
                              <th className="px-3 py-2 text-left font-semibold">Aantal</th>
                              <th className="px-3 py-2 text-left font-semibold">Eenheid</th>
                              <th className="px-3 py-2 text-left font-semibold">Gewicht</th>
                              <th className="px-3 py-2 text-left font-semibold">L × B × H</th>
                              <th className="px-3 py-2 text-left font-semibold">Omschrijving</th>
                            </tr>
                          </thead>
                          <tbody>
                            {cargoRows.filter(r => r.aantal || r.gewicht).map(r => (
                              <tr key={r.id} className="border-b border-border/40">
                                <td className="px-3 py-2 tabular-nums">{r.aantal}</td>
                                <td className="px-3 py-2">{r.eenheid}</td>
                                <td className="px-3 py-2 tabular-nums">{r.gewicht} kg</td>
                                <td className="px-3 py-2 tabular-nums">{[r.lengte, r.breedte, r.hoogte].filter(Boolean).join(" × ")}</td>
                                <td className="px-3 py-2">{r.omschrijving}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="card--luxe p-6 relative">
              <span className="card-chapter">II</span>
              <div className="mb-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))] mb-1" style={{ fontFamily: "var(--font-display)" }}>
                  02 · Bijlagen
                </div>
                <h3 className="section-title">Documenten &amp; scans</h3>
              </div>
              <p className="text-xs text-muted-foreground">Bijlagen worden beschikbaar na opslaan.</p>
            </section>
          </div>
        )}

      </div>

      <AlertDialog
        open={showUnsavedDialog}
        onOpenChange={(o) => !o && setShowUnsavedDialog(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Wijzigingen weggooien?</AlertDialogTitle>
            <AlertDialogDescription>
              Je hebt wijzigingen die nog niet zijn opgeslagen. Verlaat je de pagina nu,
              dan gaan ze verloren.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Doorgaan met bewerken</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                skipDirtyGuardRef.current = true;
                setShowUnsavedDialog(false);
                navigate("/orders");
              }}
            >
              Wijzigingen weggooien
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default NewOrder;


