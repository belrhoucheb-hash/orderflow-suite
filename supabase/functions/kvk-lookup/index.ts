// KvK-lookup via overheid.io Handelsregister dataset.
//
// Input (JSON):
//   - Zoeken op naam:     { mode: "search", query: string }
//   - Ophalen op KvK-nr:  { mode: "byKvk",  kvk: string }
//
// Output:
//   - search: { results: Array<{ kvk, name, city, street, house_number, zipcode }> }
//   - byKvk:  { result:  { kvk, name, street, house_number, zipcode, city, country } | null }
//
// De overheid.io HR-dataset is een gratis MVP-bron (100 calls/maand op
// het free-tier). Later upgraden naar de officiele KvK API is een kwestie
// van de fetch-URL en response-mapping vervangen, de publieke JSON-shape
// die wij richting de frontend teruggeven blijft stabiel.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsFor, handleOptions } from "../_shared/cors.ts";
import { checkRateLimit, clientIp, rateLimitResponse } from "../_shared/rate-limit.ts";

const BASE = "https://overheid.io/api/v0/hr";

interface NormalizedResult {
  kvk: string;
  name: string;
  street: string;
  house_number: string;
  zipcode: string;
  city: string;
  country: string;
}

// overheid.io geeft adresvelden soms als geneste vestigingsadres-objecten,
// soms als platgeslagen strings. We pakken defensief wat we kunnen vinden
// en geven een consistente shape terug richting de frontend.
function pickAddress(raw: any): {
  street: string;
  house_number: string;
  zipcode: string;
  city: string;
} {
  const vest = raw?.vestiging?.bezoekadres
    ?? raw?.bezoekadres
    ?? raw?.vestigingsadres
    ?? raw?._embedded?.hoofdvestiging?.adres
    ?? raw?.adres
    ?? {};

  const street =
    vest.straat
    ?? vest.straatnaam
    ?? vest.street
    ?? "";
  const houseNumber = [
    vest.huisnummer ?? vest.house_number ?? "",
    vest.huisnummertoevoeging ?? vest.huisletter ?? "",
  ]
    .filter(Boolean)
    .join("")
    .trim();
  const zipcode = (vest.postcode ?? vest.zipcode ?? "").toString().toUpperCase().replace(/\s+/g, "");
  const city = vest.plaats ?? vest.woonplaats ?? vest.city ?? "";

  return {
    street: String(street).trim(),
    house_number: String(houseNumber).trim(),
    zipcode: String(zipcode).trim(),
    city: String(city).trim(),
  };
}

function normalize(raw: any): NormalizedResult {
  const kvk = String(
    raw?.dossiernummer ?? raw?.kvknummer ?? raw?.kvk_number ?? raw?.id ?? "",
  ).trim();
  const name = String(
    raw?.handelsnaam ?? raw?.naam ?? raw?.statutaire_naam ?? "",
  ).trim();
  const addr = pickAddress(raw);
  return {
    kvk,
    name,
    street: addr.street,
    house_number: addr.house_number,
    zipcode: addr.zipcode,
    city: addr.city,
    country: "NL",
  };
}

async function ovioFetch(path: string, params: Record<string, string>): Promise<any> {
  const key = Deno.env.get("OVERHEID_IO_API_KEY");
  if (!key) throw new Error("OVERHEID_IO_API_KEY is not configured");
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }
  const resp = await fetch(url.toString(), {
    headers: { "ovio-api-key": key, accept: "application/hal+json" },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`overheid.io ${resp.status}: ${text.slice(0, 200)}`);
  }
  return await resp.json();
}

serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  const cors = corsFor(req);
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: cors });
  }

  const limit = checkRateLimit(`kvk-lookup:${clientIp(req)}`);
  if (!limit.allowed) {
    return rateLimitResponse(limit.retryAfterSeconds, cors);
  }

  try {
    const body = await req.json();
    const mode: string = body.mode;

    if (mode === "search") {
      const query = String(body.query ?? "").trim();
      if (query.length < 2) {
        return new Response(JSON.stringify({ results: [] }), {
          headers: { ...cors, "content-type": "application/json" },
        });
      }
      const data = await ovioFetch("", {
        "queryfields[handelsnaam]": query,
        size: "10",
      });
      const raw = data?._embedded?.rechtspersoon
        ?? data?._embedded?.bedrijf
        ?? data?._embedded?.hr
        ?? data?.results
        ?? [];
      const results = (Array.isArray(raw) ? raw : [])
        .map(normalize)
        .filter((r) => r.name && r.kvk);
      return new Response(JSON.stringify({ results }), {
        headers: { ...cors, "content-type": "application/json" },
      });
    }

    if (mode === "byKvk") {
      const kvk = String(body.kvk ?? "").trim().replace(/\s+/g, "");
      if (!/^\d{8}$/.test(kvk)) {
        return new Response(
          JSON.stringify({ error: "KvK-nummer moet 8 cijfers zijn" }),
          { status: 400, headers: { ...cors, "content-type": "application/json" } },
        );
      }
      const data = await ovioFetch(`/${kvk}`, {});
      const result = normalize(data);
      return new Response(
        JSON.stringify({ result: result.name ? result : null }),
        { headers: { ...cors, "content-type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ error: "mode moet 'search' of 'byKvk' zijn" }),
      { status: 400, headers: { ...cors, "content-type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Onbekende fout";
    console.error("kvk-lookup error", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { ...cors, "content-type": "application/json" },
    });
  }
});
