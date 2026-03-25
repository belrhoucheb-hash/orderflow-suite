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
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useVehicles, type FleetVehicle } from "@/hooks/useVehicles";
import {
  resolveCoordinates,
  getPostcodeRegion,
  getRegionLabel,
  haversineKm,
  vehicleColors,
  type GeoCoord,
} from "@/data/geoData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Clock,
  GripVertical,
  RotateCw,
  Warehouse,
  User,
  Route,
  Timer,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

// ─── Mock Drivers with certifications ────────────────────────────────
const MOCK_DRIVERS = [
  { name: "Henk de Vries", certs: ["ADR"] },
  { name: "Mo Ajam", certs: [] },
  { name: "Sanne Jansen", certs: ["KOELING"] },
  { name: "Piet Pietersen", certs: ["ADR", "KOELING"] },
];

/** Suggest the best driver for a vehicle based on assigned orders' requirements */
function suggestDriver(assigned: PlanOrder[], vehicleFeatures: string[]): string {
  const needsADR = assigned.some(o => hasTag(o, "ADR"));
  const needsKoeling = assigned.some(o => hasTag(o, "KOELING"));
  const candidates = MOCK_DRIVERS.filter(d => {
    if (needsADR && !d.certs.includes("ADR")) return false;
    if (needsKoeling && !d.certs.includes("KOELING")) return false;
    return true;
  });
  return candidates.length > 0 ? candidates[0].name : "";
}

/** Explain why a vehicle has no orders assigned */
function getEmptyReason(vehicle: FleetVehicle, allOrders: PlanOrder[], assignedIds: Set<string>): string {
  const unassigned = allOrders.filter(o => !assignedIds.has(o.id));
  if (unassigned.length === 0) return "Alle orders zijn al toegewezen.";
  const fittingOrders = unassigned.filter(o => {
    if (hasTag(o, "KOELING") && !vehicle.features.includes("KOELING")) return false;
    if (hasTag(o, "ADR") && !vehicle.features.includes("ADR")) return false;
    const w = getTotalWeight(o);
    if (w > vehicle.capacityKg) return false;
    return true;
  });
  if (fittingOrders.length === 0) {
    const koelOrders = unassigned.filter(o => hasTag(o, "KOELING"));
    const adrOrders = unassigned.filter(o => hasTag(o, "ADR"));
    if (koelOrders.length > 0 && !vehicle.features.includes("KOELING")) return "Resterende orders vereisen koeling — dit voertuig heeft geen koelinstallatie.";
    if (adrOrders.length > 0 && !vehicle.features.includes("ADR")) return "Resterende orders vereisen ADR — dit voertuig is niet ADR-uitgerust.";
    return "Geen orders passen qua capaciteit of vereisten.";
  }
  return `${fittingOrders.length} order(s) kunnen hier — sleep ze hierheen.`;
}

/** Explain why an unassigned order hasn't been placed on any vehicle */
function getUnassignedReason(order: PlanOrder, fleetVehicles: FleetVehicle[], assignments: Assignments): string | null {
  if (!order.delivery_address || order.delivery_address === "Onbekend") return "Afleveradres ontbreekt — niet inplanbaar.";
  const reasons: string[] = [];
  for (const v of fleetVehicles) {
    if (hasTag(order, "KOELING") && !v.features.includes("KOELING")) { reasons.push(`${v.name}: geen koeling`); continue; }
    if (hasTag(order, "ADR") && !v.features.includes("ADR")) { reasons.push(`${v.name}: geen ADR`); continue; }
    const current = (assignments[v.id] ?? []).reduce((s, o) => s + getTotalWeight(o), 0);
    if (current + getTotalWeight(order) > v.capacityKg) { reasons.push(`${v.name}: vol op gewicht`); continue; }
    const pallets = (assignments[v.id] ?? []).reduce((s, o) => s + (o.quantity ?? 0), 0);
    if (pallets + (order.quantity ?? 0) > v.capacityPallets) { reasons.push(`${v.name}: vol op pallets`); continue; }
    return null; // at least one vehicle fits
  }
  return reasons.slice(0, 2).join(" · ");
}

