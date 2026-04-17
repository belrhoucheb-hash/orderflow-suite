# Klant-testplan Royalty Cargo

Dit is het levende testdocument. Wordt bijgewerkt zodra er nieuwe functionaliteit wordt opgeleverd. De meest recente toevoegingen staan bovenaan per sectie, en in "Wat is er nieuw sinds de vorige test" hieronder.

**Laatste update**: 2026-04-17, Sprint 1 (data-integriteit: afdeling, traject, stamgegevens)

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

**Sprint 1 (2026-04-17), data-integriteit**:
- Afdeling (Operations of Export) is voortaan verplicht op elke order en wordt automatisch bepaald uit het traject.
- Orders met ontbrekende informatie krijgen een rode waarschuwingsbadge in de orderlijst, op de detailpagina en op het planbord.
- Klantgegevens zijn uitgebreid met een apart factuur-e-mailadres, factuuradres, optioneel postadres en een contactpersonen-tabblad met primair- en backup-rol.

Alle scenario's in secties 1 tot en met 7 horen bij deze sprint.

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
