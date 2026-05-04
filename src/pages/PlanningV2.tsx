import { useState, useMemo, useEffect } from "react";
import { format, addDays, startOfWeek, endOfWeek } from "date-fns";
import { nl } from "date-fns/locale";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { getPostcodeRegion, getRegionLabel } from "@/data/geoData";
import { toast } from "sonner";

function isoWeekStart(d: Date): string {
  return format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");
}

interface PlanningBoardPayload {
  groups: ConsolidationGroup[];
  openOrders: any[];
}

function PlanningV2() {
  const { tenant } = useTenantOptional();
  const queryClient = useQueryClient();

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

  // Bundled day payload: one RPC replaces separate cluster + open-order
  // fetches, reducing round-trips, RLS checks and nested row reads.
  const { data: board = { groups: [], openOrders: [] } } = useQuery<PlanningBoardPayload>({
    queryKey: ["planning_board", selectedDate, tenant?.id],
    enabled: !!selectedDate && !!tenant?.id,
    staleTime: 10_000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("planning_board_v1", {
        p_tenant_id: tenant!.id,
        p_date: selectedDate,
      });
      if (error) throw error;
      return {
        groups: ((data?.groups ?? []) as unknown) as ConsolidationGroup[],
        openOrders: ((data?.open_orders ?? []) as unknown) as any[],
      };
    },
  });
  const groups = board.groups;
  const openOrders = board.openOrders;

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

  const vehicleById = useMemo(() => {
    const m = new Map<string, (typeof vehiclesRaw)[number]>();
    vehiclesRaw.forEach((v) => m.set(v.id, v));
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
  const selectedCluster = useMemo(
    () => groups.find((group) => group.id === selectedClusterId) ?? null,
    [groups, selectedClusterId],
  );
  const selectedClusterDriver = useMemo(
    () => drivers.find((driver: any) => driver.id === selectedCluster?.driver_id) ?? null,
    [drivers, selectedCluster?.driver_id],
  );
  const selectedClusterVehicle = useMemo(
    () => (selectedCluster?.vehicle_id ? vehicleById.get(selectedCluster.vehicle_id) ?? null : null),
    [selectedCluster?.vehicle_id, vehicleById],
  );

  function pickVehicleForOrder(order: any, preferredVehicleId?: string | null) {
    if (preferredVehicleId) return vehicleById.get(preferredVehicleId) ?? null;
    const weight = Number(order.weight_kg ?? 0);
    const pallets = Number(order.quantity ?? 0);
    const fitting = vehiclesRaw
      .filter((vehicle) => vehicle.is_active !== false)
      .filter((vehicle) => {
        const weightCap = Number(vehicle.capacity_kg ?? 0);
        const palletCap = Number(vehicle.capacity_pallets ?? 0);
        return (!weightCap || weight <= weightCap) && (!palletCap || pallets <= palletCap);
      })
      .sort((a, b) => {
        const aCap = Number(a.capacity_pallets ?? 999) * 1000 + Number(a.capacity_kg ?? 99999);
        const bCap = Number(b.capacity_pallets ?? 999) * 1000 + Number(b.capacity_kg ?? 99999);
        return aCap - bCap;
      });
    return fitting[0] ?? null;
  }

  function calculateUtilization(order: any, vehicle: any | null): number | null {
    if (!vehicle) return null;
    const weightCap = Number(vehicle.capacity_kg ?? 0);
    const palletCap = Number(vehicle.capacity_pallets ?? 0);
    const weightPct = weightCap > 0 ? (Number(order.weight_kg ?? 0) / weightCap) * 100 : 0;
    const palletPct = palletCap > 0 ? (Number(order.quantity ?? 0) / palletCap) * 100 : 0;
    const pct = Math.max(weightPct, palletPct);
    return Number.isFinite(pct) && pct > 0 ? Math.round(pct * 10) / 10 : null;
  }

  async function handleDropOrderOnDriver(driverId: string, orderId: string) {
    if (!tenant?.id) return;
    const order = openOrders.find((o: any) => o.id === orderId) as any | undefined;
    const driver = drivers.find((d: any) => d.id === driverId) as any | undefined;
    if (!order || !driver) return;

    const schedule = scheduleByDriver.get(driverId);
    const vehicle = pickVehicleForOrder(order, schedule?.vehicle_id ?? null);
    const utilizationPct = calculateUtilization(order, vehicle);
    const region = getPostcodeRegion(order.delivery_address ?? "");
    const regionLabel = getRegionLabel(region);

    try {
      const { data: group, error: groupError } = await (supabase
        .from("consolidation_groups" as any) as any)
        .insert({
          tenant_id: tenant.id,
          name: `${regionLabel} - #${order.order_number}`,
          planned_date: selectedDate,
          status: "VOORSTEL",
          driver_id: driverId,
          vehicle_id: vehicle?.id ?? null,
          total_weight_kg: order.weight_kg ?? 0,
          total_pallets: order.quantity ?? 0,
          total_distance_km: null,
          estimated_duration_min: 75,
          utilization_pct: utilizationPct,
          proposal_source: "manual",
        })
        .select("id")
        .single();
      if (groupError || !group) throw groupError ?? new Error("Cluster kon niet worden aangemaakt");

      const { error: orderError } = await (supabase
        .from("consolidation_orders" as any) as any)
        .insert({
          group_id: group.id,
          order_id: orderId,
          stop_sequence: 1,
        });
      if (orderError) throw orderError;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["planning_board", selectedDate] }),
        queryClient.invalidateQueries({ queryKey: ["consolidation_groups_by_date", selectedDate] }),
        queryClient.invalidateQueries({ queryKey: ["open_orders_by_date", selectedDate] }),
      ]);
      toast.success("Order op planbord gezet", {
        description: `#${order.order_number} staat als voorstel bij ${driver.name}${vehicle ? ` met ${vehicle.plate || vehicle.name}` : ""}.`,
      });
    } catch (err) {
      toast.error("Slepen mislukt", {
        description: err instanceof Error ? err.message : "Kon order niet bij chauffeur zetten.",
      });
    }
  }

  async function handleReturnGroupToOpen(groupId: string) {
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;
    if (group.status !== "VOORSTEL") {
      toast.info("Alleen voorstellen kunnen terug", {
        description: "Bevestigde of ingeplande ritten moeten via de detailactie worden aangepast.",
      });
      return;
    }
    try {
      const { error } = await (supabase.rpc as any)("reject_consolidation_group", {
        p_group_id: groupId,
        p_reason: "Teruggezet naar open via planbord",
      });
      if (error) throw error;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["planning_board", selectedDate] }),
        queryClient.invalidateQueries({ queryKey: ["consolidation_groups_by_date", selectedDate] }),
        queryClient.invalidateQueries({ queryKey: ["open_orders_by_date", selectedDate] }),
      ]);
      toast.success("Voorstel teruggezet", {
        description: "De orders staan weer bij Open te plannen.",
      });
    } catch (err) {
      toast.error("Terugzetten mislukt", {
        description: err instanceof Error ? err.message : "Kon voorstel niet terugzetten.",
      });
    }
  }

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Operatie"
        title="Planbord"
        subtitle={
          section === "planning"
            ? `Dagvoorbereiding, automatisch plannen en rijstroken per chauffeur voor ${prettyDate}`
            : section === "ritten"
              ? "Ritten per chauffeur, samenstellen en dispatchen"
              : "Chauffeurs inplannen per dag of week, los van orders"
        }
      />

      <div className="flex w-full max-w-full overflow-x-auto sm:inline-flex sm:w-auto items-center gap-0.5 p-0.5 rounded-full border border-[hsl(var(--gold)/0.2)] bg-[hsl(var(--card))]">
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
              "h-7 shrink-0 rounded-full px-4 text-[10px] uppercase tracking-[0.18em] font-semibold transition-colors",
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
            <div className="flex w-full flex-wrap items-center gap-3 text-sm sm:ml-auto sm:w-auto">
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
                  onReturnGroup={handleReturnGroupToOpen}
                  onDropOrder={handleDropOrderOnDriver}
                />
              ))}
            </div>

            <div className="space-y-3">
              <UnplacedOrdersLane
                orders={openOrders}
                hints={unplacedHints}
                onDropGroup={handleReturnGroupToOpen}
                assignOptions={activeDrivers.map((driver: any) => ({
                  id: driver.id,
                  name: driver.name,
                }))}
                onAssignOrder={handleDropOrderOnDriver}
              />
            </div>
          </div>

          <DaySetupDialog open={daySetupOpen} onOpenChange={setDaySetupOpen} date={selectedDate} />
          <ClusterDetailPanel
            groupId={selectedClusterId}
            groupSummary={selectedCluster as any}
            driverSummary={selectedClusterDriver as any}
            vehicleSummary={selectedClusterVehicle as any}
            onClose={() => setSelectedClusterId(null)}
          />
        </>
      )}

      {section === "ritten" && (
        <DeferredMount label="Ritten laden">
          <ChauffeursRit date={selectedDate} />
        </DeferredMount>
      )}

      {section === "rooster" && (
        <DeferredMount label="Rooster laden">
          <RoosterTab date={selectedDate} />
        </DeferredMount>
      )}
    </div>
  );
}

export default PlanningV2;
