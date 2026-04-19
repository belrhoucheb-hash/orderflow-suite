# AGENT BRIEF, werkregels voor autonome ontwikkeling

Dit document is het hulpboek voor scheduled of autonome Claude-runs die aan OrderFlow Suite werken. Lees dit vóór elke run. Bij conflict wint [VISION.md](VISION.md), bij scope-vragen wint deze brief.

## Vóór je begint

1. Lees [VISION.md](VISION.md), bevestig dat de taak past bij de noord-ster.
2. Lees `MEMORY.md` en relevante memory-files voor user-voorkeuren.
3. Check `git status` en `git log -5`, weet in welke staat je start.
4. Check `docs/sprint-*/`, welk sprint is actief en welke taken lopen.

Als de taak niet past bij de vision, **stop en rapporteer**, pas niets aan.

## Beslissingszones

### Groen, zelf uitvoeren

- Code schrijven op feature-branch `auto/<beschrijving>`.
- Unit tests (`npm test`) en type-check draaien.
- Linter fixen (`npm run lint`).
- PR openen met Nederlandse titel, beschrijving en klant-testplan.
- Backlog-items in `backlog/` aanvinken met commit-referentie.
- Research-notities toevoegen onder `docs/sprint-*/` of `inbox/`.
- Secret-leak check draaien (`npm run check:secret-leaks`).

### Geel, voorstel schrijven, wachten op Badr

- **Supabase migraties**, nieuwe tabel, kolom-wijziging, RLS-policy.
- **Nieuwe dependencies** in `package.json`.
- **Nieuwe Edge Function** of wijziging in `parse-order`, `poll-inbox`, `send-confirmation`.
- **Architectuur-keuzes**, nieuwe state-store, nieuwe routing-laag, nieuwe integratie.
- **UI-flow wijzigingen**, nieuwe tab, nieuwe wizard, herschikking van bestaande schermen.
- **Pricing-logica aanpassingen**, buiten documenteerde edge-cases.

Zet voorstel in `inbox/agent/<datum>-<onderwerp>.md` met context, opties, aanbeveling.

### Rood, nooit zonder expliciete opdracht van Badr

- Merge naar `main` of release-branch.
- `git push --force`, `reset --hard`, `checkout .`, migratie verwijderen.
- Productie Supabase-data aanraken, RLS uitschakelen, `dev_rls_bypass.sql` toepassen.
- Authenticatie, tenant-isolatie, facturatie-berekening, pricing-core wijzigen.
- Keys, secrets, `.env` aanraken.
- Publieke communicatie (PR-reviews op externe repos, issues aanmaken in andere projecten).

## Kwaliteitseisen

**Tests**
- Elke nieuwe functie heeft een unit test, elke bugfix heeft een regression test.
- Integration tests raken een echte (dev) Supabase, geen mocks voor DB-gedrag.
- E2E tests (`playwright`) voor UI-flows die klant raakt.

**Code**
- Kleinste verandering die het probleem oplost, geen refactor-huiswerk meenemen.
- Edit bestaande bestanden, maak geen nieuwe tenzij noodzakelijk.
- Geen commentaar dat vertelt WAT code doet, alleen WAAROM bij niet-triviaal.
- Geen dode code, geen stubs voor later, geen backwards-compat laagjes.

**Commits**
- Conventional: `<type>(<scope>): <wat en waarom>`, bv. `fix(pricing): minimum-check miste voor DAF`.
- Één doel per commit, expliciete staging (geen `git add .`).
- Nooit `--no-verify`, als een hook faalt, fix de oorzaak.

**Communicatie**
- Nederlands, geen em-dashes (— of –), vervang door komma, punt of nieuwe zin.
- Verwijs naar code met `bestand:regelnummer`.
- Rapporteer na elke run: wat gedaan, wat geblokkeerd, wat aanbevolen.

## Twijfelgevallen, beslisboom

1. **Kan ik het verifiëren?** Zo niet, zet het in geel.
2. **Raakt het meerdere tenants of productie?** Geel of rood.
3. **Is het omkeerbaar in één commit?** Zo niet, geel.
4. **Staat het expliciet in VISION.md of sprint-plan?** Groen.
5. **Twijfel?** Geel, altijd, beter één vraag te veel dan één fout.

## Waar dingen staan, referentie

- **Productvisie**, `VISION.md`
- **Sprints en plannen**, `docs/sprint-*/`, `docs/superpowers/plans/`
- **Pricing-details**, `docs/pricing/royalty-cargo-tarieven.csv`, `supabase/functions/_shared/pricingEngine.ts`
- **Klant-testplan**, `docs/klant-testplan.md`, bijwerken bij elke feature
- **Backlog**, `backlog/*.md`
- **Memory van Claude**, `C:\Users\Badr\.claude\projects\C--Users-Badr-Desktop-DevBadr-orderflow-suite\memory\MEMORY.md`
- **Agent-voorstellen**, `inbox/agent/`
- **Changelog**, `CHANGELOG.md`

## Stopconditie

Als één van deze waar is, stop en rapporteer:

- Testen falen en oorzaak is onduidelijk.
- Schema-mismatch tussen code en Supabase.
- Onverwachte uncommitted bestanden die niet van jou zijn.
- Memory of VISION geeft tegenstrijdige richting.
- Je zit drie keer achter elkaar in dezelfde fout-variatie.

Forceer niet. Liever een korte run met helder rapport dan een lange run met verborgen schade.
