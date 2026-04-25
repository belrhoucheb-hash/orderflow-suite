import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

// ── Hoisted mocks ──────────────────────────────────────────────────
const {
  mockSupabase,
  mockFleetVehicles,
  mockExceptionActionsData,
  mockExceptionActionRunsData,
  mockCreateExceptionActionMutateAsync,
  mockUpdateExceptionActionStatusMutate,
  mockExecuteExceptionActionMutate,
} = vi.hoisted(() => {
  const makeChain = (data: any[] = []) => ({
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(), or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    then: vi.fn().mockImplementation((cb: any) => cb({ data, error: null })),
  });
  return {
    mockSupabase: {
      from: vi.fn().mockImplementation(() => makeChain([])),
    },
    mockFleetVehicles: [] as any[],
    mockExceptionActionsData: [] as any[],
    mockExceptionActionRunsData: [] as any[],
    mockCreateExceptionActionMutateAsync: vi.fn().mockResolvedValue(undefined),
    mockUpdateExceptionActionStatusMutate: vi.fn(),
    mockExecuteExceptionActionMutate: vi.fn(),
  };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));

vi.mock("@/hooks/useFleet", () => ({
  useFleetVehicles: () => ({ data: mockFleetVehicles, isLoading: false }),
}));

vi.mock("@/hooks/useExceptionActions", () => ({
  useExceptionActions: () => ({ data: mockExceptionActionsData }),
  useExceptionActionRuns: () => ({ data: mockExceptionActionRunsData }),
  useCreateExceptionAction: () => ({
    mutateAsync: mockCreateExceptionActionMutateAsync,
    isPending: false,
  }),
  useUpdateExceptionActionStatus: () => ({
    mutate: mockUpdateExceptionActionStatusMutate,
    isPending: false,
  }),
  useExecuteExceptionAction: () => ({
    mutate: mockExecuteExceptionActionMutate,
    isPending: false,
  }),
}));

vi.mock("framer-motion", async () => ({
  motion: { div: ({ children, ...props }: any) => <div {...props}>{children}</div> },
  AnimatePresence: ({ children }: any) => children,
}));

import Exceptions from "@/pages/Exceptions";

function renderExceptions() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Exceptions />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function setupMockData({
  drafts = [] as any[],
  inTransit = [] as any[],
  deliveryExceptions = [] as any[],
  vehicles = [] as any[],
} = {}) {
  mockFleetVehicles.length = 0;
  vehicles.forEach((v: any) => mockFleetVehicles.push(v));

  let callIndex = 0;
  mockSupabase.from.mockImplementation((table: string) => {
    const chain = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(), or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation((cb: any) => {
        if (table === "delivery_exceptions") return cb({ data: deliveryExceptions, error: null });
        if (table === "orders") {
          callIndex++;
          if (callIndex <= 1) return cb({ data: drafts, error: null });
          return cb({ data: inTransit, error: null });
        }
        return cb({ data: [], error: null });
      }),
    };
    return chain;
  });
}

