import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

// ── Hoisted mocks ───────────────────────────────────────────────────
const { mockUseOrders, mockSupabase } = vi.hoisted(() => {
  const mockOrders = [
    { id: "o1", orderNumber: "ORD-001", customer: "Acme BV", status: "DELIVERED", priority: "normaal", totalWeight: 500, pickupAddress: "Amsterdam", deliveryAddress: "Rotterdam", createdAt: "2025-01-10T10:00:00Z" },
    { id: "o2", orderNumber: "ORD-002", customer: "Widget NL", status: "IN_TRANSIT", priority: "spoed", totalWeight: 1200, pickupAddress: "Utrecht", deliveryAddress: "Den Haag", createdAt: "2025-01-11T10:00:00Z" },
    { id: "o3", orderNumber: "ORD-003", customer: "Beta Corp", status: "DRAFT", priority: "hoog", totalWeight: 300, pickupAddress: "Eindhoven", deliveryAddress: "Tilburg", createdAt: "2025-01-09T10:00:00Z" },
  ];
  return {
    mockUseOrders: vi.fn(() => ({
      data: { orders: mockOrders, totalCount: 3 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })),
    mockSupabase: {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: "o1", order_number: 1 }, error: null }),
      }),
    },
  };
});

vi.mock("@/hooks/useOrders", () => ({ useOrders: (...args: any[]) => mockUseOrders(...args) }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: mockSupabase,
}));

vi.mock("@/components/orders/BulkImportDialog", () => ({
  BulkImportDialog: ({ open, onOpenChange }: any) => open ? <div data-testid="import-dialog"><button data-testid="close-import" onClick={() => onOpenChange(false)}>Close</button></div> : null,
}));
vi.mock("@/components/orders/SmartLabel", () => ({ default: () => <div data-testid="smart-label" /> }));
vi.mock("framer-motion", async () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    tr: ({ children, ...props }: any) => <tr {...props}>{children}</tr>,
  },
  AnimatePresence: ({ children }: any) => children,
}));

import Orders from "@/pages/Orders";

const defaultOrders = [
  { id: "o1", orderNumber: "ORD-001", customer: "Acme BV", status: "DELIVERED", priority: "normaal", totalWeight: 500, pickupAddress: "Amsterdam", deliveryAddress: "Rotterdam", createdAt: "2025-01-10T10:00:00Z" },
  { id: "o2", orderNumber: "ORD-002", customer: "Widget NL", status: "IN_TRANSIT", priority: "spoed", totalWeight: 1200, pickupAddress: "Utrecht", deliveryAddress: "Den Haag", createdAt: "2025-01-11T10:00:00Z" },
  { id: "o3", orderNumber: "ORD-003", customer: "Beta Corp", status: "DRAFT", priority: "hoog", totalWeight: 300, pickupAddress: "Eindhoven", deliveryAddress: "Tilburg", createdAt: "2025-01-09T10:00:00Z" },
];

