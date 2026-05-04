import { AlertTriangle, Clock, Timer } from "lucide-react";
import { cn } from "@/lib/utils";

interface DriveTimeMonitorProps {
  continuousDriveH: number;
  dailyDriveH: number;
  statusColor: "green" | "orange" | "red";
  warning: string | null;
  isVisible: boolean; // only show when clocked in
}

const COLOR_MAP = {
  green: {
    bg: "bg-[hsl(var(--gold-soft)/0.35)]",
    ring: "ring-[hsl(var(--gold)/0.28)]",
    barBg: "bg-[hsl(var(--gold-soft)/0.6)]",
    barFill: "bg-gradient-to-r from-[hsl(var(--gold))] to-[hsl(var(--gold-deep))]",
    text: "text-[hsl(var(--gold-deep))]",
    icon: "text-[hsl(var(--gold-deep))]",
  },
  orange: {
    bg: "bg-amber-50",
    ring: "ring-amber-200",
    barBg: "bg-amber-100",
    barFill: "bg-amber-500",
    text: "text-amber-700",
    icon: "text-amber-500",
  },
  red: {
    bg: "bg-red-50",
    ring: "ring-red-200",
    barBg: "bg-red-100",
    barFill: "bg-red-500",
    text: "text-red-700",
    icon: "text-red-500",
  },
} as const;

function formatHM(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  return `${h}:${m.toString().padStart(2, "0")}`;
}

export function DriveTimeMonitor({
  continuousDriveH,
  dailyDriveH,
  statusColor,
  warning,
  isVisible,
}: DriveTimeMonitorProps) {
  if (!isVisible) return null;

  const colors = COLOR_MAP[statusColor];
  const continuousPct = Math.min((continuousDriveH / 4.5) * 100, 100);
  const dailyPct = Math.min((dailyDriveH / 9) * 100, 100);

  return (
    <div className={cn("rounded-2xl p-4 ring-1 shadow-sm", colors.bg, colors.ring)}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Timer className={cn("h-4 w-4", colors.icon)} />
        <span className={cn("text-[11px] font-bold uppercase tracking-[0.18em] font-display", colors.text)}>
          Rijtijd (EU 561/2006)
        </span>
      </div>

      {/* Continuous drive time */}
      <div className="mb-3">
        <div className="flex justify-between items-baseline mb-1">
          <span className="text-xs font-medium text-slate-600">Aaneengesloten</span>
          <span className={cn("text-sm font-bold tabular-nums", colors.text)}>
            {formatHM(continuousDriveH)} / 4:30
          </span>
        </div>
        <div className={cn("h-2 rounded-full overflow-hidden", colors.barBg)}>
          <div
            className={cn("h-full rounded-full transition-all duration-1000", colors.barFill)}
            style={{ width: `${continuousPct}%` }}
          />
        </div>
      </div>

      {/* Daily drive time */}
      <div className="mb-2">
        <div className="flex justify-between items-baseline mb-1">
          <span className="text-xs font-medium text-slate-600">Vandaag totaal</span>
          <span className={cn("text-sm font-bold tabular-nums", colors.text)}>
            {formatHM(dailyDriveH)} / 9:00
          </span>
        </div>
        <div className="h-2 rounded-full overflow-hidden bg-slate-100">
          <div
            className={cn("h-full rounded-full transition-all duration-1000", dailyDriveH >= 9 ? "bg-red-500" : "bg-blue-500")}
            style={{ width: `${dailyPct}%` }}
          />
        </div>
      </div>

      {/* Warning banner */}
      {warning && (
        <div className={cn(
          "mt-3 flex items-start gap-2 rounded-xl px-3 py-2 text-xs font-semibold",
          statusColor === "red"
            ? "bg-red-100 text-red-800 animate-pulse"
            : "bg-amber-100 text-amber-800",
        )}>
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{warning}</span>
        </div>
      )}
    </div>
  );
}
