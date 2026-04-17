import { lazy, Suspense, useMemo } from "react";
import {
  Truck, MapPin, CheckCircle2, AlertTriangle,
  TrendingUp, ArrowRight, CalendarClock, Sparkles, Activity,
  BarChart3, CircleDot, Navigation, Timer,
} from "lucide-react";
import { useOrders } from "@/hooks/useOrders";
import { useVehicles } from "@/hooks/useVehicles";
import { usePendingReleaseCount } from "@/hooks/useVehicleCheckHistory";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { motion } from "framer-motion";
import { AutonomyScoreCard } from "@/components/dashboard/AutonomyScoreCard";
import { FinancialKPIWidget } from "@/components/dashboard/FinancialKPIWidget";
import { OperationalForecastWidget } from "@/components/dashboard/OperationalForecastWidget";
const MarginWidget = lazy(() =>
  import("@/components/dashboard/MarginWidget").then((m) => ({ default: m.MarginWidget })),
);
import { LoadingState } from "@/components/ui/LoadingState";
import { QueryError } from "@/components/QueryError";
import { KPIStrip } from "@/components/ui/KPIStrip";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { OrderStatus } from "@/components/ui/StatusBadge";

const Dashboard = () => {
  const today = new Date();
  const todayFormatted = today.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const { effectiveRole } = useAuth();
  const canSeeVehicleCheck = effectiveRole === "admin" || effectiveRole === "planner";
  const { data: pendingReleaseCount = 0 } = usePendingReleaseCount();
  const { data: ordersData, isLoading: ordersLoading, isError: ordersError, refetch: refetchOrders } = useOrders();
  const orders = ordersData?.orders ?? [];
  const { data: vehicles = [], isLoading: vehiclesLoading, isError: vehiclesError, refetch: refetchVehicles } = useVehicles();
  const isLoading = ordersLoading || vehiclesLoading;
  const isError = ordersError || vehiclesError;

  const stats = useMemo(() => {
    const byStatus = orders.reduce((acc, o) => {
      acc[o.status] = (acc[o.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const spoedOrders = orders.filter((o) => o.priority === "spoed" || o.priority === "hoog");
    const onderwegOrders = orders.filter((o) => o.status === "IN_TRANSIT");
    const totalWeight = orders.reduce((s, o) => s + o.totalWeight, 0);
    const overdueOrders = orders.filter((o) => {
      if (o.status === "DELIVERED" || o.status === "CANCELLED") return false;
      return o.estimatedDelivery && new Date(o.estimatedDelivery) < today;
    });
    return { byStatus, spoedOrders, onderwegOrders, totalWeight, totalVehicles: vehicles.length, overdueOrders };
  }, [orders, vehicles]);

  const recentOrders = useMemo(() =>
    [...orders]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 6),
    [orders]
  );

  const aiInsights = useMemo(() => {
    const insights: { type: "warning" | "opportunity" | "info"; text: string }[] = [];
    if (stats.overdueOrders.length > 0) {
      insights.push({ type: "warning", text: `${stats.overdueOrders.length} order${stats.overdueOrders.length > 1 ? "s" : ""} ${stats.overdueOrders.length > 1 ? "lopen" : "loopt"} risico op vertraging op basis van huidige status` });
    }
    const totalWeight = orders.reduce((s, o) => s + o.totalWeight, 0);
    const totalCapacity = vehicles.reduce((s, v) => s + v.capacityKg, 0);
    const loadPct = totalCapacity > 0 ? Math.round((totalWeight / totalCapacity) * 100) : 0;
    if (loadPct < 50 && totalCapacity > 0) {
      insights.push({ type: "opportunity", text: `Beladingsgraad is ${loadPct}%, er is ruimte voor ${Math.round((totalCapacity - totalWeight) / 1000)} ton extra lading` });
    } else if (loadPct > 85) {
      insights.push({ type: "warning", text: `Beladingsgraad is ${loadPct}%, vloot nadert maximale capaciteit` });
    }
    const plannedCount = orders.filter(o => o.status === "PLANNED" || o.status === "IN_TRANSIT").length;
    if (plannedCount > 0) {
      insights.push({ type: "info", text: `${plannedCount} ritten actief gepland, capaciteit wordt gemonitord` });
    }
    const delivered = stats.byStatus["DELIVERED"] || 0;
    if (orders.length > 0 && delivered > 0) {
      const deliveryRate = Math.round((delivered / orders.length) * 100);
      insights.push({ type: "info", text: `Leveringsratio: ${deliveryRate}% van alle orders succesvol afgeleverd` });
    }
    if (insights.length === 0) {
      insights.push({ type: "info", text: "Alle systemen operationeel, geen bijzonderheden gedetecteerd" });
    }
    return insights.slice(0, 4);
  }, [orders, vehicles, stats]);

  if (isLoading) return <LoadingState message="Dashboard laden..." />;
  if (isError) return <QueryError message="Kan dashboardgegevens niet laden." onRetry={() => { refetchOrders(); refetchVehicles(); }} />;

  return (
    <div className="-m-6 min-h-[calc(100vh-3rem)] flex flex-col bg-muted/30">
      {/* Luxe hero header */}
      <div className="relative bg-card border-b border-border/50 shrink-0">
        <span className="absolute top-0 left-0 right-0 h-px pointer-events-none" style={{ background: "linear-gradient(90deg, transparent, hsl(var(--gold) / 0.4), transparent)" }} />
        <div className="px-6 py-5">
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="w-4 h-px bg-[hsl(var(--gold))]" />
            <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-[hsl(var(--gold-deep))]">Dashboard</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground leading-tight" style={{ fontFamily: "var(--font-display)" }}>
            Operationeel overzicht
          </h1>
          <p className="text-xs text-muted-foreground mt-1.5">{todayFormatted}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1400px] mx-auto px-6 pt-5 pb-8 space-y-5">

          {/* AI Inzichten */}
          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="card--luxe p-5 relative">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, hsl(var(--gold-soft)) 0%, hsl(var(--gold) / 0.3) 100%)" }}>
                <Sparkles className="h-4 w-4 text-[hsl(var(--gold-deep))]" />
              </div>
              <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-[hsl(var(--gold-deep))]" style={{ fontFamily: "var(--font-display)" }}>
                AI Inzichten
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {aiInsights.map((insight, i) => (
                <div key={i} className="flex items-start gap-2.5 p-3 rounded-lg" style={{ background: "hsl(var(--gold-soft) / 0.15)", border: "1px solid hsl(var(--gold) / 0.12)" }}>
                  {insight.type === "warning" && <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />}
                  {insight.type === "opportunity" && <TrendingUp className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />}
                  {insight.type === "info" && <Activity className="h-4 w-4 text-[hsl(var(--gold-deep))] shrink-0 mt-0.5" />}
                  <p className="text-xs text-foreground leading-relaxed">{insight.text}</p>
                </div>
              ))}
            </div>
          </motion.section>

          {/* KPI Strip */}
          <KPIStrip
            columns={6}
            items={[
              { label: "Totaal orders", value: orders.length, icon: BarChart3, iconColor: "text-blue-600", iconBg: "bg-blue-500/10" },
              { label: "Voertuigen", value: vehicles.length, icon: Truck, iconColor: "text-violet-600", iconBg: "bg-violet-500/10" },
              { label: "Nieuw", value: (stats.byStatus["DRAFT"] || 0) + (stats.byStatus["PENDING"] || 0), icon: CircleDot, iconColor: "text-sky-600", iconBg: "bg-sky-500/10" },
              { label: "Onderweg", value: stats.byStatus["IN_TRANSIT"] || 0, icon: Navigation, iconColor: "text-primary", iconBg: "bg-primary/10" },
              { label: "Afgeleverd", value: stats.byStatus["DELIVERED"] || 0, icon: CheckCircle2, iconColor: "text-emerald-600", iconBg: "bg-emerald-500/10" },
              { label: "Achterstallig", value: stats.overdueOrders.length, icon: Timer, iconColor: stats.overdueOrders.length > 0 ? "text-destructive" : "text-muted-foreground", iconBg: stats.overdueOrders.length > 0 ? "bg-destructive/10" : "bg-muted" },
            ]}
          />

          {/* Financial & Forecast widgets */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <FinancialKPIWidget orders={orders} vehicles={vehicles} />
            <OperationalForecastWidget vehicles={vehicles} orders={orders} />
          </div>

          {/* Margin widget */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Suspense fallback={<div className="h-64 rounded-lg border border-border bg-card animate-pulse" />}>
              <MarginWidget />
            </Suspense>
          </div>

          {/* AI Autonomy + Voertuigcheck */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <AutonomyScoreCard compact />
            {canSeeVehicleCheck && (
              <Link
                to="/voertuigcheck?status=DAMAGE_FOUND"
                className="card--luxe p-4 flex items-center gap-4 hover:shadow-md transition-shadow group"
              >
                <div className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: pendingReleaseCount > 0 ? "hsl(0 80% 95%)" : "hsl(var(--gold-soft))", color: pendingReleaseCount > 0 ? "hsl(0 65% 40%)" : "hsl(var(--gold-deep))" }}>
                  <ShieldAlert className="h-6 w-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] uppercase tracking-[0.28em] font-semibold text-[hsl(var(--gold-deep))] mb-1" style={{ fontFamily: "var(--font-display)" }}>
                    Voertuigcheck
                  </div>
                  <div className="text-lg font-semibold leading-tight" style={{ fontFamily: "var(--font-display)" }}>
                    Te vrijgeven voertuigchecks
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">Checks met schade die op planner-vrijgave wachten.</p>
                </div>
                <div className="text-[2rem] font-semibold tabular-nums shrink-0"
                  style={{ fontFamily: "var(--font-display)", color: pendingReleaseCount > 0 ? "hsl(0 65% 40%)" : "hsl(var(--muted-foreground))" }}>
                  {pendingReleaseCount}
                </div>
              </Link>
            )}
          </div>

          {/* Recente orders */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card--luxe overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: "hsl(var(--gold) / 0.15)" }}>
              <div className="flex items-center gap-2.5">
                <CalendarClock className="h-4 w-4 text-[hsl(var(--gold-deep))]" />
                <h2 className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>Recente orders</h2>
              </div>
              <Link to="/orders" className="text-xs text-[hsl(var(--gold-deep))] hover:text-foreground font-medium flex items-center gap-1 transition-colors">
                Bekijk alles <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr className="border-b" style={{ borderColor: "hsl(var(--gold) / 0.1)", background: "hsl(var(--gold-soft) / 0.1)" }}>
                    <th className="table-header">Order</th>
                    <th className="table-header">Klant</th>
                    <th className="table-header hidden md:table-cell">Bezorging</th>
                    <th className="table-header text-right hidden sm:table-cell">Gewicht</th>
                    <th className="table-header">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {recentOrders.map((order) => (
                    <tr key={order.id} className="table-row">
                      <td className="table-cell">
                        <Link to={`/orders/${order.id}`} className="font-mono text-sm font-medium text-foreground hover:text-[hsl(var(--gold-deep))] transition-colors">
                          {order.orderNumber}
                        </Link>
                      </td>
                      <td className="table-cell text-foreground/80">{order.customer}</td>
                      <td className="table-cell text-muted-foreground hidden md:table-cell">
                        <span className="flex items-center gap-1 truncate max-w-[240px]">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {order.deliveryAddress}
                        </span>
                      </td>
                      <td className="table-cell text-foreground/80 text-right tabular-nums font-medium hidden sm:table-cell">
                        {order.totalWeight.toLocaleString()} kg
                      </td>
                      <td className="table-cell">
                        <StatusBadge status={order.status as OrderStatus} />
                      </td>
                    </tr>
                  ))}
                  {recentOrders.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">Geen orders gevonden</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>

        </div>
      </div>
    </div>
  );
};

export default Dashboard;
