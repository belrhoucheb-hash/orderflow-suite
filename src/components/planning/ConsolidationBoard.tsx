import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useConsolidationGroups,
  useMoveOrderBetweenGroups,
  useUpdateConsolidationGroup,
} from "@/hooks/useConsolidation";
import { ConsolidationCard } from "./ConsolidationCard";
import type { ConsolidationOrder } from "@/types/consolidation";

// ─── Draggable order item inside a group ─────────────────────

interface DraggableOrderItemProps {
  consolidationOrder: ConsolidationOrder;
}

function DraggableOrderItem({ consolidationOrder }: DraggableOrderItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: consolidationOrder.id,
    data: { consolidationOrder },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={cn(
        "flex items-center gap-2 rounded-lg border border-border/30 bg-card px-2.5 py-1.5 text-xs cursor-grab select-none",
        isDragging && "shadow-md",
      )}
    >
      <div {...listeners} className="cursor-grab text-muted-foreground">
        <GripVertical className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <span className="font-medium truncate block">
          {consolidationOrder.order?.client_name ?? `Order #${consolidationOrder.order?.order_number}`}
        </span>
        {consolidationOrder.order?.delivery_address && (
          <span className="flex items-center gap-0.5 text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{consolidationOrder.order.delivery_address}</span>
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Ghost item for drag overlay ─────────────────────────────

function OrderDragGhost({ consolidationOrder }: DraggableOrderItemProps) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-primary/40 bg-card shadow-lg px-2.5 py-1.5 text-xs cursor-grabbing">
      <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="font-medium">
        {consolidationOrder.order?.client_name ?? `Order #${consolidationOrder.order?.order_number}`}
      </span>
    </div>
  );
}

// ─── ConsolidationBoard ───────────────────────────────────────

interface ConsolidationBoardProps {
  plannedDate: string;
}

export function ConsolidationBoard({ plannedDate }: ConsolidationBoardProps) {
  const { data: groups = [], isLoading } = useConsolidationGroups(plannedDate);
  const moveOrder = useMoveOrderBetweenGroups();
  const updateGroup = useUpdateConsolidationGroup();

  const [activeConsolidationOrder, setActiveConsolidationOrder] = useState<ConsolidationOrder | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  function handleDragStart(event: DragStartEvent) {
    const co = event.active.data.current?.consolidationOrder as ConsolidationOrder | undefined;
    setActiveConsolidationOrder(co ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveConsolidationOrder(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeConsolidationOrderId = active.id as string;
    const co = active.data.current?.consolidationOrder as ConsolidationOrder | undefined;
    if (!co) return;

    const fromGroupId = co.group_id;

    // Determine the target group: over could be a group id or another consolidation order id
    let toGroupId: string | null = null;
    for (const g of groups) {
      if (g.id === over.id) {
        toGroupId = g.id;
        break;
      }
      if (g.orders?.some((o) => o.id === over.id)) {
        toGroupId = g.id;
        break;
      }
    }

    if (!toGroupId || toGroupId === fromGroupId) return;

    const targetGroup = groups.find((g) => g.id === toGroupId);
    const newSequence = (targetGroup?.orders?.length ?? 0) + 1;

    moveOrder.mutate({ consolidationOrderId: activeConsolidationOrderId, fromGroupId, toGroupId, newSequence });
  }

  function handleApprove(id: string) {
    updateGroup.mutate({ id, status: "GOEDGEKEURD" });
  }

  function handleReject(id: string) {
    updateGroup.mutate({ id, status: "VERWORPEN" });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
        Groepen laden…
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground border-2 border-dashed rounded-xl">
        Geen consolidatiegroepen voor {plannedDate}
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {groups.map((group) => {
          const orderIds = (group.orders ?? []).map((co) => co.id);
          return (
            <div key={group.id} className="flex flex-col gap-2">
              <ConsolidationCard
                group={{
                  ...group,
                  // Replace orders with non-draggable version — the draggable items are rendered separately below
                  orders: [],
                }}
                onApprove={handleApprove}
                onReject={handleReject}
              />
              {/* Draggable order list */}
              <SortableContext items={orderIds} strategy={verticalListSortingStrategy}>
                <div className="space-y-1 px-1">
                  {(group.orders ?? []).map((co) => (
                    <DraggableOrderItem key={co.id} consolidationOrder={co} />
                  ))}
                </div>
              </SortableContext>
            </div>
          );
        })}
      </div>

      <DragOverlay>
        {activeConsolidationOrder ? <OrderDragGhost consolidationOrder={activeConsolidationOrder} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
