# Outbound webhooks

OrderFlow stuurt events naar een URL naar keuze zodra er iets relevants gebeurt (order aangemaakt, rit voltooid, factuur betaald). Webhooks zijn het tegenovergestelde van polling: in plaats van elke minuut de API te bevragen, krijg je binnen seconden een POST zodra de status verandert.

## Subscriptions

Subscriptions worden beheerd in **Settings > Webhooks** door een tenant-admin.

Per subscription registreer je:

- **Naam** , vrije tekst.
- **URL** , een publieke HTTPS-endpoint (http wordt geweigerd).
- **Events** , één of meer event-types waar deze subscription op matcht.
- **Omschrijving** , optioneel.

Bij aanmaak wordt er een **secret** gegenereerd die **maar één keer** wordt getoond. Bewaar hem meteen: je hebt hem nodig om de signature aan jouw kant te verifiëren.

## Events

| Event                  | Wanneer                                                   |
| ---------------------- | --------------------------------------------------------- |
| `order.created`        | Status wordt `DRAFT` of `PENDING`                         |
| `order.confirmed`      | Status wordt `CONFIRMED`                                  |
| `order.status_changed` | Bij elke status-wijziging op een order (generiek)         |
| `trip.planned`         | Rit wordt `PLANNED` / `GEPLAND`                           |
| `trip.dispatched`      | Rit wordt `VERZONDEN`, `DISPATCHED` of `IN_TRANSIT`       |
| `trip.completed`       | Rit status wordt `COMPLETED`                              |
| `invoice.created`      | Factuur-concept wordt aangemaakt                          |
| `invoice.sent`         | Factuur wordt verzonden                                   |
| `invoice.paid`         | Factuur wordt als betaald gemarkeerd                      |
| `webhook.test`         | Alleen via de "test"-knop in Settings                     |

## Payload

Elke POST heeft een JSON-body met deze vorm:

```json
{
  "event": "order.created",
  "event_id": "c3b1c6d2-2a90-4c0b-9e1a-...",
  "delivery_id": "a0f3de7b-...",
  "data": {
    "entity_type": "order",
    "entity_id": "...",
    "tenant_id": "...",
    "previous_status": "",
    "new_status": "PENDING",
    "occurred_at": "2026-04-23T14:22:01.123Z"
  }
}
```

Het `data`-veld varieert per event. Voor `invoice.created` bijvoorbeeld bevat `data` ook `invoice_number`, `total`, `client_id`, enzovoort.

## Headers

| Header                    | Inhoud                                                           |
| ------------------------- | ---------------------------------------------------------------- |
| `X-OrderFlow-Event`       | Event-type, bijv. `order.created`                                |
| `X-OrderFlow-Delivery-Id` | UUID van de delivery. Gebruik voor idempotentie                  |
| `X-OrderFlow-Timestamp`   | Unix-seconden (UTC) waarop de request is gesigned                |
| `X-OrderFlow-Signature`   | `v1=` + hex(HMAC-SHA256(secret, timestamp + "." + raw-body))     |
| `Content-Type`            | `application/json`                                               |
| `User-Agent`              | `OrderFlow-Webhook/1.0`                                          |

## Signature verifiëren

De body wordt gesigned als `{timestamp}.{raw body}`. Aan jouw kant:

1. Lees `X-OrderFlow-Timestamp` en `X-OrderFlow-Signature`.
2. Weiger als `abs(now - timestamp) > 300 seconden` (replay-bescherming).
3. Bereken `v1=` + hex(HMAC-SHA256(secret, timestamp + "." + raw_body)).
4. Vergelijk **constant-time** met de ontvangen signature.

### Node.js

```js
import crypto from "node:crypto";

function verifyWebhook(req, secret) {
  const ts = req.headers["x-orderflow-timestamp"];
  const sig = req.headers["x-orderflow-signature"];
  const age = Math.abs(Date.now() / 1000 - Number(ts));
  if (age > 300) return false;

  const expected = "v1=" + crypto
    .createHmac("sha256", secret)
    .update(ts + "." + req.rawBody)
    .digest("hex");

  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}
```

### PHP

```php
function verifyWebhook(string $rawBody, array $headers, string $secret): bool {
  $ts = $headers['X-OrderFlow-Timestamp'] ?? '';
  $sig = $headers['X-OrderFlow-Signature'] ?? '';
  if (abs(time() - (int)$ts) > 300) return false;
  $expected = 'v1=' . hash_hmac('sha256', $ts . '.' . $rawBody, $secret);
  return hash_equals($expected, $sig);
}
```

## Idempotentie

Dezelfde event kan in zeldzame gevallen twee keer aankomen (bijvoorbeeld bij een timeout waarbij de subscriber wel 2xx teruggaf maar wij dat niet zagen). Gebruik `X-OrderFlow-Delivery-Id` als idempotency-key: als je dezelfde delivery-id al verwerkt hebt, negeer dan de tweede.

## Retry-schema

Bij niet-2xx of netwerk-fout probeert OrderFlow het opnieuw, met oplopende wachttijd:

| Poging | Wachttijd voor poging |
| ------ | --------------------- |
| 2      | 1 minuut              |
| 3      | 5 minuten             |
| 4      | 30 minuten            |
| 5      | 2 uur                 |
| 6      | 12 uur                |

Na zes mislukkingen gaat de delivery op `DEAD`. Je kunt hem vanuit de UI handmatig opnieuw in de wachtrij zetten.

## Delivery-log

In Settings > Webhooks > (subscription) > History zie je de laatste 50 deliveries per subscription, inclusief response-code, duur en response-body (eerste 2KB). Je kunt per delivery op **Replay** klikken om hem direct opnieuw in te plannen.

## Limieten

- Target URL moet HTTPS zijn.
- Per-delivery timeout: 10 seconden.
- Response-body wordt getrunceerd op 2KB in de log.
- Max 6 pogingen voor een event voor `DEAD`.
