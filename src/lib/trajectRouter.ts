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
  client_id?: string | null;
  client_name?: string | null;
  weight_kg?: number | null;
  quantity?: number | null;
  unit?: string | null;
  transport_type?: string | null;
  priority?: string | null;
  requirements?: string[] | null;
  pickup_date?: string | null;
  delivery_date?: string | null;
  pickup_time_window_start?: string | null;
  pickup_time_window_end?: string | null;
  delivery_time_window_start?: string | null;
  delivery_time_window_end?: string | null;
  notes?: string | null;
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
  transport_type_equals?: string;
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
  if (typeof conditions.transport_type_equals === "string") {
    const expected = conditions.transport_type_equals.toLowerCase();
    const actual = (booking.transport_type ?? "").toString().toLowerCase();
    checks.push(actual === expected);
  }

  if (checks.length === 0) return false;
  return checks.every(Boolean);
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
  userId?: string,
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
    const to = resolveEndpoint(leg.to, booking, hubAddress);

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
      pickup_date: booking.pickup_date ?? null,
      delivery_date: booking.delivery_date ?? null,
      pickup_time_window_start: booking.pickup_time_window_start ?? null,
      pickup_time_window_end: booking.pickup_time_window_end ?? null,
      delivery_time_window_start: booking.delivery_time_window_start ?? null,
      delivery_time_window_end: booking.delivery_time_window_end ?? null,
      notes: booking.notes ?? null,
      // order_number: laat leeg; bestaande trigger vult aan.
      // created_by (optioneel audit-trail)
      ...(userId ? { created_by: userId } : {}),
    };

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
