// ─── Plan E: Autonomous Dispatch & Execution Types ─────────

export const ANOMALY_TYPES = ["STATIONARY", "LATE", "OFF_ROUTE", "MISSED_WINDOW"] as const;
export type AnomalyType = (typeof ANOMALY_TYPES)[number];

export const ANOMALY_RESOLUTIONS = ["AUTO_REPLANNED", "PLANNER_RESOLVED", "IGNORED"] as const;
export type AnomalyResolution = (typeof ANOMALY_RESOLUTIONS)[number];

export function isValidAnomalyType(value: string): value is AnomalyType {
  return (ANOMALY_TYPES as readonly string[]).includes(value);
}

export function isValidResolution(value: string | null): boolean {
  if (value === null) return true;
  return (ANOMALY_RESOLUTIONS as readonly string[]).includes(value);
}

export interface DispatchRules {
  id: string;
  tenant_id: string;
  auto_dispatch_enabled: boolean;
  dispatch_lead_time_min: number;
  anomaly_stationary_min: number;
  anomaly_late_threshold_min: number;
  auto_replan_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface ExecutionAnomaly {
  id: string;
  tenant_id: string;
  trip_id: string;
  driver_id: string | null;
  anomaly_type: AnomalyType;
  detected_at: string;
  details: Record<string, unknown>;
  resolution: AnomalyResolution | null;
  resolved_at: string | null;
  created_at: string;
}

/** Lightweight position for anomaly detection (matches driver_positions row) */
export interface DriverPosition {
  latitude: number;
  longitude: number;
  recorded_at: string;
}

/** A stop flagged as late by the anomaly detector */
export interface LateStop {
  stop_id: string;
  stop_sequence: number;
  planned_window_end: string;
  estimated_arrival: Date;
  delay_minutes: number;
}

/** Result of a replan operation */
export interface ReplanResult {
  success: boolean;
  changes: ReplanChange[];
  infeasible_stops: string[]; // stop IDs that can't be reached in time
}

export interface ReplanChange {
  stop_id: string;
  old_sequence: number;
  new_sequence: number;
  new_estimated_arrival: Date;
}

/** Labels for anomaly types (Dutch) */
export const ANOMALY_TYPE_LABELS: Record<AnomalyType, string> = {
  STATIONARY: "Stilstaand",
  LATE: "Vertraagd",
  OFF_ROUTE: "Afgeweken van route",
  MISSED_WINDOW: "Tijdvenster gemist",
};

/** Labels for resolutions (Dutch) */
export const ANOMALY_RESOLUTION_LABELS: Record<AnomalyResolution, string> = {
  AUTO_REPLANNED: "Automatisch herplannen",
  PLANNER_RESOLVED: "Door planner opgelost",
  IGNORED: "Genegeerd",
};
