# Sprint 6, uitbreiding: Snelstart-boekhoudkoppeling

**Datum**: 2026-04-24
**Focus**: Eerste werkende externe integratie, facturen automatisch boeken in Snelstart.
**Uitgangspunt**: de drie bestaande "integratiekaartjes" (Exact, Twinfield, Samsara) sloegen alleen waarden op zonder iets met de API's te doen. We leveren Snelstart als eerste volledig werkende variant zodat het patroon vaststaat voor de andere boekhoudpakketten.

## 1. Geleverde functionaliteit

### 1.1 Opslag van integratie-credentials

- Nieuwe tabel `public.integration_credentials` (tenant-scoped, RLS op owner/admin, service_role heeft `FOR ALL`). Unieke sleutel op `(tenant_id, provider)`.
- `provider` check-constraint beperkt tot `snelstart | exact_online | twinfield | samsara`, nieuwe providers vereisen expliciete migratie.
- `credentials` als `jsonb`, trigger `tg_integration_credentials_touch` houdt `updated_at` actueel.
- Reden voor scheiding met `tenant_settings`: secrets verdienen strengere RLS en een provider-check, terwijl `tenant_settings` een losse key-value-bak is.

### 1.2 Snelstart-kolommen op facturen

- `invoices` krijgt `snelstart_status` (`niet_geboekt | bezig | geboekt | fout`, default `niet_geboekt`), `snelstart_boeking_id`, `snelstart_error`, `snelstart_geboekt_at`.
- Partiële index `idx_invoices_snelstart_status` (alleen rijen `<> 'niet_geboekt'`) voor snelle "hoeveel staan nog op fout?"-queries zonder de hoofdtabel op te blazen.

### 1.3 Edge function `snelstart-sync`

- Input: `{ invoice_id }`. Altijd 200-respons, fouten landen op de factuurrij zelf (`snelstart_status='fout'`, `snelstart_error=...`) zodat de caller (`useInvoices`) niet blokkeert op een integratiefout.
- Flow: credentials laden, OAuth2 client-credentials-token ophalen, relatie upsert (match op KvK of aanmaken met adres/email), verkoopboeking posten via `/v2/verkoopboekingen`, boeking-ID terug naar `snelstart_boeking_id`.
- Mockmodus (automatisch actief als `mockMode=true` of als `clientKey/subscriptionKey` leeg zijn) genereert een `MOCK-<factuurnr>-<rand>`-ID, zodat de volledige flow end-to-end testbaar is zonder echt Snelstart-account.
- Gebruikt `service_role`-client in de edge function, tenant-check gebeurt impliciet via de `invoice_id` lookup.

### 1.4 Hook `useIntegrationCredentials`

- `useIntegrationCredentials<T>(provider)` en `useSaveIntegrationCredentials<T>(provider)`, generiek over de JSON-shape per provider.
- Query-key `["integration_credentials", tenant_id, provider]`, invalidate bij save.

### 1.5 UI in Instellingen > Integraties

- Vierde `IntegrationCard` "Snelstart" met `Calculator`-icoon.
- Velden: client-key, subscription-key, administratie-ID, grootboek omzet, grootboek BTW.
- Aparte **Testmodus**-toggle binnen de kaart, disabled state op credential-velden als testmodus aanstaat.
- Knop **Verbinding testen**: doet client-side een `POST` naar `auth.snelstart.nl/b2b/token` om te verifiëren dat de keys kloppen, zonder een echte boeking te doen.
- Sticky-save-bar en "Integraties opslaan"-knop nemen Snelstart-dirty-state en -save-mutation mee, baseline-detectie werkt net als bij de andere integraties.

### 1.6 Auto-trigger bij verzonden

- `useUpdateInvoiceStatus.onSuccess` roept bij overgang naar `verzonden` fire-and-forget `supabase.functions.invoke("snelstart-sync", ...)` aan.
- Resultaat invalideert de factuur-query zodat de badge direct ververst.
- Fouten loggen alleen een `console.warn`, ze blokkeren de gewone status-flow niet.

### 1.7 Status-badge op FacturatieDetail

