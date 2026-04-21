# Sprint 4, klant-testplan

Opgeleverd: 2026-04-21
Tester: Jaimy (Royalty Cargo)

Dit testplan beschrijft in klant-taal wat er is gewijzigd en hoe je de nieuwe functies zelf kunt uittesten. Scenario's zijn kort, praktisch en zonder dev-jargon. Meld afwijkingen via de bekende weg (Slack, mail).

## Wat is er nieuw

De manier waarop je een klant-adres invoert is veranderd. Doel: de coordinaten (waarop chauffeurs navigeren via Webfleet/TomTom) kloppen voortaan altijd met het ingevoerde adres. Geen verkeerde pinnen meer, geen chauffeurs die op de verkeerde plek eindigen.

## Scenario 1, happy path adres

**Wat**: nieuwe klant aanmaken met een standaard adres.

**Stappen**:
1. Open de klantenlijst en klik op "Nieuwe Klant".
2. Vul de bedrijfsnaam in.
3. Ga naar het onderdeel "Hoofdadres".
4. Typ in het zoekveld: "Winthontlaan 30B Utrecht".
5. Kies de eerste suggestie uit de dropdown van Google.

**Verwacht**:
- Straat, huisnummer, bijvoegsel, postcode, plaats en land staan automatisch ingevuld.
- De kaart eronder toont een rode pin precies op Winthontlaan 30B.
- Latitude en longitude zijn ingevuld (rond 52.058 / 5.110).

**Klik op** "Klant aanmaken" -> klant verschijnt in de lijst, adres wordt correct getoond.

## Scenario 2, pin handmatig corrigeren

**Wat**: Google plaatst de pin op het verkeerde pand (komt voor bij grote panden, bedrijventerreinen).

**Stappen**:
1. Volg scenario 1 tot en met stap 5.
2. Op de kaart: pak de rode pin vast en sleep hem naar de juiste ingang.
3. Laat los.

**Verwacht**:
- De velden links (straat/nummer/postcode/plaats) updaten automatisch naar het adres van de nieuwe pin-locatie.
- Onder de kaart verschijnt een gouden melding "Coordinaten handmatig aangepast".
- Bij opslaan wordt die exacte pin-locatie vastgelegd, niet het Google-origineel.

## Scenario 3, blokkade bij ongeldig adres

**Wat**: je typt iets dat Google niet herkent (bijv. alleen een stadsnaam of een verzonnen straat).

**Stappen**:
1. Nieuwe klant, typ "onbestaandestraat" in het hoofdadres-zoekveld.
2. Kies geen suggestie.
3. Klik op "Klant aanmaken".

**Verwacht**:
- Rode foutmelding bovenin: "Controleer de adresvelden, coordinaten zijn verplicht".
- Klant wordt NIET aangemaakt.
- Onder het adresveld staat "Selecteer een adres uit de suggesties of sleep de pin, zodat coordinaten bekend zijn".

Dit is opzettelijk: zonder coordinaten zou een chauffeur niet goed kunnen navigeren. Corrigeer het adres en probeer opnieuw.

## Scenario 4, afwijkend factuuradres

**Wat**: de klant factureert op een ander adres dan het hoofdadres.

**Stappen**:
1. Nieuwe klant, vul hoofdadres.
2. Scroll naar "Facturatie", zet de switch "Factuuradres = hoofdadres" UIT.
3. Er verschijnt een tweede adres-zoekveld met eigen kaart.
4. Vul factuuradres in via dezelfde zoek-flow.

**Verwacht**: twee complete adressen met elk eigen coordinaten, beide worden opgeslagen.

## Scenario 5, afwijkend postadres

Zelfde als scenario 4, maar dan voor "Postadres" (onderaan). Bedoeld voor klanten die papieren post op een ander adres willen ontvangen.

## Scenario 6, landen buiten Nederland

De autocomplete accepteert adressen in NL, BE, DE, LU en FR. Test met bijvoorbeeld "Rue de la Loi 200 Brussel" of "Unter den Linden 1 Berlin".

**Verwacht**: suggestie komt, velden worden gevuld, kaart toont juiste pin.

## Scenario 7, chauffeur-navigatie check (vervolgtest)

**Na** het aanmaken van een klant met het nieuwe systeem:
1. Maak een order aan met deze klant als laadadres.
2. Open de order in het chauffeursportaal.
3. Tik op het adres voor navigatie.

**Verwacht**: TomTom/Google Maps opent direct op de juiste locatie (de pin die je in scenario 1 of 2 hebt geplaatst), niet op een straatmiddenpunt of een verkeerd pand.

## Bekende beperkingen van deze oplevering

- Deze adres-flow werkt alleen bij het **aanmaken** van nieuwe klanten. Bestaande klanten bewerken gebruikt nog het oude systeem, dat komt in een vervolg-sprint.
- Laadadressen per klant (tabblad "Locaties") blijven voorlopig het oude tekstveld. Ook dat komt in een vervolg-sprint.
- De rest van Jaimy's wensenlijst (debiteurnummer, BTW-percentage keuzemenu, betalingstermijn-veld, t.a.v.-regel, meerdere contactpersonen in 1 dialog) is nog niet gebouwd. Planning volgt in sprint 4.

## Technische noot voor beheer

- In de hosting-omgeving (Vercel/Netlify) moet de env variabele `VITE_GOOGLE_MAPS_API_KEY` gezet zijn.
- De API-key is HTTP-referrer-restricted op het productiedomein, API-restricted op Places/Maps JS/Geocoding.
- Aanbevolen: billing alert van €25/maand in Google Cloud Console.
