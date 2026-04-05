import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  onOrderConfirmed,
  periodicOptimize,
  simulateVehicleRemoval,
} from "@/lib/rollingPlanner";
import type { PlanOrder, Assignments } from "@/components/planning/types";
import type { FleetVehicle } from "@/hooks/useVehicles";
import type { GeoCoord } from "@/data/geoData";
import type { PlanningResult, WhatIfResult } from "@/types/planning";

// -- Mocks ────────────────────────────────────────────────────

// Mock Supabase client
function createMockSupabase(overrides: {
  orders?: PlanOrder[];
  draftAssignments?: Assignments;
  shouldAutoExecute?: boolean;
} = {}) {
  const {
    orders = [],
    draftAssignments = {},
    shouldAutoExecute = false,
  } = overrides;

  // Build a chainable query mock that supports arbitrary .eq() depth
  // arrayData: what `await chain` resolves to (for queries without .single())
  // singleData: what `.single()` resolves to
  function createChainableQuery(arrayData: unknown[], singleData: unknown) {
    const chain: Record<string, any> = {};
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.single = vi.fn().mockResolvedValue({ data: singleData, error: null });
    chain.maybeSingle = vi.fn().mockResolvedValue({ data: singleData, error: null });
    // Make the chain thenable for `const { data, error } = await ...`
    chain.then = (resolve: any, reject?: any) =>
      Promise.resolve({ data: arrayData, error: null }).then(resolve, reject);
    return chain;
  }

  const mockFrom = vi.fn().mockImplementation((table: string) => {
    if (table === "orders") {
      return {
        select: vi.fn().mockReturnValue(
          createChainableQuery(orders, orders[0] || null)
        ),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: "mock-id" }, error: null }),
          }),
        }),
      };
    }
    if (table === "planning_drafts") {
      const rows = Object.entries(draftAssignments).map(([vehicleId, orderList]) => ({
        vehicle_id: vehicleId,
        order_ids: orderList.map((o: PlanOrder) => o.id),
      }));
      return {
        select: vi.fn().mockReturnValue(
          createChainableQuery(rows, rows[0] || null)
        ),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: "pd-1" }, error: null }),
          }),
        }),
        delete: vi.fn().mockReturnValue(createChainableQuery([], null)),
      };
    }
    if (table === "planning_events") {
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
        select: vi.fn().mockReturnValue(createChainableQuery([], null)),
      };
    }
    return {
      select: vi.fn().mockReturnValue(createChainableQuery([], null)),
      insert: vi.fn().mockResolvedValue({ error: null }),
    };
  });

  return {
    from: mockFrom,
    _orders: orders,
    _draftAssignments: draftAssignments,
    _shouldAutoExecute: shouldAutoExecute,
  };
}

// -- Fixtures ─────────────────────────────────────────────────

function makeOrder(overrides: Partial<PlanOrder> & { id: string }): PlanOrder {
  return {
    order_number: 1,
    client_name: "Test Client",
    pickup_address: "Amsterdam",
    delivery_address: "Rotterdam",
    quantity: 1,
    weight_kg: 100,
    requirements: [],
    is_weight_per_unit: false,
    time_window_start: null,
    time_window_end: null,
    pickup_time_from: null,
    pickup_time_to: null,
    delivery_time_from: null,
    delivery_time_to: null,
    geocoded_pickup_lat: null,
    geocoded_pickup_lng: null,
    geocoded_delivery_lat: null,
    geocoded_delivery_lng: null,
    delivery_date: null,
    pickup_date: null,
    ...overrides,
  };
}

function makeVehicle(overrides: Partial<FleetVehicle> & { id: string }): FleetVehicle {
  return {
    code: overrides.id,
    name: `Vehicle ${overrides.id}`,
    plate: "XX-000-X",
    type: "truck",
    capacityKg: 10000,
    capacityPallets: 20,
    features: [],
    ...overrides,
  };
}

const DEFAULT_VEHICLES: FleetVehicle[] = [
  makeVehicle({ id: "v1", capacityKg: 5000 }),
  makeVehicle({ id: "v2", capacityKg: 8000 }),
];

const DEFAULT_COORD_MAP = new Map<string, GeoCoord>([
  ["o1", { lat: 51.92, lng: 4.48 }],  // Rotterdam
  ["o2", { lat: 52.37, lng: 4.9 }],   // Amsterdam
  ["o3", { lat: 52.09, lng: 5.12 }],  // Utrecht
  ["o4", { lat: 51.44, lng: 5.47 }],  // Eindhoven
]);

