// Connector-dispatcher: vertaalt status-transities naar connector-pushes.
//
// Wordt getriggerd op één van drie manieren:
//   1. DIRECT-call vanuit pipeline-trigger / financial-trigger (lage
//      latency, onafhankelijk van klant-webhook-subscriptions). Dit is
//      het primaire pad voor onze eigen connectoren.
//   2. DB-webhook bij INSERT op webhook_deliveries (legacy; werkt
//      alleen als er een matchende klant-subscription is).
//   3. Cron, als catch-up voor late processing.
//
// Voor elke trigger kijkt de dispatcher of er ENABLED
// integration_credentials zijn voor providers die dat event ondersteunen,
// en roept de bijbehorende connector aan via runConnectorAction. Op het
// cron-pad wordt eerst gecheckt of er al een succesvolle push voor de
// (tenant, provider, entity) bestaat in integration_sync_log; zo ja,
// dan wordt de actie overgeslagen om dubbele boekingen te voorkomen.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { isTrustedCaller } from "../_shared/auth.ts";
import { corsFor, handleOptions } from "../_shared/cors.ts";
import { loadConfig, runConnectorAction } from "../_shared/connectors/runtime.ts";
import { SnelstartConnector } from "../_shared/connectors/snelstart-impl.ts";
import { ExactConnector } from "../_shared/connectors/exact-impl.ts";

const PROVIDERS_FOR_EVENT: Record<string, string[]> = {
  "invoice.sent": ["snelstart", "exact_online"],
  "invoice.created": [],
};

const CONNECTORS = {
  snelstart: SnelstartConnector,
  exact_online: ExactConnector,
} as const;

interface WebhookDeliveryRecord {
  id?: string;
  tenant_id: string;
  event_type: string;
  payload: Record<string, unknown>;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  const cors = corsFor(req);
  const headers = { ...cors, "Content-Type": "application/json" };

  if (!isTrustedCaller(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Drie triggers: DIRECT (pipeline/financial), DB-webhook (klant-outbox), of cron.
  let directDelivery: WebhookDeliveryRecord | null = null;
  let webhookDelivery: WebhookDeliveryRecord | null = null;
  let isCronCatchup = false;
  try {
    const body = await req.json();
    if (body?.type === "DIRECT" && body?.record) {
      directDelivery = body.record as WebhookDeliveryRecord;
    } else if (body?.type === "INSERT" && body?.table === "webhook_deliveries" && body?.record) {
      webhookDelivery = body.record as WebhookDeliveryRecord;
    } else {
      isCronCatchup = true;
    }
  } catch {
    isCronCatchup = true;
  }

  const deliveries = directDelivery
    ? [directDelivery]
    : webhookDelivery
      ? [webhookDelivery]
      : await fetchRecentDeliveries(supabase);

  let processed = 0;
  let pushed = 0;
  let skippedDuplicates = 0;

  for (const d of deliveries) {
    const providers = PROVIDERS_FOR_EVENT[d.event_type] ?? [];
    if (providers.length === 0) continue;

    const entityType = (d.payload.entity_type as string) ?? "invoice";
    const entityId = d.payload.entity_id as string | undefined;

    for (const provider of providers) {
      const connector = CONNECTORS[provider as keyof typeof CONNECTORS];
      if (!connector) continue;

      let config;
      try {
        config = await loadConfig(supabase, d.tenant_id, provider);
      } catch {
        continue; // provider niet geconfigureerd of disabled voor deze tenant
      }

      // Op het webhook- en cron-pad: skip als deze entity al succesvol is
      // gepushed naar deze provider. Het DIRECT-pad krijgt de strakke
      // waarborg vanuit de aanroeper (status-transitie firet één keer).
      if (!directDelivery && entityId) {
        const alreadyPushed = await hasSuccessfulPush(
          supabase,
          d.tenant_id,
          provider,
          d.event_type,
          entityType,
          entityId,
        );
        if (alreadyPushed) {
          skippedDuplicates++;
          continue;
        }
      }

      processed++;
      const result = await runConnectorAction(
        supabase,
        {
          tenantId: d.tenant_id,
          provider,
          direction: "push",
          eventType: d.event_type,
          entityType,
          entityId,
        },
        () => connector.push(d.event_type, d.payload, config!, supabase),
      );
      if (result.ok) pushed++;
    }
  }

  void isCronCatchup;

  return new Response(
    JSON.stringify({
      deliveries: deliveries.length,
      processed,
      pushed,
      skipped_duplicates: skippedDuplicates,
    }),
    { status: 200, headers },
  );
});

async function hasSuccessfulPush(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  provider: string,
  eventType: string,
  entityType: string,
  entityId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("integration_sync_log")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("provider", provider)
    .eq("direction", "push")
    .eq("status", "SUCCESS")
    .eq("event_type", eventType)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[connector-dispatcher] dedup-check failed:", error.message);
    return false;
  }
  return !!data;
}

async function fetchRecentDeliveries(
  supabase: ReturnType<typeof createClient>,
): Promise<WebhookDeliveryRecord[]> {
  // Pak laatste 50 deliveries van laatste 5 minuten waar we connectoren voor hebben.
  const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const eventTypes = Object.keys(PROVIDERS_FOR_EVENT).filter(
    (e) => PROVIDERS_FOR_EVENT[e].length > 0,
  );

  const { data, error } = await supabase
    .from("webhook_deliveries")
    .select("id, tenant_id, event_type, payload")
    .in("event_type", eventTypes)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[connector-dispatcher] fetch failed:", error.message);
    return [];
  }
  return (data ?? []) as WebhookDeliveryRecord[];
}
