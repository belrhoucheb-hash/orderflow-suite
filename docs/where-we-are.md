# Waar staan we

**Bestand-doel**: aan het begin van elke sessie weet Claude waar we zijn gebleven, en aan het einde van elke sessie wordt dit bestand bijgewerkt zodat de volgende sessie ook weet waar we staan. Bron van waarheid voor harde feiten blijft `git log` en het Supabase-dashboard; dit bestand vult de zachte context aan (waarom, blokkers, openstaande beslissingen).

**Laatste update**: 2026-05-04 nacht (mega-merge `d7630d7` op main: marketplace fase 2/3/4 + connector-platform diepte + chauffeursportaal echte data + backend hygiene)

---

## Wat draait waar

| Laag           | Bron                          | Status                                                  |
| -------------- | ----------------------------- | ------------------------------------------------------- |
| `origin/main`  | github.com/belrhoucheb-hash   | Tot commit `d7630d7` (marketplace fase 2/3/4, connector diepte, chauffeursportaal real data, backend hygiene). PR #20-34 gemerged. |
| Frontend prod  | Vercel/Netlify (door gebruiker) | **Onbekend, gebruiker moet checken**. Vermoeden: nog op een oudere commit, want gebruiker zag connector-platform niet. |
| Supabase prod  | Supabase Dashboard            | Onbekend, gebruiker moet checken. Migraties tot `20260429010000` staan klaar in repo, niet bevestigd of toegepast. |
| Edge functions | Supabase Edge Functions       | Onbekend. Nieuw te deployen: `connector-snelstart`, `connector-exact_online`, `oauth-callback-exact`, `connector-dispatcher`, `eta-watcher`. |

---

## Wat is af in code (gemerged op origin/main)

