# Klant-testplan Royalty Cargo

Dit is het levende testdocument. Wordt bijgewerkt zodra er nieuwe functionaliteit wordt opgeleverd. De meest recente toevoegingen staan bovenaan per sectie, en in "Wat is er nieuw sinds de vorige test" hieronder.

**Laatste update**: 2026-04-22, klanten-vervolg (omzet YTD, slapende klanten, bulk-acties)

**Hoe dit document te gebruiken**:
- Kijk eerst naar "Wat is er nieuw sinds de vorige test" voor een snelle samenvatting.
- Loop dan de bijbehorende scenario's door in de secties.
- Scenario's die je al eerder hebt afgevinkt en die niet veranderd zijn, kun je overslaan.
- Vink aan of het werkt zoals verwacht, of noteer wat afwijkt.
- Bij twijfel: schrijf op wat je zag en hoe het voelde, ook kleine dingen tellen.
- Aan het eind is er ruimte voor algemene opmerkingen.

**Tester**: _______________________  **Datum**: _______________________

---

## Wat is er nieuw sinds de vorige test

**Klantenlijst (2026-04-22)**:
- In het klant-detailpaneel op het tabblad **Overzicht** staat nu een echte **"Omzet YTD"** in euro's op basis van je facturen van dit jaar. Eerder stond hier "niet beschikbaar".
- Bovenaan de **klantenlijst** staat een nieuwe **telling-balk**: totaal aantal klanten, hoeveel actief, hoeveel inactief, en hoeveel **slapend** (geen order in 90 dagen).
- Nieuw filter **Activiteit** om met één klik **alleen slapende klanten** te tonen, handig om ze te herbenaderen voor je ze wegschrijft.
- In de klantenlijst kun je nu **meerdere klanten tegelijk selecteren** met een vinkje per rij. Boven de tabel verschijnt dan een balk met twee knoppen: **Zet op inactief** (met bevestiging) en **Exporteer CSV** (Excel-klaar, met naam, KvK, contact, e-mail, telefoon, stad, actieve orders en status).

**Sprint 3 (2026-04-21), planbord 2.0**:
- Naast het bestaande planbord staat er nu een nieuw planbord onder **Planning 2.0**. De oude versie blijft werken, de nieuwe moet eerst geactiveerd worden onder Stamgegevens.
- De planner zet per dag in de dagsetup welke chauffeurs werken, met verlof zijn, of ziek zijn, en welke voertuigen beschikbaar zijn, onderhoud hebben, of geblokkeerd zijn.
- Er is een **Auto-plan-knop** die alle orders van die dag automatisch clustert op postcode-regio, een voertuig kiest dat past op gewicht en laadeisen, en een chauffeur toewijst op basis van certificaten en contracturen. Dit is altijd een voorstel, de planner moet bevestigen.
- Elke chauffeur heeft een eigen **swim-lane** waarin je in één oogopslag ziet hoe zijn dag eruitziet, inclusief hoeveel uur er al gepland is ten opzichte van zijn contract.
- Klik op een cluster opent een **detailpaneel** aan de rechterkant met voertuig, chauffeur, orderlijst, beladingsgraad en de knoppen Bevestig en Verwerp.
- Bij een te vol voertuig kan de planner bewust **overschrijven met een verplichte reden**. Die reden wordt gelogd zodat je later kunt uitleggen waarom een voertuig overbelast is gereden.
- **Docksheet-knop** exporteert alle bevestigde ritten van die dag in één CSV-bestand met chauffeur-kolom, klaar om in Excel te openen.
- Bij chauffeur-beheer kun je nu **contracturen per week** en **dienstverband** (vast/flex/ingehuurd) invullen. Auto-plan gebruikt deze om niemand structureel over zijn uren heen te plannen.

**Sprint 2 (2026-04-19), tariefmotor**:
- Zie §9 voor de tariefmotor-scenario's.

**Sprint 1 (2026-04-17), data-integriteit**:
- Zie §1 tot en met §7.

---

## Klantenlijst vervolg-scenario's (2026-04-22)

### K1. Omzet YTD per klant

1. Ga naar **Klanten**.
2. Klik op een klant waarvan je weet dat er dit jaar facturen voor zijn.
3. Blijf op het tabblad **Overzicht**.
4. Kijk naar de bovenste balk met drie tegeltjes: **Actieve orders**, **Omzet YTD**, **Laatste rit**.

