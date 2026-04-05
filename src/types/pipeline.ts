// ─── Event-Driven Pipeline Types ─────────────────────────────

export type EventType =
  | "ORDER_CREATED"
  | "ORDER_CONFIRMED"
  | "TRIP_PLANNED"
  | "TRIP_DISPATCHED"
  | "DELIVERY_COMPLETE"
  | "INVOICE_READY";

export type PipelineEntityType = "order" | "trip" | "invoice";

export type EvaluationResult = "AUTO_EXECUTE" | "NEEDS_VALIDATION" | "BLOCKED";

export type PipelineActionType =
  | "CONFIRM_ORDER"
  | "ASSIGN_VEHICLE"
  | "DISPATCH_TRIP"
  | "SEND_INVOICE";

export type ValidationStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";

export interface PipelineEvent {
  id: string;
  tenant_id: string;
  entity_type: PipelineEntityType;
  entity_id: string;
  event_type: EventType;
  previous_status: string | null;
  new_status: string | null;
  evaluation_result: EvaluationResult | null;
  confidence_at_evaluation: number | null;
  action_taken: Record<string, unknown> | null;
  processed_at: string;
}

export interface PipelineAction {
  tenantId: string;
  entityType: PipelineEntityType;
  entityId: string;
  actionType: PipelineActionType;
  payload: Record<string, unknown>;
}

export interface ValidationItem {
  id: string;
  tenant_id: string;
  decision_log_id: string;
  entity_type: PipelineEntityType;
  entity_id: string;
  action_type: PipelineActionType;
  proposed_action: Record<string, unknown>;
  confidence: number | null;
  priority: number;
  status: ValidationStatus;
  expires_at: string | null;
  created_at: string;
}

export const EVENT_TO_ACTION: Record<EventType, PipelineActionType | null> = {
  ORDER_CREATED: "CONFIRM_ORDER",
  ORDER_CONFIRMED: "ASSIGN_VEHICLE",
  TRIP_PLANNED: "DISPATCH_TRIP",
  TRIP_DISPATCHED: null,
  DELIVERY_COMPLETE: "SEND_INVOICE",
  INVOICE_READY: null,
};

export const EVENT_TO_DECISION_TYPE: Record<EventType, string> = {
  ORDER_CREATED: "ORDER_INTAKE",
  ORDER_CONFIRMED: "PLANNING",
  TRIP_PLANNED: "DISPATCH",
  TRIP_DISPATCHED: "DISPATCH",
  DELIVERY_COMPLETE: "INVOICING",
  INVOICE_READY: "INVOICING",
};

export const STATUS_TO_EVENT: Record<string, EventType> = {
  DRAFT: "ORDER_CREATED",
  PENDING: "ORDER_CREATED",
  CONFIRMED: "ORDER_CONFIRMED",
  PLANNED: "TRIP_PLANNED",
  DISPATCHED: "TRIP_DISPATCHED",
  IN_TRANSIT: "TRIP_DISPATCHED",
  DELIVERED: "DELIVERY_COMPLETE",
};
