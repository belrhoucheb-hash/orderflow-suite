import { type FleetVehicle } from "@/hooks/useVehicles";
import { type GeoCoord } from "@/data/geoData";

export interface PlanOrder {
  id: string;
  order_number: number;
  client_name: string | null;
  delivery_address: string | null;
  quantity: number | null;
  weight_kg: number | null;
  requirements: string[] | null;
  is_weight_per_unit: boolean;
  time_window_start: string | null;
  time_window_end: string | null;
  pickup_time_from: string | null;
  pickup_time_to: string | null;
  delivery_time_from: string | null;
  delivery_time_to: string | null;
}

export type Assignments = Record<string, PlanOrder[]>;

export const WAREHOUSE: GeoCoord = { lat: 52.30, lng: 4.76 };
export const AVG_SPEED_KMH = 60;
export const UNLOAD_MINUTES = 30;
export const MAX_DRIVE_MINUTES = 9 * 60;
export const DISTANCE_WARN_KM = 150;