/** Detect groups of combinable unassigned orders */
function findCombinableGroups(orders: PlanOrder[], assignedIds: Set<string>): { key: string; orders: PlanOrder[]; savings: string }[] {
  const unassigned = orders.filter(o => !assignedIds.has(o.id));
  const groups = new Map<string, PlanOrder[]>();
  for (const o of unassigned) {
    const city = getCity(o.delivery_address).toLowerCase();
    const reqs = (o.requirements || []).sort().join(",");
    const key = `${city}|${reqs}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(o);
  }
  return [...groups.entries()]
    .filter(([, arr]) => arr.length >= 2)
    .map(([key, arr]) => ({
      key,
      orders: arr,
      savings: `${arr.length} orders naar ${getCity(arr[0].delivery_address)} — combineer tot 1 rit`,
    }));
}

const AVG_SPEED_KMH = 60;
const UNLOAD_MINUTES = 30;

/** Compute ETA for each stop given start time, ordered stops, and coords */
function computeETAs(
  startTime: string,
  stops: PlanOrder[],
  coordMap: Map<string, GeoCoord>,
): { eta: string; lateMinutes: number }[] {
  const [startH, startM] = startTime.split(":").map(Number);
  let currentMinutes = startH * 60 + startM;
  let currentPos: GeoCoord = WAREHOUSE;
  const results: { eta: string; lateMinutes: number }[] = [];

  for (const order of stops) {
    const coord = coordMap.get(order.id);
    if (coord) {
      const dist = haversineKm(currentPos, coord);
      const driveMin = (dist / AVG_SPEED_KMH) * 60;
      currentMinutes += driveMin;
    }
    const etaH = Math.floor(currentMinutes / 60) % 24;
    const etaM = Math.floor(currentMinutes % 60);
    const etaStr = `${String(etaH).padStart(2, "0")}:${String(etaM).padStart(2, "0")}`;

    // Check against time window
    const window = getTimeWindow(order);
    const endStr = window.split(" - ")[1];
    const [endH, endM2] = endStr.split(":").map(Number);
    const windowEnd = endH * 60 + endM2;
    const late = currentMinutes > windowEnd ? Math.round(currentMinutes - windowEnd) : 0;

    results.push({ eta: etaStr, lateMinutes: late });

    // Add unload time
    currentMinutes += UNLOAD_MINUTES;
    if (coord) currentPos = coord;
  }
  return results;
}

const MAX_DRIVE_MINUTES = 9 * 60; // Rijtijdenwet: max 9 uur

/** Compute total route distance and time (including return to warehouse) */
function computeRouteStats(
  startTime: string,
  stops: PlanOrder[],
  coordMap: Map<string, GeoCoord>,
): { totalKm: number; returnKm: number; totalMinutes: number; exceedsDriveLimit: boolean } {
  let totalKm = 0;
  let currentPos: GeoCoord = WAREHOUSE;

  for (const order of stops) {
    const coord = coordMap.get(order.id);
    if (coord) {
      totalKm += haversineKm(currentPos, coord);
      currentPos = coord;
    }
  }

  // Return trip: last stop back to warehouse
  const returnKm = stops.length > 0 ? haversineKm(currentPos, WAREHOUSE) : 0;
  const roundTripKm = totalKm + returnKm;

  const driveMinutes = (roundTripKm / AVG_SPEED_KMH) * 60;
  const unloadMinutes = stops.length * UNLOAD_MINUTES;
  const totalMinutes = driveMinutes + unloadMinutes;

  return {
    totalKm: Math.round(roundTripKm),
    returnKm: Math.round(returnKm),
    totalMinutes: Math.round(totalMinutes),
    exceedsDriveLimit: totalMinutes > MAX_DRIVE_MINUTES,
  };
}

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

const WAREHOUSE: GeoCoord = { lat: 52.30, lng: 4.76 };

function createMarkerIcon(color: string, size: number = 12, label?: string) {
  if (label) {
    const fontSize = size > 18 ? 11 : 9;
    return L.divIcon({
      className: "custom-marker",
      html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;color:white;font-size:${fontSize}px;font-weight:700;line-height:1;transition:all 0.2s;">${label}</div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  }
  return L.divIcon({
    className: "custom-marker",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.3);transition:all 0.2s;"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function createWarehouseIcon() {
  return L.divIcon({
    className: "custom-marker",
    html: `<div style="width:28px;height:28px;border-radius:4px;background:#1e293b;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;color:white;font-size:14px;">🏭</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

/** Nearest-neighbor route optimization starting from warehouse */
function optimizeRoute(routeOrders: PlanOrder[], coordMap: Map<string, GeoCoord>): PlanOrder[] {
  if (routeOrders.length <= 1) return routeOrders;
  const remaining = [...routeOrders];
  const result: PlanOrder[] = [];
  let current: GeoCoord = WAREHOUSE;

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const coord = coordMap.get(remaining[i].id);
      if (!coord) continue;
      const d = haversineKm(current, coord);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const next = remaining.splice(bestIdx, 1)[0];
    result.push(next);
    current = coordMap.get(next.id) || current;
  }
  return result;
}

/** Generate a fake time window based on order_number for demo purposes */
function getTimeWindow(order: PlanOrder): string {
  const windows = ["06:00 - 09:00", "08:00 - 12:00", "09:00 - 14:00", "12:00 - 17:00", "14:00 - 18:00", "16:00 - 20:00"];
  return windows[order.order_number % windows.length];
}

const DISTANCE_WARN_KM = 150;

// ─── Draggable Order Card (sidebar) ──────────────────────────────────
function DraggableOrder({
  order,
  overlay,
  onHover,
}: {
  order: PlanOrder;
  overlay?: boolean;
  onHover?: (orderId: string | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: order.id,
    data: { type: "order", order },
  });

  const style = overlay
    ? undefined
    : { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.3 : 1 };

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      style={style}
      {...(overlay ? {} : { ...listeners, ...attributes })}
      onMouseEnter={() => onHover?.(order.id)}
      onMouseLeave={() => onHover?.(null)}
      className={cn(
        "rounded-xl border border-border/40 bg-card p-3 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-all duration-150 group/card",
        overlay && "shadow-xl ring-2 ring-primary/30 rotate-1 scale-105"
      )}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-mono text-muted-foreground/60 font-medium">#{order.order_number}</span>
        <div className="flex gap-1">
          {hasTag(order, "ADR") && (
            <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold uppercase tracking-wide bg-amber-500/10 text-amber-700 border border-amber-200/60 rounded-md px-1.5 py-0.5">
              <AlertTriangle className="h-2.5 w-2.5" />ADR
            </span>
          )}
          {hasTag(order, "KOELING") && (
            <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold uppercase tracking-wide bg-blue-500/10 text-blue-700 border border-blue-200/60 rounded-md px-1.5 py-0.5">
              <Snowflake className="h-2.5 w-2.5" />KOEL
            </span>
          )}
        </div>
      </div>
      <p className="text-sm font-medium truncate text-foreground">{order.client_name || "Onbekend"}</p>
      <p className="text-[11px] text-muted-foreground/60 truncate mt-0.5 flex items-center gap-1">
        <MapPin className="h-2.5 w-2.5 shrink-0" />
        {getCity(order.delivery_address)}
      </p>
      <div className="flex items-center gap-3 mt-2.5 pt-2 border-t border-border/30 text-[11px] text-muted-foreground">
        <span className="tabular-nums">{order.quantity ?? "?"} plt</span>
        <span className="font-semibold text-foreground tabular-nums">{getTotalWeight(order)} kg</span>
        <span className="flex items-center gap-0.5 ml-auto text-muted-foreground/60">
          <Clock className="h-2.5 w-2.5" />
          {getTimeWindow(order)}
        </span>
      </div>
    </div>
  );
}

