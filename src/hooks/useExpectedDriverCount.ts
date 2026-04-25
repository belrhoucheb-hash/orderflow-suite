import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, format, parseISO } from "date-fns";

import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import type { DriverSchedule } from "@/types/rooster";

interface Params {
  from: string;
  to: string;
}

interface Result {
  expectedByDate: Map<string, number>;
  isLoading: boolean;
}

const HISTORY_WEEKS = 8;
const MIN_DATAPOINTS = 3;

/**
 * Verwacht aantal werkende chauffeurs per dag in de range, berekend uit het
 * historisch gemiddelde van dezelfde dag-van-de-week in de afgelopen 8 weken.
 *
 * Returnt alleen een waarde voor een dag wanneer er minstens 3 historische
 * datapunten beschikbaar zijn voor die weekdag, anders is het signaal te ruis-
 * gevoelig en willen we geen valse waarschuwing geven. Datums in de toekomst
 * uit de historische periode worden genegeerd.
 */
export function useExpectedDriverCount({ from, to }: Params): Result {
  const { tenant } = useTenant();

  // Bereken het historische venster: van 8 weken voor `from` tot en met de dag
  // voor `from`. We willen dezelfde-weekdag-vergelijkingen maken, dus we
  // pakken precies HISTORY_WEEKS * 7 dagen.
  const historyFrom = useMemo(() => {
    if (!from) return null;
    return format(addDays(parseISO(from), -HISTORY_WEEKS * 7), "yyyy-MM-dd");
  }, [from]);

  const historyTo = useMemo(() => {
    if (!from) return null;
    return format(addDays(parseISO(from), -1), "yyyy-MM-dd");
  }, [from]);

  const query = useQuery({
    queryKey: ["expected-driver-count", historyFrom, historyTo, tenant?.id],
    staleTime: 60_000,
    enabled: !!tenant?.id && !!historyFrom && !!historyTo,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_schedules")
        .select("driver_id, date, status")
        .eq("status", "werkt")
        .gte("date", historyFrom!)
        .lte("date", historyTo!);
      if (error) throw error;
      return data as Pick<DriverSchedule, "driver_id" | "date" | "status">[];
    },
  });

  const expectedByDate = useMemo(() => {
    const result = new Map<string, number>();
    if (!from || !to) return result;

    const today = format(new Date(), "yyyy-MM-dd");
    const rows = query.data ?? [];

    // Stap 1: per historische datum -> set van unieke driver_ids met "werkt".
    const driversPerDate = new Map<string, Set<string>>();
    for (const row of rows) {
      let set = driversPerDate.get(row.date);
      if (!set) {
        set = new Set<string>();
        driversPerDate.set(row.date, set);
      }
      set.add(row.driver_id);
    }

    // Stap 2: groepeer aantallen per weekdag (0 = zondag ... 6 = zaterdag).
    const countsByWeekday = new Map<number, number[]>();
    for (const [date, set] of driversPerDate.entries()) {
      // Datums uit de toekomst kunnen hier in principe niet voorkomen omdat we
      // alleen tot historyTo querien, maar voor de zekerheid skippen we ze.
      if (date > today) continue;
      const weekday = parseISO(date).getDay();
      let arr = countsByWeekday.get(weekday);
      if (!arr) {
        arr = [];
        countsByWeekday.set(weekday, arr);
      }
      arr.push(set.size);
    }

    // Stap 3: voor elke dag in de target-range het gemiddelde voor zijn
    // weekdag opzoeken, mits er voldoende datapunten zijn.
    const cursor = parseISO(from);
    const end = parseISO(to);
    const oneDayMs = 24 * 60 * 60 * 1000;
    for (
      let d = cursor.getTime();
      d <= end.getTime();
      d += oneDayMs
    ) {
      const dateObj = new Date(d);
      const dateStr = format(dateObj, "yyyy-MM-dd");
      const weekday = dateObj.getDay();
      const points = countsByWeekday.get(weekday) ?? [];
      if (points.length < MIN_DATAPOINTS) continue;
      const avg = points.reduce((a, b) => a + b, 0) / points.length;
      result.set(dateStr, avg);
    }

    return result;
  }, [from, to, query.data]);

  return {
    expectedByDate,
    isLoading: query.isLoading,
  };
}
