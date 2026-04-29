import { getOrderRouteRuleIssues, type OrderRouteLine } from "@/lib/validation/orderRouteRules";

export const ORDER_VALIDATION_ENGINE_VERSION = "order-readiness-v1";
export const ORDER_PRICING_ENGINE_VERSION = "pricing-v2-2026-04";

export type OrderDraftStatus = "DRAFT_INCOMPLETE" | "READY_FOR_PLANNING" | "PLANNED";
export type PersistedOrderStatus = "DRAFT" | "PENDING" | "NEEDS_REVIEW" | "PLANNED";
export type ReadinessSeverity = "BLOCKER" | "WARNING" | "INFO";
export type ReadinessTarget =
  | "client"
  | "pickup"
  | "delivery"
  | "quantity"
  | "weight"
  | "time"
  | "transport"
  | "security"
  | "pricing";

export interface OrderDraftAddress {
  display: string;
  street?: string | null;
  zipcode?: string | null;
  city?: string | null;
  lat?: number | null;
  lng?: number | null;
  source?: "google" | "address_book" | "manual" | "system" | null;
}

export interface OrderDraftStop {
  id: string;
  type: "pickup" | "delivery" | "stop";
  label: string;
  sequence: number;
  address: OrderDraftAddress;
  date?: string | null;
  timeFrom?: string | null;
  timeTo?: string | null;
}

export interface OrderDraftCargoLine {
  id: string;
  quantity: number;
  unit: string;
  weightKg: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
}

export interface OrderDraftVehicleCapacity {
  vehicleType?: string | null;
  maxWeightKg?: number | null;
  maxPallets?: number | null;
  maxLengthCm?: number | null;
  maxWidthCm?: number | null;
  maxHeightCm?: number | null;
}

export interface OrderDraftTransport {
  type?: string | null;
  department?: string | null;
  vehicleType?: string | null;
  vehicleCapacity?: OrderDraftVehicleCapacity | null;
  secure?: boolean;
  pmtMethod?: string | null;
  manualOverrides?: {
    transportType?: boolean;
    department?: boolean;
    vehicleType?: boolean;
  };
}

export interface OrderDraftPricing {
  totalCents?: number | null;
}

export interface OrderDraft {
  id?: string | null;
  clientId?: string | null;
  clientName?: string | null;
  contactName?: string | null;
  stops: OrderDraftStop[];
  cargoLines: OrderDraftCargoLine[];
  transport: OrderDraftTransport;
  pricing?: OrderDraftPricing | null;
}

export interface ReadinessIssue {
  id: string;
  key: string;
  label: string;
  detail: string;
  severity: ReadinessSeverity;
  target: ReadinessTarget;
}

export interface OrderReadinessResult {
  status: OrderDraftStatus;
  persistedStatus: PersistedOrderStatus;
  blockers: ReadinessIssue[];
  warnings: ReadinessIssue[];
  infos: ReadinessIssue[];
  issues: ReadinessIssue[];
  score: number;
}

function normalizeAddress(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function addressWarning(address: OrderDraftAddress): string | null {
  if (!address.display.trim()) return null;
  if (!address.street || (!address.zipcode && !address.city)) {
    return "Adres is onvolledig: controleer straat, postcode en plaats.";
  }
  if (address.zipcode && address.city && !/\d/.test(address.zipcode)) {
    return "Postcode lijkt niet te kloppen bij de plaats.";
  }
  return null;
}

function buildRouteLines(stops: OrderDraftStop[]): OrderRouteLine[] {
  return stops
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .map((stop) => ({
      id: stop.id,
      activiteit: stop.type === "pickup" ? "Laden" : "Lossen",
      locatie: stop.address.display,
      datum: stop.date,
      tijd: stop.timeFrom,
      tijdTot: stop.timeTo,
    }));
}

function issue(
  severity: ReadinessSeverity,
  key: string,
  label: string,
  detail: string,
  target: ReadinessTarget,
): ReadinessIssue {
  return { id: `${severity.toLowerCase()}-${key}`, key, label, detail, severity, target };
}

function selectedVehicleCapacity(transport: OrderDraftTransport): OrderDraftVehicleCapacity | null {
  if (transport.vehicleCapacity?.vehicleType || transport.vehicleCapacity?.maxWeightKg) {
    return transport.vehicleCapacity;
  }
  const normalized = (transport.vehicleType ?? "").toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("bestel")) {
    return { vehicleType: "Bestelbus", maxWeightKg: 1200, maxPallets: 6, maxLengthCm: 420, maxWidthCm: 180, maxHeightCm: 190 };
  }
  if (normalized.includes("trailer")) {
    return { vehicleType: "Trailer", maxWeightKg: 24000, maxPallets: 33, maxLengthCm: 1360, maxWidthCm: 250, maxHeightCm: 280 };
  }
  if (normalized.includes("vracht")) {
    return { vehicleType: "Vrachtwagen", maxWeightKg: 12000, maxPallets: 18, maxLengthCm: 750, maxWidthCm: 245, maxHeightCm: 260 };
  }
  return null;
}

