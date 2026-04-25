import type { OrderDraft, FormState } from "@/components/inbox/types";
import { assessAutoConfirm } from "@/lib/autoConfirm";

export interface IntakeQueueStats {
  total: number;
  needsAction: number;
  ready: number;
  autoConfirm: number;
  waitingForInfo: number;
  followUpSent: number;
}

export function buildIntakeQueueStats(
  drafts: OrderDraft[],
  sentOrders: OrderDraft[],
  conceptOrders: OrderDraft[],
  formData: Record<string, FormState>,
): IntakeQueueStats {
  let needsAction = 0;
  let ready = 0;
  let autoConfirm = 0;

  for (const draft of drafts) {
    const missingFields = draft.missing_fields ?? [];
    const score = draft.confidence_score || 0;

    if (assessAutoConfirm(draft, formData[draft.id]).eligible) {
      autoConfirm += 1;
    }

    if (missingFields.length === 0 && score >= 80) {
      ready += 1;
    } else {
      needsAction += 1;
    }
  }

  return {
    total: drafts.length,
    needsAction,
    ready,
    autoConfirm,
    waitingForInfo: conceptOrders.length,
    followUpSent: sentOrders.length,
  };
}
