# Klant-testplan Royalty Cargo

Dit is het levende testdocument. Wordt bijgewerkt zodra er nieuwe functionaliteit wordt opgeleverd. De meest recente toevoegingen staan bovenaan per sectie, en in "Wat is er nieuw sinds de vorige test" hieronder.

**Laatste update**: 2026-05-04, Sprint 9, security-update inloggen + uitnodigen nieuwe collega's

---

### Scenario: Sprint 9 security en warehouse-flow (nieuw, 2026-05-04)

#### S9-1. Login wordt na 5 mislukte pogingen 15 minuten vergrendeld

**Wat is er veranderd**: als iemand 5 keer achter elkaar het verkeerde wachtwoord intoetst, wordt het account voor 15 minuten op slot gezet. Eerder kon je daaromheen door een ander apparaat of een andere browser te gebruiken, dat helpt nu niet meer.

**Stappen**:
1. Open een privé-/incognito-venster zodat je niet automatisch ingelogd bent.
2. Ga naar de inlog-pagina van het kantoorportaal.
3. Vul jouw eigen e-mailadres in, en een **fout** wachtwoord.
4. Druk op **Inloggen**. Je krijgt "ongeldig wachtwoord" terug.
5. Herhaal stap 3 en 4 nog vier keer (totaal 5 mislukte pogingen).
6. Probeer de zesde keer in te loggen, ook met een fout wachtwoord.

**Verwacht**:
- Bij de zesde poging zie je geen "ongeldig wachtwoord" meer, maar de melding "Account is tijdelijk geblokkeerd, probeer over 15 minuten opnieuw" (of vergelijkbare tekst).
- Open nu een **andere browser** (bijvoorbeeld Edge naast Chrome) of een telefoon, en probeer met **het juiste wachtwoord** in te loggen op hetzelfde account.
- Verwacht: ook op de andere browser zit het account op slot. De blokkade volgt het account, niet het apparaat.
- Wacht 15 minuten of vraag de beheerder om de blokkade te resetten. Daarna lukt inloggen met het juiste wachtwoord weer.

- [ ] Werkt zoals verwacht
- [ ] Werkt deels (wel blokkade, maar de andere browser kon nog wel)
- [ ] Werkt niet

Opmerking: _______________________

#### S9-2. Nieuwe collega wordt uitgenodigd via een uitnodigingslink

**Wat is er veranderd**: nieuwe collega's kunnen niet meer zelfstandig een account aanmaken via de inlog-pagina. Een beheerder maakt een uitnodiging aan, de collega krijgt een link, klikt daarop, kiest een wachtwoord, en is daarna direct gekoppeld aan jouw bedrijf met de juiste rol (planner, medewerker of admin).

**Voorbereiding**: zorg dat je inlogt als admin/owner van de tenant. Vraag een collega die nog geen account heeft om mee te testen, of gebruik een persoonlijk e-mailadres dat nog niet in het systeem zit.

**Stappen voor de admin**:
1. Ga naar **Instellingen > Gebruikers** (of vraag Badr om de uitnodiging via de SQL Editor aan te maken als de UI-tab nog niet beschikbaar is, dat komt in sprint 10).
2. Klik op **Nodig nieuwe gebruiker uit**.
3. Vul het e-mailadres van de nieuwe collega in en kies de rol (bijvoorbeeld "planner").
4. Klik op **Verstuur uitnodiging**.

**Verwacht**:
- Er verschijnt een melding "Uitnodiging verstuurd". De uitnodiging is 7 dagen geldig.
- Optioneel: kopieer de uitnodigingslink en stuur die zelf door (bijvoorbeeld via WhatsApp).

**Stappen voor de uitgenodigde collega**:
5. De collega opent de e-mail (of de link die jij hebt doorgestuurd) en klikt op **Accepteer uitnodiging**.
6. Hij komt op een pagina waar hij een wachtwoord kiest.
7. Na opslaan is hij ingelogd en ziet hij meteen het kantoorportaal van jouw bedrijf, met de rol "planner" (of de rol die jij hebt gekozen).

**Tegen-test (belangrijk)**:
8. Probeer als willekeurig persoon naar de oude inlog-pagina te gaan en daar zelf een account aan te maken zonder uitnodiging.
9. Verwacht: de "Account aanmaken"-knop is verdwenen, of geeft een foutmelding "Aanmelden via uitnodiging vereist". Het kan niet meer dat iemand van buitenaf zelf bij jouw bedrijf "binnenwandelt".

