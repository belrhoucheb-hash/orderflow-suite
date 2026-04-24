import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Printer, Trash2 } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { LoadingState } from "@/components/ui/LoadingState";

import { useDrivers } from "@/hooks/useDrivers";
import { useShiftTemplates } from "@/hooks/useShiftTemplates";
import { useDriverSchedules } from "@/hooks/useDriverSchedules";
import { useVehiclesRaw } from "@/hooks/useVehiclesRaw";

import {
  DRIVER_SCHEDULE_STATUSES,
  DRIVER_SCHEDULE_STATUS_LABELS,
  resolveSchedule,
  type DriverSchedule,
  type DriverScheduleStatus,
} from "@/types/rooster";

import { exportDayRosterPdf } from "./RoosterPdfExport";

// Radix Select staat geen lege string toe als item-value, dus sentinel.
const NONE = "__none__";

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

  const [includeFreeDays, setIncludeFreeDays] = useState(false);

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

  const activeDrivers = useMemo(
    () => drivers.filter((d) => d.is_active !== false),
    [drivers],
  );

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

  const handlePrint = useCallback(async () => {
    try {
      await exportDayRosterPdf(date, schedules, drivers, vehicles, templates, {
        includeFreeDays,
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Kon PDF niet genereren.";
      toast.error("PDF mislukt", { description: msg });
    }
  }, [date, schedules, drivers, vehicles, templates, includeFreeDays]);

  const loading =
    driversLoading || templatesLoading || vehiclesLoading || schedulesLoading;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <Checkbox
              checked={includeFreeDays}
              onCheckedChange={(v) => setIncludeFreeDays(v === true)}
            />
            Toon vrije dagen in PDF
          </label>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={handlePrint}
          disabled={loading || schedules.length === 0}
        >
          <Printer className="h-3.5 w-3.5" />
          Print rooster
        </Button>
      </div>

      {loading ? (
        <LoadingState message="Rooster laden..." />
      ) : activeDrivers.length === 0 ? (
        <div className="text-sm text-muted-foreground py-6 text-center border rounded-md">
          Geen actieve chauffeurs gevonden.
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">Naam</TableHead>
                <TableHead className="w-[180px]">Rooster</TableHead>
                <TableHead className="w-[110px]">Start</TableHead>
                <TableHead className="w-[110px]">Eind</TableHead>
                <TableHead className="w-[160px]">Voertuig</TableHead>
                <TableHead className="w-[140px]">Status</TableHead>
                <TableHead>Notitie</TableHead>
                <TableHead className="w-[60px] text-right">Actie</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeDrivers.map((driver) => {
                const dbSchedule = scheduleByDriver.get(driver.id);
                const patch = localPatches[driver.id] ?? {};

                // Merge DB + lokale patch voor weergave.
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
                  ? templates.find((t) => t.id === effective.shift_template_id) ??
                    null
                  : null;

                // Effectieve starttijd: user-value, anders template-default.
                const startPlaceholder = template?.default_start_time ?? "";
                const endPlaceholder = template?.default_end_time ?? "";

                const working = effective.status === "werkt";
                const isEmpty = !dbSchedule && Object.keys(patch).length === 0;

                return (
                  <TableRow key={driver.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {template && (
                          <span
                            aria-hidden="true"
                            className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
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
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue placeholder="Geen" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE} className="text-xs">
                            Geen rooster
                          </SelectItem>
                          {templates.map((t) => (
                            <SelectItem key={t.id} value={t.id} className="text-xs">
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
                          className="h-9 text-xs"
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
                        <span className="text-xs text-muted-foreground">n.v.t.</span>
                      )}
                    </TableCell>

                    <TableCell>
                      {working ? (
                        <Input
                          type="time"
                          className="h-9 text-xs"
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
                        <span className="text-xs text-muted-foreground">n.v.t.</span>
                      )}
                    </TableCell>

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
                          <SelectTrigger className="h-9 text-xs">
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
                        <span className="text-xs text-muted-foreground">n.v.t.</span>
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
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DRIVER_SCHEDULE_STATUSES.map((s) => (
                            <SelectItem key={s} value={s} className="text-xs">
                              {DRIVER_SCHEDULE_STATUS_LABELS[s]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>

                    <TableCell>
                      <Input
                        className="h-9 text-xs"
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
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
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
      )}
    </div>
  );
}
