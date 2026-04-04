/**
 * F5: EmballageWidget
 * Small dashboard card: outstanding count, client count, top 3 clients.
 */
import { useMemo } from "react";
import { Package, AlertTriangle, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useAllPackagingBalances } from "@/hooks/usePackaging";

export function EmballageWidget() {
  const { data: balances = [], isLoading } = useAllPackagingBalances();

  const { totalOutstanding, clientCount, top3 } = useMemo(() => {
    const outstanding = balances.filter((b) => (b.balance ?? 0) > 0);

    const totalOutstanding = outstanding.reduce((s, b) => s + (b.balance ?? 0), 0);

    const byClient: Record<string, { name: string; total: number }> = {};
    for (const b of outstanding) {
      const id = b.client_id;
      const name = b.client?.name ?? id;
      if (!byClient[id]) byClient[id] = { name, total: 0 };
      byClient[id].total += b.balance ?? 0;
    }
    const clientCount = Object.keys(byClient).length;
    const top3 = Object.values(byClient)
      .sort((a, c) => c.total - a.total)
      .slice(0, 3);

    return { totalOutstanding, clientCount, top3 };
  }, [balances]);

  return (
    <div className="bg-card rounded-xl border border-border/40 shadow-sm overflow-hidden h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-amber-500" />
          <h2 className="section-title text-sm">Emballage</h2>
        </div>
        <Link to="/rapportage" className="text-xs text-primary hover:underline flex items-center gap-1">
          Rapport <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="p-4 space-y-4">
        {isLoading ? (
          <div className="text-center py-4">
            <div className="h-4 w-16 bg-muted animate-pulse rounded mx-auto" />
          </div>
        ) : (
          <>
            {/* KPI row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-amber-50 border border-amber-100 p-3 text-center">
                <p className={`text-2xl font-bold tabular-nums ${totalOutstanding > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                  {totalOutstanding}
                </p>
                <p className="text-xs text-amber-700 mt-0.5">stuks uitstaand</p>
              </div>
              <div className="rounded-lg bg-muted/50 border border-border p-3 text-center">
                <p className="text-2xl font-bold tabular-nums">{clientCount}</p>
                <p className="text-xs text-muted-foreground mt-0.5">klanten</p>
              </div>
            </div>

            {/* Top 3 clients */}
            {top3.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Top klanten
                </p>
                {top3.map((c, i) => (
                  <div key={c.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-4 text-right tabular-nums">
                        {i + 1}.
                      </span>
                      <span className="font-medium text-foreground truncate max-w-[140px]">{c.name}</span>
                    </div>
                    <span className="font-bold tabular-nums text-amber-600 shrink-0">
                      {c.total}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-3 text-center">
                <Package className="h-8 w-8 text-muted-foreground/20 mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">Geen uitstaande emballage</p>
              </div>
            )}

            {totalOutstanding > 0 && (
              <div className="flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                <p className="text-xs text-amber-700">
                  {totalOutstanding} stuks bij {clientCount} {clientCount === 1 ? "klant" : "klanten"} uitstaand
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
