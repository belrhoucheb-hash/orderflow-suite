// Centrale bron voor label- en kleurmappings rond orderstatus.
// Vervangt eerdere duplicaten in Orders.tsx, OrderDetail.tsx,
// useOrders.ts en useShipments.ts.
import type { OrderStatus } from "@/lib/statusTransitions";

// Badge-variant met border, gebruikt door OrderDetail header.
// OPEN is een legacy alias voor PENDING.
export const STATUS_MAP: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "Nieuw", color: "bg-muted text-muted-foreground" },
  PENDING: { label: "In behandeling", color: "bg-amber-100 text-amber-700 border-amber-200" },
  OPEN: { label: "In behandeling", color: "bg-amber-100 text-amber-700 border-amber-200" },
  PLANNED: { label: "Ingepland", color: "bg-violet-100 text-violet-700 border-violet-200" },
  IN_TRANSIT: { label: "Onderweg", color: "bg-primary/10 text-primary border-primary/20" },
  DELIVERED: { label: "Afgeleverd", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  CANCELLED: { label: "Geannuleerd", color: "bg-destructive/10 text-destructive border-destructive/20" },
};

// Labels voor de info-status kolom (compleetheid van orderdata).
export const INFO_STATUS_LABEL: Record<string, string> = {
  COMPLETE: "Compleet",
  AWAITING_INFO: "Openstaand",
  OVERDUE: "Verlopen",
};

// Kleuren voor het prioriteit-bolletje in de orderlijst.
export const priorityDotColors: Record<string, string> = {
  laag: "text-muted-foreground/40",
  normaal: "text-blue-400",
  hoog: "text-amber-500",
  spoed: "text-primary",
};

// Legacy DB-status naar canonieke OrderStatus.
export const legacyStatusMap: Record<string, OrderStatus> = {
  OPEN: "PENDING",
  WAITING: "PENDING",
  CONFIRMED: "PENDING",
};

export function normalizeStatus(dbStatus: string): OrderStatus {
  return (legacyStatusMap[dbStatus] ?? dbStatus) as OrderStatus;
}

// Human-readable labels voor missing_fields keys die vanuit de AI-extractie
// of info-tracking worden gezet. Onbekende keys vallen terug op de key zelf.
const MISSING_FIELD_LABELS: Record<string, string> = {
  pickup_address: "Ophaaladres",
  delivery_address: "Afleveradres",
  quantity: "Aantal",
  weight_kg: "Gewicht",
  weight: "Gewicht",
  unit: "Eenheid",
  mrn_document: "MRN-document",
  mrn: "MRN-document",
  contact_person: "Contactpersoon",
  laadreferentie: "Laadreferentie",
  losreferentie: "Losreferentie",
  pickup_time_window: "Ophaalvenster",
  delivery_time_window: "Afleververster",
  transport_type: "Transporttype",
  dimensions: "Afmetingen",
  department_id: "Afdeling",
  afdeling: "Afdeling",
  requirements: "Vereisten",
};

export interface OrderIncompleteSummary {
  incomplete: boolean;
  fields: string[];
  infoLabel: string | null;
}

/**
 * Bepaalt of een order ontbrekende informatie heeft voor de planning.
 * Bron: missing_fields array (AI-extraction) plus info_status (info-tracking).
 * Accepteert zowel DB-snake_case als UI-camelCase, zodat zowel ruwe
 * Supabase-rijen als gemapte Order-objecten direct bruikbaar zijn.
 */
export function getOrderIncompleteSummary(order: {
  missing_fields?: string[] | null;
  missingFields?: string[] | null;
  info_status?: string | null;
  infoStatus?: string | null;
}): OrderIncompleteSummary {
  const missing = order.missing_fields ?? order.missingFields ?? [];
  const infoStatus = order.info_status ?? order.infoStatus ?? "COMPLETE";
  const infoIncomplete = infoStatus !== "COMPLETE";

  if (missing.length === 0 && !infoIncomplete) {
    return { incomplete: false, fields: [], infoLabel: null };
  }

  const labels = missing.map((f) => MISSING_FIELD_LABELS[f] ?? f);
  const infoLabel = infoIncomplete ? (INFO_STATUS_LABEL[infoStatus] ?? infoStatus) : null;

  return {
    incomplete: true,
    fields: labels,
    infoLabel,
  };
}

export function isOrderIncomplete(order: {
  missing_fields?: string[] | null;
  missingFields?: string[] | null;
  info_status?: string | null;
  infoStatus?: string | null;
}): boolean {
  return getOrderIncompleteSummary(order).incomplete;
}
