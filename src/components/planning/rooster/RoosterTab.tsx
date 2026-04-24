import { lazy, Suspense, useState, useMemo, useCallback, type ComponentType } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { LoadingState } from "@/components/ui/LoadingState";

import { toDateString } from "@/components/planning/PlanningDateNav";
import { RoosterDayView } from "./RoosterDayView";

type RoosterMode = "day" | "week";

/**
 * Lazy-import met fallback: als het bestand nog niet bestaat (andere agent is
 * er nog mee bezig), toon een nette placeholder in plaats van de hele pagina
 * te laten crashen. Vite geeft een module-resolve-error bij een dynamic import
 * die niet resolveerbaar is, die vangen we hier af.
 */
type DatedComponent = ComponentType<{ date: string }>;

type MaybeModule = {
  default?: DatedComponent;
  RoosterWeekView?: DatedComponent;
  RoosterBulkActions?: DatedComponent;
};

const RoosterWeekView = lazy<DatedComponent>(() =>
  (import("./RoosterWeekView") as Promise<MaybeModule>)
    .then((m) => ({
      default: (m.RoosterWeekView ?? m.default) as DatedComponent,
    }))
    .catch(() => ({
      default: ((_: { date: string }) => (
        <PlaceholderModule label="Week-weergave" />
      )) as DatedComponent,
    })),
);

const RoosterBulkActions = lazy<DatedComponent>(() =>
  (import("./RoosterBulkActions") as Promise<MaybeModule>)
    .then((m) => ({
      default: (m.RoosterBulkActions ?? m.default) as DatedComponent,
    }))
    .catch(() => ({
      default: ((_: { date: string }) => null) as DatedComponent,
    })),
);

function PlaceholderModule({ label }: { label: string }) {
  return (
    <div className="border border-dashed rounded-lg p-8 text-center text-sm text-muted-foreground">
      {label} is nog niet beschikbaar. Wordt binnenkort toegevoegd.
    </div>
  );
}

function formatLongDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("nl-NL", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

/**
 * Wrapper voor de Rooster-module: datum-navigatie, view-switch Dag/Week, slot
 * voor bulk-acties. De zware sub-views (Week en Bulk) worden lazy geladen en
 * mogen ontbreken zonder de Dag-view te breken.
 */
export function RoosterTab() {
  const [mode, setMode] = useState<RoosterMode>("day");
  const [date, setDate] = useState<string>(toDateString(new Date()));
  const today = toDateString(new Date());

  const shiftDays = useCallback(
    (delta: number) => {
      const d = new Date(date + "T00:00:00");
      d.setDate(d.getDate() + delta);
      setDate(toDateString(d));
    },
    [date],
  );

  const stepBack = useMemo(() => (mode === "week" ? -7 : -1), [mode]);
  const stepForward = useMemo(() => (mode === "week" ? 7 : 1), [mode]);

  const [datePickerOpen, setDatePickerOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => shiftDays(stepBack)}
            title={mode === "week" ? "Vorige week" : "Vorige dag"}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 min-w-[240px] justify-start"
              >
                <Calendar className="h-3.5 w-3.5" />
                <span className="text-sm">{formatLongDate(date)}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarPicker
                mode="single"
                selected={new Date(date + "T00:00:00")}
                onSelect={(d) => {
                  if (d) {
                    setDate(toDateString(d));
                    setDatePickerOpen(false);
                  }
                }}
              />
            </PopoverContent>
          </Popover>

          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => shiftDays(stepForward)}
            title={mode === "week" ? "Volgende week" : "Volgende dag"}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>

          {date !== today && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs gap-1"
              onClick={() => setDate(today)}
            >
              <Calendar className="h-3.5 w-3.5" />
              Vandaag
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-border/50 overflow-hidden">
            <button
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition-colors",
                mode === "day"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted",
              )}
              onClick={() => setMode("day")}
            >
              Dag
            </button>
            <button
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition-colors",
                mode === "week"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted",
              )}
              onClick={() => setMode("week")}
            >
              Week
            </button>
          </div>

          <Suspense fallback={null}>
            <RoosterBulkActions date={date} />
          </Suspense>
        </div>
      </div>

      {mode === "day" ? (
        <RoosterDayView date={date} />
      ) : (
        <Suspense fallback={<LoadingState message="Weekweergave laden..." />}>
          <RoosterWeekView date={date} />
        </Suspense>
      )}
    </div>
  );
}

export default RoosterTab;
