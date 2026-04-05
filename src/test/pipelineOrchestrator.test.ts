import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  evaluateNextStep,
  executeAction,
  createValidationRequest,
  processEvent,
  determineEventType,
  determineNextAction,
} from "@/lib/pipelineOrchestrator";
import type { PipelineAction } from "@/types/pipeline";

// ─── Mock Supabase client ────────────────────────────────────

function createMockChain(resolvedValue: { data: unknown; error: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);
  chain.maybeSingle = vi.fn().mockResolvedValue(resolvedValue);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.then = vi.fn((cb) => cb(resolvedValue));
  return chain;
}

function createMockSupabase(fromOverrides?: Record<string, ReturnType<typeof createMockChain>>) {
  const defaultChain = createMockChain({ data: null, error: null });
  return {
    from: vi.fn((table: string) => {
      if (fromOverrides && fromOverrides[table]) return fromOverrides[table];
      return defaultChain;
    }),
  } as unknown as SupabaseClient;
}

// ─── Mock confidenceEngine ───────────────────────────────────

vi.mock("@/lib/confidenceEngine", () => ({
  shouldAutoExecute: vi.fn(),
  recordDecision: vi.fn().mockResolvedValue({ id: "decision-1", tenant_id: "t-1" }),
  resolveDecision: vi.fn().mockResolvedValue(undefined),
  getConfidence: vi.fn().mockResolvedValue(85),
}));

import { shouldAutoExecute, recordDecision, getConfidence } from "@/lib/confidenceEngine";

const mockShouldAutoExecute = vi.mocked(shouldAutoExecute);
const mockRecordDecision = vi.mocked(recordDecision);
const mockGetConfidence = vi.mocked(getConfidence);

beforeEach(() => {
  vi.clearAllMocks();
  mockRecordDecision.mockResolvedValue({ id: "decision-1", tenant_id: "t-1" } as any);
  mockGetConfidence.mockResolvedValue(85);
});

// ─── determineEventType ──────────────────────────────────────

describe("determineEventType", () => {
  it("maps DRAFT status to ORDER_CREATED", () => {
    expect(determineEventType("order", "DRAFT")).toBe("ORDER_CREATED");
  });

  it("maps PENDING status to ORDER_CREATED", () => {
    expect(determineEventType("order", "PENDING")).toBe("ORDER_CREATED");
  });

  it("maps CONFIRMED status to ORDER_CONFIRMED", () => {
    expect(determineEventType("order", "CONFIRMED")).toBe("ORDER_CONFIRMED");
  });

  it("maps PLANNED status to TRIP_PLANNED", () => {
    expect(determineEventType("trip", "PLANNED")).toBe("TRIP_PLANNED");
  });

  it("maps DISPATCHED status to TRIP_DISPATCHED", () => {
    expect(determineEventType("trip", "DISPATCHED")).toBe("TRIP_DISPATCHED");
  });

  it("maps IN_TRANSIT status to TRIP_DISPATCHED", () => {
    expect(determineEventType("trip", "IN_TRANSIT")).toBe("TRIP_DISPATCHED");
  });

  it("maps DELIVERED status to DELIVERY_COMPLETE", () => {
    expect(determineEventType("order", "DELIVERED")).toBe("DELIVERY_COMPLETE");
  });

  it("returns null for unknown status", () => {
    expect(determineEventType("order", "UNKNOWN_STATUS")).toBeNull();
  });
});

// ─── determineNextAction ─────────────────────────────────────

describe("determineNextAction", () => {
  it("returns CONFIRM_ORDER for ORDER_CREATED", () => {
    expect(determineNextAction("ORDER_CREATED")).toBe("CONFIRM_ORDER");
  });

  it("returns ASSIGN_VEHICLE for ORDER_CONFIRMED", () => {
    expect(determineNextAction("ORDER_CONFIRMED")).toBe("ASSIGN_VEHICLE");
  });

  it("returns DISPATCH_TRIP for TRIP_PLANNED", () => {
    expect(determineNextAction("TRIP_PLANNED")).toBe("DISPATCH_TRIP");
  });

  it("returns SEND_INVOICE for DELIVERY_COMPLETE", () => {
    expect(determineNextAction("DELIVERY_COMPLETE")).toBe("SEND_INVOICE");
  });

  it("returns null for TRIP_DISPATCHED (no auto-action)", () => {
    expect(determineNextAction("TRIP_DISPATCHED")).toBeNull();
  });

  it("returns null for INVOICE_READY (terminal)", () => {
    expect(determineNextAction("INVOICE_READY")).toBeNull();
  });
});

