import { useState, useMemo } from "react";
import { Package, Plus, Circle, Clock, Truck, Loader2, HelpCircle, Printer, ChevronLeft, ChevronRight, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getStatusColor } from "@/lib/statusColors";
import { useOrders, useOrdersSubscription } from "@/hooks/useOrders";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import SmartLabel from "@/components/orders/SmartLabel";
import { SortableHeader, type SortConfig } from "@/components/ui/SortableHeader";
import { SearchInput } from "@/components/ui/SearchInput";
import { PageHeader } from "@/components/ui/PageHeader";
import { KPIStrip, type KPIItem } from "@/components/ui/KPIStrip";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import type { OrderStatus } from "@/components/ui/StatusBadge";
import { BulkImportDialog } from "@/components/orders/BulkImportDialog";

const priorityDotColors: Record<string, string> = {
  laag: "text-muted-foreground/40",
  normaal: "text-blue-400",
  hoog: "text-amber-500",
  spoed: "text-primary",
};

const filterOptions = ["alle", "DRAFT", "PENDING", "PLANNED", "IN_TRANSIT", "DELIVERED"] as const;

const Orders = () => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("alle");
  const [page, setPage] = useState(0);
  const [pageSize] = useState(25);
  const [printOrder, setPrintOrder] = useState<any>(null);
  const [printLoading, setPrintLoading] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [importOpen, setImportOpen] = useState(false);

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
  };

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value);
    setPage(0);
  };

  const { data, isLoading, isError, refetch } = useOrders({
    page,
    pageSize,
    statusFilter: statusFilter !== "alle" ? statusFilter : undefined,
    search: search || undefined,
  });
  useOrdersSubscription();

  const rawOrders = data?.orders ?? [];
  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const orders = useMemo(() => {
    if (!sortConfig) return rawOrders;
    const { field, direction } = sortConfig;
    const sorted = [...rawOrders].sort((a, b) => {
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
    return { byStatus, totalWeight, spoedCount };
  }, [orders]);

  if (isLoading) {
    return (
      <div className="loading-spinner">
        <Loader2 className="loading-spinner__icon" />
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
      {/* Header */}
      <PageHeader
        title="Orderlijst"
        subtitle={`${totalCount} transportopdrachten in totaal`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" /> Import
            </Button>
            <Link to="/orders/nieuw">
              <Button className="btn-primary">
                <Plus className="h-4 w-4" /> Nieuwe order
              </Button>
            </Link>
          </div>
        }
      />

      {/* Stats Bar */}
      <KPIStrip
        columns={5}
        items={[
          { label: "Nieuw", value: stats.byStatus["DRAFT"] || 0, icon: Package, iconColor: "text-blue-600", iconBg: "bg-blue-500/10" },
          { label: "In behandeling", value: stats.byStatus["PENDING"] || 0, icon: HelpCircle, iconColor: "text-violet-600", iconBg: "bg-violet-500/10" },
          { label: "Onderweg", value: (stats.byStatus["IN_TRANSIT"] || 0) + (stats.byStatus["PLANNED"] || 0), icon: Truck, iconColor: "text-primary", iconBg: "bg-primary/10" },
          { label: "Afgeleverd", value: stats.byStatus["DELIVERED"] || 0, icon: Circle, iconColor: "text-emerald-600", iconBg: "bg-emerald-500/10" },
          { label: "Spoed / Hoog", value: stats.spoedCount, icon: Clock, iconColor: "text-amber-600", iconBg: "bg-amber-500/10" },
        ]}
      />

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <SearchInput
          value={search}
          onChange={handleSearchChange}
          placeholder="Zoek op ordernummer of klant..."
          className="flex-1 max-w-md"
        />
        <div className="flex rounded-xl border border-border/50 bg-card p-1 gap-0.5 overflow-x-auto max-w-full">
          {filterOptions.map((s) => (
            <button
              key={s}
              onClick={() => handleStatusFilterChange(s)}
              className={cn(
                "px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all duration-150 whitespace-nowrap",
                statusFilter === s
                  ? "bg-foreground text-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {s === "alle" ? "Alle" : getStatusColor(s).label}
            </button>
          ))}
        </div>
      </div>

      {/* Table Card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-card rounded-xl shadow-sm border border-border/40 overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr className="border-b border-border/40 bg-muted/30">
                <th className="table-header w-[100px]">Order</th>
                <th className="px-4 py-2.5 text-left w-auto">
                  <SortableHeader label="Klant" field="customer" currentSort={sortConfig} onSort={handleSort} />
                </th>
                <th className="table-header hidden lg:table-cell">Ophaaladres</th>
                <th className="table-header hidden md:table-cell">Afleveradres</th>
                <th className="px-4 py-2.5 text-right w-[90px]">
                  <SortableHeader label="Gewicht" field="totalWeight" currentSort={sortConfig} onSort={handleSort} className="justify-end" />
                </th>
                <th className="px-4 py-2.5 text-left w-[100px]">
                  <SortableHeader label="Status" field="status" currentSort={sortConfig} onSort={handleSort} />
                </th>
                <th className="table-header hidden sm:table-cell w-[90px]">Prioriteit</th>
                <th className="px-4 py-2.5 text-left w-[90px] hidden sm:table-cell">
                  <SortableHeader label="Datum" field="createdAt" currentSort={sortConfig} onSort={handleSort} />
                </th>
                <th className="table-header text-center w-16">Label</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              <AnimatePresence mode="popLayout">
                {orders.map((order, idx) => (
                  <motion.tr
                    key={order.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: idx * 0.02 }}
                    className="table-row group"
                  >
                    <td className="table-cell">
                      <Link
                        to={`/orders/${order.id}`}
                        className="font-mono text-sm font-medium text-foreground hover:text-primary transition-colors"
                      >
                        {order.orderNumber}
                      </Link>
                    </td>
                    <td className="table-cell text-foreground/80">{order.customer}</td>
                    <td className="table-cell text-muted-foreground hidden lg:table-cell truncate max-w-[200px]">
                      {order.pickupAddress}
                    </td>
                    <td className="table-cell text-muted-foreground hidden md:table-cell truncate max-w-[200px]">
                      {order.deliveryAddress}
                    </td>
                    <td className="table-cell text-foreground/80 text-right tabular-nums font-medium">
                      {order.totalWeight.toLocaleString()} kg
                    </td>
                    <td className="table-cell">
                      <StatusBadge status={order.status as OrderStatus} />
                    </td>
                    <td className="table-cell hidden sm:table-cell">
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground capitalize">
                        <Circle
                          className={cn("h-1.5 w-1.5 fill-current", priorityDotColors[order.priority])}
                          strokeWidth={0}
                        />
                        {order.priority}
                      </span>
                    </td>
                    <td className="table-cell text-muted-foreground hidden sm:table-cell tabular-nums">
                      {new Date(order.createdAt).toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" })}
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
                  <td colSpan={9}>
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

        {/* Footer with Pagination */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border/30 bg-muted/20">
          <p className="text-xs text-muted-foreground">
            {orders.length > 0
              ? `${page * pageSize + 1}-${Math.min((page + 1) * pageSize, totalCount)} van ${totalCount} transportopdrachten`
              : `0 transportopdrachten`}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className={cn(
                "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors",
                page === 0
                  ? "text-muted-foreground/40 cursor-not-allowed"
                  : "text-foreground hover:bg-muted/50",
              )}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Vorige
            </button>
            <span className="text-xs text-muted-foreground tabular-nums px-2">
              Pagina {page + 1} van {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className={cn(
                "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors",
                page >= totalPages - 1
                  ? "text-muted-foreground/40 cursor-not-allowed"
                  : "text-foreground hover:bg-muted/50",
              )}
            >
              Volgende
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">
            Totaal: {orders.reduce((s, o) => s + o.totalWeight, 0).toLocaleString()} kg
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
