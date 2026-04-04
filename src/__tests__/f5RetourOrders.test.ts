/**
 * F5: Unit tests for return order logic and packaging balance calculation.
 */
import { describe, it, expect, vi } from "vitest";

// Mock Supabase (not needed for pure logic, but imported transitively)
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: vi.fn().mockImplementation((cb: any) => cb({ data: [], error: null })),
    }),
  },
}));

vi.mock("@/lib/supabaseHelpers", () => ({
  fromTable: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    then: vi.fn().mockImplementation((cb: any) => cb({ data: [], error: null })),
  }),
}));

import { buildRetourPayload } from "@/hooks/useReturnOrders";
import type { PackagingMovement } from "@/types/f5";

/* ── buildRetourPayload ──────────────────────────────────────────── */

describe("buildRetourPayload", () => {
  const parent = {
    id: "order-1",
    client_name: "Acme BV",
    tenant_id: "tenant-1",
    pickup_address: "Pickup straat 1, Amsterdam",
    delivery_address: "Delivery laan 5, Rotterdam",
    weight_kg: 1200,
    quantity: 6,
    unit: "pallet",
  };

  it("sets order_type to RETOUR", () => {
    const payload = buildRetourPayload(parent, "BESCHADIGD");
    expect(payload.order_type).toBe("RETOUR");
  });

  it("sets return_reason from argument", () => {
    const payload = buildRetourPayload(parent, "WEIGERING");
    expect(payload.return_reason).toBe("WEIGERING");
  });

  it("swaps pickup and delivery addresses", () => {
    const payload = buildRetourPayload(parent, "VERKEERD");
    expect(payload.pickup_address).toBe(parent.delivery_address);
    expect(payload.delivery_address).toBe(parent.pickup_address);
  });

  it("copies weight and quantity from parent", () => {
    const payload = buildRetourPayload(parent, "OVERSCHOT");
    expect(payload.weight_kg).toBe(1200);
    expect(payload.quantity).toBe(6);
    expect(payload.unit).toBe("pallet");
  });

  it("sets parent_order_id", () => {
    const payload = buildRetourPayload(parent, "OVERIG");
    expect(payload.parent_order_id).toBe("order-1");
  });

  it("preserves client name and tenant", () => {
    const payload = buildRetourPayload(parent, "OVERIG");
    expect(payload.client_name).toBe("Acme BV");
    expect(payload.tenant_id).toBe("tenant-1");
  });

  it("handles null addresses gracefully", () => {
    const parentWithNulls = { ...parent, pickup_address: null, delivery_address: null };
    const payload = buildRetourPayload(parentWithNulls, "OVERIG");
    expect(payload.pickup_address).toBeNull();
    expect(payload.delivery_address).toBeNull();
  });

  it("sets priority to normaal", () => {
    const payload = buildRetourPayload(parent, "OVERIG");
    expect(payload.priority).toBe("normaal");
  });
});

/* ── Packaging balance calculation ──────────────────────────────── */

/**
 * Pure helper: compute balance from movements array (mirrors the DB VIEW logic).
 * SUM(CASE WHEN direction='UIT' THEN quantity ELSE -quantity END)
 */
function computeBalance(movements: Pick<PackagingMovement, "direction" | "quantity">[]): number {
  return movements.reduce((sum, m) => {
    return sum + (m.direction === "UIT" ? m.quantity : -m.quantity);
  }, 0);
}

describe("packaging balance calculation", () => {
  it("returns 0 when no movements", () => {
    expect(computeBalance([])).toBe(0);
  });

  it("calculates positive balance for UIT movements", () => {
    const movements = [
      { direction: "UIT" as const, quantity: 6 },
      { direction: "UIT" as const, quantity: 4 },
    ];
    expect(computeBalance(movements)).toBe(10);
  });

  it("reduces balance for IN movements", () => {
    const movements = [
      { direction: "UIT" as const, quantity: 10 },
      { direction: "IN" as const, quantity: 4 },
    ];
    expect(computeBalance(movements)).toBe(6);
  });

  it("returns 0 when all returned", () => {
    const movements = [
      { direction: "UIT" as const, quantity: 8 },
      { direction: "IN" as const, quantity: 8 },
    ];
    expect(computeBalance(movements)).toBe(0);
  });

  it("returns negative balance when more IN than UIT", () => {
    const movements = [
      { direction: "UIT" as const, quantity: 3 },
      { direction: "IN" as const, quantity: 5 },
    ];
    expect(computeBalance(movements)).toBe(-2);
  });

  it("handles large quantities correctly", () => {
    const movements = [
      { direction: "UIT" as const, quantity: 1000 },
      { direction: "IN" as const, quantity: 250 },
      { direction: "UIT" as const, quantity: 500 },
      { direction: "IN" as const, quantity: 100 },
    ];
    // UIT: 1500, IN: 350 → 1150
    expect(computeBalance(movements)).toBe(1150);
  });
});

/* ── Address reversal helpers ────────────────────────────────────── */

describe("address swap in retour payload", () => {
  it("completely swaps addresses when both present", () => {
    const parent = {
      id: "o1",
      client_name: "Test",
      tenant_id: "t1",
      pickup_address: "A",
      delivery_address: "B",
      weight_kg: null,
      quantity: null,
      unit: null,
    };
    const retour = buildRetourPayload(parent, "OVERIG");
    expect(retour.pickup_address).toBe("B");
    expect(retour.delivery_address).toBe("A");
  });

  it("correctly handles partial address (only pickup)", () => {
    const parent = {
      id: "o1",
      client_name: "Test",
      tenant_id: "t1",
      pickup_address: "Only pickup",
      delivery_address: null,
      weight_kg: null,
      quantity: null,
      unit: null,
    };
    const retour = buildRetourPayload(parent, "OVERIG");
    // pickup → delivery slot, null → pickup slot
    expect(retour.pickup_address).toBeNull();
    expect(retour.delivery_address).toBe("Only pickup");
  });
});

/* ── OrderType validation ────────────────────────────────────────── */

import type { OrderType, ReturnReason } from "@/types/f5";

describe("F5 type guards", () => {
  const VALID_ORDER_TYPES: OrderType[] = ["ZENDING", "RETOUR", "EMBALLAGE_RUIL"];
  const VALID_RETURN_REASONS: ReturnReason[] = [
    "BESCHADIGD", "VERKEERD", "WEIGERING", "OVERSCHOT", "OVERIG",
  ];

  it("has three valid order types", () => {
    expect(VALID_ORDER_TYPES.length).toBe(3);
    expect(VALID_ORDER_TYPES).toContain("RETOUR");
  });

  it("has five valid return reasons", () => {
    expect(VALID_RETURN_REASONS.length).toBe(5);
    expect(VALID_RETURN_REASONS).toContain("BESCHADIGD");
    expect(VALID_RETURN_REASONS).toContain("WEIGERING");
  });
});
