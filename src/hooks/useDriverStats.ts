import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Aggregaties voor de "Mijn cijfers"-tab in het chauffeursportaal.
 *
 * Bronnen:
 * - driver_time_entries (clock_in/clock_out, break_start/break_end,
 *   drive_start/drive_end) voor uren-deze-week en pauze-compliance
 * - trips (driver_id, completed_at, total_distance_km) voor ritten en km
 * - trip_stops (trip_id, stop_status, planned_time, actual_arrival_time)
 *   voor stops + on-time-rate
 *
 * On-time-criterium: stops met stop_status = AFGELEVERD waar
 * actual_arrival_time <= planned_time + 15 min. Alleen stops met beide
 * timestamps tellen mee in de noemer.
 *
 * Pauze-compliance: per werkdag (clock_in -> clock_out) kijken we of er
 * minstens 45 min totale pauze is geregistreerd na 4u30 rijtijd. Dit is
 * een vereenvoudiging van de 561/2006 regel; planner-zijde houdt de
 * formele compliance bij.
 */

export interface DriverStats {
  hoursThisWeek: number;
  tripsThisMonth: number;
  stopsDeliveredThisMonth: number;
  onTimeRate: number | null;
  kmThisMonth: number;
  breakComplianceRate: number | null;
}

interface TimeEntry {
  type: string;
  recorded_at: string;
}

interface TripRow {
  id: string;
  completed_at: string | null;
  total_distance_km: number | null;
}

interface TripStopRow {
  stop_status: string | null;
  planned_time: string | null;
  actual_arrival_time: string | null;
}

function startOfWeekIso(now: Date): string {
  const d = new Date(now);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfMonthIso(now: Date): string {
  const d = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  return d.toISOString();
}

function computeWorkedHours(entries: TimeEntry[]): number {
  // Pair clock_in -> clock_out, sum the deltas. Onafgesloten clock_in
  // (chauffeur is nu ingeklokt) telt mee tot now().
  const sorted = [...entries]
    .filter((e) => e.type === "clock_in" || e.type === "clock_out")
    .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
  let total = 0;
  let openStart: number | null = null;
  for (const entry of sorted) {
    const ts = new Date(entry.recorded_at).getTime();
    if (entry.type === "clock_in") {
      openStart = ts;
    } else if (entry.type === "clock_out" && openStart !== null) {
      total += Math.max(0, ts - openStart);
      openStart = null;
    }
  }
  if (openStart !== null) {
    total += Math.max(0, Date.now() - openStart);
  }
  return total / (1000 * 60 * 60);
}

function computeBreakCompliance(entries: TimeEntry[]): number | null {
  // Per werkdag: hoeveel pauze is genomen voor het einde van de shift?
  // Compliant als totale pauze >= 45 min en de shift > 4u30 was.
  // Geen werkdag = niet meegerekend.
  const days = new Map<string, { workMs: number; breakMs: number }>();

  const sorted = [...entries].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
  let workStart: number | null = null;
  let breakStart: number | null = null;
  let currentDay: string | null = null;

  for (const entry of sorted) {
    const ts = new Date(entry.recorded_at).getTime();
    const dayKey = entry.recorded_at.slice(0, 10);
    if (entry.type === "clock_in") {
      workStart = ts;
      currentDay = dayKey;
    } else if (entry.type === "clock_out" && workStart !== null && currentDay) {
      const work = Math.max(0, ts - workStart);
      const prev = days.get(currentDay) ?? { workMs: 0, breakMs: 0 };
      prev.workMs += work;
      days.set(currentDay, prev);
      workStart = null;
    } else if (entry.type === "break_start") {
      breakStart = ts;
    } else if (entry.type === "break_end" && breakStart !== null && currentDay) {
      const br = Math.max(0, ts - breakStart);
      const prev = days.get(currentDay) ?? { workMs: 0, breakMs: 0 };
      prev.breakMs += br;
      days.set(currentDay, prev);
      breakStart = null;
    }
  }

  let qualifying = 0;
  let compliant = 0;
  for (const day of days.values()) {
    if (day.workMs >= 4.5 * 60 * 60 * 1000) {
      qualifying += 1;
      if (day.breakMs >= 45 * 60 * 1000) compliant += 1;
    }
  }
  if (qualifying === 0) return null;
  return compliant / qualifying;
}

export function useDriverStats(driverId: string | null | undefined) {
  return useQuery<DriverStats>({
    queryKey: ["driver_stats", driverId],
    enabled: !!driverId,
    staleTime: 60_000,
    queryFn: async () => {
      const now = new Date();
      const weekStart = startOfWeekIso(now);
      const monthStart = startOfMonthIso(now);

      const [weekEntries, monthEntries, tripsRes, tripsForStopsRes] = await Promise.all([
        supabase
          .from("driver_time_entries" as any)
          .select("type, recorded_at")
          .eq("driver_id", driverId!)
          .gte("recorded_at", weekStart)
          .order("recorded_at"),
        supabase
          .from("driver_time_entries" as any)
          .select("type, recorded_at")
          .eq("driver_id", driverId!)
          .gte("recorded_at", monthStart)
          .order("recorded_at"),
        supabase
          .from("trips" as any)
          .select("id, completed_at, total_distance_km")
          .eq("driver_id", driverId!)
          .gte("completed_at", monthStart)
          .not("completed_at", "is", null),
        supabase
          .from("trips" as any)
          .select("id")
          .eq("driver_id", driverId!)
          .gte("planned_date", monthStart.slice(0, 10)),
      ]);

      if (weekEntries.error) throw weekEntries.error;
      if (monthEntries.error) throw monthEntries.error;
      if (tripsRes.error) throw tripsRes.error;
      if (tripsForStopsRes.error) throw tripsForStopsRes.error;

      const trips = (tripsRes.data ?? []) as unknown as TripRow[];
      const tripsForStops = (tripsForStopsRes.data ?? []) as unknown as Array<{ id: string }>;

      const hoursThisWeek = computeWorkedHours(
        (weekEntries.data ?? []) as unknown as TimeEntry[],
      );
      const breakComplianceRate = computeBreakCompliance(
        (monthEntries.data ?? []) as unknown as TimeEntry[],
      );

      const tripsThisMonth = trips.length;
      const kmThisMonth = trips.reduce(
        (sum, t) => sum + (typeof t.total_distance_km === "number" ? t.total_distance_km : 0),
        0,
      );

      let stopsDeliveredThisMonth = 0;
      let onTimeRate: number | null = null;

      const tripIds = tripsForStops.map((t) => t.id);
      if (tripIds.length > 0) {
        const { data: stopsData, error: stopsErr } = await supabase
          .from("trip_stops" as any)
          .select("stop_status, planned_time, actual_arrival_time")
          .in("trip_id", tripIds);
        if (stopsErr) throw stopsErr;
        const stops = (stopsData ?? []) as unknown as TripStopRow[];
        const delivered = stops.filter((s) => s.stop_status === "AFGELEVERD");
        stopsDeliveredThisMonth = delivered.length;

        const eligible = delivered.filter((s) => s.planned_time && s.actual_arrival_time);
        if (eligible.length > 0) {
          const onTime = eligible.filter((s) => {
            const planned = new Date(s.planned_time!).getTime();
            const actual = new Date(s.actual_arrival_time!).getTime();
            return actual - planned <= 15 * 60 * 1000;
          }).length;
          onTimeRate = onTime / eligible.length;
        }
      }

      return {
        hoursThisWeek,
        tripsThisMonth,
        stopsDeliveredThisMonth,
        onTimeRate,
        kmThisMonth,
        breakComplianceRate,
      };
    },
  });
}