- [ ] Werkt zoals verwacht
- [ ] Werkt deels (uitnodigen lukt, maar tegen-test faalt: de signup-pagina is nog open)
- [ ] Werkt niet

Opmerking: _______________________

#### S9-3. Nieuwe order met expliciete keuze van pickup- en delivery-warehouse

**Wat is er veranderd**: bij een nieuwe order kies je nu zelf welk warehouse als ophaal-locatie en welk warehouse als afleverlocatie geldt. Eerder werd dit door het systeem afgeleid uit het adres, met soms verrassende uitkomsten bij export-orders.

**Stappen**:
1. Ga naar **Orders > Nieuwe order**.
2. Vul de klant en het zendingsnummer in.
3. Bij "Ophalen" zie je nu een keuzeveld **Pickup-warehouse**. Kies bijvoorbeeld "RCS Schiphol Hub".
4. Bij "Afleveren" zie je een keuzeveld **Delivery-warehouse**. Kies bijvoorbeeld "RCS Export Schiphol".
5. Sla de order op.

**Verwacht**:
- De order wordt aangemaakt met de gekozen warehouses zichtbaar in het detailpaneel.
- Bij een export-traject (Schiphol Hub naar Export Schiphol) wordt de order automatisch in twee rijen gesplitst: eerst een operations-rit naar de hub, daarna een export-rit vanuit de hub.
- De gold-hint onder het afdelings-veld bevestigt of het automatisch op Operations of Export staat, en je kunt nog altijd handmatig overschrijven.

- [ ] Werkt zoals verwacht
- [ ] Werkt deels
- [ ] Werkt niet

Opmerking: _______________________

---

**Eerdere update**: 2026-04-28, Connector-platform beschikbaar (nieuwe Integraties-pagina met Snelstart en Exact Online live)

**Hoe dit document te gebruiken**:
- Kijk eerst naar "Wat is er nieuw sinds de vorige test" voor een snelle samenvatting.
- Loop dan de bijbehorende scenario's door in de secties.
- Scenario's die je al eerder hebt afgevinkt en die niet veranderd zijn, kun je overslaan.
- Vink aan of het werkt zoals verwacht, of noteer wat afwijkt.

---

### Scenario: Rooster-module (nieuw, 2026-04-24)

**Voorbereiding**:
- Ga naar **Instellingen > Rooster-types** en maak minstens drie rooster-types aan: bijvoorbeeld "Vroeg" (06:00), "Dag" (09:00) en "Laat" (14:00), elk met een eigen kleur.
- Open een chauffeurs-profiel en vul in de sectie "Planning" een **Standaardrooster** en **Standaardvoertuig** in. Doe dit voor een paar chauffeurs.

**Testen**:
- [ ] Ga naar **Planning > Rooster**. Je ziet de Dagweergave voor vandaag.
- [ ] Vul voor één chauffeur in: rooster "Dag", starttijd 09:30, een voertuig, status "werkt". Wacht een seconde en herlaad de pagina. De waarden staan nog steeds.
- [ ] Zet voor een andere chauffeur de status op "ziek". Voertuig en starttijd-velden worden grijs of verdwijnen.
- [ ] Klik op **"Print PDF"** rechtsboven. Er opent een PDF met het rooster van vandaag.
- [ ] Schakel naar **Weekweergave**. Je ziet de matrix chauffeurs tegen 7 dagen. Cellen zijn gekleurd per rooster-type.
- [ ] Klik op een lege cel en vul snel een rooster in via de popup. Sluit de popup en zie dat de cel gevuld is.
- [ ] Sleep een gevulde cel naar een andere dag, of gebruik het menu-icoon "Kopieer naar". De rooster-data staat nu ook op die andere dag.
- [ ] Klik op **"Pas standaardrooster toe"**. Je krijgt een bevestiging met de keuze "alleen lege dagen" of "alles overschrijven". Na bevestiging zie je dat alle chauffeurs met een standaardrooster gevuld zijn voor de hele week.
- [ ] Navigeer naar volgende week en klik op **"Kopieer vorige week"**. Deze week wordt gevuld met dezelfde data als vorige week.
- [ ] Klik op **"Wis week"**. Je krijgt twee keer een bevestiging. Na bevestiging is de hele week leeg.
- [ ] Ga nu naar de normale **Planning** (Dagweergave met orders). Open een voertuig-kaart op een dag waarop een chauffeur ingepland staat voor dat voertuig. De chauffeur en starttijd worden automatisch vooringevuld.
- [ ] Plan twee chauffeurs op hetzelfde voertuig dezelfde dag. In de order-planning toont de voertuig-kaart een **waarschuwing** over meerdere chauffeurs.

