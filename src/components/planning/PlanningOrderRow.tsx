import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Package, AlertTriangle, X } from "lucide-react";
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
}: {
  order: PlanOrder;
  index: number;
  onRemove: (orderId: string) => void;
  onHover: (orderId: string | null) => void;
  vehicleColor: string;
  eta?: string;
  isLate?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: order.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onMouseEnter={() => onHover(order.id)}
      onMouseLeave={() => onHover(null)}
      className="flex items-center justify-between p-1.5 rounded bg-muted/40 text-xs group"
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-0.5 touch-none">
          <GripVertical className="h-3 w-3 text-muted-foreground" />
        </button>
        <span
          className="flex items-center justify-center h-4 w-4 rounded-full text-[10px] font-bold text-white shrink-0"
          style={{ background: vehicleColor }}
        >
          {index + 1}
        </span>
        <Package className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="font-medium">#{order.order_number}</span>
        <span className="text-muted-foreground truncate">{order.client_name}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {eta && (
          <span className={cn("text-[10px] font-mono flex items-center gap-0.5", isLate ? "text-destructive font-bold" : "text-muted-foreground")}>
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
