import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Order } from "@/data/mockData";
import { logAudit } from "@/lib/auditLog";
import { emitEventDirect } from "@/hooks/useEventPipeline";
import type { EventType } from "@/types/events";

// ─── 8.11 Order Status State Machine ─────────────────────────────────
// Extracted to @/lib/statusTransitions as a pure function (no Supabase dep).
// Re-exported here for backwards compatibility.
// ──────────────────────────────────────────────────────────────────────
export { isValidStatusTransition, VALID_TRANSITIONS } from "@/lib/statusTransitions";
export type { OrderStatus } from "@/lib/statusTransitions";
import { VALID_TRANSITIONS } from "@/lib/statusTransitions";
import type { OrderStatus } from "@/lib/statusTransitions";

// Map legacy DB statuses to the canonical status model
const legacyStatusMap: Record<string, OrderStatus> = {
  OPEN: "PENDING",
  WAITING: "PENDING",
  CONFIRMED: "PENDING",
};

function normalizeStatus(dbStatus: string): OrderStatus {
  return (legacyStatusMap[dbStatus] ?? dbStatus) as OrderStatus;
}

export interface UseOrdersOptions {
  page?: number;
  pageSize?: number;
  statusFilter?: string;
  orderTypeFilter?: string;
  search?: string;
  /**
   * Prio 1: filter orders by department.
   * Accepts a department UUID. Non-uuid values are ignored (use
   * `useDepartments()` to resolve a code → uuid upstream).
   */
  departmentFilter?: string;
}

