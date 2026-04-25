# Exact Online-connector

## Wat doet hij?

Boekt een verzonden factuur als SalesEntry in een Exact Online-divisie. Authenticatie via OAuth2 (authorization code flow). Push wordt automatisch getriggerd door het webhook-event `invoice.sent`.

## Voorbereiding (eenmalig per OrderFlow-installatie)

1. Maak een Exact Online-app aan via https://apps.exactonline.com.
2. Configureer redirect-URI: `https://{project}.functions.supabase.co/oauth-callback-exact`.
3. Noteer **Client ID** en **Client Secret**.
4. Zet env vars op Supabase:
   - `EXACT_CLIENT_ID`
   - `EXACT_CLIENT_SECRET`
   - `EXACT_REDIRECT_URI` (zelfde als hierboven)
5. In OrderFlow-frontend env (Vite):
   - `VITE_EXACT_CLIENT_ID`
   - `VITE_EXACT_REDIRECT_URI`

## Verbinden per tenant

1. Open **Instellingen > Integraties** en klik op Exact Online.
2. Tab **Verbinding** > **Verbinden met Exact Online**.
3. Je wordt naar Exact gestuurd, daar log je in en geef je toestemming.
4. Na akkoord stuurt Exact je terug naar de callback-URL en zie je een tabblad "Verbonden".
5. Open in OrderFlow nogmaals de Exact-tab en klik op **Test verbinding**.

## Mapping

Drie tenant-velden:
- `default_grootboek` , verkoop grootboek-rekening (default 8000).
- `btw_grootboek` , BTW grootboek-rekening (default 1500).
- `debtor_number_start` , vanaf welk debiteurnummer nieuwe klanten beginnen (v2).

## Token-rotatie

Access-tokens leven 10 minuten, refresh-tokens 30 dagen. De runtime ververst access-tokens automatisch wanneer er minder dan 60 seconden geldigheid over is. Refresh-tokens roteren met elke refresh-call.

Als de refresh-token verloopt (30 dagen inactief), moet de tenant opnieuw verbinden via dezelfde knop.

## Hoe werkt push?

Wanneer een factuur in OrderFlow op `verzonden` wordt gezet:
1. `pipeline-trigger` emit `invoice.sent` naar de outbox.
2. `connector-dispatcher` roept `ExactConnector.push()` aan voor tenants met enabled Exact-koppeling.
3. De connector vernieuwt indien nodig de access-token, en POST een SalesEntry naar `/api/v1/{division}/salesentry/SalesEntries`.
4. De Exact `EntryID` komt terug in `integration_sync_log.external_id`.

## Beperkingen

- Eén divisie per tenant (`divisionId` in credentials).
- Alleen SalesEntry, geen invoice-PDF-upload.
- Geen automatische klant-sync; debiteur moet bestaan in Exact (gemapt op `client_id` van OrderFlow als externe referentie).
- Geen pull van betaalstatus. Komt in v2.

## Foutafhandeling

In **Sync log**:
- "Geen refresh-token, opnieuw verbinden via OAuth" , refresh verlopen, klik **Verbinden** opnieuw.
- "Exact 401" , token-rotatie faalde, runtime probeert opnieuw bij volgende push.
- "Exact 422" , SalesEntry-validatie faalde, lees response-body voor exacte fout.
