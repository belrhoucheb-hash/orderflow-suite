import { useState, useMemo, useCallback, useEffect, useRef } from "react";
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
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { QueryError } from "@/components/QueryError";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { PlanningDateNav, toDateString, type ViewMode } from "@/components/planning/PlanningDateNav";
import { PlanningWeekView } from "@/components/planning/PlanningWeekView";
import { useTenant } from "@/contexts/TenantContext";
import { solveVRP } from "@/lib/vrpSolver";
import { useLoadPlanningDraft, useSavePlanningDraft, useDeletePlanningDraft, collectWeekDrafts, usePlanningDraftsRealtime } from "@/hooks/usePlanningDrafts";

const Planning = () => {
  const { data: fleetVehicles = [] } = useVehicles();
  const { data: drivers = [] } = useDrivers();
  const [assignments, setAssignments] = useState<Assignments>({});
  const [search, setSearch] = useState("");
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [activeOrder, setActiveOrder] = useState<PlanOrder | null>(null);
  const [rejectedVehicle, setRejectedVehicle] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showClearDraftDialog, setShowClearDraftDialog] = useState(false);
  const [showMap, setShowMap] = useState(true);
  const [hoveredVehicle, setHoveredVehicle] = useState<string | null>(null);
  const [hoveredOrderId, setHoveredOrderId] = useState<string | null>(null);
  const [vehicleStartTimes, setVehicleStartTimes] = useState<Record<string, string>>({});
  const [vehicleDrivers, setVehicleDrivers] = useState<Record<string, string>>({});
  const { tenant } = useTenant();

  // ── Database draft hooks ──
  const saveDraftMutation = useSavePlanningDraft();
  const deleteDraftMutation = useDeletePlanningDraft();
  usePlanningDraftsRealtime();
  const dbSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Multi-day planning state ──
  const [selectedDate, setSelectedDate] = useState<string>(toDateString(new Date()));
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const prevDateRef = useRef<string>(selectedDate);

  // ── Load planning draft from database (with localStorage fallback) ──
  const { data: dbDraft, isSuccess: dbDraftLoaded } = useLoadPlanningDraft(selectedDate, tenant?.id);
  const [draftRestored, setDraftRestored] = useState(false);
  const dbDraftAppliedRef = useRef<string | null>(null);
  const pendingDraftOrderIdsRef = useRef<Record<string, string[]> | null>(null);

  // Apply draft when it arrives (Supabase with localStorage fallback handled by the hook)
  useEffect(() => {
    // Prevent re-applying the same date's draft
    if (dbDraftAppliedRef.current === selectedDate) return;
    if (!dbDraftLoaded) return;

    dbDraftAppliedRef.current = selectedDate;

    if (dbDraft) {
      setVehicleStartTimes(prev => ({ ...prev, ...dbDraft.startTimes }));
      setVehicleDrivers(prev => ({ ...prev, ...dbDraft.drivers }));
      // Store raw order IDs for hydration (assignments is Record<vehicleId, string[]> from DB)
      pendingDraftOrderIdsRef.current = dbDraft.assignments;
      setDraftRestored(true);
      toast.success("Planning hersteld", { description: `Conceptplanning voor ${selectedDate} hersteld.` });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbDraftLoaded, dbDraft, selectedDate]);

  // ── Save current draft and load new when date changes ──
  const handleDateChange = useCallback((newDate: string) => {
    // Flush debounce and save to Supabase + localStorage immediately
    if (dbSaveTimerRef.current) clearTimeout(dbSaveTimerRef.current);
    if (tenant?.id) {
      const hasOrders = Object.values(assignments).some(arr => arr.length > 0);
      if (hasOrders) {
        saveDraftMutation.mutate({
          tenantId: tenant.id,
          date: prevDateRef.current,
          assignments,
          startTimes: vehicleStartTimes,
          drivers: vehicleDrivers,
        });
      }
    }

    // Reset hydration ref so the new date's DB draft will be applied
    dbDraftAppliedRef.current = null;
    dbHydratedRef.current = false;

    // Temporarily clear assignments — the DB query + hydration will restore them
    setAssignments({});
    setDraftRestored(false);

    prevDateRef.current = newDate;
    setSelectedDate(newDate);
  }, [assignments, vehicleStartTimes, vehicleDrivers, tenant?.id, saveDraftMutation]);

  // ── Auto-save assignments to Supabase (debounced 2s, localStorage written through by hook) ──
  useEffect(() => {
    if (dbSaveTimerRef.current) clearTimeout(dbSaveTimerRef.current);
    if (tenant?.id) {
      dbSaveTimerRef.current = setTimeout(() => {
        const hasOrders = Object.values(assignments).some(arr => arr.length > 0);
        if (hasOrders) {
          saveDraftMutation.mutate({
            tenantId: tenant.id,
            date: selectedDate,
            assignments,
            startTimes: vehicleStartTimes,
            drivers: vehicleDrivers,
          });
        }
      }, 2000);
    }
    return () => {
      if (dbSaveTimerRef.current) clearTimeout(dbSaveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignments, vehicleStartTimes, vehicleDrivers, selectedDate, tenant?.id]);

  const handleClearDraft = useCallback(() => {
    // Delete from Supabase + localStorage (handled by the hook)
    if (tenant?.id) {
      deleteDraftMutation.mutate({ tenantId: tenant.id, date: selectedDate });
    }
    setAssignments({});
    toast.success("Concept gewist", { description: `Planninggegevens voor ${selectedDate} verwijderd.` });
  }, [selectedDate, tenant?.id, deleteDraftMutation]);

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

  // Compute next day for date range queries
  const nextDay = useMemo(() => {
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() + 1);
    return toDateString(d);
  }, [selectedDate]);

  const { data: dbOrders = [], refetch, isLoading: ordersLoading, isError: ordersError } = useQuery({
    queryKey: ["planning-orders", selectedDate],
    queryFn: async () => {
      // Fetch orders for selected date: either matching delivery_date or PENDING without date
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, client_name, pickup_address, delivery_address, quantity, weight_kg, requirements, is_weight_per_unit, time_window_start, time_window_end, geocoded_pickup_lat, geocoded_pickup_lng, geocoded_delivery_lat, geocoded_delivery_lng, delivery_date, pickup_date, info_status, missing_fields")
        .eq("status", "PENDING")
        .is("vehicle_id", null)
        .order("order_number", { ascending: true });
      if (error) throw error;
      // Client-side filter: orders matching this date OR orders without delivery_date
      return ((data ?? []) as unknown as PlanOrder[])
        .filter(o => {
          if (!o.delivery_date) return true; // PENDING without date → always show
          return o.delivery_date >= selectedDate && o.delivery_date < nextDay;
        })
        .map(o => ({
          ...o,
          time_window_start: (o as any).time_window_start ?? null,
          time_window_end: (o as any).time_window_end ?? null,
        }));
    },
  });

  const orders = dbOrders;

  // ── Hydrate DB draft order IDs into full PlanOrder objects ──
  const dbHydratedRef = useRef(false);
  useEffect(() => {
    const pending = pendingDraftOrderIdsRef.current;
    if (!pending || orders.length === 0 || dbHydratedRef.current) return;

    const orderMap = new Map(orders.map(o => [o.id, o]));
    const hydrated: Assignments = {};
    let hasAny = false;

    for (const [vehicleId, orderIds] of Object.entries(pending)) {
      const resolved = (orderIds as unknown as string[])
        .map(id => orderMap.get(id))
        .filter((o): o is PlanOrder => !!o);
      if (resolved.length > 0) {
        hydrated[vehicleId] = resolved;
        hasAny = true;
      }
    }

    if (hasAny) {
      setAssignments(hydrated);
    }
    pendingDraftOrderIdsRef.current = null;
    dbHydratedRef.current = true;
  }, [orders]);

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
      const plannedDate = selectedDate;
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

        // 3. Create trip_stops: PICKUP stops first, then DELIVERY stops
        const stopInserts: Record<string, any>[] = [];
        let seq = 0;

        // Group orders by unique pickup address to create one PICKUP stop per location
        const pickupGroups = new Map<string, PlanOrder[]>();
        for (const order of vOrders) {
          const addr = order.pickup_address?.trim() || "";
          if (!addr) continue;
          if (!pickupGroups.has(addr)) pickupGroups.set(addr, []);
          pickupGroups.get(addr)!.push(order);
        }

        // Create PICKUP stops (one per unique pickup address)
        for (const [pickupAddr, groupOrders] of pickupGroups) {
          const firstOrder = groupOrders[0];
          stopInserts.push({
            trip_id: trip.id,
            order_id: groupOrders.length === 1 ? firstOrder.id : firstOrder.id,
            stop_type: "PICKUP" as const,
            stop_sequence: seq,
            planned_address: pickupAddr,
            stop_status: "GEPLAND" as const,
            planned_latitude: firstOrder.geocoded_pickup_lat ?? null,
            planned_longitude: firstOrder.geocoded_pickup_lng ?? null,
          });
          seq++;
        }

        // Create DELIVERY stops (one per order)
        for (const order of vOrders) {
          stopInserts.push({
            trip_id: trip.id,
            order_id: order.id,
            stop_type: "DELIVERY" as const,
            stop_sequence: seq,
            planned_address: order.delivery_address ?? "",
            stop_status: "GEPLAND" as const,
            planned_latitude: order.geocoded_delivery_lat ?? null,
            planned_longitude: order.geocoded_delivery_lng ?? null,
          });
          seq++;
        }

        if (stopInserts.length > 0) {
          const { error: stopsErr } = await supabase
            .from("trip_stops")
            .insert(stopInserts);
          if (stopsErr) throw stopsErr;
        }

        tripsCreated++;
      }

      toast.success("Planning bevestigd", { description: `${totalAssigned} orders ingepland in ${tripsCreated} ${tripsCreated === 1 ? "rit" : "ritten"} voor ${selectedDate}.` });
      // Clear draft from Supabase + localStorage (handled by the hook)
      if (tenant?.id) {
        deleteDraftMutation.mutate({ tenantId: tenant.id, date: selectedDate });
      }
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

  // Collect all week drafts for the week view
  const weekDrafts = useMemo(() => collectWeekDrafts(selectedDate), [selectedDate, assignments]);

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex flex-col h-[calc(100vh-5rem)] gap-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shrink-0">
          <PageHeader
            title="Smart Planning"
            subtitle={`Sleep orders naar voertuigen \u00B7 ${totalUnassigned} beschikbaar \u00B7 ${totalAssigned} ingepland`}
          />
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
                onClick={() => setShowClearDraftDialog(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Wis concept
              </Button>
            )}
            {totalAssigned > 0 && (
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                <Button
                  onClick={() => setShowConfirmDialog(true)}
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

        {/* Date navigation */}
        <PlanningDateNav
          selectedDate={selectedDate}
          onDateChange={handleDateChange}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />

        {viewMode === "week" ? (
          /* ── Week overview ── */
          <div className="flex-1 overflow-y-auto">
            <PlanningWeekView
              weekStart={selectedDate}
              onDayClick={(date) => {
                handleDateChange(date);
                setViewMode("day");
              }}
              draftAssignments={weekDrafts}
            />
          </div>
        ) : (
          /* ── Day view (existing planning UI) ── */
          <>
            <VehicleAvailabilityPanel />

            {ordersLoading && (
              <LoadingState message="Orders laden..." />
            )}
            {ordersError && !ordersLoading && (
              <QueryError message="Kan orders niet laden. Probeer het opnieuw." onRetry={() => refetch()} />
            )}

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
          </>
        )}

        <DragOverlay>
          {activeOrder && (
            <PlanningOrderCard order={activeOrder} overlay />
          )}
        </DragOverlay>

        {/* Confirmation dialog: Planning Bevestigen */}
        <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Planning bevestigen</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3">
                  <p>
                    {totalAssigned} orders in{" "}
                    {Object.values(assignments).filter((a) => a.length > 0).length} ritten
                    bevestigen voor {selectedDate}?
                  </p>
                  <ul className="text-sm space-y-1">
                    {fleetVehicles
                      .filter((v) => (assignments[v.id] ?? []).length > 0)
                      .map((v) => (
                        <li key={v.id} className="flex items-center gap-2">
                          <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-medium">{v.name}</span>
                          <span className="text-muted-foreground">
                            — {assignments[v.id].length} order{assignments[v.id].length !== 1 ? "s" : ""}
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuleren</AlertDialogCancel>
              <AlertDialogAction
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => {
                  setShowConfirmDialog(false);
                  handleConfirm();
                }}
              >
                Bevestigen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Confirmation dialog: Wis concept */}
        <AlertDialog open={showClearDraftDialog} onOpenChange={setShowClearDraftDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Concept wissen</AlertDialogTitle>
              <AlertDialogDescription>
                Weet je zeker dat je de hele planning wilt wissen? Dit kan niet ongedaan worden.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuleren</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                onClick={() => {
                  setShowClearDraftDialog(false);
                  handleClearDraft();
                }}
              >
                Wissen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DndContext>
  );
};

export default Planning;
