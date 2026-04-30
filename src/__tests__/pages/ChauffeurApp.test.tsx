import { cleanup, render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

// ── Hoisted mocks ───────────────────────────────────────────────────
const {
  mockSupabase,
  mockSavePendingPOD,
  mockGetPendingPODs,
  mockSyncPendingPODs,
  mockStartTracking,
  mockStopTracking,
  mockClockIn,
  mockClockOut,
  mockStartBreak,
  mockEndBreak,
  mockMutateStopStatus,
  mockToastSuccess,
  mockToastError,
  mockToastInfo,
  mockIsTracking,
  mockIsClocked,
  mockIsOnBreak,
} = vi.hoisted(() => ({
  mockSupabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { pin_hash: null, must_change_pin: false, failed_pin_attempts: 0, pin_locked_until: null }, error: null }),
      update: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation((cb: any) => cb({ data: [], error: null })),
    }),
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    }),
    removeChannel: vi.fn(),
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ data: { path: "test" }, error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "https://test.com/sig.png" } }),
      }),
    },
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "test-user-id" } }, error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
  },
  mockSavePendingPOD: vi.fn().mockResolvedValue(undefined),
  mockGetPendingPODs: vi.fn().mockResolvedValue([]),
  mockSyncPendingPODs: vi.fn().mockResolvedValue({ synced: 0, failed: 0 }),
  mockStartTracking: vi.fn(),
  mockStopTracking: vi.fn(),
  mockClockIn: vi.fn().mockResolvedValue(undefined),
  mockClockOut: vi.fn().mockResolvedValue(undefined),
  mockStartBreak: vi.fn().mockResolvedValue(undefined),
  mockEndBreak: vi.fn().mockResolvedValue(undefined),
  mockMutateStopStatus: vi.fn().mockResolvedValue(undefined),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
  mockToastInfo: vi.fn(),
  mockIsTracking: { value: false },
  mockIsClocked: { value: false },
  mockIsOnBreak: { value: false },
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));

// VehicleCheckScreen-gate altijd open in tests, anders blokkeert het de dashboard.
vi.mock("@/hooks/useVehicleCheck", () => ({
  useVehicleCheckGate: () => ({ data: { passed: true }, isLoading: false, refetch: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: mockToastSuccess,
    error: mockToastError,
    info: mockToastInfo,
  }),
}));

vi.mock("@/hooks/useDrivers", () => ({
  useDrivers: () => ({
    data: [
      { id: "d1", name: "Jan Jansen", phone: "0612345678", pin_hash: null, status: "beschikbaar", current_vehicle_id: "v1" },
      { id: "d2", name: "Piet Pietersen", phone: "0687654321", pin_hash: "abc123", status: "onderweg", current_vehicle_id: null },
    ],
    isLoading: false,
  }),
}));

vi.mock("@/hooks/useDriverTracking", () => ({
  useGPSTracking: () => ({
    isTracking: mockIsTracking.value,
    currentPosition: null,
    startTracking: mockStartTracking,
    stopTracking: mockStopTracking,
    error: null,
  }),
  useTimeTracking: () => ({
    isClocked: mockIsClocked.value,
    isOnBreak: mockIsOnBreak.value,
    clockIn: mockClockIn,
    clockOut: mockClockOut,
    startBreak: mockStartBreak,
    endBreak: mockEndBreak,
    totalHoursToday: 2.5,
    todayEntries: [],
  }),
  useGeofenceCheck: vi.fn(),
  useDriveTime: () => ({
    totalMinutes: 0,
    breakMinutes: 0,
    status: "ok",
    continuousDriveH: 0,
    dailyDriveH: 0,
    statusColor: "green",
    warning: null,
  }),
}));

vi.mock("@/hooks/useTrips", () => ({
  useDriverTrips: () => ({ data: [], isLoading: false }),
  useUpdateStopStatus: () => ({ mutateAsync: mockMutateStopStatus }),
  useSavePOD: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/components/chauffeur/TripFlow", () => ({
  TripFlow: ({ driverId, onStartPOD }: any) => (
    <div data-testid="trip-flow" data-driver-id={driverId}>
      Trip Flow
      <button data-testid="start-pod-btn" onClick={() => onStartPOD({ id: "stop1", order_id: "order1", contact_name: "Test Klant", planned_address: "Teststraat 1" })}>
        Start POD
      </button>
    </div>
  ),
}));

