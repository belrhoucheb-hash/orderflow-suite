// Cron-edge function (elke minuut). Voor alle tenants:
//   1. laadt actieve trips,
//   2. berekent per resterende stop een predicted_eta,
//   3. stuurt CUSTOMER_LEAD-SMS net voor aankomst (one-shot per stop),
//   4. stuurt CUSTOMER_UPDATE-SMS bij significante wijziging (one-shot),
//   5. opent een PREDICTED_DELAY exception bij vertraging > drempel.
//
// Idempotentie:
//   - trip_stop_eta_notifications heeft PRIMARY KEY (stop_id, trigger_event)
//     -> tweede insert botst en wordt genegeerd.
//   - delivery_exceptions: we checken eerst of er al een open
//     PREDICTED_DELAY voor de stop bestaat.
//   - predicted_eta wordt alleen geupdatet als de nieuwe waarde > 1 minuut
//     afwijkt van de huidige.
//
// Tenant-isolatie: foutafhandeling per tenant. Eén tenant-fout mag niet de
// hele draai afbreken, anders blijft de hele klantenkring zonder ETA-pushes.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { isTrustedCaller } from "../_shared/auth.ts";
import { corsFor, handleOptions } from "../_shared/cors.ts";
import { calculateEtaMinutes, type LatLng } from "./eta.ts";

const CORS_OPTIONS = { extraHeaders: ["x-cron-secret"] };

interface EtaSettings {
  customer_push_lead_minutes: number;
  customer_update_threshold_minutes: number;
  predicted_delay_threshold_minutes: number;
  predicted_delay_severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  eta_min_shift_for_badge_minutes: number;
  customer_notifications_enabled: boolean;
}

const DEFAULT_SETTINGS: EtaSettings = {
  customer_push_lead_minutes: 30,
  customer_update_threshold_minutes: 15,
  predicted_delay_threshold_minutes: 15,
  predicted_delay_severity: "MEDIUM",
  eta_min_shift_for_badge_minutes: 5,
  customer_notifications_enabled: true,
};

interface TripRow {
  id: string;
  tenant_id: string;
  vehicle_id: string;
}

interface VehiclePositionRow {
  vehicle_id: string;
  lat: number | string;
  lng: number | string;
  speed: number | string | null;
  recorded_at: string;
}

interface TripStopRow {
  id: string;
  trip_id: string;
  order_id: string | null;
  stop_type: string;
  stop_sequence: number;
  stop_status: string;
  planned_time: string | null;
  planned_window_end: string | null;
  predicted_eta: string | null;
}

interface OrderRow {
  id: string;
  order_number: number | string;
  recipient_phone: string | null;
  recipient_email: string | null;
  notification_preferences: { sms?: boolean; email?: boolean } | null;
  geocoded_pickup_lat: number | string | null;
  geocoded_pickup_lng: number | string | null;
  geocoded_delivery_lat: number | string | null;
  geocoded_delivery_lng: number | string | null;
  pickup_address: string | null;
  delivery_address: string | null;
}