// ─── Sortable Order Row (inside vehicle card) ────────────────────────
function SortableOrderRow({
  order,
  index,
  onRemove,
  onHover,
  vehicleColor,
  eta,
  isLate,
}: {
  order: PlanOrder;
  index: number;
  onRemove: (orderId: string) => void;
  onHover: (orderId: string | null) => void;
  vehicleColor: string;
  eta?: string;
  isLate?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: order.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onMouseEnter={() => onHover(order.id)}
      onMouseLeave={() => onHover(null)}
      className="flex items-center justify-between p-1.5 rounded bg-muted/40 text-xs group"
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-0.5 touch-none">
          <GripVertical className="h-3 w-3 text-muted-foreground" />
        </button>
        <span
          className="flex items-center justify-center h-4 w-4 rounded-full text-[10px] font-bold text-white shrink-0"
          style={{ background: vehicleColor }}
        >
          {index + 1}
        </span>
        <Package className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="font-medium">#{order.order_number}</span>
        <span className="text-muted-foreground truncate">{order.client_name}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {eta && (
          <span className={cn("text-[10px] font-mono flex items-center gap-0.5", isLate ? "text-destructive font-bold" : "text-muted-foreground")}>
            {isLate && <AlertTriangle className="h-3 w-3" />}
            ETA: {eta}
          </span>
        )}
        <button
          onClick={() => onRemove(order.id)}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-destructive/10"
        >
          <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
        </button>
      </div>
    </div>
  );
}

