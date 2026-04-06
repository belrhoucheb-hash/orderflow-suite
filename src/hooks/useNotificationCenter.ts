import { useState, useCallback, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { useNotifications } from "@/hooks/useNotifications";
import type { NotificationPayload, NotificationSeverity, NotificationEntityType } from "@/types/realtime";

// ─── Dutch notification generators ──────────────────────────────────

function generateOrderNotification(
  eventType: string,
  record: Record<string, any>,
  old: Record<string, any>
): NotificationPayload | null {
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const ref = record.order_number
    ? `RCS-${new Date(record.created_at || Date.now()).getFullYear()}-${String(record.order_number).padStart(4, "0")}`
    : record.id?.slice(0, 8) ?? "?";

  if (eventType === "INSERT") {
    return {
      id,
      type: "order_new",
      title: "Nieuwe order ontvangen",
      message: `Nieuwe order ontvangen van ${record.client_name || "onbekende klant"}`,
      severity: "info",
      entityType: "order",
      entityId: record.id,
      actionUrl: `/orders/${record.id}`,
      read: false,
      timestamp,
    };
  }

  if (eventType === "UPDATE" && record.status && old.status && record.status !== old.status) {
    // Check for AI auto-approval
    if (record.status === "APPROVED" && record.ai_approved) {
      return {
        id,
        type: "ai_auto_approved",
        title: "AI automatische goedkeuring",
        message: `AI heeft order ${ref} automatisch goedgekeurd`,
        severity: "success",
        entityType: "order",
        entityId: record.id,
        actionUrl: `/orders/${record.id}`,
        read: false,
        timestamp,
      };
    }

    return {
      id,
      type: "order_status_change",
      title: "Order status gewijzigd",
      message: `Order ${ref} status gewijzigd naar ${record.status}`,
      severity: "info",
      entityType: "order",
      entityId: record.id,
      actionUrl: `/orders/${record.id}`,
      read: false,
      timestamp,
    };
  }

  return null;
}

function generateTripNotification(
  eventType: string,
  record: Record<string, any>
): NotificationPayload | null {
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const tripRef = record.id?.slice(0, 8) ?? "?";

  if (eventType === "INSERT" || (eventType === "UPDATE" && record.status === "DISPATCHED")) {
    return {
      id,
      type: "trip_dispatched",
      title: "Rit verzonden",
      message: `Rit ${tripRef} verzonden naar ${record.driver_name || "chauffeur"}`,
      severity: "info",
      entityType: "trip",
      entityId: record.id,
      actionUrl: `/dispatch`,
      read: false,
      timestamp,
    };
  }

  return null;
}

function generateAnomalyNotification(
  eventType: string,
  record: Record<string, any>
): NotificationPayload | null {
  if (eventType !== "INSERT") return null;

  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  return {
    id,
    type: "anomaly_detected",
    title: "Anomalie gedetecteerd",
    message: `Waarschuwing: ${record.title || record.description || "Onbekende anomalie"}`,
    severity: "warning",
    entityType: "anomaly",
    entityId: record.id,
    actionUrl: record.entity_id ? `/orders/${record.entity_id}` : undefined,
    read: false,
    timestamp,
  };
}

// ─── Exported: generateNotificationFromEvent ────────────────────────
// Pure function — used by hook and tests

export function generateNotificationFromEvent(
  table: string,
  eventType: string,
  record: Record<string, any>,
  old: Record<string, any> = {}
): NotificationPayload | null {
  switch (table) {
    case "orders":
      return generateOrderNotification(eventType, record, old);
    case "trips":
      return generateTripNotification(eventType, record);
    case "anomalies":
      return generateAnomalyNotification(eventType, record);
    default:
      return null;
  }
}

// ─── Max local notifications to keep in memory ──────────────────────
const MAX_LOCAL_NOTIFICATIONS = 50;

/**
 * Notification center hook that subscribes to realtime changes on
 * orders, trips, anomalies, and the notifications table.
 *
 * Generates Dutch-language notifications and keeps a local list.
 * Also delegates to the existing useNotifications() hook for
 * persisted DB notifications.
 */
export function useNotificationCenter() {
  const queryClient = useQueryClient();

  // Persisted notifications from the DB (via existing hook)
  const dbNotifications = useNotifications();

  // Local realtime-generated notifications (not persisted)
  const [localNotifications, setLocalNotifications] = useState<NotificationPayload[]>([]);

  // ─── Realtime: orders ───────────────────────────────────────────
  useRealtimeSubscription({ table: "orders" }, (payload) => {
    // Invalidate orders queries so lists auto-refresh
    queryClient.invalidateQueries({ queryKey: ["orders"] });
    queryClient.invalidateQueries({ queryKey: ["draft-orders"] });

    const notification = generateNotificationFromEvent(
      "orders",
      payload.eventType,
      payload.new,
      payload.old
    );
    if (notification) {
      setLocalNotifications((prev) =>
        [notification, ...prev].slice(0, MAX_LOCAL_NOTIFICATIONS)
      );
    }
  });

  // ─── Realtime: trips ────────────────────────────────────────────
  useRealtimeSubscription({ table: "trips" }, (payload) => {
    queryClient.invalidateQueries({ queryKey: ["trips"] });
    queryClient.invalidateQueries({ queryKey: ["driver-trips"] });

    const notification = generateNotificationFromEvent(
      "trips",
      payload.eventType,
      payload.new,
      payload.old
    );
    if (notification) {
      setLocalNotifications((prev) =>
        [notification, ...prev].slice(0, MAX_LOCAL_NOTIFICATIONS)
      );
    }
  });

  // ─── Realtime: anomalies ────────────────────────────────────────
  useRealtimeSubscription({ table: "anomalies" }, (payload) => {
    queryClient.invalidateQueries({ queryKey: ["anomalies"] });

    const notification = generateNotificationFromEvent(
      "anomalies",
      payload.eventType,
      payload.new,
      payload.old
    );
    if (notification) {
      setLocalNotifications((prev) =>
        [notification, ...prev].slice(0, MAX_LOCAL_NOTIFICATIONS)
      );
    }
  });

  // ─── Realtime: notifications table ──────────────────────────────
  // (The existing useNotifications hook already subscribes for DB refresh,
  //  but we also invalidate inbox queries here)
  useRealtimeSubscription({ table: "notifications" }, () => {
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  });

  // ─── Combined notifications ─────────────────────────────────────
  // DB notifications take priority; local ones supplement them.
  const allNotifications = [
    ...dbNotifications.notifications.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      severity: "info" as NotificationSeverity,
      entityType: "notification" as NotificationEntityType,
      entityId: n.order_id ?? n.id,
      actionUrl: n.order_id ? `/orders/${n.order_id}` : undefined,
      read: n.is_read,
      timestamp: n.created_at,
    })),
    ...localNotifications,
  ];

  // De-duplicate by id
  const seen = new Set<string>();
  const notifications = allNotifications.filter((n) => {
    if (seen.has(n.id)) return false;
    seen.add(n.id);
    return true;
  });

  // Sort by timestamp descending
  notifications.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const unreadCount =
    dbNotifications.unreadCount +
    localNotifications.filter((n) => !n.read).length;

  // ─── Actions ────────────────────────────────────────────────────
  const markAsRead = useCallback(
    (id: string) => {
      // Try DB first
      dbNotifications.markAsRead(id);
      // Also mark local
      setLocalNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
    },
    [dbNotifications]
  );

  const markAllAsRead = useCallback(() => {
    dbNotifications.markAllAsRead();
    setLocalNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, [dbNotifications]);

  const dismiss = useCallback(
    (id: string) => {
      dbNotifications.deleteNotification(id);
      setLocalNotifications((prev) => prev.filter((n) => n.id !== id));
    },
    [dbNotifications]
  );

  return {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    dismiss,
    isLoading: dbNotifications.isLoading,
  };
}
