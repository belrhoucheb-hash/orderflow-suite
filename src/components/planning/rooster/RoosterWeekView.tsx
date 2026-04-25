import { useMemo, useState, type CSSProperties } from "react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { nl } from "date-fns/locale";
import { toast } from "sonner";
import { MoreHorizontal } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { useDrivers, type Driver } from "@/hooks/useDrivers";
import { useDriverSchedules } from "@/hooks/useDriverSchedules";
import { useShiftTemplates } from "@/hooks/useShiftTemplates";
import { useVehiclesRaw, type RawVehicle } from "@/hooks/useVehiclesRaw";
import { useIsMobile } from "@/hooks/use-mobile";
import { findVehicleConflictsOnDate } from "@/lib/roosterConflicts";
import type {
  DriverSchedule,
  DriverScheduleUpsert,
  ShiftTemplate,
} from "@/types/rooster";
import { DRIVER_SCHEDULE_STATUS_LABELS } from "@/types/rooster";

import { RoosterCellEditor } from "./RoosterCellEditor";
import { RoosterConflictBanner } from "./RoosterConflictBanner";
import { RoosterCapacityBanner } from "./RoosterCapacityBanner";

interface Props {
  /**
   * Een datum binnen de gewenste week (yyyy-mm-dd). De view berekent de
   * maandag van die week en toont Ma t/m Zo. De prop heet `date` omdat de
   * wrapper (RoosterTab) dezelfde datum doorstuurt naar zowel Dag- als
   * Weekweergave; de Weekweergave snapt die als "week die deze datum bevat".
   */
  date: string;
}

interface CellKey {
  driverId: string;
  date: string;
}

function keyOf(c: CellKey): string {
  return `${c.driverId}|${c.date}`;
}

function parseKey(k: string): CellKey {
  const [driverId, date] = k.split("|");
  return { driverId, date };
}

function abbreviate(name: string): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function isWeekend(date: string): boolean {
  const d = parseISO(date).getDay();
  return d === 0 || d === 6;
}

const FALLBACK_SORT = Number.MAX_SAFE_INTEGER;

