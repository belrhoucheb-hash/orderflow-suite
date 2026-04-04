/**
 * F5: ClientEmballageTab
 * Shows packaging balances per loading unit type, movement history table,
 * and a balance bar chart using Recharts.
 */
import { Package, ArrowDown, ArrowUp, AlertTriangle } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";
import { useClientPackagingBalance, usePackagingMovements } from "@/hooks/usePackaging";
import { LoadingState } from "@/components/ui/LoadingState";

interface Props {
  clientId: string;
}

const DIRECTION_LABELS: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  UIT: { label: "Uitgegeven", color: "text-red-600", icon: ArrowUp },
  IN: { label: "Ontvangen", color: "text-emerald-600", icon: ArrowDown },
};

export function ClientEmballageTab({ clientId }: Props) {
  const { total, balances, isLoading: balancesLoading } = useClientPackagingBalance(clientId);
  const { data: movements = [], isLoading: movementsLoading } = usePackagingMovements(clientId);

  const isLoading = balancesLoading || movementsLoading;

  if (isLoading) {
    return <LoadingState message="Emballage laden..." />;
  }

  const chartData = balances.map((b) => ({
    name: b.loading_unit?.name ?? b.loading_unit_id,
    saldo: b.balance,
    fill: (b.balance ?? 0) > 0 ? "#f59e0b" : "#22c55e",
  }));

  return (
    <div className="p-6 space-y-6">
      {/* Summary KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Totaal uitstaand</p>
          <p className={`text-2xl font-bold tabular-nums ${total > 0 ? "text-amber-600" : "text-emerald-600"}`}>
            {total}
          </p>
          <p className="text-xs text-muted-foreground">stuks</p>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Typen</p>
          <p className="text-2xl font-bold tabular-nums">{balances.length}</p>
          <p className="text-xs text-muted-foreground">laadeenheden</p>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Bewegingen</p>
          <p className="text-2xl font-bold tabular-nums">{movements.length}</p>
          <p className="text-xs text-muted-foreground">totaal</p>
        </div>
      </div>

      {/* Balances per type */}
      {balances.length === 0 ? (
        <div className="py-12 text-center space-y-2">
          <Package className="h-10 w-10 text-muted-foreground/30 mx-auto" />
          <p className="text-sm text-muted-foreground">Geen emballagesaldo voor deze klant</p>
        </div>
      ) : (
        <>
          {/* Balance cards */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Saldo per type
            </h3>
            <div className="space-y-2">
              {balances.map((b) => {
                const isOutstanding = (b.balance ?? 0) > 0;
                return (
                  <div
                    key={b.loading_unit_id}
                    className="flex items-center justify-between rounded-lg border border-border p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${
                        isOutstanding ? "bg-amber-100" : "bg-emerald-100"
                      }`}>
                        <Package className={`h-4 w-4 ${isOutstanding ? "text-amber-600" : "text-emerald-600"}`} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {b.loading_unit?.name ?? "Onbekend"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {b.loading_unit?.code ?? "—"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold tabular-nums ${
                        isOutstanding ? "text-amber-600" : "text-emerald-600"
                      }`}>
                        {b.balance}
                      </p>
                      {isOutstanding && (
                        <div className="flex items-center gap-0.5 justify-end">
                          <AlertTriangle className="h-3 w-3 text-amber-500" />
                          <span className="text-xs text-amber-600">uitstaand</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bar chart */}
          {chartData.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                Saldo grafiek
              </h3>
              <div className="h-48 rounded-lg border border-border bg-card p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(value: number) => [value, "Saldo"]}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Bar dataKey="saldo" radius={[4, 4, 0, 0]}>
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}

      {/* Movement history */}
      <div>
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Bewegingshistorie
        </h3>
        {movements.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Geen bewegingen geregistreerd
          </p>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/30 border-b border-border">
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase px-4 py-2.5">Datum</th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase px-4 py-2.5">Type</th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase px-4 py-2.5">Richting</th>
                  <th className="text-right text-xs font-medium text-muted-foreground uppercase px-4 py-2.5">Aantal</th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase px-4 py-2.5 hidden sm:table-cell">Notitie</th>
                </tr>
              </thead>
              <tbody>
                {movements.slice(0, 50).map((m) => {
                  const dir = DIRECTION_LABELS[m.direction] ?? { label: m.direction, color: "text-foreground", icon: Package };
                  const DirIcon = dir.icon;
                  return (
                    <tr key={m.id} className="border-b border-border/50">
                      <td className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums">
                        {new Date(m.recorded_at).toLocaleDateString("nl-NL")}
                      </td>
                      <td className="px-4 py-2.5 text-sm">
                        {m.loading_unit?.name ?? "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`flex items-center gap-1 text-xs font-medium ${dir.color}`}>
                          <DirIcon className="h-3.5 w-3.5" />
                          {dir.label}
                        </span>
                      </td>
                      <td className={`px-4 py-2.5 text-sm font-medium text-right tabular-nums ${dir.color}`}>
                        {m.direction === "UIT" ? "+" : "-"}{m.quantity}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground hidden sm:table-cell">
                        {m.notes ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
