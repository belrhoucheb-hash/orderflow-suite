import { useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useConsolidationGroups, useMoveOrderBetweenGroups, useUpdateConsolidationGroup } from "@/hooks/useConsolidation";
import { ConsolidationCard } from "./ConsolidationCard";
import { useToast } from "@/hooks/use-toast";
import type { ConsolidationOrder } from "@/types/consolidation";
import { GripVertical } from "lucide-react";

interface Props {
  plannedDate: string;
}

function DraggableOrderItem({ co }: { co: ConsolidationOrder }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: co.id,
    data: { groupId: co.group_id },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 bg-white border rounded px-2 py-1 text-xs" {...attributes} {...listeners}>
      <GripVertical className="h-3 w-3 text-muted-foreground cursor-grab" />
      <span className="font-medium">#{co.order?.order_number}</span>
      <span className="text-muted-foreground">{co.order?.client_name}</span>
    </div>
  );
}

export function ConsolidationBoard({ plannedDate }: Props) {
  const { data: groups = [], isLoading } = useConsolidationGroups(plannedDate);
  const moveOrder = useMoveOrderBetweenGroups();
  const updateGroup = useUpdateConsolidationGroup();
  const { toast } = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const fromGroupId = (active.data.current as any)?.groupId;
    const toGroupId = (over.data.current as any)?.groupId ?? over.id;

    if (fromGroupId && toGroupId && fromGroupId !== toGroupId) {
      try {
        await moveOrder.mutateAsync({
          consolidationOrderId: String(active.id),
          fromGroupId,
          toGroupId: String(toGroupId),
          newSequence: 999, // append at end
        });
        toast({ title: "Order verplaatst" });
      } catch (e: any) {
        toast({ title: "Fout bij verplaatsen", description: e.message, variant: "destructive" });
      }
    }
  }, [moveOrder, toast]);

  const handleApprove = async (groupId: string) => {
    try {
      await updateGroup.mutateAsync({ id: groupId, status: "GOEDGEKEURD" });
      toast({ title: "Groep goedgekeurd" });
    } catch (e: any) {
      toast({ title: "Fout", description: e.message, variant: "destructive" });
    }
  };

  const handleReject = async (groupId: string) => {
    try {
      await updateGroup.mutateAsync({ id: groupId, status: "VERWORPEN" });
      toast({ title: "Groep verworpen" });
    } catch (e: any) {
      toast({ title: "Fout", description: e.message, variant: "destructive" });
    }
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Groepen laden...</p>;
  if (groups.length === 0) return <p className="text-sm text-muted-foreground">Geen consolidatiegroepen voor deze datum.</p>;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {groups.map((group) => (
          <div key={group.id} className="space-y-2">
            <ConsolidationCard group={group} onApprove={handleApprove} onReject={handleReject} />
            <SortableContext items={(group.orders || []).map((co) => co.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-1 px-2">
                {(group.orders || []).map((co) => (
                  <DraggableOrderItem key={co.id} co={co} />
                ))}
              </div>
            </SortableContext>
          </div>
        ))}
      </div>
    </DndContext>
  );
}
