import React from "react";
import { useDroppable } from "@dnd-kit/core";
import { Package, MapPin, Search, Filter, Route } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type PlanOrder, type Assignments } from "./types";
import { findCombinableGroups, getUnassignedReason } from "./planningUtils";
import { PlanningOrderCard } from "./PlanningOrderCard";
import { type FleetVehicle } from "@/hooks/useVehicles";

export function PlanningUnassignedSidebar({
  orders,
  assignedIds,
  groupedUnassigned,
  search,
  onSearchChange,
  filterTag,
  onFilterTagChange,
  onInjectTest,
  onCombineTrips,
  onAutoPlan,
  onHoverOrder,
  fleetVehicles,
  assignments,
  totalUnassigned,
  totalAssigned,
  testOrdersLoaded,
}: {
  orders: PlanOrder[];
  assignedIds: Set<string>;
  groupedUnassigned: { region: string; label: string; orders: PlanOrder[] }[];
  search: string;
  onSearchChange: (val: string) => void;
  filterTag: string | null;
  onFilterTagChange: (tag: string | null) => void;
  onInjectTest: () => void;
  onCombineTrips: () => void;
  onAutoPlan: () => void;
  onHoverOrder: (id: string | null) => void;
  fleetVehicles: FleetVehicle[];
  assignments: Assignments;
  totalUnassigned: number;
  totalAssigned: number;
  testOrdersLoaded: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: "unassigned" });

  const combineGroups = findCombinableGroups(orders, assignedIds);

  return (
    <div className="w-full lg:w-1/4 lg:min-w-[260px] flex flex-col gap-3 shrink-0 max-h-[40vh] lg:max-h-none bg-card rounded-xl border border-border/40 p-3 shadow-sm">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
        <Input
          placeholder="Zoek order..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 h-9 text-sm rounded-lg border-border/40"
        />
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {["ADR", "KOELING"].map((tag) => (
          <Button
            key={tag}
            variant={filterTag === tag ? "default" : "outline"}
            size="sm"
            className="h-7 text-[11px] gap-1 rounded-lg"
            onClick={() => onFilterTagChange(filterTag === tag ? null : tag)}
          >
            <Filter className="h-3 w-3" />{tag}
          </Button>
        ))}
        {filterTag && (
          <Button variant="ghost" size="sm" className="h-7 text-[11px] rounded-lg" onClick={() => onFilterTagChange(null)}>
            Reset
          </Button>
        )}
        <div className="flex gap-1.5 ml-auto">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px] gap-1 rounded-lg"
            onClick={onInjectTest}
            disabled={testOrdersLoaded}
          >
            🧪 Test
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px] gap-1 rounded-lg"
            onClick={onCombineTrips}
            disabled={Object.values(assignments).filter((a) => a.length > 0).length < 2}
          >
            🔗 Combineer
          </Button>
          <Button
            size="sm"
            className="h-7 text-[11px] gap-1 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg"
            onClick={onAutoPlan}
            disabled={totalUnassigned === 0}
          >
            ⚡ Auto-Plan
          </Button>
        </div>
      </div>

      {combineGroups.length > 0 && (
        <div className="space-y-1.5 mb-2">
          {combineGroups.slice(0, 2).map(g => (
            <div key={g.key} className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-[10px]">
              <div className="flex items-center gap-1.5 text-primary font-semibold">
                <Route className="h-3 w-3" />
                Combineerbaar
              </div>
              <p className="text-muted-foreground mt-0.5">{g.savings}</p>
            </div>
          ))}
        </div>
      )}

      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 overflow-y-auto space-y-1 pr-1 rounded-lg transition-colors duration-200",
          isOver && "ring-2 ring-primary/40 bg-primary/5"
        )}
      >
        {groupedUnassigned.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground text-sm">
            <Package className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-[11px]">Geen openstaande orders</p>
          </div>
        ) : (
          groupedUnassigned.map((group) => (
            <div key={group.region}>
              <div className="sticky top-0 bg-card/95 backdrop-blur-sm z-10 py-1.5 px-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 flex items-center gap-1.5">
                  <MapPin className="h-2.5 w-2.5" />
                  {group.label}
                  <span className="text-[9px] bg-muted rounded-md px-1.5 py-0.5 ml-auto tabular-nums font-medium">
                    {group.orders.length}
                  </span>
                </p>
              </div>
              <div className="space-y-1.5 mb-2">
                {group.orders.map((order) => (
                  <PlanningOrderCard 
                    key={order.id} 
                    order={order} 
                    onHover={onHoverOrder} 
                    whyNotReason={getUnassignedReason(order, fleetVehicles, assignments)} 
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="text-[11px] text-muted-foreground/60 pt-2 border-t border-border/30 tabular-nums space-y-0.5">
        <div>{totalUnassigned} beschikbaar · {totalAssigned} ingepland</div>
        <div>{(() => {
          const withSpace = fleetVehicles.filter(v => {
            const a = assignments[v.id] ?? [];
            const kg = a.reduce((s, o) => s + (o.weight_kg ?? 0), 0); // Simplified for calculation
            return kg < v.capacityKg * 0.95;
          }).length;
          return `${withSpace} van ${fleetVehicles.length} voertuigen hebben ruimte`;
        })()}</div>
      </div>
    </div>
  );
}
