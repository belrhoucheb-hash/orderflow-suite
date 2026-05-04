import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Order } from "@/data/mockData";
// Geen frontend logAudit meer voor orders: de server-trigger `audit_orders`
// (baseline.sql regel 3505) schrijft bij elke INSERT/UPDATE/DELETE op orders
// al een rij in audit_log. Dubbel schrijven vanuit de client is puur
// performance-verlies zonder extra informatie.
import { emitEventDirect } from "@/hooks/useEventPipeline";
import type { EventType } from "@/types/events";
import { useTenantOptional } from "@/contexts/TenantContext";
import { fetchDepartmentsCached } from "@/hooks/useDepartments";

// ─── 8.11 Order Status State Machine ─────────────────────────────────
// Extracted to @/lib/statusTransitions as a pure function (no Supabase dep).
// Re-exported here for backwards compatibility.
// ──────────────────────────────────────────────────────────────────────
export { isValidStatusTransition, VALID_TRANSITIONS } from "@/lib/statusTransitions";
export type { OrderStatus } from "@/lib/statusTransitions";
import { VALID_TRANSITIONS } from "@/lib/statusTransitions";
import type { OrderStatus } from "@/lib/statusTransitions";

import { normalizeStatus } from "@/lib/orderDisplay";

function addressToDisplay(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return "";

  const record = value as Record<string, unknown>;
  if (typeof record.display === "string" && record.display.trim()) {
    return record.display.trim();
  }

  return [
    [record.street, record.house_number, record.house_number_suffix].filter((part) => typeof part === "string" && part.trim()).join(" "),
    [record.zipcode, record.city].filter((part) => typeof part === "string" && part.trim()).join(" "),
    typeof record.country === "string" ? record.country : "",
  ]
    .filter((part) => part.trim())
    .join(", ")
    .trim();
}

export type OrderListSortField = "customer" | "totalWeight" | "status" | "createdAt";
export type OrderListSortDirection = "asc" | "desc";

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
  sortField?: OrderListSortField;
  sortDirection?: OrderListSortDirection;
  /**
   * Optional upper-bound on created_at as ISO-string. Orders met een
   * created_at < deze waarde blijven over. Gebruikt voor de "DRAFT > 2u"
   * snelfilter vanuit de KPI-strip.
   */
  createdBefore?: string;
  /**
   * Telwijze voor het totaal. Default "estimated" (planner-estimate, O(1),
   * geen scan) zodat de orderlijst bij miljoenen rijen niet elke pageload
   * een seq scan triggert. Zet op "exact" alleen voor plekken waar het
   * precieze aantal functioneel nodig is (bv. export-bevestiging).
   */
  countMode?: "none" | "estimated" | "exact" | "planned";
  /**
   * Keyset-cursor voor de huidige sortering. Gebruik in combinatie met
   * `nextCursor` uit de vorige pagina voor stabiele O(log N) paginatie,
   * ook bij niet-standaard sorts via server-side RPC.
   */
  cursor?: OrderListCursor | null;
}

export interface OrderListCursor {
  sortField: OrderListSortField;
  sortDirection: OrderListSortDirection;
  sortValue: string | number;
  createdAt: string;
  id: string;
}

export interface OrdersListMeta {
  totalCount: number;
  staleDraftCount: number;
  staleDraftCutoffIso: string;
  byStatus: Record<string, number>;
  awaitingInfoCount: number;
  overdueInfoCount: number;
  priorityCount: number;
  totalWeightKg: number;
}

type OrderDraftRow = {
  id: string;
  status: string;
  payload: any;
  validation_result: any;
  created_at: string;
  updated_at: string;
  last_activity_at?: string | null;
};

// UI-veldnaam → DB-kolom. Beperkt tot wat de orderlijst kan tonen en
// waar een index op staat of te verwachten is; andere velden vallen
// terug op created_at (default).
const SORT_FIELD_TO_DB: Record<OrderListSortField, string> = {
  customer: "client_name",
  totalWeight: "weight_kg",
  status: "status",
  createdAt: "created_at",
};

const DB_FIELD_TO_SORT: Record<string, OrderListSortField> = {
  client_name: "customer",
  weight_kg: "totalWeight",
  status: "status",
  created_at: "createdAt",
};

