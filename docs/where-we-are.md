# Waar staan we

**Bestand-doel**: aan het begin van elke sessie weet Claude waar we zijn gebleven, en aan het einde van elke sessie wordt dit bestand bijgewerkt zodat de volgende sessie ook weet waar we staan. Bron van waarheid voor harde feiten blijft `git log` en het Supabase-dashboard; dit bestand vult de zachte context aan (waarom, blokkers, openstaande beslissingen).

**Laatste update**: 2026-04-29 (Snelstart-werking in prod verhelderd; legacy pad werkt, nieuwe pad is dood-code tot deploy + design-fix)

---

## Wat draait waar

| Laag           | Bron                          | Status                                                  |
| -------------- | ----------------------------- | ------------------------------------------------------- |
| `origin/main`  | github.com/belrhoucheb-hash   | Tot commit `11a580f` (brand-tiles in connector-tiles).  |
| Frontend prod  | Vercel/Netlify (door gebruiker) | **Onbekend, gebruiker moet checken**. Vermoeden: nog op een oudere commit, want gebruiker zag connector-platform niet. |
| Supabase prod  | Supabase Dashboard            | Onbekend, gebruiker moet checken. Migraties tot `20260429010000` staan klaar in repo, niet bevestigd of toegepast. |
| Edge functions | Supabase Edge Functions       | Onbekend. Nieuw te deployen: `connector-snelstart`, `connector-exact_online`, `oauth-callback-exact`, `connector-dispatcher`, `eta-watcher`. |

---

## Wat is af in code (gemerged op origin/main)

- **Sprint 5**, outbound webhooks (HMAC, retry, replay, delivery-log), tab onder Settings > Webhooks.
- **Sprint 6**, publieke REST API v1 (bearer-tokens, scopes, rate-limit), tab onder Settings > API-tokens, ook in klantportaal.
- **Sprint 7**, rooster-module met dag/week-view, dag-acties, filters.
- **Sprint 8 (parallel)**, voorspellende ETA-engine met klant-pushes, `eta-watcher` edge function.
- **Sprint 8 (deze sessie)**, connector-platform met catalogus, runtime, sync-log, mapping. Snelstart en Exact live, Twinfield/AFAS/Webfleet/Samsara als "binnenkort"-kaart. Brand-kleur tiles in catalogus.
- **Infra**, nightly CI (bench/lighthouse/k6 load), security-tests over API + webhook-HMAC.

---

## Openstaande deploy-acties (door gebruiker te doen)

1. **Frontend redeploy** vanaf commit `11a580f`. Vercel/Netlify dashboard, redeploy of lege commit pushen.
2. **Migraties uitrollen**: `supabase db push` voor 14 migraties sinds `20260424000000_webhook_subscriptions.sql`.
3. **Edge functions deployen**: `supabase functions deploy connector-snelstart connector-exact_online oauth-callback-exact connector-dispatcher eta-watcher`.
4. **Env vars** op Supabase: `EXACT_CLIENT_ID`, `EXACT_CLIENT_SECRET`, `EXACT_REDIRECT_URI`, `CRON_SECRET`. Frontend (.env): `VITE_EXACT_CLIENT_ID`, `VITE_EXACT_REDIRECT_URI`.
5. **DB-webhooks** in Supabase Dashboard: `webhook_deliveries` INSERT → `webhook-dispatcher` (klant-webhooks) **én** → `connector-dispatcher` (interne connectoren). Twee aparte hooks op dezelfde insert.
6. **Cron jobs**: elke minuut `eta-watcher` en `webhook-dispatcher`, elke 5 min `connector-dispatcher` als catch-up.
7. **Exact-app** registreren via apps.exactonline.com met redirect `https://{project}.functions.supabase.co/oauth-callback-exact`.

---

## Bekende issues / openstaande beslissingen

- **Design-issue connector-trigger**: `connector-dispatcher` leest uit `webhook_deliveries`, maar die tabel wordt alleen gevuld als er een matchende klant-subscription is. Geen klant-subscription op `invoice.sent` → connectoren worden niet getriggerd. Voorgestelde fix (optie 1): `connector-dispatcher` rechtstreeks aanroepen vanuit `pipeline-trigger` en `financial-trigger`, los van de klant-outbox. **Niet gefixt; wacht op gebruikers-akkoord.**
- **`snelstart-sync` edge function** is legacy; nieuwe pad is `connector-snelstart`. Deprecation pas in latere sprint.
- **`snelstart_*`-kolommen op `invoices`** zijn snelstart-specifiek; bij meer connectoren generiek maken (`external_invoice_status`, `external_id`). Niet in scope nu.
- **Geen idempotentie** bij dubbele `invoice.sent`-emit: tweede push naar Snelstart of Exact maakt tweede boeking. Klant moet dedupliceren op factuurnummer aan hun kant. Documenteren als bekende beperking.
- **Plain JSONB credentials**: niet versleuteld at-rest. `pgsodium` of Supabase Vault staat op v2-roadmap.
- **pg_cron eta-watcher faalt op productie**: `current_setting('app.settings.supabase_url', true)` is leeg, `ALTER DATABASE ... SET app.settings.*` mag niet door SQL-Editor-rol op gehoste Supabase. Fix-route ligt klaar (Supabase Vault: `vault.create_secret` + `cron.schedule` herregistreren met `(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = '...')`), gebruiker heeft hem geparkeerd als "te ingewikkeld voor nu". Zelfde issue raakt `notify-expiring-certificates`. Zonder fix: geen klant-SMS'en, geen voorspelde-vertraging exceptions, geen ETA-badge in Dispatch.

---

## Recente sessies-samenvatting

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

1. **Beslissen pad voor Snelstart**: blijven op legacy `snelstart-sync` (geen actie nodig) of overstappen naar nieuw connector-platform pad (vereist deploy + design-fix optie 1).
2. Bij keuze (b): design-fix optie 1 doorvoeren (`connector-dispatcher` rechtstreeks aanroepen vanuit `pipeline-trigger` en `financial-trigger`, los van klant-outbox), dan deploy van migraties + edge functions + DB-webhook + cron.
3. Gebruiker doet de 7 deploy-acties uit "Openstaande deploy-acties" hierboven.
4. Gebruiker rapporteert wat zichtbaar wordt in productie (Settings > Integraties moet zes connector-tiles tonen, Snelstart/Exact klikbaar met gekleurde brand-tile).
5. Eventueel sprint 9: full CRUD op orders, of de eerste extra connector (Twinfield).

---

## Hoe dit bestand bijwerken

Aan het einde van een sessie waarin substantieel werk is gedaan (commits, scope-beslissingen, deploy-stappen, bug-fixes, design-keuzes): voeg een korte regel toe onder "Recente sessies-samenvatting" met datum + 2-3 bullets. Pas indien nodig "Wat draait waar", "Openstaande deploy-acties" en "Bekende issues" aan. Houd dit bestand onder 200 regels, oude sessie-samenvattingen na 4 sessies of bij irrelevantie weghalen.
