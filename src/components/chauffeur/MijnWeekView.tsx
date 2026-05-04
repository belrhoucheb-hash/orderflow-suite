import { useMemo, useState } from "react";
import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { nl } from "date-fns/locale";
import { Calendar, ChevronLeft, ChevronRight, Truck, Clock, MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDriverSchedules } from "@/hooks/useDriverSchedules";
import { useShiftTemplates } from "@/hooks/useShiftTemplates";
import { useVehiclesRaw } from "@/hooks/useVehiclesRaw";
import {
  DRIVER_SCHEDULE_STATUS_LABELS,
  type DriverSchedule,
  type DriverScheduleStatus,
} from "@/types/rooster";

interface Props {
  driverId: string;
}

interface DayInfo {
  date: string;
  schedule: DriverSchedule | null;
}

const STATUS_STYLES: Record<DriverScheduleStatus, string> = {
  werkt: "bg-emerald-100 text-emerald-700 border border-emerald-200",
  vrij: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  ziek: "bg-red-100 text-red-700 border border-red-200",
  verlof: "bg-amber-100 text-amber-700 border border-amber-200",
  feestdag: "bg-sky-100 text-sky-700 border border-sky-200",
};

function formatTime(value: string | null): string | null {
  if (!value) return null;
  return value.length >= 5 ? value.slice(0, 5) : value;
}

/**
 * Read-only weekoverzicht voor de ingelogde chauffeur. Toont 7 kaarten (Ma-Zo)
 * met dagnaam, datum, rooster-naam, starttijd, voertuig (kenteken), status en
 * notitie. Geen edit-acties: de chauffeur kan zijn eigen rooster niet
 * wijzigen. Realtime-invalidatie gebeurt op pagina-niveau via
 * useDriverSchedulesRealtime.
 */
export function MijnWeekView({ driverId }: Props) {
  const [anchor, setAnchor] = useState<Date>(() => new Date());

  const weekStart = useMemo(
    () => startOfWeek(anchor, { weekStartsOn: 1 }),
    [anchor],
  );
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);

  const weekStartStr = format(weekStart, "yyyy-MM-dd");
  const weekEndStr = format(weekEnd, "yyyy-MM-dd");

  const { schedules, isLoading } = useDriverSchedules(weekStartStr, weekEndStr);
  const { data: templates = [] } = useShiftTemplates();
  const { data: vehicles = [] } = useVehiclesRaw({ includeInactive: true });

  const myDays: DayInfo[] = useMemo(() => {
    const mySchedules = schedules.filter((s) => s.driver_id === driverId);
    return Array.from({ length: 7 }, (_, i) => {
      const dayDate = format(addDays(weekStart, i), "yyyy-MM-dd");
      const schedule = mySchedules.find((s) => s.date === dayDate) ?? null;
      return { date: dayDate, schedule };
    });
  }, [schedules, driverId, weekStart]);

  const headerLabel = `Week van ${format(weekStart, "d MMMM", { locale: nl })} t/m ${format(weekEnd, "d MMMM yyyy", { locale: nl })}`;

  const goPrevious = () => setAnchor((d) => addDays(d, -7));
  const goNext = () => setAnchor((d) => addDays(d, 7));
  const goToday = () => setAnchor(new Date());

  const todayStr = format(new Date(), "yyyy-MM-dd");

  return (
    <div className="space-y-4">
      <Card className="card--luxe border-[hsl(var(--gold)/0.18)] p-0">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-9 w-9 rounded-full bg-[hsl(var(--gold-soft)/0.6)] text-[hsl(var(--gold-deep))] flex items-center justify-center shrink-0">
                <Calendar className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 font-display">Mijn week</p>
                <p className="text-xs text-slate-500 truncate">{headerLabel}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="outline"
                size="icon"
                className="btn-luxe btn-luxe--secondary h-9 w-9 rounded-xl"
                onClick={goPrevious}
                aria-label="Vorige week"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="btn-luxe btn-luxe--secondary h-9 rounded-xl text-xs font-semibold px-3"
                onClick={goToday}
              >
                Vandaag
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="btn-luxe btn-luxe--secondary h-9 w-9 rounded-xl"
                onClick={goNext}
                aria-label="Volgende week"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="text-center py-10 text-muted-foreground animate-pulse text-sm">
          Rooster laden...
        </div>
      ) : (
        <div className="space-y-3">
          {myDays.map(({ date, schedule }) => {
            const dayDate = parseISO(date);
            const dayName = format(dayDate, "EEEE", { locale: nl });
            const dayDateLabel = format(dayDate, "d MMMM", { locale: nl });
            const isToday = date === todayStr;

            const status: DriverScheduleStatus = schedule?.status ?? "vrij";
            const statusLabel = DRIVER_SCHEDULE_STATUS_LABELS[status];
            const statusClass = STATUS_STYLES[status];

            const template = schedule?.shift_template_id
              ? templates.find((t) => t.id === schedule.shift_template_id) ?? null
              : null;

            const startTime =
              formatTime(schedule?.start_time ?? null) ??
              formatTime(template?.default_start_time ?? null);

            const vehicle = schedule?.vehicle_id
              ? vehicles.find((v) => v.id === schedule.vehicle_id) ?? null
              : null;

            const showWorkDetails = status === "werkt";

            return (
              <Card
                key={date}
                className={`card--luxe p-0 ${
                  isToday
                    ? "border-[hsl(var(--gold)/0.55)] bg-[hsl(var(--gold-soft)/0.28)]"
                    : "border-[hsl(var(--gold)/0.18)]"
                }`}
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 capitalize leading-tight font-display">
                        {dayName}
                        {isToday && (
                          <span className="ml-2 text-xs text-[hsl(var(--gold-deep))] font-medium">
                            (vandaag)
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500 capitalize mt-0.5 tabular-nums">
                        {dayDateLabel}
                      </p>
                    </div>
                    <Badge className={`${statusClass} shrink-0 text-xs font-semibold`}>
                      {statusLabel}
                    </Badge>
                  </div>

                  {showWorkDetails && (
                    <div className="space-y-1.5 text-sm">
                      {template?.name && (
                        <div className="flex items-center gap-2 text-slate-700">
                          <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{template.name}</span>
                        </div>
                      )}
                      {startTime && (
                        <div className="flex items-center gap-2 text-slate-700">
                          <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span>Start om <span className="tabular-nums font-display">{startTime}</span> uur</span>
                        </div>
                      )}
                      {vehicle && (
                        <div className="flex items-center gap-2 text-slate-700">
                          <Truck className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">
                            {vehicle.plate}
                            {vehicle.code ? ` (${vehicle.code})` : ""}
                          </span>
                        </div>
                      )}
                      {!template && !startTime && !vehicle && (
                        <p className="text-xs text-slate-500 italic">
                          Geen extra details ingepland.
                        </p>
                      )}
                    </div>
                  )}

                  {schedule?.notitie && (
                    <div className="flex items-start gap-2 text-sm text-slate-600 pt-2 border-t border-slate-100">
                      <MessageSquare className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                      <span className="italic leading-snug">{schedule.notitie}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default MijnWeekView;
