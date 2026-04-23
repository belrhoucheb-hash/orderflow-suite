// Daily scan: detect driver certificates that expire in 90, 30 or 7 days,
// or that expired today. Dispatch a notification per (record, trigger),
// deduplicated via driver_certificate_notifications_sent.
//
// Triggered by pg_cron at 07:00 UTC daily. Kan ook handmatig via
//   curl -X POST <fn-url> -H "Authorization: Bearer <service-key>"
// om een testrun te doen.
//
// Waarom deze split tussen scan en send: send-notification is een pure
// dispatch voor één event. Zij kent geen cron-logica en zou 10.000x
// dezelfde mail verzenden als we hem naief per record aanriepen. Deze
// laag zorgt voor deduplicatie en dagelijkse herhaalbaarheid.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { isTrustedCaller } from "../_shared/auth.ts";
import { corsFor, handleOptions } from "../_shared/cors.ts";

const CORS_OPTIONS = { extraHeaders: ["x-cron-secret"] };

interface ExpiringRecord {
  id: string;
  tenant_id: string;
  driver_id: string;
  certification_code: string;
  expiry_date: string;
}

interface Driver {
  id: string;
  name: string;
  email: string | null;
}

interface CertificationType {
  code: string;
  name: string;
  tenant_id: string;
}

interface Tenant {
  id: string;
  name: string | null;
  fleet_manager_email: string | null;
}

/**
 * Map aantal dagen-tot-verval naar het bijbehorende trigger_event.
 * We ronden naar beneden: dag 0 = vandaag vervallen, dag 7 = over precies
 * een week. De DB-query filtert op exacte matches van deze waarden, dus
 * elke dag wordt één waarschuwing voor elke mijlpaal mogelijk verstuurd.
 */
function triggerForDaysUntil(days: number): string | null {
  if (days === 0) return "CERTIFICATE_EXPIRED";
  if (days === 7) return "CERTIFICATE_EXPIRING_7D";
  if (days === 30) return "CERTIFICATE_EXPIRING_30D";
  if (days === 90) return "CERTIFICATE_EXPIRING_90D";
  return null;
}

function daysBetween(today: Date, target: Date): number {
  const ms = target.getTime() - today.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

serve(async (req) => {
  const preflight = handleOptions(req, CORS_OPTIONS);
  if (preflight) return preflight;
  const corsHeaders = corsFor(req, CORS_OPTIONS);

  // Cron-only: alleen pg_cron (service-role) of CRON_SECRET mag triggeren.
  if (!isTrustedCaller(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return new Response(
      JSON.stringify({ error: "Supabase env missing" }),
      { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Haal alle records op met een vervaldatum in de toekomst OF vandaag.
  // Records ver in de toekomst doen niks, maar het is goedkoper om in
  // geheugen te filteren dan per milestone een aparte query te doen.
  const { data: records, error: recErr } = await admin
    .from("driver_certification_expiry")
    .select("id, tenant_id, driver_id, certification_code, expiry_date")
    .not("expiry_date", "is", null);
  if (recErr) {
    console.error("load records", recErr);
    return new Response(JSON.stringify({ error: recErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  const targets: Array<ExpiringRecord & { trigger: string; days: number }> = [];
  for (const r of (records ?? []) as ExpiringRecord[]) {
    const exp = new Date(r.expiry_date + "T00:00:00Z");
    const diff = daysBetween(today, exp);
    const trigger = triggerForDaysUntil(diff);
    if (trigger) targets.push({ ...r, trigger, days: diff });
  }

  if (targets.length === 0) {
    return new Response(JSON.stringify({ processed: 0, sent: 0 }), {
      status: 200,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  // Dedupe: haal per (record_id, trigger) op of we al iets verstuurd
  // hebben. De UNIQUE-constraint op de dedupe-tabel maakt een tweede
  // insert onmogelijk, maar we willen ook niet onnodig send-notification
  // aanroepen als we weten dat het al gestuurd is.
  const { data: sent, error: sentErr } = await admin
    .from("driver_certificate_notifications_sent")
    .select("record_id, trigger_event");
  if (sentErr) {
    console.error("load sent", sentErr);
  }
  const sentKey = new Set((sent ?? []).map((s: any) => `${s.record_id}:${s.trigger_event}`));
  const queue = targets.filter((t) => !sentKey.has(`${t.id}:${t.trigger}`));

  if (queue.length === 0) {
    return new Response(JSON.stringify({ processed: targets.length, sent: 0, skipped: targets.length }), {
      status: 200,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  // Laad drivers en certificering-types in één keer om N+1 te vermijden.
  const driverIds = [...new Set(queue.map((q) => q.driver_id))];
  const { data: drivers } = await admin
    .from("drivers")
    .select("id, name, email")
    .in("id", driverIds);
  const driverById = new Map<string, Driver>(
    ((drivers ?? []) as Driver[]).map((d) => [d.id, d]),
  );

  const tenantIds = [...new Set(queue.map((q) => q.tenant_id))];
  const { data: certTypes } = await admin
    .from("driver_certifications")
    .select("code, name, tenant_id")
    .in("tenant_id", tenantIds);
  const certByKey = new Map<string, CertificationType>(
    ((certTypes ?? []) as CertificationType[]).map((c) => [`${c.tenant_id}:${c.code}`, c]),
  );

  const { data: tenants } = await admin
    .from("tenants")
    .select("id, name, fleet_manager_email")
    .in("id", tenantIds);
  const tenantById = new Map<string, Tenant>(
    ((tenants ?? []) as Tenant[]).map((t) => [t.id, t]),
  );

  let sentCount = 0;
  let failures = 0;

  for (const t of queue) {
    const driver = driverById.get(t.driver_id);
    const certType = certByKey.get(`${t.tenant_id}:${t.certification_code}`);
    const tenant = tenantById.get(t.tenant_id);

    if (!driver?.email) {
      // Zonder e-mail kunnen we niet mailen; log en markeer als verwerkt
      // zodat we dit record niet dagelijks opnieuw proberen.
      await admin.from("driver_certificate_notifications_sent").insert({
        tenant_id: t.tenant_id,
        record_id: t.id,
        trigger_event: t.trigger,
      });
      continue;
    }

    const extra = {
      driver_name: driver.name ?? "",
      certification_code: t.certification_code,
      certification_name: certType?.name ?? t.certification_code,
      expiry_date: t.expiry_date,
      days_until: String(t.days),
      tenant_name: tenant?.name ?? "",
    };

    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({
          trigger_event: t.trigger,
          tenant_id: t.tenant_id,
          recipient_email: driver.email,
          extra_variables: extra,
        }),
      });
      if (!resp.ok) {
        failures++;
        console.error(
          `send-notification failed for ${t.id} ${t.trigger}: ${resp.status}`,
          await resp.text().catch(() => ""),
        );
        continue;
      }

      await admin.from("driver_certificate_notifications_sent").insert({
        tenant_id: t.tenant_id,
        record_id: t.id,
        trigger_event: t.trigger,
      });
      sentCount++;
    } catch (err) {
      failures++;
      console.error(`dispatch error for ${t.id}`, err);
    }
  }

  return new Response(
    JSON.stringify({
      processed: targets.length,
      sent: sentCount,
      skipped: targets.length - queue.length,
      failures,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "content-type": "application/json" },
    },
  );
});
