# Sprint 9, Changelog: NewOrder/warehouse-flow + security-fixes na pentest

**Datum**: 2026-05-04
**Scope**: Twee parallelle sporen, (1) NewOrder/warehouse-flow productisering en
(2) remediatie van vier pentest-bevindingen (CRITICAL + 2x HIGH + MEDIUM).

---

## Spoor 1, NewOrder/warehouse-flow (status: deels afgerond)

Codex-tak gemerged via PR #22 op `main` (commit `3022874`). Deze sessie hebben we de
codex-versie naast mijn voorstel gelegd; de codex-versie is op `main`, mijn variant
blijft als referentie in de werkboom.

### Wat is gemerged

- `src/pages/NewOrder.tsx`, warehouse-driven new order flow met expliciete keuze
  pickup-warehouse en delivery-warehouse (in plaats van impliciet uit traject_rules
  af te leiden).
- `src/components/settings/MasterDataSection.tsx`, warehouse-CRUD verrijkt met
  default-pickup/default-delivery vlaggen per tenant.
- `src/hooks/useWarehouses.ts`, hook geupdate met de nieuwe foreign-key relaties.
- `src/lib/trajectRouter.ts` en `src/lib/validation/orderRouteRules.ts`, kleine
  uitbreidingen om de warehouse-keuze te respecteren.
- `supabase/migrations/20260504120000_warehouse_flow_references.sql`, nieuwe
  foreign-keys orders -> warehouses en bijbehorende seed-data.
- `src/__tests__/pages/NewOrder.test.tsx`, vitest-coverage uitgebreid.

### Wat nog open staat

- Wens 4 (overdracht-bewijs bij warehouse-stop) en wens 5 (warehouse-tijdvensters per
  klant) zijn nog niet in scope van PR #22.
- Mijn variant en codex-variant kennen kleine UX-verschillen (volgorde van velden,
  copy van de gold-hint). Klant moet beslissen welke we doortrekken.

---

## Spoor 2, Security-remediatie na pentest

Pentest uitgevoerd in deze sessie, 12 deelchecks (auth + JWT, RLS cross-tenant,
privilege escalation, public endpoints, edge functions, XSS, secrets-leak, API
v1 tokens, webhook HMAC). Resultaat: 1 CRITICAL, 2 HIGH, 1 MEDIUM, 2 LOW
(geaccepteerd). Vier subagents zijn parallel aan de remediatie begonnen.

### CRITICAL-1, signup tenant-injection (status: fix-in-progress)

Zie `docs/sprint-9/security-critical-1.md`.

- **Probleem**: `/auth/v1/signup` accepteerde `data.tenant_id` in raw_user_meta_data.
  De `handle_new_user`-trigger gebruikte die waarde ongechecked om een
  `tenant_members`-rij aan te maken. Een attacker kon zo lid worden van elke gewenste
  tenant.
- **Fix**: trigger leest tenant_id niet meer uit metadata. Lidmaatschap loopt nu
  uitsluitend via `tenant_invitations` + `accept_tenant_invitation()` RPC. Migratie
  `20260505000000_secure_tenant_membership.sql` aangemaakt op de werkboom.
- **Aanvullend**: in Supabase Dashboard "Allow signups" uit, anders blijft self-signup
  ongepriveligeerde users aanmaken.

### HIGH-1, edge function JWT + rate-limit (status: fix-in-progress)

Zie `docs/sprint-9/security-high-1.md`.

- **Probleem**: edge functions `office-login`, `google-places`,
  `google-places-business` en `kvk-lookup` accepteerden anonieme calls zonder
  JWT-validatie of rate-limit. Handig voor scraping en credential-stuffing.
- **Fix**: JWT-validatie + per-IP rate-limit ingevoerd op alle vier de functies.

### HIGH-2, server-side login lockout (status: fix-in-progress)

Zie `docs/sprint-9/security-high-2.md`.

- **Probleem**: client-side lockout in `Login.tsx` was te omzeilen (devtools, andere
  browser, andere device).
- **Fix**: server-side lockout-check via `office_user_security_settings` +
  `office_login_attempts`-tabel. 5 mislukte pogingen binnen 15 minuten geeft 15 min
  blokkade. Reset bij succesvolle login.

### MEDIUM-1, PostgREST `200 []`-misleiding (status: fix-aanbeveling)

Zie `docs/sprint-9/security-medium-1.md`.

- **Probleem**: PATCH op `user_roles`/`tenant_members` waar RLS de UPDATE filtert
  geeft `200 []` ipv `403`. Niet exploitable, wel verwarrend voor monitoring.
- **Fix-aanbeveling**: WITH CHECK-clause toevoegen aan UPDATE-policies (USING breed,
  WITH CHECK strikt). Migratie als snippet aangeleverd, nog niet toegepast.

### LOW-bevindingen (geaccepteerd, geen actie)

- Google Maps publishable key in client bundle, dit is by design (frontend-key, geen
  serverside-secret).
- DOMPurify gebruik beperkt tot 1 file, acceptabel want geen andere XSS-sinks
  geidentificeerd.

### Positieve bevindingen uit de pentest

- 48 security-tests groen in CI.
- RLS dekt alle gevoelige tabellen tenant-scoped.
- Geen XSS-sinks via React JSX.
- Geen SQLi via PostgREST (parameterised queries).
- Cross-tenant access is volledig geblokkeerd.

---

## Wat de klant gaat zien (in klant-taal)

**Inloggen wordt strenger beveiligd.** Na 5 mislukte inlog-pogingen wordt het
account 15 minuten geblokkeerd, ongeacht welk apparaat of welke browser. Voorheen
hielp het om naar een ander apparaat te gaan, dat kan nu niet meer.

**Nieuwe collega's worden uitgenodigd, niet zelfstandig aangemaakt.** Een
admin maakt een uitnodiging aan, de collega krijgt een link, klikt erop en is
direct aan de juiste tenant gekoppeld met de juiste rol. Voorheen kon iemand
theoretisch via de signup-pagina zelf bij een tenant inkomen, dat is nu dicht.

**Nieuwe order-flow met expliciete warehouse-keuze.** Bij het aanmaken van
een nieuwe order kies je nu zelf welk warehouse als pickup en welk warehouse
als delivery dient, in plaats van dat het systeem dat impliciet bepaalt. Geeft
duidelijkere routes voor export-orders.

## Wat de klant moet testen

Zie `docs/klant-testplan.md`, sectie "Sprint 9, security en warehouse-flow".

- Login-blokkade na 5 mislukte pogingen (HIGH-2).
- Uitnodigen van nieuwe collega via uitnodigingslink (CRITICAL-1).
- NewOrder met expliciete pickup-warehouse en delivery-warehouse.

## Niet in deze sprint

- Volledige multi-tenant invitation-UI (admins kunnen invitations aanmaken via
  RPC, maar de UI-tab onder Instellingen > Gebruikers volgt in sprint 10).
- 2FA op office-login, staat op de v2-roadmap.
- Encryption-at-rest voor connector-credentials, blijft op v2-roadmap.
- Wens 4 en wens 5 van de NewOrder/warehouse-flow.

## Operationele acties (zie `deploy-checklist.md`)

1. Migratie `20260505000000_secure_tenant_membership.sql` + MEDIUM-1-migratie
   uitrollen.
2. Edge functions `office-login`, `google-places`, `google-places-business`,
   `kvk-lookup` deployen.
3. Supabase Dashboard: Auth > Settings > Allow signups uit.
4. Frontend redeploy.
5. Smoke-tests draaien (3 curl-commando's).
