import { describe, it, expect } from "vitest";
import {
  runAutoPlanner,
  getPostcodeRegion,
  type PlannerOrder,
  type PlannerVehicleType,
  type PlannerVehicle,
  type PlannerDriver,
} from "../../supabase/functions/_shared/autoPlanner";

function makeOrder(partial: Partial<PlannerOrder> & { id: string }): PlannerOrder {
  return {
    id: partial.id,
    delivery_address: partial.delivery_address ?? "Test 1, 3011 AA Rotterdam",
    pickup_address: partial.pickup_address ?? "Depot",
    weight_kg: partial.weight_kg ?? 100,
    is_weight_per_unit: partial.is_weight_per_unit ?? false,
    quantity: partial.quantity ?? 1,
    requirements: partial.requirements ?? [],
    vehicle_type_id: partial.vehicle_type_id ?? null,
    delivery_time_window_start: partial.delivery_time_window_start ?? null,
    delivery_time_window_end: partial.delivery_time_window_end ?? null,
    cargo_length_cm: partial.cargo_length_cm ?? null,
    cargo_width_cm: partial.cargo_width_cm ?? null,
    cargo_height_cm: partial.cargo_height_cm ?? null,
  };
}

const compactType: PlannerVehicleType = {
  id: "vt-compact",
  code: "compact",
  name: "Compact",
  sort_order: 10,
  max_length_cm: 200,
  max_width_cm: 120,
  max_height_cm: 130,
  max_weight_kg: 750,
  max_volume_m3: 3.12,
  max_pallets: 2,
  has_tailgate: false,
  has_cooling: false,
  adr_capable: false,
};

const vanType: PlannerVehicleType = {
  id: "vt-van",
  code: "van",
  name: "Bestelbus",
  sort_order: 20,
  max_length_cm: 300,
  max_width_cm: 180,
  max_height_cm: 190,
  max_weight_kg: 1500,
  max_volume_m3: 10.26,
  max_pallets: 6,
  has_tailgate: false,
  has_cooling: false,
  adr_capable: false,
};

const boxType: PlannerVehicleType = {
  id: "vt-box",
  code: "box-truck",
  name: "Bakwagen",
  sort_order: 30,
  max_length_cm: 650,
  max_width_cm: 240,
  max_height_cm: 240,
  max_weight_kg: 8000,
  max_volume_m3: 37.44,
  max_pallets: 16,
  has_tailgate: true,
  has_cooling: false,
  adr_capable: false,
};

const allTypes = [compactType, vanType, boxType];

function veh(id: string, typeId: string | null): PlannerVehicle {
  return { id, name: id, vehicle_type_id: typeId, capacity_kg: 5000, capacity_pallets: 10, features: [] };
}

function drv(id: string, opts: Partial<PlannerDriver> = {}): PlannerDriver {
  return {
    id,
    name: id,
    certifications: opts.certifications ?? [],
    contract_hours_per_week: opts.contract_hours_per_week ?? null,
    planned_hours_this_week: opts.planned_hours_this_week ?? 0,
  };
}

describe("getPostcodeRegion", () => {
  it("extraheert PC2 uit adres met Nederlandse postcode", () => {
    expect(getPostcodeRegion("Test 1, 3011 AA Rotterdam", "PC2")).toBe("30");
    expect(getPostcodeRegion("Coolsingel 10, 3011AA Rotterdam", "PC2")).toBe("30");
    expect(getPostcodeRegion("1015 CJ Amsterdam", "PC2")).toBe("10");
  });

  it("geeft PC3 als granularity dat vraagt", () => {
    expect(getPostcodeRegion("Test 1, 3011 AA Rotterdam", "PC3")).toBe("301");
    expect(getPostcodeRegion("Test 1, 1015 CJ Amsterdam", "PC3")).toBe("101");
  });

  it("return null als geen postcode aanwezig", () => {
    expect(getPostcodeRegion("Rotterdam", "PC2")).toBeNull();
    expect(getPostcodeRegion(null, "PC2")).toBeNull();
  });
});

