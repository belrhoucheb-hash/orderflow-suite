// OAuth-callback voor Exact Online.
//
// De UI start de flow door de gebruiker naar Exact's authorize-URL te
// sturen met state=tenant_id en redirect_uri naar deze function. Exact
// roept ons hier terug met ?code=... en ?state=tenant_id. Wij ruilen
// de code voor access+refresh-token en slaan die op in
// integration_credentials.
//
// Returnt een HTML-pagina die de UI signaleert klaar te zijn (postMessage
// of window.close), zodat de gebruiker terugvalt naar Settings.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const EXACT_TOKEN = "https://start.exactonline.nl/api/oauth2/token";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return htmlPage(`Verbinden geannuleerd: ${error}`, false);
  }
  if (!code || !state) {
    return htmlPage("Ongeldige callback (code of state ontbreekt)", false);
  }

  const tenantId = state;

  const clientId = Deno.env.get("EXACT_CLIENT_ID");
  const clientSecret = Deno.env.get("EXACT_CLIENT_SECRET");
  const redirectUri = Deno.env.get("EXACT_REDIRECT_URI");

  if (!clientId || !clientSecret || !redirectUri) {
    return htmlPage("Server-config ontbreekt (EXACT_CLIENT_ID/SECRET/REDIRECT_URI)", false);
  }

  let tokenJson: Record<string, unknown>;
  try {
    const res = await fetch(EXACT_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return htmlPage(`Exact token-exchange mislukte: ${res.status} ${text.slice(0, 200)}`, false);
    }

    tokenJson = await res.json();
  } catch (e) {
    return htmlPage(`Token fetch faalde: ${e instanceof Error ? e.message : e}`, false);
  }

  const accessToken = tokenJson.access_token as string;
  const refreshToken = tokenJson.refresh_token as string;
  const expiresIn = (tokenJson.expires_in as number) ?? 600;
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  if (!accessToken || !refreshToken) {
    return htmlPage("Geen access/refresh-token in Exact-response", false);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: existingRuntime } = await supabase.rpc("get_integration_credentials_runtime", {
    p_tenant_id: tenantId,
    p_provider: "exact_online",
  });
  const existing = (Array.isArray(existingRuntime) ? existingRuntime[0] : existingRuntime) as
    | { credentials?: Record<string, unknown> }
    | null;

  const newCreds = {
    ...((existing?.credentials as Record<string, unknown>) ?? {}),
    clientId,
    clientSecret,
    accessToken,
    refreshToken,
    accessTokenExpiresAt: expiresAt,
  };

  const { error: upErr } = await supabase.rpc("save_integration_credentials_secure", {
    p_provider: "exact_online",
    p_enabled: true,
    p_credentials: newCreds,
    p_tenant_id: tenantId,
  });

  if (upErr) {
    return htmlPage(`Opslaan mislukt: ${upErr.message}`, false);
  }

  return htmlPage("Verbonden met Exact Online. Je kunt dit tabblad sluiten.", true);
});

function htmlPage(message: string, success: boolean): Response {
  const color = success ? "#0f766e" : "#b91c1c";
  const html = `<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><title>OrderFlow Exact-koppeling</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 4rem; max-width: 480px; margin: 0 auto; }
  h1 { color: ${color}; font-size: 1.25rem; }
  p { color: #475569; }
  button { margin-top: 1rem; padding: 0.5rem 1rem; }
</style></head>
<body>
  <h1>${success ? "Gelukt" : "Mislukt"}</h1>
  <p>${escapeHtml(message)}</p>
  <button onclick="window.close()">Tabblad sluiten</button>
  <script>
    if (window.opener) {
      window.opener.postMessage({ type: 'orderflow-exact-callback', success: ${success} }, '*');
    }
  </script>
</body></html>`;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}