// RFC4122 v1-v5 UUID validator (simple shape check)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function useOrders(options: UseOrdersOptions = {}) {
  const { page = 0, pageSize = 25, statusFilter, orderTypeFilter, search, departmentFilter } = options;

  return useQuery({
    queryKey: ["orders", { page, pageSize, statusFilter, orderTypeFilter, search, departmentFilter }],
    staleTime: 5_000,
    queryFn: async () => {
      let query = (supabase as any)
        .from("orders")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (statusFilter && statusFilter !== "alle") {
        // Account for legacy statuses that map to PENDING
        if (statusFilter === "PENDING") {
          query = query.in("status", ["PENDING", "OPEN", "WAITING", "CONFIRMED"]);
        } else {
          query = query.eq("status", statusFilter);
        }
      }

      if (orderTypeFilter) {
        query = query.eq("order_type", orderTypeFilter);
      }

      if (departmentFilter && UUID_RE.test(departmentFilter)) {
        query = query.eq("department_id", departmentFilter);
      }

      if (search) {
        const parts = [
          `client_name.ilike.%${search}%`,
          `pickup_address.ilike.%${search}%`,
          `delivery_address.ilike.%${search}%`,
        ];
        // order_number is an integer column — ilike/::text casts are not
        // supported by PostgREST.  Only add a numeric filter when the user
        // types a number so the query doesn't break.
        const asNum = Number(search);
        if (!Number.isNaN(asNum) && Number.isInteger(asNum)) {
          parts.push(`order_number.eq.${asNum}`);
        }
        query = query.or(parts.join(","));
      }

      // Parallel: orders + departments lookup (so we can map department_id → code client-side
      // without paying the cost of a join on every row).
      const [ordersResult, deptsResult] = await Promise.all([
        query,
        (supabase as any)
          .from("departments")
          .select("id, code, name"),
      ]);

      const { data, error, count } = ordersResult;
      if (error) throw error;
      if (deptsResult.error) throw deptsResult.error;

      const deptCodeById: Record<string, string> = {};
      (deptsResult.data ?? []).forEach((d: any) => {
        deptCodeById[d.id] = d.code;
      });

      const orders = (data ?? []).map((o): Order => {
        // Compute estimatedDelivery from available data
        let estimatedDelivery = "";
        if (o.time_window_end) {
          estimatedDelivery = o.time_window_end;
        } else {
          // Fallback: created_at + offset based on priority
          const created = new Date(o.created_at);
          const priority = (o.priority || "normaal").toLowerCase();
          const hoursOffset = (priority === "spoed" || priority === "hoog") ? 4 : 24;
          estimatedDelivery = new Date(created.getTime() + hoursOffset * 60 * 60 * 1000).toISOString();
        }

        const departmentId = (o as any).department_id ?? null;
        const departmentCode = departmentId ? deptCodeById[departmentId] ?? null : null;

        return {
          id: o.id,
          orderNumber: `RCS-${new Date(o.created_at).getFullYear()}-${String(o.order_number).padStart(4, "0")}`,
          customer: o.client_name || "Onbekend",
          email: o.source_email_from || "",
          phone: "",
          pickupAddress: o.pickup_address || "",
          deliveryAddress: o.delivery_address || "",
          status: normalizeStatus(o.status),
          priority: (o.priority as Order["priority"]) || "normaal",
          items: [],
          totalWeight: o.weight_kg ?? 0,
          vehicle: o.vehicle_id ?? undefined,
          createdAt: o.created_at,
          estimatedDelivery,
          notes: o.internal_note || "",
          orderType: (o as any).order_type ?? "ZENDING",
          parentOrderId: o.parent_order_id ?? null,
          departmentId,
          departmentCode,
          shipmentId: (o as any).shipment_id ?? null,
          legNumber: (o as any).leg_number ?? null,
          legRole: (o as any).leg_role ?? null,
        };
      });

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
    staleTime: 5_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      if (!data) return null;

      // Compute estimatedDelivery
      let estimatedDelivery = "";
      if (data.time_window_end) {
        estimatedDelivery = data.time_window_end;
      } else {
        const created = new Date(data.created_at);
        const priority = (data.priority || "normaal").toLowerCase();
        const hoursOffset = (priority === "spoed" || priority === "hoog") ? 4 : 24;
        estimatedDelivery = new Date(created.getTime() + hoursOffset * 60 * 60 * 1000).toISOString();
      }

      // Resolve department code if department_id is present
      const departmentId = (data as any).department_id ?? null;
      let departmentCode: string | null = null;
      if (departmentId) {
        const { data: dept } = await (supabase as any)
          .from("departments")
          .select("code")
          .eq("id", departmentId)
          .maybeSingle();
        departmentCode = dept?.code ?? null;
      }

      return {
        id: data.id,
        orderNumber: `RCS-${new Date(data.created_at).getFullYear()}-${String(data.order_number).padStart(4, "0")}`,
        customer: data.client_name || "Onbekend",
        email: data.source_email_from || "",
        phone: "",
        pickupAddress: data.pickup_address || "",
        deliveryAddress: data.delivery_address || "",
        status: normalizeStatus(data.status),
        priority: (data.priority as Order["priority"]) || "normaal",
        items: [],
        totalWeight: data.weight_kg ?? 0,
        vehicle: data.vehicle_id ?? undefined,
        createdAt: data.created_at,
        estimatedDelivery,
        notes: data.internal_note || "",
        departmentId,
        departmentCode,
        shipmentId: (data as any).shipment_id ?? null,
        legNumber: (data as any).leg_number ?? null,
        legRole: (data as any).leg_role ?? null,
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

      // Fire-and-forget event pipeline for status changes
      if (variables.updates.status) {
        const statusEventMap: Record<string, EventType> = {
          PLANNED: "order_planned",
          DELIVERED: "order_delivered",
        };
        const eventType = statusEventMap[variables.updates.status];
        if (eventType) {
          emitEventDirect(variables.id, eventType, { actorType: "system" });
        }
      }

      // Fire-and-forget audit trail for order updates (including status changes)
      const changedFields = Object.keys(variables.updates);
      logAudit({
        table_name: "orders",
        record_id: variables.id,
        action: "UPDATE",
        new_data: variables.updates,
        changed_fields: changedFields,
      });
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
