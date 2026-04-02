import { describe, it, expect } from "vitest";
import {
  canTransitionTrip,
  canTransitionStop,
  TRIP_TRANSITIONS,
  STOP_TRANSITIONS,
  type TripStatus,
  type StopStatus,
} from "@/types/dispatch";

describe("Trip Status Transitions", () => {
  // ─── All valid forward transitions ────────────────────────────────
  describe("valid transitions", () => {
    const validCases: [TripStatus, TripStatus][] = [
      ["CONCEPT", "VERZENDKLAAR"],
      ["CONCEPT", "AFGEBROKEN"],
      ["VERZENDKLAAR", "VERZONDEN"],
      ["VERZENDKLAAR", "CONCEPT"],
      ["VERZENDKLAAR", "AFGEBROKEN"],
      ["VERZONDEN", "ONTVANGEN"],
      ["VERZONDEN", "AFGEBROKEN"],
      ["ONTVANGEN", "GEACCEPTEERD"],
      ["ONTVANGEN", "GEWEIGERD"],
      ["GEACCEPTEERD", "ACTIEF"],
      ["GEACCEPTEERD", "AFGEBROKEN"],
      ["ACTIEF", "VOLTOOID"],
      ["ACTIEF", "AFGEBROKEN"],
    ];

    it.each(validCases)("%s -> %s is allowed", (from, to) => {
      expect(canTransitionTrip(from, to)).toBe(true);
    });
  });

  // ─── Terminal states ──────────────────────────────────────────────
  describe("terminal states cannot transition", () => {
    const terminalStatuses: TripStatus[] = ["VOLTOOID", "AFGEBROKEN", "GEWEIGERD"];
    const allStatuses: TripStatus[] = [
      "CONCEPT", "VERZENDKLAAR", "VERZONDEN", "ONTVANGEN",
      "GEACCEPTEERD", "GEWEIGERD", "ACTIEF", "VOLTOOID", "AFGEBROKEN",
    ];

    for (const terminal of terminalStatuses) {
      it(`${terminal} -> anything is rejected`, () => {
        for (const target of allStatuses) {
          expect(canTransitionTrip(terminal, target)).toBe(false);
        }
      });
    }
  });

  // ─── Invalid / skipping transitions ───────────────────────────────
  describe("invalid transitions", () => {
    const invalidCases: [TripStatus, TripStatus][] = [
      ["CONCEPT", "ACTIEF"],
      ["CONCEPT", "VOLTOOID"],
      ["CONCEPT", "ONTVANGEN"],
      ["VERZONDEN", "CONCEPT"],
      ["ACTIEF", "CONCEPT"],
      ["ONTVANGEN", "ACTIEF"],
    ];

    it.each(invalidCases)("%s -> %s is rejected", (from, to) => {
      expect(canTransitionTrip(from, to)).toBe(false);
    });
  });

  // ─── Same status ──────────────────────────────────────────────────
  describe("same status transitions", () => {
    const allStatuses: TripStatus[] = [
      "CONCEPT", "VERZENDKLAAR", "VERZONDEN", "ONTVANGEN",
      "GEACCEPTEERD", "GEWEIGERD", "ACTIEF", "VOLTOOID", "AFGEBROKEN",
    ];

    it.each(allStatuses)("%s -> %s (same) is rejected", (status) => {
      expect(canTransitionTrip(status, status)).toBe(false);
    });
  });

  // ─── Unknown status ───────────────────────────────────────────────
  describe("unknown statuses", () => {
    it("unknown source returns false", () => {
      expect(canTransitionTrip("ONBEKEND" as TripStatus, "CONCEPT")).toBe(false);
    });

    it("unknown target returns false", () => {
      expect(canTransitionTrip("CONCEPT", "ONBEKEND" as TripStatus)).toBe(false);
    });
  });

  // ─── TRIP_TRANSITIONS map completeness ────────────────────────────
  describe("TRIP_TRANSITIONS completeness", () => {
    it("has entries for all 9 statuses", () => {
      expect(Object.keys(TRIP_TRANSITIONS)).toHaveLength(9);
    });
  });
});

describe("Stop Status Transitions", () => {
  describe("valid transitions", () => {
    const validCases: [StopStatus, StopStatus][] = [
      ["GEPLAND", "ONDERWEG"],
      ["GEPLAND", "OVERGESLAGEN"],
      ["ONDERWEG", "AANGEKOMEN"],
      ["ONDERWEG", "OVERGESLAGEN"],
      ["AANGEKOMEN", "LADEN"],
      ["AANGEKOMEN", "LOSSEN"],
      ["AANGEKOMEN", "MISLUKT"],
      ["LADEN", "AFGELEVERD"],
      ["LADEN", "MISLUKT"],
      ["LOSSEN", "AFGELEVERD"],
      ["LOSSEN", "MISLUKT"],
    ];

    it.each(validCases)("%s -> %s is allowed", (from, to) => {
      expect(canTransitionStop(from, to)).toBe(true);
    });
  });

  describe("terminal stop states", () => {
    const terminalStops: StopStatus[] = ["AFGELEVERD", "MISLUKT", "OVERGESLAGEN"];

    for (const terminal of terminalStops) {
      it(`${terminal} -> anything is rejected`, () => {
        const allStopStatuses: StopStatus[] = [
          "GEPLAND", "ONDERWEG", "AANGEKOMEN", "LADEN", "LOSSEN",
          "AFGELEVERD", "MISLUKT", "OVERGESLAGEN",
        ];
        for (const target of allStopStatuses) {
          expect(canTransitionStop(terminal, target)).toBe(false);
        }
      });
    }
  });

  describe("STOP_TRANSITIONS completeness", () => {
    it("has entries for all 8 statuses", () => {
      expect(Object.keys(STOP_TRANSITIONS)).toHaveLength(8);
    });
  });
});