const TENANT_ID = "tenant-001";
const DATE = "2026-04-05";

// -- Mock confidence engine ───────────────────────────────────

vi.mock("@/lib/confidenceEngine", () => ({
  shouldAutoExecute: vi.fn().mockResolvedValue({
    auto: false,
    reason: "Mock: autonomy disabled",
    inputConfidence: 0,
    outcomeConfidence: 0,
    threshold: 95,
    combinedScore: 0,
  }),
  recordDecision: vi.fn().mockResolvedValue(undefined),
}));

// -- onOrderConfirmed tests ───────────────────────────────────

describe("onOrderConfirmed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return a PlanningResult with trigger_type NEW_ORDER", async () => {
    const order = makeOrder({ id: "o1", weight_kg: 500 });
    const supabaseMock = createMockSupabase({ orders: [order] });

    const result = await onOrderConfirmed(
      supabaseMock as any,
      TENANT_ID,
      "o1",
      DEFAULT_VEHICLES,
      DEFAULT_COORD_MAP,
    );

    expect(result.trigger_type).toBe("NEW_ORDER");
    expect(result.trigger_entity_id).toBe("o1");
  });

  it("should have orders_evaluated >= 1", async () => {
    const order = makeOrder({ id: "o1", weight_kg: 500 });
    const supabaseMock = createMockSupabase({ orders: [order] });

    const result = await onOrderConfirmed(
      supabaseMock as any,
      TENANT_ID,
      "o1",
      DEFAULT_VEHICLES,
      DEFAULT_COORD_MAP,
    );

    expect(result.orders_evaluated).toBeGreaterThanOrEqual(1);
  });

  it("should record planning_duration_ms >= 0", async () => {
    const order = makeOrder({ id: "o1", weight_kg: 500 });
    const supabaseMock = createMockSupabase({ orders: [order] });

    const result = await onOrderConfirmed(
      supabaseMock as any,
      TENANT_ID,
      "o1",
      DEFAULT_VEHICLES,
      DEFAULT_COORD_MAP,
    );

    expect(result.planning_duration_ms).toBeGreaterThanOrEqual(0);
  });

  it("should set inserted_into when a vehicle is found", async () => {
    const order = makeOrder({ id: "o1", weight_kg: 500 });
    const supabaseMock = createMockSupabase({ orders: [order] });

    const result = await onOrderConfirmed(
      supabaseMock as any,
      TENANT_ID,
      "o1",
      DEFAULT_VEHICLES,
      DEFAULT_COORD_MAP,
    );

    expect(result.inserted_into).toBeTruthy();
    expect(result.orders_assigned).toBe(1);
  });

  it("should set inserted_into to null when no vehicle fits", async () => {
    const heavyOrder = makeOrder({ id: "o1", weight_kg: 99999 });
    const tinyVehicles = [makeVehicle({ id: "v1", capacityKg: 100 })];
    const supabaseMock = createMockSupabase({ orders: [heavyOrder] });

    const result = await onOrderConfirmed(
      supabaseMock as any,
      TENANT_ID,
      "o1",
      tinyVehicles,
      DEFAULT_COORD_MAP,
    );

    expect(result.inserted_into).toBeNull();
    expect(result.orders_assigned).toBe(0);
  });

  it("should include a valid confidence score", async () => {
    const order = makeOrder({ id: "o1", weight_kg: 500 });
    const supabaseMock = createMockSupabase({ orders: [order] });

    const result = await onOrderConfirmed(
      supabaseMock as any,
      TENANT_ID,
      "o1",
      DEFAULT_VEHICLES,
      DEFAULT_COORD_MAP,
    );

    expect(result.confidence.score).toBeGreaterThanOrEqual(0);
    expect(result.confidence.score).toBeLessThanOrEqual(100);
  });
});

// -- periodicOptimize tests ───────────────────────────────────

