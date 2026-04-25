import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eye, Printer, Search, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { addDays, format, parseISO } from "date-fns";

import { supabase } from "@/integrations/supabase/client";

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
  DropdownMenuContent,
  DropdownMenuItem,
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
    bulkUpsert,
    deleteSchedule,
  } = useDriverSchedules(date, date);

  // Filter-toggle: ook chauffeurs zonder rooster-rij tonen?
  const [showUnplanned, setShowUnplanned] = useState(false);
  const [search, setSearch] = useState("");
  const [filterTemplate, setFilterTemplate] = useState<string>("__all__");
  const [filterStatus, setFilterStatus] = useState<string>("__all__");
  const [actionsBusy, setActionsBusy] = useState(false);

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

  // Filter op zichtbare rijen: combinatie van toon-niet-geplande, zoek-naam,
  // rooster-type en status.
  const visibleDrivers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sortedDrivers.filter((d) => {
      const sched = scheduleByDriver.get(d.id);
      if (!showUnplanned && !sched) return false;
      if (q && !d.name.toLowerCase().includes(q)) return false;
      if (filterTemplate !== "__all__") {
        if (filterTemplate === "__none__") {
          if (sched?.shift_template_id) return false;
        } else if (sched?.shift_template_id !== filterTemplate) {
          return false;
        }
      }
      if (filterStatus !== "__all__") {
        const status = sched?.status ?? "werkt";
        if (status !== filterStatus) return false;
      }
      return true;
    });
  }, [
    sortedDrivers,
    scheduleByDriver,
    showUnplanned,
    search,
    filterTemplate,
    filterStatus,
  ]);

  // Stats over alle actieve chauffeurs (niet alleen zichtbare), voor de balk.
  const stats = useMemo(() => {
    const counts = {
      werkt: 0,
      vrij: 0,
      ziek: 0,
      verlof: 0,
      feestdag: 0,
      ongepland: 0,
    };
    for (const d of activeDrivers) {
      const s = scheduleByDriver.get(d.id);
      if (!s) {
        counts.ongepland += 1;
      } else {
        counts[s.status] += 1;
      }
    }
    return counts;
  }, [activeDrivers, scheduleByDriver]);

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

  // Vul lege rijen vandaag uit standaard-rooster van de chauffeur. Slaat
  // chauffeurs over die al een rij voor deze dag hebben.
  const handleApplyDefaultsToday = useCallback(async () => {
    setActionsBusy(true);
    try {
      const rows = activeDrivers
        .filter((d) => !scheduleByDriver.has(d.id))
        .filter((d) => d.default_shift_template_id)
        .map((d) => ({
          driver_id: d.id,
          date,
          shift_template_id: d.default_shift_template_id,
          vehicle_id: d.default_vehicle_id ?? null,
          status: "werkt" as const,
        }));
      if (rows.length === 0) {
        toast.info("Niets te doen", {
          description:
            "Alle chauffeurs hebben al een rij of hebben geen standaardrooster.",
        });
        return;
      }
      await bulkUpsert.mutateAsync(rows);
      toast.success(`${rows.length} chauffeurs ingepland uit standaardrooster`);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Kon standaardrooster niet toepassen.";
      toast.error("Toepassen mislukt", { description: msg });
    } finally {
      setActionsBusy(false);
    }
  }, [activeDrivers, scheduleByDriver, date, bulkUpsert]);

  // Kopieer alle rooster-rijen van gisteren naar vandaag, alleen voor lege
  // dag-cellen zodat handmatige invoer niet wordt overschreven.
  const handleCopyYesterday = useCallback(async () => {
    setActionsBusy(true);
    try {
      const yesterday = format(addDays(parseISO(date), -1), "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("driver_schedules")
        .select("*")
        .eq("date", yesterday);
      if (error) throw error;
      const yesterdayRows = (data ?? []) as DriverSchedule[];
      const rows = yesterdayRows
        .filter((y) => !scheduleByDriver.has(y.driver_id))
        .map((y) => ({
          driver_id: y.driver_id,
          date,
          shift_template_id: y.shift_template_id,
          start_time: y.start_time,
          end_time: y.end_time,
          vehicle_id: y.vehicle_id,
          status: y.status,
          notitie: y.notitie,
        }));
      if (rows.length === 0) {
        toast.info("Niets gekopieerd", {
          description:
            "Gisteren was leeg of alle chauffeurs hebben vandaag al een rij.",
        });
        return;
      }
      await bulkUpsert.mutateAsync(rows);
      toast.success(`${rows.length} rijen overgenomen van gisteren`);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Kon gisteren niet kopieren.";
      toast.error("Kopieren mislukt", { description: msg });
    } finally {
      setActionsBusy(false);
    }
  }, [date, scheduleByDriver, bulkUpsert]);

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

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Zoek chauffeur"
              className="h-9 pl-8 w-44"
              style={{ fontFamily: "var(--font-display)" }}
            />
          </div>

          <Select value={filterTemplate} onValueChange={setFilterTemplate}>
            <SelectTrigger
              className={cn(LUXE_TRIGGER_CLASS, "h-9 w-40")}
              style={LUXE_DISPLAY_STYLE}
            >
              <SelectValue placeholder="Alle roosters" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Alle roosters</SelectItem>
              <SelectItem value="__none__">Geen rooster</SelectItem>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block w-2 h-2 rounded-full"
                      style={{ backgroundColor: t.color }}
                    />
                    {t.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger
              className={cn(LUXE_TRIGGER_CLASS, "h-9 w-36")}
              style={LUXE_DISPLAY_STYLE}
            >
              <SelectValue placeholder="Alle statussen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Alle statussen</SelectItem>
              {DRIVER_SCHEDULE_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {DRIVER_SCHEDULE_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer ml-1">
            <Switch
              checked={showUnplanned}
              onCheckedChange={setShowUnplanned}
            />
            Ook niet-geplande
          </label>
        </div>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="btn-luxe"
                disabled={loading || actionsBusy}
              >
                <Wand2 className="h-4 w-4" />
                Acties
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={handleApplyDefaultsToday}
                disabled={actionsBusy}
              >
                Vul lege rijen uit standaardrooster
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleCopyYesterday}
                disabled={actionsBusy}
              >
                Kopieer rooster van gisteren
              </DropdownMenuItem>
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

      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="chiplet">
          <span className="text-[hsl(var(--gold-deep))] font-semibold tabular-nums">
            {stats.werkt}
          </span>
          <span className="text-muted-foreground">werkt</span>
        </span>
        {stats.vrij > 0 && (
          <span className="chiplet">
            <span className="font-semibold tabular-nums">{stats.vrij}</span>
            <span className="text-muted-foreground">vrij</span>
          </span>
        )}
        {stats.ziek > 0 && (
          <span className="chiplet chiplet--warn">
            <span className="font-semibold tabular-nums">{stats.ziek}</span>
            <span>ziek</span>
          </span>
        )}
        {stats.verlof > 0 && (
          <span className="chiplet chiplet--attn">
            <span className="font-semibold tabular-nums">{stats.verlof}</span>
            <span>verlof</span>
          </span>
        )}
        {stats.feestdag > 0 && (
          <span className="chiplet chiplet--attn">
            <span className="font-semibold tabular-nums">{stats.feestdag}</span>
            <span>feestdag</span>
          </span>
        )}
        {stats.ongepland > 0 && (
          <span className="chiplet chiplet--attn">
            <span className="font-semibold tabular-nums">{stats.ongepland}</span>
            <span>ongepland</span>
          </span>
        )}
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
                  <TableHead
                    className="w-[110px] text-[10px] uppercase tracking-[0.14em] font-semibold text-[hsl(var(--gold-deep))]"
                    style={LUXE_DISPLAY_STYLE}
                  >
                    Eind
                  </TableHead>
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

                      <TableCell>
                        {working ? (
                          <Input
                            type="time"
                            className={LUXE_TIME_CLASS}
                            style={LUXE_TIME_STYLE}
                            value={effective.end_time ?? ""}
                            placeholder={template?.default_end_time ?? ""}
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
                      <div className="grid grid-cols-2 gap-2">
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
                            placeholder={template?.default_end_time ?? ""}
                            onChange={(e) =>
                              schedulePatch(
                                driver.id,
                                { end_time: e.target.value || null },
                                false,
                              )
                            }
                          />
                        </div>
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
