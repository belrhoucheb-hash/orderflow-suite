// connector-replay-event
//
// Stuurt een enkel sync-log event opnieuw door de bestaande connector-<provider>
// edge function. Wordt aangeroepen vanuit de Sync-log "Opnieuw proberen" knop
// of vanuit de bulk-multi-actie.
//
// TODO (volgende sprint):
//   1. Auth: tenant_members-check op (auth.uid(), tenant_id).
//   2. Lookup van het originele event uit integration_sync_log (id = original_event_id),
//      gebruik de oorspronkelijke event_type/payload als de aanroep niet edited=true.
//   3. Invoke connector-<provider> met action='push' (of 'pull' afhankelijk van direction).
//   4. Schrijf audit-log rij action='manual_replay' met details
//      { original_event_id, edited, new_event_id }.
//   5. Bulk-pad: itereer over bulk_event_ids met dezelfde flow.
//
// Voor nu echo'en we ok=true zodat de UI-flow getest kan worden.

import { corsFor, handleOptions } from "../_shared/cors.ts";

interface RequestBody {
  tenant_id?: string;
  provider?: string;
  original_event_id?: string;
  event_type?: string | null;
  payload?: Record<string, unknown>;
  edited?: boolean;
  bulk_event_ids?: string[];
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

  if (!body.tenant_id || !body.provider) {
    return new Response(
      JSON.stringify({ ok: false, error: "tenant_id en provider verplicht" }),
      { status: 400, headers },
    );
  }

  const isBulk = Array.isArray(body.bulk_event_ids) && body.bulk_event_ids.length > 0;

  // TODO: Echte replay-implementatie zoals beschreven boven.
  return new Response(
    JSON.stringify({
      ok: true,
      replayed: isBulk ? body.bulk_event_ids!.length : 1,
      provider: body.provider,
      edited: Boolean(body.edited),
      message: "Replay placeholder, doorvoer naar connector-<provider> volgt in fase 4.1.",
    }),
    { headers },
  );
});