function cargoTotals(cargoLines: OrderDraftCargoLine[]) {
  return cargoLines.reduce(
    (acc, line) => ({
      quantity: acc.quantity + (Number.isFinite(line.quantity) ? line.quantity : 0),
      weightKg: acc.weightKg + (Number.isFinite(line.weightKg) ? line.weightKg : 0),
      maxLengthCm: Math.max(acc.maxLengthCm, line.lengthCm || 0),
      maxWidthCm: Math.max(acc.maxWidthCm, line.widthCm || 0),
      maxHeightCm: Math.max(acc.maxHeightCm, line.heightCm || 0),
      palletQuantity: acc.palletQuantity + (line.unit.toLowerCase().includes("pallet") ? line.quantity : 0),
    }),
    { quantity: 0, weightKg: 0, maxLengthCm: 0, maxWidthCm: 0, maxHeightCm: 0, palletQuantity: 0 },
  );
}

export function mapDraftStatusToPersisted(status: OrderDraftStatus | string | null | undefined): PersistedOrderStatus {
  const normalized = String(status ?? "").toUpperCase();
  if (normalized === "PLANNED") return "PLANNED";
  if (normalized === "NEEDS_REVIEW") return "NEEDS_REVIEW";
  if (normalized === "READY" || normalized === "READY_FOR_PLANNING") return "PENDING";
  return "DRAFT";
}

