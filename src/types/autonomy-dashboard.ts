import type { DecisionType, Resolution } from "@/types/confidence";

export interface AutonomyScoreResult {
  overall: number;
  perModule: Record<DecisionType, number>;
  todayStats: {
    autonomous: number;
    validated: number;
    manual: number;
  };
}

export interface LearningMetric {
  clientId: string;
  clientName: string;
  totalOrders: number;
  currentConfidence: number;
  firstSeen: string;
  autonomousSince: string | null;
  status: "autonomous" | "validation" | "learning";
}

export interface CorrectionEntry {
  id: string;
  decisionType: DecisionType;
  entityId: string;
  clientId: string;
  clientName: string;
  proposedAction: string;
  actualAction: string;
  resolvedBy: string;
  resolvedAt: string;
  createdAt: string;
}

export interface CorrectionPattern {
  description: string;
  count: number;
  decisionType: DecisionType;
  example: CorrectionEntry;
}

export interface TrendDataPoint {
  week: string;
  weekLabel: string;
  ORDER_INTAKE: number;
  PLANNING: number;
  DISPATCH: number;
  PRICING: number;
  INVOICING: number;
  CONSOLIDATION: number;
  overall: number;
}
