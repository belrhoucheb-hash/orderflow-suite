import { describe, it, expect } from "vitest";
import { isGatePassed } from "../vehicleCheckGate";

const now = new Date("2026-04-15T10:00:00Z");
const todayEarly = "2026-04-15T05:00:00Z";
const yesterday = "2026-04-14T12:00:00Z";

describe("isGatePassed", () => {
  it("geen check → dicht", () => {
    expect(isGatePassed(null, now)).toBe(false);
    expect(isGatePassed(undefined, now)).toBe(false);
  });

  it("PENDING → dicht", () => {
    expect(isGatePassed({ status: "PENDING", completed_at: null }, now)).toBe(false);
  });

  it("OK zonder completed_at → dicht", () => {
    expect(isGatePassed({ status: "OK", completed_at: null }, now)).toBe(false);
  });

  it("OK vandaag → open", () => {
    expect(isGatePassed({ status: "OK", completed_at: todayEarly }, now)).toBe(true);
  });

  it("RELEASED vandaag → open (handmatige vrijgave door planner)", () => {
    expect(isGatePassed({ status: "RELEASED", completed_at: todayEarly }, now)).toBe(true);
  });

  it("DAMAGE_FOUND vandaag zonder release → dicht", () => {
    expect(isGatePassed({ status: "DAMAGE_FOUND", completed_at: todayEarly }, now)).toBe(false);
  });

  it("OK van gisteren → dicht (vervalt om middernacht)", () => {
    expect(isGatePassed({ status: "OK", completed_at: yesterday }, now)).toBe(false);
  });
});