- Nieuwe badge naast de status-badge met drie varianten: amber "Snelstart: bezig", groen "Snelstart: geboekt" met `#boeking_id`, rood "Snelstart: fout".
- Bij `fout`: tooltip toont de foutmelding (`snelstart_error`), plus knop **Opnieuw proberen** die opnieuw `snelstart-sync` invoket.
- Badge verschijnt alleen als `snelstart_status <> 'niet_geboekt'`, zodat klanten zonder koppeling niets extra's zien.

### 1.8 Klant-testplan

- Scenario 8 (BK-01) toegevoegd met klanttaal: aanzetten in Instellingen + testmodus, factuur op verzonden, verwachten van "Snelstart: geboekt #MOCK-..."-badge.
- Optionele tweede fase met echt Snelstart-account, inclusief "Verbinding testen" en daadwerkelijk terugvinden in Snelstart.
- Fout-scenario beschreven: rode badge, tooltip, opnieuw-proberen knop.

## 2. Architectuur-keuzes

- **`integration_credentials` los van `tenant_settings`**: secrets horen niet in een grab-bag key-value-store, een aparte tabel geeft ons strengere RLS, provider-constraints en ruimte om later bijvoorbeeld rotatie- of last-used-at-velden toe te voegen per provider.
- **Edge function retourneert altijd 200**: we wilden niet dat een Snelstart-storing de factuur-status-overgang in de UI laat falen. De status van de sync staat op de factuurrij zelf, dat is de enige bron van waarheid die de UI gebruikt.
- **Mockmodus als first-class feature**: zonder mock zou de klant het niet kunnen testen voordat hij API-toegang geregeld heeft bij Snelstart. Mock is geen dev-feature achter een env-var, maar een expliciete schakelaar in de UI.
- **Fire-and-forget vanuit `useInvoices`**: de trigger zit in de frontend, niet in een database-webhook, zodat we de caller JWT behouden en rechtstreeks via `supabase.functions.invoke` kunnen werken. Upgrade naar een DB-webhook is later triviaal als we server-side bulk-triggers nodig hebben.
- **Auto-trigger alleen op `verzonden`**: concept-facturen willen we niet boeken, betaald/vervallen zijn downstream-states die al geboekt zijn.

## 3. Expliciet buiten scope (v1)

- **Betalingen terug-syncen** uit Snelstart naar OrderFlow, komt in een vervolgslag met webhook of polling.
- **Creditfacturen en herinneringen**: alleen nette verkoopboekingen voor nu.
- **Meerdere administraties per tenant**: exact één `administratieId` per tenant.
- **Grootboek-mapping per artikel/BTW-tarief**: één standaard-omzetgrootboek + één BTW-grootboek.
- **Exact Online en Twinfield**: hetzelfde patroon, maar nog niet gebouwd. Snelstart is de blauwdruk.

## 4. Deploy-stappen

1. `npx supabase db push` voor migraties `20260425020000_integration_credentials.sql` en `20260425030000_invoices_snelstart_columns.sql`.
2. `npx supabase functions deploy snelstart-sync`.
3. Vercel frontend volgt automatisch uit de git-push.
4. Instellingen > Integraties > Snelstart aanzetten, testmodus aan, opslaan.
5. Factuur op "verzonden" zetten, badge moet verschijnen.

## 5. Follow-ups

- Exact Online en Twinfield op hetzelfde patroon optuigen zodra Snelstart in productie stabiel is.
- Webhook vanuit Snelstart om betaalde facturen automatisch op `betaald` te zetten.
- Admin-dashboard-tegel "facturen met Snelstart-fout" voor snelle triage.
- Optioneel: retry-scheduler die facturen op `fout` automatisch opnieuw probeert met exponential backoff.

## 6. Bestanden

**Migraties**

- `supabase/migrations/20260425020000_integration_credentials.sql`
- `supabase/migrations/20260425030000_invoices_snelstart_columns.sql`

**Edge function**

- `supabase/functions/snelstart-sync/index.ts`

**Frontend**

- `src/hooks/useIntegrationCredentials.ts` (nieuw)
- `src/hooks/useInvoices.ts` (trigger in `useUpdateInvoiceStatus`)
- `src/pages/Settings.tsx` (vierde IntegrationCard + sticky-save integratie)
- `src/pages/FacturatieDetail.tsx` (status-badge, tooltip, retry-knop)

**Docs**

- `docs/klant-testplan.md` (scenario 8, BK-01)
- `docs/sprint-6/04-snelstart-koppeling.md` (dit bestand)
