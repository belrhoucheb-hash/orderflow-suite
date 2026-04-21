/**
 * auto-plan-day — Edge Function voor Sprint 3 CP-03.
 *
 * Input: { tenant_id: UUID, date: "YYYY-MM-DD", dry_run?: boolean }
 * Output: { proposals_created: number, unplaced: Array<{ order_id, reason }> }
 *
 * Werkwijze:
 *   1. Feature-flag check via is_planning_v2_enabled(tenant_id). Als uit:
 *      skipped return (veiligheid voor tenants die nog v1 gebruiken).
 *   2. Dagsetup check: driver_availability + vehicle_availability moet er
 *      zijn voor de datum. Anders error "stel dagsetup in".
 *   3. Idempotentie: reset alleen auto-voorstellen van de dag die nog
 *      status='VOORSTEL' zijn. Bevestigde clusters blijven intact.
 *   4. Orders fetch: PENDING, delivery_date = D, geen vehicle_id, niet in
 *      een bestaand niet-verworpen cluster.
 *   5. Run autoPlanner (zie _shared/autoPlanner.ts).
 *   6. Schrijf consolidation_groups + consolidation_orders met
 *      proposal_source='auto' en status='VOORSTEL'.
 *
 * Security: draait onder service role. Caller (frontend) stuurt tenant_id
 * mee; de functie verifieert dat de caller-JWT tot die tenant behoort via
 * app_metadata.tenant_id. Zonder matchende JWT: 403.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  runAutoPlanner,
  type PlannerOrder,
  type PlannerVehicleType,
  type PlannerVehicle,
  type PlannerDriver,
  type ClusterGranularity,
} from "../_shared/autoPlanner.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  tenant_id: string;
  date: string;
  dry_run?: boolean;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isoWeekStart(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().substring(0, 10);
}

async function handleRequest(supabase: SupabaseClient, body: RequestBody, userId: string | null) {
  const { tenant_id, date, dry_run } = body;
  if (!tenant_id || !date) {
    return { ok: false as const, error: "tenant_id en date zijn verplicht" };
  }

  // 1. Clustergrootte-voorkeur
  const { data: granRow } = await supabase.rpc("get_planning_cluster_granularity", { p_tenant_id: tenant_id });
  const granularity: ClusterGranularity = granRow === "PC3" ? "PC3" : "PC2";

  // 2. Dagsetup check
  const [{ data: vAvail }, { data: dAvail }] = await Promise.all([
    supabase.from("vehicle_availability").select("vehicle_id, status").eq("date", date).eq("tenant_id", tenant_id),
    supabase.from("driver_availability").select("driver_id, status").eq("date", date).eq("tenant_id", tenant_id),
  ]);
  if (!vAvail || vAvail.length === 0) {
    return { ok: false as const, error: "Geen dagsetup voor voertuigen. Stel eerst de dagsetup in." };
  }
  if (!dAvail || dAvail.length === 0) {
    return { ok: false as const, error: "Geen dagsetup voor chauffeurs. Stel eerst de dagsetup in." };
  }

  const availableVehicleIds = new Set(vAvail.filter((r: any) => r.status === "beschikbaar").map((r: any) => r.vehicle_id));
  const availableDriverIds = new Set(dAvail.filter((r: any) => r.status === "werkt").map((r: any) => r.driver_id));

  if (availableVehicleIds.size === 0) return { ok: false as const, error: "Geen beschikbare voertuigen op deze dag." };
  if (availableDriverIds.size === 0) return { ok: false as const, error: "Geen werkende chauffeurs op deze dag." };

  // 3. Idempotentie: reset eerdere auto-voorstellen die nog niet bevestigd zijn
  if (!dry_run) {
    const { error: resetErr } = await supabase
      .from("consolidation_groups")
      .update({ status: "VERWORPEN" })
      .eq("tenant_id", tenant_id)
      .eq("planned_date", date)
      .eq("proposal_source", "auto")
      .eq("status", "VOORSTEL");
    if (resetErr) return { ok: false as const, error: `reset voorstellen faalde: ${resetErr.message}` };
  }

  // 4. Orders ophalen
  const { data: existingCons } = await supabase
    .from("consolidation_groups")
    .select("id, consolidation_orders(order_id), status")
    .eq("tenant_id", tenant_id)
    .eq("planned_date", date)
    .neq("status", "VERWORPEN");
  const lockedOrderIds = new Set<string>();
  (existingCons ?? []).forEach((g: any) => {
    (g.consolidation_orders ?? []).forEach((co: any) => lockedOrderIds.add(co.order_id));
  });

  const { data: orderRows, error: ordersErr } = await supabase
    .from("orders")
    .select(
      "id, delivery_address, pickup_address, weight_kg, is_weight_per_unit, quantity, requirements, vehicle_type_id, delivery_time_window_start, delivery_time_window_end, status, vehicle_id",
    )
    .eq("tenant_id", tenant_id)
    .eq("delivery_date", date)
    .eq("status", "PENDING")
    .is("vehicle_id", null);
  if (ordersErr) return { ok: false as const, error: `orders fetch faalde: ${ordersErr.message}` };

  const candidateOrders = (orderRows ?? []).filter((o: any) => !lockedOrderIds.has(o.id));
  if (candidateOrders.length === 0) {
    return { ok: true as const, proposals_created: 0, unplaced: [], reason: "Geen orders om te plannen" };
  }

  // 5. Refs ophalen
  const [{ data: vehicleTypeRows }, { data: vehicleRows }, { data: driverRows }] = await Promise.all([
    supabase.from("vehicle_types").select("*").eq("tenant_id", tenant_id).eq("is_active", true),
    supabase.from("vehicles").select("id, name, vehicle_type_id, capacity_kg, capacity_pallets, features").eq("tenant_id", tenant_id).eq("is_active", true),
    supabase.from("drivers").select("id, name, certifications, contract_hours_per_week").eq("tenant_id", tenant_id).eq("is_active", true),
  ]);

  const weekStart = isoWeekStart(date);
  const { data: hourRows } = await supabase
    .from("driver_hours_per_week")
    .select("driver_id, week_start, planned_hours")
    .eq("tenant_id", tenant_id)
    .eq("week_start", weekStart);
  const plannedHoursByDriver = new Map<string, number>();
  (hourRows ?? []).forEach((r: any) => plannedHoursByDriver.set(r.driver_id, Number(r.planned_hours ?? 0)));

  const vehiclePool: PlannerVehicle[] = (vehicleRows ?? [])
    .filter((v: any) => availableVehicleIds.has(v.id))
    .map((v: any) => ({
      id: v.id,
      name: v.name,
      vehicle_type_id: v.vehicle_type_id,
      capacity_kg: v.capacity_kg,
      capacity_pallets: v.capacity_pallets,
      features: v.features,
    }));

  const driverPool: PlannerDriver[] = (driverRows ?? [])
    .filter((d: any) => availableDriverIds.has(d.id))
    .map((d: any) => ({
      id: d.id,
      name: d.name,
      certifications: d.certifications,
      contract_hours_per_week: d.contract_hours_per_week,
      planned_hours_this_week: plannedHoursByDriver.get(d.id) ?? 0,
    }));

  const plannerOrders: PlannerOrder[] = candidateOrders.map((o: any) => ({
    id: o.id,
    delivery_address: o.delivery_address,
    pickup_address: o.pickup_address,
    weight_kg: o.weight_kg,
    is_weight_per_unit: !!o.is_weight_per_unit,
    quantity: o.quantity,
    requirements: o.requirements,
    vehicle_type_id: o.vehicle_type_id,
    delivery_time_window_start: o.delivery_time_window_start,
    delivery_time_window_end: o.delivery_time_window_end,
    cargo_length_cm: null,
    cargo_width_cm: null,
    cargo_height_cm: null,
  }));

  const plannerTypes: PlannerVehicleType[] = (vehicleTypeRows ?? []).map((t: any) => ({
    id: t.id,
    code: t.code,
    name: t.name,
    sort_order: t.sort_order ?? 0,
    max_length_cm: t.max_length_cm,
    max_width_cm: t.max_width_cm,
    max_height_cm: t.max_height_cm,
    max_weight_kg: t.max_weight_kg,
    max_volume_m3: t.max_volume_m3,
    max_pallets: t.max_pallets,
    has_tailgate: !!t.has_tailgate,
    has_cooling: !!t.has_cooling,
    adr_capable: !!t.adr_capable,
  }));

  const result = runAutoPlanner({
    date,
    granularity,
    orders: plannerOrders,
    vehicleTypes: plannerTypes,
    vehicles: vehiclePool,
    drivers: driverPool,
  });

  if (dry_run) {
    return { ok: true as const, dry_run: true, proposals_preview: result.proposals, unplaced: result.unplaced };
  }

  // 6. Schrijf voorstellen
  let proposalsCreated = 0;
  for (const p of result.proposals) {
    const { data: group, error: groupErr } = await supabase
      .from("consolidation_groups")
      .insert({
        tenant_id,
        name: `Regio ${p.region} - ${date}`,
        planned_date: date,
        status: "VOORSTEL",
        vehicle_id: p.vehicle_id,
        driver_id: p.driver_id,
        total_weight_kg: p.total_weight_kg,
        total_pallets: p.total_pallets,
        estimated_duration_min: p.estimated_duration_min,
        utilization_pct: p.utilization_pct,
        proposal_source: "auto",
        created_by: userId,
      } as any)
      .select("id")
      .single();
    if (groupErr || !group) continue;

    const rows = p.orders.map((o, idx) => ({
      group_id: (group as any).id,
      order_id: o.id,
      stop_sequence: idx + 1,
    }));
    const { error: ordersErr2 } = await supabase.from("consolidation_orders").insert(rows);
    if (!ordersErr2) proposalsCreated++;
  }

  return {
    ok: true as const,
    proposals_created: proposalsCreated,
    unplaced: result.unplaced,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      return jsonResponse({ ok: false, error: "Supabase env ontbreekt" }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // Caller-JWT check: match tenant_id in body tegen JWT app_metadata
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    let userId: string | null = null;
    let jwtTenantId: string | null = null;
    if (token) {
      const { data: userData } = await supabase.auth.getUser(token);
      userId = userData?.user?.id ?? null;
      jwtTenantId = (userData?.user?.app_metadata as any)?.tenant_id ?? null;
    }

    const body = (await req.json()) as RequestBody;
    if (jwtTenantId && body.tenant_id && body.tenant_id !== jwtTenantId) {
      return jsonResponse({ ok: false, error: "Geen toegang tot deze tenant" }, 403);
    }

    const result = await handleRequest(supabase, body, userId);
    return jsonResponse(result, (result as any).ok === false ? 400 : 200);
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) }, 500);
  }
});
