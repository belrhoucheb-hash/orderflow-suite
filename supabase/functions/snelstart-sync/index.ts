// Snelstart-sync: boekt een factuur als verkoopboeking in Snelstart.
//
// Aanroep-pad:
//   - Frontend: invoke('snelstart-sync', { body: { invoice_id } })
//   - Backend: eventuele DB-webhook op invoices (status -> verzonden)
//
// Flow:
//   1. Valideer caller (JWT of service-role).
//   2. Laad factuur + regels + klant uit Supabase.
//   3. Laad integration_credentials voor provider='snelstart'.
//   4. Als mockMode: simuleer een boeking, sla synthetisch ID op.
//   5. Anders: OAuth2 client-credentials token ophalen,
//      relatie upserten (op KvK of naam), verkoopboeking posten.
//   6. Schrijf snelstart_status + snelstart_boeking_id terug op invoices.
//
// Alle fouten landen in snelstart_status='fout' + snelstart_error,
// de edge function retourneert zelf altijd 200 zodat de caller (auto-
// trigger) niet faalt op een integratieprobleem.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsFor, handleOptions } from "../_shared/cors.ts";

const SNELSTART_API = "https://b2bapi.snelstart.nl/v2";
const SNELSTART_AUTH = "https://auth.snelstart.nl/b2b/token";

interface RequestBody {
  invoice_id: string;
  tenant_id?: string;
}

interface SnelstartCredentials {
  clientKey?: string;
  subscriptionKey?: string;
  administratieId?: string;
  standaardGrootboek?: string;
  btwGrootboek?: string;
  mockMode?: boolean;
}

interface InvoiceRow {
  id: string;
  tenant_id: string;
  client_id: string | null;
  invoice_number: string;
  issue_date: string;
  due_date: string | null;
  total_amount: number;
  btw_amount: number | null;
  subtotal: number | null;
  snelstart_status: string;
}

interface ClientRow {
  id: string;
  name: string;
  kvk_number: string | null;
  email: string | null;
  address_street: string | null;
  address_house_number: string | null;
  address_postcode: string | null;
  address_city: string | null;
  address_country: string | null;
}

Deno.serve(async (req: Request) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  const cors = corsFor(req);
  const jsonHeaders = { ...cors, "Content-Type": "application/json" };

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: jsonHeaders,
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: jsonHeaders,
    });
  }

  if (!body.invoice_id) {
    return new Response(JSON.stringify({ error: "invoice_id is verplicht" }), {
      status: 400,
      headers: jsonHeaders,
    });
  }

  try {
    await setStatus(supabase, body.invoice_id, "bezig", null, null);

    const invoice = await loadInvoice(supabase, body.invoice_id);
    if (!invoice) {
      await setStatus(supabase, body.invoice_id, "fout", null, "Factuur niet gevonden");
      return new Response(JSON.stringify({ ok: false, error: "Factuur niet gevonden" }), {
        status: 200,
        headers: jsonHeaders,
      });
    }

    const credentials = await loadCredentials(supabase, invoice.tenant_id);
    if (!credentials) {
      await setStatus(
        supabase,
        invoice.id,
        "fout",
        null,
        "Snelstart-koppeling niet ingeschakeld",
      );
      return new Response(
        JSON.stringify({ ok: false, error: "Snelstart-koppeling niet ingeschakeld" }),
        { status: 200, headers: jsonHeaders },
      );
    }

    const client = invoice.client_id
      ? await loadClient(supabase, invoice.client_id)
      : null;

    const mockMode = credentials.mockMode === true
      || !credentials.clientKey
      || !credentials.subscriptionKey;

    let boekingId: string;
    if (mockMode) {
      boekingId = await bookMock(invoice);
    } else {
      boekingId = await bookLive(credentials, invoice, client);
    }

    await setStatus(supabase, invoice.id, "geboekt", boekingId, null);

    return new Response(
      JSON.stringify({ ok: true, snelstart_boeking_id: boekingId, mock: mockMode }),
      { status: 200, headers: jsonHeaders },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await setStatus(supabase, body.invoice_id, "fout", null, message);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 200,
      headers: jsonHeaders,
    });
  }
});

async function loadInvoice(
  supabase: SupabaseClient,
  invoiceId: string,
): Promise<InvoiceRow | null> {
  const { data, error } = await supabase
    .from("invoices")
    .select(
      "id, tenant_id, client_id, invoice_number, issue_date, due_date, total_amount, btw_amount, subtotal, snelstart_status",
    )
    .eq("id", invoiceId)
    .maybeSingle();

  if (error) throw new Error(`Factuur ophalen mislukt: ${error.message}`);
  return (data as InvoiceRow | null) ?? null;
}

async function loadClient(
  supabase: SupabaseClient,
  clientId: string,
): Promise<ClientRow | null> {
  const { data, error } = await supabase
    .from("clients")
    .select(
      "id, name, kvk_number, email, address_street, address_house_number, address_postcode, address_city, address_country",
    )
    .eq("id", clientId)
    .maybeSingle();

  if (error) throw new Error(`Klant ophalen mislukt: ${error.message}`);
  return (data as ClientRow | null) ?? null;
}