Verwacht:
- Bij **Omzet YTD** staat een echt bedrag in euro's, bijvoorbeeld "€ 12.340,00". Geen "—" meer en geen "niet beschikbaar" meer.
- Het bedrag is de som van alle facturen van deze klant met status Verzonden, Betaald of Vervallen, met een factuurdatum vanaf 1 januari van dit jaar.

- [ ] Werkt
- [ ] Werkt deels
- [ ] Werkt niet

Opmerking: _______________________

### K2. Slapende klanten zichtbaar maken

1. Ga naar **Klanten**.
2. Kijk naar de telling-balk bovenaan. Lees de vier tegeltjes: Totaal, Actief, Inactief, **Slapend**.
3. Gebruik het filter **Activiteit** en kies "Alleen slapende klanten".
4. Bekijk de lijst.

Verwacht:
- De teller **Slapend** toont hetzelfde aantal als het aantal rijen dat je nu in de lijst ziet (mogelijk verdeeld over meerdere pagina's).
- Elke zichtbare klant heeft geen order gehad in de afgelopen 90 dagen (check voor 1 klant: open het detailpaneel, tab **Orders**, en controleer de datum van de meest recente order).
- Zet het filter terug op "Alle klanten", dan verschijnt de volledige lijst weer.

- [ ] Werkt
- [ ] Werkt deels
- [ ] Werkt niet

Opmerking: _______________________

### K3. Meerdere klanten tegelijk op inactief

1. Ga naar **Klanten**.
2. Gebruik de vinkjes voor de rijen om 2 of 3 klanten te selecteren.
3. Bovenaan de tabel verschijnt een balk "X klanten geselecteerd". Klik op **Zet op inactief**.
4. Er opent een bevestigdialog. Controleer dat, als één van de klanten nog actieve orders heeft, dit expliciet wordt gemeld.
5. Klik op **Toch deactiveren**.

Verwacht:
- Groene melding "X klanten op inactief gezet".
- De rijen in de lijst tonen nu de status "Inactief".
- De teller **Actief** in de balk bovenaan is met X gezakt, en **Inactief** is met X gestegen.
- Openstaande orders van deze klanten blijven gewoon in de orderlijst staan (het zijn archiveerde klanten, geen verwijderde).

- [ ] Werkt
- [ ] Werkt deels
- [ ] Werkt niet

Opmerking: _______________________

### K4. Selectie alle klanten op een pagina

1. Ga naar **Klanten**.
2. Vink het vakje in de kolomkop aan (naast "Klantnaam").

Verwacht:
- Alle zichtbare rijen op deze pagina zijn aangevinkt (25 of 50 afhankelijk van paginagrootte).
- De telling-balk boven de tabel toont dat aantal.
- Klik het vakje in de header opnieuw, alles deselecteert.
- Als je een filter wijzigt of naar de volgende pagina gaat, is de selectie automatisch leeggemaakt (voorkomt dat je per ongeluk onzichtbare klanten bijwerkt).

- [ ] Werkt
- [ ] Werkt deels
- [ ] Werkt niet

Opmerking: _______________________

### K5. CSV-export naar Excel

1. Ga naar **Klanten**.
2. Selecteer 5 à 10 klanten met de vinkjes.
3. Klik in de balk boven de tabel op **Exporteer CSV**.

Verwacht:
- Browser downloadt een bestand **klanten-export-YYYY-MM-DD.csv**.
- Open het in Excel. Je ziet de kolommen: Naam, KvK, Contactpersoon, Email, Telefoon, Stad, Actieve orders, Status.
- Accenten (é, ö) worden correct getoond (niet als vraagtekens of ??).
- Alleen de geselecteerde klanten staan in het bestand, niet de volledige lijst.
- Groene melding "X klanten geëxporteerd".

- [ ] Werkt
- [ ] Werkt deels
- [ ] Werkt niet

Opmerking: _______________________

---

## Sprint 3 scenario's

### A. Dagsetup instellen

1. Open **Planning 2.0** via het menu (of ga naar /planning-v2).
2. Kies morgen als datum.
3. Klik op **Dagsetup**. De dialog opent.
4. Zet één chauffeur op **Verlof** en vul een reden in zoals "familieverlof".
5. Zet één voertuig op **Onderhoud** en vul "APK" in als reden.
6. Klik **Opslaan**.
7. Verwacht: melding "Dagsetup opgeslagen" met teller "X chauffeurs werken, Y voertuigen beschikbaar".
8. Sluit en open de dialog opnieuw. De opgeslagen statussen staan nog.

- [ ] Werkt
- [ ] Werkt deels
- [ ] Werkt niet

Opmerking: _______________________

---

### B. Auto-plan uitvoeren

1. Zorg dat er orders zijn voor morgen (status Openstaand, nog geen voertuig).
2. Op **Planning 2.0**, klik **Auto-plan**.
3. Verwacht: binnen 2 seconden verschijnt melding "Auto-plan klaar, X voorstellen aangemaakt, Y orders in Open te plannen".
4. In de chauffeurs-lanes verschijnen cluster-kaartjes met een gouden streepjesrand (voorstel-status).
5. In de rechterkolom "Open te plannen" staan orders die niet inpasbaar waren, met rode reden ("geen passend voertuig", "geen postcode in adres" enzovoort).

- [ ] Werkt
- [ ] Werkt deels
- [ ] Werkt niet

Opmerking: _______________________

---

### C. Cluster-details en bevestigen

1. Klik op een voorstel-cluster in een chauffeur-lane.
2. Verwacht: paneel schuift open vanaf rechts met voertuig, chauffeur, beladingsgraad-balken, orderlijst.
3. Controleer of de beladingsgraad klopt (meer dan 80% is oranje, meer dan 100% is rood).
4. Klik **Bevestig** onderaan het paneel.
5. Verwacht: melding "Cluster bevestigd, trip en stops zijn aangemaakt". Het cluster krijgt nu status INGEPLAND.

- [ ] Werkt
- [ ] Werkt deels
- [ ] Werkt niet

Opmerking: _______________________

---

### D. Laadvermogen-override met reden

1. Open een cluster-detailpaneel met beladingsgraad boven 80%.
2. Onderaan zie je "Forceer met reden (audit-trail)".
3. Probeer op **Sla override op** te klikken zonder reden. Verwacht: knop is uitgeschakeld totdat je tekst typt.
4. Vul in: "Spoedzending, klant betaalt extra toeslag".
5. Klik **Sla override op**.
6. Verwacht: melding "Override vastgelegd, reden is opgeslagen in audit-trail". Badge "Override actief" verschijnt in het paneel.
7. Sluit het paneel en open het opnieuw. De reden staat nog met tijdstip.

- [ ] Werkt
- [ ] Werkt deels
- [ ] Werkt niet

Opmerking: _______________________

---

### E. Contracturen-bewaking

1. Ga naar **Chauffeurs**, open een bestaande chauffeur.
2. Vul **Contracturen per week** in op bijvoorbeeld 32.
3. Kies **Dienstverband**: vast.
4. Opslaan.
5. Ga naar **Planning 2.0**. In de swim-lane van deze chauffeur staat "X / 32 u" bovenin.
6. Laat auto-plan een week met veel orders plannen en kijk of hij netjes niet boven de 32 uur komt, of dat de orders naar een andere chauffeur schuiven.

- [ ] Werkt
- [ ] Werkt deels
- [ ] Werkt niet

Opmerking: _______________________

---

### F. Docksheet-export

1. Zorg dat er minimaal één cluster bevestigd (INGEPLAND) is op een dag.
2. Selecteer die dag in **Planning 2.0**.
3. Klik **Docksheet**.
4. Verwacht: browser downloadt een bestand **docksheet-YYYY-MM-DD.csv**.
5. Open in Excel. Je ziet kolommen: Ordernr, Klant, Ophaaladres, Losadres, Postcode, Chauffeur, Voertuig, Tijdvenster, Opmerking.
6. Accenten (é, ö) worden correct getoond.

- [ ] Werkt
- [ ] Werkt deels
- [ ] Werkt niet

Opmerking: _______________________

---

### G. Feature-flag aan/uit per tenant

1. Ga naar **Instellingen, Stamgegevens**.
2. Bovenaan staat "Nieuw planbord (v2)" met een schakelaar.
3. Zet de schakelaar **uit**.
4. Bezoek **Planning 2.0**. Verwacht: gele kaart "Het nieuwe planbord is nog niet geactiveerd" en een knop terug naar het bestaande planbord.
5. Zet de schakelaar weer **aan**. Refresh de pagina. Het planbord is weer zichtbaar.
6. Verander de clustergrootte naar **PC3**. Draai auto-plan opnieuw en kijk of er nu meer, kleinere clusters ontstaan (Rotterdam-centrum apart van Rotterdam-Zuid).

- [ ] Werkt
- [ ] Werkt deels
- [ ] Werkt niet

Opmerking: _______________________

---

## Voorbereiding

1. Log in op het TMS.
2. Controleer dat je in de juiste tenant zit (Royalty Cargo Solutions).
3. Noteer je browser en apparaat hieronder, voor het geval iets apparaat-specifiek is.

Browser en apparaat: _______________________

- [ ] Ingelogd zonder problemen
- [ ] Orders, Planning en Klanten menu's zichtbaar

Opmerking: _______________________

---

## 1. Afdeling is verplicht bij nieuwe order (OA-01)

**Wat is er veranderd**: een order kan niet meer opgeslagen worden zonder afdeling, ook niet als concept.

### Test 1.1 Leeg opslaan moet geblokkeerd worden

Stappen:
1. Ga naar Orders > Nieuwe order.
2. Vul alleen de klantnaam in, laat de rest leeg.
3. Klik onderaan op "Order aanmaken" of "Opslaan".

Verwachte uitkomst: Er verschijnt een foutmelding die zegt dat afdeling verplicht is, samen met andere ontbrekende velden. De order wordt niet aangemaakt.

- [ ] Werkt zoals verwacht
- [ ] Werkt niet

Opmerking: _______________________

---

## 2. Afdeling wordt automatisch bepaald (OA-02)

**Wat is er veranderd**: zodra je een afleveradres invult, kiest het systeem zelf of het een Operations of Export-order is. Je kunt dit altijd overrulen.

### Test 2.1 Binnenlands traject wordt Operations

Stappen:
1. Nieuwe order, klantnaam invullen.
2. Laden op bijvoorbeeld "Hoofdweg 1, Hoofddorp".
3. Lossen op bijvoorbeeld "Kerkstraat 10, Tilburg".
4. Kijk naar het veld "Afdeling".

Verwachte uitkomst: Afdeling staat automatisch op "Operations", met een gouden hint eronder dat zegt "Automatisch bepaald op basis van traject".

- [ ] Werkt zoals verwacht
- [ ] Werkt niet

Opmerking: _______________________

### Test 2.2 Export-traject wordt herkend

Stappen:
1. Zelfde order, verander het afleveradres naar "RCS Export Schiphol" (of een adres met "Royalty Cargo Export" erin).
2. Kijk naar het veld "Afdeling".

Verwachte uitkomst: Afdeling verspringt automatisch naar "Export". De traject-preview laat zien dat de order in twee delen wordt gesplitst (eerst Operations-rit naar de hub, daarna Export-rit vanuit de hub).

- [ ] Werkt zoals verwacht
- [ ] Werkt niet

Opmerking: _______________________

### Test 2.3 Planner kan afdeling overrulen

Stappen:
1. Zelfde order met "RCS Export Schiphol" als afleveradres (afdeling staat op Export).
2. Klik op het afdeling-veld en kies handmatig "Operations".
3. Kijk naar de hint eronder.

Verwachte uitkomst: De hint verandert naar een amber-kleurige tekst "Overschreven door planner, automatisch zou EXPORT zijn". Er is ook een kleine "Terug naar automatische detectie" knop.

- [ ] Werkt zoals verwacht
- [ ] Werkt niet

Opmerking: _______________________

---

## 3. Automatisch traject splitsen (OA-03)

**Wat is er veranderd**: bij een order naar de RCS Export hub ziet het systeem dat er eerst een binnenlands stuk is (ophalen bij klant, afleveren bij hub) en daarna een export-stuk. Het systeem maakt dat automatisch in twee rijen aan.

### Test 3.1 Twee-legs split voor Export

Stappen:
1. Nieuwe order met laden "Klantadres" en lossen "RCS Export Schiphol".
2. Klik op "Preview" of "Opslaan".
3. Open de order lijst en zoek de zojuist aangemaakte order(s).

Verwachte uitkomst: In de orderlijst zie je twee rijen met hetzelfde zendingsnummer. Eén heeft afdeling Operations en gaat naar de hub, de andere heeft afdeling Export en gaat vanaf de hub naar de eindbestemming.

- [ ] Werkt zoals verwacht
- [ ] Werkt niet

Opmerking: _______________________

### Test 3.2 Enkelvoudig binnenlands traject

Stappen:
1. Nieuwe order met bijvoorbeeld laden "Amsterdam" en lossen "Rotterdam".
2. Opslaan.
3. Open de orderlijst.

Verwachte uitkomst: Eén rij, afdeling Operations, geen splitsing.

- [ ] Werkt zoals verwacht
- [ ] Werkt niet

Opmerking: _______________________

---

## 4. Orderlijst filters (OA-04)

**Wat is er veranderd**: de orderlijst heeft een afdelingsfilter zodat je Operations en Export apart kunt bekijken.

### Test 4.1 Filter op afdeling

Stappen:
1. Ga naar Orders.
2. Gebruik het afdelings-filter bovenin, kies "Export".
3. Bekijk de lijst.

Verwachte uitkomst: Alleen Export-orders zijn zichtbaar. De telling bovenaan (KPI-strip) verandert mee.

- [ ] Werkt zoals verwacht
- [ ] Werkt niet

Opmerking: _______________________

### Test 4.2 Combineren met status-filter

Stappen:
1. Zelfde pagina, combineer het afdelings-filter "Export" met status-filter "Ingepland".
2. Bekijk de lijst.

Verwachte uitkomst: Alleen Export-orders met status Ingepland.

- [ ] Werkt zoals verwacht
- [ ] Werkt niet

Opmerking: _______________________

---

## 5. Onvolledige orders in één oogopslag (OA-05)

**Wat is er veranderd**: orders met ontbrekende informatie (bijvoorbeeld MRN-document, referentie, contactpersoon) krijgen een rode waarschuwingsbadge naast het ordernummer. Werkt in de orderlijst, op de order-detailpagina en op het planbord.

### Test 5.1 Badge in orderlijst

Stappen:
1. Zoek in de orderlijst een order waar informatie van ontbreekt (status "Openstaand" of "Verlopen" in de info-kolom).
2. Kijk naast het ordernummer links in de rij.
3. Hover over de rode bolletje.

Verwachte uitkomst: Een rood bolletje met een uitroepteken staat links van het ordernummer. De tooltip toont welke velden missen.

- [ ] Werkt zoals verwacht
- [ ] Werkt niet (badge niet zichtbaar of tooltip ontbreekt)

Opmerking: _______________________

### Test 5.2 Badge in order-detail

Stappen:
1. Klik op dezelfde incomplete order.
2. Kijk naar de header, naast de status-badges.

Verwachte uitkomst: Een rode "Incompleet" badge met waarschuwingsdriehoek staat tussen de status-badges.

- [ ] Werkt zoals verwacht
- [ ] Werkt niet

Opmerking: _______________________

### Test 5.3 Badge op het planbord

Stappen:
1. Ga naar Planbord.
2. Kies de dag waarvoor de incomplete order gepland staat (of gebruik de "Niet toegewezen"-kolom).
3. Kijk naar de orderkaart.

Verwachte uitkomst: De rode bolletje is ook hier zichtbaar op de orderkaart, zodat je bij het plannen meteen ziet wat incompleet is.

- [ ] Werkt zoals verwacht
- [ ] Werkt niet

Opmerking: _______________________

---

## 6. Klant-stamgegevens: factuur, post, contactpersonen (SG-02)

**Wat is er veranderd**: een klant heeft nu een apart factuur-e-mailadres en factuuradres, een optioneel afwijkend postadres, en een contactpersonen-tabblad met primair en backup contact.

### Test 6.1 Nieuwe klant met factuur-afwijking

Stappen:
1. Ga naar Klanten > Nieuwe klant.
2. Vul minimaal:
   - Bedrijfsnaam
   - Primair contactpersoon (naam, e-mail, telefoon)
   - Algemeen e-mailadres
   - Hoofdadres
3. Klap de "Facturatie"-sectie open en zet de toggle "Factuuradres = hoofdadres" uit.
4. Vul een afwijkend factuur-e-mail, factuuradres, postcode en plaats in.
5. Laat het postadres op "gelijk aan hoofdadres".
6. Klik op "Klant aanmaken".

Verwachte uitkomst: De klant verschijnt in de lijst. Er komt een groene bevestiging.

- [ ] Werkt zoals verwacht
- [ ] Werkt niet

Opmerking: _______________________

### Test 6.2 Klant-detail toont de nieuwe velden

Stappen:
1. Klik op de zojuist aangemaakte klant.
2. Blijf op het tabblad "Overzicht".

Verwachte uitkomst: Je ziet drie secties: "Hoofdadres", "Facturatie" (met factuur-e-mail en afwijkend factuuradres), "Postadres" (met de tekst "Gelijk aan hoofdadres").

- [ ] Werkt zoals verwacht
- [ ] Werkt niet

Opmerking: _______________________

### Test 6.3 Contacten-tabblad: backup toevoegen

Stappen:
1. Klik op het tabblad "Contacten".
2. Controleer dat het primaire contact er staat met de goud-kleurige "Primair"-badge.
3. Klik op "Toevoegen" en vul een backup-contact in (naam, e-mail, rol = "Backup").
4. Klik op "Toevoegen".

Verwachte uitkomst: De backup staat nu onder het primaire contact, met de grijze "Backup"-badge.

- [ ] Werkt zoals verwacht
- [ ] Werkt niet

Opmerking: _______________________

### Test 6.4 Geen twee primaire contacten mogelijk

Stappen:
1. Zelfde klant. Klik op "Toevoegen".
2. Vul een nieuwe contactpersoon in, kies rol "Primair".
3. Klik op "Toevoegen".

Verwachte uitkomst: Een foutmelding verschijnt: "Er is al een primair contact voor deze klant". De tweede primair wordt niet opgeslagen.

- [ ] Werkt zoals verwacht
- [ ] Werkt niet

Opmerking: _______________________

### Test 6.5 Contactpersoon verwisselen van rol

Stappen:
1. Zelfde klant, Contacten-tab.
2. Klik op het menu-icoontje (drie puntjes) bij het backup-contact.
3. Kies "Maak primair".

Verwachte uitkomst: De backup krijgt nu de Primair-badge. De oude primair wordt automatisch "Overig" (dus niet gedupliceerd of stuk).

- [ ] Werkt zoals verwacht
- [ ] Werkt niet

Opmerking: _______________________

---

## 7. Bestaande orders en klanten (regressie)

**Doel**: controleren dat de update niet iets anders heeft gebroken.

### Test 7.1 Bestaande order openen

Stappen:
1. Zoek een oude order (van vóór deze update) in de lijst.
2. Open de detailpagina.

Verwachte uitkomst: Alles staat erop zoals voorheen. Afdeling is ingevuld (automatisch bepaald tijdens migratie). Geen foutmeldingen.

- [ ] Werkt zoals verwacht
- [ ] Werkt niet

Opmerking: _______________________

### Test 7.2 Bestaande klant openen

Stappen:
1. Zoek een oude klant in de lijst.
2. Open detail > Overzicht.

Verwachte uitkomst: De facturatie-sectie toont "Gelijk aan hoofdadres" (want billing_same_as_main staat standaard aan). Contacten-tab toont het eerder ingevulde contactpersoon automatisch als primair.

- [ ] Werkt zoals verwacht
- [ ] Werkt niet

Opmerking: _______________________

### Test 7.3 Nieuwe mail uit inbox

Stappen:
1. Stuur een test-order mail naar het bekende IMAP-adres (of upload een .eml via de Inbox-pagina).
2. Wacht tot deze in de Inbox verschijnt.
3. Open de order die daaruit ontstaat.

Verwachte uitkomst: De order wordt aangemaakt zonder fouten. Afdeling staat standaard op Operations. Zodra je pickup/delivery-adres bevestigt, verspringt de afdeling eventueel naar Export als het adres dat rechtvaardigt.

- [ ] Werkt zoals verwacht
- [ ] Werkt niet

Opmerking: _______________________

---

## 8. Algemene bevindingen

**Voelde er iets traag, verwarrend, of niet-logisch?** Schrijf het hier op, ook kleine dingen.

_______________________
_______________________
_______________________

**Miste je iets dat je wel had verwacht?**

_______________________
_______________________

**Gevonden bugs (met stappen om het te reproduceren)**:

1. _______________________
2. _______________________
3. _______________________

---

## Klaar? Stuur dit terug

Stuur het ingevulde document, eventuele screenshots en video's terug naar Badr. Bevindingen worden verzameld voor Sprint 2.
