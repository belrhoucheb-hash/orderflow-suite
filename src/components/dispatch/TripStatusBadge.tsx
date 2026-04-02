import { cn } from "@/lib/utils";
import { TRIP_STATUS_LABELS, STOP_STATUS_LABELS, type TripStatus, type StopStatus } from "@/types/dispatch";

export function TripStatusBadge({ status }: { status: TripStatus }) {
  const config = TRIP_STATUS_LABELS[status];
  return (
    <span className={cn("inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded", config.color)}>
      {status === "ACTIEF" && <span className="relative flex h-2 w-2 mr-1.5"><span className="animate-ping absolute h-full w-full rounded-full bg-green-400 opacity-75" /><span className="relative rounded-full h-2 w-2 bg-green-500" /></span>}
      {config.label}
    </span>
  );
}

export function StopStatusBadge({ status }: { status: StopStatus }) {
  const config = STOP_STATUS_LABELS[status];
  return (
    <span className={cn("inline-flex items-center text-xs font-medium px-1.5 py-0.5 rounded", config.color)}>
      {config.label}
    </span>
  );
}

export function TripProgressBar({ stops }: { stops: { stop_status: string }[] }) {
  const total = stops.length;
  const done = stops.filter(s => ["AFGELEVERD", "MISLUKT", "OVERGESLAGEN"].includes(s.stop_status)).length;
  const pct = total > 0 ? (done / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 font-medium tabular-nums">{done}/{total}</span>
    </div>
  );
}