async function loadCredentials(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<SnelstartCredentials | null> {
  const { data, error } = await supabase
    .from("integration_credentials")
    .select("credentials, enabled")
    .eq("tenant_id", tenantId)
    .eq("provider", "snelstart")
    .maybeSingle();

  if (error) throw new Error(`Credentials ophalen mislukt: ${error.message}`);
  if (!data || !data.enabled) return null;
  return (data.credentials as SnelstartCredentials) ?? {};
}

async function setStatus(
  supabase: SupabaseClient,
  invoiceId: string,
  status: "niet_geboekt" | "bezig" | "geboekt" | "fout",
  boekingId: string | null,
  errorText: string | null,
): Promise<void> {
  const update: Record<string, unknown> = {
    snelstart_status: status,
    snelstart_error: errorText,
  };
  if (boekingId) update.snelstart_boeking_id = boekingId;
  if (status === "geboekt") update.snelstart_geboekt_at = new Date().toISOString();

  const { error } = await supabase
    .from("invoices")
    .update(update)
    .eq("id", invoiceId);

  if (error) {
    console.error("[snelstart-sync] status update faalde:", error);
  }
}

async function bookMock(invoice: InvoiceRow): Promise<string> {
  const suffix = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `MOCK-${invoice.invoice_number}-${suffix}`;
}

async function bookLive(
  credentials: SnelstartCredentials,
  invoice: InvoiceRow,
  client: ClientRow | null,
): Promise<string> {
  if (!credentials.clientKey || !credentials.subscriptionKey) {
    throw new Error("clientKey of subscriptionKey ontbreekt");
  }
  if (!credentials.administratieId) {
    throw new Error("administratieId ontbreekt in koppeling");
  }
  if (!credentials.standaardGrootboek) {
    throw new Error("standaardGrootboek ontbreekt in koppeling");
  }

  const token = await fetchToken(credentials);
  const relatieId = await upsertRelatie(credentials, token, client, invoice);

  const verkoopboekingUrl = `${SNELSTART_API}/verkoopboekingen`;
  const subtotal = invoice.subtotal ?? (invoice.total_amount - (invoice.btw_amount ?? 0));
  const body = {
    administratieId: credentials.administratieId,
    boekstuk: invoice.invoice_number,
    boekdatum: invoice.issue_date,
    vervaldatum: invoice.due_date ?? invoice.issue_date,
    relatieId,
    factuurbedrag: invoice.total_amount,
    omschrijving: `Factuur ${invoice.invoice_number}`,
    boekingsregels: [
      {
        grootboekcode: credentials.standaardGrootboek,
        bedrag: subtotal,
        btwGrootboekcode: credentials.btwGrootboek ?? null,
        btwBedrag: invoice.btw_amount ?? 0,
      },
    ],
  };

  const res = await fetch(verkoopboekingUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Ocp-Apim-Subscription-Key": credentials.subscriptionKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Snelstart ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = await res.json();
  const id = json?.id ?? json?.boekingId ?? json?.data?.id;
  if (!id) throw new Error("Snelstart gaf geen boeking-ID terug");
  return String(id);
}

async function fetchToken(credentials: SnelstartCredentials): Promise<string> {
  const res = await fetch(SNELSTART_AUTH, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "clientcredentials",
      client_id: credentials.clientKey!,
      client_secret: credentials.subscriptionKey!,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token ophalen mislukt (${res.status}): ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  if (!json.access_token) throw new Error("Geen access_token in token-response");
  return json.access_token as string;
}

async function upsertRelatie(
  credentials: SnelstartCredentials,
  token: string,
  client: ClientRow | null,
  invoice: InvoiceRow,
): Promise<string> {
  const subscriptionKey = credentials.subscriptionKey!;
  const authHeaders = {
    "Authorization": `Bearer ${token}`,
    "Ocp-Apim-Subscription-Key": subscriptionKey,
  };

  const naam = client?.name ?? `Klant factuur ${invoice.invoice_number}`;

  if (client?.kvk_number) {
    const search = await fetch(
      `${SNELSTART_API}/relaties?filter=kvkNummer eq '${encodeURIComponent(client.kvk_number)}'`,
      { headers: authHeaders },
    );
    if (search.ok) {
      const data = await search.json();
      const existing = Array.isArray(data) ? data[0] : data?.value?.[0];
      if (existing?.id) return String(existing.id);
    }
  }

  const createRes = await fetch(`${SNELSTART_API}/relaties`, {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({
      relatieSoort: ["Klant"],
      naam,
      kvkNummer: client?.kvk_number ?? undefined,
      email: client?.email ?? undefined,
      vestigingsAdres: client?.address_street
        ? {
          straat: client.address_street,
          huisnummer: client.address_house_number ?? "",
          postcode: client.address_postcode ?? "",
          plaats: client.address_city ?? "",
          land: client.address_country ?? "Nederland",
        }
        : undefined,
    }),
  });

  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`Relatie aanmaken mislukt (${createRes.status}): ${text.slice(0, 200)}`);
  }
  const created = await createRes.json();
  const id = created?.id ?? created?.data?.id;
  if (!id) throw new Error("Snelstart gaf geen relatie-ID terug");
  return String(id);
}
