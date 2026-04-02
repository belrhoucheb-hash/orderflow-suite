import { useState, useMemo, useCallback, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  DragStartEvent,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useVehicles, type FleetVehicle } from "@/hooks/useVehicles";
import { useDrivers } from "@/hooks/useDrivers";
import {
  resolveCoordinates,
  getPostcodeRegion,
  getRegionLabel,
  haversineKm,
  type GeoCoord,
} from "@/data/geoData";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Truck,
  CheckCircle2,
  MapPin,
  List,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

// Local planning components
import { type PlanOrder, type Assignments, DISTANCE_WARN_KM } from "@/components/planning/types";
import { 
  getTotalWeight, 
  hasTag, 
  optimizeRoute, 
  getEmptyReason, 
  computeRouteStats,
  getCity
} from "@/components/planning/planningUtils";
import { VehicleAvailabilityPanel } from "@/components/planning/VehicleAvailabilityPanel";
import { PlanningOrderCard } from "@/components/planning/PlanningOrderCard";
import { PlanningVehicleCard } from "@/components/planning/PlanningVehicleCard";
import { PlanningUnassignedSidebar } from "@/components/planning/PlanningUnassignedSidebar";
import { PlanningMap } from "@/components/planning/PlanningMap";
import { useTenant } from "@/contexts/TenantContext";
import { solveVRP } from "@/lib/vrpSolver";

