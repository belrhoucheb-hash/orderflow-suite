// Start van de Exact-Online OAuth-flow.
//
// Frontend roept deze function aan met tenant_id en krijgt een
// authorize-URL terug met server-side opgeslagen Exact-config en een
// HMAC-signed `state`. Dat sluit de CSRF-vector waar de oude flow
// `state=tenantId` gebruikte zonder verificatie en voorkomt dat de browser
// client_id/redirect_uri kan laten afwijken van de callback-config.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getUserAuth } from "../_shared/auth.ts";
import { corsFor, handleOptions } from "../_shared/cors.ts";
import { signOAuthState } from "../_shared/oauth-state.ts";

const CORS_OPTIONS = {
  extraHeaders: [
    "x-supabase-client-platform",
    "x-supabase-client-platform-version",
    "x-supabase-client-runtime",
    "x-supabase-client-runtime-version",
  ],
};

const EXACT_AUTHORIZE = "https://start.exactonline.nl/api/oauth2/auth";

serve(async (req) => {
  const preflight = handleOptions(req, CORS_OPTIONS);
  if (preflight) return preflight;
  const corsHeaders = corsFor(req, CORS_OPTIONS);
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    if (req.method !== "POST") return json(405, { error: "Methode niet toegestaan" });

    const auth = await getUserAuth(req);
    if (!auth.ok) return json(auth.status, { error: auth.error });

    const body = await req.json().catch(() => ({}));
    const tenantId = String(body?.tenant_id ?? "").trim();
    if (!tenantId) {
      return json(400, {
        error: "tenant_id is verplicht",
      });
    }
    if (tenantId !== auth.tenantId) {
      return json(403, { error: "tenant_id komt niet overeen met sessie" });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: appAdmin } = await admin
      .from("user_roles")
      .select("id")
      .eq("user_id", auth.userId)
      .eq("role", "admin")
      .maybeSingle();

    let isAdmin = !!appAdmin;
    if (!isAdmin) {
      const { data: membership } = await admin
        .from("tenant_members")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("user_id", auth.userId)
        .in("role", ["owner", "admin"])
        .maybeSingle();
      isAdmin = !!membership;
    }
    if (!isAdmin) {
      return json(403, { error: "Alleen admins kunnen Exact koppelen" });
    }

    const { data: runtimeRows, error: runtimeError } = await admin.rpc(
      "get_integration_credentials_runtime",
      {
        p_tenant_id: tenantId,
        p_provider: "exact_online",
      },
    );
    if (runtimeError) {
      return json(500, { error: `Exact-config ophalen mislukt: ${runtimeError.message}` });
    }

    const runtime = Array.isArray(runtimeRows) ? runtimeRows[0] : runtimeRows;
    const credentials = (runtime?.credentials ?? {}) as Record<string, unknown>;
    const clientId = typeof credentials.clientId === "string" ? credentials.clientId.trim() : "";
    const redirectUri = typeof credentials.redirectUri === "string" ? credentials.redirectUri.trim() : "";
    if (!clientId || !redirectUri) {
      return json(400, { error: "Sla eerst Exact Client ID en Redirect URI op" });
    }

    const state = await signOAuthState(tenantId);
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      state,
      force_login: "1",
    });
    return json(200, {
      authorize_url: `${EXACT_AUTHORIZE}?${params.toString()}`,
    });
  } catch (e) {
    console.error(e);
    return json(500, { error: e instanceof Error ? e.message : String(e) });
  }
});
