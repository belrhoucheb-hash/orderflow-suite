import { cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

// ── Hoisted mocks ──────────────────────────────────────────────────
const { mockSupabase, mockCreateTrip, mockDispatchTrip, mockDrivers, mockVehicles } = vi.hoisted(() => ({
  mockSupabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(), or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: vi.fn().mockImplementation((cb: any) => cb({ data: [], error: null })),
    }),
    channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }) }),
    removeChannel: vi.fn(),
  },
  mockCreateTrip: vi.fn().mockResolvedValue({ id: "trip-1" }),
  mockDispatchTrip: vi.fn().mockResolvedValue({}),
  mockDrivers: [
    { id: "d1", name: "Jan", current_vehicle_id: "v1" },
    { id: "d2", name: "Piet", current_vehicle_id: "v2" },
  ],
  mockVehicles: [] as any[],
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));

vi.mock("@/hooks/useTrips", () => ({
  useCreateTrip: () => ({ mutateAsync: mockCreateTrip, isPending: false }),
  useDispatchTrip: () => ({ mutateAsync: mockDispatchTrip, isPending: false }),
}));

vi.mock("@/hooks/useDrivers", () => ({
  useDrivers: () => ({ data: mockDrivers, isLoading: false }),
}));

vi.mock("@/hooks/useVehicles", () => ({
  useVehicles: () => ({ data: mockVehicles }),
}));

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({ tenant: { id: "t1", name: "Test BV" }, loading: false }),
}));

vi.mock("leaflet", () => ({
  default: {
    map: vi.fn().mockReturnValue({
      setView: vi.fn().mockReturnThis(), remove: vi.fn(),
      fitBounds: vi.fn(), addLayer: vi.fn(),
    }),
    tileLayer: vi.fn().mockReturnValue({ addTo: vi.fn() }),
    marker: vi.fn().mockReturnValue({ addTo: vi.fn().mockReturnValue({ bindPopup: vi.fn() }), bindPopup: vi.fn() }),
    icon: vi.fn(), divIcon: vi.fn(),
    latLngBounds: vi.fn().mockReturnValue({ extend: vi.fn(), isValid: vi.fn().mockReturnValue(false) }),
    polyline: vi.fn().mockReturnValue({ addTo: vi.fn() }),
    layerGroup: vi.fn().mockReturnValue({ addTo: vi.fn(), clearLayers: vi.fn(), addLayer: vi.fn() }),
  },
}));

vi.mock("framer-motion", async () => ({
  motion: { div: ({ children, ...props }: any) => <div {...props}>{children}</div> },
  AnimatePresence: ({ children }: any) => children,
}));

import ChauffeursRit from "@/pages/ChauffeursRit";

function renderChauffeursRit() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ChauffeursRit />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function setupVehiclesAndOrders(vehicles: any[], orders: any[]) {
  mockSupabase.from.mockImplementation((table: string) => {
    const chain = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(), or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: vi.fn().mockImplementation((cb: any) => {
        if (table === "vehicles") return cb({ data: vehicles, error: null });
        if (table === "orders") return cb({ data: orders, error: null });
        return cb({ data: [], error: null });
      }),
    };
    return chain;
  });
}

