import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant, useTenantOptional } from "@/contexts/TenantContext";
import type { Order } from "@/data/mockData";
import type { OrderStatus } from "@/lib/statusTransitions";
import { fetchDepartmentsCached } from "@/hooks/useDepartments";

// Legacy → canonical mapping (mirrors useOrders.ts)
const legacyStatusMap: Record<string, OrderStatus> = {
  OPEN: "PENDING",
  WAITING: "PENDING",
  CONFIRMED: "PENDING",
};

function normalizeStatus(dbStatus: string): OrderStatus {
  return (legacyStatusMap[dbStatus] ?? dbStatus) as OrderStatus;
}

export interface Shipment {
  id: string;
  tenant_id: string;
  shipment_number: number | null;
  client_id: string | null;
  client_name: string | null;
  origin_address: string | null;
  destination_address: string | null;
  status: string;
  traject_rule_id: string | null;
  created_at: string;
  updated_at: string;
  legs: Order[];
}

export interface UseShipmentsOptions {
  page?: number;
  pageSize?: number;
  statusFilter?: string;
  search?: string;
}

function mapOrderRow(o: any, departmentCode?: string | null): Order {
  let estimatedDelivery = "";
  if (o.time_window_end) {
    estimatedDelivery = o.time_window_end;
  } else {
    const created = new Date(o.created_at);
    const priority = (o.priority || "normaal").toLowerCase();
    const hoursOffset = priority === "spoed" || priority === "hoog" ? 4 : 24;
    estimatedDelivery = new Date(
      created.getTime() + hoursOffset * 60 * 60 * 1000
    ).toISOString();
  }

  return {
    id: o.id,
    orderNumber: `RCS-${new Date(o.created_at).getFullYear()}-${String(
      o.order_number
    ).padStart(4, "0")}`,
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
    orderType: o.order_type ?? "ZENDING",
    parentOrderId: o.parent_order_id ?? null,
    departmentId: o.department_id ?? null,
    departmentCode: departmentCode ?? null,
    shipmentId: o.shipment_id ?? null,
    legNumber: o.leg_number ?? null,
    legRole: o.leg_role ?? null,
  };
}

export function useShipments(options: UseShipmentsOptions = {}) {
  const { page = 0, pageSize = 25, statusFilter, search } = options;
  const { tenant } = useTenantOptional();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: [
      "shipments",
      { page, pageSize, statusFilter, search, tenantId: tenant?.id },
    ],
    staleTime: 5_000,
    enabled: !!tenant?.id,
    queryFn: async () => {
      let query = (supabase as any)
        .from("shipments")
        .select("*", { count: "exact" })
        .eq("tenant_id", tenant!.id)
        .order("created_at", { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (statusFilter && statusFilter !== "alle") {
        query = query.eq("status", statusFilter);
      }

      if (search) {
        const parts = [
          `client_name.ilike.%${search}%`,
          `origin_address.ilike.%${search}%`,
          `destination_address.ilike.%${search}%`,
        ];
        const asNum = Number(search);
        if (!Number.isNaN(asNum) && Number.isInteger(asNum)) {
          parts.push(`shipment_number.eq.${asNum}`);
        }
        query = query.or(parts.join(","));
      }

      const { data: shipmentsData, error, count } = await query;
      if (error) throw error;

      const shipmentIds = (shipmentsData ?? []).map((s: any) => s.id);

      // Perf: departments via gedeelde cache. Fault-tolerant.
      const [legsResult, departments] = await Promise.all([
        shipmentIds.length > 0
          ? (supabase as any)
              .from("orders")
              .select("*")
              .in("shipment_id", shipmentIds)
              .order("leg_number", { ascending: true })
          : Promise.resolve({ data: [], error: null }),
        fetchDepartmentsCached(queryClient, tenant!.id).catch((e) => {
          console.warn("[useShipments] departments fetch failed:", e);
          return [] as Awaited<ReturnType<typeof fetchDepartmentsCached>>;
        }),
      ]);

      if (legsResult.error) throw legsResult.error;

      const deptCodeById: Record<string, string> = {};
      departments.forEach((d) => {
        deptCodeById[d.id] = d.code;
      });

      const legsByShipment: Record<string, Order[]> = {};
      (legsResult.data ?? []).forEach((row: any) => {
        const code = row.department_id ? deptCodeById[row.department_id] ?? null : null;
        const order = mapOrderRow(row, code);
        const sid = row.shipment_id as string;
        if (!legsByShipment[sid]) legsByShipment[sid] = [];
        legsByShipment[sid].push(order);
      });

      const shipments: Shipment[] = (shipmentsData ?? []).map((s: any) => ({
        id: s.id,
        tenant_id: s.tenant_id,
        shipment_number: s.shipment_number ?? null,
        client_id: s.client_id ?? null,
        client_name: s.client_name ?? null,
        origin_address: s.origin_address ?? null,
        destination_address: s.destination_address ?? null,
        status: s.status,
        traject_rule_id: s.traject_rule_id ?? null,
        created_at: s.created_at,
        updated_at: s.updated_at,
        legs: legsByShipment[s.id] ?? [],
      }));

      return { shipments, totalCount: count ?? 0 };
    },
  });
}

export function useShipment(id: string | null | undefined) {
  const { tenant } = useTenantOptional();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ["shipments", id, tenant?.id],
    staleTime: 5_000,
    enabled: !!id && !!tenant?.id,
    queryFn: async () => {
      const { data: shipment, error } = await (supabase as any)
        .from("shipments")
        .select("*")
        .eq("id", id!)
        .single();

      if (error) throw error;
      if (!shipment) return null;

      const [legsResult, departments] = await Promise.all([
        (supabase as any)
          .from("orders")
          .select("*")
          .eq("shipment_id", shipment.id)
          .order("leg_number", { ascending: true }),
        fetchDepartmentsCached(queryClient, tenant!.id).catch((e) => {
          console.warn("[useShipment] departments fetch failed:", e);
          return [] as Awaited<ReturnType<typeof fetchDepartmentsCached>>;
        }),
      ]);

      if (legsResult.error) throw legsResult.error;

      const deptCodeById: Record<string, string> = {};
      departments.forEach((d) => {
        deptCodeById[d.id] = d.code;
      });

      const legs: Order[] = (legsResult.data ?? []).map((row: any) => {
        const code = row.department_id ? deptCodeById[row.department_id] ?? null : null;
        return mapOrderRow(row, code);
      });

      const result: Shipment = {
        id: shipment.id,
        tenant_id: shipment.tenant_id,
        shipment_number: shipment.shipment_number ?? null,
        client_id: shipment.client_id ?? null,
        client_name: shipment.client_name ?? null,
        origin_address: shipment.origin_address ?? null,
        destination_address: shipment.destination_address ?? null,
        status: shipment.status,
        traject_rule_id: shipment.traject_rule_id ?? null,
        created_at: shipment.created_at,
        updated_at: shipment.updated_at,
        legs,
      };

      return result;
    },
  });
}
