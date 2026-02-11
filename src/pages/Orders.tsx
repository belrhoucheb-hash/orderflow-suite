import { useState } from "react";
import { Package, Search, Plus, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { mockOrders, statusLabels } from "@/data/mockData";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

const statusStyles: Record<string, string> = {
  nieuw: "bg-blue-50 text-blue-700 border-blue-100",
  in_behandeling: "bg-amber-50 text-amber-700 border-amber-100",
  onderweg: "bg-red-50 text-red-700 border-red-100",
  afgeleverd: "bg-emerald-50 text-emerald-700 border-emerald-100",
  geannuleerd: "bg-muted text-muted-foreground border-border",
};

const priorityDotColors: Record<string, string> = {
  laag: "text-muted-foreground/40",
  normaal: "text-blue-400",
  hoog: "text-amber-500",
  spoed: "text-red-500",
};

const filterOptions = ["alle", "nieuw", "in_behandeling", "onderweg", "afgeleverd"] as const;

const Orders = () => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("alle");

  const filtered = mockOrders.filter((o) => {
    const matchesSearch =
      o.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
      o.customer.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "alle" || o.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Orders</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{mockOrders.length} orders in totaal</p>
        </div>
        <Button className="gap-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm">
          <Plus className="h-4 w-4" /> Nieuwe order
        </Button>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
          <input
            placeholder="Zoek op ordernummer of klant..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-10 pr-4 rounded-lg border border-border/60 bg-card text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring/40 transition-all"
          />
        </div>
        <div className="flex rounded-lg border border-border/60 bg-card p-0.5 gap-0">
          {filterOptions.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-3.5 py-1.5 text-xs font-medium rounded-md transition-all duration-150",
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
      <div className="bg-card rounded-xl shadow-sm border border-border/40 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/40">
                <th className="px-5 py-3.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Order</th>
                <th className="px-5 py-3.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Klant</th>
                <th className="px-5 py-3.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground hidden lg:table-cell">Ophaaladres</th>
                <th className="px-5 py-3.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground hidden md:table-cell">Afleveradres</th>
                <th className="px-5 py-3.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Gewicht</th>
                <th className="px-5 py-3.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="px-5 py-3.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground hidden sm:table-cell">Prioriteit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {filtered.map((order) => (
                <tr
                  key={order.id}
                  className="hover:bg-muted/30 transition-colors duration-100"
                >
                  <td className="px-5 py-4">
                    <Link
                      to={`/orders/${order.id}`}
                      className="font-mono text-sm font-medium text-foreground hover:text-primary transition-colors"
                    >
                      {order.orderNumber}
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-sm text-muted-foreground">{order.customer}</td>
                  <td className="px-5 py-4 text-sm text-muted-foreground hidden lg:table-cell truncate max-w-[200px]">
                    {order.pickupAddress}
                  </td>
                  <td className="px-5 py-4 text-sm text-muted-foreground hidden md:table-cell truncate max-w-[200px]">
                    {order.deliveryAddress}
                  </td>
                  <td className="px-5 py-4 text-sm text-muted-foreground text-right tabular-nums">
                    {order.totalWeight.toLocaleString()} kg
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={cn(
                        "inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-medium border",
                        statusStyles[order.status]
                      )}
                    >
                      {statusLabels[order.status]}
                    </span>
                  </td>
                  <td className="px-5 py-4 hidden sm:table-cell">
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground capitalize">
                      <Circle
                        className={cn("h-2 w-2 fill-current", priorityDotColors[order.priority])}
                        strokeWidth={0}
                      />
                      {order.priority}
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-sm text-muted-foreground">
                    Geen orders gevonden
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Orders;
