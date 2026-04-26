// Helper voor edge functions om connector-pushes direct te starten,
// onafhankelijk van klant-webhook-subscriptions.
//
// Het oude pad (DB-webhook op webhook_deliveries → connector-dispatcher)
// werkt alleen als er een matchende klant-subscription is. Voor onze
// eigen connectoren (Snelstart, Exact, ...) mag dat geen voorwaarde
// zijn: een tenant zonder klant-webhooks moet z'n facturen toch naar
// het boekhoudpakket kunnen pushen.
//
// Daarom roept de pipeline-trigger / financial-trigger deze helper
// rechtstreeks aan na elke status-transitie. De connector-dispatcher
// accepteert een DIRECT-payload en start de push los van de outbox.
//
// Fouten worden gelogd maar niet re-throwd: een falende connector-push
// mag nooit de orderflow blokkeren.

const CONNECTOR_EVENT_TYPES = new Set<string>([
  "invoice.sent",
  "invoice.created",
]);

export function isConnectorEvent(eventType: string): boolean {
  return CONNECTOR_EVENT_TYPES.has(eventType);
}

export async function triggerConnectors(
  tenantId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!isConnectorEvent(eventType)) return;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[trigger-connectors] missing SUPABASE_URL or service-role key");
    return;
  }

  const url = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/connector-dispatcher`;
  const body = {
    type: "DIRECT",
    record: {
      tenant_id: tenantId,
      event_type: eventType,
      payload,
    },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(
        `[trigger-connectors] dispatcher returned ${res.status} for ${eventType}: ${text}`,
      );
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[trigger-connectors] threw for ${eventType}: ${message}`);
  }
}
