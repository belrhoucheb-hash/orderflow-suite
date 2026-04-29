import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { checkTripCompletion } from "@/hooks/useBillingStatus";
import { toast } from "sonner";
import type { Trip, TripStop, TripStatus, StopStatus, canTransitionTrip, canTransitionStop } from "@/types/dispatch";
import { logAudit } from "@/lib/auditLog";
import { emitEventDirect } from "@/hooks/useEventPipeline";
import {
  formatDriverCountryRestrictionIssue,
  getDriverCountryRestrictionIssue,
  type CountryAwareOrder,
} from "@/lib/driverCountryRestrictions";

// ─── Fetch trips for a date ─────────────────────────────────
export function useTrips(date?: string) {
  return useQuery({
    queryKey: ["trips", date],
    staleTime: 10_000,
    queryFn: async () => {
      let query = supabase
        .from("trips")
        .select("*, trip_stops(*, proof_of_delivery(*))")
        .order("planned_start_time", { ascending: true });

      if (date) {
        query = query.eq("planned_date", date);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Trip[];
    },
  });
}

// ─── Fetch single trip with stops ───────────────────────────
export function useTripById(tripId: string | null) {
  return useQuery({
    queryKey: ["trip", tripId],
    staleTime: 10_000,
    queryFn: async () => {
      if (!tripId) return null;
      const { data, error } = await supabase
        .from("trips")
        .select("*, trip_stops(*, proof_of_delivery(*))")
        .eq("id", tripId)
        .single();
      if (error) throw error;
      return data as Trip;
    },
    enabled: !!tripId,
  });
}

// ─── Fetch trips for a driver ───────────────────────────────
export function useDriverTrips(driverId: string | null) {
  return useQuery({
    queryKey: ["driver-trips", driverId],
    staleTime: 10_000,
    queryFn: async () => {
      if (!driverId) return [];
      const { data, error } = await supabase
        .from("trips")
        .select("*, trip_stops(*, proof_of_delivery(*))")
        .eq("driver_id", driverId)
        .in("dispatch_status", ["VERZONDEN", "ONTVANGEN", "GEACCEPTEERD", "ACTIEF"])
        .order("planned_date", { ascending: true });
      if (error) throw error;
      return (data || []) as Trip[];
    },
    enabled: !!driverId,
  });
}

// ─── Create trip from planning ──────────────────────────────
export function useCreateTrip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      tenant_id: string;
      vehicle_id: string;
      driver_id: string | null;
      planned_date: string;
      planned_start_time?: string;
      stops: { order_id: string; stop_type: "PICKUP" | "INTERMEDIATE" | "DELIVERY"; planned_address: string; stop_sequence: number; planned_latitude?: number | null; planned_longitude?: number | null }[];
    }) => {
      if (input.driver_id) {
        const orderIds = [...new Set(input.stops.map((s) => s.order_id).filter(Boolean))];
        if (orderIds.length > 0) {
          const [{ data: restrictions, error: restrictionsErr }, { data: orders, error: ordersErr }] =
            await Promise.all([
              supabase
                .from("driver_country_restrictions" as any)
                .select("*")
                .eq("driver_id", input.driver_id)
                .eq("is_active", true),
              supabase
                .from("orders" as any)
                .select("id, order_number, pickup_country, delivery_country, pickup_address, delivery_address")
                .in("id", orderIds),
            ]);
          if (restrictionsErr) throw restrictionsErr;
          if (ordersErr) throw ordersErr;

          const issue = getDriverCountryRestrictionIssue(
            input.driver_id,
            (orders ?? []) as CountryAwareOrder[],
            (restrictions ?? []) as any[],
            input.planned_date,
          );
          if (issue?.type === "block") {
            throw new Error(formatDriverCountryRestrictionIssue(issue));
          }
        }
      }

      // Create trip
      const { data: trip, error: tripErr } = await supabase
        .from("trips")
        .insert({
          tenant_id: input.tenant_id,
          vehicle_id: input.vehicle_id,
          driver_id: input.driver_id,
          planned_date: input.planned_date,
          planned_start_time: input.planned_start_time || null,
          dispatch_status: "CONCEPT",
        })
        .select()
        .single();
      if (tripErr) throw tripErr;

      // Create stops
      const stopInserts = input.stops.map(s => ({
        trip_id: trip.id,
        order_id: s.order_id,
        stop_type: s.stop_type,
        stop_sequence: s.stop_sequence,
        planned_address: s.planned_address,
        stop_status: "GEPLAND" as const,
        planned_latitude: s.planned_latitude ?? null,
        planned_longitude: s.planned_longitude ?? null,
      }));

      const { error: stopsErr } = await supabase.from("trip_stops").insert(stopInserts);
      if (stopsErr) throw stopsErr;

      return trip as Trip;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trips"] });
    },
  });
}