describe("runAutoPlanner", () => {
  it("plaatst orders in dezelfde postcode-regio samen in één cluster", () => {
    const orders = [
      makeOrder({ id: "o1", delivery_address: "Coolsingel 10, 3011 AA Rotterdam", weight_kg: 100 }),
      makeOrder({ id: "o2", delivery_address: "Westblaak 50, 3014 ZA Rotterdam", weight_kg: 150 }),
    ];
    const result = runAutoPlanner({
      date: "2026-05-01",
      granularity: "PC2",
      orders,
      vehicleTypes: allTypes,
      vehicles: [veh("v1", "vt-van")],
      drivers: [drv("d1")],
    });
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0].orders.map((o) => o.id).sort()).toEqual(["o1", "o2"]);
    expect(result.unplaced).toHaveLength(0);
  });

  it("scheidt clusters op verschillende postcode-regio's", () => {
    const orders = [
      makeOrder({ id: "r", delivery_address: "Rotterdam, 3011 AA" }),
      makeOrder({ id: "a", delivery_address: "Amsterdam, 1015 CJ" }),
    ];
    const result = runAutoPlanner({
      date: "2026-05-01",
      granularity: "PC2",
      orders,
      vehicleTypes: allTypes,
      vehicles: [veh("v1", "vt-van"), veh("v2", "vt-van")],
      drivers: [drv("d1"), drv("d2")],
    });
    expect(result.proposals).toHaveLength(2);
  });

  it("forceert type met has_tailgate als order klep vereist", () => {
    const orders = [
      makeOrder({ id: "klep", delivery_address: "3011 AA", requirements: ["LAADKLEP"], weight_kg: 200 }),
    ];
    const result = runAutoPlanner({
      date: "2026-05-01",
      granularity: "PC2",
      orders,
      vehicleTypes: allTypes,
      vehicles: [veh("v1", "vt-van"), veh("v2", "vt-box")],
      drivers: [drv("d1"), drv("d2")],
    });
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0].vehicle_type_id).toBe("vt-box");
  });

  it("zet order in unplaced als geen adres herkenbaar is", () => {
    const orders = [makeOrder({ id: "o1", delivery_address: "Rotterdam" })];
    const result = runAutoPlanner({
      date: "2026-05-01",
      granularity: "PC2",
      orders,
      vehicleTypes: allTypes,
      vehicles: [veh("v1", "vt-van")],
      drivers: [drv("d1")],
    });
    expect(result.proposals).toHaveLength(0);
    expect(result.unplaced).toEqual([{ order_id: "o1", reason: "no_address" }]);
  });

  it("zet order in unplaced als capaciteit overschrijdt", () => {
    const orders = [makeOrder({ id: "zwaar", delivery_address: "3011 AA", weight_kg: 50000 })];
    const result = runAutoPlanner({
      date: "2026-05-01",
      granularity: "PC2",
      orders,
      vehicleTypes: allTypes,
      vehicles: [veh("v1", "vt-box")],
      drivers: [drv("d1")],
    });
    expect(result.unplaced[0].reason).toBe("over_capacity");
  });

  it("respecteert contracturen per chauffeur per week", () => {
    // Zes orders, zelfde regio, samen onder 1500 kg en 6 pallets zodat een van
    // past. Duration = 6 stops × 30min × 2 = 6 uur. Driver heeft contract 32u
    // met al 30u gepland, remaining = 2u < 6u nodig, dus driver filtered.
    const orders = Array.from({ length: 6 }, (_, i) =>
      makeOrder({ id: `o${i}`, delivery_address: `3011 AA Rotterdam`, weight_kg: 100, quantity: 1 }),
    );
    const result = runAutoPlanner({
      date: "2026-05-01",
      granularity: "PC2",
      orders,
      vehicleTypes: allTypes,
      vehicles: [veh("v1", "vt-van")],
      drivers: [drv("d1", { contract_hours_per_week: 32, planned_hours_this_week: 30 })],
    });
    const unplacedByHours = result.unplaced.filter((u) => u.reason === "no_matching_driver");
    expect(unplacedByHours.length).toBeGreaterThan(0);
  });

  it("kiest chauffeur met ADR-certificaat bij ADR-order", () => {
    const orders = [
      makeOrder({ id: "adr", delivery_address: "3011 AA", requirements: ["ADR"], weight_kg: 100 }),
    ];
    const result = runAutoPlanner({
      date: "2026-05-01",
      granularity: "PC2",
      orders,
      vehicleTypes: [{ ...vanType, adr_capable: true }, compactType, boxType],
      vehicles: [veh("v1", "vt-van")],
      drivers: [drv("d1"), drv("d2", { certifications: ["ADR"] })],
    });
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0].driver_id).toBe("d2");
  });
});
