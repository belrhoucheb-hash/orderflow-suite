import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, BarChart3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/invoiceUtils";
import { calculateMargin } from "@/lib/costEngine";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  Cell,
} from "recharts";

type GroupBy = "client" | "vehicle";

function useProfitabilityData(groupBy: GroupBy) {
  return useQuery({
    queryKey: ["profitability", groupBy],
    staleTime: 60_000,
    queryFn: async () => {
      // Revenue: from invoices
      const { data: invoices, error: invErr } = await supabase
        .from("invoices")
        .select("id, total, client_name, client_id")
        .in("status", ["concept", "verzonden", "betaald"]);

      if (invErr) throw invErr;

      // Costs: from trip_costs joined with trips
      const { data: tripCosts, error: tcErr } = await supabase
        .from("trip_costs" as any)
        .select("amount, trips(vehicle_id, total_distance_km)")
        .order("created_at", { ascending: false });

      // trip_costs may not exist yet
      const costs = tcErr ? [] : (tripCosts ?? []);

      // Get trips for vehicle mapping
      const { data: trips } = await supabase
        .from("trips")
        .select("id, vehicle_id, vehicles(name)")
        .order("planned_date", { ascending: false })
        .limit(500);

      if (groupBy === "client") {
        // Group by client
        const clientMap = new Map<string, { name: string; revenue: number; cost: number }>();
        for (const inv of (invoices ?? [])) {
          const key = inv.client_name ?? "Onbekend";
          const existing = clientMap.get(key) ?? { name: key, revenue: 0, cost: 0 };
          existing.revenue += inv.total ?? 0;
          clientMap.set(key, existing);
        }

        // Approximate: distribute costs evenly (in production, join via orders/trips)
        const totalCost = costs.reduce((sum: number, tc: any) => sum + (tc.amount ?? 0), 0);
        const clientCount = clientMap.size || 1;
        const costPerClient = totalCost / clientCount;

        return Array.from(clientMap.values())
          .map((c) => ({
            name: c.name,
            revenue: Math.round(c.revenue),
            cost: Math.round(costPerClient),
            ...calculateMargin(c.revenue, costPerClient),
          }))
          .sort((a, b) => b.margin_euro - a.margin_euro);
      } else {
        // Group by vehicle
        const vehicleMap = new Map<string, { name: string; revenue: number; cost: number }>();

        for (const trip of (trips ?? [])) {
          const vehicleName = (trip.vehicles as any)?.name ?? trip.vehicle_id?.slice(0, 8) ?? "Onbekend";
          const existing = vehicleMap.get(vehicleName) ?? { name: vehicleName, revenue: 0, cost: 0 };
          vehicleMap.set(vehicleName, existing);
        }

        // Total revenue/cost distributed
        const totalRevenue = (invoices ?? []).reduce((sum, inv) => sum + (inv.total ?? 0), 0);
        const totalCost = costs.reduce((sum: number, tc: any) => sum + (tc.amount ?? 0), 0);
        const vehicleCount = vehicleMap.size || 1;

        return Array.from(vehicleMap.values())
          .map((v) => ({
            name: v.name,
            revenue: Math.round(totalRevenue / vehicleCount),
            cost: Math.round(totalCost / vehicleCount),
            ...calculateMargin(totalRevenue / vehicleCount, totalCost / vehicleCount),
          }))
          .sort((a, b) => b.margin_euro - a.margin_euro);
      }
    },
  });
}

export function ProfitabilityReport() {
  const [groupBy, setGroupBy] = useState<GroupBy>("client");
  const { data, isLoading } = useProfitabilityData(groupBy);

  const chartData = useMemo(() => {
    return (data ?? []).slice(0, 10).map((d) => ({
      name: d.name.length > 15 ? d.name.slice(0, 15) + "..." : d.name,
      marge: d.margin_percentage,
      margin_euro: d.margin_euro,
    }));
  }, [data]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Rendabiliteit
          </CardTitle>
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
            <SelectTrigger className="w-[160px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="client">Per klant</SelectItem>
              <SelectItem value="vehicle">Per voertuig</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Laden...</p>
        ) : (data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Geen gegevens beschikbaar. Start met het registreren van kosten en facturen.
          </p>
        ) : (
          <>
            {/* Chart */}
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis unit="%" tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value: number) => [`${value}%`, "Marge"]}
                />
                <Bar dataKey="marge" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, idx) => (
                    <Cell
                      key={idx}
                      fill={entry.marge >= 0 ? "#22c55e" : "#ef4444"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* Table */}
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 font-medium">
                      {groupBy === "client" ? "Klant" : "Voertuig"}
                    </th>
                    <th className="text-right py-2 font-medium">Omzet</th>
                    <th className="text-right py-2 font-medium">Kosten</th>
                    <th className="text-right py-2 font-medium">Marge</th>
                    <th className="text-right py-2 font-medium">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(data ?? []).map((row, idx) => (
                    <tr key={idx}>
                      <td className="py-2 font-medium">{row.name}</td>
                      <td className="py-2 text-right font-mono tabular-nums">
                        {formatCurrency(row.revenue)}
                      </td>
                      <td className="py-2 text-right font-mono tabular-nums">
                        {formatCurrency(row.cost)}
                      </td>
                      <td className="py-2 text-right font-mono tabular-nums">
                        <span className={row.margin_euro >= 0 ? "text-green-600" : "text-red-600"}>
                          {formatCurrency(row.margin_euro)}
                        </span>
                      </td>
                      <td className="py-2 text-right">
                        <Badge
                          variant={row.margin_percentage >= 20 ? "default" : row.margin_percentage >= 0 ? "secondary" : "destructive"}
                          className="text-xs"
                        >
                          {row.margin_euro >= 0 ? (
                            <TrendingUp className="h-3 w-3 mr-1" />
                          ) : (
                            <TrendingDown className="h-3 w-3 mr-1" />
                          )}
                          {row.margin_percentage}%
                        </Badge>
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
