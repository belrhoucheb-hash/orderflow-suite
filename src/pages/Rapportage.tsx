import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3, Clock, Truck, Brain, Users, Loader2, Package,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

/* ------------------------------------------------------------------ */
/*  Data hooks                                                         */
/* ------------------------------------------------------------------ */

function useRawOrders() {
  return useQuery({
    queryKey: ["rapportage-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, created_at, status, updated_at, client_name, vehicle_id")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useClients() {
  return useQuery({
    queryKey: ["rapportage-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name")
        .eq("is_active", true);
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useVehicles() {
  return useQuery({
    queryKey: ["rapportage-vehicles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("id, code, name")
        .eq("is_active", true);
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useAiUsage() {
  return useQuery({
    queryKey: ["rapportage-ai-usage"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_usage_log" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      // Table may not exist yet – return empty gracefully
      if (error) return [];
      return (data as any[]) ?? [];
    },
  });
}

function useVehicleAvailability() {
  return useQuery({
    queryKey: ["rapportage-vehicle-availability"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_availability")
        .select("vehicle_id, date, status")
        .order("date", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const Rapportage = () => {
  const today = new Date();
  const { data: orders = [], isLoading: ordersLoading } = useRawOrders();
  const { data: clients = [], isLoading: clientsLoading } = useClients();
  const { data: vehicles = [], isLoading: vehiclesLoading } = useVehicles();
  const { data: aiUsage = [], isLoading: aiLoading } = useAiUsage();
  const { data: availability = [], isLoading: availLoading } = useVehicleAvailability();

  const isLoading = ordersLoading || clientsLoading || vehiclesLoading || aiLoading || availLoading;

  /* ---------- Orders per week (last 12 weeks) ---------- */
  const ordersPerWeek = useMemo(() => {
    const weeks: Record<string, number> = {};
    const now = new Date();
    // Initialise last 12 weeks
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * 7);
      const label = `W${getISOWeek(d)}`;
      weeks[label] = 0;
    }
    orders.forEach((o) => {
      const d = new Date(o.created_at);
      const diffWeeks = Math.floor((now.getTime() - d.getTime()) / (7 * 86400000));
      if (diffWeeks < 12) {
        const label = `W${getISOWeek(d)}`;
        if (label in weeks) weeks[label]++;
      }
    });
    return Object.entries(weeks).map(([week, count]) => ({ week, orders: count }));
  }, [orders]);

  /* ---------- Orders per maand (last 6 months) ---------- */
  const ordersPerMonth = useMemo(() => {
    const months: Record<string, number> = {};
    const monthNames = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const label = `${monthNames[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
      months[label] = 0;
    }
    orders.forEach((o) => {
      const d = new Date(o.created_at);
      const label = `${monthNames[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
      if (label in months) months[label]++;
    });
    return Object.entries(months).map(([month, count]) => ({ month, orders: count }));
  }, [orders]);

  /* ---------- Gemiddelde levertijd ---------- */
  const avgDeliveryDays = useMemo(() => {
    const delivered = orders.filter((o) => o.status === "DELIVERED" && o.updated_at && o.created_at);
    if (delivered.length === 0) return null;
    const totalDays = delivered.reduce((sum, o) => {
      const created = new Date(o.created_at).getTime();
      const updated = new Date(o.updated_at).getTime();
      return sum + (updated - created) / 86400000;
    }, 0);
    return (totalDays / delivered.length).toFixed(1);
  }, [orders]);

  /* ---------- Voertuigbenutting ---------- */
  const vehicleUtilisation = useMemo(() => {
    if (vehicles.length === 0) return [];
    // Count orders per vehicle in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentOrders = orders.filter(
      (o) => new Date(o.created_at) >= thirtyDaysAgo && o.vehicle_id
    );
    const countByVehicle: Record<string, number> = {};
    recentOrders.forEach((o) => {
      if (o.vehicle_id) countByVehicle[o.vehicle_id] = (countByVehicle[o.vehicle_id] || 0) + 1;
    });

    // Also check availability table for non-available days
    const unavailDays: Record<string, number> = {};
    availability
      .filter((a) => new Date(a.date) >= thirtyDaysAgo && a.status !== "available")
      .forEach((a) => {
        unavailDays[a.vehicle_id] = (unavailDays[a.vehicle_id] || 0) + 1;
      });

    return vehicles.map((v) => {
      const orderCount = countByVehicle[v.id] || 0;
      const unavailCount = unavailDays[v.id] || 0;
      const availableDays = 30 - unavailCount;
      const pct = availableDays > 0 ? Math.min(100, Math.round((orderCount / availableDays) * 100)) : 0;
      return { name: v.code || v.name, pct, orders: orderCount };
    });
  }, [vehicles, orders, availability]);

  /* ---------- AI kosten ---------- */
  const aiStats = useMemo(() => {
    if (aiUsage.length === 0) return { totalCalls: 0, totalCost: 0, avgCost: 0, byModel: [] as { model: string; calls: number; cost: number }[] };
    const totalCalls = aiUsage.length;
    const totalCost = aiUsage.reduce((s, r) => s + (r.cost ?? r.total_cost ?? 0), 0);
    const avgCost = totalCalls > 0 ? totalCost / totalCalls : 0;

    const modelMap: Record<string, { calls: number; cost: number }> = {};
    aiUsage.forEach((r) => {
      const model = r.model || "onbekend";
      if (!modelMap[model]) modelMap[model] = { calls: 0, cost: 0 };
      modelMap[model].calls++;
      modelMap[model].cost += r.cost ?? r.total_cost ?? 0;
    });

    const byModel = Object.entries(modelMap)
      .map(([model, d]) => ({ model, ...d }))
      .sort((a, b) => b.cost - a.cost);

    return { totalCalls, totalCost, avgCost, byModel };
  }, [aiUsage]);

  /* ---------- Top klanten ---------- */
  const topClients = useMemo(() => {
    const countMap: Record<string, number> = {};
    orders.forEach((o) => {
      const name = o.client_name || "Onbekend";
      countMap[name] = (countMap[name] || 0) + 1;
    });
    return Object.entries(countMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [orders]);

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
            Rapportage
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Overzicht van prestaties, kosten en klantactiviteit
          </p>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Totaal orders", value: orders.length, icon: Package, color: "text-blue-600", bg: "bg-blue-500/8" },
          { label: "Gem. levertijd", value: avgDeliveryDays ? `${avgDeliveryDays} d` : "—", icon: Clock, color: "text-amber-600", bg: "bg-amber-500/8" },
          { label: "Voertuigen", value: vehicles.length, icon: Truck, color: "text-primary", bg: "bg-primary/8" },
          { label: "AI aanroepen", value: aiStats.totalCalls, icon: Brain, color: "text-violet-600", bg: "bg-violet-500/8" },
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

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Orders per week */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card className="rounded-xl border-border/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold font-display flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                Orders per week (laatste 12 weken)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={ordersPerWeek} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="week" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }}
                    labelStyle={{ fontWeight: 600 }}
                  />
                  <Bar dataKey="orders" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        {/* Orders per maand */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
          <Card className="rounded-xl border-border/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold font-display flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                Orders per maand (laatste 6 maanden)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={ordersPerMonth} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }}
                    labelStyle={{ fontWeight: 600 }}
                  />
                  <Bar dataKey="orders" fill="hsl(var(--chart-2, 142 71% 45%))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Voertuigbenutting + AI kosten */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Voertuigbenutting */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="rounded-xl border-border/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold font-display flex items-center gap-2">
                <Truck className="h-4 w-4 text-muted-foreground" />
                Voertuigbenutting (laatste 30 dagen)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {vehicleUtilisation.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Geen voertuigen gevonden</div>
              ) : (
                <div className="space-y-3">
                  {vehicleUtilisation.map((v) => (
                    <div key={v.name} className="flex items-center gap-3">
                      <span className="text-[12px] font-medium w-20 truncate">{v.name}</span>
                      <div className="flex-1 h-5 bg-muted/30 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            v.pct >= 70 ? "bg-emerald-500" : v.pct >= 40 ? "bg-amber-500" : "bg-red-400"
                          )}
                          style={{ width: `${v.pct}%` }}
                        />
                      </div>
                      <span className="text-[12px] font-semibold tabular-nums w-12 text-right">{v.pct}%</span>
                      <span className="text-[10px] text-muted-foreground w-16 text-right">{v.orders} ritten</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* AI kosten overzicht */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          <Card className="rounded-xl border-border/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold font-display flex items-center gap-2">
                <Brain className="h-4 w-4 text-muted-foreground" />
                AI kosten overzicht
              </CardTitle>
            </CardHeader>
            <CardContent>
              {aiStats.totalCalls === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Geen AI-gebruik geregistreerd
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg bg-muted/30 p-3 text-center">
                      <p className="text-lg font-bold font-display tabular-nums">{aiStats.totalCalls}</p>
                      <p className="text-[10px] text-muted-foreground">Aanroepen</p>
                    </div>
                    <div className="rounded-lg bg-muted/30 p-3 text-center">
                      <p className="text-lg font-bold font-display tabular-nums">
                        €{aiStats.totalCost.toFixed(2)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">Totaal kosten</p>
                    </div>
                    <div className="rounded-lg bg-muted/30 p-3 text-center">
                      <p className="text-lg font-bold font-display tabular-nums">
                        €{aiStats.avgCost.toFixed(3)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">Gem. per call</p>
                    </div>
                  </div>
                  {aiStats.byModel.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-border/30 bg-muted/20">
                            <th className="px-3 py-1.5 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">Model</th>
                            <th className="px-3 py-1.5 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">Calls</th>
                            <th className="px-3 py-1.5 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">Kosten</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/20">
                          {aiStats.byModel.map((m) => (
                            <tr key={m.model} className="hover:bg-muted/20 transition-colors">
                              <td className="px-3 py-1.5 text-[12px] font-mono">{m.model}</td>
                              <td className="px-3 py-1.5 text-[12px] text-right tabular-nums">{m.calls}</td>
                              <td className="px-3 py-1.5 text-[12px] text-right tabular-nums font-medium">€{m.cost.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Top klanten */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <Card className="rounded-xl border-border/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold font-display flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              Top klanten (meeste orders)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topClients.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Geen klantdata beschikbaar</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/30 bg-muted/20">
                      <th className="px-4 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">#</th>
                      <th className="px-4 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">Klant</th>
                      <th className="px-4 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">Orders</th>
                      <th className="px-4 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">Aandeel</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {topClients.map((c, i) => (
                      <tr key={c.name} className="hover:bg-muted/20 transition-colors duration-100">
                        <td className="px-4 py-2 text-[12px] text-muted-foreground font-mono">{i + 1}</td>
                        <td className="px-4 py-2 text-[13px] font-medium text-foreground">{c.name}</td>
                        <td className="px-4 py-2 text-[13px] text-right tabular-nums font-semibold">{c.count}</td>
                        <td className="px-4 py-2 text-[13px] text-right tabular-nums text-muted-foreground">
                          {orders.length > 0 ? ((c.count / orders.length) * 100).toFixed(1) : 0}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default Rapportage;
