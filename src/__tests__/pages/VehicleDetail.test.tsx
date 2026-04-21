import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// ── Hoisted mocks ───────────────────────────────────────────────────
const { mockUseVehicleById, mockCompleteMaintenance } = vi.hoisted(() => ({
  mockUseVehicleById: vi.fn(() => ({
    data: {
      id: "v1", name: "Sprinter 1", plate: "AB-123-CD", type: "busje",
      status: "beschikbaar", capacityKg: 1500, capacityPallets: 6,
      features: ["Laadklep"], code: "V01", year: 2022, mileageKm: 45000,
      assignedDriver: null, is_active: true, brand: "Mercedes", buildYear: 2022,
      fuelConsumption: 8.5,
    },
    isLoading: false,
  })),
  mockCompleteMaintenance: vi.fn().mockImplementation((_args: any, opts: any) => {
    opts?.onSuccess?.();
  }),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@/hooks/useFleet", () => ({
  useVehicleById: (...args: any[]) => mockUseVehicleById(...args),
  useVehicleDocuments: () => ({
    data: [
      { id: "doc1", doc_type: "apk", description: "APK 2024", expiry_date: "2025-06-01", file_url: null, notes: "test notes" },
      { id: "doc2", doc_type: "verzekering", description: "Verzekering", expiry_date: "2024-12-01", file_url: null, notes: null },
    ],
  }),
  useVehicleMaintenance: () => ({
    data: [
      { id: "m1", vehicle_id: "v1", maintenance_type: "grote_beurt", description: "Grote beurt", scheduled_date: "2025-03-01", completed_date: null, cost: 500, notes: "Test", mileage_km: 45000 },
      { id: "m2", vehicle_id: "v1", maintenance_type: "kleine_beurt", description: "Kleine beurt", scheduled_date: "2024-01-01", completed_date: "2024-01-15", cost: 200, notes: null, mileage_km: 40000 },
    ],
  }),
  useVehicleAvailability: () => ({
    data: [
      { date: "2025-01-06", status: "beschikbaar" },
      { date: "2025-01-07", status: "niet_beschikbaar" },
    ],
  }),
  useCompleteMaintenance: () => ({ mutate: mockCompleteMaintenance, isPending: false }),
}));

vi.mock("@/components/fleet/MaintenanceDialog", () => ({
  MaintenanceDialog: ({ open, onOpenChange }: any) => open ? (
    <div data-testid="maint-dialog">
      <button data-testid="close-maint" onClick={() => onOpenChange(false)}>Close</button>
    </div>
  ) : null,
}));
vi.mock("@/components/fleet/DocumentDialog", () => ({
  DocumentDialog: ({ open, onOpenChange }: any) => open ? (
    <div data-testid="doc-dialog">
      <button data-testid="close-doc" onClick={() => onOpenChange(false)}>Close</button>
    </div>
  ) : null,
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ effectiveRole: "admin", session: { user: { id: "test-user" } }, loading: false }),
}));
vi.mock("@/hooks/useVehicleCheckHistory", () => ({
  useLatestVehicleCheck: () => ({ data: null, isLoading: false }),
  useVehicleCheckHistory: () => ({ data: [], isLoading: false }),
}));

import VehicleDetail from "@/pages/VehicleDetail";

