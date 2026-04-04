/**
 * F5: EmballageReport
 * Rapportage section: total outstanding KPI, top clients by balance,
 * balance-per-type bar chart.
 */
import { useMemo } from "react";
import { Package, AlertTriangle, Users } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAllPackagingBalances } from "@/hooks/usePackaging";
import { LoadingState } from "@/components/ui/LoadingState";

export function EmballageReport() {
  const { data: balances = [], isLoading } = useAllPackagingBalances();

  const { totalOutstanding, clientCount, perType, topClients } = useMemo(() => {
    const totalOutstanding = balances.reduce((sum, b) => sum + Math.max(0, b.balance ?? 0), 0);

    const clientIds = new Set(balances.filter((b) => (b.balance ?? 0) > 0).map((b) => b.client_id));
    const clientCount = clientIds.size;

    // Per loading unit type: sum all balances
    const byType: Record<string, { name: string; total: number }> = {};
    for (const b of balances) {
      const id = b.loading_unit_id;
      const name = b.loading_unit?.name ?? id;
      if (!byType[id]) byType[id] = { name, total: 0 };
      byType[id].total += b.balance ?? 0;
    }
    const perType = Object.values(byType)
      .filter((t) => t.total > 0)
      .sort((a, b) => b.total - a.total);

    // Top clients by total outstanding
    const byClient: Record<string, { name: string; total: number }> = {};
    for (const b of balances) {
      if ((b.balance ?? 0) <= 0) continue;
      const id = b.client_id;
      const name = b.client?.name ?? id;
      if (!byClient[id]) byClient[id] = { name, total: 0 };
      byClient[id].total += b.balance ?? 0;
    }
    const topClients = Object.values(byClient)
      .sort((a, c) => c.total - a.total)
      .slice(0, 10);

    return { totalOutstanding, clientCount, perType, topClients };
  }, [balances]);

  if (isLoading) {
    return <LoadingState message="Emballage rapport laden..." />;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-display flex items-center gap-2">
          <Package className="h-4 w-4 text-amber-500" />
          Emballage Saldo Overzicht
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Totaal uitstaand
            </p>
            <div className="flex items-end gap-1.5">
              <span className={`text-2xl font-bold tabular-nums ${totalOutstanding > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                {totalOutstanding}
              </span>
              <span className="text-xs text-muted-foreground pb-0.5">stuks</span>
            </div>
            {totalOutstanding > 0 && (
              <div className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-amber-500" />
                <span className="text-xs text-amber-600">openstaand</span>
              </div>
            )}
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Klanten met saldo
            </p>
            <div className="flex items-end gap-1.5">
              <span className="text-2xl font-bold tabular-nums">{clientCount}</span>
              <span className="text-xs text-muted-foreground pb-0.5">klanten</span>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Typen uitstaand
            </p>
            <div className="flex items-end gap-1.5">
              <span className="text-2xl font-bold tabular-nums">{perType.length}</span>
              <span className="text-xs text-muted-foreground pb-0.5">laadeenheden</span>
            </div>
          </div>
        </div>

        {balances.length === 0 ? (
          <div className="py-8 text-center">
            <Package className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Geen emballage data beschikbaar</p>
          </div>
        ) : (
          <>
            {/* Balance per type bar chart */}
            {perType.length > 0 && (
              <div>
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Uitstaand per laadeenheid
                </h3>
                <div className="h-52 rounded-lg border border-border bg-card p-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={perType} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip
                        formatter={(v: number) => [v, "Uitstaand"]}
                        contentStyle={{ fontSize: 12 }}
                      />
                      <Bar dataKey="total" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Top clients */}
            {topClients.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Top klanten — meeste emballage uitstaand
                  </h3>
                </div>
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-muted/30 border-b border-border">
                        <th className="text-left text-xs font-medium text-muted-foreground uppercase px-4 py-2.5">
                          Klant
                        </th>
                        <th className="text-right text-xs font-medium text-muted-foreground uppercase px-4 py-2.5">
                          Uitstaand
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {topClients.map((client, i) => (
                        <tr key={client.name} className="border-b border-border/50">
                          <td className="px-4 py-2.5 text-sm">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono text-muted-foreground w-5 text-right">
                                {i + 1}
                              </span>
                              <span className="font-medium">{client.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <span className="text-sm font-bold tabular-nums text-amber-600">
                              {client.total}
                            </span>
                            <span className="text-xs text-muted-foreground ml-1">stuks</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
