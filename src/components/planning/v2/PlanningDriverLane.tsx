import { UserCircle, Clock, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ConsolidationGroup } from "@/types/consolidation";
import { ClusterProposalCard } from "./ClusterProposalCard";

interface PlanningDriverLaneProps {
  driver: {
    id: string;
    name: string;
    status?: string;
    contract_hours_per_week?: number | null;
  };
  groups: ConsolidationGroup[];
  plannedHoursThisWeek: number;
  onConfirmGroup?: (groupId: string) => void;
  onRejectGroup?: (groupId: string) => void;
}

function laneStatusBadge(status?: string) {
  if (status === "verlof") return { label: "Verlof", className: "bg-amber-100 text-amber-800" };
  if (status === "ziek") return { label: "Ziek", className: "bg-red-100 text-red-800" };
  if (status === "rust") return { label: "Rust", className: "bg-blue-100 text-blue-800" };
  if (status === "afwezig") return { label: "Afwezig", className: "bg-gray-100 text-gray-600" };
  return null;
}

export function PlanningDriverLane({
  driver,
  groups,
  plannedHoursThisWeek,
  onConfirmGroup,
  onRejectGroup,
}: PlanningDriverLaneProps) {
  const statusBadge = laneStatusBadge(driver.status);
  const contractHrs = driver.contract_hours_per_week;
  const isOverContract = contractHrs !== null && contractHrs !== undefined && plannedHoursThisWeek > contractHrs;
  const isNearContract = contractHrs !== null && contractHrs !== undefined && plannedHoursThisWeek > contractHrs * 0.9;

  return (
    <Card className="p-4 space-y-3 bg-card/50">
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-border/60">
        <div className="flex items-center gap-2 min-w-0">
          <UserCircle className="h-5 w-5 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <h3 className="font-semibold truncate">{driver.name}</h3>
            {statusBadge && (
              <Badge variant="outline" className={cn("text-xs mt-0.5", statusBadge.className)}>
                {statusBadge.label}
              </Badge>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="flex items-center gap-1 text-xs text-muted-foreground justify-end">
            <Clock className="h-3 w-3" />
            <span>Deze week</span>
          </div>
          <div className={cn(
            "text-sm font-semibold",
            isOverContract && "text-red-600",
            !isOverContract && isNearContract && "text-amber-700",
          )}>
            {plannedHoursThisWeek.toFixed(1)}
            {contractHrs !== null && contractHrs !== undefined && (
              <span className="text-xs text-muted-foreground font-normal"> / {contractHrs} u</span>
            )}
            {(contractHrs === null || contractHrs === undefined) && <span className="text-xs text-muted-foreground font-normal"> u</span>}
          </div>
          {isOverContract && (
            <div className="flex items-center gap-1 text-xs text-red-600 justify-end mt-0.5">
              <AlertCircle className="h-3 w-3" />
              Over contract
            </div>
          )}
        </div>
      </div>

      {groups.length === 0 && (
        <div className="text-sm text-muted-foreground italic text-center py-4">
          Geen clusters toegewezen
        </div>
      )}

      <div className="space-y-2">
        {groups.map((g) => (
          <ClusterProposalCard
            key={g.id}
            group={g}
            onConfirm={onConfirmGroup}
            onReject={onRejectGroup}
          />
        ))}
      </div>
    </Card>
  );
}
