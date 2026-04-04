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
  useNotificationTemplates,
  useNotificationTemplate,
  useUpsertNotificationTemplate,
  useToggleNotificationTemplate,
  useDeleteNotificationTemplate,
} from "@/hooks/useNotificationTemplates";

describe("useNotificationTemplates hook exports", () => {
  beforeEach(() => vi.clearAllMocks());

  it("exports useNotificationTemplates as a function", () => {
    expect(typeof useNotificationTemplates).toBe("function");
  });

  it("exports useNotificationTemplate as a function", () => {
    expect(typeof useNotificationTemplate).toBe("function");
  });

  it("exports useUpsertNotificationTemplate as a function", () => {
    expect(typeof useUpsertNotificationTemplate).toBe("function");
  });

  it("exports useToggleNotificationTemplate as a function", () => {
    expect(typeof useToggleNotificationTemplate).toBe("function");
  });

  it("exports useDeleteNotificationTemplate as a function", () => {
    expect(typeof useDeleteNotificationTemplate).toBe("function");
  });
});

describe("supabase query chain for notification_templates", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls from with notification_templates and chains select + order", async () => {
    const mockData = [
      { id: "1", trigger_event: "ORDER_CONFIRMED", channel: "EMAIL" },
      { id: "2", trigger_event: "TRIP_STARTED", channel: "SMS" },
    ];

    const chain: any = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
    };
    chain.order
      .mockReturnValueOnce(chain)
      .mockResolvedValueOnce({ data: mockData, error: null });
    mockFrom.mockReturnValue(chain);

    const result = await mockSupabase
      .from("notification_templates" as any)
      .select("*")
      .order("trigger_event", { ascending: true })
      .order("channel", { ascending: true });

    expect(mockFrom).toHaveBeenCalledWith("notification_templates");
    expect(chain.select).toHaveBeenCalledWith("*");
    expect(result.data).toEqual(mockData);
    expect(result.error).toBeNull();
  });
});
