import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Package, AlertTriangle, Clock, X } from "lucide-react";
import { IncompleteBadge } from "@/components/orders/IncompleteBadge";
import { cn } from "@/lib/utils";
import { type PlanOrder } from "./types";

export function PlanningOrderRow({
  order,
  index,
  onRemove,
  onHover,
  vehicleColor,
  eta,
  isLate,
  waitMinutes,
}: {
  order: PlanOrder;
  index: number;
  onRemove: (orderId: string) => void;
  onHover: (orderId: string | null) => void;
  vehicleColor: string;
  eta?: string;
  isLate?: boolean;
  waitMinutes?: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: order.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const hasTimeWindow = order.time_window_start || order.time_window_end;
  const timeWindowLabel = hasTimeWindow
    ? `${order.time_window_start || "..."}-${order.time_window_end || "..."}`
    : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      onMouseEnter={() => onHover(order.id)}
      onMouseLeave={() => onHover(null)}
      className={cn(
        "flex items-center justify-between p-1.5 rounded bg-muted/40 text-xs group",
        isLate && "ring-1 ring-destructive/60 bg-destructive/[0.04]",
      )}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-0.5 touch-none">
          <GripVertical className="h-3 w-3 text-muted-foreground" />
        </button>
        <span
          className="flex items-center justify-center h-4 w-4 rounded-full text-xs font-bold text-white shrink-0"
          style={{ background: vehicleColor }}
        >
          {index + 1}
        </span>
        <Package className="h-3 w-3 text-muted-foreground shrink-0" />
        <IncompleteBadge order={order} size="dot" className="h-3.5 w-3.5 text-[9px]" />
        <span className="font-medium">#{order.order_number}</span>
        <span className="text-muted-foreground truncate">{order.client_name}</span>
        {timeWindowLabel && (
          <span className={cn(
            "inline-flex items-center gap-0.5 text-[10px] font-medium rounded px-1 py-0.5 shrink-0",
            isLate
              ? "bg-destructive/10 text-destructive border border-destructive/20"
              : "bg-blue-500/10 text-blue-700 border border-blue-200/60",
          )}>
            <Clock className="h-2.5 w-2.5" />
            {timeWindowLabel}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        {waitMinutes != null && waitMinutes > 0 && (
          <span className="text-[10px] font-mono text-amber-600 flex items-center gap-0.5">
            <Clock className="h-2.5 w-2.5" />
            +{waitMinutes}m wacht
          </span>
        )}
        {eta && (
          <span className={cn("text-xs font-mono flex items-center gap-0.5", isLate ? "text-destructive font-bold" : "text-muted-foreground")}>
            {isLate && <AlertTriangle className="h-3 w-3" />}
            ETA: {eta}
          </span>
        )}
        <button
          onClick={() => onRemove(order.id)}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-destructive/10"
        >
          <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
        </button>
      </div>
    </div>
  );
}
