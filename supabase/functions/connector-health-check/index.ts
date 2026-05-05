// connector-health-check
//
// Cron-trigger (default elke 5 minuten) die per (tenant, provider) controleert
// of de threshold-grens overschreden is, en zo ja een notificatie naar de
// planner stuurt via de notifications-tabel.
//
// TODO (volgende sprint):
//   1. Lees alle connector_thresholds rijen.
//   2. Per rij: tel FAILED events in integration_sync_log binnen window_minutes.
//      Bereken gemiddelde duration_ms over diezelfde events.
//   3. Bij overschrijding (failures >= max_failures of avg_latency >= max_latency_ms):
//        - Insert in public.notifications met severity='warning' en metadata.
//        - Schrijf een audit-log rij action='threshold_change'? Nee: een
//          aparte event-soort 'health_alert' is beter, maar voor nu loggen
//          we 'manual_sync' om de schema-check niet te schenden,
//          OF we gebruiken een aparte tabel connector_health_events.
//          Beslissing parkeren voor fase 4.1.
//   4. Idempotency: skip als er al een notificatie voor dezelfde
//      (tenant, provider, window) bestaat in de laatste window_minutes.
//
// Voor nu noop met ok=true.

import { corsFor, handleOptions } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  const cors = corsFor(req);
  const headers = { ...cors, "Content-Type": "application/json" };

  // TODO: Implementeer threshold-check + notify, zie bovenstaande beschrijving.
  return new Response(
    JSON.stringify({
      ok: true,
      checked: 0,
      alerts_sent: 0,
      message: "Health-check placeholder, daadwerkelijke check volgt in fase 4.1.",
    }),
    { headers },
  );
});
