import { useState, useEffect, useMemo, useRef } from "react";
import { format, subDays } from "date-fns";
import { nl } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Clock, Truck, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTenantOptional } from "@/contexts/TenantContext";
import { useDrivers, type Driver } from "@/hooks/useDrivers";
import {
  useDriverAvailability,
  useBulkUpsertDriverAvailability,
  type DriverAvailabilityStatus,
} from "@/hooks/useDriverAvailability";
import {
  useVehicleAvailability,
  useBulkUpsertVehicleAvailability,
  type VehicleAvailabilityStatus,
} from "@/hooks/useVehicleAvailability";
import { useDriverSchedulesForDate } from "@/hooks/useDriverScheduleForDate";
import { DRIVER_SCHEDULE_STATUS_LABELS, type DriverSchedule, type DriverScheduleStatus } from "@/types/rooster";

interface VehicleFleetRow {
  id: string;
  code: string | null;
  name: string | null;
  plate: string | null;
  type: string | null;
}

function useFleetVehiclesRaw() {
  return useQuery({
    queryKey: ["fleet_vehicles_raw"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("id, code, name, plate, type")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as VehicleFleetRow[];
    },
  });
}

const DRIVER_STATUS_OPTIONS: { value: DriverAvailabilityStatus; label: string }[] = [
  { value: "werkt", label: "Werkt" },
  { value: "verlof", label: "Verlof" },
  { value: "ziek", label: "Ziek" },
  { value: "rust", label: "Rust" },
  { value: "afwezig", label: "Afwezig" },
];

const VEHICLE_STATUS_OPTIONS: { value: VehicleAvailabilityStatus; label: string }[] = [
  { value: "beschikbaar", label: "Beschikbaar" },
  { value: "niet_beschikbaar", label: "Niet beschikbaar" },
  { value: "onderhoud", label: "Onderhoud" },
  { value: "defect", label: "Defect" },
];

interface DaySetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
}

interface DriverRow {
  driver: Driver;
  status: DriverAvailabilityStatus;
  reason: string;
}

/**
 * Mapt een rooster-status naar de bijbehorende driver_availability-status,
 * voor zover die mapping eenduidig is. "vrij" en "feestdag" hebben geen
 * 1:1-equivalent en worden niet geprefilled — die geven we alleen visueel
 * weer als waarschuwing.
 */
function mapScheduleStatusToAvailability(
  status: DriverScheduleStatus,
): DriverAvailabilityStatus | null {
  switch (status) {
    case "werkt":
      return "werkt";
    case "ziek":
      return "ziek";
    case "verlof":
      return "verlof";
    case "vrij":
    case "feestdag":
      return null;
    default:
      return null;
  }
}

interface VehicleRow {
  id: string;
  name: string;
  plate: string | null;
  type: string | null;
  status: VehicleAvailabilityStatus;
  reason: string;
}

