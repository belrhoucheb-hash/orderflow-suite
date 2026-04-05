import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { DecisionType } from "@/types/confidence";

// ── Supabase mock (hoisted) ──────────────────────────────────────

const { mockSupabase } = vi.hoisted(() => {
  const mockSupabase = {
    from: vi.fn(),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  };
  return { mockSupabase };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({ tenant: { id: "test-tenant-id", settings: {} } }),
}));

import {
  computeOverallScore,
  detectCorrectionPatterns,
  useAutonomyScore,
  useDecisionFeed,
  useLearningProgress,
  useCorrectionLog,
  useAutonomyTrend,
} from "@/hooks/useAutonomyDashboard";

// ── Helpers ──────────────────────────────────────────────────────

function chainMock(resolvedData: any) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    then: vi.fn((resolve: any) => resolve({ data: resolvedData, error: null })),
  };
  return chain;
}

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) =>
    QueryClientProvider({ client: qc, children });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Pure function tests ─────────────────────────────────────────

describe("computeOverallScore", () => {
  it("returns 0 when scores array is empty", () => {
    expect(computeOverallScore([])).toBe(0);
  });

  it("calculates weighted average from confidence scores", () => {
    const scores = [
      { decision_type: "ORDER_INTAKE", current_score: 80, total_decisions: 100 },
      { decision_type: "PLANNING", current_score: 60, total_decisions: 50 },
    ];
    // Weighted: (80*100 + 60*50) / (100+50) = 11000/150 = 73.33
    const result = computeOverallScore(scores);
    expect(result).toBeCloseTo(73.33, 1);
  });

  it("handles single module", () => {
    const scores = [
      { decision_type: "DISPATCH", current_score: 95, total_decisions: 200 },
    ];
    expect(computeOverallScore(scores)).toBe(95);
  });
});

describe("detectCorrectionPatterns", () => {
  it("returns empty array for no corrections", () => {
    expect(detectCorrectionPatterns([])).toEqual([]);
  });

  it("groups corrections by decisionType and counts them", () => {
    const corrections = [
      { id: "1", decisionType: "PLANNING" as DecisionType, entityId: "e1", clientId: "c1", clientName: "Klant A", proposedAction: "Vehicle A", actualAction: "Vehicle B", resolvedBy: "user1", resolvedAt: "2026-04-01T10:00:00Z", createdAt: "2026-04-01T09:00:00Z" },
      { id: "2", decisionType: "PLANNING" as DecisionType, entityId: "e2", clientId: "c1", clientName: "Klant A", proposedAction: "Vehicle A", actualAction: "Vehicle C", resolvedBy: "user1", resolvedAt: "2026-04-02T10:00:00Z", createdAt: "2026-04-02T09:00:00Z" },
      { id: "3", decisionType: "PRICING" as DecisionType, entityId: "e3", clientId: "c2", clientName: "Klant B", proposedAction: "100", actualAction: "120", resolvedBy: "user2", resolvedAt: "2026-04-03T10:00:00Z", createdAt: "2026-04-03T09:00:00Z" },
    ];
    const patterns = detectCorrectionPatterns(corrections);
    expect(patterns.length).toBe(2);
    const planningPattern = patterns.find((p) => p.decisionType === "PLANNING");
    expect(planningPattern?.count).toBe(2);
  });

  it("sorts patterns by count descending", () => {
    const corrections = [
      { id: "1", decisionType: "PLANNING" as DecisionType, entityId: "e1", clientId: "c1", clientName: "A", proposedAction: "X", actualAction: "Y", resolvedBy: "u1", resolvedAt: "2026-04-01T10:00:00Z", createdAt: "2026-04-01T09:00:00Z" },
      { id: "2", decisionType: "DISPATCH" as DecisionType, entityId: "e2", clientId: "c2", clientName: "B", proposedAction: "X", actualAction: "Y", resolvedBy: "u1", resolvedAt: "2026-04-02T10:00:00Z", createdAt: "2026-04-02T09:00:00Z" },
      { id: "3", decisionType: "DISPATCH" as DecisionType, entityId: "e3", clientId: "c2", clientName: "B", proposedAction: "X", actualAction: "Y", resolvedBy: "u1", resolvedAt: "2026-04-03T10:00:00Z", createdAt: "2026-04-03T09:00:00Z" },
      { id: "4", decisionType: "DISPATCH" as DecisionType, entityId: "e4", clientId: "c2", clientName: "B", proposedAction: "X", actualAction: "Y", resolvedBy: "u1", resolvedAt: "2026-04-04T10:00:00Z", createdAt: "2026-04-04T09:00:00Z" },
    ];
    const patterns = detectCorrectionPatterns(corrections);
    expect(patterns[0].decisionType).toBe("DISPATCH");
    expect(patterns[0].count).toBe(3);
  });
});