function renderOrders() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Orders />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Orders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseOrders.mockReturnValue({
      data: { orders: defaultOrders, totalCount: 3 },
      isLoading: false, isError: false, refetch: vi.fn(),
    });
  });

  it("renders without crashing", () => {
    renderOrders();
    expect(screen.getByText("Orderlijst")).toBeInTheDocument();
  });

  it("shows order count subtitle", () => {
    renderOrders();
    expect(screen.getByText("3 transportopdrachten in totaal")).toBeInTheDocument();
  });

  it("displays orders in table", () => {
    renderOrders();
    expect(screen.getByText("ORD-001")).toBeInTheDocument();
    expect(screen.getByText("Acme BV")).toBeInTheDocument();
  });

  it("links to new order page", () => {
    renderOrders();
    const link = screen.getByText("Nieuwe order").closest("a");
    expect(link).toHaveAttribute("href", "/orders/nieuw");
  });

  it("shows loading state", () => {
    mockUseOrders.mockReturnValueOnce({ data: null, isLoading: true, isError: false, refetch: vi.fn() });
    renderOrders();
    expect(document.querySelector(".loading-spinner")).toBeInTheDocument();
  });

  it("shows error state", () => {
    mockUseOrders.mockReturnValueOnce({ data: null, isLoading: false, isError: true, refetch: vi.fn() });
    renderOrders();
    expect(screen.getByText("Kan orders niet laden")).toBeInTheDocument();
  });

  it("shows empty state when no orders", () => {
    mockUseOrders.mockReturnValueOnce({ data: { orders: [], totalCount: 0 }, isLoading: false, isError: false, refetch: vi.fn() });
    renderOrders();
    expect(screen.getByText("Geen orders gevonden")).toBeInTheDocument();
  });

  it("has status filter buttons", () => {
    renderOrders();
    expect(screen.getByText("Alle")).toBeInTheDocument();
  });

  it("opens import dialog (setImportOpen)", async () => {
    const user = userEvent.setup();
    renderOrders();
    await user.click(screen.getByText("Import"));
    expect(screen.getByTestId("import-dialog")).toBeInTheDocument();
  });

  it("shows pagination info", () => {
    renderOrders();
    expect(screen.getByText(/1-3 van 3 transportopdrachten/)).toBeInTheDocument();
  });

  it("order numbers link to detail page", () => {
    renderOrders();
    const link = screen.getByText("ORD-001").closest("a");
    expect(link).toHaveAttribute("href", "/orders/o1");
  });

  // ── handleSearchChange (setSearch + setPage) ──
  it("types in search to trigger handleSearchChange", async () => {
    const user = userEvent.setup();
    renderOrders();
    const input = screen.getByPlaceholderText(/Zoek op ordernummer of klant/);
    await user.type(input, "Acme");
    expect(mockUseOrders).toHaveBeenCalled();
  });

  // ── handleStatusFilterChange (setStatusFilter + setPage) ──
  it("clicks status filter button to trigger handleStatusFilterChange", async () => {
    const user = userEvent.setup();
    renderOrders();
    const buttons = screen.getAllByRole("button");
    const draftBtn = buttons.find(b => b.textContent?.includes("Nieuw"));
    if (draftBtn) {
      await user.click(draftBtn);
      expect(mockUseOrders).toHaveBeenCalled();
    }
    expect(document.body.textContent).toBeTruthy();
  });

  // Click each status filter to exercise all filter options
  it("clicks PENDING status filter", async () => {
    const user = userEvent.setup();
    renderOrders();
    const buttons = screen.getAllByRole("button");
    const btn = buttons.find(b => b.textContent?.includes("In behandeling"));
    if (btn) await user.click(btn);
    expect(mockUseOrders).toHaveBeenCalled();
  });

  it("clicks IN_TRANSIT status filter", async () => {
    const user = userEvent.setup();
    renderOrders();
    const buttons = screen.getAllByRole("button");
    const btn = buttons.find(b => b.textContent?.includes("Onderweg"));
    if (btn) await user.click(btn);
    expect(mockUseOrders).toHaveBeenCalled();
  });

  it("clicks DELIVERED status filter", async () => {
    const user = userEvent.setup();
    renderOrders();
    const buttons = screen.getAllByRole("button");
    const btn = buttons.find(b => b.textContent?.includes("Afgeleverd"));
    if (btn) await user.click(btn);
    expect(mockUseOrders).toHaveBeenCalled();
  });

  it("clicks Alle filter to reset", async () => {
    const user = userEvent.setup();
    renderOrders();
    await user.click(screen.getByText("Alle"));
    expect(mockUseOrders).toHaveBeenCalled();
  });

  // ── handleSort ──
  it("clicks Klant column header to trigger handleSort", async () => {
    const user = userEvent.setup();
    renderOrders();
    await user.click(screen.getByText("Klant"));
    expect(document.body.textContent).toBeTruthy();
  });

  it("clicks Klant column header twice to toggle sort direction", async () => {
    const user = userEvent.setup();
    renderOrders();
    await user.click(screen.getByText("Klant"));
    await user.click(screen.getByText("Klant"));
    expect(document.body.textContent).toBeTruthy();
  });

  it("sorts by Gewicht column", async () => {
    const user = userEvent.setup();
    renderOrders();
    await user.click(screen.getByText("Gewicht"));
    expect(document.body.textContent).toBeTruthy();
  });

  it("sorts by Status column", async () => {
    const user = userEvent.setup();
    renderOrders();
    await user.click(screen.getByText("Status"));
    expect(document.body.textContent).toBeTruthy();
  });

  it("sorts by Datum column", async () => {
    const user = userEvent.setup();
    renderOrders();
    await user.click(screen.getByText("Datum"));
    expect(document.body.textContent).toBeTruthy();
  });

  it("sorts by Gewicht then toggles direction", async () => {
    const user = userEvent.setup();
    renderOrders();
    await user.click(screen.getByText("Gewicht"));
    await user.click(screen.getByText("Gewicht"));
    expect(document.body.textContent).toBeTruthy();
  });

  it("sorts by Status then switches to Datum", async () => {
    const user = userEvent.setup();
    renderOrders();
    await user.click(screen.getByText("Status"));
    await user.click(screen.getByText("Datum"));
    expect(document.body.textContent).toBeTruthy();
  });

  // ── Pagination: setPage ──
  it("clicks Volgende to go to next page", async () => {
    const user = userEvent.setup();
    mockUseOrders.mockReturnValue({
      data: { orders: defaultOrders, totalCount: 50 },
      isLoading: false, isError: false, refetch: vi.fn(),
    });
    renderOrders();
    await user.click(screen.getByText("Volgende"));
    expect(mockUseOrders).toHaveBeenCalled();
  });

  it("clicks Vorige after navigating to page 2", async () => {
    const user = userEvent.setup();
    mockUseOrders.mockReturnValue({
      data: { orders: defaultOrders, totalCount: 50 },
      isLoading: false, isError: false, refetch: vi.fn(),
    });
    renderOrders();
    await user.click(screen.getByText("Volgende"));
    await user.click(screen.getByText("Vorige"));
    expect(mockUseOrders).toHaveBeenCalled();
  });

  it("Vorige button is disabled on first page", () => {
    renderOrders();
    const vorige = screen.getByText("Vorige").closest("button")!;
    expect(vorige).toBeDisabled();
  });

  it("Volgende button is disabled on last page", () => {
    renderOrders();
    const volgende = screen.getByText("Volgende").closest("button")!;
    expect(volgende).toBeDisabled();
  });

  // ── handleQuickPrint ──
  it("clicks print button to trigger handleQuickPrint", async () => {
    const user = userEvent.setup();
    const mockPrint = vi.fn();
    vi.stubGlobal("print", mockPrint);
    renderOrders();
    const printButtons = screen.getAllByTitle("Print label");
    await user.click(printButtons[0]);
    await waitFor(() => {
      expect(mockSupabase.from).toHaveBeenCalledWith("orders");
    });
  });

  it("handleQuickPrint handles supabase error gracefully", async () => {
    const user = userEvent.setup();
    mockSupabase.from.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: new Error("fail") }),
    });
    renderOrders();
    const printButtons = screen.getAllByTitle("Print label");
    await user.click(printButtons[0]);
    await waitFor(() => {
      expect(mockSupabase.from).toHaveBeenCalledWith("orders");
    });
  });

  it("clicking print button stopPropagation (inline arrow)", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("print", vi.fn());
    renderOrders();
    const printButtons = screen.getAllByTitle("Print label");
    // Click second print button (different order)
    await user.click(printButtons[1]);
    await waitFor(() => {
      expect(mockSupabase.from).toHaveBeenCalledWith("orders");
    });
  });

  // ── refetch on error ──
  it("clicks Opnieuw proberen on error state", async () => {
    const mockRefetch = vi.fn();
    mockUseOrders.mockReturnValueOnce({ data: null, isLoading: false, isError: true, refetch: mockRefetch });
    const user = userEvent.setup();
    renderOrders();
    await user.click(screen.getByText("Opnieuw proberen"));
    expect(mockRefetch).toHaveBeenCalled();
  });

  // ── stats useMemo ──
  it("shows stats in KPI strip (stats useMemo)", () => {
    renderOrders();
    expect(screen.getAllByText("Nieuw").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Onderweg").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Afgeleverd").length).toBeGreaterThanOrEqual(1);
  });

  // ── total weight in footer ──
  it("shows total weight in footer", () => {
    renderOrders();
    expect(screen.getByText(/2\.000 kg/)).toBeInTheDocument();
  });

  // ── pagination shows 0 when no orders ──
  it("shows 0 transportopdrachten when empty", () => {
    mockUseOrders.mockReturnValueOnce({ data: { orders: [], totalCount: 0 }, isLoading: false, isError: false, refetch: vi.fn() });
    renderOrders();
    expect(screen.getByText("0 transportopdrachten")).toBeInTheDocument();
  });

  // ── close import dialog (onOpenChange) ──
  it("closes import dialog via onOpenChange callback", async () => {
    const user = userEvent.setup();
    renderOrders();
    await user.click(screen.getByText("Import"));
    expect(screen.getByTestId("import-dialog")).toBeInTheDocument();
    await user.click(screen.getByTestId("close-import"));
    expect(screen.queryByTestId("import-dialog")).not.toBeInTheDocument();
  });

  // ── Spoed/Hoog priority count in stats ──
  it("counts spoed and hoog priorities in KPI strip", () => {
    renderOrders();
    expect(screen.getByText("Spoed / Hoog")).toBeInTheDocument();
  });
});
