// ─── Live Tracking Dashboard Types ─────────────────────────

export interface VehiclePosition {
  vehicleId: string;
  lat: number;
  lng: number;
  heading: number;
  speed: number;
  timestamp: string;
  tripId: string;
}

export interface TripTrackingStatus {
  tripId: string;
  vehicleId: string;
  driverName: string;
  currentStopIndex: number;
  totalStops: number;
  status: "on_time" | "delayed" | "critical";
  eta: string;
  delayMinutes: number;
  lastUpdate: string;
}

export type TrackingAlertType =
  | "delay"
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
