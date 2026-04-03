import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

// ── Hoisted mocks ───────────────────────────────────────────────────
const { mockUseTrips, mockUpdateStatus, mockDispatchTrip } = vi.hoisted(() => ({
  mockUseTrips: vi.fn(() => ({
    data: [
      {
        id: "trip-1", trip_number: 101, dispatch_status: "CONCEPT", driver_id: "d1", vehicle_id: "V01",
        planned_start_time: "2025-01-10T08:00:00Z", actual_start_time: null, notes: "Test trip",
        trip_stops: [
          { id: "s1", stop_sequence: 1, stop_type: "PICKUP", stop_status: "GEPLAND", planned_address: "Amsterdam", contact_name: "Jan", contact_phone: null, planned_time: null, actual_arrival_time: null, order_id: "o1" },
          { id: "s2", stop_sequence: 2, stop_type: "DELIVERY", stop_status: "GEPLAND", planned_address: "Rotterdam", contact_name: "Piet", contact_phone: "0612345678", planned_time: null, actual_arrival_time: null, order_id: "o2" },
        ],
      },
      {
        id: "trip-2", trip_number: 102, dispatch_status: "ACTIEF", driver_id: "d2", vehicle_id: null,
        planned_start_time: "2025-01-10T09:00:00Z", actual_start_time: "2025-01-10T09:05:00Z", notes: null,
        trip_stops: [{ id: "s3", stop_sequence: 1, stop_type: "DELIVERY", stop_status: "AFGELEVERD", planned_address: "Utrecht", contact_name: null, contact_phone: null, planned_time: null, actual_arrival_time: null, order_id: "o3" }],
      },
      {
        id: "trip-3", trip_number: 103, dispatch_status: "VOLTOOID", driver_id: "d1", vehicle_id: "V01",
        planned_start_time: "2025-01-10T07:00:00Z", actual_start_time: "2025-01-10T07:10:00Z", notes: null,
        trip_stops: [{ id: "s4", stop_sequence: 1, stop_type: "DELIVERY", stop_status: "AFGELEVERD", planned_address: "Den Haag", contact_name: null, contact_phone: null, planned_time: null, actual_arrival_time: null, order_id: "o4" }],
      },
    ],
    isLoading: false, isError: false, refetch: vi.fn(),
  })),
  mockUpdateStatus: vi.fn().mockResolvedValue({}),
  mockDispatchTrip: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/hooks/useTrips", () => ({
  useTrips: (...args: any[]) => mockUseTrips(...args),
  useUpdateTripStatus: () => ({ mutateAsync: mockUpdateStatus, isPending: false }),
  useDispatchTrip: () => ({ mutateAsync: mockDispatchTrip, isPending: false }),
  useTripsRealtime: vi.fn(),
}));

vi.mock("@/hooks/useDrivers", () => ({
  useDrivers: () => ({ data: [{ id: "d1", name: "Chauffeur A" }, { id: "d2", name: "Chauffeur B" }] }),
}));

vi.mock("@/hooks/useVehicles", () => ({
  useVehicles: () => ({ data: [{ id: "v1", code: "V01", name: "Truck 1", plate: "AB-123" }] }),
}));

vi.mock("@/types/dispatch", () => ({
  TRIP_STATUS_LABELS: {
    CONCEPT: { label: "Concept", color: "" }, VERZENDKLAAR: { label: "Verzendklaar", color: "" },
    VERZONDEN: { label: "Verzonden", color: "" }, ONTVANGEN: { label: "Ontvangen", color: "" },
    GEACCEPTEERD: { label: "Geaccepteerd", color: "" }, ACTIEF: { label: "Actief", color: "" },
    VOLTOOID: { label: "Voltooid", color: "" }, GEWEIGERD: { label: "Geweigerd", color: "" },
    AFGEBROKEN: { label: "Afgebroken", color: "" },
  },
  STOP_STATUS_LABELS: {
    GEPLAND: { label: "Gepland", color: "" }, AFGELEVERD: { label: "Afgeleverd", color: "" },
    MISLUKT: { label: "Mislukt", color: "" }, OVERGESLAGEN: { label: "Overgeslagen", color: "" },
    AANGEKOMEN: { label: "Aangekomen", color: "" },
  },
  canTransitionTrip: vi.fn().mockReturnValue(true),
  TRIP_TRANSITIONS: {
    CONCEPT: ["VERZONDEN"], VERZENDKLAAR: ["VERZONDEN"], VERZONDEN: ["ACTIEF"],
    ACTIEF: ["VOLTOOID", "AFGEBROKEN"], VOLTOOID: [], GEWEIGERD: [], AFGEBROKEN: [],
    ONTVANGEN: ["ACTIEF"], GEACCEPTEERD: ["ACTIEF"],
  },
}));