// ─── evaluateNextStep ────────────────────────────────────────

describe("evaluateNextStep", () => {
  it("returns AUTO_EXECUTE when confidence is above threshold", async () => {
    mockShouldAutoExecute.mockResolvedValue({
      auto: true, reason: "Above threshold",
      inputConfidence: 85, outcomeConfidence: 85, threshold: 90, combinedScore: 95,
    });
    const sb = createMockSupabase();

    const result = await evaluateNextStep(sb, "t-1", "order", "o-1", "CONFIRMED");

    expect(result.evaluationResult).toBe("AUTO_EXECUTE");
    expect(result.action).not.toBeNull();
    expect(result.action!.actionType).toBe("ASSIGN_VEHICLE");
  });

  it("returns NEEDS_VALIDATION when confidence is below threshold", async () => {
    mockShouldAutoExecute.mockResolvedValue({
      auto: false, reason: "Below threshold",
      inputConfidence: 60, outcomeConfidence: 60, threshold: 90, combinedScore: 60,
    });
    const sb = createMockSupabase();

    const result = await evaluateNextStep(sb, "t-1", "order", "o-1", "CONFIRMED");

    expect(result.evaluationResult).toBe("NEEDS_VALIDATION");
    expect(result.action).not.toBeNull();
  });

  it("returns BLOCKED when no action maps to the event type", async () => {
    const sb = createMockSupabase();

    const result = await evaluateNextStep(sb, "t-1", "trip", "trip-1", "DISPATCHED");

    expect(result.evaluationResult).toBe("BLOCKED");
    expect(result.action).toBeNull();
  });

  it("returns BLOCKED when status is unknown", async () => {
    const sb = createMockSupabase();

    const result = await evaluateNextStep(sb, "t-1", "order", "o-1", "CANCELLED");

    expect(result.evaluationResult).toBe("BLOCKED");
    expect(result.action).toBeNull();
  });

  it("passes correct arguments to shouldAutoExecute", async () => {
    mockShouldAutoExecute.mockResolvedValue({
      auto: true, reason: "OK",
      inputConfidence: 85, outcomeConfidence: 85, threshold: 90, combinedScore: 95,
    });
    const sb = createMockSupabase();

    await evaluateNextStep(sb, "t-1", "order", "o-1", "DRAFT");

    expect(mockShouldAutoExecute).toHaveBeenCalledWith(
      sb,
      expect.any(Object),
      "t-1",
      "ORDER_INTAKE",
      85
    );
  });
});

// ─── executeAction ───────────────────────────────────────────

describe("executeAction", () => {
  it("updates order status for CONFIRM_ORDER", async () => {
    const ordersChain = createMockChain({ data: { id: "o-1", status: "CONFIRMED" }, error: null });
    const sb = createMockSupabase({ orders: ordersChain });

    const action: PipelineAction = {
      tenantId: "t-1",
      entityType: "order",
      entityId: "o-1",
      actionType: "CONFIRM_ORDER",
      payload: { status: "CONFIRMED" },
    };

    await executeAction(sb, action);

    expect(sb.from).toHaveBeenCalledWith("orders");
    expect(ordersChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "CONFIRMED" })
    );
  });

  it("throws on supabase error", async () => {
    const ordersChain = createMockChain({ data: null, error: { message: "DB error" } });
    const sb = createMockSupabase({ orders: ordersChain });

    const action: PipelineAction = {
      tenantId: "t-1",
      entityType: "order",
      entityId: "o-1",
      actionType: "CONFIRM_ORDER",
      payload: { status: "CONFIRMED" },
    };

    await expect(executeAction(sb, action)).rejects.toThrow("DB error");
  });
});

// ─── createValidationRequest ─────────────────────────────────

