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
