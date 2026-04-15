import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

// ── Hoisted mocks ───────────────────────────────────────────────────
const { mockUseOrders, mockUseVehicles } = vi.hoisted(() => {
  const mockOrders = [
    { id: "o1", orderNumber: "ORD-001", customer: "Acme BV", status: "DELIVERED", priority: "normaal", totalWeight: 500, deliveryAddress: "Amsterdam", createdAt: "2025-01-10T10:00:00Z", estimatedDelivery: "2025-01-12T10:00:00Z" },
    { id: "o2", orderNumber: "ORD-002", customer: "Widget NL", status: "IN_TRANSIT", priority: "spoed", totalWeight: 1200, deliveryAddress: "Rotterdam", createdAt: "2025-01-11T10:00:00Z", estimatedDelivery: "2024-01-01T10:00:00Z" },
    { id: "o3", orderNumber: "ORD-003", customer: "Test Corp", status: "PENDING", priority: "normaal", totalWeight: 300, deliveryAddress: "Utrecht", createdAt: "2025-01-09T10:00:00Z", estimatedDelivery: "2030-01-01T10:00:00Z" },
  ];
  const mockVehicles = [
    { id: "v1", code: "V01", name: "Truck 1", plate: "AB-123-CD" },
    { id: "v2", code: "V02", name: "Truck 2", plate: "EF-456-GH" },
  ];
  const mockRefetchOrders = vi.fn();
  const mockRefetchVehicles = vi.fn();
  return {
    mockUseOrders: vi.fn(() => ({
      data: { orders: mockOrders, totalCount: mockOrders.length },
      isLoading: false,
      isError: false,
      refetch: mockRefetchOrders,
    })),
    mockUseVehicles: vi.fn(() => ({
      data: mockVehicles,
      isLoading: false,
      isError: false,
      refetch: mockRefetchVehicles,
    })),
  };
});

vi.mock("@/hooks/useOrders", () => ({ useOrders: mockUseOrders }));
vi.mock("@/hooks/useVehicles", () => ({ useVehicles: mockUseVehicles }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ effectiveRole: "admin", session: { user: { id: "test-user" } }, loading: false }),
}));

vi.mock("@/components/dashboard/FinancialKPIWidget", () => ({
  FinancialKPIWidget: () => <div data-testid="financial-widget">Financial KPI</div>,
}));
vi.mock("@/components/dashboard/OperationalForecastWidget", () => ({
  OperationalForecastWidget: () => <div data-testid="forecast-widget">Forecast</div>,
}));
vi.mock("@/components/dashboard/MarginWidget", () => ({
  MarginWidget: () => <div data-testid="margin-widget">Margin Trend</div>,
}));
vi.mock("@/components/dashboard/EmballageWidget", () => ({
  EmballageWidget: () => <div data-testid="emballage-widget">Emballage</div>,
}));
vi.mock("@/components/dashboard/AutonomyScoreCard", () => ({
  AutonomyScoreCard: () => <div data-testid="autonomy-widget">AI Autonomie</div>,
}));

vi.mock("framer-motion", async () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    tr: ({ children, ...props }: any) => <tr {...props}>{children}</tr>,
  },
  AnimatePresence: ({ children }: any) => children,
}));

import Dashboard from "@/pages/Dashboard";

function renderDashboard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Dashboard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders without crashing", () => {
    renderDashboard();
    expect(screen.getByText("Operationeel Dashboard")).toBeInTheDocument();
  });

  it("displays KPI values (stats useMemo)", () => {
    renderDashboard();
    expect(screen.getAllByText("Totaal orders").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Voertuigen").length).toBeGreaterThanOrEqual(1);
  });

  it("shows recent orders table (recentOrders useMemo)", () => {
    renderDashboard();
    expect(screen.getByText("Recente orders")).toBeInTheDocument();
    expect(screen.getByText("ORD-001")).toBeInTheDocument();
    expect(screen.getByText("Acme BV")).toBeInTheDocument();
  });

  it("renders financial and forecast widgets", () => {
    renderDashboard();
    expect(screen.getByTestId("financial-widget")).toBeInTheDocument();
    expect(screen.getByTestId("forecast-widget")).toBeInTheDocument();
  });

  it("shows Samenvatting section", () => {
    renderDashboard();
    expect(screen.getByText("Samenvatting")).toBeInTheDocument();
  });

  it("shows aandachtspunten section", () => {
    renderDashboard();
    expect(screen.getByText("Aandachtspunten")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    mockUseOrders.mockReturnValueOnce({ data: null, isLoading: true, isError: false, refetch: vi.fn() });
    renderDashboard();
    expect(screen.getByText("Dashboard laden...")).toBeInTheDocument();
  });

  it("shows error state with retry button (refetchOrders/refetchVehicles)", () => {
    const mockRefetch = vi.fn();
    mockUseOrders.mockReturnValueOnce({ data: null, isLoading: false, isError: true, refetch: mockRefetch });
    renderDashboard();
    expect(screen.getByText("Kan dashboardgegevens niet laden.")).toBeInTheDocument();
  });

  it("clicking retry in error state calls refetch", async () => {
    const user = userEvent.setup();
    const mockRefetch = vi.fn();
    mockUseOrders.mockReturnValueOnce({ data: null, isLoading: false, isError: true, refetch: mockRefetch });
    mockUseVehicles.mockReturnValueOnce({ data: [], isLoading: false, isError: true, refetch: mockRefetch });
    renderDashboard();
    const retryBtn = screen.getByText(/Probeer opnieuw|Opnieuw/i);
    await user.click(retryBtn);
    expect(mockRefetch).toHaveBeenCalled();
  });

  it("shows empty state for no orders", () => {
    mockUseOrders.mockReturnValueOnce({ data: { orders: [], totalCount: 0 }, isLoading: false, isError: false, refetch: vi.fn() });
    renderDashboard();
    expect(screen.getByText("Geen orders gevonden")).toBeInTheDocument();
  });
});