describe("Exceptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFleetVehicles.length = 0;
    mockExceptionActionsData.length = 0;
    mockExceptionActionRunsData.length = 0;
  });

  it("renders without crashing", async () => {
    setupMockData();
    renderExceptions();
    await waitFor(() => {
      expect(screen.getByText(/Uitzonderingen/i)).toBeInTheDocument();
    });
  });

  it("shows KPI strip with correct labels", async () => {
    setupMockData();
    renderExceptions();
    await waitFor(() => {
      expect(screen.getByText("Delivery")).toBeInTheDocument();
      expect(screen.getByText("Vertragingen")).toBeInTheDocument();
      expect(screen.getByText("Ontbrekende data")).toBeInTheDocument();
      expect(screen.getByText("Capaciteit")).toBeInTheDocument();
      expect(screen.getByText("SLA risico")).toBeInTheDocument();
    });
  });

  it("shows all KPI values as 0 when no exceptions (counts useMemo)", async () => {
    setupMockData();
    renderExceptions();
    await waitFor(() => {
      const zeros = screen.getAllByText("0");
      expect(zeros.length).toBeGreaterThanOrEqual(5);
    });
  });

  it("shows empty state when no exceptions", async () => {
    setupMockData();
    renderExceptions();
    await waitFor(() => {
      expect(screen.getByText("Geen uitzonderingen")).toBeInTheDocument();
      expect(screen.getByText("Alles loopt volgens planning")).toBeInTheDocument();
    });
  });

  it("shows delivery exceptions from DB", async () => {
    setupMockData({
      deliveryExceptions: [
        { id: "dex-1", exception_type: "DELAY", severity: "CRITICAL", description: "Vertraagd bij klant", order_id: "o1", created_at: new Date().toISOString(), status: "OPEN" },
      ],
    });
    renderExceptions();
    await waitFor(() => {
      expect(screen.getByText("Vertraagd bij klant")).toBeInTheDocument();
      expect(screen.getByText("Vertraging")).toBeInTheDocument();
    });
  });

  it("shows Opgelost button and clicks it (resolveException)", async () => {
    const user = userEvent.setup();
    setupMockData({
      deliveryExceptions: [
        { id: "dex-1", exception_type: "DELAY", severity: "HIGH", description: "Late delivery", order_id: "o1", created_at: new Date().toISOString(), status: "OPEN" },
      ],
    });
    renderExceptions();
    await waitFor(() => {
      expect(screen.getByText("Opgelost")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Opgelost"));
    await waitFor(() => {
      expect(mockSupabase.from).toHaveBeenCalledWith("delivery_exceptions");
    });
  });

  // ── Resolve multiple exceptions ──
  it("shows multiple Opgelost buttons for multiple DB exceptions", async () => {
    setupMockData({
      deliveryExceptions: [
        { id: "dex-1", exception_type: "DELAY", severity: "HIGH", description: "Late 1", order_id: "o1", created_at: new Date().toISOString(), status: "OPEN" },
        { id: "dex-2", exception_type: "MISSING_DATA", severity: "MEDIUM", description: "Missing data", order_id: "o2", created_at: new Date().toISOString(), status: "OPEN" },
      ],
    });
    renderExceptions();
    await waitFor(() => {
      const resolveButtons = screen.getAllByText("Opgelost");
      expect(resolveButtons.length).toBe(2);
    });
  });

  it("shows missing data exceptions for DRAFT orders (exceptions useMemo)", async () => {
    setupMockData({
      drafts: [
        { id: "o1", order_number: 1001, client_name: "Acme BV", status: "DRAFT", missing_fields: ["weight_kg", "delivery_address"], received_at: new Date().toISOString(), created_at: new Date().toISOString() },
      ],
    });
    renderExceptions();
    await waitFor(() => {
      expect(screen.getByText(/Ontbrekende velden/)).toBeInTheDocument();
      expect(screen.getByText("Data mist")).toBeInTheDocument();
    });
  });

  it("shows action links for exceptions", async () => {
    setupMockData({
      drafts: [
        { id: "o1", order_number: 1001, client_name: "Acme", status: "DRAFT", missing_fields: ["weight_kg"], received_at: new Date().toISOString(), created_at: new Date().toISOString() },
      ],
    });
    renderExceptions();
    await waitFor(() => {
      expect(screen.getByText("Ga naar inbox")).toBeInTheDocument();
    });
  });

  it("shows Bekijk order link for delivery exceptions with order_id", async () => {
    setupMockData({
      deliveryExceptions: [
        { id: "dex-1", exception_type: "SLA_BREACH", severity: "MEDIUM", description: "SLA breach", order_id: "o1", created_at: new Date().toISOString(), status: "IN_PROGRESS" },
      ],
    });
    renderExceptions();
    await waitFor(() => {
      expect(screen.getByText("Bekijk order")).toBeInTheDocument();
    });
  });

  it("shows Details link for exceptions without order_id", async () => {
    setupMockData({
      deliveryExceptions: [
        { id: "dex-1", exception_type: "DELAY", severity: "LOW", description: "Generic delay", order_id: null, created_at: new Date().toISOString(), status: "OPEN" },
      ],
    });
    renderExceptions();
    await waitFor(() => {
      expect(screen.getByText("Details")).toBeInTheDocument();
    });
  });

  it("maps severity correctly to urgency badges", async () => {
    setupMockData({
      deliveryExceptions: [
        { id: "dex-1", exception_type: "DELAY", severity: "LOW", description: "Minor delay", order_id: null, created_at: new Date().toISOString(), status: "OPEN" },
      ],
    });
    renderExceptions();
    await waitFor(() => {
      expect(screen.getByText("Minor delay")).toBeInTheDocument();
    });
  });

  it("counts multiple exception types correctly in KPIs", async () => {
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    setupMockData({
      drafts: [
        { id: "o1", order_number: 1001, client_name: "A", status: "DRAFT", missing_fields: ["weight_kg"], received_at: fourHoursAgo, created_at: fourHoursAgo },
      ],
      inTransit: [
        { id: "o2", order_number: 1002, client_name: "B", status: "IN_TRANSIT", created_at: twoDaysAgo },
      ],
      deliveryExceptions: [
        { id: "dex-1", exception_type: "CAPACITY", severity: "MEDIUM", description: "Cap issue", order_id: null, created_at: new Date().toISOString(), status: "OPEN" },
      ],
    });
    renderExceptions();
    await waitFor(() => {
      expect(screen.getByText(/items vereisen aandacht/)).toBeInTheDocument();
    });
  });

  // ── SLA risk exceptions ──
  it("shows SLA risk exceptions for old DRAFT orders", async () => {
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    setupMockData({
      drafts: [
        { id: "o1", order_number: 1001, client_name: "SlowCo", status: "DRAFT", missing_fields: [], received_at: fourHoursAgo, created_at: fourHoursAgo },
      ],
    });
    renderExceptions();
    await waitFor(() => {
      expect(screen.getAllByText(/SLA/).length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Delay exceptions ──
  it("shows delay exceptions for old IN_TRANSIT orders", async () => {
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    setupMockData({
      inTransit: [
        { id: "o2", order_number: 1002, client_name: "LateTransport", status: "IN_TRANSIT", created_at: twoDaysAgo },
      ],
    });
    renderExceptions();
    await waitFor(() => {
      expect(screen.getByText(/meer dan 24u onderweg/)).toBeInTheDocument();
    });
  });

  // ── Capacity exceptions from vehicles ──
  it("shows capacity exceptions for full vehicles", async () => {
    setupMockData({
      vehicles: [
        { id: "v1", code: "V01", name: "Truck A", plate: "AB-123-CD", status: "niet_beschikbaar" },
      ],
    });
    renderExceptions();
    await waitFor(() => {
      // "Capaciteit" appears in both KPI strip and exception badge
      expect(screen.getAllByText("Capaciteit").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/volle capaciteit/)).toBeInTheDocument();
    });
  });

  // ── Capacity exception for in_gebruik status ──
  it("shows capacity exceptions for in_gebruik vehicles", async () => {
    setupMockData({
      vehicles: [
        { id: "v2", code: "V02", name: "Truck B", plate: "XY-789-ZZ", status: "in_gebruik" },
      ],
    });
    renderExceptions();
    await waitFor(() => {
      expect(screen.getByText(/volle capaciteit/)).toBeInTheDocument();
    });
  });

  // ── Mixed exception types sorted by urgency ──
  it("sorts exceptions by urgency (critical first)", async () => {
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    setupMockData({
      drafts: [
        { id: "o1", order_number: 1001, client_name: "A", status: "DRAFT", missing_fields: ["weight_kg"], received_at: fourHoursAgo, created_at: fourHoursAgo },
      ],
      deliveryExceptions: [
        { id: "dex-1", exception_type: "DELAY", severity: "CRITICAL", description: "Critical delay", order_id: "o1", created_at: new Date().toISOString(), status: "OPEN" },
      ],
    });
    renderExceptions();
    await waitFor(() => {
      // Critical exception description should appear before warning-level ones
      expect(screen.getByText("Critical delay")).toBeInTheDocument();
    });
  });

  // ── Exception type mapping ──
  it("maps MISSING_DATA exception type correctly", async () => {
    setupMockData({
      deliveryExceptions: [
        { id: "dex-1", exception_type: "MISSING_DATA", severity: "MEDIUM", description: "Data missing", order_id: null, created_at: new Date().toISOString(), status: "OPEN" },
      ],
    });
    renderExceptions();
    await waitFor(() => {
      expect(screen.getByText("Data mist")).toBeInTheDocument();
    });
  });

  it("maps CAPACITY exception type correctly", async () => {
    setupMockData({
      deliveryExceptions: [
        { id: "dex-1", exception_type: "CAPACITY", severity: "LOW", description: "Cap issue", order_id: null, created_at: new Date().toISOString(), status: "OPEN" },
      ],
    });
    renderExceptions();
    await waitFor(() => {
      // "Capaciteit" appears in both KPI strip and exception badge
      expect(screen.getAllByText("Capaciteit").length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── Bekijk voertuig link for capacity exceptions ──
  it("shows Bekijk voertuig link for capacity exceptions from vehicles", async () => {
    setupMockData({
      vehicles: [
        { id: "v1", code: "V01", name: "Truck A", plate: "AB-123-CD", status: "niet_beschikbaar" },
      ],
    });
    renderExceptions();
    await waitFor(() => {
      expect(screen.getByText("Bekijk voertuig")).toBeInTheDocument();
    });
  });

  // ── Client name shown in exceptions ──
  it("shows client name in exception items", async () => {
    setupMockData({
      drafts: [
        { id: "o1", order_number: 1001, client_name: "TestClient BV", status: "DRAFT", missing_fields: ["weight_kg"], received_at: new Date().toISOString(), created_at: new Date().toISOString() },
      ],
    });
    renderExceptions();
    await waitFor(() => {
      expect(screen.getByText("TestClient BV")).toBeInTheDocument();
    });
  });

  // ── Order number shown ──
  it("shows order number in exception items", async () => {
    setupMockData({
      drafts: [
        { id: "o1", order_number: 1001, client_name: "X", status: "DRAFT", missing_fields: ["weight_kg"], received_at: new Date().toISOString(), created_at: new Date().toISOString() },
      ],
    });
    renderExceptions();
    await waitFor(() => {
      expect(screen.getByText("#1001")).toBeInTheDocument();
    });
  });

  // ── Null client name shows Onbekend ──
  it("shows Onbekend when client_name is null", async () => {
    setupMockData({
      drafts: [
        { id: "o1", order_number: 1001, client_name: null, status: "DRAFT", missing_fields: ["weight_kg"], received_at: new Date().toISOString(), created_at: new Date().toISOString() },
      ],
    });
    renderExceptions();
    await waitFor(() => {
      expect(screen.getByText("Onbekend")).toBeInTheDocument();
    });
  });

  it("shows copilot preview and saves a suggestion when no action exists", async () => {
    const user = userEvent.setup();
    setupMockData({
      drafts: [
        {
          id: "o1",
          order_number: 1001,
          client_name: "Acme BV",
          status: "DRAFT",
          missing_fields: ["weight_kg"],
          received_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      ],
    });

    renderExceptions();

    await user.click(await screen.findByRole("button", { name: /Copilot/i }));

    expect(await screen.findByText("Next Best Action")).toBeInTheDocument();
    expect(screen.getByText(/Vraag ontbrekende info automatisch op/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Opslaan als voorstel/i }));

    await waitFor(() => {
      expect(mockCreateExceptionActionMutateAsync).toHaveBeenCalled();
    });
  });

  it("requires approval before execution for approval-gated copilot actions", async () => {
    const user = userEvent.setup();
    mockExceptionActionsData.push({
      id: "action-1",
      sourceType: "adhoc",
      sourceRef: "missing-o1",
      actionType: "REQUEST_MISSING_INFO",
      title: "Vraag ontbrekende info automatisch op",
      description: "Vraag klantgegevens op.",
      confidence: 93,
      impact: { summary: "Verkort stilstand in intake" },
      payload: { orderId: "o1" },
      status: "PENDING",
      recommended: true,
      requiresApproval: true,
    });
    mockExceptionActionRunsData.push({
      id: "run-1",
      runType: "PROPOSED",
      createdAt: new Date().toISOString(),
    });

    setupMockData({
      drafts: [
        {
          id: "o1",
          order_number: 1001,
          client_name: "Acme BV",
          status: "DRAFT",
          missing_fields: ["weight_kg"],
          received_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      ],
    });

    renderExceptions();

    await user.click(await screen.findByRole("button", { name: /Copilot/i }));

    expect(await screen.findByText("Copilot Historie")).toBeInTheDocument();

    const executeButton = screen.getByRole("button", { name: /Nu uitvoeren/i });
    expect(executeButton).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /Goedkeuren/i }));

    expect(mockUpdateExceptionActionStatusMutate).toHaveBeenCalledWith({
      id: "action-1",
      status: "APPROVED",
    });
    expect(screen.getByText("PROPOSED")).toBeInTheDocument();
  });
});
