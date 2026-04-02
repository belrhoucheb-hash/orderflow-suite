import type { OrderDraft, FormState, ClientRecord } from "./types";

export function orderToForm(order: OrderDraft): FormState {
  return {
    transportType: order.transport_type?.toLowerCase().replace("_", "-") || "direct",
    pickupAddress: order.pickup_address || "",
    deliveryAddress: order.delivery_address || "",
    quantity: order.quantity || 0,
    unit: order.unit || "Pallets",
    weight: order.weight_kg ? order.weight_kg.toString() : "",
    dimensions: order.dimensions || "",
    requirements: normaliseRequirements(order.requirements || []),
    perUnit: order.is_weight_per_unit,
    internalNote: order.internal_note || "",
    fieldSources: {},
    fieldConfidence: order.field_confidence || {},
  };
}

export const REQUIREMENT_ALIASES: Record<string, string> = {
  klep: "Laadklep", laadklep: "Laadklep",
  koeling: "Koeling", koel: "Koeling", gekoeld: "Koeling",
  adr: "ADR", gevaarlijk: "ADR",
  douane: "Douane", customs: "Douane",
};

export function normaliseRequirements(reqs: string[]): string[] {
  return reqs.map(r => REQUIREMENT_ALIASES[r.toLowerCase()] || r);
}

export const TEST_SCENARIOS = [
  {
    label: "Bakker Bouwmaterialen",
    client: "Bakker Bouwmaterialen",
    from: "kees@bakkerbouw.nl",
    subject: "Levering bouwmaterialen Strijp-S",
    email: "Beste,\n\nGraag 8 pallets bouwmaterialen bezorgen op de bouwplaats Strijp-S. Laadklep is nodig want er is geen dock.\n\nMvg,\nKees Bakker",
  },
  {
    label: "Van der Berg Logistics",
    client: "Van der Berg Logistics",
    from: "jan@vdberg-logistics.nl",
    subject: "RE: Pendelrit Rotterdam - Nieuwegein (WIJZIGING)",
    email: "Beste dispatch,\n\nBetreft onze pendelrit van morgen. Het aantal pallets is gewijzigd van 10 naar 14 Europallets.\nOphalen: Transportweg 12, Rotterdam\nLeveren: Industrieweg 50, Nieuwegein\nGewicht: 4000 kg totaal.\n\nGraag bevestiging.\n\nMet vriendelijke groet,\nJan van der Berg",
  },
  {
    label: "DHL Express NL",
    client: "DHL Express NL",
    from: "ops@dhl.nl",
    subject: "Bevestiging aankomst hub Utrecht",
    email: "Geachte,\n\nHierbij bevestigen wij de aankomst van zending #NL-2024-8837 bij hub Utrecht.\n3 colli, totaal 120 kg.\n\nMet vriendelijke groet,\nDHL Operations",
  },
  {
    label: "Schenker NL",
    client: "Schenker NL",
    from: "planning@schenker.nl",
    subject: "Status wijziging: Rit 442-A",
    email: "Beste planning,\n\nDe chauffeur is zojuist vertrokken bij het losadres in Antwerpen. ETA retour depot: 16:30.\n\nRit 442-A is hiermee afgerond.\n\nMet vriendelijke groet,\nDB Schenker Planning",
  },
  {
    label: "Fresh Food Transport",
    client: "Fresh Food Transport BV",
    from: "dispatch@freshfood.nl",
    subject: "URGENT: Koeltransport Amsterdam - Brussel",
    email: "Beste,\n\nWij hebben dringend een koeltransport nodig.\n\n- Ophalen: Distributiecentrum Aalsmeer, Legmeerdijk 313\n- Leveren: Carrefour DC Brussel, Industriestraat 45\n- 20 pallets verse groenten, temperatuur max 4°C\n- Totaal gewicht: 6.200 kg\n- Afmetingen per pallet: 120x80x160 cm\n- Moet morgen voor 06:00 geleverd zijn\n\nRef: FF-2024-0891\n\nMet spoed,\nTeam Fresh Food Transport",
  },
  {
    label: "Kuehne+Nagel",
    client: "Kuehne+Nagel BV",
    from: "sea.freight@kuehne-nagel.nl",
    subject: "Ophaalverzoek container MSKU-4472891",
    email: "Geachte,\n\nGraag ophalen van 1x 40ft container bij ECT Delta Terminal, Maasvlakte Rotterdam.\nContainer nr: MSKU-4472891\nGewicht: 22.000 kg\nBestemming: Warehouse Tilburg, Kraaiven 25\n\nDouane documenten zijn bijgevoegd. ADR niet van toepassing.\n\nMet vriendelijke groet,\nSea Freight Operations\nKuehne+Nagel",
  },
  {
    label: "Incomplete aanvraag",
    client: "Onbekend",
    from: "info@bedrijf.nl",
    subject: "Transport nodig",
    email: "Hallo,\n\nWij hebben transport nodig voor volgende week. Kunt u ons bellen?\n\nGroeten",
  },
];

export const FIELD_LABELS: Record<string, string> = {
  weight_kg: "Gewicht", quantity: "Aantal", pickup_address: "Ophaaladres",
  delivery_address: "Afleveradres", requirements: "Vereisten", unit: "Eenheid",
  dimensions: "Afmetingen", transport_type: "Transport type", client_name: "Klantnaam",
};

