import type { FormState, OrderDraft } from "@/components/inbox/types";
import { orderToForm, isAddressIncomplete, getFormErrors } from "@/components/inbox/utils";
import { assessAutoConfirm, type AutoConfirmAssessment } from "@/lib/autoConfirm";
import { getRecommendedFollowUpAction } from "@/lib/followUpDraft";

export type InboxCaseStatusKey =
  | "extracting"
  | "waiting_for_customer"
  | "response_received"
  | "draft_reply"
  | "answer_question"
  | "review_update"
  | "review_cancellation"
  | "verify_anomaly"
  | "info_needed"
  | "ready_for_order"
  | "auto_confirm_ready"
  | "review";

export type InboxBlockerSeverity = "critical" | "warning";

export interface InboxCaseBlocker {
  key: string;
  label: string;
  severity: InboxBlockerSeverity;
}

export interface InboxCaseStatus {
  key: InboxCaseStatusKey;
  label: string;
  description: string;
  tone: string;
  recommendedLabel: string;
}

export interface InboxCaseSummary {
  status: InboxCaseStatus;
  blockers: InboxCaseBlocker[];
  nextStep: string;
}

function getEffectiveForm(draft: OrderDraft, form?: FormState | null) {
  return form ?? orderToForm(draft);
}

function getMissingFieldSet(draft: OrderDraft) {
  return new Set((draft.missing_fields ?? []).map((field) => field.toLowerCase()));
}

function addBlocker(
  blockers: InboxCaseBlocker[],
  key: string,
  label: string,
  severity: InboxBlockerSeverity,
) {
  if (!blockers.some((blocker) => blocker.key === key)) {
    blockers.push({ key, label, severity });
  }
}

function getAnomalySeverity(anomaly: NonNullable<OrderDraft["anomalies"]>[number]): InboxBlockerSeverity {
  if (!anomaly.avg_value) return "warning";
  const ratio = anomaly.avg_value > 0 ? anomaly.value / anomaly.avg_value : 1;
  return ratio >= 2 || ratio <= 0.5 ? "critical" : "warning";
}

