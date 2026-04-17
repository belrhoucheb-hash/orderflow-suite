import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://orderflow-suite.vercel.app",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface NotificationPayload {
  trigger_event: string;
  order_id?: string;
  trip_id?: string;
  tenant_id: string;
  // Override recipients (optional — otherwise fetched from order/client)
  recipient_email?: string;
  recipient_phone?: string;
  // Extra variables to merge into template
  extra_variables?: Record<string, string>;
}

/**
 * Sanitize an email address to prevent SMTP injection.
 */
function sanitizeEmail(email: string): string | null {
  // Strip any newlines/carriage returns (SMTP injection prevention)
  const cleaned = email.replace(/[\r\n]/g, '').trim();
  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(cleaned) ? cleaned : null;
}

/**
 * HTML-escape a string to prevent XSS in rendered templates.
 */
function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Replace {{variable}} placeholders in a template string with HTML-escaped values.
 */
function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return escapeHtml(variables[key] ?? "");
  });
}

/**
 * Send email via SMTP (same pattern as send-confirmation).
 */
async function sendEmailSmtp(params: {
  to: string;
  from: string;
  fromName: string;
  subject: string;
  body: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassword: string;
}): Promise<void> {
  const { to, from, fromName, subject, body, smtpHost, smtpPort, smtpUser, smtpPassword } = params;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const conn = await Deno.connect({ hostname: smtpHost, port: smtpPort });

  async function sendLine(line: string) {
    await conn.write(encoder.encode(line + "\r\n"));
  }
  async function readResponse(): Promise<string> {
    const buf = new Uint8Array(4096);
    const n = await conn.read(buf);
    return n ? decoder.decode(buf.subarray(0, n)) : "";
  }

  await readResponse(); // greeting
  await sendLine("EHLO localhost");
  await readResponse();

  if (smtpPort === 587) {
    await sendLine("STARTTLS");
    await readResponse();
    const tlsConn = await Deno.startTls(conn, { hostname: smtpHost });
    const tlsEncoder = new TextEncoder();
    const tlsDecoder = new TextDecoder();

    async function tlsSend(line: string) {
      await tlsConn.write(tlsEncoder.encode(line + "\r\n"));
    }
    async function tlsRead(): Promise<string> {
      const buf = new Uint8Array(4096);
      const n = await tlsConn.read(buf);
      return n ? tlsDecoder.decode(buf.subarray(0, n)) : "";
    }

    await tlsSend("EHLO localhost");
    await tlsRead();
    await tlsSend("AUTH LOGIN");
    await tlsRead();
    await tlsSend(btoa(smtpUser));
    await tlsRead();
    await tlsSend(btoa(smtpPassword));
    const authResp = await tlsRead();
    if (!authResp.startsWith("235")) {
      tlsConn.close();
      throw new Error("SMTP authenticatie mislukt");
    }

    await tlsSend(`MAIL FROM:<${from}>`);
    const mailResp = await tlsRead();
    if (!mailResp.startsWith("2")) {
      tlsConn.close();
      throw new Error(`SMTP MAIL FROM afgewezen: ${mailResp.trim()}`);
    }
    await tlsSend(`RCPT TO:<${to}>`);
    const rcptResp = await tlsRead();
    if (!rcptResp.startsWith("2")) {
      tlsConn.close();
      throw new Error(`SMTP RCPT TO afgewezen: ${rcptResp.trim()}`);
    }
    await tlsSend("DATA");
    const dataResp = await tlsRead();
    if (!dataResp.startsWith("3")) {
      tlsConn.close();
      throw new Error(`SMTP DATA afgewezen: ${dataResp.trim()}`);
    }

    const emailContent = [
      `From: ${fromName} <${from}>`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `Content-Type: text/plain; charset=UTF-8`,
      ``,
      body,
      `.`,
    ].join("\r\n");

    await tlsSend(emailContent);
    const sendResp = await tlsRead();
    if (!sendResp.startsWith("2")) {
      tlsConn.close();
      throw new Error(`SMTP verzending mislukt: ${sendResp.trim()}`);
    }
    await tlsSend("QUIT");
    tlsConn.close();
  } else {
    // Non-TLS path
    await sendLine("AUTH LOGIN");
    await readResponse();
    await sendLine(btoa(smtpUser));
    await readResponse();
    await sendLine(btoa(smtpPassword));
    const authResp = await readResponse();
    if (!authResp.startsWith("235")) {
      conn.close();
      throw new Error("SMTP authenticatie mislukt");
    }

    await sendLine(`MAIL FROM:<${from}>`);
    const mailResp = await readResponse();
    if (!mailResp.startsWith("2")) {
      conn.close();
      throw new Error(`SMTP MAIL FROM afgewezen: ${mailResp.trim()}`);
    }
    await sendLine(`RCPT TO:<${to}>`);
    const rcptResp = await readResponse();
    if (!rcptResp.startsWith("2")) {
      conn.close();
      throw new Error(`SMTP RCPT TO afgewezen: ${rcptResp.trim()}`);
    }
    await sendLine("DATA");
    const dataResp = await readResponse();
    if (!dataResp.startsWith("3")) {
      conn.close();
      throw new Error(`SMTP DATA afgewezen: ${dataResp.trim()}`);
    }

    const emailContent = [
      `From: ${fromName} <${from}>`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `Content-Type: text/plain; charset=UTF-8`,
      ``,
      body,
      `.`,
    ].join("\r\n");

    await sendLine(emailContent);
    const sendResp = await readResponse();
    if (!sendResp.startsWith("2")) {
      conn.close();
      throw new Error(`SMTP verzending mislukt: ${sendResp.trim()}`);
    }
    await sendLine("QUIT");
    conn.close();
  }
}

