import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCreateTrip, useDispatchTrip } from "@/hooks/useTrips";
import { toast } from "sonner";
import { useTenant } from "@/contexts/TenantContext";
import { type FleetVehicle } from "@/hooks/useVehicles";
import { useDrivers } from "@/hooks/useDrivers";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Truck, Search, Package, MapPin, Clock, User, ArrowDown,
  ArrowUp, ChevronRight, Loader2, Calendar, Route,
  Snowflake, AlertTriangle, Warehouse, Send, Printer, ScrollText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { motion, AnimatePresence } from "framer-motion";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// ─── Types ───────────────────────────────────────────────────────────
interface TripOrder {
  id: string;
  order_number: number;
  client_name: string | null;
  delivery_address: string | null;
  pickup_address: string | null;
  quantity: number | null;
  weight_kg: number | null;
  requirements: string[] | null;
  is_weight_per_unit: boolean;
  vehicle_id: string | null;
  stop_sequence: number | null;
  status: string;
}

interface TripStop {
  order: TripOrder;
  stopNumber: number;
  action: "Laden" | "Lossen" | "Lossen/Laden";
  location: string;
  timeStart: string;
  timeEnd: string;
  cargo: string[];
  totalWeight: number;
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

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
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
      action: "Lossen",
      location: getCity(order.delivery_address),
      timeStart: formatTime(arriveTime),
      timeEnd: formatTime(currentMinutes),
      cargo,
      totalWeight: getTotalWeight(order),
    });
  });

  return stops;
}

// ─── Trip Card Component ─────────────────────────────────────────────
function TripCard({
  vehicle,
  orders,
  driverName,
  isSelected,
  onClick,
}: {
  vehicle: FleetVehicle;
  orders: TripOrder[];
  driverName: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  const totalWeight = orders.reduce((s, o) => s + getTotalWeight(o), 0);

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left p-3 rounded-xl border transition-all duration-150",
        isSelected
          ? "bg-primary/5 border-primary/30 shadow-sm"
          : "bg-card border-border/40 hover:border-border/60 hover:bg-muted/20"
      )}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-semibold font-display">{vehicle.name}</span>
        <Badge variant="outline" className="text-xs">{vehicle.plate}</Badge>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <User className="h-3 w-3" />
        <span>{driverName}</span>
      </div>
      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Package className="h-3 w-3" />
          {orders.length} stops
        </span>
        <span className="tabular-nums font-medium text-foreground">{totalWeight.toLocaleString()} kg</span>
      </div>
    </button>
  );
}