export function getInboxCaseBlockers(draft: OrderDraft, form?: FormState | null): InboxCaseBlocker[] {
  const effectiveForm = getEffectiveForm(draft, form);
  const blockers: InboxCaseBlocker[] = [];
  const missing = getMissingFieldSet(draft);
  const pickupTimeMissing =
    missing.has("pickup_time_window") ||
    missing.has("pickup_date") ||
    missing.has("pickup_time") ||
    (!!draft.pickup_time_window_start && !draft.pickup_time_window_end) ||
    (!draft.pickup_time_window_start && !!draft.pickup_time_window_end);
  const deliveryTimeMissing =
    missing.has("delivery_time_window") ||
    missing.has("delivery_date") ||
    missing.has("delivery_time") ||
    (!!draft.delivery_time_window_start && !draft.delivery_time_window_end) ||
    (!draft.delivery_time_window_start && !!draft.delivery_time_window_end);

  if (!effectiveForm.pickupAddress || missing.has("pickup_address")) {
    addBlocker(blockers, "pickup_address", "Ophaaladres ontbreekt", "critical");
  } else if (isAddressIncomplete(effectiveForm.pickupAddress)) {
    addBlocker(blockers, "pickup_address_incomplete", "Ophaaladres is onvolledig", "critical");
  }

  if (!effectiveForm.deliveryAddress || missing.has("delivery_address")) {
    addBlocker(blockers, "delivery_address", "Afleveradres ontbreekt", "critical");
  } else if (isAddressIncomplete(effectiveForm.deliveryAddress)) {
    addBlocker(blockers, "delivery_address_incomplete", "Afleveradres is onvolledig", "critical");
  }

  if (pickupTimeMissing) {
    addBlocker(blockers, "pickup_time_window", "Laadvenster controleren", "warning");
  }

  if (deliveryTimeMissing) {
    addBlocker(blockers, "delivery_time_window", "Losvenster controleren", "warning");
  }

  effectiveForm.intermediateStops.forEach((stop, index) => {
    const label = `Tussenstop ${index + 1}`;
    if (!stop.address) {
      addBlocker(blockers, `intermediate_stop:${index}:address`, `${label} ontbreekt`, "critical");
      return;
    }
    if (isAddressIncomplete(stop.address)) {
      addBlocker(blockers, `intermediate_stop:${index}:address_incomplete`, `${label} is onvolledig`, "critical");
    }
    if ((stop.timeFrom && !stop.timeTo) || (!stop.timeFrom && stop.timeTo)) {
      addBlocker(blockers, `intermediate_stop:${index}:time_window`, `${label} venster controleren`, "warning");
    }
  });

  if (!effectiveForm.quantity || missing.has("quantity")) {
    addBlocker(blockers, "quantity", "Aantal ontbreekt", "critical");
  }

  if (!effectiveForm.weight || missing.has("weight") || missing.has("weight_kg")) {
    addBlocker(blockers, "weight_kg", "Gewicht ontbreekt", "critical");
  }

  if (!effectiveForm.dimensions || missing.has("dimensions")) {
    addBlocker(blockers, "dimensions", "Afmetingen ontbreken", "warning");
  }

  if (missing.has("requirements")) {
    addBlocker(blockers, "requirements", "Speciale vereisten nog bevestigen", "warning");
  }

  if (draft.changes_detected?.length) {
    addBlocker(blockers, "changes_detected", `${draft.changes_detected.length} wijziging${draft.changes_detected.length > 1 ? "en" : ""} controleren`, "warning");
  }

  for (const anomaly of draft.anomalies ?? []) {
    addBlocker(blockers, `anomaly:${anomaly.field}`, anomaly.message, getAnomalySeverity(anomaly));
  }

  return blockers;
}

