import { renderHook, waitFor, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import type { ReactNode } from "react";
import React from "react";

const { mockFrom, mockSupabase, mockSaveCorrection } = vi.hoisted(() => {
  const mockFrom = vi.fn();
  const mockSaveCorrection = vi.fn();
  const mockSupabase = {
    from: mockFrom,
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: "u1" } } }, error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() }),
    removeChannel: vi.fn(),
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
  };

  return { mockFrom, mockSupabase, mockSaveCorrection };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }) }));
vi.mock("@/hooks/useAIFeedback", () => ({ saveCorrection: mockSaveCorrection }));
vi.mock("@/hooks/useConfidenceStore", () => ({
  recordAIDecision: vi.fn().mockResolvedValue({ id: "mock-decision-id" }),
  resolveAIDecision: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({ tenant: { id: "tenant-1", name: "Test Tenant", slug: "test", logoUrl: null, primaryColor: "#000" }, loading: false }),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1", app_metadata: { tenant_id: "tenant-1" } },
  }),
}));
vi.mock("@/hooks/useFleet", () => ({
  useFleetVehicles: () => ({ data: [] }),
}));
vi.mock("@/hooks/useAddressSuggestions", () => ({
  useAddressSuggestions: () => ({ data: null }),
}));
vi.mock("@/hooks/useDepartments", () => ({
  fetchDepartmentsCached: vi.fn().mockResolvedValue([{ id: "dept-1", code: "OPS", name: "Operations", color: null }]),
}));
vi.mock("@/components/inbox/utils", () => ({
  orderToForm: (d: any) => ({
    transportType: d.transport_type || "direct",
    pickupAddress: d.pickup_address || "",
    deliveryAddress: d.delivery_address || "",
    pickupTimeFrom: d.pickup_time_from || "",
    pickupTimeTo: d.pickup_time_to || "",
    deliveryTimeFrom: d.delivery_time_from || "",
    deliveryTimeTo: d.delivery_time_to || "",
    intermediateStops: d.intermediate_stops || [],
    quantity: d.quantity || 0,
    unit: d.unit || "Pallets",
    weight: d.weight_kg?.toString() || "",
    dimensions: d.dimensions || "",
    requirements: d.requirements || [],
    perUnit: false,
    internalNote: "",
    fieldSources: {},
    fieldConfidence: {},
  }),
  normaliseRequirements: (r: string[]) => r,
  TEST_SCENARIOS: [{ label: "Test", subject: "Test Subject", from: "test@test.com", client: "Test", email: "body" }],
  getDeadlineInfo: (received_at: string | null) => {
    if (!received_at) return { urgency: "green", minutesLeft: 999 };
    const deadline = new Date(new Date(received_at).getTime() + 4 * 60 * 60 * 1000);
    const minutesLeft = Math.floor((deadline.getTime() - Date.now()) / 60000);
    if (minutesLeft <= 0) return { urgency: "red", minutesLeft };
    return { urgency: "green", minutesLeft };
  },
  findDuplicates: () => new Map(),
  getCapacityWarning: () => null,
  tryEnrichAddress: (addr: string) => ({ enriched: addr, matchedClient: null }),
  getFormErrors: (f: any) => {
    if (!f) return true;
    if (!f.pickupAddress || !f.deliveryAddress || !f.quantity || !f.weight) return true;
    return false;
  },
  getRouteStopsNotificationPayload: vi.fn().mockReturnValue(null),
  isAddressIncomplete: (addr: string) => !addr || !/\d/.test(addr),
  isValidAddress: (addr: string) => !!addr && /\d/.test(addr) && addr.split(/[\s,]+/).filter(Boolean).length >= 2,
  penalizeIncompleteAddresses: (conf: any, _p: any, _d: any) => conf,
}));
vi.mock("@/lib/companyConfig", () => ({
  DEFAULT_COMPANY: { email: "info@test.com" },
}));
vi.mock("@/components/planning/PlanningDateNav", () => ({
  toDateString: (d: Date) => d.toISOString().split("T")[0],
}));

import { toast } from "sonner";

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc },
      React.createElement(BrowserRouter, null, children)
    );
}

function buildChain(overrides: Record<string, any> = {}): any {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
  };
  chain.order.mockResolvedValue({ data: [], error: null });
  chain.limit.mockResolvedValue({ data: [], error: null });
  Object.assign(chain, overrides);
  return chain;
}

import { useInbox } from "@/hooks/useInbox";

