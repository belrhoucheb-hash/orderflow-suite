// ─── Event Pipeline Types ─────────────────────────────────────

export type EventType =
  | 'email_received'
  | 'ai_extraction_started'
  | 'ai_extraction_completed'
  | 'planner_review_started'
  | 'planner_approved'
  | 'planner_corrected'
  | 'order_planned'
  | 'trip_created'
  | 'trip_dispatched'
  | 'stop_arrived'
  | 'stop_completed'
  | 'pod_uploaded'
  | 'order_delivered'
  | 'invoice_generated'
  | 'invoice_sent'
  | 'invoice_paid'
  | 'exception_raised'
  | 'exception_resolved';

export type ActorType = 'system' | 'ai' | 'planner' | 'chauffeur' | 'client';

export interface OrderEvent {
  id: string;
  tenant_id: string | null;
  order_id: string;
  event_type: EventType;
  event_data: Record<string, unknown>;
  actor_type: ActorType;
  actor_id: string | null;
  confidence_score: number | null;
  duration_since_previous_ms: number | null;
  created_at: string;
}

/** Labels for each event type (Dutch) */
export const EVENT_LABELS: Record<EventType, string> = {
  email_received: 'E-mail ontvangen',
  ai_extraction_started: 'AI extractie gestart',
  ai_extraction_completed: 'AI extractie voltooid',
  planner_review_started: 'Planner review gestart',
  planner_approved: 'Goedgekeurd door planner',
  planner_corrected: 'Gecorrigeerd door planner',
  order_planned: 'Ingepland',
  trip_created: 'Rit aangemaakt',
  trip_dispatched: 'Rit verzonden',
  stop_arrived: 'Aangekomen bij stop',
  stop_completed: 'Stop afgerond',
  pod_uploaded: 'PoD geüpload',
  order_delivered: 'Afgeleverd',
  invoice_generated: 'Factuur gegenereerd',
  invoice_sent: 'Factuur verzonden',
  invoice_paid: 'Factuur betaald',
  exception_raised: 'Uitzondering gemeld',
  exception_resolved: 'Uitzondering opgelost',
};

/** Ordered phases for duration calculations */
export const EVENT_PHASE_ORDER: EventType[] = [
  'email_received',
  'ai_extraction_started',
  'ai_extraction_completed',
  'planner_review_started',
  'planner_approved',
  'order_planned',
  'trip_created',
  'trip_dispatched',
  'stop_arrived',
  'stop_completed',
  'order_delivered',
  'invoice_generated',
  'invoice_sent',
  'invoice_paid',
];
