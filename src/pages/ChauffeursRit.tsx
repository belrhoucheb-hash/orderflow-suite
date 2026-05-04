import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDispatchTrip } from "@/hooks/useTrips";
import { toast } from "sonner";
import { useTenant } from "@/contexts/TenantContext";
import { type FleetVehicle } from "@/hooks/useVehicles";
import { useDrivers } from "@/hooks/useDrivers";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Truck, Search, Package, MapPin, Clock, User,
  Loader2, Calendar, Route,
  Snowflake, AlertTriangle, Send, Printer, ScrollText,
  CheckCircle2, CircleAlert, RefreshCw, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// ─── Types ───────────────────────────────────────────────────────────
interface TripOrder {
  id: string;
  trip_id?: string | null;
  order_number: number;
  client_name: string | null;
  delivery_address: string | null;
  pickup_address: string | null;
  quantity: number | null;
  weight_kg: number | null;
  requirements: string[] | null;
  is_weight_per_unit: boolean;
  vehicle_id: string | null;
  driver_id: string | null;
  trip_number: number | null;
  dispatch_status: string | null;
  stop_sequence: number | null;
  stop_type: string | null;
  stop_status: string | null;
  planned_address: string | null;
  planned_latitude: number | null;
  planned_longitude: number | null;
  planned_time: string | null;
  geocoded_pickup_lat?: number | null;
  geocoded_pickup_lng?: number | null;
  geocoded_delivery_lat?: number | null;
  geocoded_delivery_lng?: number | null;
  status: string;
}

type ReadinessState = "ready" | "warning" | "blocked";

interface TripStop {
  order: TripOrder;
  stopNumber: number;
  action: "Laden" | "Lossen" | "Lossen/Laden";
  location: string;
  timeStart: string;
  timeEnd: string;
  cargo: string[];
  totalWeight: number;
  lat: number | null;
  lng: number | null;
  status: string | null;
  orderNumber: number | null;
}

// ─── Constants ───────────────────────────────────────────────────────
// Drivers fetched via useDrivers instead of mock data

const AVG_SPEED_KMH = 60;
const LOAD_MINUTES = 30;
const WAREHOUSE_COORDS = { lat: 52.30, lng: 4.76 };

// ─── Helpers ─────────────────────────────────────────────────────────
function getTotalWeight(order: TripOrder) {
  if (!order.weight_kg) return 0;
  if (order.is_weight_per_unit && order.quantity) return order.weight_kg * order.quantity;
  return order.weight_kg;
}

function getCity(address: string | null) {
  if (!address) return "Onbekend";
  const parts = address.split(",").map((s) => s.trim());
  return parts[parts.length - 1] || "Onbekend";
}

function hasTag(order: TripOrder, tag: string) {
  return order.requirements?.some((r) => r.toUpperCase().includes(tag)) ?? false;
}

function getTripDriverName(orders: TripOrder[], drivers: Array<{ id: string; name: string; current_vehicle_id?: string | null }>, vehicleId?: string | null) {
  const driverId = orders.find((order) => order.driver_id)?.driver_id;
  if (driverId) return drivers.find((driver) => driver.id === driverId)?.name ?? "Onbekende chauffeur";
  if (vehicleId) return drivers.find((driver) => driver.current_vehicle_id === vehicleId)?.name ?? "Geen chauffeur";
  return "Geen chauffeur";
}

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatPlannedTime(value: string | null, fallback: string): string {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
}

function getDispatchLabel(status?: string | null) {
  switch (status) {
    case "CONCEPT":
      return "Concept";
    case "VERZENDKLAAR":
      return "Klaar";
    case "VERZONDEN":
      return "Verzonden";
    case "ONTVANGEN":
      return "Ontvangen";
    case "GEACCEPTEERD":
      return "Geaccepteerd";
    case "ACTIEF":
      return "Onderweg";
    case "VOLTOOID":
      return "Voltooid";
    case "AFGEBROKEN":
      return "Afgebroken";
    default:
      return "Onbekend";
  }
}

function getReadinessState(items: Array<{ state: ReadinessState }>): ReadinessState {
  if (items.some((item) => item.state === "blocked")) return "blocked";
  if (items.some((item) => item.state === "warning")) return "warning";
  return "ready";
}

