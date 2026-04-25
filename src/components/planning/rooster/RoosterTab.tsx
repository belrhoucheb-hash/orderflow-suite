import { lazy, Suspense, useState, useMemo, useCallback, type ComponentType } from "react";
import { ChevronLeft, ChevronRight, Calendar, Printer } from "lucide-react";
import { toast } from "sonner";
import { addDays, format, parseISO, startOfWeek } from "date-fns";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { LoadingState } from "@/components/ui/LoadingState";
import { LuxeDatePicker } from "@/components/LuxeDatePicker";

import { toDateString } from "@/components/planning/PlanningDateNav";
import { useDriverSchedulesRealtime } from "@/hooks/useDriverSchedulesRealtime";
import { useDrivers } from "@/hooks/useDrivers";
import { useShiftTemplates } from "@/hooks/useShiftTemplates";
import { useDriverSchedules } from "@/hooks/useDriverSchedules";
import { useVehiclesRaw } from "@/hooks/useVehiclesRaw";
import { RoosterDayView } from "./RoosterDayView";
import { exportWeekRosterPdf } from "./RoosterPdfExport";

type RoosterMode = "day" | "week";

/**
 * Lazy-import met fallback: als het bestand nog niet bestaat (andere agent is
 * er nog mee bezig), toon een nette placeholder in plaats van de hele pagina
 * te laten crashen. Vite geeft een module-resolve-error bij een dynamic import
 * die niet resolveerbaar is, die vangen we hier af.
 */
type DatedComponent = ComponentType<{ date: string }>;
type BulkActionsComponent = ComponentType<{ date: string; mode?: RoosterMode }>;

type MaybeModule = {
  default?: DatedComponent;
  RoosterWeekView?: DatedComponent;
  RoosterBulkActions?: BulkActionsComponent;
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

const RoosterBulkActions = lazy<BulkActionsComponent>(() =>
  (import("./RoosterBulkActions") as Promise<MaybeModule>)
    .then((m) => ({
      default: (m.RoosterBulkActions ?? m.default) as BulkActionsComponent,
    }))
    .catch(() => ({
      default: ((_: { date: string; mode?: RoosterMode }) =>
        null) as BulkActionsComponent,
    })),
);

function PlaceholderModule({ label }: { label: string }) {
  return (
    <div className="border border-dashed rounded-lg p-8 text-center text-sm text-muted-foreground">
      {label} is nog niet beschikbaar. Wordt binnenkort toegevoegd.
    </div>
  );
}

/**
 * Wrapper voor de Rooster-module: datum-navigatie, view-switch Dag/Week, slot
 * voor bulk-acties. De zware sub-views (Week en Bulk) worden lazy geladen en
 * mogen ontbreken zonder de Dag-view te breken.
 */
export function RoosterTab() {
  useDriverSchedulesRealtime();
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

  // Data voor week-PDF.
  const weekStart = useMemo(
    () =>
      format(
        startOfWeek(parseISO(date), { weekStartsOn: 1 }),
        "yyyy-MM-dd",
      ),
    [date],
  );
  const weekEnd = useMemo(
    () => format(addDays(parseISO(weekStart), 6), "yyyy-MM-dd"),
    [weekStart],
  );

  const { data: drivers = [] } = useDrivers();
  const { templates } = useShiftTemplates();
  const { data: vehicles = [] } = useVehiclesRaw();
  const { schedules: weekSchedules } = useDriverSchedules(weekStart, weekEnd);

  const handlePrintWeek = useCallback(
    async (includeFreeDays: boolean) => {
      try {
        await exportWeekRosterPdf(
          weekStart,
          weekSchedules,
          drivers,
          vehicles,
          templates,
          { includeFreeDays },
        );
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Kon PDF niet genereren.";
        toast.error("PDF mislukt", { description: msg });
      }
    },
    [weekStart, weekSchedules, drivers, vehicles, templates],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => shiftDays(stepBack)}
            title={mode === "week" ? "Vorige week" : "Vorige dag"}
            className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-[hsl(var(--gold)/0.3)] bg-[hsl(var(--card))] text-[hsl(var(--gold-deep))] transition-all hover:border-[hsl(var(--gold)/0.55)] hover:bg-[hsl(var(--gold-soft)/0.5)]"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <div className="min-w-[12rem]">
            <LuxeDatePicker value={date} onChange={setDate} />
          </div>

          <button
            type="button"
            onClick={() => shiftDays(stepForward)}
            title={mode === "week" ? "Volgende week" : "Volgende dag"}
            className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-[hsl(var(--gold)/0.3)] bg-[hsl(var(--card))] text-[hsl(var(--gold-deep))] transition-all hover:border-[hsl(var(--gold)/0.55)] hover:bg-[hsl(var(--gold-soft)/0.5)]"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          {date !== today && (
            <button
              type="button"
              onClick={() => setDate(today)}
              className="chiplet"
              style={{ cursor: "pointer" }}
              title="Spring naar vandaag"
            >
              <Calendar />
              Vandaag
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div
            className="inline-flex items-center gap-0.5 p-0.5 rounded-full border border-[hsl(var(--gold)/0.2)] bg-[hsl(var(--card))]"
            role="tablist"
            aria-label="Weergave"
          >
            {[
              { value: "day" as const, label: "Dag" },
              { value: "week" as const, label: "Week" },
            ].map((t) => (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={mode === t.value}
                onClick={() => setMode(t.value)}
                className={cn(
                  "px-4 h-7 rounded-full text-[10px] uppercase tracking-[0.18em] font-semibold transition-colors",
                  mode === t.value
                    ? "bg-[hsl(var(--gold-soft)/0.65)] text-[hsl(var(--gold-deep))]"
                    : "text-muted-foreground/70 hover:text-foreground",
                )}
                style={{ fontFamily: "var(--font-display)" }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {mode === "week" && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="btn-luxe">
                  <Printer className="h-4 w-4" />
                  Print weekrooster
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handlePrintWeek(false)}>
                  Print weekrooster (alleen werkende chauffeurs)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handlePrintWeek(true)}>
                  Print volledig weekrooster (incl. vrij/ziek)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <Suspense fallback={null}>
            <RoosterBulkActions date={date} mode={mode} />
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
