import { CalendarPlus, Container } from "lucide-react";
import { motion } from "framer-motion";
import type { FleetVehicle } from "@/hooks/useVehicles";
import { useDashboardForecastStats } from "@/hooks/useDashboardForecastStats";

interface Props {
  vehicles: FleetVehicle[];
}

export function OperationalForecastWidget({ vehicles }: Props) {
  const { data: stats } = useDashboardForecastStats();

  const totalVehicles = vehicles.length || 1;
  const plannedCount = stats?.plannedOrInTransit ?? 0;
  const freeCount = Math.max(totalVehicles - plannedCount, 0);
  const activeOrderCount = stats?.activeOrderCount ?? 0;
  const activeWeightKg = stats?.activeTotalWeightKg ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.06 }}
      className="card--luxe p-5"
    >
      <div className="flex items-center gap-2.5 mb-3">
        <div className="h-7 w-7 rounded-lg flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, hsl(var(--gold-soft)) 0%, hsl(var(--gold) / 0.3) 100%)" }}>
          <CalendarPlus className="h-4 w-4 text-[hsl(var(--gold-deep))]" />
        </div>
        <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-[hsl(var(--gold-deep))]"
          style={{ fontFamily: "var(--font-display)" }}>
          Operationeel
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg p-3" style={{ background: "hsl(var(--gold-soft) / 0.2)", border: "1px solid hsl(var(--gold) / 0.1)" }}>
          <p className="text-xs text-muted-foreground mb-2">Capaciteit</p>
          <div className="flex items-center gap-1.5 mb-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-xs text-muted-foreground">Vrij</span>
            <span className="text-sm font-bold font-display tabular-nums ml-auto">{freeCount}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: "hsl(var(--gold-deep))" }} />
            <span className="text-xs text-muted-foreground">Gepland</span>
            <span className="text-sm font-bold font-display tabular-nums ml-auto">{plannedCount}</span>
          </div>
          <div className="flex gap-0.5 mt-2.5 h-1.5 rounded-full overflow-hidden">
            <div className="bg-emerald-500 rounded-l-full" style={{ width: `${(freeCount / totalVehicles) * 100}%` }} />
            <div className="rounded-r-full" style={{ background: "hsl(var(--gold-deep))", width: `${(plannedCount / totalVehicles) * 100}%` }} />
          </div>
        </div>

        <div className="rounded-lg p-3" style={{ background: "hsl(var(--gold-soft) / 0.2)", border: "1px solid hsl(var(--gold) / 0.1)" }}>
          <p className="text-xs text-muted-foreground mb-2">Totaal gewicht actief</p>
          <div className="flex items-center gap-3">
            <Container className="h-8 w-8 text-muted-foreground/30" />
            <div>
              <p className="text-lg font-bold font-display tabular-nums">
                {activeWeightKg.toLocaleString()} kg
              </p>
              <p className="text-xs text-muted-foreground/60">{activeOrderCount} actieve orders</p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
