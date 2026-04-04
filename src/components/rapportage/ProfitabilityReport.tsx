import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { calculateMargin } from "@/lib/costEngine";
import { formatCurrency } from "@/lib/invoiceUtils";
import { supabase } from "@/integrations/supabase/client";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type GroupBy = "client" | "vehicle";

interface ProfitRow {
  id: string;
  label: string;
  revenue: number;
  cost: number;
  margin_euro: number;
  margin_percentage: number;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

function useProfitabilityData(groupBy: GroupBy) {
  return useQuery({
    queryKey: ["profitability-report", groupBy],
    queryFn: async (): Promise<ProfitRow[]> => {
      // Fetch invoices with client/vehicle info via orders
      const { data: invoices, error: invError } = await supabase
        .from("invoices")
        .select("id, subtotal, total, order_id, orders(client_name, vehicle_id, vehicles(code, name))");

      if (invError) throw invError;

      // Try fetching trip_costs
      let tripCosts: { order_id: string; total_cost: number }[] = [];
      try {
        const { data: costs, error: costError } = await supabase
          .from("trip_costs" as any)
          .select("order_id, total_cost");
        if (!costError && costs) {
          tripCosts = costs as { order_id: string; total_cost: number }[];
        }
      } catch {
        // table doesn't exist — proceed with zero costs
      }

      const costByOrder = new Map<string, number>();
      for (const c of tripCosts) {
        costByOrder.set(c.order_id, (costByOrder.get(c.order_id) ?? 0) + c.total_cost);
      }

      // Aggregate by groupBy key
      const buckets = new Map<string, { label: string; revenue: number; cost: number }>();

      for (const inv of invoices ?? []) {
        const order = (inv as any).orders;
        if (!order) continue;

        let key: string;
        let label: string;

        if (groupBy === "client") {
          key = order.client_name ?? "Onbekend";
          label = key;
        } else {
          const v = order.vehicles;
          key = order.vehicle_id ?? "none";
          label = v ? `${v.code ?? ""} ${v.name ?? ""}`.trim() : "Onbekend voertuig";
        }

        if (!buckets.has(key)) {
          buckets.set(key, { label, revenue: 0, cost: 0 });
        }
        const b = buckets.get(key)!;
        b.revenue += inv.subtotal ?? inv.total ?? 0;
        b.cost += costByOrder.get(inv.order_id ?? "") ?? 0;
      }

      // Build rows, sorted by revenue desc
      const rows: ProfitRow[] = [...buckets.entries()].map(([id, b]) => {
        const m = calculateMargin(b.revenue, b.cost);
        return {
          id,
          label: b.label,
          revenue: m.revenue,
          cost: m.cost,
          margin_euro: m.margin_euro,
          margin_percentage: m.margin_percentage,
        };
      });

      return rows.sort((a, b) => b.revenue - a.revenue);
    },
    staleTime: 5 * 60 * 1000,
  });
}

/* ------------------------------------------------------------------ */
/*  Custom tooltip                                                     */
/* ------------------------------------------------------------------ */

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const mp = payload[0]?.value ?? 0;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-md text-xs space-y-1">
      <p className="font-semibold text-foreground truncate max-w-[160px]">{label}</p>
      <p className={mp >= 0 ? "text-emerald-600 font-bold" : "text-red-500 font-bold"}>
        Marge: {mp.toFixed(1)}%
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ProfitabilityReport                                                */
/* ------------------------------------------------------------------ */

export function ProfitabilityReport() {
  const [groupBy, setGroupBy] = useState<GroupBy>("client");
  const { data: rows = [], isLoading, isError } = useProfitabilityData(groupBy);

  const chartData = rows.slice(0, 12).map((r) => ({
    name: r.label.length > 16 ? r.label.slice(0, 14) + "…" : r.label,
    fullName: r.label,
    margin: r.margin_percentage,
  }));

  return (
    <Card className="border-border/40 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm font-semibold">Winstgevendheid</CardTitle>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupBy)}
            className="h-7 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="client">Per klant</option>
            <option value="vehicle">Per voertuig</option>
          </select>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-4">
        {isLoading && (
          <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
            Laden…
          </div>
        )}

        {isError && (
          <div className="h-40 flex items-center justify-center text-sm text-red-500">
            Kan winstgevendheidsdata niet laden
          </div>
        )}

        {!isLoading && !isError && rows.length === 0 && (
          <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
            Geen data beschikbaar
          </div>
        )}

        {!isLoading && !isError && rows.length > 0 && (
          <>
            {/* Bar chart */}
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                data={chartData}
                margin={{ top: 4, right: 4, left: -20, bottom: 40 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.4} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  angle={-35}
                  textAnchor="end"
                  interval={0}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="margin" radius={[3, 3, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.margin >= 0 ? "#22c55e" : "#ef4444"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* Data table */}
            <div className="overflow-x-auto rounded-lg border border-border/30">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/30 bg-muted/20">
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                      {groupBy === "client" ? "Klant" : "Voertuig"}
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Omzet</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Kosten</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Marge €</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {rows.map((row) => (
                    <tr key={row.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-2 font-medium text-foreground truncate max-w-[140px]">
                        {row.label}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-600 font-semibold">
                        {formatCurrency(row.revenue)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-red-500">
                        {formatCurrency(row.cost)}
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums font-semibold ${row.margin_euro >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                        {formatCurrency(row.margin_euro)}
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums font-bold ${row.margin_percentage >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                        {row.margin_percentage.toFixed(1)}%
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
  );
}
