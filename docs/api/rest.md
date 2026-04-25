# REST API v1

OrderFlow biedt een publieke REST API zodat je eigen systeem (ERP, BI, klantportaal) data kan ophalen en orders kan aanmaken.

## Basis-URL

```
https://{project}.functions.supabase.co/api-v1
```

## Authenticatie

Bearer-token in de `Authorization`-header. Tokens beginnen met `ofs_` en worden aangemaakt in **Settings > API-tokens** (tenant-admin) of in het klantportaal onder **Instellingen** (klant-admin).

```
Authorization: Bearer ofs_abc123...
```

Tenant-tokens zien alle data van de tenant. Klant-tokens zien alleen data van de eigen klant.

## Scopes

Elk token krijgt één of meer scopes. Zonder de juiste scope geeft een endpoint **403 forbidden**.

| Scope            | Nodig voor                                     |
| ---------------- | ---------------------------------------------- |
| `orders:read`    | `GET /orders`, `GET /orders/:id`                |
| `orders:write`   | `POST /orders`                                  |
| `trips:read`     | `GET /trips`, `GET /trips/:id` (tenant-tokens)  |
| `invoices:read`  | `GET /invoices`, `GET /invoices/:id`            |
| `clients:read`   | `GET /clients`, `GET /clients/:id`              |

## Endpoints

Zie `openapi.yaml` voor volledige schemas. Snelle voorbeelden:

### Lijst orders

```bash
curl https://{project}.functions.supabase.co/api-v1/orders?limit=20 \
  -H "Authorization: Bearer ofs_..."
```

Antwoord:

```json
{
  "data": [
    {
      "id": "3e4a...",
      "order_number": 1042,
      "status": "CONFIRMED",
      "client_name": "Acme BV",
      "pickup_address": "Havenstraat 12, Rotterdam",
      "delivery_address": "Marktplein 3, Amsterdam",
      "delivery_date": "2026-04-25",
      "weight_kg": 450,
      "created_at": "2026-04-23T10:00:00Z"
    }
  ],
  "pagination": { "limit": 20, "offset": 0, "total": 87 }
}
```

### Order detail

```bash
curl https://{project}.functions.supabase.co/api-v1/orders/3e4a... \
  -H "Authorization: Bearer ofs_..."
```

### Order aanmaken

```bash
curl -X POST https://{project}.functions.supabase.co/api-v1/orders \
  -H "Authorization: Bearer ofs_..." \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "Acme BV",
    "pickup_address": "Havenstraat 12, Rotterdam",
    "delivery_address": "Marktplein 3, Amsterdam",
    "delivery_date": "2026-04-25",
    "weight_kg": 450,
    "reference": "PO-2026-0042"
  }'
```

Antwoord (`201 Created`): de aangemaakte order, status `DRAFT`. De interne triggers pakken het daarna op (pricing, planning, confirmatie).

## Paginering

Alle lijst-endpoints ondersteunen `?limit=N&offset=M`. Maximum limit is 200, default 50.

## Rate limits

300 requests per minuut per token (sliding window). Overschrijding geeft `429 rate_limited`. Response-headers tonen de status:

```
X-RateLimit-Limit: 300
X-RateLimit-Remaining: 287
X-RateLimit-Reset: 2026-04-23T10:01:00.000Z
```

## Errors

Uniforme shape:

```json
{ "error": { "code": "not_found", "message": "Order niet gevonden" } }
```

| HTTP | `code`                | Betekenis                           |
| ---- | --------------------- | ----------------------------------- |
| 400  | `bad_request`         | Ongeldige input                     |
| 401  | `unauthorized`        | Ongeldige of ontbrekende token      |
| 403  | `forbidden`           | Token mist scope                    |
| 404  | `not_found`           | Resource bestaat niet               |
| 405  | `method_not_allowed`  | HTTP-method niet ondersteund        |
| 429  | `rate_limited`        | Te veel requests                    |
| 500  | `server_error`        | Interne fout, probeer opnieuw       |

## Idempotentie bij POST /orders

De API dedupliceert **niet** automatisch. Als je dezelfde order twee keer post, krijg je twee orders. Advies: genereer aan jouw kant een `reference`-veld (bijvoorbeeld je eigen order-ID) en check of die al bestaat met `GET /orders?limit=1` voor je post. Volwaardige `Idempotency-Key`-header komt in v2.

## Klant-tokens: wat zie je wel en niet?

| Endpoint           | Tenant-token | Klant-token                               |
| ------------------ | ------------ | ----------------------------------------- |
| `GET /orders`      | Alle orders  | Alleen eigen orders                       |
| `GET /orders/:id`  | Alle         | Alleen eigen                              |
| `POST /orders`     | Ja           | Ja, `client_id` wordt geforceerd op eigen |
| `GET /trips`       | Alle ritten  | Niet beschikbaar in v1 (403)              |
| `GET /invoices`    | Alle         | Alleen eigen                              |
| `GET /clients`     | Alle         | Alleen eigen record                       |

## Beveiligingsadvies

- Bewaar tokens in een secrets-manager, niet in source-code.
- Roteer tokens periodiek door ze in te trekken en een nieuwe aan te maken.
- Gebruik korte expires voor integraties die je test (30 dagen).
- Eén token per integratie, zodat je ze individueel kunt intrekken bij een lek.

## Niet in scope v1

- PUT/PATCH/DELETE op orders (komt in v2, vereist conflict-resolutie met interne flows).
- Webhooks-subscription-management via API (blijft in Settings-UI).
- Bulk-endpoints, streaming, GraphQL, cursor-pagination.
