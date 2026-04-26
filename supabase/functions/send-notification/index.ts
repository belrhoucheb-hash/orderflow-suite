import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsFor, handleOptions } from "../_shared/cors.ts";
import { getUserAuth, isTrustedCaller } from "../_shared/auth.ts";
import { loadTenantSmtpConfig, sendEmailSmtp } from "../_shared/tenantMessaging.ts";

const CORS_OPTIONS = {
  extraHeaders: [
    "x-supabase-client-platform",
    "x-supabase-client-platform-version",
    "x-supabase-client-runtime",
    "x-supabase-client-runtime-version",
  ],
};

interface NotificationPayload {
  trigger_event: string;
  order_id?: string;
  trip_id?: string;
  tenant_id: string;
  recipient_email?: string;
  recipient_phone?: string;
  extra_variables?: Record<string, string>;
}

function sanitizeEmail(email: string): string | null {
  const cleaned = email.replace(/[\r\n]/g, "").trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(cleaned) ? cleaned : null;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => escapeHtml(variables[key] ?? ""));
}

async function sendSmsTwilio(params: {
  to: string;
  body: string;
  accountSid: string;
  authToken: string;
  fromNumber: string;
}): Promise<void> {
  const { to, body, accountSid, authToken, fromNumber } = params;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const formData = new URLSearchParams({
    To: to,
    From: fromNumber,
    Body: body,
  });

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
    },
    body: formData.toString(),
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    throw new Error(`Twilio SMS mislukt (${resp.status}): ${errBody}`);
  }
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const payload: NotificationPayload = await req.json();
    const { trigger_event, order_id, trip_id, tenant_id, extra_variables } = payload;

    if (!trigger_event || !tenant_id) {
      return new Response(
        JSON.stringify({ error: "trigger_event and tenant_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!trustedCaller && authTenantId !== tenant_id) {
      return new Response(
        JSON.stringify({ error: "Tenant mismatch" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: templates, error: tplErr } = await supabase
      .from("notification_templates")
      .select("*")
      .eq("tenant_id", tenant_id)
      .eq("trigger_event", trigger_event)
      .eq("is_active", true);
    if (tplErr) throw tplErr;
    if (!templates || templates.length === 0) {
      return new Response(
        JSON.stringify({ skipped: true, message: "No active templates for this event" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let order: any = null;
    if (order_id) {
      const { data } = await supabase
        .from("orders")
        .select("*, clients(name, contact_email, phone)")
        .eq("id", order_id)
        .eq("tenant_id", tenant_id)
        .single();
      order = data;
    }

    let trip: any = null;
    if (trip_id) {
      const { data } = await supabase
        .from("trips")
        .select("*, trip_stops(*), tenant_members!trips_driver_id_fkey(display_name)")
        .eq("id", trip_id)
        .eq("tenant_id", tenant_id)
        .single();
      trip = data;

      if (!order && trip?.trip_stops?.length > 0) {
        const firstOrderId = trip.trip_stops[0]?.order_id;
        if (firstOrderId) {
          const { data: orderData } = await supabase
            .from("orders")
            .select("*, clients(name, contact_email, phone)")
            .eq("id", firstOrderId)
            .eq("tenant_id", tenant_id)
            .single();
          order = orderData;
        }
      }
    }

    const { data: tenantData } = await supabase
      .from("tenants")
      .select("name, slug, logo, primary_color, fleet_manager_email")
      .eq("id", tenant_id)
      .single();

    const trackUrl = order
      ? `${Deno.env.get("PUBLIC_SITE_URL") || supabaseUrl.replace(".supabase.co", ".app")}/track?q=${order.order_number}`
      : "";

    const variables: Record<string, string> = {
      order_number: order?.order_number?.toString() ?? "",
      client_name: order?.client_name ?? order?.clients?.name ?? "",
      pickup_address: order?.pickup_address ?? "",
      delivery_address: order?.delivery_address ?? "",
      eta: trip?.eta ?? order?.time_window_end ?? "",
      track_url: trackUrl,
      driver_name: trip?.tenant_members?.display_name ?? "",
      company_name: tenantData?.name ?? "",
      company_logo: tenantData?.logo ?? "",
      ...(extra_variables ?? {}),
    };

    const isDamageEvent = trigger_event === "VEHICLE_DAMAGE";
    const recipientEmail = isDamageEvent
      ? (payload.recipient_email ?? tenantData?.fleet_manager_email ?? "")
      : (payload.recipient_email ??
         order?.recipient_email ??
         order?.clients?.contact_email ??
         order?.source_email_from?.match(/<([^>]+)>/)?.[1] ??
         order?.source_email_from ??
         "");
    const recipientPhone = isDamageEvent
      ? ""
      : (payload.recipient_phone ?? order?.recipient_phone ?? order?.clients?.phone ?? "");
    const prefs = isDamageEvent
      ? { email: true, sms: false }
      : (order?.notification_preferences ?? { email: true, sms: false });

    let smtpConfig = null as Awaited<ReturnType<typeof loadTenantSmtpConfig>> | null;
    try {
      smtpConfig = await loadTenantSmtpConfig(
        supabase,
        tenant_id,
        `${tenantData?.name ?? "OrderFlow"} Notificaties`,
      );
    } catch {
      smtpConfig = null;
    }

    const { data: smsSettings, error: smsSettingsError } = await supabase.rpc(
      "get_sms_settings_runtime",
      { p_tenant_id: tenant_id },
    );
    if (smsSettingsError) {
      throw new Error(`SMS-config ophalen mislukt: ${smsSettingsError.message}`);
    }
    const smsRuntime = (Array.isArray(smsSettings) ? smsSettings[0] : smsSettings) as any;
    const twilioSid = smsRuntime?.twilioAccountSid ?? "";
    const twilioToken = smsRuntime?.twilioAuthToken ?? "";
    const twilioFrom = smsRuntime?.twilioFromNumber ?? "";

    const results: Array<{ channel: string; status: string; error?: string }> = [];

    for (const tpl of templates) {
      const channel = tpl.channel as string;
      const renderedBody = renderTemplate(tpl.body_template, variables);
      const renderedSubject = tpl.subject_template
        ? renderTemplate(tpl.subject_template, variables)
        : "";

      const { data: logEntry, error: logErr } = await supabase
        .from("notification_log")
        .insert({
          tenant_id,
          template_id: tpl.id,
          order_id: order_id ?? order?.id ?? null,
          trip_id: trip_id ?? null,
          recipient_email: channel === "EMAIL" ? recipientEmail : null,
          recipient_phone: channel === "SMS" ? recipientPhone : null,
          channel,
          trigger_event,
          status: "QUEUED",
          subject: renderedSubject || null,
          body: renderedBody,
        })
        .select()
        .single();

      if (logErr) {
        console.error("Failed to create log entry:", logErr);
        continue;
      }

      try {
        if (channel === "EMAIL") {
          if (!prefs.email) {
            await supabase.from("notification_log").update({ status: "FAILED", error_message: "Email notifications disabled by preferences" }).eq("id", logEntry.id);
            results.push({ channel, status: "skipped_prefs" });
            continue;
          }
          const sanitizedRecipient = recipientEmail ? sanitizeEmail(recipientEmail) : null;
          if (!sanitizedRecipient) {
            await supabase.from("notification_log").update({ status: "FAILED", error_message: "No valid recipient email" }).eq("id", logEntry.id);
            results.push({ channel, status: "no_email" });
            continue;
          }
          if (!smtpConfig) {
            await supabase.from("notification_log").update({ status: "FAILED", error_message: "SMTP not configured" }).eq("id", logEntry.id);
            results.push({ channel, status: "smtp_not_configured" });
            continue;
          }

          await sendEmailSmtp({
            to: sanitizedRecipient,
            subject: renderedSubject,
            body: renderedBody,
            config: smtpConfig,
          });

          await supabase.from("notification_log").update({ status: "SENT", sent_at: new Date().toISOString() }).eq("id", logEntry.id);
          results.push({ channel, status: "sent" });
        } else if (channel === "SMS") {
          if (!prefs.sms) {
            await supabase.from("notification_log").update({ status: "FAILED", error_message: "SMS notifications disabled by preferences" }).eq("id", logEntry.id);
            results.push({ channel, status: "skipped_prefs" });
            continue;
          }
          if (!recipientPhone) {
            await supabase.from("notification_log").update({ status: "FAILED", error_message: "No recipient phone" }).eq("id", logEntry.id);
            results.push({ channel, status: "no_phone" });
            continue;
          }
          if (!twilioSid || !twilioToken || !twilioFrom) {
            await supabase.from("notification_log").update({ status: "FAILED", error_message: "Twilio not configured" }).eq("id", logEntry.id);
            results.push({ channel, status: "twilio_not_configured" });
            continue;
          }

          await sendSmsTwilio({
            to: recipientPhone,
            body: renderedBody,
            accountSid: twilioSid,
            authToken: twilioToken,
            fromNumber: twilioFrom,
          });

          await supabase.from("notification_log").update({ status: "SENT", sent_at: new Date().toISOString() }).eq("id", logEntry.id);
          results.push({ channel, status: "sent" });
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`Notification send error (${channel}):`, errMsg);
        await supabase.from("notification_log").update({ status: "FAILED", error_message: errMsg }).eq("id", logEntry.id);
        results.push({ channel, status: "failed", error: errMsg });
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("send-notification error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
