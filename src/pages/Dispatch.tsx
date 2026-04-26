import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Loader2,
  MapPin,
  MoreHorizontal,
  Search,
  Send,
  Truck,
  User,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { LoadingState } from "@/components/ui/LoadingState";
import { QueryError } from "@/components/QueryError";
import { LuxeDatePicker } from "@/components/LuxeDatePicker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useDispatchTrip, useTrips, useTripsRealtime, useUpdateTripStatus } from "@/hooks/useTrips";
import { useDrivers } from "@/hooks/useDrivers";
import { useVehicles } from "@/hooks/useVehicles";
import {
  STOP_STATUS_LABELS,
  TRIP_STATUS_LABELS,
  TRIP_TRANSITIONS,
  type Trip,
  type TripStatus,
  type TripStop,
} from "@/types/dispatch";

function formatTime(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" });
}

function getTodayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function getTimeBucket(iso: string | null): "Vroege shift" | "Middag" | "Avond" | "Ongepland" {
  if (!iso) return "Ongepland";
  const hour = new Date(iso).getHours();
  if (hour < 12) return "Vroege shift";
  if (hour < 17) return "Middag";
  return "Avond";
}

function getStopCounts(trip: Trip): { total: number; done: number; failed: number } {
  const stops = (trip as any).trip_stops || [];
  return {
    total: stops.length,
    done: stops.filter((s: TripStop) => s.stop_status === "AFGELEVERD").length,
    failed: stops.filter((s: TripStop) => s.stop_status === "MISLUKT" || s.stop_status === "OVERGESLAGEN").length,
  };
}

const FILTER_TABS = [
  { key: "alle", label: "Alle", statuses: [] as string[] },
  { key: "concept", label: "Concept", statuses: ["CONCEPT", "VERZENDKLAAR"] },
  { key: "verzonden", label: "Verzonden", statuses: ["VERZONDEN", "ONTVANGEN", "GEACCEPTEERD"] },
  { key: "actief", label: "Actief", statuses: ["ACTIEF"] },
  { key: "voltooid", label: "Voltooid", statuses: ["VOLTOOID"] },
  { key: "probleem", label: "Probleem", statuses: ["GEWEIGERD", "AFGEBROKEN"] },
] as const;

const TIMELINE_SEGMENTS = ["06:00", "09:00", "12:00", "15:00", "18:00", "21:00"] as const;

const detailCardClass = "rounded-[1.5rem] border border-[hsl(var(--gold)/0.14)] bg-[linear-gradient(180deg,hsl(var(--gold-soft)/0.12),hsl(var(--background))_30%)] shadow-[0_24px_60px_-40px_hsl(var(--gold-deep)/0.28)]";

