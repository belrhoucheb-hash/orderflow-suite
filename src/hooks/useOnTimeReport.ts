import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface StopMetric {
  id: string;
  window_status: string;
  waiting_time_min: number | null;
  client_location_id: string | null;
  planned_window_start: string | null;
  planned_window_end: string | null;
  actual_arrival_time: string | null;
}

export interface OnTimeMetrics {
  totalStops: number;
  onTimeCount: number;
  earlyCount: number;
  lateCount: number;
  missedCount: number;
  onTimePct: number;
  avgWaitMin: number;
  violationsByLocation: Record<string, number>;
}

export function calculateOnTimeMetrics(stops: StopMetric[]): OnTimeMetrics {
  if (stops.length === 0) {
    return { totalStops: 0, onTimeCount: 0, earlyCount: 0, lateCount: 0, missedCount: 0, onTimePct: 0, avgWaitMin: 0, violationsByLocation: {} };
  }

  let onTimeCount = 0, earlyCount = 0, lateCount = 0, missedCount = 0, totalWait = 0;
  const violationsByLocation: Record<string, number> = {};

  for (const stop of stops) {
    switch (stop.window_status) {
      case "OP_TIJD": onTimeCount++; break;
      case "TE_VROEG": earlyCount++; break;
      case "TE_LAAT":
        lateCount++;
        if (stop.client_location_id) violationsByLocation[stop.client_location_id] = (violationsByLocation[stop.client_location_id] || 0) + 1;
        break;
      case "GEMIST":
        missedCount++;
        if (stop.client_location_id) violationsByLocation[stop.client_location_id] = (violationsByLocation[stop.client_location_id] || 0) + 1;
        break;
    }
    totalWait += stop.waiting_time_min || 0;
  }

  return {
    totalStops: stops.length, onTimeCount, earlyCount, lateCount, missedCount,
    onTimePct: Math.round((onTimeCount / stops.length) * 100),
    avgWaitMin: Math.round(totalWait / stops.length),
    violationsByLocation,
  };
}

export function useOnTimeReport(dateFrom: string | null, dateTo: string | null) {
  return useQuery({
    queryKey: ["on_time_report", dateFrom, dateTo],
    enabled: !!dateFrom && !!dateTo,
    staleTime: 120_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trip_stops")
        .select("id, window_status, waiting_time_min, planned_window_start, planned_window_end, actual_arrival_time, trip:trips!inner(planned_date, tenant_id)")
        .gte("trip.planned_date", dateFrom!)
        .lte("trip.planned_date", dateTo!)
        .not("window_status", "eq", "ONBEKEND");
      if (error) throw error;
      return calculateOnTimeMetrics(data as StopMetric[]);
    },
  });
}
