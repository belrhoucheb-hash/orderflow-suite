# Snelstart-connector

## Wat doet hij?

Boekt een verzonden factuur als verkoopboeking in een Snelstart-administratie. Push wordt automatisch getriggerd door het webhook-event `invoice.sent`.

## Voorbereiding

1. Log in bij Snelstart en open je administratie.
2. Vraag in **B2B-portaal** een **Client Key** en **Subscription Key** aan.
3. Noteer je **Administratie-ID** (te vinden onder Bedrijfsinstellingen).
4. Stem met je boekhouder af welke **grootboek-rekening** voor verkoopboekingen wordt gebruikt (default 8000) en welke voor BTW (default 1500).

## Configureren in OrderFlow

1. Ga naar **Instellingen > Integraties** en klik op de Snelstart-kaart.
2. Tab **Verbinding**:
   - Vul Client Key, Subscription Key en Administratie-ID in.
   - Vink **Mock-modus** aan als je eerst wilt testen zonder echte boekingen.
   - Klik op **Opslaan**.
   - Klik op **Test verbinding** om te valideren dat de OAuth-token wordt opgehaald.
3. Tab **Mapping** (optioneel):
   - Override de default grootboek-rekening of BTW-rekening als je administratie afwijkt.
4. Tab **Sync**: bevestig dat `invoice.sent` als ondersteund event staat.

## Hoe werkt push?

Wanneer in OrderFlow een factuur op `verzonden` wordt gezet:
1. `pipeline-trigger` emit een `invoice.sent` event naar de webhook-outbox.
2. `connector-dispatcher` ziet dat Snelstart enabled is voor deze tenant en roept `SnelstartConnector.push()` aan.
3. De connector haalt de factuur uit de DB, ruilt credentials voor een access-token, upsert de relatie (klant) op KvK-nummer, en posted een verkoopboeking.
4. Het Snelstart boeking-ID komt terug in `invoices.snelstart_boeking_id` en in `integration_sync_log.external_id`.

## Mock-modus

Met **Mock-modus** aan worden er geen echte API-calls naar Snelstart gedaan. Het systeem simuleert een geslaagde boeking en zet `snelstart_boeking_id = MOCK-{factuurnummer}-{random}`. Handig voor demo-omgevingen of acceptatie-tests zonder echte administratie.

## Foutafhandeling

Falende push komt in **Sync log** met status FAILED en de foutmelding. Veelvoorkomende problemen:
- "Token ophalen mislukt" , Client Key of Subscription Key kloppen niet.
- "administratieId ontbreekt" , Administratie-ID niet ingevuld.
- "Snelstart 401" , token verlopen, retry met opnieuw ophalen werkt meestal.
- "Snelstart 422" , validatie-fout op de boeking. Lees de response-body in de log voor de exacte regel.

## Beperkingen

- Eén administratie per tenant. Multi-administratie support is v2.
- Alleen verkoopboekingen, geen inkoop.
- Geen pull (debiteurensaldo, betaalstatus). Komt in v2.
