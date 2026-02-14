import { Euro, Fuel, PieChart } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { mockOrders, mockVehicles } from "@/data/mockData";

export function FinancialKPIWidget() {
  const activeTrips = mockVehicles.filter((v) => v.status === "onderweg").length;
  const estimatedRevenue = activeTrips * 485; // avg revenue per trip
  const costPerKm = 1.32;
  
  // Beladingsgraad: total current load / total capacity
  const totalLoad = mockVehicles.reduce((s, v) => s + v.currentLoad, 0);
  const totalCapacity = mockVehicles.reduce((s, v) => s + v.capacity, 0);
  const loadPercentage = Math.round((totalLoad / totalCapacity) * 100);
  const freePercentage = 100 - loadPercentage;

  // SVG donut segments
  const radius = 15.9155;
  const circumference = 2 * Math.PI * radius;

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
          <p className="text-[10px] text-muted-foreground">Eigenaar view</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {/* Geraamde omzet */}
        <div className="rounded-lg bg-muted/30 p-3">
          <p className="text-[10px] text-muted-foreground mb-1">Geraamde Omzet</p>
          <p className="text-lg font-bold font-display tabular-nums text-foreground">
            €{estimatedRevenue.toLocaleString("nl-NL")}
          </p>
          <p className="text-[9px] text-muted-foreground/70 mt-0.5">
            {activeTrips} actieve ritten
          </p>
        </div>

        {/* Kosten per KM */}
        <div className="rounded-lg bg-muted/30 p-3">
          <p className="text-[10px] text-muted-foreground mb-1">Kosten per KM</p>
          <p className="text-lg font-bold font-display tabular-nums text-foreground">
            €{costPerKm.toFixed(2)}
          </p>
          <p className="text-[9px] text-muted-foreground/70 mt-0.5">
            gem. actieve ritten
          </p>
        </div>

        {/* Beladingsgraad donut */}
        <div className="rounded-lg bg-muted/30 p-3 flex flex-col items-center justify-center">
          <p className="text-[10px] text-muted-foreground mb-1.5">Beladingsgraad</p>
          <div className="relative h-14 w-14">
            <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
              <circle
                cx="18" cy="18" r={radius}
                fill="none"
                stroke="hsl(var(--muted))"
                strokeWidth="3.5"
              />
              <circle
                cx="18" cy="18" r={radius}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="3.5"
                strokeDasharray={`${loadPercentage}, ${freePercentage}`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[13px] font-bold font-display tabular-nums">{loadPercentage}%</span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}