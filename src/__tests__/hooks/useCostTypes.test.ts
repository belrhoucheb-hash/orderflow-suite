import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn(() => ({ select: vi.fn().mockReturnThis(), insert: vi.fn().mockReturnThis(), update: vi.fn().mockReturnThis(), delete: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: null }) })) } }));
vi.mock("@tanstack/react-query", () => ({ useQuery: vi.fn(({ queryFn }) => ({ data: null, isLoading: true, queryFn })), useMutation: vi.fn(({ mutationFn }) => ({ mutate: mutationFn, mutateAsync: mutationFn })), useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })) }));

describe("cost hooks modules", () => {
  it("useCostTypes exports all hooks", async () => { const mod = await import("@/hooks/useCostTypes"); expect(mod.useCostTypes).toBeDefined(); expect(mod.useCreateCostType).toBeDefined(); expect(mod.useUpdateCostType).toBeDefined(); expect(mod.useDeleteCostType).toBeDefined(); });
  it("useTripCosts exports all hooks", async () => { const mod = await import("@/hooks/useTripCosts"); expect(mod.useTripCosts).toBeDefined(); expect(mod.useCreateTripCost).toBeDefined(); expect(mod.useDeleteTripCost).toBeDefined(); expect(mod.useAutoCalculateTripCosts).toBeDefined(); });
  it("useVehicleFixedCosts exports all hooks", async () => { const mod = await import("@/hooks/useVehicleFixedCosts"); expect(mod.useVehicleFixedCosts).toBeDefined(); expect(mod.useCreateVehicleFixedCost).toBeDefined(); expect(mod.useUpdateVehicleFixedCost).toBeDefined(); expect(mod.useDeleteVehicleFixedCost).toBeDefined(); });
});
