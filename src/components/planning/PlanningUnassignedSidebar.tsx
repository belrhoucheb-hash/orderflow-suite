import React from "react";
import { useDroppable } from "@dnd-kit/core";
import { Package, MapPin, Search, Route, X } from "lucide-react";
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
  onCombineTrips,
  onAutoPlan,
  onClearPlanning,
  onHoverOrder,
  fleetVehicles,
  assignments,
  totalUnassigned,
  totalAssigned,
}: {
  orders: PlanOrder[];
  assignedIds: Set<string>;
  groupedUnassigned: { region: string; label: string; orders: PlanOrder[] }[];
  search: string;
  onSearchChange: (val: string) => void;
  filterTag: string | null;
  onFilterTagChange: (tag: string | null) => void;
  onCombineTrips: () => void;
  onAutoPlan: () => void;
  onClearPlanning: () => void;
  onHoverOrder: (id: string | null) => void;
  fleetVehicles: FleetVehicle[];
  assignments: Assignments;
  totalUnassigned: number;
  totalAssigned: number;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: "unassigned" });

  const combineGroups = findCombinableGroups(orders, assignedIds);

  return (
    <div className="w-full lg:w-1/4 lg:min-w-[260px] flex flex-col gap-3 shrink-0 max-h-[40vh] lg:max-h-none card--luxe p-3.5">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[hsl(var(--gold-deep))]/60" />
        <Input
          placeholder="Zoek order..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 h-9 text-sm rounded-xl border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--gold-soft)/0.08)]"
        />
      </div>
      {/* Filters */}
      <div className="flex gap-1.5 flex-wrap items-center">
        {["ADR", "KOELING"].map((tag) => (
          <button
            key={tag}
            onClick={() => onFilterTagChange(filterTag === tag ? null : tag)}
            className={cn(
              "h-6 px-2.5 rounded-md text-xs font-medium border transition-colors",
              filterTag === tag
                ? "bg-[hsl(var(--gold-deep))] text-white border-[hsl(var(--gold-deep))]"
                : "bg-transparent text-muted-foreground border-[hsl(var(--gold)/0.14)] hover:border-[hsl(var(--gold)/0.28)]"
            )}
          >
            {tag}
          </button>
        ))}
        {filterTag && (
          <button onClick={() => onFilterTagChange(null)} className="h-6 px-1.5 rounded-md text-muted-foreground hover:text-foreground">
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-1.5 flex-wrap items-center">
        <Button
          size="sm"
          className="h-7 text-xs rounded-xl bg-[hsl(var(--gold-deep))] hover:bg-[hsl(var(--gold-deep))]/90 text-white"
          onClick={onAutoPlan}
          disabled={totalUnassigned === 0}
        >
          Auto-plan
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs rounded-xl border-[hsl(var(--gold)/0.14)] bg-[hsl(var(--gold-soft)/0.08)] text-[hsl(var(--gold-deep))] hover:bg-[hsl(var(--gold-soft)/0.18)]" onClick={onCombineTrips}
          disabled={Object.values(assignments).filter((a) => a.length > 0).length < 2}>
          Combineer
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs rounded-xl text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={() => {
            if (window.confirm("Hele planning wissen? Dit kan niet ongedaan worden.")) {
              onClearPlanning();
            }
          }} disabled={totalAssigned === 0}>
          Wissen
        </Button>
      </div>

      {combineGroups.length > 0 && (
        <div className="space-y-1.5 mb-2">
          {combineGroups.slice(0, 2).map(g => (
            <div key={g.key} className="rounded-xl border border-[hsl(var(--gold)/0.16)] bg-[hsl(var(--gold-soft)/0.18)] px-3 py-2 text-xs">
              <div className="flex items-center gap-1.5 text-[hsl(var(--gold-deep))] font-semibold">
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
            <p className="text-xs">Geen openstaande orders</p>
          </div>
        ) : (
          groupedUnassigned.map((group) => (
            <div key={group.region}>
              <div className="sticky top-0 bg-card/95 backdrop-blur-sm z-10 py-1.5 px-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--gold-deep))]/70 flex items-center gap-1.5">
                  <MapPin className="h-2.5 w-2.5" />
                  {group.label}
                  <span className="text-xs bg-[hsl(var(--gold-soft)/0.18)] rounded-md px-1.5 py-0.5 ml-auto tabular-nums font-medium">
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

      <div className="text-xs text-muted-foreground/60 pt-2 border-t border-border/30 tabular-nums space-y-1">
        <div className="flex justify-between items-center">
          <span>{totalUnassigned} beschikbaar · {totalAssigned} ingepland</span>
        </div>
        <div>{(() => {
          const withSpace = fleetVehicles.filter(v => {
            const a = assignments[v.id] ?? [];
            const kg = a.reduce((s, o) => s + (o.weight_kg ?? 0), 0);
            return kg < v.capacityKg * 0.95;
          }).length;
          return `${withSpace} van ${fleetVehicles.length} voertuigen hebben ruimte`;
        })()}</div>
      </div>
    </div>
  );
}
