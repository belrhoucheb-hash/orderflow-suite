import { describe, it, expect } from "vitest";
import { findVehicleConflictsOnDate, hasConflict } from "@/lib/roosterConflicts";
import type { DriverSchedule } from "@/types/rooster";

function makeSchedule(partial: Partial<DriverSchedule>): DriverSchedule {
  return {
    id: partial.id ?? crypto.randomUUID(),
    tenant_id: partial.tenant_id ?? "t1",
    driver_id: partial.driver_id ?? "d1",
    date: partial.date ?? "2026-05-01",
    shift_template_id: partial.shift_template_id ?? null,
    start_time: partial.start_time ?? "08:00",
    end_time: partial.end_time ?? "17:00",
    vehicle_id: partial.vehicle_id ?? null,
    status: partial.status ?? "werkt",
    notitie: partial.notitie ?? null,
    created_at: partial.created_at ?? "2026-04-30T10:00:00Z",
    updated_at: partial.updated_at ?? "2026-04-30T10:00:00Z",
    created_by: partial.created_by ?? null,
  };
}

describe("findVehicleConflictsOnDate", () => {
  it("detecteert twee chauffeurs op hetzelfde voertuig dezelfde dag", () => {
    const schedules = [
      makeSchedule({ id: "s1", driver_id: "d1", vehicle_id: "v1" }),
      makeSchedule({ id: "s2", driver_id: "d2", vehicle_id: "v1" }),
    ];
    const result = findVehicleConflictsOnDate(schedules);
    expect(result.size).toBe(1);
    expect(result.get("v1")).toHaveLength(2);
    expect(result.get("v1")!.map((s) => s.id).sort()).toEqual(["s1", "s2"]);
  });

  it("één chauffeur op één voertuig is géén conflict", () => {
    const schedules = [
      makeSchedule({ id: "s1", driver_id: "d1", vehicle_id: "v1" }),
      makeSchedule({ id: "s2", driver_id: "d2", vehicle_id: "v2" }),
    ];
    const result = findVehicleConflictsOnDate(schedules);
    expect(result.size).toBe(0);
  });

  it("negeert rijen zonder vehicle_id", () => {
    const schedules = [
      makeSchedule({ id: "s1", driver_id: "d1", vehicle_id: null }),
      makeSchedule({ id: "s2", driver_id: "d2", vehicle_id: null }),
    ];
    const result = findVehicleConflictsOnDate(schedules);
    expect(result.size).toBe(0);
  });

  it("negeert rijen met status vrij / ziek / verlof / feestdag", () => {
    const schedules = [
      makeSchedule({ id: "s1", driver_id: "d1", vehicle_id: "v1", status: "werkt" }),
      makeSchedule({ id: "s2", driver_id: "d2", vehicle_id: "v1", status: "vrij" }),
      makeSchedule({ id: "s3", driver_id: "d3", vehicle_id: "v1", status: "ziek" }),
      makeSchedule({ id: "s4", driver_id: "d4", vehicle_id: "v1", status: "verlof" }),
      makeSchedule({ id: "s5", driver_id: "d5", vehicle_id: "v1", status: "feestdag" }),
    ];
    const result = findVehicleConflictsOnDate(schedules);
    // Slechts één chauffeur "werkt" op v1, dus geen conflict
    expect(result.size).toBe(0);
  });

  it("groepeert drie chauffeurs op één voertuig tot een groep van 3", () => {
    const schedules = [
      makeSchedule({ id: "s1", driver_id: "d1", vehicle_id: "v1" }),
      makeSchedule({ id: "s2", driver_id: "d2", vehicle_id: "v1" }),
      makeSchedule({ id: "s3", driver_id: "d3", vehicle_id: "v1" }),
      makeSchedule({ id: "s4", driver_id: "d4", vehicle_id: "v2" }),
    ];
    const result = findVehicleConflictsOnDate(schedules);
    expect(result.size).toBe(1);
    expect(result.get("v1")).toHaveLength(3);
    expect(result.get("v2")).toBeUndefined();
  });

  it("lege input geeft lege map", () => {
    expect(findVehicleConflictsOnDate([]).size).toBe(0);
  });
});

describe("hasConflict", () => {
  it("true als een andere chauffeur op hetzelfde voertuig dezelfde dag staat", () => {
    const a = makeSchedule({ id: "s1", driver_id: "d1", vehicle_id: "v1", date: "2026-05-01" });
    const b = makeSchedule({ id: "s2", driver_id: "d2", vehicle_id: "v1", date: "2026-05-01" });
    expect(hasConflict(a, [a, b])).toBe(true);
    expect(hasConflict(b, [a, b])).toBe(true);
  });

  it("false bij zelfde voertuig maar andere datum", () => {
    const a = makeSchedule({ id: "s1", driver_id: "d1", vehicle_id: "v1", date: "2026-05-01" });
    const b = makeSchedule({ id: "s2", driver_id: "d2", vehicle_id: "v1", date: "2026-05-02" });
    expect(hasConflict(a, [a, b])).toBe(false);
  });

  it("false als vehicle_id null is", () => {
    const a = makeSchedule({ id: "s1", driver_id: "d1", vehicle_id: null });
    const b = makeSchedule({ id: "s2", driver_id: "d2", vehicle_id: null });
    expect(hasConflict(a, [a, b])).toBe(false);
  });

  it("false als huidige rij status vrij is", () => {
    const a = makeSchedule({ id: "s1", driver_id: "d1", vehicle_id: "v1", status: "vrij" });
    const b = makeSchedule({ id: "s2", driver_id: "d2", vehicle_id: "v1", status: "werkt" });
    expect(hasConflict(a, [a, b])).toBe(false);
  });

  it("false als de andere rij status ziek is", () => {
    const a = makeSchedule({ id: "s1", driver_id: "d1", vehicle_id: "v1", status: "werkt" });
    const b = makeSchedule({ id: "s2", driver_id: "d2", vehicle_id: "v1", status: "ziek" });
    expect(hasConflict(a, [a, b])).toBe(false);
  });

  it("false als enige rij met dit voertuig de rij zelf is", () => {
    const a = makeSchedule({ id: "s1", driver_id: "d1", vehicle_id: "v1" });
    expect(hasConflict(a, [a])).toBe(false);
  });
});
