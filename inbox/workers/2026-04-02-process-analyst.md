# Procesanalyse — Dispatch to Delivery
**Datum:** 2026-04-02
**Proces:** dispatch-to-delivery
**Module:** dispatch/chauffeur

## Huidige processtappen
| Stap | Beschrijving | Automatisch? | Mens nodig? | Waarom? |
|------|-------------|-------------|-------------|---------|
| 1. Rit aanmaken (CONCEPT) | Dispatcher maakt trip aan met voertuig, chauffeur en stops vanuit planning | Nee (handmatig) | Ja | Dispatcher kiest handmatig welke orders in welke rit, welk voertuig en welke chauffeur |
| 2. Validatie pre-dispatch | Bij verzenden wordt gecontroleerd: chauffeur toegewezen, stops hebben adres, minstens 1 stop | Ja (automatisch) | Nee | Code in `useDispatchTrip` valideert automatisch |
| 3. Dispatch (CONCEPT -> VERZONDEN) | Dispatcher klikt "Dispatch", status gaat naar VERZONDEN, timestamp wordt gezet | Semi-auto (1 klik) | Ja | Dispatcher bepaalt wanneer rit verzonden wordt |
| 4. Notificatie naar chauffeur | Na dispatch wordt in-app notificatie aangemaakt via `notifications` tabel + Supabase Realtime | Ja (automatisch) | Nee | Wordt automatisch getriggerd na succesvolle dispatch |
| 5. Chauffeur ontvangt (VERZONDEN -> ONTVANGEN) | Chauffeur ziet notificatie in ChauffeurApp, status gaat naar ONTVANGEN | Nee (handmatig) | Ja | Chauffeur moet actief bevestigen dat rit ontvangen is |
| 6. Chauffeur accepteert (ONTVANGEN -> GEACCEPTEERD) | Chauffeur accepteert of weigert de rit | Nee (handmatig) | Ja | Bewuste keuze chauffeur, kan ook GEWEIGERD worden |
| 7. Rit starten (GEACCEPTEERD -> ACTIEF) | Chauffeur start rit, GPS tracking begint, orders gaan naar IN_TRANSIT | Semi-auto | Ja | Chauffeur start handmatig, maar order-statusupdate is automatisch |
| 8. GPS tracking | Positie wordt elke 30 sec gebufferd en naar `driver_positions` geschreven | Ja (automatisch) | Nee | Browser Geolocation API + interval flush |
| 9. Rijtijdregistratie (EU 561) | Continue en dagelijkse rijtijd wordt berekend, waarschuwingen bij 4u/4.5u/9u | Ja (automatisch) | Nee | Realtime berekening in `useDriveTime` met kleurcodering |
| 10. Geofence-detectie aankomst | Bij GPS-positie <200m van stoplocatie wordt toast getoond | Ja (automatisch) | Ja (HITL) | Systeem detecteert automatisch, maar chauffeur moet "Bevestig aankomst" klikken |
| 11. Stop-aankomst registreren (GEPLAND -> AANGEKOMEN) | Stop status wordt bijgewerkt met actual_arrival_time | Semi-auto | Ja | Geofence suggereert, chauffeur bevestigt |
| 12. Laden/Lossen (AANGEKOMEN -> LADEN/LOSSEN) | Chauffeur geeft aan dat laden of lossen bezig is | Nee (handmatig) | Ja | Fysieke activiteit die mens moet bevestigen |
| 13. POD vastleggen (handtekening + foto's) | Chauffeur laat ontvanger tekenen, maakt foto's (max 4), vult naam in | Nee (handmatig) | Ja | Juridisch bewijs vereist menselijke handeling |
| 14. POD uploaden naar Storage | Handtekening en foto's worden naar Supabase Storage geupload | Ja (automatisch) | Nee | Automatisch na POD-submit |
| 15. Offline POD fallback | Bij geen verbinding: POD opgeslagen in IndexedDB, sync bij reconnect | Ja (automatisch) | Nee | Automatische offline-detectie + sync via `offlineStore` |
| 16. Stop afronden (-> AFGELEVERD/MISLUKT) | Stop krijgt eindstatus, actual_departure_time wordt gezet | Semi-auto | Ja | Chauffeur bevestigt resultaat |
| 17. Delivery exception aanmaken | Bij probleem (schade, weigering, adres niet gevonden) wordt exception gelogd | Nee (handmatig) | Ja | Chauffeur of dispatcher moet probleem beschrijven |
| 18. Auto-trip completion | Als alle stops terminal zijn (AFGELEVERD/MISLUKT/OVERGESLAGEN), trip wordt automatisch VOLTOOID | Ja (automatisch) | Nee | Realtime subscription op trip_stops + `checkTripCompletion` |
| 19. Order-status update bij voltooiing | Orders gaan naar DELIVERED (bij AFGELEVERD) of blijven IN_TRANSIT (bij MISLUKT) | Ja (automatisch) | Nee | Automatisch in `checkTripCompletion` |
| 20. Billing-status check | Na aflevering: POD aanwezig + geen blokkerende exceptions = GEREED, anders GEBLOKKEERD | Ja (automatisch) | Nee | `checkAndUpdateBillingStatus` controleert POD + exceptions |
| 21. Inklokken/uitklokken chauffeur | Chauffeur registreert begin/einde werkdag en pauzes | Nee (handmatig) | Ja | Wettelijke verplichting, chauffeur moet zelf registreren |
| 22. PIN-authenticatie chauffeur | Chauffeur logt in met 4-cijferige PIN, lockout na 3 pogingen (5 min) | Semi-auto | Ja | Beveiliging vereist menselijke invoer |

## Automatiseringskansen

### [1. Automatische rit-toewijzing op basis van proximity/capaciteit]
- **Stap:** 1 (Rit aanmaken)
- **Huidige situatie:** Volledig handmatig — dispatcher kiest voertuig en chauffeur
- **Voorstel:** Semi-auto met check: systeem stelt optimale chauffeur/voertuig-combinatie voor op basis van locatie, beschikbare capaciteit en rijtijdregels (EU 561)
- **Impact:** Tijdsbesparing 10-15 min per rit, betere benutting vloot, minder lege km
- **Risico:** Suboptimale suggestie bij onvolledige data (bijv. chauffeur met onbekende locatie), verlies van dispatcher-kennis over specifieke klantvoorkeuren
- **Mens-in-de-loop:** Ja — dispatcher moet suggestie goedkeuren/aanpassen. Klantrelaties en specifieke afspraken zijn moeilijk te automatiseren
- **Confidence:** Middel

### [2. Automatisch ONTVANGEN-status bij app-opening]
- **Stap:** 5 (Chauffeur ontvangt)
- **Huidige situatie:** Handmatig — chauffeur moet bewust status veranderen naar ONTVANGEN
- **Voorstel:** Volledig auto: wanneer chauffeur de rit opent/bekijkt in ChauffeurApp, automatisch status naar ONTVANGEN zetten
- **Impact:** Elimineert een handmatige stap, sneller inzicht voor dispatcher of chauffeur rit heeft gezien
- **Risico:** Minimaal — "ontvangen" is puur informatief, geen commitment
- **Mens-in-de-loop:** Nee — dit is een read-receipt, geen beslissing
- **Confidence:** Hoog

### [3. Geofence-gebaseerde automatische aankomstregistratie]
- **Stap:** 10-11 (Geofence-detectie + aankomst)
- **Huidige situatie:** Semi-auto met HITL — systeem detecteert, chauffeur bevestigt via toast-knop
- **Voorstel:** Volledig auto bij hoge GPS-nauwkeurigheid (<50m accuracy): automatisch AANGEKOMEN zetten zonder bevestiging
- **Impact:** Chauffeur hoeft niet op telefoon te kijken bij aankomst, minder afleiding
- **Risico:** GPS-drift kan valse aankomst registreren, vooral in stedelijke gebieden met hoge gebouwen. Bij accuracy >50m is het onbetrouwbaar
- **Mens-in-de-loop:** Nee bij hoge accuracy, ja bij lage accuracy (huidige situatie behouden als fallback)
- **Confidence:** Middel — GPS-nauwkeurigheid varieert sterk per locatie

### [4. Automatisch laden/lossen-status op basis van stoptype]
- **Stap:** 12 (AANGEKOMEN -> LADEN/LOSSEN)
- **Huidige situatie:** Handmatig — chauffeur selecteert laden of lossen
- **Voorstel:** Volledig auto: stop_type PICKUP = automatisch LADEN, DELIVERY = automatisch LOSSEN bij aankomstregistratie
- **Impact:** Elimineert een onnodige handmatige stap, het stoptype is al bekend
- **Risico:** Gecombineerde stops (ophalen + afleveren op zelfde adres) werken niet goed
- **Mens-in-de-loop:** Nee — data is al beschikbaar in het systeem
- **Confidence:** Hoog

### [5. Smart route-optimalisatie voor stop-volgorde]
- **Stap:** 1 (Rit aanmaken — stop_sequence bepalen)
- **Huidige situatie:** Handmatig — dispatcher bepaalt volgorde van stops
- **Voorstel:** Semi-auto met check: systeem berekent optimale route op basis van afstanden en tijdvensters, dispatcher kan aanpassen
- **Impact:** 15-25% minder kilometers, betere leverbetrouwbaarheid, minder brandstofkosten
- **Risico:** Tijdvensters van klanten niet altijd in systeem, dispatcher kent lokale verkeerssituatie
- **Mens-in-de-loop:** Ja — dispatcher moet route goedkeuren, lokale kennis is waardevol
- **Confidence:** Middel

### [6. Automatische exception-detectie bij vertraging]
- **Stap:** 17 (Delivery exception aanmaken)
- **Huidige situatie:** Volledig handmatig — exception wordt alleen aangemaakt als iemand actie onderneemt
- **Voorstel:** Semi-auto: systeem detecteert automatisch vertragingen (actual_arrival_time > planned_time + marge) en maakt STOP_LATE exception aan
- **Impact:** Proactieve alerting, minder gemiste vertragingen, betere communicatie naar klant
- **Risico:** Te veel false positives als geplande tijden niet nauwkeurig zijn
- **Mens-in-de-loop:** Nee voor detectie, ja voor escalatie/opvolging
- **Confidence:** Hoog

### [7. Batch-dispatch voor meerdere ritten]
- **Stap:** 3 (Dispatch)
- **Huidige situatie:** Handmatig per rit — dispatcher dispatcht elke rit individueel
- **Voorstel:** Semi-auto: "Dispatch alle CONCEPT-ritten" knop met validatie-overzicht, of tijdgestuurde auto-dispatch (bijv. elke dag om 06:00 alle ritten van die dag)
- **Impact:** Tijdsbesparing bij veel ritten, minder kans op vergeten ritten
- **Risico:** Niet-klare ritten kunnen per ongeluk mee worden verstuurd
- **Mens-in-de-loop:** Ja — bevestiging voor batch-dispatch, checklist tonen
- **Confidence:** Hoog

### [8. POD-validatie automatiseren]
- **Stap:** 13-14 (POD vastleggen + uploaden)
- **Huidige situatie:** POD wordt opgeslagen met status ONTVANGEN, geen automatische kwaliteitscheck
- **Voorstel:** Semi-auto: AI-check op handtekening (niet leeg, minimale streken) en foto's (niet wazig, juiste orientatie), automatisch GOEDGEKEURD bij voldoende kwaliteit
- **Impact:** Minder handmatige POD-controle, snellere billing-flow
- **Risico:** AI kan valse handtekeningen/foto's accepteren
- **Mens-in-de-loop:** Ja bij afwijkende POD's (twijfelgevallen), nee bij duidelijk goede POD's
- **Confidence:** Laag — vereist ML-integratie

### [9. Automatisch offline-sync notificatie naar dispatcher]
- **Stap:** 15 (Offline POD fallback)
- **Huidige situatie:** Chauffeur ziet offline-melding, maar dispatcher weet niet dat POD nog pending is
- **Voorstel:** Semi-auto: wanneer chauffeur langer dan 10 min offline is, dispatcher automatisch informeren. Bij sync: bevestigingsnotificatie
- **Impact:** Beter overzicht voor dispatcher, minder onzekerheid over leverbewijs
- **Risico:** Minimaal
- **Mens-in-de-loop:** Nee — puur informatieve notificatie
- **Confidence:** Hoog

## Automatiseringsgraad
- Huidig: **45%** — Van de 22 stappen zijn er 10 volledig of grotendeels automatisch (validatie, notificaties, GPS tracking, rijtijdmonitoring, geofence-detectie, auto-trip completion, order-status updates, billing-check, POD upload, offline sync). De kernbeslissingen (toewijzing, dispatch-moment, acceptatie, POD-registratie) zijn handmatig.
- Na voorgestelde wijzigingen: **65%** — Met automatische ONTVANGEN-status, auto-aankomst bij hoge GPS, auto-laden/lossen op basis van stoptype, vertragingsdetectie, batch-dispatch en smart route-suggesties worden 4-5 handmatige stappen geelimineerd of gereduceerd tot bevestigingen. De fundamenteel menselijke stappen (rit-goedkeuring, POD-ondertekening door ontvanger, exception-afhandeling) blijven terecht handmatig.