export const DUPLICATE_WINDOW_MINUTES = 60;

export function formatTime(dateStr: string | null) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
}

export function formatDate(dateStr: string | null) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return formatTime(dateStr);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Gisteren";
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

export function getDeadlineInfo(receivedAt: string | null): { label: string; urgency: "red" | "amber" | "green" | "neutral"; minutesLeft: number } {
  if (!receivedAt) return { label: "", urgency: "neutral", minutesLeft: Infinity };
  const deadline = new Date(new Date(receivedAt).getTime() + 4 * 60 * 60 * 1000);
  const diffMin = Math.floor((deadline.getTime() - Date.now()) / 60000);
  if (diffMin <= 0) return { label: "Urgent", urgency: "red", minutesLeft: 0 };
  if (diffMin < 60) return { label: `${diffMin}m`, urgency: "red", minutesLeft: diffMin };
  const hrs = Math.floor(diffMin / 60), mins = diffMin % 60;
  if (diffMin < 120) return { label: `${hrs}u ${mins}m`, urgency: "amber", minutesLeft: diffMin };
  return { label: `${hrs}u ${mins}m`, urgency: "green", minutesLeft: diffMin };
}

function normalizeStr(s: string | null): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

export function findDuplicates(orders: OrderDraft[]): Map<string, string[]> {
  const dupeMap = new Map<string, string[]>();
  for (let i = 0; i < orders.length; i++) {
    for (let j = i + 1; j < orders.length; j++) {
      const a = orders[i], b = orders[j];
      if (!normalizeStr(a.client_name) || normalizeStr(a.client_name) !== normalizeStr(b.client_name)) continue;
      if (!normalizeStr(a.delivery_address) || normalizeStr(a.delivery_address) !== normalizeStr(b.delivery_address)) continue;
      if (a.received_at && b.received_at && Math.abs(new Date(a.received_at).getTime() - new Date(b.received_at).getTime()) / 60000 > DUPLICATE_WINDOW_MINUTES) continue;
      if (!dupeMap.has(a.id)) dupeMap.set(a.id, []);
      if (!dupeMap.has(b.id)) dupeMap.set(b.id, []);
      dupeMap.get(a.id)!.push(`#${b.order_number}`);
      dupeMap.get(b.id)!.push(`#${a.order_number}`);
    }
  }
  return dupeMap;
}

export function getCapacityWarning(vehicles: { status?: string }[]): { hasWarning: boolean; message: string } {
  if (vehicles.length === 0) return { hasWarning: false, message: "" };
  const freeCount = vehicles.length - vehicles.filter(v => v.status !== "beschikbaar").length;
  if (freeCount === 0) return { hasWarning: true, message: "Geen capaciteit beschikbaar" };
  if (freeCount === 1) return { hasWarning: true, message: `Slechts ${freeCount} voertuig beschikbaar` };
  return { hasWarning: false, message: "" };
}

export function isAddressIncomplete(address: string): boolean {
  if (!address || address.trim().length < 5) return true;
  return !/\d/.test(address) && !/\d{4}\s?[A-Za-z]{2}/.test(address);
}

export function tryEnrichAddress(address: string, clients: ClientRecord[]): { enriched: string; matchedClient: string | null } {
  if (!address || clients.length === 0) return { enriched: address, matchedClient: null };
  const lowerAddr = address.toLowerCase();
  const match = clients.find(c => c.name.toLowerCase().split(/\s+/).some(part => part.length > 2 && lowerAddr.includes(part)));
  if (!match || !match.address) return { enriched: address, matchedClient: null };
  if (/\d{4}\s?[A-Za-z]{2}/.test(address)) return { enriched: address, matchedClient: null };
  return { enriched: [match.address, match.zipcode, match.city].filter(Boolean).join(", "), matchedClient: match.name };
}

export function getFormErrors(f: FormState | undefined): boolean {
  return !f?.pickupAddress || !f?.deliveryAddress || !f?.quantity || !f?.weight;
}

export const ALL_FIELDS = [
  { key: "pickupAddress", label: "Ophaaladres", required: true },
  { key: "deliveryAddress", label: "Afleveradres", required: true },
  { key: "quantity", label: "Aantal", required: true },
  { key: "weight", label: "Gewicht", required: true },
  { key: "unit", label: "Eenheid", required: false },
  { key: "transportType", label: "Type", required: false },
  { key: "dimensions", label: "Afmetingen", required: false },
] as const;

export function getFilledCount(f: FormState | undefined): number {
  if (!f) return 0;
  let count = 0;
  if (f.pickupAddress) count++;
  if (f.deliveryAddress) count++;
  if (f.quantity) count++;
  if (f.weight) count++;
  if (f.unit) count++;
  if (f.transportType) count++;
  if (f.dimensions) count++;
  return count;
}

export function getTotalFields(): number {
  return ALL_FIELDS.length;
}

export function getRequiredFilledCount(f: FormState | undefined): number {
  if (!f) return 0;
  let count = 0;
  if (f.pickupAddress) count++;
  if (f.deliveryAddress) count++;
  if (f.quantity) count++;
  if (f.weight) count++;
  return count;
}
