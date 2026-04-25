import type { OrderDraft } from "@/components/inbox/types";

export interface FollowUpStatus {
  label: string;
  tone: string;
}

export function getFollowUpStatus(draft: OrderDraft): FollowUpStatus | null {
  if (draft.follow_up_sent_at) {
    return {
      label: "Reactie verstuurd",
      tone: "bg-slate-100 text-slate-700 border-slate-200",
    };
  }

  if (draft.follow_up_draft) {
    return {
      label: "Concept klaar",
      tone: "bg-blue-50 text-blue-700 border-blue-200",
    };
  }

  if ((draft.missing_fields ?? []).length > 0) {
    return {
      label: "Info opvragen",
      tone: "bg-amber-50 text-amber-700 border-amber-200",
    };
  }

  return null;
}
