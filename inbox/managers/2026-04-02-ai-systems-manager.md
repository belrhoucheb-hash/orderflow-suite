# AI Systems Manager Update — 2026-04-02

## AI Kwaliteit
- Confidence normalisatie: **geimplementeerd maar gedupliceerd** — parse-order normaliseert correct (0-1 -> 0-100), maar dezelfde logica staat ook 2x in useInbox.ts (frontend). Geen dubbel-normalisatie dankzij de range-check, maar fragiel en onderhoudsgevoelig.
- Feedback loop: **deels actief** — ai_corrections tabel bestaat en wordt door parse-order geconsulteerd (fetchCorrections). Correcties worden meegestuurd naar Gemini als context. MAAR: de ai_corrections tabel gebruikt TEXT voor order_id terwijl orders UUID gebruikt, zonder foreign key. Dit ondermijnt de referentiele integriteit van de feedback data.
- Client templates: **actief** — client_extraction_templates worden opgehaald en meegegeven aan het extractie-prompt. Upsert gebeurt fire-and-forget bij confidence >= 90. Template wordt elke 10e extractie bijgewerkt. Goed werkend mechanisme.
- Adresvalidatie: **actief** — parse-order detecteert city-only adressen (geen huisnummer) en straft field_confidence af naar max 40. Incomplete adressen worden aan missing_fields toegevoegd en krijgen een -20 penalty op de totale confidence. Solide implementatie.

## Bevindingen
### Van Monitoring
- **[Kritiek] import-email mist AI-extractie** (signaal 7): Handmatig geimporteerde emails slaan parse-order over. Alleen poll-inbox roept de AI aan. Handmatige imports missen daardoor confidence_score, missing_fields en follow_up_draft. De frontend (useInbox) doet wel een auto-extract, maar dit is afhankelijk van het bezoeken van de inbox-pagina.
- **[Waarschuwing] ai_corrections order_id is TEXT, niet UUID** (signaal 8): Geen referentiele integriteit, wees-records mogelijk, joins trager door type mismatch. Dit ondermijnt de betrouwbaarheid van de feedback loop op termijn.
- **[Info] Confidence normalisatie op 3 plekken** (signaal 9): parse-order (bron, correct), useInbox handleLoadTestScenario, useInbox auto-extract effect. Code-duplicatie die tot verwarring kan leiden.
- **[Waarschuwing] poll-inbox client lookup zonder tenant_id** (signaal 11): Rule-based classificatie matcht clients zonder tenant filter. Bij multi-tenant gebruik kan een email verkeerd geclassificeerd worden.
- **[Kritiek] create-order mist tenant_id** (signaal 5): Orders via de API-endpoint krijgen geen tenant_id. Dit raakt de AI indirect: orders zonder tenant_id worden niet correct meegenomen in patronen en templates.

### Van QA
- **[Middel] BulkImportDialog `as any` bij client insert zonder tenant_id** (bevinding 1): Nieuwe clients via CSV-import krijgen geen tenant_id. Dit vervuilt de client data waarop de AI haar templates en patronen baseert.
- **[Kritiek] Planning.tsx haalt time_window velden niet op** (bevinding 2): De hele tijdvenster-feature (die de AI correct extraheert) wordt effectief genegeerd in de dagplanning omdat time_window_start/end niet in de .select() staan. De AI doet haar werk goed, maar de frontend gooit het resultaat weg.
- **[Hoog] ClientPortal order insert zonder server-side validatie** (bevinding 5): Orders via het klantportaal omzeilen de AI-pipeline volledig en hebben zwakke tenant-koppeling.

## AI Automatiseringsgraad
| Component | Status | Kwaliteit |
|-----------|--------|-----------|
| Email extractie | Actief (Gemini 2.5 Flash) | Goed — structured output met JSON schema, retry met backoff, uitgebreide prompt met voorbeelden |
| Confidence scoring | Actief | Goed — field-level confidence, penalties voor missende velden, adresvalidatie-penalties, normalisatie aanwezig |
| Feedback loop | Deels actief | Matig — correcties worden gelezen en meegegeven, maar ai_corrections tabel heeft type mismatch (TEXT vs UUID) en geen FK constraint |
| Route optimalisatie | Actief (2-opt VRP solver) | Goed — capaciteit, features en tijdvensters worden meegenomen. Maar time_window data bereikt de planning UI niet (QA bevinding 2) |
| Client templates | Actief | Goed — auto-creatie na 5+ succesvolle extracties, periodieke update, wordt meegegeven aan extractie-prompt |
| Anomaly detection | Actief | Goed — vergelijkt gewicht/aantal met klanthistorie, triggert bij >3x of <0.2x afwijking |
| Thread classificatie | Actief | Goed — update/cancellation/confirmation/question/new classificatie voor email threads |
| AI cost tracking | Actief | Goed — ai_usage_log met token counts en cost estimate per call |

## Aanbeveling aan CEO
De AI-pipeline is technisch sterk: extractie, confidence scoring, anomaly detection, templates en thread classificatie werken allemaal. De grootste risico's zitten niet in de AI zelf maar in de data-integriteit eromheen: de feedback loop (ai_corrections) mist referentiele integriteit, import-email slaat de AI over, en de tijdvenster-data die de AI correct extraheert wordt in de planning UI weggegooid. Prioriteit 1: fix de time_window select in Planning.tsx (anders is die hele feature dood). Prioriteit 2: repareer ai_corrections tabel (UUID + FK) en zorg dat import-email ook parse-order aanroept. Prioriteit 3: elimineer de gedupliceerde confidence normalisatie in de frontend.
