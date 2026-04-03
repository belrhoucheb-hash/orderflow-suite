import { vi, describe, it, expect, beforeEach } from "vitest";

const { mockFrom, mockSupabase } = vi.hoisted(() => {
  const mockFrom = vi.fn();
  const mockSupabase = {
    from: mockFrom,
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  };

  return { mockFrom, mockSupabase };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));

import { checkAndUpdateBillingStatus, checkTripCompletion } from "@/hooks/useBillingStatus";

describe("checkAndUpdateBillingStatus", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns GEREED when POD is valid and no blocking exceptions", async () => {
    let callIndex = 0;
    mockFrom.mockImplementation((table: string) => {
      callIndex++;
      const chain: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
      };
      if (table === "proof_of_delivery") {
        chain.limit.mockResolvedValue({ data: [{ pod_status: "ONTVANGEN" }] });
      } else if (table === "delivery_exceptions") {
        chain.limit.mockResolvedValue({ data: [] });
      } else if (table === "orders") {
        chain.eq.mockResolvedValue({ error: null });
      }
      return chain;
    });

    const result = await checkAndUpdateBillingStatus("o1");
    expect(result).toBe("GEREED");
  });

  it("returns GEBLOKKEERD when POD is missing", async () => {
    mockFrom.mockImplementation((table: string) => {
      const chain: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
      };
      if (table === "proof_of_delivery") {
        chain.limit.mockResolvedValue({ data: [] });
      } else if (table === "delivery_exceptions") {
        chain.limit.mockResolvedValue({ data: [] });
      } else {
        chain.eq.mockResolvedValue({ error: null });
      }
      return chain;
    });

    const result = await checkAndUpdateBillingStatus("o1");
    expect(result).toBe("GEBLOKKEERD");
  });

  it("returns GEBLOKKEERD when POD status is not approved", async () => {
    mockFrom.mockImplementation((table: string) => {
      const chain: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
      };
      if (table === "proof_of_delivery") {
        chain.limit.mockResolvedValue({ data: [{ pod_status: "AFGEKEURD" }] });
      } else if (table === "delivery_exceptions") {
        chain.limit.mockResolvedValue({ data: [] });
      } else {
        chain.eq.mockResolvedValue({ error: null });
      }
      return chain;
    });

    const result = await checkAndUpdateBillingStatus("o1");
    expect(result).toBe("GEBLOKKEERD");
  });

  it("returns GEBLOKKEERD when blocking exceptions exist", async () => {
    mockFrom.mockImplementation((table: string) => {
      const chain: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
      };
      if (table === "proof_of_delivery") {
        chain.limit.mockResolvedValue({ data: [{ pod_status: "GOEDGEKEURD" }] });
      } else if (table === "delivery_exceptions") {
        chain.limit.mockResolvedValue({ data: [{ id: "ex1" }] });
      } else {
        chain.eq.mockResolvedValue({ error: null });
      }
      return chain;
    });

    const result = await checkAndUpdateBillingStatus("o1");
    expect(result).toBe("GEBLOKKEERD");
  });
});

describe("checkTripCompletion", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns false when no stops", async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [] }),
    }));

    const result = await checkTripCompletion("t1");
    expect(result).toBe(false);
  });

  it("returns false when not all stops are terminal", async () => {
    const stops = [
      { id: "s1", stop_status: "AFGELEVERD", order_id: "o1" },
      { id: "s2", stop_status: "ONDERWEG", order_id: "o2" },
    ];
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: stops }),
    }));

    const result = await checkTripCompletion("t1");
    expect(result).toBe(false);
  });

  it("completes trip when all stops are terminal", async () => {
    const stops = [
      { id: "s1", stop_status: "AFGELEVERD", order_id: "o1" },
      { id: "s2", stop_status: "MISLUKT", order_id: "o2" },
      { id: "s3", stop_status: "OVERGESLAGEN", order_id: null },
    ];

    // checkTripCompletion calls supabase many times sequentially.
    // We use a single mock that returns different data based on call count.
    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      callCount++;
      const makeChain = (data: any) => {
        const chain: any = {};
        const methods = ["select", "eq", "update", "order", "limit", "in", "not", "is"];
        methods.forEach(m => { chain[m] = vi.fn().mockReturnValue(chain); });
        chain.then = vi.fn().mockImplementation((resolve: any, reject?: any) =>
          Promise.resolve(data).then(resolve, reject)
        );
        return chain;
      };

      if (table === "trip_stops" && callCount === 1) {
        return makeChain({ data: stops, error: null });
      }
      if (table === "proof_of_delivery") {
        return makeChain({ data: [{ pod_status: "ONTVANGEN" }] });
      }
      if (table === "delivery_exceptions") {
        return makeChain({ data: [] });
      }
      // trips update, orders update, etc.
      return makeChain({ data: null, error: null });
    });

    const result = await checkTripCompletion("t1");
    expect(result).toBe(true);
  });

  it("returns false when stops is null", async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: null }),
    }));

    const result = await checkTripCompletion("t1");
    expect(result).toBe(false);
  });
});