function toNumber(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function stopCoords(stop: TripStopRow, order: OrderRow | undefined): LatLng | null {
  if (!order) return null;
  if (stop.stop_type === "PICKUP") {
    const lat = toNumber(order.geocoded_pickup_lat);
    const lng = toNumber(order.geocoded_pickup_lng);
    if (lat != null && lng != null) return { lat, lng };
  }
  if (stop.stop_type === "DELIVERY") {
    const lat = toNumber(order.geocoded_delivery_lat);
    const lng = toNumber(order.geocoded_delivery_lng);
    if (lat != null && lng != null) return { lat, lng };
  }
  return null;
}

/**
 * Combineer planned_time (date) en planned_window_end (time) tot een
 * ISO-timestamp. Als planned_window_end ontbreekt vallen we terug op
 * planned_time zelf. Returnt null als beide ontbreken.
 */
function windowEndTs(stop: TripStopRow): Date | null {
  if (!stop.planned_time) return null;
  const planned = new Date(stop.planned_time);
  if (Number.isNaN(planned.getTime())) return null;
  if (!stop.planned_window_end) return planned;

  // planned_window_end is "HH:MM" of "HH:MM:SS".
  const parts = stop.planned_window_end.split(":");
  const hh = parseInt(parts[0] ?? "0", 10);
  const mm = parseInt(parts[1] ?? "0", 10);
  const ss = parseInt(parts[2] ?? "0", 10);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return planned;

  const result = new Date(planned);
  result.setUTCHours(hh, mm, Number.isFinite(ss) ? ss : 0, 0);
  return result;
}

interface ProcessTenantResult {
  trips_seen: number;
  stops_updated: number;
  leads_sent: number;
  updates_sent: number;
  exceptions_opened: number;
  errors: string[];
}

async function loadTenantSettings(
  admin: ReturnType<typeof createClient>,
  tenantId: string,
): Promise<EtaSettings> {
  const { data, error } = await admin
    .from("tenant_settings")
    .select("settings")
    .eq("tenant_id", tenantId)
    .eq("category", "eta_notifications")
    .maybeSingle();
  if (error) {
    console.warn(`tenant_settings load error voor ${tenantId}: ${error.message}`);
    return DEFAULT_SETTINGS;
  }
  const raw = (data?.settings ?? {}) as Partial<EtaSettings>;
  return { ...DEFAULT_SETTINGS, ...raw };
}

async function processTenant(
  admin: ReturnType<typeof createClient>,
  tenantId: string,
  supabaseUrl: string,
  serviceKey: string,
  publicSiteUrl: string,
): Promise<ProcessTenantResult> {
  const result: ProcessTenantResult = {
    trips_seen: 0,
    stops_updated: 0,
    leads_sent: 0,
    updates_sent: 0,
    exceptions_opened: 0,
    errors: [],
  };

  const settings = await loadTenantSettings(admin, tenantId);

  // 1. Actieve trips in deze tenant
  const { data: trips, error: tripsErr } = await admin
    .from("trips")
    .select("id, tenant_id, vehicle_id")
    .eq("tenant_id", tenantId)
    .eq("dispatch_status", "ACTIEF");
  if (tripsErr) {
    result.errors.push(`trips load: ${tripsErr.message}`);
    return result;
  }
  if (!trips || trips.length === 0) return result;
  result.trips_seen = trips.length;

  // Bestaande open PREDICTED_DELAY-exceptions in één query, anders N+1.
  const tripIds = trips.map((t) => t.id);
  const { data: openExceptions } = await admin
    .from("delivery_exceptions")
    .select("trip_stop_id")
    .eq("tenant_id", tenantId)
    .eq("exception_type", "PREDICTED_DELAY")
    .not("status", "in", "(RESOLVED,ESCALATED)")
    .in("trip_id", tripIds);
  const stopsWithOpenException = new Set<string>(
    (openExceptions ?? [])
      .map((e: { trip_stop_id: string | null }) => e.trip_stop_id)
      .filter((id): id is string => !!id),
  );

  for (const trip of trips as TripRow[]) {
    try {
      await processTrip(admin, trip, settings, stopsWithOpenException, supabaseUrl, serviceKey, publicSiteUrl, result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`trip ${trip.id}: ${msg}`);
      console.error(`processTrip error ${trip.id}:`, err);
    }
  }

  return result;
}

async function processTrip(
  admin: ReturnType<typeof createClient>,
  trip: TripRow,
  settings: EtaSettings,
  stopsWithOpenException: Set<string>,
  supabaseUrl: string,
  serviceKey: string,
  publicSiteUrl: string,
  result: ProcessTenantResult,
): Promise<void> {
  // 2a. Laatste vehicle_position
  const { data: posRows, error: posErr } = await admin
    .from("vehicle_positions")
    .select("vehicle_id, lat, lng, speed, recorded_at")
    .eq("vehicle_id", trip.vehicle_id)
    .order("recorded_at", { ascending: false })
    .limit(1);
  if (posErr) {
    result.errors.push(`positions ${trip.id}: ${posErr.message}`);
    return;
  }
  const position = (posRows ?? [])[0] as VehiclePositionRow | undefined;
  if (!position) {
    // Zonder positie kunnen we niets voorspellen. Niet als fout loggen,
    // dit is normaal vlak na trip-start.
    return;
  }
  const currentLat = toNumber(position.lat);
  const currentLng = toNumber(position.lng);
  if (currentLat == null || currentLng == null) return;

  // 2b. Open trip-stops
  const { data: stops, error: stopsErr } = await admin
    .from("trip_stops")
    .select(
      "id, trip_id, order_id, stop_type, stop_sequence, stop_status, planned_time, planned_window_end, predicted_eta",
    )
    .eq("trip_id", trip.id)
    .in("stop_status", ["GEPLAND", "ONDERWEG"])
    .order("stop_sequence", { ascending: true });
  if (stopsErr) {
    result.errors.push(`stops ${trip.id}: ${stopsErr.message}`);
    return;
  }
  if (!stops || stops.length === 0) return;

  // 2c. Orders voor coordinaten en contact-gegevens
  const orderIds = (stops as TripStopRow[])
    .map((s) => s.order_id)
    .filter((id): id is string => !!id);
  let orderById = new Map<string, OrderRow>();
  if (orderIds.length > 0) {
    const { data: orders, error: ordersErr } = await admin
      .from("orders")
      .select(
        "id, order_number, recipient_phone, recipient_email, notification_preferences, geocoded_pickup_lat, geocoded_pickup_lng, geocoded_delivery_lat, geocoded_delivery_lng, pickup_address, delivery_address",
      )
      .in("id", orderIds);
    if (ordersErr) {
      result.errors.push(`orders ${trip.id}: ${ordersErr.message}`);
      return;
    }
    orderById = new Map(((orders ?? []) as OrderRow[]).map((o) => [o.id, o]));
  }

  // 3. Bouw remainingStops met geldige coords. Stops zonder coord skippen
  // we volledig, anders krijgen we 0-afstand en valse ETAs.
  const stopsWithCoords: Array<{ stop: TripStopRow; coord: LatLng }> = [];
  for (const stop of stops as TripStopRow[]) {
    const order = stop.order_id ? orderById.get(stop.order_id) : undefined;
    const coord = stopCoords(stop, order);
    if (coord) stopsWithCoords.push({ stop, coord });
  }
  if (stopsWithCoords.length === 0) return;

  const speedKmh = toNumber(position.speed) ?? undefined;
  const etaMinutes = calculateEtaMinutes({
    currentLat,
    currentLng,
    speedKmh: speedKmh ?? undefined,
    remainingStops: stopsWithCoords.map((s) => s.coord),
  });

  const now = Date.now();

  // Bestaande LEAD/UPDATE-rijen ophalen voor alle stops in deze trip in
  // één query, anders krijgen we N+1.
  const stopIds = stopsWithCoords.map((s) => s.stop.id);
  const { data: notifRows } = await admin
    .from("trip_stop_eta_notifications")
    .select("trip_stop_id, trigger_event, notified_eta")
    .in("trip_stop_id", stopIds);
  const notifMap = new Map<string, { lead?: string; update?: string }>();
  for (const row of (notifRows ?? []) as Array<{
    trip_stop_id: string;
    trigger_event: string;
    notified_eta: string;
  }>) {
    const entry = notifMap.get(row.trip_stop_id) ?? {};
    if (row.trigger_event === "CUSTOMER_LEAD") entry.lead = row.notified_eta;
    if (row.trigger_event === "CUSTOMER_UPDATE") entry.update = row.notified_eta;
    notifMap.set(row.trip_stop_id, entry);
  }

  for (let i = 0; i < stopsWithCoords.length; i++) {
    const { stop } = stopsWithCoords[i];
    const predictedEtaMs = now + etaMinutes[i] * 60_000;
    const predictedEtaIso = new Date(predictedEtaMs).toISOString();

    // 4. predicted_eta updaten als > 1 min afwijkt
    const currentPredictedMs = stop.predicted_eta
      ? new Date(stop.predicted_eta).getTime()
      : null;
    const shouldUpdate =
      currentPredictedMs == null ||
      Math.abs(predictedEtaMs - currentPredictedMs) > 60_000;
    if (shouldUpdate) {
      const { error: updErr } = await admin
        .from("trip_stops")
        .update({
          predicted_eta: predictedEtaIso,
          predicted_eta_updated_at: new Date(now).toISOString(),
        })
        .eq("id", stop.id);
      if (updErr) {
        result.errors.push(`update stop ${stop.id}: ${updErr.message}`);
      } else {
        result.stops_updated++;
      }
    }

    // 5. CUSTOMER_LEAD: aankomst binnen lead-window en nog geen LEAD-rij
    const order = stop.order_id ? orderById.get(stop.order_id) : undefined;
    const notif = notifMap.get(stop.id) ?? {};
    const minutesUntilArrival = (predictedEtaMs - now) / 60_000;

    if (
      settings.customer_notifications_enabled &&
      !notif.lead &&
      minutesUntilArrival <= settings.customer_push_lead_minutes &&
      minutesUntilArrival >= 0 &&
      order
    ) {
      const sent = await sendCustomerNotification({
        supabaseUrl,
        serviceKey,
        publicSiteUrl,
        tenantId: trip.tenant_id,
        order,
        predictedEtaIso,
      });
      if (sent) {
        const { error: insErr } = await admin
          .from("trip_stop_eta_notifications")
          .insert({
            trip_stop_id: stop.id,
            trigger_event: "CUSTOMER_LEAD",
            notified_eta: predictedEtaIso,
          });
        if (insErr && !insErr.message.includes("duplicate key")) {
          result.errors.push(`insert lead ${stop.id}: ${insErr.message}`);
        } else {
          result.leads_sent++;
          notif.lead = predictedEtaIso;
          notifMap.set(stop.id, notif);
        }
      }
    }

    // 6. CUSTOMER_UPDATE: LEAD bestaat, UPDATE niet, en ETA verschoven > drempel
    if (
      settings.customer_notifications_enabled &&
      notif.lead &&
      !notif.update &&
      order
    ) {
      const leadMs = new Date(notif.lead).getTime();
      const driftMs = Math.abs(predictedEtaMs - leadMs);
      if (driftMs >= settings.customer_update_threshold_minutes * 60_000) {
        const sent = await sendCustomerNotification({
          supabaseUrl,
          serviceKey,
          publicSiteUrl,
          tenantId: trip.tenant_id,
          order,
          predictedEtaIso,
        });
        if (sent) {
          const { error: insErr } = await admin
            .from("trip_stop_eta_notifications")
            .insert({
              trip_stop_id: stop.id,
              trigger_event: "CUSTOMER_UPDATE",
              notified_eta: predictedEtaIso,
            });
          if (insErr && !insErr.message.includes("duplicate key")) {
            result.errors.push(`insert update ${stop.id}: ${insErr.message}`);
          } else {
            result.updates_sent++;
            notif.update = predictedEtaIso;
            notifMap.set(stop.id, notif);
          }
        }
      }
    }

    // 7. PREDICTED_DELAY exception als ETA ruim na window-end ligt
    const windowEnd = windowEndTs(stop);
    if (windowEnd && !stopsWithOpenException.has(stop.id)) {
      const overrunMs = predictedEtaMs - windowEnd.getTime();
      if (overrunMs >= settings.predicted_delay_threshold_minutes * 60_000) {
        const overrunMin = Math.round(overrunMs / 60_000);
        const description =
          `Voorspelde aankomst ${new Date(predictedEtaMs).toISOString()} ` +
          `ligt ${overrunMin} minuten na het einde van het tijdvenster. ` +
          `Bel klant of zoek alternatief.`;
        const { error: excErr } = await admin
          .from("delivery_exceptions")
          .insert({
            tenant_id: trip.tenant_id,
            trip_id: trip.id,
            trip_stop_id: stop.id,
            order_id: stop.order_id,
            exception_type: "PREDICTED_DELAY",
            severity: settings.predicted_delay_severity,
            status: "OPEN",
            description,
          });
        if (excErr) {
          result.errors.push(`exception ${stop.id}: ${excErr.message}`);
        } else {
          result.exceptions_opened++;
          stopsWithOpenException.add(stop.id);
        }
      }
    }
  }
}

interface SendArgs {
  supabaseUrl: string;
  serviceKey: string;
  publicSiteUrl: string;
  tenantId: string;
  order: OrderRow;
  predictedEtaIso: string;
}

/**
 * Roep send-notification aan met trigger_event ETA_CHANGED. Slaat over als
 * er geen contactgegevens of voorkeuren zijn waarmee verzending kan slagen,
 * zodat we send-notification niet onnodig belasten.
 */
async function sendCustomerNotification(args: SendArgs): Promise<boolean> {
  const { supabaseUrl, serviceKey, publicSiteUrl, tenantId, order, predictedEtaIso } = args;

  const prefs = order.notification_preferences ?? { sms: false, email: true };
  const smsEnabled = !!prefs.sms;
  const emailEnabled = !!prefs.email;
  // Sla over als beide kanalen uit staan, of als beide contactvelden leeg
  // zijn. send-notification zelf bepaalt per template welk kanaal het
  // probeert, hier voorkomen we alleen onnodige aanroepen.
  if (!smsEnabled && !emailEnabled) return false;
  if (!order.recipient_phone && !order.recipient_email) return false;

  const trackUrl = `${publicSiteUrl}/track?q=${order.order_number}`;
  const body = {
    trigger_event: "ETA_CHANGED",
    tenant_id: tenantId,
    order_id: order.id,
    extra_variables: {
      predicted_eta: predictedEtaIso,
      track_url: trackUrl,
    },
  };

  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      console.warn(
        `send-notification niet ok voor order ${order.id}: ${resp.status} ${await resp
          .text()
          .catch(() => "")}`,
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error(`send-notification fetch faalde voor order ${order.id}:`, err);
    return false;
  }
}

serve(async (req) => {
  const preflight = handleOptions(req, CORS_OPTIONS);
  if (preflight) return preflight;
  const corsHeaders = corsFor(req, CORS_OPTIONS);

  if (!isTrustedCaller(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return new Response(JSON.stringify({ error: "Supabase env missing" }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  const PUBLIC_SITE_URL =
    Deno.env.get("PUBLIC_SITE_URL") ||
    SUPABASE_URL.replace(".supabase.co", ".app");

  const startedAt = Date.now();
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Tenants met minstens één actieve trip ophalen om onnodige queries op
  // slapende tenants te voorkomen.
  const { data: activeTrips, error: tripsErr } = await admin
    .from("trips")
    .select("tenant_id")
    .eq("dispatch_status", "ACTIEF");
  if (tripsErr) {
    return new Response(
      JSON.stringify({ error: `trips load failed: ${tripsErr.message}` }),
      { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }
  const tenantIds = [
    ...new Set(((activeTrips ?? []) as Array<{ tenant_id: string }>).map((t) => t.tenant_id)),
  ];

  console.log(`eta-watcher start, tenants=${tenantIds.length}`);

  let totalStopsUpdated = 0;
  let totalLeads = 0;
  let totalUpdates = 0;
  let totalExceptions = 0;
  const tenantResults: Array<{ tenant_id: string; result: ProcessTenantResult }> = [];

  for (const tenantId of tenantIds) {
    try {
      const r = await processTenant(admin, tenantId, SUPABASE_URL, SERVICE_KEY, PUBLIC_SITE_URL);
      totalStopsUpdated += r.stops_updated;
      totalLeads += r.leads_sent;
      totalUpdates += r.updates_sent;
      totalExceptions += r.exceptions_opened;
      tenantResults.push({ tenant_id: tenantId, result: r });
      if (r.errors.length > 0) {
        console.warn(`tenant ${tenantId} errors:`, r.errors);
      }
    } catch (err) {
      // Per-tenant error mag de hele draai niet stoppen.
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`processTenant ${tenantId} faalde:`, msg);
      tenantResults.push({
        tenant_id: tenantId,
        result: {
          trips_seen: 0,
          stops_updated: 0,
          leads_sent: 0,
          updates_sent: 0,
          exceptions_opened: 0,
          errors: [msg],
        },
      });
    }
  }

  const durationMs = Date.now() - startedAt;
  console.log(
    `eta-watcher klaar in ${durationMs}ms, stops_updated=${totalStopsUpdated}, leads=${totalLeads}, updates=${totalUpdates}, exceptions=${totalExceptions}`,
  );

  return new Response(
    JSON.stringify({
      ok: true,
      processed: tenantIds.length,
      stops_updated: totalStopsUpdated,
      leads_sent: totalLeads,
      updates_sent: totalUpdates,
      exceptions_opened: totalExceptions,
      duration_ms: durationMs,
      tenants: tenantResults,
    }),
    { status: 200, headers: { ...corsHeaders, "content-type": "application/json" } },
  );
});