**Opmerkingen**: _______________________________________________

- Bij twijfel: schrijf op wat je zag en hoe het voelde, ook kleine dingen tellen.
- Aan het eind is er ruimte voor algemene opmerkingen.

**Tester**: _______________________  **Datum**: _______________________

---

## Wat is er nieuw sinds de vorige test

**Connector-platform (2026-04-28), nieuwe Integraties-pagina onder Instellingen**:
- Onder **Instellingen > Integraties** staat nu een **catalogus** van koppelingen, gegroepeerd per categorie (Boekhouding, Telematica, Klantportalen). Per kaart zie je in één oogopslag of de koppeling **verbonden** of **niet verbonden** is.
- Klik op een kaart om de detail-pagina te openen met vier tabs: **Verbinding**, **Mapping**, **Sync** en **Log**.
- **Snelstart** en **Exact Online** zijn de eerste twee live koppelingen.
  - Voor Exact klik je op **"Verbinden met Exact Online"**, je wordt naar Exact gestuurd om in te loggen, en je komt vanzelf terug.
  - Voor Snelstart vul je je Client Key, Subscription Key en Administratie-ID in. **Mock-modus** kun je aanzetten om te oefenen zonder echte boekingen.
- In de **Mapping**-tab kun je per koppeling de standaard grootboek-rekening en BTW-rekening voor jouw administratie instellen. Niet ingevuld? Dan gebruikt het systeem de defaults (8000 / 1500).
- In de **Log**-tab zie je per koppeling de laatste 50 boekingen met tijdstip, status en eventuele foutmelding. Een misgelopen boeking laat een rode markering zien met de exacte foutmelding.
- **Twinfield, AFAS, Webfleet en Samsara** staan als kaarten klaar maar zijn nog niet activeerbaar (label "Binnenkort").
- Bij elke factuur die op **verzonden** wordt gezet, gaat er nu automatisch een boeking naar de actieve boekhoud-koppeling. Je hoeft niets te klikken; in de Log-tab zie je dat het is gebeurd.

**Rooster-module (2026-04-24), chauffeurs inplannen los van orders**:
- Onder **Planning** staat een nieuwe knop **"Rooster"** naast Dag/Week/Map. Hiermee kun je chauffeurs per dag inplannen zonder dat er orders nodig zijn. Dit vervangt de Excel-planning.
- Per chauffeur vul je per dag in: **rooster-type** (Vroeg, Dag, Laat, Hoya, of eigen type), **starttijd**, **voertuig**, **status** (werkt, vrij, ziek, verlof, feestdag) en eventueel een **notitie**.
- **Dagweergave**: tabel met alle actieve chauffeurs, inline bewerkbaar. Is de chauffeur vrij of ziek, dan verdwijnt voertuig en starttijd automatisch. Met de knop **"Print PDF"** krijg je een print-klaar rooster voor de ochtend-briefing.
- **Weekweergave**: matrix van chauffeurs tegen 7 dagen. Elke cel toont rooster, starttijd en voertuig in een kleur. Klik op een cel om snel aan te passen. Sleep een cel naar een andere dag om te kopiëren, of gebruik het menu-icoon voor "Kopieer naar".
- **Snel-knoppen rechtsboven de week**:
  - **"Kopieer vorige week"** neemt de planning van de week ervoor over, zodat je alleen de afwijkingen hoeft aan te passen.
  - **"Pas standaardrooster toe"** vult de week met het standaard-rooster van elke chauffeur (in te stellen op het chauffeur-profiel). Kies of je alleen lege dagen wilt vullen of alles wilt overschrijven.
  - **"Wis week"** leegt de hele week (met dubbele bevestiging).
