import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Truck, Send, Play, CheckCircle2, XCircle, Clock, MapPin,
  Package, AlertTriangle, ChevronRight, Loader2, Search, Calendar,
  User, MoreHorizontal, Eye
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/PageHeader";
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
import {
  TRIP_STATUS_LABELS, STOP_STATUS_LABELS,
  type Trip, type TripStop, type TripStatus,
  canTransitionTrip, TRIP_TRANSITIONS
} from "@/types/dispatch";

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
  { key: "alle", label: "Alle" },
  { key: "CONCEPT", label: "Concept" },
  { key: "VERZONDEN", label: "Verzonden" },
  { key: "ACTIEF", label: "Actief" },
  { key: "VOLTOOID", label: "Voltooid" },
] as const;

// ─── Component ──────────────────────────────────────────────

const Dispatch = () => {
  const [selectedDate, setSelectedDate] = useState(getTodayISO());
  const [statusFilter, setStatusFilter] = useState<string>("alle");
  const [search, setSearch] = useState("");
  const [expandedTrip, setExpandedTrip] = useState<string | null>(null);

  // Confirmation dialog state
  const [confirmDispatch, setConfirmDispatch] = useState<{ tripId: string; tripNumber: number } | null>(null);
  const [confirmStatus, setConfirmStatus] = useState<{ tripId: string; tripNumber: number; newStatus: TripStatus } | null>(null);

  const { data: trips = [], isLoading, isError, refetch } = useTrips(selectedDate);
  useTripsRealtime();
  const { data: drivers = [] } = useDrivers();
  const updateStatus = useUpdateTripStatus();
  const dispatchTrip = useDispatchTrip();

  // Build a lookup map for driver names
  const driverMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of drivers) {
      map.set(d.id, d.name);
    }
    return map;
  }, [drivers]);

  // Filter & search
  const filtered = useMemo(() => {
    return trips.filter((t) => {
      const matchesStatus = statusFilter === "alle" || t.dispatch_status === statusFilter;
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
  }, [trips, statusFilter, search]);

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

  if (isLoading) {
    return <LoadingState message="Ritten laden..." />;
  }

  if (isError) {
    return <QueryError message="Kan ritten niet laden. Probeer het opnieuw." onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <PageHeader
        title="Dispatch"
        subtitle="Ritten beheren en dispatchen naar chauffeurs"
        actions={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-card border border-border/50 rounded-xl px-3 h-10">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-sm font-medium border-none outline-none"
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => setSelectedDate(getTodayISO())}>
              Vandaag
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Concept", value: stats.concept, icon: Clock, color: "text-gray-600", bg: "bg-gray-500/8" },
          { label: "Verzonden", value: stats.dispatched, icon: Send, color: "text-amber-600", bg: "bg-amber-500/8" },
          { label: "Actief", value: stats.active, icon: Play, color: "text-green-600", bg: "bg-green-500/8" },
          { label: "Voltooid", value: stats.done, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-500/8" },
          { label: "Problemen", value: stats.aborted, icon: AlertTriangle, color: "text-red-600", bg: "bg-red-500/8" },
        ].map((stat) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card rounded-xl border border-border/40 p-3 flex items-center gap-3"
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
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
          <input
            placeholder="Zoek op ritnummer, adres of contactpersoon..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-10 pr-4 rounded-xl border border-border/50 bg-card text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring/20"
          />
        </div>
        <div className="flex rounded-xl border border-border/50 bg-card p-1 gap-0.5">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={cn(
                "px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap",
                statusFilter === tab.key
                  ? "bg-foreground text-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

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
              <p className="text-xs text-muted-foreground/60 mt-1">
                Maak ritten aan via Planning
              </p>
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
                  <Card className="overflow-hidden">
                    {/* Trip header row */}
                    <div
                      className="flex items-center gap-4 px-5 py-3.5 cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => setExpandedTrip(isExpanded ? null : trip.id)}
                    >
                      {/* Trip number + status */}
                      <div className="flex items-center gap-3 min-w-[180px]">
                        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Truck className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold font-display">Rit #{trip.trip_number}</p>
                          <Badge variant="outline" className={cn("text-[10px] mt-0.5", statusInfo.color)}>
                            {statusInfo.label}
                          </Badge>
                        </div>
                      </div>

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
                      </div>

                      {/* Spacer */}
                      <div className="flex-1" />

                      {/* Actions */}
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        {trip.dispatch_status === "CONCEPT" && (
                          <Button
                            size="sm"
                            className="gap-1.5 h-8"
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
                            className="gap-1.5 h-8"
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
                        <div className="px-5 py-2 bg-muted/20">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
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
                                    {stop.stop_type === "PICKUP" ? "Ophaal" : stop.stop_type === "DELIVERY" ? "Lever" : "Depot"}
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
                          <div className="px-5 py-2 bg-muted/10 border-t border-border/20">
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

      {/* Dispatch confirmation dialog */}
      <Dialog open={!!confirmDispatch} onOpenChange={(open) => !open && setConfirmDispatch(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rit dispatchen</DialogTitle>
            <DialogDescription>
              Weet je zeker dat je Rit #{confirmDispatch?.tripNumber} wilt verzenden naar de chauffeur?
              De chauffeur ontvangt hiervan een notificatie.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDispatch(null)}>Annuleren</Button>
            <Button onClick={confirmDispatchAction} disabled={dispatchTrip.isPending}>
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
        <DialogContent>
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
            <Button onClick={confirmStatusChange} disabled={updateStatus.isPending}>
              {updateStatus.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
              Bevestigen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dispatch;
