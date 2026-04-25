import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
  return useQuery({
    queryKey: ["exception-count"],
    refetchInterval: 60_000,
    staleTime: 30_000,
    queryFn: async (): Promise<ExceptionCountSummary> => {
      const threeHoursMs = 3 * 60 * 60 * 1000;
      const twentyFourHoursMs = 24 * 60 * 60 * 1000;
      const now = Date.now();

      const [
        deliveryExceptionsResult,
        draftOrdersResult,
        inTransitOrdersResult,
        blockedVehiclesResult,
        anomaliesResult,
      ] = await Promise.all([
        supabase
          .from("delivery_exceptions")
          .select("id", { count: "exact", head: true })
          .in("status", ["OPEN", "IN_PROGRESS"]),
        supabase
          .from("orders")
          .select("missing_fields, received_at, created_at")
          .eq("status", "DRAFT"),
        supabase
          .from("orders")
          .select("created_at")
          .eq("status", "IN_TRANSIT"),
        supabase
          .from("vehicles")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null)
          .in("status", ["niet_beschikbaar", "in_gebruik"]),
        (supabase as any)
          .from("anomalies")
          .select("id", { count: "exact", head: true })
          .is("resolved_at", null),
      ]);

      if (deliveryExceptionsResult.error) throw deliveryExceptionsResult.error;
      if (draftOrdersResult.error) throw draftOrdersResult.error;
      if (inTransitOrdersResult.error) throw inTransitOrdersResult.error;
      if (blockedVehiclesResult.error) throw blockedVehiclesResult.error;
      if (anomaliesResult.error) throw anomaliesResult.error;

      const draftOrders = draftOrdersResult.data ?? [];
      const inTransitOrders = inTransitOrdersResult.data ?? [];

      let missingData = 0;
      let sla = 0;

      for (const order of draftOrders) {
        const missingFields = Array.isArray(order.missing_fields) ? order.missing_fields : [];
        const receivedAt = order.received_at || order.created_at;

        if (missingFields.length > 0) {
          missingData += 1;
        }

        if (receivedAt && now - new Date(receivedAt).getTime() > threeHoursMs) {
          sla += 1;
        }
      }

      let delays = 0;
      for (const order of inTransitOrders) {
        if (order.created_at && now - new Date(order.created_at).getTime() > twentyFourHoursMs) {
          delays += 1;
        }
      }

      const breakdown: ExceptionCountBreakdown = {
        delivery: deliveryExceptionsResult.count ?? 0,
        missingData,
        sla,
        delays,
        capacity: blockedVehiclesResult.count ?? 0,
        anomalies: anomaliesResult.count ?? 0,
      };

      return {
        total: Object.values(breakdown).reduce((sum, value) => sum + value, 0),
        breakdown,
      };
    },
  });
}
