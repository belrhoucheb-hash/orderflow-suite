import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Truck, Send, Play, CheckCircle2, XCircle, Clock, MapPin,
  Package, AlertTriangle, ChevronRight, ChevronLeft, Loader2, Search, Calendar,
  User, MoreHorizontal, Eye
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { LoadingState } from "@/components/ui/LoadingState";
import { QueryError } from "@/components/QueryError";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useTrips, useUpdateTripStatus, useDispatchTrip, useTripsRealtime } from "@/hooks/useTrips";
import { useDrivers } from "@/hooks/useDrivers";
import { useVehicles } from "@/hooks/useVehicles";
import {
  TRIP_STATUS_LABELS, STOP_STATUS_LABELS,
  type Trip, type TripStop, type TripStatus,
  canTransitionTrip, TRIP_TRANSITIONS
} from "@/types/dispatch";
import LiveTracking from "@/pages/LiveTracking";
import Exceptions from "@/pages/Exceptions";

// ─── Helpers ────────────────────────────────────────────────

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" });
}

function getTodayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function getStopCounts(trip: Trip): { total: number; done: number; failed: number } {
  const stops = (trip as any).trip_stops || [];
  return {
    total: stops.length,
    done: stops.filter((s: TripStop) => s.stop_status === "AFGELEVERD").length,
    failed: stops.filter((s: TripStop) => s.stop_status === "MISLUKT" || s.stop_status === "OVERGESLAGEN").length,
  };
}

// ─── Status filter tabs ────────────────────────────────────

const FILTER_TABS = [
  { key: "alle", label: "Alle", statuses: [] as string[] },
  { key: "concept", label: "Concept", statuses: ["CONCEPT", "VERZENDKLAAR"] },
  { key: "verzonden", label: "Verzonden", statuses: ["VERZONDEN", "ONTVANGEN", "GEACCEPTEERD"] },
  { key: "ACTIEF", label: "Actief", statuses: ["ACTIEF"] },
  { key: "VOLTOOID", label: "Voltooid", statuses: ["VOLTOOID"] },
  { key: "probleem", label: "Probleem", statuses: ["GEWEIGERD", "AFGEBROKEN"] },
] as const;

// ─── Component ──────────────────────────────────────────────

