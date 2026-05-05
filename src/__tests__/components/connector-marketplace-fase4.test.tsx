// Tests voor Marketplace fase 4: monitoring + autonomie.
//
// Dekt SyncGraphs aggregate-functie, HealthBanner conditional render,
// HealthDot rendering, BulkActionsBar interactions, AuditTab CSV export
// en ThresholdTab opslaan.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { aggregateStats, generateSeedEvents, SyncGraphs } from "@/components/settings/connectors/SyncGraphs";
import { aggregate } from "@/hooks/useTenantSyncHealth";
import { buildCsv } from "@/components/settings/connectors/AuditTab";
import { HealthDot } from "@/components/settings/connectors/HealthDot";
import { HealthBanner } from "@/components/settings/connectors/HealthBanner";
import { BulkActionsBar } from "@/components/settings/connectors/BulkActionsBar";
import { ThresholdTab } from "@/components/settings/connectors/ThresholdTab";
import { AuditTab } from "@/components/settings/connectors/AuditTab";

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({ tenant: { id: "tenant-1" } }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const tenantHealthMock = vi.fn();
vi.mock("@/hooks/useTenantSyncHealth", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useTenantSyncHealth")>("@/hooks/useTenantSyncHealth");
  return {
    ...actual,
    useTenantSyncHealth: () => tenantHealthMock(),
  };
});

const bulkHookState = {
  testAll: vi.fn(async (cb: (items: unknown[]) => void) => {
    cb([{ slug: "snelstart", name: "Snelstart", status: "pending" }]);
    cb([{ slug: "snelstart", name: "Snelstart", status: "success" }]);
    return [];
  }),
  setAllEnabled: vi.fn(async () => {}),
  replayFailedLast24h: vi.fn(async () => ({ ok: true, queued: 0 })),
  isPending: false,
};
vi.mock("@/hooks/useBulkConnectorActions", () => ({
  useBulkConnectorActions: () => bulkHookState,
}));

const thresholdState = {
  data: {
    tenant_id: "tenant-1",
    provider: "snelstart",
    max_failures: 5,
    window_minutes: 5,
    max_latency_ms: 1500,
    notify_planner: true,
    updated_at: "2026-01-01T00:00:00Z",
  },
};
const saveThresholdMock = vi.fn(async () => {});
vi.mock("@/hooks/useConnectorThresholds", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useConnectorThresholds")>("@/hooks/useConnectorThresholds");
  return {
    ...actual,
    useConnectorThreshold: () => thresholdState,
    useSaveConnectorThreshold: () => ({ mutateAsync: saveThresholdMock, isPending: false }),
  };
});

const auditRows = [
  {
    id: "a1",
    tenant_id: "tenant-1",
    provider: "snelstart",
    user_id: "user-abc-1234",
    action: "connect" as const,
    details: { foo: "bar" },
    created_at: "2026-05-04T12:00:00Z",
  },
];
vi.mock("@/hooks/useConnectorAuditLog", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useConnectorAuditLog")>("@/hooks/useConnectorAuditLog");
  return {
    ...actual,
    useConnectorAuditLog: () => ({ data: auditRows, isLoading: false }),
    logConnectorAuditEvent: vi.fn(async () => {}),
  };
});

// Helpers ───────────────────────────────────────────────────────────

function withClient(node: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  tenantHealthMock.mockReturnValue({
    data: {
      byProvider: {},
      globalIncident: false,
      affectedProviders: [],
      refreshedAt: Date.now(),
    },
  });
});

// ─── SyncGraphs ──────────────────────────────────────────────────────

