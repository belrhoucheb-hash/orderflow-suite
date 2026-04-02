# Feature Discovery — Orders/Dispatch
**Datum:** 2026-04-02
**Domein:** orders/dispatch

---

## Ontdekte kans #1
### Order Duplicate / Clone functie
- **Impact:** hoog
- **Effort:** S
- **Urgentie:** hoog
- **Domein:** orders
- **Beschrijving:** Er is geen mogelijkheid om een bestaande order te dupliceren. Bij terugkerende transporten (zelfde klant, zelfde route) moet de planner alles opnieuw invoeren via het volledige NewOrder-formulier. Er is wel een BulkImportDialog maar geen quick-clone vanuit OrderDetail of de orderlijst.
- **Waarde:** Tijdsbesparing van 2-5 minuten per herhalingsorder. Bij klanten met wekelijkse ritten is dit al snel 30+ minuten per week per klant.
- **Bewijs:** OrderDetail.tsx heeft geen "dupliceer" knop. NewOrder.tsx begint altijd met lege state. Geen `useCloneOrder` hook aanwezig. Terugkerende transporten zijn standaard in TMS-workflows.
- **Voorgestelde aanpak:** Voeg een "Dupliceer" knop toe aan OrderDetail die navigeert naar `/orders/nieuw?clone={orderId}`. NewOrder leest dan de bronorder en prefilt het formulier.
- **Afhankelijkheden:** Geen — kan direct gebouwd worden.
- **Confidence:** hoog

---

## Ontdekte kans #2
### ETA-berekening en klantnotificatie bij Dispatch
- **Impact:** hoog
- **Effort:** M
- **Urgentie:** hoog
- **Domein:** dispatch
- **Beschrijving:** Dispatch.tsx toont de geplande starttijd en werkelijke starttijd van een rit, maar berekent geen ETA per stop. Er is geen live ETA-update voor de klant. De `estimatedDelivery` in useOrders is slechts een fallback op basis van prioriteit (4u of 24u na aanmaak) — niet op basis van werkelijke routeberekening.
- **Waarde:** Klanten verwachten vandaag de dag realtime leverupdates. Zonder ETA worden planners gebeld door klanten die willen weten "waar hun lading blijft". Vermindert telefonische druk met naar schatting 40-60%.
- **Bewijs:** useOrders.ts regels 96-104: `estimatedDelivery` is een statische offset, geen echte ETA. Dispatch.tsx toont geen ETA per stop. useDriverTracking.ts heeft GPS-data maar die wordt nergens gekoppeld aan een ETA-berekening. TrackTrace.tsx bestaat maar is niet verbonden met live dispatch data.
- **Voorgestelde aanpak:** (1) Bereken ETA per stop op basis van huidige GPS-positie + afstand tot volgende stop. (2) Toon ETA in Dispatch expandable stops. (3) Push ETA-updates naar een klantportaal of per mail/SMS.
- **Afhankelijkheden:** GPS-tracking (useGPSTracking) is al gebouwd. Routing API nodig (bijv. OSRM of Google Directions).
- **Confidence:** hoog

---

## Ontdekte kans #3
### Batch-dispatch (meerdere ritten tegelijk verzenden)
- **Impact:** middel
- **Effort:** S
- **Urgentie:** middel
- **Domein:** dispatch
- **Beschrijving:** In Dispatch.tsx kan een rit alleen individueel worden verzonden via de "Dispatch" knop. Bij een ochtendsessie met 15-20 ritten moet de dispatcher elke rit apart aanklikken en verzenden.
- **Waarde:** Versnelt de dagelijkse dispatch-routine van 5-10 minuten naar onder de minuut. Vermindert kans op vergeten ritten.
- **Bewijs:** Dispatch.tsx heeft geen checkbox-selectie of "Alles verzenden" functionaliteit. useDispatchTrip muteert een enkele tripId. Geen batch-operatie in useTrips.ts.
- **Voorgestelde aanpak:** Voeg checkboxes toe per rit in concept-status. Voeg een "Selectie dispatchen" floating action bar toe. Roep useDispatchTrip sequentieel of parallel aan voor geselecteerde ritten.
- **Afhankelijkheden:** Geen — useDispatchTrip bestaat al, enkel UI-wrapper nodig.
- **Confidence:** hoog