const Dispatch = () => {
  const [selectedDate, setSelectedDate] = useState(getTodayISO());
  const [statusFilter, setStatusFilter] = useState<string>("alle");
  const [search, setSearch] = useState("");
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [selectedTrips, setSelectedTrips] = useState<Set<string>>(new Set());
  const [bulkDispatchOpen, setBulkDispatchOpen] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; errors: string[] } | null>(null);
  const [confirmDispatch, setConfirmDispatch] = useState<{ tripId: string; tripNumber: number } | null>(null);
  const [confirmStatus, setConfirmStatus] = useState<{ tripId: string; tripNumber: number; newStatus: TripStatus } | null>(null);

  const { data: trips = [], isLoading, isError, refetch } = useTrips(selectedDate);
  useTripsRealtime();
  const { data: drivers = [] } = useDrivers();
  const { data: vehicles = [] } = useVehicles();
  const updateStatus = useUpdateTripStatus();
  const dispatchTrip = useDispatchTrip();

  const driverMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of drivers) map.set(d.id, d.name);
    return map;
  }, [drivers]);

  const vehicleMap = useMemo(() => {
    const map = new Map<string, { name: string; plate: string }>();
    for (const v of vehicles) {
      map.set(v.code, { name: v.name, plate: v.plate });
    }
    return map;
  }, [vehicles]);

  const activeTab = FILTER_TABS.find((t) => t.key === statusFilter);
  const filtered = useMemo(() => {
    return trips.filter((trip) => {
      const matchesStatus =
        statusFilter === "alle" ||
        (activeTab && activeTab.statuses.length > 0 && activeTab.statuses.includes(trip.dispatch_status));
      if (!matchesStatus) return false;
      if (!search) return true;

      const q = search.toLowerCase();
      const stops = ((trip as any).trip_stops || []) as TripStop[];
      return (
        String(trip.trip_number).includes(q) ||
        stops.some((stop) =>
          stop.planned_address?.toLowerCase().includes(q) ||
          stop.contact_name?.toLowerCase().includes(q)
        )
      );
    });
  }, [trips, statusFilter, activeTab, search]);

  const queueTrips = useMemo(
    () => filtered.filter((trip) => trip.dispatch_status === "CONCEPT" || trip.dispatch_status === "VERZENDKLAAR"),
    [filtered],
  );

  const boardTrips = useMemo(
    () => filtered.filter((trip) => !["CONCEPT", "VERZENDKLAAR"].includes(trip.dispatch_status)),
    [filtered],
  );

  const allQueueSelected = queueTrips.length > 0 && queueTrips.every((trip) => selectedTrips.has(trip.id));
  const selectedTrip =
    filtered.find((trip) => trip.id === selectedTripId) ??
    queueTrips[0] ??
    boardTrips[0] ??
    filtered[0] ??
    null;

  const boardLanes = useMemo(() => {
    const lanes = new Map<string, { id: string; title: string; subtitle: string; trips: Trip[] }>();

    for (const trip of boardTrips) {
      const bucket = getTimeBucket(trip.planned_start_time);
      const vehicle = trip.vehicle_id ? vehicleMap.get(trip.vehicle_id) : null;
      const laneId = trip.vehicle_id ? `vehicle:${trip.vehicle_id}` : `bucket:${bucket}`;
      const laneTitle = vehicle?.name || bucket;
      const laneSubtitle = vehicle
        ? `${vehicle.plate}${trip.driver_id ? ` • ${driverMap.get(trip.driver_id) || "chauffeur"}` : ""}`
        : "Nog zonder vast voertuig";

      if (!lanes.has(laneId)) {
        lanes.set(laneId, { id: laneId, title: laneTitle, subtitle: laneSubtitle, trips: [] });
      }

      lanes.get(laneId)!.trips.push(trip);
    }

    return Array.from(lanes.values())
      .map((lane) => ({
        ...lane,
        trips: [...lane.trips].sort((a, b) => {
          const aTime = a.planned_start_time ? new Date(a.planned_start_time).getTime() : Number.MAX_SAFE_INTEGER;
          const bTime = b.planned_start_time ? new Date(b.planned_start_time).getTime() : Number.MAX_SAFE_INTEGER;
          return aTime - bTime;
        }),
      }))
      .sort((a, b) => {
        const aTime = a.trips[0]?.planned_start_time ? new Date(a.trips[0].planned_start_time!).getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = b.trips[0]?.planned_start_time ? new Date(b.trips[0].planned_start_time!).getTime() : Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      });
  }, [boardTrips, driverMap, vehicleMap]);

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

  const toggleTripSelection = (tripId: string) => {
    setSelectedTrips((prev) => {
      const next = new Set(prev);
      if (next.has(tripId)) next.delete(tripId);
      else next.add(tripId);
      return next;
    });
  };

  const toggleAllQueue = () => {
    if (allQueueSelected) {
      setSelectedTrips(new Set());
      return;
    }
    setSelectedTrips(new Set(queueTrips.map((trip) => trip.id)));
  };

  const executeBulkDispatch = async () => {
    const ids = Array.from(selectedTrips);
    const total = ids.length;
    setBulkProgress({ done: 0, total, errors: [] });
    const errors: string[] = [];

    for (let i = 0; i < ids.length; i++) {
      try {
        await dispatchTrip.mutateAsync(ids[i]);
      } catch (e: any) {
        const trip = trips.find((item) => item.id === ids[i]);
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

  const handleStatusChange = (tripId: string, tripNumber: number, newStatus: TripStatus) => {
    setConfirmStatus({ tripId, tripNumber, newStatus });
  };

  const confirmStatusChange = async () => {
    if (!confirmStatus) return;
    try {
      await updateStatus.mutateAsync({ tripId: confirmStatus.tripId, status: confirmStatus.newStatus });
      toast.success(`Status bijgewerkt: ${TRIP_STATUS_LABELS[confirmStatus.newStatus].label}`);
    } catch (e: any) {
      toast.error(e.message || "Fout bij statuswijziging");
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
      toast.success("Rit verzonden, chauffeur ontvangt een notificatie");
    } catch (e: any) {
      toast.error(e.message || "Kan niet verzenden");
    } finally {
      setConfirmDispatch(null);
    }
  };

  const renderTripAction = (trip: Trip) => {
    const nextStatuses = TRIP_TRANSITIONS[trip.dispatch_status] || [];
    if (trip.dispatch_status === "CONCEPT" || trip.dispatch_status === "VERZENDKLAAR") {
      return (
        <Button
          size="sm"
          className="h-8 gap-1.5 rounded-xl bg-[hsl(var(--gold-deep))] px-3 text-white hover:bg-[hsl(var(--gold-deep))]/90"
          onClick={() => handleDispatch(trip.id, trip.trip_number)}
          disabled={dispatchTrip.isPending}
        >
          {dispatchTrip.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          {trip.dispatch_status === "CONCEPT" ? "Dispatch" : "Verzenden"}
        </Button>
      );
    }

    if (nextStatuses.length === 0) return null;

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 w-8 rounded-xl border-[hsl(var(--gold)/0.14)] p-0">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {nextStatuses.map((status) => (
            <DropdownMenuItem
              key={status}
              onClick={() => handleStatusChange(trip.id, trip.trip_number, status)}
            >
              {TRIP_STATUS_LABELS[status].label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const renderTripCard = (trip: Trip, compact = false) => {
    const counts = getStopCounts(trip);
    const statusInfo = TRIP_STATUS_LABELS[trip.dispatch_status];
    const vehicle = trip.vehicle_id ? vehicleMap.get(trip.vehicle_id) : null;
    const driverName = trip.driver_id ? driverMap.get(trip.driver_id) : null;
    const predicted = (trip as any).predicted_eta as string | null | undefined;
    const isSelected = selectedTrip?.id === trip.id;

    return (
      <button
        key={trip.id}
        type="button"
        onClick={() => setSelectedTripId(trip.id)}
        className={cn(
          "w-full rounded-[1.25rem] border p-4 text-left transition-all",
          isSelected
            ? "border-[hsl(var(--gold)/0.24)] bg-[linear-gradient(135deg,hsl(var(--gold-soft)/0.32),hsl(var(--background)))] shadow-[0_18px_40px_-28px_hsl(var(--gold-deep)/0.38)]"
            : "border-[hsl(var(--gold)/0.1)] bg-[hsl(var(--background))] hover:bg-[hsl(var(--gold-soft)/0.08)]",
        )}
      >
        <div className="flex items-start gap-3">
          {(trip.dispatch_status === "CONCEPT" || trip.dispatch_status === "VERZENDKLAAR") && (
            <div
              className="pt-0.5"
              onClick={(event) => event.stopPropagation()}
            >
              <Checkbox
                checked={selectedTrips.has(trip.id)}
                onCheckedChange={() => toggleTripSelection(trip.id)}
              />
            </div>
          )}

          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--gold)/0.14)] bg-[hsl(var(--gold-soft)/0.2)]">
            <Truck className="h-4 w-4 text-[hsl(var(--gold-deep))]" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
                  Rit #{trip.trip_number}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className={cn("border-0 text-[10px]", statusInfo.color)}>
                    {statusInfo.label}
                  </Badge>
                  {predicted && (
                    <Badge
                      variant="outline"
                      className="border-[hsl(var(--gold)/0.24)] bg-[hsl(var(--gold-soft)/0.32)] text-[10px] text-[hsl(var(--gold-deep))]"
                    >
                      ETA {formatTime(predicted)}
                    </Badge>
                  )}
                </div>
              </div>

              <div onClick={(event) => event.stopPropagation()}>
                {renderTripAction(trip)}
              </div>
            </div>

            <div className={cn("mt-3 grid gap-2 text-xs text-muted-foreground", compact ? "grid-cols-1" : "md:grid-cols-2")}>
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5" />
                <span>{formatTime(trip.planned_start_time)}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5" />
                <span>{counts.done}/{counts.total} stops</span>
                {counts.failed > 0 && <span className="text-red-600">({counts.failed} probleem)</span>}
              </div>
              <div className="flex items-center gap-2">
                <Truck className="h-3.5 w-3.5" />
                <span>{vehicle ? `${vehicle.name} (${vehicle.plate})` : "Nog geen voertuig"}</span>
              </div>
              <div className="flex items-center gap-2">
                <User className="h-3.5 w-3.5" />
                <span>{driverName || "Nog geen chauffeur"}</span>
              </div>
            </div>
          </div>
        </div>
      </button>
    );
  };

  if (isLoading) return <LoadingState message="Dispatch laden..." />;
  if (isError) return <QueryError message="Kan ritten niet laden. Probeer het opnieuw." onRetry={() => refetch()} />;

  const selectedStops = selectedTrip ? (((selectedTrip as any).trip_stops || []) as TripStop[]) : [];
  const selectedCounts = selectedTrip ? getStopCounts(selectedTrip) : null;
  const selectedVehicle = selectedTrip?.vehicle_id ? vehicleMap.get(selectedTrip.vehicle_id) : null;
  const selectedDriver = selectedTrip?.driver_id ? driverMap.get(selectedTrip.driver_id) : null;

  return (
    <div className="page-container space-y-5">
      <div className="relative pb-2 pt-2">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-6 -top-5 h-24 w-56"
          style={{ background: "radial-gradient(ellipse at top left, hsl(var(--gold-soft) / 0.55), transparent 72%)" }}
        />
        <div className="relative flex items-end justify-between gap-5 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center gap-2" style={{ fontFamily: "var(--font-display)" }}>
              <span aria-hidden className="inline-block h-[1px] w-6" style={{ background: "hsl(var(--gold) / 0.5)" }} />
              <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[hsl(var(--gold-deep))]">
                Operations
              </span>
              <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground/70 tabular-nums">
                {filtered.length} {filtered.length === 1 ? "rit" : "ritten"}
              </span>
            </div>
            <h1
              className="text-[2rem] font-semibold leading-[1.05] tracking-tight text-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Dispatch
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Plan, schuif en verzend ritten zonder tussenlagen.
            </p>
          </div>
        </div>
      </div>

      <div className={cn(detailCardClass, "p-4")}>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="flex items-center gap-2">
            <button className="btn-luxe" onClick={goToPrevDay} aria-label="Vorige dag">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <LuxeDatePicker value={selectedDate} onChange={setSelectedDate} className="min-w-[11rem]" />
            <button className="btn-luxe" onClick={goToNextDay} aria-label="Volgende dag">
              <ChevronRight className="h-4 w-4" />
            </button>
            <button className="btn-luxe btn-luxe--primary" onClick={() => setSelectedDate(getTodayISO())}>
              Vandaag
            </button>
          </div>

          <div className="relative flex-1 xl:max-w-md">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/40" />
            <input
              placeholder="Zoek op rit, adres of contact..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-11 w-full rounded-[1rem] border border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--gold-soft)/0.08)] pl-10 pr-4 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold)/0.14)]"
            />
          </div>

          <div className="flex flex-wrap rounded-[1rem] border border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--gold-soft)/0.08)] p-1 gap-1">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStatusFilter(tab.key)}
                className={cn(
                  "rounded-[0.8rem] px-3.5 py-2 text-xs font-medium transition-all whitespace-nowrap",
                  statusFilter === tab.key
                    ? "bg-[linear-gradient(90deg,hsl(var(--gold-soft)/0.7),hsl(var(--gold-soft)/0.3))] text-[hsl(var(--gold-deep))] shadow-[inset_0_0_0_1px_hsl(var(--gold)/0.12)]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {selectedTrips.size > 0 && (
            <Button
              className="h-11 gap-2 rounded-[1rem] bg-[hsl(var(--gold-deep))] px-4 text-white hover:bg-[hsl(var(--gold-deep))]/90"
              onClick={() => setBulkDispatchOpen(true)}
            >
              <Send className="h-4 w-4" />
              Verzend selectie ({selectedTrips.size})
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
        <section className={cn(detailCardClass, "p-4")}>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--gold-deep))]" style={{ fontFamily: "var(--font-display)" }}>
                Queue
              </p>
              <h2 className="mt-1 text-sm font-semibold text-foreground">Ongepland / te verzenden</h2>
            </div>
            <Badge variant="outline" className="border-[hsl(var(--gold)/0.14)] bg-[hsl(var(--gold-soft)/0.25)] text-[hsl(var(--gold-deep))]">
              {queueTrips.length}
            </Badge>
          </div>

          {queueTrips.length > 0 && (
            <div className="mb-3 flex items-center gap-2 rounded-[1rem] border border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--gold-soft)/0.08)] px-3 py-2">
              <Checkbox checked={allQueueSelected} onCheckedChange={toggleAllQueue} id="dispatch-select-all" />
              <label htmlFor="dispatch-select-all" className="cursor-pointer text-xs font-medium text-foreground">
                Selecteer alles ({queueTrips.length})
              </label>
            </div>
          )}

          <div className="space-y-3">
            {queueTrips.length === 0 ? (
              <div className="rounded-[1.2rem] border border-[hsl(var(--gold)/0.1)] bg-[hsl(var(--gold-soft)/0.08)] px-4 py-10 text-center">
                <p className="text-sm font-medium text-foreground">Geen ongeplande ritten</p>
                <p className="mt-1 text-xs text-muted-foreground">Alles lijkt al ingepland of onderweg.</p>
              </div>
            ) : (
              queueTrips.map((trip) => renderTripCard(trip, true))
            )}
          </div>
        </section>

        <section className={cn(detailCardClass, "p-4")}>
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--gold-deep))]" style={{ fontFamily: "var(--font-display)" }}>
                Planning
              </p>
              <h2 className="mt-1 text-sm font-semibold text-foreground">Dagregie</h2>
            </div>
            <p className="text-xs text-muted-foreground">{formatDate(selectedDate)}</p>
          </div>

          <div className="mb-4 rounded-[1rem] border border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--gold-soft)/0.08)] px-3 py-2.5">
            <div className="grid grid-cols-6 gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
              {TIMELINE_SEGMENTS.map((segment) => (
                <div key={segment} className="rounded-lg border border-transparent px-2 py-1 text-center">
                  {segment}
                </div>
              ))}
            </div>
          </div>

          {boardTrips.length === 0 ? (
            <div className="flex min-h-[420px] flex-col items-center justify-center rounded-[1.25rem] border border-[hsl(var(--gold)/0.1)] bg-[linear-gradient(180deg,hsl(var(--gold-soft)/0.08),hsl(var(--background)))] px-6 text-center">
              <Truck className="mb-3 h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm font-medium text-foreground">Nog geen ritten in uitvoering</p>
              <p className="mt-1 text-xs text-muted-foreground">Gebruik de queue links om ritten te selecteren en te verzenden.</p>
              <Link to="/planning" className="mt-3 text-xs text-primary hover:underline">
                Open planning
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {boardLanes.map((lane) => (
                <div
                  key={lane.id}
                  className="rounded-[1.25rem] border border-[hsl(var(--gold)/0.1)] bg-[linear-gradient(180deg,hsl(var(--background)),hsl(var(--gold-soft)/0.08))] p-3"
                >
                  <div className="mb-3 flex items-center justify-between gap-3 px-1">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">{lane.title}</h3>
                      <p className="text-xs text-muted-foreground">{lane.subtitle}</p>
                    </div>
                    <Badge
                      variant="outline"
                      className="border-[hsl(var(--gold)/0.14)] bg-[hsl(var(--gold-soft)/0.2)] text-[hsl(var(--gold-deep))]"
                    >
                      {lane.trips.length}
                    </Badge>
                  </div>

                  <div className="space-y-3">
                    {lane.trips.map((trip) => renderTripCard(trip))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={cn(detailCardClass, "p-4")}>
          <div className="mb-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--gold-deep))]" style={{ fontFamily: "var(--font-display)" }}>
              Ritdetails
            </p>
            <h2 className="mt-1 text-sm font-semibold text-foreground">
              {selectedTrip ? `Rit #${selectedTrip.trip_number}` : "Geen rit geselecteerd"}
            </h2>
          </div>

          {!selectedTrip ? (
            <div className="rounded-[1.2rem] border border-[hsl(var(--gold)/0.1)] bg-[hsl(var(--gold-soft)/0.08)] px-4 py-12 text-center">
              <p className="text-sm font-medium text-foreground">Selecteer een rit</p>
              <p className="mt-1 text-xs text-muted-foreground">Dan verschijnen stopdetails, context en acties hier.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-[1.1rem] border border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--gold-soft)/0.08)] p-3">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Status</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <Badge variant="outline" className={cn("border-0 text-[10px]", TRIP_STATUS_LABELS[selectedTrip.dispatch_status].color)}>
                      {TRIP_STATUS_LABELS[selectedTrip.dispatch_status].label}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{formatTime(selectedTrip.planned_start_time)}</span>
                  </div>
                </div>

                <div className="rounded-[1.1rem] border border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--gold-soft)/0.08)] p-3">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Capaciteit / voortgang</p>
                  <p className="mt-2 text-sm font-medium text-foreground">
                    {selectedCounts?.done}/{selectedCounts?.total} stops
                  </p>
                  {selectedCounts && selectedCounts.failed > 0 && (
                    <p className="mt-1 text-xs text-red-600">{selectedCounts.failed} probleemstop(s)</p>
                  )}
                </div>
              </div>

              <div className="rounded-[1.1rem] border border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--background))] p-4">
                <div className="grid gap-3 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Truck className="h-4 w-4" />
                    <span>{selectedVehicle ? `${selectedVehicle.name} (${selectedVehicle.plate})` : "Nog geen voertuig"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <User className="h-4 w-4" />
                    <span>{selectedDriver || "Nog geen chauffeur toegewezen"}</span>
                  </div>
                  {selectedTrip.notes && (
                    <div className="rounded-[0.9rem] bg-[hsl(var(--gold-soft)/0.12)] px-3 py-2 text-xs text-muted-foreground">
                      {selectedTrip.notes}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-[1.1rem] border border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--background))] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-foreground">Stops</h3>
                  <span className="text-xs text-muted-foreground">{selectedStops.length}</span>
                </div>

                <div className="space-y-2">
                  {selectedStops
                    .sort((a, b) => a.stop_sequence - b.stop_sequence)
                    .map((stop) => {
                      const stopInfo = STOP_STATUS_LABELS[stop.stop_status];
                      const pod = (stop as any).proof_of_delivery?.[0];

                      return (
                        <div key={stop.id} className="rounded-[1rem] border border-[hsl(var(--gold)/0.08)] px-3 py-3">
                          <div className="flex items-start gap-3">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                              {stop.stop_sequence}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-foreground">{stop.planned_address || "Geen adres"}</p>
                                  {stop.contact_name && (
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {stop.contact_name}
                                      {stop.contact_phone ? ` • ${stop.contact_phone}` : ""}
                                    </p>
                                  )}
                                </div>
                                <Badge variant="outline" className={cn("border-0 text-[10px]", stopInfo.color)}>
                                  {stopInfo.label}
                                </Badge>
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <span>{stop.stop_type === "PICKUP" ? "Ophaal" : stop.stop_type === "INTERMEDIATE" ? "Tussenstop" : stop.stop_type === "DELIVERY" ? "Lever" : "Depot"}</span>
                                {stop.planned_time && <span>• {formatTime(stop.planned_time)}</span>}
                                {pod && <span className="text-green-600">• POD aanwezig</span>}
                              </div>
                            </div>
                            {stop.order_id && (
                              <Link to={`/orders/${stop.order_id}`}>
                                <Button variant="ghost" size="sm" className="h-8 w-8 rounded-xl p-0">
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                              </Link>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {selectedTrip.dispatch_status !== "CONCEPT" && selectedTrip.dispatch_status !== "VERZENDKLAAR" ? (
                  <div className="flex flex-wrap gap-2">
                    {(TRIP_TRANSITIONS[selectedTrip.dispatch_status] || []).map((status) => (
                      <Button
                        key={status}
                        variant="outline"
                        className="rounded-[1rem] border-[hsl(var(--gold)/0.14)]"
                        onClick={() => handleStatusChange(selectedTrip.id, selectedTrip.trip_number, status)}
                      >
                        {TRIP_STATUS_LABELS[status].label}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <Button
                    className="rounded-[1rem] bg-[hsl(var(--gold-deep))] text-white hover:bg-[hsl(var(--gold-deep))]/90"
                    onClick={() => handleDispatch(selectedTrip.id, selectedTrip.trip_number)}
                  >
                    <Send className="mr-1.5 h-4 w-4" />
                    {selectedTrip.dispatch_status === "CONCEPT" ? "Dispatch rit" : "Verzend rit"}
                  </Button>
                )}

                <Link to="/planning">
                  <Button variant="outline" className="rounded-[1rem] border-[hsl(var(--gold)/0.14)]">
                    Planning openen
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </section>
      </div>

      <Dialog open={!!confirmDispatch} onOpenChange={(open) => !open && setConfirmDispatch(null)}>
        <DialogContent className="border-[hsl(var(--gold)/0.14)]">
          <DialogHeader>
            <DialogTitle>Rit dispatchen</DialogTitle>
            <DialogDescription>
              Weet je zeker dat je rit #{confirmDispatch?.tripNumber} wilt verzenden naar de chauffeur?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDispatch(null)}>Annuleren</Button>
            <Button
              className="bg-[hsl(var(--gold-deep))] text-white hover:bg-[hsl(var(--gold-deep))]/90"
              onClick={confirmDispatchAction}
              disabled={dispatchTrip.isPending}
            >
              {dispatchTrip.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
              Verzenden
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmStatus} onOpenChange={(open) => !open && setConfirmStatus(null)}>
        <DialogContent className="border-[hsl(var(--gold)/0.14)]">
          <DialogHeader>
            <DialogTitle>Status wijzigen</DialogTitle>
            <DialogDescription>
              Weet je zeker dat je rit #{confirmStatus?.tripNumber} wilt wijzigen naar
              {" "}"{confirmStatus ? TRIP_STATUS_LABELS[confirmStatus.newStatus].label : ""}"?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmStatus(null)}>Annuleren</Button>
            <Button
              className="bg-[hsl(var(--gold-deep))] text-white hover:bg-[hsl(var(--gold-deep))]/90"
              onClick={confirmStatusChange}
              disabled={updateStatus.isPending}
            >
              {updateStatus.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Bevestigen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkDispatchOpen} onOpenChange={(open) => { if (!open && !bulkProgress) setBulkDispatchOpen(false); }}>
        <DialogContent className="border-[hsl(var(--gold)/0.14)]">
          <DialogHeader>
            <DialogTitle>Ritten verzenden</DialogTitle>
            <DialogDescription>
              {bulkProgress ? (
                <span className="flex flex-col gap-2">
                  <span>Voortgang: {bulkProgress.done}/{bulkProgress.total} ritten verzonden</span>
                  <span className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-2 rounded-full bg-primary transition-all"
                      style={{ width: `${(bulkProgress.done / bulkProgress.total) * 100}%` }}
                    />
                  </span>
                  {bulkProgress.errors.length > 0 && (
                    <span className="text-xs text-red-600">
                      {bulkProgress.errors.map((error, index) => <span key={index} className="block">{error}</span>)}
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
                <Send className="mr-1.5 h-3.5 w-3.5" />
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
