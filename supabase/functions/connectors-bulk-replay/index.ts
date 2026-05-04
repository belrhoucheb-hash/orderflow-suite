// connectors-bulk-replay
//
// Placeholder voor de bulk-replay van mislukte connector-events binnen een
// tijdvenster (default 24u). Gevraagd vanuit de marketplace-bulk-actiebalk.
//
// TODO (volgende sprint):
//   1. Authenticatie: alleen tenant owner/admin via JWT en tenant-membership-check.
//   2. Query integration_sync_log waar tenant_id = body.tenant_id, status = 'FAILED'
//      en started_at >= now() - interval '<window_hours> hours'.
//   3. Voor elke rij, kijk welke connector-<provider> bestaat en stuur de
//      payload (uit details/payload-kolom) opnieuw via runConnectorAction.
//      Sla overgeslagen rijen over (success eerder geboekt = idempotency).
//   4. Schrijf één samenvattingsrij in integration_sync_log (direction='replay')
//      met aantallen.
//   5. Schrijf een audit-log rij per gepushte event (action='manual_replay').
//
// Voor nu retourneren we ok=true met queued=0 zodat de UI flow getest kan worden
// zonder echte side-effects.

import { corsFor, handleOptions } from "../_shared/cors.ts";

interface RequestBody {
  tenant_id?: string;
  window_hours?: number;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  const cors = corsFor(req);
  const headers = { ...cors, "Content-Type": "application/json" };

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), { status: 400, headers });
  }

  if (!body.tenant_id) {
    return new Response(JSON.stringify({ ok: false, error: "tenant_id verplicht" }), { status: 400, headers });
  }

  const windowHours = Math.min(168, Math.max(1, body.window_hours ?? 24));

  // TODO: Implementeer scan + replay zoals beschreven boven.
  return new Response(
    JSON.stringify({
      ok: true,
      queued: 0,
      window_hours: windowHours,
      message: "Bulk-replay placeholder, daadwerkelijke replay volgt in fase 4.1.",
    }),
    { headers },
  );
});
