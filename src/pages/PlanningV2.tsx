import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { format, addDays, startOfWeek, endOfWeek } from "date-fns";
import { nl } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { Calendar as CalendarIcon, Settings2, AlertTriangle } from "lucide-react";
import { useTenantOptional } from "@/contexts/TenantContext";
import { useDrivers } from "@/hooks/useDrivers";
import { useIsPlanningV2Enabled } from "@/hooks/useIsPlanningV2Enabled";
import { useDriverAvailability } from "@/hooks/useDriverAvailability";
import { DaySetupDialog } from "@/components/planning/v2/DaySetupDialog";
import { PlanningDriverLane } from "@/components/planning/v2/PlanningDriverLane";
import { UnplacedOrdersLane, type UnplacedOrderHint } from "@/components/planning/v2/UnplacedOrdersLane";
import { AutoPlanButton } from "@/components/planning/v2/AutoPlanButton";
import { ClusterDetailPanel } from "@/components/planning/v2/ClusterDetailPanel";
import { DocksheetExportButton } from "@/components/planning/v2/DocksheetExportButton";
import { LuxeDatePicker } from "@/components/LuxeDatePicker";
import type { ConsolidationGroup } from "@/types/consolidation";

function isoWeekStart(d: Date): string {
  return format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");
}

