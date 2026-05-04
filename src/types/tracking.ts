// ─── Live Tracking Dashboard Types ─────────────────────────

export interface VehiclePosition {
  vehicleId: string;
  driverId?: string | null;
  lat: number;
  lng: number;
  heading: number;
  speed: number;
  accuracy?: number | null;
  timestamp: string;
  tripId: string;
  source?: "real" | "simulated";
  deviationKm?: number;
}

export interface TripTrackingStatus {
  tripId: string;
  tripLabel: string;
  vehicleId: string;
  driverName: string;
  currentStopIndex: number;
  totalStops: number;
  status: "on_time" | "delayed" | "critical";
  eta: string;
  delayMinutes: number;
  etaWindowDeltaMinutes?: number;
  lastUpdate: string;
}

export type TrackingAlertType =
  | "delay"
  | "eta_window"
  | "gps_missing"
  | "gps_stale"
  | "geofence_enter"
  | "geofence_exit"
  | "idle"
  | "deviation";

export type TrackingAlertSeverity = "info" | "warning" | "critical";

export interface TrackingAlert {
  id: string;
  type: TrackingAlertType;
  tripId: string;
  message: string;
  severity: TrackingAlertSeverity;
  timestamp: string;
}
