// Connector-exact_online: gateway voor Exact Online via runtime.
//
// Aanroep:
//   POST { action: 'push'|'test', tenant_id, event_type?, payload? }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { isTrustedCaller } from "../_shared/auth.ts";
import { corsFor, handleOptions } from "../_shared/cors.ts";
import { loadConfig, runConnectorAction } from "../_shared/connectors/runtime.ts";
import { ExactConnector } from "../_shared/connectors/exact-impl.ts";

const PROVIDER = "exact_online";

interface RequestBody {
  action: "push" | "test";
  tenant_id: string;
  event_type?: string;
  payload?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  const cors = corsFor(req);
  const headers = { ...cors, "Content-Type": "application/json" };

  if (!isTrustedCaller(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers });
  }

  if (!body.tenant_id) {
    return new Response(JSON.stringify({ error: "tenant_id verplicht" }), { status: 400, headers });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  let config;
  try {
    config = await loadConfig(supabase, body.tenant_id, PROVIDER);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 200, headers });
  }

  if (body.action === "test") {
    const result = await runConnectorAction(
      supabase,
      { tenantId: body.tenant_id, provider: PROVIDER, direction: "test" },
      () => ExactConnector.testConnection(config, supabase),
    );
    return new Response(JSON.stringify(result), { status: 200, headers });
  }

  if (body.action === "push") {
    const eventType = body.event_type ?? "invoice.sent";
    const payload = body.payload ?? {};
    const result = await runConnectorAction(
      supabase,
      {
        tenantId: body.tenant_id,
        provider: PROVIDER,
        direction: "push",
        eventType,
        entityType: "invoice",
        entityId: payload.entity_id as string | undefined,
      },
      () => ExactConnector.push(eventType, payload, config, supabase),
    );
    return new Response(JSON.stringify(result), { status: 200, headers });
  }

  return new Response(JSON.stringify({ error: `Onbekende action: ${body.action}` }), {
    status: 400,
    headers,
  });
});
