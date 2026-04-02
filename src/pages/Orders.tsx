import { useState, useMemo } from "react";
import { Package, Search, Plus, Circle, TrendingUp, Clock, Truck, Loader2, HelpCircle, Printer, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { statusLabels } from "@/data/mockData";
import { useOrders } from "@/hooks/useOrders";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import SmartLabel from "@/components/orders/SmartLabel";

const statusStyles: Record<string, string> = {
  DRAFT: "bg-blue-500/8 text-blue-700 border-blue-200/60",
  PENDING: "bg-amber-500/8 text-amber-700 border-amber-200/60",
  PLANNED: "bg-violet-500/8 text-violet-700 border-violet-200/60",
  IN_TRANSIT: "bg-primary/8 text-primary border-primary/20",
  DELIVERED: "bg-emerald-500/8 text-emerald-700 border-emerald-200/60",
  CANCELLED: "bg-muted text-muted-foreground border-border",
};

const statusDotColors: Record<string, string> = {
  DRAFT: "bg-blue-500",
  PENDING: "bg-amber-500",
  PLANNED: "bg-violet-500",
  IN_TRANSIT: "bg-primary",
  DELIVERED: "bg-emerald-500",
  CANCELLED: "bg-muted-foreground/40",
};

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

  const orders = data?.orders ?? [];
  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

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
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-sm font-semibold text-foreground mb-1">Kan orders niet laden</p>
        <p className="text-xs text-muted-foreground mb-3">Controleer je verbinding</p>
        <button onClick={() => refetch()} className="text-xs text-primary hover:underline">Opnieuw proberen</button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground font-display">Orderlijst</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{totalCount} transportopdrachten in totaal</p>
        </div>
        <Link to="/orders/nieuw">
          <Button className="gap-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm h-10 px-5">
            <Plus className="h-4 w-4" /> Nieuwe order
          </Button>
        </Link>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        {[
          { label: "Nieuw", value: stats.byStatus["DRAFT"] || 0, icon: Package, color: "text-blue-600", bg: "bg-blue-500/8" },
          { label: "In behandeling", value: stats.byStatus["PENDING"] || 0, icon: HelpCircle, color: "text-violet-600", bg: "bg-violet-500/8" },
          { label: "Onderweg", value: (stats.byStatus["IN_TRANSIT"] || 0) + (stats.byStatus["PLANNED"] || 0), icon: Truck, color: "text-primary", bg: "bg-primary/8" },
          { label: "Afgeleverd", value: stats.byStatus["DELIVERED"] || 0, icon: Circle, color: "text-emerald-600", bg: "bg-emerald-500/8" },
          { label: "Spoed / Hoog", value: stats.spoedCount, icon: Clock, color: "text-amber-600", bg: "bg-amber-500/8" },
        ].map((stat) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card rounded-xl border border-border/40 p-4 flex items-center gap-3"
          >
            <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center", stat.bg)}>
              <stat.icon className={cn("h-4.5 w-4.5", stat.color)} />
            </div>
            <div>
              <p className="text-xl font-semibold font-display tabular-nums">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
          <input
            placeholder="Zoek op ordernummer of klant..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full h-10 pl-10 pr-4 rounded-xl border border-border/50 bg-card text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring/40 transition-all"
          />
        </div>
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
              {s === "alle" ? "Alle" : statusLabels[s as keyof typeof statusLabels]}
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
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/40 bg-muted/30">
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60 w-[100px]">Order</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60">Klant</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60 hidden lg:table-cell">Ophaaladres</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60 hidden md:table-cell">Afleveradres</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60 w-[90px]">Gewicht</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60 w-[100px]">Status</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60 hidden sm:table-cell w-[90px]">Prioriteit</th>
                <th className="px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60 w-16">Label</th>
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
                    className="hover:bg-muted/20 transition-colors duration-100 group"
                  >
                    <td className="px-4 py-2">
                      <Link
                        to={`/orders/${order.id}`}
                        className="font-mono text-sm font-medium text-foreground hover:text-primary transition-colors flex items-center gap-1.5"
                      >
                        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", statusDotColors[order.status])} />
                        {order.orderNumber}
                        </Link>
                    </td>
                    <td className="px-4 py-2 text-sm text-foreground/80">{order.customer}</td>
                    <td className="px-4 py-2 text-sm text-muted-foreground hidden lg:table-cell truncate max-w-[200px]">
                      {order.pickupAddress}
                    </td>
                    <td className="px-4 py-2 text-sm text-muted-foreground hidden md:table-cell truncate max-w-[200px]">
                      {order.deliveryAddress}
                    </td>
                    <td className="px-4 py-2 text-sm text-foreground/80 text-right tabular-nums font-medium">
                      {order.totalWeight.toLocaleString()} kg
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border",
                          statusStyles[order.status]
                        )}
                      >
                        <span className={cn("h-1 w-1 rounded-full", statusDotColors[order.status])} />
                        {statusLabels[order.status]}
                      </span>
                    </td>
                    <td className="px-4 py-2 hidden sm:table-cell">
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground capitalize">
                        <Circle
                          className={cn("h-1.5 w-1.5 fill-current", priorityDotColors[order.priority])}
                          strokeWidth={0}
                        />
                        {order.priority}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center">
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
                  <td colSpan={8} className="px-5 py-16 text-center">
                    <Package className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">Geen orders gevonden</p>
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
    </div>
  );
};

export default Orders;
