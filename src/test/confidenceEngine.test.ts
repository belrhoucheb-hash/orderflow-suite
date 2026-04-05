import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  recordDecision,
  resolveDecision,
  getConfidence,
  shouldAutoExecute,
  recalculateScore,
  computeScoreFromCounts,
  computeTrend,
} from "@/lib/confidenceEngine";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DecisionType, Resolution, AutonomyConfig } from "@/types/confidence";
import { DEFAULT_AUTONOMY_CONFIG } from "@/types/confidence";

// ─── Mock Supabase Client ───────────────────────────────────

function createMockSupabase(overrides: Record<string, unknown> = {}) {
  const chainable = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockReturnThis(),
    ...overrides,
  };

  return {
    from: vi.fn(() => chainable),
    _chain: chainable,
  } as unknown as SupabaseClient & { _chain: typeof chainable };
}

// ─── Pure Function Tests ────────────────────────────────────

describe("confidenceEngine — pure functions", () => {
  describe("computeScoreFromCounts", () => {
    it("should return 50 when no decisions exist", () => {
      const score = computeScoreFromCounts(0, 0, 0);
      expect(score).toBe(50);
    });

    it("should return 100 when all decisions are approved", () => {
      const score = computeScoreFromCounts(10, 0, 0);
      expect(score).toBe(100);
    });

    it("should return 0 when all decisions are rejected", () => {
      const score = computeScoreFromCounts(0, 0, 5);
      expect(score).toBe(0);
    });

    it("should weight modified as partial approval (0.5)", () => {
      // 5 approved + 5 modified (worth 2.5) out of 10 total = 75
      const score = computeScoreFromCounts(5, 5, 0);
      expect(score).toBe(75);
    });

    it("should calculate mixed scenario correctly", () => {
      // 7 approved + 2 modified (worth 1.0) + 1 rejected = 10 total
      // score = (7 + 1.0) / 10 * 100 = 80
      const score = computeScoreFromCounts(7, 2, 1);
      expect(score).toBe(80);
    });
  });

  describe("computeTrend", () => {
    it("should return STABLE when fewer than 5 recent decisions", () => {
      const recentResolutions: Resolution[] = ["APPROVED", "APPROVED"];
      const previousResolutions: Resolution[] = [];
      expect(computeTrend(recentResolutions, previousResolutions)).toBe("STABLE");
    });

    it("should return RISING when recent score > previous score by >5", () => {
      // Recent: 10 approved = 100%
      const recent: Resolution[] = Array(10).fill("APPROVED");
      // Previous: 5 approved + 5 rejected = 50%
      const previous: Resolution[] = [
        ...Array(5).fill("APPROVED"),
        ...Array(5).fill("REJECTED"),
      ];
      expect(computeTrend(recent, previous)).toBe("RISING");
    });

    it("should return FALLING when recent score < previous score by >5", () => {
      // Recent: 5 approved + 5 rejected = 50%
      const recent: Resolution[] = [
        ...Array(5).fill("APPROVED"),
        ...Array(5).fill("REJECTED"),
      ];
      // Previous: 10 approved = 100%
      const previous: Resolution[] = Array(10).fill("APPROVED");
      expect(computeTrend(recent, previous)).toBe("FALLING");
    });

    it("should return STABLE when scores are within 5 points", () => {
      // Recent: 9 approved + 1 modified = 95%
      const recent: Resolution[] = [...Array(9).fill("APPROVED"), "MODIFIED"];
      // Previous: 10 approved = 100%
      const previous: Resolution[] = Array(10).fill("APPROVED");
      expect(computeTrend(recent, previous)).toBe("STABLE");
    });
  });
});

// ─── Supabase Integration Tests (mocked) ────────────────────

describe("confidenceEngine — recordDecision", () => {
  it("should insert a decision_log row and return the entry", async () => {
    const insertedRow = {
      id: "dec-001",
      tenant_id: "t-1",
      decision_type: "ORDER_INTAKE",
      entity_type: "order",
      entity_id: "ord-1",
      client_id: null,
      proposed_action: { action: "confirm" },
      actual_action: null,
      input_confidence: 92,
      model_confidence: 88,
      outcome_confidence: null,
      resolution: "PENDING",
      resolved_by: null,
      resolved_at: null,
      created_at: "2026-04-05T10:00:00Z",
    };

    const mock = createMockSupabase();
    mock._chain.insert.mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: insertedRow, error: null }),
      }),
    });

    const result = await recordDecision(mock, {
      tenantId: "t-1",
      decisionType: "ORDER_INTAKE",
      entityType: "order",
      entityId: "ord-1",
      proposedAction: { action: "confirm" },
      inputConfidence: 92,
      modelConfidence: 88,
    });

    expect(mock.from).toHaveBeenCalledWith("decision_log");
    expect(result.id).toBe("dec-001");
    expect(result.resolution).toBe("PENDING");
  });

  it("should throw on Supabase error", async () => {
    const mock = createMockSupabase();
    mock._chain.insert.mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: null, error: { message: "RLS violation" } }),
      }),
    });

    await expect(
      recordDecision(mock, {
        tenantId: "t-1",
        decisionType: "ORDER_INTAKE",
        entityType: "order",
        entityId: "ord-1",
        proposedAction: {},
        inputConfidence: 50,
        modelConfidence: 50,
      })
    ).rejects.toThrow("RLS violation");
  });
});

