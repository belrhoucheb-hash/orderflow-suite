import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

const DAY_LABELS = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];

/** Return the Monday of the week containing `date` */
function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Format date as YYYY-MM-DD */
export function toDateString(d: Date): string {
  return d.toISOString().split("T")[0];
}

/** Format date for display: "3 apr" */
function formatShort(d: Date): string {
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

/** Format week label: "Week 14 — 31 mrt - 6 apr 2026" */
function formatWeekLabel(monday: Date): string {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const weekNum = getISOWeek(monday);
  const from = monday.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
  const to = sunday.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
  return `Week ${weekNum} — ${from} - ${to}`;
}

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export type ViewMode = "day" | "week" | "rooster";

interface PlanningDateNavProps {
  selectedDate: string; // YYYY-MM-DD
  onDateChange: (date: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

export function PlanningDateNav({
  selectedDate,
  onDateChange,
  viewMode,
  onViewModeChange,
}: PlanningDateNavProps) {
  const today = toDateString(new Date());
  const selected = new Date(selectedDate + "T00:00:00");
  const monday = getMonday(selected);

  const weekDays = useMemo(() => {
    const days: { date: Date; dateStr: string; label: string; dayLabel: string }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      days.push({
        date: d,
        dateStr: toDateString(d),
        label: formatShort(d),
        dayLabel: DAY_LABELS[i],
      });
    }
    return days;
  }, [monday.getTime()]);

  const handlePrevWeek = () => {
    const prev = new Date(monday);
    prev.setDate(prev.getDate() - 7);
    onDateChange(toDateString(prev));
  };

  const handleNextWeek = () => {
    const next = new Date(monday);
    next.setDate(next.getDate() + 7);
    onDateChange(toDateString(next));
  };

  const handleToday = () => {
    onDateChange(today);
  };

  return (
    <div className="card--luxe p-3.5 flex flex-col gap-3 shrink-0">
      {/* Week label + navigation */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 rounded-xl border-[hsl(var(--gold)/0.14)] bg-[hsl(var(--gold-soft)/0.08)] text-[hsl(var(--gold-deep))] hover:bg-[hsl(var(--gold-soft)/0.18)] hover:text-[hsl(var(--gold-deep))]"
            onClick={handlePrevWeek}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium text-muted-foreground min-w-[220px] text-center" style={{ fontFamily: "var(--font-display)" }}>
            {formatWeekLabel(monday)}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 rounded-xl border-[hsl(var(--gold)/0.14)] bg-[hsl(var(--gold-soft)/0.08)] text-[hsl(var(--gold-deep))] hover:bg-[hsl(var(--gold-soft)/0.18)] hover:text-[hsl(var(--gold-deep))]"
            onClick={handleNextWeek}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          {selectedDate !== today && (
            <Button variant="ghost" size="sm" className="text-xs gap-1 rounded-xl text-[hsl(var(--gold-deep))] hover:bg-[hsl(var(--gold-soft)/0.18)] hover:text-[hsl(var(--gold-deep))]" onClick={handleToday}>
              <Calendar className="h-3.5 w-3.5" />
              Vandaag
            </Button>
          )}
        </div>

        {/* View mode toggle */}
        <div className="flex items-center rounded-xl border border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--gold-soft)/0.08)] overflow-hidden">
          <button
            className={cn(
              "px-3 py-1.5 text-xs font-medium transition-colors",
              viewMode === "day"
                ? "bg-[linear-gradient(90deg,hsl(var(--gold-soft)/0.7),hsl(var(--gold-soft)/0.3))] text-[hsl(var(--gold-deep))]"
                : "bg-transparent text-muted-foreground hover:bg-[hsl(var(--gold-soft)/0.16)]"
            )}
            onClick={() => onViewModeChange("day")}
          >
            Dag
          </button>
          <button
            className={cn(
              "px-3 py-1.5 text-xs font-medium transition-colors",
              viewMode === "week"
                ? "bg-[linear-gradient(90deg,hsl(var(--gold-soft)/0.7),hsl(var(--gold-soft)/0.3))] text-[hsl(var(--gold-deep))]"
                : "bg-transparent text-muted-foreground hover:bg-[hsl(var(--gold-soft)/0.16)]"
            )}
            onClick={() => onViewModeChange("week")}
          >
            Week
          </button>
          <button
            className={cn(
              "px-3 py-1.5 text-xs font-medium transition-colors",
              viewMode === "rooster"
                ? "bg-[linear-gradient(90deg,hsl(var(--gold-soft)/0.7),hsl(var(--gold-soft)/0.3))] text-[hsl(var(--gold-deep))]"
                : "bg-transparent text-muted-foreground hover:bg-[hsl(var(--gold-soft)/0.16)]"
            )}
            onClick={() => onViewModeChange("rooster")}
          >
            Rooster
          </button>
        </div>
      </div>

      {/* Day buttons */}
      <div className="flex gap-1">
        {weekDays.map((day) => {
          const isSelected = day.dateStr === selectedDate;
          const isToday = day.dateStr === today;
          const isWeekend = day.date.getDay() === 0 || day.date.getDay() === 6;

          return (
            <button
              key={day.dateStr}
              onClick={() => {
                onDateChange(day.dateStr);
                if (viewMode === "week") onViewModeChange("day");
              }}
              className={cn(
                "flex-1 flex flex-col items-center py-1.5 px-2 rounded-lg text-xs transition-all border",
                isSelected && viewMode === "day"
                  ? "bg-[hsl(var(--gold-deep))] text-white border-[hsl(var(--gold-deep))] shadow-sm"
                  : isToday
                  ? "bg-[hsl(var(--gold-soft)/0.3)] text-[hsl(var(--gold-deep))] border-[hsl(var(--gold)/0.3)]"
                  : isWeekend
                  ? "bg-[hsl(var(--gold-soft)/0.08)] text-muted-foreground border-[hsl(var(--gold)/0.08)] hover:bg-[hsl(var(--gold-soft)/0.16)]"
                  : "bg-white/50 text-foreground border-[hsl(var(--gold)/0.08)] hover:bg-[hsl(var(--gold-soft)/0.12)]"
              )}
            >
              <span className="font-semibold">{day.dayLabel}</span>
              <span className={cn("text-[10px]", isSelected && viewMode === "day" ? "text-primary-foreground/80" : "text-muted-foreground")}>
                {day.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
