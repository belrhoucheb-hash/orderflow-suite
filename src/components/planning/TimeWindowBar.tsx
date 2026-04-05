import { cn } from "@/lib/utils";
import type { WindowStatus } from "@/types/timeWindows";

function parseMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function getStatus(windowStart: string | null, windowEnd: string | null, eta: string | null): WindowStatus {
  if (!windowStart || !windowEnd || !eta) return "ONBEKEND";
  const etaMin = parseMinutes(eta);
  const startMin = parseMinutes(windowStart);
  const endMin = parseMinutes(windowEnd);
  if (etaMin < startMin) return "TE_VROEG";
  if (etaMin > endMin) return "TE_LAAT";
  return "OP_TIJD";
}

const STATUS_COLORS: Record<WindowStatus, string> = {
  ONBEKEND: "bg-gray-200",
  OP_TIJD: "bg-green-400",
  TE_VROEG: "bg-amber-400",
  TE_LAAT: "bg-red-400",
  GEMIST: "bg-red-600",
};

interface Props {
  windowStart: string | null;
  windowEnd: string | null;
  eta: string | null;
}

export function TimeWindowBar({ windowStart, windowEnd, eta }: Props) {
  const status = getStatus(windowStart, windowEnd, eta);

  return (
    <div className="flex items-center gap-2 text-xs" data-status={status}>
      {windowStart && <span className="text-muted-foreground">{windowStart}</span>}
      <div className="flex-1 relative h-3 rounded-full bg-gray-100 overflow-hidden">
        <div
          className={cn("absolute inset-0 rounded-full", STATUS_COLORS[status])}
          data-status={status}
        />
        {eta && windowStart && windowEnd && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-black"
            style={{
              left: `${Math.min(100, Math.max(0, ((parseMinutes(eta) - parseMinutes(windowStart)) / (parseMinutes(windowEnd) - parseMinutes(windowStart))) * 100))}%`,
            }}
          />
        )}
      </div>
      {windowEnd && <span className="text-muted-foreground">{windowEnd}</span>}
      {eta && <span className="font-medium ml-1">ETA {eta}</span>}
    </div>
  );
}
