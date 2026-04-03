// ─── Dispatch to Delivery Types ─────────────────────────────

export type TripStatus = "CONCEPT" | "VERZENDKLAAR" | "VERZONDEN" | "ONTVANGEN" | "GEACCEPTEERD" | "GEWEIGERD" | "ACTIEF" | "VOLTOOID" | "AFGEBROKEN";
export type StopStatus = "GEPLAND" | "ONDERWEG" | "AANGEKOMEN" | "LADEN" | "LOSSEN" | "AFGELEVERD" | "MISLUKT" | "OVERGESLAGEN";
export type StopType = "PICKUP" | "DELIVERY" | "DEPOT";
export type PodStatus = "NIET_VEREIST" | "VERWACHT" | "ONTVANGEN" | "ONVOLLEDIG" | "GOEDGEKEURD" | "AFGEWEZEN";
export type BillingStatus = "NIET_GEREED" | "GEREED" | "GEBLOKKEERD" | "GEFACTUREERD";
export type ExceptionSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ExceptionStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "ESCALATED";

export interface Trip {
  id: string;
  tenant_id: string;
  trip_number: number;
  vehicle_id: string;
  driver_id: string | null;
  dispatch_status: TripStatus;
  planned_date: string;
  planned_start_time: string | null;
  actual_start_time: string | null;
  actual_end_time: string | null;
  total_distance_km: number | null;
  total_duration_min: number | null;
  dispatcher_id: string | null;
  dispatched_at: string | null;
  received_at: string | null;
  accepted_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  stops?: TripStop[];
  vehicle?: { name: string; plate: string; type: string };
  driver?: { name: string; phone: string };
}

export interface TripStop {
  id: string;
  trip_id: string;
  order_id: string | null;
  stop_type: StopType;
  stop_sequence: number;
  stop_status: StopStatus;
  planned_address: string | null;
  planned_latitude: number | null;
  planned_longitude: number | null;
  planned_time: string | null;
  actual_arrival_time: string | null;
  actual_departure_time: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  instructions: string | null;
  failure_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  order?: { order_number: number; client_name: string; quantity: number; unit: string; weight_kg: number };
  pod?: ProofOfDelivery;
}

export interface ProofOfDelivery {
  id: string;
  trip_stop_id: string;
  order_id: string | null;
  pod_status: PodStatus;
  signature_url: string | null;
  photos: { url: string; type: "cargo" | "damage" | "location" }[];
  recipient_name: string | null;
  received_at: string | null;
  validated_by: string | null;
  validated_at: string | null;
  rejection_reason: string | null;
  notes: string | null;
  created_at: string;
}

export interface DeliveryException {
  id: string;
  tenant_id: string;
  trip_id: string | null;
  trip_stop_id: string | null;
  order_id: string | null;
  exception_type: string;
  severity: ExceptionSeverity;
  description: string;
  owner_id: string | null;
  status: ExceptionStatus;
  blocks_billing: boolean;
  resolution_notes: string | null;
  created_at: string;
  resolved_at: string | null;
  escalated_at: string | null;
  updated_at: string;
}

// ─── Status Transitions ─────────────────────────────────────

export const TRIP_TRANSITIONS: Record<TripStatus, TripStatus[]> = {
  CONCEPT: ["VERZENDKLAAR", "AFGEBROKEN"],
  VERZENDKLAAR: ["VERZONDEN", "CONCEPT", "AFGEBROKEN"],
  VERZONDEN: ["ONTVANGEN", "AFGEBROKEN"],
  ONTVANGEN: ["GEACCEPTEERD", "GEWEIGERD"],
  GEACCEPTEERD: ["ACTIEF", "AFGEBROKEN"],
  GEWEIGERD: ["CONCEPT"],
  ACTIEF: ["VOLTOOID", "AFGEBROKEN"],
  VOLTOOID: [],
  AFGEBROKEN: [],
};

