// src/__tests__/hooks/useTimeWindows.test.ts
import { renderHook, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const { mockSelect, mockInsert, mockUpdate, mockDelete, mockEq, mockOrder, mockFrom, mockSupabase } = vi.hoisted(() => {
  const mockSelect = vi.fn().mockReturnThis();
  const mockInsert = vi.fn().mockReturnThis();
  const mockUpdate = vi.fn().mockReturnThis();
  const mockDelete = vi.fn().mockReturnThis();
  const mockEq = vi.fn().mockReturnThis();
  const mockOrder = vi.fn().mockReturnThis();

  const chainable = { select: mockSelect, insert: mockInsert, update: mockUpdate, delete: mockDelete, eq: mockEq, order: mockOrder };
  Object.values(chainable).forEach((fn) => fn.mockReturnValue(chainable));

  const mockFrom = vi.fn().mockReturnValue(chainable);
  const mockSupabase = {
    from: mockFrom,
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  };
  return { mockSelect, mockInsert, mockUpdate, mockDelete, mockEq, mockOrder, mockFrom, mockSupabase };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));

import { useTimeWindows } from "@/hooks/useTimeWindows";

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) =>
    QueryClientProvider({ client: qc, children });
}

describe("useTimeWindows", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches time windows for a location", async () => {
    const mockWindows = [
      { id: "tw1", client_location_id: "loc1", day_of_week: 0, open_time: "08:00", close_time: "17:00", slot_duration_min: 30, max_concurrent_slots: 2 },
    ];
    mockOrder.mockResolvedValueOnce({ data: mockWindows, error: null });

    const { result } = renderHook(() => useTimeWindows("loc1"), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(mockFrom).toHaveBeenCalledWith("location_time_windows");
    expect(mockEq).toHaveBeenCalledWith("client_location_id", "loc1");
  });

  it("is disabled when locationId is null", () => {
    const { result } = renderHook(() => useTimeWindows(null), { wrapper: createWrapper() });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });
});
