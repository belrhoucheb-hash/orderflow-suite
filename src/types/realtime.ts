// ─── Realtime Types ─────────────────────────────────────────────────

/** Supabase Realtime postgres_changes event types */
export type RealtimeEventType = 'INSERT' | 'UPDATE' | 'DELETE';

/** Tables we subscribe to via Supabase Realtime */
export type RealtimeChannel =
  | 'orders'
  | 'trips'
  | 'notifications'
  | 'anomalies'
  | 'ai_decisions';

/** Shape of a Supabase Realtime postgres_changes payload */
export interface RealtimeEvent<T = Record<string, any>> {
  table: string;
  type: RealtimeEventType;
  record: T;
  old_record: Partial<T>;
  timestamp: string;
}

/** Severity levels for in-app notification payloads */
export type NotificationSeverity = 'info' | 'warning' | 'error' | 'success';

/** Entity types that can be linked to a notification */
export type NotificationEntityType = 'order' | 'trip' | 'anomaly' | 'ai_decision' | 'notification';

/** Payload for an in-app realtime notification */
export interface NotificationPayload {
  id: string;
  type: string;
  title: string;
  message: string;
  severity: NotificationSeverity;
  entityType: NotificationEntityType;
  entityId: string;
  actionUrl?: string;
  read: boolean;
  timestamp: string;
}
