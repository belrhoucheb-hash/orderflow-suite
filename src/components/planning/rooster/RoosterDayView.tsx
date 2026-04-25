import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eye, Printer, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { LoadingState } from "@/components/ui/LoadingState";
import { cn } from "@/lib/utils";

import { useDrivers } from "@/hooks/useDrivers";
import { useShiftTemplates } from "@/hooks/useShiftTemplates";
import { useDriverSchedules } from "@/hooks/useDriverSchedules";
import { useVehiclesRaw } from "@/hooks/useVehiclesRaw";

import {
  DRIVER_SCHEDULE_STATUSES,
  DRIVER_SCHEDULE_STATUS_LABELS,
  type DriverSchedule,
  type DriverScheduleStatus,
} from "@/types/rooster";

import { exportDayRosterPdf } from "./RoosterPdfExport";
import { RoosterConflictBanner } from "./RoosterConflictBanner";

// Radix Select staat geen lege string toe als item-value, dus sentinel.
const NONE = "__none__";

const SHOW_END_TIME_LS_KEY = "rooster-day-show-end-time";

// Gedeelde luxe-stijlen voor SelectTrigger en time/text Inputs binnen de tabel.
// Gold-tint border, subtiele gradient, font-display voor consistentie met
// PlanningV2. Tijden krijgen extra `tabular-nums` voor uitlijning.
const LUXE_TRIGGER_CLASS =
  "h-9 text-xs border-[hsl(var(--gold)/0.25)] bg-gradient-to-b from-[hsl(var(--card))] to-[hsl(var(--gold-soft)/0.2)] hover:border-[hsl(var(--gold)/0.5)] focus:border-[hsl(var(--gold)/0.55)] focus:ring-[hsl(var(--gold)/0.2)]";
const LUXE_INPUT_CLASS =
  "h-9 text-xs border-[hsl(var(--gold)/0.25)] bg-gradient-to-b from-[hsl(var(--card))] to-[hsl(var(--gold-soft)/0.2)] hover:border-[hsl(var(--gold)/0.5)] focus-visible:border-[hsl(var(--gold)/0.55)] focus-visible:ring-[hsl(var(--gold)/0.2)]";
const LUXE_TIME_CLASS =
  "h-9 text-xs border-[hsl(var(--gold)/0.25)] bg-gradient-to-b from-[hsl(var(--card))] to-[hsl(var(--gold-soft)/0.2)] hover:border-[hsl(var(--gold)/0.5)] focus-visible:border-[hsl(var(--gold)/0.55)] focus-visible:ring-[hsl(var(--gold)/0.2)] tabular-nums";

const LUXE_TIME_STYLE = {
  fontFamily: "var(--font-display)",
} as const;
const LUXE_DISPLAY_STYLE = {
  fontFamily: "var(--font-display)",
} as const;

interface RoosterDayViewProps {
  date: string;
}

type Patch = {
  shift_template_id?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  vehicle_id?: string | null;
  status?: DriverScheduleStatus;
  notitie?: string | null;
};

/**
 * Dag-view van het rooster. Rijen = alle actieve chauffeurs. Wijzigingen worden
 * direct (status) of na 500ms debounce (overige velden) opgeslagen via upsert
 * op (tenant, driver, date).
 */
