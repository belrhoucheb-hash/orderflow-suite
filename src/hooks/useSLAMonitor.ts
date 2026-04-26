import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createNotification } from "@/hooks/useNotifications";
import { useLoadSettings } from "@/hooks/useSettings";
import { DEFAULT_SLA_SETTINGS, normalizeSlaSettings } from "@/lib/slaSettings";

const CHECK_INTERVAL_MS = 60_000; // Check every 60 seconds

export function useSLAMonitor() {
  const notifiedRef = useRef<Set<string>>(new Set());
  const { data: rawSettings } = useLoadSettings<Partial<typeof DEFAULT_SLA_SETTINGS>>("sla");
  const slaSettings = normalizeSlaSettings(rawSettings);

  useEffect(() => {
    if (!slaSettings.enabled) return;

    const checkSLA = async () => {
      try {
        // Fetch DRAFT and OPEN orders with received_at
        const { data: orders, error } = await supabase
          .from("orders")
          .select("id, order_number, client_name, received_at, status")
          .in("status", ["DRAFT", "PENDING"])
          .not("received_at", "is", null)
          .order("received_at", { ascending: true });

        if (error || !orders) return;

        const now = new Date();

        for (const order of orders) {
          if (!order.received_at) continue;
          const deadline = new Date(
            new Date(order.received_at).getTime() + slaSettings.deadlineHours * 60 * 60 * 1000,
          );
          const minutesLeft = Math.floor((deadline.getTime() - now.getTime()) / 60000);

          // Already notified for this order in this session
          const criticalKey = `critical-${order.id}`;
          const warningKey = `warning-${order.id}`;

          if (minutesLeft <= 0 && !notifiedRef.current.has(criticalKey)) {
            // SLA expired
            notifiedRef.current.add(criticalKey);
            await createNotification({
              type: "sla_critical",
              title: `SLA verlopen: Order #${order.order_number}`,
              message: `${order.client_name || "Onbekende klant"} — deadline is verstreken. Direct actie vereist.`,
              icon: "alert-triangle",
              order_id: order.id,
              metadata: { minutes_left: 0, status: order.status },
            });
          } else if (
            minutesLeft > 0 &&
            minutesLeft <= slaSettings.warningMinutes &&
            !notifiedRef.current.has(warningKey)
          ) {
            // Warning: less than 1 hour left
            notifiedRef.current.add(warningKey);
            await createNotification({
              type: "sla_warning",
              title: `SLA waarschuwing: Order #${order.order_number}`,
              message: `${order.client_name || "Onbekende klant"} — nog ${minutesLeft} minuten tot de deadline.`,
              icon: "clock",
              order_id: order.id,
              metadata: { minutes_left: minutesLeft, status: order.status },
            });
          }
        }
      } catch (e) {
        console.error("SLA monitor error:", e);
      }
    };

    // Run immediately, then on interval
    checkSLA();
    const interval = setInterval(checkSLA, CHECK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [slaSettings.deadlineHours, slaSettings.enabled, slaSettings.warningMinutes]);

  // Also listen to realtime order changes for instant notifications
  useEffect(() => {
    const channel = supabase
      .channel("order-changes-notifications")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        async (payload) => {
          const oldStatus = (payload.old as any)?.status;
          const newRecord = payload.new as any;

          // Order cancelled → notify
          if (oldStatus !== "CANCELLED" && newRecord.status === "CANCELLED") {
            await createNotification({
              type: "order_cancelled",
              title: `Order #${newRecord.order_number} geannuleerd`,
              message: `${newRecord.client_name || "Onbekende klant"} — order is geannuleerd.${newRecord.vehicle_id ? " Voertuig is vrijgemaakt voor herplanning." : ""}`,
              icon: "x-circle",
              order_id: newRecord.id,
            });
          }

          // Reply merged (thread_type changed to update on an existing order)
          if (newRecord.thread_type === "update" && oldStatus === "DRAFT" && newRecord.status === "PENDING") {
            await createNotification({
              type: "client_reply",
              title: `Reply verwerkt: Order #${newRecord.order_number}`,
              message: `${newRecord.client_name || "Klant"} heeft ontbrekende gegevens aangevuld. Order is nu compleet en goedgekeurd.`,
              icon: "reply",
              order_id: newRecord.id,
            });
          }

          // Order approved
          if (oldStatus === "DRAFT" && newRecord.status === "PENDING" && newRecord.thread_type !== "update") {
            await createNotification({
              type: "order_approved",
              title: `Order #${newRecord.order_number} goedgekeurd`,
              message: `${newRecord.client_name || "Onbekende klant"} — order is goedgekeurd en klaar voor planning.`,
              icon: "package",
              order_id: newRecord.id,
            });
          }

          // Vehicle assigned (planning)
          if (!((payload.old as any)?.vehicle_id) && newRecord.vehicle_id) {
            await createNotification({
              type: "driver_update",
              title: `Voertuig toegewezen: Order #${newRecord.order_number}`,
              message: `${newRecord.client_name || "Order"} is toegewezen aan een voertuig.`,
              icon: "truck",
              order_id: newRecord.id,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
}