// ─── Stop Timeline Item ──────────────────────────────────────────────
function StopTimelineItem({ stop, isLast, isFirst }: { stop: TripStop; isLast: boolean; isFirst: boolean }) {
  const actionColor = stop.action === "Laden"
    ? "bg-blue-500"
    : stop.action === "Lossen"
      ? "bg-emerald-500"
      : "bg-amber-500";

  const actionBg = stop.action === "Laden"
    ? "bg-blue-500/8 text-blue-700"
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
          <span className="font-medium">{stop.stopNumber}</span>
          {!isFirst && (
            <>
              <span>•</span>
              <span>{stop.order.client_name || "Onbekend"}</span>
              <span>•</span>
              <span className="tabular-nums font-medium">{stop.totalWeight.toLocaleString()} kg</span>
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
              <span className="inline-flex items-center gap-0.5 text-xs font-semibold uppercase bg-blue-500/10 text-blue-700 border border-blue-200/60 rounded-md px-1.5 py-0.5">
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
const ChauffeursRit = () => {
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [startTime, setStartTime] = useState("07:00");
  const [isDispatching, setIsDispatching] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const { tenant } = useTenant();
  const createTripMutation = useCreateTrip();
  const dispatchTripMutation = useDispatchTrip();

  const { data: drivers = [], isLoading: driversLoading } = useDrivers();

  const { data: vehicles = [], isLoading: vehiclesLoading } = useQuery({
    queryKey: ["trip-vehicles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("id, code, name, plate, type, capacity_kg, capacity_pallets, features")
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

  const { data: allOrders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ["trip-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("status", "PLANNED")
        .order("stop_sequence", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TripOrder[];
    },
  });

  const isLoading = vehiclesLoading || ordersLoading || driversLoading;

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
  const selectedOrders = selectedVehicleId ? (tripsByVehicle.get(selectedVehicleId) || []) : [];
  const stops = useMemo(
    () => selectedOrders.length > 0 ? buildStops(selectedOrders, startTime) : [],
    [selectedOrders, startTime]
  );
  
  const selectedDriver = selectedVehicleId
    ? drivers.find(d => d.current_vehicle_id === selectedVehicleId)?.name || "Niet toegewezen"
    : "Niet toegewezen";

  // Map
  useEffect(() => {
    if (!mapRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    if (stops.length === 0) return;

    const map = L.map(mapRef.current, { center: [52.1, 4.9], zoom: 9, zoomControl: false });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© OpenStreetMap',
    }).addTo(map);

    // Warehouse marker
    const whIcon = L.divIcon({
      className: "",
      html: `<div style="width:24px;height:24px;border-radius:4px;background:hsl(var(--primary));border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;color:white;font-size:12px;">🏭</div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
    L.marker([WAREHOUSE_COORDS.lat, WAREHOUSE_COORDS.lng], { icon: whIcon })
      .addTo(map)
      .bindPopup("<b>Depot Hoofddorp</b>");

    // Stop markers (skip first = warehouse)
    const coords: [number, number][] = [[WAREHOUSE_COORDS.lat, WAREHOUSE_COORDS.lng]];
    const deliveryStops = stops.slice(1);
    const mockCoords: [number, number][] = [
      [52.09, 5.12], [52.37, 4.90], [51.44, 5.47], [52.07, 4.30], [51.92, 4.48], [52.22, 6.89],
      [51.81, 5.86], [52.51, 6.09], [53.22, 6.57], [51.59, 4.78],
    ];

    deliveryStops.forEach((stop, i) => {
      const coord = mockCoords[i % mockCoords.length];
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:20px;height:20px;border-radius:50%;background:hsl(var(--primary));border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;color:white;font-size:10px;font-weight:700;">${stop.stopNumber}</div>`,
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
        color: "hsl(0, 78%, 42%)",
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
  }, [stops]);

  if (isLoading) {
    return <LoadingState message="Ritten laden..." />;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <PageHeader
        title="Chauffeurs Rit"
        subtitle="Ritdetails per chauffeur met stops, tijden en ladinginfo"
        actions={
          <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs border-blue-200 text-blue-700 hover:bg-blue-50" onClick={() => window.print()}>
            <ScrollText className="h-3.5 w-3.5" />CMR
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5" />Printen
          </Button>
          <Button size="sm" className="gap-1.5 text-xs bg-primary hover:bg-primary/90" disabled={isDispatching || !selectedVehicleId}
            onClick={async () => {
              if (!selectedVehicleId) return;
              setIsDispatching(true);
              try {
                const vehicleOrders = orders.filter((o: any) => o.vehicle_id === selectedVehicleId);
                if (vehicleOrders.length === 0) { toast.error("Geen orders", { description: "Dit voertuig heeft geen geplande orders" }); return; }
                const vehicle = vehicles.find((v: any) => v.id === selectedVehicleId);
                const driver = drivers.find((d: any) => d.current_vehicle_id === selectedVehicleId);
                const tenantId = tenant?.id || "00000000-0000-0000-0000-000000000001";

                // Create trip
                const trip = await createTripMutation.mutateAsync({
                  tenant_id: tenantId,
                  vehicle_id: selectedVehicleId,
                  driver_id: driver?.id || null,
                  planned_date: new Date().toISOString().split("T")[0],
                  planned_start_time: startTime,
                  stops: vehicleOrders.map((o: any, i: number) => ({
                    order_id: o.id,
                    stop_type: "DELIVERY" as const,
                    planned_address: o.delivery_address || "",
                    stop_sequence: o.stop_sequence || i + 1,
                  })),
                });

                // Dispatch trip
                await dispatchTripMutation.mutateAsync(trip.id);
                toast.success("Rit verzonden", { description: `${vehicleOrders.length} stops verstuurd naar ${driver?.name || vehicle?.name || "chauffeur"}` });
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Trip list */}
        <div className="lg:col-span-3 space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Zoek rit..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>

          <div className="space-y-2 max-h-[calc(100vh-240px)] overflow-y-auto pr-1">
            {filteredVehicles.length === 0 ? (
              <div className="text-center py-8">
                <Truck className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">Geen geplande ritten</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Plan eerst orders in via Transportplanning</p>
              </div>
            ) : (
              filteredVehicles.map((v) => {
                const orders = tripsByVehicle.get(v.id) || [];
                const driverName = drivers.find(d => d.current_vehicle_id === v.id)?.name || "Geen chauffeur";
                return (
                  <TripCard
                    key={v.id}
                    vehicle={v}
                    orders={orders}
                    driverName={driverName}
                    isSelected={v.id === selectedVehicleId}
                    onClick={() => setSelectedVehicleId(v.id)}
                  />
                );
              })
            )}
          </div>

          <div className="rounded-lg bg-muted/30 p-3 text-center">
            <p className="text-xs text-muted-foreground/60">Totaal</p>
            <p className="text-lg font-bold font-display tabular-nums">{filteredVehicles.length}</p>
            <p className="text-xs text-muted-foreground">ritten gepland</p>
          </div>
        </div>

        {/* Middle: Timeline detail */}
        <div className="lg:col-span-5">
          {selectedVehicle && selectedOrders.length > 0 ? (
            <Card className="rounded-xl border-border/40 shadow-sm overflow-hidden">
              {/* Trip header */}
              <div className="px-4 py-3 border-b border-border/30 bg-muted/10">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold font-display">{selectedVehicle.name}</span>
                    <Badge variant="outline" className="text-xs">{selectedVehicle.plate}</Badge>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <Input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="h-6 w-[80px] text-xs px-1.5 text-center bg-background"
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

              {/* Route & Ingepland tabs */}
              <div className="flex border-b border-border/30">
                <button className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-primary border-b-2 border-primary">
                  <Route className="h-3 w-3" />ROUTE
                </button>
                <button className="flex items-center gap-1.5 px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  <Calendar className="h-3 w-3" />INGEPLAND
                </button>
              </div>

              {/* Timeline */}
              <div className="p-4 max-h-[calc(100vh-360px)] overflow-y-auto">
                {stops.map((stop, i) => (
                  <StopTimelineItem
                    key={i}
                    stop={stop}
                    isFirst={i === 0}
                    isLast={i === stops.length - 1}
                  />
                ))}
              </div>
            </Card>
          ) : (
            <Card className="rounded-xl border-border/40 shadow-sm p-12 text-center">
              <Route className="h-12 w-12 mx-auto mb-3 text-muted-foreground/20" />
              <p className="text-sm text-muted-foreground">Selecteer een rit om de details te bekijken</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Of plan orders in via Transportplanning
              </p>
            </Card>
          )}
        </div>

        {/* Right: Map */}
        <div className="lg:col-span-4">
          <Card className="rounded-xl border-border/40 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/30">
              <MapPin className="h-3.5 w-3.5 text-primary" />
              <span className="text-sm font-semibold font-display">KAART</span>
            </div>
            <div ref={mapRef} className="h-[calc(100vh-240px)] w-full" />
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ChauffeursRit;
