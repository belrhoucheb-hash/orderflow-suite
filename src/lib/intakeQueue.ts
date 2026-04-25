import type { OrderDraft, FormState } from "@/components/inbox/types";
import { getInboxCaseStatus } from "@/lib/inboxCase";

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
  let waitingForInfo = 0;
  let followUpSent = 0;

  for (const draft of drafts) {
    const status = getInboxCaseStatus(draft, formData[draft.id]);

    if (status.key === "auto_confirm_ready") {
      autoConfirm += 1;
    }

    if (status.key === "waiting_for_customer" || status.key === "draft_reply" || status.key === "info_needed") {
      waitingForInfo += 1;
    }

    if (status.key === "waiting_for_customer") {
      followUpSent += 1;
    }

    if (status.key === "ready_for_order" || status.key === "auto_confirm_ready") {
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
    waitingForInfo: Math.max(waitingForInfo, conceptOrders.length),
    followUpSent: Math.max(followUpSent, sentOrders.length),
  };
}
