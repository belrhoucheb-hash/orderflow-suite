import { getFormErrors, orderToForm } from "@/components/inbox/utils";
import type { FormState, OrderDraft } from "@/components/inbox/types";

export const AUTO_CONFIRM_MIN_CONFIDENCE = 95;

export interface AutoConfirmAssessment {
  eligible: boolean;
  confidence: number;
  title: string;
  reason: string;
}

export function assessAutoConfirm(draft: OrderDraft, form?: FormState | null): AutoConfirmAssessment {
  const confidence = draft.confidence_score ?? 0;
  const effectiveForm = form ?? orderToForm(draft);
  const hasErrors = !!getFormErrors(effectiveForm);
  const missingFields = draft.missing_fields ?? [];
  const hasAnomalies = (draft.anomalies ?? []).length > 0;
  const threadType = draft.thread_type || "new";

  if (threadType !== "new" && threadType !== "confirmation") {
    return {
      eligible: false,
      confidence,
      title: "Handmatige review",
      reason: "Alleen nieuwe aanvragen en bevestigingen gaan direct door.",
    };
  }

  if (missingFields.length > 0) {
    return {
      eligible: false,
      confidence,
      title: "Info ontbreekt",
      reason: `${missingFields.length} veld${missingFields.length > 1 ? "en" : ""} moeten nog bevestigd worden.`,
    };
  }

  if (hasErrors) {
    return {
      eligible: false,
      confidence,
      title: "Controle nodig",
      reason: "De verplichte intakevelden zijn nog niet compleet.",
    };
  }

  if (hasAnomalies) {
    return {
      eligible: false,
      confidence,
      title: "Afwijking gedetecteerd",
      reason: "Er zijn afwijkingen gevonden die eerst beoordeeld moeten worden.",
    };
  }

  if (confidence < AUTO_CONFIRM_MIN_CONFIDENCE) {
    return {
      eligible: false,
      confidence,
      title: "Nog niet veilig genoeg",
      reason: `Auto-confirm score is ${confidence}%. Vanaf ${AUTO_CONFIRM_MIN_CONFIDENCE}% kan de order automatisch door.`,
    };
  }

  return {
    eligible: true,
    confidence,
    title: "Klaar voor auto-confirm",
    reason: "Alle verplichte velden zijn compleet en de zekerheid is hoog genoeg om direct door te zetten.",
  };
}
