import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, Download, Loader2, CheckCircle2, TrendingUp } from "lucide-react";
import { useCurrentPortalUser } from "@/hooks/useClientPortalUsers";

interface OrderStats {
  total: number;
  delivered: number;
  onTime: number;
  late: number;
  avgWeight: number;
}

export default function PortalReporting() {
  const { data: portalUser } = useCurrentPortalUser();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"week" | "month" | "quarter">("month");
  const [orders, setOrders] = useState<any[]>([]);

  useEffect(() => {
    if (!portalUser?.client_id) return;

    const load = async () => {
      setLoading(true);

      const now = new Date();
      let from: Date;
      if (period === "week") {
        from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (period === "month") {
        from = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      } else {
        from = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
      }

      const { data, error } = await supabase
        .from("orders")
        .select("id, status, weight_kg, quantity, created_at, time_window_end, delivered_at")
        .eq("client_id", portalUser.client_id)
        .gte("created_at", from.toISOString())
        .order("created_at", { ascending: false });

      if (!error) setOrders(data ?? []);
      setLoading(false);
    };

    load();
  }, [portalUser?.client_id, period]);

  const stats: OrderStats = useMemo(() => {
    const delivered = orders.filter((o) => o.status === "DELIVERED");
    const onTime = delivered.filter((o) => {
      if (!o.time_window_end || !o.delivered_at) return true; // assume on time if no data
      return new Date(o.delivered_at) <= new Date(o.time_window_end);
    });

    return {
      total: orders.length,
      delivered: delivered.length,
      onTime: onTime.length,
      late: delivered.length - onTime.length,
      avgWeight:
        orders.length > 0
          ? orders.reduce((sum, o) => sum + (o.weight_kg ?? 0), 0) / orders.length
          : 0,
    };
  }, [orders]);

  const onTimePercentage =
    stats.delivered > 0 ? Math.round((stats.onTime / stats.delivered) * 100) : 100;

  const handleExportCsv = () => {
    const headers = ["Ordernummer", "Status", "Gewicht (kg)", "Aantal", "Aangemaakt", "Tijdvenster"];
    const rows = orders.map((o) => [
      o.id,
      o.status,
      o.weight_kg ?? "",
      o.quantity ?? "",
      new Date(o.created_at).toLocaleDateString("nl-NL"),
      o.time_window_end ? new Date(o.time_window_end).toLocaleString("nl-NL") : "",
    ]);

    const csv = [headers, ...rows].map((row) => row.join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rapportage-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rapportage</h1>
          <p className="text-gray-500 mt-1">Inzicht in uw transportprestaties</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={(v) => setPeriod(v as "week" | "month" | "quarter")}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Afgelopen week</SelectItem>
              <SelectItem value="month">Afgelopen maand</SelectItem>
              <SelectItem value="quarter">Afgelopen kwartaal</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleExportCsv} className="gap-1.5">
            <Download className="h-4 w-4" />
            CSV Export
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Totaal orders</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Afgeleverd</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{stats.delivered}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <p className="text-sm text-gray-500">Op tijd</p>
            </div>
            <p className="text-2xl font-bold text-gray-900 mt-1">{onTimePercentage}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Gem. gewicht</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{stats.avgWeight.toFixed(0)} kg</p>
          </CardContent>
        </Card>
      </div>

      {/* Volume overview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-gray-400" />
            Volume overzicht
          </CardTitle>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <p className="text-sm text-gray-400">Geen data voor de geselecteerde periode.</p>
          ) : (
            <div className="text-sm text-gray-600 space-y-1">
              <p>{stats.total} orders in de geselecteerde periode</p>
              <p>{stats.onTime} op tijd afgeleverd, {stats.late} te laat</p>
              <p>Totaal gewicht: {orders.reduce((s, o) => s + (o.weight_kg ?? 0), 0).toFixed(0)} kg</p>
              <p>Totaal stuks: {orders.reduce((s, o) => s + (o.quantity ?? 0), 0)}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
