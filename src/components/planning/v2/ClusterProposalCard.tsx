import { MapPin, Package, Scale, Timer, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ConsolidationGroup } from "@/types/consolidation";

interface ClusterProposalCardProps {
  group: ConsolidationGroup;
  onConfirm?: (groupId: string) => void;
  onReject?: (groupId: string) => void;
  disabled?: boolean;
}

function statusStyling(group: ConsolidationGroup) {
  if (group.status === "VOORSTEL") {
    return {
      label: group.proposal_source === "auto" ? "Auto-voorstel" : "Voorstel",
      badgeClass: "bg-amber-100 text-amber-800 border-amber-200",
      cardClass: "border-dashed border-amber-300/70 bg-amber-50/30",
    };
  }
  if (group.status === "GOEDGEKEURD") {
    return {
      label: "Goedgekeurd",
      badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-200",
      cardClass: "border-emerald-400/60 bg-emerald-50/20",
    };
  }
  if (group.status === "INGEPLAND") {
    return {
      label: "Ingepland",
      badgeClass: "bg-teal-100 text-teal-800 border-teal-200",
      cardClass: "border-teal-400/60 bg-teal-50/20",
    };
  }
  return {
    label: "Verworpen",
    badgeClass: "bg-gray-100 text-gray-600 border-gray-200",
    cardClass: "border-gray-200 bg-gray-50 opacity-60",
  };
}

function utilizationColor(pct: number | null): string {
  if (pct === null) return "bg-gray-200";
  if (pct >= 95) return "bg-red-500";
  if (pct >= 80) return "bg-amber-500";
  return "bg-emerald-500";
}

export function ClusterProposalCard({ group, onConfirm, onReject, disabled }: ClusterProposalCardProps) {
  const styling = statusStyling(group);
  const orderCount = group.consolidation_orders?.length ?? group.orders?.length ?? 0;
  const util = group.utilization_pct;

  return (
    <Card className={cn("p-4 space-y-3 transition-shadow hover:shadow-md", styling.cardClass)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={cn("font-medium", styling.badgeClass)}>
              {styling.label}
            </Badge>
            {group.capacity_override_reason && (
              <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200">
                Override
              </Badge>
            )}
          </div>
          <h4 className="font-semibold mt-1 truncate">{group.name}</h4>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs text-muted-foreground">Beladingsgraad</div>
          <div className={cn("text-lg font-semibold", util !== null && util >= 95 && "text-red-600", util !== null && util >= 80 && util < 95 && "text-amber-700")}>
            {util !== null ? `${util.toFixed(0)}%` : "-"}
          </div>
        </div>
      </div>

      <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
        <div
          className={cn("h-full transition-all", utilizationColor(util))}
          style={{ width: `${Math.min(util ?? 0, 100)}%` }}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Package className="h-3.5 w-3.5" />
          <span>{orderCount} orders</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Scale className="h-3.5 w-3.5" />
          <span>{group.total_weight_kg ?? 0} kg</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" />
          <span>{group.total_pallets ?? 0} pallets</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Timer className="h-3.5 w-3.5" />
          <span>{group.estimated_duration_min ? `${Math.round(group.estimated_duration_min / 60)} u` : "-"}</span>
        </div>
      </div>

      {group.status === "VOORSTEL" && (onConfirm || onReject) && (
        <div className="flex gap-2 pt-2 border-t border-border/50">
          {onConfirm && (
            <Button
              size="sm"
              variant="default"
              className="flex-1"
              onClick={() => onConfirm(group.id)}
              disabled={disabled}
            >
              Bevestig
            </Button>
          )}
          {onReject && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => onReject(group.id)}
              disabled={disabled}
            >
              Verwerp
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
