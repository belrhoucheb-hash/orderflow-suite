import { useMemo } from "react";
import {
  Truck, MapPin, CheckCircle2, AlertTriangle, Clock,
  TrendingUp, ArrowRight, CalendarClock, Phone, Mail,
  BarChart3, CircleDot, Navigation, Timer,
} from "lucide-react";
import { useOrders } from "@/hooks/useOrders";
import { useVehicles } from "@/hooks/useVehicles";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { FinancialKPIWidget } from "@/components/dashboard/FinancialKPIWidget";
import { OperationalForecastWidget } from "@/components/dashboard/OperationalForecastWidget";
import { MarginWidget } from "@/components/dashboard/MarginWidget";
import { toast } from "sonner";
import { LoadingState } from "@/components/ui/LoadingState";
import { QueryError } from "@/components/QueryError";
import { PageHeader } from "@/components/ui/PageHeader";
import { KPIStrip, type KPIItem } from "@/components/ui/KPIStrip";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { OrderStatus } from "@/components/ui/StatusBadge";

const overdueImpacts: Record<string, { label: string; color: string }> = {};

const Dashboard = () => {
  const today = new Date();
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
    return <LoadingState message="Dashboard laden..." />;
  }

  if (isError) {
    return (
      <QueryError
        message="Kan dashboardgegevens niet laden."
        onRetry={() => { refetchOrders(); refetchVehicles(); }}
      />
    );
  }

  return (
    <div className="page-container">
      {/* Header */}
      <PageHeader
        title="Operationeel Dashboard"
        subtitle={today.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
      />

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

      {/* Margin trend widget */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1">
          <MarginWidget />
        </div>
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
              <h2 className="section-title text-sm">Recente orders</h2>
            </div>
            <Link to="/orders" className="text-xs text-primary hover:underline flex items-center gap-1">
              Bekijk alles <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr className="border-b border-border/30 bg-muted/20">
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
                      <Link to={`/orders/${order.id}`} className="font-mono text-sm font-medium text-foreground hover:text-primary transition-colors">
                        {order.orderNumber}
                      </Link>
                    </td>
                    <td className="table-cell text-foreground/80">{order.customer}</td>
                    <td className="table-cell text-muted-foreground hidden md:table-cell">
                      <span className="flex items-center gap-1 truncate max-w-[180px]">
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
              <h2 className="section-title text-sm">Samenvatting</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted/30 p-3 text-center">
                <p className="card-stat__value text-lg">{orders.length}</p>
                <p className="card-stat__label">Totaal orders</p>
              </div>
              <div className="rounded-lg bg-muted/30 p-3 text-center">
                <p className="card-stat__value text-lg">{stats.byStatus["DELIVERED"] || 0}</p>
                <p className="card-stat__label">Afgeleverd</p>
              </div>
              <div className="rounded-lg bg-muted/30 p-3 text-center">
                <p className="card-stat__value text-lg">{stats.totalWeight.toLocaleString()}</p>
                <p className="card-stat__label">Totaal kg</p>
              </div>
              <div className="rounded-lg bg-muted/30 p-3 text-center">
                <p className="card-stat__value text-lg">{vehicles.length}</p>
                <p className="card-stat__label">Voertuigen</p>
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
              <h2 className="section-title text-sm">Aandachtspunten</h2>
            </div>
            <div className="space-y-2">
              {stats.overdueOrders.length > 0 ? (
                stats.overdueOrders.map((order) => (
                  <Popover key={order.id}>
                    <PopoverTrigger asChild>
                      <button className="w-full flex items-center gap-2.5 p-2.5 rounded-lg bg-destructive/5 border border-destructive/10 hover:bg-destructive/10 transition-colors text-left group">
                        <Clock className="h-3.5 w-3.5 text-destructive shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">{order.orderNumber}</p>
                          <p className="text-xs text-muted-foreground truncate">{order.customer}</p>
                        </div>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-3" side="left" align="start">
                      <p className="text-sm font-semibold font-display mb-2">Quick Actions</p>
                      <div className="space-y-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full justify-start gap-2 h-8 text-sm"
                          onClick={() => {
                            if (order.phone) {
                              window.open(`tel:${order.phone}`, "_self");
                            } else {
                              toast.error("Geen telefoonnummer beschikbaar");
                            }
                          }}
                        >
                          <Phone className="h-3 w-3" /> Bel Chauffeur
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full justify-start gap-2 h-8 text-sm"
                          onClick={() => {
                            if (order.email) {
                              window.open(`mailto:${order.email}`, "_self");
                            } else {
                              toast.error("Geen e-mailadres beschikbaar");
                            }
                          }}
                        >
                          <Mail className="h-3 w-3" /> Mail Klant
                        </Button>
                        <Link to={`/orders/${order.id}`}>
                          <Button variant="ghost" size="sm" className="w-full justify-start gap-2 h-8 text-sm text-primary">
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
                  <p className="text-sm text-muted-foreground">Geen achterstallige orders</p>
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
