import type { OrderDraft } from "@/components/inbox/types";
import { DEFAULT_COMPANY } from "@/lib/companyConfig";
import { getIntakeSourceMeta } from "@/lib/intakeSources";

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

type FollowUpAction =
  | "request_missing_info"
  | "verify_anomaly"
  | "review_update"
  | "review_cancellation"
  | "answer_question"
  | "complete_confirmation";

function prettifyField(field: string) {
  return FIELD_LABELS[field] ?? field.replace(/_/g, " ");
}

function formatAnomalyValue(value: number) {
  return new Intl.NumberFormat("nl-NL").format(value);
}

function buildAnomalyRecommendation(anomaly: NonNullable<OrderDraft["anomalies"]>[number]) {
  const formattedValue = formatAnomalyValue(anomaly.value);
  const formattedAverage = formatAnomalyValue(anomaly.avg_value);

  switch (anomaly.field) {
    case "weight_kg":
    case "weight":
      return `kunt u bevestigen of het gewicht inderdaad ${formattedValue} kg is? Dit wijkt af van het gebruikelijke niveau van ongeveer ${formattedAverage} kg`;
    case "quantity":
      return `kunt u bevestigen of het aantal inderdaad ${formattedValue} is? Dit wijkt af van het gebruikelijke niveau van ongeveer ${formattedAverage}`;
    case "pickup_address":
      return "kunt u bevestigen dat het ophaaladres correct is";
    case "delivery_address":
      return "kunt u bevestigen dat het afleveradres correct is";
    default:
      return anomaly.message
        ? `${anomaly.message.charAt(0).toLowerCase()}${anomaly.message.slice(1)}`
        : `kunt u ${prettifyField(anomaly.field)} controleren`;
  }
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
  return /\b(b\.?v\.?|nv|logistics|transport|cargo|group|holding|trading|corp|corporation|b\.?v|ltd|llc|gmbh)\b/i.test(name)
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

function isDirectEmailStyle(order: OrderDraft) {
  return getIntakeSourceMeta(order.source, !!order.source_email_from).key === "EMAIL";
}

function buildSourceAwareIntro(order: OrderDraft) {
  const sourceKey = getIntakeSourceMeta(order.source, !!order.source_email_from).key;

  switch (sourceKey) {
    case "PORTAL":
      return "Dank voor uw aanvraag via het klantportaal.";
    case "API":
      return "Dank voor de doorgestuurde transportaanvraag via de koppeling.";
    case "MANUAL":
      return "Voor deze aanvraag missen we nog enkele gegevens voor verdere verwerking.";
    default:
      return "Dank voor uw bericht.";
  }
}

function buildContextLine(order: OrderDraft) {
  const pickup = order.pickup_address?.trim();
  const delivery = order.delivery_address?.trim();
  const routeText = pickup && delivery ? ` van ${pickup} naar ${delivery}` : "";
  const prefix = isDirectEmailStyle(order) ? "Dank voor" : "Aanvullend op";

  switch (order.thread_type) {
    case "update":
      return `${prefix} uw wijziging op de transportaanvraag${routeText}.`;
    case "cancellation":
      return `${prefix} uw bericht over de annulering van de transportaanvraag${routeText}.`;
    case "question":
      return `${prefix} uw bericht over de transportaanvraag${routeText}.`;
    case "confirmation":
      return `${prefix} uw bevestiging van de transportaanvraag${routeText}.`;
    default:
      return routeText
        ? `${prefix} uw transportaanvraag${routeText}.`
        : `${prefix} uw transportaanvraag.`;
  }
}

function buildRequestLine(order: OrderDraft, blockingRecommendations: string[]) {
  if (blockingRecommendations.length === 0) {
    return "Om de order goed te kunnen verwerken missen we nog enkele gegevens:";
  }

  const blockingText = blockingRecommendations.join(" en ");

  switch (order.thread_type) {
    case "update":
      return `Om de wijziging goed te verwerken hebben we nog graag eerst ${blockingText} nodig.`;
    case "cancellation":
      return `Om de annulering correct af te handelen hebben we nog graag eerst ${blockingText} nodig.`;
    case "question":
      return `Om uw vraag goed te beantwoorden hebben we nog graag eerst ${blockingText} nodig.`;
    case "confirmation":
      return `Voor een volledige bevestiging hebben we nog graag eerst ${blockingText} nodig.`;
    default:
      return `Voor we de order kunnen bevestigen hebben we nog graag eerst ${blockingText} nodig.`;
  }
}

function buildCompletionLine(order: OrderDraft) {
  switch (order.thread_type) {
    case "update":
      return "Zodra we deze informatie hebben, verwerken we de wijziging direct verder.";
    case "cancellation":
      return "Zodra we deze informatie hebben, handelen we de annulering direct verder af.";
    case "question":
      return "Zodra we deze informatie hebben, komen we direct bij u terug met een volledig antwoord.";
    case "confirmation":
      return "Zodra we deze informatie hebben, ronden we de bevestiging direct verder af.";
    default:
      return "Zodra we deze informatie hebben, zetten we de aanvraag direct verder in behandeling.";
  }
}

export function getFollowUpRecommendations(order: OrderDraft): string[] {
  const missingFields = getSortedMissingFields(order.missing_fields ?? []).map(prettifyField);
  const anomalyMessages = (order.anomalies ?? []).slice(0, 2).map(buildAnomalyRecommendation);

  return [...new Set([...missingFields, ...anomalyMessages])];
}

export function getBlockingFollowUpRecommendations(order: OrderDraft): string[] {
  return getSortedMissingFields(order.missing_fields ?? []).slice(0, 2).map(prettifyField);
}

export function getFollowUpReasonSummary(order: OrderDraft): string[] {
  const reasons: string[] = [];
  const missingCount = order.missing_fields?.length ?? 0;
  const anomalyCount = order.anomalies?.length ?? 0;
  const sourceMeta = getIntakeSourceMeta(order.source, !!order.source_email_from);

  if (missingCount > 0) {
    reasons.push(`${missingCount} ontbrekend${missingCount > 1 ? "e velden" : " veld"}`);
  }

  if (anomalyCount > 0) {
    reasons.push(`${anomalyCount} afwijk${anomalyCount > 1 ? "ingen" : "ing"} om te verifiëren`);
  }

  if (order.thread_type === "update") {
    reasons.push("wijzigingsverzoek van klant");
  } else if (order.thread_type === "cancellation") {
    reasons.push("annuleringsverzoek van klant");
  } else if (order.thread_type === "question") {
    reasons.push("inhoudelijke klantvraag");
  } else if (order.thread_type === "confirmation") {
    reasons.push("bevestiging nog niet compleet");
  }

  reasons.push(`bron: ${sourceMeta.label.toLowerCase()}`);

  return reasons;
}

export function getRecommendedFollowUpAction(order: OrderDraft): { label: string; description: string; key: FollowUpAction } {
  const missingCount = order.missing_fields?.length ?? 0;
  const anomalyCount = order.anomalies?.length ?? 0;
  const blockingRecommendations = getBlockingFollowUpRecommendations(order);
  const blockingText = blockingRecommendations.join(" en ");

  if (order.thread_type === "cancellation") {
    return {
      key: "review_cancellation",
      label: "Controleer annulering",
      description: missingCount > 0
        ? `Vraag eerst ${blockingText} op om de annulering correct af te handelen.`
        : "Controleer de annuleringsdetails voordat je de order afsluit.",
    };
  }

  if (order.thread_type === "question") {
    return {
      key: "answer_question",
      label: "Beantwoord klantvraag",
      description: missingCount > 0
        ? `Vraag eerst ${blockingText} op zodat je een volledig antwoord kunt geven.`
        : "Reageer inhoudelijk op de vraag van de klant.",
    };
  }

  if (order.thread_type === "update") {
    return {
      key: "review_update",
      label: "Verwerk wijziging",
      description: missingCount > 0
        ? `Vraag eerst ${blockingText} op voordat je de wijziging doorzet.`
        : "Controleer en verwerk de wijziging in de order.",
    };
  }

  if (missingCount > 0) {
    return {
      key: "request_missing_info",
      label: "Vraag ontbrekende info op",
      description: `Start met ${blockingText} zodat de order richting bevestiging kan.`,
    };
  }

  if (anomalyCount > 0) {
    return {
      key: "verify_anomaly",
      label: "Verifieer afwijking",
      description: "Check eerst de opvallende waarde met de klant voordat je bevestigt.",
    };
  }

  return {
    key: "complete_confirmation",
    label: "Rond bevestiging af",
    description: "Alle signalen staan goed om de order verder af te ronden.",
  };
}

function buildSubjectSuffix(order: OrderDraft, recommendations: string[]) {
  const defaultSingle = recommendations[0];

  switch (order.thread_type) {
    case "update":
      return recommendations.length === 1
        ? `aanvulling nodig voor wijziging: ${defaultSingle}`
        : "aanvullende informatie nodig voor wijziging";
    case "cancellation":
      return recommendations.length === 1
        ? `aanvulling nodig voor annulering: ${defaultSingle}`
        : "aanvullende informatie nodig voor annulering";
    case "question":
      return recommendations.length === 1
        ? `aanvulling nodig voor uw vraag: ${defaultSingle}`
        : "aanvullende informatie nodig voor uw vraag";
    case "confirmation":
      return recommendations.length === 1
        ? `aanvulling nodig voor bevestiging: ${defaultSingle}`
        : "aanvullende informatie nodig voor bevestiging";
    default:
      return recommendations.length === 1
        ? `aanvulling nodig voor ${defaultSingle}`
        : "aanvullende informatie nodig";
  }
}

export function buildSuggestedFollowUpSubject(order: OrderDraft) {
  const recommendations = getFollowUpRecommendations(order);
  const baseSubject = order.source_email_subject || "uw transportaanvraag";
  const prefix = `Re: ${baseSubject}`;

  if (recommendations.length > 0) {
    return `${prefix} - ${buildSubjectSuffix(order, recommendations)}`;
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

  return [
    buildGreeting(order.client_name),
    "",
    !isDirectEmailStyle(order) ? buildSourceAwareIntro(order) : null,
    !isDirectEmailStyle(order) ? "" : null,
    buildContextLine(order),
    buildRequestLine(order, blockingRecommendations),
    "",
    bulletList,
    "",
    buildCompletionLine(order),
    "",
    "Met vriendelijke groet,",
    `Planning ${DEFAULT_COMPANY.name}`,
    DEFAULT_COMPANY.planningEmail,
  ].join("\n");
}
