# Sprint 4, klant-testplan chauffeurs-redesign

Opgeleverd: 2026-04-21
Tester: Jaimy (Royalty Cargo)

Dit testplan beschrijft in klant-taal wat er is vernieuwd rond het chauffeurs-dossier en de chauffeurs-pagina. Scenario's zijn kort en praktisch. Meld afwijkingen via de bekende weg (Slack, mail).

## Wat is er nieuw

Het aanmaken en beheren van chauffeurs is grondig verbouwd. Het formulier heeft nu tabbladen (Basis, Adres, Legitimatie, Werk, Administratie, Nood, Certs), controleert BSN, IBAN, leeftijd en contract-uren, en je kunt per certificering een geldig-tot datum vastleggen. De chauffeurs-pagina zelf heeft een tabel- en kaart-view, vijf KPI-tegels, extra filters, een waarschuwing voor bijna verlopende papieren en een CSV-export.

## Scenario 1, happy path nieuw chauffeursdossier

**Wat**: een nieuwe chauffeur aanmaken met een compleet dossier.

**Stappen**:
1. Open de chauffeurs-pagina en klik op "Nieuwe chauffeur".
2. Vul op tab "Basis" naam, geboortedatum (meerderjarig), telefoon en e-mail.
3. Ga naar "Adres" en vul het woonadres in.
4. Ga naar "Legitimatie", kies type (bijv. rijbewijs), vul het nummer en de vervaldatum, vul ook Code 95-vervaldatum.
5. Ga naar "Werk", kies dienstverband (vast, ZZP of uitzendkracht), vul contracturen (bijv. 40), indienstdatum en personeelsnummer.
6. Ga naar "Administratie" en vul BSN en IBAN.
7. Ga naar "Nood" en vul een contactpersoon.
8. Ga naar "Certs", vink bijvoorbeeld ADR aan en zet een geldig-tot datum.
9. Klik "Opslaan".

**Verwacht**:
- Dialog sluit, chauffeur staat in de lijst.
- Status en toegewezen voertuig waren tijdens aanmaken verborgen (die komen pas bij bewerken in beeld).
- De Submit-knop was kort grijs tijdens opslaan, zodat je niet dubbel kunt klikken.

## Scenario 2, BSN-validatie

**Wat**: het systeem weigert een BSN dat niet klopt volgens de 11-proef.

**Stappen**:
1. Nieuwe chauffeur, ga naar "Administratie".
2. Typ in het BSN-veld: `123456789`.
3. Klik buiten het veld of probeer op te slaan.

**Verwacht**:
- Rode foutmelding onder het veld: BSN is ongeldig (11-proef faalt).
- Opslaan is niet mogelijk zolang dit niet is gecorrigeerd.

## Scenario 3, IBAN-validatie

**Wat**: het systeem weigert een IBAN met een foute checksum.

**Stappen**:
1. Nieuwe chauffeur, ga naar "Administratie".
2. Typ in het IBAN-veld: `NL00BANK0000000000`.
3. Klik buiten het veld.

**Verwacht**:
- Rode foutmelding: IBAN is ongeldig (checksum klopt niet).
- Het veld blijft rood tot je een geldig Nederlands IBAN invult.

## Scenario 4, 18-jaar-check

**Wat**: een minderjarige chauffeur kan niet worden aangemaakt.

**Stappen**:
1. Nieuwe chauffeur, ga naar "Basis".
2. Vul een geboortedatum in van iemand die op dit moment 16 is.
3. Vul de rest van het verplichte basisveld in en probeer op te slaan.

**Verwacht**: rode foutmelding "Chauffeur moet minimaal 18 jaar zijn". Opslaan wordt geblokkeerd.

## Scenario 5, contract-uren max 48

**Wat**: meer dan 48 contracturen per week wordt geblokkeerd (CAO-grens).

**Stappen**:
1. Nieuwe chauffeur, ga naar "Werk".
2. Vul bij contracturen `60` in.

**Verwacht**: rode foutmelding "Maximaal 48 uur per week toegestaan". Opslaan blokkeert tot je verlaagt.

