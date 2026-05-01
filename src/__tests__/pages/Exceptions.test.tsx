import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockSupabase,
  mockFleetVehicles,
  mockUtilization,
  mockAnomalies,
  mockExceptionActionsData,
  mockExceptionActionRunsData,
  mockCreateExceptionActionMutateAsync,
  mockUpdateExceptionActionStatusMutate,
  mockExecuteExceptionActionMutate,
  mockResolveAnomalyMutate,
} = vi.hoisted(() => ({
  mockSupabase: {
    from: vi.fn(),
  },
  mockFleetVehicles: [] as any[],
  mockUtilization: {} as Record<string, number>,
  mockAnomalies: [] as any[],
  mockExceptionActionsData: [] as any[],
  mockExceptionActionRunsData: [] as any[],
  mockCreateExceptionActionMutateAsync: vi.fn().mockResolvedValue(undefined),
  mockUpdateExceptionActionStatusMutate: vi.fn(),
  mockExecuteExceptionActionMutate: vi.fn(),
  mockResolveAnomalyMutate: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));
vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({ tenant: { id: "t1" }, loading: false }),
  useTenantOptional: () => ({ tenant: { id: "t1" }, loading: false }),
}));
vi.mock("@/hooks/useSettings", () => ({
  useLoadSettings: () => ({ data: null, isLoading: false }),
}));
vi.mock("@/hooks/useFleet", () => ({
  useFleetVehicles: () => ({ data: mockFleetVehicles, isLoading: false }),
  useVehicleUtilization: () => ({ data: mockUtilization, isLoading: false }),
}));
vi.mock("@/hooks/useAnomalyDetection", () => ({
  useAnomalies: () => ({ data: mockAnomalies, isLoading: false }),
  useResolveAnomaly: () => ({ mutate: mockResolveAnomalyMutate, isPending: false }),
  anomalyToException: (anomaly: any) => ({
    id: `anomaly-${anomaly.id}`,
    type: "Voorspelde vertraging",
    urgency: anomaly.severity === "CRITICAL" ? "critical" : "warning",
    orderNumber: anomaly.orderNumber ?? "#ANOMALY",
    clientName: anomaly.clientName ?? "Onbekend",
    description: anomaly.description,
    detectedAt: new Date(anomaly.createdAt ?? Date.now()),
    actionLabel: "Bekijk order",
    actionTo: anomaly.orderId ? `/orders/${anomaly.orderId}` : "/exceptions",
  }),
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
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  },
  AnimatePresence: ({ children }: any) => children,
}));

import Exceptions from "@/pages/Exceptions";

function makeChain(data: any[] = []) {
  let result = data;
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    then: vi.fn().mockImplementation((cb: any) => cb({ data: result, error: null })),
  };
  return { ...chain, setResult: (next: any[]) => { result = next; } };
}

function setupMockData({
  drafts = [] as any[],
  inTransit = [] as any[],
  deliveryExceptions = [] as any[],
  vehicles = [] as any[],
  utilization = {} as Record<string, number>,
  anomalies = [] as any[],
} = {}) {
  mockFleetVehicles.splice(0, mockFleetVehicles.length, ...vehicles);
  Object.keys(mockUtilization).forEach((key) => delete mockUtilization[key]);
  Object.assign(mockUtilization, utilization);
  mockAnomalies.splice(0, mockAnomalies.length, ...anomalies);

  mockSupabase.from.mockImplementation((table: string) => {
    if (table === "delivery_exceptions") return makeChain(deliveryExceptions);
    if (table === "orders") {
      const chain = makeChain([]);
      chain.eq.mockImplementation((column: string, value: string) => {
        if (column === "status" && value === "DRAFT") chain.setResult(drafts);
        if (column === "status" && value === "IN_TRANSIT") chain.setResult(inTransit);
        return chain;
      });
      return chain;
    }
    return makeChain([]);
  });
}

function renderExceptions() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Exceptions />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Exceptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMockData();
    mockExceptionActionsData.length = 0;
    mockExceptionActionRunsData.length = 0;
  });

  afterEach(() => cleanup());

  it("renders the current triage shell and empty state", async () => {
    renderExceptions();

    expect(await screen.findByText("Uitzonderingen")).toBeInTheDocument();
    expect(screen.getByText("Actieve selectie: Alles")).toBeInTheDocument();
    expect(screen.getByText("Geen uitzonderingen")).toBeInTheDocument();
    expect(screen.getByText("Er zijn momenteel geen uitzonderingen die opvolging vereisen.")).toBeInTheDocument();
  });

  it("shows live delivery exceptions and can mark the selected exception resolved", async () => {
    const user = userEvent.setup();
    setupMockData({
      deliveryExceptions: [
        {
          id: "dex-1",
          exception_type: "DELAY",
          severity: "CRITICAL",
          description: "Vertraagd bij klant",
          order_id: "o1",
          trip_id: null,
          created_at: new Date().toISOString(),
          status: "OPEN",
        },
      ],
    });

    renderExceptions();

    expect((await screen.findAllByText("Vertraagd bij klant")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Vertraging").length).toBeGreaterThanOrEqual(1);

    await user.click(screen.getByRole("button", { name: /Markeer als opgelost/i }));

    await waitFor(() => {
      expect(mockSupabase.from).toHaveBeenCalledWith("delivery_exceptions");
    });
  });

  it("creates adhoc missing-data items and saves a Copilot suggestion", async () => {
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

    expect((await screen.findAllByText(/Ontbrekende velden/)).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Vraag ontbrekende info automatisch op").length).toBeGreaterThanOrEqual(1);

    await user.click(screen.getByRole("button", { name: /Opslaan als voorstel/i }));

    await waitFor(() => {
      expect(mockCreateExceptionActionMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: "REQUEST_MISSING_INFO",
          sourceRef: "missing-o1",
        }),
      );
    });
  });

  it("filters to critical exceptions via the planner focus", async () => {
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
      deliveryExceptions: [
        {
          id: "dex-1",
          exception_type: "DELAY",
          severity: "CRITICAL",
          description: "Critical delay",
          order_id: "o1",
          trip_id: null,
          created_at: new Date().toISOString(),
          status: "OPEN",
        },
      ],
    });

    renderExceptions();

    const criticalButtons = await screen.findAllByRole("button", { name: /Kritiek/i });
    await user.click(criticalButtons[0]);

    expect(await screen.findByText("Actieve selectie: Kritiek")).toBeInTheDocument();
    expect(screen.getAllByText("Critical delay").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/Ontbrekende velden/)).not.toBeInTheDocument();
  });

  it("shows capacity exceptions from utilization data", async () => {
    setupMockData({
      vehicles: [{ id: "v1", code: "V01", name: "Truck A", plate: "AB-123-CD" }],
      utilization: { v1: 96 },
    });

    renderExceptions();

    expect((await screen.findAllByText(/Voertuig AB-123-CD op 96% benutting/)).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Capaciteit").length).toBeGreaterThanOrEqual(1);
  });

  it("requires approval before executing pending Copilot actions", async () => {
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
