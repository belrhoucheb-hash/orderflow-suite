import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine,
} from "recharts";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/invoiceUtils";
import { supabase } from "@/integrations/supabase/client";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface WeekBucket {
  label: string;   // e.g. "W14"
  revenue: number;
  cost: number;
  margin: number;  // percentage
}

/* ------------------------------------------------------------------ */
/*  Hook: useMarginData                                                */
/* ------------------------------------------------------------------ */

function useMarginData() {
  return useQuery({
    queryKey: ["margin-widget-4w"],
    queryFn: async (): Promise<{
      weeks: WeekBucket[];
      totalRevenue: number;
      totalCost: number;
      overallMargin: number;
    }> => {
      // Fetch last 4 weeks of invoices
      const fourWeeksAgo = new Date();
      fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

      const { data: invoices, error: invError } = await supabase
        .from("invoices")
        .select("id, total, subtotal, created_at, order_id")
        .gte("created_at", fourWeeksAgo.toISOString());

      if (invError) throw invError;

      // ISO week helper — defined first so it can be used below
      function getISOWeek(date: Date): number {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
      }

      // Try fetching trip_costs — table may not exist yet.
      // trip_costs columns: id, tenant_id, trip_id, cost_type_id, amount, quantity, rate, source, notes, created_at
      // trip_costs links to trips (not orders), so costs are bucketed by their own created_at week.
      const costByWeek = new Map<number, number>();
      try {
        const { data: costs, error: costError } = await supabase
          .from("trip_costs" as any)
          .select("amount, created_at")
          .gte("created_at" as any, fourWeeksAgo.toISOString());
        if (!costError && costs) {
          for (const c of costs as { amount: number; created_at: string }[]) {
            const wk = getISOWeek(new Date(c.created_at));
            costByWeek.set(wk, (costByWeek.get(wk) ?? 0) + (c.amount ?? 0));
          }
        }
      } catch {
        // table doesn't exist — proceed with zero costs
      }

      // Build 4 weekly buckets (most recent 4 ISO weeks)
      const buckets = new Map<number, { revenue: number; cost: number; weekNum: number }>();

      // Seed the 4 buckets (current week and 3 prior)
      const today = new Date();
      const weekNums: number[] = [];
      for (let i = 3; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i * 7);
        const wk = getISOWeek(d);
        weekNums.push(wk);
        if (!buckets.has(wk)) {
          buckets.set(wk, { revenue: 0, cost: 0, weekNum: wk });
        }
      }

      // Fill revenue from invoices
      for (const inv of invoices ?? []) {
        const wk = getISOWeek(new Date(inv.created_at));
        if (buckets.has(wk)) {
          const b = buckets.get(wk)!;
          b.revenue += inv.subtotal ?? inv.total ?? 0;
        }
      }

      // Fill costs from trip_costs (bucketed by their own created_at week)
      for (const [wk, cost] of costByWeek.entries()) {
        if (buckets.has(wk)) {
          buckets.get(wk)!.cost += cost;
        }
      }

      const weeks: WeekBucket[] = weekNums.map((wk) => {
        const b = buckets.get(wk)!;
        const margin = b.revenue > 0 ? Math.round(((b.revenue - b.cost) / b.revenue) * 100) : 0;
        return { label: `W${wk}`, revenue: b.revenue, cost: b.cost, margin };
      });

      const totalRevenue = weeks.reduce((s, w) => s + w.revenue, 0);
      const totalCost = weeks.reduce((s, w) => s + w.cost, 0);
      const overallMargin = totalRevenue > 0
        ? Math.round(((totalRevenue - totalCost) / totalRevenue) * 100)
        : 0;

      return { weeks, totalRevenue, totalCost, overallMargin };
    },
    staleTime: 5 * 60 * 1000,
  });
}

/* ------------------------------------------------------------------ */
/*  Custom Tooltip                                                     */
/* ------------------------------------------------------------------ */

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const revenue = payload.find((p: any) => p.dataKey === "revenue")?.value ?? 0;
  const cost = payload.find((p: any) => p.dataKey === "cost")?.value ?? 0;
  const margin = revenue > 0 ? Math.round(((revenue - cost) / revenue) * 100) : 0;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-md text-xs space-y-1">
      <p className="font-semibold text-foreground">{label}</p>
      <p className="text-emerald-600">Omzet: {formatCurrency(revenue)}</p>
      <p className="text-red-500">Kosten: {formatCurrency(cost)}</p>
      <p className={margin >= 0 ? "text-emerald-600 font-bold" : "text-red-500 font-bold"}>
        Marge: {margin}%
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  MarginWidget                                                       */
/* ------------------------------------------------------------------ */

export function MarginWidget() {
  const { data, isLoading, isError } = useMarginData();

  const TrendIcon =
    !data ? Minus
    : data.overallMargin > 20 ? TrendingUp
    : data.overallMargin < 0 ? TrendingDown
    : Minus;

  const trendColor =
    !data ? "text-muted-foreground"
    : data.overallMargin > 20 ? "text-emerald-600"
    : data.overallMargin < 0 ? "text-red-500"
    : "text-amber-500";

  return (
    <Card className="border-border/40 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <TrendIcon className={`h-4 w-4 ${trendColor}`} />
            Margetrend (4 weken)
          </CardTitle>
          {data && (
            <span className={`text-lg font-bold tabular-nums ${trendColor}`}>
              {data.overallMargin}%
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {isLoading && (
          <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">
            Laden…
          </div>
        )}

        {isError && (
          <div className="h-32 flex items-center justify-center text-sm text-red-500">
            Kan margedata niet laden
          </div>
        )}

        {data && (
          <>
            {/* Summary row */}
            <div className="flex gap-4 mb-3 text-xs">
              <div>
                <span className="text-muted-foreground">Omzet </span>
                <span className="font-semibold text-emerald-600">{formatCurrency(data.totalRevenue)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Kosten </span>
                <span className="font-semibold text-red-500">{formatCurrency(data.totalCost)}</span>
              </div>
            </div>

            {/* Bar chart */}
            <ResponsiveContainer width="100%" height={120}>
              <BarChart
                data={data.weeks}
                margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                barCategoryGap="25%"
                barGap={2}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.4} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={0} stroke="hsl(var(--border))" />
                <Bar dataKey="revenue" name="Omzet" fill="#22c55e" radius={[3, 3, 0, 0]} />
                <Bar dataKey="cost" name="Kosten" fill="#ef4444" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
      </CardContent>
    </Card>
  );
}
