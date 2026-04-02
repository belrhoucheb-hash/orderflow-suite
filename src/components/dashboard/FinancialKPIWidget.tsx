import { Euro } from "lucide-react";
import { motion } from "framer-motion";
import type { Order } from "@/data/mockData";
import type { FleetVehicle } from "@/hooks/useVehicles";

interface Props {
  orders: Order[];
  vehicles: FleetVehicle[];
}

export function FinancialKPIWidget({ orders, vehicles }: Props) {
  const plannedTrips = orders.filter((o) => o.status === "IN_TRANSIT").length;
  const estimatedRevenue = plannedTrips * 485;
  const costPerKm = 1.32;

  // Beladingsgraad: total weight / total capacity
  const totalWeight = orders.reduce((s, o) => s + o.totalWeight, 0);
  const totalCapacity = vehicles.reduce((s, v) => s + v.capacityKg, 0);
  const loadPercentage = totalCapacity > 0 ? Math.round((totalWeight / totalCapacity) * 100) : 0;
  const freePercentage = 100 - loadPercentage;

  const radius = 15.9155;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.04 }}
      className="bg-card rounded-xl border border-border/40 shadow-sm p-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="h-6 w-6 rounded-md bg-primary/8 flex items-center justify-center">
          <Euro className="h-3.5 w-3.5 text-primary" />
        </div>
        <div>
          <h2 className="text-sm font-semibold font-display">Financieel Rendement</h2>
          <p className="text-xs text-muted-foreground">Eigenaar view</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground mb-1">Geraamde Omzet</p>
          <p className="text-lg font-bold font-display tabular-nums text-foreground">
            €{estimatedRevenue.toLocaleString("nl-NL")}
          </p>
          <p className="text-xs text-muted-foreground/70 mt-0.5">
            {plannedTrips} actieve ritten
          </p>
        </div>

        <div className="rounded-lg bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground mb-1">Kosten per KM</p>
          <p className="text-lg font-bold font-display tabular-nums text-foreground">
            €{costPerKm.toFixed(2)}
          </p>
          <p className="text-xs text-muted-foreground/70 mt-0.5">gem. actieve ritten</p>
        </div>

        <div className="rounded-lg bg-muted/30 p-3 flex flex-col items-center justify-center">
          <p className="text-xs text-muted-foreground mb-1.5">Beladingsgraad</p>
          <div className="relative h-14 w-14">
            <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
              <circle cx="18" cy="18" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="3.5" />
              <circle cx="18" cy="18" r={radius} fill="none" stroke="hsl(var(--primary))" strokeWidth="3.5"
                strokeDasharray={`${Math.min(loadPercentage, 100)}, ${Math.max(freePercentage, 0)}`} strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm font-bold font-display tabular-nums">{loadPercentage}%</span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
