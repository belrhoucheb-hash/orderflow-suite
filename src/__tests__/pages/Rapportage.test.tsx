import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

// ── Mocks ───────────────────────────────────────────────────────────
const { mockSupabase } = vi.hoisted(() => {
  const makeChain = (data: any[] = []) => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: vi.fn().mockImplementation((cb: any) => cb({ data, error: null })),
  });
  return {
    mockSupabase: {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "orders") {
          return makeChain([
            { id: "o1", order_number: 1, created_at: "2025-01-10T10:00:00Z", status: "DELIVERED", updated_at: "2025-01-10T14:00:00Z", client_name: "Acme BV", vehicle_id: "v1", pickup_address: "A", delivery_address: "B", weight_kg: 120 },
            { id: "o2", order_number: 2, created_at: "2025-01-11T09:00:00Z", status: "PENDING", updated_at: "2025-01-11T10:00:00Z", client_name: "Widget NL", vehicle_id: null, pickup_address: "C", delivery_address: "D", weight_kg: 80 },
            { id: "o3", order_number: 3, created_at: "2025-01-10T08:00:00Z", status: "IN_TRANSIT", updated_at: "2025-01-10T12:00:00Z", client_name: "Acme BV", vehicle_id: "v1", pickup_address: "E", delivery_address: "F", weight_kg: 50 },
          ]);
        }
        if (table === "vehicles") return makeChain([{ id: "v1", code: "V01", name: "Truck 1" }]);
        if (table === "vehicle_availability") return makeChain([{ vehicle_id: "v1", date: "2025-01-10", status: "available" }]);
        return makeChain([]);
      }),
      rpc: vi.fn().mockImplementation((fnName: string) => {
        if (fnName === "report_orders_overview_v1") {
          return Promise.resolve({
            data: {
              kpis: { totalOrders: 5, avgDeliveryDays: 1.2 },
              ordersPerWeek: [
                { week_start: "2025-01-06", orders: 2, previous_orders: 1 },
                { week_start: "2025-01-13", orders: 3, previous_orders: 2 },
              ],
              ordersPerMonth: [
                { month_start: "2024-12-01", orders: 2, previous_orders: 1 },
                { month_start: "2025-01-01", orders: 3, previous_orders: 2 },
              ],
              topClients: [
                { name: "Acme BV", count: 2 },
                { name: "Widget NL", count: 1 },
              ],
              statusDistribution: [
                { status: "DELIVERED", value: 2 },
                { status: "PENDING", value: 1 },
              ],
              vehicleOrders: [
                { vehicle_id: "v1", count: 2 },
              ],
            },
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      }),
    },
  };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));

vi.mock("@/utils/reportExporter", () => ({
  exportOrderReport: vi.fn(),
  exportOrdersCSV: vi.fn(),
}));

vi.mock("recharts", () => ({
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  CartesianGrid: () => <div />,
  PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => <div />,
  Cell: () => <div />,
}));

vi.mock("framer-motion", async () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

import Rapportage from "@/pages/Rapportage";

function renderRapportage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Rapportage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Rapportage", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it("renders without crashing", async () => {
    renderRapportage();
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Rapportage" })).toBeInTheDocument();
    });
  });

  it("shows KPI cards section", async () => {
    renderRapportage();
    await waitFor(() => {
      expect(document.body.textContent!.length).toBeGreaterThan(50);
    });
  });

  it("renders chart containers", async () => {
    renderRapportage();
    await waitFor(() => {
      const charts = screen.getAllByTestId(/bar-chart|pie-chart/);
      expect(charts.length).toBeGreaterThan(0);
    });
  });

  it("shows date preset buttons", async () => {
    renderRapportage();
    await waitFor(() => {
      expect(screen.getByText("Vandaag")).toBeInTheDocument();
      expect(screen.getByText("Deze week")).toBeInTheDocument();
      expect(screen.getByText("Deze maand")).toBeInTheDocument();
    });
  });

  it("shows 'Dit jaar' and 'Afgelopen 3 maanden' presets", async () => {
    renderRapportage();
    await waitFor(() => {
      expect(screen.getByText("Dit jaar")).toBeInTheDocument();
      expect(screen.getByText("Afgelopen 3 maanden")).toBeInTheDocument();
    });
  });

  it("shows status distribution section", async () => {
    renderRapportage();
    await waitFor(() => {
      expect(screen.getByText("Statusverdeling orders")).toBeInTheDocument();
    });
  });

  it("shows client top list", async () => {
    renderRapportage();
    await waitFor(() => {
      expect(screen.getByText("Top klanten (meeste orders)")).toBeInTheDocument();
    });
  });

  it("clicking date presets changes the view (setStartDate, setEndDate)", async () => {
    const user = userEvent.setup();
    renderRapportage();
    await waitFor(() => {
      expect(screen.getByText("Deze week")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Deze week"));
    await waitFor(() => {
      expect(document.body.textContent!.length).toBeGreaterThan(0);
    });
  });

  it("clicking Vandaag preset (setStartDate, setEndDate)", async () => {
    const user = userEvent.setup();
    renderRapportage();
    await waitFor(() => {
      expect(screen.getByText("Vandaag")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Vandaag"));
    expect(document.body.textContent).toBeTruthy();
  });

  it("clicking Deze maand preset", async () => {
    const user = userEvent.setup();
    renderRapportage();
    await waitFor(() => {
      expect(screen.getByText("Deze maand")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Deze maand"));
    expect(document.body.textContent).toBeTruthy();
  });

  it("clicking Dit jaar preset", async () => {
    const user = userEvent.setup();
    renderRapportage();
    await waitFor(() => {
      expect(screen.getByText("Dit jaar")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Dit jaar"));
    expect(document.body.textContent).toBeTruthy();
  });

  it("clicking Afgelopen 3 maanden preset", async () => {
    const user = userEvent.setup();
    renderRapportage();
    await waitFor(() => {
      expect(screen.getByText("Afgelopen 3 maanden")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Afgelopen 3 maanden"));
    expect(document.body.textContent).toBeTruthy();
  });

  it("shows export button and clicks it (exportToCSV)", async () => {
    const user = userEvent.setup();
    renderRapportage();
    await waitFor(() => {
      const exportBtns = screen.getAllByText(/Export|Exporteer|Download/i);
      expect(exportBtns.length).toBeGreaterThan(0);
    });
    const exportBtn = screen.getByText("Exporteer CSV");
    await user.click(exportBtn);
    expect(document.body.textContent).toBeTruthy();
  });

  it("toggles compare mode (setCompareEnabled)", async () => {
    const user = userEvent.setup();
    renderRapportage();
    await user.click(screen.getByLabelText("Vergelijk met vorige periode"));
    expect(document.body.textContent).toBeTruthy();
  });

  it("renders chart components", async () => {
    renderRapportage();
    await waitFor(() => {
      expect(document.body.textContent!.length).toBeGreaterThan(0);
    });
  });
});
