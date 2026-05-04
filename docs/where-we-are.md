# Waar staan we

**Bestand-doel**: aan het begin van elke sessie weet Claude waar we zijn gebleven, en aan het einde van elke sessie wordt dit bestand bijgewerkt zodat de volgende sessie ook weet waar we staan. Bron van waarheid voor harde feiten blijft `git log` en het Supabase-dashboard; dit bestand vult de zachte context aan (waarom, blokkers, openstaande beslissingen).

**Laatste update**: 2026-05-04 (Chauffeursportaal batch 2 gemerged via PR #23, commit `dfdf76d`)

---

## Wat draait waar

| Laag           | Bron                          | Status                                                  |
| -------------- | ----------------------------- | ------------------------------------------------------- |
| `origin/main`  | github.com/belrhoucheb-hash   | Tot commit `dfdf76d` (chauffeursportaal batch 2 + warehouse-flow + secure tenant_membership). |
| Frontend prod  | Vercel/Netlify (door gebruiker) | **Onbekend, gebruiker moet checken**. Vermoeden: nog op een oudere commit, want gebruiker zag connector-platform niet. |
| Supabase prod  | Supabase Dashboard            | Onbekend, gebruiker moet checken. Migraties tot `20260429010000` staan klaar in repo, niet bevestigd of toegepast. |
| Edge functions | Supabase Edge Functions       | Onbekend. Nieuw te deployen: `connector-snelstart`, `connector-exact_online`, `oauth-callback-exact`, `connector-dispatcher`, `eta-watcher`. |

---

## Wat is af in code (gemerged op origin/main)

- **Chauffeursportaal Uber-flow productie** (PR #20, #21, #23): `/chauffeur` heeft full-bleed Leaflet map, glass header, draggable bottom-sheet met SwipeToConfirm, hamburger drawer met voertuigcheck-gate, rooster (week+maand), beschikbaarheid, chat, documenten, cijfers, bonnetjes, tachograaf-import stub, instellingen (taal/nav-app/dark-mode/GPS-spaarmodus/haptics/notificaties), SOS. Bottom-sheet met NextStopHero + km/ETA + Navigeer/Bel. Geofence-toast met stop-naam + 5s undo. CMR on-the-spot signing met email-copy + on-device PDF via jspdf, gepatcht naar `proof_of_delivery.cmr_pdf_url`. Klant-broadcast Edge Function `notify-customer-stop-status` met `last_notified_status` dedup. `messages`-tabel + realtime voor driver↔planner chat. `IncidentDialog` met 4 categorieen + verplichte foto + planner-notificatie. Offline POD queue in IndexedDB met parallel foto-upload + partial-success-semantiek. PIN-flow met PBKDF2/100k + DB-side lockout. `IconBubble` premium icon-treatment. `/chauffeur-demo` blijft als auth-loze visuele showcase.
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

### Net na chauffeursportaal batch 2 (PR #23, urgent)
1. **`supabase db push`** voor 6 migraties die nog wachten:
   - `20260504120030_warehouse_flow_references.sql`
   - `20260504120100_stop_incidents.sql`
   - `20260504120200_driver_planner_messages.sql`
   - `20260504130000_trip_stops_last_notified.sql`
   - `20260504141741_proof_of_delivery_cmr_pdf.sql`
   - `20260505000000_secure_tenant_membership.sql`
   `20260504120000_trip_stops_extra_field.sql` is al toegepast en wordt overgeslagen.
2. **`supabase functions deploy notify-customer-stop-status`** voor de nieuwe dedup-logica via `last_notified_status`. Zonder deze deploy blijft de klant dubbele AANGEKOMEN-broadcasts ontvangen.
3. **Frontend redeploy** vanaf commit `dfdf76d` zodat de Uber-flow `/chauffeur` UI live komt.

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

## Sprint 9 security-fixes (in progress, 2026-05-04)

Pentest in deze sessie afgerond, 12 deelchecks. Resultaat: 1 CRITICAL, 2 HIGH, 1 MEDIUM, 2 LOW (geaccepteerd). Vier subagents werken parallel aan de remediatie. NewOrder/warehouse-flow zit los, codex-PR #22 staat al op `main` (commit `3022874`).

| Finding | Status | Fix-doc |
| ------- | ------ | ------- |
| **CRITICAL-1**, signup tenant-injection via `data.tenant_id` in `/auth/v1/signup`, attacker kan zich aan elke tenant koppelen | fix-in-progress (subagent A) | [`docs/sprint-9/security-critical-1.md`](sprint-9/security-critical-1.md) |
| **HIGH-1**, edge functions `office-login`/`google-places`/`google-places-business`/`kvk-lookup` accepteren anonieme calls zonder JWT/rate-limit | fix-in-progress (subagent B) | [`docs/sprint-9/security-high-1.md`](sprint-9/security-high-1.md) |
| **HIGH-2**, login-lockout is client-side, te omzeilen met andere browser/device | fix-in-progress (subagent C) | [`docs/sprint-9/security-high-2.md`](sprint-9/security-high-2.md) |
| **MEDIUM-1**, PostgREST PATCH op `user_roles`/`tenant_members` geeft `200 []` ipv `403` bij geblokkeerde UPDATE | fix-aanbeveling klaar (subagent D) | [`docs/sprint-9/security-medium-1.md`](sprint-9/security-medium-1.md) |

Sprint-changelog: [`docs/sprint-9/03-changelog.md`](sprint-9/03-changelog.md). Deploy-checklist met smoke-tests: [`docs/sprint-9/deploy-checklist.md`](sprint-9/deploy-checklist.md). Klant-testpunten zijn aan [`docs/klant-testplan.md`](klant-testplan.md) toegevoegd onder "Sprint 9 security en warehouse-flow".

LOW-bevindingen geaccepteerd zonder actie: Google Maps publishable key in client bundle (by design), DOMPurify gebruik beperkt tot 1 file.

---

## Recente sessies-samenvatting

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
