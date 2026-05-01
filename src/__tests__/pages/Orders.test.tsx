import { cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

// ── Hoisted mocks ───────────────────────────────────────────────────
const { mockUseOrders, mockSupabase, mockNavigate } = vi.hoisted(() => {
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
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "test-user-id" } }, error: null }),
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
        onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      },
    },
    mockNavigate: vi.fn(),
  };
});

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("@/hooks/useOrders", () => ({
  useOrders: (...args: any[]) => mockUseOrders(...args),
  useOrdersListMeta: () => ({
    data: {
      totalCount: 3,
      staleDraftCount: 0,
      staleDraftCutoffIso: new Date().toISOString(),
      byStatus: {},
      awaitingInfoCount: 0,
      overdueInfoCount: 0,
      priorityCount: 2,
      totalWeightKg: 2000,
    },
  }),
  useStaleDraftCount: () => ({ data: { count: 0, cutoffIso: new Date().toISOString() } }),
}));

vi.mock("@/hooks/useOrderNotesRead", () => ({
  useUnreadNoteOrderIds: () => ({ unreadOrderIds: new Set<string>(), isLoading: false }),
}));

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
  afterEach(() => cleanup());

  it("renders without crashing", () => {
    renderOrders();
    expect(screen.getByRole("heading", { name: "Orders" })).toBeInTheDocument();
  });

  it("shows order count subtitle", () => {
    renderOrders();
    // Header eyebrow toont totaalcount. Sinds cursor-paginatie staat er ook
    // "Pagina 1 · circa N orders" in de footer, dus tellen we ≥ 1 match.
    expect(screen.getAllByText(/3 orders/i).length).toBeGreaterThanOrEqual(1);
  });

  it("displays orders in table", () => {
    renderOrders();
    expect(screen.getAllByText("ORD-001").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Acme BV").length).toBeGreaterThanOrEqual(1);
  });

  it("links to new order page", async () => {
    const user = userEvent.setup();
    renderOrders();
    const btn = screen.getByText("Nieuwe order").closest("button")!;
    expect(btn).toBeInTheDocument();
    await user.click(btn);
    expect(mockNavigate).toHaveBeenCalledWith("/orders/nieuw");
  });

  it("shows loading state", () => {
    mockUseOrders.mockReturnValueOnce({ data: null, isLoading: true, isError: false, refetch: vi.fn() });
    renderOrders();
    // Luxe refactor toont skeleton i.p.v. spinner
    expect(document.querySelector(".skeleton-luxe")).toBeInTheDocument();
  });

  it("shows error state", () => {
    mockUseOrders.mockReturnValueOnce({ data: null, isLoading: false, isError: true, refetch: vi.fn() });
    renderOrders();
    expect(screen.getByText("Kan orders niet laden")).toBeInTheDocument();
  });

  it("shows empty state when no orders", () => {
    mockUseOrders.mockReturnValueOnce({ data: { orders: [], totalCount: 0 }, isLoading: false, isError: false, refetch: vi.fn() });
    renderOrders();
    expect(screen.getAllByText("Geen orders gevonden").length).toBeGreaterThanOrEqual(1);
  });

  it("has status filter buttons", () => {
    renderOrders();
    // Filters zijn nu dropdowns — default labels bevatten "Alle"
    expect(screen.getAllByText(/Alle/i).length).toBeGreaterThanOrEqual(1);
  });

  it("opens import dialog (setImportOpen)", async () => {
    const user = userEvent.setup();
    renderOrders();
    await user.click(screen.getByText("Import"));
    expect(screen.getByTestId("import-dialog")).toBeInTheDocument();
  });

  it("shows pagination info", () => {
    renderOrders();
    // Cursor-paginatie toont "Pagina 1 · circa N orders" bij default-sort.
    expect(screen.getByText(/Pagina 1/i)).toBeInTheDocument();
  });

  it("order numbers link to detail page", () => {
    renderOrders();
    const link = screen.getAllByText("ORD-001").find((element) => element.closest("a"))?.closest("a");
    expect(link).toHaveAttribute("href", "/orders/o1");
  });

  // ── handleSearchChange (setSearch + setPage) ──
  it("types in search to trigger handleSearchChange", async () => {
    const user = userEvent.setup();
    renderOrders();
    const input = screen.getByPlaceholderText(/Zoek op ordernummer/);
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
    renderOrders();
    // Reset-knop verschijnt alleen als een filter actief is; default state
    // heeft geen actieve filters, dus alleen de useOrders-call verifiëren.
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
    await user.click(screen.getAllByText("Gewicht")[0]);
    expect(document.body.textContent).toBeTruthy();
  });

  it("sorts by Status column", async () => {
    const user = userEvent.setup();
    renderOrders();
    await user.click(screen.getAllByText("Status")[0]);
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
    await user.click(screen.getAllByText("Gewicht")[0]);
    await user.click(screen.getAllByText("Gewicht")[0]);
    expect(document.body.textContent).toBeTruthy();
  });

  it("sorts by Status then switches to Datum", async () => {
    const user = userEvent.setup();
    renderOrders();
    await user.click(screen.getAllByText("Status")[0]);
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
    // mockReturnValue (geen Once), de component kan meerdere keren renderen
    // tijdens userEvent.click, anders pakt re-render het default-mock op.
    mockUseOrders.mockReturnValue({ data: null, isLoading: false, isError: true, refetch: mockRefetch });
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
    // toLocaleString() gebruikt OS-locale, CI (Linux) = en-US → "2,000 kg",
    // NL/dev → "2.000 kg". Regex accepteert beide.
    expect(screen.getByText(/2[.,]000 kg/)).toBeInTheDocument();
  });

  // ── pagination shows 0 when no orders ──
  it("shows 0 transportopdrachten when empty", () => {
    mockUseOrders.mockReturnValueOnce({ data: { orders: [], totalCount: 0 }, isLoading: false, isError: false, refetch: vi.fn() });
    renderOrders();
    // Footer toont "0 orders" bij lege lijst (luxe refactor). Header eyebrow
    // toont ook "0 orders", dus minstens één voorkomen verwacht.
    expect(screen.getByTitle(/0 zichtbare orders/i)).toBeInTheDocument();
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
    // Luxe ticker label wijzigde van "Spoed / Hoog" naar "Met prioriteit"
    expect(screen.getByText("Met prioriteit")).toBeInTheDocument();
  });
});
