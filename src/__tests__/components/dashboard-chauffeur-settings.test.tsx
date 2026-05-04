import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

// ─── Global Mocks ────────────────────────────────────────────
const mockSupabaseChain: any = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
  single: vi.fn().mockResolvedValue({ data: { tenant_id: "t1" }, error: null }),
  in: vi.fn(),
  gte: vi.fn(),
  lt: vi.fn(),
  not: vi.fn(),
  then: vi.fn().mockImplementation((cb: any) => Promise.resolve(cb({ data: [], error: null }))),
};
// All chain methods return the chain itself
for (const key of ["select", "insert", "update", "delete", "eq", "order", "limit", "in", "gte", "lt", "not"]) {
  mockSupabaseChain[key].mockReturnValue(mockSupabaseChain);
}

afterEach(() => cleanup());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
    },
    from: vi.fn().mockReturnValue(mockSupabaseChain),
    channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }) }),
    removeChannel: vi.fn(),
  },
}));

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({ tenant: { id: "t1", name: "Test" }, loading: false }),
  useTenantOptional: () => ({ tenant: { id: "t1" } }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => children,
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

vi.mock("@/hooks/useTrips", () => ({
  useDriverTrips: () => ({ data: [], isLoading: false }),
  useUpdateTripStatus: () => ({ mutateAsync: vi.fn() }),
  useUpdateStopStatus: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/hooks/useBillingStatus", () => ({
  checkTripCompletion: vi.fn(),
}));

vi.mock("@/data/mockData", () => ({}));

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

// ═══════════════════════════════════════════════════════════════
// FinancialKPIWidget
// ═══════════════════════════════════════════════════════════════
describe("FinancialKPIWidget", () => {
  const mockOrders = [
    { status: "IN_TRANSIT", totalWeight: 1000 },
    { status: "IN_TRANSIT", totalWeight: 2000 },
    { status: "DELIVERED", totalWeight: 500 },
  ];
  const mockVehicles = [
    { capacityKg: 5000 },
    { capacityKg: 10000 },
  ];

  it("renders heading", async () => {
    const { FinancialKPIWidget } = await import("@/components/dashboard/FinancialKPIWidget");
    render(<Wrapper><FinancialKPIWidget orders={mockOrders as any} vehicles={mockVehicles as any} /></Wrapper>);
    expect(screen.getByText("Financieel")).toBeInTheDocument();
  });

  it("shows estimated revenue", async () => {
    const { FinancialKPIWidget } = await import("@/components/dashboard/FinancialKPIWidget");
    render(<Wrapper><FinancialKPIWidget orders={mockOrders as any} vehicles={mockVehicles as any} /></Wrapper>);
    // 2 in-transit trips * 485 = 970
    expect(screen.getByText("Geraamde Omzet")).toBeInTheDocument();
  });

  it("shows cost per km", async () => {
    const { FinancialKPIWidget } = await import("@/components/dashboard/FinancialKPIWidget");
    render(<Wrapper><FinancialKPIWidget orders={mockOrders as any} vehicles={mockVehicles as any} /></Wrapper>);
    expect(screen.getByText("Kosten per KM")).toBeInTheDocument();
  });

  it("shows beladingsgraad", async () => {
    const { FinancialKPIWidget } = await import("@/components/dashboard/FinancialKPIWidget");
    render(<Wrapper><FinancialKPIWidget orders={mockOrders as any} vehicles={mockVehicles as any} /></Wrapper>);
    expect(screen.getByText("Beladingsgraad")).toBeInTheDocument();
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  it("handles zero capacity", async () => {
    const { FinancialKPIWidget } = await import("@/components/dashboard/FinancialKPIWidget");
    render(<Wrapper><FinancialKPIWidget orders={[]} vehicles={[]} /></Wrapper>);
    expect(screen.getByText("0%")).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════
// OperationalForecastWidget
// ═══════════════════════════════════════════════════════════════
describe("OperationalForecastWidget", () => {
  const mockVehicles = [{ id: "v1" }, { id: "v2" }, { id: "v3" }];
  const mockOrders = [
    { status: "IN_TRANSIT", totalWeight: 1000, items: [1, 2] },
    { status: "PLANNED", totalWeight: 2000, items: [3] },
    { status: "DELIVERED", totalWeight: 500, items: [4] },
  ];

  it("renders heading", async () => {
    const { OperationalForecastWidget } = await import("@/components/dashboard/OperationalForecastWidget");
    render(<Wrapper><OperationalForecastWidget vehicles={mockVehicles as any} orders={mockOrders as any} /></Wrapper>);
    expect(screen.getByText("Operationeel")).toBeInTheDocument();
  });

  it("shows capacity stats", async () => {
    const { OperationalForecastWidget } = await import("@/components/dashboard/OperationalForecastWidget");
    render(<Wrapper><OperationalForecastWidget vehicles={mockVehicles as any} orders={mockOrders as any} /></Wrapper>);
    expect(screen.getByText("Capaciteit")).toBeInTheDocument();
    expect(screen.getByText("Vrij")).toBeInTheDocument();
    expect(screen.getByText("Gepland")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("shows total weight", async () => {
    const { OperationalForecastWidget } = await import("@/components/dashboard/OperationalForecastWidget");
    render(<Wrapper><OperationalForecastWidget vehicles={mockVehicles as any} orders={mockOrders as any} /></Wrapper>);
    expect(screen.getByText("Totaal gewicht actief")).toBeInTheDocument();
    expect(screen.getByText(/0 kg/)).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════
// DriveTimeMonitor
// ═══════════════════════════════════════════════════════════════
describe("DriveTimeMonitor", () => {
  it("returns null when not visible", async () => {
    const { DriveTimeMonitor } = await import("@/components/chauffeur/DriveTimeMonitor");
    const { container } = render(
      <DriveTimeMonitor continuousDriveH={2} dailyDriveH={5} statusColor="green" warning={null} isVisible={false} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders drive times when visible", async () => {
    const { DriveTimeMonitor } = await import("@/components/chauffeur/DriveTimeMonitor");
    render(
      <DriveTimeMonitor continuousDriveH={2.5} dailyDriveH={6} statusColor="green" warning={null} isVisible={true} />,
    );
    expect(screen.getByText("Rijtijd (EU 561/2006)")).toBeInTheDocument();
    expect(screen.getByText("Aaneengesloten")).toBeInTheDocument();
    expect(screen.getByText("2:30 / 4:30")).toBeInTheDocument();
    expect(screen.getByText("Vandaag totaal")).toBeInTheDocument();
    expect(screen.getByText("6:00 / 9:00")).toBeInTheDocument();
  });

  it("shows warning when provided", async () => {
    const { DriveTimeMonitor } = await import("@/components/chauffeur/DriveTimeMonitor");
    render(
      <DriveTimeMonitor continuousDriveH={4} dailyDriveH={8.5} statusColor="orange" warning="Pauze nodig!" isVisible={true} />,
    );
    expect(screen.getByText("Pauze nodig!")).toBeInTheDocument();
  });

  it("applies correct color scheme for red", async () => {
    const { DriveTimeMonitor } = await import("@/components/chauffeur/DriveTimeMonitor");
    const { container } = render(
      <DriveTimeMonitor continuousDriveH={4.5} dailyDriveH={9} statusColor="red" warning="Stop!" isVisible={true} />,
    );
    expect(container.querySelector(".bg-red-50")).toBeInTheDocument();
  });

  it("applies correct color scheme for green", async () => {
    const { DriveTimeMonitor } = await import("@/components/chauffeur/DriveTimeMonitor");
    const { container } = render(
      <DriveTimeMonitor continuousDriveH={1} dailyDriveH={3} statusColor="green" warning={null} isVisible={true} />,
    );
    expect(container.querySelector(".bg-emerald-50")).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════
// TripFlow
// ═══════════════════════════════════════════════════════════════
describe("TripFlow", () => {
  it("shows empty state when no trips", async () => {
    const { TripFlow } = await import("@/components/chauffeur/TripFlow");
    render(<Wrapper><TripFlow driverId="d1" onStartPOD={vi.fn()} /></Wrapper>);
    expect(screen.getByText("Geen ritten")).toBeInTheDocument();
    expect(screen.getByText(/momenteel geen ritten/)).toBeInTheDocument();
  });

  it("shows loading state when loading", async () => {
    vi.doMock("@/hooks/useTrips", () => ({
      useDriverTrips: () => ({ data: [], isLoading: true }),
      useUpdateTripStatus: () => ({ mutateAsync: vi.fn() }),
      useUpdateStopStatus: () => ({ mutateAsync: vi.fn() }),
    }));
    vi.resetModules();
    const { TripFlow } = await import("@/components/chauffeur/TripFlow");
    render(<Wrapper><TripFlow driverId="d1" onStartPOD={vi.fn()} /></Wrapper>);
    expect(screen.getByText("Ritten laden...")).toBeInTheDocument();
    // Restore
    vi.doMock("@/hooks/useTrips", () => ({
      useDriverTrips: () => ({ data: [], isLoading: false }),
      useUpdateTripStatus: () => ({ mutateAsync: vi.fn() }),
      useUpdateStopStatus: () => ({ mutateAsync: vi.fn() }),
    }));
    vi.resetModules();
  });

  it("renders trip list with accept/refuse buttons for VERZONDEN trip", async () => {
    const mockMutateTrip = vi.fn().mockResolvedValue({});
    vi.doMock("@/hooks/useTrips", () => ({
      useDriverTrips: () => ({
        data: [{
          id: "trip1",
          dispatch_status: "VERZONDEN",
          planned_date: "2026-04-03",
          trip_stops: [{ id: "s1", stop_sequence: 1, stop_status: "GEPLAND", stop_type: "DELIVERY", planned_address: "Amsterdam", contact_name: null, contact_phone: null, instructions: null }],
        }],
        isLoading: false,
      }),
      useUpdateTripStatus: () => ({ mutateAsync: mockMutateTrip }),
      useUpdateStopStatus: () => ({ mutateAsync: vi.fn() }),
    }));
    vi.resetModules();
    const { TripFlow } = await import("@/components/chauffeur/TripFlow");
    render(<Wrapper><TripFlow driverId="d1" onStartPOD={vi.fn()} /></Wrapper>);
    expect(screen.getByText("Accepteren")).toBeInTheDocument();
    expect(screen.getByText("Weigeren")).toBeInTheDocument();
    expect(screen.getByText("1 stops")).toBeInTheDocument();

    // Select the trip first so handleAccept is in scope, then test accept from detail view
    const tripButton = screen.getByText("1 stops").closest("button")!;
    fireEvent.click(tripButton);
    // In detail view, accept/refuse should also be visible for VERZONDEN
    fireEvent.click(screen.getByText("Accepteren"));
    expect(mockMutateTrip).toHaveBeenCalledWith({ tripId: "trip1", status: "GEACCEPTEERD" });

    // Restore
    vi.doMock("@/hooks/useTrips", () => ({
      useDriverTrips: () => ({ data: [], isLoading: false }),
      useUpdateTripStatus: () => ({ mutateAsync: vi.fn() }),
      useUpdateStopStatus: () => ({ mutateAsync: vi.fn() }),
    }));
    vi.resetModules();
  });

  it("selects a trip on click and shows back button", async () => {
    vi.doMock("@/hooks/useTrips", () => ({
      useDriverTrips: () => ({
        data: [{
          id: "trip2",
          dispatch_status: "GEACCEPTEERD",
          planned_date: "2026-04-03",
          trip_stops: [
            { id: "s1", stop_sequence: 1, stop_status: "GEPLAND", stop_type: "DELIVERY", planned_address: "Rotterdam", contact_name: null, contact_phone: null, instructions: null },
          ],
        }],
        isLoading: false,
      }),
      useUpdateTripStatus: () => ({ mutateAsync: vi.fn().mockResolvedValue({}) }),
      useUpdateStopStatus: () => ({ mutateAsync: vi.fn().mockResolvedValue({}) }),
    }));
    vi.resetModules();
    const { TripFlow } = await import("@/components/chauffeur/TripFlow");
    render(<Wrapper><TripFlow driverId="d1" onStartPOD={vi.fn()} /></Wrapper>);
    // Click on trip to select
    const tripButton = screen.getByText("1 stops").closest("button")!;
    fireEvent.click(tripButton);
    // Should now show the trip detail view with back button
    expect(screen.getByText(/Terug/)).toBeInTheDocument();
    expect(screen.getByText("Start Rit")).toBeInTheDocument();

    // Click Start Rit
    fireEvent.click(screen.getByText("Start Rit"));
    // Click back
    fireEvent.click(screen.getByText(/Terug/));

    // Restore
    vi.doMock("@/hooks/useTrips", () => ({
      useDriverTrips: () => ({ data: [], isLoading: false }),
      useUpdateTripStatus: () => ({ mutateAsync: vi.fn() }),
      useUpdateStopStatus: () => ({ mutateAsync: vi.fn() }),
    }));
    vi.resetModules();
  });

  it("shows navigate button and opens google maps for stops", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    vi.doMock("@/hooks/useTrips", () => ({
      useDriverTrips: () => ({
        data: [{
          id: "trip3",
          dispatch_status: "ACTIEF",
          planned_date: "2026-04-03",
          trip_stops: [
            { id: "s1", stop_sequence: 1, stop_status: "ONDERWEG", stop_type: "DELIVERY", planned_address: "Rotterdam Centrum", contact_name: "Jan", contact_phone: "06123", instructions: "Bel bij aankomst" },
          ],
        }],
        isLoading: false,
      }),
      useUpdateTripStatus: () => ({ mutateAsync: vi.fn().mockResolvedValue({}) }),
      useUpdateStopStatus: () => ({ mutateAsync: vi.fn().mockResolvedValue({}) }),
    }));
    vi.resetModules();
    const { TripFlow } = await import("@/components/chauffeur/TripFlow");
    render(<Wrapper><TripFlow driverId="d1" onStartPOD={vi.fn()} /></Wrapper>);
    // Select the trip
    const tripButton = screen.getByText("1 stops").closest("button")!;
    fireEvent.click(tripButton);
    // Navigate button
    fireEvent.click(screen.getByText("Navigeer naar adres"));
    expect(openSpy).toHaveBeenCalledWith(expect.stringContaining("google.com/maps"), "_blank");
    // Ik ben er button
    fireEvent.click(screen.getByText("Ik ben er"));
    openSpy.mockRestore();
    // Restore
    vi.doMock("@/hooks/useTrips", () => ({
      useDriverTrips: () => ({ data: [], isLoading: false }),
      useUpdateTripStatus: () => ({ mutateAsync: vi.fn() }),
      useUpdateStopStatus: () => ({ mutateAsync: vi.fn() }),
    }));
    vi.resetModules();
  });

  it("shows ACTIEF trip with active indicator text", async () => {
    vi.doMock("@/hooks/useTrips", () => ({
      useDriverTrips: () => ({
        data: [{
          id: "tripA",
          dispatch_status: "ACTIEF",
          planned_date: "2026-04-03",
          trip_stops: [{ stop_status: "ONDERWEG" }],
        }],
        isLoading: false,
      }),
      useUpdateTripStatus: () => ({ mutateAsync: vi.fn() }),
      useUpdateStopStatus: () => ({ mutateAsync: vi.fn() }),
    }));
    vi.resetModules();
    const { TripFlow } = await import("@/components/chauffeur/TripFlow");
    render(<Wrapper><TripFlow driverId="d1" onStartPOD={vi.fn()} /></Wrapper>);
    expect(screen.getByText(/Rit is actief/)).toBeInTheDocument();
    // Restore
    vi.doMock("@/hooks/useTrips", () => ({
      useDriverTrips: () => ({ data: [], isLoading: false }),
      useUpdateTripStatus: () => ({ mutateAsync: vi.fn() }),
      useUpdateStopStatus: () => ({ mutateAsync: vi.fn() }),
    }));
    vi.resetModules();
  });

  it("handles refuse action from detail view", async () => {
    const mockMutateTrip = vi.fn().mockResolvedValue({});
    vi.doMock("@/hooks/useTrips", () => ({
      useDriverTrips: () => ({
        data: [{
          id: "trip-ref",
          dispatch_status: "ONTVANGEN",
          planned_date: "2026-04-03",
          trip_stops: [{ id: "s1", stop_sequence: 1, stop_status: "GEPLAND", stop_type: "DELIVERY", planned_address: "Utrecht", contact_name: null, contact_phone: null, instructions: null }],
        }],
        isLoading: false,
      }),
      useUpdateTripStatus: () => ({ mutateAsync: mockMutateTrip }),
      useUpdateStopStatus: () => ({ mutateAsync: vi.fn() }),
    }));
    vi.resetModules();
    const { TripFlow } = await import("@/components/chauffeur/TripFlow");
    render(<Wrapper><TripFlow driverId="d1" onStartPOD={vi.fn()} /></Wrapper>);
    // Select trip first to get to detail view where handleRefuse is in scope
    const tripButton = screen.getByText("1 stops").closest("button")!;
    fireEvent.click(tripButton);
    fireEvent.click(screen.getByText("Weigeren"));
    expect(mockMutateTrip).toHaveBeenCalledWith({ tripId: "trip-ref", status: "GEWEIGERD" });
    // Restore
    vi.doMock("@/hooks/useTrips", () => ({
      useDriverTrips: () => ({ data: [], isLoading: false }),
      useUpdateTripStatus: () => ({ mutateAsync: vi.fn() }),
      useUpdateStopStatus: () => ({ mutateAsync: vi.fn() }),
    }));
    vi.resetModules();
  });

  it("calls onStartPOD for LOSSEN stop via handleCompleteStop", async () => {
    const onStartPOD = vi.fn();
    const lossenStop = { id: "s-lossen", stop_sequence: 1, stop_status: "LOSSEN", stop_type: "DELIVERY", planned_address: "Den Haag", contact_name: null, contact_phone: null, instructions: null };
    vi.doMock("@/hooks/useTrips", () => ({
      useDriverTrips: () => ({
        data: [{
          id: "trip-pod",
          dispatch_status: "ACTIEF",
          planned_date: "2026-04-03",
          trip_stops: [lossenStop],
        }],
        isLoading: false,
      }),
      useUpdateTripStatus: () => ({ mutateAsync: vi.fn().mockResolvedValue({}) }),
      useUpdateStopStatus: () => ({ mutateAsync: vi.fn().mockResolvedValue({}) }),
    }));
    vi.resetModules();
    const { TripFlow } = await import("@/components/chauffeur/TripFlow");
    render(<Wrapper><TripFlow driverId="d1" onStartPOD={onStartPOD} /></Wrapper>);
    // Select trip
    const tripBtn = screen.getByText("1 stops").closest("button")!;
    fireEvent.click(tripBtn);
    // Click "Aflevering voltooien"
    fireEvent.click(screen.getByText("Aflevering voltooien"));
    expect(onStartPOD).toHaveBeenCalledWith(expect.objectContaining({ id: "s-lossen" }));
    // Restore
    vi.doMock("@/hooks/useTrips", () => ({
      useDriverTrips: () => ({ data: [], isLoading: false }),
      useUpdateTripStatus: () => ({ mutateAsync: vi.fn() }),
      useUpdateStopStatus: () => ({ mutateAsync: vi.fn() }),
    }));
    vi.resetModules();
  });
});

// ═══════════════════════════════════════════════════════════════
// MasterDataSection
// ═══════════════════════════════════════════════════════════════
describe("MasterDataSection", () => {
  it("renders section headings", async () => {
    const { MasterDataSection } = await import("@/components/settings/MasterDataSection");
    render(<Wrapper><MasterDataSection /></Wrapper>);
    expect(screen.queryByText("Voertuigtypes")).not.toBeInTheDocument();
    expect(screen.getByText("Ladingeenheden")).toBeInTheDocument();
    expect(screen.getByText("Transportvereisten")).toBeInTheDocument();
  });

  it("renders info box", async () => {
    const { MasterDataSection } = await import("@/components/settings/MasterDataSection");
    render(<Wrapper><MasterDataSection /></Wrapper>);
    expect(screen.getByText("Over stamgegevens")).toBeInTheDocument();
    expect(screen.getByText(/fundament van je TMS/)).toBeInTheDocument();
  });

  it("shows add buttons for each section", async () => {
    const { MasterDataSection } = await import("@/components/settings/MasterDataSection");
    render(<Wrapper><MasterDataSection /></Wrapper>);
    const addButtons = screen.getAllByText("Toevoegen");
    expect(addButtons.length).toBeGreaterThanOrEqual(2);
  });

  it("shows loading state while data is fetched", async () => {
    const { MasterDataSection } = await import("@/components/settings/MasterDataSection");
    render(<Wrapper><MasterDataSection /></Wrapper>);
    const loadingElements = screen.getAllByText("Laden...");
    expect(loadingElements.length).toBeGreaterThanOrEqual(1);
  });

  it("opens loading units dialog when first Toevoegen is clicked", async () => {
    const { MasterDataSection } = await import("@/components/settings/MasterDataSection");
    render(<Wrapper><MasterDataSection /></Wrapper>);
    await waitFor(() => {
      expect(screen.getAllByText("Toevoegen").length).toBeGreaterThanOrEqual(2);
    });
    fireEvent.click(screen.getAllByText("Toevoegen")[0]);
    await waitFor(() => {
      expect(screen.getByText("Nieuwe ladingeenheid")).toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText("Europallet...")).toBeInTheDocument();
  });

  it("opens requirement types dialog when second Toevoegen is clicked", async () => {
    const { MasterDataSection } = await import("@/components/settings/MasterDataSection");
    render(<Wrapper><MasterDataSection /></Wrapper>);
    await waitFor(() => {
      expect(screen.getAllByText("Toevoegen").length).toBeGreaterThanOrEqual(2);
    });
    fireEvent.click(screen.getAllByText("Toevoegen")[1]);
    await waitFor(() => {
      expect(screen.getByText("Nieuwe transportvereiste")).toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText("ADR...")).toBeInTheDocument();
  });

  it("uses address autocomplete when adding a warehouse", async () => {
    const { MasterDataSection } = await import("@/components/settings/MasterDataSection");
    render(<Wrapper><MasterDataSection /></Wrapper>);
    await waitFor(() => {
      expect(screen.getAllByText("Toevoegen").length).toBeGreaterThanOrEqual(3);
    });
    fireEvent.click(screen.getAllByText("Toevoegen")[2]);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Typ bedrijfsnaam, straat of plaats")).toBeInTheDocument();
    });
  });

  it("cancels loading units dialog with Annuleren button", async () => {
    const { MasterDataSection } = await import("@/components/settings/MasterDataSection");
    render(<Wrapper><MasterDataSection /></Wrapper>);
    await waitFor(() => {
      expect(screen.getAllByText("Toevoegen").length).toBeGreaterThanOrEqual(2);
    });
    fireEvent.click(screen.getAllByText("Toevoegen")[0]);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Europallet...")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Annuleren"));
    await waitFor(() => {
      expect(screen.queryByPlaceholderText("Europallet...")).not.toBeInTheDocument();
    });
  });

  it("fills in loading unit dialog fields and enables Opslaan", async () => {
    const { MasterDataSection } = await import("@/components/settings/MasterDataSection");
    render(<Wrapper><MasterDataSection /></Wrapper>);
    await waitFor(() => {
      expect(screen.getAllByText("Toevoegen").length).toBeGreaterThanOrEqual(2);
    });
    fireEvent.click(screen.getAllByText("Toevoegen")[0]);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Europallet...")).toBeInTheDocument();
    });
    const nameInput = screen.getByPlaceholderText("Europallet...");
    const codeInput = screen.getByPlaceholderText("europallet");
    const weightInput = screen.getByPlaceholderText("750");
    const dimInput = screen.getByPlaceholderText("120x80x144 cm");
    fireEvent.change(nameInput, { target: { value: "Rolcontainer" } });
    fireEvent.change(codeInput, { target: { value: "rolcontainer" } });
    fireEvent.change(weightInput, { target: { value: "200" } });
    fireEvent.change(dimInput, { target: { value: "80x67x175 cm" } });
    expect(nameInput).toHaveValue("Rolcontainer");
    const saveButton = screen.getByRole("button", { name: /Opslaan/ });
    expect(saveButton).not.toBeDisabled();
  });

  it("fills in requirement type dialog fields and enables Opslaan", async () => {
    const { MasterDataSection } = await import("@/components/settings/MasterDataSection");
    render(<Wrapper><MasterDataSection /></Wrapper>);
    await waitFor(() => {
      expect(screen.getAllByText("Toevoegen").length).toBeGreaterThanOrEqual(2);
    });
    fireEvent.click(screen.getAllByText("Toevoegen")[1]);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("ADR...")).toBeInTheDocument();
    });
    const nameInput = screen.getByPlaceholderText("ADR...");
    const codeInput = screen.getByPlaceholderText("adr");
    const colorInput = screen.getByPlaceholderText("#6b7280");
    fireEvent.change(nameInput, { target: { value: "Koeling" } });
    fireEvent.change(codeInput, { target: { value: "koeling" } });
    fireEvent.change(colorInput, { target: { value: "#0000ff" } });
    expect(nameInput).toHaveValue("Koeling");
    const saveButton = screen.getByRole("button", { name: /Opslaan/ });
    expect(saveButton).not.toBeDisabled();
  });

  it("renderLoading function produces loading UI", async () => {
    const { MasterDataSection } = await import("@/components/settings/MasterDataSection");
    render(<Wrapper><MasterDataSection /></Wrapper>);
    const loadingElements = screen.getAllByText("Laden...");
    expect(loadingElements.length).toBeGreaterThanOrEqual(1);
  });
});