describe("SyncGraphs aggregate", () => {
  it("falls back to seed data when log has < 10 events", () => {
    const stats = aggregateStats("snelstart", [], "7d");
    expect(stats.isSeed).toBe(true);
    expect(stats.totalThisWeek).toBeGreaterThan(0);
    expect(stats.buckets.length).toBe(7);
  });

  it("uses real data when there are 10+ events", () => {
    const real = generateSeedEvents("real", 7, 5);
    const stats = aggregateStats("snelstart", real, "7d");
    expect(stats.isSeed).toBe(false);
    expect(stats.totalThisWeek).toBeGreaterThan(0);
  });

  it("computes p50 and p95 latency", () => {
    const events = Array.from({ length: 20 }, (_, i) => ({
      id: `e${i}`,
      provider: "snelstart",
      direction: "push" as const,
      event_type: "test",
      entity_type: null,
      entity_id: null,
      status: "SUCCESS" as const,
      records_count: 1,
      error_message: null,
      duration_ms: 100 + i * 10,
      external_id: null,
      started_at: new Date(Date.now() - i * 60_000).toISOString(),
    }));
    const stats = aggregateStats("snelstart", events, "7d");
    expect(stats.p50).not.toBeNull();
    expect(stats.p95).not.toBeNull();
    expect(stats.p95!).toBeGreaterThanOrEqual(stats.p50!);
  });

  it("renders without crashing with seed data", () => {
    render(<SyncGraphs slug="snelstart" log={[]} />);
    expect(screen.getByTestId("sync-graphs")).toBeInTheDocument();
    expect(screen.getByText(/Sync-graph/i)).toBeInTheDocument();
  });
});

// ─── Tenant health aggregate ─────────────────────────────────────────

describe("Tenant sync health aggregate", () => {
  it("marks providers with > 5 failures as down", () => {
    const rows = Array.from({ length: 6 }, () => ({
      provider: "snelstart" as const,
      status: "FAILED" as const,
      duration_ms: 200,
      started_at: new Date().toISOString(),
    }));
    const result = aggregate(rows);
    expect(result.byProvider["snelstart"].status).toBe("down");
  });

  it("marks providers with high latency as degraded", () => {
    const rows = Array.from({ length: 10 }, () => ({
      provider: "exact_online" as const,
      status: "SUCCESS" as const,
      duration_ms: 2000,
      started_at: new Date().toISOString(),
    }));
    const result = aggregate(rows);
    expect(result.byProvider["exact_online"].status).toBe("degraded");
  });

  it("flags global incident when more than one provider down", () => {
    const rows = [
      ...Array.from({ length: 6 }, () => ({ provider: "a", status: "FAILED" as const, duration_ms: 100, started_at: new Date().toISOString() })),
      ...Array.from({ length: 6 }, () => ({ provider: "b", status: "FAILED" as const, duration_ms: 100, started_at: new Date().toISOString() })),
    ];
    const result = aggregate(rows);
    expect(result.globalIncident).toBe(true);
    expect(result.affectedProviders).toEqual(expect.arrayContaining(["a", "b"]));
  });

  it("returns ok status with healthy data", () => {
    const rows = Array.from({ length: 5 }, () => ({
      provider: "snelstart" as const,
      status: "SUCCESS" as const,
      duration_ms: 200,
      started_at: new Date().toISOString(),
    }));
    const result = aggregate(rows);
    expect(result.byProvider["snelstart"].status).toBe("ok");
    expect(result.globalIncident).toBe(false);
  });
});

// ─── HealthBanner ────────────────────────────────────────────────────

describe("HealthBanner", () => {
  it("does not render when no global incident", () => {
    tenantHealthMock.mockReturnValue({
      data: { byProvider: {}, globalIncident: false, affectedProviders: [], refreshedAt: 0 },
    });
    const { container } = render(withClient(<HealthBanner />));
    expect(container.querySelector('[data-testid="health-banner"]')).toBeNull();
  });

  it("renders with affected providers when incident is global", () => {
    tenantHealthMock.mockReturnValue({
      data: {
        byProvider: {
          snelstart: { provider: "snelstart", total: 6, failed: 6, avgLatency: 100, lastEventAt: null, status: "down" },
          exact_online: { provider: "exact_online", total: 6, failed: 6, avgLatency: 100, lastEventAt: null, status: "down" },
        },
        globalIncident: true,
        affectedProviders: ["snelstart", "exact_online"],
        refreshedAt: 0,
      },
    });
    render(withClient(<HealthBanner />));
    expect(screen.getByTestId("health-banner")).toBeInTheDocument();
    expect(screen.getByText(/Storing op 2 koppelingen/i)).toBeInTheDocument();
  });
});

