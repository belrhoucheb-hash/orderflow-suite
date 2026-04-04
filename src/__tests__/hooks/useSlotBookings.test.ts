// src/__tests__/hooks/useSlotBookings.test.ts
import { renderHook, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const { mockSelect, mockInsert, mockUpdate, mockEq, mockOrder, mockFrom, mockSupabase, mockGte, mockLte } = vi.hoisted(() => {
  const mockSelect = vi.fn().mockReturnThis();
  const mockInsert = vi.fn().mockReturnThis();
  const mockUpdate = vi.fn().mockReturnThis();
  const mockEq = vi.fn().mockReturnThis();
  const mockOrder = vi.fn().mockReturnThis();
  const mockGte = vi.fn().mockReturnThis();
  const mockLte = vi.fn().mockReturnThis();

  const chainable = { select: mockSelect, insert: mockInsert, update: mockUpdate, eq: mockEq, order: mockOrder, gte: mockGte, lte: mockLte };
  Object.values(chainable).forEach((fn) => fn.mockReturnValue(chainable));

  const mockFrom = vi.fn().mockReturnValue(chainable);
  const mockSupabase = {
    from: mockFrom,
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  };
  return { mockSelect, mockInsert, mockUpdate, mockEq, mockOrder, mockFrom, mockSupabase, mockGte, mockLte };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));

import { useSlotBookings } from "@/hooks/useSlotBookings";

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) =>
    QueryClientProvider({ client: qc, children });
}

describe("useSlotBookings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches bookings for a location and date", async () => {
    const mockBookings = [
      { id: "sb1", client_location_id: "loc1", slot_date: "2026-04-04", slot_start: "09:00", slot_end: "09:30", status: "GEBOEKT" },
    ];
    mockOrder.mockResolvedValueOnce({ data: mockBookings, error: null });

    const { result } = renderHook(
      () => useSlotBookings({ locationId: "loc1", date: "2026-04-04" }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(mockFrom).toHaveBeenCalledWith("slot_bookings");
    expect(mockEq).toHaveBeenCalledWith("client_location_id", "loc1");
    expect(mockEq).toHaveBeenCalledWith("slot_date", "2026-04-04");
  });

  it("is disabled when locationId is null", () => {
    const { result } = renderHook(
      () => useSlotBookings({ locationId: null, date: "2026-04-04" }),
      { wrapper: createWrapper() }
    );
    expect(result.current.isLoading).toBe(false);
  });
});
