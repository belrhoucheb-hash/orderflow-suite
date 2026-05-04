import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";

export interface DriverPlannerMessage {
  id: string;
  tenant_id: string;
  thread_key: string;
  from_user_id: string;
  to_user_id: string | null;
  body: string;
  attachments: unknown;
  created_at: string;
  read_at: string | null;
}

export function driverThreadKey(driverId: string): string {
  return `driver:${driverId}`;
}

export function useThreadMessages(threadKey: string | null) {
  return useQuery({
    queryKey: ["messages", threadKey],
    enabled: !!threadKey,
    staleTime: 5_000,
    queryFn: async () => {
      if (!threadKey) return [];
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("thread_key", threadKey)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return ((data ?? []) as unknown) as DriverPlannerMessage[];
    },
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  const { tenant } = useTenant();
  return useMutation({
    mutationFn: async (input: {
      threadKey: string;
      body: string;
      toUserId?: string | null;
    }) => {
      if (!tenant?.id) throw new Error("Geen tenant beschikbaar");
      const trimmed = input.body.trim();
      if (!trimmed) throw new Error("Bericht mag niet leeg zijn");
      const { data: session } = await supabase.auth.getSession();
      const fromUserId = session?.session?.user?.id;
      if (!fromUserId) throw new Error("Niet ingelogd");

      const { data, error } = await supabase
        .from("messages")
        .insert({
          tenant_id: tenant.id,
          thread_key: input.threadKey,
          from_user_id: fromUserId,
          to_user_id: input.toUserId ?? null,
          body: trimmed,
        })
        .select("*")
        .single();
      if (error) throw error;
      return (data as unknown) as DriverPlannerMessage;
    },
    onSuccess: (msg) => {
      queryClient.invalidateQueries({ queryKey: ["messages", msg.thread_key] });
      queryClient.invalidateQueries({ queryKey: ["driver-threads"] });
    },
  });
}

export function useMarkThreadRead(threadKey: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!threadKey) return;
      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;
      if (!userId) return;
      await supabase
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .eq("thread_key", threadKey)
        .eq("to_user_id", userId)
        .is("read_at", null);
    },
    onSuccess: () => {
      if (threadKey) {
        queryClient.invalidateQueries({ queryKey: ["messages", threadKey] });
      }
      queryClient.invalidateQueries({ queryKey: ["driver-threads"] });
    },
  });
}

/**
 * Realtime subscription op één thread. Mount in de component die de thread
 * weergeeft, zodat nieuwe berichten direct verschijnen zonder polling.
 */
export function useThreadRealtime(threadKey: string | null) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!threadKey) return;
    const channel = supabase
      .channel(`messages:${threadKey}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `thread_key=eq.${threadKey}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["messages", threadKey] });
          queryClient.invalidateQueries({ queryKey: ["driver-threads"] });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `thread_key=eq.${threadKey}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["messages", threadKey] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [threadKey, queryClient]);
}

/**
 * Lijst van driver-threads voor de planner-overview. Toont laatste bericht
 * per thread + ongelezen telling. Implementatie eenvoudig via twee queries
 * (nieuwste bericht + unread-count) gegroepeerd per thread.
 */
export function usePlannerDriverThreads() {
  const { tenant } = useTenant();
  return useQuery({
    queryKey: ["driver-threads", tenant?.id],
    enabled: !!tenant?.id,
    staleTime: 5_000,
    queryFn: async () => {
      if (!tenant?.id) return [];

      // Pak alle drivers van deze tenant met linked user_id zodat we threads kunnen
      // tonen, ook als er nog geen bericht is.
      const { data: drivers, error: driversErr } = await supabase
        .from("drivers" as any)
        .select("id, name, user_id")
        .eq("tenant_id", tenant.id)
        .eq("is_active", true);
      if (driversErr) throw driversErr;

      const driverList = ((drivers ?? []) as unknown) as Array<{ id: string; name: string | null; user_id: string | null }>;

      // Voor elke driver: laatste bericht + unread count.
      const enriched = await Promise.all(
        driverList.map(async (driver) => {
          const threadKey = driverThreadKey(driver.id);
          const [{ data: lastRows }, { data: unreadRows }] = await Promise.all([
            supabase
              .from("messages")
              .select("id, body, created_at, from_user_id")
              .eq("thread_key", threadKey)
              .order("created_at", { ascending: false })
              .limit(1),
            supabase
              .from("messages")
              .select("id")
              .eq("thread_key", threadKey)
              .is("read_at", null)
              .neq("from_user_id", driver.user_id ?? "00000000-0000-0000-0000-000000000000"),
          ]);
          const last = (((lastRows ?? []) as unknown) as Array<{
            body: string;
            created_at: string;
            from_user_id: string;
          }>)[0] ?? null;
          return {
            driverId: driver.id,
            driverName: driver.name ?? "Onbekend",
            driverUserId: driver.user_id ?? null,
            threadKey,
            lastMessage: last
              ? {
                  body: last.body,
                  createdAt: last.created_at,
                  fromUserId: last.from_user_id,
                }
              : null,
            unreadCount: ((unreadRows ?? []) as unknown[]).length,
          };
        }),
      );

      // Sorteer: ongelezen eerst, dan op laatste bericht.
      enriched.sort((a, b) => {
        if (a.unreadCount !== b.unreadCount) return b.unreadCount - a.unreadCount;
        const aTs = a.lastMessage?.createdAt ?? "";
        const bTs = b.lastMessage?.createdAt ?? "";
        return bTs.localeCompare(aTs);
      });
      return enriched;
    },
  });
}

/**
 * Realtime subscription voor de planner-overview, zodat nieuwe driver-berichten
 * direct in de lijst verschijnen.
 */
export function useDriverThreadsRealtime() {
  const queryClient = useQueryClient();
  const { tenant } = useTenant();
  useEffect(() => {
    if (!tenant?.id) return;
    const channel = supabase
      .channel("driver-threads")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `tenant_id=eq.${tenant.id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["driver-threads", tenant.id] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenant?.id, queryClient]);
}