describe("periodicOptimize", () => {
  it("should return a PlanningResult with trigger_type SCHEDULE", async () => {
    const orders = [
      makeOrder({ id: "o1", weight_kg: 500, delivery_date: DATE }),
      makeOrder({ id: "o2", weight_kg: 300, delivery_date: DATE }),
    ];
    const supabaseMock = createMockSupabase({ orders });

    const result = await periodicOptimize(
      supabaseMock as any,
      TENANT_ID,
      DATE,
      DEFAULT_VEHICLES,
      DEFAULT_COORD_MAP,
    );

    expect(result.trigger_type).toBe("SCHEDULE");
  });

  it("should evaluate all orders for the date", async () => {
    const orders = [
      makeOrder({ id: "o1", weight_kg: 500, delivery_date: DATE }),
      makeOrder({ id: "o2", weight_kg: 300, delivery_date: DATE }),
      makeOrder({ id: "o3", weight_kg: 200, delivery_date: DATE }),
    ];
    const supabaseMock = createMockSupabase({ orders });

    const result = await periodicOptimize(
      supabaseMock as any,
      TENANT_ID,
      DATE,
      DEFAULT_VEHICLES,
      DEFAULT_COORD_MAP,
    );

    expect(result.orders_evaluated).toBe(3);
  });

  it("should include confidence metrics", async () => {
    const orders = [
      makeOrder({ id: "o1", weight_kg: 500, delivery_date: DATE }),
    ];
    const supabaseMock = createMockSupabase({ orders });

    const result = await periodicOptimize(
      supabaseMock as any,
      TENANT_ID,
      DATE,
      DEFAULT_VEHICLES,
      DEFAULT_COORD_MAP,
    );

    expect(result.confidence).toBeDefined();
    expect(typeof result.confidence.utilization_pct).toBe("number");
    expect(typeof result.confidence.efficiency_ratio).toBe("number");
  });
});

// -- simulateVehicleRemoval tests ─────────────────────────────

describe("simulateVehicleRemoval", () => {
  it("should return affected orders from the removed vehicle", async () => {
    const o1 = makeOrder({ id: "o1", weight_kg: 500, delivery_date: DATE });
    const o2 = makeOrder({ id: "o2", weight_kg: 300, delivery_date: DATE });
    const supabaseMock = createMockSupabase({
      orders: [o1, o2],
      draftAssignments: { v1: [o1], v2: [o2] },
    });

    const result = await simulateVehicleRemoval(
      supabaseMock as any,
      TENANT_ID,
      "v1",
      DATE,
      DEFAULT_VEHICLES,
      DEFAULT_COORD_MAP,
    );

    expect(result.removed_vehicle_id).toBe("v1");
    expect(result.affected_orders).toHaveLength(1);
    expect(result.affected_orders[0].id).toBe("o1");
  });

  it("should not include the removed vehicle in new_assignments", async () => {
    const o1 = makeOrder({ id: "o1", weight_kg: 500, delivery_date: DATE });
    const o2 = makeOrder({ id: "o2", weight_kg: 300, delivery_date: DATE });
    const supabaseMock = createMockSupabase({
      orders: [o1, o2],
      draftAssignments: { v1: [o1], v2: [o2] },
    });

    const result = await simulateVehicleRemoval(
      supabaseMock as any,
      TENANT_ID,
      "v1",
      DATE,
      DEFAULT_VEHICLES,
      DEFAULT_COORD_MAP,
    );

    expect(result.new_assignments["v1"]).toBeUndefined();
  });

  it("should identify unassignable orders when capacity is insufficient", async () => {
    const heavyOrder = makeOrder({ id: "o1", weight_kg: 7000, delivery_date: DATE });
    const o2 = makeOrder({ id: "o2", weight_kg: 4000, delivery_date: DATE });
    const vehicles = [
      makeVehicle({ id: "v1", capacityKg: 8000 }),
      makeVehicle({ id: "v2", capacityKg: 5000 }), // Cannot fit 7000 + 4000
    ];
    const supabaseMock = createMockSupabase({
      orders: [heavyOrder, o2],
      draftAssignments: { v1: [heavyOrder], v2: [o2] },
    });

    const result = await simulateVehicleRemoval(
      supabaseMock as any,
      TENANT_ID,
      "v1",
      DATE,
      vehicles,
      DEFAULT_COORD_MAP,
    );

    // v2 has 4000kg already, capacity 5000, cannot fit 7000 more
    expect(result.unassignable_orders.length).toBeGreaterThan(0);
  });

  it("should return confidence for the new solution", async () => {
    const o1 = makeOrder({ id: "o1", weight_kg: 500, delivery_date: DATE });
    const supabaseMock = createMockSupabase({
      orders: [o1],
      draftAssignments: { v1: [o1] },
    });

    const result = await simulateVehicleRemoval(
      supabaseMock as any,
      TENANT_ID,
      "v1",
      DATE,
      DEFAULT_VEHICLES,
      DEFAULT_COORD_MAP,
    );

    expect(result.confidence).toBeDefined();
    expect(result.confidence.score).toBeGreaterThanOrEqual(0);
  });
});
