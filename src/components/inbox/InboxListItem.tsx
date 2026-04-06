import React from "react";
import { Paperclip } from "lucide-react";
import type { OrderDraft } from "./types";
import { formatDate, getDeadlineInfo } from "./utils";
import { cn } from "@/lib/utils";
import { ORDER_SOURCE_LABELS, ORDER_SOURCE_COLORS } from "@/types/clientPortal";
import type { OrderSource } from "@/types/clientPortal";

interface Props {
  draft: OrderDraft;
  isSelected: boolean;
  isBulkChecked?: boolean;
  onBulkToggle?: (id: string) => void;
  onClick: () => void;
}

// NOTE: Parent should wrap `onClick` and `onBulkToggle` in useCallback to preserve memo benefits.
function InboxListItemInner({ draft, isSelected, isBulkChecked, onBulkToggle, onClick }: Props) {
  const deadline = getDeadlineInfo(draft.received_at);
  const isUrgent = deadline.urgency === "red";
  const threadType = draft.thread_type || "new";
  const isUnread = !draft.confidence_score;
  const attachmentCount = (draft.attachments as any[])?.length || 0;

  const typeBadge = (() => {
    if (threadType === "cancellation") return { label: "Annulering", cls: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400" };
    if (threadType === "update") return { label: "Update", cls: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400" };
    if (threadType === "confirmation") return { label: "Bevestiging", cls: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" };
    if (threadType === "question") return { label: "Vraag", cls: "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400" };
    if (isUrgent) return { label: "Urgent", cls: "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 font-bold" };
    return { label: "Aanvraag", cls: "bg-muted text-muted-foreground" };
  })();

  return (
    <div className={cn(
      "relative w-full text-left transition-all border-l-[4px] group",
      isSelected
        ? "border-l-primary bg-primary/5 shadow-inner"
        : isUrgent
          ? "border-l-primary/60 hover:bg-red-50/30 dark:hover:bg-red-950/20 border-b border-border animate-[pulse-red-border_2s_infinite]"
          : "border-l-transparent hover:bg-muted/50 border-b border-border",
      isBulkChecked && "bg-primary/5 ring-1 ring-primary/20"
    )}>
      <button onClick={onClick} className="w-full text-left p-4 pl-5">
        {/* Unread dot — left edge */}
        {isUnread && (
          <div className="absolute top-1/2 -translate-y-1/2 left-1 w-1.5 h-1.5 bg-primary rounded-full group-hover:opacity-0 transition-opacity" />
        )}
        {/* Bulk checkbox — replaces dot on hover */}
        {onBulkToggle && (
          <input type="checkbox" checked={isBulkChecked || false}
            onChange={() => onBulkToggle(draft.id)}
            className="absolute top-1/2 -translate-y-1/2 left-0.5 w-3.5 h-3.5 rounded border-gray-300 text-primary focus:ring-primary/20 opacity-0 group-hover:opacity-100 transition-opacity z-10 cursor-pointer"
            onClick={(e) => e.stopPropagation()} />
        )}

        {/* Row 1: Client name + timestamp */}
        <div className="flex justify-between items-start mb-1">
          <span className={cn("text-sm text-gray-900 leading-tight", isSelected || isUrgent ? "font-bold" : "font-medium")}>
            {draft.client_name || "Onbekend"}
          </span>
          <span className="text-[11px] font-medium text-gray-400 tabular-nums shrink-0 ml-2">
            {formatDate(draft.received_at)}
          </span>
        </div>

        {/* Row 2: Badge + order number + attachment count */}
        <div className="flex items-center gap-2 mb-1">
          <span className={cn("text-[10px] px-1.5 py-0.5 uppercase tracking-wider rounded-sm", typeBadge.cls)}>
            {typeBadge.label}
          </span>
          <span className={cn("text-xs font-mono", isUrgent ? "text-primary font-bold" : "text-gray-500 font-medium")}>
            #{draft.order_number}
          </span>
          {draft.source && draft.source !== "INTERN" && (
            <span className={cn(
              "text-[10px] px-1.5 py-0 border-0 rounded-full",
              ORDER_SOURCE_COLORS[draft.source as OrderSource] ?? "bg-gray-100 text-gray-600"
            )}>
              {ORDER_SOURCE_LABELS[draft.source as OrderSource] ?? draft.source}
            </span>
          )}
          {attachmentCount > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-gray-400 ml-auto">
              <Paperclip className="h-3 w-3" /> {attachmentCount}
            </span>
          )}
        </div>

        {/* Row 3: Subject */}
        <p className="text-xs font-semibold text-gray-900 truncate mb-1">
          {draft.source_email_subject || "Geen onderwerp"}
        </p>

        {/* Row 4: Preview */}
        <p className="text-[11px] text-gray-500 line-clamp-2 leading-relaxed">
          {draft.source_email_body?.slice(0, 140) || ""}
        </p>
      </button>
    </div>
  );
}

export const InboxListItem = React.memo(InboxListItemInner);