---

## Ontdekte kans #4
### Order-status tijdlijn met duur per fase
- **Impact:** middel
- **Effort:** S
- **Urgentie:** laag
- **Domein:** orders
- **Beschrijving:** OrderDetail.tsx bouwt een `auditTrail` op basis van losse timestamps (received_at, created_at, follow_up_sent_at, etc.) maar berekent niet hoeveel tijd elke fase heeft geduurd. Er zijn geen KPI's over gemiddelde doorlooptijd per status.
- **Waarde:** Inzicht in bottlenecks: "Orders staan gemiddeld 3 uur in PENDING voordat ze ingepland worden". Essentieel voor procesoptimalisatie en SLA-rapportage.
- **Bewijs:** OrderDetail.tsx regels 398-407 toont timestamps maar geen tijdsverschillen. De SLA-monitor (useSLAMonitor.ts) bewaakt alleen de initiEle 4-uur deadline, niet de totale lifecycle. Rapportage-pagina bestaat maar mist order-lifecycle analytics.
- **Voorgestelde aanpak:** (1) Bereken delta's tussen opeenvolgende statustransities. (2) Toon visuele tijdlijn met balken per fase in OrderDetail. (3) Aggregeer naar dashboard-KPI's (gem. doorlooptijd per status).
- **Afhankelijkheden:** Vereist dat statustransities met timestamps worden gelogd (nu impliciet via updated_at, maar geen dedicated audit_log tabel).
- **Confidence:** middel

---

## Ontdekte kans #5
### Automatische rit-herverdeling bij chauffeur-weigering
- **Impact:** hoog
- **Effort:** L
- **Urgentie:** middel
- **Domein:** dispatch
- **Beschrijving:** Wanneer een chauffeur een rit weigert (GEWEIGERD status), is dit een terminal state zonder verdere transitions. De dispatcher moet handmatig een nieuwe rit aanmaken en opnieuw toewijzen. Er is geen automatische fallback naar een andere beschikbare chauffeur.
- **Waarde:** Voorkomt vertragingen bij weigeringen. In de transportsector weigert gemiddeld 5-10% van de chauffeurs af en toe een rit. Zonder automatische herverdeling gaat kostbare tijd verloren.
- **Bewijs:** dispatch.ts regel 107: `GEWEIGERD: []` — geen transities mogelijk na weigering. useCapacityMatch.ts bestaat voor matching maar wordt niet aangeroepen bij weigering. EXCEPTION_TYPES bevat DRIVER_REFUSED maar dit is alleen voor logging, niet voor automatische actie.
- **Voorgestelde aanpak:** (1) Voeg GEWEIGERD -> CONCEPT als transitie toe. (2) Trigger bij weigering automatisch useCapacityMatch om alternatieve chauffeur/voertuig voor te stellen. (3) Toon dispatcher een "Herverdeel" dialoog met ranked opties.
- **Afhankelijkheden:** useCapacityMatch hook (bestaat al). Notificatie-systeem (bestaat al).
- **Confidence:** hoog

---

