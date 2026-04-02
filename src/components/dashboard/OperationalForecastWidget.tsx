import { CalendarPlus, Container } from "lucide-react";
import { motion } from "framer-motion";
import type { Order } from "@/data/mockData";
import type { FleetVehicle } from "@/hooks/useVehicles";

interface Props {
  vehicles: FleetVehicle[];
  orders: Order[];
}

export function OperationalForecastWidget({ vehicles, orders }: Props) {
  const totalVehicles = vehicles.length || 1;
  // Orders with status IN_TRANSIT or PLANNED = planned/active
  const plannedCount = orders.filter((o) => o.status === "IN_TRANSIT" || o.status === "PLANNED").length;
  const freeCount = Math.max(totalVehicles - plannedCount, 0);

  // Pallet count from orders (exclude completed/cancelled)
  const palletOrders = orders.filter((o) => o.status !== "DELIVERED" && o.status !== "CANCELLED");
  const totalPallets = palletOrders.reduce((s, o) => s + (o.items?.length || 0), 0);

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
          <p className="text-xs text-muted-foreground">Planner view</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground mb-2">Capaciteit</p>
          <div className="flex items-center gap-1.5 mb-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-xs text-muted-foreground">Vrij</span>
            <span className="text-sm font-bold font-display tabular-nums ml-auto">{freeCount}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-primary" />
            <span className="text-xs text-muted-foreground">Gepland</span>
            <span className="text-sm font-bold font-display tabular-nums ml-auto">{plannedCount}</span>
          </div>
          <div className="flex gap-0.5 mt-2.5 h-1.5 rounded-full overflow-hidden">
            <div className="bg-emerald-500 rounded-l-full" style={{ width: `${(freeCount / totalVehicles) * 100}%` }} />
            <div className="bg-primary rounded-r-full" style={{ width: `${(plannedCount / totalVehicles) * 100}%` }} />
          </div>
        </div>

        <div className="rounded-lg bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground mb-2">Totaal gewicht actief</p>
          <div className="flex items-center gap-3">
            <Container className="h-8 w-8 text-muted-foreground/30" />
            <div>
              <p className="text-lg font-bold font-display tabular-nums">
                {orders.reduce((s, o) => s + o.totalWeight, 0).toLocaleString()} kg
              </p>
              <p className="text-xs text-muted-foreground/60">{orders.length} orders</p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
