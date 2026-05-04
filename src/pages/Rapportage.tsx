import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3, Clock, Truck, Brain, Users, Loader2, Package, Download, FileText, FileSpreadsheet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ProfitabilityReport } from "@/components/rapportage/ProfitabilityReport";
import Autonomie from "@/pages/Autonomie";
import { DeferredMount } from "@/components/performance/DeferredMount";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  exportOrderReport,
  exportOrdersCSV,
  type ReportOrder,
} from "@/utils/reportExporter";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell,
} from "recharts";

/* ------------------------------------------------------------------ */
/*  Data hooks                                                         */
/* ------------------------------------------------------------------ */

interface ReportOverviewKpis {
  totalOrders: number;
  avgDeliveryDays: number | null;
}

interface ReportOverviewChartItem {
  orders: number;
  previous_orders: number | null;
}

interface ReportOverviewWeekItem extends ReportOverviewChartItem {
  week_start: string;
}

interface ReportOverviewMonthItem extends ReportOverviewChartItem {
  month_start: string;
}

interface ReportOverviewTopClient {
  name: string;
  count: number;
}

interface ReportOverviewStatusItem {
  status: string;
  value: number;
}

interface ReportOverviewVehicleItem {
  vehicle_id: string;
  count: number;
}

interface ReportOverviewPayload {
  kpis: ReportOverviewKpis;
  ordersPerWeek: ReportOverviewWeekItem[];
  ordersPerMonth: ReportOverviewMonthItem[];
  topClients: ReportOverviewTopClient[];
  statusDistribution: ReportOverviewStatusItem[];
  vehicleOrders: ReportOverviewVehicleItem[];
}

const MONTH_NAMES = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

