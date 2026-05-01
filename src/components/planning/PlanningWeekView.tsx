import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useVehicles } from "@/hooks/useVehicles";
import { type PlanOrder, type Assignments } from "./types";
import { getTotalWeight } from "./planningUtils";
import { toDateString } from "./PlanningDateNav";
import { Truck, Package, Weight } from "lucide-react";
import { cn } from "@/lib/utils";

const DAY_LABELS = ["Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag", "Zondag"];
const SHORT_LABELS = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];

interface PlanningWeekViewProps {
  weekStart: string; // YYYY-MM-DD (Monday)
  onDayClick: (date: string) => void;
  /** Current day's draft assignments (for showing draft data on the selected day) */
  draftAssignments: Record<string, Assignments>; // key = dateStr
}

/** Get Monday of the week containing the given date string */
function getMonday(dateStr: string): Date {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export function PlanningWeekView({ weekStart, onDayClick, draftAssignments }: PlanningWeekViewProps) {
  const { data: fleetVehicles = [] } = useVehicles();
  const monday = getMonday(weekStart);
  const mondayTime = monday.getTime();
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 7);

  const mondayStr = toDateString(monday);
  const sundayStr = toDateString(sunday);

  // Query all orders for this week that are PLANNED or have a trip
  const { data: weekOrders = [] } = useQuery({
    queryKey: ["planning-week-orders", mondayStr, sundayStr],
    queryFn: async () => {
      // Get planned orders for this week (status PLANNED with a vehicle)
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, client_name, delivery_address, quantity, weight_kg, is_weight_per_unit, vehicle_id, delivery_date, status")
        .in("status", ["PLANNED", "PENDING"])
        .gte("delivery_date", mondayStr)
        .lt("delivery_date", sundayStr)
        .order("order_number", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        order_number: number;
        client_name: string | null;
        delivery_address: string | null;
        quantity: number | null;
        weight_kg: number | null;
        is_weight_per_unit: boolean;
        vehicle_id: string | null;
        delivery_date: string | null;
        status: string;
      }>;
    },
  });

  // Also query trips for this week
  const { data: weekTrips = [] } = useQuery({
    queryKey: ["planning-week-trips", mondayStr, sundayStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trips")
        .select("id, vehicle_id, planned_date, dispatch_status")
        .gte("planned_date", mondayStr)
        .lt("planned_date", sundayStr)
        .order("planned_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        vehicle_id: string;
        planned_date: string;
        dispatch_status: string;
      }>;
    },
  });

  // Build the week grid data
  const weekDays = useMemo(() => {
    const weekStartDate = new Date(mondayTime);
    const days: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStartDate);
      d.setDate(weekStartDate.getDate() + i);
      days.push(toDateString(d));
    }
    return days;
  }, [mondayTime]);

  const today = toDateString(new Date());

  // Per day, per vehicle: { stops, weight }
  const gridData = useMemo(() => {
    const data: Record<string, Record<string, { stops: number; weightKg: number; status: string }>> = {};

    for (const day of weekDays) {
      data[day] = {};

      // Check draft assignments first
      const draft = draftAssignments[day];
      if (draft) {
        for (const [vId, orders] of Object.entries(draft)) {
          if (orders.length === 0) continue;
          const totalW = orders.reduce((s, o) => s + getTotalWeight(o), 0);
          data[day][vId] = { stops: orders.length, weightKg: totalW, status: "CONCEPT" };
        }
      }

      // DB-confirmed planned orders
      const dayOrders = weekOrders.filter((o) => o.delivery_date === day && o.vehicle_id && o.status === "PLANNED");
      const byVehicle = new Map<string, typeof dayOrders>();
      for (const o of dayOrders) {
        const vId = o.vehicle_id!;
        if (!byVehicle.has(vId)) byVehicle.set(vId, []);
        byVehicle.get(vId)!.push(o);
      }
      for (const [vId, orders] of byVehicle) {
        // Don't overwrite draft data
        if (data[day][vId]) continue;
        const totalW = orders.reduce((s, o) => {
          const w = o.weight_kg ?? 0;
          return s + (o.is_weight_per_unit && o.quantity ? w * o.quantity : w);
        }, 0);
        data[day][vId] = { stops: orders.length, weightKg: totalW, status: "PLANNED" };
      }

      // Also check trips
      const dayTrips = weekTrips.filter((t) => t.planned_date === day);
      for (const trip of dayTrips) {
        if (!data[day][trip.vehicle_id]) {
          // Trip exists but no orders matched - still show it
          data[day][trip.vehicle_id] = { stops: 0, weightKg: 0, status: trip.dispatch_status };
        }
      }
    }

    return data;
  }, [weekDays, weekOrders, weekTrips, draftAssignments]);

  // Determine which vehicles have any data this week
  const activeVehicleIds = useMemo(() => {
    const ids = new Set<string>();
    for (const day of weekDays) {
      for (const vId of Object.keys(gridData[day] ?? {})) {
        ids.add(vId);
      }
    }
    // Always show all fleet vehicles
    for (const v of fleetVehicles) {
      ids.add(v.id);
    }
    return [...ids];
  }, [weekDays, gridData, fleetVehicles]);

  // Pending orders without date this week
  const pendingNoDate = weekOrders.filter((o) => !o.delivery_date && o.status === "PENDING").length;

  return (
    <div className="flex flex-col gap-3">
      {pendingNoDate > 0 && (
        <div className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 rounded-lg border border-amber-200 dark:border-amber-800">
          {pendingNoDate} order(s) zonder leverdatum — zichtbaar in de dagweergave als PENDING
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border/40 bg-card shadow-sm">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/40">
              <th className="text-left p-2 font-medium text-muted-foreground w-[140px] sticky left-0 bg-card z-10">
                Voertuig
              </th>
              {weekDays.map((day, i) => {
                const isToday = day === today;
                const isWeekend = i >= 5;
                return (
                  <th
                    key={day}
                    className={cn(
                      "p-2 text-center font-medium min-w-[110px] cursor-pointer hover:bg-muted/50 transition-colors",
                      isToday && "bg-primary/5 text-primary",
                      isWeekend && "bg-muted/30"
                    )}
                    onClick={() => onDayClick(day)}
                  >
                    <div>{SHORT_LABELS[i]}</div>
                    <div className={cn("text-[10px]", isToday ? "text-primary" : "text-muted-foreground")}>
                      {new Date(day + "T00:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {activeVehicleIds.map((vId) => {
              const vehicle = fleetVehicles.find((v) => v.id === vId);
              const name = vehicle?.name ?? vId.slice(0, 8);

              return (
                <tr key={vId} className="border-b border-border/20 hover:bg-muted/20">
                  <td className="p-2 sticky left-0 bg-card z-10">
                    <div className="flex items-center gap-1.5">
                      <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium truncate max-w-[110px]">{name}</span>
                    </div>
                  </td>
                  {weekDays.map((day, i) => {
                    const cell = gridData[day]?.[vId];
                    const isToday = day === today;
                    const isWeekend = i >= 5;

                    if (!cell || cell.stops === 0) {
                      return (
                        <td
                          key={day}
                          className={cn(
                            "p-2 text-center cursor-pointer hover:bg-muted/50 transition-colors",
                            isToday && "bg-primary/5",
                            isWeekend && "bg-muted/30"
                          )}
                          onClick={() => onDayClick(day)}
                        >
                          <span className="text-muted-foreground/40">—</span>
                        </td>
                      );
                    }

                    const isConcept = cell.status === "CONCEPT";

                    return (
                      <td
                        key={day}
                        className={cn(
                          "p-1.5 cursor-pointer hover:bg-muted/50 transition-colors",
                          isToday && "bg-primary/5",
                          isWeekend && "bg-muted/30"
                        )}
                        onClick={() => onDayClick(day)}
                      >
                        <div
                          className={cn(
                            "rounded-md p-1.5 text-center",
                            isConcept
                              ? "bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800"
                              : "bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800"
                          )}
                        >
                          <div className="flex items-center justify-center gap-1">
                            <Package className="h-3 w-3" />
                            <span className="font-semibold">{cell.stops}</span>
                          </div>
                          {cell.weightKg > 0 && (
                            <div className="flex items-center justify-center gap-0.5 text-[10px] text-muted-foreground mt-0.5">
                              <Weight className="h-2.5 w-2.5" />
                              {cell.weightKg >= 1000
                                ? `${(cell.weightKg / 1000).toFixed(1)}t`
                                : `${Math.round(cell.weightKg)}kg`}
                            </div>
                          )}
                          {isConcept && (
                            <div className="text-[9px] text-amber-600 dark:text-amber-400 mt-0.5">concept</div>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {activeVehicleIds.length === 0 && (
              <tr>
                <td colSpan={8} className="p-8 text-center text-muted-foreground">
                  Geen voertuigen of planning gevonden voor deze week.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