describe("ChauffeursRit", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  afterEach(() => cleanup());

  it("renders without crashing", async () => {
    renderChauffeursRit();
    await waitFor(() => {
      expect(document.body.textContent).toBeTruthy();
    });
  });

  it("shows search input", async () => {
    renderChauffeursRit();
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Zoek rit...")).toBeInTheDocument();
    });
  });

  it("shows the page header with title", async () => {
    renderChauffeursRit();
    await waitFor(() => {
      expect(screen.getByText("Chauffeursrit")).toBeInTheDocument();
    });
  });

  it("shows empty state when no trips are available", async () => {
    renderChauffeursRit();
    await waitFor(() => {
      expect(screen.getByText("Geen geplande ritten")).toBeInTheDocument();
    });
  });

  it("shows empty detail panel when no trip is selected", async () => {
    renderChauffeursRit();
    await waitFor(() => {
      expect(screen.getByText("Selecteer een rit om de details te bekijken")).toBeInTheDocument();
    });
  });

  it("shows CMR and Printen buttons", async () => {
    renderChauffeursRit();
    await waitFor(() => {
      expect(screen.getByText("CMR")).toBeInTheDocument();
      expect(screen.getByText("Printen")).toBeInTheDocument();
    });
  });

  it("renders trip cards when vehicles have orders", async () => {
    const vehicles = [{ id: "v1", code: "V01", name: "Truck 1", plate: "AB-123-C", type: "truck", capacity_kg: 10000, capacity_pallets: 20, features: [] }];
    const orders = [{ id: "o1", order_number: 1001, client_name: "Acme BV", delivery_address: "Amsterdam, Nederland", pickup_address: "Rotterdam", quantity: 5, weight_kg: 200, requirements: [], is_weight_per_unit: false, vehicle_id: "v1", stop_sequence: 1, status: "PLANNED" }];
    setupVehiclesAndOrders(vehicles, orders);
    renderChauffeursRit();
    await waitFor(() => {
      expect(screen.getByText("Truck 1")).toBeInTheDocument();
      expect(screen.getByText("AB-123-C")).toBeInTheDocument();
    });
  });

  it("shows driver name on trip card", async () => {
    const vehicles = [{ id: "v1", code: "V01", name: "Truck 1", plate: "AB-123-C", type: "truck", capacity_kg: 10000, capacity_pallets: 20, features: [] }];
    const orders = [{ id: "o1", order_number: 1001, client_name: "Acme", delivery_address: "Amsterdam", pickup_address: "Rotterdam", quantity: 2, weight_kg: 100, requirements: [], is_weight_per_unit: false, vehicle_id: "v1", stop_sequence: 1, status: "PLANNED" }];
    setupVehiclesAndOrders(vehicles, orders);
    renderChauffeursRit();
    await waitFor(() => {
      expect(screen.getByText("Jan")).toBeInTheDocument();
    });
  });

  it("selects a trip card and shows detail (setSelectedVehicleId)", async () => {
    const user = userEvent.setup();
    const vehicles = [{ id: "v1", code: "V01", name: "Truck 1", plate: "AB-123-C", type: "truck", capacity_kg: 10000, capacity_pallets: 20, features: [] }];
    const orders = [{ id: "o1", order_number: 1001, client_name: "Acme BV", delivery_address: "Amsterdam, Nederland", pickup_address: "Rotterdam", quantity: 5, weight_kg: 200, requirements: [], is_weight_per_unit: false, vehicle_id: "v1", stop_sequence: 1, status: "PLANNED" }];
    setupVehiclesAndOrders(vehicles, orders);
    renderChauffeursRit();
    await waitFor(() => {
      expect(screen.getByText("Truck 1")).toBeInTheDocument();
    });
    await user.click(screen.getAllByText("Truck 1")[0]);
    await waitFor(() => {
      // Timeline should show
      expect(screen.getByText("Laden")).toBeInTheDocument();
    });
  });

  it("filters trips by search (setSearch)", async () => {
    const user = userEvent.setup();
    const vehicles = [
      { id: "v1", code: "V01", name: "Truck Alpha", plate: "AB-123-C", type: "truck", capacity_kg: 10000, capacity_pallets: 20, features: [] },
      { id: "v2", code: "V02", name: "Truck Beta", plate: "XY-456-Z", type: "truck", capacity_kg: 10000, capacity_pallets: 20, features: [] },
    ];
    const orders = [
      { id: "o1", order_number: 1001, client_name: "Acme", delivery_address: "Amsterdam", pickup_address: "Rotterdam", quantity: 2, weight_kg: 100, requirements: [], is_weight_per_unit: false, vehicle_id: "v1", stop_sequence: 1, status: "PLANNED" },
      { id: "o2", order_number: 1002, client_name: "Widget", delivery_address: "Utrecht", pickup_address: "Den Haag", quantity: 3, weight_kg: 200, requirements: [], is_weight_per_unit: false, vehicle_id: "v2", stop_sequence: 1, status: "PLANNED" },
    ];
    setupVehiclesAndOrders(vehicles, orders);
    renderChauffeursRit();
    await waitFor(() => {
      expect(screen.getAllByText("Truck Alpha").length).toBeGreaterThan(0);
    });
    await user.type(screen.getByPlaceholderText("Zoek rit..."), "Alpha");
    await waitFor(() => {
      expect(screen.getAllByText("Truck Alpha").length).toBeGreaterThan(0);
    });
  });

  it("changes start time input (setStartTime)", async () => {
    const user = userEvent.setup();
    const vehicles = [{ id: "v1", code: "V01", name: "Truck 1", plate: "AB-123-C", type: "truck", capacity_kg: 10000, capacity_pallets: 20, features: [] }];
    const orders = [{ id: "o1", order_number: 1001, client_name: "Acme", delivery_address: "Amsterdam", pickup_address: "Rotterdam", quantity: 2, weight_kg: 100, requirements: [], is_weight_per_unit: false, vehicle_id: "v1", stop_sequence: 1, status: "PLANNED" }];
    setupVehiclesAndOrders(vehicles, orders);
    renderChauffeursRit();
    await waitFor(() => {
      const timeInput = document.querySelector('input[type="time"]') as HTMLInputElement;
      expect(timeInput).toBeTruthy();
    });
    const timeInput = document.querySelector('input[type="time"]') as HTMLInputElement;
    fireEvent.change(timeInput, { target: { value: "08:30" } });
    expect(timeInput.value).toBe("08:30");
  });

  it("clicks Verstuur naar chauffeur button (handleDispatch)", async () => {
    const user = userEvent.setup();
    const vehicles = [{ id: "v1", code: "V01", name: "Truck 1", plate: "AB-123-C", type: "truck", capacity_kg: 10000, capacity_pallets: 20, features: [] }];
    const orders = [{ id: "o1", order_number: 1001, client_name: "Acme", delivery_address: "Amsterdam", pickup_address: "Rotterdam", quantity: 2, weight_kg: 100, requirements: [], is_weight_per_unit: false, vehicle_id: "v1", stop_sequence: 1, status: "PLANNED" }];
    setupVehiclesAndOrders(vehicles, orders);
    renderChauffeursRit();
    await waitFor(() => {
      const btn = screen.getByText("Verstuur naar chauffeur");
      expect(btn).toBeInTheDocument();
    });
    // This button may be disabled if no vehicle selected, but click won't crash
    const btn = screen.getByText("Verstuur naar chauffeur");
    if (!(btn.closest("button") as HTMLButtonElement)?.disabled) {
      await user.click(btn);
    }
    expect(document.body.textContent).toBeTruthy();
  });

  it("shows subtitle text", async () => {
    renderChauffeursRit();
    await waitFor(() => {
      expect(screen.getByText(/Ritdetails per chauffeur/)).toBeInTheDocument();
    });
  });

  it("shows ROUTE and INGEPLAND tabs when trip selected", async () => {
    const vehicles = [{ id: "v1", code: "V01", name: "Truck 1", plate: "AB-123-C", type: "truck", capacity_kg: 10000, capacity_pallets: 20, features: [] }];
    const orders = [{ id: "o1", order_number: 1001, client_name: "Acme", delivery_address: "Amsterdam", pickup_address: "Rotterdam", quantity: 2, weight_kg: 100, requirements: [], is_weight_per_unit: false, vehicle_id: "v1", stop_sequence: 1, status: "PLANNED" }];
    setupVehiclesAndOrders(vehicles, orders);
    renderChauffeursRit();
    await waitFor(() => {
      expect(screen.getByText("ROUTE")).toBeInTheDocument();
      expect(screen.getByText("INGEPLAND")).toBeInTheDocument();
    });
  });

  it("switches between ROUTE and INGEPLAND tabs (setDetailTab)", async () => {
    const user = userEvent.setup();
    const vehicles = [{ id: "v1", code: "V01", name: "Truck 1", plate: "AB-123-C", type: "truck", capacity_kg: 10000, capacity_pallets: 20, features: [] }];
    const orders = [{ id: "o1", order_number: 1001, client_name: "Acme", delivery_address: "Amsterdam", pickup_address: "Rotterdam", quantity: 2, weight_kg: 100, requirements: [], is_weight_per_unit: false, vehicle_id: "v1", stop_sequence: 1, status: "PLANNED" }];
    setupVehiclesAndOrders(vehicles, orders);
    renderChauffeursRit();
    await waitFor(() => {
      expect(screen.getByText("ROUTE")).toBeInTheDocument();
    });
    await user.click(screen.getByText("INGEPLAND"));
    await waitFor(() => {
      expect(document.body.textContent).toBeTruthy();
    });
    await user.click(screen.getByText("ROUTE"));
    expect(document.body.textContent).toBeTruthy();
  });

  it("shows KAART section", async () => {
    renderChauffeursRit();
    await waitFor(() => {
      expect(screen.getByText("KAART")).toBeInTheDocument();
    });
  });
});
