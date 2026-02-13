import { useState, useMemo, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  DragStartEvent,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fleetVehicles, type FleetVehicle } from "@/data/fleetData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  Truck,
  Search,
  Package,
  Snowflake,
  AlertTriangle,
  CheckCircle2,
  X,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────
interface PlanOrder {
  id: string;
  order_number: number;
  client_name: string | null;
  delivery_address: string | null;
  quantity: number | null;
  weight_kg: number | null;
  requirements: string[] | null;
  is_weight_per_unit: boolean;
}

type Assignments = Record<string, PlanOrder[]>; // vehicleId -> orders

// ─── Helpers ─────────────────────────────────────────────────────────
function getTotalWeight(order: PlanOrder) {
  if (!order.weight_kg) return 0;
  if (order.is_weight_per_unit && order.quantity) return order.weight_kg * order.quantity;
  return order.weight_kg;
}

function getCity(address: string | null) {
  if (!address) return "—";
  const parts = address.split(",").map((s) => s.trim());
  return parts[parts.length - 1] || "—";
}

function hasTag(order: PlanOrder, tag: string) {
  return order.requirements?.some((r) => r.toUpperCase().includes(tag)) ?? false;
}

function capacityColor(pct: number) {
  if (pct > 100) return "bg-destructive";
  if (pct > 90) return "text-amber-600";
  return "";
}

// ─── Draggable Order Card ────────────────────────────────────────────
function DraggableOrder({ order, overlay }: { order: PlanOrder; overlay?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: order.id,
    data: order,
  });

  const style = overlay
    ? undefined
    : { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.3 : 1 };

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      style={style}
      {...(overlay ? {} : { ...listeners, ...attributes })}
      className={cn(
        "rounded-lg border bg-card p-3 cursor-grab active:cursor-grabbing shadow-sm hover:shadow transition-shadow",
        overlay && "shadow-lg ring-2 ring-primary/30 rotate-2"
      )}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-mono text-muted-foreground">#{order.order_number}</span>
        <div className="flex gap-1">
          {hasTag(order, "ADR") && (
            <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 border-amber-200 px-1.5 py-0">
              <AlertTriangle className="h-3 w-3 mr-0.5" />ADR
            </Badge>
          )}
          {hasTag(order, "KOELING") && (
            <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-700 border-blue-200 px-1.5 py-0">
              <Snowflake className="h-3 w-3 mr-0.5" />KOEL
            </Badge>
          )}
        </div>
      </div>
      <p className="text-sm font-medium truncate">{order.client_name || "Onbekend"}</p>
      <p className="text-xs text-muted-foreground truncate">{getCity(order.delivery_address)}</p>
      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
        <span>{order.quantity ?? "?"} pallet(s)</span>
        <span className="font-medium text-foreground">{getTotalWeight(order)} kg</span>
      </div>
    </div>
  );
}

