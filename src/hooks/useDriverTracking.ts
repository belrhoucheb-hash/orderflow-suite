import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─── Types ───────────────────────────────────────────────────────────
interface GPSPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
  speed: number | null;
  heading: number | null;
  recorded_at: string;
}

type TimeEntryType =
  | "clock_in"
  | "clock_out"
  | "break_start"
  | "break_end"
  | "drive_start"
  | "drive_end";

interface TimeEntry {
  id: string;
  driver_id: string;
  entry_type: TimeEntryType;
  recorded_at: string;
}

// ─── Hook 1: useGPSTracking ─────────────────────────────────────────
export function useGPSTracking(driverId: string | null) {
  const [isTracking, setIsTracking] = useState(false);
  const [currentPosition, setCurrentPosition] = useState<GPSPosition | null>(null);
  const [error, setError] = useState<string | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const bufferRef = useRef<GPSPosition[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Flush buffered positions to supabase
  const flushBuffer = useCallback(async () => {
    if (!driverId || bufferRef.current.length === 0) return;

    const rows = bufferRef.current.map((pos) => ({
      driver_id: driverId,
      latitude: pos.latitude,
      longitude: pos.longitude,
      accuracy: pos.accuracy,
      speed: pos.speed,
      heading: pos.heading,
      recorded_at: pos.recorded_at,
    }));

    // Clear buffer before the async call so new positions keep accumulating
    bufferRef.current = [];

    const { error: insertError } = await supabase
      .from("driver_positions" as any)
      .insert(rows);

    if (insertError) {
      console.error("[GPS] Failed to insert positions:", insertError);
    }
  }, [driverId]);

  const startTracking = useCallback(() => {
    if (!driverId) return;
    if (!navigator.geolocation) {
      setError("Geolocation wordt niet ondersteund door deze browser.");
      return;
    }

    setError(null);

    const id = navigator.geolocation.watchPosition(
      (geo) => {
        const pos: GPSPosition = {
          latitude: geo.coords.latitude,
          longitude: geo.coords.longitude,
          accuracy: geo.coords.accuracy,
          speed: geo.coords.speed,
          heading: geo.coords.heading,
          recorded_at: new Date().toISOString(),
        };
        setCurrentPosition(pos);
        bufferRef.current.push(pos);
      },
      (err) => {
        setError(err.message);
        console.error("[GPS] watchPosition error:", err);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );

    watchIdRef.current = id;

    // Flush every 30 seconds
    flushTimerRef.current = setInterval(flushBuffer, 30_000);

    setIsTracking(true);
  }, [driverId, flushBuffer]);

  const stopTracking = useCallback(async () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (flushTimerRef.current !== null) {
      clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }

    // Flush remaining positions
    await flushBuffer();

    setIsTracking(false);
  }, [flushBuffer]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (flushTimerRef.current !== null) {
        clearInterval(flushTimerRef.current);
      }
    };
  }, []);

  return { isTracking, currentPosition, startTracking, stopTracking, error };
}

// ─── Hook 2: useTimeTracking ────────────────────────────────────────
export function useTimeTracking(driverId: string | null) {
  const queryClient = useQueryClient();

  // Fetch today's entries
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const {
    data: todayEntries = [],
    isLoading,
  } = useQuery({
    queryKey: ["driver_time_entries", driverId],
    queryFn: async (): Promise<TimeEntry[]> => {
      if (!driverId) return [];

      const { data, error } = await supabase
        .from("driver_time_entries" as any)
        .select("*")
        .eq("driver_id", driverId)
        .gte("recorded_at", todayStart.toISOString())
        .order("recorded_at", { ascending: true });

      if (error) throw error;
      return (data as any) || [];
    },
    enabled: !!driverId,
    refetchInterval: 60_000, // refresh every minute
  });

  // Derived state
  const lastEntry = todayEntries.length > 0 ? todayEntries[todayEntries.length - 1] : null;
  const isClocked =
    lastEntry !== null &&
    lastEntry.entry_type !== "clock_out";
  const isOnBreak =
    lastEntry !== null &&
    lastEntry.entry_type === "break_start";

  // Calculate total hours worked today
  const totalHoursToday = calculateTotalHours(todayEntries);

  // Insert a time entry and refetch
  const insertEntry = async (entryType: TimeEntryType) => {
    if (!driverId) return;

    const { error } = await supabase
      .from("driver_time_entries" as any)
      .insert({
        driver_id: driverId,
        entry_type: entryType,
        recorded_at: new Date().toISOString(),
      });

    if (error) {
      console.error("[TimeTracking] insert error:", error);
      throw error;
    }

    queryClient.invalidateQueries({ queryKey: ["driver_time_entries", driverId] });
  };

  const clockIn = () => insertEntry("clock_in");
  const clockOut = () => insertEntry("clock_out");
  const startBreak = () => insertEntry("break_start");
  const endBreak = () => insertEntry("break_end");

  return {
    isClocked,
    isOnBreak,
    isLoading,
    clockIn,
    clockOut,
    startBreak,
    endBreak,
    todayEntries,
    totalHoursToday,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Walk through entries chronologically, summing up active work time
 * (time between clock_in and clock_out, minus breaks).
 */
function calculateTotalHours(entries: TimeEntry[]): number {
  let totalMs = 0;
  let clockInTime: number | null = null;
  let breakStartTime: number | null = null;
  let breakMs = 0;

  for (const entry of entries) {
    const t = new Date(entry.recorded_at).getTime();

    switch (entry.entry_type) {
      case "clock_in":
        clockInTime = t;
        breakMs = 0;
        break;

      case "clock_out":
        if (clockInTime !== null) {
          totalMs += t - clockInTime - breakMs;
          clockInTime = null;
          breakMs = 0;
        }
        break;

      case "break_start":
        breakStartTime = t;
        break;

      case "break_end":
        if (breakStartTime !== null) {
          breakMs += t - breakStartTime;
          breakStartTime = null;
        }
        break;
    }
  }

  // If still clocked in (no clock_out yet), count up to now
  if (clockInTime !== null) {
    const now = Date.now();
    let currentBreakMs = breakMs;
    if (breakStartTime !== null) {
      currentBreakMs += now - breakStartTime;
    }
    totalMs += now - clockInTime - currentBreakMs;
  }

  return totalMs / (1000 * 60 * 60); // convert to hours
}
