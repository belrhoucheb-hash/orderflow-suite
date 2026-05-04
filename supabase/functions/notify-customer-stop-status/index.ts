// Klant-broadcast pipeline.
//
// Triggert bij een stop-status overgang naar ONDERWEG, AANGEKOMEN, AFGELEVERD
// of MISLUKT. Bouwt een NL bericht en distribueert via twee kanalen:
//   1. portal-notificatie (rij in `notifications`) voor elke client_portal_user
//      van de klant; verschijnt direct in het klantportaal via realtime.
//   2. email/SMS via de bestaande `send-notification` Edge Function (gebruikt
//      tenant SMTP + notification_templates).
//
// Tenant-isolation: alle queries leggen tenant_id expliciet vast.
// Settings: tenant_settings.general.broadcast_stop_updates (default true).
// Fail-soft: ontbrekende order/template/SMTP wordt gelogd, niet gegooid,
// zodat een mislukte broadcast nooit de chauffeur-mutation blokkeert.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsFor, handleOptions } from "../_shared/cors.ts";
import { getUserAuth, isTrustedCaller } from "../_shared/auth.ts";

const CORS_OPTIONS = { extraHeaders: [] };

type StopStatus =
  | "ONDERWEG"
  | "AANGEKOMEN"
  | "AFGELEVERD"
  | "MISLUKT"
  | "OVERGESLAGEN";

interface RequestBody {
  trip_stop_id: string;
  status: StopStatus;
  reason?: string;
  pod_url?: string | null;
}

interface PortalMessage {
  title: string;
  body: string;
  triggerEvent: string | null;
  iconType: string;
}

function buildMessage(params: {
  status: StopStatus;
  eta: string;
  reason?: string;
  podUrl?: string | null;
  orderNumber: string;
}): PortalMessage | null {
  const { status, eta, reason, podUrl, orderNumber } = params;
  switch (status) {
    case "ONDERWEG":
      return {
        title: "Zending onderweg",
        body: eta
          ? `Uw zending ${orderNumber} is onderweg. Geschatte aankomst: ${eta}.`
          : `Uw zending ${orderNumber} is onderweg.`,
        triggerEvent: "TRIP_STARTED",
        iconType: "info",
      };
    case "AANGEKOMEN":
      return {
        title: "Chauffeur is gearriveerd",
        body: `De chauffeur is aangekomen voor zending ${orderNumber}.`,
        triggerEvent: "DRIVER_ARRIVED",
        iconType: "info",
      };
    case "AFGELEVERD":
      return {
        title: "Zending afgeleverd",
        body: podUrl
          ? `Uw zending ${orderNumber} is afgeleverd. Bekijk de POD: ${podUrl}`
          : `Uw zending ${orderNumber} is afgeleverd.`,
        triggerEvent: "DELIVERED",
        iconType: "success",
      };
    case "MISLUKT":
      return {
        title: "Bezorging niet gelukt",
        body: reason
          ? `Bezorging niet gelukt voor zending ${orderNumber}. Reden: ${reason}.`
          : `Bezorging niet gelukt voor zending ${orderNumber}.`,
        triggerEvent: "EXCEPTION",
        iconType: "warning",
      };
    case "OVERGESLAGEN":
      return {
        title: "Stop overgeslagen",
        body: reason
          ? `Een stop voor zending ${orderNumber} is overgeslagen. Reden: ${reason}.`
          : `Een stop voor zending ${orderNumber} is overgeslagen.`,
        triggerEvent: "EXCEPTION",
        iconType: "warning",
      };
  }
}

async function readBroadcastEnabled(supabase: ReturnType<typeof createClient>, tenantId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("tenant_settings")
    .select("settings")
    .eq("tenant_id", tenantId)
    .eq("category", "general")
    .maybeSingle();
  if (error) return true;
  const value = (data?.settings as Record<string, unknown> | null | undefined)?.broadcast_stop_updates;
  if (typeof value === "boolean") return value;
  return true;
}

