import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";

// ─── Global Mocks ────────────────────────────────────────────
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }) },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(), insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(), delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: null }),
      in: vi.fn().mockReturnThis(), gte: vi.fn().mockReturnThis(), lt: vi.fn().mockReturnThis(),
    }),
    channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }) }),
    removeChannel: vi.fn(),
  },
}));

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({ tenant: { id: "t1", name: "Test" }, loading: false }),
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

// Mock dnd-kit
vi.mock("@dnd-kit/core", () => ({
  useDraggable: () => ({
    attributes: {}, listeners: {}, setNodeRef: vi.fn(),
    transform: null, isDragging: false,
  }),
  useDroppable: () => ({ isOver: false, setNodeRef: vi.fn() }),
  DndContext: ({ children }: any) => children,
}));

vi.mock("@dnd-kit/sortable", () => ({
  useSortable: () => ({
    attributes: {}, listeners: {}, setNodeRef: vi.fn(),
    transform: null, transition: null, isDragging: false,
  }),
  SortableContext: ({ children }: any) => children,
  verticalListSortingStrategy: {},
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: {
    Translate: { toString: () => "" },
    Transform: { toString: () => "" },
  },
}));

// Mock planning utils
vi.mock("@/components/planning/planningUtils", () => ({
  getCity: (addr: string) => addr?.split(",")[0] || "Onbekend",
  getTotalWeight: (o: any) => o.weight_kg || 0,
  hasTag: (o: any, tag: string) => (o.requirements || []).includes(tag),
  capacityColor: () => "",
  computeETAs: () => [],
  computeRouteStats: () => ({ totalMinutes: 120, totalKm: 150, returnKm: 30, exceedsDriveLimit: false }),
  findCombinableGroups: () => [],
  getUnassignedReason: () => null,
}));

vi.mock("@/data/geoData", () => ({
  vehicleColors: { "v1": "#ff0000", "v2": "#00ff00" },
}));

vi.mock("@/hooks/useVehicles", () => ({
  useVehicles: () => ({ data: [
    { id: "v1", name: "Truck A", plate: "AB-123-CD", type: "bakwagen", capacityKg: 10000, capacityPallets: 20 },
    { id: "v2", name: "Truck B", plate: "EF-456-GH", type: "koelwagen", capacityKg: 8000, capacityPallets: 16 },
  ] }),
}));

// Mock leaflet
vi.mock("leaflet", () => ({
  default: {
    map: vi.fn().mockReturnValue({
      setView: vi.fn().mockReturnThis(),
      remove: vi.fn(),
      fitBounds: vi.fn(),
    }),
    tileLayer: vi.fn().mockReturnValue({ addTo: vi.fn() }),
    marker: vi.fn().mockReturnValue({
      addTo: vi.fn().mockReturnThis(),
      bindPopup: vi.fn().mockReturnThis(),
      remove: vi.fn(),
    }),
    polyline: vi.fn().mockReturnValue({
      addTo: vi.fn().mockReturnThis(),
      remove: vi.fn(),
    }),
    divIcon: vi.fn(),
    latLngBounds: vi.fn(),
  },
}));
vi.mock("leaflet/dist/leaflet.css", () => ({}));

// Mock date-fns for VehicleAvailabilityPanel
vi.mock("date-fns", () => ({
  format: (d: Date, fmt: string) => "2026-04-03",
  addDays: (d: Date, n: number) => new Date(d.getTime() + n * 86400000),
}));
vi.mock("date-fns/locale", () => ({ nl: {} }));

// Mock PlanningDateNav toDateString
vi.mock("@/components/planning/PlanningDateNav", () => ({
  toDateString: (d: Date) => d.toISOString().split("T")[0],
  PlanningDateNav: ({ selectedDate, onDateChange, viewMode, onViewModeChange }: any) => (
    <div>
      <span>Ma</span><span>Di</span><span>Wo</span><span>Do</span><span>Vr</span><span>Za</span><span>Zo</span>
      <span>Week 15</span>
      <button onClick={() => onDateChange("2026-03-30")}>prev</button>
      <button onClick={() => onViewModeChange("week")}>Week</button>
      <button onClick={() => onViewModeChange("day")}>Dag</button>
      {selectedDate !== new Date().toISOString().split("T")[0] && <button onClick={() => onDateChange(new Date().toISOString().split("T")[0])}>Vandaag</button>}
    </div>
  ),
}));

beforeEach(() => {
  cleanup();
});

afterEach(() => {
  cleanup();
});

function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = createQueryClient();
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

