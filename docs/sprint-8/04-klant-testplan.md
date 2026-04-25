# Klant-testplan, ETA en klant-meldingen

## Wat hebben we nieuw

We sturen klanten nu automatisch een SMS 30 minuten voordat de chauffeur aankomt, met een live track-link erin. Verschuift de aankomst daarna nog meer dan 15 minuten? Dan krijgt de klant precies één extra bericht met de nieuwe tijd. En in jullie Dispatch-tab zien jullie nu vertragingen al vóórdat ze daadwerkelijk te laat zijn.

In het kort:
- **Klant krijgt vooraf bericht**, geen gebel meer "waar blijft mijn rit".
- **Klant krijgt update bij grote shift**, eerlijk en automatisch.
- **Planner ziet vertraging vroeg**, gele badge in Dispatch en aparte categorie in Exceptions.
- **U bepaalt zelf de tijden en gevoeligheid** in Instellingen.

## Hoe stelt u dit in

1. Ga naar **Instellingen** in het hoofdmenu.
2. Klik in de linker sidebar op **"ETA en klant-meldingen"** (onder de groep Communicatie).
3. Vul de tijden in zoals u wilt. De standaardwaarden zijn:
   - Vooraankondiging: **30 minuten** voor aankomst
   - Update sturen vanaf shift van: **15 minuten**
   - Voorspelde vertraging vanaf: **15 minuten** boven het tijdvenster
   - Ernst van voorspelde vertraging: **MEDIUM**
   - Drempel voor planner-badge: **5 minuten**
4. Bovenaan staat een schakelaar **"Klant-meldingen aan"**. Zet deze uit als u (bijvoorbeeld in een testperiode) nog géén SMS naar klanten wilt sturen, maar wél de planner-signalen wilt zien.
5. Klik op **Opslaan**. De wijzigingen gelden direct, geen herstart nodig.

## Hoe test u dat het werkt

### Test 1, klant ontvangt vooraankondiging

1. Maak een testorder aan met **uw eigen telefoonnummer** als ontvanger.
2. Plan deze rit en zet de chauffeur op **Actief** (start rit).
3. Wacht tot de chauffeur op ongeveer **30 minuten rijden** zit van het afleveradres.

**Wat u verwacht**: u ontvangt op uw eigen telefoon een SMS met de aangekondigde aankomsttijd én een track-link. Klikt u op de link, dan ziet u de live positie van de chauffeur.

**Werkt het niet?** Controleer:
- Staat de schakelaar "Klant-meldingen aan" aan?
- Heeft de testorder écht een telefoonnummer in het ontvanger-veld?
- Is de rit-status **Actief**? Geplande maar nog niet gestarte ritten triggeren niets.

### Test 2, klant ontvangt update bij grote shift

1. Houd dezelfde testorder als test 1 aan, of maak een nieuwe.
2. Wacht tot de eerste SMS binnen is (vooraankondiging).
3. Simuleer vertraging: laat de chauffeur stilstaan of een omweg rijden, zodat de aankomsttijd minstens **15 minuten** later wordt.

**Wat u verwacht**: u ontvangt op uw eigen telefoon een tweede SMS met de **nieuwe aankomsttijd**. U krijgt deze tweede SMS slechts één keer per stop, ook als de aankomsttijd nog vaker schuift.

**Werkt het niet?** Controleer:
- Was de shift echt minimaal 15 minuten? Lager dan dat is bewust géén SMS.
- Is de eerste vooraankondiging wel verstuurd? De tweede komt alleen daarna.

### Test 3, planner ziet voorspelde vertraging in Dispatch

1. Plan een rit met een **krap tijdvenster** (bijvoorbeeld aankomst tussen 10:00 en 10:30).
2. Start de rit en zorg dat de chauffeur in het echt of in de simulator achter loopt op planning.
3. Open de **Dispatch-tab**.

**Wat u verwacht**: zodra de voorspelde aankomsttijd minstens 5 minuten afwijkt van de planning, verschijnt er een **gouden ETA-badge** in de header van de rit. Geen badge = ETA loopt nog binnen de marge.

**Werkt het niet?** Controleer:
- Heeft de chauffeur GPS-positie doorgegeven? Geen positie = geen voorspelling.
- Is de afwijking minimaal 5 minuten? Onder die drempel is dit bewust geen badge.

### Test 4, planner ziet voorspelde vertraging in Exceptions

1. Houd dezelfde rit van test 3 aan.
2. Laat de voorspelde aankomst doorlopen tot deze meer dan **15 minuten** ná het einde van het tijdvenster valt.
3. Open de **Exceptions-tab**.

**Wat u verwacht**: er verschijnt een nieuwe melding in de categorie **"Voorspelde vertraging"** (apart van "Vertraagd"), met de naam van de stop en de voorspelde tijd. De melding heeft de ernst die u in Instellingen heeft ingesteld (standaard MEDIUM).

**Werkt het niet?** Controleer:
- Is de voorspelde aankomst écht boven de bovenkant van het tijdvenster + drempel?
- Zijn er al pogingen geweest? Per stop wordt de exception slechts één keer aangemaakt.

### Test 5, master-switch zet alle klant-SMS uit

1. Ga naar **Instellingen > ETA en klant-meldingen**.
2. Zet de schakelaar **"Klant-meldingen aan"** uit en klik **Opslaan**.
3. Maak opnieuw een testorder met uw telefoonnummer en doorloop test 1.

**Wat u verwacht**: u ontvangt **geen** SMS, óók niet 30 minuten voor aankomst. De voorspelde-vertraging-meldingen in Exceptions blijven wél werken, want die staan los van klant-SMS.

**Werkt het niet?** Komt er tóch nog een SMS binnen kort nadat u de schakelaar uitzette? Dat kan een SMS zijn die enkele seconden eerder al was voorbereid. Wacht een minuut en doe de test opnieuw.

## Wat u kunt aanpassen onderweg

- **Klant klaagt dat 30 minuten te kort is om te reageren**: zet `customer_push_lead_minutes` op 45 of 60.
- **Te veel "ETA verschoof"-SMS**: verhoog `customer_update_threshold_minutes` naar 20 of 30.
- **Te veel meldingen in Exceptions**: verhoog `predicted_delay_threshold_minutes` of zet de severity op LOW.
- **Test-fase bij nieuwe klant**: zet `customer_notifications_enabled` op uit, planner ziet nog wel alle voorspellingen.

## Vragen of stoort iets?

Geef het door, dan kijken we direct mee. Houd een ordernummer en een tijdstip bij de hand, dan zoeken we de SMS-historie en de voorspellings-historie op.