// ─── Update trip status ─────────────────────────────────────
export function useUpdateTripStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ tripId, status, extra }: { tripId: string; status: TripStatus; extra?: Record<string, any> }) => {
      const updates: Record<string, any> = { dispatch_status: status, updated_at: new Date().toISOString() };

      // Set timestamps based on status
      if (status === "VERZONDEN") updates.dispatched_at = new Date().toISOString();
      if (status === "ONTVANGEN") updates.received_at = new Date().toISOString();
      if (status === "GEACCEPTEERD") updates.accepted_at = new Date().toISOString();
      if (status === "ACTIEF") { updates.started_at = new Date().toISOString(); updates.actual_start_time = new Date().toISOString(); }
      if (status === "VOLTOOID") { updates.completed_at = new Date().toISOString(); updates.actual_end_time = new Date().toISOString(); }

      if (extra) Object.assign(updates, extra);

      const { error } = await supabase.from("trips").update(updates).eq("id", tripId);
      if (error) throw error;

      // Event Pipeline: emit trip_dispatched for all linked orders
      if (status === "VERZONDEN") {
        const { data: dispatchStops } = await supabase
          .from("trip_stops")
          .select("order_id")
          .eq("trip_id", tripId);
        if (dispatchStops) {
          const orderIds = [...new Set(dispatchStops.map(s => s.order_id).filter(Boolean))] as string[];
          for (const oid of orderIds) {
            emitEventDirect(oid, "trip_dispatched", { actorType: "planner", eventData: { tripId } });
          }
        }
      }

      // When trip goes ACTIEF, set all linked orders to IN_TRANSIT
      if (status === "ACTIEF") {
        const { data: stops } = await supabase
          .from("trip_stops")
          .select("order_id")
          .eq("trip_id", tripId);

        if (stops && stops.length > 0) {
          const orderIds = stops.map(s => s.order_id).filter(Boolean) as string[];
          if (orderIds.length > 0) {
            await supabase
              .from("orders")
              .update({ status: "IN_TRANSIT" })
              .in("id", orderIds);
          }
        }
      }

      // When trip goes VOLTOOID, set all linked orders to DELIVERED
      // (checkTripCompletion handles this via realtime, but also handle explicit VOLTOOID transitions)
      if (status === "VOLTOOID") {
        const { data: stops } = await supabase
          .from("trip_stops")
          .select("order_id, stop_status")
          .eq("trip_id", tripId);

        if (stops && stops.length > 0) {
          for (const stop of stops) {
            if (!stop.order_id) continue;
            if (stop.stop_status === "AFGELEVERD") {
              await supabase.from("orders").update({ status: "DELIVERED" }).eq("id", stop.order_id);
            }
            // MISLUKT orders stay as-is — exception handles resolution
          }
        }
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["trips"] });
      queryClient.invalidateQueries({ queryKey: ["trip"] });
      queryClient.invalidateQueries({ queryKey: ["driver-trips"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });

      // Fire-and-forget audit trail for trip status change
      logAudit({
        table_name: "trips",
        record_id: variables.tripId,
        action: "UPDATE",
        new_data: { dispatch_status: variables.status },
        changed_fields: ["dispatch_status"],
      });
    },
  });
}

// ─── Update stop status ─────────────────────────────────────
export function useUpdateStopStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ stopId, status, extra }: { stopId: string; status: StopStatus; extra?: Record<string, any> }) => {
      const updates: Record<string, any> = { stop_status: status, updated_at: new Date().toISOString() };

      if (status === "AANGEKOMEN") updates.actual_arrival_time = new Date().toISOString();
      if (status === "AFGELEVERD" || status === "MISLUKT") updates.actual_departure_time = new Date().toISOString();

      if (extra) Object.assign(updates, extra);

      const { error } = await supabase.from("trip_stops").update(updates).eq("id", stopId);
      if (error) throw error;

      // Return the stop's trip_id so onSuccess can check trip completion
      const { data: stop } = await supabase
        .from("trip_stops")
        .select("trip_id")
        .eq("id", stopId)
        .single();

      return { tripId: stop?.trip_id ?? null };
    },
    onSuccess: async (result) => {
      queryClient.invalidateQueries({ queryKey: ["trips"] });
      queryClient.invalidateQueries({ queryKey: ["trip"] });
      queryClient.invalidateQueries({ queryKey: ["driver-trips"] });

      // Auto-complete trip if all stops are terminal
      if (result?.tripId) {
        try {
          const completed = await checkTripCompletion(result.tripId);
          if (completed) {
            toast.success("Rit automatisch voltooid — alle stops zijn afgerond");
            queryClient.invalidateQueries({ queryKey: ["orders"] });
          }
        } catch (err) {
          console.error("Auto trip completion check failed:", err);
        }
      }
    },
  });
}