function PlanningV2() {
  const { tenant } = useTenantOptional();
  const { data: v2Enabled, isLoading: flagLoading } = useIsPlanningV2Enabled();

  const [selectedDate, setSelectedDate] = useState<string>(format(addDays(new Date(), 1), "yyyy-MM-dd"));
  const [daySetupOpen, setDaySetupOpen] = useState(false);
  const [unplacedHints, setUnplacedHints] = useState<UnplacedOrderHint[]>([]);
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);

  const { data: drivers = [] } = useDrivers();
  const { data: driverAvailability = [] } = useDriverAvailability(selectedDate);

  // Consolidation groups voor de datum
  const { data: groups = [] } = useQuery<ConsolidationGroup[]>({
    queryKey: ["consolidation_groups_by_date", selectedDate, tenant?.id],
    enabled: !!selectedDate && !!tenant?.id,
    staleTime: 10_000,
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("consolidation_groups" as any) as any)
        .select("*, consolidation_orders(order_id, stop_sequence, order:orders(id, order_number, client_name, delivery_address, weight_kg, quantity, requirements))")
        .eq("tenant_id", tenant!.id)
        .eq("planned_date", selectedDate)
        .neq("status", "VERWORPEN")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as ConsolidationGroup[];
    },
  });

  // Orders die OPEN staan voor deze datum (PENDING, geen vehicle_id, niet in niet-verworpen cluster)
  const { data: openOrders = [] } = useQuery({
    queryKey: ["open_orders_by_date", selectedDate, tenant?.id, groups.length],
    enabled: !!selectedDate && !!tenant?.id,
    staleTime: 10_000,
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("orders") as any)
        .select("id, order_number, client_name, delivery_address, weight_kg, quantity, requirements")
        .eq("tenant_id", tenant!.id)
        .eq("delivery_date", selectedDate)
        .eq("status", "PENDING")
        .is("vehicle_id", null);
      if (error) throw error;
      const lockedIds = new Set<string>();
      groups.forEach((g) => (g.consolidation_orders ?? []).forEach((co) => lockedIds.add(co.order_id)));
      return (data ?? []).filter((o: any) => !lockedIds.has(o.id)) as any[];
    },
  });

  // Planned hours per driver this week uit view
  const weekStart = useMemo(() => isoWeekStart(new Date(selectedDate + "T00:00:00")), [selectedDate]);
  const { data: hoursRows = [] } = useQuery({
    queryKey: ["driver_hours_per_week", weekStart, tenant?.id],
    enabled: !!tenant?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("driver_hours_per_week" as any) as any)
        .select("driver_id, week_start, planned_hours")
        .eq("tenant_id", tenant!.id)
        .eq("week_start", weekStart);
      if (error) throw error;
      return (data ?? []) as Array<{ driver_id: string; week_start: string; planned_hours: number }>;
    },
  });

  const plannedHoursByDriver = useMemo(() => {
    const m = new Map<string, number>();
    hoursRows.forEach((r) => m.set(r.driver_id, Number(r.planned_hours ?? 0)));
    return m;
  }, [hoursRows]);

  const availabilityByDriver = useMemo(() => {
    const m = new Map<string, string>();
    driverAvailability.forEach((a) => m.set(a.driver_id, a.status));
    return m;
  }, [driverAvailability]);

  const groupsByDriver = useMemo(() => {
    const m = new Map<string, ConsolidationGroup[]>();
    for (const g of groups) {
      if (!g.driver_id) continue;
      if (!m.has(g.driver_id)) m.set(g.driver_id, []);
      m.get(g.driver_id)!.push(g);
    }
    return m;
  }, [groups]);

  // Drivers actief en zichtbaar in swim-lanes: alle actieve drivers, gesorteerd
  // op of ze werken op deze dag eerst.
  const activeDrivers = useMemo(() => {
    const list = drivers.filter((d: any) => d.is_active !== false);
    return [...list].sort((a, b) => {
      const sa = availabilityByDriver.get(a.id) ?? "werkt";
      const sb = availabilityByDriver.get(b.id) ?? "werkt";
      if (sa === sb) return a.name.localeCompare(b.name);
      return sa === "werkt" ? -1 : 1;
    });
  }, [drivers, availabilityByDriver]);

  // Clear hints wanneer datum verandert
  useEffect(() => setUnplacedHints([]), [selectedDate]);

  if (flagLoading) {
    return <div className="p-8 text-center text-muted-foreground">Laden...</div>;
  }

  if (!v2Enabled) {
    return (
      <div className="p-8 max-w-xl mx-auto">
        <div className="callout--luxe">
          <AlertTriangle className="callout--luxe__icon h-5 w-5" />
          <div className="space-y-3 min-w-0 flex-1">
            <div>
              <div className="callout--luxe__title">Het planbord is nog niet geactiveerd voor deze tenant</div>
              <div className="callout--luxe__body">
                Een beheerder kan het planbord inschakelen via Instellingen, Stamgegevens.
                Zodra de schakelaar aan staat is de planbord-pagina direct beschikbaar.
              </div>
            </div>
            <div className="flex justify-end">
              <Link to="/instellingen/stamgegevens">
                <button type="button" className="btn-luxe btn-luxe--primary !h-9">
                  Naar Stamgegevens
                </button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const prettyDate = format(new Date(selectedDate + "T00:00:00"), "EEEE d MMMM yyyy", { locale: nl });

  return (
    <div className="p-6 space-y-4 max-w-[1800px] mx-auto">
      <PageHeader
        title="Planbord"
        subtitle={`Dagsetup, auto-plan en swim-lanes per chauffeur voor ${prettyDate}`}
      />

      <div className="card--luxe p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 min-w-[12rem]">
          <CalendarIcon className="h-4 w-4 text-[hsl(var(--gold-deep))] shrink-0" />
          <LuxeDatePicker value={selectedDate} onChange={setSelectedDate} className="flex-1 min-w-[10rem]" />
        </div>
        <button
          type="button"
          onClick={() => setDaySetupOpen(true)}
          className="btn-luxe"
        >
          <Settings2 className="h-4 w-4" />
          Dagsetup
        </button>
        <AutoPlanButton date={selectedDate} onUnplacedChange={setUnplacedHints} />
        <DocksheetExportButton date={selectedDate} />
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="chiplet">{groups.length} clusters</span>
          <span className="chiplet chiplet--warn">{openOrders.length} open orders</span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-5">
        <div className="space-y-4">
          {activeDrivers.length === 0 && (
            <div className="card--luxe p-10 text-center text-muted-foreground">
              Geen actieve chauffeurs gevonden. Voeg chauffeurs toe via Stamgegevens.
            </div>
          )}
          {activeDrivers.map((driver) => (
            <PlanningDriverLane
              key={driver.id}
              driver={{
                id: driver.id,
                name: driver.name,
                status: availabilityByDriver.get(driver.id),
                contract_hours_per_week: (driver as any).contract_hours_per_week ?? null,
              }}
              groups={groupsByDriver.get(driver.id) ?? []}
              plannedHoursThisWeek={plannedHoursByDriver.get(driver.id) ?? 0}
              onSelectGroup={setSelectedClusterId}
            />
          ))}
        </div>

        <div className="space-y-3">
          <UnplacedOrdersLane orders={openOrders} hints={unplacedHints} />
        </div>
      </div>

      <DaySetupDialog open={daySetupOpen} onOpenChange={setDaySetupOpen} date={selectedDate} />
      <ClusterDetailPanel groupId={selectedClusterId} onClose={() => setSelectedClusterId(null)} />
    </div>
  );
}

export default PlanningV2;
