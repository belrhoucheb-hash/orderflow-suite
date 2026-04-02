# Product Manager Update — 2026-04-02

## Ontvangen van
- UX Reviewer: 20 bevindingen (1 kritiek, 7 hoog, 8 middel, 4 laag) over Inbox + Mail pagina's
- Feature Scout: 8 features ontdekt in Orders/Dispatch domein

## Gefilterd & geprioriteerd

### P0 — Direct actie (escaleer naar CEO)

1. **#13 Compose "Versturen" verstuurt niet — slaat op als DRAFT** — Kritiek vertrouwensprobleem. Planner denkt mail te versturen, klant ontvangt niets. Dit ondermijnt de geloofwaardigheid van het hele product. CEO moet beslissen: (a) knop hernoemen naar "Opslaan als concept" als snelle fix, of (b) prioriteit geven aan echte verzending via edge function.

2. **#15 Archive/Delete knoppen in Mail doen niets** — Success-toast wordt getoond maar er is geen database-operatie. Samen met #13 maakt dit de Mail-pagina onbetrouwbaar. CEO moet beslissen: Mail-pagina tijdelijk als "beta" labelen of deze knoppen disablen tot ze werken.

3. **#8 Verwijderen zonder bevestiging (permanent DELETE)** — Misclick verwijdert order onherroepelijk. Combinatie van destructief + geen undo = dataloss-risico. Moet binnen 24-48 uur gefixed zijn.

4. **Inbox/Mail strategische overlap (#20)** — Twee pagina's met overlappende functionaliteit zonder helder mentaal model. Dit is een productbeslissing, niet een dev-taak. CEO moet richting kiezen: samenvoegen of scherp afbakenen.

### P1 — Deze week oppakken

1. **#4 Bulk-goedkeuring zonder feedback** — Stille skip van orders met fouten leidt tot gemiste orders. Toegewezen aan: Frontend Developer. Fix: toast met samenvatting na bulk-actie.
2. **#1 Hardcoded synchronisatietijd** — "2 min geleden" is altijd hetzelfde. Simpele fix met `dataUpdatedAt`. Toegewezen aan: Frontend Developer.
3. **#3 Sidebar verborgen op tablets** — Dispatchers op tablets (veel gebruikt in logistiek) kunnen niet filteren. Toegewezen aan: Frontend Developer. Fix: Sheet/Drawer component op md breakpoint.
4. **#7 Dubbele auto-extractie triggers** — Dubbele AI-calls = onnodige kosten + race conditions. Toegewezen aan: Frontend Developer. Fix: centraliseer in hook, verwijder uit SourcePanel.
5. **#11 Star-status niet persistent** — Feature werkt maar reset bij refresh. Toegewezen aan: Frontend Developer. Quick fix: localStorage. Beter: database kolom.
6. **Feature #1: Order Clone** — Quick win (effort S), hoge impact. Terugkerende transporten zijn standaard in TMS. Toegewezen aan: Frontend Developer.
7. **Feature #3: Batch Dispatch** — Quick win (effort S), versnelt dagelijkse routine. Toegewezen aan: Frontend Developer.

### P2 — Backlog

1. **#2 Toetsenbordsneltoetsen werken niet (Enter/Delete)** — Misleidend maar niet blokkerend.
2. **#5 Excessieve padding (pb-256) in review-panel** — UX frictie, geen dataverlies.
3. **#6 Scroll-voortgangsbalk altijd 0%** — Cosmetisch. Verwijderen of implementeren.
4. **#9 Filter-dropdowns missen "reset alle"** — Frictie bij dagelijks gebruik.
5. **#10 Confidence-ring niet touch-friendly** — Tablet accessibility.
6. **#12 Filter-knop toont misleidende success-toast** — Patroon van nep-toasts aanpakken als geheel.
7. **#14 "Meer opties" placeholder-toast** — Zelfde patroon als #12. Verbergen of disablen.
8. **#16 Geen gelezen/ongelezen onderscheid in Mail** — Belangrijk voor triage, maar Mail-pagina heeft eerst P0-fixes nodig.
9. **#17 Compose mist Escape-toets** — Kleine frictie.
10. **#18 Sluit-icoon is gedraaide chevron** — Cosmetisch.
11. **#19 Quick-reply deelt state met compose** — Bug bij edge case, oplossen bij compose-refactor.
12. **Feature #4: Order-status tijdlijn met duur** — Quick win (effort S) maar lage urgentie. Wacht op audit_log tabel.
13. **Feature #2: ETA-berekening + klantnotificatie** — Hoge impact maar effort M, afhankelijk van routing API. Volgende sprint.
14. **Feature #6: Time Window conflict-detectie** — Hoge impact, effort M, afhankelijk van ETA (#2). Na ETA.
15. **Feature #8: Dispatch live kaart** — Hoge impact, effort M. PlanningMap herbruikbaar. Volgende sprint.
16. **Feature #5: Auto-herverdeling bij weigering** — Hoge impact maar effort L. Ontwerp starten, bouw later.
17. **Feature #7: Order splitsen/samenvoegen** — Middel impact, effort L. Schema bestaat al. Parkeren.

## Overlap gedetecteerd

- **Bulk-operaties zonder feedback**: UX #4 (bulk-goedkeuring skip zonder melding) en Feature #3 (batch-dispatch) raken hetzelfde patroon — bulk-acties moeten altijd feedback geven over successen en failures. Eenmalig een BulkActionFeedback component bouwen.
- **Nep-functionaliteit patroon**: UX #13, #15, #12, #14 zijn allemaal knoppen die een success-toast tonen maar niets doen. Dit is een systematisch probleem dat het vertrouwen in het product ondermijnt. Aanpakken als sweep: alle placeholder-toasts identificeren en ofwel de functie bouwen of de knop verbergen/disablen.
- **Tablet/touch-gebruik**: UX #3 (sidebar verborgen), #10 (confidence niet touch-friendly) wijzen op onvoldoende tablet-optimalisatie terwijl tablets standaard zijn in logistiek.
- **ETA-keten**: Feature #2 (ETA-berekening) is voorwaarde voor Feature #6 (time window detectie). Deze moeten sequentieel gepland worden.

## Aanbeveling aan CEO

De Mail-pagina heeft een vertrouwensprobleem: de "Versturen"-knop verstuurt niet, en archive/delete doen niets. Dit moet vandaag nog geadresseerd worden, minimaal door knoppen te hernoemen of te verbergen. Daarnaast moet de verwijder-knop in Inbox een bevestigingsstap krijgen om dataloss te voorkomen. Als quick wins voor deze week: Order Clone en Batch Dispatch bouwen — beide effort S met directe tijdswinst voor dispatchers.
