import { MapPin, Package, Scale, Timer, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConsolidationGroup } from "@/types/consolidation";

interface ClusterProposalCardProps {
  group: ConsolidationGroup;
  onSelect?: (groupId: string) => void;
  onReturn?: (groupId: string) => void;
}

function statusStyling(group: ConsolidationGroup) {
  if (group.status === "VOORSTEL") {
    return {
      label: group.proposal_source === "auto" ? "Auto-voorstel" : "Voorstel",
      statusClass: "badge-status badge-status--luxe badge-status--pending",
      borderStyle: "border-style: dashed;",
      dashed: true,
    };
  }
  if (group.status === "GOEDGEKEURD") {
    return {
      label: "Goedgekeurd",
      statusClass: "badge-status badge-status--luxe badge-status--planned",
      dashed: false,
    };
  }
  if (group.status === "INGEPLAND") {
    return {
      label: "Ingepland",
      statusClass: "badge-status badge-status--luxe badge-status--in-transit",
      dashed: false,
    };
  }
  return {
    label: "Verworpen",
    statusClass: "badge-status badge-status--luxe badge-status--cancelled",
    dashed: false,
  };
}

function utilizationBarClass(pct: number | null): string {
  if (pct === null) return "bg-muted";
  if (pct >= 95) return "bg-red-500";
  if (pct >= 80) return "bg-amber-500";
  return "bg-[hsl(var(--gold))]";
}

export function ClusterProposalCard({ group, onSelect, onReturn }: ClusterProposalCardProps) {
  const styling = statusStyling(group);
  const orderCount = group.consolidation_orders?.length ?? group.orders?.length ?? 0;
  const util = group.utilization_pct;
  const vehicle = group.vehicle as any;
  const vehicleLabel = vehicle
    ? vehicle.plate || vehicle.name || "Voertuig"
    : group.vehicle_id
      ? "Voertuig gekoppeld"
      : "Voertuig kiezen";

  return (
    <div
      draggable={group.status === "VOORSTEL"}
      onDragStart={(event) => {
        if (group.status !== "VOORSTEL") return;
        event.dataTransfer.setData("application/x-consolidation-group-id", group.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      className={cn(
        "card--luxe p-4 space-y-3 transition-all hover:-translate-y-0.5 w-full text-left cursor-pointer",
        group.status === "VOORSTEL" && "active:cursor-grabbing",
        styling.dashed && "border-dashed",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={styling.statusClass}>
              <span className="badge-status__dot" />
              {styling.label}
            </span>
            {group.capacity_override_reason && (
              <span className="chiplet chiplet--warn">Override</span>
            )}
          </div>
          <h4 className="font-semibold mt-1.5 truncate font-[var(--font-display)]">{group.name}</h4>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">Beladingsgraad</div>
          <div
            className={cn(
              "text-xl font-semibold font-[var(--font-display)]",
              util !== null && util >= 95 && "text-red-600",
              util !== null && util >= 80 && util < 95 && "text-amber-700",
              util !== null && util < 80 && "text-[hsl(var(--gold-deep))]",
            )}
          >
            {util !== null ? `${util.toFixed(0)}%` : "Nog niet bekend"}
          </div>
        </div>
      </div>

      <div className="h-1.5 rounded-full bg-[hsl(var(--gold-soft)/0.5)] overflow-hidden">
        <div
          className={cn("h-full transition-all", utilizationBarClass(util))}
          style={{ width: `${Math.min(util ?? 0, 100)}%` }}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Truck className="h-3.5 w-3.5 text-[hsl(var(--gold-deep))]" />
          <span className="truncate">{vehicleLabel}</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Package className="h-3.5 w-3.5 text-[hsl(var(--gold-deep))]" />
          <span>{orderCount} orders</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Scale className="h-3.5 w-3.5 text-[hsl(var(--gold-deep))]" />
          <span>{group.total_weight_kg ?? 0} kg</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 text-[hsl(var(--gold-deep))]" />
          <span>{group.total_pallets ?? 0} pallets</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Timer className="h-3.5 w-3.5 text-[hsl(var(--gold-deep))]" />
          <span>{group.estimated_duration_min ? `${Math.round(group.estimated_duration_min / 60)} u` : "-"}</span>
        </div>
      </div>

      {group.status === "VOORSTEL" && (
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <button
            type="button"
            onClick={() => onSelect?.(group.id)}
            className="btn-luxe !h-8 px-3 text-xs"
          >
            Details
          </button>
          {onReturn && (
            <button
              type="button"
              onClick={() => onReturn(group.id)}
              className="btn-luxe !h-8 px-3 text-xs"
            >
              Zet terug
            </button>
          )}
          <span className="text-xs text-[hsl(var(--gold-deep))] font-medium">
            Of sleep terug naar Open te plannen
          </span>
        </div>
      )}
      {group.status !== "VOORSTEL" && (
        <button
          type="button"
          onClick={() => onSelect?.(group.id)}
          className="btn-luxe !h-8 px-3 text-xs"
        >
          Details
        </button>
      )}
    </div>
  );
}
