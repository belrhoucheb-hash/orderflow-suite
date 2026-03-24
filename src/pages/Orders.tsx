import { useState, useMemo } from "react";
import { Package, Search, Plus, Circle, TrendingUp, Clock, Truck, Filter, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { statusLabels } from "@/data/mockData";
import { useOrders } from "@/hooks/useOrders";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

const statusStyles: Record<string, string> = {
  nieuw: "bg-blue-500/8 text-blue-700 border-blue-200/60",
  in_behandeling: "bg-amber-500/8 text-amber-700 border-amber-200/60",
  onderweg: "bg-primary/8 text-primary border-primary/20",
  afgeleverd: "bg-emerald-500/8 text-emerald-700 border-emerald-200/60",
  geannuleerd: "bg-muted text-muted-foreground border-border",
};

const statusDotColors: Record<string, string> = {
  nieuw: "bg-blue-500",
  in_behandeling: "bg-amber-500",
  onderweg: "bg-primary",
  afgeleverd: "bg-emerald-500",
  geannuleerd: "bg-muted-foreground/40",
};

const priorityDotColors: Record<string, string> = {
  laag: "text-muted-foreground/40",
  normaal: "text-blue-400",
  hoog: "text-amber-500",
  spoed: "text-primary",
};

const filterOptions = ["alle", "nieuw", "in_behandeling", "onderweg", "afgeleverd"] as const;

const Orders = () => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("alle");
  const { data: orders = [], isLoading } = useOrders();

  const filtered = orders.filter((o) => {
    const matchesSearch =
      o.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
      o.customer.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "alle" || o.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Stats
  const stats = useMemo(() => {
    const byStatus = orders.reduce((acc, o) => {
      acc[o.status] = (acc[o.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const totalWeight = orders.reduce((s, o) => s + o.totalWeight, 0);
    const spoedCount = orders.filter((o) => o.priority === "spoed" || o.priority === "hoog").length;
    return { byStatus, totalWeight, spoedCount };
  }, [orders]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground font-display">Orders</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{orders.length} orders in totaal</p>
        </div>
        <Button className="gap-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm h-10 px-5">
          <Plus className="h-4 w-4" /> Nieuwe order
        </Button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Nieuw", value: stats.byStatus["nieuw"] || 0, icon: Package, color: "text-blue-600", bg: "bg-blue-500/8" },
          { label: "Onderweg", value: stats.byStatus["onderweg"] || 0, icon: Truck, color: "text-primary", bg: "bg-primary/8" },
          { label: "Afgeleverd", value: stats.byStatus["afgeleverd"] || 0, icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-500/8" },
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
              <p className="text-[11px] text-muted-foreground">{stat.label}</p>
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
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-10 pr-4 rounded-xl border border-border/50 bg-card text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring/40 transition-all"
          />
        </div>
        <div className="flex rounded-xl border border-border/50 bg-card p-1 gap-0.5">
          {filterOptions.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all duration-150",
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
                <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">Order</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">Klant</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 hidden lg:table-cell">Ophaaladres</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 hidden md:table-cell">Afleveradres</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">Gewicht</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">Status</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 hidden sm:table-cell">Prioriteit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              <AnimatePresence mode="popLayout">
                {filtered.map((order, idx) => (
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
                        className="font-mono text-[13px] font-medium text-foreground hover:text-primary transition-colors flex items-center gap-1.5"
                      >
                        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", statusDotColors[order.status])} />
                        {order.orderNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-[13px] text-foreground/80">{order.customer}</td>
                    <td className="px-4 py-2 text-[13px] text-muted-foreground hidden lg:table-cell truncate max-w-[200px]">
                      {order.pickupAddress}
                    </td>
                    <td className="px-4 py-2 text-[13px] text-muted-foreground hidden md:table-cell truncate max-w-[200px]">
                      {order.deliveryAddress}
                    </td>
                    <td className="px-4 py-2 text-[13px] text-foreground/80 text-right tabular-nums font-medium">
                      {order.totalWeight.toLocaleString()} kg
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border",
                          statusStyles[order.status]
                        )}
                      >
                        <span className={cn("h-1 w-1 rounded-full", statusDotColors[order.status])} />
                        {statusLabels[order.status]}
                      </span>
                    </td>
                    <td className="px-4 py-2 hidden sm:table-cell">
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground capitalize">
                        <Circle
                          className={cn("h-1.5 w-1.5 fill-current", priorityDotColors[order.priority])}
                          strokeWidth={0}
                        />
                        {order.priority}
                      </span>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center">
                    <Package className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">Geen orders gevonden</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border/30 bg-muted/20">
          <p className="text-[11px] text-muted-foreground">
            {filtered.length} van {orders.length} orders
          </p>
          <p className="text-[11px] text-muted-foreground tabular-nums">
            Totaal: {filtered.reduce((s, o) => s + o.totalWeight, 0).toLocaleString()} kg
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default Orders;