describe("createValidationRequest", () => {
  it("inserts into validation_queue with correct data", async () => {
    const vqChain = createMockChain({ data: { id: "vq-1" }, error: null });
    const sb = createMockSupabase({ validation_queue: vqChain });

    await createValidationRequest(
      sb, "t-1", "decision-1", "order", "o-1", "CONFIRM_ORDER",
      { status: "CONFIRMED" }, 78.5
    );

    expect(sb.from).toHaveBeenCalledWith("validation_queue");
    expect(vqChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: "t-1",
        decision_log_id: "decision-1",
        entity_type: "order",
        entity_id: "o-1",
        action_type: "CONFIRM_ORDER",
        proposed_action: { status: "CONFIRMED" },
        confidence: 78.5,
        status: "PENDING",
      })
    );
  });

  it("sets priority based on action_type", async () => {
    const vqChain = createMockChain({ data: { id: "vq-1" }, error: null });
    const sb = createMockSupabase({ validation_queue: vqChain });

    await createValidationRequest(sb, "t-1", "d-1", "order", "o-1", "CONFIRM_ORDER", {}, 50);

    expect(vqChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ priority: expect.any(Number) })
    );
  });

  it("throws on supabase error", async () => {
    const vqChain = createMockChain({ data: null, error: { message: "Insert failed" } });
    const sb = createMockSupabase({ validation_queue: vqChain });

    await expect(
      createValidationRequest(sb, "t-1", "d-1", "order", "o-1", "CONFIRM_ORDER", {}, 50)
    ).rejects.toThrow("Insert failed");
  });
});

// ─── processEvent ────────────────────────────────────────────

describe("processEvent", () => {
  it("auto-executes when confidence is high", async () => {
    mockShouldAutoExecute.mockResolvedValue({
      auto: true, reason: "OK",
      inputConfidence: 95, outcomeConfidence: 95, threshold: 90, combinedScore: 95,
    });
    const peChain = createMockChain({ data: { id: "pe-1" }, error: null });
    const ordersChain = createMockChain({ data: { id: "o-1", status: "CONFIRMED" }, error: null });
    const sb = createMockSupabase({
      pipeline_events: peChain,
      orders: ordersChain,
    });

    await processEvent(sb, "t-1", "order", "o-1", "DRAFT", "CONFIRMED");

    expect(sb.from).toHaveBeenCalledWith("pipeline_events");
    expect(peChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        evaluation_result: "AUTO_EXECUTE",
        event_type: "ORDER_CONFIRMED",
      })
    );
    expect(mockRecordDecision).toHaveBeenCalled();
  });

  it("creates validation request when confidence is low", async () => {
    mockShouldAutoExecute.mockResolvedValue({
      auto: false, reason: "Below threshold",
      inputConfidence: 60, outcomeConfidence: 60, threshold: 90, combinedScore: 60,
    });
    const peChain = createMockChain({ data: { id: "pe-1" }, error: null });
    const vqChain = createMockChain({ data: { id: "vq-1" }, error: null });
    const sb = createMockSupabase({
      pipeline_events: peChain,
      validation_queue: vqChain,
    });

    await processEvent(sb, "t-1", "order", "o-1", "DRAFT", "CONFIRMED");

    expect(peChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ evaluation_result: "NEEDS_VALIDATION" })
    );
    expect(sb.from).toHaveBeenCalledWith("validation_queue");
  });

  it("logs BLOCKED for events with no next action", async () => {
    const peChain = createMockChain({ data: { id: "pe-1" }, error: null });
    const sb = createMockSupabase({ pipeline_events: peChain });

    await processEvent(sb, "t-1", "trip", "trip-1", "PLANNED", "DISPATCHED");

    expect(peChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        evaluation_result: "BLOCKED",
        event_type: "TRIP_DISPATCHED",
      })
    );
    expect(mockShouldAutoExecute).not.toHaveBeenCalled();
  });

  it("handles unknown status gracefully", async () => {
    const peChain = createMockChain({ data: { id: "pe-1" }, error: null });
    const sb = createMockSupabase({ pipeline_events: peChain });

    await processEvent(sb, "t-1", "order", "o-1", "CONFIRMED", "CANCELLED");

    expect(peChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ evaluation_result: "BLOCKED" })
    );
  });

  it("uses previous_status and new_status in pipeline event log", async () => {
    mockShouldAutoExecute.mockResolvedValue({
      auto: true, reason: "OK",
      inputConfidence: 85, outcomeConfidence: 85, threshold: 80, combinedScore: 85,
    });
    const peChain = createMockChain({ data: { id: "pe-1" }, error: null });
    const ordersChain = createMockChain({ data: { id: "o-1" }, error: null });
    const sb = createMockSupabase({
      pipeline_events: peChain,
      orders: ordersChain,
    });

    await processEvent(sb, "t-1", "order", "o-1", "DRAFT", "PENDING");

    expect(peChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        previous_status: "DRAFT",
        new_status: "PENDING",
      })
    );
  });
});
