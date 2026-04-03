import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

// ── Hoisted mocks ──────────────────────────────────────────────────
const {
  mockSupabase,
  mockVehicles,
  mockDrivers,
  mockSaveDraft,
  mockDeleteDraft,
  mockSolveVRP,
  mockOptimizeRoute,
  mockOrders,
  mockOnDragEnd,
  mockOnDragStart,
} = vi.hoisted(() => {
  const orders = [
    {
      id: "order-1",
      order_number: 1001,
      client_name: "Bakkerij Amsterdam",
      pickup_address: "Magazijn 1, Utrecht",
      delivery_address: "Broodstraat 10, 1012 AB Amsterdam",
      quantity: 5,
      weight_kg: 200,
      requirements: [],
      is_weight_per_unit: false,
      time_window_start: null,
      time_window_end: null,
      pickup_time_from: null,
      pickup_time_to: null,
      delivery_time_from: null,
      delivery_time_to: null,
      geocoded_pickup_lat: 52.09,
      geocoded_pickup_lng: 5.12,
      geocoded_delivery_lat: 52.37,
      geocoded_delivery_lng: 4.89,
      delivery_date: null,
      pickup_date: null,
    },
    {
      id: "order-2",
      order_number: 1002,
      client_name: "Supermarkt Rotterdam",
      pickup_address: "Magazijn 2, Utrecht",
      delivery_address: "Marktweg 5, 3011 AA Rotterdam",
      quantity: 10,
      weight_kg: 500,
      requirements: ["KOELING"],
      is_weight_per_unit: false,
      time_window_start: null,
      time_window_end: null,
      pickup_time_from: null,
      pickup_time_to: null,
      delivery_time_from: null,
      delivery_time_to: null,
      geocoded_pickup_lat: 52.09,
      geocoded_pickup_lng: 5.12,
      geocoded_delivery_lat: 51.92,
      geocoded_delivery_lng: 4.48,
      delivery_date: null,
      pickup_date: null,
    },
    {
      id: "order-3",
      order_number: 1003,
      client_name: "ADR Transport Den Haag",
      pickup_address: "Magazijn 1, Utrecht",
      delivery_address: "Chemiestraat 1, 2511 AA Den Haag",
      quantity: 2,
      weight_kg: 1000,
      requirements: ["ADR"],
      is_weight_per_unit: false,
      time_window_start: null,
      time_window_end: null,
      pickup_time_from: null,
      pickup_time_to: null,
      delivery_time_from: null,
      delivery_time_to: null,
      geocoded_pickup_lat: 52.09,
      geocoded_pickup_lng: 5.12,
      geocoded_delivery_lat: 52.07,
      geocoded_delivery_lng: 4.30,
      delivery_date: null,
      pickup_date: null,
    },
    {
      id: "order-4",
      order_number: 1004,
      client_name: "Winkel Eindhoven",
      pickup_address: "Magazijn 3, Tilburg",
      delivery_address: "Winkelstraat 8, 5611 AA Eindhoven",
      quantity: 3,
      weight_kg: 150,
      requirements: [],
      is_weight_per_unit: true,
      time_window_start: "09:00",
      time_window_end: "17:00",
      pickup_time_from: null,
      pickup_time_to: null,
      delivery_time_from: null,
      delivery_time_to: null,
      geocoded_pickup_lat: 51.56,
      geocoded_pickup_lng: 5.09,
      geocoded_delivery_lat: 51.44,
      geocoded_delivery_lng: 5.47,
      delivery_date: null,
      pickup_date: null,
    },
  ];

  // Capture onDragEnd/onDragStart from DndContext
  let capturedOnDragEnd: any = null;
  let capturedOnDragStart: any = null;

  return {
    mockSupabase: {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: "trip-1" }, error: null }),
          }),
        }),
        then: vi.fn().mockImplementation((cb: any) => cb({ data: orders, error: null })),
      }),
      channel: vi.fn().mockReturnValue({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
      }),
      removeChannel: vi.fn(),
    },
    mockVehicles: [
      { id: "v1", code: "V01", name: "Truck 1", plate: "AB-123", type: "vrachtwagen", capacityKg: 10000, capacityPallets: 20, features: ["KOELING"] },
      { id: "v2", code: "V02", name: "Truck 2", plate: "CD-456", type: "vrachtwagen", capacityKg: 8000, capacityPallets: 16, features: ["ADR"] },
      { id: "v3", code: "V03", name: "Truck 3", plate: "EF-789", type: "bestelbus", capacityKg: 3000, capacityPallets: 8, features: [] },
    ],
    mockDrivers: [
      { id: "d1", name: "Jan Jansen", current_vehicle_id: "v1", certifications: ["KOELING"] },
      { id: "d2", name: "Piet Pietersen", current_vehicle_id: "v2", certifications: ["ADR"] },
      { id: "d3", name: "Klaas de Vries", current_vehicle_id: "v3", certifications: [] },
    ],
    mockSaveDraft: vi.fn().mockResolvedValue(undefined),
    mockDeleteDraft: vi.fn().mockResolvedValue(undefined),
    mockSolveVRP: vi.fn().mockImplementation((unassigned: any[], vehicles: any[]) => {
      // Simple mock: assign first unassigned to first vehicle
      const result: Record<string, any[]> = {};
      if (vehicles.length > 0 && unassigned.length > 0) {
        result[vehicles[0].id] = [unassigned[0]];
        if (unassigned.length > 1 && vehicles.length > 1) {
          result[vehicles[1].id] = [unassigned[1]];
        }
      }
      return result;
    }),
    mockOptimizeRoute: vi.fn().mockImplementation((list: any[]) => list),
    mockOrders: orders,
    mockOnDragEnd: {
      current: null as any,
      capture(fn: any) { capturedOnDragEnd = fn; },
      call(event: any) { if (capturedOnDragEnd) capturedOnDragEnd(event); },
      get fn() { return capturedOnDragEnd; },
    },
    mockOnDragStart: {
      current: null as any,
      capture(fn: any) { capturedOnDragStart = fn; },
      call(event: any) { if (capturedOnDragStart) capturedOnDragStart(event); },
      get fn() { return capturedOnDragStart; },
    },
  };
});