- **Rooster-types beheren**: onder **Instellingen > Rooster-types** maak je eigen rooster-types aan met naam, default-starttijd, default-eindtijd en kleur. Je kunt ook een volgorde instellen en types op inactief zetten (oude rooster-rijen blijven zichtbaar, maar het type verschijnt niet meer in nieuwe keuzes).
- **Chauffeur-profiel**: in de chauffeurs-tab staat per chauffeur nu een sectie "Planning" met **Standaardrooster** en **Standaardvoertuig**. Deze worden gebruikt door de "Pas standaardrooster toe"-knop.
- **Koppeling met order-planning**: als je in de order-planning een voertuig op een bepaalde dag opent, wordt de chauffeur en starttijd **automatisch vooringevuld** vanuit het rooster. Je kunt dit nog altijd handmatig overschrijven. Als er per ongeluk twee chauffeurs op hetzelfde voertuig dezelfde dag staan, toont de voertuig-kaart in de order-planning een **waarschuwing**.

**Publieke API-tokens (2026-04-23), onder Instellingen > API-tokens en in het klantportaal**:
- Onder **Instellingen > API-tokens** kun je nu een **API-token** aanmaken waarmee een extern systeem (ERP, boekhouding, dashboard, eigen website) data uit OrderFlow kan ophalen of nieuwe orders kan insturen.
- Per token kies je welke **rechten** het krijgt: orders lezen, orders aanmaken, ritten lezen, facturen lezen, klanten lezen. Je kunt ook een **verloopdatum** zetten (30 dagen, 90 dagen, 1 jaar of nooit).
- De token wordt **eenmalig getoond** na aanmaken, kopieer hem meteen. Daarna zie je alleen nog de eerste 8 karakters als herkenning.
- **Intrekken** met de rode prullenbak. Ingetrokken tokens werken direct niet meer, ze verdwijnen naar een aparte sectie in de lijst.
- In het **klantportaal** onder **Instellingen** kan een klant-admin zelf tokens aanmaken die alleen zijn eigen orders en facturen zien (niet die van andere klanten van jou).

**Webhooks onder Instellingen (2026-04-23), alleen voor admin**:
- Onder **Instellingen > Webhooks** kun je een koppeling maken waarmee je eigen systeem (ERP, boekhouding, dashboard) een bericht krijgt zodra er iets gebeurt, bijvoorbeeld zodra een order wordt aangemaakt of een factuur betaald is.
- Per koppeling kies je een **naam**, een **URL** waar de berichten naartoe gaan, en welke **gebeurtenissen** je wilt ontvangen.
- Na aanmaken krijg je **eenmalig een geheime sleutel** te zien. Sla die meteen op, hij is nodig om aan de ontvangende kant te controleren dat het bericht echt van OrderFlow komt.
- Met de **test-knop** stuur je een test-bericht naar de URL zodat je kunt controleren of alles goed staat.
- In de **delivery-log** per koppeling zie je per bericht of het aankwam, welke responscode er terugkwam en hoe lang het duurde. Je kunt een mislukt bericht opnieuw versturen met **Replay**.

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

## 8. Snelstart-koppeling (BK-01)

Nieuw: facturen kunnen automatisch in Snelstart geboekt worden zodra je ze op "verzonden" zet. Je hoeft niets meer handmatig over te tikken.

**Voorbereiding:**
- Ga naar Instellingen, Integraties.
- Zet "Snelstart" aan. Laat voorlopig "Testmodus" ook aan staan (dan worden boekingen gesimuleerd, er gaat niets naar je echte Snelstart). Klik "Integraties opslaan".

**Stappen:**
1. Maak een factuur uit een afgeronde rit (of open een bestaande conceptfactuur).
2. Klik op "Markeer als verzonden".
3. Kijk binnen enkele seconden naar de status-balk bovenaan de factuur.

Verwachte uitkomst: je ziet naast de status "Verzonden" een tweede groene label staan, "Snelstart: geboekt", met een boekingsnummer erachter. Bij testmodus begint dat nummer met "MOCK-".

**Extra check bij een echt Snelstart-account (optioneel):**
- Zet "Testmodus" uit en vul client-key, subscription-key, administratie-ID, grootboek omzet en grootboek BTW.
- Klik "Verbinding testen", je zou "Verbinding met Snelstart OK" te zien moeten krijgen.
- Stuur opnieuw een factuur "verzonden", en open daarna Snelstart in een ander tabblad: de verkoopboeking moet daar terug te vinden zijn op factuurnummer.

**Bij fouten:** als er iets misgaat zie je een rood label "Snelstart: fout" met een tooltip die de oorzaak uitlegt. Er staat dan ook een knop "Opnieuw proberen".

- [ ] Werkt zoals verwacht
- [ ] Werkt niet

Opmerking: _______________________

---

## 9. Algemene bevindingen

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
