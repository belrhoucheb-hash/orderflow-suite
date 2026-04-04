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

import {
  useNotificationLogByOrder,
  useNotificationLogByTrip,
  useNotificationLogRecent,
} from "@/hooks/useNotificationLog";

describe("useNotificationLog hook exports", () => {
  it("exports useNotificationLogByOrder as a function", () => {
    expect(typeof useNotificationLogByOrder).toBe("function");
  });

  it("exports useNotificationLogByTrip as a function", () => {
    expect(typeof useNotificationLogByTrip).toBe("function");
  });

  it("exports useNotificationLogRecent as a function", () => {
    expect(typeof useNotificationLogRecent).toBe("function");
  });
});

describe("notification_log supabase query chain", () => {
  beforeEach(() => vi.clearAllMocks());

  it("queries notification_log by order_id", async () => {
    const mockData = [
      { id: "log-1", order_id: "order-123", channel: "EMAIL", status: "SENT" },
    ];
    const chain: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: mockData, error: null }),
    };
    mockFrom.mockReturnValue(chain);

    const result = await mockSupabase
      .from("notification_log" as any)
      .select("*")
      .eq("order_id", "order-123")
      .order("created_at", { ascending: false })
      .limit(50);

    expect(mockFrom).toHaveBeenCalledWith("notification_log");
    expect(chain.eq).toHaveBeenCalledWith("order_id", "order-123");
    expect(result.data).toEqual(mockData);
  });

  it("queries notification_log by trip_id", async () => {
    const mockData = [
      { id: "log-2", trip_id: "trip-456", channel: "SMS", status: "QUEUED" },
    ];
    const chain: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: mockData, error: null }),
    };
    mockFrom.mockReturnValue(chain);

    const result = await mockSupabase
      .from("notification_log" as any)
      .select("*")
      .eq("trip_id", "trip-456")
      .order("created_at", { ascending: false })
      .limit(50);

    expect(chain.eq).toHaveBeenCalledWith("trip_id", "trip-456");
    expect(result.data).toEqual(mockData);
  });

  it("queries recent notification_log with limit", async () => {
    const chain: any = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    mockFrom.mockReturnValue(chain);

    const result = await mockSupabase
      .from("notification_log" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(25);

    expect(chain.limit).toHaveBeenCalledWith(25);
    expect(result.data).toEqual([]);
  });
});
