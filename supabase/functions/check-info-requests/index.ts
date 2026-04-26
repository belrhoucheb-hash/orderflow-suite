// §22 REQ-22.4 / REQ-22.5 — periodieke sweep van open info-requests.
//
// Logica:
//  1. PENDING-requests waarvan expected_by voorbij is → status = OVERDUE,
//     escalated_at zetten. Trigger op orders.info_status volgt via DB-trigger.
//  2. PENDING-requests binnen 4u vóór expected_by → stuur klant-reminder
//     als er nog geen reminder (of laatste reminder > 3u geleden).
//  3. OVERDUE-requests → insert planner-notification (type = info_escalation)
//     als er nog geen escalatie-notification bestaat voor dit request.
//
// Werkt ook eenmalig per request: POST { request_id, force: true }.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsFor, handleOptions } from "../_shared/cors.ts";
import { getUserAuth, isTrustedCaller } from "../_shared/auth.ts";
import { loadTenantSmtpConfig, sendEmailSmtp } from "../_shared/tenantMessaging.ts";

const CORS_OPTIONS = { extraHeaders: ["x-cron-secret"] };

const REMINDER_THRESHOLD_HOURS = 4;
const MIN_REMINDER_GAP_MS = 3 * 60 * 60 * 1000; // niet vaker dan 1x/3u

interface InfoRequestRow {
  id: string;
  tenant_id: string;
  order_id: string;
  field_name: string;
  field_label: string | null;
  status: string;
  promised_by_name: string | null;
  promised_by_email: string | null;
  expected_by: string | null;
  reminder_sent_at: string[];
  escalated_at: string | null;
}

interface OrderRow {
  id: string;
  order_number: number;
  client_name: string | null;
  tenant_id: string;
  time_window_start: string | null;
  pickup_address: string | null;
}

