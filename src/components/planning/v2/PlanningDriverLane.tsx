import { UserCircle, Clock, AlertCircle } from "lucide-react";
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
  if (status === "verlof") return { label: "Verlof", className: "chiplet chiplet--warn" };
  if (status === "ziek") return { label: "Ziek", className: "chiplet chiplet--attn" };
  if (status === "rust") return { label: "Rust", className: "chiplet" };
  if (status === "afwezig") return { label: "Afwezig", className: "chiplet" };
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
    <div className="card--luxe p-5 space-y-4">
      <div className="flex items-center justify-between gap-2 pb-3 hairline border-b-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-full flex items-center justify-center bg-[hsl(var(--gold-soft)/0.6)] border border-[hsl(var(--gold)/0.3)] shrink-0">
            <UserCircle className="h-5 w-5 text-[hsl(var(--gold-deep))]" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold truncate font-[var(--font-display)]">{driver.name}</h3>
            {statusBadge && (
              <span className={cn(statusBadge.className, "mt-1 inline-flex")}>
                {statusBadge.label}
              </span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="flex items-center gap-1 text-[0.6875rem] uppercase tracking-wide text-muted-foreground justify-end">
            <Clock className="h-3 w-3" />
            <span>Deze week</span>
          </div>
          <div
            className={cn(
              "text-lg font-semibold font-[var(--font-display)]",
              isOverContract && "text-red-600",
              !isOverContract && isNearContract && "text-amber-700",
              !isOverContract && !isNearContract && "text-[hsl(var(--gold-deep))]",
            )}
          >
            {plannedHoursThisWeek.toFixed(1)}
            {contractHrs !== null && contractHrs !== undefined && (
              <span className="text-xs text-muted-foreground font-normal"> / {contractHrs} u</span>
            )}
            {(contractHrs === null || contractHrs === undefined) && (
              <span className="text-xs text-muted-foreground font-normal"> u</span>
            )}
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
        <div className="text-sm text-muted-foreground italic text-center py-6">
          Geen clusters toegewezen voor deze dag.
        </div>
      )}

      <div className="space-y-3">
        {groups.map((g) => (
          <ClusterProposalCard
            key={g.id}
            group={g}
            onConfirm={onConfirmGroup}
            onReject={onRejectGroup}
          />
        ))}
      </div>
    </div>
  );
}
