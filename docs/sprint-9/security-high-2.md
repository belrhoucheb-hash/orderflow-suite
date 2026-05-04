# HIGH-2 — Server-side login lockout

## Probleem

Pentest toonde aan dat de account-lockout uit `office_login_policy`
(`max_login_attempts`, `lockout_minutes`) alleen in de browser werd
afgedwongen vanuit `src/pages/Login.tsx:182-220`. Een attacker kon de
lockout volledig omzeilen door rechtstreeks de Supabase auth-endpoint te
hameren:

```bash
curl -X POST "$VITE_SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $VITE_SUPABASE_PUBLISHABLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"slachtoffer@example.com","password":"guess1"}'
```

6+ pogingen op rij gaven 6x `400 invalid_credentials`, geen 429, geen
lockout in `office_login_attempts`.

## Architectuur

```
        +-----------------+        POST /functions/v1/office-login
        |   Browser (UI)  | ------------------------------------+
        +-----------------+                                      |
                                                                 v
                                                  +------------------------------+
                                                  |  Edge: office-login          |
                                                  |  - per-IP throttle (10/60s)  |
                                                  |  - per-email throttle (8/60s)|
                                                  |  - rpc office_login_policy   |
                                                  |    (service-role)            |
                                                  |  - if locked -> 423          |
                                                  +-------------+----------------+
                                                                |
                                                                | POST /auth/v1/token
                                                                v
                                                  +------------------------------+
                                                  |  Supabase GoTrue (auth)      |
                                                  +-------------+----------------+
                                                                |
                                                                | success | failure
                                                                v
                                                  +------------------------------+
                                                  |  rpc record_office_login_-   |
                                                  |  attempt(success)            |
                                                  +-------------+----------------+
                                                                |
                                                                v
                                                  Browser krijgt access_token /
                                                  refresh_token of 401 / 423.
```

De UI roept `supabase.auth.setSession({access_token, refresh_token})` aan
met de tokens uit de edge function en valt verder terug op de bestaande
AuthContext-flow (incl. MFA-check via `office_login_policy`).

## Waarom een edge wrapper i.p.v. een Auth Hook

Supabase's `password_verification_hook` is alleen op het **enterprise**-plan
beschikbaar en kan een failed-login alleen blokkeren of een token-claim
modificeren — hij heeft geen directe toegang tot onze policy-tabellen of
de `record_office_login_attempt`-RPC zonder extra plumbing. Een edge
wrapper:

- werkt op het standard-plan,
- houdt de bookkeeping bij ons in `office_login_attempts`,
- staat ons toe een eigen in-memory throttle (per IP, per email) toe te
  voegen vóór we überhaupt naar GoTrue gaan,
- is testbaar als gewone TypeScript-code.

## Test-script

```bash
EDGE="$VITE_SUPABASE_URL/functions/v1/office-login"
APIKEY="$VITE_SUPABASE_PUBLISHABLE_KEY"

for i in $(seq 1 11); do
  echo "--- poging $i ---"
  curl -s -o /tmp/body.json -w "status=%{http_code}\n" \
    -X POST "$EDGE" \
    -H "apikey: $APIKEY" \
    -H "Content-Type: application/json" \
    -d '{"email":"slachtoffer@example.com","password":"verkeerd"}'
  cat /tmp/body.json; echo
done
```

Verwacht:

- pogingen 1–5: `status=401 {"error":"invalid_credentials"}`
- poging 6 (default `max_login_attempts=5`): `status=423
  {"error":"locked","unlock_at":"…"}`
- pogingen 7–10: blijven `423`
- per-email throttle slaat op poging 9 in dezelfde minuut aan met
  `status=429 {"error":"email_throttled","retry_after_seconds":60}`,
  ruim vóór de IP-cap van 10/60s

Zelfs als een attacker de wrapper omzeilt en direct
`POST /auth/v1/token?grant_type=password` aanroept, blijft de
GoTrue-respons `400 invalid_credentials` zonder dat de wrapper wordt
geraakt — die path is dus **niet beschermd door deze fix** (zie open
vragen).

## Bestanden

- `supabase/functions/office-login/index.ts` — nieuwe wrapper.
- `supabase/config.toml` — `[functions.office-login] verify_jwt = false`.
- `src/pages/Login.tsx` — UI roept nu de wrapper aan en zet de session
  via `supabase.auth.setSession`. DEV-bypass en MFA-flow blijven intact.

## Open vragen

1. **GoTrue rechtstreeks bereikbaar.** Op het standard plan kunnen we
   `/auth/v1/token` niet netwerk-blokkeren. Een attacker die het
   directe endpoint kent omzeilt onze lockout-gate. Mitigaties:
   - GoTrue rate limiting via Supabase project settings (per-IP, beperkt
     instelbaar) — **best effort, niet 1:1 onze policy**.
   - Enterprise upgrade + `password_verification_hook` voor garanties.
   - Auth API in de toekomst forceren via een Cloudflare Worker /
     reverse proxy zodat alleen onze edge-route door kan.
2. **In-memory throttle is per-instance.** Bij meerdere edge replicas
   verdeelt het verkeer zich; de effectieve cap is `replicas × limit`.
   Voor harde garanties zou een KV / Redis store nodig zijn. Geen
   blocker voor MVP, wel noteren.
3. **Verschillende tegenmaatregelen op verschillende paden.** UI-flow
   krijgt nu lockout + throttle, directe GoTrue-flow alleen
   GoTrue-defaults. Dit is een geaccepteerde gap totdat punt 1
   adresseren.
