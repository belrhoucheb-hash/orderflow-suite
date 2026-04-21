// ─── Traject Router ────────────────────────────────────────────────────────
// Bepaalt via configurable `traject_rules` hoe een klantboeking in één of
// meerdere order-legs gesplitst wordt, en persisteert het resultaat als
// `shipments` + `orders` (één order per leg). Wordt aangeroepen door
// NewOrder-flow zodra de klant een boeking bevestigt.
//
// Matching-logica (zie migratie 20260414100000):
//   * `pickup_address_contains`   – array van substrings; ALLE moeten matchen
//     (we kiezen OR: ≥1 substring match telt als match voor deze conditie)
//   * `delivery_address_contains` – idem
//   * `default: true`             – altijd-match (fallback)
// Meerdere condities op dezelfde rule worden ge-AND'd.
//
// Rules worden gesorteerd op priority ASC (laag = hoger prio). De eerste
// match wint.

import { supabase } from "@/integrations/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────

export interface BookingInput {
  pickup_address: string | null;
  delivery_address: string | null;
  final_delivery_address?: string | null;
  client_id?: string | null;
  client_name?: string | null;
  weight_kg?: number | null;
  quantity?: number | null;
  unit?: string | null;
  transport_type?: string | null;
  afdeling?: string | null;  // department code: 'OPS' | 'EXPORT' | ...
  priority?: string | null;
  requirements?: string[] | null;
  pickup_date?: string | null;
  delivery_date?: string | null;
  pickup_time_window_start?: string | null;
  pickup_time_window_end?: string | null;
  delivery_time_window_start?: string | null;
  delivery_time_window_end?: string | null;
  notes?: string | null;
  price_total_cents?: number | null;
  pricing?: Record<string, unknown> | null;
  // §25 shipment-level velden
  contact_person?: string | null;
  vehicle_type?: string | null;
  client_reference?: string | null;
  mrn_document?: string | null;
  requires_tail_lift?: boolean;
  pmt?: Record<string, unknown> | null;
  cargo?: Record<string, unknown>[] | null;
  // Per-leg detail (doorgesluisd naar orderPayload)
  pickup_date_str?: string | null;
  delivery_date_str?: string | null;
  pickup_reference?: string | null;
  delivery_reference?: string | null;
  pickup_contact?: string | null;
  delivery_contact?: string | null;
  pickup_notes?: string | null;
  delivery_notes?: string | null;
  dimensions?: string | null;
  // Google adres-autocomplete: gesplitste adresvelden + coordinaten
  pickup_street?: string | null;
  pickup_house_number?: string | null;
  pickup_house_number_suffix?: string | null;
  pickup_zipcode?: string | null;
  pickup_city?: string | null;
  pickup_country?: string | null;
  pickup_lat?: number | null;
  pickup_lng?: number | null;
  pickup_coords_manual?: boolean;
  delivery_street?: string | null;
  delivery_house_number?: string | null;
  delivery_house_number_suffix?: string | null;
  delivery_zipcode?: string | null;
  delivery_city?: string | null;
  delivery_country?: string | null;
  delivery_lat?: number | null;
  delivery_lng?: number | null;
  delivery_coords_manual?: boolean;
  [key: string]: unknown;
}

export type LegEndpoint = "pickup" | "delivery" | "hub";

export interface LegTemplate {
  sequence: number;
  from: LegEndpoint;
  to: LegEndpoint;
  department_code: string; // 'OPS' | 'EXPORT' | ...
  leg_role: string;        // 'OPS_PICKUP' | 'EXPORT_LEG' | 'SINGLE' | ...
}

export interface MatchConditions {
  pickup_address_contains?: string[];
  delivery_address_contains?: string[];
  afdeling_equals?: string;
  default?: boolean;
  [key: string]: unknown;
}

export interface TrajectRule {
  id: string;
  tenant_id: string;
  name: string;
  priority: number;
  is_active: boolean;
  match_conditions: MatchConditions;
  legs_template: LegTemplate[];
  created_at?: string;
  updated_at?: string;
}

