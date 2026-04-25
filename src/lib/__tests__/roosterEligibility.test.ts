import { describe, it, expect } from "vitest";

import {
  checkContractHoursOverflow,
  checkDriverCertificationForVehicle,
  checkVehicleAvailability,
  durationHours,
  vehicleTypeRequiresCode95,
} from "../roosterEligibility";

const DATE = "2026-04-24";

describe("checkVehicleAvailability", () => {
  it("zonder vehicleId is altijd ok", () => {
    expect(checkVehicleAvailability(null, DATE, []).ok).toBe(true);
    expect(checkVehicleAvailability(undefined, DATE, []).ok).toBe(true);
  });

  it("zonder availability-rijen is ok", () => {
    expect(checkVehicleAvailability("v1", DATE, []).ok).toBe(true);
    expect(checkVehicleAvailability("v1", DATE, null).ok).toBe(true);
  });

  it("status beschikbaar geeft ok", () => {
    const rows = [
      {
        id: "1",
        tenant_id: "t",
        vehicle_id: "v1",
        date: DATE,
        status: "beschikbaar",
        reason: null,
        created_at: "",
      },
    ];
    expect(checkVehicleAvailability("v1", DATE, rows).ok).toBe(true);
  });

  it("status onderhoud blokkeert met datum-tekst", () => {
    const rows = [
      {
        id: "1",
        tenant_id: "t",
        vehicle_id: "v1",
        date: DATE,
        status: "onderhoud",
        reason: "APK",
        created_at: "",
      },
    ];
    const r = checkVehicleAvailability("v1", DATE, rows);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("In onderhoud");
    expect(r.reason).toContain("APK");
  });

  it("status defect blokkeert ook", () => {
    const rows = [
      {
        id: "1",
        tenant_id: "t",
        vehicle_id: "v1",
        date: DATE,
        status: "defect",
        reason: null,
        created_at: "",
      },
    ];
    expect(checkVehicleAvailability("v1", DATE, rows).ok).toBe(false);
  });

  it("matcht alleen op dezelfde datum", () => {
    const rows = [
      {
        id: "1",
        tenant_id: "t",
        vehicle_id: "v1",
        date: "2026-04-25",
        status: "onderhoud",
        reason: null,
        created_at: "",
      },
    ];
    expect(checkVehicleAvailability("v1", DATE, rows).ok).toBe(true);
  });
});

describe("vehicleTypeRequiresCode95", () => {
  it("trekker en bakwagen vereisen Code 95", () => {
    expect(vehicleTypeRequiresCode95("trekker")).toBe(true);
    expect(vehicleTypeRequiresCode95("Bakwagen")).toBe(true);
    expect(vehicleTypeRequiresCode95("vrachtwagen")).toBe(true);
  });

  it("bestelbus en koelwagen vereisen geen Code 95", () => {
    expect(vehicleTypeRequiresCode95("bestelbus")).toBe(false);
    expect(vehicleTypeRequiresCode95("koelwagen")).toBe(false);
    expect(vehicleTypeRequiresCode95(null)).toBe(false);
    expect(vehicleTypeRequiresCode95("")).toBe(false);
  });
});

describe("checkDriverCertificationForVehicle", () => {
  it("zonder driver of zonder vervaldatums geeft geen waarschuwingen", () => {
    expect(
      checkDriverCertificationForVehicle(null, "trekker", DATE).warnings,
    ).toHaveLength(0);
    expect(
      checkDriverCertificationForVehicle(
        { code95_expiry_date: null, legitimation_expiry_date: null },
        "trekker",
        DATE,
      ).warnings,
    ).toContain("Code 95 niet geregistreerd voor dit voertuigtype");
  });

  it("waarschuwt voor rijbewijs dat binnen 30 dagen verloopt", () => {
    const r = checkDriverCertificationForVehicle(
      {
        legitimation_expiry_date: "2026-05-10",
        code95_expiry_date: "2030-01-01",
      },
      "trekker",
      DATE,
    );
    expect(r.ok).toBe(false);
    expect(r.warnings.some((w) => w.includes("Rijbewijs verloopt"))).toBe(true);
  });

  it("waarschuwt voor verlopen rijbewijs", () => {
    const r = checkDriverCertificationForVehicle(
      {
        legitimation_expiry_date: "2026-04-01",
        code95_expiry_date: "2030-01-01",
      },
      "bestelbus",
      DATE,
    );
    expect(r.ok).toBe(false);
    expect(r.warnings[0]).toContain("Rijbewijs verlopen");
  });

  it("vereist Code 95 alleen voor zware voertuigen", () => {
    const driver = {
      legitimation_expiry_date: "2030-01-01",
      code95_expiry_date: "2026-04-25",
    };
    expect(
      checkDriverCertificationForVehicle(driver, "bestelbus", DATE).ok,
    ).toBe(true);
    const heavy = checkDriverCertificationForVehicle(driver, "trekker", DATE);
    expect(heavy.ok).toBe(false);
    expect(heavy.warnings[0]).toContain("Code 95 verloopt");
  });

  it("ruim geldig rijbewijs en Code 95 geeft geen waarschuwing", () => {
    const r = checkDriverCertificationForVehicle(
      {
        legitimation_expiry_date: "2030-01-01",
        code95_expiry_date: "2030-01-01",
      },
      "trekker",
      DATE,
    );
    expect(r.ok).toBe(true);
    expect(r.warnings).toHaveLength(0);
  });
});

describe("checkContractHoursOverflow", () => {
  it("zonder contracturen geen overflow", () => {
    expect(
      checkContractHoursOverflow({ contract_hours_per_week: null }, 40, 8).ok,
    ).toBe(true);
    expect(
      checkContractHoursOverflow({ contract_hours_per_week: 0 }, 40, 8).ok,
    ).toBe(true);
    expect(checkContractHoursOverflow(null, 40, 8).ok).toBe(true);
  });

  it("binnen contracturen is ok", () => {
    expect(
      checkContractHoursOverflow(
        { contract_hours_per_week: 40 },
        24,
        8,
      ).ok,
    ).toBe(true);
  });

  it("over contracturen waarschuwt", () => {
    const r = checkContractHoursOverflow(
      { contract_hours_per_week: 32 },
      30,
      8,
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("32 uur contract, na inplannen 38 uur");
  });

  it("rondt fractie-uren netjes af", () => {
    const r = checkContractHoursOverflow(
      { contract_hours_per_week: 32 },
      30.25,
      8.5,
    );
    expect(r.reason).toContain("38,8");
  });
});

describe("durationHours", () => {
  it("rekent normale shift uit", () => {
    expect(durationHours("08:00", "16:30")).toBeCloseTo(8.5);
  });

  it("retourneert 0 bij ontbrekende waarden", () => {
    expect(durationHours(null, "16:00")).toBe(0);
    expect(durationHours("08:00", null)).toBe(0);
  });

  it("retourneert 0 bij eind ≤ start (geen middernacht-rollover)", () => {
    expect(durationHours("16:00", "08:00")).toBe(0);
    expect(durationHours("08:00", "08:00")).toBe(0);
  });

  it("retourneert 0 bij parsing-fout", () => {
    expect(durationHours("xx", "yy")).toBe(0);
  });
});
