import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Order, OrderStatus } from "@/data/mockData";

// ─── 8.11 Order Status State Machine ─────────────────────────────────
// Valid status transitions (matches the intended Supabase check constraint):
//   DRAFT    → PENDING
//   PENDING  → PLANNED
//   PLANNED  → IN_TRANSIT
//   IN_TRANSIT → DELIVERED
//   Any      → CANCELLED
//
// The DB should enforce this via:
//   ALTER TABLE orders ADD CONSTRAINT valid_status_transition CHECK (
//     status IN ('DRAFT','PENDING','PLANNED','IN_TRANSIT','DELIVERED','CANCELLED')
//   );
// And a trigger or RLS policy for transition validation.
// The frontend validates transitions below as a first line of defence.
// ──────────────────────────────────────────────────────────────────────

export type OrderStatus = "DRAFT" | "PENDING" | "PLANNED" | "IN_TRANSIT" | "DELIVERED" | "CANCELLED";

/** Map of each status to its allowed next statuses. */
const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: ["PENDING", "CANCELLED"],
  PENDING: ["PLANNED", "CANCELLED"],
  PLANNED: ["IN_TRANSIT", "CANCELLED"],
  IN_TRANSIT: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],    // terminal state
  CANCELLED: [],    // terminal state
};

/**
 * Check whether a status transition is allowed.
 * Also accepts legacy statuses (OPEN, WAITING) and maps them to the new model.
 */
export function isValidStatusTransition(from: string, to: string): boolean {
  // Map legacy statuses used in existing data to the new state machine
  const legacyMap: Record<string, OrderStatus> = {
    OPEN: "PENDING",
    WAITING: "PENDING",
  };
  const normFrom = (legacyMap[from] ?? from) as OrderStatus;
  const normTo = (legacyMap[to] ?? to) as OrderStatus;

  const allowed = VALID_TRANSITIONS[normFrom];
  if (!allowed) return false; // unknown source status
  return allowed.includes(normTo);
}

// Map legacy DB statuses to the canonical status model
const legacyStatusMap: Record<string, OrderStatus> = {
  OPEN: "PENDING",
  WAITING: "PENDING",
};

function normalizeStatus(dbStatus: string): OrderStatus {
  return (legacyStatusMap[dbStatus] ?? dbStatus) as OrderStatus;
}

export interface UseOrdersOptions {
  page?: number;
  pageSize?: number;
  statusFilter?: string;
  search?: string;
}

export function useOrders(options: UseOrdersOptions = {}) {
  const { page = 0, pageSize = 25, statusFilter, search } = options;

  return useQuery({
    queryKey: ["orders", { page, pageSize, statusFilter, search }],
    queryFn: async () => {
      let query = supabase
        .from("orders")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (statusFilter && statusFilter !== "alle") {
        query = query.eq("status", statusFilter);
      }

      if (search) {
        query = query.or(`client_name.ilike.%${search}%,order_number::text.ilike.%${search}%`);
      }

      const { data, error, count } = await query;

      if (error) throw error;

      const orders = (data ?? []).map((o): Order => ({
        id: o.id,
        orderNumber: `RCS-${new Date(o.created_at).getFullYear()}-${String(o.order_number).padStart(4, "0")}`,
        customer: o.client_name || "Onbekend",
        email: o.source_email_from || "",
        phone: "",
        pickupAddress: o.pickup_address || "",
        deliveryAddress: o.delivery_address || "",
        status: normalizeStatus(o.status),
        priority: "normaal",
        items: [],
        totalWeight: o.weight_kg ?? 0,
        vehicle: o.vehicle_id ?? undefined,
        createdAt: o.created_at,
        estimatedDelivery: "",
        notes: o.internal_note || "",
      }));

      return { orders, totalCount: count ?? 0 };
    },
  });
}

export function useOrdersSubscription() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("public:orders")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["orders"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: ["orders", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("id", id)
        .single();
        
      if (error) throw error;
      if (!data) return null;

      return {
        id: data.id,
        orderNumber: `RCS-${new Date(data.created_at).getFullYear()}-${String(data.order_number).padStart(4, "0")}`,
        customer: data.client_name || "Onbekend",
        email: data.source_email_from || "",
        phone: "",
        pickupAddress: data.pickup_address || "",
        deliveryAddress: data.delivery_address || "",
        status: normalizeStatus(data.status),
        priority: "normaal" as const,
        items: [],
        totalWeight: data.weight_kg ?? 0,
        vehicle: data.vehicle_id ?? undefined,
        createdAt: data.created_at,
        estimatedDelivery: "",
        notes: data.internal_note || "",
      } as Order;
    },
    enabled: !!id,
  });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (newOrder: any) => {
      const { data, error } = await supabase
        .from("orders")
        .insert([newOrder])
        .select()
        .single();
        
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

export function useUpdateOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      // 8.11 – Validate status transitions on the frontend before hitting the DB
      if (updates.status) {
        const { data: current, error: fetchErr } = await supabase
          .from("orders")
          .select("status")
          .eq("id", id)
          .single();

        if (fetchErr) throw fetchErr;
        if (current && !isValidStatusTransition(current.status, updates.status)) {
          throw new Error(
            `Ongeldige statusovergang: ${current.status} → ${updates.status}. ` +
            `Toegestaan vanuit ${current.status}: ${VALID_TRANSITIONS[(current.status as OrderStatus)]?.join(", ") || "geen"}.`
          );
        }
      }

      const { data, error } = await supabase
        .from("orders")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["orders", variables.id] });
    },
  });
}

export function useDeleteOrder() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("orders")
        .delete()
        .eq("id", id);
        
      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}