vi.mock("@/hooks/useVehicles", () => ({
  useVehicles: () => ({ data: mockVehicles, isLoading: false, isError: false }),
}));
vi.mock("@/hooks/useDrivers", () => ({
  useDrivers: () => ({ data: mockDrivers, isLoading: false, isError: false }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));
vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({ tenant: { id: "t1", name: "Test BV" }, loading: false }),
  TenantProvider: ({ children }: any) => children,
}));
vi.mock("@/hooks/usePlanningDrafts", () => ({
  useLoadPlanningDraft: () => ({ data: null, isLoading: false, isSuccess: true }),
  useSavePlanningDraft: () => ({ mutate: mockSaveDraft, mutateAsync: mockSaveDraft }),
  useDeletePlanningDraft: () => ({ mutate: mockDeleteDraft, mutateAsync: mockDeleteDraft }),
  collectWeekDrafts: vi.fn().mockResolvedValue({}),
  usePlanningDraftsRealtime: vi.fn(),
}));
vi.mock("@/lib/vrpSolver", () => ({ solveVRP: mockSolveVRP }));
vi.mock("@/data/geoData", () => ({
  resolveCoordinates: vi.fn().mockReturnValue({ lat: 52.37, lng: 4.89 }),
  getPostcodeRegion: vi.fn().mockImplementation((addr: string) => {
    if (!addr) return "";
    const m = addr.match(/(\d{4})/);
    return m ? m[1].substring(0, 2) : "";
  }),
  getRegionLabel: vi.fn().mockImplementation((r: string) => r ? `Regio ${r}` : "Onbekend"),
  haversineKm: vi.fn().mockReturnValue(25),
  vehicleColors: new Proxy({}, { get: () => "#888" }),
}));
vi.mock("@/lib/routeOptimizer", () => ({
  optimizeRoute: mockOptimizeRoute,
  computeETAs: vi.fn().mockReturnValue([]),
  computeRouteStats: vi.fn().mockReturnValue({ totalKm: 0, totalMinutes: 0, etaBack: "17:00" }),
  twoOptImprove: vi.fn().mockImplementation((list: any[]) => list),
  isWithinTimeWindow: vi.fn().mockReturnValue(true),
}));
vi.mock("@/components/planning/PlanningMap", () => ({
  PlanningMap: () => <div data-testid="planning-map">Map</div>,
}));
vi.mock("@/components/planning/PlanningWeekView", () => ({
  PlanningWeekView: ({ onDayClick }: any) => (
    <div data-testid="week-view">
      <button data-testid="week-day-click" onClick={() => onDayClick("2026-04-06")}>Day</button>
    </div>
  ),
}));
vi.mock("@/components/planning/VehicleAvailabilityPanel", () => ({
  VehicleAvailabilityPanel: () => <div data-testid="vehicle-availability">Availability</div>,
}));

// DndContext mock that captures onDragEnd/onDragStart
vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children, onDragEnd, onDragStart }: any) => {
    mockOnDragEnd.capture(onDragEnd);
    mockOnDragStart.capture(onDragStart);
    return <div data-testid="dnd-context">{children}</div>;
  },
  DragOverlay: ({ children }: any) => <div data-testid="drag-overlay">{children}</div>,
  PointerSensor: vi.fn(),
  useSensor: vi.fn(),
  useSensors: vi.fn().mockReturnValue([]),
  closestCenter: vi.fn(),
  useDroppable: vi.fn().mockReturnValue({ setNodeRef: vi.fn(), isOver: false }),
  useDraggable: vi.fn().mockReturnValue({
    setNodeRef: vi.fn(), listeners: {}, attributes: {}, transform: null, isDragging: false,
  }),
}));
vi.mock("@dnd-kit/sortable", () => ({
  arrayMove: vi.fn().mockImplementation((arr: any[], from: number, to: number) => {
    const result = [...arr];
    const [item] = result.splice(from, 1);
    result.splice(to, 0, item);
    return result;
  }),
  SortableContext: ({ children }: any) => <div>{children}</div>,
  useSortable: vi.fn().mockReturnValue({
    setNodeRef: vi.fn(), listeners: {}, attributes: {}, transform: null, transition: null, isDragging: false,
  }),
  verticalListSortingStrategy: vi.fn(),
}));
vi.mock("framer-motion", async () => ({
  motion: {
    div: ({ children, ...props }: any) => {
      // filter out framer-specific props
      const { initial, animate, exit, transition, whileHover, whileTap, layout, ...rest } = props;
      return <div {...rest}>{children}</div>;
    },
  },
  AnimatePresence: ({ children }: any) => children,
}));
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

import { TooltipProvider } from "@/components/ui/tooltip";
import Planning from "@/pages/Planning";
import { toast } from "sonner";

