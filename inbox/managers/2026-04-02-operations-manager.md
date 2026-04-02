# Operations Manager Update — 2026-04-02

## Ontvangen van
- Process Analyst: dispatch-to-delivery analyse (22 processtappen, 9 automatiseringskansen)
- Monitoring Analyst: operationele signalen (2 kritiek, 4 waarschuwing, 6 info)

## Automatiseringsgraad
- Dispatch-to-delivery: 45% huidig → potentieel 65% na voorgestelde wijzigingen
- Doelstelling 90%: ver weg — fundamenteel menselijke stappen (POD-ondertekening, rit-goedkeuring, exception-afhandeling) maken 90% onrealistisch voor dit proces. Realistisch plafond: 70-75% met alle voorgestelde kansen geimplementeerd plus toekomstige ML-integratie (POD-validatie).
- HITL-compliance: OK — alle huidige HITL-punten zijn correct geimplementeerd. Geofence-detectie (stap 10) volgt het juiste patroon: systeem detecteert, mens bevestigt. De voorgestelde verwijdering van HITL bij hoge GPS-accuracy is acceptabel mits fallback behouden blijft.

## Top automatiseringskansen

1. **Automatisch ONTVANGEN-status bij app-opening** — impact: middel — effort: S — HITL: niet nodig
   - Puur informatief (read-receipt), geen risico. Direct implementeerbaar. Elimineert onnodige handmatige stap.

2. **Auto laden/lossen op basis van stoptype** — impact: middel — effort: S — HITL: niet nodig
   - Data is al beschikbaar (stop_type). Enige risico: gecombineerde stops. Oplossing: alleen auto-setten bij single-type stops.

3. **Automatische exception-detectie bij vertraging** — impact: hoog — effort: M — HITL: niet nodig voor detectie, wel voor escalatie
   - Proactieve alerting is een grote operationele verbetering. Vereist wel dat geplande tijden betrouwbaar in het systeem staan.

4. **Batch-dispatch** — impact: hoog — effort: M — HITL: nodig (bevestiging)
   - Tijdsbesparing bij volume. Veilig door HITL-bevestiging met checklist.

5. **Smart route-optimalisatie** — impact: hoog — effort: L — HITL: nodig (goedkeuring)
   - Grootste potentiele impact (15-25% minder km), maar ook hoogste effort. Fase 2 prioriteit.

6. **Offline-sync notificatie naar dispatcher** — impact: middel — effort: S — HITL: niet nodig
   - Laaghangend fruit. Lost een concreet operationeel blinde vlek op.

## Operationele risico's

1. **create-order edge function mist tenant_id** (KRITIEK) — impact: multi-tenant data-isolatie is gebroken voor orders via externe API. Orders worden onzichtbaar door RLS of gekoppeld aan verkeerde tenant. Dit moet voor productie-launch gefixed zijn.

2. **Driver PIN in plaintext opgeslagen** (KRITIEK) — impact: bij database-lek zijn alle chauffeur-PINs direct leesbaar. Security-incident wachtend om te gebeuren. Moet gehashed worden met pgcrypto.

3. **State machine inconsistentie frontend vs database** — impact: gebruikers krijgen verwarrende fouten bij statusovergangen. DB staat overgangen toe die frontend blokkeert (en omgekeerd). Leidt tot support-tickets en workarounds.

4. **Dubbele SLA-monitoring (browser + pg_cron)** — impact: dubbele notificaties, onnodige database-belasting die meegroeit met ordervolume. Bij schaling wordt dit een performance-bottleneck.

5. **Ontbrekende query limits (useSLAMonitor, useClients, useTrips)** — impact: performance-degradatie bij groei. Elke open browsertab voert ongelimiteerde queries uit elke 60 seconden.

6. **poll-inbox client lookup zonder tenant-filter** — impact: verkeerde email-classificatie bij multi-tenant gebruik. Nu single-tenant, maar tijdbom voor opschaling.

## Aanbeveling aan CEO

De operationele basis van dispatch-to-delivery is solide (45% automatisering, HITL correct geimplementeerd), maar er zijn twee kritieke blokkeerders voor productie: de ontbrekende tenant_id in create-order en plaintext PIN-opslag. Deze moeten per direct gefixt worden. Daarnaast raad ik aan om de drie quick-wins (auto ONTVANGEN-status, auto laden/lossen, offline-sync notificatie) als eerste sprint op te pakken — klein effort, directe operationele verbetering naar ~55% automatisering. De 90%-doelstelling is voor dit proces niet realistisch; 70-75% is het haalbare plafond gezien de terecht menselijke stappen (POD, rit-goedkeuring).
