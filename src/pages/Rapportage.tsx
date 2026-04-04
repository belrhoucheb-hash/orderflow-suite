import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3, Clock, Truck, Brain, Users, Loader2, Package, Download,
} from "lucide-react";
import { ProfitabilityReport } from "@/components/rapportage/ProfitabilityReport";
import { EmballageReport } from "@/components/rapportage/EmballageReport";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell,
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

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function exportToCSV(data: any[], filename: string) {
  if (data.length === 0) return;
  const headers = Object.keys(data[0]).join(",");
  const rows = data.map(row => Object.values(row).map(v => `"${v}"`).join(","));
  const csv = [headers, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/*  Status pie chart colours                                           */
/* ------------------------------------------------------------------ */

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "#3b82f6",        // blue
  PENDING: "#f59e0b",      // amber
  PLANNED: "#8b5cf6",      // violet
  IN_TRANSIT: "#ef4444",   // red
  DELIVERED: "#22c55e",    // green
  CANCELLED: "#6b7280",    // gray
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Nieuw",
  PENDING: "In behandeling",
  PLANNED: "Gepland",
  IN_TRANSIT: "Onderweg",
  DELIVERED: "Afgeleverd",
  CANCELLED: "Geannuleerd",
};

function getStatusColor(status: string): string {
  if (status in STATUS_COLORS) return STATUS_COLORS[status];
  return "#94a3b8"; // fallback slate
}

/* ------------------------------------------------------------------ */
/*  Date presets                                                       */
/* ------------------------------------------------------------------ */

interface DatePreset {
  label: string;
  getRange: () => [Date, Date];
}

function getDatePresets(): DatePreset[] {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return [
    {
      label: "Vandaag",
      getRange: () => [startOfDay, now],
    },
    {
      label: "Deze week",
      getRange: () => {
        const d = new Date(startOfDay);
        const day = d.getDay() || 7; // Mon=1
        d.setDate(d.getDate() - day + 1);
        return [d, now];
      },
    },
    {
      label: "Deze maand",
      getRange: () => [new Date(now.getFullYear(), now.getMonth(), 1), now],
    },
    {
      label: "Afgelopen 3 maanden",
      getRange: () => {
        const d = new Date(now);
        d.setMonth(d.getMonth() - 3);
        return [d, now];
      },
    },
    {
      label: "Dit jaar",
      getRange: () => [new Date(now.getFullYear(), 0, 1), now],
    },
  ];
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const Rapportage = () => {
  const today = new Date();

  /* ---------- Date range state (default: last 30 days) ---------- */
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toDateStr(d);
  });
  const [endDate, setEndDate] = useState<string>(() => toDateStr(new Date()));
  const [compareEnabled, setCompareEnabled] = useState(false);

  const datePresets = useMemo(() => getDatePresets(), []);

  const { data: orders = [], isLoading: ordersLoading, isError: ordersError, refetch: refetchOrders } = useRawOrders();
  const { data: clients = [], isLoading: clientsLoading } = useClients();
  const { data: vehicles = [], isLoading: vehiclesLoading } = useVehicles();
  const { data: aiUsage = [], isLoading: aiLoading } = useAiUsage();
  const { data: availability = [], isLoading: availLoading } = useVehicleAvailability();

  const isLoading = ordersLoading || clientsLoading || vehiclesLoading || aiLoading || availLoading;
  const isError = ordersError;

  /* ---------- Filtered orders by date range ---------- */
  const filteredOrders = useMemo(() => {
    const start = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T23:59:59");
    return orders.filter((o) => {
      const d = new Date(o.created_at);
      return d >= start && d <= end;
    });
  }, [orders, startDate, endDate]);

  /* ---------- Previous period orders (for comparison) ---------- */
  const prevPeriodOrders = useMemo(() => {
    if (!compareEnabled) return [];
    const start = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T23:59:59");
    const durationMs = end.getTime() - start.getTime();
    const prevStart = new Date(start.getTime() - durationMs - 86400000); // shift back by duration + 1 day
    const prevEnd = new Date(start.getTime() - 86400000); // day before current start
    return orders.filter((o) => {
      const d = new Date(o.created_at);
      return d >= prevStart && d <= prevEnd;
    });
  }, [orders, startDate, endDate, compareEnabled]);

  /* ---------- Orders per week ---------- */
  const ordersPerWeek = useMemo(() => {
    const weeks: Record<string, number> = {};
    const prevWeeks: Record<string, number> = {};
    const now = new Date();
    // Initialise last 12 weeks
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * 7);
      const label = `W${getISOWeek(d)}`;
      weeks[label] = 0;
      prevWeeks[label] = 0;
    }
    filteredOrders.forEach((o) => {
      const d = new Date(o.created_at);
      const diffWeeks = Math.floor((now.getTime() - d.getTime()) / (7 * 86400000));
      if (diffWeeks < 12) {
        const label = `W${getISOWeek(d)}`;
        if (label in weeks) weeks[label]++;
      }
    });
    if (compareEnabled) {
      prevPeriodOrders.forEach((o) => {
        const d = new Date(o.created_at);
        const diffWeeks = Math.floor((now.getTime() - d.getTime()) / (7 * 86400000));
        if (diffWeeks < 24 && diffWeeks >= 12) {
          // Map to the corresponding current-period week slot
          const mappedDate = new Date(d);
          mappedDate.setDate(mappedDate.getDate() + 12 * 7);
          const label = `W${getISOWeek(mappedDate)}`;
          if (label in prevWeeks) prevWeeks[label]++;
        }
      });
    }
    return Object.entries(weeks).map(([week, count]) => ({
      week,
      orders: count,
      ...(compareEnabled ? { vorige: prevWeeks[week] || 0 } : {}),
    }));
  }, [filteredOrders, prevPeriodOrders, compareEnabled]);

  /* ---------- Orders per maand (last 6 months) ---------- */
  const ordersPerMonth = useMemo(() => {
    const months: Record<string, number> = {};
    const prevMonths: Record<string, number> = {};
    const monthNames = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const label = `${monthNames[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
      months[label] = 0;
      prevMonths[label] = 0;
    }
    filteredOrders.forEach((o) => {
      const d = new Date(o.created_at);
      const label = `${monthNames[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
      if (label in months) months[label]++;
    });
    if (compareEnabled) {
      // Map previous period orders to same month slots shifted back
      prevPeriodOrders.forEach((o) => {
        const d = new Date(o.created_at);
        // Shift month forward by 6 to map to current slot
        const shifted = new Date(d);
        shifted.setMonth(shifted.getMonth() + 6);
        const label = `${monthNames[shifted.getMonth()]} '${String(shifted.getFullYear()).slice(2)}`;
        if (label in prevMonths) prevMonths[label]++;
      });
    }
    return Object.entries(months).map(([month, count]) => ({
      month,
      orders: count,
      ...(compareEnabled ? { vorige: prevMonths[month] || 0 } : {}),
    }));
  }, [filteredOrders, prevPeriodOrders, compareEnabled]);

  /* ---------- Gemiddelde levertijd ---------- */
  const avgDeliveryDays = useMemo(() => {
    const delivered = filteredOrders.filter((o) => o.status === "DELIVERED" && o.updated_at && o.created_at);
    if (delivered.length === 0) return null;
    const totalDays = delivered.reduce((sum, o) => {
      const created = new Date(o.created_at).getTime();
      const updated = new Date(o.updated_at).getTime();
      return sum + (updated - created) / 86400000;
    }, 0);
    return (totalDays / delivered.length).toFixed(1);
  }, [filteredOrders]);

  /* ---------- Voertuigbenutting ---------- */
  const vehicleUtilisation = useMemo(() => {
    if (vehicles.length === 0) return [];
    const start = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T23:59:59");
    const durationDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
    const recentOrders = filteredOrders.filter((o) => o.vehicle_id);
    const countByVehicle: Record<string, number> = {};
    recentOrders.forEach((o) => {
      if (o.vehicle_id) countByVehicle[o.vehicle_id] = (countByVehicle[o.vehicle_id] || 0) + 1;
    });

    // Also check availability table for non-available days
    const unavailDays: Record<string, number> = {};
    availability
      .filter((a) => {
        const d = new Date(a.date);
        return d >= start && d <= end && a.status !== "available";
      })
      .forEach((a) => {
        unavailDays[a.vehicle_id] = (unavailDays[a.vehicle_id] || 0) + 1;
      });

    return vehicles.map((v) => {
      const orderCount = countByVehicle[v.id] || 0;
      const unavailCount = unavailDays[v.id] || 0;
      const availableDays = durationDays - unavailCount;
      const pct = availableDays > 0 ? Math.min(100, Math.round((orderCount / availableDays) * 100)) : 0;
      return { name: v.code || v.name, pct, orders: orderCount };
    });
  }, [vehicles, filteredOrders, availability, startDate, endDate]);

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
    filteredOrders.forEach((o) => {
      const name = o.client_name || "Onbekend";
      countMap[name] = (countMap[name] || 0) + 1;
    });
    return Object.entries(countMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [filteredOrders]);

  /* ---------- Status distribution for pie chart ---------- */
  const statusDistribution = useMemo(() => {
    const countMap: Record<string, number> = {};
    filteredOrders.forEach((o) => {
      const status = o.status || "onbekend";
      countMap[status] = (countMap[status] || 0) + 1;
    });
    return Object.entries(countMap)
      .map(([status, count]) => ({
        name: STATUS_LABELS[status] || status,
        value: count,
        color: getStatusColor(status),
      }))
      .sort((a, b) => b.value - a.value);
  }, [filteredOrders]);

  /* ---------- Export handler ---------- */
  const handleExport = () => {
    const exportData = filteredOrders.map((o) => ({
      id: o.id,
      created_at: o.created_at,
      status: o.status,
      updated_at: o.updated_at || "",
      client_name: o.client_name || "",
      vehicle_id: o.vehicle_id || "",
    }));
    exportToCSV(exportData, `rapportage-orders-${startDate}-tot-${endDate}.csv`);
  };

  if (isLoading) {
    return <LoadingState message="Rapportage laden..." />;
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-sm font-semibold text-foreground mb-1">Kan gegevens niet laden</p>
        <p className="text-xs text-muted-foreground mb-3">Controleer je verbinding</p>
        <button onClick={() => refetchOrders()} className="text-xs text-primary hover:underline">Opnieuw proberen</button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <PageHeader
          title="Rapportage"
          subtitle="Overzicht van prestaties, kosten en klantactiviteit"
        />

        {/* Date range picker + Export */}
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-xs text-muted-foreground font-medium">Van</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-8 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <label className="text-xs text-muted-foreground font-medium">Tot</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-8 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Exporteer
            </button>
          </div>

          {/* Quick presets */}
          <div className="flex items-center gap-1 flex-wrap">
            {datePresets.map((preset) => (
              <button
                key={preset.label}
                onClick={() => {
                  const [s, e] = preset.getRange();
                  setStartDate(toDateStr(s));
                  setEndDate(toDateStr(e));
                }}
                className="text-xs px-2 py-0.5 rounded-full border border-border/50 bg-muted/30 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Compare toggle */}
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={compareEnabled}
              onChange={(e) => setCompareEnabled(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
            />
            <span className="text-xs text-muted-foreground">Vergelijk met vorige periode</span>
          </label>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Totaal orders", value: filteredOrders.length, icon: Package, color: "text-blue-600", bg: "bg-blue-500/8" },
          { label: "Gem. levertijd", value: avgDeliveryDays ? `${avgDeliveryDays} d` : "\u2014", icon: Clock, color: "text-amber-600", bg: "bg-amber-500/8" },
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
              <p className="text-xs text-muted-foreground truncate">{stat.label}</p>
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
                  {compareEnabled && (
                    <Bar dataKey="vorige" name="Vorige periode" fill="hsl(var(--primary))" fillOpacity={0.25} radius={[4, 4, 0, 0]} />
                  )}
                  <Bar dataKey="orders" name="Huidige periode" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
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
                  {compareEnabled && (
                    <Bar dataKey="vorige" name="Vorige periode" fill="hsl(var(--chart-2, 142 71% 45%))" fillOpacity={0.25} radius={[4, 4, 0, 0]} />
                  )}
                  <Bar dataKey="orders" name="Huidige periode" fill="hsl(var(--chart-2, 142 71% 45%))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Status distribution pie + Voertuigbenutting */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Status distribution pie chart */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.09 }}>
          <Card className="rounded-xl border-border/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold font-display flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                Statusverdeling orders
              </CardTitle>
            </CardHeader>
            <CardContent>
              {statusDistribution.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Geen orderdata beschikbaar</div>
              ) : (
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width="60%" height={220}>
                    <PieChart>
                      <Pie
                        data={statusDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={85}
                        paddingAngle={2}
                        dataKey="value"
                        nameKey="name"
                        stroke="none"
                      >
                        {statusDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }}
                        formatter={(value: number) => [`${value} orders`, ""]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-1.5">
                    {statusDistribution.map((entry) => (
                      <div key={entry.name} className="flex items-center gap-2">
                        <div
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: entry.color }}
                        />
                        <span className="text-xs text-foreground truncate flex-1">{entry.name}</span>
                        <span className="text-xs font-semibold tabular-nums">{entry.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Voertuigbenutting */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="rounded-xl border-border/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold font-display flex items-center gap-2">
                <Truck className="h-4 w-4 text-muted-foreground" />
                Voertuigbenutting
              </CardTitle>
            </CardHeader>
            <CardContent>
              {vehicleUtilisation.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Geen voertuigen gevonden</div>
              ) : (
                <div className="space-y-3">
                  {vehicleUtilisation.map((v) => (
                    <div key={v.name} className="flex items-center gap-3">
                      <span className="text-sm font-medium w-20 truncate">{v.name}</span>
                      <div className="flex-1 h-5 bg-muted/30 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            v.pct >= 70 ? "bg-emerald-500" : v.pct >= 40 ? "bg-amber-500" : "bg-red-400"
                          )}
                          style={{ width: `${v.pct}%` }}
                        />
                      </div>
                      <span className="text-sm font-semibold tabular-nums w-12 text-right">{v.pct}%</span>
                      <span className="text-xs text-muted-foreground w-16 text-right">{v.orders} ritten</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* AI kosten overzicht */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                      <p className="text-xs text-muted-foreground">Aanroepen</p>
                    </div>
                    <div className="rounded-lg bg-muted/30 p-3 text-center">
                      <p className="text-lg font-bold font-display tabular-nums">
                        &euro;{aiStats.totalCost.toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground">Totaal kosten</p>
                    </div>
                    <div className="rounded-lg bg-muted/30 p-3 text-center">
                      <p className="text-lg font-bold font-display tabular-nums">
                        &euro;{aiStats.avgCost.toFixed(3)}
                      </p>
                      <p className="text-xs text-muted-foreground">Gem. per call</p>
                    </div>
                  </div>
                  {aiStats.byModel.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-border/30 bg-muted/20">
                            <th className="px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60">Model</th>
                            <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60">Calls</th>
                            <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60">Kosten</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/20">
                          {aiStats.byModel.map((m) => (
                            <tr key={m.model} className="hover:bg-muted/20 transition-colors">
                              <td className="px-3 py-1.5 text-sm font-mono">{m.model}</td>
                              <td className="px-3 py-1.5 text-sm text-right tabular-nums">{m.calls}</td>
                              <td className="px-3 py-1.5 text-sm text-right tabular-nums font-medium">&euro;{m.cost.toFixed(2)}</td>
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
                      <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60">#</th>
                      <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60">Klant</th>
                      <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60">Orders</th>
                      <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60">Aandeel</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {topClients.map((c, i) => (
                      <tr key={c.name} className="hover:bg-muted/20 transition-colors duration-100">
                        <td className="px-4 py-2 text-sm text-muted-foreground font-mono">{i + 1}</td>
                        <td className="px-4 py-2 text-sm font-medium text-foreground">{c.name}</td>
                        <td className="px-4 py-2 text-sm text-right tabular-nums font-semibold">{c.count}</td>
                        <td className="px-4 py-2 text-sm text-right tabular-nums text-muted-foreground">
                          {filteredOrders.length > 0 ? ((c.count / filteredOrders.length) * 100).toFixed(1) : 0}%
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

      {/* Profitability report */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
      >
        <ProfitabilityReport />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <EmballageReport />
      </motion.div>
    </div>
  );
};

export default Rapportage;
