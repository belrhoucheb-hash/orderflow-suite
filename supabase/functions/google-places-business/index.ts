// Google Places-lookup voor bedrijven.
//
// Input (JSON):
//   - Zoeken op naam:  { mode: "search",  query: string }
//   - Details ophalen: { mode: "details", place_id: string }
//
// Output:
//   - search:  { results: Array<{ place_id, name, description }> }
//   - details: { result: { name, street, house_number, zipcode, city, country, phone } | null }
//
// Let op: de Google Cloud-project-sleutel die als GOOGLE_MAPS_API_KEY
// is geconfigureerd moet de "Places API" (classic) enabled hebben.
// Zonder dat geeft Google 403 REQUEST_DENIED terug.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsFor, handleOptions } from "../_shared/cors.ts";

interface AddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

function pickComponent(
  components: AddressComponent[],
  type: string,
  prefer: "long_name" | "short_name" = "long_name",
): string {
  const hit = components.find((c) => c.types.includes(type));
  if (!hit) return "";
  return (prefer === "short_name" ? hit.short_name : hit.long_name) ?? "";
}

function normalizeDetails(data: any) {
  const components: AddressComponent[] = data?.result?.address_components ?? [];
  const street = pickComponent(components, "route");
  const house_number = pickComponent(components, "street_number");
  const zipcode = pickComponent(components, "postal_code").toUpperCase().replace(/\s+/g, "");
  const city =
    pickComponent(components, "locality") ||
    pickComponent(components, "postal_town") ||
    pickComponent(components, "administrative_area_level_2");
  const country = pickComponent(components, "country", "short_name") || "NL";
  const name = String(data?.result?.name ?? "").trim();
  const phone = String(data?.result?.international_phone_number ?? "").trim();
  return {
    name,
    street: street.trim(),
    house_number: house_number.trim(),
    zipcode,
    city: city.trim(),
    country,
    phone,
  };
}

serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  const cors = corsFor(req);
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: cors });
  }

  const key = Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!key) {
    return new Response(
      JSON.stringify({ error: "GOOGLE_MAPS_API_KEY is not configured" }),
      { status: 500, headers: { ...cors, "content-type": "application/json" } },
    );
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
      const params = new URLSearchParams({
        input: query,
        key,
        types: "establishment",
        components: "country:nl|country:be|country:de",
        language: "nl",
      });
      const resp = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params}`,
      );
      const data = await resp.json();
      if (!resp.ok || (data.status && data.status !== "OK" && data.status !== "ZERO_RESULTS")) {
        throw new Error(
          `Google Places ${resp.status} ${data.status ?? ""}: ${data.error_message ?? ""}`.trim(),
        );
      }
      const results = (data.predictions ?? []).map((p: any) => ({
        place_id: String(p.place_id ?? ""),
        name: String(p.structured_formatting?.main_text ?? p.description ?? ""),
        description: String(p.description ?? ""),
      }));
      return new Response(JSON.stringify({ results }), {
        headers: { ...cors, "content-type": "application/json" },
      });
    }

    if (mode === "details") {
      const placeId = String(body.place_id ?? "").trim();
      if (!placeId) {
        return new Response(
          JSON.stringify({ error: "place_id is verplicht" }),
          { status: 400, headers: { ...cors, "content-type": "application/json" } },
        );
      }
      const params = new URLSearchParams({
        place_id: placeId,
        key,
        language: "nl",
        fields:
          "name,formatted_address,address_component,international_phone_number",
      });
      const resp = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?${params}`,
      );
      const data = await resp.json();
      if (!resp.ok || (data.status && data.status !== "OK")) {
        throw new Error(
          `Google Places ${resp.status} ${data.status ?? ""}: ${data.error_message ?? ""}`.trim(),
        );
      }
      const result = normalizeDetails(data);
      return new Response(
        JSON.stringify({ result: result.name ? result : null }),
        { headers: { ...cors, "content-type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ error: "mode moet 'search' of 'details' zijn" }),
      { status: 400, headers: { ...cors, "content-type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Onbekende fout";
    console.error("google-places-business error", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { ...cors, "content-type": "application/json" },
    });
  }
});