// ─── HealthDot ───────────────────────────────────────────────────────

describe("HealthDot", () => {
  it("does not render when there are no events", () => {
    tenantHealthMock.mockReturnValue({
      data: { byProvider: {}, globalIncident: false, affectedProviders: [], refreshedAt: 0 },
    });
    const { container } = render(withClient(<HealthDot slug="snelstart" />));
    expect(container.textContent).toBe("");
  });

  it("renders ok-label for healthy provider", () => {
    tenantHealthMock.mockReturnValue({
      data: {
        byProvider: {
          snelstart: { provider: "snelstart", total: 5, failed: 0, avgLatency: 200, lastEventAt: null, status: "ok" },
        },
        globalIncident: false,
        affectedProviders: [],
        refreshedAt: 0,
      },
    });
    render(withClient(<HealthDot slug="snelstart" />));
    expect(screen.getByText(/Alles ok/i)).toBeInTheDocument();
  });
});

// ─── BulkActionsBar ──────────────────────────────────────────────────

describe("BulkActionsBar", () => {
  it("toggles paused label correctly", () => {
    const { rerender } = render(withClient(<BulkActionsBar liveCount={2} paused={false} />));
    expect(screen.getByText("Pauzeer alle")).toBeInTheDocument();
    rerender(withClient(<BulkActionsBar liveCount={2} paused={true} />));
    expect(screen.getByText("Hervat alle")).toBeInTheDocument();
  });

  it("shows live count badge", () => {
    render(withClient(<BulkActionsBar liveCount={3} paused={false} />));
    expect(screen.getByText("Test alle verbindingen")).toBeInTheDocument();
  });

  it("opens replay confirm dialog and calls hook", async () => {
    render(withClient(<BulkActionsBar liveCount={1} paused={false} />));
    fireEvent.click(screen.getByText(/Re-run failed/));
    const startBtn = await screen.findByText(/Start replay/);
    fireEvent.click(startBtn);
    await waitFor(() => expect(bulkHookState.replayFailedLast24h).toHaveBeenCalled());
  });
});

// ─── ThresholdTab ────────────────────────────────────────────────────

describe("ThresholdTab", () => {
  it("renders threshold values from hook", () => {
    render(withClient(<ThresholdTab slug="snelstart" />));
    const failuresInput = screen.getByLabelText("Max mislukte events") as HTMLInputElement;
    expect(failuresInput.value).toBe("5");
  });

  it("calls save mutation on submit", async () => {
    render(withClient(<ThresholdTab slug="snelstart" />));
    const saveBtn = screen.getByRole("button", { name: /Opslaan/i });
    fireEvent.click(saveBtn);
    await waitFor(() => expect(saveThresholdMock).toHaveBeenCalled());
  });
});

// ─── AuditTab CSV ────────────────────────────────────────────────────

describe("AuditTab CSV", () => {
  it("buildCsv includes header and serializes details as JSON", () => {
    const csv = buildCsv(auditRows);
    expect(csv.split("\n")[0]).toBe("created_at,action,user_id,details");
    expect(csv).toContain("connect");
    expect(csv).toContain("user-abc-1234");
    // Quote-protected JSON should appear
    expect(csv).toMatch(/"\{""foo"":""bar""\}"/);
  });

  it("renders audit rows in a table", () => {
    render(withClient(<AuditTab slug="snelstart" />));
    expect(screen.getByText("Verbonden")).toBeInTheDocument();
  });
});
