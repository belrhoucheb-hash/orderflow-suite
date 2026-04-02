# UX Review — Inbox
**Datum:** 2026-04-02
**Pagina:** src/pages/Inbox.tsx + componenten
**Reviewer:** UX Reviewer

## Bevindingen

### 1. Hardcoded synchronisatietijd misleidt de gebruiker
- **Ernst:** hoog
- **Type:** onduidelijk
- **Locatie:** src/pages/Inbox.tsx:158
- **Beschrijving:** De tekst "Laatst gesynchroniseerd: 2 min geleden" is hardcoded. Dit verandert nooit, waardoor de planner denkt dat data recent is terwijl dat niet gegarandeerd is.
- **Impact:** Planner vertrouwt op verouderde data en mist nieuwe orders of wijzigingen.
- **Voorstel:** Vervang door een dynamische timestamp op basis van de laatste succesvolle query-fetch (bijv. via `dataUpdatedAt` van react-query).
- **Confidence:** hoog

### 2. Toetsenbordsneltoetsen staan in footer maar werken niet allemaal
- **Ernst:** middel
- **Type:** inconsistentie
- **Locatie:** src/pages/Inbox.tsx:273-275 en src/hooks/useInbox.ts:684-701
- **Beschrijving:** De footer toont "Enter openen" en "Del archiveren" als sneltoetsen, maar de keyboard handler implementeert alleen ArrowUp/Down/j/k navigatie. Enter en Delete doen niets.
- **Impact:** Ervaren dispatchers die snel willen werken raken gefrustreerd door niet-werkende sneltoetsen die wel geadverteerd worden.
- **Voorstel:** Implementeer Enter (selecteer/open) en Delete (archiveer/verwijder) in de keyboard handler, of verwijder de misleidende hints uit de footer.
- **Confidence:** hoog

### 3. Sidebar verborgen op tablets (md breakpoint) maar er is geen alternatief
- **Ernst:** hoog
- **Type:** frictie
- **Locatie:** src/pages/Inbox.tsx:77
- **Beschrijving:** De sidebar met filters (Alle, Actie nodig, Klaar, etc.) is `hidden lg:flex`, waardoor deze op tablets volledig ontbreekt. Er is geen hamburger-menu of alternatieve navigatie voor md-schermen.
- **Impact:** Dispatchers op tablets (veelgebruikt in logistiek) kunnen niet filteren op status en missen het overzicht van hoeveel orders actie nodig hebben.
- **Voorstel:** Voeg een mobile/tablet sidebar toe (bijv. een Sheet/Drawer component) die via een hamburger-icoon geopend kan worden op schermen < lg.
- **Confidence:** hoog

### 4. Bulk-actie "Goedkeuren" valideert niet visueel welke orders fouten hebben
- **Ernst:** hoog
- **Type:** onduidelijk
- **Locatie:** src/pages/Inbox.tsx:214-219
- **Beschrijving:** Bij bulk-goedkeuring worden orders met `getFormErrors(f)` stil overgeslagen (geen mutatie), maar de gebruiker krijgt geen feedback over welke orders niet zijn goedgekeurd en waarom.
- **Impact:** Planner denkt dat alle geselecteerde orders zijn goedgekeurd, maar sommige staan nog steeds als draft. Dit leidt tot gemiste orders.
- **Voorstel:** Toon een toast of samenvatting na bulk-actie: "3 van 5 goedgekeurd, 2 hebben ontbrekende velden". Overweeg een bevestigingsdialoog vooraf.
- **Confidence:** hoog

### 5. Review-panel heeft grote onzichtbare padding onderaan (pb-256)
- **Ernst:** middel
- **Type:** frictie
- **Locatie:** src/components/inbox/InboxReviewPanel.tsx:139
- **Beschrijving:** De content-area heeft `pb-256` (Tailwind = 64rem = 1024px padding-bottom) om ruimte te maken voor de sticky CTA. Dit is excessief en zorgt voor verwarrend veel lege scrollruimte.
- **Impact:** Dispatcher scrollt ver voorbij de content en raakt gedesoriënteerd, denkt dat er nog meer velden komen.
- **Voorstel:** Bereken de exacte hoogte van het sticky CTA-blok (circa 180-200px) en gebruik die als padding, of gebruik een flex-layout zodat de CTA los staat van de scroll-content.
- **Confidence:** hoog

