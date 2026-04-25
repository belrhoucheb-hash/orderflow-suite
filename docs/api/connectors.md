# Connectoren

OrderFlow heeft een connector-platform: één plek waar alle externe koppelingen op dezelfde manier werken (verbinden, mapping, sync, log). Dit document beschrijft welke connectoren beschikbaar zijn en hoe ze in het platform passen.

## Beschikbare connectoren

| Slug             | Naam            | Categorie       | Status      | Auth                  | Events            |
| ---------------- | --------------- | --------------- | ----------- | --------------------- | ----------------- |
| `snelstart`      | Snelstart       | Boekhouding     | Live        | client_credentials    | `invoice.sent`    |
| `exact_online`   | Exact Online    | Boekhouding     | Live        | OAuth2 (auth code)    | `invoice.sent`    |
| `twinfield`      | Twinfield       | Boekhouding     | Binnenkort  | OAuth2                | `invoice.sent`    |
| `afas`           | AFAS Profit     | Boekhouding     | Binnenkort  | api_key               | `invoice.sent`    |
| `webfleet`       | Webfleet        | Telematica      | Binnenkort  | api_key               |                   |
| `samsara`        | Samsara         | Telematica      | Binnenkort  | api_key               |                   |

Status `live` = werkt in productie. Status `soon` = kaart in catalogus, geen edge function (placeholder voor klant-validatie of pre-sales).

## Architectuur

Een connector is opgebouwd uit drie lagen:

1. **Catalogus** , [src/lib/connectors/catalog.ts](../src/lib/connectors/catalog.ts). Hardcoded lijst met metadata (naam, logo, status, auth-type, ondersteunde events, mapping-keys).
2. **Implementatie** , [supabase/functions/_shared/connectors/](../supabase/functions/_shared/connectors/). Eén bestand per provider (`snelstart-impl.ts`, `exact-impl.ts`) dat het `Connector`-interface implementeert.
3. **Edge function gateway** , `supabase/functions/connector-{slug}/index.ts`. Dunne wrapper die de runtime aanroept.

De runtime (`_shared/connectors/runtime.ts`) levert:
- `loadConfig(supabase, tenantId, provider)` , credentials + mapping uit DB.
- `runConnectorAction(...)` , wrapper die actie uitvoert en sync-log schrijft.
- `withRetry(fn)` , 3 pogingen met 1s/3s/9s backoff op 5xx.
- `mappingValue` / `credentialValue` , helpers.

## Connector-interface

```ts
export interface Connector {
  push(eventType, payload, config, supabase): Promise<ConnectorPushResult>;
  pull?(since, config, supabase): Promise<ConnectorPullResult>;
  testConnection(config, supabase): Promise<ConnectorTestResult>;
}
```

Push wordt aangeroepen door `connector-dispatcher` zodra een matchend webhook-event in de outbox landt. Pull is optioneel (v2). Test wordt aangeroepen door de UI-knop "Test verbinding".

## Trigger-flow voor push

```
[Status-change] → pipeline-trigger → emit_webhook_event() →
   webhook_deliveries (outbox) → connector-dispatcher → connector-{slug}.push()
```

De dispatcher kijkt per event-type welke connectoren ondersteund zijn (zie `PROVIDERS_FOR_EVENT` map in `connector-dispatcher/index.ts`) en roept ze parallel aan voor de tenant. Falende push komt in `integration_sync_log` met status FAILED en error_message; geslaagde push krijgt SUCCESS plus `external_id` (bijvoorbeeld het Snelstart boeking-ID).

## UI

In **Settings > Integraties** ziet een tenant-admin de catalogus, gegroepeerd per categorie. Status-badges:
- **Verbonden** , credentials aanwezig, koppeling actief.
- **Niet verbonden** , klikbaar om te configureren.
- **Beta** , werkt maar niet algemeen beschikbaar.
- **Binnenkort** , niet klikbaar.

Klikken opent de detail-pagina met vier tabs:
- **Verbinding** , credentials of OAuth-knop, "Test verbinding".
- **Mapping** , drie tenant-velden (`default_grootboek`, `btw_grootboek`, `debtor_number_start`).
- **Sync** , welke events ondersteund worden (per-event toggle in v2).
- **Log** , laatste 50 sync-acties uit `integration_sync_log`.

## Nieuwe connector toevoegen

1. Voeg een regel toe aan [`src/lib/connectors/catalog.ts`](../src/lib/connectors/catalog.ts).
2. Maak `_shared/connectors/{slug}-impl.ts` met een `Connector`-implementatie.
3. Maak edge function `connector-{slug}/index.ts` (kopieer pattern van connector-snelstart).
4. Voeg slug toe aan `PROVIDERS_FOR_EVENT` in [`connector-dispatcher`](../supabase/functions/connector-dispatcher/index.ts) als hij webhook-events afhandelt.
5. Voeg de provider toe aan `IntegrationProvider` type in [`useIntegrationCredentials.ts`](../src/hooks/useIntegrationCredentials.ts) en aan de CHECK-constraint in een nieuwe migratie als die nog niet bestaat.
6. Schrijf `docs/connectors/{slug}.md` met setup-handleiding.

## Beveiligingsadvies

- Credentials worden plain JSONB opgeslagen in `integration_credentials.credentials` met RLS die alleen owners/admins lezen. Voor production-grade encryption-at-rest staat Supabase Vault op de roadmap (v2).
- OAuth refresh-tokens worden naast access-tokens bewaard. Bij een DB-dump moet je daarom ook die rotate'n.
- Sync-log bevat geen plaintext credentials, alleen status en optioneel een externe ID.
