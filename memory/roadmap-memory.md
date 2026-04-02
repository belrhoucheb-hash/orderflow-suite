# Roadmap Memory

## Visie
Een slim, open TMS-systeem dat 90-95% automatisch werkt met menselijke controle op kritieke punten.

## Huidige modules en status

| Module | Status | Automatisering | Prioriteit |
|--------|--------|---------------|------------|
| Inbox/Email Parsing | Gebouwd + geoptimaliseerd | ~60% | Hoog |
| Orders (CRUD) | Gebouwd + validatie | ~65% | Hoog |
| AI Extractie (parse-order) | Gebouwd + feedback loop + templates | ~55% | Hoog |
| AI Corrections | Gebouwd + actief | ~40% | Hoog |
| Planning/VRP | Gebouwd + 2-opt + auto trips | ~50% | Middel |
| Dispatch to Delivery | Gebouwd (UI + geofence + offline POD) | ~45% | Hoog |
| Chauffeur App | Gebouwd + PIN auth + offline POD + rijtijd | ~55% | Middel |
| Fleet Management | Gebouwd + beladingsgraad | ~40% | Laag |
| Facturatie | Gebouwd + PDF + auto concept + haversine | ~45% | Middel |
| Track & Trace | Gebouwd (basis) | ~25% | Laag |
| Dashboard/KPI's | Gebouwd + design system | n/a | Laag |
| Multi-tenant | Gebouwd + RLS compleet | n/a | Onderhoud |
| Design System | Gebouwd (kleuren, typografie, components) | n/a | Onderhoud |
| Compliance (EU 561/2006) | Gebouwd (rijtijdregistratie) | ~70% | Middel |
| SLA Monitoring | Gebouwd (pg_cron, 10 min) | ~80% | Middel |

## Strategische prioriteiten

1. **Email -> Order pipeline versterken** — Opgeleverd: feedback loop, templates, per-veld confidence, auto-extractie bij selectie. Volgende stap: accuracy naar >90%
2. **Dispatch to Delivery** — Opgeleverd: UI, geofence, offline POD, trip-completion. Volgende stap: live tracking dashboard
3. **AI Corrections feedback loop** — Opgeleverd: actief, leren van fouten per klant
4. **Planning optimalisatie** — Opgeleverd: 2-opt, auto trips/stops. Volgende stap: tijdvensters, multi-depot
5. **Facturatie automatiseren** — Opgeleverd: auto concept-factuur, PDF generatie, haversine km. Volgende stap: e-facturatie (UBL/Peppol)
6. **Design system uitrollen** — Opgeleverd: kleurenschaal, typografie, 7 herbruikbare components, 13 pagina's gemigreerd
7. **Compliance & Security** — Opgeleverd: EU 561/2006 rijtijd, API keys beveiligd, RLS compleet
8. **E2E testing** — Volgende stap: Playwright tests voor kritieke flows

## Gemiddeld automatiseringspercentage
**~50%** (was ~25% begin van de dag)

## Doel
**90-95%** met menselijke controle op kritieke punten

## Geparkeerd
- Dark mode (P2)
- Multi-language (P2)

## Afgewezen
(Nog geen items)