### 6. Scroll-voortgangsbalk is altijd 0% en functioneert niet
- **Ernst:** laag
- **Type:** ontbrekend
- **Locatie:** src/components/inbox/InboxReviewPanel.tsx:57
- **Beschrijving:** Er staat een groene voortgangsbalk bovenaan het review-panel met `style={{ width: "0%" }}` en een id `review-progress`, maar er is geen JavaScript die de breedte update bij scrollen.
- **Impact:** Geen directe impact op workflow, maar het is een visueel element dat niet werkt en rommel oogt als het ooit zichtbaar zou zijn.
- **Voorstel:** Verwijder de balk of implementeer een scroll-event listener die de breedte dynamisch update.
- **Confidence:** hoog

### 7. Dubbele auto-extractie triggers bij selectie van een e-mail
- **Ernst:** middel
- **Type:** frictie
- **Locatie:** src/hooks/useInbox.ts:604-679 en src/components/inbox/InboxSourcePanel.tsx:197-218
- **Beschrijving:** Zowel `useInbox` (via useEffect op `selected?.id`) als `SourcePanel` (via useEffect op `selected.id`) triggeren onafhankelijk AI-extractie bij selectie. Dit kan leiden tot dubbele API-calls naar de parse-order edge function.
- **Impact:** Onnodige kosten (dubbele AI calls), mogelijke race conditions waardoor het reviewpanel flikkert met twee opeenvolgende updates, en vertraagde UX.
- **Voorstel:** Centraliseer de auto-extractie op een plek (bij voorkeur in de hook). Verwijder de autoExtract-logica uit SourcePanel.
- **Confidence:** hoog

### 8. Verwijder-knop ("Afwijzen & archiveren") heeft geen bevestigingsstap
- **Ernst:** hoog
- **Type:** frictie
- **Locatie:** src/components/inbox/InboxReviewPanel.tsx:312
- **Beschrijving:** "Afwijzen & archiveren" verwijdert de order direct uit de database (DELETE) zonder bevestigingsdialoog. Een misclick verwijdert de order permanent.
- **Impact:** Planner verliest een order onherroepelijk door een misclick. Er is geen undo of soft-delete.
- **Voorstel:** Voeg een AlertDialog/bevestigingsdialoog toe, of implementeer soft-delete (status -> ARCHIVED) met undo-mogelijkheid via toast.
- **Confidence:** hoog

### 9. Filter-dropdowns resetten niet zichtbaar en missen een "reset alle" optie
- **Ernst:** middel
- **Type:** frictie
- **Locatie:** src/pages/Inbox.tsx:172-205
- **Beschrijving:** Er zijn drie filter-dropdowns (Datum, Klant, Type) maar geen manier om alle filters in een keer te resetten. De actieve filterstatus is ook niet visueel duidelijk (geen badge/indicator).
- **Impact:** Dispatcher past filters toe, vergeet het, en ziet een lege lijst zonder te begrijpen waarom. Moet elke dropdown handmatig terugzetten.
- **Voorstel:** Voeg een "Wis filters" knop toe die verschijnt zodra een filter actief is. Toon actieve filters als badges/chips boven de lijst.
- **Confidence:** hoog

### 10. Confidence-ring tooltip verdwijnt te snel en is niet touch-friendly
- **Ernst:** laag
- **Type:** accessibility
- **Locatie:** src/components/inbox/InboxReviewPanel.tsx:69-108
- **Beschrijving:** De per-veld confidence breakdown wordt getoond via onMouseEnter/onMouseLeave. Dit werkt niet op touch-devices en de dropdown verdwijnt zodra je de muis beweegt.
- **Impact:** Dispatchers op tablets (touch) kunnen de AI-confidence per veld niet inzien.
- **Voorstel:** Maak er een click/toggle-tooltip van, of gebruik een Popover-component dat ook op touch werkt.
- **Confidence:** hoog

---

# UX Review — Mail
**Datum:** 2026-04-02
**Pagina:** src/pages/Mail.tsx
**Reviewer:** UX Reviewer

## Bevindingen