/**
 * Send SMS via Twilio API.
 */
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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate authorization
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const payload: NotificationPayload = await req.json();
    const { trigger_event, order_id, trip_id, tenant_id, extra_variables } = payload;

    if (!trigger_event || !tenant_id) {
      return new Response(
        JSON.stringify({ error: "trigger_event and tenant_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── 1. Fetch active templates for this tenant + trigger ────
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
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── 2. Fetch order data for variables ──────────────────────
    let order: any = null;
    if (order_id) {
      const { data } = await supabase
        .from("orders")
        .select("*, clients(name, contact_email, phone)")
        .eq("id", order_id)
        .single();
      order = data;
    }

    // ─── 3. Fetch trip data for variables ───────────────────────
    let trip: any = null;
    if (trip_id) {
      const { data } = await supabase
        .from("trips")
        .select("*, trip_stops(*), tenant_members!trips_driver_id_fkey(display_name)")
        .eq("id", trip_id)
        .single();
      trip = data;

      // If no order_id was given, try to get it from the trip's first stop
      if (!order && trip?.trip_stops?.length > 0) {
        const firstOrderId = trip.trip_stops[0]?.order_id;
        if (firstOrderId) {
          const { data: orderData } = await supabase
            .from("orders")
            .select("*, clients(name, contact_email, phone)")
            .eq("id", firstOrderId)
            .single();
          order = orderData;
        }
      }
    }

    // ─── 4. Fetch tenant branding ───────────────────────────────
    const { data: tenantData } = await supabase
      .from("tenants")
      .select("name, slug, logo, primary_color, fleet_manager_email")
      .eq("id", tenant_id)
      .single();

    // ─── 5. Build template variables ────────────────────────────
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

    // ─── 6. Determine recipients ────────────────────────────────
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
      : (payload.recipient_phone ??
         order?.recipient_phone ??
         order?.clients?.phone ??
         "");

    // Damage events bypass order-level prefs (no order context).
    const prefs = isDamageEvent
      ? { email: true, sms: false }
      : (order?.notification_preferences ?? { email: true, sms: false });

    // ─── 7. SMTP config ─────────────────────────────────────────
    const smtpHost = Deno.env.get("SMTP_HOST") ?? "";
    const smtpUser = Deno.env.get("SMTP_USER") ?? "";
    const smtpPassword = Deno.env.get("SMTP_PASSWORD") ?? "";
    const smtpPort = parseInt(Deno.env.get("SMTP_PORT") || "587", 10);

    // ─── 8. Twilio config ───────────────────────────────────────
    const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
    const twilioToken = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
    const twilioFrom = Deno.env.get("TWILIO_FROM_NUMBER") ?? "";

    // ─── 9. Process each template ───────────────────────────────
    const results: Array<{ channel: string; status: string; error?: string }> = [];

    for (const tpl of templates) {
      const channel = tpl.channel as string;
      const renderedBody = renderTemplate(tpl.body_template, variables);
      const renderedSubject = tpl.subject_template
        ? renderTemplate(tpl.subject_template, variables)
        : "";

      // Create log entry as QUEUED
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
          if (!smtpHost || !smtpUser || !smtpPassword) {
            await supabase.from("notification_log").update({ status: "FAILED", error_message: "SMTP not configured" }).eq("id", logEntry.id);
            results.push({ channel, status: "smtp_not_configured" });
            continue;
          }

          await sendEmailSmtp({
            to: sanitizedRecipient,
            from: smtpUser,
            fromName: `${tenantData?.name ?? "OrderFlow"} Notificaties`,
            subject: renderedSubject,
            body: renderedBody,
            smtpHost,
            smtpPort,
            smtpUser,
            smtpPassword,
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
            // Try tenant-level settings from tenant_settings
            const { data: smsSettings } = await supabase
              .from("tenant_settings")
              .select("settings")
              .eq("tenant_id", tenant_id)
              .eq("category", "sms")
              .maybeSingle();

            const ts = smsSettings?.settings as any;
            const sid = ts?.twilioAccountSid || twilioSid;
            const token = ts?.twilioAuthToken || twilioToken;
            const from = ts?.twilioFromNumber || twilioFrom;

            if (!sid || !token || !from) {
              await supabase.from("notification_log").update({ status: "FAILED", error_message: "Twilio not configured" }).eq("id", logEntry.id);
              results.push({ channel, status: "twilio_not_configured" });
              continue;
            }

            await sendSmsTwilio({
              to: recipientPhone,
              body: renderedBody,
              accountSid: sid,
              authToken: token,
              fromNumber: from,
            });
          } else {
            await sendSmsTwilio({
              to: recipientPhone,
              body: renderedBody,
              accountSid: twilioSid,
              authToken: twilioToken,
              fromNumber: twilioFrom,
            });
          }

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
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("send-notification error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
