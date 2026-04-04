import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { NotificationLog } from "@/types/notifications";

const QUERY_KEY = "notification_log";

export function useNotificationLogByOrder(orderId: string | null) {
  return useQuery({
    queryKey: [QUERY_KEY, "order", orderId],
    staleTime: 15_000,
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_log" as any)
        .select("*")
        .eq("order_id", orderId!)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data ?? []) as NotificationLog[];
    },
  });
}

export function useNotificationLogByTrip(tripId: string | null) {
  return useQuery({
    queryKey: [QUERY_KEY, "trip", tripId],
    staleTime: 15_000,
    enabled: !!tripId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_log" as any)
        .select("*")
        .eq("trip_id", tripId!)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data ?? []) as NotificationLog[];
    },
  });
}

export function useNotificationLogRecent(limit = 25) {
  return useQuery({
    queryKey: [QUERY_KEY, "recent", limit],
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_log" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data ?? []) as NotificationLog[];
    },
  });
}