// ─── Droppable Vehicle Card ──────────────────────────────────────────
function VehicleDropZone({
  vehicle,
  assigned,
  onRemove,
  onReorder,
  onOptimize,
  rejected,
  onHoverVehicle,
  onHoverOrder,
  startTime,
  onStartTimeChange,
  driver,
  onDriverChange,
  orderCoords,
}: {
  vehicle: FleetVehicle;
  assigned: PlanOrder[];
  onRemove: (orderId: string) => void;
  onReorder: (vehicleId: string, oldIndex: number, newIndex: number) => void;
  onOptimize: (vehicleId: string) => void;
  rejected: boolean;
  onHoverVehicle: (vehicleId: string | null) => void;
  onHoverOrder: (orderId: string | null) => void;
  startTime: string;
  onStartTimeChange: (vehicleId: string, time: string) => void;
  driver: string;
  onDriverChange: (vehicleId: string, driver: string) => void;
  orderCoords: Map<string, GeoCoord>;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: vehicle.id });
  const color = vehicleColors[vehicle.id] || "#888";

  const totalKg = assigned.reduce((s, o) => s + getTotalWeight(o), 0);
  const totalPallets = assigned.reduce((s, o) => s + (o.quantity ?? 0), 0);
  const pctKg = (totalKg / vehicle.capacityKg) * 100;
  const pctPallets = (totalPallets / vehicle.capacityPallets) * 100;

  // ETA calculations
  const etas = useMemo(() => computeETAs(startTime, assigned, orderCoords), [startTime, assigned, orderCoords]);
  const stats = useMemo(() => computeRouteStats(startTime, assigned, orderCoords), [startTime, assigned, orderCoords]);
  const utilizationPct = Math.max(
    Math.round((totalKg / vehicle.capacityKg) * 100),
    Math.round((totalPallets / vehicle.capacityPallets) * 100),
  );

  const formatDuration = (min: number) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? `${h}u ${m}m` : `${m}m`;
  };

  return (
    <Card
      ref={setNodeRef}
      onMouseEnter={() => onHoverVehicle(vehicle.id)}
      onMouseLeave={() => onHoverVehicle(null)}
      className={cn(
        "transition-all duration-200 flex flex-col rounded-xl border-border/40 shadow-sm",
        isOver && !rejected && "ring-2 ring-primary/30 bg-primary/[0.03] scale-[1.005] shadow-md",
        rejected && "animate-[shake_0.4s_ease-in-out] ring-2 ring-destructive/60 bg-destructive/5"
      )}
    >
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-display font-semibold flex items-center gap-2">
            <div className="h-3 w-3 rounded-full shrink-0 ring-2 ring-background shadow-sm" style={{ background: color }} />
            {vehicle.name}
          </CardTitle>
          <div className="flex items-center gap-1.5">
            {assigned.length >= 2 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px] gap-1"
                onClick={(e) => { e.stopPropagation(); onOptimize(vehicle.id); }}
              >
                <RotateCw className="h-3 w-3" />Optimaliseer
              </Button>
            )}
            <Badge variant="secondary" className="text-[10px]">{vehicle.type}</Badge>
          </div>
        </div>
        {/* Driver + Start time row */}
        <div className="flex items-center gap-2 mt-1.5">
          <p className="text-xs text-muted-foreground shrink-0">{vehicle.plate}</p>
          <Select value={driver} onValueChange={(v) => onDriverChange(vehicle.id, v)}>
            <SelectTrigger className="h-6 text-[11px] px-2 w-[130px] bg-background">
              <User className="h-3 w-3 mr-1 text-muted-foreground" />
              <SelectValue placeholder="Chauffeur..." />
            </SelectTrigger>
            <SelectContent>
              {MOCK_DRIVERS.map((d) => (
                <SelectItem key={d.name} value={d.name} className="text-xs">
                  {d.name}
                  {d.certs.length > 0 && <span className="text-[9px] text-muted-foreground ml-1">({d.certs.join(", ")})</span>}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1 ml-auto">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <Input
              type="time"
              value={startTime}
              onChange={(e) => onStartTimeChange(vehicle.id, e.target.value)}
              className="h-6 w-[80px] text-[11px] px-1.5 text-center bg-background"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 px-4 pb-0 flex-1">
        {/* Capacity meters */}
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
          <div className="flex flex-col items-center justify-center h-16 border-2 border-dashed border-border/40 rounded-xl bg-muted/20 px-3">
            <p className="text-[11px] text-muted-foreground/50 italic flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5" />Sleep orders hierheen
            </p>
            <p className="text-[9px] text-muted-foreground/35 mt-0.5 text-center leading-snug">{emptyReason}</p>
          </div>
        ) : (
          <SortableContext items={assigned.map((o) => o.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1">
              {assigned.map((o, idx) => (
                <SortableOrderRow
                  key={o.id}
                  order={o}
                  index={idx}
                  onRemove={onRemove}
                  onHover={onHoverOrder}
                  vehicleColor={color}
                  eta={etas[idx]?.eta}
                  isLate={etas[idx]?.lateMinutes > 0}
                />
              ))}
            </div>
          </SortableContext>
        )}
      </CardContent>

      {/* Efficiency Footer */}
      {assigned.length > 0 && (
        <div className="mt-auto px-4 pb-3 pt-2 space-y-1.5">
          <div className="flex items-center justify-between gap-2 rounded-xl bg-muted/40 px-3 py-2.5 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Timer className="h-3 w-3" />
              <span className="font-medium text-foreground">{formatDuration(stats.totalMinutes)}</span>
            </span>
            <span className="flex items-center gap-1 tabular-nums">
              <Route className="h-3 w-3" />
              {stats.totalKm} km
              <span className="text-[10px] opacity-50">(+{stats.returnKm})</span>
            </span>
            <span className="flex items-center gap-1">
              <BarChart3 className="h-3 w-3" />
              <span className={cn("font-semibold", utilizationPct > 100 ? "text-destructive" : utilizationPct > 90 ? "text-amber-600" : "text-foreground")}>
                {utilizationPct}%
              </span>
            </span>
          </div>
          {stats.exceedsDriveLimit && (
            <div className="flex items-center gap-1.5 rounded-xl bg-destructive/8 border border-destructive/15 px-3 py-2 text-[11px] text-destructive font-medium">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>Rijtijdenwet: {formatDuration(stats.totalMinutes)} overschrijdt 9 uur!</span>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ─── Droppable Unassigned Sidebar ────────────────────────────────────
function UnassignedDropZone({ children }: { children: React.ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id: "unassigned" });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex-1 overflow-y-auto space-y-1 pr-1 rounded-lg transition-colors duration-200",
        isOver && "ring-2 ring-primary/40 bg-primary/5"
      )}
    >
      {children}
    </div>
  );
}

// ─── Imperative Leaflet Map ──────────────────────────────────────────
function PlanningMap({
  orders,
  orderCoords,
  orderToVehicle,
  highlightedIds,
  assignments,
  fleetVehicles,
}: {
  orders: PlanOrder[];
  orderCoords: Map<string, GeoCoord>;
  orderToVehicle: Map<string, string>;
  highlightedIds: Set<string>;
  assignments: Assignments;
  fleetVehicles: FleetVehicle[];
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const polylinesRef = useRef<L.Polyline[]>([]);
  const warehouseRef = useRef<L.Marker | null>(null);

  // Init map once
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, { center: [52.2, 5.3], zoom: 7 });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
    }).addTo(map);

    mapInstanceRef.current = map;
    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update markers + polylines
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clear old
    markersRef.current.forEach((m) => m.remove());
    markersRef.current.clear();
    polylinesRef.current.forEach((p) => p.remove());
    polylinesRef.current = [];
    if (warehouseRef.current) {
      warehouseRef.current.remove();
      warehouseRef.current = null;
    }

    const bounds: L.LatLngExpression[] = [];

    // Build order-to-index map for assigned orders
    const orderIndex = new Map<string, { idx: number; vId: string }>();
    for (const [vId, arr] of Object.entries(assignments)) {
      arr.forEach((o, idx) => orderIndex.set(o.id, { idx, vId }));
    }

    // Draw markers
    for (const order of orders) {
      const coord = orderCoords.get(order.id);
      if (!coord) continue;

      const info = orderIndex.get(order.id);
      const vId = orderToVehicle.get(order.id);
      const isAssigned = !!vId;
      const isHighlighted = highlightedIds.has(order.id);
      const color = isAssigned && vId ? (vehicleColors[vId] || "#22c55e") : "#ef4444";
      const size = isHighlighted ? 26 : isAssigned ? 20 : 12;
      const label = info ? String(info.idx + 1) : undefined;

      const marker = L.marker([coord.lat, coord.lng], {
        icon: createMarkerIcon(color, size, label),
        zIndexOffset: isHighlighted ? 1000 : isAssigned ? 500 : 0,
      }).addTo(map);

      const vehicleName = vId ? fleetVehicles.find((v) => v.id === vId)?.name : null;
      marker.bindPopup(
        `<div style="font-size:12px;">
          ${label ? `<span style="font-weight:700;color:${color};">Stop #${label}</span><br/>` : ""}
          <b>${order.client_name || "Onbekend"}</b><br/>
          ${getCity(order.delivery_address)}<br/>
          ${getTotalWeight(order)} kg · ${order.quantity ?? "?"} pallets
          ${vehicleName ? `<br/><span style="color:${color};font-weight:600;">→ ${vehicleName}</span>` : ""}
        </div>`
      );

      markersRef.current.set(order.id, marker);
      bounds.push([coord.lat, coord.lng]);
    }

    // Draw warehouse marker if any vehicle has assignments
    const hasAnyAssignment = Object.values(assignments).some((a) => a.length > 0);
    if (hasAnyAssignment) {
      const wh = L.marker([WAREHOUSE.lat, WAREHOUSE.lng], {
        icon: createWarehouseIcon(),
        zIndexOffset: 2000,
      }).addTo(map);
      wh.bindPopup('<div style="font-size:12px;"><b>🏭 Warehouse</b><br/>Schiphol / Hoofddorp</div>');
      warehouseRef.current = wh;
      bounds.push([WAREHOUSE.lat, WAREHOUSE.lng]);
    }

    // Draw polylines per vehicle (from warehouse → stop1 → stop2 → ...)
    for (const [vId, vehicleOrders] of Object.entries(assignments)) {
      if (vehicleOrders.length === 0) continue;
      const color = vehicleColors[vId] || "#888";
      const latlngs: L.LatLngExpression[] = [[WAREHOUSE.lat, WAREHOUSE.lng]];
      for (const o of vehicleOrders) {
        const coord = orderCoords.get(o.id);
        if (coord) latlngs.push([coord.lat, coord.lng]);
      }
      if (latlngs.length >= 2) {
        const polyline = L.polyline(latlngs, {
          color,
          weight: 3,
          opacity: 0.7,
          dashArray: "8 4",
        }).addTo(map);
        polylinesRef.current.push(polyline);
      }
    }

    if (bounds.length > 0) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [30, 30], maxZoom: 10 });
    }
  }, [orders, orderCoords, orderToVehicle, highlightedIds, assignments]);

  return <div ref={mapRef} className="h-full w-full" />;
}

// ─── Main Page ───────────────────────────────────────────────────────
const Planning = () => {
  const { toast } = useToast();
  const { data: fleetVehicles = [] } = useVehicles();
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
  const [testOrders, setTestOrders] = useState<PlanOrder[]>([]);

  // Initialize vehicle start times and drivers when fleet data loads
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

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const { data: dbOrders = [], refetch } = useQuery({
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

  // Merge DB orders with injected test orders
  const orders = useMemo(() => [...dbOrders, ...testOrders], [dbOrders, testOrders]);

  const handleInjectTestOrders = useCallback(() => {
    const testData: PlanOrder[] = [
      {
        id: "test-bakwagen-vuller",
        order_number: 9901,
        client_name: "Bouwmarkt Gigant",
        delivery_address: "Damrak 1, Amsterdam",
        quantity: 4,
        weight_kg: 3200,
        requirements: [],
        is_weight_per_unit: false,
      },
      {
        id: "test-full-truck-load",
        order_number: 9902,
        client_name: "Staalhandel Rotterdam",
        delivery_address: "Havenweg 50, Antwerpen, Belgie",
        quantity: 22,
        weight_kg: 18500,
        requirements: [],
        is_weight_per_unit: false,
      },
      {
        id: "test-koel-combinatie",
        order_number: 9903,
        client_name: "Supermarkt DC Zwolle",
        delivery_address: "Distributieweg 1, Zwolle",
        quantity: 14,
        weight_kg: 6000,
        requirements: ["KOELING"],
        is_weight_per_unit: false,
      },
    ];
    setTestOrders(testData);
    toast({ title: "🧪 3 testorders geladen", description: "Bakwagen Vuller · Full Truck Load · Koel-Combinatie" });
  }, [toast]);

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

  // Combine vehicle hover + individual order hover for highlighting
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

    // Handle drop back to unassigned sidebar
    if (overId === "unassigned") {
      const sourceVehicle = orderToVehicle.get(activeId);
      if (sourceVehicle) {
        handleRemove(activeId);
        toast({ title: "Order teruggezet", description: "Order is weer beschikbaar voor planning." });
      }
      return;
    }

    // Check if this is a sortable reorder within a vehicle
    const activeVehicle = orderToVehicle.get(activeId);
    const overVehicle = orderToVehicle.get(overId);

    if (activeVehicle && activeVehicle === overVehicle) {
      // Reorder within the same vehicle
      setAssignments((prev) => {
        const list = [...(prev[activeVehicle] ?? [])];
        const oldIndex = list.findIndex((o) => o.id === activeId);
        const newIndex = list.findIndex((o) => o.id === overId);
        if (oldIndex === -1 || newIndex === -1) return prev;
        return { ...prev, [activeVehicle]: arrayMove(list, oldIndex, newIndex) };
      });
      return;
    }

    // Find the order — either from unassigned list or from current assignments
    let order = orders.find((o) => o.id === activeId);
    if (!order && activeVehicle) {
      order = assignments[activeVehicle]?.find((o) => o.id === activeId);
    }
    if (!order) return;

    // Determine target vehicle: overId is a vehicle directly, or overId is an order inside a vehicle
    let targetVehicle = fleetVehicles.find((v) => v.id === overId);
    if (!targetVehicle && overVehicle) {
      // Dropped on an order that belongs to a different vehicle
      targetVehicle = fleetVehicles.find((v) => v.id === overVehicle);
    }
    if (!targetVehicle) return;

    // Don't do anything if dropping back on the same vehicle
    if (activeVehicle === targetVehicle.id) return;

    const error = validateDrop(order, targetVehicle);
    if (error) {
      setRejectedVehicle(targetVehicle.id);
      setTimeout(() => setRejectedVehicle(null), 600);
      toast({ title: "Niet toegestaan", description: error, variant: "destructive" });
      return;
    }

    checkDistanceWarning(order, targetVehicle.id);

    setAssignments((prev) => {
      const next = { ...prev };
      // Remove from all vehicles (including source)
      for (const vId of Object.keys(next)) {
        next[vId] = next[vId].filter((o) => o.id !== order!.id);
      }
      const newList = [...(next[targetVehicle!.id] ?? []), order!];
      next[targetVehicle!.id] = optimizeRoute(newList, orderCoords);
      return next;
    });

    const fromLabel = activeVehicle ? fleetVehicles.find((v) => v.id === activeVehicle)?.name : "ongepland";
    toast({ title: "Order verplaatst", description: `${order.client_name} → ${targetVehicle.name} (van ${fromLabel})` });
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
    toast({ title: "Route geoptimaliseerd", description: "Volgorde herberekend via nearest-neighbor." });
  }, [orderCoords, toast]);

  const handleAutoPlan = useCallback(() => {
    // Step 1: Sort orders by region + time window for geographic/temporal clustering
    const unassigned = orders
      .filter((o) => !assignedIds.has(o.id))
      .map((o) => ({
        order: o,
        region: getPostcodeRegion(o.delivery_address),
        windowEnd: (() => {
          const w = getTimeWindow(o).split(" - ")[1];
          const [h, m] = w.split(":").map(Number);
          return h * 60 + m;
        })(),
      }));
    // Sort by region first, then by time window end (earliest deadline first)
    unassigned.sort((a, b) => a.region.localeCompare(b.region) || a.windowEnd - b.windowEnd);
    const sortedOrders = unassigned.map((u) => u.order);

    if (sortedOrders.length === 0) {
      toast({ title: "Geen orders", description: "Er zijn geen ongeplande orders om te verdelen." });
      return;
    }

    // Step 2: Economic Best Fit — sort vehicles SMALL to LARGE
    const sortedVehicles = [...fleetVehicles].sort((a, b) => a.capacityKg - b.capacityKg);

    // Step 3: Fill smallest vehicles first — only overflow to bigger ones
    const newAssignments: Assignments = { ...assignments };
    const placed: Set<string> = new Set();

    const vehicleWeight: Record<string, number> = {};
    const vehiclePallets: Record<string, number> = {};
    for (const v of sortedVehicles) {
      const existing = newAssignments[v.id] ?? [];
      vehicleWeight[v.id] = existing.reduce((s, o) => s + getTotalWeight(o), 0);
      vehiclePallets[v.id] = existing.reduce((s, o) => s + (o.quantity ?? 0), 0);
    }

    for (const vehicle of sortedVehicles) {
      for (const order of sortedOrders) {
        if (placed.has(order.id)) continue;

        // Check requirements
        if (hasTag(order, "KOELING") && !vehicle.features.includes("KOELING")) continue;
        if (hasTag(order, "ADR") && !vehicle.features.includes("ADR")) continue;

        const orderWeight = getTotalWeight(order);
        if (vehicleWeight[vehicle.id] + orderWeight > vehicle.capacityKg) continue;

        const orderPallets = order.quantity ?? 0;
        if (vehiclePallets[vehicle.id] + orderPallets > vehicle.capacityPallets) continue;

        // Geographic clustering: prefer nearby regions when vehicle > 50% full
        const existing = newAssignments[vehicle.id] ?? [];
        if (existing.length > 0) {
          const existingRegions = new Set(existing.map((o) => getPostcodeRegion(o.delivery_address)));
          const orderRegion = getPostcodeRegion(order.delivery_address);
          const regionNum = parseInt(orderRegion);
          const isNearby = [...existingRegions].some((r) => {
            const rNum = parseInt(r);
            return isNaN(rNum) || isNaN(regionNum) || Math.abs(rNum - regionNum) <= 10;
          });
          const utilizationPct = (vehicleWeight[vehicle.id] / vehicle.capacityKg) * 100;
          if (!isNearby && utilizationPct > 50) continue;
        }

        if (!newAssignments[vehicle.id]) newAssignments[vehicle.id] = [];
        newAssignments[vehicle.id].push(order);
        vehicleWeight[vehicle.id] += orderWeight;
        vehiclePallets[vehicle.id] += orderPallets;
        placed.add(order.id);
      }
    }

    // Overflow pass — remaining orders without geographic constraint
    for (const vehicle of sortedVehicles) {
      for (const order of sortedOrders) {
        if (placed.has(order.id)) continue;
        if (hasTag(order, "KOELING") && !vehicle.features.includes("KOELING")) continue;
        if (hasTag(order, "ADR") && !vehicle.features.includes("ADR")) continue;
        const orderWeight = getTotalWeight(order);
        if (vehicleWeight[vehicle.id] + orderWeight > vehicle.capacityKg) continue;
        const orderPallets = order.quantity ?? 0;
        if (vehiclePallets[vehicle.id] + orderPallets > vehicle.capacityPallets) continue;

        if (!newAssignments[vehicle.id]) newAssignments[vehicle.id] = [];
        newAssignments[vehicle.id].push(order);
        vehicleWeight[vehicle.id] += orderWeight;
        vehiclePallets[vehicle.id] += orderPallets;
        placed.add(order.id);
      }
    }

    // Route optimization per vehicle
    for (const vehicle of sortedVehicles) {
      const list = newAssignments[vehicle.id];
      if (list && list.length > 1) {
        newAssignments[vehicle.id] = optimizeRoute(list, orderCoords);
      }
    }

    setAssignments(newAssignments);

    // Efficiency reporting
    const usedVehicles = sortedVehicles.filter((v) => (newAssignments[v.id]?.length ?? 0) > 0);
    const smallVehiclesUsed = usedVehicles.filter((v) => v.capacityKg <= 5000).length;
    const notPlaced = sortedOrders.length - placed.size;
    toast({
      title: `⚡ ${placed.size} orders ingepland over ${usedVehicles.length} voertuig(en)`,
      description: notPlaced > 0
        ? `${notPlaced} order(s) konden niet geplaatst worden (capaciteit/vereisten).`
        : `Optimalisatie gereed. ${smallVehiclesUsed} kleine voertuig(en) maximaal benut.`,
      variant: notPlaced > 0 ? "destructive" : undefined,
    });
  }, [orders, assignedIds, assignments, orderCoords, toast]);

  // ─── Combineer Ritten ──────────────────────────────────────────────
  const handleCombineTrips = useCallback(() => {
    const vehiclesWithOrders = fleetVehicles
      .map((v) => ({
        vehicle: v,
        orders: assignments[v.id] ?? [],
        weightKg: (assignments[v.id] ?? []).reduce((s, o) => s + getTotalWeight(o), 0),
        pallets: (assignments[v.id] ?? []).reduce((s, o) => s + (o.quantity ?? 0), 0),
      }))
      .filter((v) => v.orders.length > 0);

    if (vehiclesWithOrders.length < 2) {
      toast({ title: "Combineer ritten", description: "Er zijn niet genoeg voertuigen met orders om te combineren." });
      return;
    }

    let combinedCount = 0;
    const newAssignments = { ...assignments };

    // Try to merge pairs — iterate from smallest to largest
    const sorted = [...vehiclesWithOrders].sort((a, b) => a.vehicle.capacityKg - b.vehicle.capacityKg);

    const emptied = new Set<string>();

    for (let i = 0; i < sorted.length; i++) {
      const source = sorted[i];
      if (emptied.has(source.vehicle.id)) continue;
      if ((newAssignments[source.vehicle.id]?.length ?? 0) === 0) continue;

      // Determine main region of source orders
      const sourceRegions = new Set(
        source.orders.map((o) => getPostcodeRegion(o.delivery_address))
      );

      // Check requirements of source orders
      const sourceNeedsKoeling = source.orders.some((o) => hasTag(o, "KOELING"));
      const sourceNeedsADR = source.orders.some((o) => hasTag(o, "ADR"));

      // Find a target vehicle that can absorb source's orders AND is in a nearby region
      for (let j = 0; j < sorted.length; j++) {
        if (i === j) continue;
        const target = sorted[j];
        if (emptied.has(target.vehicle.id)) continue;

        // Requirements check
        if (sourceNeedsKoeling && !target.vehicle.features.includes("KOELING")) continue;
        if (sourceNeedsADR && !target.vehicle.features.includes("ADR")) continue;

        // Capacity check: can target absorb all source orders?
        const currentTargetOrders = newAssignments[target.vehicle.id] ?? [];
        const targetWeight = currentTargetOrders.reduce((s, o) => s + getTotalWeight(o), 0);
        const targetPallets = currentTargetOrders.reduce((s, o) => s + (o.quantity ?? 0), 0);
        const sourceOrders = newAssignments[source.vehicle.id] ?? [];
        const addWeight = sourceOrders.reduce((s, o) => s + getTotalWeight(o), 0);
        const addPallets = sourceOrders.reduce((s, o) => s + (o.quantity ?? 0), 0);

        if (targetWeight + addWeight > target.vehicle.capacityKg) continue;
        if (targetPallets + addPallets > target.vehicle.capacityPallets) continue;

        // Region check: target should serve nearby regions
        const targetRegions = new Set(
          currentTargetOrders.map((o) => getPostcodeRegion(o.delivery_address))
        );
        const isNearbyRegion = targetRegions.size === 0 || [...sourceRegions].some((sr) => {
          const srNum = parseInt(sr);
          return [...targetRegions].some((tr) => {
            const trNum = parseInt(tr);
            return isNaN(srNum) || isNaN(trNum) || Math.abs(srNum - trNum) <= 15;
          });
        });
        if (!isNearbyRegion) continue;

        // Merge! Move all source orders to target
        const merged = [...currentTargetOrders, ...sourceOrders];
        newAssignments[target.vehicle.id] = optimizeRoute(merged, orderCoords);
        newAssignments[source.vehicle.id] = [];
        emptied.add(source.vehicle.id);
        combinedCount++;
        break; // source is emptied, move on
      }
    }

    if (combinedCount === 0) {
      toast({
        title: "🔗 Geen combinaties gevonden",
        description: "Geen voertuigen met dezelfde regio en voldoende restcapaciteit om samen te voegen.",
      });
    } else {
      setAssignments(newAssignments);
      toast({
        title: `🔗 ${combinedCount} rit(ten) gecombineerd`,
        description: `${combinedCount} voertuig(en) vrijgemaakt door orders samen te voegen.`,
      });
    }
  }, [assignments, orderCoords, toast]);

  const totalAssigned = Object.values(assignments).reduce((s, a) => s + a.length, 0);

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      for (const [vehicleId, vehicleOrders] of Object.entries(assignments)) {
        if (vehicleOrders.length === 0) continue;
        const vehicle = fleetVehicles.find((v) => v.id === vehicleId);
        for (let i = 0; i < vehicleOrders.length; i++) {
          const order = vehicleOrders[i];
          const { error } = await supabase
            .from("orders")
            .update({ vehicle_id: vehicle?.name ?? vehicleId, status: "PLANNED", stop_sequence: i + 1 } as any)
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

        {/* Main content: sidebar + fleet + optional map */}
        <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
          {/* Left: Order list with region headers */}
          <div className="w-full lg:w-1/4 lg:min-w-[260px] flex flex-col gap-3 shrink-0 max-h-[40vh] lg:max-h-none bg-card rounded-xl border border-border/40 p-3 shadow-sm">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
              <Input
                placeholder="Zoek order..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-sm rounded-lg border-border/40"
              />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {["ADR", "KOELING"].map((tag) => (
                <Button
                  key={tag}
                  variant={filterTag === tag ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-[11px] gap-1 rounded-lg"
                  onClick={() => setFilterTag(filterTag === tag ? null : tag)}
                >
                  <Filter className="h-3 w-3" />{tag}
                </Button>
              ))}
              {filterTag && (
                <Button variant="ghost" size="sm" className="h-7 text-[11px] rounded-lg" onClick={() => setFilterTag(null)}>
                  Reset
                </Button>
              )}
              <div className="flex gap-1.5 ml-auto">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px] gap-1 rounded-lg"
                  onClick={handleInjectTestOrders}
                  disabled={testOrders.length > 0}
                >
                  🧪 Test
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px] gap-1 rounded-lg"
                  onClick={handleCombineTrips}
                  disabled={Object.values(assignments).filter((a) => a.length > 0).length < 2}
                >
                  🔗 Combineer
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-[11px] gap-1 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg"
                  onClick={handleAutoPlan}
                  disabled={totalUnassigned === 0}
                >
                  ⚡ Auto-Plan
                </Button>
              </div>
            </div>

            <UnassignedDropZone>
              {groupedUnassigned.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground text-sm">
                  <Package className="h-8 w-8 mb-2 opacity-30" />
                  <p className="text-[11px]">Geen openstaande orders</p>
                </div>
              ) : (
                groupedUnassigned.map((group) => (
                  <div key={group.region}>
                    <div className="sticky top-0 bg-card/95 backdrop-blur-sm z-10 py-1.5 px-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 flex items-center gap-1.5">
                        <MapPin className="h-2.5 w-2.5" />
                        {group.label}
                        <span className="text-[9px] bg-muted rounded-md px-1.5 py-0.5 ml-auto tabular-nums font-medium">
                          {group.orders.length}
                        </span>
                      </p>
                    </div>
                    <div className="space-y-1.5 mb-2">
                      {group.orders.map((order) => (
                        <DraggableOrder key={order.id} order={order} onHover={setHoveredOrderId} />
                      ))}
                    </div>
                  </div>
                ))
              )}
            </UnassignedDropZone>

            <div className="text-[11px] text-muted-foreground/60 pt-2 border-t border-border/30 tabular-nums">
              {totalUnassigned} beschikbaar · {totalAssigned} ingepland
            </div>
          </div>

          {/* Center: Fleet grid */}
          <div className={cn("flex-1 overflow-y-auto", showMap && "lg:w-1/2")}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {fleetVehicles.map((vehicle) => (
                <VehicleDropZone
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
                  driver={vehicleDrivers[vehicle.id] ?? ""}
                  onDriverChange={(vId, d) => setVehicleDrivers((p) => ({ ...p, [vId]: d }))}
                  orderCoords={orderCoords}
                />
              ))}
            </div>
          </div>

          {/* Right: Map as side panel */}
          {showMap && (
            <div className="hidden lg:block lg:w-1/4 lg:min-w-[280px] rounded-xl overflow-hidden border border-border/40 bg-card shadow-sm">
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