// RFC4122 v1-v5 UUID validator (simple shape check)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function applyOrderListFilters(query: any, options: {
  statusFilter?: string;
  orderTypeFilter?: string;
  departmentFilter?: string;
  createdBefore?: string;
  search?: string;
}) {
  const { statusFilter, orderTypeFilter, departmentFilter, createdBefore, search } = options;

  if (statusFilter && statusFilter !== "alle") {
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

  if (createdBefore) {
    query = query.lt("created_at", createdBefore);
  }

  if (search) {
    const parts = [
      `client_name.ilike.%${search}%`,
      `pickup_address.ilike.%${search}%`,
      `delivery_address.ilike.%${search}%`,
    ];
    const numericFromFormatted = search
      .replace(/^rcs-/i, "")
      .replace(/^\d{4}-/, "")
      .replace(/^0+/, "");
    if (/^\d+$/.test(numericFromFormatted) && numericFromFormatted.length > 0) {
      const asNum = Number(numericFromFormatted);
      if (Number.isSafeInteger(asNum)) {
        parts.push(`order_number.eq.${asNum}`);
      }
    }
    query = query.or(parts.join(","));
  }

  return query;
}

function draftPayloadValue(draft: OrderDraftRow, key: string): any {
  return draft.payload?.form?.[key] ?? draft.payload?.orderDraft?.[key] ?? null;
}

function draftStopValue(draft: OrderDraftRow, activity: "Laden" | "Lossen", key: string): any {
  const line = Array.isArray(draft.payload?.form?.freightLines)
    ? draft.payload.form.freightLines.find((item: any) => item?.activiteit === activity)
    : null;
  if (line && key in line) return line[key];
  const stop = Array.isArray(draft.payload?.orderDraft?.stops)
    ? draft.payload.orderDraft.stops.find((item: any) => item?.type === (activity === "Laden" ? "pickup" : "delivery"))
    : null;
  return stop?.[key] ?? null;
}

function orderFromDraft(draft: OrderDraftRow): Order {
  const clientName = draftPayloadValue(draft, "clientName") || draft.payload?.orderDraft?.client?.name || "Concept zonder klant";
  const pickupAddress = addressToDisplay(draftStopValue(draft, "Laden", "locatie") || draftStopValue(draft, "Laden", "address"));
  const deliveryAddress = addressToDisplay(draftStopValue(draft, "Lossen", "locatie") || draftStopValue(draft, "Lossen", "address"));
  const cargoRows = Array.isArray(draft.payload?.form?.cargoRows) ? draft.payload.form.cargoRows : [];
  const totalWeight = cargoRows.reduce((sum: number, row: any) => sum + (Number(row?.gewicht) || 0), 0)
    || Number(draftPayloadValue(draft, "weightKg"))
    || Number(draft.payload?.orderDraft?.cargoTotals?.totalWeightKg)
    || 0;
  const blockers = Array.isArray(draft.validation_result?.blockers) ? draft.validation_result.blockers : [];

  return {
    id: `draft:${draft.id}`,
    sourceKind: "draft",
    draftId: draft.id,
    orderNumber: `CONCEPT-${draft.id.slice(0, 8).toUpperCase()}`,
    customer: clientName,
    clientId: draftPayloadValue(draft, "clientId"),
    email: "",
    phone: "",
    pickupAddress,
    deliveryAddress,
    status: "DRAFT",
    priority: "normaal",
    items: [],
    totalWeight,
    createdAt: draft.last_activity_at || draft.updated_at || draft.created_at,
    estimatedDelivery: draft.last_activity_at || draft.updated_at || draft.created_at,
    notes: blockers.length > 0 ? `${blockers.length} open punt${blockers.length === 1 ? "" : "en"}` : "Conceptorder",
    orderType: "ZENDING",
    infoStatus: blockers.length > 0 ? "AWAITING_INFO" : "COMPLETE",
    missingFields: blockers.map((blocker: any) => blocker?.key || blocker?.label).filter(Boolean),
  };
}

export function useOrders(options: UseOrdersOptions = {}) {
  const { page = 0, pageSize = 25, statusFilter, orderTypeFilter, search, departmentFilter, sortField, sortDirection, createdBefore, countMode = "estimated", cursor = null } = options;
  const queryClient = useQueryClient();
  const { tenant } = useTenantOptional();

  return useQuery({
    queryKey: ["orders", { page, pageSize, statusFilter, orderTypeFilter, search, departmentFilter, sortField, sortDirection, createdBefore, countMode, cursor, tenantId: tenant?.id }],
    staleTime: 30_000,
    queryFn: async () => {
      // Expliciete kolom-set: alleen wat Orders-lijst UI rendert. Scheelt payload
      // (geen pod_signature_url, pod_photos, cmr_*, attachments, anomalies, enz.)
      // en verlaagt RLS-check-kosten per rij.
      const LIST_COLUMNS = [
        "id",
        "created_at",
        "order_number",
        "client_id",
        "client_name",
        "source_email_from",
        "pickup_address",
        "delivery_address",
        "status",
        "priority",
        "weight_kg",
        "vehicle_id",
        "notes",
        "internal_note",
        "order_type",
        "parent_order_id",
        "department_id",
        "shipment_id",
        "leg_number",
        "leg_role",
        "info_status",
        "missing_fields",
        "time_window_end",
      ].join(",");

      const sortColumn = sortField ? SORT_FIELD_TO_DB[sortField] : "created_at";
      const sortAscending = sortDirection === "asc";
      const useNativeKeyset = sortColumn === "created_at" && !sortAscending;
      const countPromise =
        countMode === "none"
          ? Promise.resolve({ count: 0, error: null })
          : applyOrderListFilters(
              (supabase as any)
                .from("orders")
                .select("id", { count: countMode, head: true }),
              { statusFilter, orderTypeFilter, departmentFilter, createdBefore, search },
            );

      let ordersPromise: Promise<{ data: any[]; error: any; nextCursor: OrderListCursor | null }>;

      if (useNativeKeyset) {
        let query = applyOrderListFilters(
          (supabase as any)
            .from("orders")
            .select(LIST_COLUMNS)
            .order(sortColumn, { ascending: sortAscending, nullsFirst: false }),
          { statusFilter, orderTypeFilter, departmentFilter, createdBefore, search },
        );

        if (cursor) {
        // (created_at, id) < (cursor.createdAt, cursor.id) in DESC-volgorde.
        // PostgREST ondersteunt geen tuple-vergelijking, dus gesimuleerd via:
        //   created_at < cursor.createdAt
        //   OR (created_at = cursor.createdAt AND id < cursor.id)
          query = query
            .or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`)
            .order("id", { ascending: false })
            .limit(pageSize);
        } else {
          query = query.range(page * pageSize, (page + 1) * pageSize - 1);
        }

        ordersPromise = (async () => {
          const { data, error } = await query;
          const lastRow = data?.[data.length - 1];
          const nextCursor: OrderListCursor | null =
            lastRow && (data?.length ?? 0) >= pageSize
              ? {
                  sortField: "createdAt",
                  sortDirection: "desc",
                  sortValue: lastRow.created_at,
                  createdAt: lastRow.created_at,
                  id: lastRow.id,
                }
              : null;
          return { data: data ?? [], error, nextCursor };
        })();
      } else {
        const numericFromFormatted = search
          ? search.replace(/^rcs-/i, "").replace(/^\d{4}-/, "").replace(/^0+/, "")
          : "";
        const searchOrderNumber =
          /^\d+$/.test(numericFromFormatted) && numericFromFormatted.length > 0
            ? Number(numericFromFormatted)
            : null;

        ordersPromise = (async () => {
          const { data, error } = await (supabase.rpc as any)("orders_page_v1", {
            p_page_size: pageSize,
            p_status_filter: statusFilter && statusFilter !== "alle" ? statusFilter : null,
            p_order_type_filter: orderTypeFilter ?? null,
            p_department_filter: departmentFilter && UUID_RE.test(departmentFilter) ? departmentFilter : null,
            p_search: search ?? null,
            p_search_order_number: Number.isSafeInteger(searchOrderNumber) ? searchOrderNumber : null,
            p_created_before: createdBefore ?? null,
            p_sort_field: sortColumn,
            p_sort_direction: sortAscending ? "asc" : "desc",
            p_cursor_text: typeof cursor?.sortValue === "string" ? cursor.sortValue : null,
            p_cursor_numeric: typeof cursor?.sortValue === "number" ? cursor.sortValue : null,
            p_cursor_created_at: cursor?.createdAt ?? null,
            p_cursor_id: cursor?.id ?? null,
          });
          return {
            data: (data?.rows as any[]) ?? [],
            error,
            nextCursor: data?.next_cursor
              ? {
                  sortField: DB_FIELD_TO_SORT[(data.next_cursor as any).sortField] ?? (sortField ?? "createdAt"),
                  sortDirection: ((data.next_cursor as any).sortDirection === "asc" ? "asc" : "desc") as OrderListSortDirection,
                  sortValue: (data.next_cursor as any).sortValue as string | number,
                  createdAt: String((data.next_cursor as any).createdAt),
                  id: String((data.next_cursor as any).id),
                }
              : null,
          };
        })();
      }

      const [ordersResult, countResult, departments] = await Promise.all([
        ordersPromise,
        countPromise,
        tenant?.id
          ? fetchDepartmentsCached(queryClient, tenant.id).catch((e) => {
              console.warn("[useOrders] departments fetch failed, continuing without codes:", e);
              return [] as Awaited<ReturnType<typeof fetchDepartmentsCached>>;
            })
          : Promise.resolve([]),
      ]);

      const { data, error, nextCursor } = ordersResult;
      const { count, error: countError } = countResult;
      if (error) throw error;
      if (countError) throw countError;

      const shouldIncludeDrafts =
        !orderTypeFilter &&
        !departmentFilter &&
        !cursor &&
        (!statusFilter || statusFilter === "alle" || statusFilter === "DRAFT");
      const draftSearch = search?.trim().toLowerCase();
      const { data: draftRows, error: draftError, count: draftCount } = shouldIncludeDrafts
        ? await (supabase as any)
            .from("order_drafts")
            .select("id,status,payload,validation_result,created_at,updated_at,last_activity_at", { count: "planned" })
            .eq("status", "DRAFT")
            .is("committed_shipment_id", null)
            .is("archived_at", null)
            .order("last_activity_at", { ascending: false })
            .limit(pageSize)
        : { data: [], error: null, count: 0 };
      if (draftError) throw draftError;

      const deptCodeById: Record<string, string> = {};
      departments.forEach((d) => {
        deptCodeById[d.id] = d.code;
      });

      const orderRows = (data ?? []).map((o): Order => {
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
          clientId: (o as any).client_id ?? null,
          email: o.source_email_from || "",
          phone: "",
          pickupAddress: addressToDisplay(o.pickup_address),
          deliveryAddress: addressToDisplay(o.delivery_address),
          status: normalizeStatus(o.status),
          priority: (o.priority as Order["priority"]) || "normaal",
          items: [],
          totalWeight: o.weight_kg ?? 0,
          vehicle: o.vehicle_id ?? undefined,
          createdAt: o.created_at,
          estimatedDelivery,
          notes: (o.notes || o.internal_note || "").toString(),
          orderType: (o as any).order_type ?? "ZENDING",
          parentOrderId: o.parent_order_id ?? null,
          departmentId,
          departmentCode,
          shipmentId: (o as any).shipment_id ?? null,
          legNumber: (o as any).leg_number ?? null,
          legRole: (o as any).leg_role ?? null,
          infoStatus: ((o as any).info_status ?? null) as any,
          missingFields: ((o as any).missing_fields ?? null) as string[] | null,
        };
      });

      const draftOrders = ((draftRows ?? []) as OrderDraftRow[])
        .map(orderFromDraft)
        .filter((draft) => {
          if (createdBefore && draft.createdAt >= createdBefore) return false;
          if (!draftSearch) return true;
          return [
            draft.orderNumber,
            draft.customer,
            draft.pickupAddress,
            draft.deliveryAddress,
          ].some((value) => value.toLowerCase().includes(draftSearch));
        });

      const orders = [...draftOrders, ...orderRows]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, pageSize);

      return { orders, totalCount: (count ?? 0) + (draftCount ?? 0), nextCursor };
    },
  });
}

export function useOrdersListMeta(options: {
  statusFilter?: string;
  orderTypeFilter?: string;
  departmentFilter?: string;
  search?: string;
  createdBefore?: string;
  staleThresholdHours?: number;
} = {}) {
  const { statusFilter, orderTypeFilter, departmentFilter, search, createdBefore, staleThresholdHours = 2 } = options;
  const { tenant } = useTenantOptional();

  return useQuery({
    queryKey: ["orders", "list-meta", {
      statusFilter,
      orderTypeFilter,
      departmentFilter,
      search,
      createdBefore,
      staleThresholdHours,
      tenantId: tenant?.id,
    }],
    staleTime: 60_000,
    queryFn: async (): Promise<OrdersListMeta> => {
      const numericFromFormatted = search
        ? search.replace(/^rcs-/i, "").replace(/^\d{4}-/, "").replace(/^0+/, "")
        : "";
      const searchOrderNumber =
        /^\d+$/.test(numericFromFormatted) && numericFromFormatted.length > 0
          ? Number(numericFromFormatted)
          : null;
      const fallbackCutoff = new Date(Date.now() - staleThresholdHours * 60 * 60 * 1000).toISOString();
      const includeDraftMeta = !orderTypeFilter && !departmentFilter && (!statusFilter || statusFilter === "alle" || statusFilter === "DRAFT");
      const draftCountQuery = includeDraftMeta
        ? (supabase as any)
            .from("order_drafts")
            .select("id", { count: "planned", head: true })
            .eq("status", "DRAFT")
            .is("committed_shipment_id", null)
            .is("archived_at", null)
        : Promise.resolve({ count: 0, error: null });
      const staleDraftQuery = includeDraftMeta
        ? (supabase as any)
            .from("order_drafts")
            .select("id", { count: "planned", head: true })
            .eq("status", "DRAFT")
            .is("committed_shipment_id", null)
            .is("archived_at", null)
            .lt("last_activity_at", fallbackCutoff)
        : Promise.resolve({ count: 0, error: null });

      const [{ data, error }, draftCountResult, staleDraftResult] = await Promise.all([
        (supabase.rpc as any)("orders_list_meta_v1", {
          p_status_filter: statusFilter && statusFilter !== "alle" ? statusFilter : null,
          p_order_type_filter: orderTypeFilter ?? null,
          p_department_filter: departmentFilter && UUID_RE.test(departmentFilter) ? departmentFilter : null,
          p_search: search ?? null,
          p_search_order_number: Number.isSafeInteger(searchOrderNumber) ? searchOrderNumber : null,
          p_created_before: createdBefore ?? null,
          p_stale_threshold_hours: staleThresholdHours,
        }),
        draftCountQuery,
        staleDraftQuery,
      ]);
      if (draftCountResult.error) throw draftCountResult.error;
      if (staleDraftResult.error) throw staleDraftResult.error;
      const activeDraftCount = Number(draftCountResult.count ?? 0);
      const activeStaleDraftCount = Number(staleDraftResult.count ?? 0);

      if (!error) {
        const raw = data ?? {};
        const byStatus = { ...((raw.by_status ?? {}) as Record<string, number>) };
        byStatus.DRAFT = Number(byStatus.DRAFT ?? 0) + activeDraftCount;
        return {
          totalCount: Number(raw.total_count ?? 0) + activeDraftCount,
          staleDraftCount: Number(raw.stale_draft_count ?? 0) + activeStaleDraftCount,
          staleDraftCutoffIso: String(raw.stale_draft_cutoff_iso ?? fallbackCutoff),
          byStatus,
          awaitingInfoCount: Number(raw.awaiting_info_count ?? 0),
          overdueInfoCount: Number(raw.overdue_info_count ?? 0),
          priorityCount: Number(raw.priority_count ?? 0),
          totalWeightKg: Number(raw.total_weight_kg ?? 0),
        };
      }

      console.warn("[useOrdersListMeta] orders_list_meta_v1 unavailable, falling back to legacy counts:", error);
      const totalQuery = applyOrderListFilters(
        (supabase as any).from("orders").select("id", { count: "planned", head: true }),
        { statusFilter, orderTypeFilter, departmentFilter, createdBefore, search },
      );
      const staleQuery = (supabase as any)
        .from("orders")
        .select("id", { count: "planned", head: true })
        .eq("status", "DRAFT")
        .lt("created_at", fallbackCutoff);
      const [{ count: totalCount, error: totalError }, { count: staleDraftCount, error: staleError }] =
        await Promise.all([totalQuery, staleQuery]);
      if (totalError) throw totalError;
      if (staleError) throw staleError;

      return {
        totalCount: (totalCount ?? 0) + activeDraftCount,
        staleDraftCount: (staleDraftCount ?? 0) + activeStaleDraftCount,
        staleDraftCutoffIso: fallbackCutoff,
        byStatus: activeDraftCount > 0 ? { DRAFT: activeDraftCount } : {},
        awaitingInfoCount: 0,
        overdueInfoCount: 0,
        priorityCount: 0,
        totalWeightKg: 0,
      };
    },
  });
}

/**
 * Telt DRAFT-orders die langer dan 2 uur open staan, tenant-gescoped via RLS.
 * Gebruikt een aparte count-query (head: true) zodat de teller over de hele
 * tabel gaat en niet alleen binnen de huidige 25-rij-pagina. Voor deze
 * waarschuwingsbadge is een planner-estimate voldoende; dat voorkomt een dure
 * exact count scan bij grote tenants. Refresht elke 60s zodat nieuwe drafts
 * die de drempel passeren vanzelf in de strip verschijnen.
 */
export function useStaleDraftCount(thresholdHours: number = 2) {
  const { tenant } = useTenantOptional();
  return useQuery({
    queryKey: ["orders", "stale-draft-count", { thresholdHours, tenantId: tenant?.id }],
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const cutoffIso = new Date(Date.now() - thresholdHours * 60 * 60 * 1000).toISOString();
      const { count, error } = await supabase
        .from("orders")
        .select("id", { count: "planned", head: true })
        .eq("status", "DRAFT")
        .lt("created_at", cutoffIso);

      if (error) throw error;
      return { count: count ?? 0, cutoffIso };
    },
  });
}

export function useOrdersSubscription() {
  const queryClient = useQueryClient();
  const { tenant } = useTenantOptional();
  const tenantId = tenant?.id;

  useEffect(() => {
    if (!tenantId) return;

    // Debounce invalidatie: bij een burst aan events (bulk-insert, auto-status-
    // transitions) zou elke event anders een refetch van alle ["orders"]-queries
    // triggeren. 200ms window = 1 refetch per burst.
    let pending: ReturnType<typeof setTimeout> | null = null;
    const scheduleInvalidate = () => {
      if (pending) return;
      pending = setTimeout(() => {
        pending = null;
        queryClient.invalidateQueries({ queryKey: ["orders"] });
      }, 200);
    };

    const channel = supabase
      .channel(`orders:tenant:${tenantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `tenant_id=eq.${tenantId}`,
        },
        scheduleInvalidate
      )
      .subscribe();

    return () => {
      if (pending) clearTimeout(pending);
      supabase.removeChannel(channel);
    };
  }, [queryClient, tenantId]);
}

// Expliciete kolom-subset voor de single-order fetch. Spiegelt de velden die
// de `useOrder`-mapping hieronder nodig heeft; zware kolommen (pod_signature_url,
// pod_photos, cmr_*, attachments, anomalies, source_email_body, ...) blijven
// weg zodat de detail-payload klein blijft. Detail-specifieke kolommen zoals
// die in OrderDetail.tsx worden gelezen, horen in de eigen `order-detail`
// query die daar staat, niet hier.
const DETAIL_COLUMNS = [
  "id",
  "created_at",
  "order_number",
  "client_id",
  "client_name",
  "source_email_from",
  "pickup_address",
  "delivery_address",
  "status",
  "priority",
  "weight_kg",
  "vehicle_id",
  "internal_note",
  "parent_order_id",
  "department_id",
  "shipment_id",
  "leg_number",
  "leg_role",
  "info_status",
  "missing_fields",
  "time_window_end",
].join(",");

export function useOrder(id: string) {
  const queryClient = useQueryClient();
  const { tenant } = useTenantOptional();
  return useQuery({
    queryKey: ["orders", id],
    staleTime: 5_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(DETAIL_COLUMNS)
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

      // Resolve department code via gedeelde cache. Fault-tolerant.
      const departmentId = (data as any).department_id ?? null;
      let departmentCode: string | null = null;
      if (departmentId && tenant?.id) {
        try {
          const departments = await fetchDepartmentsCached(queryClient, tenant.id);
          departmentCode = departments.find((d) => d.id === departmentId)?.code ?? null;
        } catch (e) {
          console.warn("[useOrder] departments fetch failed:", e);
        }
      }

      return {
        id: data.id,
        orderNumber: `RCS-${new Date(data.created_at).getFullYear()}-${String(data.order_number).padStart(4, "0")}`,
        customer: data.client_name || "Onbekend",
        clientId: (data as any).client_id ?? null,
        email: data.source_email_from || "",
        phone: "",
        pickupAddress: addressToDisplay(data.pickup_address),
        deliveryAddress: addressToDisplay(data.delivery_address),
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
        infoStatus: ((data as any).info_status ?? null) as any,
        missingFields: ((data as any).missing_fields ?? null) as string[] | null,
      } as Order;
    },
    enabled: !!id,
  });
}

// Velden die bepalen of een order in een lijst-filter of sort thuishoort.
// Wijziging van één van deze → breed invalidaten. Andere velden (notes,
// internal_note, vehicle_id, enz.) raken de lijst-filters niet, dus die
// hoeven alleen de detail-cache te updaten.
const LIST_AFFECTING_FIELDS = new Set([
  "status",
  "priority",
  "client_id",
  "client_name",
  "order_type",
  "department_id",
  "weight_kg",
  "shipment_id",
  "parent_order_id",
  "info_status",
]);

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
    onSuccess: (data) => {
      // Seed de single-order cache met de vers ingevoerde rij zodat een
      // directe navigatie naar de detailpagina geen round-trip meer nodig
      // heeft. De lijst-queries moeten wel refetchen want de juiste plek
      // van de nieuwe rij hangt af van huidige filters/sort.
      if (data?.id) {
        queryClient.setQueryData(["orders", data.id], data);
      }
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      // Audit wordt door de server-trigger `audit_orders` geschreven.
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
    onMutate: async ({ id, updates }: { id: string; updates: any }) => {
      // Optimistic update: patch de detail-cache meteen, sla de vorige
      // waarde op zodat we bij error kunnen rollbacken.
      await queryClient.cancelQueries({ queryKey: ["orders", id] });
      const previous = queryClient.getQueryData<any>(["orders", id]);
      if (previous) {
        queryClient.setQueryData(["orders", id], { ...previous, ...updates });
      }
      return { previous };
    },
    onError: (_err, { id }, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(["orders", id], ctx.previous);
      }
    },
    onSuccess: (data, variables) => {
      // Detail-cache met het serverresultaat verversen (server-computed velden).
      // Lijst alleen invalidaten als de wijziging filters/sort kan raken —
      // scheelt een refetch-storm bij bulk-updates van notes of vehicle_id.
      if (data) {
        queryClient.setQueryData(["orders", variables.id], (prev: any) =>
          prev ? { ...prev, ...data } : data,
        );
      }
      const changedFields = Object.keys(variables.updates);
      const touchesList = changedFields.some((f) => LIST_AFFECTING_FIELDS.has(f));
      if (touchesList) {
        queryClient.invalidateQueries({ queryKey: ["orders"] });
      }

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
      // Audit wordt door de server-trigger `audit_orders` geschreven.
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
      return id;
    },
    onSuccess: (id) => {
      // Detail-cache opruimen zodat een nav naar /orders/:id niet eerst een
      // verwijderde rij uit de cache serveert. Daarna de lijst-queries
      // invalidaten zodat tellers en pagina's vernieuwen.
      queryClient.removeQueries({ queryKey: ["orders", id] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      // Audit wordt door de server-trigger `audit_orders` geschreven.
    },
  });
}
