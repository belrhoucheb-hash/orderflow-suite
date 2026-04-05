import type { Assignments, PlanOrder } from "@/components/planning/types";
import type { FleetVehicle } from "@/hooks/useVehicles";
import type { GeoCoord } from "@/data/geoData";

/** Trigger types for planning re-evaluations */
export type PlanningTriggerType =
  | "NEW_ORDER"
  | "CANCELLATION"
  | "VEHICLE_CHANGE"
  | "MANUAL"
  | "SCHEDULE";

/** Confidence breakdown for a planning solution */
export interface PlanningConfidence {
  /** Overall score 0-100 */
  score: number;
  /** Weight utilization across all vehicles, 0-100 */
  utilization_pct: number;
  /** Average minutes of slack before time window closes */
  avg_window_slack_min: number;
  /** Ratio of straight-line distance to actual route distance (0-1, higher = more efficient) */
  efficiency_ratio: number;
}

/** Result of a planning operation (incremental or full) */
export interface PlanningResult {
  assignments: Assignments;
  confidence: PlanningConfidence;
  trigger_type: PlanningTriggerType;
  trigger_entity_id: string | null;
  orders_evaluated: number;
  orders_assigned: number;
  orders_changed: number;
  planning_duration_ms: number;
  auto_executed: boolean;
  /** Vehicle the new order was inserted into (incremental only) */
  inserted_into: string | null;
}

/** Result of a what-if vehicle removal simulation */
export interface WhatIfResult {
  /** Vehicle that was removed */
  removed_vehicle_id: string;
  /** Orders originally assigned to the removed vehicle */
  affected_orders: PlanOrder[];
  /** Orders successfully reassigned to other vehicles */
  reassigned_orders: PlanOrder[];
  /** Orders that could not be assigned to any remaining vehicle */
  unassignable_orders: PlanOrder[];
  /** New assignments without the removed vehicle */
  new_assignments: Assignments;
  /** Confidence of the new solution */
  confidence: PlanningConfidence;
}

/** Row shape for the planning_events table */
export interface PlanningEventRow {
  id: string;
  tenant_id: string;
  trigger_type: PlanningTriggerType;
  trigger_entity_id: string | null;
  orders_evaluated: number;
  orders_assigned: number;
  orders_changed: number;
  confidence: number;
  planning_duration_ms: number;
  auto_executed: boolean;
  assignments_snapshot: Record<string, string[]> | null;
  created_at: string;
}
