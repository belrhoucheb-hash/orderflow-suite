import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { TripStop, StopStatus } from "@/types/dispatch";

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

// ─── Haversine distance (meters) ────────────────────────────────────
function haversineMeters(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 6_371_000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Hook 3: useGeofenceCheck ───────────────────────────────────────
const GEOFENCE_RADIUS_M = 200;
const GEOFENCE_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

interface GeofenceMatch {
  stop: TripStop;
  distanceM: number;
}

/**
 * Checks whether the driver's current GPS position is within 200m of any
 * GEPLAND/ONDERWEG stop. When a match is found, shows a toast with a
 * confirmation button (HITL — human-in-the-loop). A cooldown prevents
 * re-triggering the same stop within 5 minutes.
 */
export function useGeofenceCheck(
  currentPosition: GPSPosition | null,
  stops: TripStop[],
  onConfirmArrival: (stopId: string) => void,
) {
  // Map of stopId -> timestamp of last trigger
  const cooldownMap = useRef<Record<string, number>>({});

  // Only consider eligible stops
  const eligibleStops = useMemo(
    () =>
      stops.filter(
        (s) =>
          (s.stop_status === "GEPLAND" || s.stop_status === "ONDERWEG") &&
          s.planned_latitude != null &&
          s.planned_longitude != null,
      ),
    [stops],
  );

  useEffect(() => {
    if (!currentPosition) return;

    const now = Date.now();

    for (const stop of eligibleStops) {
      // Skip if still in cooldown
      const lastTrigger = cooldownMap.current[stop.id] ?? 0;
      if (now - lastTrigger < GEOFENCE_COOLDOWN_MS) continue;

      const dist = haversineMeters(
        currentPosition.latitude,
        currentPosition.longitude,
        stop.planned_latitude!,
        stop.planned_longitude!,
      );

      if (dist < GEOFENCE_RADIUS_M) {
        // Set cooldown immediately to prevent duplicate toasts
        cooldownMap.current[stop.id] = now;

        const address = stop.planned_address || `Stop #${stop.stop_sequence}`;

        toast(`U bent bij ${address}. Aankomst registreren?`, {
          duration: 15_000,
          action: {
            label: "Bevestig aankomst",
            onClick: () => onConfirmArrival(stop.id),
          },
        });
      }
    }
  }, [currentPosition, eligibleStops, onConfirmArrival]);
}

// ─── Hook 4: useDriveTime ──────────────────────────────────────────
// EU 561/2006 limits
const MAX_CONTINUOUS_DRIVE_H = 4.5;
const MAX_DAILY_DRIVE_H = 9;
const WARNING_THRESHOLD_H = 4; // 30 min before mandatory break

interface DriveTimeState {
  /** Continuous driving time in hours (resets on break/clock-out) */
  continuousDriveH: number;
  /** Total driving time today in hours */
  dailyDriveH: number;
  /** Status color: "green" | "orange" | "red" */
  statusColor: "green" | "orange" | "red";
  /** Warning message, if any */
  warning: string | null;
  /** Whether the mandatory break limit is exceeded */
  mandatoryBreak: boolean;
  /** Whether the daily limit is exceeded */
  dailyLimitReached: boolean;
}

/**
 * Computes continuous and daily driving time from today's time entries.
 * "Driving" = clocked in AND not on break.
 * The timer runs live via a 1-second interval when actively driving.
 */
export function useDriveTime(
  isClocked: boolean,
  isOnBreak: boolean,
  todayEntries: TimeEntry[],
): DriveTimeState {
  const [tick, setTick] = useState(0);

  // Tick every second while actively driving
  useEffect(() => {
    if (!isClocked || isOnBreak) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [isClocked, isOnBreak]);

  return useMemo(() => {
    const { continuous, daily } = calculateDriveTime(todayEntries);

    let statusColor: DriveTimeState["statusColor"] = "green";
    let warning: string | null = null;
    let mandatoryBreak = false;
    let dailyLimitReached = false;

    if (continuous >= MAX_CONTINUOUS_DRIVE_H) {
      statusColor = "red";
      warning = "VERPLICHTE PAUZE — Rij niet verder";
      mandatoryBreak = true;
    } else if (continuous >= WARNING_THRESHOLD_H) {
      statusColor = "orange";
      const minutesLeft = Math.round((MAX_CONTINUOUS_DRIVE_H - continuous) * 60);
      warning = `Let op: over ${minutesLeft} minuten verplichte pauze`;
    } else if (continuous >= 3.5) {
      statusColor = "orange";
    }

    if (daily >= MAX_DAILY_DRIVE_H) {
      statusColor = "red";
      warning = "DAGELIJKSE RIJTIJDLIMIET BEREIKT (9u)";
      dailyLimitReached = true;
    }

    return {
      continuousDriveH: continuous,
      dailyDriveH: daily,
      statusColor,
      warning,
      mandatoryBreak,
      dailyLimitReached,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayEntries, tick]);
}

/**
 * Calculate continuous (since last break/clock-in) and daily drive time
 * from chronological time entries. "Drive time" = time clocked in minus breaks.
 */
function calculateDriveTime(entries: TimeEntry[]): {
  continuous: number;
  daily: number;
} {
  let dailyMs = 0;
  let continuousMs = 0;
  let clockInTime: number | null = null;
  let breakStartTime: number | null = null;
  let segmentBreakMs = 0;
  // Track the start of the current continuous block (after last break end or clock in)
  let continuousBlockStart: number | null = null;
  let continuousBlockBreakMs = 0;

  for (const entry of entries) {
    const t = new Date(entry.recorded_at).getTime();

    switch (entry.entry_type) {
      case "clock_in":
        clockInTime = t;
        segmentBreakMs = 0;
        continuousBlockStart = t;
        continuousBlockBreakMs = 0;
        break;

      case "clock_out":
        if (clockInTime !== null) {
          dailyMs += t - clockInTime - segmentBreakMs;
          clockInTime = null;
          segmentBreakMs = 0;
          continuousBlockStart = null;
          continuousBlockBreakMs = 0;
        }
        break;

      case "break_start":
        breakStartTime = t;
        // End of continuous block — compute it
        if (continuousBlockStart !== null) {
          continuousMs = t - continuousBlockStart - continuousBlockBreakMs;
        }
        break;

      case "break_end":
        if (breakStartTime !== null) {
          const breakLen = t - breakStartTime;
          segmentBreakMs += breakLen;
          breakStartTime = null;
          // A break >= 45 min resets continuous drive time per EU 561
          if (breakLen >= 45 * 60 * 1000) {
            continuousBlockStart = t;
            continuousBlockBreakMs = 0;
            continuousMs = 0;
          } else {
            // Short break: continuous block continues but break time is subtracted
            continuousBlockBreakMs += breakLen;
          }
        }
        break;

      case "drive_start":
      case "drive_end":
        // Optional granular events — not used in base calculation
        break;
    }
  }

  // If still clocked in, count up to now
  const now = Date.now();
  if (clockInTime !== null) {
    let currentBreakMs = segmentBreakMs;
    if (breakStartTime !== null) {
      currentBreakMs += now - breakStartTime;
    }
    dailyMs += now - clockInTime - currentBreakMs;

    // Continuous
    if (continuousBlockStart !== null) {
      let contBreak = continuousBlockBreakMs;
      if (breakStartTime !== null) {
        contBreak += now - breakStartTime;
      }
      continuousMs = now - continuousBlockStart - contBreak;
    }
  }

  return {
    continuous: Math.max(0, continuousMs / (1000 * 60 * 60)),
    daily: Math.max(0, dailyMs / (1000 * 60 * 60)),
  };
}