describe("confidenceEngine — resolveDecision", () => {
  it("should update decision_log with resolution and actual_action", async () => {
    const mock = createMockSupabase();

    const selectData = {
      tenant_id: "t-1",
      decision_type: "ORDER_INTAKE",
      client_id: null,
    };

    let callCount = 0;
    mock.from = vi.fn(() => {
      callCount++;
      if (callCount === 1) {
        // update call
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        } as any;
      }
      if (callCount === 2) {
        // select call to get decision details
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: selectData, error: null }),
            }),
          }),
        } as any;
      }
      // recalculateScore calls
      return mock._chain as any;
    });

    await resolveDecision(mock, "dec-001", "APPROVED", { action: "confirmed_as_is" });

    expect(mock.from).toHaveBeenCalledWith("decision_log");
  });
});

describe("confidenceEngine — getConfidence", () => {
  it("should return current_score from confidence_scores table", async () => {
    const mock = createMockSupabase();
    mock._chain.maybeSingle.mockResolvedValue({
      data: { current_score: 87.5 },
      error: null,
    });

    const score = await getConfidence(mock, "t-1", "ORDER_INTAKE");
    expect(score).toBe(87.5);
    expect(mock.from).toHaveBeenCalledWith("confidence_scores");
  });

  it("should return 50 when no confidence_scores row exists", async () => {
    const mock = createMockSupabase();
    mock._chain.maybeSingle.mockResolvedValue({ data: null, error: null });

    const score = await getConfidence(mock, "t-1", "ORDER_INTAKE");
    expect(score).toBe(50);
  });

  it("should filter by client_id when provided", async () => {
    const mock = createMockSupabase();
    mock._chain.maybeSingle.mockResolvedValue({
      data: { current_score: 94.0 },
      error: null,
    });

    const score = await getConfidence(mock, "t-1", "ORDER_INTAKE", "client-1");
    expect(score).toBe(94.0);
    expect(mock._chain.eq).toHaveBeenCalledWith("client_id", "client-1");
  });
});

describe("confidenceEngine — shouldAutoExecute", () => {
  it("should return auto=true when combined score >= threshold", async () => {
    const mock = createMockSupabase();

    mock._chain.maybeSingle.mockResolvedValue({
      data: { current_score: 95 },
      error: null,
    });

    const config: AutonomyConfig = {
      ...DEFAULT_AUTONOMY_CONFIG,
      enabled: true,
      thresholds: { ORDER_INTAKE: 90 },
    };

    const result = await shouldAutoExecute(mock, config, "t-1", "ORDER_INTAKE", 95);

    expect(result.auto).toBe(true);
    expect(result.combinedScore).toBeGreaterThanOrEqual(90);
  });

  it("should return auto=false when autonomy is disabled", async () => {
    const mock = createMockSupabase();
    mock._chain.maybeSingle.mockResolvedValue({
      data: { current_score: 99 },
      error: null,
    });

    const config: AutonomyConfig = {
      ...DEFAULT_AUTONOMY_CONFIG,
      enabled: false,
    };

    const result = await shouldAutoExecute(mock, config, "t-1", "ORDER_INTAKE", 99);

    expect(result.auto).toBe(false);
    expect(result.reason).toContain("disabled");
  });

  it("should return auto=false when combined score < threshold", async () => {
    const mock = createMockSupabase();
    mock._chain.maybeSingle.mockResolvedValue({
      data: { current_score: 60 },
      error: null,
    });

    const config: AutonomyConfig = {
      ...DEFAULT_AUTONOMY_CONFIG,
      enabled: true,
      thresholds: { ORDER_INTAKE: 90 },
    };

    const result = await shouldAutoExecute(mock, config, "t-1", "ORDER_INTAKE", 70);

    expect(result.auto).toBe(false);
    expect(result.combinedScore).toBeLessThan(90);
  });

  it("should use global_threshold when no per-type threshold is set", async () => {
    const mock = createMockSupabase();
    mock._chain.maybeSingle.mockResolvedValue({
      data: { current_score: 96 },
      error: null,
    });

    const config: AutonomyConfig = {
      enabled: true,
      global_threshold: 95,
      thresholds: {},
      max_autonomous_value_eur: 5000,
      require_human_for: [],
    };

    const result = await shouldAutoExecute(mock, config, "t-1", "CONSOLIDATION", 96);

    expect(result.threshold).toBe(95);
    expect(result.auto).toBe(true);
  });
});