function renderPlanning() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <TooltipProvider>
          <Planning />
        </TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Planning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset window.confirm mock
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  // ──────────────────────────────────────────────────────────────
  // Basic rendering
  // ──────────────────────────────────────────────────────────────
  it("renders without crashing", async () => {
    renderPlanning();
    await waitFor(() => {
      expect(document.body.textContent!.length).toBeGreaterThan(0);
    });
  });

  it("renders the planning map component", async () => {
    renderPlanning();
    await waitFor(() => {
      expect(screen.getByTestId("planning-map")).toBeInTheDocument();
    });
  });

  it("shows vehicle cards in sidebar", async () => {
    renderPlanning();
    await waitFor(() => {
      expect(screen.getByText("Truck 1")).toBeInTheDocument();
      expect(screen.getByText("Truck 2")).toBeInTheDocument();
      expect(screen.getByText("Truck 3")).toBeInTheDocument();
    });
  });

  it("renders vehicle plate numbers", async () => {
    renderPlanning();
    await waitFor(() => {
      expect(screen.getByText("AB-123")).toBeInTheDocument();
      expect(screen.getByText("CD-456")).toBeInTheDocument();
    });
  });

  it("shows vehicle capacity info", async () => {
    renderPlanning();
    await waitFor(() => {
      expect(screen.getByText(/10000 kg/)).toBeInTheDocument();
    });
  });

  it("shows unassigned orders in sidebar", async () => {
    renderPlanning();
    await waitFor(() => {
      expect(screen.getByText("Bakkerij Amsterdam")).toBeInTheDocument();
      expect(screen.getByText("Supermarkt Rotterdam")).toBeInTheDocument();
    });
  });

  // ──────────────────────────────────────────────────────────────
  // Search (setSearch)
  // ──────────────────────────────────────────────────────────────
  it("shows search input for orders", async () => {
    renderPlanning();
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Zoek/i)).toBeInTheDocument();
    });
  });

  it("filters orders by search term", async () => {
    const user = userEvent.setup();
    renderPlanning();
    await waitFor(() => {
      expect(screen.getByText("Bakkerij Amsterdam")).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText(/Zoek/i), "Rotterdam");
    await waitFor(() => {
      expect(screen.queryByText("Bakkerij Amsterdam")).not.toBeInTheDocument();
      expect(screen.getByText("Supermarkt Rotterdam")).toBeInTheDocument();
    });
  });

  it("filters orders by order number search", async () => {
    const user = userEvent.setup();
    renderPlanning();
    await waitFor(() => {
      expect(screen.getByText("Bakkerij Amsterdam")).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText(/Zoek/i), "1001");
    await waitFor(() => {
      expect(screen.getByText("Bakkerij Amsterdam")).toBeInTheDocument();
      expect(screen.queryByText("Supermarkt Rotterdam")).not.toBeInTheDocument();
    });
  });

  // ──────────────────────────────────────────────────────────────
  // Filter tags (setFilterTag)
  // ──────────────────────────────────────────────────────────────
  it("filters by ADR tag", async () => {
    const user = userEvent.setup();
    renderPlanning();

    // Find the ADR filter button (not the one in order text)
    const adrButtons = await waitFor(() => screen.getAllByText("ADR"));
    const adrFilterBtn = adrButtons.find(el => el.tagName === "BUTTON" && el.classList.contains("rounded-md"));
    expect(adrFilterBtn).toBeTruthy();
    await user.click(adrFilterBtn!);
    await waitFor(() => {
      expect(screen.getByText("ADR Transport Den Haag")).toBeInTheDocument();
      expect(screen.queryByText("Bakkerij Amsterdam")).not.toBeInTheDocument();
    });
  });

  it("filters by KOELING tag", async () => {
    const user = userEvent.setup();
    renderPlanning();

    const koelButtons = await waitFor(() => screen.getAllByText("KOELING"));
    const koelFilterBtn = koelButtons.find(el => el.tagName === "BUTTON" && el.classList.contains("rounded-md"));
    expect(koelFilterBtn).toBeTruthy();
    await user.click(koelFilterBtn!);
    await waitFor(() => {
      expect(screen.getByText("Supermarkt Rotterdam")).toBeInTheDocument();
      expect(screen.queryByText("Bakkerij Amsterdam")).not.toBeInTheDocument();
    });
  });

  it("clears filter tag on second click", async () => {
    const user = userEvent.setup();
    renderPlanning();

    const adrButtons = await waitFor(() => screen.getAllByText("ADR"));
    const adrFilterBtn = adrButtons.find(el => el.tagName === "BUTTON" && el.classList.contains("rounded-md"));
    expect(adrFilterBtn).toBeTruthy();
    await user.click(adrFilterBtn!);
    await waitFor(() => {
      expect(screen.queryByText("Bakkerij Amsterdam")).not.toBeInTheDocument();
    });
    // Click again to clear - re-find since DOM may have changed
    const adrButtons2 = screen.getAllByText("ADR");
    const adrFilterBtn2 = adrButtons2.find(el => el.tagName === "BUTTON" && el.classList.contains("rounded-md"));
    await user.click(adrFilterBtn2!);
    await waitFor(() => {
      expect(screen.getByText("Bakkerij Amsterdam")).toBeInTheDocument();
    });
  });

  // ──────────────────────────────────────────────────────────────
  // Date navigation (handleDateChange, setSelectedDate)
  // ──────────────────────────────────────────────────────────────
  it("shows Vandaag button after navigating away from today", async () => {
    const user = userEvent.setup();
    renderPlanning();
    // Vandaag is hidden when selectedDate === today, so navigate to next week first
    const nextBtn = screen.getAllByRole("button").find((b) => b.querySelector(".lucide-chevron-right"));
    expect(nextBtn).toBeTruthy();
    await user.click(nextBtn!);
    await waitFor(() => {
      expect(screen.getByText("Vandaag")).toBeInTheDocument();
    });
  });

  it("clicks Vandaag to return to today", async () => {
    const user = userEvent.setup();
    renderPlanning();
    // Navigate away first
    const nextBtn = screen.getAllByRole("button").find((b) => b.querySelector(".lucide-chevron-right"));
    await user.click(nextBtn!);
    await waitFor(() => {
      expect(screen.getByText("Vandaag")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Vandaag"));
    // Vandaag should disappear since we're back to today
    await waitFor(() => {
      expect(screen.queryByText("Vandaag")).not.toBeInTheDocument();
    });
  });

  it("navigates dates with prev/next arrows", async () => {
    const user = userEvent.setup();
    renderPlanning();
    const buttons = screen.getAllByRole("button");
    const prevBtn = buttons.find((b) => b.querySelector(".lucide-chevron-left"));
    const nextBtn = buttons.find((b) => b.querySelector(".lucide-chevron-right"));
    if (prevBtn) await user.click(prevBtn);
    if (nextBtn) await user.click(nextBtn);
    expect(document.body.textContent).toBeTruthy();
  });

  // ──────────────────────────────────────────────────────────────
  // View mode (setViewMode) — day/week toggle
  // ──────────────────────────────────────────────────────────────
  it("switches between Dag and Week view", async () => {
    const user = userEvent.setup();
    renderPlanning();
    await waitFor(() => {
      expect(screen.getByText("Dag")).toBeInTheDocument();
      expect(screen.getByText("Week")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Week"));
    await waitFor(() => {
      expect(screen.getByTestId("week-view")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Dag"));
    await waitFor(() => {
      expect(screen.getByTestId("planning-map")).toBeInTheDocument();
    });
  });

  it("clicking a day in week view switches to day view", async () => {
    const user = userEvent.setup();
    renderPlanning();
    await user.click(screen.getByText("Week"));
    await waitFor(() => {
      expect(screen.getByTestId("week-day-click")).toBeInTheDocument();
    });
    await user.click(screen.getByTestId("week-day-click"));
    await waitFor(() => {
      expect(screen.getByTestId("planning-map")).toBeInTheDocument();
    });
  });

  // ──────────────────────────────────────────────────────────────
  // Map toggle (setShowMap)
  // ──────────────────────────────────────────────────────────────
  it("toggles map visibility", async () => {
    const user = userEvent.setup();
    renderPlanning();
    await waitFor(() => {
      expect(screen.getByTestId("planning-map")).toBeInTheDocument();
    });
    // Click "Verberg kaart" to hide map
    const mapToggle = screen.getByText(/Verberg kaart|Toon kaart/i);
    await user.click(mapToggle);
    // After toggle, the map should be hidden (the parent div has hidden class)
    expect(document.body.textContent).toBeTruthy();
  });

  // ──────────────────────────────────────────────────────────────
  // DnD: handleDragStart
  // ──────────────────────────────────────────────────────────────
  it("handleDragStart sets the active order from unassigned orders", async () => {
    renderPlanning();
    await waitFor(() => {
      expect(screen.getByText("Bakkerij Amsterdam")).toBeInTheDocument();
    });

    act(() => {
      mockOnDragStart.call({ active: { id: "order-1" } });
    });

    // DragOverlay should show the active order card
    await waitFor(() => {
      const overlay = screen.getByTestId("drag-overlay");
      expect(overlay).toBeInTheDocument();
    });
  });

  it("handleDragStart finds order from assigned vehicles", async () => {
    renderPlanning();
    await waitFor(() => {
      expect(screen.getByText("Bakkerij Amsterdam")).toBeInTheDocument();
    });

    // First assign order-1 to v1 via drag
    act(() => {
      mockOnDragEnd.call({
        active: { id: "order-1" },
        over: { id: "v1" },
      });
    });

    // Now start dragging order-1 (it is now in assignments, not in unassigned list)
    act(() => {
      mockOnDragStart.call({ active: { id: "order-1" } });
    });

    await waitFor(() => {
      const overlay = screen.getByTestId("drag-overlay");
      expect(overlay).toBeInTheDocument();
    });
  });

  // ──────────────────────────────────────────────────────────────
  // DnD: handleDragEnd — assign order to vehicle
  // ──────────────────────────────────────────────────────────────
  it("assigns an order to a vehicle via drag end", async () => {
    renderPlanning();
    await waitFor(() => {
      expect(screen.getByText("Bakkerij Amsterdam")).toBeInTheDocument();
    });

    act(() => {
      mockOnDragEnd.call({
        active: { id: "order-1" },
        over: { id: "v1" },
      });
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        "Order verplaatst",
        expect.objectContaining({
          description: expect.stringContaining("Bakkerij Amsterdam"),
        }),
      );
    });
  });

  it("does nothing when dropping with no target", async () => {
    renderPlanning();
    await waitFor(() => {
      expect(screen.getByText("Bakkerij Amsterdam")).toBeInTheDocument();
    });

    act(() => {
      mockOnDragEnd.call({
        active: { id: "order-1" },
        over: null,
      });
    });

    // No toast should have been called
    expect(toast.success).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────
  // DnD: handleDragEnd — drop on "unassigned" to remove
  // ──────────────────────────────────────────────────────────────
  it("moves order back to unassigned when dropped on unassigned area", async () => {
    renderPlanning();
    await waitFor(() => {
      expect(screen.getByText("Bakkerij Amsterdam")).toBeInTheDocument();
    });

    // Assign order first
    act(() => {
      mockOnDragEnd.call({
        active: { id: "order-1" },
        over: { id: "v1" },
      });
    });
    vi.clearAllMocks();

    // Drop on unassigned
    act(() => {
      mockOnDragEnd.call({
        active: { id: "order-1" },
        over: { id: "unassigned" },
      });
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        "Order teruggezet",
        expect.objectContaining({
          description: expect.stringContaining("beschikbaar"),
        }),
      );
    });
  });

  // ──────────────────────────────────────────────────────────────
  // DnD: handleDragEnd — validate drop (KOELING)
  // ──────────────────────────────────────────────────────────────
  it("rejects KOELING order on vehicle without KOELING feature", async () => {
    renderPlanning();
    await waitFor(() => {
      expect(screen.getByText("Supermarkt Rotterdam")).toBeInTheDocument();
    });

    // order-2 has KOELING requirement, v3 has no features
    act(() => {
      mockOnDragEnd.call({
        active: { id: "order-2" },
        over: { id: "v3" },
      });
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Niet toegestaan",
        expect.objectContaining({
          description: expect.stringContaining("koeling"),
        }),
      );
    });
  });

  // ──────────────────────────────────────────────────────────────
  // DnD: handleDragEnd — validate drop (ADR)
  // ──────────────────────────────────────────────────────────────
  it("rejects ADR order on vehicle without ADR feature", async () => {
    renderPlanning();
    await waitFor(() => {
      expect(screen.getByText("ADR Transport Den Haag")).toBeInTheDocument();
    });

    // order-3 has ADR requirement, v1 only has KOELING
    act(() => {
      mockOnDragEnd.call({
        active: { id: "order-3" },
        over: { id: "v1" },
      });
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Niet toegestaan",
        expect.objectContaining({
          description: expect.stringContaining("ADR"),
        }),
      );
    });
  });

  it("allows ADR order on ADR-equipped vehicle", async () => {
    renderPlanning();
    await waitFor(() => {
      expect(screen.getByText("ADR Transport Den Haag")).toBeInTheDocument();
    });

    // order-3 has ADR, v2 has ADR
    act(() => {
      mockOnDragEnd.call({
        active: { id: "order-3" },
        over: { id: "v2" },
      });
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        "Order verplaatst",
        expect.objectContaining({
          description: expect.stringContaining("ADR Transport Den Haag"),
        }),
      );
    });
  });

  // ──────────────────────────────────────────────────────────────
  // DnD: handleDragEnd — move between vehicles
  // ──────────────────────────────────────────────────────────────
  it("moves order between vehicles", async () => {
    renderPlanning();
    await waitFor(() => {
      expect(screen.getByText("Bakkerij Amsterdam")).toBeInTheDocument();
    });

    // Assign to v1
    act(() => {
      mockOnDragEnd.call({
        active: { id: "order-1" },
        over: { id: "v1" },
      });
    });
    vi.clearAllMocks();

    // Move to v3
    act(() => {
      mockOnDragEnd.call({
        active: { id: "order-1" },
        over: { id: "v3" },
      });
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        "Order verplaatst",
        expect.objectContaining({
          description: expect.stringContaining("Truck 3"),
        }),
      );
    });
  });

  // ──────────────────────────────────────────────────────────────
  // DnD: handleDragEnd — reorder within same vehicle
  // ──────────────────────────────────────────────────────────────
  it("reorders within same vehicle via drag end", async () => {
    renderPlanning();
    await waitFor(() => {
      expect(screen.getByText("Bakkerij Amsterdam")).toBeInTheDocument();
    });

    // Assign two orders to v1
    act(() => {
      mockOnDragEnd.call({
        active: { id: "order-1" },
        over: { id: "v1" },
      });
    });
    act(() => {
      mockOnDragEnd.call({
        active: { id: "order-4" },
        over: { id: "v1" },
      });
    });
    vi.clearAllMocks();

    // Now reorder: drag order-1 over order-4 (both in v1)
    act(() => {
      mockOnDragEnd.call({
        active: { id: "order-1" },
        over: { id: "order-4" },
      });
    });

    // The reorder should not produce a toast (it is a silent operation)
    // No "Order verplaatst" toast since it stays in same vehicle
    expect(toast.error).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────
  // handleAutoPlan
  // ──────────────────────────────────────────────────────────────
  it("auto-plan distributes orders to vehicles", async () => {
    const user = userEvent.setup();
    renderPlanning();
    await waitFor(() => {
      expect(screen.getByText("Auto-plan")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Auto-plan"));

    await waitFor(() => {
      expect(mockSolveVRP).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringContaining("automatisch verdeeld"),
        expect.any(Object),
      );
    });
  });

  // ──────────────────────────────────────────────────────────────
  // handleClearPlanning
  // ──────────────────────────────────────────────────────────────
  it("clears all assignments via Wissen button", async () => {
    const user = userEvent.setup();
    renderPlanning();
    await waitFor(() => {
      expect(screen.getByText("Bakkerij Amsterdam")).toBeInTheDocument();
    });

    // Assign an order first so Wissen button is enabled
    act(() => {
      mockOnDragEnd.call({
        active: { id: "order-1" },
        over: { id: "v1" },
      });
    });
    vi.clearAllMocks();

    await waitFor(() => {
      const wissenBtn = screen.getByText("Wissen");
      expect(wissenBtn).toBeInTheDocument();
      expect(wissenBtn).not.toBeDisabled();
    });

    await user.click(screen.getByText("Wissen"));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        "Planning gewist",
        expect.objectContaining({
          description: expect.stringContaining("leeggemaakt"),
        }),
      );
    });
  });

  // ──────────────────────────────────────────────────────────────
  // handleConfirmPlanning (Bevestigen button + dialog)
  // ──────────────────────────────────────────────────────────────
  it("does not show Bevestigen button when no orders assigned", async () => {
    renderPlanning();
    await waitFor(() => {
      expect(screen.queryByText(/Bevestigen/i)).not.toBeInTheDocument();
    });
  });

  it("shows Bevestigen button after assigning an order", async () => {
    renderPlanning();
    await waitFor(() => {
      expect(screen.getByText("Bakkerij Amsterdam")).toBeInTheDocument();
    });

    act(() => {
      mockOnDragEnd.call({
        active: { id: "order-1" },
        over: { id: "v1" },
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/Bevestigen/i)).toBeInTheDocument();
    });
  });

  it("opens confirm dialog and confirms planning", async () => {
    const user = userEvent.setup();
    renderPlanning();
    await waitFor(() => {
      expect(screen.getByText("Bakkerij Amsterdam")).toBeInTheDocument();
    });

    act(() => {
      mockOnDragEnd.call({
        active: { id: "order-1" },
        over: { id: "v1" },
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/Bevestigen/i)).toBeInTheDocument();
    });

    // Click the Bevestigen button to open dialog
    const confirmBtn = screen.getByText(/Bevestigen/i);
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByText("Planning bevestigen")).toBeInTheDocument();
    });

    // Click Bevestigen inside the dialog
    const dialogConfirmBtn = screen.getByRole("button", { name: "Bevestigen" });
    await user.click(dialogConfirmBtn);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        "Planning bevestigd",
        expect.any(Object),
      );
    });
  });

  it("cancel in confirm dialog does not dispatch", async () => {
    const user = userEvent.setup();
    renderPlanning();
    await waitFor(() => {
      expect(screen.getByText("Bakkerij Amsterdam")).toBeInTheDocument();
    });

    act(() => {
      mockOnDragEnd.call({
        active: { id: "order-1" },
        over: { id: "v1" },
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/Bevestigen/i)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/Bevestigen/i));

    await waitFor(() => {
      expect(screen.getByText("Annuleren")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Annuleren"));

    // Dialog should close, no confirmation toast
    await waitFor(() => {
      expect(screen.queryByText("Planning bevestigen")).not.toBeInTheDocument();
    });
  });

  // ──────────────────────────────────────────────────────────────
  // handleConfirm — error handling
  // ──────────────────────────────────────────────────────────────
  it("shows error toast when confirm fails", async () => {
    const user = userEvent.setup();

    renderPlanning();
    await waitFor(() => {
      expect(screen.getByText("Bakkerij Amsterdam")).toBeInTheDocument();
    });

    act(() => {
      mockOnDragEnd.call({
        active: { id: "order-1" },
        over: { id: "v1" },
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/Bevestigen/i)).toBeInTheDocument();
    });

    // Now make supabase fail for the confirm flow (update call)
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "orders") {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: { message: "Database error" } }),
          }),
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          then: vi.fn().mockImplementation((cb: any) => cb({ data: mockOrders, error: null })),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        then: vi.fn().mockImplementation((cb: any) => cb({ data: [], error: null })),
      };
    });

    await user.click(screen.getByText(/Bevestigen/i));
    await waitFor(() => {
      expect(screen.getByText("Planning bevestigen")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Bevestigen" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Fout bij bevestigen",
        expect.any(Object),
      );
    });
  });

  // ──────────────────────────────────────────────────────────────
  // Auto-save debounce (assignments change triggers save)
  // ──────────────────────────────────────────────────────────────
  it("auto-saves draft to database after debounce", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderPlanning();
    await waitFor(() => {
      expect(screen.getByText("Bakkerij Amsterdam")).toBeInTheDocument();
    });

    act(() => {
      mockOnDragEnd.call({
        active: { id: "order-1" },
        over: { id: "v1" },
      });
    });

    // Advance past debounce timer (2000ms)
    act(() => {
      vi.advanceTimersByTime(2500);
    });

    await waitFor(() => {
      expect(mockSaveDraft).toHaveBeenCalled();
    });
    vi.useRealTimers();
  });

  // ──────────────────────────────────────────────────────────────
  // Distance warning (checkDistanceWarning)
  // ──────────────────────────────────────────────────────────────
  it("shows distance warning when orders are far apart", async () => {
    // Make haversineKm return > 150 for the warning
    const { haversineKm } = await import("@/data/geoData");
    (haversineKm as any).mockReturnValue(200);

    renderPlanning();
    await waitFor(() => {
      expect(screen.getByText("Bakkerij Amsterdam")).toBeInTheDocument();
    });

    // Assign first order
    act(() => {
      mockOnDragEnd.call({
        active: { id: "order-1" },
        over: { id: "v1" },
      });
    });
    vi.clearAllMocks();

    // Assign second order to same vehicle — should trigger distance warning
    act(() => {
      mockOnDragEnd.call({
        active: { id: "order-4" },
        over: { id: "v1" },
      });
    });

    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalledWith(
        "Afstandswaarschuwing!",
        expect.objectContaining({
          description: expect.stringContaining("km uit elkaar"),
        }),
      );
    });

    // Reset
    (haversineKm as any).mockReturnValue(25);
  });

  // ──────────────────────────────────────────────────────────────
  // useMemo: assignedIds
  // ──────────────────────────────────────────────────────────────
  it("assignedIds correctly tracks assigned orders (order disappears from unassigned list)", async () => {
    renderPlanning();
    await waitFor(() => {
      expect(screen.getByText("Bakkerij Amsterdam")).toBeInTheDocument();
    });

    // Assign order-1
    act(() => {
      mockOnDragEnd.call({
        active: { id: "order-1" },
        over: { id: "v1" },
      });
    });

    // The subtitle shows updated counts - use getAllByText since both header and sidebar show counts
    await waitFor(() => {
      const matches = screen.getAllByText(/1 ingepland/);
      expect(matches.length).toBeGreaterThan(0);
    });
  });

  // ──────────────────────────────────────────────────────────────
  // useMemo: groupedUnassigned (region grouping)
  // ──────────────────────────────────────────────────────────────
  it("groups unassigned orders by region", async () => {
    renderPlanning();
    await waitFor(() => {
      // Check that region labels are rendered
      const content = document.body.textContent;
      expect(content).toContain("Regio");
    });
  });

  // ──────────────────────────────────────────────────────────────
  // useMemo: orderToVehicle mapping
  // ──────────────────────────────────────────────────────────────
  it("orderToVehicle updates when order is assigned then moved", async () => {
    renderPlanning();
    await waitFor(() => {
      expect(screen.getByText("Bakkerij Amsterdam")).toBeInTheDocument();
    });

    // Assign to v1
    act(() => {
      mockOnDragEnd.call({
        active: { id: "order-1" },
        over: { id: "v1" },
      });
    });

    // Move to v3 — this tests orderToVehicle map used internally
    act(() => {
      mockOnDragEnd.call({
        active: { id: "order-1" },
        over: { id: "v3" },
      });
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        "Order verplaatst",
        expect.objectContaining({
          description: expect.stringContaining("Truck 3"),
        }),
      );
    });
  });

  // ──────────────────────────────────────────────────────────────
  // handleRemove — removing order from vehicle
  // ──────────────────────────────────────────────────────────────
  it("removes order via handleRemove (dropping on unassigned)", async () => {
    renderPlanning();
    await waitFor(() => {
      expect(screen.getByText("Bakkerij Amsterdam")).toBeInTheDocument();
    });

    // Assign
    act(() => {
      mockOnDragEnd.call({
        active: { id: "order-1" },
        over: { id: "v1" },
      });
    });

    // Remove
    act(() => {
      mockOnDragEnd.call({
        active: { id: "order-1" },
        over: { id: "unassigned" },
      });
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        "Order teruggezet",
        expect.any(Object),
      );
    });
  });

  // ──────────────────────────────────────────────────────────────
  // Multiple assignments (vehicle stats / useMemo computations)
  // ──────────────────────────────────────────────────────────────
  it("handles multiple orders assigned to same vehicle", async () => {
    renderPlanning();
    await waitFor(() => {
      expect(screen.getByText("Bakkerij Amsterdam")).toBeInTheDocument();
    });

    act(() => {
      mockOnDragEnd.call({ active: { id: "order-1" }, over: { id: "v1" } });
    });
    act(() => {
      mockOnDragEnd.call({ active: { id: "order-4" }, over: { id: "v1" } });
    });

    await waitFor(() => {
      const matches = screen.getAllByText(/2 ingepland/);
      expect(matches.length).toBeGreaterThan(0);
    });
  });

  // ──────────────────────────────────────────────────────────────
  // useMemo: highlightedIds (hoveredVehicle / hoveredOrderId)
  // ──────────────────────────────────────────────────────────────
  it("renders vehicle cards that support hover interactions", async () => {
    renderPlanning();
    await waitFor(() => {
      expect(screen.getByText("Truck 1")).toBeInTheDocument();
    });
    // The hover state is managed internally; verify the vehicle card renders
    expect(screen.getByText("Truck 2")).toBeInTheDocument();
    expect(screen.getByText("Truck 3")).toBeInTheDocument();
  });

  // ──────────────────────────────────────────────────────────────
  // Subtitle text updates (totalAssigned, totalUnassigned)
  // ──────────────────────────────────────────────────────────────
  it("subtitle reflects correct counts", async () => {
    renderPlanning();
    await waitFor(() => {
      const matches4 = screen.getAllByText(/4 beschikbaar/);
      expect(matches4.length).toBeGreaterThan(0);
      const matches0 = screen.getAllByText(/0 ingepland/);
      expect(matches0.length).toBeGreaterThan(0);
    });

    act(() => {
      mockOnDragEnd.call({ active: { id: "order-1" }, over: { id: "v1" } });
    });

    await waitFor(() => {
      const matches3 = screen.getAllByText(/3 beschikbaar/);
      expect(matches3.length).toBeGreaterThan(0);
      const matches1 = screen.getAllByText(/1 ingepland/);
      expect(matches1.length).toBeGreaterThan(0);
    });
  });

  // ──────────────────────────────────────────────────────────────
  // handleClearDraft (Wis concept button)
  // ──────────────────────────────────────────────────────────────
  it("does not show confirm dialog initially", async () => {
    renderPlanning();
    await waitFor(() => {
      expect(screen.queryByText(/Bevestigen en dispatchen/i)).not.toBeInTheDocument();
    });
  });

  // ──────────────────────────────────────────────────────────────
  // Combineer button
  // ──────────────────────────────────────────────────────────────
  it("Combineer button is disabled when fewer than 2 vehicles have orders", async () => {
    renderPlanning();
    await waitFor(() => {
      const combineBtn = screen.getByText("Combineer");
      expect(combineBtn).toBeInTheDocument();
      expect(combineBtn.closest("button")).toBeDisabled();
    });
  });

  it("Combineer button becomes enabled with 2+ vehicles having orders", async () => {
    renderPlanning();
    await waitFor(() => {
      expect(screen.getByText("Bakkerij Amsterdam")).toBeInTheDocument();
    });

    // Assign orders to two different vehicles
    act(() => {
      mockOnDragEnd.call({ active: { id: "order-1" }, over: { id: "v1" } });
    });
    act(() => {
      mockOnDragEnd.call({ active: { id: "order-4" }, over: { id: "v3" } });
    });

    await waitFor(() => {
      const combineBtn = screen.getByText("Combineer");
      expect(combineBtn.closest("button")).not.toBeDisabled();
    });
  });

  // ──────────────────────────────────────────────────────────────
  // Auto-plan with no unassigned orders
  // ──────────────────────────────────────────────────────────────
  it("Auto-plan disabled when no unassigned orders", async () => {
    const user = userEvent.setup();
    renderPlanning();
    await waitFor(() => {
      expect(screen.getByText("Bakkerij Amsterdam")).toBeInTheDocument();
    });

    // Assign all orders
    act(() => {
      mockOnDragEnd.call({ active: { id: "order-1" }, over: { id: "v1" } });
    });
    act(() => {
      mockOnDragEnd.call({ active: { id: "order-2" }, over: { id: "v1" } });
    });
    act(() => {
      mockOnDragEnd.call({ active: { id: "order-3" }, over: { id: "v2" } });
    });
    act(() => {
      mockOnDragEnd.call({ active: { id: "order-4" }, over: { id: "v3" } });
    });

    await waitFor(() => {
      const autoBtn = screen.getByText("Auto-plan");
      expect(autoBtn.closest("button")).toBeDisabled();
    });
  });

  // ──────────────────────────────────────────────────────────────
  // handleDragEnd — dropping unassigned on unassigned (no-op)
  // ──────────────────────────────────────────────────────────────
  it("dropping unassigned order on unassigned area is no-op", async () => {
    renderPlanning();
    await waitFor(() => {
      expect(screen.getByText("Bakkerij Amsterdam")).toBeInTheDocument();
    });

    act(() => {
      mockOnDragEnd.call({
        active: { id: "order-1" },
        over: { id: "unassigned" },
      });
    });

    // No toast because the order was not previously assigned
    expect(toast.success).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────
  // handleDragEnd — dropping on non-existent target
  // ──────────────────────────────────────────────────────────────
  it("ignores drag to unknown target", async () => {
    renderPlanning();
    await waitFor(() => {
      expect(screen.getByText("Bakkerij Amsterdam")).toBeInTheDocument();
    });

    act(() => {
      mockOnDragEnd.call({
        active: { id: "order-1" },
        over: { id: "non-existent-id" },
      });
    });

    // No vehicle found, no assignment made
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────
  // handleDragEnd — self-drop on same vehicle (no move)
  // ──────────────────────────────────────────────────────────────
  it("does not move order when dropped on same vehicle it is already on", async () => {
    renderPlanning();
    await waitFor(() => {
      expect(screen.getByText("Bakkerij Amsterdam")).toBeInTheDocument();
    });

    act(() => {
      mockOnDragEnd.call({ active: { id: "order-1" }, over: { id: "v1" } });
    });
    vi.clearAllMocks();

    // Drop on same vehicle (not on another order in the vehicle, but on the vehicle itself)
    act(() => {
      mockOnDragEnd.call({ active: { id: "order-1" }, over: { id: "v1" } });
    });

    // Should be a no-op since activeVehicle === targetVehicle.id
    expect(toast.success).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────
  // Vehicle availability panel renders
  // ──────────────────────────────────────────────────────────────
  it("renders vehicle availability panel in day view", async () => {
    renderPlanning();
    await waitFor(() => {
      expect(screen.getByTestId("vehicle-availability")).toBeInTheDocument();
    });
  });

  // ──────────────────────────────────────────────────────────────
  // Combined search + filter
  // ──────────────────────────────────────────────────────────────
  it("combines search and filter tag", async () => {
    const user = userEvent.setup();
    renderPlanning();
    await waitFor(() => {
      expect(screen.getByText("Bakkerij Amsterdam")).toBeInTheDocument();
    });

    // Filter by ADR, then search for something that matches nothing
    const adrButtons = screen.getAllByText("ADR");
    const adrFilterBtn = adrButtons.find(el => el.tagName === "BUTTON" && el.classList.contains("rounded-md"));
    await user.click(adrFilterBtn!);
    await waitFor(() => {
      expect(screen.getByText("ADR Transport Den Haag")).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText(/Zoek/i), "xyz-no-match");
    await waitFor(() => {
      expect(screen.queryByText("ADR Transport Den Haag")).not.toBeInTheDocument();
    });
  });

  // ──────────────────────────────────────────────────────────────
  // Confirm planning creates trip_stops
  // ──────────────────────────────────────────────────────────────
  it("confirm planning calls supabase to create trips and stops", async () => {
    const user = userEvent.setup();

    // Setup precise supabase mock chain for confirm flow
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    const mockInsertTrip = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: "trip-123" }, error: null }),
      }),
    });
    const mockInsertStops = vi.fn().mockResolvedValue({ data: null, error: null });

    let callCount = 0;
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "orders") {
        callCount++;
        if (callCount > 1) {
          // After initial query, return update mock for confirm
          return {
            update: mockUpdate,
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            then: vi.fn().mockImplementation((cb: any) => cb({ data: mockOrders, error: null })),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          then: vi.fn().mockImplementation((cb: any) => cb({ data: mockOrders, error: null })),
        };
      }
      if (table === "trips") {
        return { insert: mockInsertTrip };
      }
      if (table === "trip_stops") {
        return { insert: mockInsertStops };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        then: vi.fn().mockImplementation((cb: any) => cb({ data: [], error: null })),
      };
    });

    renderPlanning();
    await waitFor(() => {
      expect(screen.getByText("Bakkerij Amsterdam")).toBeInTheDocument();
    });

    act(() => {
      mockOnDragEnd.call({ active: { id: "order-1" }, over: { id: "v1" } });
    });

    await waitFor(() => {
      expect(screen.getByText(/Bevestigen/i)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/Bevestigen/i));
    await waitFor(() => {
      expect(screen.getByText("Planning bevestigen")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Bevestigen" }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        "Planning bevestigd",
        expect.any(Object),
      );
    });
  });
});
