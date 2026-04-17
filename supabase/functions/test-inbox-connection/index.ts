import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { ImapFlow } from "npm:imapflow@1.0.171";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://orderflow-suite.vercel.app",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface TestRequest {
  // Optie A: bestaande inbox testen
  inboxId?: string;
  // Optie B: nieuwe gegevens (nog niet opgeslagen)
  tenantId?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  folder?: string;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function tryImapLogin(
  host: string,
  port: number,
  username: string,
  password: string,
  folder: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let client: ImapFlow | null = null;
  try {
    client = new ImapFlow({
      host,
      port,
      secure: port === 993,
      auth: { user: username, pass: password },
      logger: false,
    });
    await client.connect();
    const lock = await client.getMailboxLock(folder);
    lock.release();
    await client.logout();
    return { ok: true };
  } catch (e) {
    if (client) { try { await client.logout(); } catch { /* ignore */ } }
    const msg = e instanceof Error ? e.message : "unknown";
    // Masker alles wat op credentials lijkt
    const safe = msg
      .replace(/user=[^\s,)]+/gi, "user=***")
      .replace(/pass=[^\s,)]+/gi, "pass=***");
    return { ok: false, error: safe.substring(0, 200) };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { ok: false, error: "Authenticatie vereist" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) return json(401, { ok: false, error: "Ongeldige sessie" });

    const body: TestRequest = await req.json();

    // Bepaal tenant_id + gegevens
    let tenantId: string | null = null;
    let host: string;
    let port: number;
    let username: string;
    let password: string;
    let folder: string;

    if (body.inboxId) {
      const { data: inbox, error: inboxErr } = await admin
        .from("tenant_inboxes")
        .select("tenant_id, host, port, username, folder, password_secret_id")
        .eq("id", body.inboxId)
        .single();
      if (inboxErr || !inbox) return json(404, { ok: false, error: "Inbox niet gevonden" });
      if (!inbox.password_secret_id) return json(400, { ok: false, error: "Wachtwoord nog niet ingesteld" });

      const { data: pw, error: pwErr } = await admin.rpc("get_tenant_inbox_password", {
        p_inbox_id: body.inboxId,
      });
      if (pwErr || !pw) return json(500, { ok: false, error: "Kon wachtwoord niet ophalen" });

      tenantId = inbox.tenant_id;
      host = inbox.host;
      port = inbox.port;
      username = inbox.username;
      password = pw;
      folder = inbox.folder || "INBOX";
    } else {
      if (!body.tenantId || !body.host || !body.username || !body.password) {
        return json(400, { ok: false, error: "tenantId, host, username en password zijn verplicht" });
      }
      tenantId = body.tenantId;
      host = body.host;
      port = body.port ?? 993;
      username = body.username;
      password = body.password;
      folder = body.folder || "INBOX";
    }

    // Tenant-toegang valideren via de user-JWT client (respect RLS)
    const userClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: access, error: accessErr } = await userClient.rpc("user_has_tenant_access", {
      p_tenant_id: tenantId,
    });
    if (accessErr || !access) return json(403, { ok: false, error: "Geen toegang tot deze tenant" });

    // Rate limit: 5 pogingen per minuut per tenant
    const rlKey = `test-inbox-connection:${tenantId}`;
    const { data: allowed, error: rlErr } = await admin.rpc("increment_rate_limit", {
      p_key: rlKey,
      p_limit: 5,
      p_window_seconds: 60,
    });
    if (rlErr) return json(500, { ok: false, error: "Rate-limit check faalde" });
    if (!allowed) return json(429, { ok: false, error: "Te veel pogingen, wacht even" });

    // Timeout van 15s rond de IMAP-login
    const TIMEOUT = 15_000;
    const result = await Promise.race([
      tryImapLogin(host, port, username, password, folder),
      new Promise<{ ok: false; error: string }>((resolve) =>
        setTimeout(() => resolve({ ok: false, error: "Timeout na 15s" }), TIMEOUT),
      ),
    ]);

    // Audit log, geen waarden, alleen uitkomst
    if (body.inboxId) {
      await admin.from("tenant_inbox_audit").insert({
        inbox_id: body.inboxId,
        tenant_id: tenantId,
        user_id: user.id,
        action: "tested",
        detail: { ok: result.ok, ...(!result.ok ? { error: result.error } : {}) },
      });
    }

    return json(200, result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return json(500, { ok: false, error: msg });
  }
});
