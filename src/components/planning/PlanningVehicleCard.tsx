import { useEffect, useMemo, useRef, useState } from "react";
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
import { useDriverSchedulesForDate } from "@/hooks/useDriverScheduleForDate";
import { useAllDriverCountryRestrictions } from "@/hooks/useDriverCountryRestrictions";
import {
  formatDriverCountryRestrictionIssue,
  getDriverCountryRestrictionIssue,
} from "@/lib/driverCountryRestrictions";
import { findVehicleConflictsOnDate } from "@/lib/roosterConflicts";
import { type GeoCoord, vehicleColors } from "@/data/geoData";
import { MapPin, Weight } from "lucide-react";
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
  vehicleDbId,
  selectedDate,
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
  /**
   * Rauwe database-UUID van dit voertuig. `FleetVehicle.id` is de human-readable
   * `code`, maar `driver_schedules.vehicle_id` verwijst naar de UUID. De parent
   * mapt code→UUID via `useVehiclesRaw` en geeft het hier door.
   */
  vehicleDbId?: string | null;
  /**
   * Datum (yyyy-mm-dd) van de huidige planning, gebruikt om het rooster
   * voor dezelfde dag te raadplegen voor prefill en conflict-detectie.
   */
  selectedDate: string;
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
  const [activeTab, setActiveTab] = useState<"route" | "ingepland">("route");

  // ── Rooster-integratie: prefill + conflict-detectie ─────────────────
  const { data: daySchedules = [] } = useDriverSchedulesForDate(selectedDate);
  const { data: countryRestrictions = [] } = useAllDriverCountryRestrictions();

  const rosterHit = useMemo(() => {
    if (!vehicleDbId) return null;
    return (
      daySchedules.find(
        (s) => s.vehicle_id === vehicleDbId && s.status === "werkt",
      ) ?? null
    );
  }, [daySchedules, vehicleDbId]);

  const hasVehicleConflict = useMemo(() => {
    if (!vehicleDbId) return false;
    const conflicts = findVehicleConflictsOnDate(daySchedules);
    return conflicts.has(vehicleDbId);
  }, [daySchedules, vehicleDbId]);

  const restrictionIssueByDriver = useMemo(() => {
    const map = new Map<string, ReturnType<typeof getDriverCountryRestrictionIssue>>();
    for (const driver of drivers) {
      map.set(
        driver.id,
        getDriverCountryRestrictionIssue(driver.id, assigned, countryRestrictions, selectedDate),
      );
    }
    return map;
  }, [assigned, countryRestrictions, drivers, selectedDate]);

  const selectedRestrictionIssue = driverId
    ? (restrictionIssueByDriver.get(driverId) ?? null)
    : null;

  // Prefill-logica: zodra het rooster een werkende chauffeur op dit voertuig
  // aanwijst en de user nog niets heeft gekozen, vul driverId en startTime in
  // via de parent-callbacks. We vuren per vehicle-kaart maar één keer per
  // (vehicle, datum)-combinatie om handmatige overrides niet te overschrijven.
  const prefilledKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!rosterHit) return;
    const key = `${vehicle.id}|${selectedDate}|${rosterHit.id}`;
    if (prefilledKeyRef.current === key) return;

    const driverIsEmpty = !driverId;
    // "07:00" is de hard-coded default uit Planning.tsx; behandel hem als leeg
    // zodat een rooster-starttijd hem mag overschrijven, maar niet als de user
    // een bewuste andere tijd heeft gekozen.
    const startIsDefault = !startTime || startTime === "07:00";

    let didPrefill = false;
    if (driverIsEmpty && rosterHit.driver_id) {
      onDriverChange(vehicle.id, rosterHit.driver_id);
      didPrefill = true;
    }
    if (startIsDefault && rosterHit.start_time) {
      // start_time uit DB kan "08:00" of "08:00:00" zijn, normaliseer naar HH:mm
      const t = rosterHit.start_time.slice(0, 5);
      onStartTimeChange(vehicle.id, t);
      didPrefill = true;
    }
    if (didPrefill) prefilledKeyRef.current = key;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rosterHit, selectedDate, vehicle.id]);

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
        "transition-all duration-200 flex flex-col card--luxe border-[hsl(var(--gold)/0.08)]",
        isOver && !rejected && "ring-2 ring-[hsl(var(--gold)/0.28)] bg-[hsl(var(--gold-soft)/0.08)] scale-[1.005] shadow-md",
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
                className="h-6 px-2 text-xs gap-1 rounded-lg text-[hsl(var(--gold-deep))] hover:bg-[hsl(var(--gold-soft)/0.18)] hover:text-[hsl(var(--gold-deep))]"
                onClick={(e) => { e.stopPropagation(); onOptimize(vehicle.id); }}
              >
                <RotateCw className="h-3 w-3" />Optimaliseer
              </Button>
            )}
            <Badge variant="secondary" className="text-xs">{vehicle.type}</Badge>
          </div>
        </div>
        {hasVehicleConflict && (
          <div
            role="alert"
            className="mt-1.5 flex items-center gap-1.5 rounded-md bg-amber-500/10 border border-amber-500/30 px-2 py-1 text-[11px] text-amber-700"
          >
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span>Dit voertuig heeft meerdere chauffeurs ingepland vandaag</span>
          </div>
        )}
        {selectedRestrictionIssue && (
          <div
            role="alert"
            className={cn(
              "mt-1.5 flex items-start gap-1.5 rounded-md border px-2 py-1 text-[11px]",
              selectedRestrictionIssue.type === "block"
                ? "bg-destructive/8 border-destructive/25 text-destructive"
                : "bg-amber-500/10 border-amber-500/30 text-amber-700",
            )}
          >
            <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
            <span>{formatDriverCountryRestrictionIssue(selectedRestrictionIssue)}</span>
          </div>
        )}
        <div className="flex items-center gap-2 mt-1.5">
          <p className="text-xs text-muted-foreground shrink-0">{vehicle.plate}</p>
          <Select value={driverId} onValueChange={(v) => onDriverChange(vehicle.id, v)}>
            <SelectTrigger className="h-6 text-xs px-2 w-[130px] bg-background">
              <User className="h-3 w-3 mr-1 text-muted-foreground" />
              <SelectValue placeholder="Chauffeur..." />
            </SelectTrigger>
            <SelectContent>
              {drivers.map((d) => {
                const issue = restrictionIssueByDriver.get(d.id);
                return (
                  <SelectItem
                    key={d.id}
                    value={d.id}
                    className="text-xs"
                    disabled={issue?.type === "block"}
                  >
                    {d.name}
                    {d.certifications && d.certifications.length > 0 && <span className="text-xs text-muted-foreground ml-1">({d.certifications.join(", ")})</span>}
                    {issue && (
                      <span className={cn("text-xs ml-1", issue.type === "block" ? "text-destructive" : "text-amber-600")}>
                        ({issue.type === "block" ? "blokkeert" : "let op"} {issue.countryCode})
                      </span>
                    )}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1 ml-auto">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <Input
              type="time"
              value={startTime}
              onChange={(e) => onStartTimeChange(vehicle.id, e.target.value)}
              className="h-6 w-[80px] text-xs px-1.5 text-center bg-background"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 px-4 pb-0 flex-1">
        <div className="space-y-1.5">
          <div>
            <div className="flex justify-between text-xs mb-0.5">
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
            <div className="flex justify-between text-xs mb-0.5">
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

        {/* Tabs: ROUTE / INGEPLAND */}
        {assigned.length > 0 && (
          <div className="inline-flex rounded-lg bg-muted/50 p-0.5 w-full">
            <button
              onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); setActiveTab("route"); }}
              className={cn(
                "flex-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-200 relative z-10 select-none",
                activeTab === "route"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              ROUTE
            </button>
            <button
              onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); setActiveTab("ingepland"); }}
              className={cn(
                "flex-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-200 relative z-10 select-none",
                activeTab === "ingepland"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              INGEPLAND ({assigned.length})
            </button>
          </div>
        )}

        {assigned.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-16 border-2 border-dashed border-border/40 rounded-xl bg-muted/20 px-3">
            <p className="text-xs text-muted-foreground/50 italic flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5" />Sleep orders hierheen
            </p>
            <p className="text-xs text-muted-foreground/35 mt-0.5 text-center leading-snug">{emptyReason}</p>
          </div>
        ) : activeTab === "route" ? (
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
                  waitMinutes={etas[idx]?.waitMinutes}
                />
              ))}
            </div>
          </SortableContext>
        ) : (
          /* INGEPLAND tab: summary list of assigned orders */
          <div className="space-y-1.5">
            {assigned.map((o, idx) => {
              const wKg = o.is_weight_per_unit
                ? (o.weight_kg ?? 0) * (o.quantity ?? 1)
                : (o.weight_kg ?? 0);
              return (
                <div
                  key={o.id}
                  className="rounded-lg border border-border/30 bg-muted/20 px-3 py-2 text-xs space-y-1"
                  onMouseEnter={() => onHoverOrder(o.id)}
                  onMouseLeave={() => onHoverOrder(null)}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground truncate">
                      {o.client_name || `Order #${o.order_number}`}
                    </span>
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5 shrink-0">
                      Stop {idx + 1}
                    </Badge>
                  </div>
                  <div className="flex items-start gap-1 text-muted-foreground">
                    <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                    <span className="truncate">{o.delivery_address || "Geen adres"}</span>
                  </div>
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Weight className="h-3 w-3" />
                      {wKg} kg
                    </span>
                    <span className="flex items-center gap-1">
                      <Package className="h-3 w-3" />
                      {o.quantity ?? 0} stuks
                    </span>
                    {(o.time_window_start || o.time_window_end) && (
                      <span className={cn(
                        "flex items-center gap-0.5 text-[10px] font-medium rounded px-1 py-0.5",
                        etas[idx]?.lateMinutes > 0
                          ? "bg-destructive/10 text-destructive border border-destructive/20"
                          : "bg-blue-500/10 text-blue-700 border border-blue-200/60",
                      )}>
                        <Clock className="h-2.5 w-2.5" />
                        {o.time_window_start || "..."}-{o.time_window_end || "..."}
                      </span>
                    )}
                    {o.requirements && o.requirements.length > 0 && (
                      <span className="text-amber-600 font-medium">{o.requirements.join(", ")}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {assigned.length > 0 && (
        <div className="mt-auto px-4 pb-3 pt-2 space-y-1.5">
          <div className="flex items-center justify-between gap-2 rounded-xl bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-1 cursor-help">
                  <Timer className="h-3 w-3" />
                  <span className="font-medium text-foreground">{formatDuration(stats.totalMinutes)}</span>
                </span>
              </TooltipTrigger>
              <TooltipContent className="text-xs max-w-[200px]">Totale rijtijd inclusief {assigned.length}× {UNLOAD_MINUTES} min lostijd</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-1 tabular-nums cursor-help">
                  <Route className="h-3 w-3" />
                  {stats.totalKm} km
                  <span className="text-xs opacity-50">(+{stats.returnKm})</span>
                </span>
              </TooltipTrigger>
              <TooltipContent className="text-xs max-w-[200px]">Route: {stats.totalKm - stats.returnKm} km heen + {stats.returnKm} km retour naar depot</TooltipContent>
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
              <TooltipContent className="text-xs max-w-[220px]">
                Capaciteitsbenutting: {Math.round(pctKg)}% gewicht ({totalKg}/{vehicle.capacityKg} kg) · {Math.round(pctPallets)}% pallets ({totalPallets}/{vehicle.capacityPallets})
              </TooltipContent>
            </Tooltip>
          </div>
          {stats.exceedsDriveLimit && (
            <div className="flex items-center gap-1.5 rounded-xl bg-destructive/8 border border-destructive/15 px-3 py-2 text-xs text-destructive font-medium">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>Rijtijdenwet: {formatDuration(stats.totalMinutes)} overschrijdt 9 uur!</span>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