function toInt(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toDateOnlyIso(value: string): string {
  return value.includes("T") ? value.slice(0, 10) : value;
}

function getNextDateStr(dateStr: string): string {
  const next = new Date(`${dateStr}T00:00:00`);
  next.setDate(next.getDate() + 1);
  return toDateStr(next);
}

function formatMonthLabel(monthStart: string): string {
  const d = new Date(`${toDateOnlyIso(monthStart)}T00:00:00`);
  return `${MONTH_NAMES[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
}

function parseReportOverview(value: unknown): ReportOverviewPayload {
  const raw = (value ?? {}) as Record<string, any>;
  const kpis = (raw.kpis ?? {}) as Record<string, unknown>;

  return {
    kpis: {
      totalOrders: toInt(kpis.totalOrders),
      avgDeliveryDays: toNullableNumber(kpis.avgDeliveryDays),
    },
    ordersPerWeek: Array.isArray(raw.ordersPerWeek)
      ? raw.ordersPerWeek.map((item) => ({
          week_start: String(item.week_start ?? ""),
          orders: toInt(item.orders),
          previous_orders: toNullableNumber(item.previous_orders),
        }))
      : [],
    ordersPerMonth: Array.isArray(raw.ordersPerMonth)
      ? raw.ordersPerMonth.map((item) => ({
          month_start: String(item.month_start ?? ""),
          orders: toInt(item.orders),
          previous_orders: toNullableNumber(item.previous_orders),
        }))
      : [],
    topClients: Array.isArray(raw.topClients)
      ? raw.topClients.map((item) => ({
          name: String(item.name ?? "Onbekend"),
          count: toInt(item.count),
        }))
      : [],
    statusDistribution: Array.isArray(raw.statusDistribution)
      ? raw.statusDistribution.map((item) => ({
          status: String(item.status ?? "UNKNOWN"),
          value: toInt(item.value),
        }))
      : [],
    vehicleOrders: Array.isArray(raw.vehicleOrders)
      ? raw.vehicleOrders.map((item) => ({
          vehicle_id: String(item.vehicle_id ?? ""),
          count: toInt(item.count),
        }))
      : [],
  };
}

function useReportOverview(startDate: string, endDate: string, compareEnabled: boolean, enabled = true) {
  return useQuery({
    queryKey: ["rapportage-overview", startDate, endDate, compareEnabled],
    enabled,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("report_orders_overview_v1", {
        p_start_date: startDate,
        p_end_date: endDate,
        p_compare_enabled: compareEnabled,
      });
      if (error) throw error;
      return parseReportOverview(data);
    },
  });
}

function useVehicles(enabled = true) {
  return useQuery({
    queryKey: ["rapportage-vehicles"],
    enabled,
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

function useAiUsage(enabled = true) {
  return useQuery({
    queryKey: ["rapportage-ai-usage"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_usage_log" as any)
        .select("model, cost, total_cost, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      // Table may not exist yet – return empty gracefully
      if (error) return [];
      return (data as any[]) ?? [];
    },
  });
}

function useVehicleAvailability(enabled = true) {
  return useQuery({
    queryKey: ["rapportage-vehicle-availability"],
    enabled,
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

async function fetchReportOrdersForExport(startDate: string, endDate: string): Promise<ReportOrder[]> {
  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number, created_at, status, client_name, pickup_address, delivery_address, weight_kg, vehicle_id, updated_at")
    .gte("created_at", `${startDate}T00:00:00`)
    .lt("created_at", `${getNextDateStr(endDate)}T00:00:00`)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((order) => ({
    id: order.id,
    order_number: order.order_number ?? undefined,
    created_at: order.created_at,
    status: order.status,
    client_name: order.client_name,
    pickup_address: (order as any).pickup_address ?? null,
    delivery_address: (order as any).delivery_address ?? null,
    weight_kg: (order as any).weight_kg ?? null,
    vehicle_id: order.vehicle_id,
    updated_at: order.updated_at,
  }));
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
  /* ---------- Date range state (default: last 30 days) ---------- */
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toDateStr(d);
  });
  const [endDate, setEndDate] = useState<string>(() => toDateStr(new Date()));
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [section, setSection] = useState<"rapportage" | "autonomie">("rapportage");
  const [exportMode, setExportMode] = useState<"generic" | "pdf" | "csv" | null>(null);
  const { toast } = useToast();

  const datePresets = useMemo(() => getDatePresets(), []);

  const shouldLoadReportData = section === "rapportage";
  const { data: overview, isLoading: overviewLoading, isError: overviewError, refetch: refetchOverview } = useReportOverview(startDate, endDate, compareEnabled, shouldLoadReportData);
  const { data: vehicles = [], isLoading: vehiclesLoading } = useVehicles(shouldLoadReportData);
  const { data: aiUsage = [], isLoading: aiLoading } = useAiUsage(shouldLoadReportData);
  const { data: availability = [], isLoading: availLoading } = useVehicleAvailability(shouldLoadReportData);

  const isPrimaryLoading = overviewLoading;
  const isError = overviewError;

  /* ---------- Orders per week ---------- */
  const ordersPerWeek = useMemo(() => {
    return (overview?.ordersPerWeek ?? []).map((item) => {
      const weekDate = new Date(`${toDateOnlyIso(item.week_start)}T00:00:00`);
      return {
        week: `W${getISOWeek(weekDate)}`,
        orders: item.orders,
        ...(compareEnabled ? { vorige: item.previous_orders ?? 0 } : {}),
      };
    });
  }, [overview, compareEnabled]);

  /* ---------- Orders per maand (last 6 months) ---------- */
  const ordersPerMonth = useMemo(() => {
    return (overview?.ordersPerMonth ?? []).map((item) => ({
      month: formatMonthLabel(item.month_start),
      orders: item.orders,
      ...(compareEnabled ? { vorige: item.previous_orders ?? 0 } : {}),
    }));
  }, [overview, compareEnabled]);

  /* ---------- Gemiddelde levertijd ---------- */
  const avgDeliveryDays = overview?.kpis.avgDeliveryDays?.toFixed(1) ?? null;

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
    return overview?.topClients ?? [];
  }, [overview]);

  /* ---------- Status distribution for pie chart ---------- */
  const statusDistribution = useMemo(() => {
    return (overview?.statusDistribution ?? []).map((item) => ({
      name: STATUS_LABELS[item.status] || item.status,
      value: item.value,
      color: getStatusColor(item.status),
    }));
  }, [overview]);

  /* ---------- Voertuigbenutting ---------- */
  const vehicleUtilisation = useMemo(() => {
    if (vehicles.length === 0) return [];
    const start = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T23:59:59");
    const durationDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));

    const unavailDays: Record<string, number> = {};
    availability
      .filter((a) => {
        const d = new Date(a.date);
        return d >= start && d <= end && a.status !== "available";
      })
      .forEach((a) => {
        unavailDays[a.vehicle_id] = (unavailDays[a.vehicle_id] || 0) + 1;
      });

    const countByVehicle = Object.fromEntries(
      (overview?.vehicleOrders ?? []).map((item) => [item.vehicle_id, item.count]),
    );

    return vehicles.map((v) => {
      const orderCount = countByVehicle[v.id] || 0;
      const unavailCount = unavailDays[v.id] || 0;
      const availableDays = durationDays - unavailCount;
      const pct = availableDays > 0 ? Math.min(100, Math.round((orderCount / availableDays) * 100)) : 0;
      return { name: v.code || v.name, pct, orders: orderCount };
    });
  }, [vehicles, availability, startDate, endDate, overview]);

  /* ---------- Export handlers ---------- */
  const handleExport = async () => {
    try {
      setExportMode("generic");
      const reportOrders = await fetchReportOrdersForExport(startDate, endDate);
      const exportData = reportOrders.map((order) => ({
        id: order.id,
        order_number: order.order_number ?? "",
        created_at: order.created_at,
        status: order.status,
        updated_at: order.updated_at || "",
        client_name: order.client_name || "",
        vehicle_id: order.vehicle_id || "",
      }));
      exportToCSV(exportData, `rapportage-orders-${startDate}-tot-${endDate}.csv`);
    } catch (error) {
      toast({
        title: "Export mislukt",
        description: error instanceof Error ? error.message : "Kon orderexport niet genereren.",
        variant: "destructive",
      });
    } finally {
      setExportMode(null);
    }
  };

  const handleExportPDF = async () => {
    try {
      setExportMode("pdf");
      const reportOrders = await fetchReportOrdersForExport(startDate, endDate);
      await exportOrderReport(reportOrders, { startDate, endDate });
    } catch (error) {
      toast({
        title: "PDF-export mislukt",
        description: error instanceof Error ? error.message : "Kon PDF-export niet genereren.",
        variant: "destructive",
      });
    } finally {
      setExportMode(null);
    }
  };

  const handleExportCSV = async () => {
    try {
      setExportMode("csv");
      const reportOrders = await fetchReportOrdersForExport(startDate, endDate);
      exportOrdersCSV(reportOrders);
    } catch (error) {
      toast({
        title: "CSV-export mislukt",
        description: error instanceof Error ? error.message : "Kon CSV-export niet genereren.",
        variant: "destructive",
      });
    } finally {
      setExportMode(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex-1 min-w-0">
          <PageHeader
            eyebrow="Financieel"
            title="Rapportage"
            subtitle="Overzicht van prestaties, kosten en klantactiviteit"
          />
          <div className="mt-3 inline-flex items-center gap-0.5 p-0.5 rounded-full border border-[hsl(var(--gold)/0.2)] bg-[hsl(var(--card))]">
            {[
              { value: "rapportage" as const, label: "Rapportage" },
              { value: "autonomie" as const, label: "Autonomie" },
            ].map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setSection(t.value)}
                aria-pressed={section === t.value}
                className={cn(
                  "px-4 h-7 rounded-full text-[10px] uppercase tracking-[0.18em] font-semibold transition-colors",
                  section === t.value
                    ? "bg-[hsl(var(--gold-soft)/0.65)] text-[hsl(var(--gold-deep))]"
                    : "text-muted-foreground/70 hover:text-foreground",
                )}
                style={{ fontFamily: "var(--font-display)" }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Date range picker + Export */}
        {section === "rapportage" && (
        <div className="flex w-full flex-col items-start gap-2 lg:w-auto lg:items-end">
          <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
            <label className="text-xs text-muted-foreground font-medium">Van</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-10 min-w-[9.5rem] flex-1 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary sm:h-8 sm:flex-none"
            />
            <label className="text-xs text-muted-foreground font-medium">Tot</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-10 min-w-[9.5rem] flex-1 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary sm:h-8 sm:flex-none"
            />
            <button
              onClick={handleExport}
              disabled={exportMode !== null}
              className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 sm:h-8 sm:flex-none"
            >
              {exportMode === "generic" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Exporteer
            </button>
            <button
              onClick={handleExportPDF}
              disabled={exportMode !== null}
              className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60 sm:h-8 sm:flex-none"
            >
              {exportMode === "pdf" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
              Exporteer PDF
            </button>
            <button
              onClick={handleExportCSV}
              disabled={exportMode !== null}
              className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60 sm:h-8 sm:flex-none"
            >
              {exportMode === "csv" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
              Exporteer CSV
            </button>
          </div>

          {/* Quick presets */}
          <div className="flex w-full flex-wrap items-center gap-1 lg:w-auto lg:justify-end">
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
        )}
      </div>

      {section === "autonomie" && (
        <DeferredMount label="Autonomie laden">
          <Autonomie />
        </DeferredMount>
      )}

      {section === "rapportage" && isPrimaryLoading && (
        <LoadingState message="Rapportage laden..." />
      )}

      {section === "rapportage" && isError && (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <p className="text-sm font-semibold text-foreground mb-1">Kan gegevens niet laden</p>
          <p className="text-xs text-muted-foreground mb-3">Controleer je verbinding</p>
          <button onClick={() => refetchOverview()} className="text-xs text-primary hover:underline">Opnieuw proberen</button>
        </div>
      )}

      {section === "rapportage" && !isPrimaryLoading && !isError && (
      <>
      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Totaal orders", value: overview?.kpis.totalOrders ?? 0, icon: Package, color: "text-blue-600", bg: "bg-blue-500/8" },
          { label: "Gem. levertijd", value: avgDeliveryDays ? `${avgDeliveryDays} d` : "\u2014", icon: Clock, color: "text-amber-600", bg: "bg-amber-500/8" },
          { label: "Voertuigen", value: vehiclesLoading ? "..." : vehicles.length, icon: Truck, color: "text-primary", bg: "bg-primary/8" },
          { label: "AI aanroepen", value: aiLoading ? "..." : aiStats.totalCalls, icon: Brain, color: "text-violet-600", bg: "bg-violet-500/8" },
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
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <ResponsiveContainer width="100%" height={220} className="sm:!w-[60%]">
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
                  <div className="w-full space-y-1.5 sm:flex-1">
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
              {vehiclesLoading || availLoading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Voertuigbenutting laden...</div>
              ) : vehicleUtilisation.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Geen voertuigen gevonden</div>
              ) : (
                <div className="space-y-3">
                  {vehicleUtilisation.map((v) => (
                    <div key={v.name} className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-3">
                      <span className="w-full text-sm font-medium truncate sm:w-20">{v.name}</span>
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
              {aiLoading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  AI-kosten laden...
                </div>
              ) : aiStats.totalCalls === 0 ? (
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
                    <>
                    <div className="space-y-2 md:hidden">
                      {aiStats.byModel.map((m) => (
                        <div key={m.model} className="rounded-lg border border-border/40 bg-muted/20 p-3">
                          <p className="truncate font-mono text-sm font-medium text-foreground">{m.model}</p>
                          <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                            <span className="tabular-nums">{m.calls} calls</span>
                            <span className="font-semibold tabular-nums text-foreground">&euro;{m.cost.toFixed(2)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="hidden overflow-x-auto md:block">
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
                    </>
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
              <>
              <div className="space-y-2 md:hidden">
                {topClients.map((c, i) => (
                  <div key={c.name} className="rounded-lg border border-border/40 bg-muted/20 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">#{i + 1}</p>
                        <p className="mt-1 truncate text-sm font-medium text-foreground">{c.name}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold tabular-nums text-foreground">{c.count}</p>
                        <p className="text-xs text-muted-foreground">
                          {(overview?.kpis.totalOrders ?? 0) > 0 ? ((c.count / (overview?.kpis.totalOrders ?? 1)) * 100).toFixed(1) : 0}%
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
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
                          {(overview?.kpis.totalOrders ?? 0) > 0 ? ((c.count / (overview?.kpis.totalOrders ?? 1)) * 100).toFixed(1) : 0}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Profitability report */}
      <DeferredMount label="Winstgevendheid laden">
        <ProfitabilityReport />
      </DeferredMount>
      </>
      )}
    </div>
  );
};

export default Rapportage;
