import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  recordAIDecision,
  resolveAIDecision,
} from "@/hooks/useConfidenceStore";
import type {
  AIDecisionType,
  DecisionOutcome,
  RecordAIDecisionInput,
  ResolveAIDecisionInput,
} from "@/types/confidence";

// ─── Mock Supabase ──────────────────────────────────────────

const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockGte = vi.fn();
const mockSingle = vi.fn();

vi.mock("@/integrations/supabase/client", () => {
  const chainable = {
    insert: (...args: unknown[]) => {
      mockInsert(...args);
      return chainable;
    },
    update: (...args: unknown[]) => {
      mockUpdate(...args);
      return chainable;
    },
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return chainable;
    },
    eq: (...args: unknown[]) => {
      mockEq(...args);
      return chainable;
    },
    gte: (...args: unknown[]) => {
      mockGte(...args);
      return chainable;
    },
    single: (...args: unknown[]) => {
      mockSingle(...args);
      return mockSingle();
    },
  };

  return {
    supabase: {
      from: vi.fn(() => chainable),
    },
  };
});

// ─── Reset Mocks ────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Tests: recordAIDecision ────────────────────────────────

describe("recordAIDecision", () => {
  it("should insert an ai_decisions row and return the decision", async () => {
    const insertedRow = {
      id: "dec-001",
      tenant_id: "t-1",
      decision_type: "order_extraction",
      entity_id: "ord-1",
      entity_type: "order",
      confidence_score: 92,
      field_confidences: { pickup_address: 95, delivery_address: 88 },
      ai_suggestion: { pickup_address: "Amsterdam", delivery_address: "Rotterdam" },
      final_values: null,
      was_auto_approved: false,
      was_corrected: false,
      correction_summary: null,
      outcome: null,
      processing_time_ms: null,
      model_version: null,
      created_at: "2026-04-05T10:00:00Z",
      resolved_at: null,
    };

    mockSingle.mockResolvedValue({ data: insertedRow, error: null });

    const result = await recordAIDecision({
      tenantId: "t-1",
      decisionType: "order_extraction",
      entityId: "ord-1",
      entityType: "order",
      confidenceScore: 92,
      fieldConfidences: { pickup_address: 95, delivery_address: 88 },
      aiSuggestion: { pickup_address: "Amsterdam", delivery_address: "Rotterdam" },
    });

    expect(result.id).toBe("dec-001");
    expect(result.decision_type).toBe("order_extraction");
    expect(result.confidence_score).toBe(92);
    expect(result.was_auto_approved).toBe(false);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: "t-1",
        decision_type: "order_extraction",
        confidence_score: 92,
      })
    );
  });

  it("should throw on Supabase error", async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: "RLS violation" } });

    await expect(
      recordAIDecision({
        tenantId: "t-1",
        decisionType: "order_extraction",
        confidenceScore: 50,
        aiSuggestion: {},
      })
    ).rejects.toThrow("RLS violation");
  });

  it("should set was_auto_approved when confidence >= 95", async () => {
    const insertedRow = {
      id: "dec-002",
      tenant_id: "t-1",
      decision_type: "order_extraction",
      entity_id: "ord-2",
      entity_type: "order",
      confidence_score: 97,
      field_confidences: {},
      ai_suggestion: {},
      final_values: null,
      was_auto_approved: true,
      was_corrected: false,
      correction_summary: null,
      outcome: null,
      processing_time_ms: null,
      model_version: null,
      created_at: "2026-04-05T10:00:00Z",
      resolved_at: null,
    };

    mockSingle.mockResolvedValue({ data: insertedRow, error: null });

    const result = await recordAIDecision({
      tenantId: "t-1",
      decisionType: "order_extraction",
      entityId: "ord-2",
      entityType: "order",
      confidenceScore: 97,
      aiSuggestion: {},
      wasAutoApproved: true,
    });

    expect(result.was_auto_approved).toBe(true);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        was_auto_approved: true,
      })
    );
  });
});

// ─── Tests: resolveAIDecision ───────────────────────────────

describe("resolveAIDecision — resolving with corrections", () => {
  it("should update ai_decisions with outcome 'corrected' and correction_summary", async () => {
    mockEq.mockResolvedValue({ error: null });

    await resolveAIDecision({
      decisionId: "dec-001",
      outcome: "corrected",
      finalValues: { pickup_address: "Corrected Amsterdam Address" },
      correctionSummary: { pickupChanged: true, deliveryChanged: false },
    });

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "corrected",
        was_corrected: true,
        correction_summary: { pickupChanged: true, deliveryChanged: false },
      })
    );
  });

  it("should update ai_decisions with outcome 'accepted' and was_corrected=false", async () => {
    mockEq.mockResolvedValue({ error: null });

    await resolveAIDecision({
      decisionId: "dec-002",
      outcome: "accepted",
      finalValues: { pickup_address: "Amsterdam" },
    });

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "accepted",
        was_corrected: false,
      })
    );
  });

  it("should set resolved_at timestamp when resolving", async () => {
    mockEq.mockResolvedValue({ error: null });

    await resolveAIDecision({
      decisionId: "dec-003",
      outcome: "rejected",
    });

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "rejected",
        was_corrected: false,
        resolved_at: expect.any(String),
      })
    );
  });
});

// ─── Tests: type validation ─────────────────────────────────

describe("Confidence Store types", () => {
  it("AIDecisionType should accept valid types", () => {
    const types: AIDecisionType[] = [
      "order_extraction",
      "planning_assignment",
      "dispatch_auto",
      "invoice_auto",
    ];
    expect(types).toHaveLength(4);
  });

  it("DecisionOutcome should accept valid outcomes", () => {
    const outcomes: DecisionOutcome[] = ["accepted", "corrected", "rejected"];
    expect(outcomes).toHaveLength(3);
  });

  it("RecordAIDecisionInput should be constructable with required fields", () => {
    const input: RecordAIDecisionInput = {
      tenantId: "t-1",
      decisionType: "order_extraction",
      confidenceScore: 85,
      aiSuggestion: { test: true },
    };
    expect(input.tenantId).toBe("t-1");
    expect(input.entityId).toBeUndefined();
    expect(input.wasAutoApproved).toBeUndefined();
  });
});
