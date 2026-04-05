import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { SlotBooking, SlotAvailability, LocationTimeWindow, TimeSlot } from "@/types/timeWindows";

interface SlotBookingsFilter {
  locationId: string | null;
  date: string | null;
}

export function useSlotBookings(filter: SlotBookingsFilter) {
  return useQuery({
    queryKey: ["slot_bookings", filter.locationId, filter.date],
    enabled: !!filter.locationId && !!filter.date,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("slot_bookings")
        .select("*")
        .eq("client_location_id", filter.locationId!)
        .eq("slot_date", filter.date!)
        .order("slot_start");
      if (error) throw error;
      return data as SlotBooking[];
    },
  });
}

export function useCreateSlotBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (booking: Omit<SlotBooking, "id" | "created_at" | "updated_at" | "order" | "location">) => {
      const { data, error } = await supabase
        .from("slot_bookings")
        .insert(booking)
        .select()
        .single();
      if (error) throw error;
      return data as SlotBooking;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["slot_bookings", variables.client_location_id, variables.slot_date] });
    },
  });
}

export function useCancelSlotBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, locationId, date }: { id: string; locationId: string; date: string }) => {
      const { data, error } = await supabase
        .from("slot_bookings")
        .update({ status: "GEANNULEERD" })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return { data, locationId, date };
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["slot_bookings", variables.locationId, variables.date] });
    },
  });
}

/**
 * Compute available slots for a given location, date, and time window config.
 * Pure function (no hook) so it can be used in the VRP solver too.
 */
export function computeSlotAvailability(
  timeWindow: LocationTimeWindow,
  existingBookings: SlotBooking[],
): SlotAvailability[] {
  const slots: SlotAvailability[] = [];
  const [openH, openM] = timeWindow.open_time.split(":").map(Number);
  const [closeH, closeM] = timeWindow.close_time.split(":").map(Number);
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;
  const duration = timeWindow.slot_duration_min;

  for (let start = openMinutes; start + duration <= closeMinutes; start += duration) {
    const startStr = `${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`;
    const endMin = start + duration;
    const endStr = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;

    const activeBookings = existingBookings.filter(
      (b) => b.status !== "GEANNULEERD" && b.status !== "VERLOPEN" && b.slot_start === startStr
    );

    slots.push({
      slot: { start: startStr, end: endStr },
      totalCapacity: timeWindow.max_concurrent_slots,
      bookedCount: activeBookings.length,
      available: timeWindow.max_concurrent_slots - activeBookings.length,
    });
  }

  return slots;
}
