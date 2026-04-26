// Exact Online-connector: implementeert het Connector-interface.
//
// OAuth2 authorization-code-flow. Refresh-tokens leven 30 dagen, access-
// tokens 10 minuten. We slaan beide op in integration_credentials en
// rotaten transparant.
//
// Push: invoice.sent -> SalesEntry POST in Exact-divisie.
// Test: ophalen huidige user via /api/v1/current/Me.
//
// OAuth-callback wordt afgehandeld door supabase/functions/oauth-callback-exact.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type {
  Connector,
  ConnectorConfig,
  ConnectorPushResult,
  ConnectorTestResult,
} from "./runtime.ts";
import { credentialValue, mappingValue, withRetry } from "./runtime.ts";

const EXACT_BASE = "https://start.exactonline.nl";
const TOKEN_URL = `${EXACT_BASE}/api/oauth2/token`;

export const ExactConnector: Connector = {
  async push(eventType, payload, config, supabase) {
    if (eventType !== "invoice.sent" && eventType !== "invoice.created") {
      return { ok: false, error: `event ${eventType} niet ondersteund door exact_online` };
    }
    const invoiceId = String(payload.entity_id ?? payload.invoice_id ?? "");
    if (!invoiceId) return { ok: false, error: "entity_id ontbreekt" };
    return await pushInvoice(supabase, invoiceId, config);
  },

  async testConnection(config, supabase) {
    try {
      const token = await ensureAccessToken(supabase, config);
      const division = credentialValue(config, "divisionId");
      if (!division) {
        return { ok: false, message: "divisionId ontbreekt" };
      }
      const res = await fetch(`${EXACT_BASE}/api/v1/current/Me?$select=UserName,FullName`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      if (!res.ok) {
        const text = await res.text();
        return { ok: false, message: `Exact ${res.status}: ${text.slice(0, 200)}` };
      }
      const data = await res.json();
      return { ok: true, message: "Verbonden met Exact Online", details: { user: data?.d?.results?.[0] } };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  },
};

async function pushInvoice(
  supabase: SupabaseClient,
  invoiceId: string,
  config: ConnectorConfig,
): Promise<ConnectorPushResult> {
  const { data: invoice, error } = await supabase
    .from("invoices")
    .select(
      "id, tenant_id, client_id, invoice_number, issue_date, due_date, total_amount, btw_amount, subtotal",
    )
    .eq("id", invoiceId)
    .maybeSingle();

  if (error) return { ok: false, error: `factuur ophalen: ${error.message}` };
  if (!invoice) return { ok: false, error: "factuur niet gevonden" };

  const division = credentialValue(config, "divisionId");
  if (!division) return { ok: false, error: "divisionId ontbreekt in koppeling" };

  const grootboek = mappingValue(config, "default_grootboek", "8000");

  try {
    const token = await withRetry(() => ensureAccessToken(supabase, config));

    const body = {
      EntryDate: invoice.issue_date,
      Description: `Factuur ${invoice.invoice_number}`,
      YourRef: invoice.invoice_number,
      Customer: invoice.client_id,
      Journal: "70",
      SalesEntryLines: [
        {
          GLAccount: grootboek,
          AmountDC: invoice.subtotal ?? (invoice.total_amount - (invoice.btw_amount ?? 0)),
          VATAmountDC: invoice.btw_amount ?? 0,
          Description: `Factuur ${invoice.invoice_number}`,
        },
      ],
    };

    const res = await fetch(`${EXACT_BASE}/api/v1/${division}/salesentry/SalesEntries`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `Exact ${res.status}: ${text.slice(0, 300)}` };
    }

    const json = await res.json();
    const externalId = json?.d?.EntryID ?? json?.d?.ID ?? null;
    if (!externalId) return { ok: false, error: "Exact gaf geen EntryID terug" };

    return { ok: true, externalId: String(externalId), recordsCount: 1 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Haal een geldige access-token op, refresh als die bijna verloopt. */
async function ensureAccessToken(
  supabase: SupabaseClient,
  config: ConnectorConfig,
): Promise<string> {
  const accessToken = credentialValue(config, "accessToken");
  const expiresAt = credentialValue(config, "accessTokenExpiresAt");
  const refreshToken = credentialValue(config, "refreshToken");

  const expiryTs = expiresAt ? Date.parse(expiresAt) : 0;
  // Refresh als minder dan 60s geldig
  if (accessToken && expiryTs - Date.now() > 60_000) {
    return accessToken;
  }

  if (!refreshToken) throw new Error("Geen refresh-token, opnieuw verbinden via OAuth");

  const clientId = credentialValue(config, "clientId");
  const clientSecret = credentialValue(config, "clientSecret");
  if (!clientId || !clientSecret) throw new Error("clientId of clientSecret ontbreekt");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Exact token refresh ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = await res.json();
  const newAccess = json.access_token as string;
  const newRefresh = (json.refresh_token as string) ?? refreshToken;
  const expiresIn = (json.expires_in as number) ?? 600;
  const newExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  // Update credentials
  const updatedCreds = {
    ...config.credentials,
    accessToken: newAccess,
    refreshToken: newRefresh,
    accessTokenExpiresAt: newExpiresAt,
  };

  const { error } = await supabase.rpc("save_integration_credentials_secure", {
    p_provider: "exact_online",
    p_enabled: true,
    p_credentials: updatedCreds,
    p_tenant_id: config.tenantId,
  });
  if (error) {
    throw new Error(`Exact credentials opslaan mislukt: ${error.message}`);
  }

  config.credentials = updatedCreds;
  return newAccess;
}