export function DaySetupDialog({ open, onOpenChange, date }: DaySetupDialogProps) {
  const { tenant } = useTenantOptional();
  const { toast } = useToast();

  const { data: drivers = [] } = useDrivers();
  const { data: vehiclesData = [] } = useFleetVehiclesRaw();
  const { data: driverAvailabilityToday = [] } = useDriverAvailability(open ? date : null);
  const { data: vehicleAvailabilityToday = [] } = useVehicleAvailability(open ? date : null);
  const { data: schedulesForDate = [] } = useDriverSchedulesForDate(open ? date : null);

  const scheduleByDriver = useMemo(() => {
    const m = new Map<string, DriverSchedule>();
    (schedulesForDate as DriverSchedule[]).forEach((s) => m.set(s.driver_id, s));
    return m;
  }, [schedulesForDate]);

  const vehicleNamesById = useMemo(() => {
    const m = new Map<string, string>();
    vehiclesData.forEach((v) =>
      m.set(v.id, v.plate || v.name || v.code || "Voertuig"),
    );
    return m;
  }, [vehiclesData]);

  const yesterday = format(subDays(new Date(date + "T00:00:00"), 1), "yyyy-MM-dd");
  const { data: driverAvailabilityYesterday = [] } = useDriverAvailability(open ? yesterday : null);
  const { data: vehicleAvailabilityYesterday = [] } = useVehicleAvailability(open ? yesterday : null);

  const upsertDrivers = useBulkUpsertDriverAvailability();
  const upsertVehicles = useBulkUpsertVehicleAvailability();

  const [driverRows, setDriverRows] = useState<DriverRow[]>([]);
  const [vehicleRows, setVehicleRows] = useState<VehicleRow[]>([]);

  /**
   * Houdt per (driver, date, schedule.id)-combinatie bij of we de status al
   * geprefilled hebben. Voorkomt dat we de keuze van de planner overschrijven
   * bij elke re-render of nadat hij de status handmatig heeft gewijzigd.
   */
  const prefilledKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!open) {
      prefilledKeysRef.current = new Set();
      return;
    }
    const activeDrivers = drivers.filter((d) => d.is_active);
    const availByDriver = new Map(driverAvailabilityToday.map((a) => [a.driver_id, a]));
    setDriverRows(
      activeDrivers.map((d) => {
        const existing = availByDriver.get(d.id);
        return {
          driver: d,
          status: (existing?.status as DriverAvailabilityStatus) ?? "werkt",
          reason: existing?.reason ?? "",
        };
      }),
    );
  }, [open, drivers, driverAvailabilityToday]);

  /**
   * Prefill driver-availability-status vanuit het rooster zodra schedules
   * binnenkomen. We schrijven alleen als er nog geen handmatige avail-rij
   * voor die dag is (zodat een explicit gekozen status van de planner
   * gerespecteerd blijft) en alleen voor 1:1 mapbare statussen.
   */
  useEffect(() => {
    if (!open) return;
    if (driverRows.length === 0) return;
    if (schedulesForDate.length === 0) return;
    const availByDriver = new Map(
      driverAvailabilityToday.map((a) => [a.driver_id, a]),
    );

    setDriverRows((rows) => {
      let changed = false;
      const next = rows.map((row) => {
        const schedule = scheduleByDriver.get(row.driver.id);
        if (!schedule) return row;
        const key = `${row.driver.id}|${date}|${schedule.id}`;
        if (prefilledKeysRef.current.has(key)) return row;
        const mapped = mapScheduleStatusToAvailability(schedule.status);
        if (!mapped) {
          prefilledKeysRef.current.add(key);
          return row;
        }
        // Niet overschrijven als de planner al een avail-rij in de DB heeft
        // staan voor vandaag (dan vertrouwen we zijn keuze).
        if (availByDriver.has(row.driver.id)) {
          prefilledKeysRef.current.add(key);
          return row;
        }
        if (row.status === mapped) {
          prefilledKeysRef.current.add(key);
          return row;
        }
        prefilledKeysRef.current.add(key);
        changed = true;
        return { ...row, status: mapped };
      });
      return changed ? next : rows;
    });
  }, [
    open,
    date,
    driverRows.length,
    schedulesForDate,
    scheduleByDriver,
    driverAvailabilityToday,
  ]);

  useEffect(() => {
    if (!open) return;
    const availByVehicle = new Map(vehicleAvailabilityToday.map((a) => [a.vehicle_id, a]));
    setVehicleRows(
      vehiclesData.map((v) => {
        const existing = availByVehicle.get(v.id);
        return {
          id: v.id,
          name: v.name ?? v.code ?? v.plate ?? "Voertuig",
          plate: v.plate,
          type: v.type,
          status: ((existing?.status as VehicleAvailabilityStatus) ?? "beschikbaar"),
          reason: existing?.reason ?? "",
        };
      }),
    );
  }, [open, vehiclesData, vehicleAvailabilityToday]);

  const summary = useMemo(() => {
    const werkt = driverRows.filter((r) => r.status === "werkt").length;
    const beschikbaar = vehicleRows.filter((r) => r.status === "beschikbaar").length;
    return { werkt, beschikbaar, driversTotal: driverRows.length, vehiclesTotal: vehicleRows.length };
  }, [driverRows, vehicleRows]);

  function copyFromYesterday() {
    const yDrivers = new Map(driverAvailabilityYesterday.map((a) => [a.driver_id, a]));
    setDriverRows((rows) =>
      rows.map((r) => {
        const prev = yDrivers.get(r.driver.id);
        if (!prev) return r;
        return { ...r, status: prev.status as DriverAvailabilityStatus, reason: prev.reason ?? "" };
      }),
    );
    const yVehicles = new Map(vehicleAvailabilityYesterday.map((a) => [a.vehicle_id, a]));
    setVehicleRows((rows) =>
      rows.map((r) => {
        const prev = yVehicles.get(r.id);
        if (!prev) return r;
        return { ...r, status: prev.status as VehicleAvailabilityStatus, reason: prev.reason ?? "" };
      }),
    );
    toast({ title: "Gisteren gekopieerd", description: "Statussen van gisteren toegepast. Pas aan waar nodig." });
  }

  function markAllDriversWerkt() {
    setDriverRows((rows) => rows.map((r) => ({ ...r, status: "werkt", reason: "" })));
  }

  function markAllVehiclesBeschikbaar() {
    setVehicleRows((rows) => rows.map((r) => ({ ...r, status: "beschikbaar", reason: "" })));
  }

  async function handleSave() {
    if (!tenant?.id) {
      toast({ title: "Geen tenant", description: "Kon tenant-id niet bepalen.", variant: "destructive" });
      return;
    }
    try {
      const driverUpserts = driverRows.map((r) => ({
        tenant_id: tenant.id,
        driver_id: r.driver.id,
        date,
        status: r.status,
        reason: r.reason.trim() || null,
      }));
      const vehicleUpserts = vehicleRows.map((r) => ({
        tenant_id: tenant.id,
        vehicle_id: r.id,
        date,
        status: r.status,
        reason: r.reason.trim() || null,
      }));
      await Promise.all([
        upsertDrivers.mutateAsync(driverUpserts),
        upsertVehicles.mutateAsync(vehicleUpserts),
      ]);
      toast({
        title: "Dagsetup opgeslagen",
        description: `${summary.werkt} chauffeurs werken, ${summary.beschikbaar} voertuigen beschikbaar op ${format(new Date(date + "T00:00:00"), "d MMMM", { locale: nl })}.`,
      });
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Opslaan mislukt", description: String(err), variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dagsetup voor {format(new Date(date + "T00:00:00"), "EEEE d MMMM yyyy", { locale: nl })}</DialogTitle>
          <DialogDescription>
            Stel per chauffeur en voertuig in wie werkt, verlof heeft of niet beschikbaar is. Auto-plan gebruikt deze selectie als pool.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2 py-2">
          <Button type="button" variant="outline" size="sm" onClick={copyFromYesterday}>Kopieer van gisteren</Button>
          <Button type="button" variant="outline" size="sm" onClick={markAllDriversWerkt}>Alle chauffeurs werken</Button>
          <Button type="button" variant="outline" size="sm" onClick={markAllVehiclesBeschikbaar}>Alle voertuigen beschikbaar</Button>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="secondary">{summary.werkt} / {summary.driversTotal} chauffeurs</Badge>
            <Badge variant="secondary">{summary.beschikbaar} / {summary.vehiclesTotal} voertuigen</Badge>
          </div>
        </div>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Chauffeurs</h3>
          {driverRows.length === 0 && (
            <p className="text-sm text-muted-foreground">Geen actieve chauffeurs gevonden.</p>
          )}
          <div className="grid gap-2">
            {driverRows.map((row, idx) => {
              const schedule = scheduleByDriver.get(row.driver.id);
              const scheduleStartTime =
                schedule?.start_time ? schedule.start_time.slice(0, 5) : null;
              const scheduleVehicleLabel =
                schedule?.vehicle_id
                  ? vehicleNamesById.get(schedule.vehicle_id) ?? null
                  : null;
              const scheduleNotWorking =
                schedule && schedule.status !== "werkt"
                  ? DRIVER_SCHEDULE_STATUS_LABELS[schedule.status]
                  : null;
              return (
                <div
                  key={row.driver.id}
                  className="grid grid-cols-12 gap-2 items-start"
                >
                  <div className="col-span-4 text-sm">
                    <div className="font-medium">{row.driver.name}</div>
                    {(scheduleStartTime || scheduleVehicleLabel) && !scheduleNotWorking && (
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {scheduleStartTime && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {scheduleStartTime}
                          </span>
                        )}
                        {scheduleVehicleLabel && (
                          <span className="inline-flex items-center gap-1">
                            <Truck className="h-3 w-3" />
                            {scheduleVehicleLabel}
                          </span>
                        )}
                      </div>
                    )}
                    {scheduleNotWorking && (
                      <div className="mt-1 inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
                        <AlertTriangle className="h-3 w-3" />
                        Rooster: {scheduleNotWorking}
                      </div>
                    )}
                  </div>
                  <div className="col-span-3">
                    <Select
                      value={row.status}
                      onValueChange={(v) =>
                        setDriverRows((rows) =>
                          rows.map((r, i) =>
                            i === idx
                              ? { ...r, status: v as DriverAvailabilityStatus }
                              : r,
                          ),
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DRIVER_STATUS_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-5">
                    <Input
                      placeholder={
                        row.status === "werkt" ? "Opmerking (optioneel)" : "Reden"
                      }
                      value={row.reason}
                      onChange={(e) =>
                        setDriverRows((rows) =>
                          rows.map((r, i) =>
                            i === idx ? { ...r, reason: e.target.value } : r,
                          ),
                        )
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="space-y-3 pt-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Voertuigen</h3>
          {vehicleRows.length === 0 && (
            <p className="text-sm text-muted-foreground">Geen actieve voertuigen gevonden.</p>
          )}
          <div className="grid gap-2">
            {vehicleRows.map((row, idx) => (
              <div key={row.id} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-4 text-sm font-medium">
                  {row.name}
                  {row.plate && <span className="ml-2 text-muted-foreground">{row.plate}</span>}
                </div>
                <div className="col-span-3">
                  <Select
                    value={row.status}
                    onValueChange={(v) =>
                      setVehicleRows((rows) => rows.map((r, i) => (i === idx ? { ...r, status: v as VehicleAvailabilityStatus } : r)))
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {VEHICLE_STATUS_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-5">
                  <Input
                    placeholder={row.status === "beschikbaar" ? "Opmerking (optioneel)" : "Reden"}
                    value={row.reason}
                    onChange={(e) =>
                      setVehicleRows((rows) => rows.map((r, i) => (i === idx ? { ...r, reason: e.target.value } : r)))
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annuleer
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={upsertDrivers.isPending || upsertVehicles.isPending}
          >
            {upsertDrivers.isPending || upsertVehicles.isPending ? "Opslaan…" : "Opslaan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