## Ontdekte kans #6
### Time window visualisatie en conflict-detectie
- **Impact:** hoog
- **Effort:** M
- **Urgentie:** hoog
- **Domein:** orders/dispatch
- **Beschrijving:** Het orders-schema bevat `time_window_start` en `time_window_end` velden, en NewOrder.tsx heeft tijdslot-invoervelden. Maar nergens in Dispatch of Planning wordt gevisualiseerd of een stop binnen het afgesproken tijdvenster valt. Er is geen waarschuwing als een geplande rit een time window dreigt te missen.
- **Waarde:** Time window schendingen zijn de #1 oorzaak van klachten in de transportsector. Proactieve detectie voorkomt boetes (veel retailers hanteren strafkortingen) en verhoogt klanttevredenheid.
- **Bewijs:** Supabase types.ts: `time_window_start` en `time_window_end` bestaan op orders. TripStop.planned_time bestaat maar wordt niet vergeleken met order time windows. Dispatch.tsx toont planned_time maar geen time window context. De Exceptions-pagina detecteert STOP_LATE maar alleen achteraf, niet vooraf.
- **Voorgestelde aanpak:** (1) Propageer time_window van order naar trip_stop bij rit-aanmaak. (2) Toon in Dispatch per stop een visuele indicator (groen/oranje/rood) of de ETA binnen het window valt. (3) Genereer proactief een waarschuwing als een geplande tijd buiten het window dreigt te vallen.
- **Afhankelijkheden:** ETA-berekening (kans #2). Time window data moet consistent worden ingevuld bij orderaanmaak.
- **Confidence:** hoog

---

## Ontdekte kans #7
### Order splitsen en samenvoegen
- **Impact:** middel
- **Effort:** L
- **Urgentie:** laag
- **Domein:** orders
- **Beschrijving:** Er is een `parent_order_id` veld in het orders-schema, wat suggereert dat order-hiErarchie ooit gepland was. Maar er is geen UI om een order te splitsen (bijv. 20 pallets over 2 ritten) of meerdere kleine orders samen te voegen tot EEn rit.
- **Waarde:** Bij deelladingen (LTL) is splitsen/samenvoegen essentieel voor efficiEnte beladingsgraad. Kan voertuigbenutting met 15-25% verhogen.
- **Bewijs:** Supabase types.ts: `parent_order_id: string | null` bestaat maar wordt nergens in de UI gebruikt. Geen "split" of "merge" actie in OrderDetail.tsx. useCreateOrder doet geen parent_order_id-koppeling.
- **Voorgestelde aanpak:** (1) "Splits order" actie in OrderDetail die sub-orders aanmaakt met parent_order_id link. (2) In Planning: visuele indicator voor orders die bij dezelfde parent horen. (3) "Voeg samen" optie in de orderlijst voor geselecteerde orders naar hetzelfde adres.
- **Afhankelijkheden:** Bulk-selectie in Orders.tsx (bestaat niet). parent_order_id schema (bestaat al in DB).
- **Confidence:** middel

---

## Ontdekte kans #8
### Dispatch live kaartweergave
- **Impact:** hoog
- **Effort:** M
- **Urgentie:** middel
- **Domein:** dispatch
- **Beschrijving:** Dispatch.tsx is puur een lijst/card-gebaseerde view. Er is geen kaart die actieve ritten, chauffeurposities en stops visueel toont. Planning.tsx heeft wel een PlanningMap component, maar Dispatch heeft geen equivalent.
- **Waarde:** Dispatchers in de transportsector werken standaard met een live kaartview om bottlenecks, nabijheid en verkeerssituaties te monitoren. Zonder kaart mist de dispatcher ruimtelijk inzicht.
- **Bewijs:** Dispatch.tsx importeert geen map-component. PlanningMap bestaat in components/planning/ maar wordt alleen in Planning.tsx gebruikt. useGPSTracking slaat posities op in driver_positions maar deze worden nergens op een kaart getoond voor dispatchers.
- **Voorgestelde aanpak:** (1) Voeg een toggle toe in Dispatch voor lijst/kaart weergave. (2) Hergebruik PlanningMap of bouw een DispatchMap die live chauffeurposities toont (via driver_positions polling). (3) Toon routes met kleurindicatie per status.
- **Afhankelijkheden:** PlanningMap component (bestaat). GPS data opslag (useGPSTracking bestaat).
- **Confidence:** hoog

---

## Samenvatting prioriteitsmatrix

| # | Feature | Impact | Effort | Quick win? |
|---|---------|--------|--------|------------|
| 1 | Order Clone | Hoog | S | JA |
| 3 | Batch Dispatch | Middel | S | JA |
| 6 | Time Window Detectie | Hoog | M | NEE |
| 2 | ETA Berekening | Hoog | M | NEE |
| 8 | Dispatch Live Kaart | Hoog | M | NEE |
| 5 | Auto-herverdeling Weigering | Hoog | L | NEE |
| 4 | Tijdlijn met Duur | Middel | S | JA |
| 7 | Order Split/Merge | Middel | L | NEE |

**Aanbeveling voor sprint:** Start met #1 (Order Clone) en #3 (Batch Dispatch) als quick wins. Paralleel ontwerp starten voor #6 (Time Window) en #2 (ETA) als high-impact features voor de volgende sprint.
