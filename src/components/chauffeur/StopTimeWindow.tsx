import { useState, useEffect } from "react";
import { Clock, AlertTriangle, CheckCircle2, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WindowStatus } from "@/types/timeWindows";
import { WINDOW_STATUS_LABELS } from "@/types/timeWindows";

interface Props {
  windowStart: string | null;
  windowEnd: string | null;
  windowStatus: WindowStatus;
  waitingTimeMin: number | null;
}

function parseMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function nowMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

export function StopTimeWindow({ windowStart, windowEnd, windowStatus, waitingTimeMin }: Props) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!windowStart) return;
    const update = () => {
      const diff = parseMinutes(windowStart) - nowMinutes();
      setRemaining(diff > 0 ? diff : 0);
    };
    update();
    const interval = setInterval(update, 30_000);
    return () => clearInterval(interval);
  }, [windowStart]);

  if (!windowStart && !windowEnd) return null;

  const statusInfo = WINDOW_STATUS_LABELS[windowStatus];
  const isLate = windowStatus === "TE_LAAT" || windowStatus === "GEMIST";
  const isOnTime = windowStatus === "OP_TIJD";

  return (
    <div className={cn("rounded-lg border p-3 space-y-2", isLate ? "border-red-300 bg-red-50" : isOnTime ? "border-green-300 bg-green-50" : "border-gray-200")}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Tijdvenster</span>
        </div>
        <span className={cn("text-xs font-medium px-2 py-0.5 rounded", statusInfo.color)}>{statusInfo.label}</span>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <span className="font-mono">{windowStart}</span>
        <div className="flex-1 h-1 bg-gray-200 rounded-full">
          <div className={cn("h-full rounded-full", isOnTime ? "bg-green-400" : isLate ? "bg-red-400" : "bg-amber-400")} style={{ width: "100%" }} />
        </div>
        <span className="font-mono">{windowEnd}</span>
      </div>
      {remaining !== null && remaining > 0 && (
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <Timer className="h-3 w-3" /><span>Nog {remaining} min tot opening</span>
        </div>
      )}
      {isLate && (
        <div className="flex items-center gap-1 text-sm text-red-700">
          <AlertTriangle className="h-3 w-3" /><span>Venster verlopen</span>
        </div>
      )}
      {isOnTime && (
        <div className="flex items-center gap-1 text-sm text-green-700">
          <CheckCircle2 className="h-3 w-3" /><span>Op tijd</span>
        </div>
      )}
      {waitingTimeMin !== null && waitingTimeMin > 0 && (
        <div className="flex items-center gap-1 text-sm text-amber-700">
          <Timer className="h-3 w-3" /><span>Wachttijd: {waitingTimeMin} min</span>
        </div>
      )}
    </div>
  );
}
