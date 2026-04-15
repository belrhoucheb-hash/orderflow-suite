# Gemini AI Studio test-prompts voor parse-order

Plak de system-prompt hieronder in **System instructions** in [aistudio.google.com](https://aistudio.google.com/).

**Instellingen:**
- Model: `gemini-2.5-flash`
- Temperature: `0.1`
- Response MIME type: `application/json`

---

## System instruction (identiek voor alle cases)

```
Je bent een logistiek data-extractie assistent voor een Transport Management Systeem (TMS) in Nederland.
Je analyseert e-mails en PDF-bijlagen en extraheert gestructureerde ordergegevens.
Vandaag is het 2026-04-15.

Je hebt TWEE bronnen: een e-mail body EN een of meer PDF-bijlagen (hieronder samengevat als tekst, in plaats van de echte PDF). Voor elk veld dat je extraheert, geef aan uit welke bron het komt: "email", "pdf", of "both".

Regels:
- Gebruik altijd Nederlandse plaatsnamen waar mogelijk
- Gewicht altijd in kg (als gewicht per stuk/pallet vermeld wordt, bereken het totaal OF zet is_weight_per_unit op true)
- Afmetingen in cm formaat: LxBxH
- STANDAARD AFMETINGEN: Europallet 120x80x150, Blokpallet 120x100x150, Rolcontainer 80x67x170
- Transport type: "direct" of "warehouse-air"
- Unit: "Pallets" | "Colli" | "Box" (map pallet/europallet→Pallets, dozen/stuks/kartons→Colli, container/rolcontainer→Box). NOOIT leeg.
- Requirements: kies uit ["Koeling","ADR","Laadklep","Douane"]
  - "Koeling" als er gekoeld/koel/temperatuur/graden wordt genoemd
  - "ADR" als er gevaarlijke stoffen/chemisch/ADR wordt genoemd
  - "Laadklep" als er laadklep/klep/heftruck nodig/geen dock wordt genoemd
  - "Douane" als er (a) letterlijk douane/customs/invoer/uitvoer/ATR/T1/T2/EUR.1 wordt genoemd, OF (b) IMPLICIET een internationale zending betreft buiten de EU (bv. delivery_address of pickup_address in Vietnam, USA, UK, Zwitserland, Turkije, Singapore, China, Noorwegen, etc.), OF (c) een AWB/luchtvracht-export via Schiphol/WFS/Swissport/Dnata/KLM Cargo.
- Datums: bereken ISO 8601 op basis van vandaag. Onbekend = lege string.
- Tijdvenster: "voor 14:00" = end "14:00". "Tussen 8 en 10" = "08:00"-"10:00".
- Referentienummer: ordernummers, PO, bestelnummers, AWB.
- Contactpersoon: de persoon die bij OPHAAL of AFLEVERING aanwezig/bereikbaar is (magazijn, laaddock, consignee-PIC). Dit is NIET de afzender van de mail of de mail-signature (die is de klant/expediteur). Alleen extraheren als de mail expliciet iemand noemt met functie/rol bij het laad- of losadres (bv. "contactpersoon Piet de Vries 06-...", "PIC: Herbert Khoo bij consignee"). Als er alleen een signature/afzender is, laat contact_name leeg.
- confidence_score 0-100, plus field_confidence object per veld.
- ADRESVALIDATIE: geldig adres = straat + huisnr + stad. Alleen stad → field_confidence max 40.
- BRON-PRIORITEIT bij mail + PDF: PDF is LEIDEND voor feiten (gewicht, afmetingen, consignee/delivery_address, aantal, referentienummers). Mail is LEIDEND voor intent (datums, tijdvensters, instructies, contact). Bij mail < 3 datavelden: behandel mail als intent-signaal en extraheer alle ordergegevens uit de PDF.
- DATUMS ZIJN ONAFHANKELIJK: pickup_date en delivery_date mogen verschillen. NIET automatisch gelijk maken. Als 1 datum bekend is, laat de andere leeg.
- BEKENDE TERMINALS (vul adres in, field_confidence 85):
  - WFS9B/WFS → Worldwide Flight Services, Anchoragelaan 50, 1118 LE Schiphol
  - Swissport/T11 → Swissport Cargo, Anchoragelaan 40, 1118 LE Schiphol
  - Dnata → Dnata Schiphol, Pudongweg 3, 1118 BJ Schiphol
  - KLM Cargo/T1 → KLM Cargo Terminal, Anchoragelaan 12, 1118 LD Schiphol
  - Rutges → Rutges Cargo, Schiphol
  - Vertex → Vertex Logistics (DG repack), Schiphol-Oost
  - Fresh → Schiphol freshport
- DANGEROUS GOODS: "DG"/"UN####"/"ADR klasse"/"IATA"/"SDS"/"Safety Data Sheet"/"dangerous goods" → "ADR" in requirements. UN-nummer in reference_number of notes.
- Extraheer ALLES wat je kunt vinden, laat liever geen veld leeg.

Antwoord als JSON:
{
  "client_name":"","transport_type":"direct|warehouse-air",
  "pickup_address":"","delivery_address":"",
  "pickup_date":"","delivery_date":"",
  "time_window_start":"","time_window_end":"",
  "reference_number":"","contact_name":"",
  "quantity":0,"unit":"Pallets|Colli|Box",
  "weight_kg":0,"is_weight_per_unit":false,
  "dimensions":"","requirements":[],
  "confidence_score":0,
  "field_confidence":{"client_name":0,"pickup_address":0,"delivery_address":0,"quantity":0,"weight_kg":0,"unit":0,"pickup_date":0,"delivery_date":0},
  "field_sources":{"client_name":"","pickup_address":"","delivery_address":"","pickup_date":"","delivery_date":"","quantity":"","unit":"","weight_kg":"","dimensions":""}
}
```

---

## Case A — Weka Marine export (re-test na fix)

### User message

```
E-MAIL BODY:
Onderwerp: AMS.06504 — Weka export morgen
Van: M9 Logistics <ops@m9logistics.nl>

Hoi, kunnen jullie morgen 3 kisten laden bij Weka Marine in Krimpen voor Schiphol export? Afmetingen en gewicht zie packing list. EUR 345 all-in.
Groet, M9.

PDF-BIJLAGEN (samenvatting):
Packing List Weka Marine B.V., Industrieweg 2C, 2921 LB Krimpen aan den IJssel. Consignee: Haivanship Group Corporation, 26 My Phu 2C, Tan My Ward, Ho Chi Minh City, Vietnam. 3 wooden crates: 965 kg (207x136x77), 965 kg (207x136x77), 361 kg (178x95x70). Totaal 2291 kg. HS 841950, 853340. Ref: AMS.06504.
Commercial Invoice 202507899-1 dd 14-04-2026, EUR 56.583, Incoterm CIF.
```

### Verwachte output (belangrijkste velden)

- `client_name`: "M9 Logistics"
- `pickup_address`: Industrieweg 2C, 2921 LB Krimpen aan den IJssel
- `delivery_address`: Schiphol (met Ho Chi Minh City consignee)
- `pickup_date`: `2026-04-16`
- `delivery_date`: `""` (NIET gelijk aan pickup)
- `quantity`: 3, `weight_kg`: 2291, `unit`: `Colli`, `transport_type`: `warehouse-air`
- **`requirements`: `["Douane"]`** ← fix #1 moet dit nu triggeren (Vietnam + luchtvracht-export)
- **`contact_name`: `""`** ← fix #2 moet "M9" niet meer als contact gebruiken
- `field_sources.delivery_address`: `pdf` of `both`

---

## Case B — Fuji DG lifejackets export (UN2990)

### User message

```
E-MAIL BODY:
Onderwerp: Afhalen Fuji 08-04 / FUJI- DG - MV APL MIAMI - WFS9B / SAMSAE01881986
Van: EVCGF: Airfreight NL <airfreight.nl@evcargo.com>
Datum: 2026-04-08

Goedemorgen,

Kunnen jullie deze vandaag afhalen Fuji // DG

Laden:
Fuji Transport Systems (Rotterdam) B.V.
Waalhaven Noordzijde 115, 3087 BK Rotterdam, The Netherlands

Afhaal ref: MV APL MIAMI - DG

AUB laten verpakken bij de DG packers.

Consignee:
Fuji Trading (Singapore) Pte Ltd, Ship's Spares in Transit
For M/V "APL MIAMI"
24 Chia Ping Road, Singapore 619976
PIC: Herbert Khoo (65) 6264 1755

Factuur ref: SAMSAE01881986

Thanks! Anna Bakker, EVCGF: Airfreight NL

PDF-BIJLAGEN (samenvatting):
- Fuji Shipping Invoice/Packing List 3C015309 dd 08-04-2026. Consignee: TO THE MASTER OF APL MIAMI, SHIP'S SPARES IN TRANSIT, c/o Fuji Trading (Singapore). Method: AIR, Destination: Singapore. PO 4247-26-0040, Fuji ref 051920. 1 pcs, 14,20 kg. CMA Ships commercial invoice ref TECH26-0381: 1x LIFE JACKET CLASS9 UN2990, 60x40x45 cm, 14,26 kg.
- Survitec Certificate of Compliance lifejackets (Customer Order 228750). "Envoi contient marchandises dangereuses - 8,00 KG - 4,00 PCS". Artikel 02238649.
- Gescande SDS (Safety Data Sheet) UN2990 — image-only, geen tekstlaag.
```

### Verwachte output (belangrijkste velden)

- `client_name`: "EVCGF Airfreight NL" (of "EV Cargo") — NIET Fuji (=verlader)
- `pickup_address`: Waalhaven Noordzijde 115, 3087 BK Rotterdam
- `delivery_address`: Schiphol / WFS9B — ideaal met terminal-lookup: `Worldwide Flight Services, Anchoragelaan 50, 1118 LE Schiphol`
- `pickup_date`: `2026-04-08` (“vandaag” relatief aan mail-datum)
- `delivery_date`: `""` of `2026-04-08`
- `quantity`: 1, `weight_kg`: 14.26, `unit`: `Colli`, `dimensions`: `60x40x45`
- `transport_type`: `warehouse-air`
- **`requirements`: `["ADR","Douane"]`** — ADR via DG/UN2990/SDS, Douane via Singapore-export + WFS
- `reference_number`: `SAMSAE01881986` (of `UN2990`)
- **`contact_name`: `"Herbert Khoo"`** — expliciet genoemd als PIC bij consignee (niet Anna Bakker!)
- `field_sources.delivery_address`: `both`, `dimensions`: `pdf`, `weight_kg`: `pdf`

### Stresstest-focus

- DG-detectie (UN2990/SDS/klasse9) → `ADR`
- Terminal-lookup voor `WFS9B`
- Niet-EU export (Singapore) → `Douane`
- Contact-onderscheid: Anna Bakker (signature, NIET contact) vs Herbert Khoo (PIC bij consignee, WEL contact)
- Klant = expediteur EV Cargo, NIET Fuji (verlader)

---

---

## Case C — Aramex bloedzending import (multi-day, cold chain)

### User message

```
E-MAIL BODY:
Onderwerp: awb 176-27445003 bloedzending
Van: Ron Boeff <Ron@aramex.com>
Aan: RCS - Operations
Datum: maandag 30 maart 2026 08:34

Goedemorgen,

Rond 10 uur vanochtend komt bovenstaande zending binnen. Graag uitslaan, dry ice toevoegen
En morgenochtend om 9 uur afleveren bij onze klant.

Papieren liggen met een uurtje klaar in onze loods.

Met vriendelijke groet,
Ron Boeff - Import Teamleader
Aramex Netherlands BV
T. +31 20 6558024
M. +31 6 46160512
A. ///harsh.bulges.results

PDF-BIJLAGEN (samenvatting):
Geen bijlages.
```

### Verwachte output (belangrijkste velden)

- `client_name`: "Aramex Netherlands BV"
- `pickup_address`: Aramex-loods Schiphol (of leeg met hint — exact adres niet in mail)
- `delivery_address`: leeg (klant-adres in papieren)
- **`pickup_date`: `2026-03-30`** (let op: mail-datum is 30-03-2026 — als Gemini "vandaag = 2026-04-15" gebruikt, dan rekent "vanochtend" mogelijk verkeerd → **focus-punt**)
- **`delivery_date`: `2026-03-31`** ("morgenochtend" = D+1, NIET gelijk aan pickup)
- **`time_window_end: "09:00"`** (delivery-tijd expliciet)
- `quantity: 0`, `weight_kg: 0`, `dimensions: ""` (niet in mail — follow-up nodig)
- `transport_type`: `warehouse-air` (loods-handling met dry ice)
- **`requirements`: moet tenminste `["Koeling","Douane"]` bevatten** (dry ice = koeling, import bloedzending = douane)
- `reference_number`: `176-27445003` (AWB uit subject)
- `contact_name`: leeg (Ron Boeff is afzender, geen site-contact)

### Stresstest-focus

- Multi-day: pickup_date ≠ delivery_date (D en D+1)
- Tijdvenster extractie ("09:00 afleveren")
- Koeling-detectie via "dry ice" (geen letterlijk "koel/koud")
- Import-douane (bloed = medisch, AWB = luchtvracht import)
- Adres-gaps: delivery_address leeg durven laten, niet verzinnen

---

## Case D — TFF Komeet 7 met Vertex repack (multi-stop)

### User message

```
E-MAIL BODY:
Onderwerp: OPDRACHT // Komeet 7, 8448 CG, Heerenveen > Schiphol // 302601504781
Van: TFF - Sales <sales@tfflogistics.com>
Aan: RCS - Operations
Datum: donderdag 5 februari 2026 13:19

Goedemiddag,

Zouden jullie voor ons onderstaand ritje willen regelen morgen ?

Zelfde als twee weken geleden :

Laden :
Komeet 7
8448 CG Heerenveen
Nederland

Het gaat om :
(4x) 36x20x22CM - 51.0 KG totaal
TEMP CONTROL 2-8 graden

Verpakken bij Vertex naar:
(2x) 69x49x41CM

- Screeningstop

Aanleveren:
Dnata Schiphol

Dank!

Met vriendelijke groet,
Alexander Veen - Team Freight Forwarding (TFF)
Incheonweg 7, 1437 EK Rozenburg

PDF-BIJLAGEN (samenvatting):
Geen bijlages.
```

### Verwachte output (belangrijkste velden)

- `client_name`: "Team Freight Forwarding" (of "TFF")
- `pickup_address`: `Komeet 7, 8448 CG Heerenveen, Netherlands`
- **`delivery_address`: Dnata Schiphol → met terminal-lookup `Pudongweg 3, 1118 BJ Schiphol`**
- `pickup_date: 2026-02-06` ("morgen" relatief aan mail 2026-02-05)
- `delivery_date`: `2026-02-06` of leeg (zelfde-dags luchtvracht) — géén "copy pickup → delivery" zonder basis
- `quantity: 4` (pickup-aantal), `weight_kg: 51`
- `dimensions`: `36x20x22` of combinatie met `69x49x41` post-repack — beide zijn acceptabel
- `transport_type`: `warehouse-air`
- **`requirements`: `["Koeling","Douane"]`** — TEMP CONTROL 2-8 + luchtvracht-export via Dnata
- `reference_number`: `302601504781`
- `contact_name`: leeg (Alexander Veen = signature/afzender, niet site-contact)

### Stresstest-focus

- Terminal-lookup **Dnata** → Pudongweg 3, 1118 BJ Schiphol
- Koeling-detectie via "TEMP CONTROL 2-8 graden"
- Multi-stop met tussenstappen (Vertex repack, screening) — zien of Gemini deze in notes vangt
- Douane impliciet (luchtvracht-export)
- Contact-onderscheid (Alexander Veen = afzender, niet contact)
- Geen refs verzinnen over "zelfde als twee weken geleden"

---

## Na de runs

Plak de 2 JSON-outputs hier terug in de chat, dan evalueer ik veld-voor-veld tegen verwachtingen en bepaal of er nog prompt-aanpassingen nodig zijn.