export interface Shipment {
  id: string;
  tenant_id: string;
  shipment_number?: number | null;
  client_id?: string | null;
  client_name?: string | null;
  origin_address?: string | null;
  destination_address?: string | null;
  status: string;
  traject_rule_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface OrderLeg {
  id: string;
  tenant_id: string;
  shipment_id: string;
  department_id: string;
  leg_number: number;
  leg_role: string;
  pickup_address: string | null;
  delivery_address: string | null;
  client_id?: string | null;
  client_name?: string | null;
  status: string;
  [key: string]: unknown;
}

export interface CreateShipmentResult {
  shipment: Shipment;
  legs: OrderLeg[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function containsAny(haystack: string | null | undefined, needles: string[]): boolean {
  if (!haystack) return false;
  const lc = haystack.toLowerCase();
  return needles.some((n) => lc.includes(String(n).toLowerCase()));
}

/**
 * Evalueer of een boeking matcht met de match_conditions van een rule.
 * Alle gespecificeerde condities moeten matchen (AND). `default: true`
 * matcht altijd.
 */
export function evaluateMatch(
  booking: BookingInput,
  conditions: MatchConditions | null | undefined,
): boolean {
  if (!conditions || Object.keys(conditions).length === 0) return false;

  if (conditions.default === true) return true;

  const checks: boolean[] = [];

  if (Array.isArray(conditions.pickup_address_contains)) {
    checks.push(containsAny(booking.pickup_address, conditions.pickup_address_contains));
  }
  if (Array.isArray(conditions.delivery_address_contains)) {
    checks.push(containsAny(booking.delivery_address, conditions.delivery_address_contains));
  }
  if (typeof conditions.afdeling_equals === "string") {
    const expected = conditions.afdeling_equals.toLowerCase();
    const actual = (booking.afdeling ?? "").toString().toLowerCase();
    checks.push(actual === expected);
  }

  if (checks.length === 0) return false;
  return checks.every(Boolean);
}

// ─── Afdeling-inference ───────────────────────────────────────────────────

// Fallback markers (gebruikt als tenant geen warehouses heeft geconfigureerd)
const FALLBACK_EXPORT_MARKERS = ["rcs export", "rcs_export", "royalty cargo export"];
const FALLBACK_IMPORT_MARKERS = ["rcs import", "rcs_import", "royalty cargo import"];

interface WarehouseRow {
  address: string;
  warehouse_type: "OPS" | "EXPORT" | "IMPORT";
}

// Per-tenant cache (TTL 60s) zodat we niet bij elke keystroke DB-queries doen
const warehouseCache = new Map<string, { data: WarehouseRow[]; ts: number }>();
const CACHE_TTL = 60_000;

async function getWarehousesForTenant(tenantId: string): Promise<WarehouseRow[]> {
  const cached = warehouseCache.get(tenantId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;
  const { data, error } = await (supabase as any)
    .from("tenant_warehouses")
    .select("address, warehouse_type")
    .eq("tenant_id", tenantId);
  const rows = (error || !data) ? [] : data as WarehouseRow[];
  warehouseCache.set(tenantId, { data: rows, ts: Date.now() });
  return rows;
}

/**
 * Leidt de afdeling af uit pickup + delivery adressen.
 * Leest warehouses uit DB (per tenant). Fallback naar hardcoded markers.
 */
export async function inferAfdelingAsync(
  pickup: string | null | undefined,
  delivery: string | null | undefined,
  tenantId?: string | null,
): Promise<"OPS" | "EXPORT" | "IMPORT" | null> {
  if (!pickup || !delivery) return null;

  const warehouses = tenantId ? await getWarehousesForTenant(tenantId) : [];

  if (warehouses.length > 0) {
    const p = pickup.toLowerCase();
    const d = delivery.toLowerCase();
    for (const wh of warehouses) {
      const addr = wh.address.toLowerCase();
      if (wh.warehouse_type === "IMPORT" && p.includes(addr)) return "IMPORT";
      if (wh.warehouse_type === "EXPORT" && d.includes(addr)) return "EXPORT";
    }
    return "OPS";
  }

  // Fallback: hardcoded markers
  return inferAfdeling(pickup, delivery);
}

/**
 * Synchrone fallback (hardcoded markers). Gebruikt als er geen tenantId is
 * of voor snelle UI-hint zonder await.
 */
export function inferAfdeling(
  pickup: string | null | undefined,
  delivery: string | null | undefined,
): "OPS" | "EXPORT" | "IMPORT" | null {
  if (!pickup || !delivery) return null;
  const p = pickup.toLowerCase();
  if (FALLBACK_IMPORT_MARKERS.some((m) => p.includes(m))) return "IMPORT";
  const d = delivery.toLowerCase();
  if (FALLBACK_EXPORT_MARKERS.some((m) => d.includes(m))) return "EXPORT";
  return "OPS";
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Haalt active traject-rules voor een tenant op, sorteert op priority ASC,
 * en returnt de eerste rule die matcht met de boeking. Null als niks matcht.
 */
export async function matchTrajectRule(
  booking: BookingInput,
  tenantId: string,
): Promise<TrajectRule | null> {
  const { data, error } = await (supabase as any)
    .from("traject_rules")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("priority", { ascending: true });

  if (error) {
    console.error("[trajectRouter] Failed to fetch traject_rules:", error);
    return null;
  }

  const rules = (data || []) as TrajectRule[];
  for (const rule of rules) {
    if (evaluateMatch(booking, rule.match_conditions)) {
      return rule;
    }
  }
  return null;
}

/**
 * Haalt het hub-adres op uit `tenants.settings->>rcs_hub_address`.
 * Fallback: "Royalty Cargo Solutions, Schiphol".
 */
export async function resolveHubAddress(tenantId: string): Promise<string> {
  const FALLBACK = "Royalty Cargo Solutions, Schiphol";
  try {
    const { data, error } = await (supabase as any)
      .from("tenants")
      .select("settings")
      .eq("id", tenantId)
      .single();

    if (error || !data) return FALLBACK;
    const settings = (data as any).settings ?? {};
    const hub = settings?.rcs_hub_address;
    if (typeof hub === "string" && hub.trim().length > 0) return hub;
    return FALLBACK;
  } catch (err) {
    console.error("[trajectRouter] Failed to resolve hub address:", err);
    return FALLBACK;
  }
}

/**
 * Resolve een leg-endpoint (pickup/delivery/hub) naar een concreet adres.
 */
function resolveEndpoint(
  endpoint: LegEndpoint,
  booking: BookingInput,
  hubAddress: string,
): string | null {
  switch (endpoint) {
    case "pickup":
      return booking.pickup_address ?? null;
    case "delivery":
      return booking.delivery_address ?? null;
    case "hub":
      return hubAddress;
    default:
      return null;
  }
}

/**
 * Orkestreert het aanmaken van een shipment + orders per leg.
 *
 * Workflow:
 *   1. Match een traject-rule (anders: error)
 *   2. INSERT shipment (status='DRAFT')
 *   3. Voor elke leg in legs_template:
 *      - resolve from/to adres
 *      - lookup department op code
 *      - INSERT order (status='DRAFT', met shipment_id, department_id,
 *        leg_number, leg_role)
 *   4. Return {shipment, legs}.
 */
export async function createShipmentWithLegs(
  booking: BookingInput,
  tenantId: string,
): Promise<CreateShipmentResult> {
  const rule = await matchTrajectRule(booking, tenantId);
  if (!rule) {
    throw new Error(
      `Geen traject-rule gevonden voor deze boeking (tenant=${tenantId}). ` +
        `Configureer een default rule in traject_rules.`,
    );
  }

  const legsTemplate = Array.isArray(rule.legs_template) ? rule.legs_template : [];
  if (legsTemplate.length === 0) {
    throw new Error(`Traject-rule "${rule.name}" heeft een leeg legs_template.`);
  }

  // 1. Shipment
  const shipmentPayload = {
    tenant_id: tenantId,
    client_id: booking.client_id ?? null,
    client_name: booking.client_name ?? null,
    origin_address: booking.pickup_address ?? null,
    destination_address: booking.delivery_address ?? null,
    status: "DRAFT",
    traject_rule_id: rule.id,
    price_total_cents: booking.price_total_cents ?? null,
    pricing: booking.pricing ?? null,
    contact_person: booking.contact_person ?? null,
    vehicle_type: booking.vehicle_type ?? null,
    client_reference: booking.client_reference ?? null,
    mrn_document: booking.mrn_document ?? null,
    requires_tail_lift: booking.requires_tail_lift ?? false,
    pmt: booking.pmt ?? null,
    cargo: booking.cargo ?? null,
  };

  const { data: shipmentData, error: shipmentErr } = await (supabase as any)
    .from("shipments")
    .insert(shipmentPayload)
    .select("*")
    .single();

  if (shipmentErr || !shipmentData) {
    throw new Error(
      `Kon shipment niet aanmaken: ${shipmentErr?.message ?? "unknown error"}`,
    );
  }
  const shipment = shipmentData as Shipment;

  // 2. Hub address (lazy: alleen fetchen als een leg het nodig heeft)
  const needsHub = legsTemplate.some((l) => l.from === "hub" || l.to === "hub");
  const hubAddress = needsHub ? await resolveHubAddress(tenantId) : "";

  // 3. Departments in één query (alle unieke codes)
  const codes = Array.from(new Set(legsTemplate.map((l) => l.department_code)));
  const { data: deptData, error: deptErr } = await (supabase as any)
    .from("departments")
    .select("id, code")
    .eq("tenant_id", tenantId)
    .in("code", codes);

  if (deptErr) {
    throw new Error(`Kon departments niet ophalen: ${deptErr.message}`);
  }

  const deptByCode = new Map<string, string>();
  for (const d of (deptData || []) as Array<{ id: string; code: string }>) {
    deptByCode.set(d.code, d.id);
  }

  // Controleer dat alle benodigde departments bestaan
  for (const code of codes) {
    if (!deptByCode.has(code)) {
      throw new Error(
        `Department "${code}" bestaat niet voor tenant ${tenantId}. ` +
          `Run de seed-migratie of maak de afdeling aan.`,
      );
    }
  }

  // 4. Legs → orders
  const legs: OrderLeg[] = [];
  const sortedTemplate = [...legsTemplate].sort((a, b) => a.sequence - b.sequence);

  for (const leg of sortedTemplate) {
    const from = resolveEndpoint(leg.from, booking, hubAddress);
    let to = resolveEndpoint(leg.to, booking, hubAddress);

    // Multi-drop: delivery→delivery leg gebruikt final_delivery_address als echte bestemming
    if (
      leg.from === "delivery" &&
      leg.to === "delivery" &&
      typeof booking.final_delivery_address === "string" &&
      booking.final_delivery_address.trim().length > 0
    ) {
      to = booking.final_delivery_address;
    }

    const orderPayload: Record<string, unknown> = {
      tenant_id: tenantId,
      shipment_id: shipment.id,
      department_id: deptByCode.get(leg.department_code),
      leg_number: leg.sequence,
      leg_role: leg.leg_role,
      pickup_address: from,
      delivery_address: to,
      client_id: booking.client_id ?? null,
      client_name: booking.client_name ?? null,
      status: "DRAFT",
      weight_kg: booking.weight_kg ?? null,
      quantity: booking.quantity ?? null,
      unit: booking.unit ?? null,
      transport_type: booking.transport_type ?? null,
      priority: booking.priority ?? "normaal",
      requirements: booking.requirements ?? null,
      time_window_start: booking.pickup_time_window_start ?? null,
      time_window_end:
        leg.to === "delivery"
          ? booking.delivery_time_window_end ?? booking.pickup_time_window_end ?? null
          : leg.to === "hub"
            ? null
            : booking.pickup_time_window_end ?? null,
      notes: leg.from === "pickup"
        ? (booking.pickup_notes || booking.notes) ?? null
        : (booking.delivery_notes || booking.notes) ?? null,
      reference: leg.from === "pickup"
        ? booking.pickup_reference ?? null
        : booking.delivery_reference ?? null,
      pickup_date: leg.from === "pickup"
        ? booking.pickup_date_str ?? null
        : booking.delivery_date_str ?? null,
      delivery_date: leg.to === "delivery"
        ? booking.delivery_date_str ?? null
        : null,
      dimensions: booking.dimensions ?? null,
    };

    // Google adres-autocomplete: zet gesplitste velden + lat/lng alleen op
    // legs waar de bron/bestemming daadwerkelijk het klant-adres is. Hub-legs
    // krijgen geen klant-coordinaten, anders zou de chauffeur naar het
    // verkeerde punt navigeren.
    if (leg.from === "pickup") {
      orderPayload.pickup_street = booking.pickup_street ?? null;
      orderPayload.pickup_house_number = booking.pickup_house_number ?? null;
      orderPayload.pickup_house_number_suffix = booking.pickup_house_number_suffix ?? null;
      orderPayload.pickup_zipcode = booking.pickup_zipcode ?? null;
      orderPayload.pickup_city = booking.pickup_city ?? null;
      orderPayload.pickup_country = booking.pickup_country ?? null;
      orderPayload.geocoded_pickup_lat = booking.pickup_lat ?? null;
      orderPayload.geocoded_pickup_lng = booking.pickup_lng ?? null;
      orderPayload.pickup_coords_manual = booking.pickup_coords_manual ?? false;
    }
    if (leg.to === "delivery") {
      orderPayload.delivery_street = booking.delivery_street ?? null;
      orderPayload.delivery_house_number = booking.delivery_house_number ?? null;
      orderPayload.delivery_house_number_suffix = booking.delivery_house_number_suffix ?? null;
      orderPayload.delivery_zipcode = booking.delivery_zipcode ?? null;
      orderPayload.delivery_city = booking.delivery_city ?? null;
      orderPayload.delivery_country = booking.delivery_country ?? null;
      orderPayload.geocoded_delivery_lat = booking.delivery_lat ?? null;
      orderPayload.geocoded_delivery_lng = booking.delivery_lng ?? null;
      orderPayload.delivery_coords_manual = booking.delivery_coords_manual ?? false;
    }

    const { data: orderData, error: orderErr } = await (supabase as any)
      .from("orders")
      .insert(orderPayload)
      .select("*")
      .single();

    if (orderErr || !orderData) {
      throw new Error(
        `Kon leg ${leg.sequence} (${leg.leg_role}) niet aanmaken: ${orderErr?.message ?? "unknown error"}`,
      );
    }
    legs.push(orderData as OrderLeg);
  }

  return { shipment, legs };
}
