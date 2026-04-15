import { PlusCircle, RotateCw, Ban, CheckCircle2, HelpCircle } from "lucide-react";
import type { OrderDraft } from "./types";
import { formatDate } from "./utils";
import { cn } from "@/lib/utils";

interface Props {
  draft: OrderDraft;
  isSelected: boolean;
  isBulkChecked?: boolean;
  onBulkToggle?: (id: string) => void;
  onClick: () => void;
  bulkMode?: boolean;
}

const TYPE_META: Record<string, { label: string; Icon: any; stripe: string }> = {
  new: { label: "Nieuwe aanvraag", Icon: PlusCircle, stripe: "hsl(var(--border))" },
  update: { label: "Update op eerder bericht", Icon: RotateCw, stripe: "hsl(var(--gold))" },
  cancellation: { label: "Annulering", Icon: Ban, stripe: "hsl(0 60% 50%)" },
  confirmation: { label: "Bevestiging", Icon: CheckCircle2, stripe: "hsl(142 50% 42%)" },
  question: { label: "Vraag", Icon: HelpCircle, stripe: "hsl(210 50% 55%)" },
};

export function InboxListItem({ draft, isSelected, isBulkChecked, onBulkToggle, onClick, bulkMode }: Props) {
  const threadType = draft.thread_type || "new";
  const meta = TYPE_META[threadType] || TYPE_META.new;
  const { Icon, label, stripe } = meta;
  const isUnread = !draft.confidence_score;
  const isCancel = threadType === "cancellation";

  return (
    <div
      className={cn(
        "relative w-full text-left cursor-pointer group transition-colors",
        "border-b",
        isSelected
          ? "bg-[hsl(var(--gold-soft)/0.45)]"
          : bulkMode && isBulkChecked
            ? "bg-[hsl(var(--muted)/0.55)]"
            : "hover:bg-[hsl(var(--muted)/0.35)]",
      )}
      style={{
        paddingLeft: bulkMode ? 56 : 36,
        paddingRight: 14,
        paddingTop: 11,
        paddingBottom: 11,
        borderBottomColor: "hsl(var(--border) / 0.35)",
      }}
      onClick={onClick}
    >
      {/* Left stripe */}
      <span
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          left: isSelected ? 0 : 4,
          top: isSelected ? 0 : 8,
          bottom: isSelected ? 0 : 8,
          width: isSelected ? 2 : 3,
          borderRadius: isSelected ? 0 : 2,
          background: isSelected ? "hsl(var(--gold))" : stripe,
        }}
      />

      {/* Type icon or bulk checkbox */}
      {bulkMode ? (
        <input
          type="checkbox"
          checked={isBulkChecked || false}
          onChange={(e) => {
            e.stopPropagation();
            onBulkToggle?.(draft.id);
          }}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "absolute appearance-none cursor-pointer rounded-[4px] border-[1.5px]",
            "focus:outline-none",
          )}
          style={{
            left: 14,
            top: "50%",
            width: 16,
            height: 16,
            transform: "translateY(-50%)",
            borderColor: isBulkChecked ? "hsl(var(--gold-deep))" : "hsl(var(--border))",
            background: isBulkChecked
              ? "linear-gradient(180deg, hsl(var(--gold)), hsl(var(--gold-deep)))"
              : "hsl(var(--card))",
            backgroundImage: isBulkChecked
              ? `linear-gradient(180deg, hsl(var(--gold)), hsl(var(--gold-deep))), url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'><path d='M2 5l2 2 4-4' fill='none' stroke='white' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/></svg>")`
              : undefined,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "center",
          }}
        />
      ) : (
        <span
          title={label}
          aria-label={label}
          className={cn(
            "absolute grid place-items-center pointer-events-none",
            isSelected ? "text-[hsl(var(--gold-deep))]" : "text-muted-foreground/50",
          )}
          style={{ left: 14, top: 14, width: 14, height: 14 }}
        >
          <Icon
            className={cn("h-[12px] w-[12px]", isCancel && !isSelected && "text-[hsl(0_60%_50%)]/70")}
            strokeWidth={1.75}
          />
        </span>
      )}

      {/* Row 1: from + time */}
      <div className="flex items-center gap-2 mb-[2px]">
        <span
          className={cn(
            "flex-1 min-w-0 truncate text-[13px]",
            isUnread ? "font-semibold text-foreground" : "font-medium text-foreground/90",
          )}
          style={{ fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.005em" }}
        >
          {draft.client_name || draft.source_email_from || "Onbekend"}
        </span>
        {draft.confidence_score !== null && draft.confidence_score !== undefined && (
          <span
            className="shrink-0 text-[10px] font-semibold tabular-nums px-[7px] py-[1px] rounded-full"
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              color: "hsl(var(--gold-deep))",
              background: "hsl(var(--gold-soft))",
            }}
          >
            ORD-{draft.order_number}
          </span>
        )}
        <span
          className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
          style={{ fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "0.01em" }}
        >
          {formatDate(draft.received_at)}
        </span>
      </div>

      {/* Row 2: subject */}
      <p
        className={cn(
          "truncate leading-[1.4] text-[12.5px]",
          isUnread ? "text-foreground font-medium" : "text-muted-foreground",
        )}
      >
        {draft.source_email_subject || "Geen onderwerp"}
      </p>
    </div>
  );
}
