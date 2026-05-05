import { useState, useMemo } from "react";
import { Package, Plus, Circle, Clock, Truck, Loader2, HelpCircle, Printer, ChevronLeft, ChevronRight, Upload, SlidersHorizontal, Download, X, Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toCsv, downloadCsv } from "@/lib/csv";
import { getStatusColor } from "@/lib/statusColors";
import { INFO_STATUS_LABEL, priorityDotColors } from "@/lib/orderDisplay";
import { useOrders, useOrdersListMeta, useDeleteOrder, useDeleteOrderDraft, type OrderListCursor } from "@/hooks/useOrders";
import { useDepartments } from "@/hooks/useDepartments";
import { useUnreadNoteOrderIds } from "@/hooks/useOrderNotesRead";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import SmartLabel from "@/components/orders/SmartLabel";
import { SortableHeader, type SortConfig } from "@/components/ui/SortableHeader";
import { SearchInput } from "@/components/ui/SearchInput";
import { PageHeader } from "@/components/ui/PageHeader";
import { KPIStrip, type KPIItem } from "@/components/ui/KPIStrip";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { InfoStatusBadge } from "@/components/orders/InfoStatusBadge";
import { IncompleteBadge } from "@/components/orders/IncompleteBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import type { OrderStatus } from "@/components/ui/StatusBadge";
import { BulkImportDialog } from "@/components/orders/BulkImportDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ORDER_TYPE_LABELS, type OrderType } from "@/types/packaging";
import { useColumnWidths } from "@/hooks/useColumnWidths";
import { formatDistanceToNow, format, differenceInDays, isValid } from "date-fns";
import { nl } from "date-fns/locale";

function formatOrderDate(value: string | null | undefined): { label: string; tooltip: string } {
  if (!value) return { label: "—", tooltip: "" };
  const date = new Date(value);
  if (!isValid(date)) return { label: "—", tooltip: "" };
  const tooltip = format(date, "dd MMMM yyyy 'om' HH:mm", { locale: nl });
  const label = Math.abs(differenceInDays(date, new Date())) > 7
    ? format(date, "dd MMM yyyy", { locale: nl })
    : formatDistanceToNow(date, { locale: nl, addSuffix: true });
  return { label, tooltip };
}

const filterOptions = ["alle", "DRAFT", "PENDING", "PLANNED", "IN_TRANSIT", "DELIVERED"] as const;

const isDraftOrder = (order: any) => order.sourceKind === "draft" || order.status === "DRAFT";

