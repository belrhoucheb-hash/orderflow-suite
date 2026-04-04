import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn(() => ({
  select: vi.fn().mockReturnThis(), insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(), delete: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
  single: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mockFrom } }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(({ queryFn }) => ({ data: null, isLoading: true, queryFn })),
  useMutation: vi.fn(({ mutationFn }) => ({ mutate: mutationFn, mutateAsync: mutationFn })),
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
}));

describe("useRateCards hook", () => {
  beforeEach(() => vi.clearAllMocks());

  it("module exports useRateCards and useRateCardById", async () => {
    const mod = await import("@/hooks/useRateCards");
    expect(mod.useRateCards).toBeDefined();
    expect(mod.useRateCardById).toBeDefined();
    expect(mod.useCreateRateCard).toBeDefined();
    expect(mod.useUpdateRateCard).toBeDefined();
    expect(mod.useDeleteRateCard).toBeDefined();
    expect(mod.useUpsertRateRules).toBeDefined();
    expect(typeof mod.useRateCards).toBe("function");
  });
});
