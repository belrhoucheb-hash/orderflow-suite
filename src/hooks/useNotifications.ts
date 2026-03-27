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
  const [userId, setUserId] = useState<string | null>(null);

  // Get current user id on mount
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
  }, []);

  // Fetch notifications filtered by user_id
  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["notifications", userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) {
        console.error("Notifications fetch error:", error);
        throw error;
      }
      return (data ?? []) as unknown as Notification[];
    },
    enabled: !!userId,
    refetchInterval: 30_000, // Refetch every 30s as fallback
  });

  // Subscribe to realtime inserts for this user
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel("notifications-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, userId]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const markAsRead = useCallback(async (id: string) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
  }, [queryClient, userId]);

  const markAllAsRead = useCallback(async () => {
    if (!userId) return;
    await supabase.from("notifications").update({ is_read: true }).eq("is_read", false).eq("user_id", userId);
    queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
  }, [queryClient, userId]);

  const deleteNotification = useCallback(async (id: string) => {
    await supabase.from("notifications").delete().eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
  }, [queryClient, userId]);

  const clearAll = useCallback(async () => {
    if (!userId) return;
    await supabase.from("notifications").delete().eq("is_read", true).eq("user_id", userId);
    queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
  }, [queryClient, userId]);

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
// If user_id is omitted, it defaults to the currently authenticated user.
export async function createNotification(params: {
  type: string;
  title: string;
  message: string;
  icon?: string;
  order_id?: string;
  user_id?: string;
  metadata?: Record<string, any>;
}) {
  let targetUserId = params.user_id;
  if (!targetUserId) {
    const { data } = await supabase.auth.getUser();
    targetUserId = data.user?.id;
  }
  const { error } = await supabase.from("notifications").insert({
    type: params.type,
    title: params.title,
    message: params.message,
    icon: params.icon || "bell",
    order_id: params.order_id || null,
    user_id: targetUserId,
    metadata: params.metadata || {},
  });
  if (error) console.error("Failed to create notification:", error);
}