export function validateOrderDraft(draft: OrderDraft): OrderReadinessResult {
  const blockers: ReadinessIssue[] = [];
  const warnings: ReadinessIssue[] = [];
  const infos: ReadinessIssue[] = [];

  const sortedStops = draft.stops.slice().sort((a, b) => a.sequence - b.sequence);
  const pickup = sortedStops.find((stop) => stop.type === "pickup");
  const deliveries = sortedStops.filter((stop) => stop.type === "delivery" || stop.type === "stop");
  const firstDelivery = deliveries[0];

  if (!(draft.clientId || (draft.clientName ?? "").trim().length >= 2)) {
    blockers.push(issue("BLOCKER", "klant", "Klant kiezen", "Nodig om de order ready te maken.", "client"));
  }
  if (!pickup?.address.display.trim()) {
    blockers.push(issue("BLOCKER", "ophaaladres", "Ophaaladres kiezen", "Minimaal één pickup is verplicht.", "pickup"));
  }
  if (!firstDelivery?.address.display.trim()) {
    blockers.push(issue("BLOCKER", "afleveradres", "Afleveradres kiezen", "Minimaal één delivery is verplicht.", "delivery"));
  }
  if (pickup?.address.display && firstDelivery?.address.display && normalizeAddress(pickup.address.display) === normalizeAddress(firstDelivery.address.display)) {
    blockers.push(issue("BLOCKER", "adrescontrole", "Ander afleveradres kiezen", "Pickup en delivery mogen niet hetzelfde adres zijn.", "delivery"));
  }
  if (!pickup?.date) {
    blockers.push(issue("BLOCKER", "pickupdatum", "Ophaaldatum kiezen", "Pickupdatum is verplicht voor readiness.", "time"));
  }

  draft.cargoLines.forEach((line, index) => {
    const label = `Ladingregel ${index + 1}`;
    if (!line.unit) {
      blockers.push(issue("BLOCKER", "eenheid", "Eenheid kiezen", `${label}: eenheid is verplicht.`, "quantity"));
    }
    if (!line.quantity || line.quantity <= 0) {
      blockers.push(issue("BLOCKER", "aantal", "Aantal invullen", `${label}: aantal moet groter zijn dan 0.`, "quantity"));
    }
    if (!line.weightKg || line.weightKg <= 0) {
      blockers.push(issue("BLOCKER", "gewicht", "Gewicht invullen", `${label}: gewicht moet groter zijn dan 0.`, "weight"));
    }
  });
  if (draft.cargoLines.length === 0) {
    blockers.push(issue("BLOCKER", "ladingregel", "Ladingregel toevoegen", "Minimaal één ladingregel is verplicht.", "quantity"));
  }

  getOrderRouteRuleIssues(buildRouteLines(sortedStops)).forEach((routeIssue) => {
    blockers.push(issue(
      "BLOCKER",
      routeIssue.key,
      routeIssue.key === "route_duplicate" ? "Adresvolgorde corrigeren" : "Tijdvolgorde corrigeren",
      routeIssue.message,
      routeIssue.key === "route_duplicate" ? "delivery" : "time",
    ));
  });

  const totals = cargoTotals(draft.cargoLines);
  const capacity = selectedVehicleCapacity(draft.transport);
  if (capacity && draft.transport.vehicleType) {
    const vehicleLabel = capacity.vehicleType || draft.transport.vehicleType;
    if (capacity.maxWeightKg && totals.weightKg > capacity.maxWeightKg) {
      blockers.push(issue("BLOCKER", "voertuig", "Voertuig aanpassen", `Voertuig ongeschikt: ${vehicleLabel} kan maximaal ${capacity.maxWeightKg.toLocaleString("nl-NL")} kg laden.`, "transport"));
    }
    if (capacity.maxPallets && totals.palletQuantity > capacity.maxPallets) {
      blockers.push(issue("BLOCKER", "voertuig", "Voertuig aanpassen", `Voertuig ongeschikt: ${vehicleLabel} heeft maximaal ${capacity.maxPallets} palletplaatsen.`, "transport"));
    }
    if (
      (capacity.maxLengthCm && totals.maxLengthCm > capacity.maxLengthCm) ||
      (capacity.maxWidthCm && totals.maxWidthCm > capacity.maxWidthCm) ||
      (capacity.maxHeightCm && totals.maxHeightCm > capacity.maxHeightCm)
    ) {
      blockers.push(issue("BLOCKER", "voertuig", "Voertuig aanpassen", `Voertuig ongeschikt: afmetingen passen niet globaal in ${vehicleLabel}.`, "transport"));
    }
  }

  if (draft.transport.type === "Luchtvracht" && draft.transport.secure === false && !draft.transport.pmtMethod) {
    blockers.push(issue("BLOCKER", "screening", "EDD/X-RAY kiezen", "Kies EDD of X-RAY als luchtvracht niet Secure is.", "security"));
  }

  sortedStops.forEach((stop) => {
    const warning = addressWarning(stop.address);
    if (warning) {
      warnings.push(issue("WARNING", `adreswaarschuwing-${stop.id}`, `${stop.label} controleren`, warning, stop.type === "pickup" ? "pickup" : "delivery"));
    }
    if (stop.type !== "pickup" && !stop.date) {
      warnings.push(issue("WARNING", `delivery-date-${stop.id}`, `${stop.label} zonder moment`, "Flexibel toegestaan, maar handig voor planning en ETA.", "time"));
    }
  });
  if (!draft.contactName) {
    warnings.push(issue("WARNING", "contactpersoon", "Geen contactpersoon gekoppeld", "Mag door als concept, maar blijft zichtbaar voor planning.", "client"));
  }
  if (draft.pricing?.totalCents == null) {
    warnings.push(issue("WARNING", "tarief", "Tarief nog niet gekoppeld", "Order kan ready zijn, facturatie vraagt later aandacht.", "pricing"));
  }

  if (draft.transport.manualOverrides?.transportType && draft.transport.type) {
    infos.push(issue("INFO", "transport-manual", "Transporttype handmatig ingesteld", `Planner koos ${draft.transport.type}.`, "transport"));
  }
  if (draft.transport.manualOverrides?.vehicleType && draft.transport.vehicleType) {
    infos.push(issue("INFO", "vehicle-manual", "Voertuig handmatig ingesteld", `Planner koos ${draft.transport.vehicleType}.`, "transport"));
  }
  if (draft.transport.manualOverrides?.department && draft.transport.department) {
    infos.push(issue("INFO", "department-manual", "Afdeling handmatig ingesteld", `Planner koos ${draft.transport.department}.`, "transport"));
  }

  const status: OrderDraftStatus = blockers.length > 0 ? "DRAFT_INCOMPLETE" : "READY_FOR_PLANNING";
  const completenessUnits = [
    Boolean(draft.clientId || draft.clientName),
    Boolean(pickup?.address.display),
    Boolean(firstDelivery?.address.display),
    Boolean(pickup?.date),
    totals.quantity > 0,
    totals.weightKg > 0,
    Boolean(draft.cargoLines[0]?.unit),
    blockers.length === 0,
  ];
  const score = Math.round((completenessUnits.filter(Boolean).length / completenessUnits.length) * 100);

  return {
    status,
    persistedStatus: mapDraftStatusToPersisted(status),
    blockers,
    warnings,
    infos,
    issues: [...blockers, ...warnings, ...infos],
    score,
  };
}
