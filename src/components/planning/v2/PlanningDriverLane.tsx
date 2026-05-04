import { UserCircle, Clock, AlertCircle, AlertTriangle, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConsolidationGroup } from "@/types/consolidation";
import type { DriverSchedule } from "@/types/rooster";
import type { DriverCountryRestrictionIssue } from "@/lib/driverCountryRestrictions";
import { formatDriverCountryRestrictionIssue } from "@/lib/driverCountryRestrictions";
import { DRIVER_SCHEDULE_STATUS_LABELS } from "@/types/rooster";
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
  /**
   * Rooster-rij voor deze chauffeur op de zichtbare datum, zodat de header
   * starttijd, voertuig en afwijkende status kan tonen. Optioneel: als er geen
   * rooster bestaat tonen we alleen naam en uren.
   */
  schedule?: DriverSchedule | null;
  /** Map van vehicle_id naar leesbare label (kenteken of code), voor de tag. */
  vehicleLabels?: Map<string, string>;
  countryRestrictionIssue?: DriverCountryRestrictionIssue | null;
  onSelectGroup: (groupId: string) => void;
  onReturnGroup?: (groupId: string) => void;
  onDropOrder?: (driverId: string, orderId: string) => void;
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
  schedule,
  vehicleLabels,
  countryRestrictionIssue,
  onSelectGroup,
  onReturnGroup,
  onDropOrder,
}: PlanningDriverLaneProps) {
  const statusBadge = laneStatusBadge(driver.status);
  const contractHrs = driver.contract_hours_per_week;
  const isOverContract = contractHrs !== null && contractHrs !== undefined && plannedHoursThisWeek > contractHrs;
  const isNearContract = contractHrs !== null && contractHrs !== undefined && plannedHoursThisWeek > contractHrs * 0.9;

  const scheduleStartTime = schedule?.start_time ? schedule.start_time.slice(0, 5) : null;
  const scheduleVehicleLabel =
    schedule?.vehicle_id ? vehicleLabels?.get(schedule.vehicle_id) ?? null : null;
  const scheduleStatusLabel =
    schedule && schedule.status !== "werkt" ? DRIVER_SCHEDULE_STATUS_LABELS[schedule.status] : null;
  const showRosterTag =
    !!schedule && schedule.status === "werkt" && (scheduleStartTime || scheduleVehicleLabel);

  return (
    <div
      className="card--luxe p-5 space-y-4"
      onDragOver={(event) => {
        if (!onDropOrder) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        if (!onDropOrder) return;
        event.preventDefault();
        const orderId = event.dataTransfer.getData("application/x-order-id");
        if (orderId) onDropOrder(driver.id, orderId);
      }}
    >
      <div className="flex items-center justify-between gap-2 pb-3 hairline border-b-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-full flex items-center justify-center bg-[hsl(var(--gold-soft)/0.6)] border border-[hsl(var(--gold)/0.3)] shrink-0">
            <UserCircle className="h-5 w-5 text-[hsl(var(--gold-deep))]" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold truncate font-[var(--font-display)]">{driver.name}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {statusBadge && (
                <span className={cn(statusBadge.className, "inline-flex")}>
                  {statusBadge.label}
                </span>
              )}
              {showRosterTag && (
                <span
                  className="chiplet inline-flex items-center gap-1"
                  title="Rooster"
                >
                  {scheduleStartTime && (
                    <>
                      <Clock className="h-3 w-3" />
                      {scheduleStartTime}
                    </>
                  )}
                  {scheduleStartTime && scheduleVehicleLabel && (
                    <span className="text-muted-foreground/60">/</span>
                  )}
                  {scheduleVehicleLabel && (
                    <>
                      <Truck className="h-3 w-3" />
                      {scheduleVehicleLabel}
                    </>
                  )}
                </span>
              )}
              {scheduleStatusLabel && (
                <span
                  className="chiplet chiplet--warn inline-flex items-center gap-1"
                  title="Roosterstatus"
                >
                  <AlertTriangle className="h-3 w-3" />
                  Rooster: {scheduleStatusLabel}
                </span>
              )}
              {countryRestrictionIssue && (
                <span
                  className={cn(
                    "chiplet inline-flex items-center gap-1",
                    countryRestrictionIssue.type === "block" ? "chiplet--attn" : "chiplet--warn",
                  )}
                  title={formatDriverCountryRestrictionIssue(countryRestrictionIssue)}
                >
                  <AlertTriangle className="h-3 w-3" />
                  {countryRestrictionIssue.type === "block" ? "Landblokkade" : "Landwaarschuwing"} {countryRestrictionIssue.countryCode}
                </span>
              )}
            </div>
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
        <div className="rounded-lg border border-dashed border-[hsl(var(--gold)/0.25)] bg-[hsl(var(--gold-soft)/0.14)] py-6 px-4 text-center">
          <div className="text-sm text-muted-foreground italic">
            Geen clusters toegewezen voor deze dag.
          </div>
          {onDropOrder && (
            <div className="mt-2 text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--gold-deep))]">
              Sleep hier een open order naartoe
            </div>
          )}
        </div>
      )}

      <div className="space-y-3">
        {groups.map((g) => (
          <ClusterProposalCard
            key={g.id}
            group={g}
            onSelect={onSelectGroup}
            onReturn={onReturnGroup}
          />
        ))}
      </div>
    </div>
  );
}
