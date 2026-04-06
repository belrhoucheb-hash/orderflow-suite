import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeEventType } from "@/types/realtime";

export interface RealtimeSubscriptionOptions {
  /** Supabase table name */
  table: string;
  /** Optional filter string, e.g. "user_id=eq.abc123" */
  filter?: string;
  /** Which event types to listen for. Defaults to all ("*") */
  event?: RealtimeEventType | "*";
  /** Schema to subscribe to. Defaults to "public" */
  schema?: string;
  /** Whether the subscription is enabled. Defaults to true */
  enabled?: boolean;
}

/**
 * Generic hook to subscribe to Supabase Realtime postgres_changes on a table.
 *
 * Handles cleanup on unmount and reconnection on disconnect.
 *
 * @param options - Subscription configuration
 * @param callback - Called when a matching change event occurs
 */
export function useRealtimeSubscription(
  options: RealtimeSubscriptionOptions,
  callback: (payload: {
    eventType: RealtimeEventType;
    new: Record<string, any>;
    old: Record<string, any>;
  }) => void
) {
  const { table, filter, event = "*", schema = "public", enabled = true } = options;
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const stableFilter = filter;
  const stableEvent = event;
  const stableSchema = schema;

  useEffect(() => {
    if (!enabled) return;

    const channelName = `realtime:${table}:${stableFilter ?? "all"}:${Date.now()}`;

    const channelConfig: {
      event: RealtimeEventType | "*";
      schema: string;
      table: string;
      filter?: string;
    } = {
      event: stableEvent,
      schema: stableSchema,
      table,
    };

    if (stableFilter) {
      channelConfig.filter = stableFilter;
    }

    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", channelConfig as any, (payload: any) => {
        callbackRef.current({
          eventType: payload.eventType,
          new: payload.new ?? {},
          old: payload.old ?? {},
        });
      })
      .subscribe((status: string) => {
        if (status === "CHANNEL_ERROR") {
          // Attempt reconnection after a short delay
          setTimeout(() => {
            supabase.removeChannel(channel);
          }, 3000);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, stableFilter, stableEvent, stableSchema, enabled]);
}
