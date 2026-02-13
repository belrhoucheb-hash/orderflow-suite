import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  DragStartEvent,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fleetVehicles, type FleetVehicle } from "@/data/fleetData";
import {
  resolveCoordinates,
  getPostcodeRegion,
  getRegionLabel,
  haversineKm,
  vehicleColors,
  type GeoCoord,
} from "@/data/geoData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Truck,
  Search,
  Package,
  Snowflake,
  AlertTriangle,
  CheckCircle2,
  X,
  Filter,
  MapPin,
  List,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────
interface PlanOrder {
  id: string;
  order_number: number;
  client_name: string | null;
  delivery_address: string | null;
  quantity: number | null;
  weight_kg: number | null;
  requirements: string[] | null;
  is_weight_per_unit: boolean;
}

type Assignments = Record<string, PlanOrder[]>;

// ─── Helpers ─────────────────────────────────────────────────────────
function getTotalWeight(order: PlanOrder) {
  if (!order.weight_kg) return 0;
  if (order.is_weight_per_unit && order.quantity) return order.weight_kg * order.quantity;
  return order.weight_kg;
}

function getCity(address: string | null) {
  if (!address) return "—";
  const parts = address.split(",").map((s) => s.trim());
  return parts[parts.length - 1] || "—";
}

function hasTag(order: PlanOrder, tag: string) {
  return order.requirements?.some((r) => r.toUpperCase().includes(tag)) ?? false;
}

function capacityColor(pct: number) {
  if (pct > 100) return "bg-destructive";
  if (pct > 90) return "text-amber-600";
  return "";
}

function createMarkerIcon(color: string, size: number = 12) {
  return L.divIcon({
    className: "custom-marker",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.3);transition:all 0.2s;"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const DISTANCE_WARN_KM = 150;

// ─── Draggable Order Card ────────────────────────────────────────────
function DraggableOrder({ order, overlay }: { order: PlanOrder; overlay?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: order.id,
    data: order,
  });

  const style = overlay
    ? undefined
    : { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.3 : 1 };

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      style={style}
      {...(overlay ? {} : { ...listeners, ...attributes })}
      className={cn(
        "rounded-lg border bg-card p-3 cursor-grab active:cursor-grabbing shadow-sm hover:shadow transition-shadow",
        overlay && "shadow-lg ring-2 ring-primary/30 rotate-2"
      )}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-mono text-muted-foreground">#{order.order_number}</span>
        <div className="flex gap-1">
          {hasTag(order, "ADR") && (
            <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 border-amber-200 px-1.5 py-0">
              <AlertTriangle className="h-3 w-3 mr-0.5" />ADR
            </Badge>
          )}
          {hasTag(order, "KOELING") && (
            <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-700 border-blue-200 px-1.5 py-0">
              <Snowflake className="h-3 w-3 mr-0.5" />KOEL
            </Badge>
          )}
        </div>
      </div>
      <p className="text-sm font-medium truncate">{order.client_name || "Onbekend"}</p>
      <p className="text-xs text-muted-foreground truncate">{getCity(order.delivery_address)}</p>
      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
        <span>{order.quantity ?? "?"} pallet(s)</span>
        <span className="font-medium text-foreground">{getTotalWeight(order)} kg</span>
      </div>
    </div>
  );
}

