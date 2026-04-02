import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { MapPin, AlertTriangle, Snowflake, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { type PlanOrder } from "./types";
import { getCity, getTotalWeight, hasTag } from "./planningUtils";

function getTimeWindow(order: PlanOrder): string {
  if (order.time_window_start && order.time_window_end) {
    return `${order.time_window_start} - ${order.time_window_end}`;
  }
  return "Geen tijdvenster";
}

/** Check if a time window span is less than 2 hours (tight). */
function isTightWindow(from: string, to: string): boolean {
  const [fh, fm] = from.split(":").map(Number);
  const [th, tm] = to.split(":").map(Number);
  const diffMinutes = (th * 60 + tm) - (fh * 60 + fm);
  return diffMinutes > 0 && diffMinutes < 120;
}

export function PlanningOrderCard({
  order,
  overlay,
  onHover,
  whyNotReason,
}: {
  order: PlanOrder;
  overlay?: boolean;
  onHover?: (orderId: string | null) => void;
  whyNotReason?: string | null;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: order.id,
    data: { type: "order", order },
  });

  const style = overlay
    ? undefined
    : { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.3 : 1 };

  const isIncomplete = !order.delivery_address || order.delivery_address === "Onbekend" || !order.weight_kg;

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      style={style}
      {...(overlay ? {} : { ...listeners, ...attributes })}
      onMouseEnter={() => onHover?.(order.id)}
      onMouseLeave={() => onHover?.(null)}
      className={cn(
        "rounded-xl border bg-card p-3 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-all duration-150 group/card",
        overlay && "shadow-xl ring-2 ring-primary/30 rotate-1 scale-105",
        isIncomplete ? "border-destructive/40 bg-destructive/[0.02]" : "border-border/40"
      )}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-mono text-muted-foreground/60 font-medium">#{order.order_number}</span>
        <div className="flex gap-1">
          {isIncomplete && (
            <span className="inline-flex items-center gap-0.5 text-xs font-semibold uppercase tracking-wide bg-destructive/10 text-destructive border border-destructive/20 rounded-md px-1.5 py-0.5">
              <AlertTriangle className="h-2.5 w-2.5" />INCOMPLEET
            </span>
          )}
          {hasTag(order, "ADR") && (
            <span className="inline-flex items-center gap-0.5 text-xs font-semibold uppercase tracking-wide bg-amber-500/10 text-amber-700 border border-amber-200/60 rounded-md px-1.5 py-0.5">
              <AlertTriangle className="h-2.5 w-2.5" />ADR
            </span>
          )}
          {hasTag(order, "KOELING") && (
            <span className="inline-flex items-center gap-0.5 text-xs font-semibold uppercase tracking-wide bg-blue-500/10 text-blue-700 border border-blue-200/60 rounded-md px-1.5 py-0.5">
              <Snowflake className="h-2.5 w-2.5" />KOEL
            </span>
          )}
        </div>
      </div>
      <p className="text-sm font-medium truncate text-foreground">{order.client_name || "Onbekend"}</p>
      <p className={cn("text-xs truncate mt-0.5 flex items-center gap-1", !order.delivery_address ? "text-destructive" : "text-muted-foreground/60")}>
        <MapPin className="h-2.5 w-2.5 shrink-0" />
        {order.delivery_address ? getCity(order.delivery_address) : "Adres ontbreekt"}
      </p>
      {order.pickup_time_from && order.pickup_time_to && (
        <p className={cn("text-xs mt-0.5", isTightWindow(order.pickup_time_from, order.pickup_time_to) ? "text-amber-600" : "text-gray-500")}>
          ⏰ {order.pickup_time_from}-{order.pickup_time_to}
        </p>
      )}
      {order.delivery_time_from && order.delivery_time_to && (
        <p className={cn("text-xs mt-0.5", isTightWindow(order.delivery_time_from, order.delivery_time_to) ? "text-amber-600" : "text-gray-500")}>
          ⏰ {order.delivery_time_from}-{order.delivery_time_to}
        </p>
      )}
      <div className="flex items-center gap-3 mt-2.5 pt-2 border-t border-border/30 text-xs text-muted-foreground">
        <span className="tabular-nums">{order.quantity ?? "?"} plt</span>
        <span className={cn("font-semibold tabular-nums", !order.weight_kg ? "text-destructive" : "text-foreground")}>{order.weight_kg ? `${getTotalWeight(order)} kg` : "? kg"}</span>
        <span className="flex items-center gap-0.5 ml-auto text-muted-foreground/60">
          <Clock className="h-2.5 w-2.5" />
          {getTimeWindow(order)}
        </span>
      </div>
      {whyNotReason && (
        <p className="text-xs text-amber-600 mt-1.5 leading-snug">{whyNotReason}</p>
      )}
    </div>
  );
}
