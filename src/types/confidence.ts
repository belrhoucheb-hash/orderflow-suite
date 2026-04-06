// ─── Confidence Store & Decision Engine Types ───────────────

export type DecisionType =
  | "ORDER_INTAKE"
  | "PLANNING"
  | "DISPATCH"
  | "PRICING"
  | "INVOICING"
  | "CONSOLIDATION";

export const DECISION_TYPES: DecisionType[] = [
  "ORDER_INTAKE",
  "PLANNING",
  "DISPATCH",
  "PRICING",
  "INVOICING",
  "CONSOLIDATION",
];

export const DECISION_TYPE_LABELS: Record<DecisionType, string> = {
  ORDER_INTAKE: "Order Intake",
  PLANNING: "Planning",
  DISPATCH: "Dispatch",
  PRICING: "Pricing",
  INVOICING: "Invoicing",
  CONSOLIDATION: "Consolidation",
};

export type Resolution =
  | "APPROVED"
  | "MODIFIED"
  | "REJECTED"
  | "AUTO_EXECUTED"
  | "PENDING";

export type EntityType = "order" | "trip" | "invoice";

export type Trend = "RISING" | "STABLE" | "FALLING";

// ─── Table Row Types ────────────────────────────────────────

export interface DecisionLogEntry {
  id: string;
  tenant_id: string;
  decision_type: DecisionType;
  entity_type: EntityType;
  entity_id: string;
  client_id: string | null;
  proposed_action: Record<string, unknown>;
  actual_action: Record<string, unknown> | null;
  input_confidence: number | null;
  model_confidence: number | null;
  outcome_confidence: number | null;
  resolution: Resolution;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface ConfidenceScore {
  id: string;
  tenant_id: string;
  decision_type: DecisionType;
  client_id: string | null;
  current_score: number;
  total_decisions: number;
  approved_count: number;
  modified_count: number;
  rejected_count: number;
  trend: Trend;
  last_updated: string;
}

// ─── Autonomy Config (stored in tenants.settings JSONB) ─────

export interface AutonomyThresholds {
  ORDER_INTAKE?: number;
  PLANNING?: number;
  DISPATCH?: number;
  PRICING?: number;
  INVOICING?: number;
  CONSOLIDATION?: number;
}

export interface AutonomyConfig {
  enabled: boolean;
  global_threshold: number;
  thresholds: AutonomyThresholds;
  max_autonomous_value_eur: number;
  require_human_for: string[];
}

export const DEFAULT_AUTONOMY_CONFIG: AutonomyConfig = {
  enabled: false,
  global_threshold: 95,
  thresholds: {
    ORDER_INTAKE: 90,
    PLANNING: 95,
    DISPATCH: 95,
    PRICING: 90,
    INVOICING: 98,
  },
  max_autonomous_value_eur: 5000,
  require_human_for: ["ADR", "KOELING"],
};

// ─── Input / Output Types ───────────────────────────────────

export interface RecordDecisionInput {
  tenantId: string;
  decisionType: DecisionType;
  entityType: EntityType;
  entityId: string;
  clientId?: string | null;
  proposedAction: Record<string, unknown>;
  inputConfidence: number;
  modelConfidence: number;
  resolution?: Resolution;
}

export interface ShouldAutoExecuteResult {
  auto: boolean;
  reason: string;
  inputConfidence: number;
  outcomeConfidence: number;
  threshold: number;
  combinedScore: number;
}

// ─── Confidence Store Types (ai_decisions / confidence_metrics) ──

export type AIDecisionType =
  | "order_extraction"
  | "planning_assignment"
  | "dispatch_auto"
  | "invoice_auto";

export type DecisionOutcome = "accepted" | "corrected" | "rejected";

export interface AIDecision {
  id: string;
  tenant_id: string | null;
  decision_type: AIDecisionType;
  entity_id: string | null;
  entity_type: string | null; // 'order', 'trip', 'invoice'
  confidence_score: number;
  field_confidences: Record<string, number>;
  ai_suggestion: Record<string, unknown>;
  final_values: Record<string, unknown> | null;
  was_auto_approved: boolean;
  was_corrected: boolean;
  correction_summary: Record<string, unknown> | null;
  outcome: DecisionOutcome | null;
  processing_time_ms: number | null;
  model_version: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface ConfidenceMetrics {
  id: string;
  tenant_id: string | null;
  client_id: string | null;
  decision_type: string;
  period_start: string;
  period_end: string;
  total_decisions: number;
  auto_approved_count: number;
  corrected_count: number;
  rejected_count: number;
  avg_confidence: number | null;
  avg_correction_delta: number | null;
  automation_rate: number | null;
  created_at: string;
}

export interface RecordAIDecisionInput {
  tenantId: string;
  decisionType: AIDecisionType;
  entityId?: string;
  entityType?: string;
  confidenceScore: number;
  fieldConfidences?: Record<string, number>;
  aiSuggestion: Record<string, unknown>;
  wasAutoApproved?: boolean;
  processingTimeMs?: number;
  modelVersion?: string;
}

export interface ResolveAIDecisionInput {
  decisionId: string;
  outcome: DecisionOutcome;
  finalValues?: Record<string, unknown>;
  correctionSummary?: Record<string, unknown>;
}

export interface DecisionStats {
  totalDecisions: number;
  autoApprovedCount: number;
  correctedCount: number;
  rejectedCount: number;
  avgConfidence: number;
  automationRate: number;
}

export interface LearningCurvePoint {
  period: string;
  avgConfidence: number;
  automationRate: number;
  totalDecisions: number;
}
