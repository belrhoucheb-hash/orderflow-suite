import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

// ── Hoisted mocks ───────────────────────────────────────────────────
const { mockUseFleetVehicles } = vi.hoisted(() => ({
  mockUseFleetVehicles: vi.fn(() => ({
    data: [
      { id: "v1", name: "Sprinter 1", plate: "AB-123-CD", type: "busje", status: "beschikbaar", capacityKg: 1500, capacityPallets: 6, features: ["Laadklep"], code: "V01", year: 2022, mileageKm: 45000 },
      { id: "v2", name: "Scania R450", plate: "EF-456-GH", type: "trekker", status: "onderweg", capacityKg: 24000, capacityPallets: 33, features: ["ADR"], code: "V02", year: 2021, mileageKm: 120000 },
      { id: "v3", name: "MAN Koelwagen", plate: "IJ-789-KL", type: "koelwagen", status: "onderhoud", capacityKg: 8000, capacityPallets: 15, features: ["Koeling"], code: "V03", year: 2023, mileageKm: 30000 },
    ],
    isLoading: false, isError: false, refetch: vi.fn(),
  })),
}));

vi.mock("@/hooks/useFleet", () => ({
  useFleetVehicles: (...args: any[]) => mockUseFleetVehicles(...args),
  useVehicleUtilization: () => ({ data: { v1: 45, v2: 78 } }),
  useUpcomingMaintenance: () => ({ data: [] }),
  useVehicleDriverConsistency: () => ({ data: {} }),
}));

vi.mock("@/components/fleet/NewVehicleDialog", () => ({
  NewVehicleDialog: ({ open }: any) => open ? <div data-testid="new-vehicle-dialog">New Vehicle</div> : null,
}));

import Fleet from "@/pages/Fleet";

function renderFleet() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Fleet />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Fleet", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it("renders without crashing", () => {
    renderFleet();
    expect(screen.getAllByText("Vloot").length).toBeGreaterThanOrEqual(1);
  });

  it("displays vehicle names", () => {
    renderFleet();
    expect(screen.getAllByText("Sprinter 1").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Scania R450").length).toBeGreaterThanOrEqual(1);
  });

  it("shows license plates", () => {
    renderFleet();
    expect(screen.getAllByText("AB-123-CD").length).toBeGreaterThanOrEqual(1);
  });

  it("groups vehicles by type", () => {
    renderFleet();
    expect(screen.getByText("Busje")).toBeInTheDocument();
    expect(screen.getByText("Trekker")).toBeInTheDocument();
  });

  it("has search input", () => {
    renderFleet();
    expect(screen.getByPlaceholderText(/zoek/i)).toBeInTheDocument();
  });

  it("has add vehicle button", () => {
    renderFleet();
    const addBtn = screen.getByRole("button", { name: /nieuw voertuig/i });
    expect(addBtn).toBeInTheDocument();
  });

  it("opens new vehicle dialog", async () => {
    const user = userEvent.setup();
    renderFleet();
    const addBtn = screen.getByRole("button", { name: /nieuw voertuig/i });
    await user.click(addBtn);
    expect(screen.getByTestId("new-vehicle-dialog")).toBeInTheDocument();
  });
});
