// Mapping van interne status-transities naar externe webhook-events.
//
// Ieder event dat een klant kan abonneren heeft een stabiele naam
// (entiteit.actie, lower-snake). Deze lijst is de publieke API-contract
// voor v1; wijzigingen zijn breaking changes en vereisen documentatie.

export const KNOWN_EVENT_TYPES = [
  "order.created",
  "order.confirmed",
  "order.status_changed",
  "trip.planned",
  "trip.dispatched",
  "trip.completed",
  "invoice.created",
  "invoice.sent",
  "invoice.paid",
  "webhook.test",
] as const;

export type WebhookEventType = typeof KNOWN_EVENT_TYPES[number];

/**
 * Leidt het specifieke event-type af uit een entiteit + nieuwe status.
 * Returnt null als de transitie geen publiek event oplevert.
 */
export function mapStatusToEvent(
  entityType: "order" | "trip" | "invoice",
  newStatus: string,
): WebhookEventType | null {
  if (entityType === "order") {
    switch (newStatus) {
      case "DRAFT":
      case "PENDING":
        return "order.created";
      case "CONFIRMED":
        return "order.confirmed";
      default:
        return null;
    }
  }

  if (entityType === "trip") {
    switch (newStatus) {
      case "PLANNED":
      case "GEPLAND":
        return "trip.planned";
      case "VERZONDEN":
      case "DISPATCHED":
      case "IN_TRANSIT":
        return "trip.dispatched";
      case "COMPLETED":
        return "trip.completed";
      default:
        return null;
    }
  }

  if (entityType === "invoice") {
    switch (newStatus) {
      case "concept":
        return "invoice.created";
      case "verzonden":
      case "sent":
        return "invoice.sent";
      case "betaald":
      case "paid":
        return "invoice.paid";
      default:
        return null;
    }
  }

  return null;
}

/**
 * Generieke status-change event naast het specifieke. Klanten die alles
 * willen volgen abonneren op "<entity>.status_changed".
 */
export function genericStatusEvent(
  entityType: "order" | "trip" | "invoice",
): WebhookEventType | null {
  if (entityType === "order") return "order.status_changed";
  return null; // trip/invoice hebben (nog) geen generiek event
}
