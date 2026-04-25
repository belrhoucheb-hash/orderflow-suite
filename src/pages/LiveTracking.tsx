import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import {
  Truck, Clock, AlertTriangle, CheckCircle2, MapPin, Search, Filter,
  Activity, Navigation,
} from "lucide-react";

// Fix Leaflet default marker icon paths (broken by Vite bundling)
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { QueryError } from "@/components/QueryError";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useDrivers } from "@/hooks/useDrivers";
import { useVehicles } from "@/hooks/useVehicles";
import {
  useActiveTrips,
  useVehiclePositions,
  useTripTrackingStatuses,
  useTrackingAlerts,
} from "@/hooks/useTracking";
import type { Trip, TripStop } from "@/types/dispatch";
import type { VehiclePosition, TripTrackingStatus } from "@/types/tracking";

// ─── Map marker helpers ────────────────────────────────────────

const STATUS_COLORS: Record<TripTrackingStatus["status"], string> = {
  on_time: "#22c55e",
  delayed: "#f59e0b",
  critical: "#ef4444",
};

function createVehicleIcon(color: string, heading: number) {
  return L.divIcon({
    className: "custom-marker",
    html: `<div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;">
      <div style="width:24px;height:24px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.35);position:relative;">
        <div style="position:absolute;top:-6px;left:50%;transform:translateX(-50%) rotate(${heading}deg);width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:8px solid ${color};filter:drop-shadow(0 1px 2px rgba(0,0,0,.3));"></div>
      </div>
    </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

function createStopIcon(status: "completed" | "current" | "upcoming", seq: number) {
  const colors = {
    completed: { bg: "#22c55e", border: "#16a34a" },
    current: { bg: "#3b82f6", border: "#2563eb" },
    upcoming: { bg: "#9ca3af", border: "#6b7280" },
  };
  const c = colors[status];
  return L.divIcon({
    className: "custom-marker",
    html: `<div style="width:20px;height:20px;border-radius:50%;background:${c.bg};border:2px solid ${c.border};box-shadow:0 1px 3px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;color:white;font-size:9px;font-weight:700;">${seq}</div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

// ─── Filter tabs ───────────────────────────────────────────────

type StatusFilter = "all" | "on_time" | "delayed";

const FILTER_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "Alles" },
  { key: "on_time", label: "Op tijd" },
  { key: "delayed", label: "Vertraagd" },
];

// ─── Component ─────────────────────────────────────────────────

const LiveTracking = () => {
  const { t } = useTranslation();
  const { data: trips = [], isLoading, isError, refetch } = useActiveTrips();
  const { data: drivers = [] } = useDrivers();
  const { data: vehicles = [] } = useVehicles();
  const { data: positions = [] } = useVehiclePositions(trips);
  const [previousPositions, setPreviousPositions] = useState<VehiclePosition[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  // Build driver map
  const driverMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of drivers) map.set(d.id, d.name);
    return map;
  }, [drivers]);

  // Build vehicle map
  const vehicleMap = useMemo(() => {
    const map = new Map<string, { name: string; plate: string }>();
    for (const v of vehicles) map.set(v.code, { name: v.name, plate: v.plate });
    return map;
  }, [vehicles]);

  const statuses = useTripTrackingStatuses(trips, driverMap);
  const alerts = useTrackingAlerts(statuses, positions, previousPositions);

  // Track previous positions for idle detection
  useEffect(() => {
    if (positions.length > 0) {
      setPreviousPositions(positions);
    }
  }, [positions]);

  // Filter trips
  const filteredStatuses = useMemo(() => {
    return statuses.filter((s) => {
      if (statusFilter === "on_time" && s.status !== "on_time") return false;
      if (statusFilter === "delayed" && s.status !== "delayed" && s.status !== "critical")
        return false;
      if (search) {
        const q = search.toLowerCase();
        const vInfo = vehicleMap.get(s.vehicleId);
        return (
          s.driverName.toLowerCase().includes(q) ||
          s.tripId.toLowerCase().includes(q) ||
          vInfo?.plate.toLowerCase().includes(q) ||
          vInfo?.name.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [statuses, statusFilter, search, vehicleMap]);

  // KPIs
  const kpis = useMemo(() => {
    const total = statuses.length;
    const onTime = statuses.filter((s) => s.status === "on_time").length;
    const delayed = statuses.filter(
      (s) => s.status === "delayed" || s.status === "critical",
    ).length;
    const onTimePct = total > 0 ? Math.round((onTime / total) * 100) : 0;
    return { total, onTime, onTimePct, delayed };
  }, [statuses]);

  // ─── Map ────────────────────────────────────────────────────

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const stopMarkersRef = useRef<L.Marker[]>([]);
  const polylinesRef = useRef<L.Polyline[]>([]);

  // Init map — use callback ref to guarantee the DOM node exists
  const mapCallbackRef = useCallback((node: HTMLDivElement | null) => {
    // Store the node in the regular ref for other effects
    (mapRef as React.MutableRefObject<HTMLDivElement | null>).current = node;

    // Tear down old map if node changed
    if (mapInstanceRef.current && !node) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
      return;
    }

    // Already initialized on this node
    if (!node || mapInstanceRef.current) return;

    const map = L.map(node, { center: [52.2, 5.3], zoom: 8 });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
    }).addTo(map);
    mapInstanceRef.current = map;
    // Ensure the map picks up its container size
    requestAnimationFrame(() => map.invalidateSize());
  }, []);

  // Update vehicle markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Remove old vehicle markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current.clear();

    for (const pos of positions) {
      const st = statuses.find((s) => s.tripId === pos.tripId);
      const color = st ? STATUS_COLORS[st.status] : "#9ca3af";
      const marker = L.marker([pos.lat, pos.lng], {
        icon: createVehicleIcon(color, pos.heading),
        zIndexOffset: selectedTripId === pos.tripId ? 1000 : 500,
      }).addTo(map);

      const vInfo = vehicleMap.get(pos.vehicleId);
      const dName = st?.driverName || "Onbekend";
      const tripForPos = trips.find((t) => t.id === pos.tripId);
      const predictedEtaIso = (tripForPos as any)?.predicted_eta as string | null | undefined;
      const predictedEtaFormatted = predictedEtaIso
        ? new Date(predictedEtaIso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })
        : null;
      const etaStr = predictedEtaFormatted || st?.eta || "--:--";
      const delayStr =
        st && st.delayMinutes > 0
          ? `<br/><span style="color:${STATUS_COLORS[st.status]};font-weight:600;">+${st.delayMinutes} min vertraging</span>`
          : "";

      marker.bindPopup(
        `<div style="font-size:12px;min-width:160px;">
          <b>${vInfo?.name || pos.vehicleId.slice(0, 8)}</b>
          ${vInfo ? `<br/><span style="color:#6b7280;">${vInfo.plate}</span>` : ""}
          <br/>Chauffeur: ${dName}
          <br/>Stop: ${st ? `${st.currentStopIndex}/${st.totalStops}` : "?"}
          <br/>ETA: ${etaStr}${delayStr}
          <br/><span style="color:#9ca3af;">${Math.round(pos.speed)} km/u</span>
        </div>`,
      );

      marker.on("click", () => {
        setSelectedTripId(pos.tripId);
      });

      markersRef.current.set(pos.tripId, marker);
    }

    // Fit bounds if we have positions and nothing is selected
    if (positions.length > 0 && !selectedTripId) {
      const bounds = positions.map(
        (p) => [p.lat, p.lng] as L.LatLngExpression,
      );
      map.fitBounds(L.latLngBounds(bounds), {
        padding: [50, 50],
        maxZoom: 11,
      });
    }
  }, [positions, statuses, vehicleMap, selectedTripId, trips]);

  // Update stop markers + route lines when a trip is selected
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clear old stop markers and route lines
    stopMarkersRef.current.forEach((m) => m.remove());
    stopMarkersRef.current = [];
    polylinesRef.current.forEach((p) => p.remove());
    polylinesRef.current = [];

    if (!selectedTripId) return;

    const trip = trips.find((t) => t.id === selectedTripId);
    if (!trip) return;

    const stops = (((trip as any).trip_stops || []) as TripStop[])
      .filter((s) => s.planned_latitude != null && s.planned_longitude != null)
      .sort((a, b) => a.stop_sequence - b.stop_sequence);

    if (stops.length === 0) return;

    const st = statuses.find((s) => s.tripId === selectedTripId);
    const currentIdx = st?.currentStopIndex ?? 0;

    // Draw stop markers
    for (const stop of stops) {
      const seq = stop.stop_sequence;
      let stopStatus: "completed" | "current" | "upcoming" = "upcoming";
      if (seq <= currentIdx) stopStatus = "completed";
      else if (seq === currentIdx + 1) stopStatus = "current";

      const marker = L.marker(
        [stop.planned_latitude!, stop.planned_longitude!],
        { icon: createStopIcon(stopStatus, seq) },
      ).addTo(map);

      marker.bindPopup(
        `<div style="font-size:12px;">
          <b>Stop #${seq}</b> — ${stop.stop_type === "PICKUP" ? "Ophaal" : "Levering"}
          <br/>${stop.planned_address || "Geen adres"}
          ${stop.contact_name ? `<br/>${stop.contact_name}` : ""}
          <br/><span style="color:#6b7280;">${stop.stop_status}</span>
        </div>`,
      );

      stopMarkersRef.current.push(marker);
    }

    // Draw route line
    const latlngs: L.LatLngExpression[] = stops.map(
      (s) => [s.planned_latitude!, s.planned_longitude!] as L.LatLngExpression,
    );
    const statusColor = st ? STATUS_COLORS[st.status] : "#6b7280";
    const polyline = L.polyline(latlngs, {
      color: statusColor,
      weight: 3,
      opacity: 0.6,
      dashArray: "8 4",
    }).addTo(map);
    polylinesRef.current.push(polyline);

    // Zoom to trip bounds
    const allPoints: L.LatLngExpression[] = [...latlngs];
    const pos = positions.find((p) => p.tripId === selectedTripId);
    if (pos) allPoints.push([pos.lat, pos.lng]);
    if (allPoints.length > 0) {
      map.fitBounds(L.latLngBounds(allPoints), {
        padding: [60, 60],
        maxZoom: 13,
      });
    }
  }, [selectedTripId, trips, statuses, positions]);

  // Zoom to trip on card click
  const handleTripClick = useCallback(
    (tripId: string) => {
      setSelectedTripId(tripId === selectedTripId ? null : tripId);
    },
    [selectedTripId],
  );

  if (isLoading) {
    return <LoadingState message="Live tracking laden..." />;
  }

  if (isError) {
    return (
      <QueryError
        message="Kan tracking data niet laden. Probeer het opnieuw."
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('pages.tracking.title')}
        subtitle={t('pages.tracking.subtitle')}
      />

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: "Actieve ritten",
            value: kpis.total,
            icon: Truck,
            color: "text-blue-600",
            bg: "bg-blue-500/8",
          },
          {
            label: "Op tijd",
            value: `${kpis.onTimePct}%`,
            icon: CheckCircle2,
            color: "text-green-600",
            bg: "bg-green-500/8",
          },
          {
            label: "Vertraagd",
            value: kpis.delayed,
            icon: AlertTriangle,
            color: kpis.delayed > 0 ? "text-red-600" : "text-gray-600",
            bg: kpis.delayed > 0 ? "bg-red-500/8" : "bg-gray-500/8",
          },
          {
            label: "Meldingen",
            value: alerts.length,
            icon: Activity,
            color: alerts.length > 0 ? "text-amber-600" : "text-gray-600",
            bg: alerts.length > 0 ? "bg-amber-500/8" : "bg-gray-500/8",
          },
        ].map((stat) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card rounded-xl border border-border/40 p-3 flex items-center gap-3"
          >
            <div
              className={cn(
                "h-9 w-9 rounded-lg flex items-center justify-center",
                stat.bg,
              )}
            >
              <stat.icon className={cn("h-4 w-4", stat.color)} />
            </div>
            <div>
              <p className="text-xl font-semibold font-display tabular-nums">
                {stat.value}
              </p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Main content: Map + Side panel */}
      <div className="flex gap-4" style={{ height: "calc(100vh - 320px)", minHeight: "400px" }}>
        {/* Map */}
        <div className="flex-1 bg-card rounded-xl border border-border/40 overflow-hidden">
          <div ref={mapCallbackRef} className="h-full w-full" />
        </div>

        {/* Side panel */}
        <div className="w-80 shrink-0 flex flex-col gap-3">
          {/* Search + filter */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
              <input
                placeholder="Zoek voertuig, chauffeur..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-9 pl-9 pr-3 rounded-xl border border-border/50 bg-card text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring/20"
              />
            </div>
            <div className="flex rounded-xl border border-border/50 bg-card p-1 gap-0.5">
              {FILTER_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setStatusFilter(opt.key)}
                  className={cn(
                    "flex-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap",
                    statusFilter === opt.key
                      ? "bg-foreground text-background shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Trip list */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {filteredStatuses.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Truck className="h-8 w-8 text-muted-foreground/20 mb-2" />
                <p className="text-sm text-muted-foreground">
                  Geen actieve ritten
                </p>
              </div>
            ) : (
              filteredStatuses.map((st) => {
                const vInfo = vehicleMap.get(st.vehicleId);
                const isSelected = selectedTripId === st.tripId;

                return (
                  <motion.div
                    key={st.tripId}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <Card
                      className={cn(
                        "cursor-pointer transition-all hover:shadow-md",
                        isSelected && "ring-2 ring-primary/50",
                      )}
                      onClick={() => handleTripClick(st.tripId)}
                    >
                      <CardContent className="p-3 space-y-2">
                        {/* Vehicle + Status */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div
                              className="h-3 w-3 rounded-full"
                              style={{
                                backgroundColor: STATUS_COLORS[st.status],
                              }}
                            />
                            <span className="text-sm font-semibold font-display truncate">
                              {vInfo?.plate || st.vehicleId.slice(0, 8)}
                            </span>
                          </div>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px]",
                              st.status === "on_time" &&
                                "bg-green-100 text-green-700",
                              st.status === "delayed" &&
                                "bg-amber-100 text-amber-700",
                              st.status === "critical" &&
                                "bg-red-100 text-red-700",
                            )}
                          >
                            {st.status === "on_time"
                              ? "Op tijd"
                              : st.status === "delayed"
                                ? "Vertraagd"
                                : "Kritiek"}
                          </Badge>
                        </div>

                        {/* Driver */}
                        <p className="text-xs text-muted-foreground truncate">
                          {st.driverName}
                        </p>

                        {/* Progress + ETA */}
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5">
                            <MapPin className="h-3 w-3 text-muted-foreground" />
                            <span className="font-medium">
                              {st.currentStopIndex}/{st.totalStops} stops
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <span>ETA {st.eta}</span>
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                          <div
                            className="h-1.5 rounded-full transition-all"
                            style={{
                              width: `${st.totalStops > 0 ? (st.currentStopIndex / st.totalStops) * 100 : 0}%`,
                              backgroundColor: STATUS_COLORS[st.status],
                            }}
                          />
                        </div>

                        {/* Delay indicator */}
                        {st.delayMinutes > 0 && (
                          <div className="flex items-center gap-1 text-xs">
                            <AlertTriangle
                              className={cn(
                                "h-3 w-3",
                                st.status === "critical"
                                  ? "text-red-500"
                                  : "text-amber-500",
                              )}
                            />
                            <span
                              className={cn(
                                st.status === "critical"
                                  ? "text-red-600"
                                  : "text-amber-600",
                              )}
                            >
                              +{st.delayMinutes} min
                            </span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })
            )}
          </div>

          {/* Alerts section */}
          {alerts.length > 0 && (
            <div className="border-t border-border/40 pt-2 space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
                Meldingen ({alerts.length})
              </p>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={cn(
                      "rounded-lg px-2.5 py-1.5 text-xs",
                      alert.severity === "critical" &&
                        "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400",
                      alert.severity === "warning" &&
                        "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
                      alert.severity === "info" &&
                        "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400",
                    )}
                  >
                    {alert.message}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LiveTracking;
