import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  icon: string;
  order_id: string | null;
  is_read: boolean;
  created_at: string;
  metadata: Record<string, any>;
}

export function useNotifications() {
  const queryClient = useQueryClient();

  // Fetch notifications
  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) {
        console.error("Notifications fetch error:", error);
        throw error;
      }
      return (data ?? []) as unknown as Notification[];
    },
    refetchInterval: 30_000, // Refetch every 30s as fallback
  });

  // Subscribe to realtime inserts
  useEffect(() => {
    const channel = supabase
      .channel("notifications-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["notifications"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const markAsRead = useCallback(async (id: string) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }, [queryClient]);

  const markAllAsRead = useCallback(async () => {
    await supabase.from("notifications").update({ is_read: true }).eq("is_read", false);
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }, [queryClient]);

  const deleteNotification = useCallback(async (id: string) => {
    await supabase.from("notifications").delete().eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }, [queryClient]);

  const clearAll = useCallback(async () => {
    await supabase.from("notifications").delete().eq("is_read", true);
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }, [queryClient]);

  return {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll,
  };
}

// Helper to create a notification (used by SLA checker and other triggers)
export async function createNotification(params: {
  type: string;
  title: string;
  message: string;
  icon?: string;
  order_id?: string;
  metadata?: Record<string, any>;
}) {
  const { error } = await supabase.from("notifications").insert({
    type: params.type,
    title: params.title,
    message: params.message,
    icon: params.icon || "bell",
    order_id: params.order_id || null,
    metadata: params.metadata || {},
  });
  if (error) console.error("Failed to create notification:", error);
}