const Planning = () => {
  const { data: fleetVehicles = [] } = useVehicles();
  const { data: drivers = [] } = useDrivers();
  const [assignments, setAssignments] = useState<Assignments>({});
  const [search, setSearch] = useState("");
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [activeOrder, setActiveOrder] = useState<PlanOrder | null>(null);
  const [rejectedVehicle, setRejectedVehicle] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [showMap, setShowMap] = useState(true);
  const [hoveredVehicle, setHoveredVehicle] = useState<string | null>(null);
  const [hoveredOrderId, setHoveredOrderId] = useState<string | null>(null);
  const [vehicleStartTimes, setVehicleStartTimes] = useState<Record<string, string>>({});
  const [vehicleDrivers, setVehicleDrivers] = useState<Record<string, string>>({});
  const { tenant } = useTenant();

  // ── Auto-restore planning draft from localStorage on mount ──
  const [draftRestored, setDraftRestored] = useState(false);
  useEffect(() => {
    try {
      const savedAssignments = localStorage.getItem("planning-draft");
      const savedStartTimes = localStorage.getItem("planning-draft-startTimes");
      const savedDrivers = localStorage.getItem("planning-draft-drivers");
      let restored = false;
      if (savedAssignments) {
        const parsed = JSON.parse(savedAssignments) as Assignments;
        const hasOrders = Object.values(parsed).some(arr => arr.length > 0);
        if (hasOrders) {
          setAssignments(parsed);
          restored = true;
        }
      }
      if (savedStartTimes) {
        setVehicleStartTimes(JSON.parse(savedStartTimes));
      }
      if (savedDrivers) {
        setVehicleDrivers(JSON.parse(savedDrivers));
      }
      if (restored) {
        setDraftRestored(true);
        toast.success("Vorige planning hersteld", { description: "Je conceptplanning is hersteld vanuit lokale opslag." });
      }
    } catch {
      // Ignore corrupt localStorage data
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-save assignments, vehicleStartTimes, vehicleDrivers to localStorage ──
  useEffect(() => {
    // Don't save empty state during initial mount before restore
    const hasOrders = Object.values(assignments).some(arr => arr.length > 0);
    if (hasOrders) {
      localStorage.setItem("planning-draft", JSON.stringify(assignments));
    }
  }, [assignments]);

  useEffect(() => {
    if (Object.keys(vehicleStartTimes).length > 0) {
      localStorage.setItem("planning-draft-startTimes", JSON.stringify(vehicleStartTimes));
    }
  }, [vehicleStartTimes]);

  useEffect(() => {
    if (Object.keys(vehicleDrivers).length > 0) {
      localStorage.setItem("planning-draft-drivers", JSON.stringify(vehicleDrivers));
    }
  }, [vehicleDrivers]);

  const handleClearDraft = useCallback(() => {
    localStorage.removeItem("planning-draft");
    localStorage.removeItem("planning-draft-startTimes");
    localStorage.removeItem("planning-draft-drivers");
    setAssignments({});
    toast.success("Concept gewist", { description: "Lokale planninggegevens zijn verwijderd." });
  }, []);

  // Initialize vehicle start times and drivers
  useEffect(() => {
    if (fleetVehicles.length > 0) {
      setVehicleStartTimes((prev) => {
        const next = { ...prev };
        for (const v of fleetVehicles) {
          if (!(v.id in next)) next[v.id] = "07:00";
        }
        return next;
      });
      setVehicleDrivers((prev) => {
        const next = { ...prev };
        for (const v of fleetVehicles) {
          if (!(v.id in next)) next[v.id] = "";
        }
        return next;
      });
    }
  }, [fleetVehicles]);

  // Auto-suggest drivers
  useEffect(() => {
    setVehicleDrivers(prev => {
      const next = { ...prev };
      let changed = false;
      for (const v of fleetVehicles) {
        const assigned = assignments[v.id] ?? [];
        if (assigned.length > 0 && !next[v.id]) {
          const needsADR = assigned.some(o => hasTag(o, "ADR"));
          const needsKoeling = assigned.some(o => hasTag(o, "KOELING"));
          const candidates = drivers.filter(d => {
            if (needsADR && (!d.certifications || !d.certifications.includes("ADR"))) return false;
            if (needsKoeling && (!d.certifications || !d.certifications.includes("KOELING"))) return false;
            return true;
          });
          const suggested = candidates.length > 0 ? candidates[0].id : "";
          if (suggested) { next[v.id] = suggested; changed = true; }
        }
      }
      return changed ? next : prev;
    });
  }, [assignments, fleetVehicles, drivers]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const { data: dbOrders = [], refetch } = useQuery({
    queryKey: ["planning-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, client_name, delivery_address, quantity, weight_kg, requirements, is_weight_per_unit")
        .in("status", ["DRAFT", "PENDING"])
        .is("vehicle_id", null)
        .order("order_number", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as unknown as PlanOrder[]).map(o => ({
        ...o,
        time_window_start: (o as any).time_window_start ?? null,
        time_window_end: (o as any).time_window_end ?? null,
      }));
    },
  });

  const orders = dbOrders;


  const assignedIds = useMemo(() => {
    const ids = new Set<string>();
    Object.values(assignments).forEach((arr) => arr.forEach((o) => ids.add(o.id)));
    return ids;
  }, [assignments]);

  const orderCoords = useMemo(() => {
    const map = new Map<string, GeoCoord>();
    for (const o of orders) {
      const coord = resolveCoordinates(o.delivery_address);
      if (coord) map.set(o.id, coord);
    }
    return map;
  }, [orders]);

  const orderToVehicle = useMemo(() => {
    const map = new Map<string, string>();
    for (const [vId, arr] of Object.entries(assignments)) {
      for (const o of arr) map.set(o.id, vId);
    }
    return map;
  }, [assignments]);

  const groupedUnassigned = useMemo(() => {
    const filtered = orders
      .filter((o) => !assignedIds.has(o.id))
      .filter((o) => {
        if (search) {
          const q = search.toLowerCase();
          if (
            !o.client_name?.toLowerCase().includes(q) &&
            !o.delivery_address?.toLowerCase().includes(q) &&
            !String(o.order_number).includes(q)
          )
            return false;
        }
        if (filterTag && !hasTag(o, filterTag)) return false;
        return true;
      });

    const withRegion = filtered.map((o) => ({
      order: o,
      region: getPostcodeRegion(o.delivery_address),
    }));
    withRegion.sort((a, b) => a.region.localeCompare(b.region));

    const groups: { region: string; label: string; orders: PlanOrder[] }[] = [];
    let currentRegion = "";
    for (const { order, region } of withRegion) {
      if (region !== currentRegion) {
        currentRegion = region;
        groups.push({ region, label: getRegionLabel(region), orders: [] });
      }
      groups[groups.length - 1].orders.push(order);
    }
    return groups;
  }, [orders, assignedIds, search, filterTag]);

  const totalUnassigned = groupedUnassigned.reduce((s, g) => s + g.orders.length, 0);

  const highlightedIds = useMemo(() => {
    const ids = new Set<string>();
    if (hoveredVehicle) {
      (assignments[hoveredVehicle] ?? []).forEach((o) => ids.add(o.id));
    }
    if (hoveredOrderId) {
      ids.add(hoveredOrderId);
    }
    return ids;
  }, [hoveredVehicle, hoveredOrderId, assignments]);

  const validateDrop = useCallback(
    (order: PlanOrder, vehicle: FleetVehicle): string | null => {
      if (hasTag(order, "KOELING") && !vehicle.features.includes("KOELING")) {
        return `${vehicle.name} heeft geen koeling – niet geschikt voor koelorders.`;
      }
      if (hasTag(order, "ADR") && !vehicle.features.includes("ADR")) {
        return `${vehicle.name} heeft geen ADR-uitrusting – niet geschikt voor ADR-orders.`;
      }
      return null;
    },
    []
  );

  const checkDistanceWarning = useCallback(
    (order: PlanOrder, vehicleId: string) => {
      const newCoord = orderCoords.get(order.id);
      if (!newCoord) return;
      const existing = assignments[vehicleId] ?? [];
      for (const ex of existing) {
        const exCoord = orderCoords.get(ex.id);
        if (!exCoord) continue;
        const dist = haversineKm(newCoord, exCoord);
        if (dist > DISTANCE_WARN_KM) {
          toast.warning("Afstandswaarschuwing!", { description: `${getCity(order.delivery_address)} naar ${getCity(ex.delivery_address)}: ${Math.round(dist)} km uit elkaar.` });
          return;
        }
      }
    },
    [assignments, orderCoords]
  );

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    let order = orders.find((o) => o.id === id);
    if (!order) {
      for (const arr of Object.values(assignments)) {
        order = arr.find((o) => o.id === id);
        if (order) break;
      }
    }
    if (order) setActiveOrder(order);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveOrder(null);
    setRejectedVehicle(null);

    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    if (overId === "unassigned") {
      const sourceVehicle = orderToVehicle.get(activeId);
      if (sourceVehicle) {
        handleRemove(activeId);
        toast.success("Order teruggezet", { description: "Order is weer beschikbaar voor planning." });
      }
      return;
    }

    const activeVehicle = orderToVehicle.get(activeId);
    const overVehicle = orderToVehicle.get(overId);

    if (activeVehicle && activeVehicle === overVehicle) {
      setAssignments((prev) => {
        const list = [...(prev[activeVehicle] ?? [])];
        const oldIndex = list.findIndex((o) => o.id === activeId);
        const newIndex = list.findIndex((o) => o.id === overId);
        if (oldIndex === -1 || newIndex === -1) return prev;
        return { ...prev, [activeVehicle]: arrayMove(list, oldIndex, newIndex) };
      });
      return;
    }

    let order = orders.find((o) => o.id === activeId);
    if (!order && activeVehicle) {
      order = assignments[activeVehicle]?.find((o) => o.id === activeId);
    }
    if (!order) return;

    let targetVehicle = fleetVehicles.find((v) => v.id === overId);
    if (!targetVehicle && overVehicle) {
      targetVehicle = fleetVehicles.find((v) => v.id === overVehicle);
    }
    if (!targetVehicle) return;

    if (activeVehicle === targetVehicle.id) return;

    const error = validateDrop(order, targetVehicle);
    if (error) {
      setRejectedVehicle(targetVehicle.id);
      setTimeout(() => setRejectedVehicle(null), 600);
      toast.error("Niet toegestaan", { description: error });
      return;
    }

    checkDistanceWarning(order, targetVehicle.id);

    setAssignments((prev) => {
      const next = { ...prev };
      for (const vId of Object.keys(next)) {
        next[vId] = next[vId].filter((o) => o.id !== order!.id);
      }
      const newList = [...(next[targetVehicle!.id] ?? []), order!];
      next[targetVehicle!.id] = optimizeRoute(newList, orderCoords);
      return next;
    });

    const fromLabel = activeVehicle ? fleetVehicles.find((v) => v.id === activeVehicle)?.name : "ongepland";
    toast.success("Order verplaatst", { description: `${order.client_name} naar ${targetVehicle.name} (van ${fromLabel})` });
  };

  const handleRemove = (orderId: string) => {
    setAssignments((prev) => {
      const next = { ...prev };
      for (const vId of Object.keys(next)) {
        next[vId] = next[vId].filter((o) => o.id !== orderId);
      }
      return next;
    });
  };

  const handleReorder = (vehicleId: string, oldIndex: number, newIndex: number) => {
    setAssignments((prev) => ({
      ...prev,
      [vehicleId]: arrayMove(prev[vehicleId] ?? [], oldIndex, newIndex),
    }));
  };

  const handleOptimize = useCallback((vehicleId: string) => {
    setAssignments((prev) => {
      const list = prev[vehicleId] ?? [];
      if (list.length <= 1) return prev;
      return { ...prev, [vehicleId]: optimizeRoute(list, orderCoords) };
    });
    toast.success("Route geoptimaliseerd", { description: "Volgorde herberekend via nearest-neighbor." });
  }, [orderCoords]);

  const handleAutoPlan = useCallback(() => {
    const unassigned = orders.filter((o) => !assignedIds.has(o.id));
    
    if (unassigned.length === 0) {
      toast.success("Geen orders", { description: "Er zijn geen ongeplande orders om te verdelen." });
      return;
    }

    const newAssignments = solveVRP(unassigned, fleetVehicles, orderCoords, assignments);
    setAssignments(newAssignments);

    const placedCount = Object.values(newAssignments).reduce((s, a) => s + a.length, 0) - assignedIds.size;
    
    if (placedCount > 0) {
      toast.success(`${placedCount} orders automatisch verdeeld`, { description: "Optimalisatie voltooid via slimme VRP solver." });
    } else {
      toast.error("Beperkte capaciteit", { description: "Geen van de resterende orders past op de beschikbare voertuigen." });
    }
  }, [orders, assignedIds, assignments, orderCoords, fleetVehicles]);

  const handleClearPlanning = useCallback(() => {
    setAssignments({});
    toast.success("Planning gewist", { description: "Alle ritten zijn leeggemaakt." });
  }, []);

  const handleCombineTrips = useCallback(() => {
    const vehiclesWithOrders = fleetVehicles
      .map((v) => ({
        vehicle: v,
        orders: assignments[v.id] ?? [],
      }))
      .filter((v) => v.orders.length > 0);

    if (vehiclesWithOrders.length < 2) {
      toast.success("Combineer ritten", { description: "Onderbezetting — niet genoeg ritten om te combineren." });
      return;
    }

    let combinedCount = 0;
    const newAssignments = { ...assignments };
    const sorted = [...vehiclesWithOrders].sort((a, b) => a.vehicle.capacityKg - b.vehicle.capacityKg);
    const emptied = new Set<string>();

    for (let i = 0; i < sorted.length; i++) {
        const source = sorted[i];
        if (emptied.has(source.vehicle.id)) continue;
        const sourceRegions = new Set(source.orders.map(o => getPostcodeRegion(o.delivery_address)));
        const sourceNeedsKoeling = source.orders.some(o => hasTag(o, "KOELING"));
        const sourceNeedsADR = source.orders.some(o => hasTag(o, "ADR"));

        for (let j = 0; j < sorted.length; j++) {
            if (i === j) continue;
            const target = sorted[j];
            if (emptied.has(target.vehicle.id)) continue;
            if (sourceNeedsKoeling && !target.vehicle.features.includes("KOELING")) continue;
            if (sourceNeedsADR && !target.vehicle.features.includes("ADR")) continue;

            const tOrders = newAssignments[target.vehicle.id] ?? [];
            const tWeight = tOrders.reduce((s, o) => s + getTotalWeight(o), 0);
            const tPallets = tOrders.reduce((s, o) => s + (o.quantity ?? 0), 0);
            const sOrders = newAssignments[source.vehicle.id] ?? [];
            const sWeight = sOrders.reduce((s, o) => s + getTotalWeight(o), 0);
            const sPallets = sOrders.reduce((s, o) => s + (o.quantity ?? 0), 0);

            if (tWeight + sWeight > target.vehicle.capacityKg) continue;
            if (tPallets + sPallets > target.vehicle.capacityPallets) continue;

            const tRegions = new Set(tOrders.map(o => getPostcodeRegion(o.delivery_address)));
            const isNearby = tRegions.size === 0 || [...sourceRegions].some(sr => {
                const srNum = parseInt(sr);
                return [...tRegions].some(tr => {
                    const trNum = parseInt(tr);
                    return isNaN(srNum) || isNaN(trNum) || Math.abs(srNum - trNum) <= 15;
                });
            });
            if (!isNearby) continue;

            newAssignments[target.vehicle.id] = optimizeRoute([...tOrders, ...sOrders], orderCoords);
            newAssignments[source.vehicle.id] = [];
            emptied.add(source.vehicle.id);
            combinedCount++;
            break;
        }
    }

    if (combinedCount > 0) {
      setAssignments(newAssignments);
      toast.success(`${combinedCount} ritten gecombineerd`);
    } else {
      toast.success("Geen ritten gecombineerd", { description: "Geen passende combinaties gevonden." });
    }
  }, [assignments, orderCoords, fleetVehicles]);

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      const totalAssigned = Object.values(assignments).reduce((s, a) => s + a.length, 0);
      const plannedDate = new Date().toISOString().split("T")[0];
      let tripsCreated = 0;

      for (const [vId, vOrders] of Object.entries(assignments)) {
        if (vOrders.length === 0) continue;
        const v = fleetVehicles.find(fv => fv.id === vId);
        const driverId = vehicleDrivers[vId] || null;
        const startTime = vehicleStartTimes[vId] || null;

        // 1. Update orders: set status PLANNED + vehicle_id
        for (let i = 0; i < vOrders.length; i++) {
          const order = vOrders[i];
          const { error } = await supabase
            .from("orders")
            .update({ vehicle_id: v?.id ?? vId, status: "PLANNED", stop_sequence: i + 1 } as any)
            .eq("id", order.id);
          if (error) throw error;
        }

        // 2. Create a trip for this vehicle

        const tripInsert: Record<string, any> = {
          vehicle_id: v?.id ?? vId,
          driver_id: driverId,
          planned_date: plannedDate,
          planned_start_time: startTime ? `${startTime}:00` : null,
          dispatch_status: "CONCEPT" as const,
        };
        if (tenant?.id) {
          tripInsert.tenant_id = tenant.id;
        }

        const { data: trip, error: tripErr } = await supabase
          .from("trips")
          .insert(tripInsert)
          .select("id")
          .single();
        if (tripErr) throw tripErr;

        // 3. Create trip_stops for each order in this vehicle
        const stopInserts = vOrders
          .map((order, idx) => ({
            trip_id: trip.id,
            order_id: order.id,
            stop_type: "DELIVERY" as const,
            stop_sequence: idx + 1,
            planned_address: order.delivery_address ?? "",
            stop_status: "GEPLAND" as const,
          }));

        if (stopInserts.length > 0) {
          const { error: stopsErr } = await supabase
            .from("trip_stops")
            .insert(stopInserts);
          if (stopsErr) throw stopsErr;
        }

        tripsCreated++;
      }

      toast.success("Planning bevestigd", { description: `${totalAssigned} orders ingepland in ${tripsCreated} ${tripsCreated === 1 ? "rit" : "ritten"}.` });
      // Clear localStorage draft after successful confirm
      localStorage.removeItem("planning-draft");
      localStorage.removeItem("planning-draft-startTimes");
      localStorage.removeItem("planning-draft-drivers");
      setAssignments({});
      refetch();
    } catch (err: any) {
      console.error("Planning confirm error:", err);
      toast.error("Fout bij bevestigen", { description: err?.message || "Kon planning niet opslaan." });
    } finally {
      setIsConfirming(false);
    }
  };

  const totalAssigned = Object.values(assignments).reduce((s, a) => s + a.length, 0);

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex flex-col h-[calc(100vh-5rem)] gap-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shrink-0">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Truck className="h-4.5 w-4.5 text-primary" />
              </div>
              Smart Planning
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Sleep orders naar voertuigen · {totalUnassigned} beschikbaar · {totalAssigned} ingepland</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant={showMap ? "default" : "outline"}
              size="sm"
              className="gap-1.5 text-xs rounded-lg"
              onClick={() => setShowMap(!showMap)}
            >
              {showMap ? <List className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}
              {showMap ? "Verberg kaart" : "Toon kaart"}
            </Button>
            {draftRestored && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs rounded-lg text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={handleClearDraft}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Wis concept
              </Button>
            )}
            {totalAssigned > 0 && (
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                <Button
                  onClick={handleConfirm}
                  disabled={isConfirming}
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Planning</span> Bevestigen ({totalAssigned})
                </Button>
              </motion.div>
            )}
          </div>
        </div>

        <VehicleAvailabilityPanel />

        <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
          <PlanningUnassignedSidebar 
            orders={orders}
            assignedIds={assignedIds}
            groupedUnassigned={groupedUnassigned}
            search={search}
            onSearchChange={setSearch}
            filterTag={filterTag}
            onFilterTagChange={setFilterTag}
            onCombineTrips={handleCombineTrips}
            onAutoPlan={handleAutoPlan}
            onClearPlanning={handleClearPlanning}
            onHoverOrder={setHoveredOrderId}
            fleetVehicles={fleetVehicles}
            assignments={assignments}
            totalUnassigned={totalUnassigned}
            totalAssigned={totalAssigned}
          />

          <div className={cn("flex-1 overflow-y-auto", showMap && "lg:w-1/2")}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {fleetVehicles.map((vehicle) => (
                <PlanningVehicleCard
                  key={vehicle.id}
                  vehicle={vehicle}
                  assigned={assignments[vehicle.id] ?? []}
                  onRemove={handleRemove}
                  onReorder={handleReorder}
                  onOptimize={handleOptimize}
                  rejected={rejectedVehicle === vehicle.id}
                  onHoverVehicle={setHoveredVehicle}
                  onHoverOrder={setHoveredOrderId}
                  startTime={vehicleStartTimes[vehicle.id] ?? "07:00"}
                  onStartTimeChange={(vId, t) => setVehicleStartTimes((p) => ({ ...p, [vId]: t }))}
                  driverId={vehicleDrivers[vehicle.id] ?? ""}
                  onDriverChange={(vId, d) => setVehicleDrivers((p) => ({ ...p, [vId]: d }))}
                  orderCoords={orderCoords}
                  emptyReason={getEmptyReason(vehicle, orders, assignedIds)}
                  drivers={drivers}
                />
              ))}
            </div>
          </div>

          {showMap && (
            <div className="hidden lg:block lg:w-1/4 min-w-[300px] bg-card rounded-xl border border-border/40 overflow-hidden shadow-sm relative z-0">
              <PlanningMap 
                orders={orders}
                orderCoords={orderCoords}
                orderToVehicle={orderToVehicle}
                highlightedIds={highlightedIds}
                assignments={assignments}
                fleetVehicles={fleetVehicles}
              />
            </div>
          )}
        </div>

        <DragOverlay>
          {activeOrder && (
            <PlanningOrderCard order={activeOrder} overlay />
          )}
        </DragOverlay>
      </div>
    </DndContext>
  );
};

export default Planning;