// ─── Dispatch trip (validate + send) ────────────────────────
export function useDispatchTrip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (tripId: string) => {
      // Fetch trip + stops for validation
      const { data: trip, error: fetchErr } = await supabase
        .from("trips")
        .select("*, trip_stops(*)")
        .eq("id", tripId)
        .single();
      if (fetchErr) throw fetchErr;

      // Validate
      const errors: string[] = [];
      if (!["CONCEPT", "VERZENDKLAAR"].includes(trip.dispatch_status)) {
        errors.push(`Rit kan niet verzonden worden vanuit status "${trip.dispatch_status}"`);
      }
      if (!trip.driver_id) errors.push("Geen chauffeur toegewezen");
      const stops = (trip as any).trip_stops || [];
      stops.forEach((s: any, i: number) => {
        if (!s.planned_address) errors.push(`Stop ${i + 1}: adres ontbreekt`);
      });
      if (stops.length === 0) errors.push("Geen stops in deze rit");

      if (errors.length > 0) {
        throw new Error(errors.join(". "));
      }

      // Update to VERZONDEN
      const { error: updateErr } = await supabase.from("trips").update({
        dispatch_status: "VERZONDEN",
        dispatched_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", tripId);
      if (updateErr) throw updateErr;

      // Create notification for driver (target their user_id if linked)
      let driverUserId: string | null = null;
      if (trip.driver_id) {
        const { data: driverRow } = await supabase
          .from("drivers" as any)
          .select("user_id")
          .eq("id", trip.driver_id)
          .single();
        driverUserId = (driverRow as any)?.user_id ?? null;
      }

      if (driverUserId) {
        await supabase.from("notifications").insert({
          type: "DISPATCH",
          title: "Nieuwe rit toegewezen",
          message: `Rit ${tripId.slice(0, 8)} is aan u toegewezen. ${stops.length} stop${stops.length !== 1 ? "s" : ""}.`,
          metadata: { trip_id: tripId },
          user_id: driverUserId,
          is_read: false,
        }).then(() => {});
      }

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trips"] });
      queryClient.invalidateQueries({ queryKey: ["driver-trips"] });
    },
  });
}

// ─── Save POD ───────────────────────────────────────────────
export function useSavePOD() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      trip_stop_id: string;
      order_id?: string;
      signature_url: string;
      photos?: { url: string; type: string }[];
      recipient_name: string;
      notes?: string;
    }) => {
      const { error } = await supabase.from("proof_of_delivery").insert({
        trip_stop_id: input.trip_stop_id,
        order_id: input.order_id || null,
        pod_status: "ONTVANGEN",
        signature_url: input.signature_url,
        photos: input.photos || [],
        recipient_name: input.recipient_name,
        received_at: new Date().toISOString(),
        notes: input.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trips"] });
      queryClient.invalidateQueries({ queryKey: ["trip"] });
      queryClient.invalidateQueries({ queryKey: ["driver-trips"] });
    },
  });
}

// ─── Create delivery exception ──────────────────────────────
export function useCreateDeliveryException() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      tenant_id: string;
      trip_id?: string;
      trip_stop_id?: string;
      order_id?: string;
      exception_type: string;
      severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
      description: string;
      blocks_billing?: boolean;
    }) => {
      const { error } = await supabase.from("delivery_exceptions").insert({
        tenant_id: input.tenant_id,
        trip_id: input.trip_id || null,
        trip_stop_id: input.trip_stop_id || null,
        order_id: input.order_id || null,
        exception_type: input.exception_type,
        severity: input.severity,
        description: input.description,
        blocks_billing: input.blocks_billing || false,
        status: "OPEN",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delivery-exceptions"] });
    },
  });
}

// ─── Realtime ───────────────────────────────────────────────
/**
 * Subscribe to all changes on the `trips` table and invalidate
 * the relevant React Query caches so every connected user sees
 * updates in near-real-time.
 *
 * Mount once at the app/layout level alongside useAutoCompleteTripCheck.
 */
export function useTripsRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("trips-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trips" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["trips"] });
          queryClient.invalidateQueries({ queryKey: ["trip"] });
          queryClient.invalidateQueries({ queryKey: ["driver-trips"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}

// ─── Auto trip-completion via Realtime subscription ─────────
/**
 * Hook that subscribes to trip_stops changes via Supabase Realtime.
 * When any stop transitions to a terminal status (AFGELEVERD, MISLUKT, OVERGESLAGEN),
 * it checks whether all stops in that trip are terminal and auto-completes the trip.
 *
 * Mount this once at the app/layout level (e.g., in Dispatch page).
 */
export function useAutoCompleteTripCheck() {
  const queryClient = useQueryClient();

  const handleStopChange = useCallback(
    async (payload: { new: Record<string, any> }) => {
      const stop = payload.new;
      const terminalStatuses = ["AFGELEVERD", "MISLUKT", "OVERGESLAGEN"];
      if (!terminalStatuses.includes(stop.stop_status)) return;
      if (!stop.trip_id) return;

      try {
        const completed = await checkTripCompletion(stop.trip_id);
        if (completed) {
          toast.success("Rit automatisch voltooid — alle stops zijn afgerond");
          queryClient.invalidateQueries({ queryKey: ["trips"] });
          queryClient.invalidateQueries({ queryKey: ["trip"] });
          queryClient.invalidateQueries({ queryKey: ["driver-trips"] });
          queryClient.invalidateQueries({ queryKey: ["orders"] });
        }
      } catch (err) {
        console.error("Auto trip completion (realtime) failed:", err);
      }
    },
    [queryClient],
  );

  // Auto-subscribe on mount, cleanup on unmount
  useEffect(() => {
    const channel = supabase
      .channel("auto-trip-completion")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "trip_stops" },
        handleStopChange,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [handleStopChange]);
}
