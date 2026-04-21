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

const DIRECTION_LABELS: Record<string, { label: string; tone: "out" | "in"; icon: React.ElementType }> = {
  UIT: { label: "Uitgegeven", tone: "out", icon: ArrowUp },
  IN: { label: "Ontvangen", tone: "in", icon: ArrowDown },
};

export function ClientEmballageTab({ clientId }: Props) {
  const { data: balances = [], isLoading: balancesLoading } = useClientPackagingBalance(clientId);
  const total = balances.reduce((sum, b) => sum + (b.balance ?? 0), 0);
  const { data: movements = [], isLoading: movementsLoading } = usePackagingMovements(clientId);

  const isLoading = balancesLoading || movementsLoading;

  if (isLoading) {
    return <LoadingState message="Emballage laden..." />;
  }

  const chartData = balances.map((b) => ({
    name: b.loading_unit?.name ?? b.loading_unit_id,
    saldo: b.balance,
    fill: (b.balance ?? 0) > 0 ? "hsl(32 42% 42%)" : "hsl(38 35% 55%)",
  }));

  return (
    <div className="p-5 space-y-5">
      {/* Summary KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Kpi label="Totaal uitstaand" value={total} unit="stuks" highlight={total > 0} />
        <Kpi label="Typen" value={balances.length} unit="laadeenheden" />
        <Kpi label="Bewegingen" value={movements.length} unit="totaal" />
      </div>

      {/* Balances per type */}
      {balances.length === 0 ? (
        <div className="py-12 text-center space-y-2">
          <Package className="h-10 w-10 text-[hsl(var(--gold)/0.35)] mx-auto" />
          <p className="text-sm text-muted-foreground">Geen emballagesaldo voor deze klant</p>
        </div>
      ) : (
        <>
          <div>
            <h3 className="text-[11px] font-display font-semibold text-[hsl(var(--gold-deep))] uppercase tracking-[0.14em] mb-3">
              Saldo per type
            </h3>
            <div className="space-y-2">
              {balances.map((b) => {
                const isOutstanding = (b.balance ?? 0) > 0;
                return (
                  <div
                    key={b.loading_unit_id}
                    className="flex items-center justify-between rounded-xl border border-[hsl(var(--gold)/0.2)] p-3"
                    style={{ background: "linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--gold-soft)/0.18) 100%)" }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="h-9 w-9 rounded-lg flex items-center justify-center border border-[hsl(var(--gold)/0.3)]"
                        style={{ background: "linear-gradient(135deg, hsl(var(--gold-soft)/0.8), hsl(var(--gold-soft)/0.3))" }}
                      >
                        <Package className="h-4 w-4 text-[hsl(var(--gold-deep))]" strokeWidth={1.5} />
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
                      <p
                        className={`text-lg font-bold tabular-nums ${
                          isOutstanding ? "text-[hsl(var(--gold-deep))]" : "text-foreground"
                        }`}
                      >
                        {b.balance}
                      </p>
                      {isOutstanding && (
                        <div className="flex items-center gap-0.5 justify-end">
                          <AlertTriangle className="h-3 w-3 text-[hsl(var(--gold-deep))]" />
                          <span className="text-xs text-[hsl(var(--gold-deep))]">uitstaand</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {chartData.length > 0 && (
            <div>
              <h3 className="text-[11px] font-display font-semibold text-[hsl(var(--gold-deep))] uppercase tracking-[0.14em] mb-3">
                Saldo grafiek
              </h3>
              <div className="h-48 card--luxe p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--gold) / 0.15)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip
                      formatter={(value: number) => [value, "Saldo"]}
                      contentStyle={{
                        fontSize: 12,
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--gold) / 0.3)",
                        borderRadius: 8,
                      }}
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
        <h3 className="text-[11px] font-display font-semibold text-[hsl(var(--gold-deep))] uppercase tracking-[0.14em] mb-3">
          Bewegingshistorie
        </h3>
        {movements.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Geen bewegingen geregistreerd
          </p>
        ) : (
          <div className="card--luxe overflow-hidden">
            <table className="w-full">
              <thead>
                <tr
                  className="border-b border-[hsl(var(--gold)/0.2)] [&>th]:!font-display [&>th]:!text-[11px] [&>th]:!uppercase [&>th]:!tracking-[0.14em] [&>th]:!text-[hsl(var(--gold-deep))] [&>th]:!font-semibold"
                  style={{ background: "linear-gradient(180deg, hsl(var(--gold-soft)/0.4), hsl(var(--gold-soft)/0.15))" }}
                >
                  <th className="text-left px-4 py-2.5">Datum</th>
                  <th className="text-left px-4 py-2.5">Type</th>
                  <th className="text-left px-4 py-2.5">Richting</th>
                  <th className="text-right px-4 py-2.5">Aantal</th>
                  <th className="text-left px-4 py-2.5 hidden sm:table-cell">Notitie</th>
                </tr>
              </thead>
              <tbody>
                {movements.slice(0, 50).map((m) => {
                  const dir = DIRECTION_LABELS[m.direction] ?? { label: m.direction, tone: "out" as const, icon: Package };
                  const DirIcon = dir.icon;
                  const toneClass = dir.tone === "out"
                    ? "text-[hsl(var(--gold-deep))]"
                    : "text-muted-foreground";
                  return (
                    <tr key={m.id} className="border-b border-[hsl(var(--gold)/0.08)] last:border-0">
                      <td className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums">
                        {new Date(m.recorded_at).toLocaleDateString("nl-NL")}
                      </td>
                      <td className="px-4 py-2.5 text-sm">
                        {m.loading_unit?.name ?? "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`flex items-center gap-1 text-xs font-medium ${toneClass}`}>
                          <DirIcon className="h-3.5 w-3.5" />
                          {dir.label}
                        </span>
                      </td>
                      <td className={`px-4 py-2.5 text-sm font-medium text-right tabular-nums ${toneClass}`}>
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

function Kpi({ label, value, unit, highlight }: { label: string; value: number; unit: string; highlight?: boolean }) {
  return (
    <div
      className="rounded-xl border border-[hsl(var(--gold)/0.25)] p-4 space-y-1"
      style={{ background: "linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--gold-soft)/0.25) 100%)" }}
    >
      <p className="text-[10px] font-display font-semibold text-[hsl(var(--gold-deep))] uppercase tracking-[0.14em]">{label}</p>
      <p
        className={`text-2xl font-bold tabular-nums ${
          highlight ? "text-[hsl(var(--gold-deep))]" : "text-foreground"
        }`}
      >
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{unit}</p>
    </div>
  );
}
