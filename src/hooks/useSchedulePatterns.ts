import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, format, parseISO } from "date-fns";

import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import type { DriverSchedule } from "@/types/rooster";

/**
 * Patroon-detectie voor het Rooster: in plaats van alleen statische
 * `default_shift_template_id` op de chauffeur kijken we naar wat een
 * chauffeur de afgelopen 8 weken écht deed per dag-van-de-week en
 * gebruiken dat als suggestie/prefill.
 *
 * `dayOfWeek` volgt date-fns `getDay()`: 0 = zondag, 1 = maandag, ..., 6 = zaterdag.
 */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface SchedulePattern {
  shift_template_id: string | null;
  vehicle_id: string | null;
  start_time: string | null;
  sample_count: number;
}

const PATTERN_WINDOW_WEEKS = 8;
const MIN_SAMPLES = 3;
const STALE_TIME = 5 * 60_000;

function eightWeeksAgoISO(): string {
  // 8 weken = 56 dagen terug, op kalender-dag-grens.
  return format(addDays(new Date(), -PATTERN_WINDOW_WEEKS * 7), "yyyy-MM-dd");
}

/**
 * Aggregeert rooster-rijen per `dayOfWeek` voor één driver.
 *
 * - Alleen rijen met `status === "werkt"` tellen mee. Verlof, ziek en
 *   vrij-dagen zijn geen patroon, dat is een uitzondering.
 * - Per (driver, dayOfWeek) wordt de modus gepakt voor `shift_template_id`,
 *   `vehicle_id` en `start_time` (afzonderlijk, niet als tuple, want soms
 *   wisselt alleen het voertuig). Bij gelijkstand wint de meest recente.
 * - `sample_count` is het totaal aantal "werkt"-rijen voor die dag-van-week
 *   in het venster, inclusief rijen waar een veld leeg was. Patroon wordt
 *   alleen teruggegeven als `sample_count >= 3`.
 */
function buildPatterns(
  rows: DriverSchedule[],
): Map<DayOfWeek, SchedulePattern> {
  type Tally = {
    templates: Map<string | null, { count: number; lastDate: string }>;
    vehicles: Map<string | null, { count: number; lastDate: string }>;
    startTimes: Map<string | null, { count: number; lastDate: string }>;
    total: number;
  };
  const byDow = new Map<DayOfWeek, Tally>();

  function bump(
    map: Map<string | null, { count: number; lastDate: string }>,
    key: string | null,
    date: string,
  ) {
    const cur = map.get(key);
    if (!cur) {
      map.set(key, { count: 1, lastDate: date });
    } else {
      cur.count += 1;
      if (date > cur.lastDate) cur.lastDate = date;
    }
  }

  for (const r of rows) {
    if (r.status !== "werkt") continue;
    const dow = parseISO(r.date).getDay() as DayOfWeek;
    let t = byDow.get(dow);
    if (!t) {
      t = {
        templates: new Map(),
        vehicles: new Map(),
        startTimes: new Map(),
        total: 0,
      };
      byDow.set(dow, t);
    }
    bump(t.templates, r.shift_template_id, r.date);
    bump(t.vehicles, r.vehicle_id, r.date);
    bump(t.startTimes, r.start_time, r.date);
    t.total += 1;
  }

  function pickMode<K extends string | null>(
    map: Map<K, { count: number; lastDate: string }>,
  ): K | null {
    let best: { key: K; count: number; lastDate: string } | null = null;
    for (const [key, v] of map.entries()) {
      if (
        !best ||
        v.count > best.count ||
        (v.count === best.count && v.lastDate > best.lastDate)
      ) {
        best = { key, count: v.count, lastDate: v.lastDate };
      }
    }
    return best ? best.key : null;
  }

  const out = new Map<DayOfWeek, SchedulePattern>();
  for (const [dow, t] of byDow.entries()) {
    if (t.total < MIN_SAMPLES) continue;
    out.set(dow, {
      shift_template_id: pickMode(t.templates),
      vehicle_id: pickMode(t.vehicles),
      start_time: pickMode(t.startTimes),
      sample_count: t.total,
    });
  }
  return out;
}

/**
 * Patronen voor één chauffeur (laatste 8 weken).
 */
export function useSchedulePatterns(driverId: string | null | undefined) {
  const { tenant } = useTenant();
  const since = useMemo(() => eightWeeksAgoISO(), []);

  const query = useQuery({
    queryKey: ["schedule-patterns", driverId, since, tenant?.id],
    enabled: !!tenant?.id && !!driverId,
    staleTime: STALE_TIME,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_schedules")
        .select("*")
        .eq("driver_id", driverId!)
        .gte("date", since);
      if (error) throw error;
      return buildPatterns((data as DriverSchedule[]) ?? []);
    },
  });

  return {
    patterns: query.data ?? new Map<DayOfWeek, SchedulePattern>(),
    isLoading: query.isLoading,
  };
}

/**
 * Bulk-variant: patronen voor ALLE chauffeurs in één query, geïndexeerd
 * per driverId. Gebruikt door RoosterBulkActions zodat we niet N losse
 * queries hoeven te doen.
 */
export function useAllSchedulePatterns() {
  const { tenant } = useTenant();
  const since = useMemo(() => eightWeeksAgoISO(), []);

  const query = useQuery({
    queryKey: ["schedule-patterns", "all", since, tenant?.id],
    enabled: !!tenant?.id,
    staleTime: STALE_TIME,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_schedules")
        .select("*")
        .gte("date", since);
      if (error) throw error;

      const rows = (data as DriverSchedule[]) ?? [];
      const byDriver = new Map<string, DriverSchedule[]>();
      for (const r of rows) {
        let arr = byDriver.get(r.driver_id);
        if (!arr) {
          arr = [];
          byDriver.set(r.driver_id, arr);
        }
        arr.push(r);
      }

      const out = new Map<string, Map<DayOfWeek, SchedulePattern>>();
      for (const [driverId, driverRows] of byDriver.entries()) {
        out.set(driverId, buildPatterns(driverRows));
      }
      return out;
    },
  });

  return {
    patternsByDriver:
      query.data ?? new Map<string, Map<DayOfWeek, SchedulePattern>>(),
    isLoading: query.isLoading,
  };
}
