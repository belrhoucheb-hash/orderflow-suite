import { supabase } from "@/integrations/supabase/client";

export type TrackingPurposeCode =
  | "route_execution"
  | "customer_eta"
  | "safety_incident"
  | "asset_recovery";

export type TrackingAccessType =
  | "live_view"
  | "history_view"
  | "export"
  | "customer_share"
  | "system_report";

interface LogTrackingAccessInput {
  purposeCode: TrackingPurposeCode;
  accessType: TrackingAccessType;
  driverId?: string | null;
  vehicleId?: string | null;
  tripId?: string | null;
  orderId?: string | null;
  source?: string;
  metadata?: Record<string, unknown>;
}

export async function logTrackingAccess(input: LogTrackingAccessInput): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc("log_tracking_access" as any, {
      p_purpose_code: input.purposeCode,
      p_access_type: input.accessType,
      p_driver_id: input.driverId ?? null,
      p_vehicle_id: input.vehicleId ?? null,
      p_trip_id: input.tripId ?? null,
      p_order_id: input.orderId ?? null,
      p_source: input.source ?? "app",
      p_metadata: input.metadata ?? {},
    });

    if (error) {
      console.warn("[tracking-access-log]", error.message);
      return null;
    }

    return typeof data === "string" ? data : null;
  } catch (error) {
    console.warn("[tracking-access-log]", error);
    return null;
  }
}