// ─── Droppable Vehicle Card ──────────────────────────────────────────
function VehicleDropZone({
  vehicle,
  assigned,
  onRemove,
  rejected,
  onHover,
}: {
  vehicle: FleetVehicle;
  assigned: PlanOrder[];
  onRemove: (orderId: string) => void;
  rejected: boolean;
  onHover: (vehicleId: string | null) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: vehicle.id });

  const totalKg = assigned.reduce((s, o) => s + getTotalWeight(o), 0);
  const totalPallets = assigned.reduce((s, o) => s + (o.quantity ?? 0), 0);
  const pctKg = (totalKg / vehicle.capacityKg) * 100;
  const pctPallets = (totalPallets / vehicle.capacityPallets) * 100;

  return (
    <Card
      ref={setNodeRef}
      onMouseEnter={() => onHover(vehicle.id)}
      onMouseLeave={() => onHover(null)}
      className={cn(
        "transition-all duration-200",
        isOver && !rejected && "ring-2 ring-primary/40 bg-primary/5 scale-[1.01]",
        rejected && "animate-[shake_0.4s_ease-in-out] ring-2 ring-destructive/60 bg-destructive/5"
      )}
    >
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <div
              className="h-3 w-3 rounded-full shrink-0"
              style={{ background: vehicleColors[vehicle.id] || "#888" }}
            />
            {vehicle.name}
          </CardTitle>
          <Badge variant="secondary" className="text-[10px]">{vehicle.type}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">{vehicle.plate}
          {vehicle.features.length > 0 && <> · {vehicle.features.join(", ")}</>}
        </p>
      </CardHeader>
      <CardContent className="space-y-2 px-4 pb-4">
        <div className="space-y-1.5">
          <div>
            <div className="flex justify-between text-[11px] mb-0.5">
              <span className={cn("text-muted-foreground", capacityColor(pctKg))}>Gewicht</span>
              <span className={cn("font-medium", pctKg > 100 && "text-destructive")}>{totalKg} / {vehicle.capacityKg} kg</span>
            </div>
            <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-300",
                  pctKg > 100 ? "bg-destructive" : pctKg > 90 ? "bg-amber-500" : "bg-emerald-500"
                )}
                style={{ width: `${Math.min(pctKg, 100)}%` }}
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-[11px] mb-0.5">
              <span className={cn("text-muted-foreground", capacityColor(pctPallets))}>Pallets</span>
              <span className={cn("font-medium", pctPallets > 100 && "text-destructive")}>{totalPallets} / {vehicle.capacityPallets}</span>
            </div>
            <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-300",
                  pctPallets > 100 ? "bg-destructive" : pctPallets > 90 ? "bg-amber-500" : "bg-emerald-500"
                )}
                style={{ width: `${Math.min(pctPallets, 100)}%` }}
              />
            </div>
          </div>
        </div>

        {assigned.length === 0 ? (
          <div className="flex items-center justify-center h-12 border-2 border-dashed border-border/60 rounded-lg">
            <p className="text-xs text-muted-foreground italic">Sleep orders hierheen</p>
          </div>
        ) : (
          <div className="space-y-1">
            {assigned.map((o) => (
              <div key={o.id} className="flex items-center justify-between p-1.5 rounded bg-muted/40 text-xs group">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Package className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="font-medium">#{o.order_number}</span>
                  <span className="text-muted-foreground truncate">{o.client_name}</span>
                </div>
                <button
                  onClick={() => onRemove(o.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-destructive/10"
                >
                  <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Imperative Leaflet Map ──────────────────────────────────────────
function PlanningMap({
  orders,
  orderCoords,
  orderToVehicle,
  highlightedIds,
}: {
  orders: PlanOrder[];
  orderCoords: Map<string, GeoCoord>;
  orderToVehicle: Map<string, string>;
  highlightedIds: Set<string>;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());

  // Init map once
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: [52.2, 5.3],
      zoom: 7,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
    }).addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update markers when orders/assignments/highlights change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Remove old markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current.clear();

    const bounds: L.LatLngExpression[] = [];

    for (const order of orders) {
      const coord = orderCoords.get(order.id);
      if (!coord) continue;

      const vId = orderToVehicle.get(order.id);
      const isAssigned = !!vId;
      const isHighlighted = highlightedIds.has(order.id);
      const color = isAssigned && vId ? (vehicleColors[vId] || "#22c55e") : "#ef4444";
      const size = isHighlighted ? 20 : 12;

      const marker = L.marker([coord.lat, coord.lng], {
        icon: createMarkerIcon(color, size),
        zIndexOffset: isHighlighted ? 1000 : 0,
      }).addTo(map);

      const vehicleName = vId ? fleetVehicles.find((v) => v.id === vId)?.name : null;
      marker.bindPopup(
        `<div style="font-size:12px;">
          <b>${order.client_name || "Onbekend"}</b><br/>
          ${getCity(order.delivery_address)}<br/>
          ${getTotalWeight(order)} kg · ${order.quantity ?? "?"} pallets
          ${vehicleName ? `<br/><span style="color:${color};font-weight:600;">→ ${vehicleName}</span>` : ""}
        </div>`
      );

      markersRef.current.set(order.id, marker);
      bounds.push([coord.lat, coord.lng]);
    }

    if (bounds.length > 0) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [30, 30], maxZoom: 10 });
    }
  }, [orders, orderCoords, orderToVehicle, highlightedIds]);

  return <div ref={mapRef} className="h-full w-full" />;
}