### 11. Star-status is alleen client-side en gaat verloren bij page refresh
- **Ernst:** middel
- **Type:** ontbrekend
- **Locatie:** src/pages/Mail.tsx:55, 142-148
- **Beschrijving:** `starredIds` wordt opgeslagen in lokale state (`useState<Set<string>>`). Bij pagina-verversing of navigatie zijn alle sterren weg.
- **Impact:** Planner markeert belangrijke mails om later op terug te komen, maar na refresh is alles weg. Dit ondermijnt het vertrouwen in de feature.
- **Voorstel:** Persisteer starred-status in de database (kolom op orders-tabel) of in localStorage als tijdelijke oplossing.
- **Confidence:** hoog

### 12. Filter-knop toont een toast "Filters komen binnenkort" in plaats van functionaliteit
- **Ernst:** middel
- **Type:** ontbrekend
- **Locatie:** src/pages/Mail.tsx:215
- **Beschrijving:** De filter-knop toont een success-toast met tekst "Filters komen binnenkort". Dit is verwarrend omdat een success-toast impliceert dat iets gelukt is.
- **Impact:** Planner klikt op filter, ziet een groene melding en denkt dat er iets is geactiveerd. Feature ontbreekt voor een kerntaak (filteren op klant, datum, status).
- **Voorstel:** Verberg de filterknop totdat de feature gebouwd is, of toon een neutrale toast (info-level) in plaats van success. Beter: implementeer basis-filters.
- **Confidence:** hoog

### 13. Compose-modal slaat op als DRAFT in orders-tabel in plaats van daadwerkelijk te verzenden
- **Ernst:** kritiek
- **Type:** onduidelijk
- **Locatie:** src/pages/Mail.tsx:486-509
- **Beschrijving:** De "Versturen"-knop in de compose-modal doet een `supabase.from("orders").insert(...)` met status DRAFT. De toast zegt "Concept opgeslagen", maar de knop zegt "Versturen". De gebruiker verwacht dat de mail verstuurd wordt.
- **Impact:** Planner denkt een mail te hebben verstuurd, maar het is alleen een draft. Klant ontvangt niets. Dit is een kritieke vertrouwensbreuk.
- **Voorstel:** Hernoem de knop naar "Opslaan als concept" totdat echte verzending geimplementeerd is. Of implementeer verzending via de send-follow-up edge function.
- **Confidence:** hoog

### 14. "Meer opties" knop toont weer een placeholder-toast
- **Ernst:** laag
- **Type:** ontbrekend
- **Locatie:** src/pages/Mail.tsx:347
- **Beschrijving:** De MoreHorizontal-knop in de e-mail toolbar toont "Meer opties komen binnenkort" als success-toast.
- **Impact:** Minimaal, maar het patroon van placeholder-toasts als success-meldingen is verwarrend.
- **Voorstel:** Verberg de knop of toon een disabled-state met tooltip "Binnenkort beschikbaar".
- **Confidence:** hoog

### 15. Archive- en Delete-knoppen in detail-view doen niets echt
- **Ernst:** hoog
- **Type:** onduidelijk
- **Locatie:** src/pages/Mail.tsx:323-326
- **Beschrijving:** De Archive- en Trash-knoppen tonen een success-toast ("E-mail gearchiveerd" / "E-mail verwijderd") en deselecteren het item, maar voeren geen database-operatie uit. De e-mail blijft gewoon in de lijst staan.
- **Impact:** Planner denkt een mail te hebben verwijderd/gearchiveerd maar bij refresh is alles nog aanwezig. Ernstige vertrouwensbreuk.
- **Voorstel:** Implementeer daadwerkelijke status-updates in de database, of verwijder de knoppen totdat ze werken.
- **Confidence:** hoog

### 16. Geen visueel verschil tussen gelezen en ongelezen mails
- **Ernst:** middel
- **Type:** ontbrekend
- **Locatie:** src/pages/Mail.tsx:242-305
- **Beschrijving:** Er is geen read/unread tracking. Alle mails zien er hetzelfde uit ongeacht of de planner ze al bekeken heeft.
- **Impact:** Planner kan niet snel zien welke mails nieuw zijn en welke al verwerkt. Dit vertraagt de triage.
- **Voorstel:** Track read-status (lokaal of in DB) en maak ongelezen mails visueel zwaarder (bold tekst, blauwe dot zoals in Inbox-pagina).
- **Confidence:** hoog