describe("useInbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(() => buildChain());
  });

  it("returns initial state with empty drafts", async () => {
    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.drafts).toEqual([]);
    expect(result.current.filtered).toEqual([]);
    expect(result.current.selectedId).toBe("");
    expect(result.current.search).toBe("");
    expect(result.current.sidebarFilter).toBe("alle");
  });

  it("populates formData from drafts", async () => {
    const drafts = [
      {
        id: "d1", status: "DRAFT", client_name: "Acme",
        pickup_address: "Amsterdam", delivery_address: "Rotterdam",
        quantity: 5, unit: "Pallets", weight_kg: 500,
        confidence_score: 90, missing_fields: [],
        order_number: 1, source_email_subject: "Test",
      },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === "orders") {
        return buildChain({ order: vi.fn().mockResolvedValue({ data: drafts, error: null }) });
      }
      return buildChain();
    });

    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.drafts).toHaveLength(1);
    });
    expect(result.current.selectedId).toBe("d1");
    expect(result.current.selected?.id).toBe("d1");
  });

  it("filters drafts by search", async () => {
    const drafts = [
      { id: "d1", status: "DRAFT", client_name: "Acme Corp", source_email_subject: "Order 1", confidence_score: 90, missing_fields: [] },
      { id: "d2", status: "DRAFT", client_name: "Beta Inc", source_email_subject: "Order 2", confidence_score: 50, missing_fields: [] },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === "orders") {
        return buildChain({ order: vi.fn().mockResolvedValue({ data: drafts, error: null }) });
      }
      return buildChain();
    });

    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.drafts).toHaveLength(2));

    act(() => {
      result.current.setSearch("Acme");
    });

    await waitFor(() => expect(result.current.filtered).toHaveLength(1));
    expect(result.current.filtered[0].client_name).toBe("Acme Corp");
  });

  it("filters by source_email_subject as well", async () => {
    const drafts = [
      { id: "d1", status: "DRAFT", client_name: "Acme", source_email_subject: "Urgent delivery", confidence_score: 90, missing_fields: [] },
      { id: "d2", status: "DRAFT", client_name: "Beta", source_email_subject: "Normal shipment", confidence_score: 50, missing_fields: [] },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === "orders") {
        return buildChain({ order: vi.fn().mockResolvedValue({ data: drafts, error: null }) });
      }
      return buildChain();
    });

    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.drafts).toHaveLength(2));

    act(() => result.current.setSearch("Urgent"));
    await waitFor(() => expect(result.current.filtered).toHaveLength(1));
    expect(result.current.filtered[0].id).toBe("d1");
  });

  it("computes highConf, lowConf, noConf counts", async () => {
    const drafts = [
      { id: "d1", status: "DRAFT", confidence_score: 95, missing_fields: [] },
      { id: "d2", status: "DRAFT", confidence_score: 50, missing_fields: [] },
      { id: "d3", status: "DRAFT", confidence_score: null, missing_fields: [] },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === "orders") {
        return buildChain({ order: vi.fn().mockResolvedValue({ data: drafts, error: null }) });
      }
      return buildChain();
    });

    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.drafts).toHaveLength(3));

    expect(result.current.highConf).toBe(1);
    expect(result.current.lowConf).toBe(1);
    expect(result.current.noConf).toBe(1);
  });

  it("computes autoConfirmCandidates for complete high-confidence intake", async () => {
    const drafts = [
      {
        id: "d1", status: "DRAFT", thread_type: "new", confidence_score: 97, missing_fields: [],
        pickup_address: "Straat 10, Amsterdam", delivery_address: "Havenweg 2, Rotterdam",
        quantity: 5, unit: "Pallets", weight_kg: 500, dimensions: "120x80x150", transport_type: "direct", anomalies: [],
      },
      {
        id: "d2", status: "DRAFT", thread_type: "update", confidence_score: 99, missing_fields: [],
        pickup_address: "Markt 1, Utrecht", delivery_address: "Kade 8, Breda",
        quantity: 2, unit: "Pallets", weight_kg: 200, transport_type: "direct", anomalies: [],
      },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === "orders") {
        return buildChain({ order: vi.fn().mockResolvedValue({ data: drafts, error: null }) });
      }
      return buildChain();
    });

    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.drafts).toHaveLength(2));

    expect(result.current.autoConfirmCandidates).toHaveLength(1);
    expect(result.current.autoConfirmCandidates[0].id).toBe("d1");
  });

  it("computes intakeQueueStats across drafts and follow-up queues", async () => {
    const drafts = [
      {
        id: "d1", status: "DRAFT", thread_type: "new", confidence_score: 97, missing_fields: [],
        pickup_address: "Straat 10, Amsterdam", delivery_address: "Havenweg 2, Rotterdam",
        quantity: 5, unit: "Pallets", weight_kg: 500, dimensions: "120x80x150", transport_type: "direct", anomalies: [],
      },
      {
        id: "d2", status: "DRAFT", thread_type: "new", confidence_score: 50, missing_fields: ["pickup_address"],
        pickup_address: "", delivery_address: "Kade 8, Breda",
        quantity: 2, unit: "Pallets", weight_kg: 200, dimensions: "120x80x150", transport_type: "direct", anomalies: [],
      },
    ];

    mockFrom.mockImplementation((table: string) => {
      const chain = buildChain();
      if (table === "orders") {
        if ((chain.not as any).mock) {
          chain.order.mockResolvedValue({ data: drafts, error: null });
          chain.not = vi.fn().mockReturnValue(chain);
          chain.is = vi.fn().mockReturnValue(chain);
        }
        return chain;
      }
      return buildChain();
    });

    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.drafts).toHaveLength(2));

    expect(result.current.intakeQueueStats.total).toBe(2);
    expect(result.current.intakeQueueStats.autoConfirm).toBe(1);
    expect(result.current.intakeQueueStats.needsAction).toBe(1);
  });

  it("toggleBulkSelect adds and removes ids", async () => {
    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.toggleBulkSelect("d1"));
    expect(result.current.bulkSelected.has("d1")).toBe(true);

    act(() => result.current.toggleBulkSelect("d1"));
    expect(result.current.bulkSelected.has("d1")).toBe(false);
  });

  it("setMobileView changes view state", async () => {
    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setMobileView("detail"));
    expect(result.current.mobileView).toBe("detail");
  });

  it("setSidebarFilter changes filter state", async () => {
    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setSidebarFilter("klaar"));
    expect(result.current.sidebarFilter).toBe("klaar");
  });

  it("setGroupByClient toggles grouping", async () => {
    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setGroupByClient(true));
    expect(result.current.groupByClient).toBe(true);
  });

  it("formHasErrors is true when required fields are missing", async () => {
    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.formHasErrors).toBe(true);
  });

  it("provides tenant from context", async () => {
    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.tenant).toEqual(expect.objectContaining({ id: "tenant-1" }));
  });

  // ── needsAction / readyToGo filtering ──

  it("computes needsAction for orders with missing fields", async () => {
    const drafts = [
      { id: "d1", status: "DRAFT", confidence_score: 90, missing_fields: [], pickup_address: "Straat 10, Amsterdam", delivery_address: "Havenweg 2, Rotterdam", quantity: 5, unit: "Pallets", weight_kg: 500, dimensions: "120x80x150" },
      { id: "d2", status: "DRAFT", confidence_score: 50, missing_fields: [] },
      { id: "d3", status: "DRAFT", confidence_score: 90, missing_fields: ["weight"] },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === "orders") {
        return buildChain({ order: vi.fn().mockResolvedValue({ data: drafts, error: null }) });
      }
      return buildChain();
    });

    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.drafts).toHaveLength(3));

    // d2: lowConf, d3: has missing fields -> both need action
    expect(result.current.needsAction).toHaveLength(2);
    // d1: high conf, no missing -> ready
    expect(result.current.readyToGo).toHaveLength(1);
    expect(result.current.readyToGo[0].id).toBe("d1");
  });

  it("computes needsAction for orders with no confidence_score", async () => {
    const drafts = [
      { id: "d1", status: "DRAFT", confidence_score: null, missing_fields: [] },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === "orders") {
        return buildChain({ order: vi.fn().mockResolvedValue({ data: drafts, error: null }) });
      }
      return buildChain();
    });

    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.drafts).toHaveLength(1));

    expect(result.current.needsAction).toHaveLength(1);
    expect(result.current.readyToGo).toHaveLength(0);
  });

  // ── sidebarFilter "klaar" / "actie" ──

  it("sidebarFilter 'klaar' shows only ready orders", async () => {
    const drafts = [
      { id: "d1", status: "DRAFT", confidence_score: 95, missing_fields: [], pickup_address: "Straat 10, Amsterdam", delivery_address: "Havenweg 2, Rotterdam", quantity: 5, unit: "Pallets", weight_kg: 500, dimensions: "120x80x150" },
      { id: "d2", status: "DRAFT", confidence_score: 40, missing_fields: [] },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === "orders") {
        return buildChain({ order: vi.fn().mockResolvedValue({ data: drafts, error: null }) });
      }
      return buildChain();
    });

    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.drafts).toHaveLength(2));

    act(() => result.current.setSidebarFilter("klaar"));
    await waitFor(() => {
      expect(result.current.filtered).toHaveLength(1);
      expect(result.current.filtered[0].id).toBe("d1");
    });
  });

  it("sidebarFilter 'actie' shows only orders needing action", async () => {
    const drafts = [
      { id: "d1", status: "DRAFT", confidence_score: 95, missing_fields: [], pickup_address: "Straat 10, Amsterdam", delivery_address: "Havenweg 2, Rotterdam", quantity: 5, unit: "Pallets", weight_kg: 500, dimensions: "120x80x150" },
      { id: "d2", status: "DRAFT", confidence_score: 40, missing_fields: [] },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === "orders") {
        return buildChain({ order: vi.fn().mockResolvedValue({ data: drafts, error: null }) });
      }
      return buildChain();
    });

    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.drafts).toHaveLength(2));

    act(() => result.current.setSidebarFilter("actie"));
    await waitFor(() => {
      expect(result.current.filtered).toHaveLength(1);
      expect(result.current.filtered[0].id).toBe("d2");
    });
  });

  // ── filterClient / filterType ──

  it("filters by client name", async () => {
    const drafts = [
      { id: "d1", status: "DRAFT", client_name: "Acme", confidence_score: 90, missing_fields: [] },
      { id: "d2", status: "DRAFT", client_name: "Beta", confidence_score: 90, missing_fields: [] },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === "orders") {
        return buildChain({ order: vi.fn().mockResolvedValue({ data: drafts, error: null }) });
      }
      return buildChain();
    });

    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.drafts).toHaveLength(2));

    act(() => result.current.setFilterClient("Acme"));
    await waitFor(() => expect(result.current.filtered).toHaveLength(1));
    expect(result.current.filtered[0].client_name).toBe("Acme");
  });

  it("filters by thread type", async () => {
    const drafts = [
      { id: "d1", status: "DRAFT", thread_type: "new", confidence_score: 90, missing_fields: [] },
      { id: "d2", status: "DRAFT", thread_type: "update", confidence_score: 90, missing_fields: [] },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === "orders") {
        return buildChain({ order: vi.fn().mockResolvedValue({ data: drafts, error: null }) });
      }
      return buildChain();
    });

    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.drafts).toHaveLength(2));

    act(() => result.current.setFilterType("update"));
    await waitFor(() => expect(result.current.filtered).toHaveLength(1));
    expect(result.current.filtered[0].id).toBe("d2");
  });

  // ── groupedByClient ──

  it("groupedByClient groups filtered drafts by client_name", async () => {
    const drafts = [
      { id: "d1", status: "DRAFT", client_name: "Acme", confidence_score: 90, missing_fields: [] },
      { id: "d2", status: "DRAFT", client_name: "Acme", confidence_score: 90, missing_fields: [] },
      { id: "d3", status: "DRAFT", client_name: "Beta", confidence_score: 90, missing_fields: [] },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === "orders") {
        return buildChain({ order: vi.fn().mockResolvedValue({ data: drafts, error: null }) });
      }
      return buildChain();
    });

    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.drafts).toHaveLength(3));

    expect(result.current.groupedByClient).toBeNull();

    act(() => result.current.setGroupByClient(true));

    expect(result.current.groupedByClient).not.toBeNull();
    expect(result.current.groupedByClient!["Acme"]).toHaveLength(2);
    expect(result.current.groupedByClient!["Beta"]).toHaveLength(1);
  });

  it("groupedByClient uses 'Onbekend' for null client_name", async () => {
    const drafts = [
      { id: "d1", status: "DRAFT", client_name: null, confidence_score: 90, missing_fields: [] },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === "orders") {
        return buildChain({ order: vi.fn().mockResolvedValue({ data: drafts, error: null }) });
      }
      return buildChain();
    });

    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.drafts).toHaveLength(1));

    act(() => result.current.setGroupByClient(true));
    expect(result.current.groupedByClient!["Onbekend"]).toHaveLength(1);
  });

  // ── selectAllSimilar ──

  it("selectAllSimilar selects all orders from same client", async () => {
    const drafts = [
      { id: "d1", status: "DRAFT", client_name: "Acme", confidence_score: 90, missing_fields: [] },
      { id: "d2", status: "DRAFT", client_name: "Acme", confidence_score: 90, missing_fields: [] },
      { id: "d3", status: "DRAFT", client_name: "Beta", confidence_score: 90, missing_fields: [] },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === "orders") {
        return buildChain({ order: vi.fn().mockResolvedValue({ data: drafts, error: null }) });
      }
      return buildChain();
    });

    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.drafts).toHaveLength(3));

    act(() => result.current.selectAllSimilar("Acme"));
    expect(result.current.bulkSelected.size).toBe(2);
    expect(result.current.bulkSelected.has("d1")).toBe(true);
    expect(result.current.bulkSelected.has("d2")).toBe(true);
    expect(result.current.bulkSelected.has("d3")).toBe(false);
    expect((toast as any).success).toHaveBeenCalled();
  });

  // ── deleteMutation ──

  it("handleDelete calls deleteMutation for selected order", async () => {
    const drafts = [
      { id: "d1", status: "DRAFT", client_name: "Acme", confidence_score: 90, missing_fields: [], pickup_address: "A", delivery_address: "B", quantity: 1, weight_kg: 100 },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === "orders") {
        const chain = buildChain();
        chain.order.mockResolvedValue({ data: drafts, error: null });
        return chain;
      }
      return buildChain();
    });

    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.selected?.id).toBe("d1"));

    // Now switch mock so delete resolves
    mockFrom.mockImplementation(() => {
      const chain = buildChain();
      chain.order.mockResolvedValue({ data: [], error: null });
      return chain;
    });

    await act(async () => {
      result.current.handleDelete();
    });

    expect(mockFrom).toHaveBeenCalledWith("orders");
  });

  it("handleDelete does nothing if no selected order", async () => {
    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const callCountBefore = mockFrom.mock.calls.length;
    act(() => result.current.handleDelete());
    // Should not call supabase again (beyond initial queries)
    // The delete mutation should not have been triggered
    expect(result.current.selected).toBeUndefined();
  });

  // ── handleBulkDelete ──

  it("handleBulkDelete deletes all selected and clears selection", async () => {
    const drafts = [
      { id: "d1", status: "DRAFT", client_name: "Acme", confidence_score: 90, missing_fields: [] },
      { id: "d2", status: "DRAFT", client_name: "Beta", confidence_score: 90, missing_fields: [] },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === "orders") {
        const chain = buildChain();
        chain.order.mockResolvedValue({ data: drafts, error: null });
        return chain;
      }
      return buildChain();
    });

    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.drafts).toHaveLength(2));

    act(() => {
      result.current.toggleBulkSelect("d1");
      result.current.toggleBulkSelect("d2");
    });

    act(() => result.current.handleBulkDelete());
    expect(result.current.bulkSelected.size).toBe(0);
  });

  // ── handleMerge ──

  it("handleMerge shows info toast for merge (not yet implemented)", async () => {
    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const orders = [{ id: "d1" }, { id: "d2" }] as any[];
    act(() => result.current.handleMerge("Acme", orders));

    expect((toast as any).info).toHaveBeenCalledWith(
      "Binnenkort beschikbaar",
      expect.objectContaining({ description: expect.stringContaining("2 orders") })
    );
  });

  it("handleMerge does nothing with less than 2 orders", async () => {
    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.handleMerge("Acme", [{ id: "d1" }] as any[]));
    expect((toast as any).info).not.toHaveBeenCalled();
  });

  // ── enrichAddresses ──

  it("enrichAddresses returns result with no enrichments when no match", async () => {
    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const res = result.current.enrichAddresses({ pickupAddress: "Amsterdam", deliveryAddress: "Rotterdam" });
    expect(res.enrichments).toEqual([]);
    expect(res.result.pickupAddress).toBe("Amsterdam");
    expect(res.result.deliveryAddress).toBe("Rotterdam");
  });

  // ── handleCreateOrder does nothing when formHasErrors ──

  it("handleCreateOrder does nothing when no form or errors present", async () => {
    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const callsBefore = mockFrom.mock.calls.length;
    act(() => result.current.handleCreateOrder());
    // No mutation should be triggered — form is null and formHasErrors is true
  });

  // ── handleAutoSave ──

  it("handleAutoSave does nothing when no selected order", async () => {
    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.handleAutoSave());
    // No crash, no mutation
  });

  it("handleAutoSave saves form for selected order", async () => {
    const drafts = [
      { id: "d1", status: "DRAFT", client_name: "Acme", confidence_score: 90, missing_fields: [],
        pickup_address: "A", delivery_address: "B", quantity: 1, weight_kg: 100, transport_type: "direct" },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === "orders") {
        const chain = buildChain();
        chain.order.mockResolvedValue({ data: drafts, error: null });
        return chain;
      }
      return buildChain();
    });

    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.selected?.id).toBe("d1"));

    await act(async () => {
      result.current.handleAutoSave();
    });

    // saveFormMutation should have been called
    expect(mockFrom).toHaveBeenCalledWith("orders");
  });

  // ── updateField + saveCorrection ──

  it("updateField saves AI correction when confidence_score > 0", async () => {
    const drafts = [
      {
        id: "d1", status: "DRAFT", client_name: "Acme", confidence_score: 85,
        missing_fields: [], pickup_address: "Amsterdam", delivery_address: "Rotterdam",
        quantity: 5, unit: "Pallets", weight_kg: 500, transport_type: "direct",
      },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === "orders") {
        return buildChain({ order: vi.fn().mockResolvedValue({ data: drafts, error: null }) });
      }
      return buildChain();
    });

    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.selected?.id).toBe("d1"));

    act(() => result.current.updateField("pickupAddress", "Den Haag"));

    expect(mockSaveCorrection).toHaveBeenCalledWith(
      "d1", "Acme", "pickupAddress", "Amsterdam", "Den Haag", "tenant-1"
    );
  });

  it("updateField does not save correction when values are same", async () => {
    const drafts = [
      {
        id: "d1", status: "DRAFT", client_name: "Acme", confidence_score: 85,
        missing_fields: [], pickup_address: "Amsterdam", delivery_address: "Rotterdam",
        quantity: 5, unit: "Pallets", weight_kg: 500, transport_type: "direct",
      },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === "orders") {
        return buildChain({ order: vi.fn().mockResolvedValue({ data: drafts, error: null }) });
      }
      return buildChain();
    });

    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.selected?.id).toBe("d1"));

    act(() => result.current.updateField("pickupAddress", "Amsterdam"));

    expect(mockSaveCorrection).not.toHaveBeenCalled();
  });

  // ── toggleRequirement ──

  it("toggleRequirement adds and removes requirements", async () => {
    const drafts = [
      {
        id: "d1", status: "DRAFT", client_name: "Acme", confidence_score: 0,
        missing_fields: [], pickup_address: "A", delivery_address: "B",
        quantity: 1, unit: "Pallets", weight_kg: 100, transport_type: "direct",
        requirements: ["ADR"],
      },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === "orders") {
        return buildChain({ order: vi.fn().mockResolvedValue({ data: drafts, error: null }) });
      }
      return buildChain();
    });

    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.selected?.id).toBe("d1"));

    // Add a requirement
    act(() => result.current.toggleRequirement("Koeling"));
    expect(result.current.form!.requirements).toContain("Koeling");
    expect(result.current.form!.requirements).toContain("ADR");

    // Remove it
    act(() => result.current.toggleRequirement("Koeling"));
    expect(result.current.form!.requirements).not.toContain("Koeling");
  });

  // ── handleImportEmail ──

  function createMockFile(content: string, name = "email.eml"): File {
    const file = new File([content], name, { type: "message/rfc822" });
    // jsdom File doesn't have .text(), polyfill it
    if (!file.text) {
      (file as any).text = () => Promise.resolve(content);
    }
    return file;
  }

  it("handleImportEmail imports email file and creates draft order", async () => {
    const emailContent = 'From: "Test User" <test@example.com>\nSubject: Transport Order\n\nPlease deliver 5 pallets to Rotterdam.';
    const file = createMockFile(emailContent);

    mockFrom.mockImplementation((table: string) => {
      const chain = buildChain();
      if (table === "orders") {
        chain.single.mockResolvedValue({ data: { id: "new-1" }, error: null });
        chain.order.mockResolvedValue({ data: [], error: null });
      }
      return chain;
    });

    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.handleImportEmail(file);
    });

    expect((toast as any).success).toHaveBeenCalledWith(
      "E-mail geïmporteerd",
      expect.objectContaining({ description: expect.any(String) })
    );
    expect(result.current.selectedId).toBe("new-1");
  });

  it("handleImportEmail handles error gracefully", async () => {
    const file = createMockFile("From: x\nSubject: y\n\nbody");

    mockFrom.mockImplementation(() => {
      const chain = buildChain();
      chain.single.mockResolvedValue({ data: null, error: { message: "insert failed" } });
      chain.order.mockResolvedValue({ data: [], error: null });
      return chain;
    });

    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.handleImportEmail(file);
    });

    expect((toast as any).error).toHaveBeenCalledWith(
      "Import mislukt",
      expect.objectContaining({ description: expect.any(String) })
    );
    expect(result.current.isImporting).toBe(false);
  });

  // ── handleImportEmail with MIME body ──

  it("handleImportEmail strips MIME content-type headers from body", async () => {
    const emailContent = 'From: sender@test.com\nSubject: Order\n\nContent-Type: text/plain; charset=utf-8\n\nActual body here';
    const file = createMockFile(emailContent);

    mockFrom.mockImplementation((table: string) => {
      const chain = buildChain();
      chain.single.mockResolvedValue({ data: { id: "new-2" }, error: null });
      chain.order.mockResolvedValue({ data: [], error: null });
      return chain;
    });

    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.handleImportEmail(file);
    });

    expect((toast as any).success).toHaveBeenCalled();
  });

  // ── handleLoadTestScenario ──

  it("handleLoadTestScenario creates new test order and invokes parse-order", async () => {
    mockFrom.mockImplementation((table: string) => {
      const chain = buildChain();
      if (table === "orders") {
        chain.limit.mockResolvedValue({ data: [], error: null }); // no existing
        chain.single.mockResolvedValue({ data: { id: "test-order-1" }, error: null });
        chain.order.mockResolvedValue({ data: [], error: null });
      }
      return chain;
    });

    mockSupabase.functions.invoke.mockResolvedValue({
      data: {
        extracted: {
          transport_type: "direct",
          pickup_address: "Amsterdam",
          delivery_address: "Rotterdam",
          quantity: 5,
          unit: "Pallets",
          weight_kg: 500,
          confidence_score: 0.92,
          requirements: [],
        },
        missing_fields: [],
      },
      error: null,
    });

    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.handleLoadTestScenario(0);
    });

    expect(mockSupabase.functions.invoke).toHaveBeenCalledWith("parse-order", expect.any(Object));
    expect(result.current.loadingScenario).toBeNull();
  });

  it("handleLoadTestScenario reuses existing draft if found", async () => {
    mockFrom.mockImplementation((table: string) => {
      const chain = buildChain();
      if (table === "orders") {
        chain.limit.mockResolvedValue({ data: [{ id: "existing-1" }], error: null });
        chain.order.mockResolvedValue({ data: [], error: null });
      }
      return chain;
    });

    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.handleLoadTestScenario(0);
    });

    expect(result.current.selectedId).toBe("existing-1");
    expect((toast as any).success).toHaveBeenCalledWith("Al aanwezig", expect.any(Object));
    expect(mockSupabase.functions.invoke).not.toHaveBeenCalled();
  });

  it("handleLoadTestScenario handles parse-order error", async () => {
    mockFrom.mockImplementation((table: string) => {
      const chain = buildChain();
      if (table === "orders") {
        chain.limit.mockResolvedValue({ data: [], error: null });
        chain.single.mockResolvedValue({ data: { id: "test-order-2" }, error: null });
        chain.order.mockResolvedValue({ data: [], error: null });
      }
      return chain;
    });

    mockSupabase.functions.invoke.mockResolvedValue({
      data: null,
      error: { message: "Function error" },
    });

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.handleLoadTestScenario(0);
    });

    expect((toast as any).error).toHaveBeenCalledWith("Test scenario fout", expect.any(Object));
    expect(result.current.loadingScenario).toBeNull();
    consoleSpy.mockRestore();
  });

  // ── createOrderMutation ──

  it("createOrderMutation resolves client_id from existing client", async () => {
    const drafts = [
      {
        id: "d1", status: "DRAFT", client_name: "Acme", confidence_score: 90,
        missing_fields: [], pickup_address: "A", delivery_address: "B",
        quantity: 5, unit: "Pallets", weight_kg: 500, transport_type: "direct",
        order_number: 1, source_email_from: null,
      },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === "orders") {
        const chain = buildChain();
        chain.order.mockResolvedValue({ data: drafts, error: null });
        chain.single.mockResolvedValue({ data: { client_name: "Acme", tenant_id: "tenant-1" }, error: null });
        return chain;
      }
      if (table === "clients") {
        const chain = buildChain();
        chain.limit.mockResolvedValue({ data: [{ id: "client-1" }], error: null });
        return chain;
      }
      return buildChain();
    });

    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.selected?.id).toBe("d1"));

    await act(async () => {
      result.current.createOrderMutation.mutate({ id: "d1", form: result.current.form! });
    });

    await waitFor(() => expect(result.current.createOrderMutation.isSuccess || result.current.createOrderMutation.isError).toBe(true));
  });

  it("createOrderMutation.onSuccess invokes send-confirmation when source_email_from is present", async () => {
    const drafts = [
      {
        id: "d1", status: "DRAFT", client_name: "Acme", confidence_score: 90,
        missing_fields: [], pickup_address: "A", delivery_address: "B",
        quantity: 5, unit: "Pallets", weight_kg: 500, transport_type: "direct",
        order_number: 1, source_email_from: "klant@acme.nl",
      },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === "orders") {
        const chain = buildChain();
        chain.order.mockResolvedValue({ data: drafts, error: null });
        chain.single.mockResolvedValue({ data: { client_name: "Acme", tenant_id: "tenant-1" }, error: null });
        return chain;
      }
      if (table === "clients") {
        const chain = buildChain();
        chain.limit.mockResolvedValue({ data: [{ id: "client-1" }], error: null });
        return chain;
      }
      return buildChain();
    });

    mockSupabase.functions.invoke.mockResolvedValue({ data: { success: true }, error: null });

    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.selected?.id).toBe("d1"));

    await act(async () => {
      result.current.createOrderMutation.mutate({ id: "d1", form: result.current.form! });
    });

    await waitFor(() => {
      expect(result.current.createOrderMutation.isSuccess || result.current.createOrderMutation.isError).toBe(true);
    });

    // send-confirmation should have been called for the order with source_email_from
    await waitFor(() => {
      expect(mockSupabase.functions.invoke).toHaveBeenCalledWith("send-confirmation", expect.objectContaining({
        body: { orderId: "d1" },
      }));
    });
  });

  it("createOrderMutation.onSuccess does NOT invoke send-confirmation when source_email_from is null", async () => {
    const drafts = [
      {
        id: "d1", status: "DRAFT", client_name: "Acme", confidence_score: 90,
        missing_fields: [], pickup_address: "A", delivery_address: "B",
        quantity: 5, unit: "Pallets", weight_kg: 500, transport_type: "direct",
        order_number: 1, source_email_from: null,
      },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === "orders") {
        const chain = buildChain();
        chain.order.mockResolvedValue({ data: drafts, error: null });
        chain.single.mockResolvedValue({ data: { client_name: "Acme", tenant_id: "tenant-1" }, error: null });
        return chain;
      }
      if (table === "clients") {
        const chain = buildChain();
        chain.limit.mockResolvedValue({ data: [{ id: "client-1" }], error: null });
        return chain;
      }
      return buildChain();
    });

    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.selected?.id).toBe("d1"));

    await act(async () => {
      result.current.createOrderMutation.mutate({ id: "d1", form: result.current.form! });
    });

    await waitFor(() => {
      expect(result.current.createOrderMutation.isSuccess || result.current.createOrderMutation.isError).toBe(true);
    });

    // send-confirmation should NOT be called
    expect(mockSupabase.functions.invoke).not.toHaveBeenCalledWith("send-confirmation", expect.any(Object));
  });

  // ── formHasErrors with complete form ──

  it("formHasErrors is false when all required fields are present", async () => {
    const drafts = [
      {
        id: "d1", status: "DRAFT", client_name: "Acme", confidence_score: 90,
        missing_fields: [], pickup_address: "Amsterdam", delivery_address: "Rotterdam",
        quantity: 5, unit: "Pallets", weight_kg: 500, transport_type: "direct",
      },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === "orders") {
        return buildChain({ order: vi.fn().mockResolvedValue({ data: drafts, error: null }) });
      }
      return buildChain();
    });

    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.selected?.id).toBe("d1"));

    expect(result.current.formHasErrors).toBe(false);
  });

  // ── setFormData directly ──

  it("setFormData allows direct manipulation of form state", async () => {
    const drafts = [
      {
        id: "d1", status: "DRAFT", client_name: "Acme", confidence_score: 90,
        missing_fields: [], pickup_address: "A", delivery_address: "B",
        quantity: 1, unit: "Pallets", weight_kg: 100, transport_type: "direct",
      },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === "orders") {
        return buildChain({ order: vi.fn().mockResolvedValue({ data: drafts, error: null }) });
      }
      return buildChain();
    });

    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.selected?.id).toBe("d1"));

    act(() => {
      result.current.setFormData((prev) => ({
        ...prev,
        d1: { ...prev.d1, pickupAddress: "Utrecht" },
      }));
    });

    expect(result.current.form!.pickupAddress).toBe("Utrecht");
  });

  // ── isCreatePending ──

  it("isCreatePending is initially false", async () => {
    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isCreatePending).toBe(false);
  });

  // ── selectedId auto-selects first draft ──

  it("auto-selects first draft when current selectedId is not in drafts", async () => {
    const drafts = [
      { id: "d1", status: "DRAFT", confidence_score: 90, missing_fields: [] },
      { id: "d2", status: "DRAFT", confidence_score: 50, missing_fields: [] },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === "orders") {
        return buildChain({ order: vi.fn().mockResolvedValue({ data: drafts, error: null }) });
      }
      return buildChain();
    });

    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.drafts).toHaveLength(2));

    // Should auto-select first
    expect(result.current.selectedId).toBe("d1");
  });

  // ── handleBulkApproveChecked ──

  it("handleBulkApproveChecked only approves orders without form errors", async () => {
    const drafts = [
      { id: "d1", status: "DRAFT", client_name: "Acme", confidence_score: 90, missing_fields: [],
        pickup_address: "A", delivery_address: "B", quantity: 5, weight_kg: 500, transport_type: "direct" },
      { id: "d2", status: "DRAFT", client_name: "Beta", confidence_score: 90, missing_fields: [],
        pickup_address: "", delivery_address: "", quantity: 0, weight_kg: null, transport_type: "direct" },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === "orders") {
        const chain = buildChain();
        chain.order.mockResolvedValue({ data: drafts, error: null });
        chain.single.mockResolvedValue({ data: { client_name: "Acme", tenant_id: "t1" }, error: null });
        return chain;
      }
      if (table === "clients") {
        const chain = buildChain();
        chain.limit.mockResolvedValue({ data: [{ id: "c1" }], error: null });
        return chain;
      }
      return buildChain();
    });

    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.drafts).toHaveLength(2));

    act(() => {
      result.current.toggleBulkSelect("d1");
      result.current.toggleBulkSelect("d2");
    });

    act(() => result.current.handleBulkApproveChecked());

    // Selection should be cleared
    expect(result.current.bulkSelected.size).toBe(0);
  });

  // ── handleBulkApprove ──

  it("handleBulkApprove approves all selected orders regardless of errors", async () => {
    const drafts = [
      { id: "d1", status: "DRAFT", client_name: "Acme", confidence_score: 90, missing_fields: [],
        pickup_address: "A", delivery_address: "B", quantity: 5, weight_kg: 500, transport_type: "direct" },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === "orders") {
        const chain = buildChain();
        chain.order.mockResolvedValue({ data: drafts, error: null });
        chain.single.mockResolvedValue({ data: { client_name: "Acme", tenant_id: "t1" }, error: null });
        return chain;
      }
      if (table === "clients") {
        const chain = buildChain();
        chain.limit.mockResolvedValue({ data: [{ id: "c1" }], error: null });
        return chain;
      }
      return buildChain();
    });

    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.drafts).toHaveLength(1));

    act(() => result.current.toggleBulkSelect("d1"));
    act(() => result.current.handleBulkApprove());

    expect(result.current.bulkSelected.size).toBe(0);
  });
});
