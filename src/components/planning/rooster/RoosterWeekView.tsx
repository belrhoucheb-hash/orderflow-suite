import { useMemo, useState } from "react";
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
import type {
  DriverSchedule,
  DriverScheduleUpsert,
  ShiftTemplate,
} from "@/types/rooster";
import { DRIVER_SCHEDULE_STATUS_LABELS } from "@/types/rooster";

import { RoosterCellEditor } from "./RoosterCellEditor";

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

export function RoosterWeekView({ date }: Props) {
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

  const activeDrivers = useMemo(
    () =>
      driversAll
        .filter((d) => d.is_active)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [driversAll],
  );

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
      <div className="rounded-xl border border-dashed border-border/50 bg-muted/20 p-8 text-center text-sm text-muted-foreground">
        Geen actieve chauffeurs. Voeg eerst chauffeurs toe via Chauffeurs.
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="rounded-xl border border-border/40 bg-card overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/40">
              <th className="sticky left-0 z-10 bg-muted/40 text-left px-3 py-2 font-medium text-xs text-muted-foreground border-r border-border/40 min-w-[180px]">
                Chauffeur
              </th>
              {dayDates.map((d) => {
                const weekend = isWeekend(d);
                return (
                  <th
                    key={d}
                    className={cn(
                      "px-2 py-2 text-xs font-medium text-muted-foreground border-r border-border/40 last:border-r-0 min-w-[140px]",
                      weekend && "bg-muted/60",
                    )}
                  >
                    <div className="capitalize">
                      {format(parseISO(d), "EEE", { locale: nl })}
                    </div>
                    <div className="text-[11px] text-muted-foreground/70 font-normal">
                      {format(parseISO(d), "d MMM", { locale: nl })}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {activeDrivers.map((driver) => (
              <tr key={driver.id} className="border-t border-border/40">
                <td className="sticky left-0 z-10 bg-card px-3 py-1.5 text-sm font-medium border-r border-border/40 whitespace-nowrap">
                  {driver.name}
                </td>
                {dayDates.map((date) => (
                  <WeekCell
                    key={date}
                    driver={driver}
                    date={date}
                    schedule={scheduleByKey.get(`${driver.id}|${date}`)}
                    templateById={templateById}
                    vehicleById={vehicleById}
                    isOpen={
                      openCell?.driverId === driver.id && openCell?.date === date
                    }
                    onOpenChange={(open) =>
                      setOpenCell(open ? { driverId: driver.id, date } : null)
                    }
                    weekStart={weekStart}
                    weekEnd={weekEnd}
                    dayDates={dayDates}
                    onCopyTo={copyScheduleTo}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DndContext>
  );
}

interface WeekCellProps {
  driver: Driver;
  date: string;
  schedule: DriverSchedule | undefined;
  templateById: Map<string, ShiftTemplate>;
  vehicleById: Map<string, RawVehicle>;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  weekStart: string;
  weekEnd: string;
  dayDates: string[];
  onCopyTo: (src: DriverSchedule, target: CellKey) => Promise<void>;
}

function WeekCell({
  driver,
  date,
  schedule,
  templateById,
  vehicleById,
  isOpen,
  onOpenChange,
  weekStart,
  weekEnd,
  dayDates,
  onCopyTo,
}: WeekCellProps) {
  const cellId = `${driver.id}|${date}`;
  const weekend = isWeekend(date);

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

  function setRefs(el: HTMLElement | null) {
    setDropRef(el);
    setDragRef(el);
  }

  return (
    <td
      className={cn(
        "align-top border-r border-border/40 last:border-r-0 p-1 min-w-[140px]",
        weekend && "bg-muted/30",
      )}
    >
      <Popover open={isOpen} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <div
            ref={setRefs}
            {...attributes}
            {...listeners}
            className={cn(
              "relative group rounded-md border border-transparent px-2 py-1.5 min-h-[52px] cursor-pointer transition",
              schedule
                ? "hover:border-border/60"
                : "hover:border-border/40 hover:bg-muted/40",
              isDragging && "opacity-40",
              isOver && "ring-2 ring-primary/40 bg-primary/[0.04]",
            )}
            style={
              bgColor && !showStatusInstead
                ? {
                    borderLeft: `3px solid ${bgColor}`,
                    background: `${bgColor}14`,
                  }
                : undefined
            }
          >
            {!schedule && (
              <div className="text-[11px] text-muted-foreground/60 italic">
                ,
              </div>
            )}
            {schedule && showStatusInstead && (
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-semibold text-foreground">
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
                  <span className="text-xs font-semibold truncate">
                    {template ? abbreviate(template.name) : "Werkt"}
                  </span>
                  {effectiveStart && (
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {effectiveStart.slice(0, 5)}
                    </span>
                  )}
                </div>
                {vehicle && (
                  <div className="text-[11px] text-muted-foreground truncate">
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
        <PopoverContent className="w-80" align="start">
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
          className="absolute top-0.5 right-0.5 rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-background/60 hover:text-foreground transition"
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