function buildStops(orders: TripOrder[], startTimeStr: string): TripStop[] {
  const [startH, startM] = startTimeStr.split(":").map(Number);
  let currentMinutes = startH * 60 + startM;
  const stops: TripStop[] = [];

  // First stop is always loading at warehouse
  const warehouseLoadEnd = currentMinutes + LOAD_MINUTES;
  const allCargo = orders.map((o) => {
    const qty = o.quantity ?? 1;
    return `Europallet (${qty})`;
  });

  stops.push({
    order: orders[0],
    stopNumber: 1,
    action: "Laden",
    location: "Hoofddorp (Depot)",
    timeStart: formatTime(currentMinutes),
    timeEnd: formatTime(warehouseLoadEnd),
    cargo: allCargo,
    totalWeight: orders.reduce((s, o) => s + getTotalWeight(o), 0),
    lat: WAREHOUSE_COORDS.lat,
    lng: WAREHOUSE_COORDS.lng,
    status: "DEPOT",
    orderNumber: null,
  });

  currentMinutes = warehouseLoadEnd;

  // Delivery stops
  orders.forEach((order, i) => {
    // Travel time (mock ~30-60 min between stops)
    const travelMin = 20 + (order.order_number % 40);
    currentMinutes += travelMin;
    const arriveTime = currentMinutes;
    currentMinutes += LOAD_MINUTES;

    const qty = order.quantity ?? 1;
    const cargo: string[] = [];
    if (qty > 0) cargo.push(`Europallet (${qty})`);
    if (hasTag(order, "ADR")) cargo.push("ADR-goed");
    if (hasTag(order, "KOELING")) cargo.push("Koelgoed");

    stops.push({
      order,
      stopNumber: i + 2,
      action: order.stop_type === "PICKUP" ? "Laden" : "Lossen",
      location: order.planned_address || order.delivery_address || getCity(order.delivery_address),
      timeStart: formatPlannedTime(order.planned_time, formatTime(arriveTime)),
      timeEnd: formatTime(currentMinutes),
      cargo,
      totalWeight: getTotalWeight(order),
      lat: order.planned_latitude,
      lng: order.planned_longitude,
      status: order.stop_status,
      orderNumber: order.order_number,
    });
  });

  return stops;
}

// ─── Trip Card Component ─────────────────────────────────────────────
function TripCard({
  vehicle,
  orders,
  driverName,
  readiness,
  isSelected,
  onClick,
}: {
  vehicle: FleetVehicle;
  orders: TripOrder[];
  driverName: string;
  readiness: ReadinessState;
  isSelected: boolean;
  onClick: () => void;
}) {
  const totalWeight = orders.reduce((s, o) => s + getTotalWeight(o), 0);
  const status = getDispatchLabel(orders[0]?.dispatch_status);
  const readinessLabel = readiness === "ready" ? "Klaar" : readiness === "warning" ? "Controle" : "Actie nodig";

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full rounded-2xl border px-4 py-3 text-left transition-all duration-150",
        isSelected
          ? "border-[hsl(var(--gold)/0.34)] bg-[hsl(var(--gold-soft)/0.28)] shadow-sm"
          : "border-[hsl(var(--gold)/0.12)] bg-white hover:border-[hsl(var(--gold)/0.24)] hover:bg-[hsl(var(--gold-soft)/0.12)]"
      )}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-semibold font-display">{vehicle.name}</span>
        <Badge variant="outline" className="border-[hsl(var(--gold)/0.18)] bg-white text-[10px] text-[hsl(var(--gold-deep))]">{vehicle.plate}</Badge>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <User className="h-3 w-3" />
        <span>{driverName}</span>
      </div>
      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Package className="h-3 w-3" />
          {orders.length} stops
        </span>
        <span className="tabular-nums font-medium text-foreground">{totalWeight.toLocaleString()} kg</span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{status}</span>
        <span className={cn(
          "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
          readiness === "ready" && "border-emerald-200 bg-emerald-50 text-emerald-700",
          readiness === "warning" && "border-amber-200 bg-amber-50 text-amber-700",
          readiness === "blocked" && "border-red-200 bg-red-50 text-red-700",
        )}>
          {readinessLabel}
        </span>
      </div>
    </button>
  );
}

