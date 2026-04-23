/**
 * preview-order-price, live prijsvoorbeeld voor NewOrder-form.
 *
 * Verschillen met calculate-order-price:
 *  - Geen order_id nodig, caller levert input direct.
 *  - Schrijft niks naar de DB (geen snapshot, geen shipments.pricing).
 *  - Respecteert wel feature-flag is_pricing_engine_enabled.
 *  - Leest rate_cards + rate_rules + surcharges + vehicle_types per tenant.
 *
 * Input: {
 *   tenant_id: UUID,
 *   vehicle_type_id: UUID,
 *   distance_km: number,          // caller rondt vooraf indien gewenst
 *   pickup_date?: string,         // ISO datum voor day_type en rate_card validity
 *   pickup_time_local?: string,   // HH:mm voor tijd-toeslagen
 *   transport_type?: string,
 *   requirements?: string[],
 *   weight_kg?: number,
 *   client_id?: UUID | null,
 *   stop_count?: number,          // default 2
 *   duration_hours?: number,      // default 0
 *   waiting_time_min?: number,    // default 0
 *   diesel_included?: boolean,    // filtert PER_KM met conditions.diesel_included
 *   include_optional_purposes?: string[], // bv ['screening']
 * }
 * Output: PriceBreakdown + basis-meta (vehicle_type_code, rate_card_name).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

import { getUserAuth } from "../_shared/auth.ts";
import { calculateOrderPrice } from "../_shared/pricingEngine.ts";
import { corsFor, handleOptions } from "../_shared/cors.ts";
import type {
  PricingOrderInput,
  RateCard,
  Surcharge,
  PriceBreakdown,
} from "../_shared/rateModels.ts";

interface PreviewRequest {
  tenant_id: string;
  vehicle_type_id: string;
  distance_km: number;
  pickup_date?: string;
  pickup_time_local?: string;
  transport_type?: string | null;
  requirements?: string[];
  weight_kg?: number | null;
  client_id?: string | null;
  stop_count?: number;
  duration_hours?: number;
  waiting_time_min?: number;
  diesel_included?: boolean;
  include_optional_purposes?: string[];
}

interface PreviewResponse {
  ok: true;
  breakdown: PriceBreakdown;
  vehicle_type_id: string;
  rate_card_id: string;
  rate_card_name: string;
}

interface PreviewSkipped {
  ok: true;
  skipped: true;
  reason: string;
}

interface PreviewError {
  ok: false;
  error: string;
}

function jsonResponse(body: unknown, status = 200, corsHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function validate(body: unknown): PreviewRequest | string {
  if (!body || typeof body !== "object") return "Body ontbreekt";
  const b = body as Record<string, unknown>;
  if (typeof b.tenant_id !== "string") return "tenant_id verplicht";
  if (typeof b.vehicle_type_id !== "string") return "vehicle_type_id verplicht";
  if (typeof b.distance_km !== "number" || b.distance_km < 0) return "distance_km moet >= 0 zijn";
  return b as unknown as PreviewRequest;
}

serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  const corsHeaders = corsFor(req);

  if (req.method !== "POST") return jsonResponse({ ok: false, error: "Method not allowed" }, 405, corsHeaders);

  // Vereist een geldige user-JWT met tenant_id; wordt vanuit het NewOrder-form
  // aangeroepen via supabase.functions.invoke (browser-sessie).
  const auth = await getUserAuth(req);
  if (!auth.ok) {
    return jsonResponse({ ok: false, error: auth.error }, auth.status, corsHeaders);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400, corsHeaders);
  }

  const input = validate(raw);
  if (typeof input === "string") return jsonResponse({ ok: false, error: input }, 400, corsHeaders);

  // Cross-tenant blokkeren: tenant_id in body moet matchen met token.
  if (input.tenant_id !== auth.tenantId) {
    return jsonResponse({ ok: false, error: "Forbidden: tenant mismatch" }, 403, corsHeaders);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ ok: false, error: "Server niet geconfigureerd" }, 500, corsHeaders);
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  try {
    // Feature-flag check.
    const { data: flag } = await supabase.rpc("is_pricing_engine_enabled", {
      p_tenant_id: input.tenant_id,
    });
    if (!flag) {
      const resp: PreviewSkipped = { ok: true, skipped: true, reason: "Tariefmotor staat uit voor deze tenant" };
      return jsonResponse(resp, 200, corsHeaders);
    }

    // Rate cards met rules laden, tenant-scoped.
    const { data: rateCards, error: rcErr } = await supabase
      .from("rate_cards")
      .select("*, rate_rules(*)")
      .eq("tenant_id", input.tenant_id)
      .eq("is_active", true);
    if (rcErr) {
      const resp: PreviewError = { ok: false, error: `Fout bij laden tariefkaarten: ${rcErr.message}` };
      return jsonResponse(resp, 500, corsHeaders);
    }
    if (!rateCards || rateCards.length === 0) {
      return jsonResponse({ ok: false, error: "Geen actieve tariefkaart gevonden" } as PreviewError, 422, corsHeaders);
    }

    // Kies card: prefereer klant-specifiek, anders tenant-default.
    const clientCard = input.client_id
      ? (rateCards as RateCard[]).find((c) => c.client_id === input.client_id)
      : undefined;
    const defaultCard = (rateCards as RateCard[]).find((c) => c.client_id === null);
    const card = clientCard ?? defaultCard ?? (rateCards as RateCard[])[0];

    if (card.currency !== "EUR") {
      return jsonResponse({ ok: false, error: `Alleen EUR ondersteund (gevonden: ${card.currency})` } as PreviewError, 422, corsHeaders);
    }

    // Surcharges laden.
    const { data: surcharges } = await supabase
      .from("surcharges")
      .select("*")
      .eq("tenant_id", input.tenant_id)
      .eq("is_active", true)
      .order("sort_order");

    // Engine input bouwen.
    const dayOfWeek = input.pickup_date
      ? new Date(input.pickup_date).getDay()
      : new Date().getDay();

    const pricingInput: PricingOrderInput = {
      id: "preview",
      order_number: "preview",
      client_name: null,
      pickup_address: null,
      delivery_address: null,
      transport_type: input.transport_type ?? null,
      weight_kg: input.weight_kg ?? null,
      quantity: null,
      distance_km: input.distance_km,
      stop_count: input.stop_count ?? 2,
      duration_hours: input.duration_hours ?? 0,
      requirements: input.requirements ?? [],
      day_of_week: dayOfWeek,
      waiting_time_min: input.waiting_time_min ?? 0,
      pickup_country: "NL",
      delivery_country: "NL",
      pickup_date: input.pickup_date,
      pickup_time_local: input.pickup_time_local,
      vehicle_type_id: input.vehicle_type_id,
      diesel_included: input.diesel_included,
      include_optional_purposes: input.include_optional_purposes,
    };

    const breakdown = calculateOrderPrice(pricingInput, card, (surcharges ?? []) as Surcharge[]);

    const resp: PreviewResponse = {
      ok: true,
      breakdown,
      vehicle_type_id: input.vehicle_type_id,
      rate_card_id: card.id,
      rate_card_name: card.name,
    };
    return jsonResponse(resp, 200, corsHeaders);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("preview-order-price error:", msg);
    return jsonResponse({ ok: false, error: msg } as PreviewError, 500, corsHeaders);
  }
});
