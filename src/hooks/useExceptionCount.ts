import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLoadSettings } from "@/hooks/useSettings";
import { normalizeSlaSettings } from "@/lib/slaSettings";
import {
  anomalyPassesSeverity,
  isDeliverySeverityEnabled,
  isDeliveryTypeEnabled,
  normalizeExceptionSettings,
} from "@/lib/exceptionSettings";

export interface ExceptionCountBreakdown {
  delivery: number;
  missingData: number;
  sla: number;
  delays: number;
  capacity: number;
  anomalies: number;
}

export interface ExceptionCountSummary {
  total: number;
  breakdown: ExceptionCountBreakdown;
}

export function useExceptionCount() {
  const { data: rawSlaSettings } = useLoadSettings("sla");
  const { data: rawExceptionSettings } = useLoadSettings("exceptions");
  const slaSettings = normalizeSlaSettings(rawSlaSettings as Record<string, unknown>);
  const exceptionSettings = normalizeExceptionSettings(rawExceptionSettings as Record<string, unknown>);

  return useQuery({
    queryKey: ["exception-count", slaSettings, exceptionSettings],
    refetchInterval: 60_000,
    staleTime: 30_000,
    queryFn: async (): Promise<ExceptionCountSummary> => {
      const slaDeadlineMs = slaSettings.deadlineHours * 60 * 60 * 1000;
      const delayThresholdMs = exceptionSettings.delayThresholdHours * 60 * 60 * 1000;
      const now = Date.now();

      const [
        deliveryExceptionsResult,
        draftOrdersResult,
        inTransitOrdersResult,
        anomaliesResult,
        activeTripsResult,
      ] = await Promise.all([
        exceptionSettings.deliveryExceptionsEnabled
          ? supabase
              .from("delivery_exceptions")
              .select("exception_type, severity")
              .in("status", ["OPEN", "IN_PROGRESS"])
          : Promise.resolve({ data: [], error: null } as any),
        supabase
          .from("orders")
          .select("missing_fields, received_at, created_at")
          .eq("status", "DRAFT"),
        supabase
          .from("orders")
          .select("created_at")
          .eq("status", "IN_TRANSIT"),
        exceptionSettings.anomaliesEnabled
          ? (supabase as any)
              .from("anomalies")
              .select("severity")
              .is("resolved_at", null)
          : Promise.resolve({ data: [], error: null } as any),
        exceptionSettings.capacityEnabled
          ? supabase
              .from("trips")
              .select("vehicle_id, trip_stops(order_id)")
              .in("dispatch_status", ["ACTIEF", "VERZONDEN", "ONTVANGEN", "GEACCEPTEERD"])
          : Promise.resolve({ data: [], error: null } as any),
      ]);

      if (deliveryExceptionsResult.error) throw deliveryExceptionsResult.error;
      if (draftOrdersResult.error) throw draftOrdersResult.error;
      if (inTransitOrdersResult.error) throw inTransitOrdersResult.error;
      if (anomaliesResult.error) throw anomaliesResult.error;
      if (activeTripsResult.error) throw activeTripsResult.error;

      const draftOrders = draftOrdersResult.data ?? [];
      const inTransitOrders = inTransitOrdersResult.data ?? [];
      const deliveryExceptions = (deliveryExceptionsResult.data ?? []).filter(
        (dex: any) =>
          isDeliveryTypeEnabled(exceptionSettings, dex.exception_type) &&
          isDeliverySeverityEnabled(exceptionSettings, dex.severity),
      );
      const anomalies = (anomaliesResult.data ?? []).filter((row: any) =>
        anomalyPassesSeverity(exceptionSettings, row.severity),
      );

      let missingData = 0;
      let sla = 0;

      for (const order of draftOrders) {
        const missingFields = Array.isArray(order.missing_fields) ? order.missing_fields : [];
        const receivedAt = order.received_at || order.created_at;

        if (exceptionSettings.missingDataEnabled && missingFields.length > 0) {
          missingData += 1;
        }

        if (exceptionSettings.slaEnabled && slaSettings.enabled && receivedAt && now - new Date(receivedAt).getTime() > slaDeadlineMs) {
          sla += 1;
        }
      }

      let delays = 0;
      for (const order of inTransitOrders) {
        if (exceptionSettings.delayEnabled && order.created_at && now - new Date(order.created_at).getTime() > delayThresholdMs) {
          delays += 1;
        }
      }

      let capacity = 0;
      if (exceptionSettings.capacityEnabled) {
        const trips = activeTripsResult.data ?? [];
        const vehicleOrderIds: Record<string, Set<string>> = {};
        for (const trip of trips) {
          const vehicleId = trip.vehicle_id;
          if (!vehicleId) continue;
          if (!vehicleOrderIds[vehicleId]) vehicleOrderIds[vehicleId] = new Set();
          const stops = (trip as any).trip_stops || [];
          for (const stop of stops) {
            if (stop.order_id) vehicleOrderIds[vehicleId].add(stop.order_id);
          }
        }

        const allOrderIds = [...new Set(Object.values(vehicleOrderIds).flatMap((set) => [...set]))];
        if (allOrderIds.length > 0) {
          const vehicleIds = Object.keys(vehicleOrderIds);
          const [ordersResult, vehiclesResult] = await Promise.all([
            supabase.from("orders").select("id, weight_kg").in("id", allOrderIds),
            supabase.from("vehicles").select("id, capacity_kg").in("id", vehicleIds).is("deleted_at", null),
          ]);
          if (ordersResult.error) throw ordersResult.error;
          if (vehiclesResult.error) throw vehiclesResult.error;

          const weightByOrder: Record<string, number> = {};
          for (const order of ordersResult.data ?? []) {
            weightByOrder[order.id] = order.weight_kg || 0;
          }

          const capacityByVehicle: Record<string, number> = {};
          for (const vehicle of vehiclesResult.data ?? []) {
            capacityByVehicle[vehicle.id] = vehicle.capacity_kg || 0;
          }

          for (const [vehicleId, orderIds] of Object.entries(vehicleOrderIds)) {
            const totalWeight = [...orderIds].reduce((sum, orderId) => sum + (weightByOrder[orderId] || 0), 0);
            const vehicleCapacity = capacityByVehicle[vehicleId] || 0;
            const utilizationPct = vehicleCapacity > 0 ? Math.round((totalWeight / vehicleCapacity) * 100) : 0;
            if (utilizationPct >= exceptionSettings.capacityUtilizationThreshold) {
              capacity += 1;
            }
          }
        }
      }

      const breakdown: ExceptionCountBreakdown = {
        delivery: deliveryExceptions.length,
        missingData,
        sla,
        delays,
        capacity,
        anomalies: anomalies.length,
      };

      return {
        total: Object.values(breakdown).reduce((sum, value) => sum + value, 0),
        breakdown,
      };
    },
  });
}
