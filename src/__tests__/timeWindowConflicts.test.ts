import { describe, it, expect } from "vitest";
import { detectTimeWindowConflicts, type TripStopWithWindow } from "@/lib/timeWindowConflicts";

function makeStop(id: string, sequence: number, windowStart: string | null, windowEnd: string | null, travelMinFromPrev: number): TripStopWithWindow {
  return { id, stop_sequence: sequence, planned_window_start: windowStart, planned_window_end: windowEnd, travelMinFromPrev, unloadMin: 30 };
}

describe("detectTimeWindowConflicts", () => {
  it("returns no conflicts for compatible windows", () => {
    const stops = [
      makeStop("s1", 1, "08:00", "09:00", 30),
      makeStop("s2", 2, "10:00", "12:00", 20),
    ];
    const conflicts = detectTimeWindowConflicts(stops, 360);
    expect(conflicts).toHaveLength(0);
  });

  it("detects conflict when second stop cannot be reached in time", () => {
    const stops = [
      makeStop("s1", 1, "08:00", "09:00", 30),
      makeStop("s2", 2, "08:00", "08:30", 20),
    ];
    const conflicts = detectTimeWindowConflicts(stops, 360);
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0].stopId).toBe("s2");
    expect(conflicts[0].type).toBe("TE_LAAT");
  });

  it("detects early arrival", () => {
    const stops = [makeStop("s1", 1, "10:00", "11:00", 30)];
    const conflicts = detectTimeWindowConflicts(stops, 360);
    expect(conflicts[0].type).toBe("TE_VROEG");
    expect(conflicts[0].waitMin).toBeGreaterThan(0);
  });

  it("skips stops without time windows", () => {
    const stops = [
      makeStop("s1", 1, null, null, 30),
      makeStop("s2", 2, "08:00", "10:00", 20),
    ];
    const conflicts = detectTimeWindowConflicts(stops, 360);
    expect(conflicts).toHaveLength(0);
  });
});
