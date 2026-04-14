import { AlertTriangle, Clock, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InfoStatus } from "@/hooks/useOrderInfoRequests";

interface Props {
  status: InfoStatus | string | null | undefined;
  /** Alleen icoon tonen, zonder tekst. */
  iconOnly?: boolean;
  className?: string;
  size?: "sm" | "default";
}

/**
 * Toont de info-tracking status naast de gewone status-badge.
 * COMPLETE → niks renderen (ruis), tenzij expliciet showComplete.
 */
export function InfoStatusBadge({ status, iconOnly, className, size = "default" }: Props) {
  if (!status || status === "COMPLETE") return null;

  const isOverdue = status === "OVERDUE";
  const Icon = isOverdue ? AlertTriangle : Clock;
  const label = isOverdue ? "Info verlopen" : "Info openstaand";

  return (
    <span
      title={label}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium",
        size === "sm" ? "text-[10px]" : "text-xs",
        isOverdue
          ? "border-red-300 bg-red-50 text-red-700"
          : "border-amber-300 bg-amber-50 text-amber-800",
        className,
      )}
    >
      <Icon className={cn(size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5")} />
      {!iconOnly && <span>{label}</span>}
    </span>
  );
}

export function InfoCompleteBadge({ className }: { className?: string }) {
  return (
    <span
      title="Dossier compleet"
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700",
        className,
      )}
    >
      <CheckCircle2 className="h-3.5 w-3.5" />
      Compleet
    </span>
  );
}
