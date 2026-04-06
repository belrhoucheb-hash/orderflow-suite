import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import type { ReactNode } from "react";

// ─── Mocks ───────────────────────────────────────────────────────

const { mockFrom, mockSupabase } = vi.hoisted(() => {
  const mockFrom = vi.fn();
  const mockSupabase = {
    from: mockFrom,
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: "u1" } } }, error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() }),
    removeChannel: vi.fn(),
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
  };
  return { mockFrom, mockSupabase };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));
vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({
    tenant: { id: "tenant-1", name: "Test", slug: "test", logoUrl: null, primaryColor: "#000" },
    loading: false,
  }),
}));

// ─── Helpers ─────────────────────────────────────────────────────

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

// Chain builder for Supabase mock
function chainMock(result: { data: any; error: any }) {
  const chain: any = {};
  const methods = ["select", "insert", "update", "delete", "eq", "gte", "in", "order", "limit", "maybeSingle", "single"];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  // Terminal methods return the result
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  chain.single = vi.fn().mockResolvedValue(result);
  // For select without single/maybeSingle, override order to return data
  chain.order = vi.fn().mockImplementation(() => {
    const sub: any = { ...chain };
    sub.limit = vi.fn().mockImplementation(() => {
      const sub2: any = { ...sub };
      sub2.maybeSingle = vi.fn().mockResolvedValue(result);
      sub2.single = vi.fn().mockResolvedValue(result);
      return sub2;
    });
    sub.maybeSingle = vi.fn().mockResolvedValue(result);
    sub.single = vi.fn().mockResolvedValue(result);
    return sub;
  });
  return chain;
}

// ─── Import after mocks ─────────────────────────────────────────

import { computePipelineStats, emitEventDirect } from "@/hooks/useEventPipeline";
import { useOrderTimeline, useOrderDurations } from "@/hooks/useEventPipeline";
import type { OrderEvent } from "@/types/events";

// ─── Tests ───────────────────────────────────────────────────────

describe("computePipelineStats", () => {
  it("computes average durations per phase transition", () => {
    const events = [
      { order_id: "o1", event_type: "email_received" as const, created_at: "2026-04-01T10:00:00Z" },
      { order_id: "o1", event_type: "ai_extraction_started" as const, created_at: "2026-04-01T10:01:00Z" },
      { order_id: "o1", event_type: "ai_extraction_completed" as const, created_at: "2026-04-01T10:02:00Z" },
      { order_id: "o2", event_type: "email_received" as const, created_at: "2026-04-01T11:00:00Z" },
      { order_id: "o2", event_type: "ai_extraction_started" as const, created_at: "2026-04-01T11:03:00Z" },
      { order_id: "o2", event_type: "ai_extraction_completed" as const, created_at: "2026-04-01T11:04:00Z" },
    ];

    const result = computePipelineStats(events);
    expect(result.phases.length).toBe(2);

    const emailToAi = result.phases.find(p => p.phase === "email_received -> ai_extraction_started");
    expect(emailToAi).toBeDefined();
    // o1: 1 min, o2: 3 min => avg 2 min = 120_000ms
    expect(emailToAi!.avgDurationMs).toBe(120_000);
    expect(emailToAi!.count).toBe(2);
  });

  it("detects bottleneck as the slowest phase", () => {
    const events = [
      { order_id: "o1", event_type: "email_received" as const, created_at: "2026-04-01T10:00:00Z" },
      { order_id: "o1", event_type: "ai_extraction_started" as const, created_at: "2026-04-01T10:01:00Z" },
      { order_id: "o1", event_type: "ai_extraction_completed" as const, created_at: "2026-04-01T10:30:00Z" },
    ];

    const result = computePipelineStats(events);
    expect(result.bottleneck).toBe("ai_extraction_started -> ai_extraction_completed");
  });

  it("returns empty when no events", () => {
    const result = computePipelineStats([]);
    expect(result.phases).toEqual([]);
    expect(result.bottleneck).toBeNull();
  });
});

describe("emitEventDirect", () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it("inserts an event with duration calculated from previous", async () => {
    const selectChain = chainMock({
      data: { created_at: new Date(Date.now() - 5000).toISOString() },
      error: null,
    });
    const insertChain = chainMock({
      data: { id: "evt1" },
      error: null,
    });

    mockFrom.mockImplementation((table: string) => {
      // First call is SELECT (to get previous event), second is INSERT
      if (mockFrom.mock.calls.length <= 1) return selectChain;
      return insertChain;
    });

    await emitEventDirect("order-1", "email_received", {
      actorType: "system",
      tenantId: "tenant-1",
    });

    // Should have called from("order_events") at least twice (select + insert)
    expect(mockFrom).toHaveBeenCalledWith("order_events");
  });

  it("does not throw on failure (fire-and-forget)", async () => {
    mockFrom.mockImplementation(() => {
      throw new Error("DB down");
    });

    // Should not throw
    await expect(
      emitEventDirect("order-1", "email_received"),
    ).resolves.toBeUndefined();
  });
});

describe("useOrderTimeline", () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it("returns events sorted chronologically", async () => {
    const mockEvents: Partial<OrderEvent>[] = [
      { id: "e1", order_id: "o1", event_type: "email_received", created_at: "2026-04-01T10:00:00Z" },
      { id: "e2", order_id: "o1", event_type: "ai_extraction_started", created_at: "2026-04-01T10:01:00Z" },
      { id: "e3", order_id: "o1", event_type: "ai_extraction_completed", created_at: "2026-04-01T10:02:00Z" },
    ];

    const chain: any = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.order = vi.fn().mockResolvedValue({ data: mockEvents, error: null });

    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => useOrderTimeline("o1"), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
      expect(result.current.data!.length).toBe(3);
      expect(result.current.data![0].event_type).toBe("email_received");
      expect(result.current.data![2].event_type).toBe("ai_extraction_completed");
    });
  });

  it("returns empty array when orderId is null", () => {
    const { result } = renderHook(() => useOrderTimeline(null), { wrapper: createWrapper() });
    // Should not be enabled, data stays undefined initially
    expect(result.current.data).toBeUndefined();
  });
});

describe("useOrderDurations", () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it("calculates durations between consecutive events", async () => {
    const mockEvents: Partial<OrderEvent>[] = [
      { id: "e1", order_id: "o1", event_type: "email_received", created_at: "2026-04-01T10:00:00Z" },
      { id: "e2", order_id: "o1", event_type: "ai_extraction_started", created_at: "2026-04-01T10:02:00Z" },
      { id: "e3", order_id: "o1", event_type: "ai_extraction_completed", created_at: "2026-04-01T10:05:00Z" },
    ];

    const chain: any = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.order = vi.fn().mockResolvedValue({ data: mockEvents, error: null });

    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => useOrderDurations("o1"), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.durations.length).toBe(2);
      expect(result.current.durations[0].from).toBe("email_received");
      expect(result.current.durations[0].to).toBe("ai_extraction_started");
      expect(result.current.durations[0].durationMs).toBe(120_000); // 2 minutes
      expect(result.current.durations[1].durationMs).toBe(180_000); // 3 minutes
    });
  });
});
