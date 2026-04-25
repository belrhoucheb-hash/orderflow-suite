export const EXCEPTION_ACTION_TYPES = [
  "SEND_ETA_UPDATE",
  "REQUEST_MISSING_INFO",
  "FLAG_BILLING_REVIEW",
  "REORDER_STOPS",
  "REASSIGN_ORDER",
  "REMIND_DRIVER_FOR_POD",
  "RESOLVE_EXCEPTION",
] as const;

export type ExceptionActionType = (typeof EXCEPTION_ACTION_TYPES)[number];

export const EXCEPTION_ACTION_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "AUTO_EXECUTED",
  "EXECUTED",
  "FAILED",
] as const;

export type ExceptionActionStatus = (typeof EXCEPTION_ACTION_STATUSES)[number];

export const EXCEPTION_ACTION_RUN_TYPES = [
  "PROPOSED",
  "APPROVED",
  "REJECTED",
  "EXECUTED",
  "AUTO_EXECUTED",
  "FAILED",
  "DISMISSED",
] as const;

export type ExceptionActionRunType = (typeof EXCEPTION_ACTION_RUN_TYPES)[number];

export const EXCEPTION_ACTION_RUN_RESULTS = [
  "SUCCESS",
  "FAILED",
  "SKIPPED",
  "ACKNOWLEDGED",
] as const;

export type ExceptionActionRunResult = (typeof EXCEPTION_ACTION_RUN_RESULTS)[number];

export const EXCEPTION_SOURCE_TYPES = [
  "delivery_exception",
  "anomaly",
  "adhoc",
] as const;

export type ExceptionSourceType = (typeof EXCEPTION_SOURCE_TYPES)[number];

export interface ExceptionActionImpact {
  timeSavedMinutes?: number;
  costDelta?: number;
  customerImpact?: "low" | "medium" | "high";
  riskReduction?: "low" | "medium" | "high";
  summary?: string;
  [key: string]: unknown;
}

export interface ExceptionActionPayload {
  orderId?: string;
  tripId?: string;
  stopId?: string;
  customerNotificationTemplate?: string;
  missingFields?: string[];
  reason?: string;
  [key: string]: unknown;
}

export interface ExceptionAction {
  id: string;
  tenantId: string;
  exceptionId?: string;
  sourceType: ExceptionSourceType;
  sourceRef: string;
  actionType: ExceptionActionType | string;
  title: string;
  description?: string;
  confidence: number;
  impact: ExceptionActionImpact;
  payload: ExceptionActionPayload;
  status: ExceptionActionStatus;
  recommended: boolean;
  requiresApproval: boolean;
  executedAt?: string;
  executedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExceptionActionRun {
  id: string;
  tenantId: string;
  exceptionActionId: string;
  runType: ExceptionActionRunType;
  result: ExceptionActionRunResult;
  notes?: string;
  payload: Record<string, unknown>;
  createdBy?: string;
  createdAt: string;
}

export interface ExceptionActionRow {
  id: string;
  tenant_id: string;
  exception_id: string | null;
  source_type: string;
  source_ref: string;
  action_type: string;
  title: string;
  description: string | null;
  confidence: number;
  impact_json: Record<string, unknown> | null;
  payload_json: Record<string, unknown> | null;
  status: string;
  recommended: boolean;
  requires_approval: boolean;
  executed_at: string | null;
  executed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExceptionActionRunRow {
  id: string;
  tenant_id: string;
  exception_action_id: string;
  run_type: string;
  result: string;
  notes: string | null;
  payload_json: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
}

export interface ExceptionActionFilters {
  sourceType?: ExceptionSourceType;
  sourceRef?: string;
  exceptionId?: string;
  status?: ExceptionActionStatus | "ALL";
  recommendedOnly?: boolean;
}

export interface CreateExceptionActionInput {
  exceptionId?: string;
  sourceType: ExceptionSourceType;
  sourceRef: string;
  actionType: ExceptionActionType | string;
  title: string;
  description?: string;
  confidence: number;
  impact?: ExceptionActionImpact;
  payload?: ExceptionActionPayload;
  status?: ExceptionActionStatus;
  recommended?: boolean;
  requiresApproval?: boolean;
}

export interface RecordExceptionActionRunInput {
  exceptionActionId: string;
  runType: ExceptionActionRunType;
  result: ExceptionActionRunResult;
  notes?: string;
  payload?: Record<string, unknown>;
}

export function mapRowToExceptionAction(row: ExceptionActionRow): ExceptionAction {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    exceptionId: row.exception_id ?? undefined,
    sourceType: row.source_type as ExceptionSourceType,
    sourceRef: row.source_ref,
    actionType: row.action_type,
    title: row.title,
    description: row.description ?? undefined,
    confidence: Number(row.confidence ?? 0),
    impact: (row.impact_json ?? {}) as ExceptionActionImpact,
    payload: (row.payload_json ?? {}) as ExceptionActionPayload,
    status: row.status as ExceptionActionStatus,
    recommended: row.recommended,
    requiresApproval: row.requires_approval,
    executedAt: row.executed_at ?? undefined,
    executedBy: row.executed_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapRowToExceptionActionRun(row: ExceptionActionRunRow): ExceptionActionRun {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    exceptionActionId: row.exception_action_id,
    runType: row.run_type as ExceptionActionRunType,
    result: row.result as ExceptionActionRunResult,
    notes: row.notes ?? undefined,
    payload: row.payload_json ?? {},
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
  };
}