export function RoosterDayView({ date }: RoosterDayViewProps) {
  const { data: drivers = [], isLoading: driversLoading } = useDrivers();
  const { templates, isLoading: templatesLoading } = useShiftTemplates();
  const { data: vehicles = [], isLoading: vehiclesLoading } = useVehiclesRaw();
  const {
    schedules,
    isLoading: schedulesLoading,
    upsertSchedule,
    deleteSchedule,
  } = useDriverSchedules(date, date);

  // Filter-toggle: ook chauffeurs zonder rooster-rij tonen?
  const [showUnplanned, setShowUnplanned] = useState(false);

  // Eind-kolom is opt-in en persist in localStorage.
  const [showEndTime, setShowEndTime] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(SHOW_END_TIME_LS_KEY) === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(SHOW_END_TIME_LS_KEY, String(showEndTime));
    } catch {
      // Stil falen, localStorage kan geblokkeerd zijn.
    }
  }, [showEndTime]);

  // Debounce-timers per driver_id voor field-level updates
  const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  // Lokale schaduw-state voor directe input-responsiviteit. Key = driver_id,
  // value = de laatste patch die nog onderweg is naar de DB (of al opgeslagen).
  const [localPatches, setLocalPatches] = useState<Record<string, Patch>>({});

  useEffect(() => {
    // Bij datum-wissel: lokale patches loslaten zodat de DB-waarde leidend is.
    setLocalPatches({});
    for (const t of debounceTimers.current.values()) clearTimeout(t);
    debounceTimers.current.clear();
  }, [date]);

  const scheduleByDriver = useMemo(() => {
    const map = new Map<string, DriverSchedule>();
    for (const s of schedules) map.set(s.driver_id, s);
    return map;
  }, [schedules]);

  const driverNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of drivers) map.set(d.id, d.name);
    return map;
  }, [drivers]);

  const vehicleLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const v of vehicles) {
      const label = v.plate ? `${v.plate} (${v.code})` : v.code;
      map.set(v.id, label);
    }
    return map;
  }, [vehicles]);

  const activeDrivers = useMemo(
    () => drivers.filter((d) => d.is_active !== false),
    [drivers],
  );

  // Sorteer op rooster-template sort_order, daarna op naam. Chauffeurs zonder
  // rooster-rij komen onderaan.
  const sortedDrivers = useMemo(() => {
    const sortOrderById = new Map<string, number>();
    for (const t of templates) sortOrderById.set(t.id, t.sort_order ?? 0);

    return [...activeDrivers].sort((a, b) => {
      const sa = scheduleByDriver.get(a.id);
      const sb = scheduleByDriver.get(b.id);

      const aHasSchedule = !!sa;
      const bHasSchedule = !!sb;
      if (aHasSchedule !== bHasSchedule) {
        return aHasSchedule ? -1 : 1;
      }

      const aOrder = sa?.shift_template_id
        ? sortOrderById.get(sa.shift_template_id) ?? Number.MAX_SAFE_INTEGER
        : Number.MAX_SAFE_INTEGER;
      const bOrder = sb?.shift_template_id
        ? sortOrderById.get(sb.shift_template_id) ?? Number.MAX_SAFE_INTEGER
        : Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;

      return a.name.localeCompare(b.name, "nl");
    });
  }, [activeDrivers, scheduleByDriver, templates]);

  // Filter op zichtbare rijen: standaard alleen chauffeurs met een rij.
  const visibleDrivers = useMemo(() => {
    if (showUnplanned) return sortedDrivers;
    return sortedDrivers.filter((d) => scheduleByDriver.has(d.id));
  }, [sortedDrivers, scheduleByDriver, showUnplanned]);

  const runUpsert = useCallback(
    (driverId: string, patch: Patch) => {
      const current = scheduleByDriver.get(driverId);

      // Start met de huidige DB-waarden (of default) en overschrijf alleen velden
      // die in `patch` expliciet aanwezig zijn, zodat een expliciete `null` een
      // gevulde DB-waarde daadwerkelijk wist.
      const base: Required<Patch> = {
        shift_template_id: current?.shift_template_id ?? null,
        start_time: current?.start_time ?? null,
        end_time: current?.end_time ?? null,
        vehicle_id: current?.vehicle_id ?? null,
        status: current?.status ?? "werkt",
        notitie: current?.notitie ?? null,
      };
      const merged: Required<Patch> = { ...base };
      (Object.keys(patch) as (keyof Patch)[]).forEach((key) => {
        if (key === "status") {
          merged.status = patch.status ?? base.status;
        } else {
          (merged as Record<string, unknown>)[key] =
            (patch as Record<string, unknown>)[key] ?? null;
        }
      });

      upsertSchedule.mutate(
        {
          driver_id: driverId,
          date,
          shift_template_id: merged.shift_template_id,
          start_time: merged.start_time,
          end_time: merged.end_time,
          vehicle_id: merged.vehicle_id,
          status: merged.status,
          notitie: merged.notitie,
        },
        {
          onError: (err: Error) => {
            toast.error("Opslaan mislukt", {
              description: err?.message ?? "Kon rooster-rij niet opslaan.",
            });
          },
        },
      );
    },
    [date, scheduleByDriver, upsertSchedule],
  );

  const schedulePatch = useCallback(
    (driverId: string, patch: Patch, immediate: boolean) => {
      setLocalPatches((prev) => ({
        ...prev,
        [driverId]: { ...(prev[driverId] ?? {}), ...patch },
      }));

      const existing = debounceTimers.current.get(driverId);
      if (existing) clearTimeout(existing);

      if (immediate) {
        runUpsert(driverId, patch);
        return;
      }

      const t = setTimeout(() => {
        runUpsert(driverId, patch);
        debounceTimers.current.delete(driverId);
      }, 500);
      debounceTimers.current.set(driverId, t);
    },
    [runUpsert],
  );

  const handleDelete = useCallback(
    (driverId: string) => {
      const schedule = scheduleByDriver.get(driverId);
      if (!schedule) return;
      const existing = debounceTimers.current.get(driverId);
      if (existing) clearTimeout(existing);
      debounceTimers.current.delete(driverId);
      setLocalPatches((prev) => {
        const next = { ...prev };
        delete next[driverId];
        return next;
      });
      deleteSchedule.mutate(schedule.id, {
        onError: (err: Error) => {
          toast.error("Verwijderen mislukt", {
            description: err?.message ?? "Kon rij niet verwijderen.",
          });
        },
      });
    },
    [deleteSchedule, scheduleByDriver],
  );

  const handlePrint = useCallback(
    async (includeFreeDays: boolean) => {
      try {
        await exportDayRosterPdf(date, schedules, drivers, vehicles, templates, {
          includeFreeDays,
        });
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Kon PDF niet genereren.";
        toast.error("PDF mislukt", { description: msg });
      }
    },
    [date, schedules, drivers, vehicles, templates],
  );

  const loading =
    driversLoading || templatesLoading || vehiclesLoading || schedulesLoading;

  // Helper: bouwt de "effective" view-state per chauffeur (DB + lokale patch).
  const computeEffective = useCallback(
    (driverId: string) => {
      const dbSchedule = scheduleByDriver.get(driverId);
      const patch = localPatches[driverId] ?? {};

      const effective = {
        shift_template_id:
          "shift_template_id" in patch
            ? (patch.shift_template_id ?? null)
            : dbSchedule?.shift_template_id ?? null,
        start_time:
          "start_time" in patch
            ? (patch.start_time ?? null)
            : dbSchedule?.start_time ?? null,
        end_time:
          "end_time" in patch
            ? (patch.end_time ?? null)
            : dbSchedule?.end_time ?? null,
        vehicle_id:
          "vehicle_id" in patch
            ? (patch.vehicle_id ?? null)
            : dbSchedule?.vehicle_id ?? null,
        status: (patch.status ??
          dbSchedule?.status ??
          "werkt") as DriverScheduleStatus,
        notitie:
          "notitie" in patch
            ? (patch.notitie ?? null)
            : dbSchedule?.notitie ?? null,
      };

      const template = effective.shift_template_id
        ? templates.find((t) => t.id === effective.shift_template_id) ?? null
        : null;

      const isEmpty = !dbSchedule && Object.keys(patch).length === 0;

      return { dbSchedule, effective, template, isEmpty };
    },
    [scheduleByDriver, localPatches, templates],
  );

  return (
    <div className="card--luxe p-5 md:p-6 flex flex-col gap-4">
      <RoosterConflictBanner
        schedules={schedules}
        date={date}
        driverNames={driverNames}
        vehicleLabels={vehicleLabels}
      />

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <Switch
            checked={showUnplanned}
            onCheckedChange={setShowUnplanned}
          />
          Toon ook niet-geplande chauffeurs
        </label>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="btn-luxe"
                title="Weergave-opties"
              >
                <Settings2 className="h-4 w-4" />
                Weergave
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="text-xs">
                Kolommen
              </DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={showEndTime}
                onCheckedChange={(v) => setShowEndTime(v === true)}
              >
                Toon eindtijd
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="btn-luxe"
                disabled={loading || schedules.length === 0}
              >
                <Printer className="h-4 w-4" />
                Print rooster
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handlePrint(false)}>
                Print rooster (alleen werkende chauffeurs)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handlePrint(true)}>
                Print volledig rooster (incl. vrij/ziek)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {loading ? (
        <LoadingState message="Rooster laden..." />
      ) : activeDrivers.length === 0 ? (
        <div className="text-sm text-muted-foreground py-6 text-center border border-[hsl(var(--gold)/0.2)] rounded-md">
          Geen actieve chauffeurs gevonden.
        </div>
      ) : visibleDrivers.length === 0 ? (
        <div className="text-sm text-muted-foreground py-6 text-center border border-[hsl(var(--gold)/0.2)] rounded-md flex flex-col items-center gap-2">
          <span>Geen geplande chauffeurs voor deze dag.</span>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => setShowUnplanned(true)}
          >
            <Eye className="h-3.5 w-3.5" />
            Toon alle chauffeurs
          </Button>
        </div>
      ) : (
        <>
          {/* Tabel-view (sm en hoger) — luxe styling */}
          <div className="hidden sm:block border border-[hsl(var(--gold)/0.2)] rounded-xl overflow-hidden bg-card">
            <Table>
              <TableHeader className="bg-[hsl(var(--gold-soft)/0.35)]">
                <TableRow className="border-b border-[hsl(var(--gold)/0.2)] hover:bg-transparent">
                  <TableHead
                    className="w-[180px] text-[10px] uppercase tracking-[0.14em] font-semibold text-[hsl(var(--gold-deep))]"
                    style={LUXE_DISPLAY_STYLE}
                  >
                    Naam
                  </TableHead>
                  <TableHead
                    className="w-[180px] text-[10px] uppercase tracking-[0.14em] font-semibold text-[hsl(var(--gold-deep))]"
                    style={LUXE_DISPLAY_STYLE}
                  >
                    Rooster
                  </TableHead>
                  <TableHead
                    className="w-[110px] text-[10px] uppercase tracking-[0.14em] font-semibold text-[hsl(var(--gold-deep))]"
                    style={LUXE_DISPLAY_STYLE}
                  >
                    Start
                  </TableHead>
                  {showEndTime && (
                    <TableHead
                      className="w-[110px] text-[10px] uppercase tracking-[0.14em] font-semibold text-[hsl(var(--gold-deep))]"
                      style={LUXE_DISPLAY_STYLE}
                    >
                      Eind
                    </TableHead>
                  )}
                  <TableHead
                    className="w-[160px] text-[10px] uppercase tracking-[0.14em] font-semibold text-[hsl(var(--gold-deep))]"
                    style={LUXE_DISPLAY_STYLE}
                  >
                    Voertuig
                  </TableHead>
                  <TableHead
                    className="w-[140px] text-[10px] uppercase tracking-[0.14em] font-semibold text-[hsl(var(--gold-deep))]"
                    style={LUXE_DISPLAY_STYLE}
                  >
                    Status
                  </TableHead>
                  <TableHead
                    className="text-[10px] uppercase tracking-[0.14em] font-semibold text-[hsl(var(--gold-deep))]"
                    style={LUXE_DISPLAY_STYLE}
                  >
                    Notitie
                  </TableHead>
                  <TableHead
                    className="w-[60px] text-right text-[10px] uppercase tracking-[0.14em] font-semibold text-[hsl(var(--gold-deep))]"
                    style={LUXE_DISPLAY_STYLE}
                  >
                    Actie
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleDrivers.map((driver) => {
                  const { effective, template, isEmpty } = computeEffective(
                    driver.id,
                  );
                  const startPlaceholder = template?.default_start_time ?? "";
                  const endPlaceholder = template?.default_end_time ?? "";
                  const working = effective.status === "werkt";
                  const dimmed = !working && !isEmpty;

                  return (
                    <TableRow
                      key={driver.id}
                      className={cn(
                        "border-b border-[hsl(var(--gold)/0.12)] last:border-b-0 transition-colors hover:bg-[hsl(var(--gold-soft)/0.25)]",
                        dimmed && "text-muted-foreground",
                      )}
                    >
                      <TableCell
                        className="font-semibold"
                        style={LUXE_DISPLAY_STYLE}
                      >
                        <div className="flex items-center gap-2">
                          {template && (
                            <span
                              aria-hidden="true"
                              className="inline-block h-2.5 w-2.5 rounded-full shrink-0 ring-1 ring-[hsl(var(--gold)/0.25)]"
                              style={{ backgroundColor: template.color }}
                            />
                          )}
                          <span className="truncate">{driver.name}</span>
                        </div>
                      </TableCell>

                      <TableCell>
                        <Select
                          value={effective.shift_template_id ?? NONE}
                          onValueChange={(v) =>
                            schedulePatch(
                              driver.id,
                              {
                                shift_template_id: v === NONE ? null : v,
                              },
                              false,
                            )
                          }
                        >
                          <SelectTrigger
                            className={LUXE_TRIGGER_CLASS}
                            style={LUXE_DISPLAY_STYLE}
                          >
                            <SelectValue placeholder="Geen" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE} className="text-xs">
                              Geen rooster
                            </SelectItem>
                            {templates.map((t) => (
                              <SelectItem
                                key={t.id}
                                value={t.id}
                                className="text-xs"
                              >
                                <span className="flex items-center gap-2">
                                  <span
                                    aria-hidden="true"
                                    className="inline-block h-2 w-2 rounded-full"
                                    style={{ backgroundColor: t.color }}
                                  />
                                  {t.name}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>

                      <TableCell>
                        {working ? (
                          <Input
                            type="time"
                            className={LUXE_TIME_CLASS}
                            style={LUXE_TIME_STYLE}
                            value={effective.start_time ?? ""}
                            placeholder={startPlaceholder}
                            onChange={(e) =>
                              schedulePatch(
                                driver.id,
                                { start_time: e.target.value || null },
                                false,
                              )
                            }
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            n.v.t.
                          </span>
                        )}
                      </TableCell>

                      {showEndTime && (
                        <TableCell>
                          {working ? (
                            <Input
                              type="time"
                              className={LUXE_TIME_CLASS}
                              style={LUXE_TIME_STYLE}
                              value={effective.end_time ?? ""}
                              placeholder={endPlaceholder}
                              onChange={(e) =>
                                schedulePatch(
                                  driver.id,
                                  { end_time: e.target.value || null },
                                  false,
                                )
                              }
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              n.v.t.
                            </span>
                          )}
                        </TableCell>
                      )}

                      <TableCell>
                        {working ? (
                          <Select
                            value={effective.vehicle_id ?? NONE}
                            onValueChange={(v) =>
                              schedulePatch(
                                driver.id,
                                { vehicle_id: v === NONE ? null : v },
                                false,
                              )
                            }
                          >
                            <SelectTrigger
                              className={cn(LUXE_TRIGGER_CLASS, "tabular-nums")}
                              style={LUXE_DISPLAY_STYLE}
                            >
                              <SelectValue placeholder="Geen" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE} className="text-xs">
                                Geen voertuig
                              </SelectItem>
                              {vehicles.map((v) => (
                                <SelectItem
                                  key={v.id}
                                  value={v.id}
                                  className="text-xs"
                                >
                                  {v.code}
                                  {v.plate ? ` (${v.plate})` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            n.v.t.
                          </span>
                        )}
                      </TableCell>

                      <TableCell>
                        <Select
                          value={effective.status}
                          onValueChange={(v) =>
                            schedulePatch(
                              driver.id,
                              { status: v as DriverScheduleStatus },
                              true,
                            )
                          }
                        >
                          <SelectTrigger
                            className={LUXE_TRIGGER_CLASS}
                            style={LUXE_DISPLAY_STYLE}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {DRIVER_SCHEDULE_STATUSES.map((s) => (
                              <SelectItem
                                key={s}
                                value={s}
                                className="text-xs"
                              >
                                {DRIVER_SCHEDULE_STATUS_LABELS[s]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>

                      <TableCell>
                        <Input
                          className={LUXE_INPUT_CLASS}
                          value={effective.notitie ?? ""}
                          placeholder="Notitie"
                          onChange={(e) =>
                            schedulePatch(
                              driver.id,
                              { notitie: e.target.value || null },
                              false,
                            )
                          }
                          maxLength={500}
                        />
                      </TableCell>

                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDelete(driver.id)}
                          disabled={isEmpty}
                          title="Rij wissen"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Kaart-view (mobiel, kleiner dan sm) */}
          <div className="sm:hidden flex flex-col gap-3">
            {visibleDrivers.map((driver) => {
              const { effective, template, isEmpty } = computeEffective(
                driver.id,
              );
              const startPlaceholder = template?.default_start_time ?? "";
              const endPlaceholder = template?.default_end_time ?? "";
              const working = effective.status === "werkt";
              const dimmed = !working && !isEmpty;

              return (
                <div
                  key={driver.id}
                  className={cn(
                    "border border-[hsl(var(--gold)/0.2)] rounded-xl p-3 bg-gradient-to-b from-[hsl(var(--card))] to-[hsl(var(--gold-soft)/0.15)] flex flex-col gap-3 shadow-[inset_0_1px_0_var(--inset-highlight)]",
                    dimmed && "text-muted-foreground",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {template && (
                        <span
                          aria-hidden="true"
                          className="inline-block h-2.5 w-2.5 rounded-full shrink-0 ring-1 ring-[hsl(var(--gold)/0.25)]"
                          style={{ backgroundColor: template.color }}
                        />
                      )}
                      <span
                        className="font-semibold truncate"
                        style={LUXE_DISPLAY_STYLE}
                      >
                        {driver.name}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0 hover:bg-destructive/10"
                      onClick={() => handleDelete(driver.id)}
                      disabled={isEmpty}
                      title="Rij wissen"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    <div className="flex flex-col gap-1">
                      <span
                        className="text-[10px] uppercase tracking-[0.14em] font-semibold text-[hsl(var(--gold-deep))]"
                        style={LUXE_DISPLAY_STYLE}
                      >
                        Rooster
                      </span>
                      <Select
                        value={effective.shift_template_id ?? NONE}
                        onValueChange={(v) =>
                          schedulePatch(
                            driver.id,
                            {
                              shift_template_id: v === NONE ? null : v,
                            },
                            false,
                          )
                        }
                      >
                        <SelectTrigger
                          className={LUXE_TRIGGER_CLASS}
                          style={LUXE_DISPLAY_STYLE}
                        >
                          <SelectValue placeholder="Geen" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE} className="text-xs">
                            Geen rooster
                          </SelectItem>
                          {templates.map((t) => (
                            <SelectItem
                              key={t.id}
                              value={t.id}
                              className="text-xs"
                            >
                              {t.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <span
                        className="text-[10px] uppercase tracking-[0.14em] font-semibold text-[hsl(var(--gold-deep))]"
                        style={LUXE_DISPLAY_STYLE}
                      >
                        Status
                      </span>
                      <Select
                        value={effective.status}
                        onValueChange={(v) =>
                          schedulePatch(
                            driver.id,
                            { status: v as DriverScheduleStatus },
                            true,
                          )
                        }
                      >
                        <SelectTrigger
                          className={LUXE_TRIGGER_CLASS}
                          style={LUXE_DISPLAY_STYLE}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DRIVER_SCHEDULE_STATUSES.map((s) => (
                            <SelectItem
                              key={s}
                              value={s}
                              className="text-xs"
                            >
                              {DRIVER_SCHEDULE_STATUS_LABELS[s]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {working && (
                      <div
                        className={cn(
                          "grid gap-2",
                          showEndTime ? "grid-cols-2" : "grid-cols-1",
                        )}
                      >
                        <div className="flex flex-col gap-1">
                          <span
                            className="text-[10px] uppercase tracking-[0.14em] font-semibold text-[hsl(var(--gold-deep))]"
                            style={LUXE_DISPLAY_STYLE}
                          >
                            Start
                          </span>
                          <Input
                            type="time"
                            className={LUXE_TIME_CLASS}
                            style={LUXE_TIME_STYLE}
                            value={effective.start_time ?? ""}
                            placeholder={startPlaceholder}
                            onChange={(e) =>
                              schedulePatch(
                                driver.id,
                                { start_time: e.target.value || null },
                                false,
                              )
                            }
                          />
                        </div>
                        {showEndTime && (
                          <div className="flex flex-col gap-1">
                            <span
                              className="text-[10px] uppercase tracking-[0.14em] font-semibold text-[hsl(var(--gold-deep))]"
                              style={LUXE_DISPLAY_STYLE}
                            >
                              Eind
                            </span>
                            <Input
                              type="time"
                              className={LUXE_TIME_CLASS}
                              style={LUXE_TIME_STYLE}
                              value={effective.end_time ?? ""}
                              placeholder={endPlaceholder}
                              onChange={(e) =>
                                schedulePatch(
                                  driver.id,
                                  { end_time: e.target.value || null },
                                  false,
                                )
                              }
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {working && (
                      <div className="flex flex-col gap-1">
                        <span
                          className="text-[10px] uppercase tracking-[0.14em] font-semibold text-[hsl(var(--gold-deep))]"
                          style={LUXE_DISPLAY_STYLE}
                        >
                          Voertuig
                        </span>
                        <Select
                          value={effective.vehicle_id ?? NONE}
                          onValueChange={(v) =>
                            schedulePatch(
                              driver.id,
                              { vehicle_id: v === NONE ? null : v },
                              false,
                            )
                          }
                        >
                          <SelectTrigger
                            className={LUXE_TRIGGER_CLASS}
                            style={LUXE_DISPLAY_STYLE}
                          >
                            <SelectValue placeholder="Geen" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE} className="text-xs">
                              Geen voertuig
                            </SelectItem>
                            {vehicles.map((v) => (
                              <SelectItem
                                key={v.id}
                                value={v.id}
                                className="text-xs"
                              >
                                {v.code}
                                {v.plate ? ` (${v.plate})` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div className="flex flex-col gap-1">
                      <span
                        className="text-[10px] uppercase tracking-[0.14em] font-semibold text-[hsl(var(--gold-deep))]"
                        style={LUXE_DISPLAY_STYLE}
                      >
                        Notitie
                      </span>
                      <Input
                        className={LUXE_INPUT_CLASS}
                        value={effective.notitie ?? ""}
                        placeholder="Notitie"
                        onChange={(e) =>
                          schedulePatch(
                            driver.id,
                            { notitie: e.target.value || null },
                            false,
                          )
                        }
                        maxLength={500}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