// ─── Main Page ───────────────────────────────────────────────────────
const Planning = () => {
  const { toast } = useToast();
  const [assignments, setAssignments] = useState<Assignments>({});
  const [search, setSearch] = useState("");
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [activeOrder, setActiveOrder] = useState<PlanOrder | null>(null);
  const [rejectedVehicle, setRejectedVehicle] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [showMap, setShowMap] = useState(true);
  const [hoveredVehicle, setHoveredVehicle] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const { data: orders = [], refetch } = useQuery({
    queryKey: ["planning-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, client_name, delivery_address, quantity, weight_kg, requirements, is_weight_per_unit")
        .in("status", ["DRAFT", "OPEN"])
        .is("vehicle_id", null)
        .order("order_number", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PlanOrder[];
    },
  });

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
    if (!hoveredVehicle) return new Set<string>();
    return new Set((assignments[hoveredVehicle] ?? []).map((o) => o.id));
  }, [hoveredVehicle, assignments]);

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
          toast({
            title: "⚠️ Grote afstand tussen stops!",
            description: `${getCity(order.delivery_address)} ↔ ${getCity(ex.delivery_address)}: ${Math.round(dist)} km uit elkaar.`,
          });
          return;
        }
      }
    },
    [assignments, orderCoords, toast]
  );

  const handleDragStart = (event: DragStartEvent) => {
    const order = orders.find((o) => o.id === event.active.id);
    if (order) setActiveOrder(order);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveOrder(null);
    setRejectedVehicle(null);

    const { active, over } = event;
    if (!over) return;

    const order = orders.find((o) => o.id === active.id);
    const vehicle = fleetVehicles.find((v) => v.id === over.id);
    if (!order || !vehicle) return;

    const error = validateDrop(order, vehicle);
    if (error) {
      setRejectedVehicle(vehicle.id);
      setTimeout(() => setRejectedVehicle(null), 600);
      toast({ title: "Niet toegestaan", description: error, variant: "destructive" });
      return;
    }

    checkDistanceWarning(order, vehicle.id);

    setAssignments((prev) => {
      const next = { ...prev };
      for (const vId of Object.keys(next)) {
        next[vId] = next[vId].filter((o) => o.id !== order.id);
      }
      next[vehicle.id] = [...(next[vehicle.id] ?? []), order];
      return next;
    });
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

  const totalAssigned = Object.values(assignments).reduce((s, a) => s + a.length, 0);

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      for (const [vehicleId, vehicleOrders] of Object.entries(assignments)) {
        if (vehicleOrders.length === 0) continue;
        const vehicle = fleetVehicles.find((v) => v.id === vehicleId);
        for (const order of vehicleOrders) {
          const { error } = await supabase
            .from("orders")
            .update({ vehicle_id: vehicle?.name ?? vehicleId, status: "PLANNED" })
            .eq("id", order.id);
          if (error) throw error;
        }
      }
      toast({ title: "Planning bevestigd", description: `${totalAssigned} order(s) ingepland.` });
      setAssignments({});
      refetch();
    } catch {
      toast({ title: "Fout", description: "Kon planning niet opslaan.", variant: "destructive" });
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex flex-col h-[calc(100vh-5rem)] gap-3">
        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <div>
            <h1 className="font-display text-2xl font-bold flex items-center gap-2">
              <Truck className="h-6 w-6 text-primary" />Smart Planning
            </h1>
            <p className="text-sm text-muted-foreground">Sleep orders naar voertuigen — met geografisch inzicht</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={showMap ? "default" : "outline"}
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => setShowMap(!showMap)}
            >
              {showMap ? <List className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}
              {showMap ? "Verberg kaart" : "Toon kaart"}
            </Button>
            {totalAssigned > 0 && (
              <Button onClick={handleConfirm} disabled={isConfirming} className="gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Planning Bevestigen ({totalAssigned})
              </Button>
            )}
          </div>
        </div>

        {/* Map */}
        {showMap && (
          <div className="shrink-0 h-[260px] rounded-lg overflow-hidden border bg-card">
            <PlanningMap
              orders={orders}
              orderCoords={orderCoords}
              orderToVehicle={orderToVehicle}
              highlightedIds={highlightedIds}
            />
          </div>
        )}

        {/* Split screen */}
        <div className="flex gap-4 flex-1 min-h-0">
          {/* Left: Order list with region headers */}
          <div className="w-1/4 min-w-[260px] flex flex-col gap-3 shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Zoek order..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
            <div className="flex gap-1.5">
              {["ADR", "KOELING"].map((tag) => (
                <Button
                  key={tag}
                  variant={filterTag === tag ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => setFilterTag(filterTag === tag ? null : tag)}
                >
                  <Filter className="h-3 w-3" />{tag}
                </Button>
              ))}
              {filterTag && (
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setFilterTag(null)}>
                  Reset
                </Button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 pr-1">
              {groupedUnassigned.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground text-sm">
                  <Package className="h-8 w-8 mb-2 opacity-40" />
                  <p>Geen openstaande orders</p>
                </div>
              ) : (
                groupedUnassigned.map((group) => (
                  <div key={group.region}>
                    <div className="sticky top-0 bg-background/95 backdrop-blur-sm z-10 py-1 px-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <MapPin className="h-3 w-3" />
                        {group.label}
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0 ml-auto">
                          {group.orders.length}
                        </Badge>
                      </p>
                    </div>
                    <div className="space-y-1.5 mb-2">
                      {group.orders.map((order) => (
                        <DraggableOrder key={order.id} order={order} />
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="text-xs text-muted-foreground pt-1 border-t">
              {totalUnassigned} beschikbaar · {totalAssigned} toegewezen
            </div>
          </div>

          {/* Right: Fleet grid */}
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {fleetVehicles.map((vehicle) => (
                <VehicleDropZone
                  key={vehicle.id}
                  vehicle={vehicle}
                  assigned={assignments[vehicle.id] ?? []}
                  onRemove={handleRemove}
                  rejected={rejectedVehicle === vehicle.id}
                  onHover={setHoveredVehicle}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <DragOverlay>
        {activeOrder ? <DraggableOrder order={activeOrder} overlay /> : null}
      </DragOverlay>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
        .custom-marker { background: none !important; border: none !important; }
      `}</style>
    </DndContext>
  );
};

export default Planning;
