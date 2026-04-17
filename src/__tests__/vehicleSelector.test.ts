import { describe, it, expect } from "vitest";
import { selectSmallestVehicleType } from "../../supabase/functions/_shared/vehicleSelector";
import type { VehicleType, CargoDimensions } from "@/types/rateModels";

function vt(overrides: Partial<VehicleType> & { code: string; sort_order: number }): VehicleType {
  return {
    id: `vt-${overrides.code}`,
    tenant_id: "t-1",
    name: overrides.code,
    max_length_cm: null,
    max_width_cm: null,
    max_height_cm: null,
    max_weight_kg: null,
    max_volume_m3: null,
    max_pallets: null,
    has_tailgate: false,
    has_cooling: false,
    adr_capable: false,
    is_active: true,
    created_at: "2026-04-18T00:00:00Z",
    updated_at: "2026-04-18T00:00:00Z",
    ...overrides,
  };
}

const defaultTypes: VehicleType[] = [
  vt({ code: "compact",   sort_order: 10, max_length_cm: 200, max_width_cm: 120, max_height_cm: 130, max_weight_kg: 750 }),
  vt({ code: "van",       sort_order: 20, max_length_cm: 300, max_width_cm: 180, max_height_cm: 190, max_weight_kg: 1500 }),
  vt({ code: "box-truck", sort_order: 30, max_length_cm: 650, max_width_cm: 240, max_height_cm: 240, max_weight_kg: 8000, has_tailgate: true }),
  vt({ code: "tractor",   sort_order: 40, max_length_cm: 1360, max_width_cm: 250, max_height_cm: 280, max_weight_kg: 24000, adr_capable: true }),
];

function cargo(overrides: Partial<CargoDimensions> = {}): CargoDimensions {
  return {
    length_cm: 30, width_cm: 30, height_cm: 30, weight_kg: 5,
    requires_tailgate: false, requires_cooling: false, requires_adr: false,
    ...overrides,
  };
}

describe("selectSmallestVehicleType", () => {
  it("kiest compact voor kleine zending zonder eisen", () => {
    const result = selectSmallestVehicleType(defaultTypes, cargo());
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.vehicle_type.id).toBe("vt-compact");
    }
  });

  it("kiest bakwagen als klep vereist", () => {
    const result = selectSmallestVehicleType(
      defaultTypes,
      cargo({ length_cm: 80, width_cm: 80, height_cm: 80, weight_kg: 300, requires_tailgate: true }),
    );
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.vehicle_type.id).toBe("vt-box-truck");
      expect(result.reason).toContain("laadklep");
    }
  });

  it("kiest trekker voor ADR", () => {
    const result = selectSmallestVehicleType(
      defaultTypes,
      cargo({ length_cm: 100, width_cm: 100, height_cm: 100, weight_kg: 500, requires_adr: true }),
    );
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.vehicle_type.id).toBe("vt-tractor");
    }
  });

  it("geeft error als niks past", () => {
    const result = selectSmallestVehicleType(
      defaultTypes,
      cargo({ length_cm: 2000, width_cm: 300, height_cm: 400, weight_kg: 50000 }),
    );
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toBe("no_vehicle_match");
    }
  });

  it("slaat inactieve types over", () => {
    const types = defaultTypes.map((t) =>
      t.code === "compact" ? { ...t, is_active: false } : t,
    );
    const result = selectSmallestVehicleType(types, cargo());
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.vehicle_type.id).toBe("vt-van");
    }
  });

  it("respecteert sort_order boven volgorde in array", () => {
    const shuffled = [defaultTypes[2], defaultTypes[0], defaultTypes[3], defaultTypes[1]];
    const result = selectSmallestVehicleType(shuffled, cargo());
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.vehicle_type.id).toBe("vt-compact");
    }
  });

  it("eist koeling als cargo dat vraagt", () => {
    const coolTypes: VehicleType[] = [
      vt({ code: "compact", sort_order: 10, max_length_cm: 1000, max_width_cm: 1000, max_height_cm: 1000, max_weight_kg: 10000 }),
      vt({ code: "cool-van", sort_order: 20, max_length_cm: 1000, max_width_cm: 1000, max_height_cm: 1000, max_weight_kg: 10000, has_cooling: true }),
    ];
    const result = selectSmallestVehicleType(coolTypes, cargo({ requires_cooling: true }));
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.vehicle_type.id).toBe("vt-cool-van");
    }
  });
});