// ─── Droppable Vehicle Card ──────────────────────────────────────────
function VehicleDropZone({
  vehicle,
  assigned,
  onRemove,
  rejected,
}: {
  vehicle: FleetVehicle;
  assigned: PlanOrder[];
  onRemove: (orderId: string) => void;
  rejected: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: vehicle.id });

  const totalKg = assigned.reduce((s, o) => s + getTotalWeight(o), 0);
  const totalPallets = assigned.reduce((s, o) => s + (o.quantity ?? 0), 0);
  const pctKg = (totalKg / vehicle.capacityKg) * 100;
  const pctPallets = (totalPallets / vehicle.capacityPallets) * 100;

  return (
    <Card
      ref={setNodeRef}
      className={cn(
        "transition-all duration-200 min-h-[220px]",
        isOver && !rejected && "ring-2 ring-primary/40 bg-primary/5 scale-[1.01]",
        rejected && "animate-[shake_0.4s_ease-in-out] ring-2 ring-destructive/60 bg-destructive/5"
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <Truck className="h-4 w-4 text-muted-foreground" />
            {vehicle.name}
          </CardTitle>
          <Badge variant="secondary" className="text-[10px]">{vehicle.type}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">{vehicle.plate}
          {vehicle.features.length > 0 && (
            <> · {vehicle.features.join(", ")}</>
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Capacity meters */}
        <div className="space-y-2">
          <div>
            <div className="flex justify-between text-[11px] mb-0.5">
              <span className={cn("text-muted-foreground", capacityColor(pctKg))}>Gewicht</span>
              <span className={cn("font-medium", pctKg > 100 && "text-destructive")}>{totalKg} / {vehicle.capacityKg} kg</span>
            </div>
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-300",
                  pctKg > 100 ? "bg-destructive" : pctKg > 90 ? "bg-amber-500" : "bg-emerald-500"
                )}
                style={{ width: `${Math.min(pctKg, 100)}%` }}
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-[11px] mb-0.5">
              <span className={cn("text-muted-foreground", capacityColor(pctPallets))}>Pallets</span>
              <span className={cn("font-medium", pctPallets > 100 && "text-destructive")}>{totalPallets} / {vehicle.capacityPallets}</span>
            </div>
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-300",
                  pctPallets > 100 ? "bg-destructive" : pctPallets > 90 ? "bg-amber-500" : "bg-emerald-500"
                )}
                style={{ width: `${Math.min(pctPallets, 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Assigned orders */}
        {assigned.length === 0 ? (
          <div className="flex items-center justify-center h-16 border-2 border-dashed border-border/60 rounded-lg">
            <p className="text-xs text-muted-foreground italic">Sleep orders hierheen</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {assigned.map((o) => (
              <div
                key={o.id}
                className="flex items-center justify-between p-2 rounded-md bg-muted/40 text-xs group"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Package className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="font-medium truncate">#{o.order_number}</span>
                  <span className="text-muted-foreground truncate">{o.client_name}</span>
                </div>
                <button
                  onClick={() => onRemove(o.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-destructive/10"
                >
                  <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────
const Planning = () => {
  const { toast } = useToast();
  const [assignments, setAssignments] = useState<Assignments>({});
  const [search, setSearch] = useState("");
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [activeOrder, setActiveOrder] = useState<PlanOrder | null>(null);
  const [rejectedVehicle, setRejectedVehicle] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Fetch open orders from DB
  const { data: orders = [], refetch } = useQuery({
    queryKey: ["planning-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, client_name, delivery_address, quantity, weight_kg, requirements, is_weight_per_unit")
        .in("status", ["DRAFT", "OPEN"])
        .is("vehicle_id", null)
        .order("order_number", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PlanOrder[];
    },
  });

  // Assigned order ids flat set
  const assignedIds = useMemo(() => {
    const ids = new Set<string>();
    Object.values(assignments).forEach((arr) => arr.forEach((o) => ids.add(o.id)));
    return ids;
  }, [assignments]);

  // Filtered unassigned
  const unassigned = useMemo(() => {
    return orders
      .filter((o) => !assignedIds.has(o.id))
      .filter((o) => {
        if (search) {
          const q = search.toLowerCase();
          if (
            !o.client_name?.toLowerCase().includes(q) &&
            !o.delivery_address?.toLowerCase().includes(q) &&
            !String(o.order_number).includes(q)
          )
            return false;
        }
        if (filterTag && !hasTag(o, filterTag)) return false;
        return true;
      });
  }, [orders, assignedIds, search, filterTag]);

  // Validate drop
  const validateDrop = useCallback(
    (order: PlanOrder, vehicle: FleetVehicle): string | null => {
      if (hasTag(order, "KOELING") && !vehicle.features.includes("KOELING")) {
        return `${vehicle.name} heeft geen koeling – niet geschikt voor koelorders.`;
      }
      if (hasTag(order, "ADR") && !vehicle.features.includes("ADR")) {
        return `${vehicle.name} heeft geen ADR-uitrusting – niet geschikt voor ADR-orders.`;
      }
      return null;
    },
    []
  );

  const handleDragStart = (event: DragStartEvent) => {
    const order = orders.find((o) => o.id === event.active.id);
    if (order) setActiveOrder(order);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveOrder(null);
    setRejectedVehicle(null);

    const { active, over } = event;
    if (!over) return;

    const order = orders.find((o) => o.id === active.id);
    const vehicle = fleetVehicles.find((v) => v.id === over.id);
    if (!order || !vehicle) return;

    const error = validateDrop(order, vehicle);
    if (error) {
      setRejectedVehicle(vehicle.id);
      setTimeout(() => setRejectedVehicle(null), 600);
      toast({ title: "Niet toegestaan", description: error, variant: "destructive" });
      return;
    }

    setAssignments((prev) => {
      // Remove from any previous vehicle
      const next = { ...prev };
      for (const vId of Object.keys(next)) {
        next[vId] = next[vId].filter((o) => o.id !== order.id);
      }
      next[vehicle.id] = [...(next[vehicle.id] ?? []), order];
      return next;
    });
  };

  const handleRemove = (orderId: string) => {
    setAssignments((prev) => {
      const next = { ...prev };
      for (const vId of Object.keys(next)) {
        next[vId] = next[vId].filter((o) => o.id !== orderId);
      }
      return next;
    });
  };

  const totalAssigned = Object.values(assignments).reduce((s, a) => s + a.length, 0);

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      for (const [vehicleId, vehicleOrders] of Object.entries(assignments)) {
        if (vehicleOrders.length === 0) continue;
        const vehicle = fleetVehicles.find((v) => v.id === vehicleId);
        for (const order of vehicleOrders) {
          const { error } = await supabase
            .from("orders")
            .update({ vehicle_id: vehicle?.name ?? vehicleId, status: "PLANNED" })
            .eq("id", order.id);
          if (error) throw error;
        }
      }
      toast({ title: "Planning bevestigd", description: `${totalAssigned} order(s) ingepland.` });
      setAssignments({});
      refetch();
    } catch {
      toast({ title: "Fout", description: "Kon planning niet opslaan.", variant: "destructive" });
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex flex-col h-[calc(100vh-5rem)] gap-4">
        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <div>
            <h1 className="font-display text-2xl font-bold flex items-center gap-2">
              <Truck className="h-6 w-6 text-primary" />Smart Planning
            </h1>
            <p className="text-sm text-muted-foreground">Sleep orders naar voertuigen om te plannen</p>
          </div>
          {totalAssigned > 0 && (
            <Button onClick={handleConfirm} disabled={isConfirming} className="gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Planning Bevestigen ({totalAssigned})
            </Button>
          )}
        </div>

        {/* Split screen */}
        <div className="flex gap-4 flex-1 min-h-0">
          {/* Left: Order list */}
          <div className="w-1/4 min-w-[260px] flex flex-col gap-3 shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Zoek order..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
            <div className="flex gap-1.5">
              {["ADR", "KOELING"].map((tag) => (
                <Button
                  key={tag}
                  variant={filterTag === tag ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => setFilterTag(filterTag === tag ? null : tag)}
                >
                  <Filter className="h-3 w-3" />{tag}
                </Button>
              ))}
              {filterTag && (
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setFilterTag(null)}>
                  Reset
                </Button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {unassigned.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground text-sm">
                  <Package className="h-8 w-8 mb-2 opacity-40" />
                  <p>Geen openstaande orders</p>
                </div>
              ) : (
                unassigned.map((order) => (
                  <DraggableOrder key={order.id} order={order} />
                ))
              )}
            </div>

            <div className="text-xs text-muted-foreground pt-1 border-t">
              {unassigned.length} beschikbaar · {totalAssigned} toegewezen
            </div>
          </div>

          {/* Right: Fleet grid */}
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {fleetVehicles.map((vehicle) => (
                <VehicleDropZone
                  key={vehicle.id}
                  vehicle={vehicle}
                  assigned={assignments[vehicle.id] ?? []}
                  onRemove={handleRemove}
                  rejected={rejectedVehicle === vehicle.id}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {activeOrder ? <DraggableOrder order={activeOrder} overlay /> : null}
      </DragOverlay>

      {/* Shake animation */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
      `}</style>
    </DndContext>
  );
};

export default Planning;
