import { useMemo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { 
  Truck, 
  RotateCw, 
  User, 
  Clock, 
  Package, 
  Timer, 
  Route, 
  BarChart3, 
  AlertTriangle 
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { type FleetVehicle } from "@/hooks/useVehicles";
import { type Driver } from "@/hooks/useDrivers";
import { type GeoCoord, vehicleColors } from "@/data/geoData";
import { type PlanOrder, UNLOAD_MINUTES } from "./types";
import { 
  getTotalWeight, 
  capacityColor, 
  computeETAs, 
  computeRouteStats 
} from "./planningUtils";
import { PlanningOrderRow } from "./PlanningOrderRow";

export function PlanningVehicleCard({
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
  driverId,
  onDriverChange,
  orderCoords,
  emptyReason,
  drivers,
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
  driverId: string;
  onDriverChange: (vehicleId: string, driverId: string) => void;
  orderCoords: Map<string, GeoCoord>;
  emptyReason: string;
  drivers: Driver[];
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
        <div className="flex items-center gap-2 mt-1.5">
          <p className="text-xs text-muted-foreground shrink-0">{vehicle.plate}</p>
          <Select value={driverId} onValueChange={(v) => onDriverChange(vehicle.id, v)}>
            <SelectTrigger className="h-6 text-[11px] px-2 w-[130px] bg-background">
              <User className="h-3 w-3 mr-1 text-muted-foreground" />
              <SelectValue placeholder="Chauffeur..." />
            </SelectTrigger>
            <SelectContent>
              {drivers.map((d) => (
                <SelectItem key={d.id} value={d.id} className="text-xs">
                  {d.name}
                  {d.certifications && d.certifications.length > 0 && <span className="text-[9px] text-muted-foreground ml-1">({d.certifications.join(", ")})</span>}
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
                <PlanningOrderRow
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

      {assigned.length > 0 && (
        <div className="mt-auto px-4 pb-3 pt-2 space-y-1.5">
          <div className="flex items-center justify-between gap-2 rounded-xl bg-muted/40 px-3 py-2.5 text-[11px] text-muted-foreground">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-1 cursor-help">
                  <Timer className="h-3 w-3" />
                  <span className="font-medium text-foreground">{formatDuration(stats.totalMinutes)}</span>
                </span>
              </TooltipTrigger>
              <TooltipContent className="text-[10px] max-w-[200px]">Totale rijtijd inclusief {assigned.length}× {UNLOAD_MINUTES} min lostijd</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-1 tabular-nums cursor-help">
                  <Route className="h-3 w-3" />
                  {stats.totalKm} km
                  <span className="text-[10px] opacity-50">(+{stats.returnKm})</span>
                </span>
              </TooltipTrigger>
              <TooltipContent className="text-[10px] max-w-[200px]">Route: {stats.totalKm - stats.returnKm} km heen + {stats.returnKm} km retour naar depot</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-1 cursor-help">
                  <BarChart3 className="h-3 w-3" />
                  <span className={cn("font-semibold", utilizationPct > 100 ? "text-destructive" : utilizationPct > 90 ? "text-amber-600" : "text-foreground")}>
                    {utilizationPct}%
                  </span>
                </span>
              </TooltipTrigger>
              <TooltipContent className="text-[10px] max-w-[220px]">
                Capaciteitsbenutting: {Math.round(pctKg)}% gewicht ({totalKg}/{vehicle.capacityKg} kg) · {Math.round(pctPallets)}% pallets ({totalPallets}/{vehicle.capacityPallets})
              </TooltipContent>
            </Tooltip>
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
