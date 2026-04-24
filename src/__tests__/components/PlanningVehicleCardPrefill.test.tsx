import { render, screen } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { DriverSchedule } from "@/types/rooster";

// ─── Global Mocks ────────────────────────────────────────────
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
    channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }) }),
    removeChannel: vi.fn(),
  },
}));

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({ tenant: { id: "t1", name: "Test" }, loading: false }),
}));

vi.mock("@dnd-kit/core", () => ({
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: vi.fn(), transform: null, isDragging: false }),
  useDroppable: () => ({ isOver: false, setNodeRef: vi.fn() }),
  DndContext: ({ children }: any) => children,
}));
vi.mock("@dnd-kit/sortable", () => ({
  useSortable: () => ({ attributes: {}, listeners: {}, setNodeRef: vi.fn(), transform: null, transition: null, isDragging: false }),
  SortableContext: ({ children }: any) => children,
  verticalListSortingStrategy: {},
}));
vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Translate: { toString: () => "" }, Transform: { toString: () => "" } },
}));

vi.mock("@/data/geoData", () => ({
  vehicleColors: { "V01": "#ff0000" },
}));

vi.mock("@/components/planning/planningUtils", () => ({
  getTotalWeight: (o: any) => o.weight_kg || 0,
  capacityColor: () => "",
  computeETAs: () => [],
  computeRouteStats: () => ({ totalMinutes: 120, totalKm: 150, returnKm: 30, exceedsDriveLimit: false }),
}));

// Schedules-state per test configureren via deze module-level mock.
const mockSchedulesState: { schedules: DriverSchedule[] } = { schedules: [] };

vi.mock("@/hooks/useDriverScheduleForDate", () => ({
  useDriverScheduleForDate: () => ({ data: null }),
  useDriverSchedulesForDate: () => ({ data: mockSchedulesState.schedules }),
}));

function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = createQueryClient();
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <TooltipProvider>{children}</TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// ─── Test fixtures ─────────────────────────────────────────
const mockVehicle = {
  id: "V01",
  code: "V01",
  name: "Truck A",
  plate: "AB-123-CD",
  type: "bakwagen",
  capacityKg: 10000,
  capacityPallets: 20,
  features: [],
};

const mockDrivers = [
  { id: "driver-uuid-1", name: "Jan", certifications: [] },
  { id: "driver-uuid-2", name: "Piet", certifications: [] },
];

function makeSchedule(partial: Partial<DriverSchedule>): DriverSchedule {
  return {
    id: partial.id ?? "sched-1",
    tenant_id: "t1",
    driver_id: partial.driver_id ?? "driver-uuid-1",
    date: partial.date ?? "2026-05-01",
    shift_template_id: null,
    start_time: partial.start_time ?? "06:30",
    end_time: partial.end_time ?? "15:00",
    vehicle_id: partial.vehicle_id ?? "vehicle-uuid-1",
    status: partial.status ?? "werkt",
    notitie: null,
    created_at: "2026-04-30T10:00:00Z",
    updated_at: "2026-04-30T10:00:00Z",
    created_by: null,
  };
}

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    vehicle: mockVehicle as any,
    vehicleDbId: "vehicle-uuid-1",
    selectedDate: "2026-05-01",
    assigned: [],
    onRemove: vi.fn(),
    onReorder: vi.fn(),
    onOptimize: vi.fn(),
    rejected: false,
    onHoverVehicle: vi.fn(),
    onHoverOrder: vi.fn(),
    startTime: "07:00",
    onStartTimeChange: vi.fn(),
    driverId: "",
    onDriverChange: vi.fn(),
    orderCoords: new Map(),
    emptyReason: "Geen orders",
    drivers: mockDrivers as any,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// PlanningVehicleCard, rooster-integratie
