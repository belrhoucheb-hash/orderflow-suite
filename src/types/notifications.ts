export type TriggerEvent =
  | "ORDER_CONFIRMED"
  | "TRIP_STARTED"
  | "ETA_CHANGED"
  | "DRIVER_ARRIVED"
  | "DELIVERED"
  | "EXCEPTION";

export type NotificationChannel = "EMAIL" | "SMS";

export type NotificationStatus =
  | "QUEUED"
  | "SENT"
  | "DELIVERED"
  | "FAILED"
  | "BOUNCED";

export interface NotificationTemplate {
  id: string;
  tenant_id: string;
  trigger_event: TriggerEvent;
  channel: NotificationChannel;
  subject_template: string | null;
  body_template: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface NotificationLog {
  id: string;
  tenant_id: string;
  template_id: string | null;
  order_id: string | null;
  trip_id: string | null;
  recipient_email: string | null;
  recipient_phone: string | null;
  channel: NotificationChannel;
  trigger_event: TriggerEvent;
  status: NotificationStatus;
  subject: string | null;
  body: string | null;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
}

export interface NotificationPreferences {
  email: boolean;
  sms: boolean;
}

export interface RecipientInfo {
  recipient_name: string | null;
  recipient_email: string | null;
  recipient_phone: string | null;
  notification_preferences: NotificationPreferences;
}

/**
 * Template variables that can be used in notification templates.
 * All variables use {{variable_name}} syntax.
 */
export interface TemplateVariables {
  order_number: string;
  client_name: string;
  pickup_address: string;
  delivery_address: string;
  eta: string;
  track_url: string;
  driver_name: string;
  company_name: string;
  company_logo: string;
}

export const TRIGGER_EVENT_LABELS: Record<TriggerEvent, string> = {
  ORDER_CONFIRMED: "Order bevestigd",
  TRIP_STARTED: "Rit gestart",
  ETA_CHANGED: "ETA gewijzigd (>15 min)",
  DRIVER_ARRIVED: "Chauffeur gearriveerd",
  DELIVERED: "Afgeleverd + POD",
  EXCEPTION: "Uitzondering / Mislukt",
};

export const TRIGGER_EVENT_RECIPIENTS: Record<TriggerEvent, string> = {
  ORDER_CONFIRMED: "Opdrachtgever",
  TRIP_STARTED: "Ontvanger(s)",
  ETA_CHANGED: "Ontvanger(s)",
  DRIVER_ARRIVED: "Ontvanger",
  DELIVERED: "Opdrachtgever",
  EXCEPTION: "Opdrachtgever",
};

export interface EtaNotificationSettings {
  customer_push_lead_minutes: number;
  customer_update_threshold_minutes: number;
  predicted_delay_threshold_minutes: number;
  predicted_delay_severity: "LOW" | "MEDIUM" | "HIGH";
  eta_min_shift_for_badge_minutes: number;
  customer_notifications_enabled: boolean;
}

export const DEFAULT_ETA_NOTIFICATION_SETTINGS: EtaNotificationSettings = {
  customer_push_lead_minutes: 30,
  customer_update_threshold_minutes: 15,
  predicted_delay_threshold_minutes: 15,
  predicted_delay_severity: "MEDIUM",
  eta_min_shift_for_badge_minutes: 5,
  customer_notifications_enabled: true,
};

export const AVAILABLE_VARIABLES: Array<{ key: keyof TemplateVariables; label: string; example: string }> = [
  { key: "order_number", label: "Ordernummer", example: "1042" },
  { key: "client_name", label: "Klantnaam", example: "Bakkerij De Jong" },
  { key: "pickup_address", label: "Ophaaladres", example: "Industrieweg 5, Rotterdam" },
  { key: "delivery_address", label: "Afleveradres", example: "Keizersgracht 100, Amsterdam" },
  { key: "eta", label: "Verwachte aankomst", example: "14:30" },
  { key: "track_url", label: "Track & Trace link", example: "https://app.example.com/track?q=1042" },
  { key: "driver_name", label: "Chauffeur naam", example: "Jan Pietersen" },
  { key: "company_name", label: "Bedrijfsnaam", example: "Royalty Cargo" },
  { key: "company_logo", label: "Logo URL", example: "https://..." },
];