export function getInboxCaseStatus(
  draft: OrderDraft,
  form?: FormState | null,
  assessment?: AutoConfirmAssessment,
): InboxCaseStatus {
  const effectiveAssessment = assessment ?? assessAutoConfirm(draft, form);
  const blockers = getInboxCaseBlockers(draft, form);
  const recommended = getRecommendedFollowUpAction(draft);
  const hasCriticalBlocker = blockers.some((blocker) => blocker.severity === "critical");
  const hasWarningBlocker = blockers.some((blocker) => blocker.severity === "warning");
  const formHasErrors = !!getFormErrors(getEffectiveForm(draft, form));
  const isExtracting = !draft.confidence_score && !draft.pickup_address && !draft.delivery_address && !draft.follow_up_draft;

  if (isExtracting) {
    return {
      key: "extracting",
      label: "Bezig met extractie",
      description: "De intake wordt nog automatisch gelezen.",
      tone: "bg-slate-100 text-slate-700 border-slate-200",
      recommendedLabel: "Wacht op extractie",
    };
  }

  if (draft.follow_up_sent_at) {
    if (draft.thread_type === "confirmation") {
      return {
        key: "response_received",
        label: "Reactie ontvangen",
        description: "Nieuwe klantinformatie is binnen en vraagt om herbeoordeling.",
        tone: "bg-emerald-50 text-emerald-700 border-emerald-200",
        recommendedLabel: blockers.length > 0 ? "Werk reactie door" : "Rond intake af",
      };
    }

    return {
      key: "waiting_for_customer",
      label: "Wacht op klant",
      description: "Follow-up is verstuurd en wacht op reactie.",
      tone: "bg-sky-50 text-sky-700 border-sky-200",
      recommendedLabel: "Wacht op reactie",
    };
  }

  if (draft.follow_up_draft && (draft.missing_fields?.length ?? 0) > 0) {
    return {
      key: "draft_reply",
      label: "Concept klaar",
      description: "Een follow-upconcept staat klaar voor ontbrekende informatie.",
      tone: "bg-blue-50 text-blue-700 border-blue-200",
      recommendedLabel: "Controleer concept",
    };
  }

  if (draft.thread_type === "question") {
    return {
      key: "answer_question",
      label: "Klantvraag",
      description: "Dit bericht vraagt om inhoudelijke reactie, niet om directe orderaanmaak.",
      tone: "bg-violet-50 text-violet-700 border-violet-200",
      recommendedLabel: recommended.label,
    };
  }

  if (draft.thread_type === "cancellation") {
    return {
      key: "review_cancellation",
      label: "Annulering controleren",
      description: "Controleer eerst de annuleringsimpact op de bestaande order.",
      tone: "bg-red-50 text-red-700 border-red-200",
      recommendedLabel: recommended.label,
    };
  }

  if (draft.thread_type === "update") {
    return {
      key: "review_update",
      label: "Wijziging verwerken",
      description: "Dit is een wijziging op een bestaande order of intake.",
      tone: "bg-amber-50 text-amber-800 border-amber-200",
      recommendedLabel: recommended.label,
    };
  }

  if ((draft.missing_fields?.length ?? 0) > 0 || hasCriticalBlocker) {
    return {
      key: "info_needed",
      label: "Info ontbreekt",
      description: "Er ontbreken nog gegevens voordat de intake veilig door kan.",
      tone: "bg-red-50 text-red-700 border-red-200",
      recommendedLabel: recommended.label,
    };
  }

  if ((draft.anomalies?.length ?? 0) > 0 || hasWarningBlocker) {
    return {
      key: "verify_anomaly",
      label: "Controle nodig",
      description: "Er zijn signalen die eerst gecontroleerd moeten worden.",
      tone: "bg-amber-50 text-amber-800 border-amber-200",
      recommendedLabel: recommended.label,
    };
  }

  if (effectiveAssessment.eligible) {
    return {
      key: "auto_confirm_ready",
      label: "Auto-confirm klaar",
      description: "Deze intake kan veilig automatisch doorgezet worden.",
      tone: "bg-emerald-50 text-emerald-700 border-emerald-200",
      recommendedLabel: "Auto-confirmeer",
    };
  }

  if (!formHasErrors) {
    return {
      key: "ready_for_order",
      label: "Intake compleet",
      description: "De intake is compleet en kan handmatig worden afgerond.",
      tone: "bg-emerald-50 text-emerald-700 border-emerald-200",
      recommendedLabel: "Maak order aan",
    };
  }

  return {
    key: "review",
    label: "Planner review",
    description: "Deze intake vraagt nog om beoordeling.",
    tone: "bg-slate-100 text-slate-700 border-slate-200",
    recommendedLabel: recommended.label,
  };
}

export function getInboxCaseSummary(
  draft: OrderDraft,
  form?: FormState | null,
  assessment?: AutoConfirmAssessment,
): InboxCaseSummary {
  const status = getInboxCaseStatus(draft, form, assessment);
  const blockers = getInboxCaseBlockers(draft, form);

  let nextStep = status.recommendedLabel;
  if (status.key === "waiting_for_customer") {
    nextStep = "Wachten op klantreactie";
  } else if (status.key === "response_received") {
    nextStep = blockers.length > 0 ? "Reactie verwerken" : "Afronden en bevestigen";
  } else if (status.key === "auto_confirm_ready") {
    nextStep = "Direct doorzetten";
  } else if (status.key === "ready_for_order") {
    nextStep = "Order maken";
  } else if (status.key === "review_update") {
    nextStep = "Wijziging beoordelen";
  } else if (status.key === "answer_question") {
    nextStep = "Klant beantwoorden";
  } else if (status.key === "review_cancellation") {
    nextStep = "Annulering beoordelen";
  }

  return { status, blockers, nextStep };
}