- **Connector-marketplace fase 1-4** (PR #26, #28, #29, #31, #32, #33, #34): `/settings/integraties` is een complete marketplace. Hero met fuzzy-search + autocomplete + URL-deeplinks (`?cat=&q=&cap=`), 3 health-cells, marketplace-stats top-strip. Aanbevolen-rij (curated featured-flag), Bundels-rij met onboarding-wizard op `/settings/integraties/bundel/<id>` (sequentiele stappen + Sla over-pad + voortgangsbalk). Roadmap-grid sorteert op stem-aantal (DB-backed votes met seed-fallback). 20 connectors met originele branded SVG-marks. Detailpagina per connector op `/settings/integraties/<slug>` met hero (brand-strip, 88px logo, status-pulse, success-rate), 6 tabs (Overzicht, Configuratie, Mapping, Sync-log, Drempels, Audit admin-only). Configuratie heeft EnvironmentToggle test/live, Snelstart/Nostradamus/Exact in luxe-stijl, OAuth-modal met BroadcastChannel + polling-fallback, redirect-URI auto-vullen. Mapping is drag-and-drop met bron-velden + templates. Sync-log met filter-chips, expandable rows, per-event "Opnieuw"-knop + bulk-multi-replay. Sidebar met SyncGraphs (bar-chart + donut + sparkline + week-vs-week), stats, snelle acties, activity-feed. Marketplace-shell heeft BulkActionsBar (pauzeer alle / test alle / re-run failed 24u), HealthBanner globaal + HealthDot per kaart, capability-pills doorklikbaar, MarketplaceTour 4-staps overlay voor first-time, EmptyStateIllustration per categorie. Drempels-tab met failures/window/latency-config. Audit-tab met CSV-export. TokenExpiryBanner voor OAuth bij <7d expiry. SyncPoliciesPanel per event-type aan/uit.
- **Chauffeursportaal Uber-flow productie** (PR #20, #21, #23, #34): `/chauffeur` heeft full-bleed Leaflet map, glass header, draggable bottom-sheet met SwipeToConfirm, hamburger drawer met voertuigcheck-gate, rooster (week+maand), beschikbaarheid (echte `driver_availability`-tabel), chat, documenten, cijfers (echte `useDriverStats`), bonnetjes (echte `driver_receipts`-tabel + scan-flow), tachograaf-import (echte `tachograph-import` Edge Function + storage bucket), instellingen, SOS. Bottom-sheet met NextStopHero + km/ETA + Navigeer/Bel. Geofence-toast met stop-naam + 5s undo. CMR on-the-spot signing met email-copy + on-device PDF via jspdf, gepatcht naar `proof_of_delivery.cmr_pdf_url`. Klant-broadcast Edge Function `notify-customer-stop-status` met `last_notified_status` dedup. `messages`-tabel + realtime voor driver↔planner chat. `IncidentDialog` met 4 categorieen + verplichte foto + planner-notificatie. Offline POD queue in IndexedDB met parallel foto-upload + partial-success-semantiek. PIN-flow met PBKDF2/100k + DB-side lockout. `IconBubble` premium icon-treatment. `/chauffeur-demo` is verwijderd in hygiene-pass PR #33, /chauffeur draait hetzelfde frame.
- **Repo-guards** (PR #33, #34): `no-conflict-markers.test.ts` walks src + supabase folders en faalt op `<<<<<<<`/`=======`/`>>>>>>>` markers. `no-migration-collisions.test.ts` + `scripts/check-migration-collisions.mjs` voorkomt dubbele DATETIME-prefixen voor `db push`. Beide groen op CI.
- **Sprint 5**, outbound webhooks (HMAC, retry, replay, delivery-log), tab onder Settings > Webhooks.
- **Sprint 6**, publieke REST API v1 (bearer-tokens, scopes, rate-limit), tab onder Settings > API-tokens, ook in klantportaal.
- **Sprint 7**, rooster-module met dag/week-view, dag-acties, filters, plus later patroon-detectie, learned defaults, capaciteit-banner en eligibility-checks voor voertuig/chauffeur.
- **Sprint 8 ETA**, voorspellende ETA-engine met klant-pushes, `eta-watcher` edge function, ETA-badge in Dispatch en predicted-delay exceptions.
- **Sprint 8 connector-platform**, connector-catalogus/runtime/sync-log/mapping voor Snelstart en Exact, met "binnenkort"-kaarten voor extra connectoren.
- **Inbox / AI intake-workspace**, sterk doorontwikkeld op `origin/main`: triage-bakken, auto-confirm-kandidaten, slimme follow-updrafts, case-statussen, blockers, rustigere reviewkolom, bewerkbare tijdvensters en tussenstops, plus propagatie van tussenstops naar orderdetail/planning/dispatch/tracking.
- **Settings-overview**, opnieuw opgebouwd als premium overzichtspagina met scherpere copy/meta, live exception-badges en ontbrekende SMS-settings-hook aangesloten.
- **Autonomie / exceptions**, exception-copilot-acties en autonomy-flow uitgebreid; localhost reporting en autonomie-flow later gestabiliseerd.
- **UI-afstemming core pages**, Dispatch, Planning en Clients zijn visueel dichter naar Orders/getrokken; dispatch-kalender en planning-styling opgeschoond.
- **Integratie-guardrails**, tenant-bound integraties en messaging afgedwongen in Settings.
- **Infra**, nightly CI (bench/lighthouse/k6 load), security-tests over API + webhook-HMAC.

---

## Openstaande deploy-acties (door gebruiker te doen)

### Mega-bundel sinds laatste deploy (urgent)

Run eerst `node scripts/check-migration-collisions.mjs` om collisions te detecteren voor `db push`.

1. **`supabase db push`** voor wachtende migraties (chronologisch):
   - `20260504120030_warehouse_flow_references.sql`
   - `20260504120100_stop_incidents.sql`
   - `20260504120200_driver_planner_messages.sql`
   - `20260504130000_trip_stops_last_notified.sql`
   - `20260504141741_proof_of_delivery_cmr_pdf.sql`
   - `20260504180500_seed_stop_vehicle_requirements.sql`
   - `20260504200000_connector_thresholds.sql` (mega-merge)
   - `20260504200100_connector_audit_log.sql` (mega-merge)
   - `20260504210000_driver_availability_self_service.sql` (mega-merge)
   - `20260504210100_tachograph_imports.sql` (mega-merge)
   - `20260504210200_driver_receipts.sql` (mega-merge)
   - `20260504220000_connector_platform_depth.sql` (mega-merge, env+expires_at+event_policies)
   - `20260504230000_connector_votes.sql` (mega-merge)
   - `20260504230100_integration_credentials_encrypt.sql` (mega-merge, pgsodium-conditional)
   - `20260505000000_secure_tenant_membership.sql`
   `20260504120000_trip_stops_extra_field.sql` is al toegepast.

2. **`supabase functions deploy`** voor:
   - `notify-customer-stop-status` (AANGEKOMEN-dedup via `last_notified_status`)
   - `tachograph-import` (chauffeur .DDD upload → storage + RECEIVED-row)
   - `connectors-bulk-replay` (placeholder body, fase 4)
   - `connector-replay-event` (placeholder body, fase 4)
   - `connector-health-check` (placeholder body + cron-trigger nodig in Supabase Dashboard)
   - `oauth-callback-exact` (BroadcastChannel-success-pagina toegevoegd)

3. **Storage buckets** aanmaken in Supabase Dashboard:
   - `tachograph-files` (private, RLS via tenant_id-prefix)
   - `receipts` (private, RLS via tenant_id-prefix)

4. **Frontend redeploy** vanaf `d7630d7` zodat marketplace fase 4 + chauffeur real-data UI live komen.

5. **Verifieer AANGEKOMEN dedup** na deploy: zie `docs/deploy-verify-aangekomen.md` voor SQL-snippets en drop-criterium voor de oude `trg_notify_driver_arrived` DB-trigger.

6. **pgsodium-extension** aanzetten op Supabase project als je de `credentials_encrypted`-laag wilt activeren. Anders blijft de migratie no-op (de bestaande Vault-laag uit `secret_hardening.sql` doet de echte secret-bescherming al).

### Sprint 8 connector-platform (nog steeds pending)
4. **Connector-platform migraties + functions**: `supabase functions deploy connector-snelstart connector-exact_online oauth-callback-exact connector-dispatcher eta-watcher`.
5. **Env vars** op Supabase: `EXACT_CLIENT_ID`, `EXACT_CLIENT_SECRET`, `EXACT_REDIRECT_URI`, `CRON_SECRET`. Frontend (.env): `VITE_EXACT_CLIENT_ID`, `VITE_EXACT_REDIRECT_URI`.
6. **DB-webhooks** in Supabase Dashboard: `webhook_deliveries` INSERT → `webhook-dispatcher` (klant-webhooks) **én** → `connector-dispatcher` (interne connectoren). Twee aparte hooks op dezelfde insert.
7. **Cron jobs**: elke minuut `eta-watcher` en `webhook-dispatcher`, elke 5 min `connector-dispatcher` als catch-up.
8. **Exact-app** registreren via apps.exactonline.com met redirect `https://{project}.functions.supabase.co/oauth-callback-exact`.

---

## Bekende issues / openstaande beslissingen

- **Design-issue connector-trigger**: `connector-dispatcher` leest uit `webhook_deliveries`, maar die tabel wordt alleen gevuld als er een matchende klant-subscription is. Geen klant-subscription op `invoice.sent` → connectoren worden niet getriggerd. Voorgestelde fix (optie 1): `connector-dispatcher` rechtstreeks aanroepen vanuit `pipeline-trigger` en `financial-trigger`, los van de klant-outbox. **Niet gefixt; wacht op gebruikers-akkoord.**
- **`snelstart-sync` edge function** is legacy; nieuwe pad is `connector-snelstart`. Deprecation pas in latere sprint.
- **`snelstart_*`-kolommen op `invoices`** zijn snelstart-specifiek; bij meer connectoren generiek maken (`external_invoice_status`, `external_id`). Niet in scope nu.
- **Geen idempotentie** bij dubbele `invoice.sent`-emit: tweede push naar Snelstart of Exact maakt tweede boeking. Klant moet dedupliceren op factuurnummer aan hun kant. Documenteren als bekende beperking.
- **Plain JSONB credentials**: niet versleuteld at-rest. `pgsodium` of Supabase Vault staat op v2-roadmap.
- **pg_cron eta-watcher faalt op productie**: `current_setting('app.settings.supabase_url', true)` is leeg, `ALTER DATABASE ... SET app.settings.*` mag niet door SQL-Editor-rol op gehoste Supabase. Fix-route ligt klaar (Supabase Vault: `vault.create_secret` + `cron.schedule` herregistreren met `(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = '...')`), gebruiker heeft hem geparkeerd als "te ingewikkeld voor nu". Zelfde issue raakt `notify-expiring-certificates`. Zonder fix: geen klant-SMS'en, geen voorspelde-vertraging exceptions, geen ETA-badge in Dispatch.
- **Tussenstops in intake-route** werken nu end-to-end in code, maar zijn nog geen first-class datamodel: ze staan in `orders.notification_preferences.route_stops` (JSON) in plaats van een aparte `order_stops`-tabel. Prima voor huidige flow, minder ideaal voor langere termijn.
- **Vercel buildfout op `aa84eb4`** is opgelost in commit `dbbb55f`: `useInbox.ts` gebruikt weer `useAuth` in plaats van een niet-gecommitte `useAuthOptional` export.

---

## Sprint 9 security-fixes (gemerged op main, 2026-05-04)

Pentest 2026-05-04 ochtend, 12 deelchecks. Resultaat: 1 CRITICAL, 2 HIGH, 1 MEDIUM, 2 LOW (geaccepteerd). Remediatie via 4 subagents in parallel, gebundeld in commit `6e03535` "Harden auth: signup-injection, edge-fn quota, login-lockout, RLS-feedback".

| Finding | Status | Fix-doc |
| ------- | ------ | ------- |
| **CRITICAL-1**, signup tenant-injection via `data.tenant_id` in `/auth/v1/signup`, attacker kan zich aan elke tenant koppelen | gemerged | [`docs/sprint-9/security-critical-1.md`](sprint-9/security-critical-1.md) |
| **HIGH-1**, edge functions `office-login`/`google-places`/`google-places-business`/`kvk-lookup` accepteren anonieme calls zonder JWT/rate-limit | gemerged | [`docs/sprint-9/security-high-1.md`](sprint-9/security-high-1.md) |
| **HIGH-2**, login-lockout is client-side, te omzeilen met andere browser/device | gemerged | [`docs/sprint-9/security-high-2.md`](sprint-9/security-high-2.md) |
| **MEDIUM-1**, PostgREST PATCH op `user_roles`/`tenant_members` geeft `200 []` ipv `403` bij geblokkeerde UPDATE | gemerged | [`docs/sprint-9/security-medium-1.md`](sprint-9/security-medium-1.md) |

Sprint-changelog: [`docs/sprint-9/03-changelog.md`](sprint-9/03-changelog.md). Deploy-checklist met smoke-tests: [`docs/sprint-9/deploy-checklist.md`](sprint-9/deploy-checklist.md). Klant-testpunten zijn aan [`docs/klant-testplan.md`](klant-testplan.md) toegevoegd onder "Sprint 9 security en warehouse-flow".

LOW-bevindingen geaccepteerd zonder actie: Google Maps publishable key in client bundle (by design), DOMPurify gebruik beperkt tot 1 file.

---

## Recente sessies-samenvatting

### 2026-05-04 nacht (mega-merge `d7630d7` op main, marketplace + chauffeur + backend)

Zes parallelle subagents in worktrees, gebundeld in PR #34. Alle 6 schoon doorgelopen, conflicten in `ConnectorCatalog.tsx` + `ConnectorDetail.tsx` opgelost (imports samengevoegd, EnvironmentToggle behouden + Snelstart krijgt setupHint binnen D's wrapper). Build slaagt, repo-guards groen.

- **Agent A (marketplace fase 4)**: SyncGraphs in detail-sidebar (bar-chart, donut, sparkline, week-vs-week), BulkActionsBar (pauzeer alle / test alle / re-run failed 24u), WebhookReplayDialog per failed event + bulk-multi, HealthBanner globaal + HealthDot per kaart, Drempels-tab + Audit-tab admin-only met CSV-export. Migraties `connector_thresholds` + `connector_audit_log`. Edge Function placeholders `connectors-bulk-replay`, `connector-replay-event`, `connector-health-check`.
- **Agent B (chauffeursportaal vervolg)**: TachograafImport koppelt aan echte `tachograph-import` Edge Function, `useDriverSelfAvailability`, `useDriverStats` met echte aggregaties, `useDriverReceipts` + scan-flow. Migraties voor `tachograph_imports`, `driver_receipts`, `driver_availability_self_service`. `docs/deploy-verify-aangekomen.md` met SQL-snippet voor `trg_notify_driver_arrived` drop-criterium.
- **Agent C (stubs voltooien)**: OAuth-callback met BroadcastChannel + polling-fallback, capability-pills doorklikbaar als filter, Snelstart/Nostradamus tabs in luxe-stijl, OAuth-redirect-URI auto-vullen vanuit `VITE_SUPABASE_URL`, BundleDetail Sla over-pad met localStorage + restore.
- **Agent D (connector-platform diepte)**: Mapping drag-and-drop met `sourceFields.ts` + live preview, `mappingTemplates.ts` per connector, `SyncPoliciesPanel` per event, multi-environment (test/live), `TokenExpiryBanner` voor OAuth bij <7d expiry. Migratie `connector_platform_depth.sql` (env + expires_at + event_policies).
- **Agent E (marketplace polish)**: Eigen `fuzzy.ts` + autocomplete-dropdown met arrow-keys + ESC + click-buiten, URL-deeplinks via `useSearchParams`, `EmptyStateIllustration` per categorie, `MarketplaceTour` 4-staps overlay voor first-time, `marketplaceStats.ts` strip met 3 mock-pills.
- **Agent F (backend hygiene)**: `useConnectorVotes` naar tenant-DB met aggregate-view, `integration_credentials.credentials_encrypted` via pgsodium-conditional (defense-in-depth boven Vault), generated supabase types regenereerd, `as any`-casts opgeruimd, `scripts/check-migration-collisions.mjs` + npm script + vitest-test (`no-migration-collisions.test.ts`).
- **Conflict-resolutie**: imports in catalog/detail samengevoegd (E's URL-state + C's capability-filter + A's bulk + D's multi-env), Snelstart-form krijgt setupHint van C door D's EnvironmentToggle wrapper heen.

### 2026-05-04 avond (hygiene-pass PR #33 op `c758bdc`)

- `/chauffeur-demo` route en `ChauffeurDemo.tsx` (1133 regels) verwijderd, `/chauffeur` is hetzelfde frame sinds fase 2.
- `dashboard-chauffeur-settings.test.tsx`: 9 incorrecte `orders`-prop calls weggehaald, typecheck-errors van 728 naar 368.
- `src/__tests__/repo/no-conflict-markers.test.ts`: walks src + supabase, faalt op `<<<<<<<`/`=======`/`>>>>>>>`. PR #21 en #30 zouden hierdoor zijn gevangen.

### 2026-05-04 middag (marketplace fase 1-3 op `742d16e`)

- **PR #26 (fase 1)**: 21 originele branded SVG-marks in `public/integrations/`, catalog uitgebreid van 7 naar 20 connectors, hero met search + chips + 3 health-cells, premium tile-design, Aanbevolen-rij met curated `featured`-flag. **PR #28**: hand-curatie + werkende mailto.
- **PR #29 + #30 (premium pass + conflict-fix)**: hero met dot-pattern + glow-blob + 4xl headline, Bundels-rij (Boekhouding NL / Klantcommunicatie / Fleet pro), capability-pills met mini-icons, gold-sweep hover, brand-strip cards, framer-motion stagger, skeleton-loader. PR #30 fixte conflict-markers die door squash-merge in main belandden.
- **PR #31 (fase 2 detailpagina)**: `/settings/integraties/<slug>` met hero (brand-strip, 88px logo, status-pulse), 4 tabs (Overzicht / Configuratie / Mapping / Sync-log), OAuth-modal met 3-stappen Stepper, sidebar met stats + activity-feed, expandable LogRow.
- **PR #32 (fase 3 bundle + votes)**: BundleDetail-pagina op `/settings/integraties/bundel/<id>` met onboarding-wizard (genummerde stappen + voortgangsbalk + tip-card). Roadmap-cards met upvote-knop + tabular vote-count, sortering op stem-aantal.

### 2026-05-04 avond (NewOrder routeflow + stop-vehicle-requirements + auth-hardening op main)

- Tussen chauffeursportaal batch 2 (PR #23) en het volgende sessie-checkpoint heeft de codex/AI-flow op `origin/main` flink doorgeschoven met work die los staat van de chauffeurspagina:
- **Auth-hardening** (`6e03535`): bundelt de 4 sprint-9 security-fixes in een enkele commit. Markeer in deze where-we-are als gemerged.
- **NewOrder warehouse-flow** (`b17b0ac`, `b4e601c`, `f04e5b4`, `51e0de9`, `3f20a10`): warehouse-driven NewOrder volgorde, concept-workflow, polish op review-step.
- **Order drafts in lijst** (`8e87fdd`): orders-overview toont concepten.
- **Routeflow-question hersteld** (`9758722`, `a59a980`): tussenstop-question terug in de NewOrder UI.
- **Structured address normalization** (`c1c0d56`, `76c5b4b`): order-adressen nu genormaliseerd.
- **Stop-vehicle-requirements** (`d84226d`, `14355e5`): per-stop voertuig-eisen uit NewOrder. Nieuwe migratie `20260504180500_seed_stop_vehicle_requirements.sql`.
- Geen impact op chauffeursportaal-code, maar de nieuwe migratie + voertuig-eisen kunnen invloed hebben op planning/dispatch eligibility-checks (sprint 7 logica).

### 2026-05-04 (chauffeursportaal batch 2 gemerged via PR #23, commit `dfdf76d`)

- Drie parallelle subagents (worktrees) uitgerold op de pentest- en feature-lijst.
- **Group A** (backend hygiene): AANGEKOMEN dubbel-fire fix via `trip_stops.last_notified_status` kolom + early-return in `notify-customer-stop-status` Edge Function. DB-trigger `trg_notify_driver_arrived` blijft veilig actief. `tenant_id` expliciet doorgegeven aan `usePositionReporter`. `src/lib/logger.ts` (debug no-op buiten dev). Voertuigcheck-baseline gelocked achter planner/admin-rol. Generated Supabase types aangevuld met `messages`, `stop_incidents`, `trip_stops.extra/last_notified_status`.
- **Group B** (Uber-flow productie): `ChauffeurApp.tsx` rewrite naar full-bleed Leaflet map + glass header + draggable bottom-sheet + hamburger drawer met alle items (voertuigcheck, rooster week+maand, beschikbaarheid, chat, documenten, cijfers, bonnetjes, tachograaf, instellingen, SOS). Geofence-toast met stop-naam + 5s undo + dedup-id. GPS-spaarmodus (`gpsPreferences.ts`). Dark-modus (`usePreferences`-hook). Tachograaf-import stub (NFC-mock + .DDD upload). `ChauffeurDemo.tsx` blijft naast productie-route als auth-loze visuele showcase op `/chauffeur-demo`.
- **Group C** (POD/CMR/perf): foto-sync parallel via `Promise.allSettled` met partial-success-semantiek. CMR-PDF on-device via `jspdf` (`src/lib/cmrPdf.ts`), upload als `kind: "cmr"`, gepatcht naar `proof_of_delivery.cmr_pdf_url`. Hook-input memoization in MijnWeekView en ChauffeurApp.
- **Migratie-collision** opgelost: `20260504120000_warehouse_flow_references.sql` (van PR #22) en `20260504120000_trip_stops_extra_field.sql` (van PR #20) hadden hetzelfde prefix. Eerste run van `supabase db push` viel om met PK-violation. Warehouse hernoemd naar `20260504120030_warehouse_flow_references.sql`. `trip_stops_extra_field` was al toegepast voordat de fout optrad; alleen warehouse + de overige 5 wachten nog op tweede `db push`.
- **Te deployen na merge**: nog niet uitgevoerd:
  - `supabase db push` (6 migraties: warehouse, stop_incidents, driver_planner_messages, trip_stops_last_notified, proof_of_delivery_cmr_pdf, secure_tenant_membership).
  - `supabase functions deploy notify-customer-stop-status` (nieuwe dedup-logica).

### 2026-05-04 (chauffeursportaal Uber-flow uplift, gemerged in `6d6efd6`)

- Audit van `/chauffeur` uitgevoerd, vervolgens upgrade in 3 parallelle subagents (worktrees) en sequentieel gemerged op `feat/chauffeur-portal-uplift`. PR #20 op main.
- **Block 1**: luxe gold-huisstijl door alle chauffeur-screens, `SwipeToConfirm` op Ik ben er / Start lossen / POD, `vibrate(HAPTICS.*)` op statusovergangen, 5s undo-toast op Aangekomen, dead legacy POD-modal verwijderd, telefoon-knop in detail-modal werkt nu via `tel:`.
- **Block 2**: `LiveTripMap` (Leaflet, gold polyline + pulse driver-marker), `NextStopHero` met haversine-ETA, `compressImage`/`compressImageToDataUrl` plus `Promise.allSettled` parallel POD-foto upload, POD insert nu via `proof_of_delivery` + `useUpdateStopStatus(AFGELEVERD)` i.p.v. `orders.update`.
- **Block 3**: klant-broadcast via Edge Function `notify-customer-stop-status` (hangt aan bestaande `send-notification` mailer-pipeline), `useUpdateStopStatus` triggert bij ONDERWEG/AANGEKOMEN/AFGELEVERD/MISLUKT/OVERGESLAGEN. Nieuwe `IncidentDialog` met 4 categorieen + verplichte foto + planner-notificatie. Driver↔planner chat via `messages` tabel + realtime, `DriverChatPanel` en `PlannerChatPanel`. Migraties `20260504120000` (trip_stops.extra), `20260504120100` (stop_incidents), `20260504120200` (driver_planner_messages).
- **`/chauffeur-demo`**: standalone, auth-loze showcase-route. Full-bleed Leaflet map, glass header, draggable bottom-sheet met current-stop hero + SwipeToConfirm, hamburger drawer met voertuigcheck-gate (6 foto-tegels + checklist), rooster (week + maand-grid), beschikbaarheid, chat, documenten met vervaldatum-warnings, cijfers, bonnetjes, instellingen, SOS. CMR on-the-spot signing met email-copy toggle. Premium polish: `IconBubble` met gold-soft inset-highlight, gradient buttons, hairline gold-rules.
- **Bekend issue na deploy**: dubbele klant-notificatie bij AANGEKOMEN mogelijk omdat zowel oude DB-trigger `trg_notify_driver_arrived` als nieuwe Edge Function `notify-customer-stop-status` afgaan. Dedup of trigger-drop nog te beslissen.
- **Generated supabase types** missen nog `messages` en `stop_incidents`, daarom `as any` casts in `useDriverPlannerMessages`. Na `supabase gen types typescript` op te ruimen.
- **Edge Function deploy + 3 migraties** nog niet uitgevoerd op productie.

### 2026-04-26 (main bijgewerkt t/m `bd0e3b4`)

- `origin/main` is sinds de eerdere where-we-are update flink doorgeschoven: inbox is doorontwikkeld van gewone mailbox naar AI-intake-werkplek met triage, follow-updrafts, blockers, rustigere reviewkolom, tijdvensters en tussenstops.
- Tussenstops werken nu niet alleen in de inbox, maar ook in orderdetail, planning, dispatch en tracking. Opslag loopt via `orders.notification_preferences.route_stops`; dit is bewust genoteerd als tussenfase, nog geen apart stop-datamodel.
- Settings-overview is opnieuw opgebouwd en premium gemaakt; live exception-badges, SMS-settings-hook en later tenant-bound integratie/messaging-guardrails zijn gemerged.
- Roster/autonomie kreeg learned defaults, capaciteit/eligibility checks, exception-copilot-acties en een Nostradamus driver sync integratie. Dispatch/Planning/Clients zijn visueel meer gelijkgetrokken met Orders.
- Een echte deployfix is ook op `main`: `dbbb55f` repareert de Vercel-buildfout rond `useAuthOptional` in `useInbox.ts`.

### 2026-04-29 (Snelstart-werking-analyse)

- **Verheldering Snelstart-pad in prod**: configureren én auto-boeken werkt al in prod via legacy edge function `snelstart-sync`, aangeroepen vanuit `src/hooks/useInvoices.ts:430` zodra een factuur op `verzonden` gaat. Dit pad is onafhankelijk van het nieuwe connector-platform en heeft geen DB-webhook of dispatcher nodig.
- Het nieuwe connector-platform (sprint 8) is parallel gebouwd en gemerged maar **dood-code in prod tot deploy**. Test-verbinding-knop, sync-log en mapping-tab in de nieuwe Settings > Integraties UI zijn cosmetisch tot `connector-snelstart` is deployed.
- **Risico bij volledige deploy** zonder design-fix: het nieuwe pad neemt het over via `connector-dispatcher`, maar die dispatcher hangt aan `webhook_deliveries` die alleen vult bij klant-subscriptions. Zonder klant-subscription op `invoice.sent` zou Snelstart-push stoppen na deploy. Voorgestelde fix (optie 1, dispatcher rechtstreeks aanroepen vanuit pipeline-trigger) staat klaar in "Bekende issues" maar wacht op gebruikers-akkoord.
- Twee paden voor de gebruiker geïdentificeerd: (a) niets deployen, legacy snelstart-sync blijft werken; (b) volledige deploy + design-fix (optie 1) doorvoeren zodat het nieuwe pad de legacy zonder breuk vervangt.

### 2026-04-25 (sprint-8 ETA-engine herbouwd)

- Sprint-8 ETA-engine herbouwd op deze tak (begin-sessie was sprint-8 nog niet aanwezig in tree, in tegenstelling tot wat where-we-are eerder suggereerde): migratie `20260428000000_predicted_eta.sql`, edge function `eta-watcher` (index.ts + eta.ts), `EtaNotificationSettings.tsx` settings-tab, ETA-badge in Dispatch, "Voorspelde vertraging"-categorie in Exceptions, marker-popup leest predicted_eta. 27 vitest-tests groen, typecheck en build groen.
- Een productiebug gevonden en gefixt tijdens review: `>` → `>=` op de PREDICTED_DELAY-boundary in `eta-watcher/index.ts:425`, consistent met LEAD/UPDATE-drempels.
- Docs-agent hallucineerde dat hij drie pre-existerende connector-bestanden in `docs/sprint-8/` overschreef. Bevestigd dat dat niet zo was, connector-docs in `docs/connectors/` en `docs/api/` zijn intact, sprint-8 dir was nieuw aangemaakt.
- Cron-job faalt op productie omdat `app.settings.*` GUC's leeg zijn en SQL-Editor-rol geen `ALTER DATABASE` mag. Vault-route ligt klaar maar is geparkeerd, zie nieuwe entry in "Bekende issues".

### 2026-04-29 (eerdere sessie volgens dit bestand)

- Sprint 8 connector-platform afgerond en gemerged in 7 commits (`13c2536` t/m `bb7f9ca`), plus brand-tiles als 8e commit (`11a580f`).
- ETA-engine van parallel agent ook gecommit en gemerged.
- Antwoord op vraag "ben ik open TMS": ja qua push (sprint 5), pull (sprint 6), pre-built koppelingen (sprint 8). Nog niet qua full CRUD-API of data-portability-dump.
- Memory-vraag besproken: gekozen voor markdown `docs/where-we-are.md` boven Graphiti/Mem0 omdat use-case klein is en bestaande auto-memory voldoende dekt voor stabiele beslissingen.
- Sessie-continuïteit ingericht: `docs/where-we-are.md` bestand, SessionStart-hook in `.claude/settings.json` die het bij elke nieuwe sessie automatisch in context plaatst, memory-regel `feedback_where_we_are.md` als instructie om het bij te werken, en een Stop-hook met stille reminder als HEAD nieuwer is dan de laatste where-we-are-update. Commits `e31b458` en `6ea538b`.
- **Trigger-woord `noteer` geïntroduceerd**: gebruiker typt `noteer` (of synoniem `sessie klaar`, `tot zo`, `afsluiten`, `update where-we-are`, `log dit`) en Claude werkt where-we-are.md direct bij, commit en pusht zonder tussenvragen. Memory `feedback_where_we_are.md` uitgebreid met deze recognition.

---

## Volgende concrete stap

1. **Frontend redeploy** vanaf `bd0e3b4` en bevestigen wat nu echt live staat (met name inbox, settings-overview, dispatch/planning polish).
2. **Beslissen pad voor Snelstart**: blijven op legacy `snelstart-sync` (geen actie nodig) of overstappen naar nieuw connector-platform pad (vereist deploy + design-fix optie 1).
3. Bij keuze (b): design-fix optie 1 doorvoeren (`connector-dispatcher` rechtstreeks aanroepen vanuit `pipeline-trigger` en `financial-trigger`, los van klant-outbox), dan deploy van migraties + edge functions + DB-webhook + cron.
4. Gebruiker doet de deploy-acties uit "Openstaande deploy-acties" hierboven.
5. Eventueel volgende productstap: tussenstops ooit first-class modelleren, of sprint 9 oppakken (full CRUD op orders / eerste extra connector zoals Twinfield).

---

## Hoe dit bestand bijwerken

Aan het einde van een sessie waarin substantieel werk is gedaan (commits, scope-beslissingen, deploy-stappen, bug-fixes, design-keuzes): voeg een korte regel toe onder "Recente sessies-samenvatting" met datum + 2-3 bullets. Pas indien nodig "Wat draait waar", "Openstaande deploy-acties" en "Bekende issues" aan. Houd dit bestand onder 200 regels, oude sessie-samenvattingen na 4 sessies of bij irrelevantie weghalen.
