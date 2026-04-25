import type { OrderDraft } from "@/components/inbox/types";
import { DEFAULT_COMPANY } from "@/lib/companyConfig";

const FIELD_LABELS: Record<string, string> = {
  pickup_address: "het volledige ophaaladres",
  delivery_address: "het volledige afleveradres",
  quantity: "het aantal colli of pallets",
  unit: "de laadeenheid",
  weight_kg: "het gewicht",
  dimensions: "de afmetingen",
  requirements: "de extra vereisten",
  pickup_time_from: "het gewenste ophaalmoment",
  pickup_time_to: "het ophaalvenster",
  delivery_time_from: "het gewenste aflevermoment",
  delivery_time_to: "het aflevervenster",
  client_name: "de juiste klantnaam",
};

const FIELD_PRIORITY: Record<string, number> = {
  pickup_address: 1,
  delivery_address: 1,
  pickup_time_from: 2,
  pickup_time_to: 2,
  delivery_time_from: 2,
  delivery_time_to: 2,
  quantity: 3,
  unit: 3,
  weight_kg: 3,
  dimensions: 4,
  requirements: 4,
  client_name: 5,
};

function prettifyField(field: string) {
  return FIELD_LABELS[field] ?? field.replace(/_/g, " ");
}

function getFieldPriority(field: string) {
  return FIELD_PRIORITY[field] ?? 99;
}

function getSortedMissingFields(fields: string[]) {
  return [...fields].sort((left, right) => {
    const priorityDelta = getFieldPriority(left) - getFieldPriority(right);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return prettifyField(left).localeCompare(prettifyField(right), "nl");
  });
}

function isLikelyCompanyName(name: string) {
  return /\b(b\.?v\.?|nv|logistics|transport|cargo|group|holding|trading|b\.?v|ltd|llc|gmbh)\b/i.test(name)
    || /^[A-Z0-9 .&-]{4,}$/.test(name.trim());
}

function buildGreeting(clientName?: string | null) {
  if (!clientName) {
    return "Geachte heer/mevrouw,";
  }

  if (isLikelyCompanyName(clientName)) {
    return `Beste team van ${clientName},`;
  }

  return `Beste ${clientName},`;
}

function buildContextLine(order: OrderDraft) {
  const pickup = order.pickup_address?.trim();
  const delivery = order.delivery_address?.trim();

  if (pickup && delivery) {
    return `Dank voor uw transportaanvraag van ${pickup} naar ${delivery}.`;
  }

  return "Dank voor uw transportaanvraag.";
}

export function getFollowUpRecommendations(order: OrderDraft): string[] {
  const missingFields = getSortedMissingFields(order.missing_fields ?? []).map(prettifyField);
  const anomalyMessages = (order.anomalies ?? []).slice(0, 2).map((anomaly) => anomaly.message);

  return [...new Set([...missingFields, ...anomalyMessages])];
}

export function getBlockingFollowUpRecommendations(order: OrderDraft): string[] {
  return getSortedMissingFields(order.missing_fields ?? []).slice(0, 2).map(prettifyField);
}

export function buildSuggestedFollowUpSubject(order: OrderDraft) {
  const recommendations = getFollowUpRecommendations(order);
  const baseSubject = order.source_email_subject || "uw transportaanvraag";
  const prefix = `Re: ${baseSubject}`;

  if (recommendations.length === 1) {
    return `${prefix} - aanvulling nodig voor ${recommendations[0]}`;
  }

  if (recommendations.length > 1) {
    return `${prefix} - aanvullende informatie nodig`;
  }

  return `${prefix} - update gevraagd`;
}

export function buildSuggestedFollowUpDraft(order: OrderDraft) {
  const recommendations = getFollowUpRecommendations(order);
  const blockingRecommendations = getBlockingFollowUpRecommendations(order);

  if (recommendations.length === 0) {
    return "";
  }

  const bulletList = recommendations.map((item) => `- ${item}`).join("\n");
  const requestLine =
    blockingRecommendations.length > 0
      ? `Voor we de order kunnen bevestigen hebben we nog graag eerst ${blockingRecommendations.join(" en ")} nodig.`
      : "Om de order goed te kunnen verwerken missen we nog enkele gegevens:";

  return [
    buildGreeting(order.client_name),
    "",
    buildContextLine(order),
    requestLine,
    "",
    bulletList,
    "",
    "Zodra we deze informatie hebben, zetten we de aanvraag direct verder in behandeling.",
    "",
    "Met vriendelijke groet,",
    `Planning ${DEFAULT_COMPANY.name}`,
    DEFAULT_COMPANY.planningEmail,
  ].join("\n");
}
