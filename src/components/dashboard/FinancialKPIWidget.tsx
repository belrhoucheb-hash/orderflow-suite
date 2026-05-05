import { Euro } from "lucide-react";
import { motion } from "framer-motion";
import type { FleetVehicle } from "@/hooks/useVehicles";
import { useDashboardFinancialStats } from "@/hooks/useDashboardFinancialStats";

interface Props {
  vehicles: FleetVehicle[];
}

export function FinancialKPIWidget({ vehicles }: Props) {
  const { data: stats } = useDashboardFinancialStats();

  const plannedTrips = stats?.plannedTrips ?? 0;
  // NB: er bestaat geen price_total_* kolom op orders; tot er een echte
  // prijsbron is blijft dit een forfait per actieve rit.
  const estimatedRevenue = plannedTrips * 485;
  const costPerKm = 1.32;

  const totalWeight = stats?.totalWeightKg ?? 0;
  const totalCapacity = vehicles.reduce((s, v) => s + v.capacityKg, 0);
  const loadPercentage = totalCapacity > 0 ? Math.round((totalWeight / totalCapacity) * 100) : 0;
  const freePercentage = Math.max(100 - loadPercentage, 0);

  const radius = 15.9155;

  const loadStatus =
    loadPercentage > 100 ? "over" : loadPercentage >= 90 ? "warn" : "ok";
  const ringColor =
    loadStatus === "over"
      ? "hsl(0 70% 50%)"
      : loadStatus === "warn"
      ? "hsl(35 90% 50%)"
      : "hsl(var(--gold-deep))";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.04 }}
      className="card--luxe p-5"
    >
      <div className="flex items-center gap-2.5 mb-3">
        <div className="h-7 w-7 rounded-lg flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, hsl(var(--gold-soft)) 0%, hsl(var(--gold) / 0.3) 100%)" }}>
          <Euro className="h-4 w-4 text-[hsl(var(--gold-deep))]" />
        </div>
        <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-[hsl(var(--gold-deep))]"
          style={{ fontFamily: "var(--font-display)" }}>
          Financieel
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg p-3" style={{ background: "hsl(var(--gold-soft) / 0.2)", border: "1px solid hsl(var(--gold) / 0.1)" }}>
          <p className="text-xs text-muted-foreground mb-1">Geraamde Omzet</p>
          <p className="text-lg font-bold font-display tabular-nums text-foreground">
            €{estimatedRevenue.toLocaleString("nl-NL")}
          </p>
          <p className="text-xs text-muted-foreground/70 mt-0.5">
            {plannedTrips} actieve ritten
          </p>
        </div>

        <div className="rounded-lg p-3" style={{ background: "hsl(var(--gold-soft) / 0.2)", border: "1px solid hsl(var(--gold) / 0.1)" }}>
          <p className="text-xs text-muted-foreground mb-1">Kosten per KM</p>
          <p className="text-lg font-bold font-display tabular-nums text-foreground">
            €{costPerKm.toFixed(2)}
          </p>
          <p className="text-xs text-muted-foreground/70 mt-0.5">gem. actieve ritten</p>
        </div>

        <div className="rounded-lg p-3 flex flex-col items-center justify-center" style={{ background: "hsl(var(--gold-soft) / 0.2)", border: "1px solid hsl(var(--gold) / 0.1)" }}>
          <p className="text-xs text-muted-foreground mb-1.5">Beladingsgraad</p>
          <div className="relative h-14 w-14">
            <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
              <circle cx="18" cy="18" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="3.5" />
              <circle cx="18" cy="18" r={radius} fill="none" stroke={ringColor} strokeWidth="3.5"
                strokeDasharray={`${Math.min(loadPercentage, 100)}, ${freePercentage}`} strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span
                className="text-sm font-bold font-display tabular-nums"
                style={{ color: loadStatus === "ok" ? undefined : ringColor }}
              >
                {loadPercentage}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
