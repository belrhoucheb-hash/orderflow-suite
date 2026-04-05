// src/__tests__/timeWindowConflicts.test.ts
import { describe, it, expect } from "vitest";
import {
  detectTimeWindowConflicts,
  type TripStopWithWindow,
  type TimeWindowConflict,
} from "@/lib/timeWindowConflicts";

function makeStop(id: string, sequence: number, windowStart: string | null, windowEnd: string | null, travelMinFromPrev: number): TripStopWithWindow {
  return { id, stop_sequence: sequence, planned_window_start: windowStart, planned_window_end: windowEnd, travelMinFromPrev, unloadMin: 30 };
}

describe("detectTimeWindowConflicts", () => {
  it("returns no conflicts for compatible windows", () => {
    // Start 06:00 (360), stop s1 travel=60 => arrive 07:00, window 06:30-09:00 => ON TIME
    // Depart 07:30, stop s2 travel=30 => arrive 08:00, window 08:00-12:00 => ON TIME
    const stops = [
      makeStop("s1", 1, "06:30", "09:00", 60),
      makeStop("s2", 2, "08:00", "12:00", 30),
    ];
    const conflicts = detectTimeWindowConflicts(stops, 360);
    expect(conflicts).toHaveLength(0);
  });

  it("detects conflict when second stop cannot be reached in time", () => {
    // Start 06:00, s1 travel=30 => arrive 06:30, window 06:00-07:00 => ON TIME, depart 07:00
    // s2 travel=20 => arrive 07:20, window 07:00-07:10 => TE_LAAT
    const stops = [
      makeStop("s1", 1, "06:00", "07:00", 30),
      makeStop("s2", 2, "07:00", "07:10", 20),
    ];
    const conflicts = detectTimeWindowConflicts(stops, 360);
    expect(conflicts.length).toBeGreaterThan(0);
    const lateConflict = conflicts.find(c => c.type === "TE_LAAT");
    expect(lateConflict).toBeDefined();
    expect(lateConflict!.stopId).toBe("s2");
  });

  it("detects early arrival", () => {
    const stops = [
      makeStop("s1", 1, "10:00", "11:00", 30), // arrive 06:30, early
    ];
    const conflicts = detectTimeWindowConflicts(stops, 360);
    expect(conflicts[0].type).toBe("TE_VROEG");
    expect(conflicts[0].waitMin).toBeGreaterThan(0);
  });

  it("skips stops without time windows", () => {
    // Start 06:00, s1 no window travel=30 => arrive 06:30, no conflict, depart 07:00
    // s2 travel=20 => arrive 07:20, window 07:00-10:00 => ON TIME
    const stops = [
      makeStop("s1", 1, null, null, 30),
      makeStop("s2", 2, "07:00", "10:00", 20),
    ];
    const conflicts = detectTimeWindowConflicts(stops, 360);
    expect(conflicts).toHaveLength(0);
  });
});