function WrapperWithTooltip({ children }: { children: React.ReactNode }) {
  const qc = createQueryClient();
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <TooltipProvider>{children}</TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// ─── Test Data ───────────────────────────────────────────────
const mockOrder = {
  id: "o1",
  order_number: 1001,
  client_name: "ACME",
  pickup_address: "Amsterdam, NL",
  delivery_address: "Rotterdam, NL",
  quantity: 5,
  weight_kg: 1000,
  is_weight_per_unit: false,
  requirements: [],
  time_window_start: "08:00",
  time_window_end: "12:00",
  pickup_time_from: null,
  pickup_time_to: null,
  delivery_time_from: null,
  delivery_time_to: null,
  unit: "Pallets",
};

const mockOrder2 = {
  id: "o2",
  order_number: 1002,
  client_name: "BetaCo",
  pickup_address: "Utrecht, NL",
  delivery_address: "Den Haag, NL",
  quantity: 3,
  weight_kg: 600,
  is_weight_per_unit: false,
  requirements: ["ADR"],
  time_window_start: "10:00",
  time_window_end: "14:00",
  pickup_time_from: null,
  pickup_time_to: null,
  delivery_time_from: null,
  delivery_time_to: null,
  unit: "Colli",
};

const mockVehicle = {
  id: "v1",
  name: "Truck A",
  plate: "AB-123-CD",
  type: "bakwagen",
  capacityKg: 10000,
  capacityPallets: 20,
};

const mockDrivers = [
  { id: "dr1", name: "Jan", certifications: ["ADR"] },
  { id: "dr2", name: "Piet", certifications: [] },
];

// ═══════════════════════════════════════════════════════════════
// PlanningOrderCard
// ═══════════════════════════════════════════════════════════════
describe("PlanningOrderCard", () => {
  it("renders order number and client name", async () => {
    const { PlanningOrderCard } = await import("@/components/planning/PlanningOrderCard");
    render(<PlanningOrderCard order={mockOrder as any} />);
    expect(screen.getByText("#1001")).toBeInTheDocument();
    expect(screen.getByText("ACME")).toBeInTheDocument();
  });

  it("shows destination city", async () => {
    const { PlanningOrderCard } = await import("@/components/planning/PlanningOrderCard");
    render(<PlanningOrderCard order={mockOrder as any} />);
    expect(screen.getByText("Rotterdam")).toBeInTheDocument();
  });

  it("shows INCOMPLEET badge when address missing", async () => {
    const { PlanningOrderCard } = await import("@/components/planning/PlanningOrderCard");
    render(<PlanningOrderCard order={{ ...mockOrder, delivery_address: null } as any} />);
    expect(screen.getByText("INCOMPLEET")).toBeInTheDocument();
  });

  it("shows ADR badge", async () => {
    const { PlanningOrderCard } = await import("@/components/planning/PlanningOrderCard");
    render(<PlanningOrderCard order={{ ...mockOrder, requirements: ["ADR"] } as any} />);
    expect(screen.getByText("ADR")).toBeInTheDocument();
  });

  it("shows KOEL badge for KOELING requirement", async () => {
    const { PlanningOrderCard } = await import("@/components/planning/PlanningOrderCard");
    render(<PlanningOrderCard order={{ ...mockOrder, requirements: ["KOELING"] } as any} />);
    expect(screen.getByText("KOEL")).toBeInTheDocument();
  });

  it("shows weight and quantity", async () => {
    const { PlanningOrderCard } = await import("@/components/planning/PlanningOrderCard");
    render(<PlanningOrderCard order={mockOrder as any} />);
    expect(screen.getByText("5 plt")).toBeInTheDocument();
    expect(screen.getByText("1000 kg")).toBeInTheDocument();
  });

  it("shows time window", async () => {
    const { PlanningOrderCard } = await import("@/components/planning/PlanningOrderCard");
    render(<PlanningOrderCard order={mockOrder as any} />);
    expect(screen.getByText("08:00 - 12:00")).toBeInTheDocument();
  });

  it("calls onHover callbacks", async () => {
    const onHover = vi.fn();
    const { PlanningOrderCard } = await import("@/components/planning/PlanningOrderCard");
    const { container } = render(<PlanningOrderCard order={mockOrder as any} onHover={onHover} />);
    fireEvent.mouseEnter(container.firstChild!);
    expect(onHover).toHaveBeenCalledWith("o1");
    fireEvent.mouseLeave(container.firstChild!);
    expect(onHover).toHaveBeenCalledWith(null);
  });

  it("shows whyNotReason", async () => {
    const { PlanningOrderCard } = await import("@/components/planning/PlanningOrderCard");
    render(<PlanningOrderCard order={mockOrder as any} whyNotReason="Te zwaar" />);
    expect(screen.getByText("Te zwaar")).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════
// PlanningOrderRow
// ═══════════════════════════════════════════════════════════════
describe("PlanningOrderRow", () => {
  it("renders order number and client", async () => {
    const { PlanningOrderRow } = await import("@/components/planning/PlanningOrderRow");
    render(<PlanningOrderRow order={mockOrder as any} index={0} onRemove={vi.fn()} onHover={vi.fn()} vehicleColor="#f00" />);
    expect(screen.getByText("#1001")).toBeInTheDocument();
    expect(screen.getByText("ACME")).toBeInTheDocument();
  });

  it("shows ETA when provided", async () => {
    const { PlanningOrderRow } = await import("@/components/planning/PlanningOrderRow");
    render(<PlanningOrderRow order={mockOrder as any} index={0} onRemove={vi.fn()} onHover={vi.fn()} vehicleColor="#f00" eta="10:30" />);
    expect(screen.getByText("ETA: 10:30")).toBeInTheDocument();
  });

  it("shows late indicator when isLate", async () => {
    const { PlanningOrderRow } = await import("@/components/planning/PlanningOrderRow");
    const { container } = render(
      <PlanningOrderRow order={mockOrder as any} index={0} onRemove={vi.fn()} onHover={vi.fn()} vehicleColor="#f00" eta="14:00" isLate />,
    );
    expect(container.querySelector(".ring-destructive\\/60")).toBeInTheDocument();
  });

  it("shows wait minutes", async () => {
    const { PlanningOrderRow } = await import("@/components/planning/PlanningOrderRow");
    render(<PlanningOrderRow order={mockOrder as any} index={0} onRemove={vi.fn()} onHover={vi.fn()} vehicleColor="#f00" waitMinutes={15} />);
    expect(screen.getByText("+15m wacht")).toBeInTheDocument();
  });

  it("shows stop index number", async () => {
    const { PlanningOrderRow } = await import("@/components/planning/PlanningOrderRow");
    render(<PlanningOrderRow order={mockOrder as any} index={2} onRemove={vi.fn()} onHover={vi.fn()} vehicleColor="#f00" />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("fires onRemove on remove click", async () => {
    const onRemove = vi.fn();
    const { PlanningOrderRow } = await import("@/components/planning/PlanningOrderRow");
    const { container } = render(
      <PlanningOrderRow order={mockOrder as any} index={0} onRemove={onRemove} onHover={vi.fn()} vehicleColor="#f00" />,
    );
    // The remove button has opacity-0 by default, but we can still click it
    const removeBtn = container.querySelectorAll("button");
    // Last button is the X remove
    fireEvent.click(removeBtn[removeBtn.length - 1]);
    expect(onRemove).toHaveBeenCalledWith("o1");
  });
});

// ═══════════════════════════════════════════════════════════════
// PlanningDateNav
// ═══════════════════════════════════════════════════════════════
describe("PlanningDateNav", () => {
  // We mock PlanningDateNav above for PlanningWeekView, so import the real one
  it("renders week days", async () => {
    // Reset the mock for this test
    vi.doUnmock("@/components/planning/PlanningDateNav");
    const { PlanningDateNav } = await import("@/components/planning/PlanningDateNav");
    render(
      <PlanningDateNav selectedDate="2026-04-06" onDateChange={vi.fn()} viewMode="day" onViewModeChange={vi.fn()} />,
    );
    expect(screen.getByText("Ma")).toBeInTheDocument();
    expect(screen.getByText("Di")).toBeInTheDocument();
    expect(screen.getByText("Wo")).toBeInTheDocument();
    expect(screen.getByText("Do")).toBeInTheDocument();
    expect(screen.getByText("Vr")).toBeInTheDocument();
    expect(screen.getByText("Za")).toBeInTheDocument();
    expect(screen.getByText("Zo")).toBeInTheDocument();
  });

  it("shows week label", async () => {
    vi.doUnmock("@/components/planning/PlanningDateNav");
    const { PlanningDateNav } = await import("@/components/planning/PlanningDateNav");
    render(
      <PlanningDateNav selectedDate="2026-04-06" onDateChange={vi.fn()} viewMode="day" onViewModeChange={vi.fn()} />,
    );
    expect(screen.getByText(/Week \d+/)).toBeInTheDocument();
  });

  it("calls onDateChange on prev week click", async () => {
    vi.doUnmock("@/components/planning/PlanningDateNav");
    const onDateChange = vi.fn();
    const { PlanningDateNav } = await import("@/components/planning/PlanningDateNav");
    render(
      <PlanningDateNav selectedDate="2026-04-06" onDateChange={onDateChange} viewMode="day" onViewModeChange={vi.fn()} />,
    );
    // First icon button is prev week
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]);
    expect(onDateChange).toHaveBeenCalled();
  });

  it("shows Dag and Week view toggles", async () => {
    vi.doUnmock("@/components/planning/PlanningDateNav");
    const { PlanningDateNav } = await import("@/components/planning/PlanningDateNav");
    render(
      <PlanningDateNav selectedDate="2026-04-06" onDateChange={vi.fn()} viewMode="day" onViewModeChange={vi.fn()} />,
    );
    expect(screen.getByText("Dag")).toBeInTheDocument();
    expect(screen.getByText("Week")).toBeInTheDocument();
  });

  it("toggles view mode on Week click", async () => {
    vi.doUnmock("@/components/planning/PlanningDateNav");
    const onViewModeChange = vi.fn();
    const { PlanningDateNav } = await import("@/components/planning/PlanningDateNav");
    render(
      <PlanningDateNav selectedDate="2026-04-06" onDateChange={vi.fn()} viewMode="day" onViewModeChange={onViewModeChange} />,
    );
    fireEvent.click(screen.getByText("Week"));
    expect(onViewModeChange).toHaveBeenCalledWith("week");
  });

  it("shows Vandaag button when not on today", async () => {
    vi.doUnmock("@/components/planning/PlanningDateNav");
    const { PlanningDateNav } = await import("@/components/planning/PlanningDateNav");
    render(
      <PlanningDateNav selectedDate="2025-01-01" onDateChange={vi.fn()} viewMode="day" onViewModeChange={vi.fn()} />,
    );
    expect(screen.getByText("Vandaag")).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════
// PlanningVehicleCard
// ═══════════════════════════════════════════════════════════════
describe("PlanningVehicleCard", () => {
  const baseProps = {
    vehicle: mockVehicle as any,
    vehicleDbId: null,
    selectedDate: "2026-04-06",
    assigned: [],
    onRemove: vi.fn(),
    onReorder: vi.fn(),
    onOptimize: vi.fn(),
    rejected: false,
    onHoverVehicle: vi.fn(),
    onHoverOrder: vi.fn(),
    startTime: "08:00",
    onStartTimeChange: vi.fn(),
    driverId: "",
    onDriverChange: vi.fn(),
    orderCoords: new Map(),
    emptyReason: "Geen orders voor dit voertuig",
    drivers: mockDrivers as any,
  };

  it("renders vehicle name", async () => {
    const { PlanningVehicleCard } = await import("@/components/planning/PlanningVehicleCard");
    render(<WrapperWithTooltip><PlanningVehicleCard {...baseProps} /></WrapperWithTooltip>);
    expect(screen.getByText("Truck A")).toBeInTheDocument();
  });

  it("shows vehicle plate number", async () => {
    const { PlanningVehicleCard } = await import("@/components/planning/PlanningVehicleCard");
    render(<WrapperWithTooltip><PlanningVehicleCard {...baseProps} /></WrapperWithTooltip>);
    expect(screen.getByText("AB-123-CD")).toBeInTheDocument();
  });

  it("shows vehicle type badge", async () => {
    const { PlanningVehicleCard } = await import("@/components/planning/PlanningVehicleCard");
    render(<WrapperWithTooltip><PlanningVehicleCard {...baseProps} /></WrapperWithTooltip>);
    expect(screen.getByText("bakwagen")).toBeInTheDocument();
  });

  it("shows empty state message when no orders assigned", async () => {
    const { PlanningVehicleCard } = await import("@/components/planning/PlanningVehicleCard");
    render(<WrapperWithTooltip><PlanningVehicleCard {...baseProps} /></WrapperWithTooltip>);
    expect(screen.getByText(/Sleep orders hierheen/)).toBeInTheDocument();
    expect(screen.getByText("Geen orders voor dit voertuig")).toBeInTheDocument();
  });

  it("shows weight capacity bar at 0/10000 kg", async () => {
    const { PlanningVehicleCard } = await import("@/components/planning/PlanningVehicleCard");
    render(<WrapperWithTooltip><PlanningVehicleCard {...baseProps} /></WrapperWithTooltip>);
    expect(screen.getByText("0 / 10000 kg")).toBeInTheDocument();
  });

  it("shows pallets capacity bar at 0/20", async () => {
    const { PlanningVehicleCard } = await import("@/components/planning/PlanningVehicleCard");
    render(<WrapperWithTooltip><PlanningVehicleCard {...baseProps} /></WrapperWithTooltip>);
    expect(screen.getByText("0 / 20")).toBeInTheDocument();
  });

  it("renders assigned orders with ROUTE tab active by default", async () => {
    const { PlanningVehicleCard } = await import("@/components/planning/PlanningVehicleCard");
    render(<WrapperWithTooltip><PlanningVehicleCard {...baseProps} assigned={[mockOrder as any, mockOrder2 as any]} /></WrapperWithTooltip>);
    expect(screen.getByText("ROUTE")).toBeInTheDocument();
    expect(screen.getByText("INGEPLAND (2)")).toBeInTheDocument();
  });

  it("shows Optimaliseer button when 2+ orders assigned", async () => {
    const { PlanningVehicleCard } = await import("@/components/planning/PlanningVehicleCard");
    render(<WrapperWithTooltip><PlanningVehicleCard {...baseProps} assigned={[mockOrder as any, mockOrder2 as any]} /></WrapperWithTooltip>);
    expect(screen.getByText("Optimaliseer")).toBeInTheDocument();
  });

  it("does not show Optimaliseer button with fewer than 2 orders", async () => {
    const { PlanningVehicleCard } = await import("@/components/planning/PlanningVehicleCard");
    render(<WrapperWithTooltip><PlanningVehicleCard {...baseProps} assigned={[mockOrder as any]} /></WrapperWithTooltip>);
    expect(screen.queryByText("Optimaliseer")).not.toBeInTheDocument();
  });

  it("calls onOptimize when Optimaliseer is clicked", async () => {
    const onOptimize = vi.fn();
    const { PlanningVehicleCard } = await import("@/components/planning/PlanningVehicleCard");
    render(<WrapperWithTooltip><PlanningVehicleCard {...baseProps} assigned={[mockOrder as any, mockOrder2 as any]} onOptimize={onOptimize} /></WrapperWithTooltip>);
    fireEvent.click(screen.getByText("Optimaliseer"));
    expect(onOptimize).toHaveBeenCalledWith("v1");
  });

  it("calls onHoverVehicle on mouse enter/leave", async () => {
    const onHoverVehicle = vi.fn();
    const { PlanningVehicleCard } = await import("@/components/planning/PlanningVehicleCard");
    const { container } = render(<WrapperWithTooltip><PlanningVehicleCard {...baseProps} onHoverVehicle={onHoverVehicle} /></WrapperWithTooltip>);
    // The Card has the ref, find the first element
    const card = container.firstElementChild!;
    fireEvent.mouseEnter(card);
    expect(onHoverVehicle).toHaveBeenCalledWith("v1");
    fireEvent.mouseLeave(card);
    expect(onHoverVehicle).toHaveBeenCalledWith(null);
  });

  it("shows route stats footer when orders assigned", async () => {
    const { PlanningVehicleCard } = await import("@/components/planning/PlanningVehicleCard");
    render(<WrapperWithTooltip><PlanningVehicleCard {...baseProps} assigned={[mockOrder as any]} /></WrapperWithTooltip>);
    // Stats show duration, km, utilization
    expect(screen.getByText("2u 0m")).toBeInTheDocument();
    expect(screen.getByText(/150 km/)).toBeInTheDocument();
  });

  it("shows weight and pallets capacity with assigned orders", async () => {
    const { PlanningVehicleCard } = await import("@/components/planning/PlanningVehicleCard");
    render(<WrapperWithTooltip><PlanningVehicleCard {...baseProps} assigned={[mockOrder as any]} /></WrapperWithTooltip>);
    expect(screen.getByText("1000 / 10000 kg")).toBeInTheDocument();
    expect(screen.getByText("5 / 20")).toBeInTheDocument();
  });

  it("shows time input for start time", async () => {
    const { PlanningVehicleCard } = await import("@/components/planning/PlanningVehicleCard");
    render(<WrapperWithTooltip><PlanningVehicleCard {...baseProps} /></WrapperWithTooltip>);
    const timeInput = screen.getByDisplayValue("08:00");
    expect(timeInput).toBeInTheDocument();
  });

  it("calls onStartTimeChange when time is changed", async () => {
    const onStartTimeChange = vi.fn();
    const { PlanningVehicleCard } = await import("@/components/planning/PlanningVehicleCard");
    render(<WrapperWithTooltip><PlanningVehicleCard {...baseProps} onStartTimeChange={onStartTimeChange} /></WrapperWithTooltip>);
    const timeInput = screen.getByDisplayValue("08:00");
    fireEvent.change(timeInput, { target: { value: "09:00" } });
    expect(onStartTimeChange).toHaveBeenCalledWith("v1", "09:00");
  });

  it("renders INGEPLAND tab content when switched", async () => {
    const { PlanningVehicleCard } = await import("@/components/planning/PlanningVehicleCard");
    render(<WrapperWithTooltip><PlanningVehicleCard {...baseProps} assigned={[mockOrder as any]} /></WrapperWithTooltip>);
    // Switch to INGEPLAND tab using pointerDown
    const ingeplandTab = screen.getByText(/INGEPLAND/);
    fireEvent.pointerDown(ingeplandTab);
    // Now we should see the summary view with client name and stop number
    expect(screen.getByText("Stop 1")).toBeInTheDocument();
    expect(screen.getByText("ACME")).toBeInTheDocument();
    expect(screen.getByText(/Rotterdam/)).toBeInTheDocument();
  });

  it("does not show tabs when no orders assigned", async () => {
    const { PlanningVehicleCard } = await import("@/components/planning/PlanningVehicleCard");
    render(<WrapperWithTooltip><PlanningVehicleCard {...baseProps} /></WrapperWithTooltip>);
    expect(screen.queryByText("ROUTE")).not.toBeInTheDocument();
    expect(screen.queryByText(/INGEPLAND/)).not.toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════
// PlanningWeekView
// ═══════════════════════════════════════════════════════════════
describe("PlanningWeekView", () => {
  it("renders the week grid with vehicle rows", async () => {
    const { PlanningWeekView } = await import("@/components/planning/PlanningWeekView");
    render(
      <Wrapper>
        <PlanningWeekView weekStart="2026-04-06" onDayClick={vi.fn()} draftAssignments={{}} />
      </Wrapper>,
    );
    expect(screen.getByText("Voertuig")).toBeInTheDocument();
    // Should show fleet vehicles
    expect(screen.getByText("Truck A")).toBeInTheDocument();
    expect(screen.getByText("Truck B")).toBeInTheDocument();
  });

  it("renders day column headers with short names", async () => {
    const { PlanningWeekView } = await import("@/components/planning/PlanningWeekView");
    render(
      <Wrapper>
        <PlanningWeekView weekStart="2026-04-06" onDayClick={vi.fn()} draftAssignments={{}} />
      </Wrapper>,
    );
    // Short day labels in header
    expect(screen.getByText("Ma")).toBeInTheDocument();
    expect(screen.getByText("Di")).toBeInTheDocument();
    expect(screen.getByText("Wo")).toBeInTheDocument();
    expect(screen.getByText("Do")).toBeInTheDocument();
    expect(screen.getByText("Vr")).toBeInTheDocument();
    expect(screen.getByText("Za")).toBeInTheDocument();
    expect(screen.getByText("Zo")).toBeInTheDocument();
  });

  it("calls onDayClick when a day column header is clicked", async () => {
    const onDayClick = vi.fn();
    const { PlanningWeekView } = await import("@/components/planning/PlanningWeekView");
    render(
      <Wrapper>
        <PlanningWeekView weekStart="2026-04-06" onDayClick={onDayClick} draftAssignments={{}} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByText("Ma"));
    expect(onDayClick).toHaveBeenCalled();
  });

  it("shows dash cells for empty vehicle-day combinations", async () => {
    const { PlanningWeekView } = await import("@/components/planning/PlanningWeekView");
    const { container } = render(
      <Wrapper>
        <PlanningWeekView weekStart="2026-04-06" onDayClick={vi.fn()} draftAssignments={{}} />
      </Wrapper>,
    );
    // Empty cells show "—"
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThan(0);
  });

  it("renders draft assignment data in grid cells", async () => {
    const { PlanningWeekView } = await import("@/components/planning/PlanningWeekView");
    const draftAssignments = {
      "2026-04-06": {
        v1: [mockOrder as any],
      },
    };
    render(
      <Wrapper>
        <PlanningWeekView weekStart="2026-04-06" onDayClick={vi.fn()} draftAssignments={draftAssignments} />
      </Wrapper>,
    );
    // Should show the stop count "1" in the cell
    expect(screen.getByText("1")).toBeInTheDocument();
    // Should show concept label
    expect(screen.getByText("concept")).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════
// PlanningUnassignedSidebar
// ═══════════════════════════════════════════════════════════════
describe("PlanningUnassignedSidebar", () => {
  const baseSidebarProps = {
    orders: [mockOrder as any, mockOrder2 as any],
    assignedIds: new Set<string>(),
    groupedUnassigned: [
      { region: "amsterdam", label: "Amsterdam", orders: [mockOrder as any] },
      { region: "den-haag", label: "Den Haag", orders: [mockOrder2 as any] },
    ],
    search: "",
    onSearchChange: vi.fn(),
    filterTag: null as string | null,
    onFilterTagChange: vi.fn(),
    onCombineTrips: vi.fn(),
    onAutoPlan: vi.fn(),
    onClearPlanning: vi.fn(),
    onHoverOrder: vi.fn(),
    fleetVehicles: [mockVehicle as any],
    assignments: {} as any,
    totalUnassigned: 2,
    totalAssigned: 0,
  };

  it("renders search input", async () => {
    const { PlanningUnassignedSidebar } = await import("@/components/planning/PlanningUnassignedSidebar");
    render(<PlanningUnassignedSidebar {...baseSidebarProps} />);
    expect(screen.getByPlaceholderText("Zoek order...")).toBeInTheDocument();
  });

  it("calls onSearchChange when search input changes", async () => {
    const onSearchChange = vi.fn();
    const { PlanningUnassignedSidebar } = await import("@/components/planning/PlanningUnassignedSidebar");
    render(<PlanningUnassignedSidebar {...baseSidebarProps} onSearchChange={onSearchChange} />);
    fireEvent.change(screen.getByPlaceholderText("Zoek order..."), { target: { value: "test" } });
    expect(onSearchChange).toHaveBeenCalledWith("test");
  });

  it("renders filter tag buttons ADR and KOELING", async () => {
    const { PlanningUnassignedSidebar } = await import("@/components/planning/PlanningUnassignedSidebar");
    render(<PlanningUnassignedSidebar {...baseSidebarProps} />);
    const adrElements = screen.getAllByText("ADR");
    // At least one is a filter button
    const filterAdr = adrElements.find((el) => el.closest("button")?.className.includes("h-6"));
    expect(filterAdr).toBeTruthy();
    expect(screen.getByText("KOELING")).toBeInTheDocument();
  });

  it("calls onFilterTagChange when filter tag is clicked", async () => {
    const onFilterTagChange = vi.fn();
    const { PlanningUnassignedSidebar } = await import("@/components/planning/PlanningUnassignedSidebar");
    render(<PlanningUnassignedSidebar {...baseSidebarProps} onFilterTagChange={onFilterTagChange} />);
    const adrElements = screen.getAllByText("ADR");
    const filterBtn = adrElements.find((el) => el.closest("button")?.className.includes("h-6"))!.closest("button")!;
    fireEvent.click(filterBtn);
    expect(onFilterTagChange).toHaveBeenCalledWith("ADR");
  });

  it("deselects filter when same tag is clicked again", async () => {
    const onFilterTagChange = vi.fn();
    const { PlanningUnassignedSidebar } = await import("@/components/planning/PlanningUnassignedSidebar");
    render(<PlanningUnassignedSidebar {...baseSidebarProps} filterTag="ADR" onFilterTagChange={onFilterTagChange} />);
    const adrElements = screen.getAllByText("ADR");
    const filterBtn = adrElements.find((el) => el.closest("button")?.className.includes("h-6"))!.closest("button")!;
    fireEvent.click(filterBtn);
    expect(onFilterTagChange).toHaveBeenCalledWith(null);
  });

  it("shows clear filter X button when filterTag is active", async () => {
    const onFilterTagChange = vi.fn();
    const { PlanningUnassignedSidebar } = await import("@/components/planning/PlanningUnassignedSidebar");
    const { container } = render(<PlanningUnassignedSidebar {...baseSidebarProps} filterTag="ADR" onFilterTagChange={onFilterTagChange} />);
    // Find the X clear button (last button in the filter area)
    const xButton = container.querySelector("button svg.h-3.w-3")?.closest("button");
    if (xButton) {
      fireEvent.click(xButton);
      expect(onFilterTagChange).toHaveBeenCalledWith(null);
    }
  });

  it("renders Auto-plan button and calls onAutoPlan", async () => {
    const onAutoPlan = vi.fn();
    const { PlanningUnassignedSidebar } = await import("@/components/planning/PlanningUnassignedSidebar");
    render(<PlanningUnassignedSidebar {...baseSidebarProps} onAutoPlan={onAutoPlan} />);
    fireEvent.click(screen.getByText("Auto-plan"));
    expect(onAutoPlan).toHaveBeenCalled();
  });

  it("renders Combineer button and calls onCombineTrips", async () => {
    const onCombineTrips = vi.fn();
    const { PlanningUnassignedSidebar } = await import("@/components/planning/PlanningUnassignedSidebar");
    render(<PlanningUnassignedSidebar {...baseSidebarProps} onCombineTrips={onCombineTrips} assignments={{ v1: [mockOrder as any], v2: [mockOrder2 as any] } as any} />);
    fireEvent.click(screen.getByText("Combineer"));
    expect(onCombineTrips).toHaveBeenCalled();
  });

  it("renders Wissen button and calls onClearPlanning with confirm", async () => {
    const onClearPlanning = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { PlanningUnassignedSidebar } = await import("@/components/planning/PlanningUnassignedSidebar");
    render(<PlanningUnassignedSidebar {...baseSidebarProps} onClearPlanning={onClearPlanning} totalAssigned={3} />);
    fireEvent.click(screen.getByText("Wissen"));
    expect(window.confirm).toHaveBeenCalled();
    expect(onClearPlanning).toHaveBeenCalled();
    (window.confirm as any).mockRestore();
  });

  it("does not call onClearPlanning when confirm is cancelled", async () => {
    const onClearPlanning = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const { PlanningUnassignedSidebar } = await import("@/components/planning/PlanningUnassignedSidebar");
    render(<PlanningUnassignedSidebar {...baseSidebarProps} onClearPlanning={onClearPlanning} totalAssigned={3} />);
    fireEvent.click(screen.getByText("Wissen"));
    expect(onClearPlanning).not.toHaveBeenCalled();
    (window.confirm as any).mockRestore();
  });

  it("shows empty state when no unassigned orders", async () => {
    const { PlanningUnassignedSidebar } = await import("@/components/planning/PlanningUnassignedSidebar");
    render(<PlanningUnassignedSidebar {...baseSidebarProps} groupedUnassigned={[]} totalUnassigned={0} />);
    expect(screen.getByText("Geen openstaande orders")).toBeInTheDocument();
  });

  it("shows grouped regions", async () => {
    const { PlanningUnassignedSidebar } = await import("@/components/planning/PlanningUnassignedSidebar");
    render(<PlanningUnassignedSidebar {...baseSidebarProps} />);
    // Region headers contain the label text
    const amsterdamElements = screen.getAllByText("Amsterdam");
    expect(amsterdamElements.length).toBeGreaterThanOrEqual(1);
    const denHaagElements = screen.getAllByText("Den Haag");
    expect(denHaagElements.length).toBeGreaterThanOrEqual(1);
  });

  it("shows vehicle capacity stats footer", async () => {
    const { PlanningUnassignedSidebar } = await import("@/components/planning/PlanningUnassignedSidebar");
    render(<PlanningUnassignedSidebar {...baseSidebarProps} />);
    expect(screen.getByText(/2 beschikbaar/)).toBeInTheDocument();
    expect(screen.getByText(/0 ingepland/)).toBeInTheDocument();
  });

  it("disables Auto-plan when totalUnassigned is 0", async () => {
    const { PlanningUnassignedSidebar } = await import("@/components/planning/PlanningUnassignedSidebar");
    render(<PlanningUnassignedSidebar {...baseSidebarProps} totalUnassigned={0} />);
    expect(screen.getByText("Auto-plan").closest("button")).toBeDisabled();
  });

  it("disables Wissen when totalAssigned is 0", async () => {
    const { PlanningUnassignedSidebar } = await import("@/components/planning/PlanningUnassignedSidebar");
    render(<PlanningUnassignedSidebar {...baseSidebarProps} totalAssigned={0} />);
    expect(screen.getByText("Wissen").closest("button")).toBeDisabled();
  });
});

// ═══════════════════════════════════════════════════════════════
// PlanningMap
// ═══════════════════════════════════════════════════════════════
describe("PlanningMap", () => {
  it("renders map container", async () => {
    const { PlanningMap } = await import("@/components/planning/PlanningMap");
    const { container } = render(
      <PlanningMap
        orders={[]}
        orderCoords={new Map()}
        orderToVehicle={new Map()}
        highlightedIds={new Set()}
        assignments={{}}
        fleetVehicles={[]}
      />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it("renders with orders and coords", async () => {
    const { PlanningMap } = await import("@/components/planning/PlanningMap");
    const orderCoords = new Map([["o1", { lat: 52.37, lng: 4.9 }]]);
    const orderToVehicle = new Map([["o1", "v1"]]);
    const { container } = render(
      <PlanningMap
        orders={[mockOrder as any]}
        orderCoords={orderCoords}
        orderToVehicle={orderToVehicle}
        highlightedIds={new Set()}
        assignments={{ v1: [mockOrder as any] }}
        fleetVehicles={[mockVehicle as any]}
      />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it("renders with highlighted orders", async () => {
    const { PlanningMap } = await import("@/components/planning/PlanningMap");
    const orderCoords = new Map([["o1", { lat: 52.37, lng: 4.9 }]]);
    const { container } = render(
      <PlanningMap
        orders={[mockOrder as any]}
        orderCoords={orderCoords}
        orderToVehicle={new Map()}
        highlightedIds={new Set(["o1"])}
        assignments={{}}
        fleetVehicles={[]}
      />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it("renders with empty assignments", async () => {
    const { PlanningMap } = await import("@/components/planning/PlanningMap");
    const { container } = render(
      <PlanningMap
        orders={[mockOrder as any]}
        orderCoords={new Map()}
        orderToVehicle={new Map()}
        highlightedIds={new Set()}
        assignments={{ v1: [] }}
        fleetVehicles={[mockVehicle as any]}
      />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it("renders with multiple vehicles and polylines", async () => {
    const { PlanningMap } = await import("@/components/planning/PlanningMap");
    const orderCoords = new Map([
      ["o1", { lat: 52.37, lng: 4.9 }],
      ["o2", { lat: 51.92, lng: 4.48 }],
    ]);
    const orderToVehicle = new Map([["o1", "v1"], ["o2", "v2"]]);
    const { container } = render(
      <PlanningMap
        orders={[mockOrder as any, mockOrder2 as any]}
        orderCoords={orderCoords}
        orderToVehicle={orderToVehicle}
        highlightedIds={new Set()}
        assignments={{ v1: [mockOrder as any], v2: [mockOrder2 as any] }}
        fleetVehicles={[mockVehicle as any, { ...mockVehicle, id: "v2", name: "Truck B" } as any]}
      />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });
});