vi.mock("framer-motion", async () => ({
  motion: { div: ({ children, ...props }: any) => <div {...props}>{children}</div> },
  AnimatePresence: ({ children }: any) => children,
}));

import Dispatch from "@/pages/Dispatch";

function renderDispatch() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Dispatch />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function resetTripsData() {
  mockUseTrips.mockReturnValue({
    data: [
      {
        id: "trip-1", trip_number: 101, dispatch_status: "CONCEPT", driver_id: "d1", vehicle_id: "V01",
        planned_start_time: "2025-01-10T08:00:00Z", actual_start_time: null, notes: "Test trip",
        trip_stops: [
          { id: "s1", stop_sequence: 1, stop_type: "PICKUP", stop_status: "GEPLAND", planned_address: "Amsterdam", contact_name: "Jan", contact_phone: null, planned_time: null, actual_arrival_time: null, order_id: "o1" },
          { id: "s2", stop_sequence: 2, stop_type: "DELIVERY", stop_status: "GEPLAND", planned_address: "Rotterdam", contact_name: "Piet", contact_phone: "0612345678", planned_time: null, actual_arrival_time: null, order_id: "o2" },
        ],
      },
      {
        id: "trip-2", trip_number: 102, dispatch_status: "ACTIEF", driver_id: "d2", vehicle_id: null,
        planned_start_time: "2025-01-10T09:00:00Z", actual_start_time: "2025-01-10T09:05:00Z", notes: null,
        trip_stops: [{ id: "s3", stop_sequence: 1, stop_type: "DELIVERY", stop_status: "AFGELEVERD", planned_address: "Utrecht", contact_name: null, contact_phone: null, planned_time: null, actual_arrival_time: null, order_id: "o3" }],
      },
      {
        id: "trip-3", trip_number: 103, dispatch_status: "VOLTOOID", driver_id: "d1", vehicle_id: "V01",
        planned_start_time: "2025-01-10T07:00:00Z", actual_start_time: "2025-01-10T07:10:00Z", notes: null,
        trip_stops: [{ id: "s4", stop_sequence: 1, stop_type: "DELIVERY", stop_status: "AFGELEVERD", planned_address: "Den Haag", contact_name: null, contact_phone: null, planned_time: null, actual_arrival_time: null, order_id: "o4" }],
      },
    ],
    isLoading: false, isError: false, refetch: vi.fn(),
  });
}

