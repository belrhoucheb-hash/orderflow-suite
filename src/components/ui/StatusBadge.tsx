import { cn } from "@/lib/utils";

export type OrderStatus =
  | "DRAFT"
  | "PENDING"
  | "PLANNED"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "CANCELLED";

const STATUS_LABELS: Record<OrderStatus, string> = {
  DRAFT: "Nieuw",
  PENDING: "In behandeling",
  PLANNED: "Ingepland",
  IN_TRANSIT: "Onderweg",
  DELIVERED: "Afgeleverd",
  CANCELLED: "Geannuleerd",
};

const STATUS_CSS_CLASS: Record<OrderStatus, string> = {
  DRAFT: "badge-status--draft",
  PENDING: "badge-status--pending",
  PLANNED: "badge-status--planned",
  IN_TRANSIT: "badge-status--in-transit",
  DELIVERED: "badge-status--delivered",
  CANCELLED: "badge-status--cancelled",
};

interface StatusBadgeProps {
  status: OrderStatus;
  /** Override the default label text */
  label?: string;
  /** Additional className */
  className?: string;
  /** Hide the dot indicator */
  hideDot?: boolean;
  /** Render as a smaller variant */
  size?: "sm" | "default";
}

export function StatusBadge({
  status,
  label,
  className,
  hideDot = false,
  size = "default",
}: StatusBadgeProps) {
  const displayLabel = label ?? STATUS_LABELS[status] ?? status;

  return (
    <span
      className={cn(
        "badge-status",
        STATUS_CSS_CLASS[status],
        size === "sm" && "text-[11px] px-1.5 py-0",
        className,
      )}
    >
      {!hideDot && <span className="badge-status__dot" />}
      {displayLabel}
    </span>
  );
}
