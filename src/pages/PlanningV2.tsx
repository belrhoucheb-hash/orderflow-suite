import { useState, useMemo, useEffect } from "react";
import { format, addDays, startOfWeek, endOfWeek } from "date-fns";
import { nl } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { Calendar as CalendarIcon, Settings2 } from "lucide-react";
import { useTenantOptional } from "@/contexts/TenantContext";
import { usePlanningDrivers } from "@/hooks/useDrivers";
import { useVehiclesRaw } from "@/hooks/useVehiclesRaw";
import { usePlanningDaySupport } from "@/hooks/usePlanningDaySupport";
import { DaySetupDialog } from "@/components/planning/v2/DaySetupDialog";
import { PlanningDriverLane } from "@/components/planning/v2/PlanningDriverLane";
import { UnplacedOrdersLane, type UnplacedOrderHint } from "@/components/planning/v2/UnplacedOrdersLane";
import { AutoPlanButton } from "@/components/planning/v2/AutoPlanButton";
import { ClusterDetailPanel } from "@/components/planning/v2/ClusterDetailPanel";
import { DocksheetExportButton } from "@/components/planning/v2/DocksheetExportButton";
import { LuxeDatePicker } from "@/components/LuxeDatePicker";
import { RoosterConflictBanner } from "@/components/planning/rooster/RoosterConflictBanner";
import type { ConsolidationGroup } from "@/types/consolidation";
import type { DriverSchedule } from "@/types/rooster";
import ChauffeursRit from "@/pages/ChauffeursRit";
import { RoosterTab } from "@/components/planning/rooster/RoosterTab";
import { cn } from "@/lib/utils";
import { useAllDriverCountryRestrictions } from "@/hooks/useDriverCountryRestrictions";
import { getDriverCountryRestrictionIssue } from "@/lib/driverCountryRestrictions";
import { DeferredMount } from "@/components/performance/DeferredMount";

function isoWeekStart(d: Date): string {
  return format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");
}

function PlanningV2() {
  const { tenant } = useTenantOptional();

  const [selectedDate, setSelectedDate] = useState<string>(format(addDays(new Date(), 1), "yyyy-MM-dd"));
  const [daySetupOpen, setDaySetupOpen] = useState(false);
  const [unplacedHints, setUnplacedHints] = useState<UnplacedOrderHint[]>([]);
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [section, setSection] = useState<"planning" | "ritten" | "rooster">("planning");

  const { data: drivers = [] } = usePlanningDrivers();
  const { data: countryRestrictions = [] } = useAllDriverCountryRestrictions();
  const { data: vehiclesRaw = [] } = useVehiclesRaw();
  const weekStart = useMemo(() => isoWeekStart(new Date(selectedDate + "T00:00:00")), [selectedDate]);
  const {
    data: planningSupport = { driverAvailability: [], schedulesForDate: [], hoursRows: [] },
  } = usePlanningDaySupport(selectedDate, weekStart);
  const { driverAvailability, schedulesForDate, hoursRows } = planningSupport;

  // Consolidation groups voor de datum
  const { data: groups = [] } = useQuery<ConsolidationGroup[]>({
    queryKey: ["consolidation_groups_by_date", selectedDate, tenant?.id],
    enabled: !!selectedDate && !!tenant?.id,
    staleTime: 10_000,
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("consolidation_groups" as any) as any)
        .select("*, consolidation_orders(order_id, stop_sequence, order:orders(id, order_number, client_name, pickup_address, delivery_address, pickup_country, delivery_country, weight_kg, quantity, requirements))")
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
        .select("id, order_number, client_name, pickup_address, delivery_address, pickup_country, delivery_country, weight_kg, quantity, requirements")
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

  const scheduleByDriver = useMemo(() => {
    const m = new Map<string, DriverSchedule>();
    (schedulesForDate as DriverSchedule[]).forEach((s) => m.set(s.driver_id, s));
    return m;
  }, [schedulesForDate]);

  const driverNames = useMemo(() => {
    const m = new Map<string, string>();
    drivers.forEach((d: any) => m.set(d.id, d.name));
    return m;
  }, [drivers]);

  const vehicleLabels = useMemo(() => {
    const m = new Map<string, string>();
    vehiclesRaw.forEach((v) => m.set(v.id, v.plate || v.code || v.name));
    return m;
  }, [vehiclesRaw]);

  const groupsByDriver = useMemo(() => {
    const m = new Map<string, ConsolidationGroup[]>();
    for (const g of groups) {
      if (!g.driver_id) continue;
      if (!m.has(g.driver_id)) m.set(g.driver_id, []);
      m.get(g.driver_id)!.push(g);
    }
    return m;
  }, [groups]);

  const countryIssueByDriver = useMemo(() => {
    const m = new Map<string, ReturnType<typeof getDriverCountryRestrictionIssue>>();
    for (const driver of drivers) {
      const driverGroups = groupsByDriver.get(driver.id) ?? [];
      const driverOrders = driverGroups.flatMap((group) =>
        (group.consolidation_orders ?? [])
          .map((co: any) => co.order)
          .filter(Boolean),
      );
      m.set(
        driver.id,
        getDriverCountryRestrictionIssue(driver.id, driverOrders, countryRestrictions, selectedDate),
      );
    }
    return m;
  }, [countryRestrictions, drivers, groupsByDriver, selectedDate]);

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

  const prettyDate = format(new Date(selectedDate + "T00:00:00"), "EEEE d MMMM yyyy", { locale: nl });

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Operatie"
        title="Planbord"
        subtitle={
          section === "planning"
            ? `Dagsetup, auto-plan en swim-lanes per chauffeur voor ${prettyDate}`
            : section === "ritten"
              ? "Ritten per chauffeur, samenstellen en dispatchen"
              : "Chauffeurs inplannen per dag of week, los van orders"
        }
      />

      <div className="inline-flex items-center gap-0.5 p-0.5 rounded-full border border-[hsl(var(--gold)/0.2)] bg-[hsl(var(--card))]">
        {[
          { value: "planning" as const, label: "Planning" },
          { value: "ritten" as const, label: "Ritten" },
          { value: "rooster" as const, label: "Rooster" },
        ].map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setSection(t.value)}
            aria-pressed={section === t.value}
            className={cn(
              "px-4 h-7 rounded-full text-[10px] uppercase tracking-[0.18em] font-semibold transition-colors",
              section === t.value
                ? "bg-[hsl(var(--gold-soft)/0.65)] text-[hsl(var(--gold-deep))]"
                : "text-muted-foreground/70 hover:text-foreground",
            )}
            style={{ fontFamily: "var(--font-display)" }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {section === "planning" && (
        <>
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

          <RoosterConflictBanner
            schedules={schedulesForDate as DriverSchedule[]}
            date={selectedDate}
            driverNames={driverNames}
            vehicleLabels={vehicleLabels}
          />

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
                  schedule={scheduleByDriver.get(driver.id) ?? null}
                  vehicleLabels={vehicleLabels}
                  countryRestrictionIssue={countryIssueByDriver.get(driver.id) ?? null}
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
        </>
      )}

      {section === "ritten" && (
        <DeferredMount label="Ritten laden">
          <ChauffeursRit />
        </DeferredMount>
      )}

      {section === "rooster" && (
        <DeferredMount label="Rooster laden">
          <RoosterTab />
        </DeferredMount>
      )}
    </div>
  );
}

export default PlanningV2;
