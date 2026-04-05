import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  EventType,
  EvaluationResult,
  PipelineAction,
  PipelineActionType,
  PipelineEntityType,
} from "@/types/pipeline";
import {
  EVENT_TO_ACTION,
  EVENT_TO_DECISION_TYPE,
  STATUS_TO_EVENT,
} from "@/types/pipeline";
import {
  shouldAutoExecute,
  recordDecision,
  getConfidence,
} from "@/lib/confidenceEngine";
import type { DecisionType, AutonomyConfig } from "@/types/confidence";
import { DEFAULT_AUTONOMY_CONFIG } from "@/types/confidence";

// ─── Priority map for validation queue ordering ──────────────

const ACTION_PRIORITY: Record<PipelineActionType, number> = {
  CONFIRM_ORDER: 10,
  ASSIGN_VEHICLE: 5,
  DISPATCH_TRIP: 8,
  SEND_INVOICE: 3,
};

// ─── Public helpers ──────────────────────────────────────────

export function determineEventType(
  _entityType: PipelineEntityType | string,
  newStatus: string
): EventType | null {
  return (STATUS_TO_EVENT[newStatus] as EventType) ?? null;
}

export function determineNextAction(eventType: EventType): PipelineActionType | null {
  return EVENT_TO_ACTION[eventType] ?? null;
}

// ─── Core pipeline functions ─────────────────────────────────

export interface EvaluationOutput {
  evaluationResult: EvaluationResult;
  action: PipelineAction | null;
  confidence: number;
  eventType: EventType | null;
}

export async function evaluateNextStep(
  supabase: SupabaseClient,
  tenantId: string,
  entityType: PipelineEntityType | string,
  entityId: string,
  newStatus: string,
  autonomyConfig?: AutonomyConfig
): Promise<EvaluationOutput> {
  const eventType = determineEventType(entityType, newStatus);

  if (!eventType) {
    return { evaluationResult: "BLOCKED", action: null, confidence: 0, eventType: null };
  }

  const actionType = determineNextAction(eventType);

  if (!actionType) {
    return { evaluationResult: "BLOCKED", action: null, confidence: 0, eventType };
  }

  const decisionType = EVENT_TO_DECISION_TYPE[eventType] as DecisionType;
  const confidence = await getConfidence(supabase, tenantId, decisionType);
  const config = autonomyConfig ?? DEFAULT_AUTONOMY_CONFIG;

  const { auto } = await shouldAutoExecute(
    supabase,
    config,
    tenantId,
    decisionType,
    confidence
  );

  const action: PipelineAction = {
    tenantId,
    entityType: entityType as PipelineEntityType,
    entityId,
    actionType,
    payload: buildActionPayload(actionType, entityId),
  };

  return {
    evaluationResult: auto ? "AUTO_EXECUTE" : "NEEDS_VALIDATION",
    action,
    confidence,
    eventType,
  };
}

export async function executeAction(
  supabase: SupabaseClient,
  action: PipelineAction
): Promise<void> {
  const { entityId, actionType, payload } = action;

  switch (actionType) {
    case "CONFIRM_ORDER": {
      const { error } = await supabase
        .from("orders")
        .update({ status: "CONFIRMED", ...payload })
        .eq("id", entityId);
      if (error) throw new Error(error.message);
      break;
    }
    case "ASSIGN_VEHICLE": {
      const { error } = await supabase
        .from("orders")
        .update({ status: "PLANNED", ...payload })
        .eq("id", entityId);
      if (error) throw new Error(error.message);
      break;
    }
    case "DISPATCH_TRIP": {
      const { error } = await supabase
        .from("trips")
        .update({ dispatch_status: "VERZONDEN", ...payload })
        .eq("id", entityId);
      if (error) throw new Error(error.message);
      break;
    }
    case "SEND_INVOICE": {
      const { error } = await supabase
        .from("invoices")
        .update({ status: "verzonden", ...payload })
        .eq("id", entityId);
      if (error) throw new Error(error.message);
      break;
    }
    default: {
      const _exhaustive: never = actionType;
      throw new Error(`Unknown action type: ${_exhaustive}`);
    }
  }
}

export async function createValidationRequest(
  supabase: SupabaseClient,
  tenantId: string,
  decisionLogId: string,
  entityType: PipelineEntityType | string,
  entityId: string,
  actionType: PipelineActionType | string,
  proposedAction: Record<string, unknown>,
  confidence: number
): Promise<void> {
  const priority = ACTION_PRIORITY[actionType as PipelineActionType] ?? 0;
  const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase.from("validation_queue").insert({
    tenant_id: tenantId,
    decision_log_id: decisionLogId,
    entity_type: entityType,
    entity_id: entityId,
    action_type: actionType,
    proposed_action: proposedAction,
    confidence,
    priority,
    status: "PENDING",
    expires_at: expiresAt,
  });

  if (error) throw new Error(error.message);
}

