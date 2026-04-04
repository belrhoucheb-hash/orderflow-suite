import { render, screen } from "@testing-library/react";
import { vi, describe, it, expect } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mocks
vi.mock("@/lib/utils", () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }) },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(), insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(), delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  },
}));

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: any) => <div data-testid="dnd-context">{children}</div>,
  DragOverlay: ({ children }: any) => <div data-testid="drag-overlay">{children ?? null}</div>,
  PointerSensor: class {},
  useSensor: vi.fn(),
  useSensors: vi.fn(() => []),
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: any) => <>{children}</>,
  verticalListSortingStrategy: {},
  useSortable: () => ({
    attributes: {}, listeners: {}, setNodeRef: vi.fn(),
    transform: null, transition: null, isDragging: false,
  }),
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Translate: { toString: () => "" }, Transform: { toString: () => "" } },
}));

// Mock useConsolidationGroups hook
vi.mock("@/hooks/useConsolidation", () => ({
  useConsolidationGroups: vi.fn(() => ({
    data: [
      {
        id: "g1",
        tenant_id: "t1",
        name: "Groep Amsterdam Centrum",
        planned_date: "2026-04-04",
        status: "VOORSTEL",
        vehicle_id: null,
        total_weight_kg: 800,
        total_pallets: 5,
        total_distance_km: 20,
        estimated_duration_min: 60,
        utilization_pct: 0.40,
        created_by: null,
        created_at: "2026-04-01T10:00:00Z",
        updated_at: "2026-04-01T10:00:00Z",
        orders: [
          {
            id: "co1", group_id: "g1", order_id: "o1", stop_sequence: 1, pickup_sequence: null,
            created_at: "2026-04-01T10:00:00Z",
            order: { id: "o1", order_number: 1001, client_name: "Klant A", delivery_address: "Damrak 1", weight_kg: 400, quantity: 2, requirements: [], time_window_start: null, time_window_end: null },
          },
        ],
      },
      {
        id: "g2",
        tenant_id: "t1",
        name: "Groep Rotterdam Zuid",
        planned_date: "2026-04-04",
        status: "VOORSTEL",
        vehicle_id: null,
        total_weight_kg: 1200,
        total_pallets: 8,
        total_distance_km: 35,
        estimated_duration_min: 90,
        utilization_pct: 0.60,
        created_by: null,
        created_at: "2026-04-01T10:00:00Z",
        updated_at: "2026-04-01T10:00:00Z",
        orders: [
          {
            id: "co2", group_id: "g2", order_id: "o2", stop_sequence: 1, pickup_sequence: null,
            created_at: "2026-04-01T10:00:00Z",
            order: { id: "o2", order_number: 1002, client_name: "Klant B", delivery_address: "Coolsingel 5", weight_kg: 600, quantity: 4, requirements: [], time_window_start: null, time_window_end: null },
          },
        ],
      },
    ],
    isLoading: false,
    error: null,
  })),
  useMoveOrderBetweenGroups: vi.fn(() => ({ mutate: vi.fn() })),
  useUpdateConsolidationGroup: vi.fn(() => ({ mutate: vi.fn() })),
}));

import { ConsolidationBoard } from "@/components/planning/ConsolidationBoard";

function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = createQueryClient();
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("ConsolidationBoard", () => {
  it("renders all group names", () => {
    render(
      <Wrapper>
        <ConsolidationBoard plannedDate="2026-04-04" />
      </Wrapper>
    );
    expect(screen.getByText("Groep Amsterdam Centrum")).toBeInTheDocument();
    expect(screen.getByText("Groep Rotterdam Zuid")).toBeInTheDocument();
  });

  it("shows order items inside each group", () => {
    render(
      <Wrapper>
        <ConsolidationBoard plannedDate="2026-04-04" />
      </Wrapper>
    );
    expect(screen.getByText("Klant A")).toBeInTheDocument();
    expect(screen.getByText("Klant B")).toBeInTheDocument();
  });
});
