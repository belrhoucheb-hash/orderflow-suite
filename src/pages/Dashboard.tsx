import { useMemo } from "react";
import {
  Package,
  Truck,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  Clock,
  TrendingUp,
  ArrowRight,
  Gauge,
  CalendarClock,
  Weight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { mockOrders, mockVehicles, statusLabels, statusColors, priorityColors } from "@/data/mockData";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

const Dashboard = () => {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  const stats = useMemo(() => {
    const byStatus = mockOrders.reduce((acc, o) => {
      acc[o.status] = (acc[o.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const spoedOrders = mockOrders.filter((o) => o.priority === "spoed" || o.priority === "hoog");
    const onderwegOrders = mockOrders.filter((o) => o.status === "onderweg");
    const totalWeight = mockOrders.reduce((s, o) => s + o.totalWeight, 0);
    const activeVehicles = mockVehicles.filter((v) => v.status === "onderweg").length;
    const availableVehicles = mockVehicles.filter((v) => v.status === "beschikbaar").length;
    const overdueOrders = mockOrders.filter((o) => {
      if (o.status === "afgeleverd" || o.status === "geannuleerd") return false;
      return new Date(o.estimatedDelivery) < today;
    });

    return {
      byStatus,
      spoedOrders,
      onderwegOrders,
      totalWeight,
      activeVehicles,
      availableVehicles,
      totalVehicles: mockVehicles.length,
      overdueOrders,
    };
  }, []);

  // Fleet utilization percentage
  const fleetUtilization = Math.round(
    (stats.activeVehicles / stats.totalVehicles) * 100
  );

  const recentOrders = [...mockOrders]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6);

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
  };

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
          { label: "Actieve ritten", value: stats.activeVehicles, icon: Truck, color: "text-primary", bg: "bg-primary/8" },
          { label: "Beschikbaar", value: stats.availableVehicles, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-500/8" },
          { label: "Nieuwe orders", value: stats.byStatus["nieuw"] || 0, icon: Package, color: "text-blue-600", bg: "bg-blue-500/8" },
          { label: "Onderweg", value: stats.byStatus["onderweg"] || 0, icon: MapPin, color: "text-primary", bg: "bg-primary/8" },
          { label: "Spoed / Hoog", value: stats.spoedOrders.length, icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-500/8" },
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

      {/* Two column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Active shipments */}
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
                  <th className="px-4 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 hidden sm:table-cell">Prio</th>
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
                    <td className="px-4 py-2 hidden sm:table-cell">
                      <Badge variant="secondary" className={cn("text-[10px] px-2 py-0.5", priorityColors[order.priority])}>
                        {order.priority}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Right column: Fleet + Alerts */}
        <div className="space-y-4">
          {/* Fleet utilization */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-card rounded-xl border border-border/40 shadow-sm p-4"
          >
            <div className="flex items-center gap-2 mb-3">
              <Gauge className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold font-display">Vlootbezetting</h2>
            </div>
            <div className="flex items-center gap-4 mb-3">
              <div className="relative h-20 w-20 shrink-0">
                <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="hsl(var(--muted))"
                    strokeWidth="3"
                  />
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="hsl(var(--primary))"
                    strokeWidth="3"
                    strokeDasharray={`${fleetUtilization}, 100`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-bold font-display tabular-nums">{fleetUtilization}%</span>
                </div>
              </div>
              <div className="space-y-1.5 text-[12px]">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                  <span className="text-muted-foreground">Actief</span>
                  <span className="font-semibold ml-auto tabular-nums">{stats.activeVehicles}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                  <span className="text-muted-foreground">Beschikbaar</span>
                  <span className="font-semibold ml-auto tabular-nums">{stats.availableVehicles}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
                  <span className="text-muted-foreground">Onderhoud</span>
                  <span className="font-semibold ml-auto tabular-nums">
                    {mockVehicles.filter((v) => v.status === "onderhoud").length}
                  </span>
                </div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-muted-foreground">Totaal gewicht vandaag</span>
                <span className="font-medium tabular-nums">{stats.totalWeight.toLocaleString()} kg</span>
              </div>
              <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary/70 transition-all" style={{ width: `${Math.min((stats.totalWeight / 10000) * 100, 100)}%` }} />
              </div>
            </div>
          </motion.div>

          {/* Alerts / Overdue */}
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
                  <Link
                    key={order.id}
                    to={`/orders/${order.id}`}
                    className="flex items-center gap-2.5 p-2.5 rounded-lg bg-destructive/5 border border-destructive/10 hover:bg-destructive/10 transition-colors"
                  >
                    <Clock className="h-3.5 w-3.5 text-destructive shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-medium text-foreground truncate">{order.orderNumber}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{order.customer}</p>
                    </div>
                    <span className="text-[10px] text-destructive font-medium shrink-0">Verlaat</span>
                  </Link>
                ))
              ) : (
                <div className="text-center py-4">
                  <CheckCircle2 className="h-6 w-6 mx-auto mb-1.5 text-emerald-500/50" />
                  <p className="text-[12px] text-muted-foreground">Geen achterstallige orders</p>
                </div>
              )}
              {stats.spoedOrders.length > 0 && (
                <div className="pt-2 border-t border-border/30">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-1.5">Spoed orders</p>
                  {stats.spoedOrders.slice(0, 3).map((order) => (
                    <Link
                      key={order.id}
                      to={`/orders/${order.id}`}
                      className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-muted/40 transition-colors"
                    >
                      <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                      <span className="text-[12px] text-foreground truncate flex-1">{order.customer}</span>
                      <Badge variant="secondary" className={cn("text-[9px] px-1.5 py-0", priorityColors[order.priority])}>
                        {order.priority}
                      </Badge>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </motion.div>

          {/* Quick stats */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="bg-card rounded-xl border border-border/40 shadow-sm p-4"
          >
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold font-display">Samenvatting</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted/30 p-3 text-center">
                <p className="text-lg font-bold font-display tabular-nums">{mockOrders.length}</p>
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
                <p className="text-lg font-bold font-display tabular-nums">{stats.totalVehicles}</p>
                <p className="text-[10px] text-muted-foreground">Voertuigen</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