serve(async (req) => {
  const preflight = handleOptions(req, CORS_OPTIONS);
  if (preflight) return preflight;
  const corsHeaders = corsFor(req, CORS_OPTIONS);

  // Twee geldige routes:
  //   1. Cron / DB-trigger met service-role JWT of CRON_SECRET (volledige sweep).
  //   2. Geauthenticeerde planner via UI ("Nu herinneren"-knop) met user-JWT.
  if (!isTrustedCaller(req)) {
    const auth = await getUserAuth(req);
    if (!auth.ok) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    let forced: { request_id?: string; force?: boolean } = {};
    try {
      if (req.method === "POST") forced = await req.json();
    } catch { /* niet-POST of empty body */ }

    const summary = {
      swept_to_overdue: 0,
      reminders_sent: 0,
      escalations_created: 0,
      errors: [] as string[],
    };

    // ── 1. Overdue sweep ──
    const { error: sweepErr } = await supabase.rpc("sweep_overdue_info_requests");
    if (sweepErr) summary.errors.push(`sweep: ${sweepErr.message}`);

    // ── 2. Select relevante open requests ──
    const now = new Date();
    const horizon = new Date(now.getTime() + REMINDER_THRESHOLD_HOURS * 60 * 60 * 1000);

    let query = supabase
      .from("order_info_requests")
      .select("*")
      .in("status", ["PENDING", "OVERDUE"]);

    if (forced.request_id) {
      query = query.eq("id", forced.request_id);
    } else {
      // Alleen requests die binnen horizon liggen of al OVERDUE zijn
      query = query.or(`expected_by.lte.${horizon.toISOString()},status.eq.OVERDUE`);
    }

    const { data: requests, error: qErr } = await query;
    if (qErr) {
      summary.errors.push(`query: ${qErr.message}`);
      return new Response(JSON.stringify(summary), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rows = (requests ?? []) as InfoRequestRow[];
    if (rows.length === 0) {
      return new Response(JSON.stringify({ ...summary, checked: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch orders in één batch
    const orderIds = Array.from(new Set(rows.map(r => r.order_id)));
    const { data: orders } = await supabase
      .from("orders")
      .select("id, order_number, client_name, tenant_id, time_window_start, pickup_address")
      .in("id", orderIds);
    const orderById: Record<string, OrderRow> = {};
    (orders ?? []).forEach((o: any) => { orderById[o.id] = o as OrderRow; });

    // ── 3. Verwerk per request ──
    for (const r of rows) {
      const order = orderById[r.order_id];
      if (!order) continue;

      const lastReminder = r.reminder_sent_at.length > 0
        ? new Date(r.reminder_sent_at[r.reminder_sent_at.length - 1]).getTime()
        : 0;
      const tooSoon = !forced.force && (now.getTime() - lastReminder < MIN_REMINDER_GAP_MS);

      const shouldRemindClient =
        r.status === "PENDING" &&
        !!r.promised_by_email &&
        !tooSoon;

      if (shouldRemindClient || forced.force) {
        try {
          await sendClientReminder(supabase, r, order);
          const updated = [...r.reminder_sent_at, now.toISOString()];
          await supabase
            .from("order_info_requests")
            .update({ reminder_sent_at: updated })
            .eq("id", r.id);
          summary.reminders_sent += 1;
        } catch (e: any) {
          summary.errors.push(`reminder ${r.id}: ${e.message}`);
        }
      }

      // Escalatie bij OVERDUE — maximaal 1 notification per request
      if (r.status === "OVERDUE") {
        const { data: existing } = await supabase
          .from("notifications")
          .select("id")
          .eq("order_id", r.order_id)
          .eq("type", "info_escalation")
          .contains("metadata", { info_request_id: r.id })
          .limit(1);

        if (!existing || existing.length === 0) {
          const { error: nErr } = await supabase.from("notifications").insert({
            tenant_id: r.tenant_id,
            order_id: r.order_id,
            type: "info_escalation",
            title: `Info verlopen — #${order.order_number}`,
            message: `${r.field_label ?? r.field_name} nog niet ontvangen van ${order.client_name ?? "klant"}.`,
            icon: "alert-triangle",
            metadata: { info_request_id: r.id, field_name: r.field_name },
            is_read: false,
          });
          if (nErr) summary.errors.push(`escalation ${r.id}: ${nErr.message}`);
          else summary.escalations_created += 1;
        }
      }
    }

    return new Response(JSON.stringify({ ...summary, checked: rows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e.message, stack: e.stack }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

// ── Mail-helper — lichte SMTP. Leunt op ENV. Faalt stil als SMTP niet ge-config'd is. ──
async function sendClientReminder(
  supabase: ReturnType<typeof createClient>,
  req: InfoRequestRow,
  order: OrderRow,
): Promise<void> {
  const toEmail = req.promised_by_email;
  if (!toEmail) {
    throw new Error("SMTP of ontvanger niet geconfigureerd");
  }

  const subject = `Herinnering: ${req.field_label ?? req.field_name} voor order #${order.order_number}`;
  const pickup = order.time_window_start
    ? new Date(order.time_window_start).toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" })
    : "spoedig";

  const body = [
    `Beste ${req.promised_by_name ?? "relatie"},`,
    ``,
    `Voor order #${order.order_number} (${order.client_name ?? ""}) wachten wij nog op:`,
    `• ${req.field_label ?? req.field_name}`,
    ``,
    `Pickup staat gepland ${pickup}${order.pickup_address ? ` op ${order.pickup_address}` : ""}.`,
    `Zonder deze gegevens kan onze chauffeur op het laadadres niet verder.`,
    ``,
    `Graag per kerende reply de ontbrekende info aanleveren.`,
    ``,
    `Met vriendelijke groet,`,
    `Planning`,
  ].join("\n");

  const smtpConfig = await loadTenantSmtpConfig(supabase, order.tenant_id, "Planning");
  await sendEmailSmtp({ to: toEmail, subject, body, config: smtpConfig });
}
