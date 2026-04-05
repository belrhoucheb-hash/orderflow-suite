import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/invoiceUtils";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ReferenceLine,
} from "recharts";

function useMarginData() {
  return useQuery({
    queryKey: ["dashboard-margin"],
    staleTime: 60_000,
    queryFn: async () => {
      // Get invoices from the last 4 weeks
      const fourWeeksAgo = new Date();
      fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
      const dateStr = fourWeeksAgo.toISOString().split("T")[0];

      const { data: invoices, error: invErr } = await supabase
        .from("invoices")
        .select("id, total, invoice_date, client_name")
        .gte("invoice_date", dateStr)
        .in("status", ["concept", "verzonden", "betaald"]);

      if (invErr) throw invErr;

      // Get trip costs from the last 4 weeks
      const { data: tripCosts, error: tcErr } = await supabase
        .from("trip_costs" as any)
        .select("amount, created_at")
        .gte("created_at", fourWeeksAgo.toISOString());

      // trip_costs table might not exist yet
      const costs = tcErr ? [] : (tripCosts ?? []);

      const totalRevenue = (invoices ?? []).reduce((sum, inv) => sum + (inv.total ?? 0), 0);
      const totalCost = costs.reduce((sum: number, tc: any) => sum + (tc.amount ?? 0), 0);
      const marginEuro = totalRevenue - totalCost;
      const marginPct = totalRevenue > 0 ? Math.round((marginEuro / totalRevenue) * 100) : 0;

      // Weekly breakdown
      const weeks: { week: string; revenue: number; cost: number; margin: number }[] = [];
      for (let w = 3; w >= 0; w--) {
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - (w + 1) * 7);
        const weekEnd = new Date();
        weekEnd.setDate(weekEnd.getDate() - w * 7);

        const weekRevenue = (invoices ?? [])
          .filter((inv) => {
            const d = new Date(inv.invoice_date);
            return d >= weekStart && d < weekEnd;
          })
          .reduce((sum, inv) => sum + (inv.total ?? 0), 0);

        const weekCost = costs
          .filter((tc: any) => {
            const d = new Date(tc.created_at);
            return d >= weekStart && d < weekEnd;
          })
          .reduce((sum: number, tc: any) => sum + (tc.amount ?? 0), 0);

        weeks.push({
          week: `W${4 - w}`,
          revenue: Math.round(weekRevenue),
          cost: Math.round(weekCost),
          margin: Math.round(weekRevenue - weekCost),
        });
      }

      return { totalRevenue, totalCost, marginEuro, marginPct, weeks };
    },
  });
}

export function MarginWidget() {
  const { data, isLoading } = useMarginData();

  if (isLoading || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Marge overzicht</CardTitle>
        </CardHeader>
        <CardContent className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
          Laden...
        </CardContent>
      </Card>
    );
  }

  const { marginEuro, marginPct, weeks } = data;
  const isPositive = marginEuro >= 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Marge (4 weken)</CardTitle>
          <div className="flex items-center gap-1.5">
            {isPositive ? (
              <TrendingUp className="h-4 w-4 text-green-600" />
            ) : marginEuro < 0 ? (
              <TrendingDown className="h-4 w-4 text-red-600" />
            ) : (
              <Minus className="h-4 w-4 text-muted-foreground" />
            )}
            <span className={`font-bold text-lg ${isPositive ? "text-green-600" : "text-red-600"}`}>
              {marginPct}%
            </span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {formatCurrency(data.totalRevenue)} omzet / {formatCurrency(data.totalCost)} kosten ={" "}
          <span className={isPositive ? "text-green-600" : "text-red-600"}>
            {formatCurrency(marginEuro)}
          </span>
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={weeks} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="week" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(value: number, name: string) => [
                formatCurrency(value),
                name === "revenue" ? "Omzet" : name === "cost" ? "Kosten" : "Marge",
              ]}
            />
            <ReferenceLine y={0} stroke="#94a3b8" />
            <Bar dataKey="revenue" fill="#22c55e" radius={[4, 4, 0, 0]} name="revenue" />
            <Bar dataKey="cost" fill="#ef4444" radius={[4, 4, 0, 0]} name="cost" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
