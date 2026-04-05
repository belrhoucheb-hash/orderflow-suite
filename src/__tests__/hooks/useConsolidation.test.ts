// src/__tests__/hooks/useConsolidation.test.ts
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

import { useConsolidationGroups } from "@/hooks/useConsolidation";

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) =>
    QueryClientProvider({ client: qc, children });
}

describe("useConsolidationGroups", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches groups for a given date", async () => {
    const mockGroups = [
      { id: "g1", name: "Regio Amsterdam", planned_date: "2026-04-04", status: "VOORSTEL", total_weight_kg: 5000 },
    ];
    mockOrder.mockResolvedValueOnce({ data: mockGroups, error: null });

    const { result } = renderHook(
      () => useConsolidationGroups("2026-04-04"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(mockFrom).toHaveBeenCalledWith("consolidation_groups");
    expect(mockEq).toHaveBeenCalledWith("planned_date", "2026-04-04");
  });

  it("is disabled when date is null", () => {
    const { result } = renderHook(
      () => useConsolidationGroups(null),
      { wrapper: createWrapper() }
    );
    expect(result.current.isLoading).toBe(false);
  });
});
