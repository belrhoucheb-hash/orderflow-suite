# HIGH-1: Edge functions verbruikten externe API-quota anoniem

## Probleem

Drie Supabase edge functions stonden in `supabase/config.toml` op
`verify_jwt = false`, terwijl ze externe betaalde API's proxieden:

- `google-places` (Google Places Autocomplete, adres)
- `google-places-business` (Google Places Search/Details, bedrijf)
- `kvk-lookup` (overheid.io KvK)

Een attacker kon zonder Supabase-session een POST sturen en zo Google /
KvK-quota uitputten op kosten van orderflow.

## Fix

### 1. JWT-verificatie aan

`supabase/config.toml`:

```toml
[functions.kvk-lookup]
verify_jwt = true

[functions.google-places-business]
verify_jwt = true

[functions.google-places]
verify_jwt = true
```

Effect: Supabase weigert iedere request zonder geldige session-token met
`401 Unauthorized` voordat de functie-code uberhaupt draait. De
frontend-supabase-js client stuurt de session-token automatisch mee bij
`supabase.functions.invoke(...)`, dus ingelogde gebruikers merken niets.

De **publishable key** (anon key) blijft hoe dan ook verplicht als
`apikey`-header, dat dwingt Supabase af op de gateway-laag, los van de
`verify_jwt`-vlag. Een attacker die alleen onze publieke anon-key heeft
komt nu dus nog steeds niet langs de auth-laag.

### 2. Per-IP rate-limit als defense-in-depth

`supabase/functions/_shared/rate-limit.ts`: in-memory `Map<key, bucket>`
met TTL 60s, default 30 requests/min per IP. Per functie aangeroepen met
een eigen key-prefix (`google-places:<ip>` etc.).

IP komt uit:

```ts
req.headers.get("cf-connecting-ip")
  || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  || "unknown"
```

Bij overschreden: `429 Too Many Requests`, body `{"error":"rate_limit_exceeded"}`,
`Retry-After: <seconds>`-header.

Edge function instances zijn kortlevend en per-isolate, dus deze limiet
is best-effort; de primaire bescherming blijft `verify_jwt`. Voor
horizontale persistentie is `increment_rate_limit()` in de DB beschikbaar
(zie `supabase/migrations_archive/20260417130100_rate_limit_counters.sql`),
maar dat vergt een service-role round-trip per call en is niet de moeite
waard zolang de auth-laag dichtgezet is.

## Restrictie van Google Maps client-side key (extra)

De `VITE_GOOGLE_MAPS_API_KEY` in `.env` wordt door de browser direct
gebruikt voor de Maps JS SDK (kaartweergave). Die key is per definitie
zichtbaar voor iedereen die `view-source:` doet. Bescherm hem op
**HTTP-referrer-niveau** in Google Cloud Console:

1. Open https://console.cloud.google.com/google/maps-apis/credentials
2. Selecteer het juiste project (orderflow-prod / orderflow-dev).
3. Klik op de API-key die als `VITE_GOOGLE_MAPS_API_KEY` is uitgerold.
4. Onder **Application restrictions** kies **HTTP referrers (web sites)**.
5. Voeg toe (een per regel):
   - `http://localhost:*/*`
   - `http://127.0.0.1:*/*`
   - `https://*.vercel.app/*`
   - `https://orderflow-suite.vercel.app/*`
   - `https://<prod-domein>/*` (vul in zodra DNS staat)
6. Onder **API restrictions** zet **Restrict key** aan en vink alleen aan:
   - Maps JavaScript API
   - Places API (voor frontend-side Place Picker, indien gebruikt)
7. Save. Wijzigingen zijn binnen ~5 minuten actief.

De **server-side** `GOOGLE_MAPS_API_KEY` (gebruikt door de edge functions)
mag GEEN HTTP-referrer-restrictie hebben, want edge functions sturen geen
referrer. Beperk die key ipv via **IP addresses**: laat leeg of zet alleen
de Supabase Functions egress-IPs (zie Supabase dashboard, project settings,
Functions, "Egress IP addresses"). Het is hetzelfde GCP-project, maar twee
verschillende keys. Als je nu maar 1 key hebt: maak een tweede aan zodat
client en server gescheiden zijn.

## Verificatie

### Anoniem moet 401 geven

```bash
curl -i -X POST \
  https://mdcfqircyxltiwfnmjsj.supabase.co/functions/v1/google-places \
  -H "Content-Type: application/json" \
  -H "apikey: <publishable-anon-key>" \
  -d '{"input":"Damrak"}'
```

Verwacht voor de fix: `HTTP/2 200` met JSON-body en suggesties.
Verwacht na de fix: `HTTP/2 401` met body `{"code":401,"message":"Missing authorization header"}`
(of vergelijkbaar Supabase-bericht).

Idem voor `kvk-lookup` (POST `{"mode":"search","query":"AH"}`) en
`google-places-business` (POST `{"mode":"search","query":"Albert Heijn"}`).

### Met geldige session-token moet 200 blijven

```bash
TOKEN="<sb-access-token uit browser localStorage>"
curl -i -X POST \
  https://mdcfqircyxltiwfnmjsj.supabase.co/functions/v1/google-places \
  -H "Content-Type: application/json" \
  -H "apikey: <publishable-anon-key>" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"input":"Damrak"}'
```

Verwacht: `HTTP/2 200` + predictions-array.

### Rate-limit moet 429 geven

```bash
for i in $(seq 1 35); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST \
    https://mdcfqircyxltiwfnmjsj.supabase.co/functions/v1/google-places \
    -H "Content-Type: application/json" \
    -H "apikey: <publishable-anon-key>" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"input":"Damrak"}'
done
```

Verwacht: eerste 30 calls `200`, daarna `429`. Edge function instances
zijn per-isolate dus de telling kan resetten als requests over
verschillende cold-start instances verdeeld worden, dat is verwacht
gedrag voor in-memory limieten.

## Vervolg

- Deploy edge functions (`supabase functions deploy google-places google-places-business kvk-lookup`).
  Niet door Claude gedaan, hoort bij de release-stap van de user.
- Maak in GCP-console een aparte server-side key, restrict de huidige
  client-side key per HTTP-referrer.
- Check telemetrie van de functies een week na deploy: zou nul anonieme
  401s moeten zijn (alle frontend-calls gaan via session-token), en zeer
  weinig 429s (alleen bij scripted misbruik door ingelogde gebruikers).
