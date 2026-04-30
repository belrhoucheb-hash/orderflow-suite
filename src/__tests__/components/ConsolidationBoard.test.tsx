// src/__tests__/components/ConsolidationBoard.test.tsx
import { cleanup, render, screen } from "@testing-library/react";
import { vi, describe, it, expect, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@/hooks/useConsolidation", () => ({
  useConsolidationGroups: vi.fn().mockReturnValue({
    data: [
      { id: "g1", name: "Regio Amsterdam", status: "VOORSTEL", total_weight_kg: 5000, total_pallets: 12, utilization_pct: 72, orders: [{ id: "co1", group_id: "g1", order_id: "o1", order: { order_number: 101, client_name: "Client A" } }] },
      { id: "g2", name: "Regio Rotterdam", status: "VOORSTEL", total_weight_kg: 3000, total_pallets: 8, utilization_pct: 45, orders: [{ id: "co2", group_id: "g2", order_id: "o2", order: { order_number: 102, client_name: "Client B" } }] },
    ],
    isLoading: false,
  }),
  useUpdateConsolidationGroup: vi.fn().mockReturnValue({ mutateAsync: vi.fn() }),
  useMoveOrderBetweenGroups: vi.fn().mockReturnValue({ mutateAsync: vi.fn() }),
}));

import { ConsolidationBoard } from "@/components/planning/ConsolidationBoard";

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) =>
    QueryClientProvider({ client: qc, children });
}

describe("ConsolidationBoard", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders all consolidation groups as columns", () => {
    render(<ConsolidationBoard plannedDate="2026-04-04" />, { wrapper: createWrapper() });
    expect(screen.getByText("Regio Amsterdam")).toBeDefined();
    expect(screen.getByText("Regio Rotterdam")).toBeDefined();
  });

  it("shows order items inside groups", () => {
    render(<ConsolidationBoard plannedDate="2026-04-04" />, { wrapper: createWrapper() });
    expect(screen.getAllByText(/Client A/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Client B/).length).toBeGreaterThanOrEqual(1);
  });
});
