// Outbound webhook signing.
//
// Elke POST naar een subscriber krijgt drie headers:
//   X-OrderFlow-Event       : event_type (bijv. "order.created")
//   X-OrderFlow-Delivery-Id : UUID van de webhook_deliveries-rij
//   X-OrderFlow-Timestamp   : Unix-seconden (UTC)
//   X-OrderFlow-Signature   : "v1=" + hex(HMAC-SHA256(secret, timestamp + "." + body))
//
// Subscriber verifieert door zelf de HMAC te berekenen en constant-time
// te vergelijken. Timestamp staat expliciet in de signature-input om
// replay-attacks te voorkomen (advies: accepteer alleen ±5 min).

export interface WebhookHeaders {
  "X-OrderFlow-Event": string;
  "X-OrderFlow-Delivery-Id": string;
  "X-OrderFlow-Timestamp": string;
  "X-OrderFlow-Signature": string;
  "Content-Type": string;
  "User-Agent": string;
}

const SIGNATURE_VERSION = "v1";
const USER_AGENT = "OrderFlow-Webhook/1.0";

/**
 * Bereken HMAC-SHA256 van `timestamp.body` met het gegeven secret.
 * Returnt hex-encoded signature met "v1=" prefix.
 */
export async function signPayload(
  secret: string,
  body: string,
  timestamp: number,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const data = encoder.encode(`${timestamp}.${body}`);
  const sig = await crypto.subtle.sign("HMAC", key, data);

  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `${SIGNATURE_VERSION}=${hex}`;
}

/**
 * Bouw de volledige header-set voor een outbound delivery.
 */
export async function buildWebhookHeaders(params: {
  secret: string;
  eventType: string;
  deliveryId: string;
  body: string;
  timestamp?: number;
}): Promise<WebhookHeaders> {
  const timestamp = params.timestamp ?? Math.floor(Date.now() / 1000);
  const signature = await signPayload(params.secret, params.body, timestamp);

  return {
    "X-OrderFlow-Event": params.eventType,
    "X-OrderFlow-Delivery-Id": params.deliveryId,
    "X-OrderFlow-Timestamp": String(timestamp),
    "X-OrderFlow-Signature": signature,
    "Content-Type": "application/json",
    "User-Agent": USER_AGENT,
  };
}

/**
 * Genereer een nieuw subscription-secret. 32 bytes (256 bit) random,
 * base64url-encoded, geen padding.
 */
export function generateWebhookSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