serve(async (req) => {
  const preflight = handleOptions(req, CORS_OPTIONS);
  if (preflight) return preflight;
  const corsHeaders = corsFor(req, CORS_OPTIONS);

  try {
    const trustedCaller = isTrustedCaller(req);
    let authTenantId: string | null = null;
    if (!trustedCaller) {
      const auth = await getUserAuth(req);
      if (!auth.ok) {
        return new Response(JSON.stringify({ error: auth.error }), {
          status: auth.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      authTenantId = auth.tenantId;
    }

    const body = (await req.json()) as RequestBody;
    if (!body.trip_stop_id || !body.status) {
      return new Response(JSON.stringify({ error: "trip_stop_id en status zijn vereist" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Trip stop -> trip -> tenant + order
    const { data: stop, error: stopErr } = await supabase
      .from("trip_stops")
      .select("id, trip_id, order_id, planned_time")
      .eq("id", body.trip_stop_id)
      .single();
    if (stopErr || !stop) {
      console.warn("notify-customer-stop-status: stop niet gevonden", body.trip_stop_id);
      return new Response(JSON.stringify({ skipped: "stop_not_found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: trip } = await supabase
      .from("trips")
      .select("tenant_id")
      .eq("id", stop.trip_id)
      .single();
    const tenantId = trip?.tenant_id as string | undefined;
    if (!tenantId) {
      return new Response(JSON.stringify({ skipped: "tenant_unresolved" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!trustedCaller && authTenantId !== tenantId) {
      return new Response(JSON.stringify({ error: "Tenant mismatch" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const broadcastEnabled = await readBroadcastEnabled(supabase, tenantId);
    if (!broadcastEnabled) {
      return new Response(JSON.stringify({ skipped: "broadcast_disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!stop.order_id) {
      return new Response(JSON.stringify({ skipped: "no_order_on_stop" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: order } = await supabase
      .from("orders")
      .select("id, order_number, client_id, time_window_end")
      .eq("id", stop.order_id)
      .eq("tenant_id", tenantId)
      .single();

    if (!order) {
      return new Response(JSON.stringify({ skipped: "order_not_found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const eta = order.time_window_end ? String(order.time_window_end) : "";
    const message = buildMessage({
      status: body.status,
      eta,
      reason: body.reason,
      podUrl: body.pod_url ?? null,
      orderNumber: order.order_number?.toString() ?? "",
    });
    if (!message) {
      return new Response(JSON.stringify({ skipped: "no_message_for_status" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Vind portal-users voor deze klant.
    let portalUserIds: string[] = [];
    if (order.client_id) {
      const { data: portalUsers } = await supabase
        .from("client_portal_users")
        .select("user_id")
        .eq("tenant_id", tenantId)
        .eq("client_id", order.client_id)
        .eq("is_active", true);
      portalUserIds = (portalUsers ?? []).map((u: any) => u.user_id).filter(Boolean);
    }

    // Insert portal-notificaties (één per portal-user, plus 1 broadcast met user_id NULL als fallback).
    const notificationRows = (portalUserIds.length > 0 ? portalUserIds : [null]).map((uid) => ({
      tenant_id: tenantId,
      type: message.iconType,
      title: message.title,
      message: message.body,
      icon: "package",
      order_id: order.id,
      user_id: uid,
      is_read: false,
      metadata: {
        trip_stop_id: stop.id,
        trip_id: stop.trip_id,
        status: body.status,
        order_number: order.order_number,
      },
    }));

    const { error: notifErr } = await supabase.from("notifications").insert(notificationRows);
    if (notifErr) {
      console.error("notify-customer-stop-status: portal-insert mislukt", notifErr);
    }

    // Email/SMS via bestaande pipeline. Falen mag niet gooien.
    if (message.triggerEvent) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            trigger_event: message.triggerEvent,
            tenant_id: tenantId,
            order_id: order.id,
            trip_id: stop.trip_id,
            extra_variables: {
              stop_status: body.status,
              failure_reason: body.reason ?? "",
              pod_url: body.pod_url ?? "",
            },
          }),
        });
      } catch (err) {
        console.error("notify-customer-stop-status: send-notification dispatch mislukt", err);
      }
    }

    return new Response(
      JSON.stringify({ success: true, recipients: portalUserIds.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("notify-customer-stop-status error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