const Dispatch = () => {
  const [section, setSection] = useState<"dispatch" | "live" | "exceptions">("dispatch");
  const [selectedDate, setSelectedDate] = useState(getTodayISO());
  const [statusFilter, setStatusFilter] = useState<string>("alle");
  const [search, setSearch] = useState("");
  const [expandedTrip, setExpandedTrip] = useState<string | null>(null);

  // Bulk dispatch state
  const [selectedTrips, setSelectedTrips] = useState<Set<string>>(new Set());
  const [bulkDispatchOpen, setBulkDispatchOpen] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; errors: string[] } | null>(null);

  // Confirmation dialog state
  const [confirmDispatch, setConfirmDispatch] = useState<{ tripId: string; tripNumber: number } | null>(null);
  const [confirmStatus, setConfirmStatus] = useState<{ tripId: string; tripNumber: number; newStatus: TripStatus } | null>(null);

  const { data: trips = [], isLoading, isError, refetch } = useTrips(selectedDate);
  useTripsRealtime();
  const { data: drivers = [] } = useDrivers();
  const { data: vehicles = [] } = useVehicles();
  const updateStatus = useUpdateTripStatus();
  const dispatchTrip = useDispatchTrip();

  // Date navigation
  const goToPrevDay = () => {
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toISOString().split("T")[0]);
  };
  const goToNextDay = () => {
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() + 1);
    setSelectedDate(d.toISOString().split("T")[0]);
  };

  // Build a lookup map for driver names
  const driverMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of drivers) {
      map.set(d.id, d.name);
    }
    return map;
  }, [drivers]);

  // Build a lookup map for vehicle info by code
  const vehicleMap = useMemo(() => {
    const map = new Map<string, { name: string; plate: string }>();
    for (const v of vehicles) {
      map.set(v.code, { name: v.name, plate: v.plate });
    }
    return map;
  }, [vehicles]);

  // Filter & search
  const activeTab = FILTER_TABS.find((t) => t.key === statusFilter);
  const filtered = useMemo(() => {
    return trips.filter((t) => {
      const matchesStatus =
        statusFilter === "alle" ||
        (activeTab && activeTab.statuses.length > 0 && activeTab.statuses.includes(t.dispatch_status));
      if (!matchesStatus) return false;
      if (!search) return true;
      const s = search.toLowerCase();
      const stops = (t as any).trip_stops || [];
      return (
        String(t.trip_number).includes(s) ||
        stops.some((stop: TripStop) =>
          stop.planned_address?.toLowerCase().includes(s) ||
          stop.contact_name?.toLowerCase().includes(s)
        )
      );
    });
  }, [trips, statusFilter, activeTab, search]);

  // Concept trips visible in current filtered list (for bulk select)
  const conceptTripsInView = useMemo(
    () => filtered.filter((t) => t.dispatch_status === "CONCEPT" || t.dispatch_status === "VERZENDKLAAR"),
    [filtered],
  );
  const allConceptsSelected = conceptTripsInView.length > 0 && conceptTripsInView.every((t) => selectedTrips.has(t.id));

  const toggleTripSelection = (tripId: string) => {
    setSelectedTrips((prev) => {
      const next = new Set(prev);
      if (next.has(tripId)) next.delete(tripId);
      else next.add(tripId);
      return next;
    });
  };

  const toggleAllConcepts = () => {
    if (allConceptsSelected) {
      setSelectedTrips(new Set());
    } else {
      setSelectedTrips(new Set(conceptTripsInView.map((t) => t.id)));
    }
  };

  // Bulk dispatch action
  const executeBulkDispatch = async () => {
    const ids = Array.from(selectedTrips);
    const total = ids.length;
    setBulkProgress({ done: 0, total, errors: [] });
    const errors: string[] = [];
    for (let i = 0; i < ids.length; i++) {
      try {
        await dispatchTrip.mutateAsync(ids[i]);
      } catch (e: any) {
        const trip = trips.find((t) => t.id === ids[i]);
        errors.push(`Rit #${trip?.trip_number ?? "?"}: ${e.message || "Fout"}`);
      }
      setBulkProgress({ done: i + 1, total, errors: [...errors] });
    }
    if (errors.length === 0) {
      toast.success(`${total} ritten verzonden`);
    } else {
      toast.warning(`${total - errors.length}/${total} ritten verzonden, ${errors.length} mislukt`);
    }
    setSelectedTrips(new Set());
    setBulkDispatchOpen(false);
    setBulkProgress(null);
  };

  // Stats
  const stats = useMemo(() => ({
    concept: trips.filter(t => t.dispatch_status === "CONCEPT" || t.dispatch_status === "VERZENDKLAAR").length,
    dispatched: trips.filter(t => ["VERZONDEN", "ONTVANGEN", "GEACCEPTEERD"].includes(t.dispatch_status)).length,
    active: trips.filter(t => t.dispatch_status === "ACTIEF").length,
    done: trips.filter(t => t.dispatch_status === "VOLTOOID").length,
    aborted: trips.filter(t => t.dispatch_status === "AFGEBROKEN" || t.dispatch_status === "GEWEIGERD").length,
  }), [trips]);

  // Actions — go through confirmation dialogs
  const handleStatusChange = (tripId: string, tripNumber: number, newStatus: TripStatus) => {
    setConfirmStatus({ tripId, tripNumber, newStatus });
  };

  const confirmStatusChange = async () => {
    if (!confirmStatus) return;
    try {
      await updateStatus.mutateAsync({ tripId: confirmStatus.tripId, status: confirmStatus.newStatus });
      toast.success(`Status bijgewerkt — Rit is nu ${TRIP_STATUS_LABELS[confirmStatus.newStatus].label}`);
    } catch (e: any) {
      toast.error(e.message || "Fout bij status wijziging");
    } finally {
      setConfirmStatus(null);
    }
  };

  const handleDispatch = (tripId: string, tripNumber: number) => {
    setConfirmDispatch({ tripId, tripNumber });
  };

  const confirmDispatchAction = async () => {
    if (!confirmDispatch) return;
    try {
      await dispatchTrip.mutateAsync(confirmDispatch.tripId);
      toast.success("Rit verzonden — De chauffeur ontvangt een notificatie");
    } catch (e: any) {
      toast.error(e.message || "Kan niet verzenden");
    } finally {
      setConfirmDispatch(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="relative pb-3 pt-2">
        <div
          aria-hidden
          className="absolute -top-6 -left-8 w-64 h-32 pointer-events-none"
          style={{ background: "radial-gradient(ellipse at top left, hsl(var(--gold-soft) / 0.6), transparent 70%)" }}
        />
        <div className="relative flex items-end justify-between gap-5 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2" style={{ fontFamily: "var(--font-display)" }}>
              <span aria-hidden className="inline-block h-[1px] w-6" style={{ background: "hsl(var(--gold) / 0.5)" }} />
              <span className="text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--gold-deep))] font-semibold">
                Operations
              </span>
              <span aria-hidden className="inline-block h-[3px] w-[3px] rounded-full" style={{ background: "hsl(var(--gold) / 0.5)" }} />
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70 tabular-nums font-medium">
                {section === "dispatch"
                  ? `${trips.length} ${trips.length === 1 ? "rit" : "ritten"}`
                  : section === "live"
                    ? "Live overzicht"
                    : "Actieve interventies"}
              </span>
            </div>
            <h1
              className="text-[2.25rem] leading-[1.05] font-semibold tracking-tight text-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Dispatch
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {section === "dispatch"
                ? "Ritten beheren en dispatchen naar chauffeurs"
                : section === "live"
                  ? "Live-posities en voortgang per rit"
                  : "Afwijkingen en interventies"}
            </p>
          </div>
          {section === "dispatch" && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                className="btn-luxe"
                onClick={goToPrevDay}
                aria-label="Vorige dag"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="btn-luxe gap-2 pr-3">
                <Calendar className="h-4 w-4" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-transparent text-sm font-medium text-foreground border-none outline-none"
                />
              </div>
              <button
                className="btn-luxe"
                onClick={goToNextDay}
                aria-label="Volgende dag"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                className="btn-luxe btn-luxe--primary"
                onClick={() => setSelectedDate(getTodayISO())}
              >
                Vandaag
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="inline-flex items-center gap-0.5 p-0.5 rounded-full border border-[hsl(var(--gold)/0.2)] bg-[hsl(var(--card))]">
        {[
          { value: "dispatch" as const, label: "Dispatch" },
          { value: "live" as const, label: "Live-kaart" },
          { value: "exceptions" as const, label: "Exceptions" },
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

      {section === "live" && <LiveTracking />}
      {section === "exceptions" && <Exceptions />}

      {section === "dispatch" && (isLoading ? (
        <LoadingState message="Ritten laden..." />
      ) : isError ? (
        <QueryError message="Kan ritten niet laden. Probeer het opnieuw." onRetry={() => refetch()} />
      ) : (
        <>
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        {[
          { label: "Totaal", value: trips.length, icon: Truck, color: "text-blue-600", bg: "bg-blue-500/8" },
          { label: "Concept", value: stats.concept, icon: Clock, color: "text-gray-600", bg: "bg-gray-500/8" },
          { label: "Verzonden", value: stats.dispatched, icon: Send, color: "text-amber-600", bg: "bg-amber-500/8" },
          { label: "Actief", value: stats.active, icon: Play, color: "text-green-600", bg: "bg-green-500/8" },
          { label: "Voltooid", value: stats.done, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-500/8" },
          { label: "Probleem", value: stats.aborted, icon: AlertTriangle, color: "text-red-600", bg: "bg-red-500/8" },
        ].map((stat) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="card--luxe p-3.5 flex items-center gap-3"
          >
            <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center", stat.bg)}>
              <stat.icon className={cn("h-4 w-4", stat.color)} />
            </div>
            <div>
              <p className="text-xl font-semibold font-display tabular-nums">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Search & Filters */}
      <div className="card--luxe p-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
          <input
            placeholder="Zoek op ritnummer, adres of contactpersoon..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-10 pr-4 rounded-xl border border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--gold-soft)/0.08)] text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold)/0.14)]"
          />
        </div>
        <div className="flex flex-wrap rounded-xl border border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--gold-soft)/0.08)] p-1 gap-0.5">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={cn(
                "px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap",
                statusFilter === tab.key
                  ? "bg-[linear-gradient(90deg,hsl(var(--gold-soft)/0.7),hsl(var(--gold-soft)/0.3))] text-[hsl(var(--gold-deep))] shadow-[inset_0_0_0_1px_hsl(var(--gold)/0.12)]"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk select bar */}
      {conceptTripsInView.length > 0 && (
        <div className="card--luxe p-3.5 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={allConceptsSelected}
              onCheckedChange={toggleAllConcepts}
              id="select-all-concepts"
            />
            <label htmlFor="select-all-concepts" className="text-sm font-medium cursor-pointer">
              Selecteer alles ({conceptTripsInView.length})
            </label>
          </div>
          {selectedTrips.size > 0 && (
            <Button
              size="sm"
              className="gap-1.5 bg-[hsl(var(--gold-deep))] text-white hover:bg-[hsl(var(--gold-deep))]/90"
              onClick={() => setBulkDispatchOpen(true)}
            >
              <Send className="h-3.5 w-3.5" />
              Verzend geselecteerde ({selectedTrips.size})
            </Button>
          )}
        </div>
      )}

      {/* Trip list */}
      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {filtered.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-16 text-center"
            >
              <Truck className="h-10 w-10 text-muted-foreground/20 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">
                Geen ritten voor {formatDate(selectedDate)}
              </p>
              <Link to="/planning" className="text-xs text-primary hover:underline mt-1">
                Maak ritten aan via Planning
              </Link>
            </motion.div>
          ) : (
            filtered.map((trip) => {
              const stops = ((trip as any).trip_stops || []) as TripStop[];
              const statusInfo = TRIP_STATUS_LABELS[trip.dispatch_status];
              const counts = getStopCounts(trip);
              const isExpanded = expandedTrip === trip.id;
              const nextStatuses = TRIP_TRANSITIONS[trip.dispatch_status] || [];

              return (
                <motion.div
                  key={trip.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                >
                  <Card className="card--luxe overflow-hidden border-[hsl(var(--gold)/0.08)]">
                    {/* Trip header row */}
                    <div
                      className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-[hsl(var(--gold-soft)/0.08)] transition-colors"
                      onClick={() => setExpandedTrip(isExpanded ? null : trip.id)}
                    >
                      {/* Checkbox for concept trips */}
                      {(trip.dispatch_status === "CONCEPT" || trip.dispatch_status === "VERZENDKLAAR") && (
                        <div onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedTrips.has(trip.id)}
                            onCheckedChange={() => toggleTripSelection(trip.id)}
                          />
                        </div>
                      )}

                      {/* Trip number + status */}
                      <div className="flex items-center gap-3 min-w-[180px]">
                        <div className="h-10 w-10 rounded-xl flex items-center justify-center border border-[hsl(var(--gold)/0.16)] bg-[hsl(var(--gold-soft)/0.22)]">
                          <Truck className="h-4 w-4 text-[hsl(var(--gold-deep))]" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold font-display">Rit #{trip.trip_number}</p>
                          <Badge variant="outline" className={cn("text-[10px] mt-0.5", statusInfo.color)}>
                            {statusInfo.label}
                          </Badge>
                        </div>
                      </div>

                      {/* Vehicle */}
                      {trip.vehicle_id && vehicleMap.has(trip.vehicle_id) && (
                        <div className="flex items-center gap-1.5 text-sm min-w-[140px] hidden lg:flex">
                          <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-medium">{vehicleMap.get(trip.vehicle_id)!.name}</span>
                          <span className="text-muted-foreground text-xs">({vehicleMap.get(trip.vehicle_id)!.plate})</span>
                        </div>
                      )}

                      {/* Driver */}
                      <div className="flex items-center gap-1.5 text-sm min-w-[140px]">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                        {trip.driver_id ? (
                          <span className="font-medium">{driverMap.get(trip.driver_id) || "Chauffeur toegewezen"}</span>
                        ) : (
                          <span className="text-muted-foreground/60 italic">Geen chauffeur</span>
                        )}
                      </div>

                      {/* Stops progress */}
                      <div className="flex items-center gap-2 text-sm min-w-[120px]">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium">{counts.done}/{counts.total} stops</span>
                        {counts.failed > 0 && (
                          <span className="text-red-600 text-xs">({counts.failed} mislukt)</span>
                        )}
                      </div>

                      {/* Time */}
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground hidden md:flex">
                        <Clock className="h-3.5 w-3.5" />
                        <span>{formatTime(trip.planned_start_time)}</span>
                        {trip.actual_start_time && (
                          <span className="text-green-600">→ {formatTime(trip.actual_start_time)}</span>
                        )}
                        {(() => {
                          const predicted = (trip as any).predicted_eta as string | null | undefined;
                          if (!predicted || !trip.planned_start_time) return null;
                          const predictedMs = new Date(predicted).getTime();
                          const plannedMs = new Date(trip.planned_start_time).getTime();
                          if (Number.isNaN(predictedMs) || Number.isNaN(plannedMs)) return null;
                          const diffMin = Math.abs(predictedMs - plannedMs) / 60000;
                          if (diffMin < 5) return null;
                          return (
                            <Badge
                              variant="outline"
                              className="text-[10px] bg-[hsl(var(--gold-soft)/0.4)] text-[hsl(var(--gold-deep))] border-[hsl(var(--gold)/0.3)]"
                            >
                              ETA {formatTime(predicted)}
                            </Badge>
                          );
                        })()}
                      </div>

                      {/* Spacer */}
                      <div className="flex-1" />

                      {/* Actions */}
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        {trip.dispatch_status === "CONCEPT" && (
                          <Button
                            size="sm"
                            className="gap-1.5 h-8 bg-[hsl(var(--gold-deep))] text-white hover:bg-[hsl(var(--gold-deep))]/90"
                            onClick={() => handleDispatch(trip.id, trip.trip_number)}
                            disabled={dispatchTrip.isPending}
                          >
                            {dispatchTrip.isPending ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Send className="h-3.5 w-3.5" />
                            )}
                            Dispatch
                          </Button>
                        )}
                        {trip.dispatch_status === "VERZENDKLAAR" && (
                          <Button
                            size="sm"
                            className="gap-1.5 h-8 bg-[hsl(var(--gold-deep))] text-white hover:bg-[hsl(var(--gold-deep))]/90"
                            onClick={() => handleDispatch(trip.id, trip.trip_number)}
                            disabled={dispatchTrip.isPending}
                          >
                            <Send className="h-3.5 w-3.5" />
                            Verzenden
                          </Button>
                        )}

                        {nextStatuses.length > 0 && trip.dispatch_status !== "CONCEPT" && trip.dispatch_status !== "VERZENDKLAAR" && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {nextStatuses.map((ns) => (
                                <DropdownMenuItem
                                  key={ns}
                                  onClick={() => handleStatusChange(trip.id, trip.trip_number, ns)}
                                >
                                  {TRIP_STATUS_LABELS[ns].label}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}

                        <ChevronRight
                          className={cn(
                            "h-4 w-4 text-muted-foreground transition-transform",
                            isExpanded && "rotate-90"
                          )}
                        />
                      </div>
                    </div>

                    {/* Expanded stops */}
                    {isExpanded && stops.length > 0 && (
                      <div className="border-t border-border/30">
                        <div className="px-5 py-2.5 bg-[hsl(var(--gold-soft)/0.12)]">
                          <p className="text-xs font-semibold text-[hsl(var(--gold-deep))] uppercase tracking-wide">
                            Stops ({stops.length})
                          </p>
                        </div>
                        <div className="divide-y divide-border/20">
                          {stops
                            .sort((a: TripStop, b: TripStop) => a.stop_sequence - b.stop_sequence)
                            .map((stop: TripStop) => {
                              const stopInfo = STOP_STATUS_LABELS[stop.stop_status];
                              const pod = (stop as any).proof_of_delivery?.[0];
                              return (
                                <div key={stop.id} className="flex items-center gap-4 px-5 py-3 text-sm">
                                  {/* Sequence */}
                                  <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                                    {stop.stop_sequence}
                                  </div>

                                  {/* Type badge */}
                                  <Badge variant="outline" className="text-[10px] min-w-[60px] justify-center">
                                    {stop.stop_type === "PICKUP"
                                      ? "Ophaal"
                                      : stop.stop_type === "INTERMEDIATE"
                                        ? "Tussenstop"
                                        : stop.stop_type === "DELIVERY"
                                          ? "Lever"
                                          : "Depot"}
                                  </Badge>

                                  {/* Address */}
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium truncate">{stop.planned_address || "Geen adres"}</p>
                                    {stop.contact_name && (
                                      <p className="text-xs text-muted-foreground">{stop.contact_name} {stop.contact_phone ? `• ${stop.contact_phone}` : ""}</p>
                                    )}
                                  </div>

                                  {/* Times */}
                                  <div className="text-xs text-muted-foreground hidden sm:block min-w-[100px]">
                                    {stop.planned_time && <span>Gepland: {formatTime(stop.planned_time)}</span>}
                                    {stop.actual_arrival_time && (
                                      <span className="block text-green-600">Aankomst: {formatTime(stop.actual_arrival_time)}</span>
                                    )}
                                  </div>

                                  {/* POD indicator */}
                                  {pod && (
                                    <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">
                                      POD ✓
                                    </Badge>
                                  )}

                                  {/* Stop status */}
                                  <Badge variant="outline" className={cn("text-[10px]", stopInfo.color)}>
                                    {stopInfo.label}
                                  </Badge>

                                  {/* Link to order */}
                                  {stop.order_id && (
                                    <Link to={`/orders/${stop.order_id}`}>
                                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                        <Eye className="h-3.5 w-3.5" />
                                      </Button>
                                    </Link>
                                  )}
                                </div>
                              );
                            })}
                        </div>

                        {/* Trip notes */}
                        {trip.notes && (
                          <div className="px-5 py-2.5 bg-[hsl(var(--gold-soft)/0.08)] border-t border-border/20">
                            <p className="text-xs text-muted-foreground">{trip.notes}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>
        </>
      ))}

      {/* Dispatch confirmation dialog */}
      <Dialog open={!!confirmDispatch} onOpenChange={(open) => !open && setConfirmDispatch(null)}>
        <DialogContent className="border-[hsl(var(--gold)/0.14)]">
          <DialogHeader>
            <DialogTitle>Rit dispatchen</DialogTitle>
            <DialogDescription>
              Weet je zeker dat je Rit #{confirmDispatch?.tripNumber} wilt verzenden naar de chauffeur?
              De chauffeur ontvangt hiervan een notificatie.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDispatch(null)}>Annuleren</Button>
            <Button className="bg-[hsl(var(--gold-deep))] text-white hover:bg-[hsl(var(--gold-deep))]/90" onClick={confirmDispatchAction} disabled={dispatchTrip.isPending}>
              {dispatchTrip.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              ) : (
                <Send className="h-3.5 w-3.5 mr-1.5" />
              )}
              Verzenden
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Status change confirmation dialog */}
      <Dialog open={!!confirmStatus} onOpenChange={(open) => !open && setConfirmStatus(null)}>
        <DialogContent className="border-[hsl(var(--gold)/0.14)]">
          <DialogHeader>
            <DialogTitle>Status wijzigen</DialogTitle>
            <DialogDescription>
              Weet je zeker dat je de status van Rit #{confirmStatus?.tripNumber} wilt wijzigen
              naar "{confirmStatus ? TRIP_STATUS_LABELS[confirmStatus.newStatus].label : ""}"?
              Deze actie kan niet ongedaan worden gemaakt.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmStatus(null)}>Annuleren</Button>
            <Button className="bg-[hsl(var(--gold-deep))] text-white hover:bg-[hsl(var(--gold-deep))]/90" onClick={confirmStatusChange} disabled={updateStatus.isPending}>
              {updateStatus.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
              Bevestigen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk dispatch confirmation dialog */}
      <Dialog open={bulkDispatchOpen} onOpenChange={(open) => { if (!open && !bulkProgress) setBulkDispatchOpen(false); }}>
        <DialogContent className="border-[hsl(var(--gold)/0.14)]">
          <DialogHeader>
            <DialogTitle>Ritten verzenden</DialogTitle>
            <DialogDescription>
              {bulkProgress ? (
                <span className="flex flex-col gap-2">
                  <span>Voortgang: {bulkProgress.done}/{bulkProgress.total} ritten verzonden</span>
                  <span className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <span
                      className="bg-primary h-2 block rounded-full transition-all"
                      style={{ width: `${(bulkProgress.done / bulkProgress.total) * 100}%` }}
                    />
                  </span>
                  {bulkProgress.errors.length > 0 && (
                    <span className="text-red-600 text-xs">
                      {bulkProgress.errors.map((err, i) => <span key={i} className="block">{err}</span>)}
                    </span>
                  )}
                </span>
              ) : (
                `${selectedTrips.size} ritten verzenden naar chauffeurs?`
              )}
            </DialogDescription>
          </DialogHeader>
          {!bulkProgress && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setBulkDispatchOpen(false)}>Annuleren</Button>
              <Button className="bg-[hsl(var(--gold-deep))] text-white hover:bg-[hsl(var(--gold-deep))]/90" onClick={executeBulkDispatch}>
                <Send className="h-3.5 w-3.5 mr-1.5" />
                Verzenden
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dispatch;