### 17. Compose-overlay mist Escape-toets om te sluiten
- **Ernst:** laag
- **Type:** frictie
- **Locatie:** src/pages/Mail.tsx:463-516
- **Beschrijving:** De compose-modal is een vaste overlay maar ondersteunt geen Escape-toets om te sluiten. De enige manier om te sluiten is via het kleine chevron-icoon rechtsboven.
- **Impact:** Kleine frictie bij snelwerken; ervaren gebruikers verwachten Escape-to-close.
- **Voorstel:** Voeg een keydown listener toe voor Escape, of gebruik een Dialog/Sheet component dat dit standaard afhandelt.
- **Confidence:** hoog

### 18. Sluit-icoon in compose is een gedraaide ChevronLeft -- onduidelijk
- **Ernst:** laag
- **Type:** onduidelijk
- **Locatie:** src/pages/Mail.tsx:469
- **Beschrijving:** Het sluiten van de compose-modal gebeurt via een `ChevronLeft` icoon met `rotate-[270deg]`, wat visueel lijkt op een chevron-down. Het standaard sluiten-icoon is een X.
- **Impact:** Kleine verwarring; gebruiker herkent de sluitknop niet direct.
- **Voorstel:** Vervang door een `X` (lucide `X` icon) voor herkenbare sluiten-actie.
- **Confidence:** hoog

### 19. Quick-reply deelt state met compose-modal
- **Ernst:** middel
- **Type:** frictie
- **Locatie:** src/pages/Mail.tsx:57-58, 333, 421
- **Beschrijving:** `composeBody` wordt gebruikt voor zowel de quick-reply textarea onderaan het detail-view als de reply-prefill (`RE: ...`). Als de planner een reply start en dan de compose-modal opent, kan de state conflicteren.
- **Impact:** Tekst die de planner aan het typen was in quick-reply kan overschreven worden of verschijnen in de verkeerde context.
- **Voorstel:** Gebruik gescheiden state voor quick-reply (`replyBody`) en compose-modal (`composeContent`). De compose-modal heeft al `composeContent` maar quick-reply hergebruikt `composeBody`.
- **Confidence:** hoog

### 20. Inbox-pagina en Mail-pagina overlappen sterk in functionaliteit
- **Ernst:** middel
- **Type:** inconsistentie
- **Locatie:** src/pages/Inbox.tsx en src/pages/Mail.tsx
- **Beschrijving:** Beide pagina's tonen e-mails van orders. Inbox richt zich op order-verwerking, Mail op e-mail management. Maar de sidebar-folders in Inbox (Verzonden, Concepten) overlappen met Mail's folders. De gebruiker heeft geen duidelijk mentaal model van wanneer welke pagina te gebruiken.
- **Impact:** Dispatcher weet niet of hij in Inbox of Mail moet kijken voor verzonden follow-ups. Zoekresultaten staan op de ene plek maar niet de andere. Dit vergroot de cognitieve belasting.
- **Voorstel:** Definieer een helder onderscheid: Inbox = order triage/goedkeuring workflow, Mail = communicatie/correspondentie. Verwijder de Verzonden/Concepten tabs uit Inbox, of merge de twee pagina's tot een.
- **Confidence:** middel

## Samenvatting — Inbox
- Totaal bevindingen: 10
- Kritiek: 0 | Hoog: 5 | Middel: 4 | Laag: 1
- Topprioriteit: #4 (Bulk-goedkeuring zonder feedback), #8 (Verwijderen zonder bevestiging), #3 (Sidebar ontbreekt op tablet)

## Samenvatting — Mail
- Totaal bevindingen: 10
- Kritiek: 1 | Hoog: 2 | Middel: 4 | Laag: 3
- Topprioriteit: #13 (Versturen-knop verstuurt niet), #15 (Archive/Delete doen niets), #11 (Stars niet persistent)

## Totale Samenvatting
- Totaal bevindingen: 20
- Kritiek: 1 | Hoog: 7 | Middel: 8 | Laag: 4
- Topprioriteit overall: #13 (Compose "Versturen" verstuurt niet -- kritiek vertrouwensprobleem)