const getOrderNumberLabel = (order: any) => {
  if (!isDraftOrder(order)) return order.orderNumber;
  const draftReference = String(order.orderNumber || order.draftId || "")
    .replace(/^concept[-\s#]*/i, "")
    .trim();
  return draftReference ? `Concept #${draftReference}` : "Concept";
};

function exportOrders(orders: Array<any>, baseName: string): number {
  if (orders.length === 0) return 0;
  const headers = [
    "Ordernummer",
    "Status",
    "Klant",
    "Ophaaladres",
    "Afleveradres",
    "Aangemaakt",
    "Verwachte levering",
    "Gewicht (kg)",
    "Info-status",
  ];
  const rows = orders.map((o) => [
    o.orderNumber,
    o.status,
    o.customer,
    o.pickupAddress,
    o.deliveryAddress,
    o.createdAt ? new Date(o.createdAt).toLocaleString("nl-NL") : "",
    o.estimatedDelivery ? new Date(o.estimatedDelivery).toLocaleString("nl-NL") : "",
    o.totalWeight,
    o.infoStatus ? (INFO_STATUS_LABEL[o.infoStatus] ?? o.infoStatus) : "",
  ]);
  const csv = toCsv(headers, rows);
  const stamp = new Date().toISOString().slice(0, 10);
  return downloadCsv(`${baseName}-${stamp}.csv`, csv) ? orders.length : 0;
}

const Orders = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("alle");
  const [orderTypeFilter, setOrderTypeFilter] = useState<string>("alle");
  const [departmentFilter, setDepartmentFilter] = useState<string>("alle");
  const [infoFilter, setInfoFilter] = useState<"alle" | "open" | "overdue">("alle");
  const [staleDraftOnly, setStaleDraftOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(25);
  // Cursor-stack voor keyset-paginatie op de default-sort (createdAt DESC).
  // stack[i] is de cursor die page i+1 opent (dus length = huidige page in cursor-mode).
  // Bij non-default sort wordt deze stack genegeerd en valt de UI terug op `page`-offset.
  const [cursorStack, setCursorStack] = useState<OrderListCursor[]>([]);
  const [printOrder, setPrintOrder] = useState<any>(null);
  const [printLoading, setPrintLoading] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteSelectionOpen, setDeleteSelectionOpen] = useState(false);
  const deleteOrderMutation = useDeleteOrder();
  const deleteDraftMutation = useDeleteOrderDraft();

  const { attachRef: attachColWidthRef } = useColumnWidths("orderflow:orders:col-widths:v1");

  const clearSelection = () => setSelectedIds(new Set());

  const handleSort = (field: string) => {
    setSortConfig((prev) =>
      prev?.field === field
        ? { field, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { field, direction: "asc" }
    );
    // Sort-wissel = andere volgorde = cursor-stack is niet meer valide.
    setPage(0);
    setCursorStack([]);
  };

  // Reset zowel offset-page als cursor-stack bij elke filter-/sort-wisseling.
  const resetPagination = () => {
    setPage(0);
    setCursorStack([]);
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    resetPagination();
    clearSelection();
  };

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value);
    resetPagination();
    clearSelection();
  };

  const handleOrderTypeChange = (value: string) => {
    setOrderTypeFilter(value);
    resetPagination();
    clearSelection();
  };

  const handleDepartmentFilterChange = (value: string) => {
    setDepartmentFilter(value);
    resetPagination();
    clearSelection();
  };

  const { data: departments } = useDepartments?.() ?? { data: [] as Array<{ id: string; code: string; name: string; color: string | null }> };

  const selectedDepartmentId = useMemo(() => {
    if (departmentFilter === "alle") return undefined;
    return departments?.find((d) => d.code === departmentFilter)?.id;
  }, [departmentFilter, departments]);

  const staleDraftCutoffIso = useMemo(
    () => new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    [],
  );

  // De orderlijst gebruikt keyset-paginatie voor alle ondersteunde sorts.
  // Daardoor vermijden we offset-skips op grote tenants, ook bij klant/status/gewicht.
  const isCursorMode = true;
  const currentCursor = cursorStack[cursorStack.length - 1] ?? null;
  const displayedPage = cursorStack.length;

  const { data, isLoading, isError, refetch } = useOrders({
    page,
    pageSize,
    statusFilter: (statusFilter !== "alle") ? statusFilter : undefined,
    orderTypeFilter: (orderTypeFilter !== "alle") ? orderTypeFilter : undefined,
    departmentFilter: selectedDepartmentId,
    search: search || undefined,
    sortField: sortConfig?.field as ("customer" | "totalWeight" | "status" | "createdAt") | undefined,
    sortDirection: sortConfig?.direction,
    createdBefore: staleDraftOnly ? staleDraftCutoffIso : undefined,
    countMode: "none",
    cursor: currentCursor,
  } as any);
  const { data: meta } = useOrdersListMeta({
    statusFilter: (statusFilter !== "alle") ? statusFilter : undefined,
    orderTypeFilter: (orderTypeFilter !== "alle") ? orderTypeFilter : undefined,
    departmentFilter: selectedDepartmentId,
    search: search || undefined,
    createdBefore: staleDraftOnly ? staleDraftCutoffIso : undefined,
    staleThresholdHours: 2,
  });
  const rawOrders = useMemo(() => data?.orders ?? [], [data?.orders]);
  const visibleOrderIds = useMemo(() => rawOrders.filter((order) => !isDraftOrder(order)).map((order) => order.id), [rawOrders]);
  const { unreadOrderIds } = useUnreadNoteOrderIds(visibleOrderIds);
  const totalCount = meta?.totalCount ?? 0;
  const openOrderPath = (order: any) => isDraftOrder(order) && order.draftId
    ? `/orders/nieuw?draft_id=${order.draftId}`
    : `/orders/${order.id}`;

  const filteredByInfo = useMemo(() => {
    let list = rawOrders;
    if (infoFilter === "overdue") {
      list = list.filter(o => o.infoStatus === "OVERDUE");
    } else if (infoFilter === "open") {
      list = list.filter(o => o.infoStatus === "AWAITING_INFO" || o.infoStatus === "OVERDUE");
    }
    // staleDraftOnly wordt server-side als createdBefore-filter doorgegeven
    // aan useOrders, dus geen client-side resort nodig.
    return list;
  }, [rawOrders, infoFilter]);

  // Sorteren gebeurt server-side in useOrders; hier hoeven we alleen de
  // info- en stale-filter toe te passen. Client-side resort was vroeger
  // misleidend omdat het alleen binnen de huidige 25-pagina werkte.
  const orders = filteredByInfo;
  const selectedOrders = useMemo(() => orders.filter((order) => selectedIds.has(order.id)), [orders, selectedIds]);
  const selectedRegularOrders = useMemo(
    () => selectedOrders.filter((order) => !isDraftOrder(order)),
    [selectedOrders],
  );
  const selectedDraftOrders = useMemo(
    () => selectedOrders.filter((order) => isDraftOrder(order) && order.draftId),
    [selectedOrders],
  );
  const selectedDeleteCount = selectedRegularOrders.length + selectedDraftOrders.length;
  const deleteSelectionPending = deleteOrderMutation.isPending || deleteDraftMutation.isPending;

  const handleDeleteSelectedOrders = async () => {
    if (selectedDeleteCount === 0) {
      toast.info("Geen verwijderbare selectie", {
        description: "Selecteer een order of concept om te verwijderen.",
      });
      setDeleteSelectionOpen(false);
      return;
    }

    try {
      for (const order of selectedRegularOrders) {
        await deleteOrderMutation.mutateAsync(order.id);
      }
      for (const order of selectedDraftOrders) {
        await deleteDraftMutation.mutateAsync(order.draftId);
      }
      toast.success("Selectie verwijderd", {
        description: [
          selectedRegularOrders.length > 0 ? `${selectedRegularOrders.length} ${selectedRegularOrders.length === 1 ? "order" : "orders"}` : null,
          selectedDraftOrders.length > 0 ? `${selectedDraftOrders.length} ${selectedDraftOrders.length === 1 ? "concept" : "concepten"}` : null,
        ].filter(Boolean).join(" en ") + " verwijderd.",
      });
      clearSelection();
      setDeleteSelectionOpen(false);
    } catch (error) {
      toast.error("Verwijderen mislukt", {
        description: error instanceof Error ? error.message : "Probeer opnieuw.",
      });
    }
  };

  const handleQuickPrint = async (orderId: string) => {
    setPrintLoading(orderId);
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .single();
      if (error) throw error;
      setPrintOrder(data);
      setTimeout(() => {
        window.print();
        setPrintOrder(null);
        setPrintLoading(null);
      }, 200);
    } catch {
      setPrintLoading(null);
    }
  };

  const stats = useMemo(() => {
    const pageByStatus = orders.reduce((acc, o) => {
      acc[o.status] = (acc[o.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const byStatus = Object.keys(meta?.byStatus ?? {}).length ? meta!.byStatus : pageByStatus;
    const totalWeight = meta?.totalWeightKg ?? orders.reduce((s, o) => s + o.totalWeight, 0);
    const spoedCount = meta?.priorityCount ?? orders.filter((o) => o.priority === "spoed" || o.priority === "hoog").length;
    // Info-teller blijft absoluut (vanuit rawOrders), zodat het cijfer
    // niet leegvalt zodra de gebruiker het eigen filter activeert. De
    // stale-draft-teller komt uit de tenant-gescoped count-query en gaat
    // dus over de hele tabel, niet alleen de huidige pagina.
    const awaitingInfoCount = meta?.awaitingInfoCount ?? rawOrders.filter(
      (o) => o.infoStatus === "AWAITING_INFO" || o.infoStatus === "OVERDUE",
    ).length;
    const staleDraftCount = meta?.staleDraftCount ?? 0;
    return { byStatus, totalWeight, spoedCount, awaitingInfoCount, staleDraftCount };
  }, [orders, rawOrders, meta]);

  if (isLoading) {
    return (
      <div className="page-container" aria-busy="true" aria-label="Orders laden">
        {/* Page-header skeleton — eyebrow + titel */}
        <div className="relative pb-3 pt-2">
          <div className="flex items-end justify-between gap-5 flex-wrap">
            <div className="flex-1 min-w-0 space-y-3">
              <div className="skeleton-luxe" style={{ width: 140, height: 10 }} />
              <div className="skeleton-luxe" style={{ width: 280, height: 28 }} />
            </div>
            <div className="flex items-center gap-2">
              <div className="skeleton-luxe" style={{ width: 110, height: 36, borderRadius: "0.5rem" }} />
              <div className="skeleton-luxe" style={{ width: 130, height: 36, borderRadius: "0.5rem" }} />
            </div>
          </div>
        </div>

        {/* KPI-strip skeleton — hero links + 4 ticker cells rechts */}
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-3 mt-4">
          <div className="skeleton-luxe" style={{ height: 110, borderRadius: "1rem" }} />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton-luxe" style={{ height: 110, borderRadius: "1rem" }} />
            ))}
          </div>
        </div>

        {/* Filter-rij skeleton — search + filter-icoon */}
        <div className="flex items-center gap-3 mt-6">
          <div className="skeleton-luxe flex-1" style={{ height: 38, borderRadius: "0.5rem", maxWidth: 360 }} />
          <div className="ml-auto skeleton-luxe" style={{ width: 38, height: 38, borderRadius: "0.5rem" }} />
        </div>

        {/* Tabel skeleton — 8 rijen met kolom-skeletons */}
        <div className="mt-4 rounded-xl border border-border/40 overflow-hidden" style={{ background: "hsl(var(--card))" }}>
          <div className="grid grid-cols-[100px_140px_180px_180px_60px_100px_80px_70px_28px] gap-4 px-4 py-3 border-b border-border/40">
            {[100, 140, 180, 180, 60, 100, 80, 70, 28].map((w, i) => (
              <div key={i} className="skeleton-luxe" style={{ width: w, height: 10 }} />
            ))}
          </div>
          {Array.from({ length: 8 }).map((_, r) => (
            <div
              key={r}
              className="grid grid-cols-[100px_140px_180px_180px_60px_100px_80px_70px_28px] gap-4 px-4 py-4 border-b border-border/30 last:border-b-0 items-center"
            >
              <div className="skeleton-luxe" style={{ width: 100, height: 14 }} />
              <div className="skeleton-luxe" style={{ width: 140, height: 14 }} />
              <div className="skeleton-luxe" style={{ width: 180, height: 14 }} />
              <div className="skeleton-luxe" style={{ width: 180, height: 14 }} />
              <div className="skeleton-luxe" style={{ width: 60, height: 14 }} />
              <div className="skeleton-luxe" style={{ width: 100, height: 22, borderRadius: "999px" }} />
              <div className="skeleton-luxe" style={{ width: 80, height: 14 }} />
              <div className="skeleton-luxe" style={{ width: 70, height: 14 }} />
              <div className="skeleton-luxe" style={{ width: 28, height: 28, borderRadius: "0.5rem" }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        title="Kan orders niet laden"
        description="Controleer je verbinding en probeer opnieuw."
        action={
          <button onClick={() => refetch()} className="text-xs text-primary hover:underline">
            Opnieuw proberen
          </button>
        }
      />
    );
  }

  return (
    <div className="page-container">
      {/* Luxe page header — editorial 2026 stijl, matcht OrderDetail */}
      <PageHeader
        eyebrow="Operatie"
        meta={`${totalCount} ${totalCount === 1 ? "order" : "orders"}`}
        title="Orders"
        actions={
          <>
            <button
              className="btn-luxe"
              onClick={() => {
                const exportedCount = exportOrders(orders, "orders");
                if (exportedCount > 0) {
                  toast.success("Export gestart", {
                    description: `${exportedCount} ${exportedCount === 1 ? "order" : "orders"} als CSV.`,
                  });
                } else {
                  toast.info("Geen orders om te exporteren");
                }
              }}
              disabled={orders.length === 0}
              title={`Exporteer de ${orders.length} zichtbare ${orders.length === 1 ? "order" : "orders"} als CSV`}
            >
              <Download className="h-4 w-4" /> Export
            </button>
            <button className="btn-luxe" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" /> Import
            </button>
            <button className="btn-luxe btn-luxe--primary" onClick={() => navigate("/orders/nieuw")}>
              <Plus className="h-4 w-4" /> Nieuwe order
            </button>
          </>
        }
      />

      {/* Luxe KPI — asymmetrische hero + ticker strip */}
      <div
        className="relative rounded-xl border border-[hsl(var(--gold)/0.18)] overflow-hidden grid grid-cols-1 lg:grid-cols-[260px_1fr]"
        style={{
          background: "linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--gold-soft)/0.18) 100%)",
          boxShadow: "inset 0 1px 0 var(--inset-highlight), 0 1px 2px hsl(var(--ink)/0.04), 0 12px 32px -16px hsl(var(--ink)/0.1)",
          fontFamily: "var(--font-display)",
        }}
      >
        {/* Gold top accent */}
        <span
          aria-hidden
          className="absolute top-0 left-0 right-0 h-px"
          style={{ background: "linear-gradient(90deg, transparent, hsl(var(--gold)/0.45) 50%, transparent)" }}
        />

        {/* Hero, actief onderweg, klikbaar als snelfilter op IN_TRANSIT */}
        <button
          type="button"
          onClick={() => { handleStatusFilterChange(statusFilter === "IN_TRANSIT" ? "alle" : "IN_TRANSIT"); }}
          aria-pressed={statusFilter === "IN_TRANSIT"}
          aria-busy={isLoading}
          disabled={isLoading}
          className={cn(
            "relative px-7 py-7 lg:border-r border-b lg:border-b-0 border-[hsl(var(--gold)/0.18)] text-left transition-colors",
            "hover:bg-[hsl(var(--gold-soft)/0.35)] focus:outline-none focus-visible:bg-[hsl(var(--gold-soft)/0.5)]",
            "disabled:cursor-wait disabled:opacity-60",
            statusFilter === "IN_TRANSIT" && "bg-[hsl(var(--gold-soft)/0.55)]",
          )}
        >
          <div className="flex items-center gap-2 mb-2">
            <span aria-hidden className="inline-block h-[1px] w-5" style={{ background: "hsl(var(--gold)/0.5)" }} />
            <span className="text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--gold-deep))] font-semibold">
              Operationeel
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[3.75rem] leading-none font-semibold tabular-nums tracking-tight text-foreground">
              {(stats.byStatus["IN_TRANSIT"] || 0) + (stats.byStatus["PLANNED"] || 0)}
            </span>
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60">
              dossiers
            </span>
          </div>
          <div className="mt-3 text-[12px] text-foreground/70">
            Onderweg of ingepland, live tracking actief
          </div>
        </button>

        {/* Ticker, operationele statussen als snelfilter */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 divide-x divide-[hsl(var(--gold)/0.12)]">
          {([
            { label: "In behandeling", value: stats.byStatus["PENDING"] || 0,  note: "Open dossier",  filter: "PENDING" as const,  kind: "status" as const },
            { label: "Wacht op info",  value: stats.awaitingInfoCount,         note: "Dossier incompleet", filter: "open" as const, kind: "info" as const },
            { label: "Afgeleverd",     value: stats.byStatus["DELIVERED"] || 0, note: "POD ontvangen", filter: "DELIVERED" as const, kind: "status" as const },
            { label: "Met prioriteit", value: stats.spoedCount,                 note: "Spoed of hoog", filter: null,                kind: "status" as const },
          ] as const).map((s) => {
            const active =
              s.kind === "info"
                ? infoFilter === s.filter
                : s.kind === "stale"
                  ? staleDraftOnly
                  : s.filter !== null && statusFilter === s.filter;
            const isClickable = s.filter !== null;
            const Cmp: any = isClickable ? "button" : "div";
            const onClickFilter = () => {
              if (s.kind === "info") {
                setInfoFilter(active ? "alle" : (s.filter as "open"));
                setStatusFilter("alle");
                setOrderTypeFilter("alle");
                setStaleDraftOnly(false);
                setPage(0);
                clearSelection();
              } else if (s.kind === "stale") {
                const next = !active;
                setStaleDraftOnly(next);
                if (next) {
                  // DRAFT > 2u: status op DRAFT + server-side createdBefore
                  // wordt via staleDraft.cutoffIso gezet in useOrders.
                  setStatusFilter("DRAFT");
                  setOrderTypeFilter("alle");
                  setInfoFilter("alle");
                } else {
                  // Uitzetten betekent volledige DRAFT-lijst tonen (zonder
                  // created_at-cutoff), statusFilter laten staan zodat de
                  // context niet verspringt.
                }
                setPage(0);
                clearSelection();
              } else {
                setStaleDraftOnly(false);
                handleStatusFilterChange(active ? "alle" : (s.filter as string));
              }
            };
            const props = isClickable
              ? { type: "button" as const, onClick: onClickFilter, "aria-pressed": active, "aria-busy": isLoading, disabled: isLoading }
              : {};
            return (
              <Cmp
                key={s.label}
                {...props}
                className={cn(
                  "px-5 py-5 sm:px-6 sm:py-6 flex flex-col text-left transition-colors",
                  s.filter && "hover:bg-[hsl(var(--gold-soft)/0.35)] focus:outline-none focus-visible:bg-[hsl(var(--gold-soft)/0.5)]",
                  s.filter && "disabled:cursor-wait disabled:opacity-60",
                  active && "bg-[hsl(var(--gold-soft)/0.55)]",
                )}
              >
                <div className="text-[9px] uppercase tracking-[0.24em] text-muted-foreground/70 font-semibold mb-2">
                  {s.label}
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[1.75rem] leading-none font-semibold tabular-nums tracking-tight text-foreground">
                    {s.value}
                  </span>
                  <span
                    aria-hidden
                    className="ml-auto h-px w-6"
                    style={{ background: `linear-gradient(90deg, hsl(var(--gold)/0.5), transparent)` }}
                  />
                </div>
                <div className="mt-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground/60">
                  {s.note}
                </div>
              </Cmp>
            );
          })}
        </div>

        {/* Concepten — visueel lichter, dataschoonmaak ipv operatie-KPI */}
        {((stats.byStatus["DRAFT"] || 0) > 0 || stats.staleDraftCount > 0) && (
          <div className="border-t border-[hsl(var(--gold)/0.18)] bg-[hsl(var(--muted)/0.4)] px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="text-[9px] uppercase tracking-[0.24em] text-muted-foreground/70 font-semibold">
              Concepten
            </div>
            {([
              { label: "Nog niet compleet", value: stats.byStatus["DRAFT"] || 0, filter: "DRAFT" as const, kind: "status" as const },
              { label: "Ouder dan 2 uur",   value: stats.staleDraftCount,        filter: "stale" as const, kind: "stale" as const },
            ] as const).map((s) => {
              const active =
                s.kind === "stale"
                  ? staleDraftOnly
                  : statusFilter === s.filter && !staleDraftOnly;
              const onClickFilter = () => {
                if (s.kind === "stale") {
                  const next = !active;
                  setStaleDraftOnly(next);
                  if (next) {
                    setStatusFilter("DRAFT");
                    setOrderTypeFilter("alle");
                    setInfoFilter("alle");
                  }
                  setPage(0);
                  clearSelection();
                } else {
                  setStaleDraftOnly(false);
                  handleStatusFilterChange(active ? "alle" : (s.filter as string));
                }
              };
              return (
                <button
                  key={s.label}
                  type="button"
                  onClick={onClickFilter}
                  aria-pressed={active}
                  disabled={isLoading}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] transition-colors",
                    "hover:bg-[hsl(var(--gold-soft)/0.4)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--gold)/0.4)]",
                    active && "bg-[hsl(var(--gold-soft)/0.6)]",
                    "disabled:cursor-wait disabled:opacity-60",
                  )}
                >
                  <span className="tabular-nums font-semibold text-foreground">{s.value}</span>
                  <span className="text-muted-foreground">{s.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Search & Filters — clean, minimalist */}
      <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
        <SearchInput
          value={search}
          onChange={handleSearchChange}
          placeholder="Zoek op ordernummer (bijv. RCS-2026-0001), klant of adres..."
          className="flex-1 min-w-0 sm:max-w-md"
        />
        <div className="flex items-center gap-2 flex-wrap">
          {/* Gecombineerde filter: status + type in één dropdown.
              Encoded value-prefix onderscheidt de twee dimensies. */}
          <Select
            value={
              statusFilter !== "alle"
                ? `status:${statusFilter}`
                : orderTypeFilter !== "alle"
                ? `type:${orderTypeFilter}`
                : infoFilter !== "alle"
                ? `info:${infoFilter}`
                : "alle"
            }
            onValueChange={(v) => {
              if (v === "alle") {
                setStatusFilter("alle");
                setOrderTypeFilter("alle");
                setInfoFilter("alle");
              } else if (v.startsWith("status:")) {
                setStatusFilter(v.slice(7));
                setOrderTypeFilter("alle");
                setInfoFilter("alle");
              } else if (v.startsWith("type:")) {
                setOrderTypeFilter(v.slice(5));
                setStatusFilter("alle");
                setInfoFilter("alle");
              } else if (v.startsWith("info:")) {
                setInfoFilter(v.slice(5) as "alle" | "open" | "overdue");
                setStatusFilter("alle");
                setOrderTypeFilter("alle");
              }
              setPage(0);
              clearSelection();
            }}
          >
            <SelectTrigger
              aria-label="Filters"
              title="Filters"
              className="relative h-10 w-10 p-0 justify-center border-transparent bg-transparent text-muted-foreground/70 hover:text-[hsl(var(--gold-deep))] focus:outline-none focus-visible:text-[hsl(var(--gold-deep))] data-[state=open]:text-[hsl(var(--gold-deep))] transition-colors shadow-none overflow-hidden [&>span[data-radix-select-value]]:hidden [&>span:not([data-keep])]:hidden [&>svg:last-child]:hidden"
            >
              <SlidersHorizontal className="h-5 w-5" />
              <SelectValue />
              {(statusFilter !== "alle" || orderTypeFilter !== "alle" || infoFilter !== "alle") && (
                <span
                  data-keep
                  aria-hidden
                  className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full"
                  style={{ background: "hsl(var(--gold-deep))" }}
                />
              )}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle" style={{ fontSize: "var(--text-small)" }}>Alle orders</SelectItem>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel
                  style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-caption)" }}
                  className="uppercase tracking-[0.16em] text-[hsl(var(--gold-deep))] font-semibold select-none"
                >
                  Status
                </SelectLabel>
                {filterOptions.filter(s => s !== "alle").map((s) => (
                  <SelectItem key={`status:${s}`} value={`status:${s}`} style={{ fontSize: "var(--text-small)" }}>
                    {getStatusColor(s).label}
                  </SelectItem>
                ))}
              </SelectGroup>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel
                  style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-caption)" }}
                  className="uppercase tracking-[0.16em] text-[hsl(var(--gold-deep))] font-semibold select-none"
                >
                  Type
                </SelectLabel>
                {["ZENDING", "RETOUR", "EMBALLAGE_RUIL"].map((t) => (
                  <SelectItem key={`type:${t}`} value={`type:${t}`} style={{ fontSize: "var(--text-small)" }}>
                    {ORDER_TYPE_LABELS[t]?.label ?? t}
                  </SelectItem>
                ))}
              </SelectGroup>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel
                  style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-caption)" }}
                  className="uppercase tracking-[0.16em] text-[hsl(var(--gold-deep))] font-semibold select-none"
                >
                  Informatie
                </SelectLabel>
                <SelectItem value="info:open" style={{ fontSize: "var(--text-small)" }}>Informatie open</SelectItem>
                <SelectItem value="info:overdue" style={{ fontSize: "var(--text-small)" }}>Informatie verlopen</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>

          <Select value={departmentFilter} onValueChange={handleDepartmentFilterChange}>
            <SelectTrigger
              aria-label="Afdeling"
              className="h-9 w-[160px] text-sm"
              style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-small)" }}
            >
              <SelectValue placeholder="Alle afdelingen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle" style={{ fontSize: "var(--text-small)" }}>Alle afdelingen</SelectItem>
              <SelectSeparator />
              <SelectItem value="OPS" style={{ fontSize: "var(--text-small)" }}>Operations</SelectItem>
              <SelectItem value="EXPORT" style={{ fontSize: "var(--text-small)" }}>Export</SelectItem>
              <SelectItem value="IMPORT" style={{ fontSize: "var(--text-small)" }}>Import</SelectItem>
            </SelectContent>
          </Select>

          {(statusFilter !== "alle" || infoFilter !== "alle" || orderTypeFilter !== "alle" || departmentFilter !== "alle" || staleDraftOnly) && (
            <button
              onClick={() => {
                setStatusFilter("alle");
                setInfoFilter("alle");
                setOrderTypeFilter("alle");
                setDepartmentFilter("alle");
                setStaleDraftOnly(false);
                setPage(0);
                clearSelection();
              }}
              style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-caption)" }}
              className="uppercase tracking-[0.14em] text-muted-foreground/70 hover:text-[hsl(var(--gold-deep))] transition-colors px-1"
            >
              Wissen
            </button>
          )}
        </div>
      </div>

      {/* Bulk-actiebalk — zichtbaar bij selectie */}
      {selectedIds.size > 0 && (
        <div
          className="flex items-center justify-between gap-3 rounded-xl border border-[hsl(var(--gold)/0.35)] px-4 py-2.5"
          style={{
            background: "linear-gradient(135deg, hsl(var(--gold-soft)/0.5), hsl(var(--gold-soft)/0.2))",
            fontFamily: "var(--font-display)",
          }}
        >
          <div className="flex items-center gap-2 text-[12px] uppercase tracking-[0.16em] text-[hsl(var(--gold-deep))] font-semibold tabular-nums">
            <span>{selectedIds.size}</span>
            <span className="text-muted-foreground/70">
              {selectedIds.size === 1 ? "order geselecteerd" : "orders geselecteerd"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="btn-luxe"
              onClick={() => {
                const exportedCount = exportOrders(orders.filter((o) => selectedIds.has(o.id)), "orders-selectie");
                toast.success("Selectie-export gestart", {
                  description: `${exportedCount} ${exportedCount === 1 ? "order" : "orders"} als CSV.`,
                });
              }}
            >
              <Download className="h-4 w-4" /> Exporteer selectie
            </button>
            <button
              className="btn-luxe text-destructive hover:text-destructive"
              onClick={() => setDeleteSelectionOpen(true)}
              disabled={deleteSelectionPending}
              title="Geselecteerde orders verwijderen"
            >
              {deleteSelectionPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Verwijder selectie
            </button>
            <button
              onClick={clearSelection}
              className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.14em] text-muted-foreground/70 hover:text-[hsl(var(--gold-deep))] transition-colors px-2"
              title="Selectie wissen"
            >
              <X className="h-3.5 w-3.5" /> Wissen
            </button>
          </div>
        </div>
      )}

      {/* Table Card — luxe met gold top-line */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="card--luxe overflow-hidden"
      >
        <div className="divide-y divide-[hsl(var(--gold)/0.1)] md:hidden">
          <AnimatePresence mode="popLayout">
            {orders.map((order) => {
              const { label, tooltip } = formatOrderDate(order.createdAt);
              return (
                <motion.div
                  key={order.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className={cn(
                    "px-4 py-3.5",
                    isDraftOrder(order) && "bg-[hsl(var(--gold-soft)/0.36)]",
                    unreadOrderIds.has(order.id) && "shadow-[inset_2px_0_0_0_#3b82f6]",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      aria-label={`Selecteer ${order.orderNumber}`}
                      className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-[hsl(var(--gold-deep))]"
                      checked={selectedIds.has(order.id)}
                      onChange={(e) => {
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(order.id);
                          else next.delete(order.id);
                          return next;
                        });
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => navigate(openOrderPath(order))}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <IncompleteBadge order={order} size="dot" />
                            <span className={cn(
                              "truncate text-sm font-semibold tabular-nums",
                              isDraftOrder(order) ? "text-[hsl(var(--gold-deep))]" : "text-foreground",
                            )}>
                              {getOrderNumberLabel(order)}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-xs font-medium text-foreground/82">{order.customer}</p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">{order.deliveryAddress}</p>
                        </div>
                        <StatusBadge status={order.status as OrderStatus} variant="luxe" />
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="rounded-md border border-[hsl(var(--gold)/0.16)] px-2 py-0.5 tabular-nums text-foreground">
                          {order.totalWeight.toLocaleString()} kg
                        </span>
                        <span title={tooltip}>{label}</span>
                        <span className="inline-flex items-center gap-1 uppercase tracking-[0.12em]">
                          <Circle className={cn("h-1.5 w-1.5 fill-current", priorityDotColors[order.priority])} strokeWidth={0} />
                          {order.priority}
                        </span>
                        <InfoStatusBadge status={order.infoStatus} size="sm" iconOnly />
                      </div>
                    </button>
                    <div className="flex shrink-0 flex-col gap-1">
                      {isDraftOrder(order) ? (
                        <button
                          onClick={() => navigate(openOrderPath(order))}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[hsl(var(--gold)/0.14)] text-muted-foreground"
                          title="Concept openen"
                          aria-label={`Open concept ${order.orderNumber}`}
                        >
                          <Clock className="h-4 w-4" />
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => navigate(`/orders/nieuw?from_order_id=${order.id}`)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[hsl(var(--gold)/0.14)] text-muted-foreground"
                            title="Dupliceer order"
                            aria-label={`Dupliceer order ${order.orderNumber}`}
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleQuickPrint(order.id)}
                            disabled={printLoading === order.id}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[hsl(var(--gold)/0.14)] text-muted-foreground disabled:opacity-50"
                            title="Print label"
                            aria-label={`Print label voor order ${order.orderNumber}`}
                          >
                            {printLoading === order.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
          {orders.length === 0 && (
            <EmptyState
              icon={Package}
              title="Geen orders gevonden"
              description="Pas je filters aan of maak een nieuwe order aan."
            />
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="data-table">
            <thead className="th-resize">
              <tr
                className="border-b border-[hsl(var(--gold)/0.2)] [&>th]:!font-display [&>th]:!text-[12px] [&>th]:!uppercase [&>th]:!tracking-[0.16em] [&>th]:!text-[hsl(var(--gold-deep))] [&>th]:!font-semibold [&>th]:!py-3.5 [&>th]:!px-5 [&_button]:!font-display [&_button]:!text-[12px] [&_button]:!uppercase [&_button]:!tracking-[0.16em] [&_button]:!text-[hsl(var(--gold-deep))] [&_button]:!font-semibold"
                style={{ background: "linear-gradient(180deg, hsl(var(--gold-soft)/0.4), hsl(var(--gold-soft)/0.15))" }}
              >
                <th className="table-header w-10 pl-4">
                  <input
                    type="checkbox"
                    aria-label="Alles selecteren"
                    className="h-3.5 w-3.5 cursor-pointer accent-[hsl(var(--gold-deep))]"
                    checked={orders.length > 0 && orders.every((o) => selectedIds.has(o.id))}
                    ref={(el) => {
                      if (el) {
                        const someSelected = orders.some((o) => selectedIds.has(o.id));
                        const allSelected = orders.length > 0 && orders.every((o) => selectedIds.has(o.id));
                        el.indeterminate = someSelected && !allSelected;
                      }
                    }}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(new Set(orders.map((o) => o.id)));
                      } else {
                        clearSelection();
                      }
                    }}
                  />
                </th>
                <th ref={attachColWidthRef("order")} className="table-header w-[160px]">Order</th>
                <th ref={attachColWidthRef("customer")} className="px-4 py-2.5 text-left w-auto">
                  <SortableHeader label="Klant" field="customer" currentSort={sortConfig} onSort={handleSort} />
                </th>
                <th ref={attachColWidthRef("pickup")} className="table-header hidden lg:table-cell">Ophaaladres</th>
                <th ref={attachColWidthRef("delivery")} className="table-header hidden md:table-cell">Afleveradres</th>
                <th ref={attachColWidthRef("weight")} className="px-4 py-2.5 text-right w-[90px]">
                  <SortableHeader label="Gewicht" field="totalWeight" currentSort={sortConfig} onSort={handleSort} className="justify-end" />
                </th>
                <th ref={attachColWidthRef("status")} className="px-4 py-2.5 text-left min-w-[160px]">
                  <SortableHeader label="Status" field="status" currentSort={sortConfig} onSort={handleSort} />
                </th>
                <th ref={attachColWidthRef("priority")} className="table-header hidden sm:table-cell w-[90px]">Prioriteit</th>
                <th ref={attachColWidthRef("date")} className="px-4 py-2.5 text-left w-[90px] hidden sm:table-cell">
                  <SortableHeader label="Datum" field="createdAt" currentSort={sortConfig} onSort={handleSort} />
                </th>
                <th ref={attachColWidthRef("label")} className="table-header text-center w-16">Label</th>
              </tr>
            </thead>
            <tbody
              className="divide-y divide-[hsl(var(--gold)/0.1)] [&>tr>td]:!px-5 [&>tr>td]:!py-4 [&>tr>td]:align-middle"
              style={{ fontFamily: "var(--font-display)" }}
            >
              <AnimatePresence mode="popLayout">
                {orders.map((order) => (
                  <motion.tr
                    key={order.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className={cn(
                      "table-row group cursor-pointer",
                      isDraftOrder(order) && "bg-[hsl(var(--gold-soft)/0.38)] hover:bg-[hsl(var(--gold-soft)/0.58)]",
                      unreadOrderIds.has(order.id) && "shadow-[inset_2px_0_0_0_#3b82f6]",
                    )}
                    onClick={() => navigate(openOrderPath(order))}
                  >
                    <td
                      className="table-cell w-10 pl-4"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        aria-label={`Selecteer ${order.orderNumber}`}
                        className="h-3.5 w-3.5 cursor-pointer accent-[hsl(var(--gold-deep))]"
                        checked={selectedIds.has(order.id)}
                        onChange={(e) => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(order.id);
                            else next.delete(order.id);
                            return next;
                          });
                        }}
                      />
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        <IncompleteBadge order={order} size="dot" />
                        <Link
                          to={openOrderPath(order)}
                          className={cn(
                            "text-[14px] font-semibold hover:text-[hsl(var(--gold-deep))] transition-colors tabular-nums tracking-[0.02em] whitespace-nowrap",
                            isDraftOrder(order) ? "text-[hsl(var(--gold-deep))]" : "text-foreground",
                          )}
                          style={{ fontFamily: "var(--font-display)" }}
                          title={order.notes?.trim() || undefined}
                        >
                          {getOrderNumberLabel(order)}
                        </Link>
                      </div>
                    </td>
                    <td className="table-cell text-foreground/90 font-medium" style={{ fontFamily: "var(--font-display)" }}>
                      <div className="flex items-center gap-2">
                        <span>{order.customer}</span>
                        {!isDraftOrder(order) && order.clientId && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/orders/nieuw?client_id=${order.clientId}`);
                            }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50"
                            title="Nieuwe order zoals deze"
                            aria-label={`Nieuwe order zoals ${order.orderNumber}`}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="table-cell text-muted-foreground hidden lg:table-cell truncate max-w-[200px]">
                      {order.pickupAddress}
                    </td>
                    <td className="table-cell text-muted-foreground hidden md:table-cell truncate max-w-[200px]">
                      {order.deliveryAddress}
                    </td>
                    <td className="table-cell text-foreground/90 text-right tabular-nums font-semibold" style={{ fontFamily: "var(--font-display)" }}>
                      {order.totalWeight.toLocaleString()} <span className="text-muted-foreground/70 font-normal text-xs ml-0.5">kg</span>
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <StatusBadge status={order.status as OrderStatus} variant="luxe" />
                        <InfoStatusBadge status={order.infoStatus} size="sm" iconOnly />
                        {order.orderType && order.orderType !== "ZENDING" && (
                          <span className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium border",
                            ORDER_TYPE_LABELS[order.orderType as OrderType]?.color ?? "bg-muted text-muted-foreground"
                          )}>
                            {ORDER_TYPE_LABELS[order.orderType]?.label ?? order.orderType}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="table-cell hidden sm:table-cell">
                      <span
                        className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground/80 font-medium"
                        style={{ fontFamily: "var(--font-display)" }}
                      >
                        <Circle
                          className={cn("h-1.5 w-1.5 fill-current", priorityDotColors[order.priority])}
                          strokeWidth={0}
                        />
                        {order.priority}
                      </span>
                    </td>
                    <td className="table-cell text-muted-foreground/80 hidden sm:table-cell tabular-nums" style={{ fontFamily: "var(--font-display)" }}>
                      {(() => {
                        const { label, tooltip } = formatOrderDate(order.createdAt);
                        return <span title={tooltip}>{label}</span>;
                      })()}
                    </td>
                    <td className="table-cell text-center">
                      <div className="inline-flex items-center gap-0.5">
                        {isDraftOrder(order) ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate(openOrderPath(order)); }}
                            className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                            title="Concept openen"
                            aria-label={`Open concept ${order.orderNumber}`}
                          >
                            <Clock className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={(e) => { e.stopPropagation(); navigate(`/orders/nieuw?from_order_id=${order.id}`); }}
                              className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                              title="Dupliceer order"
                              aria-label={`Dupliceer order ${order.orderNumber}`}
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleQuickPrint(order.id); }}
                              disabled={printLoading === order.id}
                              className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
                              title="Print label"
                              aria-label={`Print label voor order ${order.orderNumber}`}
                            >
                              {printLoading === order.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Printer className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
              {orders.length === 0 && (
                <tr>
                  <td colSpan={10}>
                    <EmptyState
                      icon={Package}
                      title="Geen orders gevonden"
                      description="Pas je filters aan of maak een nieuwe order aan."
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Pagination — luxe */}
        <div
          className="flex flex-col gap-3 px-4 py-3 border-t border-[hsl(var(--gold)/0.2)] md:flex-row md:items-center md:justify-between md:px-5"
          style={{
            background: "linear-gradient(180deg, hsl(var(--gold-soft)/0.12), hsl(var(--gold-soft)/0.34))",
            fontFamily: "var(--font-display)",
            fontSize: "var(--text-caption)",
          }}
        >
          <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.14em] tabular-nums">
            <span className="rounded-full border border-[hsl(var(--gold)/0.22)] bg-white/60 px-3 py-1 font-semibold text-[hsl(var(--gold-deep))] shadow-[inset_0_1px_0_var(--inset-highlight)]">
              {totalCount.toLocaleString("nl-NL")} {totalCount === 1 ? "order" : "orders"}
            </span>
            <span className="text-muted-foreground/70">
              {orders.length.toLocaleString("nl-NL")} getoond
            </span>
            <span className="text-muted-foreground/70">
              {pageSize.toLocaleString("nl-NL")} per pagina
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (isCursorMode) {
                  setCursorStack((s) => s.slice(0, -1));
                }
              }}
              disabled={cursorStack.length === 0}
              className={cn(
                "inline-flex h-8 items-center gap-1 rounded-full border px-3 uppercase tracking-[0.14em] transition-colors",
                cursorStack.length === 0
                  ? "cursor-not-allowed border-transparent text-muted-foreground/30"
                  : "border-[hsl(var(--gold)/0.18)] bg-white/55 text-muted-foreground/80 hover:border-[hsl(var(--gold)/0.34)] hover:text-[hsl(var(--gold-deep))]",
              )}
            >
              <ChevronLeft className="h-3 w-3" />
              Vorige
            </button>
            <span className="rounded-full bg-[hsl(var(--gold-soft)/0.55)] px-3 py-1.5 font-semibold tabular-nums text-[hsl(var(--gold-deep))]">
              {`Pagina ${displayedPage + 1}`}
            </span>
            <button
              onClick={() => {
                const next = (data as any)?.nextCursor as OrderListCursor | null | undefined;
                if (next) setCursorStack((s) => [...s, next]);
              }}
              disabled={!(data as any)?.nextCursor}
              className={cn(
                "inline-flex h-8 items-center gap-1 rounded-full border px-3 uppercase tracking-[0.14em] transition-colors",
                !(data as any)?.nextCursor
                  ? "cursor-not-allowed border-transparent text-muted-foreground/30"
                  : "border-[hsl(var(--gold)/0.18)] bg-white/55 text-muted-foreground/80 hover:border-[hsl(var(--gold)/0.34)] hover:text-[hsl(var(--gold-deep))]",
              )}
            >
              Volgende
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
          <p className="flex items-center gap-2 uppercase tracking-[0.14em] text-muted-foreground/70 tabular-nums">
            <span>Gewicht</span>
            <span className="font-semibold text-foreground">
              {orders.reduce((s, o) => s + o.totalWeight, 0).toLocaleString()} kg
            </span>
          </p>
        </div>
      </motion.div>

      {/* Hidden label for printing */}
      {printOrder && <SmartLabel order={printOrder} />}

      {/* Bulk Import Dialog */}
      <BulkImportDialog open={importOpen} onOpenChange={setImportOpen} />

      <AlertDialog open={deleteSelectionOpen} onOpenChange={setDeleteSelectionOpen}>
        <AlertDialogContent className="border-[hsl(var(--gold)/0.22)] bg-[hsl(var(--card))]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {selectedDeleteCount === 1 ? "Geselecteerde regel verwijderen?" : "Geselecteerde regels verwijderen?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selectedDeleteCount > 0
                ? [
                    selectedRegularOrders.length > 0 ? `${selectedRegularOrders.length} ${selectedRegularOrders.length === 1 ? "order" : "orders"}` : null,
                    selectedDraftOrders.length > 0 ? `${selectedDraftOrders.length} ${selectedDraftOrders.length === 1 ? "concept" : "concepten"}` : null,
                  ].filter(Boolean).join(" en ") + " worden uit de orderlijst verwijderd."
                : "Er is geen verwijderbare selectie."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteSelectionPending}>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteSelectionPending || selectedDeleteCount === 0}
              onClick={(event) => {
                event.preventDefault();
                void handleDeleteSelectedOrders();
              }}
            >
              {deleteSelectionPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Orders;
