import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { format, addDays, startOfWeek, endOfWeek } from "date-fns";
import { nl } from "date-fns/locale";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowLeft, Calendar as CalendarIcon, Settings2, AlertTriangle } from "lucide-react";
import { useTenantOptional } from "@/contexts/TenantContext";
import { useDrivers } from "@/hooks/useDrivers";
import { useIsPlanningV2Enabled } from "@/hooks/useIsPlanningV2Enabled";
import { useDriverAvailability } from "@/hooks/useDriverAvailability";
import { DaySetupDialog } from "@/components/planning/v2/DaySetupDialog";
import { PlanningDriverLane } from "@/components/planning/v2/PlanningDriverLane";
import { UnplacedOrdersLane, type UnplacedOrderHint } from "@/components/planning/v2/UnplacedOrdersLane";
import { AutoPlanButton } from "@/components/planning/v2/AutoPlanButton";
import type { ConsolidationGroup } from "@/types/consolidation";

function isoWeekStart(d: Date): string {
  return format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");
}

function PlanningV2() {
  const { tenant } = useTenantOptional();
  const qc = useQueryClient();
  const { data: v2Enabled, isLoading: flagLoading } = useIsPlanningV2Enabled();

  const [selectedDate, setSelectedDate] = useState<string>(format(addDays(new Date(), 1), "yyyy-MM-dd"));
  const [daySetupOpen, setDaySetupOpen] = useState(false);
  const [unplacedHints, setUnplacedHints] = useState<UnplacedOrderHint[]>([]);

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

  async function handleConfirm(groupId: string) {
    const { error } = await (supabase.rpc as any)("confirm_consolidation_group", { p_group_id: groupId });
    if (error) {
      toast.error("Bevestigen mislukt", { description: error.message });
      return;
    }
    toast.success("Cluster bevestigd", { description: "Trip en stops zijn aangemaakt." });
    qc.invalidateQueries({ queryKey: ["consolidation_groups_by_date"] });
  }

  async function handleReject(groupId: string) {
    const { error } = await (supabase.rpc as any)("reject_consolidation_group", { p_group_id: groupId, p_reason: null });
    if (error) {
      toast.error("Verwerpen mislukt", { description: error.message });
      return;
    }
    toast.info("Cluster verworpen", { description: "Orders staan weer open te plannen." });
    qc.invalidateQueries({ queryKey: ["consolidation_groups_by_date"] });
  }

  if (flagLoading) {
    return <div className="p-8 text-center text-muted-foreground">Laden...</div>;
  }

  if (!v2Enabled) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <Card className="p-6 border-amber-300 bg-amber-50/40 space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-2 min-w-0">
              <h2 className="font-semibold">Planbord v2 staat uit voor deze tenant</h2>
              <p className="text-sm text-muted-foreground">Activeer planbord v2 via Stamgegevens of direct in de database:</p>
              <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
{`UPDATE tenant_settings
SET settings = settings || '{"v2_enabled":true}'::jsonb
WHERE category='planning' AND tenant_id='${tenant?.id}';`}
              </pre>
              <Link to="/planning" className="inline-block">
                <Button variant="outline" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Terug naar oude planbord
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const prettyDate = format(new Date(selectedDate + "T00:00:00"), "EEEE d MMMM yyyy", { locale: nl });

  return (
    <div className="p-6 space-y-4 max-w-[1800px] mx-auto">
      <PageHeader
        title="Planbord 2.0"
        subtitle={`Dagsetup, auto-plan en swim-lanes per chauffeur voor ${prettyDate}`}
        actions={
          <Link to="/planning">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Oude planbord
            </Button>
          </Link>
        }
      />

      <Card className="p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="border rounded-md px-3 py-1.5 text-sm bg-background"
          />
        </div>
        <Button variant="outline" onClick={() => setDaySetupOpen(true)} className="gap-2">
          <Settings2 className="h-4 w-4" />
          Dagsetup
        </Button>
        <AutoPlanButton date={selectedDate} onUnplacedChange={setUnplacedHints} />
        <div className="ml-auto text-sm text-muted-foreground">
          {groups.length} clusters, {openOrders.length} open orders
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-4">
        <div className="space-y-3">
          {activeDrivers.length === 0 && (
            <Card className="p-8 text-center text-muted-foreground">
              Geen actieve chauffeurs gevonden. Voeg chauffeurs toe via Stamgegevens.
            </Card>
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
              onConfirmGroup={handleConfirm}
              onRejectGroup={handleReject}
            />
          ))}
        </div>

        <div className="space-y-3">
          <UnplacedOrdersLane orders={openOrders} hints={unplacedHints} />
        </div>
      </div>

      <DaySetupDialog open={daySetupOpen} onOpenChange={setDaySetupOpen} date={selectedDate} />
    </div>
  );
}

export default PlanningV2;