// ─── Stop Timeline Item ──────────────────────────────────────────────
function StopTimelineItem({ stop, isLast, isFirst }: { stop: TripStop; isLast: boolean; isFirst: boolean }) {
  const actionColor = stop.action === "Laden"
    ? "bg-[hsl(var(--gold-deep))]"
    : stop.action === "Lossen"
      ? "bg-emerald-500"
      : "bg-amber-500";

  const actionBg = stop.action === "Laden"
    ? "bg-[hsl(var(--gold-soft)/0.36)] text-[hsl(var(--gold-deep))]"
    : stop.action === "Lossen"
      ? "bg-emerald-500/8 text-emerald-700"
      : "bg-amber-500/8 text-amber-700";

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: stop.stopNumber * 0.05 }}
      className="flex gap-4"
    >
      {/* Time column */}
      <div className="w-[90px] shrink-0 text-right pt-1">
        <p className="text-sm font-mono font-medium text-foreground tabular-nums">{stop.timeStart}</p>
        <p className="text-xs font-mono text-muted-foreground/60 tabular-nums">{stop.timeEnd}</p>
      </div>

      {/* Timeline line */}
      <div className="flex flex-col items-center w-5 shrink-0">
        <div className={cn("h-4 w-4 rounded-full border-2 border-background shadow-sm z-10", actionColor)} />
        {!isLast && <div className="w-0.5 flex-1 bg-border/50 -mt-0.5" />}
      </div>

      {/* Content */}
      <div className={cn("flex-1 pb-6", isLast && "pb-2")}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold text-foreground">{stop.location}</span>
          <Badge className={cn("text-xs px-1.5 py-0 border-0 font-semibold", actionBg)}>
            {stop.action}
          </Badge>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          <span className="font-medium">Stop {stop.stopNumber}</span>
          {!isFirst && (
            <>
              <span>-</span>
              <span>{stop.order.client_name || "Onbekend"}</span>
              <span>-</span>
              <span className="tabular-nums font-medium">{stop.totalWeight.toLocaleString()} kg</span>
              {stop.orderNumber && (
                <>
                  <span>-</span>
                  <span>Order #{stop.orderNumber}</span>
                </>
              )}
            </>
          )}
        </div>

        {/* Cargo details */}
        <div className="space-y-1">
          {stop.cargo.map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground/80">
              <Package className="h-3 w-3 shrink-0" />
              <span>{item}</span>
            </div>
          ))}
        </div>

        {/* Requirements tags */}
        {!isFirst && (hasTag(stop.order, "ADR") || hasTag(stop.order, "KOELING")) && (
          <div className="flex gap-1.5 mt-2">
            {hasTag(stop.order, "ADR") && (
              <span className="inline-flex items-center gap-0.5 text-xs font-semibold uppercase bg-amber-500/10 text-amber-700 border border-amber-200/60 rounded-md px-1.5 py-0.5">
                <AlertTriangle className="h-2.5 w-2.5" />ADR
              </span>
            )}
            {hasTag(stop.order, "KOELING") && (
              <span className="inline-flex items-center gap-0.5 text-xs font-semibold uppercase bg-cyan-500/10 text-cyan-700 border border-cyan-200/60 rounded-md px-1.5 py-0.5">
                <Snowflake className="h-2.5 w-2.5" />KOEL
              </span>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────
interface ChauffeursRitProps {
  date?: string;
}

const ChauffeursRit = ({ date }: ChauffeursRitProps = {}) => {
  const [selectedDate, setSelectedDate] = useState(date ?? new Date().toISOString().split("T")[0]);
  const effectiveDate = selectedDate;
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [startTime, setStartTime] = useState("07:00");
  const [isDispatching, setIsDispatching] = useState(false);
  const [activeTab, setActiveTab] = useState<"route" | "ingepland">("route");
  const [loadStalled, setLoadStalled] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const { tenant, loading: tenantLoading } = useTenant();
  const dispatchTripMutation = useDispatchTrip();

  const { data: drivers = [], isLoading: driversLoading, isError: driversError } = useDrivers();

  const { data: vehicles = [], isLoading: vehiclesLoading, isError: vehiclesError, error: vehiclesErrorObject, refetch: refetchVehicles } = useQuery({
    queryKey: ["trip-vehicles", tenant?.id],
    enabled: !tenantLoading && !!tenant?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("id, code, name, plate, type, capacity_kg, capacity_pallets, features")
        .eq("tenant_id", tenant.id)
        .eq("is_active", true)
        .order("capacity_kg", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((v): FleetVehicle => ({
        id: v.id, // Use real UUID for matching with orders.vehicle_id
        code: v.code,
        name: v.name,
        plate: v.plate,
        type: v.type,
        capacityKg: v.capacity_kg,
        capacityPallets: v.capacity_pallets,
        features: v.features ?? [],
      }));
    },
  });

  const { data: allOrders = [], isLoading: ordersLoading, isError: ordersError, error: ordersErrorObject, refetch: refetchOrders } = useQuery({
    queryKey: ["trip-orders", effectiveDate, tenant?.id],
    enabled: !tenantLoading && !!tenant?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data: trips, error: tripsError } = await supabase
        .from("trips" as any)
        .select("id, vehicle_id, driver_id, trip_number, dispatch_status")
        .eq("tenant_id", tenant.id)
        .eq("planned_date", effectiveDate)
        .order("trip_number", { ascending: true });
      if (tripsError) throw tripsError;

      const tripRows = (trips ?? []) as Array<{
        id: string;
        vehicle_id: string | null;
        driver_id: string | null;
        trip_number: number | null;
        dispatch_status: string | null;
      }>;
      if (tripRows.length === 0) return [];

      const tripById = new Map(tripRows.map((trip) => [trip.id, trip]));
      const { data: stops, error: stopsError } = await supabase
        .from("trip_stops" as any)
        .select("trip_id, order_id, stop_sequence, stop_type, stop_status, planned_address, planned_time")
        .in("trip_id", tripRows.map((trip) => trip.id))
        .order("stop_sequence", { ascending: true });
      if (stopsError) throw stopsError;

      const deliveryStops = ((stops ?? []) as Array<{
        trip_id: string;
        order_id: string | null;
        stop_sequence: number | null;
        stop_type: string | null;
        stop_status: string | null;
        planned_address: string | null;
        planned_time: string | null;
      }>)
        .filter((stop) => !!stop.order_id);
      const orderIds = [...new Set(deliveryStops.map((stop) => stop.order_id as string))];
      if (orderIds.length === 0) return [];

      const { data: orders, error: ordersError } = await supabase
        .from("orders")
        .select("*")
        .in("id", orderIds);
      if (ordersError) throw ordersError;

      const orderById = new Map(((orders ?? []) as any[]).map((order) => [order.id, order]));
      return deliveryStops
        .map((stop) => {
          const order = orderById.get(stop.order_id);
          const trip = tripById.get(stop.trip_id);
          if (!order || !trip) return null;
          const isPickup = stop.stop_type === "PICKUP";
          return {
            ...order,
            trip_id: stop.trip_id,
            vehicle_id: trip.vehicle_id,
            driver_id: trip.driver_id,
            trip_number: trip.trip_number,
            dispatch_status: trip.dispatch_status,
            stop_sequence: stop.stop_sequence,
            stop_type: stop.stop_type,
            stop_status: stop.stop_status,
            planned_address: stop.planned_address,
            planned_latitude: isPickup ? order.geocoded_pickup_lat : order.geocoded_delivery_lat,
            planned_longitude: isPickup ? order.geocoded_pickup_lng : order.geocoded_delivery_lng,
            planned_time: stop.planned_time,
          } as TripOrder;
        })
        .filter((order): order is TripOrder => !!order)
        .sort((a, b) => (a.stop_sequence ?? 999) - (b.stop_sequence ?? 999));
    },
  });

  const isLoading = tenantLoading || vehiclesLoading || ordersLoading;
  const hasQueryError = vehiclesError || ordersError;
  const hasDriverWarning = driversError || driversLoading;
  const queryErrorMessage = (() => {
    const error = vehiclesErrorObject || ordersErrorObject;
    if (!error) return null;
    if (error instanceof Error) return error.message;
    if (typeof error === "object" && "message" in error) return String((error as { message?: unknown }).message);
    return "Onbekende fout tijdens laden";
  })();

  useEffect(() => {
    if (!isLoading) {
      setLoadStalled(false);
      return undefined;
    }

    const timer = window.setTimeout(() => setLoadStalled(true), 7000);
    return () => window.clearTimeout(timer);
  }, [isLoading, effectiveDate]);

  // Group orders by vehicle
  const tripsByVehicle = useMemo(() => {
    const map = new Map<string, TripOrder[]>();
    allOrders.forEach((o) => {
      if (!o.vehicle_id) return;
      const list = map.get(o.vehicle_id) || [];
      list.push(o);
      map.set(o.vehicle_id, list);
    });
    return map;
  }, [allOrders]);

  // Vehicles that have trips
  const vehiclesWithTrips = useMemo(() => {
    return vehicles.filter((v) => tripsByVehicle.has(v.id));
  }, [vehicles, tripsByVehicle]);

  // Filtered trips
  const filteredVehicles = useMemo(() => {
    if (!searchQuery) return vehiclesWithTrips;
    const q = searchQuery.toLowerCase();
    return vehiclesWithTrips.filter((v) => {
      const orders = tripsByVehicle.get(v.id) || [];
      return (
        v.name.toLowerCase().includes(q) ||
        v.plate.toLowerCase().includes(q) ||
        orders.some((o) => o.client_name?.toLowerCase().includes(q))
      );
    });
  }, [vehiclesWithTrips, searchQuery, tripsByVehicle]);

  // Auto-select first vehicle
  useEffect(() => {
    if (!selectedVehicleId && filteredVehicles.length > 0) {
      setSelectedVehicleId(filteredVehicles[0].id);
    }
  }, [filteredVehicles, selectedVehicleId]);

  // Selected trip data
  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId);
  const selectedOrders = useMemo(
    () => selectedVehicleId ? (tripsByVehicle.get(selectedVehicleId) || []) : [],
    [selectedVehicleId, tripsByVehicle],
  );
  const stops = useMemo(
    () => selectedOrders.length > 0 ? buildStops(selectedOrders, startTime) : [],
    [selectedOrders, startTime]
  );
  
  const selectedDriver = selectedVehicleId
    ? getTripDriverName(selectedOrders, drivers, selectedVehicleId)
    : "Niet toegewezen";

  const mappedStops = useMemo(
    () => stops.filter((stop) => stop.lat != null && stop.lng != null),
    [stops],
  );

  const selectedReadinessItems = useMemo(() => {
    const hasVehicle = !!selectedVehicle;
    const hasDriver = selectedDriver !== "Geen chauffeur" && selectedDriver !== "Niet toegewezen" && selectedDriver !== "Onbekende chauffeur";
    const hasOrders = selectedOrders.length > 0;
    const hasRoutePoints = mappedStops.length > 1;
    const missingAddresses = stops.slice(1).filter((stop) => !stop.location || stop.location === "Onbekend").length;
    const missingCoordinates = stops.slice(1).filter((stop) => stop.lat == null || stop.lng == null).length;
    const dispatchStatus = selectedOrders[0]?.dispatch_status;
    const alreadySent = ["VERZONDEN", "ONTVANGEN", "GEACCEPTEERD", "ACTIEF", "VOLTOOID"].includes(dispatchStatus ?? "");

    return [
      {
        label: "Chauffeur",
        value: hasDriver ? selectedDriver : "Nog niet gekoppeld",
        state: hasDriver ? "ready" : "blocked",
        action: "Open planbord",
        href: "/planning",
      },
      {
        label: "Voertuig",
        value: hasVehicle ? `${selectedVehicle?.name} - ${selectedVehicle?.plate}` : "Nog niet gekoppeld",
        state: hasVehicle ? "ready" : "blocked",
        action: "Open planbord",
        href: "/planning",
      },
      {
        label: "Stops",
        value: hasOrders ? `${selectedOrders.length} stops gepland` : "Geen stops",
        state: hasOrders && missingAddresses === 0 ? "ready" : "blocked",
        action: "Open orders",
        href: "/orders",
      },
      {
        label: "Routepunten",
        value: hasRoutePoints ? "Kaart beschikbaar" : `${missingCoordinates || "Geen"} coordinate(s)`,
        state: hasRoutePoints ? "ready" : "warning",
        action: "Naar planbord",
        href: "/planning",
      },
      {
        label: "Chauffeur-app",
        value: alreadySent ? getDispatchLabel(dispatchStatus) : "Nog niet verzonden",
        state: alreadySent ? "ready" : "warning",
        action: "Verstuur",
        href: null,
      },
    ] as Array<{ label: string; value: string; state: ReadinessState; action: string; href: string | null }>;
  }, [mappedStops.length, selectedDriver, selectedOrders, selectedVehicle, stops]);

  const selectedReadiness = useMemo(
    () => getReadinessState(selectedReadinessItems),
    [selectedReadinessItems],
  );

  const readinessByVehicle = useMemo(() => {
    const map = new Map<string, ReadinessState>();
    vehiclesWithTrips.forEach((vehicle) => {
      const vehicleOrders = tripsByVehicle.get(vehicle.id) || [];
      const driverName = getTripDriverName(vehicleOrders, drivers, vehicle.id);
      const hasDriver = driverName !== "Geen chauffeur" && driverName !== "Onbekende chauffeur";
      const hasMissingCoords = vehicleOrders.some((order) => order.planned_latitude == null || order.planned_longitude == null);
      const hasMissingAddress = vehicleOrders.some((order) => !order.planned_address && !order.delivery_address);
      if (!hasDriver || hasMissingAddress) {
        map.set(vehicle.id, "blocked");
      } else if (hasMissingCoords || !["VERZONDEN", "ONTVANGEN", "GEACCEPTEERD", "ACTIEF", "VOLTOOID"].includes(vehicleOrders[0]?.dispatch_status ?? "")) {
        map.set(vehicle.id, "warning");
      } else {
        map.set(vehicle.id, "ready");
      }
    });
    return map;
  }, [drivers, tripsByVehicle, vehiclesWithTrips]);

  const dashboardMetrics = useMemo(() => {
    const allVehicleReadiness = vehiclesWithTrips.map((vehicle) => readinessByVehicle.get(vehicle.id) ?? "blocked");
    const sentStatuses = new Set(["VERZONDEN", "ONTVANGEN", "GEACCEPTEERD", "ACTIEF", "VOLTOOID"]);
    const sentTrips = vehiclesWithTrips.filter((vehicle) => sentStatuses.has((tripsByVehicle.get(vehicle.id) || [])[0]?.dispatch_status ?? "")).length;
    return {
      total: vehiclesWithTrips.length,
      ready: allVehicleReadiness.filter((state) => state === "ready").length,
      actionNeeded: allVehicleReadiness.filter((state) => state === "blocked").length,
      review: allVehicleReadiness.filter((state) => state === "warning").length,
      sent: sentTrips,
      stops: allOrders.length,
      weight: allOrders.reduce((sum, order) => sum + getTotalWeight(order), 0),
    };
  }, [allOrders, readinessByVehicle, tripsByVehicle, vehiclesWithTrips]);

  // Map
  useEffect(() => {
    if (!mapRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    if (mappedStops.length === 0) return;

    const map = L.map(mapRef.current, { center: [52.1, 4.9], zoom: 9, zoomControl: false });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© OpenStreetMap',
    }).addTo(map);

    // Warehouse marker
    const whIcon = L.divIcon({
      className: "",
      html: `<div style="width:24px;height:24px;border-radius:6px;background:hsl(var(--gold-deep));border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,.2);display:flex;align-items:center;justify-content:center;color:white;font-size:12px;font-weight:700;">D</div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
    L.marker([WAREHOUSE_COORDS.lat, WAREHOUSE_COORDS.lng], { icon: whIcon })
      .addTo(map)
      .bindPopup("<b>Depot Hoofddorp</b>");

    const coords: [number, number][] = [[WAREHOUSE_COORDS.lat, WAREHOUSE_COORDS.lng]];

    mappedStops.slice(1).forEach((stop) => {
      const coord: [number, number] = [stop.lat!, stop.lng!];
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:20px;height:20px;border-radius:50%;background:hsl(var(--gold-deep));border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.24);display:flex;align-items:center;justify-content:center;color:white;font-size:10px;font-weight:700;">${stop.stopNumber}</div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });
      L.marker(coord, { icon })
        .addTo(map)
        .bindPopup(`<b>${stop.location}</b><br/>${stop.order.client_name}<br/>${stop.action}`);
      coords.push(coord);
    });

    // Route line
    if (coords.length > 1) {
      L.polyline(coords, {
        color: "hsl(var(--gold-deep))",
        weight: 3,
        opacity: 0.7,
        dashArray: "8 6",
      }).addTo(map);
    }

    const bounds = L.latLngBounds(coords);
    map.fitBounds(bounds, { padding: [30, 30] });
    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [mappedStops]);

  if (isLoading && !loadStalled) {
    return <LoadingState message="Ritten laden..." />;
  }

  return (
    <div className="page-container space-y-5">
      {/* Header */}
      <PageHeader
        eyebrow="Planning"
        title="Chauffeursrit"
        subtitle="Ritdetails per chauffeur met stops, tijden en ladinginfo"
        meta={`${dashboardMetrics.total} ritten - ${dashboardMetrics.stops} stops`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
            className="h-9 w-[9.5rem] rounded-xl border-[hsl(var(--gold)/0.18)] bg-white text-xs"
          />
          <Button variant="outline" size="sm" className="btn-luxe btn-luxe--secondary h-9 gap-1.5 px-3 text-xs" disabled={!selectedVehicleId} onClick={() => window.print()}>
            <ScrollText className="h-3.5 w-3.5" />CMR
          </Button>
          <Button variant="outline" size="sm" className="btn-luxe btn-luxe--secondary h-9 gap-1.5 px-3 text-xs" disabled={!selectedVehicleId} onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5" />Printen
          </Button>
          <Button size="sm" className="btn-luxe h-9 gap-1.5 px-3 text-xs" disabled={isDispatching || !selectedVehicleId || selectedReadiness === "blocked"}
            onClick={async () => {
              if (!selectedVehicleId) return;
              const vehicleOrders = allOrders.filter((o: any) => o.vehicle_id === selectedVehicleId);
              if (vehicleOrders.length === 0) {
                toast.error("Geen orders", { description: "Dit voertuig heeft geen geplande orders" });
                return;
              }
              const vehicle = vehicles.find((v: any) => v.id === selectedVehicleId);
              const plannedDriverId = vehicleOrders.find((order: any) => order.driver_id)?.driver_id;
              const driver = plannedDriverId
                ? drivers.find((d: any) => d.id === plannedDriverId)
                : drivers.find((d: any) => d.current_vehicle_id === selectedVehicleId);
              if (!driver) {
                toast.error("Geen chauffeur", { description: "Wijs eerst een chauffeur toe via het planbord." });
                return;
              }
              if (!tenant?.id) {
                toast.error("Geen tenant", { description: "Geen tenant beschikbaar voor deze actie" });
                return;
              }
              setIsDispatching(true);
              try {
                const tripId = vehicleOrders.find((order: any) => order.trip_id)?.trip_id;
                if (!tripId) {
                  toast.error("Geen rit", { description: "Er is nog geen rit aangemaakt voor deze geplande orders." });
                  return;
                }

                await dispatchTripMutation.mutateAsync(tripId);
                toast.success("Rit verzonden", { description: `${vehicleOrders.length} stops verstuurd naar ${driver.name || vehicle?.name || "chauffeur"}` });
              } catch (e: any) {
                toast.error("Verzenden mislukt", { description: e.message });
              } finally {
                setIsDispatching(false);
              }
            }}>
            {isDispatching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Verstuur naar chauffeur
          </Button>
          </div>
        }
      />

      {(loadStalled || hasQueryError || !tenant) && (
        <div className="card--luxe flex flex-col gap-3 border-amber-200 bg-amber-50/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                {hasQueryError ? "Ritten konden niet volledig worden geladen" : "Laden duurt langer dan verwacht"}
              </p>
              <p className="text-xs text-muted-foreground">
                De pagina blijft bruikbaar. Controleer de datum of probeer opnieuw; bij ontbrekende data ga je direct naar het planbord.
              </p>
              {queryErrorMessage && (
                <p className="mt-1 text-[11px] text-amber-800">
                  Technische melding: {queryErrorMessage}
                </p>
              )}
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="btn-luxe btn-luxe--secondary h-9 gap-2 px-3 text-xs"
            onClick={() => {
              setLoadStalled(false);
              refetchVehicles();
              refetchOrders();
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Opnieuw laden
          </Button>
        </div>
      )}

      {hasDriverWarning && !hasQueryError && (
        <div className="rounded-2xl border border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--gold-soft)/0.10)] px-4 py-2 text-xs text-muted-foreground">
          Chauffeursinformatie wordt nog bijgewerkt. Ritten, stops en planning blijven beschikbaar.
        </div>
      )}

      <div className="card--luxe grid overflow-hidden sm:grid-cols-2 xl:grid-cols-6">
        {[
          { label: "Ritten", value: dashboardMetrics.total, sub: "gepland" },
          { label: "Klaar", value: dashboardMetrics.ready, sub: "zonder blokkade" },
          { label: "Actie nodig", value: dashboardMetrics.actionNeeded, sub: "mist chauffeur/info" },
          { label: "Controle", value: dashboardMetrics.review, sub: "route of verzending" },
          { label: "Verzonden", value: dashboardMetrics.sent, sub: "naar chauffeur" },
          { label: "Gewicht", value: `${dashboardMetrics.weight.toLocaleString()} kg`, sub: `${dashboardMetrics.stops} stops` },
        ].map((metric, index) => (
          <div key={metric.label} className={cn("px-5 py-4", index > 0 && "border-t border-[hsl(var(--gold)/0.10)] sm:border-l sm:border-t-0")}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))]">{metric.label}</p>
            <p className="mt-2 font-display text-3xl font-semibold tabular-nums text-foreground">{metric.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{metric.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left: Trip list */}
        <div className="lg:col-span-3 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              placeholder="Zoek rit..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 rounded-xl border-[hsl(var(--gold)/0.18)] bg-white pl-9 text-xs"
            />
          </div>

          <div className="space-y-2 max-h-[calc(100vh-240px)] overflow-y-auto pr-1">
            {filteredVehicles.length === 0 ? (
              <div className="card--luxe px-4 py-8 text-center">
                <Truck className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                <p className="text-sm font-semibold text-foreground">Geen geplande ritten</p>
                <p className="mt-1 text-xs text-muted-foreground">Kies een andere datum of plan orders in via het planbord.</p>
                <Link to="/planning" className="btn-luxe btn-luxe--secondary mt-4 h-9 px-3 text-xs">
                  Open planbord
                </Link>
              </div>
            ) : (
              filteredVehicles.map((v) => {
                const orders = tripsByVehicle.get(v.id) || [];
                const driverName = getTripDriverName(orders, drivers, v.id);
                return (
                  <TripCard
                    key={v.id}
                    vehicle={v}
                    orders={orders}
                    driverName={driverName}
                    readiness={readinessByVehicle.get(v.id) ?? "blocked"}
                    isSelected={v.id === selectedVehicleId}
                    onClick={() => setSelectedVehicleId(v.id)}
                  />
                );
              })
            )}
          </div>

          <div className="card--luxe p-3 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Totaal</p>
            <p className="text-lg font-bold font-display tabular-nums">{filteredVehicles.length}</p>
            <p className="text-xs text-muted-foreground">ritten gepland</p>
          </div>
        </div>

        {/* Middle: Timeline detail */}
        <div className="lg:col-span-5">
          {selectedVehicle && selectedOrders.length > 0 ? (
            <Card className="card--luxe overflow-hidden">
              {/* Trip header */}
              <div className="border-b border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--gold-soft)/0.12)] px-4 py-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-[hsl(var(--gold-deep))]" />
                    <span className="text-sm font-semibold font-display">{selectedVehicle.name}</span>
                    <Badge variant="outline" className="border-[hsl(var(--gold)/0.18)] bg-white text-xs text-[hsl(var(--gold-deep))]">{selectedVehicle.plate}</Badge>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <Input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="h-7 w-[80px] rounded-lg border-[hsl(var(--gold)/0.18)] bg-white px-1.5 text-center text-xs"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />{selectedDriver}
                  </span>
                  <span className="flex items-center gap-1">
                    <Package className="h-3 w-3" />{selectedOrders.length} leveringen
                  </span>
                  <span className="tabular-nums font-medium text-foreground">
                    {selectedOrders.reduce((s, o) => s + getTotalWeight(o), 0).toLocaleString()} kg
                  </span>
                </div>
              </div>

              <div className="border-b border-[hsl(var(--gold)/0.12)] bg-white px-4 py-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))]">Rit readiness</p>
                    <h2 className="mt-1 font-display text-lg font-semibold text-foreground">
                      {selectedReadiness === "ready" ? "Klaar voor uitvoering" : selectedReadiness === "warning" ? "Controleer voor vertrek" : "Actie nodig voor verzending"}
                    </h2>
                  </div>
                  <Badge variant="outline" className={cn(
                    "rounded-full border px-3 py-1 text-xs",
                    selectedReadiness === "ready" && "border-emerald-200 bg-emerald-50 text-emerald-700",
                    selectedReadiness === "warning" && "border-amber-200 bg-amber-50 text-amber-700",
                    selectedReadiness === "blocked" && "border-red-200 bg-red-50 text-red-700",
                  )}>
                    {selectedReadiness === "ready" ? "Klaar" : selectedReadiness === "warning" ? "Controle" : "Geblokkeerd"}
                  </Badge>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {selectedReadinessItems.map((item) => (
                    <div key={item.label} className="flex items-center justify-between gap-3 rounded-xl border border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--gold-soft)/0.08)] px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{item.label}</p>
                        <p className="truncate text-sm font-medium text-foreground">{item.value}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {item.state === "ready" ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <CircleAlert className={cn("h-4 w-4", item.state === "warning" ? "text-amber-600" : "text-red-600")} />
                        )}
                        {item.href && item.state !== "ready" && (
                          <Link to={item.href} className="text-[11px] font-semibold text-[hsl(var(--gold-deep))] hover:underline">
                            {item.action}
                          </Link>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Route & Ingepland tabs */}
              <div className="flex border-b border-[hsl(var(--gold)/0.12)] bg-white">
                <button
                  onClick={() => setActiveTab("route")}
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors",
                    activeTab === "route"
                      ? "border-b-2 border-[hsl(var(--gold-deep))] text-[hsl(var(--gold-deep))]"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Route className="h-3 w-3" />ROUTE
                </button>
                <button
                  onClick={() => setActiveTab("ingepland")}
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors",
                    activeTab === "ingepland"
                      ? "border-b-2 border-[hsl(var(--gold-deep))] text-[hsl(var(--gold-deep))]"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Calendar className="h-3 w-3" />INGEPLAND
                </button>
              </div>

              {/* Tab content */}
              <div className="p-4 max-h-[calc(100vh-360px)] overflow-y-auto">
                {activeTab === "route" ? (
                  stops.map((stop, i) => (
                    <StopTimelineItem
                      key={i}
                      stop={stop}
                      isFirst={i === 0}
                      isLast={i === stops.length - 1}
                    />
                  ))
                ) : (
                  <div className="space-y-3">
                    {stops.map((stop, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-xl border border-[hsl(var(--gold)/0.12)] bg-white p-3">
                        <div className="flex flex-col items-center gap-0.5 min-w-[50px]">
                          <span className="text-xs font-bold tabular-nums text-[hsl(var(--gold-deep))]">{stop.timeStart}</span>
                          {stop.timeEnd && <span className="text-[10px] text-muted-foreground tabular-nums">{stop.timeEnd}</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{stop.order.client_name || stop.location}</p>
                          <p className="text-xs text-muted-foreground truncate">{stop.order.delivery_address || stop.location}</p>
                        </div>
                        <span className={cn(
                          "text-[10px] font-bold px-2 py-0.5 rounded-full",
                          stop.action === "Laden" ? "bg-[hsl(var(--gold-soft)/0.36)] text-[hsl(var(--gold-deep))]" : "bg-emerald-50 text-emerald-700"
                        )}>
                          {stop.action}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          ) : (
            <Card className="card--luxe p-12 text-center">
              <Route className="h-12 w-12 mx-auto mb-3 text-muted-foreground/20" />
              <p className="text-sm font-semibold text-foreground">
                {dashboardMetrics.total === 0 ? "Geen ritten voor deze datum" : "Selecteer een rit om de details te bekijken"}
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                {dashboardMetrics.total === 0 ? "Plan orders op een chauffeur en voertuig om hier chauffeursritten te zien." : "Of plan orders in via het planbord"}
              </p>
              <Link to="/planning" className="btn-luxe btn-luxe--secondary mt-4 h-9 px-3 text-xs">
                Open planbord
              </Link>
            </Card>
          )}
        </div>

        {/* Right: Map */}
        <div className="lg:col-span-4">
          <Card className="card--luxe overflow-hidden">
            <div className="flex items-center gap-2 border-b border-[hsl(var(--gold)/0.12)] px-4 py-2.5">
              <MapPin className="h-3.5 w-3.5 text-[hsl(var(--gold-deep))]" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))]">Kaart</span>
            </div>
            {mappedStops.length > 1 ? (
              <div ref={mapRef} className="h-[calc(100vh-240px)] w-full" />
            ) : (
              <div className="flex h-[calc(100vh-240px)] min-h-[360px] flex-col items-center justify-center px-6 text-center">
                <MapPin className="mb-3 h-8 w-8 text-muted-foreground/30" />
                <p className="text-sm font-semibold text-foreground">Geen routepunten</p>
                <p className="mt-1 text-xs text-muted-foreground">Selecteer een rit met geplande stops of vul adressen aan in planning.</p>
                <Link to="/planning" className="btn-luxe btn-luxe--secondary mt-4 h-9 gap-2 px-3 text-xs">
                  Open planbord
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ChauffeursRit;