// ═══════════════════════════════════════════════════════════════
describe("PlanningVehicleCard rooster-prefill", () => {
  beforeEach(() => {
    mockSchedulesState.schedules = [];
    vi.clearAllMocks();
  });

  it("prefilt driverId en startTime als velden nog leeg / default zijn", async () => {
    mockSchedulesState.schedules = [
      makeSchedule({
        id: "s1",
        driver_id: "driver-uuid-1",
        vehicle_id: "vehicle-uuid-1",
        start_time: "06:30",
      }),
    ];
    const onDriverChange = vi.fn();
    const onStartTimeChange = vi.fn();

    const { PlanningVehicleCard } = await import("@/components/planning/PlanningVehicleCard");
    render(
      <Wrapper>
        <PlanningVehicleCard
          {...baseProps({
            driverId: "",
            startTime: "07:00",
            onDriverChange,
            onStartTimeChange,
          })}
        />
      </Wrapper>,
    );

    expect(onDriverChange).toHaveBeenCalledWith("V01", "driver-uuid-1");
    expect(onStartTimeChange).toHaveBeenCalledWith("V01", "06:30");
  });

  it("overschrijft handmatig ingevulde driverId niet", async () => {
    mockSchedulesState.schedules = [
      makeSchedule({
        id: "s1",
        driver_id: "driver-uuid-1",
        vehicle_id: "vehicle-uuid-1",
        start_time: "06:30",
      }),
    ];
    const onDriverChange = vi.fn();
    const onStartTimeChange = vi.fn();

    const { PlanningVehicleCard } = await import("@/components/planning/PlanningVehicleCard");
    render(
      <Wrapper>
        <PlanningVehicleCard
          {...baseProps({
            driverId: "driver-uuid-2", // user heeft al iets gekozen
            startTime: "09:15", // user heeft custom tijd gezet
            onDriverChange,
            onStartTimeChange,
          })}
        />
      </Wrapper>,
    );

    expect(onDriverChange).not.toHaveBeenCalled();
    expect(onStartTimeChange).not.toHaveBeenCalled();
  });

  it("prefilt niet als er geen rooster-rij is voor dit voertuig", async () => {
    mockSchedulesState.schedules = [];
    const onDriverChange = vi.fn();
    const onStartTimeChange = vi.fn();

    const { PlanningVehicleCard } = await import("@/components/planning/PlanningVehicleCard");
    render(
      <Wrapper>
        <PlanningVehicleCard
          {...baseProps({
            driverId: "",
            startTime: "07:00",
            onDriverChange,
            onStartTimeChange,
          })}
        />
      </Wrapper>,
    );

    expect(onDriverChange).not.toHaveBeenCalled();
    expect(onStartTimeChange).not.toHaveBeenCalled();
  });

  it("toont conflict-badge wanneer twee chauffeurs op hetzelfde voertuig staan", async () => {
    mockSchedulesState.schedules = [
      makeSchedule({ id: "s1", driver_id: "driver-uuid-1", vehicle_id: "vehicle-uuid-1" }),
      makeSchedule({ id: "s2", driver_id: "driver-uuid-2", vehicle_id: "vehicle-uuid-1" }),
    ];

    const { PlanningVehicleCard } = await import("@/components/planning/PlanningVehicleCard");
    render(
      <Wrapper>
        <PlanningVehicleCard {...baseProps()} />
      </Wrapper>,
    );

    expect(
      screen.getByText("Dit voertuig heeft meerdere chauffeurs ingepland vandaag"),
    ).toBeInTheDocument();
  });

  it("toont géén conflict-badge bij één chauffeur op het voertuig", async () => {
    mockSchedulesState.schedules = [
      makeSchedule({ id: "s1", driver_id: "driver-uuid-1", vehicle_id: "vehicle-uuid-1" }),
    ];

    const { PlanningVehicleCard } = await import("@/components/planning/PlanningVehicleCard");
    render(
      <Wrapper>
        <PlanningVehicleCard {...baseProps()} />
      </Wrapper>,
    );

    expect(
      screen.queryByText("Dit voertuig heeft meerdere chauffeurs ingepland vandaag"),
    ).not.toBeInTheDocument();
  });

  it("prefilt niet wanneer vehicleDbId ontbreekt", async () => {
    mockSchedulesState.schedules = [
      makeSchedule({ id: "s1", driver_id: "driver-uuid-1", vehicle_id: "vehicle-uuid-1" }),
    ];
    const onDriverChange = vi.fn();
    const onStartTimeChange = vi.fn();

    const { PlanningVehicleCard } = await import("@/components/planning/PlanningVehicleCard");
    render(
      <Wrapper>
        <PlanningVehicleCard
          {...baseProps({
            vehicleDbId: null,
            onDriverChange,
            onStartTimeChange,
          })}
        />
      </Wrapper>,
    );

    expect(onDriverChange).not.toHaveBeenCalled();
    expect(onStartTimeChange).not.toHaveBeenCalled();
  });
});
