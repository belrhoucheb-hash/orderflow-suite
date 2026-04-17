import { useState, useMemo } from "react";
import { Package, Plus, Circle, Clock, Truck, Loader2, HelpCircle, Printer, ChevronLeft, ChevronRight, Upload, SlidersHorizontal, Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toCsv, downloadCsv } from "@/lib/csv";
import { getStatusColor } from "@/lib/statusColors";
import { INFO_STATUS_LABEL, priorityDotColors } from "@/lib/orderDisplay";
import { useOrders } from "@/hooks/useOrders";
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

function exportOrders(orders: Array<any>, baseName: string) {
  if (orders.length === 0) return;
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
  downloadCsv(`${baseName}-${stamp}.csv`, csv);
}

const Orders = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("alle");
  const [orderTypeFilter, setOrderTypeFilter] = useState<string>("alle");
  const [departmentFilter, setDepartmentFilter] = useState<string>("alle");
  const [infoFilter, setInfoFilter] = useState<"alle" | "open" | "overdue">("alle");
  const [page, setPage] = useState(0);
  const [pageSize] = useState(25);
  const [printOrder, setPrintOrder] = useState<any>(null);
  const [printLoading, setPrintLoading] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { attachRef: attachColWidthRef } = useColumnWidths("orderflow:orders:col-widths:v1");

  const clearSelection = () => setSelectedIds(new Set());

  const handleSort = (field: string) => {
    setSortConfig((prev) =>
      prev?.field === field
        ? { field, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { field, direction: "asc" }
    );
  };

  // Reset page when filters change
  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(0);
    clearSelection();
  };

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value);
    setPage(0);
    clearSelection();
  };

  const handleOrderTypeChange = (value: string) => {
    setOrderTypeFilter(value);
    setPage(0);
    clearSelection();
  };

  const handleDepartmentFilterChange = (value: string) => {
    setDepartmentFilter(value);
    setPage(0);
    clearSelection();
  };

  const { data: departments } = useDepartments?.() ?? { data: [] as Array<{ id: string; code: string; name: string; color: string | null }> };

  const selectedDepartmentId = useMemo(() => {
    if (departmentFilter === "alle") return undefined;
    return departments?.find((d) => d.code === departmentFilter)?.id;
  }, [departmentFilter, departments]);

  const { data, isLoading, isError, refetch } = useOrders({
    page,
    pageSize,
    statusFilter: (statusFilter !== "alle") ? statusFilter : undefined,
    orderTypeFilter: (orderTypeFilter !== "alle") ? orderTypeFilter : undefined,
    departmentFilter: selectedDepartmentId,
    search: search || undefined,
  } as any);
  const { unreadOrderIds } = useUnreadNoteOrderIds();
  const rawOrders = data?.orders ?? [];
  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const filteredByInfo = useMemo(() => {
    if (infoFilter === "alle") return rawOrders;
    if (infoFilter === "overdue") return rawOrders.filter(o => o.infoStatus === "OVERDUE");
    return rawOrders.filter(o => o.infoStatus === "AWAITING_INFO" || o.infoStatus === "OVERDUE");
  }, [rawOrders, infoFilter]);

  const orders = useMemo(() => {
    if (!sortConfig) return filteredByInfo;
    const { field, direction } = sortConfig;
    const sorted = [...filteredByInfo].sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";
      switch (field) {
        case "customer": aVal = a.customer.toLowerCase(); bVal = b.customer.toLowerCase(); break;
        case "totalWeight": aVal = a.totalWeight; bVal = b.totalWeight; break;
        case "status": aVal = a.status; bVal = b.status; break;
        case "createdAt": aVal = new Date(a.createdAt).getTime(); bVal = new Date(b.createdAt).getTime(); break;
        default: return 0;
      }
      if (aVal < bVal) return direction === "asc" ? -1 : 1;
      if (aVal > bVal) return direction === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [rawOrders, sortConfig]);

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
    const byStatus = orders.reduce((acc, o) => {
      acc[o.status] = (acc[o.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const totalWeight = orders.reduce((s, o) => s + o.totalWeight, 0);
    const spoedCount = orders.filter((o) => o.priority === "spoed" || o.priority === "hoog").length;
    // Info-teller blijft absoluut (vanuit rawOrders), zodat het cijfer niet leegvalt
    // zodra de gebruiker het eigen info-filter activeert.
    const awaitingInfoCount = rawOrders.filter(
      (o) => o.infoStatus === "AWAITING_INFO" || o.infoStatus === "OVERDUE",
    ).length;
    return { byStatus, totalWeight, spoedCount, awaitingInfoCount };
  }, [orders, rawOrders]);

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
      <div className="relative pb-3 pt-2">
        <div
          aria-hidden
          className="absolute -top-6 -left-8 w-64 h-32 pointer-events-none"
          style={{ background: "radial-gradient(ellipse at top left, hsl(var(--gold-soft) / 0.6), transparent 70%)" }}
        />
        <div className="relative flex items-end justify-between gap-5 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2" style={{ fontFamily: "var(--font-display)" }}>
              <span aria-hidden className="inline-block h-[1px] w-6" style={{ background: "hsl(var(--gold) / 0.5)" }} />
              <span className="text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--gold-deep))] font-semibold">
                Operations
              </span>
              <span aria-hidden className="inline-block h-[3px] w-[3px] rounded-full" style={{ background: "hsl(var(--gold) / 0.5)" }} />
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70 tabular-nums font-medium">
                {totalCount} {totalCount === 1 ? "order" : "orders"}
              </span>
            </div>
            <h1
              className="text-[2.25rem] leading-[1.05] font-semibold tracking-tight text-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Orderlijst
            </h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              className="btn-luxe"
              onClick={() => exportOrders(orders, "orders")}
              disabled={orders.length === 0}
              title="Exporteer huidige weergave als CSV"
            >
              <Download className="h-4 w-4" /> Export
            </button>
            <button className="btn-luxe" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" /> Import
            </button>
            <button className="btn-luxe btn-luxe--primary" onClick={() => navigate("/orders/nieuw")}>
              <Plus className="h-4 w-4" /> Nieuwe order
            </button>
          </div>
        </div>
      </div>

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
          className={cn(
            "relative px-7 py-7 lg:border-r border-b lg:border-b-0 border-[hsl(var(--gold)/0.18)] text-left transition-colors",
            "hover:bg-[hsl(var(--gold-soft)/0.35)] focus:outline-none focus-visible:bg-[hsl(var(--gold-soft)/0.5)]",
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

        {/* Ticker, statussen als snelfilter */}
        <div className="grid grid-cols-2 sm:grid-cols-5 divide-x divide-[hsl(var(--gold)/0.12)]">
          {([
            { label: "Nieuw",          value: stats.byStatus["DRAFT"] || 0,    note: "Te plannen",    filter: "DRAFT" as const,    kind: "status" as const },
            { label: "In behandeling", value: stats.byStatus["PENDING"] || 0,  note: "Open dossier",  filter: "PENDING" as const,  kind: "status" as const },
            { label: "Wacht op info",  value: stats.awaitingInfoCount,         note: "Dossier incompleet", filter: "open" as const, kind: "info" as const },
            { label: "Afgeleverd",     value: stats.byStatus["DELIVERED"] || 0, note: "POD ontvangen", filter: "DELIVERED" as const, kind: "status" as const },
            { label: "Met prioriteit", value: stats.spoedCount,                 note: "Spoed of hoog", filter: null,                kind: "status" as const },
          ] as const).map((s) => {
            const active =
              s.kind === "info"
                ? infoFilter === s.filter
                : s.filter !== null && statusFilter === s.filter;
            const isClickable = s.filter !== null;
            const Cmp: any = isClickable ? "button" : "div";
            const onClickFilter = () => {
              if (s.kind === "info") {
                setInfoFilter(active ? "alle" : (s.filter as "open"));
                setStatusFilter("alle");
                setOrderTypeFilter("alle");
                setPage(0);
                clearSelection();
              } else {
                handleStatusFilterChange(active ? "alle" : (s.filter as string));
              }
            };
            const props = isClickable
              ? { type: "button" as const, onClick: onClickFilter, "aria-pressed": active }
              : {};
            return (
              <Cmp
                key={s.label}
                {...props}
                className={cn(
                  "px-5 py-5 sm:px-6 sm:py-6 flex flex-col text-left transition-colors",
                  s.filter && "hover:bg-[hsl(var(--gold-soft)/0.35)] focus:outline-none focus-visible:bg-[hsl(var(--gold-soft)/0.5)]",
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
      </div>

      {/* Search & Filters — clean, minimalist */}
      <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
        <SearchInput
          value={search}
          onChange={handleSearchChange}
          placeholder="Zoek op ordernummer of klant..."
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
              aria-label="Filter"
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

          {(statusFilter !== "alle" || infoFilter !== "alle" || orderTypeFilter !== "alle" || departmentFilter !== "alle") && (
            <button
              onClick={() => {
                setStatusFilter("alle");
                setInfoFilter("alle");
                setOrderTypeFilter("alle");
                setDepartmentFilter("alle");
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
              onClick={() => exportOrders(orders.filter((o) => selectedIds.has(o.id)), "orders-selectie")}
            >
              <Download className="h-4 w-4" /> Exporteer selectie
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
        <div className="overflow-x-auto">
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
                      unreadOrderIds.has(order.id) && "shadow-[inset_2px_0_0_0_#3b82f6]",
                    )}
                    onClick={() => navigate(`/orders/${order.id}`)}
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
                          to={`/orders/${order.id}`}
                          className="text-[14px] font-semibold text-foreground hover:text-[hsl(var(--gold-deep))] transition-colors tabular-nums tracking-[0.02em] whitespace-nowrap"
                          style={{ fontFamily: "var(--font-display)" }}
                          title={order.notes?.trim() || undefined}
                        >
                          {order.orderNumber}
                        </Link>
                      </div>
                    </td>
                    <td className="table-cell text-foreground/90 font-medium" style={{ fontFamily: "var(--font-display)" }}>
                      {order.customer}
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
                      <button
                        onClick={(e) => { e.stopPropagation(); handleQuickPrint(order.id); }}
                        disabled={printLoading === order.id}
                        className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
                        title="Print label"
                      >
                        {printLoading === order.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Printer className="h-3.5 w-3.5" />
                        )}
                      </button>
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
          className="flex items-center justify-between px-5 py-3 border-t border-[hsl(var(--gold)/0.2)]"
          style={{
            background: "linear-gradient(180deg, hsl(var(--gold-soft)/0.15), hsl(var(--gold-soft)/0.35))",
            fontFamily: "var(--font-display)",
            fontSize: "var(--text-caption)",
          }}
        >
          <p className="uppercase tracking-[0.14em] text-muted-foreground/80 tabular-nums">
            {orders.length > 0
              ? `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, totalCount)} van ${totalCount}`
              : "0 orders"}
          </p>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className={cn(
                "inline-flex items-center gap-1 uppercase tracking-[0.14em] transition-colors",
                page === 0
                  ? "text-muted-foreground/30 cursor-not-allowed"
                  : "text-muted-foreground/80 hover:text-[hsl(var(--gold-deep))]",
              )}
            >
              <ChevronLeft className="h-3 w-3" />
              Vorige
            </button>
            <span className="tabular-nums text-[hsl(var(--gold-deep))] font-semibold">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className={cn(
                "inline-flex items-center gap-1 uppercase tracking-[0.14em] transition-colors",
                page >= totalPages - 1
                  ? "text-muted-foreground/30 cursor-not-allowed"
                  : "text-muted-foreground/80 hover:text-[hsl(var(--gold-deep))]",
              )}
            >
              Volgende
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
          <p className="uppercase tracking-[0.14em] text-muted-foreground/80 tabular-nums">
            {orders.reduce((s, o) => s + o.totalWeight, 0).toLocaleString()} kg
          </p>
        </div>
      </motion.div>

      {/* Hidden label for printing */}
      {printOrder && <SmartLabel order={printOrder} />}

      {/* Bulk Import Dialog */}
      <BulkImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
};

export default Orders;
