import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn(() => ({
    select: vi.fn().mockReturnThis(), insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(), delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  })) },
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(({ queryFn }) => ({ data: null, isLoading: true, queryFn })),
  useMutation: vi.fn(({ mutationFn }) => ({ mutate: mutationFn, mutateAsync: mutationFn })),
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
}));

describe("useSurcharges hooks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("module exports all surcharge hooks", async () => {
    const mod = await import("@/hooks/useSurcharges");
    expect(mod.useSurcharges).toBeDefined();
    expect(mod.useCreateSurcharge).toBeDefined();
    expect(mod.useUpdateSurcharge).toBeDefined();
    expect(mod.useDeleteSurcharge).toBeDefined();
    expect(typeof mod.useSurcharges).toBe("function");
  });
});