export function RoosterWeekView({ date }: Props) {
  const isMobile = useIsMobile();

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

  const dayDates = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        format(addDays(parseISO(weekStart), i), "yyyy-MM-dd"),
      ),
    [weekStart],
  );

  const { data: driversAll = [] } = useDrivers();
  const { templates } = useShiftTemplates();
  const { data: vehicles = [] } = useVehiclesRaw();
  const { schedules, upsertSchedule } = useDriverSchedules(weekStart, weekEnd);

  const templateById = useMemo(() => {
    const m = new Map<string, ShiftTemplate>();
    for (const t of templates) m.set(t.id, t);
    return m;
  }, [templates]);

  const vehicleById = useMemo(() => {
    const m = new Map<string, RawVehicle>();
    for (const v of vehicles) m.set(v.id, v);
    return m;
  }, [vehicles]);

  const scheduleByKey = useMemo(() => {
    const m = new Map<string, DriverSchedule>();
    for (const s of schedules) m.set(`${s.driver_id}|${s.date}`, s);
    return m;
  }, [schedules]);

  // Per chauffeur het meest voorkomende shift_template_id over zijn 7 cellen
  // -> daaruit de bijbehorende sort_order. Chauffeurs zonder enige cel of
  // zonder ingevuld template krijgen een sort_order van FALLBACK_SORT en
  // belanden onderaan; bij gelijkstand sorteren we alfabetisch op naam.
  const activeDrivers = useMemo(() => {
    const onlyActive = driversAll.filter((d) => d.is_active);

    function modeSortOrder(driverId: string): number {
      const counts = new Map<string, number>();
      for (const d of dayDates) {
        const s = scheduleByKey.get(`${driverId}|${d}`);
        const tplId = s?.shift_template_id ?? null;
        if (!tplId) continue;
        counts.set(tplId, (counts.get(tplId) ?? 0) + 1);
      }
      if (counts.size === 0) return FALLBACK_SORT;
      let bestId: string | null = null;
      let bestCount = -1;
      for (const [id, c] of counts.entries()) {
        if (c > bestCount) {
          bestId = id;
          bestCount = c;
        }
      }
      const tpl = bestId ? templateById.get(bestId) : null;
      return tpl ? tpl.sort_order : FALLBACK_SORT;
    }

    const decorated = onlyActive.map((d) => ({
      driver: d,
      sort: modeSortOrder(d.id),
    }));
    decorated.sort((a, b) => {
      if (a.sort !== b.sort) return a.sort - b.sort;
      return a.driver.name.localeCompare(b.driver.name);
    });
    return decorated.map((x) => x.driver);
  }, [driversAll, dayDates, scheduleByKey, templateById]);

  const driverNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of driversAll) m.set(d.id, d.name);
    return m;
  }, [driversAll]);

  const vehicleLabels = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of vehicles) m.set(v.id, v.code);
    return m;
  }, [vehicles]);

  // Set met `vehicleId|date` waar een conflict zit, zodat we cellen rood
  // kunnen randen. Per dag groeperen we via findVehicleConflictsOnDate.
  const conflictCells = useMemo(() => {
    const set = new Set<string>();
    for (const d of dayDates) {
      const dayRows = schedules.filter((s) => s.date === d);
      const conflicts = findVehicleConflictsOnDate(dayRows);
      conflicts.forEach((rows) => {
        for (const r of rows) {
          set.add(`${r.driver_id}|${r.date}`);
        }
      });
    }
    return set;
  }, [schedules, dayDates]);

  const [openCell, setOpenCell] = useState<CellKey | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  async function copyScheduleTo(source: DriverSchedule, target: CellKey) {
    try {
      await upsertSchedule.mutateAsync({
        driver_id: target.driverId,
        date: target.date,
        shift_template_id: source.shift_template_id,
        start_time: source.start_time,
        end_time: source.end_time,
        vehicle_id: source.vehicle_id,
        status: source.status,
        notitie: source.notitie,
      } as DriverScheduleUpsert);
      toast.success("Rooster gekopieerd");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "onbekende fout";
      toast.error("Kopieren mislukt: " + msg);
    }
  }

  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const src = parseKey(active.id as string);
    const tgt = parseKey(over.id as string);
    if (src.driverId === tgt.driverId && src.date === tgt.date) return;
    const source = scheduleByKey.get(keyOf(src));
    if (!source) return;
    await copyScheduleTo(source, tgt);
  }

  if (activeDrivers.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[hsl(var(--gold)/0.3)] bg-[hsl(var(--gold-soft)/0.2)] p-8 text-center text-sm text-muted-foreground">
        Geen actieve chauffeurs. Voeg eerst chauffeurs toe via Chauffeurs.
      </div>
    );
  }

  const matrix = (
    <div className="rounded-xl border border-[hsl(var(--gold)/0.2)] bg-card overflow-x-auto shadow-[inset_0_1px_0_var(--inset-highlight)]">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-[hsl(var(--gold-soft)/0.35)]">
            <th
              className="sticky left-0 z-10 bg-[hsl(var(--gold-soft)/0.35)] text-left px-3 py-2.5 border-r border-[hsl(var(--gold)/0.2)] min-w-[140px] md:min-w-[180px] text-xs uppercase tracking-[0.18em] font-semibold text-[hsl(var(--gold-deep))]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Chauffeur
            </th>
            {dayDates.map((d) => {
              const weekend = isWeekend(d);
              return (
                <th
                  key={d}
                  className={cn(
                    "px-2 py-2.5 border-r border-[hsl(var(--gold)/0.15)] last:border-r-0 min-w-[120px] md:min-w-[140px] text-[hsl(var(--gold-deep))]",
                    weekend && "bg-[hsl(var(--gold-soft)/0.65)]",
                  )}
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  <div className="text-xs uppercase tracking-[0.18em] font-semibold capitalize">
                    {format(parseISO(d), "EEE", { locale: nl })}
                  </div>
                  <div
                    className="text-[11px] font-normal text-muted-foreground/80 mt-0.5"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {format(parseISO(d), "d MMM", { locale: nl })}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {activeDrivers.map((driver) => (
            <tr
              key={driver.id}
              className="border-t border-[hsl(var(--gold)/0.12)]"
            >
              <td
                className="sticky left-0 z-10 bg-card px-3 py-1.5 text-sm font-semibold text-[hsl(var(--gold-deep))] border-r border-[hsl(var(--gold)/0.2)] whitespace-nowrap"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {driver.name}
              </td>
              {dayDates.map((cellDate) => (
                <WeekCell
                  key={cellDate}
                  driver={driver}
                  date={cellDate}
                  schedule={scheduleByKey.get(`${driver.id}|${cellDate}`)}
                  templateById={templateById}
                  vehicleById={vehicleById}
                  hasConflict={conflictCells.has(`${driver.id}|${cellDate}`)}
                  isOpen={
                    openCell?.driverId === driver.id &&
                    openCell?.date === cellDate
                  }
                  onOpenChange={(open) =>
                    setOpenCell(
                      open ? { driverId: driver.id, date: cellDate } : null,
                    )
                  }
                  weekStart={weekStart}
                  weekEnd={weekEnd}
                  dayDates={dayDates}
                  onCopyTo={copyScheduleTo}
                  dragDisabled={isMobile}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="card--luxe p-4 md:p-5 space-y-3">
      <RoosterConflictBanner
        schedules={schedules}
        driverNames={driverNames}
        vehicleLabels={vehicleLabels}
      />
      <RoosterCapacityBanner from={weekStart} to={weekEnd} />
      {isMobile ? (
        // Op smal scherm: drag-drop uit, alleen horizontaal scrollen + de
        // "Kopieer naar"-menu in de cel-popover. Dat voorkomt dat een
        // scroll-gebaar per ongeluk een drag start.
        matrix
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          {matrix}
        </DndContext>
      )}
    </div>
  );
}

interface WeekCellProps {
  driver: Driver;
  date: string;
  schedule: DriverSchedule | undefined;
  templateById: Map<string, ShiftTemplate>;
  vehicleById: Map<string, RawVehicle>;
  hasConflict: boolean;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  weekStart: string;
  weekEnd: string;
  dayDates: string[];
  onCopyTo: (src: DriverSchedule, target: CellKey) => Promise<void>;
  dragDisabled: boolean;
}

function WeekCell({
  driver,
  date,
  schedule,
  templateById,
  vehicleById,
  hasConflict,
  isOpen,
  onOpenChange,
  weekStart,
  weekEnd,
  dayDates,
  onCopyTo,
  dragDisabled,
}: WeekCellProps) {
  const cellId = `${driver.id}|${date}`;
  const weekend = isWeekend(date);

  return dragDisabled ? (
    <WeekCellInner
      cellId={cellId}
      driver={driver}
      date={date}
      schedule={schedule}
      templateById={templateById}
      vehicleById={vehicleById}
      hasConflict={hasConflict}
      weekend={weekend}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      weekStart={weekStart}
      weekEnd={weekEnd}
      dayDates={dayDates}
      onCopyTo={onCopyTo}
    />
  ) : (
    <WeekCellWithDnd
      cellId={cellId}
      driver={driver}
      date={date}
      schedule={schedule}
      templateById={templateById}
      vehicleById={vehicleById}
      hasConflict={hasConflict}
      weekend={weekend}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      weekStart={weekStart}
      weekEnd={weekEnd}
      dayDates={dayDates}
      onCopyTo={onCopyTo}
    />
  );
}

interface WeekCellInternalProps {
  cellId: string;
  driver: Driver;
  date: string;
  schedule: DriverSchedule | undefined;
  templateById: Map<string, ShiftTemplate>;
  vehicleById: Map<string, RawVehicle>;
  hasConflict: boolean;
  weekend: boolean;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  weekStart: string;
  weekEnd: string;
  dayDates: string[];
  onCopyTo: (src: DriverSchedule, target: CellKey) => Promise<void>;
}

function WeekCellWithDnd(props: WeekCellInternalProps) {
  const { cellId, schedule } = props;
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: cellId });
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: cellId,
    disabled: !schedule,
  });

  function setRefs(el: HTMLElement | null) {
    setDropRef(el);
    setDragRef(el);
  }

  return (
    <WeekCellBody
      {...props}
      setRefs={setRefs}
      dragAttributes={attributes}
      dragListeners={listeners}
      isOver={isOver}
      isDragging={isDragging}
    />
  );
}

function WeekCellInner(props: WeekCellInternalProps) {
  return (
    <WeekCellBody
      {...props}
      setRefs={() => {}}
      dragAttributes={{}}
      dragListeners={{}}
      isOver={false}
      isDragging={false}
    />
  );
}

interface WeekCellBodyProps extends WeekCellInternalProps {
  setRefs: (el: HTMLElement | null) => void;
  dragAttributes: Record<string, unknown>;
  dragListeners: Record<string, unknown>;
  isOver: boolean;
  isDragging: boolean;
}

function WeekCellBody({
  driver,
  date,
  schedule,
  templateById,
  vehicleById,
  hasConflict,
  weekend,
  isOpen,
  onOpenChange,
  weekStart,
  weekEnd,
  dayDates,
  onCopyTo,
  setRefs,
  dragAttributes,
  dragListeners,
  isOver,
  isDragging,
}: WeekCellBodyProps) {
  const template = schedule?.shift_template_id
    ? templateById.get(schedule.shift_template_id) ?? null
    : null;
  const vehicle = schedule?.vehicle_id
    ? vehicleById.get(schedule.vehicle_id) ?? null
    : null;

  const status = schedule?.status ?? null;
  const statusLabel = status ? DRIVER_SCHEDULE_STATUS_LABELS[status] : null;
  const showStatusInstead = status && status !== "werkt";

  const effectiveStart =
    schedule?.start_time ?? template?.default_start_time ?? null;

  const bgColor = template?.color ?? null;

  // Cel-achtergrond:
  // - gevulde "werkt"-cel zonder template-kleur: subtiele gold-gradient.
  // - status != "werkt": rustiger muted achtergrond.
  // - met template-kleur: linker 3px strookje + lichte tint van die kleur,
  //   bovenop een gold-gradient zodat het thema consistent blijft.
  const cellStyle: CSSProperties | undefined = (() => {
    if (hasConflict) return undefined;
    if (showStatusInstead) return undefined;
    if (bgColor) {
      return {
        borderLeft: `3px solid ${bgColor}`,
        background: `linear-gradient(180deg, hsl(var(--card)) 0%, ${bgColor}1f 100%)`,
      };
    }
    if (schedule) {
      return {
        background:
          "linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--gold-soft) / 0.18) 100%)",
      };
    }
    return undefined;
  })();

  return (
    <td
      className={cn(
        "align-top border-r border-[hsl(var(--gold)/0.12)] last:border-r-0 p-1 min-w-[120px] md:min-w-[140px]",
        weekend && "bg-[hsl(var(--gold-soft)/0.4)]",
      )}
    >
      <Popover open={isOpen} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <div
            ref={setRefs}
            {...dragAttributes}
            {...dragListeners}
            className={cn(
              "relative group rounded-md border border-transparent px-2 py-1.5 min-h-[52px] cursor-pointer transition",
              schedule
                ? "hover:border-[hsl(var(--gold)/0.35)] hover:shadow-[0_2px_10px_-4px_hsl(var(--gold)/0.25)]"
                : "hover:border-[hsl(var(--gold)/0.3)] hover:bg-[hsl(var(--gold-soft)/0.35)]",
              schedule && showStatusInstead && "bg-muted/40",
              isDragging &&
                "opacity-50 ring-2 ring-[hsl(var(--gold)/0.5)] ring-offset-1",
              isOver && "bg-[hsl(var(--gold-soft)/0.5)] border-[hsl(var(--gold)/0.45)]",
              hasConflict &&
                "border-destructive/60 bg-[linear-gradient(180deg,hsl(var(--destructive)/0.05)_0%,hsl(var(--gold-soft)/0.2)_100%)]",
            )}
            style={cellStyle}
          >
            {!schedule && (
              <div
                className="flex items-center justify-center text-[hsl(var(--gold)/0.35)] opacity-0 group-hover:opacity-100 transition text-base leading-none h-full min-h-[36px]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                +
              </div>
            )}
            {schedule && showStatusInstead && (
              <div className="flex items-center justify-between gap-1">
                <span
                  className="text-xs font-semibold uppercase tracking-[0.1em] text-foreground"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {statusLabel}
                </span>
                {schedule.notitie ? (
                  <span
                    className="text-[10px] text-muted-foreground truncate max-w-[60px]"
                    title={schedule.notitie}
                  >
                    {schedule.notitie}
                  </span>
                ) : null}
              </div>
            )}
            {schedule && !showStatusInstead && (
              <div className="space-y-0.5">
                <div className="flex items-center justify-between gap-1">
                  <span
                    className="text-xs font-semibold truncate text-foreground"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {template ? abbreviate(template.name) : "Werkt"}
                  </span>
                  {effectiveStart && (
                    <span
                      className="text-[11px] font-bold text-[hsl(var(--gold-deep))]"
                      style={{
                        fontFamily: "var(--font-display)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {effectiveStart.slice(0, 5)}
                    </span>
                  )}
                </div>
                {vehicle && (
                  <div
                    className="text-[11px] text-muted-foreground truncate uppercase"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontVariantNumeric: "tabular-nums",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {vehicle.code}
                  </div>
                )}
              </div>
            )}

            {schedule && (
              <CellActionsMenu
                schedule={schedule}
                driverId={driver.id}
                currentDate={date}
                dayDates={dayDates}
                onCopyTo={onCopyTo}
              />
            )}
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0 border-0 bg-transparent shadow-none" align="start">
          <RoosterCellEditor
            driver={driver}
            date={date}
            weekStart={weekStart}
            weekEnd={weekEnd}
            existingSchedule={schedule}
            onClose={() => onOpenChange(false)}
          />
        </PopoverContent>
      </Popover>
    </td>
  );
}

interface CellActionsMenuProps {
  schedule: DriverSchedule;
  driverId: string;
  currentDate: string;
  dayDates: string[];
  onCopyTo: (src: DriverSchedule, target: CellKey) => Promise<void>;
}

function CellActionsMenu({
  schedule,
  driverId,
  currentDate,
  dayDates,
  onCopyTo,
}: CellActionsMenuProps) {
  const { deleteSchedule } = useDriverSchedulesDeleteOnly();

  const otherDays = dayDates.filter((d) => d !== currentDate);

  async function handleDelete() {
    try {
      await deleteSchedule(schedule.id);
      toast.success("Rooster gewist");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "onbekende fout";
      toast.error("Wissen mislukt: " + msg);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute top-0.5 right-0.5 rounded p-0.5 text-muted-foreground/70 opacity-0 group-hover:opacity-100 hover:bg-[hsl(var(--gold-soft)/0.6)] hover:text-[hsl(var(--gold-deep))] transition"
          aria-label="Cel-acties"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <DropdownMenuLabel className="text-xs">Cel-acties</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="text-sm">
            Kopieer naar
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {otherDays.map((d) => (
              <DropdownMenuItem
                key={d}
                className="text-sm capitalize"
                onClick={() =>
                  onCopyTo(schedule, { driverId, date: d })
                }
              >
                {format(parseISO(d), "EEEE d MMM", { locale: nl })}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-sm text-destructive focus:text-destructive"
          onClick={handleDelete}
        >
          Wis rooster
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Mini-hook die alleen de delete-mutatie blootlegt. Voorkomt dat elke cel
 * een volledige range-query opnieuw start; we hebben de invalidate-flow al via
 * de parent.
 */
function useDriverSchedulesDeleteOnly() {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("driver_schedules")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["driver-schedules"] });
      qc.invalidateQueries({ queryKey: ["driver-schedule-for-date"] });
    },
  });
  return { deleteSchedule: mutation.mutateAsync };
}