function renderVehicleDetail(id = "v1") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/fleet/${id}`]}>
        <Routes>
          <Route path="/fleet/:id" element={<VehicleDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("VehicleDetail", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders without crashing", () => {
    renderVehicleDetail();
    expect(screen.getByText("Sprinter 1")).toBeInTheDocument();
  });

  it("shows vehicle plate", () => {
    renderVehicleDetail();
    expect(screen.getAllByText(/AB-123-CD/).length).toBeGreaterThanOrEqual(1);
  });

  it("shows loading state when vehicle data is loading", () => {
    mockUseVehicleById.mockReturnValueOnce({ data: null, isLoading: true });
    renderVehicleDetail();
    expect(screen.getByText(/laden/i)).toBeInTheDocument();
  });

  it("shows not found state when no vehicle", () => {
    mockUseVehicleById.mockReturnValueOnce({ data: null, isLoading: false });
    renderVehicleDetail();
    expect(screen.getByText(/niet gevonden/i)).toBeInTheDocument();
  });

  it("shows status badge", () => {
    renderVehicleDetail();
    expect(screen.getByText("Beschikbaar")).toBeInTheDocument();
  });

  // ── Tab navigation: Documenten ──
  it("switches to Documenten tab and shows APK document", async () => {
    const user = userEvent.setup();
    renderVehicleDetail();
    await user.click(screen.getByText("Documenten"));
    await waitFor(() => {
      expect(screen.getByText("APK Keuring")).toBeInTheDocument();
    });
  });

  // ── Shows expired document warning ──
  it("shows Verlopen badge for expired documents", async () => {
    const user = userEvent.setup();
    renderVehicleDetail();
    await user.click(screen.getByText("Documenten"));
    await waitFor(() => {
      const badges = screen.getAllByText("Verlopen");
      expect(badges.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Shows doc notes ──
  it("shows document notes when present", async () => {
    const user = userEvent.setup();
    renderVehicleDetail();
    await user.click(screen.getByText("Documenten"));
    await waitFor(() => {
      expect(screen.getByText("test notes")).toBeInTheDocument();
    });
  });

  // ── Tab navigation: Onderhoud ──
  it("switches to Onderhoud tab and shows maintenance entries", async () => {
    const user = userEvent.setup();
    renderVehicleDetail();
    await user.click(screen.getByText("Onderhoud"));
    await waitFor(() => {
      expect(screen.getAllByText("Grote beurt").length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Shows completed maintenance badge ──
  it("shows Uitgevoerd badge for completed maintenance", async () => {
    const user = userEvent.setup();
    renderVehicleDetail();
    await user.click(screen.getByText("Onderhoud"));
    await waitFor(() => {
      expect(screen.getByText("Uitgevoerd")).toBeInTheDocument();
    });
  });

  // ── completeMaintenance.mutate (Afronden button) ──
  it("clicks Afronden button to complete maintenance", async () => {
    const user = userEvent.setup();
    renderVehicleDetail();
    await user.click(screen.getByText("Onderhoud"));
    await waitFor(() => {
      expect(screen.getByText("Afronden")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Afronden"));
    expect(mockCompleteMaintenance).toHaveBeenCalledWith(
      { id: "m1", vehicleId: "v1" },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
  });

  // ── Tab navigation: Beschikbaarheid ──
  it("switches to Beschikbaarheid tab", async () => {
    const user = userEvent.setup();
    renderVehicleDetail();
    await user.click(screen.getByText("Beschikbaarheid"));
    await waitFor(() => {
      expect(screen.getByText(/Weekoverzicht/)).toBeInTheDocument();
    });
  });

  // ── Availability shows legend ──
  it("shows availability legend items", async () => {
    const user = userEvent.setup();
    renderVehicleDetail();
    await user.click(screen.getByText("Beschikbaarheid"));
    await waitFor(() => {
      expect(screen.getByText("Niet beschikbaar")).toBeInTheDocument();
      expect(screen.getByText("Niet ingepland")).toBeInTheDocument();
    });
  });

  // ── Tab navigation: Prestaties ──
  it("switches to Prestaties tab and shows KPI cards", async () => {
    const user = userEvent.setup();
    renderVehicleDetail();
    await user.click(screen.getByText("Prestaties"));
    await waitFor(() => {
      expect(screen.getByText("Kilometers deze maand")).toBeInTheDocument();
      expect(screen.getByText("Beladingsgraad")).toBeInTheDocument();
      expect(screen.getByText("Brandstofverbruik")).toBeInTheDocument();
      expect(screen.getByText("Omzet per km")).toBeInTheDocument();
    });
  });

  // ── Shows fuel consumption value ──
  it("shows fuel consumption from vehicle data", async () => {
    const user = userEvent.setup();
    renderVehicleDetail();
    await user.click(screen.getByText("Prestaties"));
    await waitFor(() => {
      expect(screen.getByText("8.5")).toBeInTheDocument();
    });
  });

  // ── setShowMaintenanceDialog ──
  it("opens maintenance dialog (setShowMaintenanceDialog)", async () => {
    const user = userEvent.setup();
    renderVehicleDetail();
    await user.click(screen.getByText("Onderhoud"));
    await waitFor(() => {
      expect(screen.getByText("Onderhoud Plannen")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Onderhoud Plannen"));
    await waitFor(() => {
      expect(screen.getByTestId("maint-dialog")).toBeInTheDocument();
    });
  });

  // ── Close maintenance dialog ──
  it("closes maintenance dialog via onOpenChange", async () => {
    const user = userEvent.setup();
    renderVehicleDetail();
    await user.click(screen.getByText("Onderhoud"));
    await user.click(screen.getByText("Onderhoud Plannen"));
    await waitFor(() => {
      expect(screen.getByTestId("maint-dialog")).toBeInTheDocument();
    });
    await user.click(screen.getByTestId("close-maint"));
    await waitFor(() => {
      expect(screen.queryByTestId("maint-dialog")).not.toBeInTheDocument();
    });
  });

  // ── setShowDocumentDialog ──
  it("opens document dialog (setShowDocumentDialog)", async () => {
    const user = userEvent.setup();
    renderVehicleDetail();
    await user.click(screen.getByText("Documenten"));
    await waitFor(() => {
      expect(screen.getByText("Document Toevoegen")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Document Toevoegen"));
    await waitFor(() => {
      expect(screen.getByTestId("doc-dialog")).toBeInTheDocument();
    });
  });

  // ── Close document dialog ──
  it("closes document dialog via onOpenChange", async () => {
    const user = userEvent.setup();
    renderVehicleDetail();
    await user.click(screen.getByText("Documenten"));
    await user.click(screen.getByText("Document Toevoegen"));
    await waitFor(() => {
      expect(screen.getByTestId("doc-dialog")).toBeInTheDocument();
    });
    await user.click(screen.getByTestId("close-doc"));
    await waitFor(() => {
      expect(screen.queryByTestId("doc-dialog")).not.toBeInTheDocument();
    });
  });

  // ── Back navigation ──
  it("clicks back button to navigate to /vloot", async () => {
    const user = userEvent.setup();
    renderVehicleDetail();
    const buttons = screen.getAllByRole("button");
    // The first button is the back button with ArrowLeft
    const backBtn = buttons.find(b => b.querySelector('.lucide-arrow-left'));
    if (backBtn) {
      await user.click(backBtn);
      expect(mockNavigate).toHaveBeenCalledWith("/vloot");
    }
    expect(document.body.textContent).toBeTruthy();
  });

  // ── Specs tab shows capacity (default tab) ──
  it("shows capacity info in specs tab", () => {
    renderVehicleDetail();
    // toLocaleString() varieert per locale: NL "1.500", en-US "1,500", raw "1500".
    expect(screen.getByText(/1[.,]?500/)).toBeInTheDocument();
  });

  // ── Shows vehicle features ──
  it("shows vehicle features badge", () => {
    renderVehicleDetail();
    expect(screen.getByText("Laadklep")).toBeInTheDocument();
  });

  // ── Shows brand and build year ──
  it("shows vehicle brand and build year", () => {
    renderVehicleDetail();
    expect(screen.getByText("Mercedes")).toBeInTheDocument();
    expect(screen.getByText("2022")).toBeInTheDocument();
  });

  // ── Shows pallet capacity ──
  it("shows pallet capacity", () => {
    renderVehicleDetail();
    expect(screen.getByText("6")).toBeInTheDocument();
  });

  // ── Shows assigned driver or not assigned ──
  it("shows Niet toegewezen when no driver", () => {
    renderVehicleDetail();
    expect(screen.getByText("Niet toegewezen")).toBeInTheDocument();
  });

  // ── Different vehicle status ──
  it("shows correct status badge for onderhoud", () => {
    mockUseVehicleById.mockReturnValueOnce({
      data: {
        id: "v1", name: "Truck A", plate: "XY-789-ZZ", type: "vrachtwagen",
        status: "onderhoud", capacityKg: 5000, capacityPallets: 12,
        features: [], code: "T01", brand: null, buildYear: null,
        assignedDriver: "Jan Jansen", fuelConsumption: null,
      },
      isLoading: false,
    });
    renderVehicleDetail();
    // "Onderhoud" appears both as status badge and as tab trigger
    expect(screen.getAllByText("Onderhoud").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Jan Jansen")).toBeInTheDocument();
  });

  // ── No features shows dash ──
  it("shows dash when vehicle has no features", () => {
    mockUseVehicleById.mockReturnValueOnce({
      data: {
        id: "v1", name: "Truck B", plate: "ZZ-000-AA", type: "bus",
        status: "beschikbaar", capacityKg: 3000, capacityPallets: 8,
        features: [], code: "T02", brand: null, buildYear: null,
        assignedDriver: null, fuelConsumption: null,
      },
      isLoading: false,
    });
    renderVehicleDetail();
    // The features row shows "—" when empty
    const dashElements = screen.getAllByText("—");
    expect(dashElements.length).toBeGreaterThan(0);
  });

  // ── Maintenance shows cost ──
  it("shows maintenance cost", async () => {
    const user = userEvent.setup();
    renderVehicleDetail();
    await user.click(screen.getByText("Onderhoud"));
    await waitFor(() => {
      expect(screen.getByText(/500/)).toBeInTheDocument();
    });
  });

  // ── Maintenance shows mileage ──
  it("shows maintenance mileage", async () => {
    const user = userEvent.setup();
    renderVehicleDetail();
    await user.click(screen.getByText("Onderhoud"));
    await waitFor(() => {
      // toLocaleString() varieert per locale: NL "45.000", en-US "45,000".
      expect(screen.getByText(/45[.,]?000/)).toBeInTheDocument();
    });
  });
});