## Scenario 6, uitdienstdatum voor indienstdatum

**Wat**: een uitdienstdatum mag niet voor de indienstdatum liggen.

**Stappen**:
1. Bewerk een chauffeur (of maak een nieuwe), tab "Werk".
2. Indienstdatum: 2026-01-01.
3. Uitdienstdatum: 2025-06-01.

**Verwacht**: rode foutmelding dat uitdienst op of na indienst moet liggen. Opslaan blokkeert.

## Scenario 7, tabel-view met kenteken en uren

**Wat**: wisselen tussen kaart- en tabelweergave op de chauffeurs-pagina.

**Stappen**:
1. Open de chauffeurs-pagina (standaard kaart-view).
2. Klik rechtsboven op de toggle naar "Tabel".

**Verwacht**:
- De lijst verschijnt als tabel met kolommen voor naam, status, voertuig (getoond als kenteken, niet als interne ID), contracturen en vervaldata.
- Switch terug werkt ook.

## Scenario 8, KPI "Verlopend binnen 60 dagen"

**Wat**: de KPI-tegel rechtsboven telt chauffeurs met rijbewijs of Code 95 dat binnen 60 dagen verloopt, en kleurt rood zodra er minstens 1 is.

**Stappen**:
1. Bewerk een chauffeur, zet de rijbewijs-vervaldatum op een dag in de volgende maand (binnen 60 dagen).
2. Sla op, keer terug naar de chauffeurs-pagina.

**Verwacht**:
- De vijfde KPI-tegel "Verlopend 60d" telt nu +1 en is rood gekleurd.
- De andere vier tegels (Totaal, Beschikbaar, Onderweg, Rust of ziek) blijven gewoon staan.

## Scenario 9, CSV-export

**Wat**: de exportknop levert een bestand met de volledige personele gegevens.

**Stappen**:
1. Chauffeurs-pagina, klik op "CSV exporteren".
2. Open het gedownloade bestand in Excel of Numbers.

**Verwacht**: kolommen bevatten in elk geval personeelsnummer, indienstdatum, vervaldatum rijbewijs en vervaldatum Code 95. Alle zichtbare chauffeurs (ook na filter) staan erin.

## Scenario 10, verwijderen met impact-melding

**Wat**: een chauffeur verwijderen vraagt eerst om bevestiging.

**Stappen**:
1. Open een chauffeur, klik "Verwijderen".

**Verwacht**:
- Er verschijnt een bevestigingsvenster met een zin over de impact (bijv. dat gekoppelde planningen of historie ook gevolgen kunnen hebben).
- Pas na bevestigen wordt de chauffeur daadwerkelijk verwijderd.
- Annuleren sluit het venster zonder wijzigingen.

## Extra check, zoeken en filteren

- Typ in de zoekbalk een deel van een telefoonnummer of personeelsnummer, verwacht dat er gefilterd wordt (niet alleen op naam).
- Zet het filter "Voertuig" op "Zonder voertuig", verwacht dat alleen chauffeurs zonder gekoppeld voertuig overblijven.
- Zet sortering op "Vervalt eerst", verwacht dat chauffeurs met de eerstvolgende vervaldatum bovenaan komen.
- Verwijder alle filters, verwacht de lege-staat-tekst "Nog geen chauffeurs" (als er geen zijn) of "Geen resultaten voor dit filter" (als filter te streng is).

## Bekende beperkingen van deze oplevering

- Het uploaden van PDF-documenten (scan rijbewijs, Code 95, VOG) is nog niet beschikbaar. Dat volgt in de volgende sprint.
- Koppeling met Nmbrs voor salaris- en verlofadministratie staat op de planning voor sprint 5.
- Bulkbewerken van chauffeurs (bijv. meerdere tegelijk op "verlof" zetten) is nog niet mogelijk.

## Technische noot voor beheer

- Twee database-migraties moeten worden uitgevoerd voordat deze sprint live gaat: `20260421170000` en `20260421170100`.
- Er zijn geen nieuwe environment-variabelen nodig voor deze oplevering.