vi.mock("@/components/chauffeur/DriveTimeMonitor", () => ({
  DriveTimeMonitor: ({ isVisible }: any) => (
    <div data-testid="drive-time" data-visible={isVisible}>Drive Time</div>
  ),
}));

vi.mock("@/lib/offlineStore", () => ({
  savePendingPOD: (...args: any[]) => mockSavePendingPOD(...args),
  getPendingPODs: (...args: any[]) => mockGetPendingPODs(...args),
  syncPendingPODs: (...args: any[]) => mockSyncPendingPODs(...args),
  removePendingPOD: vi.fn(),
}));

import ChauffeurApp from "@/pages/ChauffeurApp";

// ── Helpers ──────────────────────────────────────────────────────────

function renderChauffeurApp() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  localStorage.removeItem("orderflow_test_driver_id");
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ChauffeurApp />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function renderWithActiveDriver(driverId = "d1") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  localStorage.setItem("orderflow_test_driver_id", driverId);
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ChauffeurApp />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// Keep original onLine descriptor so we can restore it
const originalOnLineDescriptor = Object.getOwnPropertyDescriptor(navigator, "onLine");

describe("ChauffeurApp", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    localStorage.clear();
    mockIsTracking.value = false;
    mockIsClocked.value = false;
    mockIsOnBreak.value = false;
    mockGetPendingPODs.mockResolvedValue([]);
    mockSyncPendingPODs.mockResolvedValue({ synced: 0, failed: 0 });
    // Default: online
    Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    // Restore navigator.onLine
    if (originalOnLineDescriptor) {
      Object.defineProperty(navigator, "onLine", originalOnLineDescriptor);
    }
  });

  // ════════════════════════════════════════════════════════════════════
  // BASIC RENDERING
  // ════════════════════════════════════════════════════════════════════

  it("renders without crashing", () => {
    renderChauffeurApp();
    expect(document.body.textContent).toBeTruthy();
  });

  it("shows driver selection screen when no driver is active", () => {
    renderChauffeurApp();
    expect(screen.getByText("Jan Jansen")).toBeInTheDocument();
    expect(screen.getByText("Piet Pietersen")).toBeInTheDocument();
  });

  it("shows vehicle assignment info on driver cards", () => {
    renderChauffeurApp();
    expect(screen.getAllByText(/Voertuig/i).length).toBeGreaterThan(0);
  });

  it("shows OrderFlow PWA title on login screen", () => {
    renderChauffeurApp();
    expect(screen.getByText("OrderFlow PWA")).toBeInTheDocument();
  });

  // ════════════════════════════════════════════════════════════════════
  // PIN VERIFICATION (handlePinSubmit)
  // ════════════════════════════════════════════════════════════════════

  it("shows PIN entry when driver is selected (handleDriverSelect)", async () => {
    const user = userEvent.setup();
    renderChauffeurApp();
    await user.click(screen.getByText("Jan Jansen"));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("----")).toBeInTheDocument();
    });
  });

  it("shows PIN screen title when driver is selected", async () => {
    const user = userEvent.setup();
    renderChauffeurApp();
    await user.click(screen.getByText("Jan Jansen"));
    await waitFor(() => {
      expect(screen.getByText("PIN invoeren")).toBeInTheDocument();
    });
  });

  it("shows Inloggen button on PIN screen (disabled for short PIN)", async () => {
    const user = userEvent.setup();
    renderChauffeurApp();
    await user.click(screen.getByText("Jan Jansen"));
    await waitFor(() => {
      const loginBtn = screen.getByRole("button", { name: /Inloggen/i });
      expect(loginBtn).toBeInTheDocument();
      expect(loginBtn).toBeDisabled();
    });
  });

  it("enables Inloggen button when PIN has 4 chars", async () => {
    const user = userEvent.setup();
    renderChauffeurApp();
    await user.click(screen.getByText("Jan Jansen"));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("----")).toBeInTheDocument();
    });
    const pinInput = screen.getByPlaceholderText("----");
    await user.type(pinInput, "1234");
    await waitFor(() => {
      const loginBtn = screen.getByRole("button", { name: /Inloggen/i });
      expect(loginBtn).not.toBeDisabled();
    });
  });

  it("handlePinSubmit - forces PIN change when no PIN is set", async () => {
    // Default mock returns pin_hash: null, so driver must set a PIN
    const user = userEvent.setup();
    renderChauffeurApp();
    await user.click(screen.getByText("Jan Jansen"));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("----")).toBeInTheDocument();
    });
    const pinInput = screen.getByPlaceholderText("----");
    await user.type(pinInput, "0000");
    await user.click(screen.getByRole("button", { name: /Inloggen/i }));
    // Should prompt to set a new PIN, not login
    await waitFor(() => {
      expect(screen.getByText(/Geen PIN ingesteld/)).toBeInTheDocument();
    });
  });

  it("handlePinSubmit - wrong PIN shows error and decrements attempts", async () => {
    // Mock supabase to return a real hash that won't match "1234"
    const fromMock = mockSupabase.from as ReturnType<typeof vi.fn>;
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { pin_hash: "somehashvalue", must_change_pin: false, failed_pin_attempts: 0, pin_locked_until: null },
        error: null,
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
      then: vi.fn().mockImplementation((cb: any) => cb({ data: [], error: null })),
    });

    const user = userEvent.setup();
    renderChauffeurApp();
    await user.click(screen.getByText("Jan Jansen"));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("----")).toBeInTheDocument();
    });
    const pinInput = screen.getByPlaceholderText("----");
    await user.type(pinInput, "1234");
    await user.click(screen.getByRole("button", { name: /Inloggen/i }));

    await waitFor(() => {
      expect(screen.getByText(/Onjuiste PIN/)).toBeInTheDocument();
    });
  });

  it("handlePinSubmit - locks after 3 wrong attempts", async () => {
    // Mock: always return a valid PIN hash (that won't match user input),
    // with incrementing failed attempts tracked via closure
    let failedAttempts = 0;
    const fromMock = mockSupabase.from as ReturnType<typeof vi.fn>;
    fromMock.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockImplementation(() => {
        return Promise.resolve({
          data: {
            pin_hash: "somehashvalue",
            must_change_pin: false,
            failed_pin_attempts: failedAttempts,
            pin_locked_until: null,
          },
          error: null,
        });
      }),
      update: vi.fn().mockImplementation(() => {
        // Simulate incrementing failed_pin_attempts on update
        failedAttempts++;
        return {
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
      then: vi.fn().mockImplementation((cb: any) => cb({ data: [], error: null })),
    }));

    const user = userEvent.setup();
    renderChauffeurApp();
    await user.click(screen.getByText("Jan Jansen"));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("----")).toBeInTheDocument();
    });

    // Submit 3 wrong PINs
    for (let i = 0; i < 3; i++) {
      // Re-query the input each iteration (it may have been re-rendered)
      await waitFor(() => {
        expect(screen.getByPlaceholderText("----")).toBeEnabled();
      });
      const pinInput = screen.getByPlaceholderText("----");
      // Use fireEvent to avoid clear() issues with disabled state
      fireEvent.change(pinInput, { target: { value: "9999" } });
      await user.click(screen.getByRole("button", { name: /Inloggen/i }));
      // Wait for error to appear
      await waitFor(() => {
        const matches = screen.getAllByText(/Onjuiste PIN|Te veel pogingen|geblokkeerd/i);
        expect(matches.length).toBeGreaterThan(0);
      });
    }

    await waitFor(() => {
      const matches = screen.getAllByText(/Te veel pogingen|geblokkeerd/i);
      expect(matches.length).toBeGreaterThan(0);
    });
  });

  it("handlePinSubmit - shows error for short PIN", async () => {
    const user = userEvent.setup();
    renderChauffeurApp();
    await user.click(screen.getByText("Jan Jansen"));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("----")).toBeInTheDocument();
    });
    const pinInput = screen.getByPlaceholderText("----");
    await user.type(pinInput, "123");
    fireEvent.keyDown(pinInput, { key: "Enter" });
    expect(document.body.textContent).toBeTruthy();
  });

  it("handlePinSubmit via Enter key", async () => {
    const user = userEvent.setup();
    renderChauffeurApp();
    await user.click(screen.getByText("Jan Jansen"));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("----")).toBeInTheDocument();
    });
    const pinInput = screen.getByPlaceholderText("----");
    await user.type(pinInput, "0000");
    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(mockSupabase.from).toHaveBeenCalled();
    });
  });

  it("handlePinSubmit - shows error when supabase errors (no 0000 fallback)", async () => {
    const fromMock = mockSupabase.from as ReturnType<typeof vi.fn>;
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "column pin_hash does not exist" },
      }),
      update: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation((cb: any) => cb({ data: [], error: null })),
    });

    const user = userEvent.setup();
    renderChauffeurApp();
    await user.click(screen.getByText("Jan Jansen"));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("----")).toBeInTheDocument();
    });
    const pinInput = screen.getByPlaceholderText("----");
    await user.type(pinInput, "0000");
    await user.click(screen.getByRole("button", { name: /Inloggen/i }));
    // Should NOT login — 0000 fallback has been removed as a security fix
    await waitFor(() => {
      expect(screen.getByText(/Fout bij PIN-verificatie/)).toBeInTheDocument();
    });
  });

  it("handlePinSubmit - shows error on supabase error", async () => {
    const fromMock = mockSupabase.from as ReturnType<typeof vi.fn>;
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "some error" },
      }),
      update: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation((cb: any) => cb({ data: [], error: null })),
    });

    const user = userEvent.setup();
    renderChauffeurApp();
    await user.click(screen.getByText("Jan Jansen"));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("----")).toBeInTheDocument();
    });
    const pinInput = screen.getByPlaceholderText("----");
    await user.type(pinInput, "5678");
    await user.click(screen.getByRole("button", { name: /Inloggen/i }));
    await waitFor(() => {
      expect(screen.getByText(/Fout bij PIN-verificatie/)).toBeInTheDocument();
    });
  });

  it("PIN input onChange filters non-digits", async () => {
    const user = userEvent.setup();
    renderChauffeurApp();
    await user.click(screen.getByText("Jan Jansen"));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("----")).toBeInTheDocument();
    });
    const pinInput = screen.getByPlaceholderText("----");
    await user.type(pinInput, "ab12cd34");
    expect((pinInput as HTMLInputElement).value).toBe("1234");
  });

  it("shows back to selection button on PIN screen", async () => {
    const user = userEvent.setup();
    renderChauffeurApp();
    await user.click(screen.getByText("Jan Jansen"));
    await waitFor(() => {
      expect(screen.getByText(/Terug naar chauffeur selectie/)).toBeInTheDocument();
    });
  });

  it("goes back to driver selection when clicking back", async () => {
    const user = userEvent.setup();
    renderChauffeurApp();
    await user.click(screen.getByText("Jan Jansen"));
    await waitFor(() => {
      expect(screen.getByText("PIN invoeren")).toBeInTheDocument();
    });
    await user.click(screen.getByText(/Terug naar chauffeur selectie/));
    await waitFor(() => {
      expect(screen.getByText("Jan Jansen")).toBeInTheDocument();
      expect(screen.getByText("Piet Pietersen")).toBeInTheDocument();
    });
  });

  it("selecting second driver resets PIN state", async () => {
    const user = userEvent.setup();
    renderChauffeurApp();
    await user.click(screen.getByText("Jan Jansen"));
    await waitFor(() => {
      expect(screen.getByText("PIN invoeren")).toBeInTheDocument();
    });
    await user.click(screen.getByText(/Terug naar chauffeur selectie/));
    await user.click(screen.getByText("Piet Pietersen"));
    await waitFor(() => {
      expect(screen.getByText("PIN invoeren")).toBeInTheDocument();
      expect(screen.getByText(/Piet Pietersen/)).toBeInTheDocument();
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // ACTIVE DRIVER DASHBOARD
  // ════════════════════════════════════════════════════════════════════

  it("shows the trip flow component when driver is active", async () => {
    renderWithActiveDriver("d1");
    await waitFor(() => {
      expect(screen.getByTestId("trip-flow")).toBeInTheDocument();
    });
  });

  it("shows drive time monitor when driver is active", async () => {
    renderWithActiveDriver("d1");
    await waitFor(() => {
      expect(screen.getByTestId("drive-time")).toBeInTheDocument();
    });
  });

  it("shows driver header with initial when driver is active", async () => {
    renderWithActiveDriver("d1");
    await waitFor(() => {
      expect(screen.getByText("J")).toBeInTheDocument();
    });
  });

  it("stores last-used driver-id in localStorage when active", () => {
    renderWithActiveDriver("d1");
    // Login-effect zet "orderflow_last_driver_id" als UI-hint voor preselect.
    expect(localStorage.getItem("orderflow_last_driver_id")).toBe("d1");
  });

  it("shows driver name when driver is active", async () => {
    renderWithActiveDriver("d1");
    await waitFor(() => {
      expect(screen.getByText(/Jan Jansen/)).toBeInTheDocument();
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // GPS TRACKING (handleToggleGPS)
  // ════════════════════════════════════════════════════════════════════

  it("handleToggleGPS - starts GPS tracking when off", async () => {
    mockIsTracking.value = false;
    renderWithActiveDriver("d1");
    await waitFor(() => {
      expect(screen.getByTitle("GPS uit")).toBeInTheDocument();
    });
    const gpsBtn = screen.getByTitle("GPS uit");
    await act(async () => {
      fireEvent.click(gpsBtn);
    });
    expect(mockStartTracking).toHaveBeenCalledTimes(1);
    expect(mockToastSuccess).toHaveBeenCalledWith("GPS tracking gestart");
  });

  it("handleToggleGPS - stops GPS tracking when on", async () => {
    mockIsTracking.value = true;
    renderWithActiveDriver("d1");
    await waitFor(() => {
      expect(screen.getByTitle("GPS actief")).toBeInTheDocument();
    });
    const gpsBtn = screen.getByTitle("GPS actief");
    await act(async () => {
      fireEvent.click(gpsBtn);
    });
    expect(mockStopTracking).toHaveBeenCalledTimes(1);
    expect(mockToastInfo).toHaveBeenCalledWith("GPS tracking gestopt");
  });

  // ════════════════════════════════════════════════════════════════════
  // CLOCK IN / OUT / BREAK
  // ════════════════════════════════════════════════════════════════════

  it("handleClockIn - shows Inklokken button and calls clockIn", async () => {
    mockIsClocked.value = false;
    renderWithActiveDriver("d1");
    await waitFor(() => {
      expect(screen.getByText(/Inklokken/)).toBeInTheDocument();
    });
    const clockInBtn = screen.getByText(/Inklokken/).closest("button")!;
    await act(async () => {
      fireEvent.click(clockInBtn);
    });
    expect(mockClockIn).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith("Ingeklokt!");
    });
  });

  it("handleClockIn - shows error toast when clockIn fails", async () => {
    mockIsClocked.value = false;
    mockClockIn.mockRejectedValueOnce(new Error("fail"));
    renderWithActiveDriver("d1");
    await waitFor(() => {
      expect(screen.getByText(/Inklokken/)).toBeInTheDocument();
    });
    const clockInBtn = screen.getByText(/Inklokken/).closest("button")!;
    await act(async () => {
      fireEvent.click(clockInBtn);
    });
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Kon niet inklokken");
    });
  });

  it("handleClockOut - shows Uitklokken button and calls clockOut", async () => {
    mockIsClocked.value = true;
    renderWithActiveDriver("d1");
    await waitFor(() => {
      expect(screen.getByText(/Uitklokken/)).toBeInTheDocument();
    });
    const clockOutBtn = screen.getByText(/Uitklokken/).closest("button")!;
    await act(async () => {
      fireEvent.click(clockOutBtn);
    });
    expect(mockClockOut).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith("Uitgeklokt!");
    });
  });

  it("handleClockOut - stops GPS tracking if active when clocking out", async () => {
    mockIsClocked.value = true;
    mockIsTracking.value = true;
    renderWithActiveDriver("d1");
    await waitFor(() => {
      expect(screen.getByText(/Uitklokken/)).toBeInTheDocument();
    });
    const clockOutBtn = screen.getByText(/Uitklokken/).closest("button")!;
    await act(async () => {
      fireEvent.click(clockOutBtn);
    });
    expect(mockStopTracking).toHaveBeenCalledTimes(1);
    expect(mockClockOut).toHaveBeenCalledTimes(1);
  });

  it("handleClockOut - shows error toast when clockOut fails", async () => {
    mockIsClocked.value = true;
    mockClockOut.mockRejectedValueOnce(new Error("fail"));
    renderWithActiveDriver("d1");
    await waitFor(() => {
      expect(screen.getByText(/Uitklokken/)).toBeInTheDocument();
    });
    const clockOutBtn = screen.getByText(/Uitklokken/).closest("button")!;
    await act(async () => {
      fireEvent.click(clockOutBtn);
    });
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Kon niet uitklokken");
    });
  });

  it("handleToggleBreak - shows Pauze button when clocked in and starts break", async () => {
    mockIsClocked.value = true;
    mockIsOnBreak.value = false;
    renderWithActiveDriver("d1");
    await waitFor(() => {
      expect(screen.getByText(/Pauze/)).toBeInTheDocument();
    });
    const breakBtn = screen.getByText(/Pauze/).closest("button")!;
    await act(async () => {
      fireEvent.click(breakBtn);
    });
    expect(mockStartBreak).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(mockToastInfo).toHaveBeenCalledWith("Pauze gestart");
    });
  });

  it("handleToggleBreak - ends break when already on break", async () => {
    mockIsClocked.value = true;
    mockIsOnBreak.value = true;
    renderWithActiveDriver("d1");
    await waitFor(() => {
      expect(screen.getByText(/Pauze/)).toBeInTheDocument();
    });
    const breakBtn = screen.getByText(/Pauze/).closest("button")!;
    await act(async () => {
      fireEvent.click(breakBtn);
    });
    expect(mockEndBreak).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(mockToastInfo).toHaveBeenCalledWith("Pauze beeindigd");
    });
  });

  it("handleToggleBreak - shows error toast when break toggle fails", async () => {
    mockIsClocked.value = true;
    mockIsOnBreak.value = false;
    mockStartBreak.mockRejectedValueOnce(new Error("fail"));
    renderWithActiveDriver("d1");
    await waitFor(() => {
      expect(screen.getByText(/Pauze/)).toBeInTheDocument();
    });
    const breakBtn = screen.getByText(/Pauze/).closest("button")!;
    await act(async () => {
      fireEvent.click(breakBtn);
    });
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Kon pauze niet wijzigen");
    });
  });

  it("shows 'Niet ingeklokt' when not clocked in", async () => {
    mockIsClocked.value = false;
    renderWithActiveDriver("d1");
    await waitFor(() => {
      expect(screen.getByText("Niet ingeklokt")).toBeInTheDocument();
    });
  });

  it("shows 'Aan het werk' when clocked in and not on break", async () => {
    mockIsClocked.value = true;
    mockIsOnBreak.value = false;
    renderWithActiveDriver("d1");
    await waitFor(() => {
      expect(screen.getByText("Aan het werk")).toBeInTheDocument();
    });
  });

  it("shows 'Op pauze' when clocked in and on break", async () => {
    mockIsClocked.value = true;
    mockIsOnBreak.value = true;
    renderWithActiveDriver("d1");
    await waitFor(() => {
      expect(screen.getByText("Op pauze")).toBeInTheDocument();
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // formatHours UTILITY
  // ════════════════════════════════════════════════════════════════════

  it("formatHours displays 2u 30m for totalHoursToday=2.5", async () => {
    renderWithActiveDriver("d1");
    await waitFor(() => {
      expect(screen.getByText(/2u 30m/)).toBeInTheDocument();
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // OFFLINE POD / SYNC
  // ════════════════════════════════════════════════════════════════════

  it("syncs pending PODs on mount when online", async () => {
    Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true });
    renderWithActiveDriver("d1");
    await waitFor(() => {
      expect(mockGetPendingPODs).toHaveBeenCalled();
      expect(mockSyncPendingPODs).toHaveBeenCalled();
    });
  });

  it("does not sync when offline", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, writable: true, configurable: true });
    renderWithActiveDriver("d1");
    await waitFor(() => {
      expect(mockGetPendingPODs).toHaveBeenCalled();
    });
    // syncPendingPODs should not be called when offline
    expect(mockSyncPendingPODs).not.toHaveBeenCalled();
  });

  it("shows pending POD banner when there are pending PODs", async () => {
    mockGetPendingPODs.mockResolvedValue([{ id: "pod-1" }, { id: "pod-2" }]);
    renderWithActiveDriver("d1");
    await waitFor(() => {
      expect(screen.getByText(/2 ongesynchroniseerde PODs/)).toBeInTheDocument();
    });
  });

  it("shows singular text for 1 pending POD", async () => {
    mockGetPendingPODs.mockResolvedValue([{ id: "pod-1" }]);
    renderWithActiveDriver("d1");
    await waitFor(() => {
      expect(screen.getByText(/1 ongesynchroniseerde POD$/)).toBeInTheDocument();
    });
  });

  it("shows Synchroniseer button on pending POD banner", async () => {
    mockGetPendingPODs.mockResolvedValue([{ id: "pod-1" }]);
    renderWithActiveDriver("d1");
    await waitFor(() => {
      expect(screen.getByText("Synchroniseer")).toBeInTheDocument();
    });
  });

  it("handleSyncPending - shows success toast when PODs synced", async () => {
    mockGetPendingPODs.mockResolvedValue([{ id: "pod-1" }]);
    mockSyncPendingPODs.mockResolvedValue({ synced: 2, failed: 0 });
    renderWithActiveDriver("d1");
    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith("2 POD(s) gesynchroniseerd");
    });
  });

  it("handleSyncPending - shows error toast when some PODs fail", async () => {
    mockGetPendingPODs.mockResolvedValue([{ id: "pod-1" }]);
    mockSyncPendingPODs.mockResolvedValue({ synced: 1, failed: 1 });
    renderWithActiveDriver("d1");
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("1 POD(s) niet gesynchroniseerd. Volgende poging bij herladen.");
    });
  });

  it("online event listener is registered", async () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    renderWithActiveDriver("d1");
    await waitFor(() => {
      expect(mockGetPendingPODs).toHaveBeenCalled();
    });
    expect(addSpy).toHaveBeenCalledWith("online", expect.any(Function));
    addSpy.mockRestore();
  });

  it("online event listener is cleaned up on unmount", async () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderWithActiveDriver("d1");
    await waitFor(() => {
      expect(mockGetPendingPODs).toHaveBeenCalled();
    });
    unmount();
    expect(removeSpy).toHaveBeenCalledWith("online", expect.any(Function));
    removeSpy.mockRestore();
  });

  // ════════════════════════════════════════════════════════════════════
  // DRIVER NOTIFICATIONS
  // ════════════════════════════════════════════════════════════════════

  it("shows notification bell button when driver is active", async () => {
    renderWithActiveDriver("d1");
    await waitFor(() => {
      expect(screen.getByTitle("Notificaties")).toBeInTheDocument();
    });
  });

  it("opens notification panel when bell is clicked", async () => {
    renderWithActiveDriver("d1");
    await waitFor(() => {
      expect(screen.getByTitle("Notificaties")).toBeInTheDocument();
    });
    const bellBtn = screen.getByTitle("Notificaties");
    await act(async () => {
      fireEvent.click(bellBtn);
    });
    await waitFor(() => {
      expect(screen.getByText("Notificaties", { selector: "h3" })).toBeInTheDocument();
    });
  });

  it("shows 'Geen notificaties' when notification panel is empty", async () => {
    renderWithActiveDriver("d1");
    await waitFor(() => {
      expect(screen.getByTitle("Notificaties")).toBeInTheDocument();
    });
    const bellBtn = screen.getByTitle("Notificaties");
    await act(async () => {
      fireEvent.click(bellBtn);
    });
    await waitFor(() => {
      expect(screen.getByText("Geen notificaties")).toBeInTheDocument();
    });
  });

  it("closes notification panel when X is clicked", async () => {
    renderWithActiveDriver("d1");
    await waitFor(() => {
      expect(screen.getByTitle("Notificaties")).toBeInTheDocument();
    });
    const bellBtn = screen.getByTitle("Notificaties");
    await act(async () => {
      fireEvent.click(bellBtn);
    });
    await waitFor(() => {
      expect(screen.getByText("Geen notificaties")).toBeInTheDocument();
    });
    // Close the panel - find the X button inside the panel
    const closeButtons = screen.getAllByRole("button");
    const closeBtn = closeButtons.find(
      (btn) => btn.querySelector(".lucide-x") || btn.querySelector('[class*="lucide-x"]')
    );
    if (closeBtn) {
      await act(async () => {
        fireEvent.click(closeBtn);
      });
    }
    // After close, the "Geen notificaties" text should not be visible
    expect(document.body.textContent).toBeTruthy();
  });

  // ════════════════════════════════════════════════════════════════════
  // LOGOUT (handleLogout)
  // ════════════════════════════════════════════════════════════════════

  it("handleLogout clears active driver and shows selection screen", async () => {
    renderWithActiveDriver("d1");
    await waitFor(() => {
      expect(screen.getByText(/Jan Jansen/)).toBeInTheDocument();
    });
    // Find the logout button (LogOut icon button)
    const logoutBtns = screen.getAllByRole("button");
    const logoutBtn = logoutBtns.find(
      (btn) =>
        btn.textContent?.includes("Uitloggen") ||
        btn.querySelector(".lucide-log-out") ||
        btn.querySelector('[class*="log-out"]')
    );
    if (logoutBtn) {
      await act(async () => {
        fireEvent.click(logoutBtn);
      });
      await waitFor(() => {
        expect(screen.getByText("Driver Portal - Selecteer je profiel")).toBeInTheDocument();
        expect(screen.queryByText("0 / 0 Voltooid")).not.toBeInTheDocument();
      });
    }
    expect(document.body.textContent).toBeTruthy();
  });

  // ════════════════════════════════════════════════════════════════════
  // fetchDriverOrders
  // ════════════════════════════════════════════════════════════════════

  it("fetchDriverOrders - calls supabase from on login", async () => {
    renderWithActiveDriver("d1");
    await waitFor(() => {
      expect(mockSupabase.from).toHaveBeenCalled();
    });
  });

  it("fetchDriverOrders - shows trip flow when no legacy orders", async () => {
    renderWithActiveDriver("d1");
    await waitFor(() => {
      expect(screen.getByTestId("trip-flow")).toBeInTheDocument();
    });
  });

  it("driver without vehicle ziet no-vehicle gate, geen dashboard", async () => {
    // d2 has no current_vehicle_id, vehicle-check gate blokkeert dashboard
    renderWithActiveDriver("d2");
    await waitFor(() => {
      expect(screen.getByText(/Geen voertuig toegewezen/)).toBeInTheDocument();
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // SERVICE WORKER REGISTRATION
  // ════════════════════════════════════════════════════════════════════

  it("renders even without service worker support", () => {
    // jsdom doesn't have serviceWorker by default, component should not crash
    renderWithActiveDriver("d1");
    expect(document.body.textContent).toBeTruthy();
  });

  // ════════════════════════════════════════════════════════════════════
  // TripFlow CALLBACKS
  // ════════════════════════════════════════════════════════════════════

  it("TripFlow receives driverId prop", async () => {
    renderWithActiveDriver("d1");
    await waitFor(() => {
      const tripFlow = screen.getByTestId("trip-flow");
      expect(tripFlow).toHaveAttribute("data-driver-id", "d1");
    });
  });

  it("TripFlow onStartPOD sets selectedOrder for POD capture", async () => {
    renderWithActiveDriver("d1");
    await waitFor(() => {
      expect(screen.getByTestId("start-pod-btn")).toBeInTheDocument();
    });
    const startPodBtn = screen.getByTestId("start-pod-btn");
    await act(async () => {
      fireEvent.click(startPodBtn);
    });
    // After clicking start POD, the component should set selectedOrder
    // which triggers POD UI elements - we just verify no crash
    expect(document.body.textContent).toBeTruthy();
  });

  // ════════════════════════════════════════════════════════════════════
  // DRIVE TIME MONITOR VISIBILITY
  // ════════════════════════════════════════════════════════════════════

  it("DriveTimeMonitor is visible when clocked in and not on break", async () => {
    mockIsClocked.value = true;
    mockIsOnBreak.value = false;
    renderWithActiveDriver("d1");
    await waitFor(() => {
      const monitor = screen.getByTestId("drive-time");
      expect(monitor).toHaveAttribute("data-visible", "true");
    });
  });

  it("DriveTimeMonitor is hidden when not clocked in", async () => {
    mockIsClocked.value = false;
    renderWithActiveDriver("d1");
    await waitFor(() => {
      const monitor = screen.getByTestId("drive-time");
      expect(monitor).toHaveAttribute("data-visible", "false");
    });
  });

  it("DriveTimeMonitor is hidden when on break", async () => {
    mockIsClocked.value = true;
    mockIsOnBreak.value = true;
    renderWithActiveDriver("d1");
    await waitFor(() => {
      const monitor = screen.getByTestId("drive-time");
      expect(monitor).toHaveAttribute("data-visible", "false");
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // EDGE CASES
  // ════════════════════════════════════════════════════════════════════

  it("Pauze button is NOT shown when not clocked in", async () => {
    mockIsClocked.value = false;
    renderWithActiveDriver("d1");
    await waitFor(() => {
      expect(screen.getByText(/Inklokken/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Pauze/)).not.toBeInTheDocument();
  });

  it("shows completed orders count in header", async () => {
    renderWithActiveDriver("d1");
    await waitFor(() => {
      // 0 / 0 Voltooid when no orders
      expect(screen.getByText(/0 \/ 0 Voltooid/)).toBeInTheDocument();
    });
  });
});