export const STOP_TRANSITIONS: Record<StopStatus, StopStatus[]> = {
  GEPLAND: ["ONDERWEG", "OVERGESLAGEN"],
  ONDERWEG: ["AANGEKOMEN", "OVERGESLAGEN"],
  AANGEKOMEN: ["LADEN", "LOSSEN", "MISLUKT"],
  LADEN: ["AFGELEVERD", "MISLUKT"],
  LOSSEN: ["AFGELEVERD", "MISLUKT"],
  AFGELEVERD: [],
  MISLUKT: [],
  OVERGESLAGEN: [],
};

export function canTransitionTrip(from: TripStatus, to: TripStatus): boolean {
  return TRIP_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canTransitionStop(from: StopStatus, to: StopStatus): boolean {
  return STOP_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─── Status Labels (Dutch) ──────────────────────────────────

export const TRIP_STATUS_LABELS: Record<TripStatus, { label: string; color: string }> = {
  CONCEPT: { label: "Concept", color: "bg-gray-100 text-gray-600" },
  VERZENDKLAAR: { label: "Verzendklaar", color: "bg-blue-100 text-blue-700" },
  VERZONDEN: { label: "Verzonden", color: "bg-amber-100 text-amber-700" },
  ONTVANGEN: { label: "Ontvangen", color: "bg-amber-100 text-amber-700" },
  GEACCEPTEERD: { label: "Geaccepteerd", color: "bg-teal-100 text-teal-700" },
  GEWEIGERD: { label: "Geweigerd", color: "bg-red-100 text-red-700" },
  ACTIEF: { label: "Actief", color: "bg-green-100 text-green-700" },
  VOLTOOID: { label: "Voltooid", color: "bg-green-200 text-green-800" },
  AFGEBROKEN: { label: "Afgebroken", color: "bg-red-100 text-red-700" },
};

export const STOP_STATUS_LABELS: Record<StopStatus, { label: string; color: string }> = {
  GEPLAND: { label: "Gepland", color: "bg-gray-100 text-gray-600" },
  ONDERWEG: { label: "Onderweg", color: "bg-blue-100 text-blue-700" },
  AANGEKOMEN: { label: "Aangekomen", color: "bg-teal-100 text-teal-700" },
  LADEN: { label: "Laden", color: "bg-amber-100 text-amber-700" },
  LOSSEN: { label: "Lossen", color: "bg-amber-100 text-amber-700" },
  AFGELEVERD: { label: "Afgeleverd", color: "bg-green-100 text-green-700" },
  MISLUKT: { label: "Mislukt", color: "bg-red-100 text-red-700" },
  OVERGESLAGEN: { label: "Overgeslagen", color: "bg-gray-100 text-gray-500" },
};

// ─── Exception Types ────────────────────────────────────────

export const EXCEPTION_TYPES = {
  DRIVER_NO_RESPONSE: { label: "Chauffeur reageert niet", defaultSeverity: "HIGH" as ExceptionSeverity },
  DRIVER_REFUSED: { label: "Chauffeur weigert rit", defaultSeverity: "HIGH" as ExceptionSeverity },
  DRIVER_OFFLINE: { label: "Chauffeur offline", defaultSeverity: "MEDIUM" as ExceptionSeverity },
  STOP_LATE: { label: "Stop te laat", defaultSeverity: "MEDIUM" as ExceptionSeverity },
  DELIVERY_REFUSED: { label: "Levering geweigerd", defaultSeverity: "HIGH" as ExceptionSeverity, blocksBilling: true },
  ADDRESS_NOT_FOUND: { label: "Adres niet gevonden", defaultSeverity: "HIGH" as ExceptionSeverity, blocksBilling: true },
  CARGO_DAMAGE: { label: "Schade gemeld", defaultSeverity: "CRITICAL" as ExceptionSeverity, blocksBilling: true },
  POD_MISSING: { label: "POD ontbreekt", defaultSeverity: "MEDIUM" as ExceptionSeverity, blocksBilling: true },
  QUANTITY_MISMATCH: { label: "Hoeveelheid mismatch", defaultSeverity: "MEDIUM" as ExceptionSeverity, blocksBilling: true },
};