// ── Hook tests ──────────────────────────────────────────────────

describe("useAutonomyScore", () => {
  it("fetches confidence scores and computes overall + per-module scores", async () => {
    const mockScores = [
      { decision_type: "ORDER_INTAKE", current_score: 85, total_decisions: 100, approved_count: 85, modified_count: 10, rejected_count: 5 },
      { decision_type: "PLANNING", current_score: 70, total_decisions: 50, approved_count: 35, modified_count: 10, rejected_count: 5 },
    ];

    const mockTodayDecisions = [
      { resolution: "AUTO_EXECUTED" },
      { resolution: "AUTO_EXECUTED" },
      { resolution: "APPROVED" },
      { resolution: "MODIFIED" },
    ];

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "confidence_scores") {
        return chainMock(mockScores);
      }
      if (table === "decision_log") {
        return chainMock(mockTodayDecisions);
      }
      return chainMock([]);
    });

    const { result } = renderHook(() => useAutonomyScore(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.overall).toBeCloseTo(80, 0);
    expect(result.current.data?.perModule.ORDER_INTAKE).toBe(85);
    expect(result.current.data?.perModule.PLANNING).toBe(70);
    expect(result.current.data?.todayStats.autonomous).toBe(2);
    expect(result.current.data?.todayStats.validated).toBe(1);
    expect(result.current.data?.todayStats.manual).toBe(1);
  });
});

describe("useDecisionFeed", () => {
  it("fetches latest decisions ordered by created_at DESC", async () => {
    const mockDecisions = [
      { id: "d1", decision_type: "ORDER_INTAKE", resolution: "AUTO_EXECUTED", input_confidence: 92, created_at: "2026-04-05T10:00:00Z", proposed_action: "Accept order", entity_id: "o1", entity_type: "order", client_id: "c1" },
      { id: "d2", decision_type: "PLANNING", resolution: "MODIFIED", input_confidence: 65, created_at: "2026-04-05T09:00:00Z", proposed_action: "Assign Vehicle A", entity_id: "o2", entity_type: "order", client_id: "c2" },
    ];

    mockSupabase.from.mockImplementation(() => chainMock(mockDecisions));

    const { result } = renderHook(() => useDecisionFeed(10), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0].id).toBe("d1");
  });
});

describe("useLearningProgress", () => {
  it("fetches per-client learning metrics and computes status", async () => {
    const mockData = [
      { client_id: "c1", client_name: "Klant A", total_decisions: 50, current_score: 90, first_seen: "2026-01-01T00:00:00Z", autonomous_since: "2026-03-01T00:00:00Z" },
      { client_id: "c2", client_name: "Klant B", total_decisions: 10, current_score: 45, first_seen: "2026-03-15T00:00:00Z", autonomous_since: null },
    ];

    mockSupabase.from.mockImplementation(() => chainMock(mockData));

    const { result } = renderHook(() => useLearningProgress(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0].status).toBe("autonomous");
    expect(result.current.data?.[1].status).toBe("learning");
  });
});

describe("useCorrectionLog", () => {
  it("fetches corrections from the last N days", async () => {
    const mockCorrections = [
      { id: "c1", decision_type: "PLANNING", entity_id: "e1", client_id: "c1", proposed_action: "Vehicle A", actual_action: "Vehicle B", resolved_by: "user1", resolved_at: "2026-04-04T10:00:00Z", created_at: "2026-04-04T09:00:00Z" },
    ];

    mockSupabase.from.mockImplementation(() => chainMock(mockCorrections));

    const { result } = renderHook(() => useCorrectionLog(7), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
  });
});

describe("useAutonomyTrend", () => {
  it("fetches and aggregates weekly trend data", async () => {
    const mockLog = [
      { decision_type: "ORDER_INTAKE", input_confidence: 80, created_at: "2026-03-30T10:00:00Z" },
      { decision_type: "ORDER_INTAKE", input_confidence: 90, created_at: "2026-03-31T10:00:00Z" },
      { decision_type: "PLANNING", input_confidence: 70, created_at: "2026-03-30T10:00:00Z" },
    ];

    mockSupabase.from.mockImplementation(() => chainMock(mockLog));

    const { result } = renderHook(() => useAutonomyTrend(8), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeDefined();
    expect(Array.isArray(result.current.data)).toBe(true);
  });
});
