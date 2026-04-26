import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantOptional } from "@/contexts/TenantContext";
import { getEffectiveLocalUserId } from "@/lib/devSession";

function useCurrentUserId(): string | null {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setUserId(data.user?.id ?? getEffectiveLocalUserId());
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return userId;
}

interface OrderNotesReadResult {
  hasUnread: boolean;
  markAsRead: () => void;
  isLoading: boolean;
}

export function useOrderNotesRead(
  orderId: string | null | undefined
): OrderNotesReadResult {
  const queryClient = useQueryClient();
  const { tenant } = useTenantOptional();
  const userId = useCurrentUserId();

  const query = useQuery({
    queryKey: ["orderNotesRead", orderId, userId],
    enabled: !!orderId && !!userId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data: order, error: orderErr } = await (supabase as any)
        .from("orders")
        .select("id, notes, reference, notes_updated_at")
        .eq("id", orderId!)
        .maybeSingle();
      if (orderErr) throw orderErr;

      const { data: read, error: readErr } = await (supabase as any)
        .from("order_note_reads")
        .select("read_at")
        .eq("user_id", userId!)
        .eq("order_id", orderId!)
        .maybeSingle();
      if (readErr) throw readErr;

      const hasContent =
        !!(order?.notes && String(order.notes).trim() !== "") ||
        !!(order?.reference && String(order.reference).trim() !== "");

      const notesUpdatedAt = order?.notes_updated_at
        ? new Date(order.notes_updated_at).getTime()
        : 0;
      const readAt = read?.read_at ? new Date(read.read_at).getTime() : 0;

      const hasUnread = hasContent && (!read?.read_at || readAt < notesUpdatedAt);

      return { hasUnread };
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!orderId || !userId || !tenant?.id) {
        throw new Error("missing orderId, userId or tenant");
      }
      const { error } = await (supabase as any)
        .from("order_note_reads")
        .upsert(
          {
            user_id: userId,
            order_id: orderId,
            tenant_id: tenant.id,
            read_at: new Date().toISOString(),
          },
          { onConflict: "user_id,order_id" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["orderNotesRead", orderId, userId],
      });
      queryClient.invalidateQueries({
        queryKey: ["unreadNoteOrderIds", tenant?.id, userId],
      });
    },
  });

  const attemptedOrderIdRef = useRef<string | null>(null);
  useEffect(() => {
    attemptedOrderIdRef.current = null;
  }, [orderId]);

  const markAsRead = () => {
    if (!orderId) return;
    if (mutation.isPending) return;
    if (attemptedOrderIdRef.current === orderId) return;
    attemptedOrderIdRef.current = orderId;
    mutation.mutate();
  };

  return {
    hasUnread: query.data?.hasUnread ?? false,
    markAsRead,
    isLoading: query.isLoading,
  };
}

interface UnreadNoteOrderIdsResult {
  unreadOrderIds: Set<string>;
  isLoading: boolean;
}

export function useUnreadNoteOrderIds(): UnreadNoteOrderIdsResult {
  const { tenant } = useTenantOptional();
  const userId = useCurrentUserId();

  const query = useQuery({
    queryKey: ["unreadNoteOrderIds", tenant?.id, userId],
    enabled: !!tenant?.id && !!userId,
    staleTime: 30_000,
    queryFn: async (): Promise<Set<string>> => {
      const { data: orders, error: ordersErr } = await (supabase as any)
        .from("orders")
        .select("id, notes, reference, notes_updated_at")
        .eq("tenant_id", tenant!.id)
        .or("notes.not.is.null,reference.not.is.null");
      if (ordersErr) throw ordersErr;

      const candidateOrders = (orders ?? []).filter((o: any) => {
        const hasNotes = o.notes && String(o.notes).trim() !== "";
        const hasReference = o.reference && String(o.reference).trim() !== "";
        return hasNotes || hasReference;
      });

      if (candidateOrders.length === 0) return new Set<string>();

      const candidateIds = candidateOrders.map((o: any) => o.id as string);

      const { data: reads, error: readsErr } = await (supabase as any)
        .from("order_note_reads")
        .select("order_id, read_at")
        .eq("user_id", userId!)
        .in("order_id", candidateIds);
      if (readsErr) throw readsErr;

      const readAtById = new Map<string, number>();
      (reads ?? []).forEach((r: any) => {
        readAtById.set(r.order_id, r.read_at ? new Date(r.read_at).getTime() : 0);
      });

      const unread = new Set<string>();
      for (const o of candidateOrders) {
        const updatedAt = o.notes_updated_at
          ? new Date(o.notes_updated_at).getTime()
          : 0;
        const readAt = readAtById.get(o.id);
        if (readAt === undefined || readAt < updatedAt) {
          unread.add(o.id);
        }
      }
      return unread;
    },
  });

  return {
    unreadOrderIds: query.data ?? new Set<string>(),
    isLoading: query.isLoading,
  };
}
