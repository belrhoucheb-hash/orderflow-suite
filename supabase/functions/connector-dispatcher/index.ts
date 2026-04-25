// Connector-dispatcher: vertaalt outbound webhook-events naar connector-pushes.
//
// Wordt getriggerd op één van twee manieren:
//   1. DB-webhook bij INSERT op webhook_deliveries (lage latency)
//   2. Cron, voor late processing als #1 faalt
//
// Voor elke recente delivery van een specifiek event-type kijkt de
// dispatcher of er ENABLED integration_credentials zijn voor providers
// die dat event in hun catalog ondersteunen, en roept de bijbehorende
// connector aan via runConnectorAction.
//
// Zelfde patroon als webhook-dispatcher (sprint 5), maar gericht op
// onze eigen connectoren in plaats van klant-URLs.

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
  id: string;
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

  // Twee triggers: DB-webhook (body met record) of cron.
  let specificDelivery: WebhookDeliveryRecord | null = null;
  try {
    const body = await req.json();
    if (body?.type === "INSERT" && body?.table === "webhook_deliveries" && body?.record) {
      specificDelivery = body.record as WebhookDeliveryRecord;
    }
  } catch {
    /* cron-call */
  }

  const deliveries = specificDelivery
    ? [specificDelivery]
    : await fetchRecentDeliveries(supabase);

  let processed = 0;
  let pushed = 0;

  for (const d of deliveries) {
    const providers = PROVIDERS_FOR_EVENT[d.event_type] ?? [];
    if (providers.length === 0) continue;

    for (const provider of providers) {
      const connector = CONNECTORS[provider as keyof typeof CONNECTORS];
      if (!connector) continue;

      let config;
      try {
        config = await loadConfig(supabase, d.tenant_id, provider);
      } catch {
        continue; // provider niet geconfigureerd of disabled voor deze tenant
      }

      processed++;
      const result = await runConnectorAction(
        supabase,
        {
          tenantId: d.tenant_id,
          provider,
          direction: "push",
          eventType: d.event_type,
          entityType: (d.payload.entity_type as string) ?? "invoice",
          entityId: d.payload.entity_id as string | undefined,
        },
        () => connector.push(d.event_type, d.payload, config!, supabase),
      );
      if (result.ok) pushed++;
    }
  }

  return new Response(JSON.stringify({ deliveries: deliveries.length, processed, pushed }), {
    status: 200,
    headers,
  });
});

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