export async function processEvent(
  supabase: SupabaseClient,
  tenantId: string,
  entityType: PipelineEntityType | string,
  entityId: string,
  previousStatus: string,
  newStatus: string,
  autonomyConfig?: AutonomyConfig
): Promise<void> {
  const evaluation = await evaluateNextStep(
    supabase, tenantId, entityType, entityId, newStatus, autonomyConfig
  );

  if (evaluation.evaluationResult === "BLOCKED") {
    await logPipelineEvent(supabase, {
      tenant_id: tenantId,
      entity_type: entityType,
      entity_id: entityId,
      event_type: evaluation.eventType ?? determineEventType(entityType, newStatus) ?? newStatus,
      previous_status: previousStatus,
      new_status: newStatus,
      evaluation_result: "BLOCKED",
      confidence_at_evaluation: evaluation.confidence,
      action_taken: null,
    });
    return;
  }

  const decisionType = evaluation.eventType
    ? (EVENT_TO_DECISION_TYPE[evaluation.eventType] as DecisionType)
    : ("ORDER_INTAKE" as DecisionType);

  const decision = await recordDecision(supabase, {
    tenantId,
    decisionType,
    entityType: entityType as PipelineEntityType,
    entityId,
    proposedAction: evaluation.action!.payload,
    inputConfidence: evaluation.confidence,
    modelConfidence: evaluation.confidence,
    resolution: evaluation.evaluationResult === "AUTO_EXECUTE" ? "AUTO_EXECUTED" : "PENDING",
  });

  if (evaluation.evaluationResult === "AUTO_EXECUTE") {
    let execError: string | null = null;
    try {
      await executeAction(supabase, evaluation.action!);
    } catch (e) {
      execError = e instanceof Error ? e.message : String(e);
    }

    await logPipelineEvent(supabase, {
      tenant_id: tenantId,
      entity_type: entityType,
      entity_id: entityId,
      event_type: evaluation.eventType!,
      previous_status: previousStatus,
      new_status: newStatus,
      evaluation_result: execError ? "BLOCKED" : "AUTO_EXECUTE",
      confidence_at_evaluation: evaluation.confidence,
      action_taken: {
        actionType: evaluation.action!.actionType,
        payload: evaluation.action!.payload,
        decisionId: decision.id,
        error: execError,
      },
    });
  } else {
    await createValidationRequest(
      supabase,
      tenantId,
      decision.id,
      entityType,
      entityId,
      evaluation.action!.actionType,
      evaluation.action!.payload,
      evaluation.confidence
    );

    await logPipelineEvent(supabase, {
      tenant_id: tenantId,
      entity_type: entityType,
      entity_id: entityId,
      event_type: evaluation.eventType!,
      previous_status: previousStatus,
      new_status: newStatus,
      evaluation_result: "NEEDS_VALIDATION",
      confidence_at_evaluation: evaluation.confidence,
      action_taken: {
        actionType: evaluation.action!.actionType,
        proposedPayload: evaluation.action!.payload,
        decisionId: decision.id,
        validationRequired: true,
      },
    });
  }
}

// ─── Internal helpers ────────────────────────────────────────

function buildActionPayload(
  actionType: PipelineActionType,
  entityId: string
): Record<string, unknown> {
  switch (actionType) {
    case "CONFIRM_ORDER":
      return { status: "CONFIRMED", entityId };
    case "ASSIGN_VEHICLE":
      return { status: "PLANNED", entityId };
    case "DISPATCH_TRIP":
      return { dispatch_status: "VERZONDEN", entityId };
    case "SEND_INVOICE":
      return { status: "verzonden", entityId };
    default:
      return { entityId };
  }
}

async function logPipelineEvent(
  supabase: SupabaseClient,
  event: {
    tenant_id: string;
    entity_type: string;
    entity_id: string;
    event_type: string;
    previous_status: string;
    new_status: string;
    evaluation_result: string;
    confidence_at_evaluation: number;
    action_taken: Record<string, unknown> | null;
  }
): Promise<void> {
  const { error } = await supabase.from("pipeline_events").insert(event);
  if (error) {
    console.warn("Failed to log pipeline event:", error.message);
  }
}
