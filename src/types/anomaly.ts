// ─── Anomaly Detection Types ────────────────────────────────────

export type AnomalyCategory = 'pricing' | 'timing' | 'capacity' | 'compliance' | 'pattern';

export type AnomalyType =
  | 'unusual_price'        // price deviates >20% from client average
  | 'late_delivery'        // delivery past time window
  | 'early_delivery'       // delivery >2h before window
  | 'capacity_exceeded'    // vehicle overloaded
  | 'drive_time_violation' // EU 561/2006 breach risk
  | 'missing_pod'          // delivery marked complete without POD
  | 'unusual_route'        // route deviates significantly from expected
  | 'repeat_correction'    // AI keeps making same mistake for client
  | 'stale_order'          // order stuck in DRAFT >24h
  | 'duplicate_order'      // similar order for same client/date
  | 'margin_below_threshold'; // trip margin below minimum

export interface Anomaly {
  id: string;
  tenantId: string;
  category: AnomalyCategory;
  type: AnomalyType;
  severity: 'info' | 'warning' | 'critical';
  entityType: 'order' | 'trip' | 'invoice' | 'vehicle' | 'driver';
  entityId: string;
  title: string;
  description: string;
  suggestedAction?: string;
  autoResolvable: boolean;
  autoResolved: boolean;
  resolvedAt?: string;
  resolvedBy?: string;
  detectedAt: string;
  data: Record<string, unknown>;
}

/** Row shape coming from the anomalies DB table */
export interface AnomalyRow {
  id: string;
  tenant_id: string;
  category: string;
  type: string;
  severity: string;
  entity_type: string;
  entity_id: string | null;
  title: string;
  description: string | null;
  suggested_action: string | null;
  auto_resolvable: boolean;
  auto_resolved: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
  detected_at: string;
  data: Record<string, unknown>;
}

/** Map a DB row to the frontend Anomaly interface */
export function mapRowToAnomaly(row: AnomalyRow): Anomaly {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    category: row.category as AnomalyCategory,
    type: row.type as AnomalyType,
    severity: row.severity as Anomaly['severity'],
    entityType: row.entity_type as Anomaly['entityType'],
    entityId: row.entity_id ?? '',
    title: row.title,
    description: row.description ?? '',
    suggestedAction: row.suggested_action ?? undefined,
    autoResolvable: row.auto_resolvable,
    autoResolved: row.auto_resolved,
    resolvedAt: row.resolved_at ?? undefined,
    resolvedBy: row.resolved_by ?? undefined,
    detectedAt: row.detected_at,
    data: row.data ?? {},
  };
}

export const ANOMALY_CATEGORY_LABELS: Record<AnomalyCategory, string> = {
  pricing: 'Prijsstelling',
  timing: 'Timing',
  capacity: 'Capaciteit',
  compliance: 'Compliance',
  pattern: 'Patronen',
};

export const ANOMALY_SEVERITY_LABELS: Record<Anomaly['severity'], string> = {
  info: 'Info',
  warning: 'Waarschuwing',
  critical: 'Kritiek',
};
