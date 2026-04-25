// Snelstart-connector: implementeert het Connector-interface uit runtime.ts.
//
// Wordt aangeroepen vanuit:
//   - supabase/functions/connector-snelstart/index.ts (nieuwe gateway)
//   - supabase/functions/connector-dispatcher/index.ts (webhook-driven push)
//
// De legacy-edge-function `snelstart-sync` blijft bestaan voor frontend-
// invoke('snelstart-sync', { invoice_id }) en gebruikt dezelfde Snelstart-
// API maar zonder de nieuwe runtime. Wordt in een latere sprint verwijderd.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type {
  Connector,
  ConnectorConfig,
  ConnectorPushResult,
  ConnectorTestResult,
} from "./runtime.ts";
import { credentialValue, mappingValue, withRetry } from "./runtime.ts";

const SNELSTART_API = "https://b2bapi.snelstart.nl/v2";
const SNELSTART_AUTH = "https://auth.snelstart.nl/b2b/token";

export const SnelstartConnector: Connector = {
  async push(eventType, payload, config, supabase) {
    if (eventType !== "invoice.sent" && eventType !== "invoice.created") {
      return { ok: false, error: `event ${eventType} niet ondersteund door snelstart` };
    }

    const invoiceId = String(payload.entity_id ?? payload.invoice_id ?? "");
    if (!invoiceId) {
      return { ok: false, error: "entity_id ontbreekt in payload" };
    }

    return await pushInvoice(supabase, invoiceId, config);
  },

  async testConnection(config) {
    const mock = config.credentials.mockMode === true
      || !credentialValue(config, "clientKey")
      || !credentialValue(config, "subscriptionKey");

    if (mock) {
      return { ok: true, message: "Mock-modus actief, geen echte API-call gedaan" };
    }

    try {
      const token = await fetchToken(config);
      return { ok: true, message: "OAuth-token succesvol opgehaald", details: { token_length: token.length } };
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

  let client: Record<string, unknown> | null = null;
  if (invoice.client_id) {
    const { data: c } = await supabase
      .from("clients")
      .select(
        "id, name, kvk_number, email, address_street, address_house_number, address_postcode, address_city, address_country",
      )
      .eq("id", invoice.client_id)
      .maybeSingle();
    client = c;
  }

  const mock = config.credentials.mockMode === true
    || !credentialValue(config, "clientKey")
    || !credentialValue(config, "subscriptionKey");

  if (mock) {
    const externalId = `MOCK-${invoice.invoice_number}-${Date.now().toString(36).toUpperCase()}`;
    await markBooked(supabase, invoiceId, externalId);
    return { ok: true, externalId, recordsCount: 1 };
  }

  try {
    const token = await withRetry(() => fetchToken(config));
    const relatieId = await withRetry(() => upsertRelatie(config, token, client, invoice));
    const externalId = await withRetry(() => postBooking(config, token, invoice, relatieId));
    await markBooked(supabase, invoiceId, externalId);
    return { ok: true, externalId, recordsCount: 1 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function markBooked(supabase: SupabaseClient, invoiceId: string, externalId: string) {
  await supabase
    .from("invoices")
    .update({
      snelstart_status: "geboekt",
      snelstart_boeking_id: externalId,
      snelstart_geboekt_at: new Date().toISOString(),
      snelstart_error: null,
    })
    .eq("id", invoiceId);
}

async function fetchToken(config: ConnectorConfig): Promise<string> {
  const clientKey = credentialValue(config, "clientKey");
  const subKey = credentialValue(config, "subscriptionKey");
  if (!clientKey || !subKey) throw new Error("clientKey of subscriptionKey ontbreekt");

  const res = await fetch(SNELSTART_AUTH, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "clientcredentials",
      client_id: clientKey,
      client_secret: subKey,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Snelstart token ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  if (!json.access_token) throw new Error("Geen access_token in token-response");
  return json.access_token as string;
}

async function upsertRelatie(
  config: ConnectorConfig,
  token: string,
  client: Record<string, unknown> | null,
  invoice: Record<string, unknown>,
): Promise<string> {
  const subKey = credentialValue(config, "subscriptionKey")!;
  const auth = {
    "Authorization": `Bearer ${token}`,
    "Ocp-Apim-Subscription-Key": subKey,
  };

  const kvk = client?.kvk_number as string | undefined;
  if (kvk) {
    const search = await fetch(
      `${SNELSTART_API}/relaties?filter=kvkNummer eq '${encodeURIComponent(kvk)}'`,
      { headers: auth },
    );
    if (search.ok) {
      const data = await search.json();
      const existing = Array.isArray(data) ? data[0] : data?.value?.[0];
      if (existing?.id) return String(existing.id);
    }
  }

  const naam = (client?.name as string) ?? `Klant factuur ${invoice.invoice_number}`;
  const street = client?.address_street as string | undefined;

  const createRes = await fetch(`${SNELSTART_API}/relaties`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      relatieSoort: ["Klant"],
      naam,
      kvkNummer: kvk,
      email: client?.email,
      vestigingsAdres: street
        ? {
          straat: street,
          huisnummer: client?.address_house_number ?? "",
          postcode: client?.address_postcode ?? "",
          plaats: client?.address_city ?? "",
          land: client?.address_country ?? "Nederland",
        }
        : undefined,
    }),
  });

  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`Snelstart relatie ${createRes.status}: ${text.slice(0, 200)}`);
  }
  const created = await createRes.json();
  const id = created?.id ?? created?.data?.id;
  if (!id) throw new Error("Snelstart gaf geen relatie-ID terug");
  return String(id);
}

async function postBooking(
  config: ConnectorConfig,
  token: string,
  invoice: Record<string, unknown>,
  relatieId: string,
): Promise<string> {
  const subKey = credentialValue(config, "subscriptionKey")!;
  const adminId = credentialValue(config, "administratieId");
  if (!adminId) throw new Error("administratieId ontbreekt");

  const standaardGrootboek = mappingValue(
    config,
    "default_grootboek",
    credentialValue(config, "standaardGrootboek") ?? "8000",
  );
  const btwGrootboek = mappingValue(
    config,
    "btw_grootboek",
    credentialValue(config, "btwGrootboek") ?? "1500",
  );

  const subtotal = (invoice.subtotal as number) ??
    ((invoice.total_amount as number) - ((invoice.btw_amount as number | null) ?? 0));

  const body = {
    administratieId: adminId,
    boekstuk: invoice.invoice_number,
    boekdatum: invoice.issue_date,
    vervaldatum: invoice.due_date ?? invoice.issue_date,
    relatieId,
    factuurbedrag: invoice.total_amount,
    omschrijving: `Factuur ${invoice.invoice_number}`,
    boekingsregels: [
      {
        grootboekcode: standaardGrootboek,
        bedrag: subtotal,
        btwGrootboekcode: btwGrootboek,
        btwBedrag: (invoice.btw_amount as number | null) ?? 0,
      },
    ],
  };

  const res = await fetch(`${SNELSTART_API}/verkoopboekingen`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Ocp-Apim-Subscription-Key": subKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Snelstart verkoopboeking ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = await res.json();
  const id = json?.id ?? json?.boekingId ?? json?.data?.id;
  if (!id) throw new Error("Snelstart gaf geen boeking-ID terug");
  return String(id);
}