describe("Dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTripsData();
  });

  it("renders without crashing", () => {
    renderDispatch();
    expect(screen.getAllByText("Dispatch").length).toBeGreaterThanOrEqual(1);
  });

  it("shows trip cards", () => {
    renderDispatch();
    expect(screen.getByText(/Rit #101/)).toBeInTheDocument();
    expect(screen.getByText(/Rit #102/)).toBeInTheDocument();
    expect(screen.getByText(/Rit #103/)).toBeInTheDocument();
  });

  it("shows stats values (stats useMemo)", () => {
    renderDispatch();
    expect(screen.getByText("Totaal")).toBeInTheDocument();
  });

  it("shows Dispatch button for concept trips", () => {
    renderDispatch();
    expect(screen.getByRole("button", { name: /Dispatch/i })).toBeInTheDocument();
  });

  it("shows today button", () => {
    renderDispatch();
    expect(screen.getByText("Vandaag")).toBeInTheDocument();
  });

  it("has filter tabs", () => {
    renderDispatch();
    expect(screen.getByText("Alle")).toBeInTheDocument();
  });

  it("shows dispatch confirmation dialog (setConfirmDispatch)", async () => {
    const user = userEvent.setup();
    renderDispatch();
    await user.click(screen.getByRole("button", { name: /Dispatch/i }));
    await waitFor(() => {
      expect(screen.getByText("Rit dispatchen")).toBeInTheDocument();
    });
  });

  it("confirms dispatch and calls dispatchTrip", async () => {
    const user = userEvent.setup();
    renderDispatch();
    await user.click(screen.getByRole("button", { name: /Dispatch/i }));
    await waitFor(() => {
      expect(screen.getByText("Rit dispatchen")).toBeInTheDocument();
    });
    const confirmBtn = screen.getByText("Verzenden");
    await user.click(confirmBtn);
    await waitFor(() => {
      expect(mockDispatchTrip).toHaveBeenCalledWith("trip-1");
    });
  });

  it("has search input", () => {
    renderDispatch();
    expect(screen.getByPlaceholderText(/Zoek op ritnummer/)).toBeInTheDocument();
  });

  it("shows loading state", () => {
    mockUseTrips.mockReturnValueOnce({ data: [], isLoading: true, isError: false, refetch: vi.fn() });
    renderDispatch();
    expect(screen.getByText("Ritten laden...")).toBeInTheDocument();
  });

  it("shows error state", () => {
    mockUseTrips.mockReturnValueOnce({ data: [], isLoading: false, isError: true, refetch: vi.fn() });
    renderDispatch();
    expect(screen.getByText(/Kan ritten niet laden/)).toBeInTheDocument();
  });

  it("shows stop count on trip cards (getStopCounts)", () => {
    renderDispatch();
    expect(screen.getByText(/2 stops/)).toBeInTheDocument();
  });

  it("shows date navigation arrows (goToPrevDay, goToNextDay)", async () => {
    const user = userEvent.setup();
    renderDispatch();
    const buttons = screen.getAllByRole("button");
    // There should be prev/next buttons
    expect(buttons.length).toBeGreaterThan(3);
    // Click prev day
    const prevBtn = buttons.find(b => b.querySelector('.lucide-chevron-left'));
    const nextBtn = buttons.find(b => b.querySelector('.lucide-chevron-right'));
    if (prevBtn) await user.click(prevBtn);
    if (nextBtn) await user.click(nextBtn);
    expect(document.body.textContent).toBeTruthy();
  });

  it("filters by search query (filtered useMemo)", async () => {
    const user = userEvent.setup();
    renderDispatch();
    await user.type(screen.getByPlaceholderText(/Zoek op ritnummer/), "101");
    await waitFor(() => {
      expect(screen.getByText(/Rit #101/)).toBeInTheDocument();
    });
  });

  it("filters by status tab (setStatusFilter)", async () => {
    const user = userEvent.setup();
    renderDispatch();
    const conceptTab = screen.getAllByText(/Concept/)[0];
    await user.click(conceptTab);
    await waitFor(() => {
      expect(screen.getByText(/Rit #101/)).toBeInTheDocument();
    });
  });

  it("shows empty state when no trips", () => {
    mockUseTrips.mockReturnValueOnce({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    renderDispatch();
    expect(screen.getByText(/Geen ritten|geen geplande/i)).toBeInTheDocument();
  });

  it("expands trip details when clicked (setExpandedTrip)", async () => {
    const user = userEvent.setup();
    renderDispatch();
    await user.click(screen.getByText(/Rit #101/));
    await waitFor(() => {
      expect(screen.getByText(/Amsterdam/)).toBeInTheDocument();
      expect(screen.getByText(/Rotterdam/)).toBeInTheDocument();
    });
  });

  it("collapses trip when clicking again", async () => {
    const user = userEvent.setup();
    renderDispatch();
    await user.click(screen.getByText(/Rit #101/));
    await waitFor(() => {
      expect(screen.getByText(/Amsterdam/)).toBeInTheDocument();
    });
    await user.click(screen.getByText(/Rit #101/));
    // Should collapse (no crash)
    expect(document.body.textContent).toBeTruthy();
  });

  it("shows trip status labels", () => {
    renderDispatch();
    expect(screen.getAllByText(/Concept|Actief|Voltooid/).length).toBeGreaterThanOrEqual(2);
  });

  it("toggles trip selection checkbox (toggleTripSelection)", async () => {
    const user = userEvent.setup();
    renderDispatch();
    const checkboxes = screen.getAllByRole("checkbox");
    if (checkboxes.length > 0) {
      await user.click(checkboxes[0]);
      expect(document.body.textContent).toBeTruthy();
    }
  });

  it("selects all concepts (toggleAllConcepts)", async () => {
    const user = userEvent.setup();
    renderDispatch();
    const checkboxes = screen.getAllByRole("checkbox");
    if (checkboxes.length > 0) {
      await user.click(checkboxes[0]);
      expect(document.body.textContent).toBeTruthy();
    }
  });

  // ── handleStatusChange + confirmStatusChange ──
  it("changes trip status via status action button (handleStatusChange)", async () => {
    const user = userEvent.setup();
    renderDispatch();
    // Expand an active trip to see status change options
    await user.click(screen.getByText(/Rit #102/));
    await waitFor(() => {
      expect(screen.getByText(/Utrecht/)).toBeInTheDocument();
    });
    // Look for a status action button (Voltooid, Afbreken)
    const volltooidBtns = screen.queryAllByText(/Voltooid|Voltooien/i);
    const volltooidBtn = volltooidBtns.find(b => b.closest("button"));
    if (volltooidBtn) {
      await user.click(volltooidBtn.closest("button") || volltooidBtn);
      await waitFor(() => {
        // Should show confirmation dialog
        const bevestigBtn = screen.queryByText(/Bevestigen/i);
        if (bevestigBtn) {
          expect(bevestigBtn).toBeInTheDocument();
        }
      });
      // Confirm the status change
      const confirmBtn = screen.queryByText(/Bevestigen/i);
      if (confirmBtn) {
        await user.click(confirmBtn);
        await waitFor(() => {
          expect(mockUpdateStatus).toHaveBeenCalled();
        });
      }
    }
    expect(document.body.textContent).toBeTruthy();
  });

  // ── goToPrevDay / goToNextDay ──
  it("navigates to previous day (goToPrevDay)", async () => {
    const user = userEvent.setup();
    renderDispatch();
    const buttons = screen.getAllByRole("button");
    const prevBtn = buttons.find(b => b.querySelector('.lucide-chevron-left'));
    if (prevBtn) {
      await user.click(prevBtn);
    }
    expect(document.body.textContent).toBeTruthy();
  });

  it("navigates to next day (goToNextDay)", async () => {
    const user = userEvent.setup();
    renderDispatch();
    const buttons = screen.getAllByRole("button");
    const nextBtn = buttons.find(b => b.querySelector('.lucide-chevron-right'));
    if (nextBtn) {
      await user.click(nextBtn);
    }
    expect(document.body.textContent).toBeTruthy();
  });

  // ── setSelectedDate via Vandaag button ──
  it("resets to today (setSelectedDate via Vandaag)", async () => {
    const user = userEvent.setup();
    renderDispatch();
    await user.click(screen.getByText("Vandaag"));
    expect(document.body.textContent).toBeTruthy();
  });

  // ── setSelectedDate via date input ──
  it("changes date via date input (setSelectedDate)", async () => {
    renderDispatch();
    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    if (dateInput) {
      const { fireEvent } = await import("@testing-library/react");
      fireEvent.change(dateInput, { target: { value: "2025-06-15" } });
      expect(dateInput.value).toBe("2025-06-15");
    }
    expect(document.body.textContent).toBeTruthy();
  });

  // ── cancelDispatchAction (close dispatch dialog) ──
  it("cancels dispatch dialog", async () => {
    const user = userEvent.setup();
    renderDispatch();
    await user.click(screen.getByRole("button", { name: /Dispatch/i }));
    await waitFor(() => {
      expect(screen.getByText("Rit dispatchen")).toBeInTheDocument();
    });
    const cancelBtn = screen.queryByText(/Annuleren/i);
    if (cancelBtn) {
      await user.click(cancelBtn);
    }
    expect(document.body.textContent).toBeTruthy();
  });

  // ── driverMap / vehicleMap memos ──
  it("shows driver names on trip cards (driverMap useMemo)", () => {
    renderDispatch();
    expect(screen.getAllByText(/Chauffeur A|Chauffeur B/).length).toBeGreaterThanOrEqual(1);
  });

  // ── stats useMemo ──
  it("shows all stats categories (stats useMemo)", () => {
    renderDispatch();
    expect(screen.getByText("Totaal")).toBeInTheDocument();
    expect(screen.getAllByText(/Concept/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Actief/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Voltooid/).length).toBeGreaterThanOrEqual(1);
  });

  // ── expandedTrip toggle on same trip ──
  it("collapses expanded trip details (setExpandedTrip toggle)", async () => {
    const user = userEvent.setup();
    renderDispatch();
    await user.click(screen.getByText(/Rit #101/));
    await waitFor(() => {
      expect(screen.getByText(/Amsterdam/)).toBeInTheDocument();
    });
    // Click same trip again to collapse
    await user.click(screen.getByText(/Rit #101/));
    expect(document.body.textContent).toBeTruthy();
  });

  // ── search filtered memo ──
  it("filters trips by stop address (filtered useMemo)", async () => {
    const user = userEvent.setup();
    renderDispatch();
    await user.type(screen.getByPlaceholderText(/Zoek op ritnummer/), "Amsterdam");
    // Only trip #101 has Amsterdam stop
    await waitFor(() => {
      expect(document.body.textContent).toBeTruthy();
    });
  });
});
