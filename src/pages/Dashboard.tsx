import { useMemo } from "react";
import {
  Package, Truck, MapPin, CheckCircle2, AlertTriangle, Clock,
  TrendingUp, ArrowRight, Gauge, CalendarClock, Phone, Mail, Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { statusLabels, statusColors, priorityColors } from "@/data/mockData";
import { useOrders } from "@/hooks/useOrders";
import { useVehicles } from "@/hooks/useVehicles";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { FinancialKPIWidget } from "@/components/dashboard/FinancialKPIWidget";
import { OperationalForecastWidget } from "@/components/dashboard/OperationalForecastWidget";

const overdueImpacts: Record<string, { label: string; color: string }> = {};

const Dashboard = () => {
  const today = new Date();
  const { data: orders = [], isLoading: ordersLoading } = useOrders();
  const { data: vehicles = [], isLoading: vehiclesLoading } = useVehicles();

  const isLoading = ordersLoading || vehiclesLoading;

  const stats = useMemo(() => {
    const byStatus = orders.reduce((acc, o) => {
      acc[o.status] = (acc[o.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const spoedOrders = orders.filter((o) => o.priority === "spoed" || o.priority === "hoog");
    const onderwegOrders = orders.filter((o) => o.status === "onderweg");
    const totalWeight = orders.reduce((s, o) => s + o.totalWeight, 0);

    const overdueOrders = orders.filter((o) => {
      if (o.status === "afgeleverd" || o.status === "geannuleerd") return false;
      return o.estimatedDelivery && new Date(o.estimatedDelivery) < today;
    });

    return {
      byStatus,
      spoedOrders,
      onderwegOrders,
      totalWeight,
      totalVehicles: vehicles.length,
      overdueOrders,
    };
  }, [orders, vehicles]);

  const recentOrders = useMemo(() =>
    [...orders]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 6),
    [orders]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground font-display">
            Operationeel Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {today.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Totaal orders", value: orders.length, icon: Package, color: "text-blue-600", bg: "bg-blue-500/8" },
          { label: "Voertuigen", value: vehicles.length, icon: Truck, color: "text-primary", bg: "bg-primary/8" },
          { label: "Nieuw", value: stats.byStatus["nieuw"] || 0, icon: Package, color: "text-blue-600", bg: "bg-blue-500/8" },
          { label: "Onderweg", value: stats.byStatus["onderweg"] || 0, icon: MapPin, color: "text-primary", bg: "bg-primary/8" },
          { label: "Afgeleverd", value: stats.byStatus["afgeleverd"] || 0, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-500/8" },
          { label: "Achterstallig", value: stats.overdueOrders.length, icon: Clock, color: stats.overdueOrders.length > 0 ? "text-destructive" : "text-muted-foreground", bg: stats.overdueOrders.length > 0 ? "bg-destructive/8" : "bg-muted" },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            className="bg-card rounded-xl border border-border/40 p-3.5 flex items-center gap-3"
          >
            <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", stat.bg)}>
              <stat.icon className={cn("h-4 w-4", stat.color)} />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-semibold font-display tabular-nums leading-tight">{stat.value}</p>
              <p className="text-[10px] text-muted-foreground truncate">{stat.label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Financial & Forecast widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <FinancialKPIWidget orders={orders} vehicles={vehicles} />
        <OperationalForecastWidget vehicles={vehicles} orders={orders} />
      </div>

      {/* Two column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Recent orders */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-2 bg-card rounded-xl border border-border/40 shadow-sm overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold font-display">Recente orders</h2>
            </div>
            <Link to="/orders" className="text-[11px] text-primary hover:underline flex items-center gap-1">
              Bekijk alles <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/30 bg-muted/20">
                  <th className="px-4 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">Order</th>
                  <th className="px-4 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">Klant</th>
                  <th className="px-4 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 hidden md:table-cell">Bezorging</th>
                  <th className="px-4 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 hidden sm:table-cell">Gewicht</th>
                  <th className="px-4 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {recentOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-muted/20 transition-colors duration-100">
                    <td className="px-4 py-2">
                      <Link to={`/orders/${order.id}`} className="font-mono text-[13px] font-medium text-foreground hover:text-primary transition-colors">
                        {order.orderNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-[13px] text-foreground/80">{order.customer}</td>
                    <td className="px-4 py-2 text-[13px] text-muted-foreground hidden md:table-cell">
                      <span className="flex items-center gap-1 truncate max-w-[180px]">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {order.deliveryAddress}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-[13px] text-foreground/80 text-right tabular-nums font-medium hidden sm:table-cell">
                      {order.totalWeight.toLocaleString()} kg
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant="outline" className={cn("text-[10px] px-2 py-0.5", statusColors[order.status])}>
                        {statusLabels[order.status]}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {recentOrders.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">
                      Geen orders gevonden
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Samenvatting */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-card rounded-xl border border-border/40 shadow-sm p-4"
          >
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold font-display">Samenvatting</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted/30 p-3 text-center">
                <p className="text-lg font-bold font-display tabular-nums">{orders.length}</p>
                <p className="text-[10px] text-muted-foreground">Totaal orders</p>
              </div>
              <div className="rounded-lg bg-muted/30 p-3 text-center">
                <p className="text-lg font-bold font-display tabular-nums">{stats.byStatus["afgeleverd"] || 0}</p>
                <p className="text-[10px] text-muted-foreground">Afgeleverd</p>
              </div>
              <div className="rounded-lg bg-muted/30 p-3 text-center">
                <p className="text-lg font-bold font-display tabular-nums">{stats.totalWeight.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground">Totaal kg</p>
              </div>
              <div className="rounded-lg bg-muted/30 p-3 text-center">
                <p className="text-lg font-bold font-display tabular-nums">{vehicles.length}</p>
                <p className="text-[10px] text-muted-foreground">Voertuigen</p>
              </div>
            </div>
          </motion.div>

          {/* Aandachtspunten */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-card rounded-xl border border-border/40 shadow-sm p-4"
          >
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <h2 className="text-sm font-semibold font-display">Aandachtspunten</h2>
            </div>
            <div className="space-y-2">
              {stats.overdueOrders.length > 0 ? (
                stats.overdueOrders.map((order) => (
                  <Popover key={order.id}>
                    <PopoverTrigger asChild>
                      <button className="w-full flex items-center gap-2.5 p-2.5 rounded-lg bg-destructive/5 border border-destructive/10 hover:bg-destructive/10 transition-colors text-left group">
                        <Clock className="h-3.5 w-3.5 text-destructive shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] font-medium text-foreground truncate">{order.orderNumber}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{order.customer}</p>
                        </div>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-3" side="left" align="start">
                      <p className="text-[12px] font-semibold font-display mb-2">Quick Actions</p>
                      <div className="space-y-1.5">
                        <Button variant="outline" size="sm" className="w-full justify-start gap-2 h-8 text-[12px]">
                          <Phone className="h-3 w-3" /> Bel Chauffeur
                        </Button>
                        <Button variant="outline" size="sm" className="w-full justify-start gap-2 h-8 text-[12px]">
                          <Mail className="h-3 w-3" /> Mail Klant
                        </Button>
                        <Link to={`/orders/${order.id}`}>
                          <Button variant="ghost" size="sm" className="w-full justify-start gap-2 h-8 text-[12px] text-primary">
                            <ArrowRight className="h-3 w-3" /> Bekijk order
                          </Button>
                        </Link>
                      </div>
                    </PopoverContent>
                  </Popover>
                ))
              ) : (
                <div className="text-center py-4">
                  <CheckCircle2 className="h-6 w-6 mx-auto mb-1.5 text-emerald-500/50" />
                  <p className="text-[12px] text-muted-foreground">Geen achterstallige orders</p>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
