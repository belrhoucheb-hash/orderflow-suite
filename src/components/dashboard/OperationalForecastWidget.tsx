import { CalendarPlus, Container, Truck } from "lucide-react";
import { motion } from "framer-motion";
import { mockVehicles, mockOrders } from "@/data/mockData";

export function OperationalForecastWidget() {
  // Mock: morgen capacity — vehicles not in onderhoud are potentially available
  const totalVehicles = mockVehicles.length;
  const inMaintenance = mockVehicles.filter((v) => v.status === "onderhoud").length;
  // Simulate: 2 planned for tomorrow
  const plannedTomorrow = 2;
  const freeTomorrow = totalVehicles - inMaintenance - plannedTomorrow;

  // Emballage: mock pallet counts
  const palletsRuiled = 14;
  const palletsOpen = 6;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.06 }}
      className="bg-card rounded-xl border border-border/40 shadow-sm p-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="h-6 w-6 rounded-md bg-blue-500/8 flex items-center justify-center">
          <CalendarPlus className="h-3.5 w-3.5 text-blue-600" />
        </div>
        <div>
          <h2 className="text-sm font-semibold font-display">Operationele Forecast</h2>
          <p className="text-[10px] text-muted-foreground">Planner view</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Capaciteit morgen */}
        <div className="rounded-lg bg-muted/30 p-3">
          <p className="text-[10px] text-muted-foreground mb-2">Capaciteit Morgen</p>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-[11px] text-muted-foreground">Vrij</span>
                <span className="text-[13px] font-bold font-display tabular-nums ml-auto">{freeTomorrow}</span>
              </div>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="h-2 w-2 rounded-full bg-primary" />
                <span className="text-[11px] text-muted-foreground">Gepland</span>
                <span className="text-[13px] font-bold font-display tabular-nums ml-auto">{plannedTomorrow}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                <span className="text-[11px] text-muted-foreground">Onderhoud</span>
                <span className="text-[13px] font-bold font-display tabular-nums ml-auto">{inMaintenance}</span>
              </div>
            </div>
          </div>
          {/* mini bar */}
          <div className="flex gap-0.5 mt-2.5 h-1.5 rounded-full overflow-hidden">
            <div className="bg-emerald-500 rounded-l-full" style={{ width: `${(freeTomorrow / totalVehicles) * 100}%` }} />
            <div className="bg-primary" style={{ width: `${(plannedTomorrow / totalVehicles) * 100}%` }} />
            <div className="bg-amber-500 rounded-r-full" style={{ width: `${(inMaintenance / totalVehicles) * 100}%` }} />
          </div>
        </div>

        {/* Emballage teller */}
        <div className="rounded-lg bg-muted/30 p-3">
          <p className="text-[10px] text-muted-foreground mb-2">Emballage Teller</p>
          <div className="flex items-center gap-3">
            <Container className="h-8 w-8 text-muted-foreground/30" />
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[11px] text-muted-foreground">Geruild vandaag</span>
                <span className="text-[13px] font-bold font-display tabular-nums ml-auto">{palletsRuiled}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground">Open bij klant</span>
                <span className="text-[13px] font-bold font-display tabular-nums ml-auto text-amber-600">{palletsOpen}</span>
              </div>
            </div>
          </div>
          <p className="text-[9px] text-muted-foreground/60 mt-2">Europallets</p>
        </div>
      </div>
    </motion.div>
  );
}