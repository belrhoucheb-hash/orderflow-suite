import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO, startOfWeek } from "date-fns";

import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";

import { useDrivers } from "@/hooks/useDrivers";
import { useVehiclesRaw } from "@/hooks/useVehiclesRaw";
import { useVehicleAvailability } from "@/hooks/useVehicleAvailability";

import {
  checkContractHoursOverflow,
  checkDriverCertificationForVehicle,
  checkVehicleAvailability,
  durationHours,
  type CheckResult,
} from "@/lib/roosterEligibility";

interface Args {
  driverId: string | null | undefined;
  date: string | null | undefined;
  vehicleId: string | null | undefined;
  /** Uren die de huidige cel toevoegt (eind - start). 0 als niet werkend. */
  addedHours?: number;
  /** Bewuste start/eind als convenience i.p.v. addedHours zelf rekenen. */
  startTime?: string | null;
  endTime?: string | null;
}

export interface RoosterEligibilityResult {
  vehicle: CheckResult;
  certification: CheckResult;
  hours: CheckResult;
  hasIssue: boolean;
}

const OK: CheckResult = { ok: true, severity: "warn" };

function isoWeekStart(iso: string): string {
  return format(startOfWeek(parseISO(iso), { weekStartsOn: 1 }), "yyyy-MM-dd");
}

/**
 * Wrapper-hook die de drie eligibility-checks combineert tot één
 * resultaat per (chauffeur, datum, voertuig). Onderliggende data wordt
 * gedeeld via React Query, dus meerdere instances binnen dezelfde
 * weergave hergebruiken cache zonder extra netwerk-rondes.
 *
 * - Onderhoud op voertuig levert `severity: 'error'`.
 * - Verlopen of binnenkort verlopen certificering levert `severity:
 *   'warn'`. We disablen niets, omdat planners overrules nodig hebben.
 * - Contracturen-overschrijding levert `severity: 'warn'`.
 */
export function useRoosterEligibility(args: Args): RoosterEligibilityResult {
  const { driverId, date, vehicleId } = args;
  const { tenant } = useTenant();

  const { data: drivers = [] } = useDrivers();
  const { data: vehicles = [] } = useVehiclesRaw();
  const { data: availability = [] } = useVehicleAvailability(date ?? null);

  const driver = useMemo(
    () => drivers.find((d) => d.id === driverId) ?? null,
    [drivers, driverId],
  );
  const vehicle = useMemo(
    () => vehicles.find((v) => v.id === vehicleId) ?? null,
    [vehicles, vehicleId],
  );

  const weekStart = useMemo(() => (date ? isoWeekStart(date) : null), [date]);

  const { data: hoursRow } = useQuery({
    queryKey: ["driver_hours_per_week", weekStart, driverId, tenant?.id],
    enabled: !!tenant?.id && !!driverId && !!weekStart,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("driver_hours_per_week" as any) as any)
        .select("planned_hours")
        .eq("tenant_id", tenant!.id)
        .eq("driver_id", driverId!)
        .eq("week_start", weekStart!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as { planned_hours: number | null } | null;
    },
  });

  const addedHours = useMemo(() => {
    if (typeof args.addedHours === "number") return args.addedHours;
    return durationHours(args.startTime ?? null, args.endTime ?? null);
  }, [args.addedHours, args.startTime, args.endTime]);

  const vehicleCheck = useMemo<CheckResult>(() => {
    if (!date || !vehicleId) return OK;
    const r = checkVehicleAvailability(vehicleId, date, availability);
    if (r.ok) return OK;
    return { ok: false, severity: "error", message: r.reason };
  }, [vehicleId, date, availability]);

  const certificationCheck = useMemo<CheckResult>(() => {
    if (!driver || !date) return OK;
    const r = checkDriverCertificationForVehicle(
      driver,
      vehicle?.type ?? null,
      date,
    );
    if (r.ok) return OK;
    return {
      ok: false,
      severity: "warn",
      message: r.warnings.join(" , "),
    };
  }, [driver, vehicle, date]);

  const hoursCheck = useMemo<CheckResult>(() => {
    if (!driver) return OK;
    const planned = Number(hoursRow?.planned_hours ?? 0);
    const r = checkContractHoursOverflow(driver, planned, addedHours);
    if (r.ok) return OK;
    return { ok: false, severity: "warn", message: r.reason };
  }, [driver, hoursRow, addedHours]);

  const hasIssue =
    !vehicleCheck.ok || !certificationCheck.ok || !hoursCheck.ok;

  return {
    vehicle: vehicleCheck,
    certification: certificationCheck,
    hours: hoursCheck,
    hasIssue,
  };
}
