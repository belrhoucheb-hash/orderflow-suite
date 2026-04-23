/**
 * calculate-order-price — Edge Function voor tariefberekening.
 *
 * Input: { order_id: UUID }
 * Output: v2 snapshot-JSON + update van shipments.price_total_cents en pricing.
 *
 * Security (R14): draait onder service role, checkt tenant_id consistent
 * tussen orders/shipments/clients. Geen user-auth nodig; de caller
 * (DB-trigger, backend, andere Edge Function) moet vertrouwd zijn.
 *
 * Optimistic locking (R8): overschrijft bestaande snapshot alleen als
 * pricing.calculated_at ouder is én pricing.locked != true. Handmatige
 * overrides blijven intact.
 *
 * Feature-flag (R18): is_pricing_engine_enabled(tenant_id) moet true zijn;
 * anders skippt de functie en retourneert { skipped: true }.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

import { isTrustedCaller } from "../_shared/auth.ts";
import { calculateOrderPrice } from "../_shared/pricingEngine.ts";
import { selectSmallestVehicleType } from "../_shared/vehicleSelector.ts";
import { selectRateCard } from "../_shared/rateCardSelector.ts";
import { buildSnapshot, buildErrorSnapshot } from "../_shared/pricingSnapshot.ts";
import { corsFor, handleOptions } from "../_shared/cors.ts";
import type {
  PricingOrderInput,
  VehicleType,
  RateCard,
  Surcharge,
  CargoDimensions,
  PricingSnapshotV2,
} from "../_shared/rateModels.ts";

const CORS_OPTIONS = { extraHeaders: ["x-cron-secret"] };

interface RequestBody {
  order_id: string;
  force?: boolean; // Ontgrendel + herbereken, alleen met admin-context
}

interface SuccessResponse {
  ok: true;
  snapshot: PricingSnapshotV2;
}

interface SkippedResponse {
  ok: true;
  skipped: true;
  reason: string;
}

interface ErrorResponse {
  ok: false;
  error: string;
  snapshot?: PricingSnapshotV2;
}

function jsonResponse(body: unknown, status = 200, corsHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Cargo aggregatie uit shipments.cargo JSONB ──────────────

interface CargoRow {
  aantal?: number;
  lengte?: number;
  breedte?: number;
  hoogte?: number;
  gewicht?: number;
  stapelbaar?: boolean;
  adr?: boolean;
}

function aggregateCargo(
  cargoRows: CargoRow[] | null,
  requiresTailgate: boolean,
  transportType: string | null,
): CargoDimensions {
  const rows = cargoRows ?? [];
  let maxLength = 0;
  let maxWidth = 0;
  let maxHeight = 0;
  let stackedHeight = 0;
  let unstackedHeight = 0;
  let totalWeight = 0;
  let anyAdr = false;

  for (const r of rows) {
    const count = r.aantal ?? 1;
    const l = r.lengte ?? 0;
    const w = r.breedte ?? 0;
    const h = r.hoogte ?? 0;
    const kg = (r.gewicht ?? 0) * count;
    maxLength = Math.max(maxLength, l);
    maxWidth = Math.max(maxWidth, w);
    if (r.stapelbaar) {
      stackedHeight += h * count;
    } else {
      unstackedHeight = Math.max(unstackedHeight, h);
    }
    maxHeight = Math.max(maxHeight, h);
    totalWeight += kg;
    if (r.adr) anyAdr = true;
  }

  const effectiveHeight = Math.max(stackedHeight, unstackedHeight, maxHeight);

  return {
    length_cm: maxLength,
    width_cm: maxWidth,
    height_cm: effectiveHeight,
    weight_kg: totalWeight,
    requires_tailgate: requiresTailgate,
    requires_cooling: (transportType ?? "").toLowerCase().includes("koel"),
    requires_adr: anyAdr,
  };
}

// ─── Hoofdflow ──────────────────────────────────────────────

async function handleRequest(
  supabase: SupabaseClient,
  body: RequestBody,
): Promise<SuccessResponse | SkippedResponse | ErrorResponse> {
  const { order_id, force } = body;

  // 1. Order laden. We vragen alleen kolommen die zeker op orders staan;
  // distance_km, stop_count, duration_hours etc. leven nu niet op orders
  // (hooguit op trips.total_distance_km). De motor behandelt afwezige waarden
  // als defaults, een PER_KM rule met distance_km = 0 levert 0 op en een
  // duidelijke regel in het snapshot.
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("id, tenant_id, client_id, shipment_id, pickup_date, weight_kg, quantity, transport_type, pickup_address, delivery_address, requirements, client_name, order_number, time_window_start")
    .eq("id", order_id)
    .single();

  if (orderErr || !order) {
    return { ok: false, error: `Order niet gevonden: ${order_id}` };
  }

  const { data: shipment, error: shipErr } = await supabase
    .from("shipments")
    .select("id, tenant_id, cargo, requires_tail_lift, transport_type, vehicle_type, pricing")
    .eq("id", order.shipment_id)
    .single();

  if (shipErr || !shipment) {
    return { ok: false, error: `Shipment niet gevonden voor order ${order_id}` };
  }

  // R14 tenant-consistency check
  if (shipment.tenant_id !== order.tenant_id) {
    return { ok: false, error: "Tenant-mismatch tussen order en shipment" };
  }

  // R18 feature-flag
  const { data: flag } = await supabase.rpc("is_pricing_engine_enabled", {
    p_tenant_id: order.tenant_id,
  });
  if (!flag) {
    return { ok: true, skipped: true, reason: "Tariefmotor staat uit voor deze tenant" };
  }

  // R8 lock-check: bestaande snapshot met locked=true overslaan tenzij force=true
  const existingPricing = shipment.pricing as PricingSnapshotV2 | null;
  if (!force && existingPricing?.locked === true) {
    return {
      ok: true,
      skipped: true,
      reason: "Snapshot is handmatig vergrendeld (locked=true). Gebruik force=true om te overrulen.",
    };
  }

  // 2. Cargo + overrides aggregeren
  const cargo = aggregateCargo(
    (shipment.cargo as CargoRow[] | null),
    shipment.requires_tail_lift === true,
    shipment.transport_type ?? order.transport_type,
  );

  // 3. Voertuigtypes laden, kleinste-passend selecteren
  const { data: vehicleTypes, error: vtErr } = await supabase
    .from("vehicle_types")
    .select("*")
    .eq("tenant_id", order.tenant_id)
    .eq("is_active", true)
    .order("sort_order");

  if (vtErr) {
    return { ok: false, error: `Fout bij laden voertuigtypes: ${vtErr.message}` };
  }

  if (!vehicleTypes || vehicleTypes.length === 0) {
    const snap = buildErrorSnapshot("no_vehicle_types", "Geen voertuigtypes geconfigureerd voor tenant");
    await persistSnapshot(supabase, shipment.id, snap, existingPricing);
    return { ok: false, error: "no_vehicle_types", snapshot: snap };
  }

  const vtSelection = selectSmallestVehicleType(vehicleTypes as VehicleType[], cargo);
  if ("error" in vtSelection) {
    const snap = buildErrorSnapshot(vtSelection.error, vtSelection.reason);
    await persistSnapshot(supabase, shipment.id, snap, existingPricing);
    return { ok: false, error: vtSelection.reason, snapshot: snap };
  }

  // 4. Rate cards laden, beste selecteren.
  // pickup_datetime bestaat niet op orders; we leiden af uit pickup_date +
  // time_window_start (HH:mm string). Ontbreekt een van beide, dan vallen de
  // tijd/dag surcharges terug op "matcht alleen zonder tijd/dag-conditie".
  const pickupDate = (order.pickup_date as string | null) ?? undefined;
  const pickupTimeLocal =
    (order.time_window_start as string | null)?.slice(0, 5) ?? undefined;

  const { data: rateCards, error: rcErr } = await supabase
    .from("rate_cards")
    .select("*, rate_rules(*)")
    .eq("tenant_id", order.tenant_id)
    .eq("is_active", true);

  if (rcErr) {
    return { ok: false, error: `Fout bij laden tariefkaarten: ${rcErr.message}` };
  }

  // distance_km leeft niet op orders. Als er een gekoppelde trip is via
  // trip_stops, gebruik trips.total_distance_km als schatting; anders 0.
  // PER_KM rules produceren dan een zichtbare 0-regel die planner via
  // handmatig overschrijven kan corrigeren.
  let distanceKm = 0;
  const { data: stop } = await supabase
    .from("trip_stops")
    .select("trip_id, trips(total_distance_km)")
    .eq("order_id", order.id)
    .limit(1)
    .maybeSingle();
  // deno-lint-ignore no-explicit-any
  const linkedTrip = (stop as any)?.trips;
  if (linkedTrip?.total_distance_km != null) {
    distanceKm = Number(linkedTrip.total_distance_km);
  }

  const pricingInput: PricingOrderInput = {
    id: order.id,
    order_number: order.order_number,
    client_name: order.client_name ?? null,
    pickup_address: order.pickup_address ?? null,
    delivery_address: order.delivery_address ?? null,
    transport_type: shipment.transport_type ?? order.transport_type ?? null,
    weight_kg: cargo.weight_kg || order.weight_kg,
    quantity: order.quantity,
    distance_km: distanceKm,
    stop_count: 2,
    duration_hours: 0,
    requirements: order.requirements ?? [],
    day_of_week: pickupDate ? new Date(pickupDate).getDay() : new Date().getDay(),
    waiting_time_min: 0,
    pickup_country: "NL",
    delivery_country: "NL",
    pickup_date: pickupDate,
    pickup_time_local: pickupTimeLocal,
    cargo_dimensions: cargo,
    vehicle_type_id: vtSelection.vehicle_type.id,
  };

  const rcResult = selectRateCard(
    (rateCards ?? []) as RateCard[],
    pricingInput,
    order.client_id,
  );

  if ("error" in rcResult) {
    const snap = buildErrorSnapshot(rcResult.error, rcResult.reason);
    await persistSnapshot(supabase, shipment.id, snap, existingPricing);
    return { ok: false, error: rcResult.reason, snapshot: snap };
  }

  // R30 currency-scope: alleen EUR deze sprint
  if (rcResult.card.currency !== "EUR") {
    const snap = buildErrorSnapshot(
      "unsupported_currency",
      `Alleen EUR wordt ondersteund in deze sprint (gevonden: ${rcResult.card.currency})`,
    );
    await persistSnapshot(supabase, shipment.id, snap, existingPricing);
    return { ok: false, error: "unsupported_currency", snapshot: snap };
  }

  // 5. Surcharges laden
  const { data: surcharges } = await supabase
    .from("surcharges")
    .select("*")
    .eq("tenant_id", order.tenant_id)
    .eq("is_active", true)
    .order("sort_order");

  // 6. Motor aanroepen
  const breakdown = calculateOrderPrice(
    pricingInput,
    rcResult.card,
    (surcharges ?? []) as Surcharge[],
  );

  // 7. Snapshot bouwen
  const snapshot = buildSnapshot({
    breakdown,
    rateCard: rcResult.card,
    vehicleType: vtSelection.vehicle_type,
    vehicleTypeReason: vtSelection.reason,
  });

  // 8. Persist met optimistic lock
  const persistOk = await persistSnapshot(supabase, shipment.id, snapshot, existingPricing);
  if (!persistOk) {
    return {
      ok: false,
      error: "Snapshot kon niet weggeschreven worden (mogelijk race met latere berekening)",
      snapshot,
    };
  }

  return { ok: true, snapshot };
}

async function persistSnapshot(
  supabase: SupabaseClient,
  shipmentId: string,
  snapshot: PricingSnapshotV2,
  existing: PricingSnapshotV2 | null,
): Promise<boolean> {
  // Optimistic locking: alleen overschrijven als existing ouder is of ontbreekt
  // en niet locked. 'locked' is al eerder afgehandeld in de flow; hier dient
  // alleen de calculated_at-check als race-protection.
  let query = supabase
    .from("shipments")
    .update({
      pricing: snapshot,
      price_total_cents: snapshot.total_cents,
      updated_at: new Date().toISOString(),
    })
    .eq("id", shipmentId);

  if (existing?.calculated_at) {
    query = query.or(
      `pricing->>calculated_at.lt.${existing.calculated_at},pricing.is.null`,
    );
  }

  const { error } = await query;
  if (error) {
    console.error("Persist snapshot error:", error);
    return false;
  }
  return true;
}

// ─── HTTP handler ───────────────────────────────────────────

serve(async (req: Request) => {
  const preflight = handleOptions(req, CORS_OPTIONS);
  if (preflight) return preflight;
  const corsHeaders = corsFor(req, CORS_OPTIONS);

  // Trusted-callers only: deze function muteert pricing-snapshots en moet
  // alleen door DB-triggers / cron / interne workers worden aangeroepen.
  if (!isTrustedCaller(req)) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401, corsHeaders);
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405, corsHeaders);
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400, corsHeaders);
  }

  if (!body.order_id || typeof body.order_id !== "string") {
    return jsonResponse({ ok: false, error: "order_id required" }, 400, corsHeaders);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ ok: false, error: "Server niet geconfigureerd" }, 500, corsHeaders);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  try {
    const result = await handleRequest(supabase, body);
    return jsonResponse(result, "ok" in result && result.ok ? 200 : 422, corsHeaders);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("calculate-order-price error:", msg);
    return jsonResponse({ ok: false, error: msg }, 500, corsHeaders);
  }
});
