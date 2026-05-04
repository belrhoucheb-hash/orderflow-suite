import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import type { ReactNode } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import {
  Truck, AlertTriangle, CheckCircle2, Search,
  Phone, ExternalLink, FileWarning, Radio,
  Activity, MapPinned, Route, User, PackageCheck, Clock3, Send,
  Navigation, Wifi, MessageSquare,
} from "lucide-react";
import { Link } from "react-router-dom";

// Fix Leaflet default marker icon paths (broken by Vite bundling)
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});
import { Badge } from "@/components/ui/badge";
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
  useTrackingOrderContext,
  haversineKm,
} from "@/hooks/useTracking";
import { useNotificationLogByOrder, useNotificationLogByTrip } from "@/hooks/useNotificationLog";
import type { Trip, TripStop } from "@/types/dispatch";
import type { VehiclePosition, TripTrackingStatus } from "@/types/tracking";
import type { NotificationLog } from "@/types/notifications";
import { logTrackingAccess } from "@/lib/trackingPrivacy";

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
  const pageAccessLoggedRef = useRef(false);
  const lastFocusedTripLoggedRef = useRef<string | null>(null);

  // Build driver map
  const driverMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of drivers) map.set(d.id, d.name);
    return map;
  }, [drivers]);

  const driverInfoMap = useMemo(() => {
    const map = new Map<string, { name: string; phone?: string | null }>();
    for (const d of drivers) {
      map.set(d.id, { name: d.name, phone: (d as any).phone ?? null });
    }
    return map;
  }, [drivers]);

  // Build vehicle map
  const vehicleMap = useMemo(() => {
    const map = new Map<string, { name: string; plate: string }>();
    for (const v of vehicles) {
      map.set(v.code, { name: v.name, plate: v.plate });
      map.set(v.id, { name: v.name, plate: v.plate });
      if (v.dbId) map.set(v.dbId, { name: v.name, plate: v.plate });
    }
    return map;
  }, [vehicles]);

  const statuses = useTripTrackingStatuses(trips, driverMap);
  const alerts = useTrackingAlerts(statuses, positions, previousPositions);

  const positionMap = useMemo(() => {
    const map = new Map<string, VehiclePosition>();
    for (const position of positions) map.set(position.tripId, position);
    return map;
  }, [positions]);

  const tripMap = useMemo(() => {
    const map = new Map<string, Trip>();
    for (const trip of trips) map.set(trip.id, trip);
    return map;
  }, [trips]);

  const selectedStatus = useMemo(
    () => statuses.find((status) => status.tripId === selectedTripId) ?? null,
    [statuses, selectedTripId],
  );

  const selectedTrip = useMemo(
    () => trips.find((trip) => trip.id === selectedTripId) ?? null,
    [trips, selectedTripId],
  );

  const selectedStops = useMemo(() => {
    if (!selectedTrip) return [];
    return (((selectedTrip as any).trip_stops || []) as TripStop[]).sort(
      (a, b) => a.stop_sequence - b.stop_sequence,
    );
  }, [selectedTrip]);

  const selectedCurrentStop =
    selectedStatus && selectedStops.length > 0
      ? selectedStops[
          Math.max(0, Math.min(selectedStatus.currentStopIndex, selectedStops.length - 1))
        ]
      : null;

  const selectedNextStop =
    selectedStatus && selectedStops.length > 0
      ? selectedStops[
          Math.max(0, Math.min(selectedStatus.currentStopIndex + 1, selectedStops.length - 1))
        ]
      : null;

  const selectedOrderId =
    getTripOrderId(selectedTrip ?? undefined) ||
    selectedStops.find((stop) => stop.order_id)?.order_id ||
    null;
  const { data: selectedOrderContext = null } = useTrackingOrderContext(selectedOrderId);
  const { data: selectedTripNotifications = [] } = useNotificationLogByTrip(selectedTripId);
  const { data: selectedOrderNotifications = [] } = useNotificationLogByOrder(selectedOrderId);
  const selectedVehicle = selectedStatus ? vehicleMap.get(selectedStatus.vehicleId) : null;
  const selectedDriver = selectedTrip
    ? driverInfoMap.get(((selectedTrip as any).driver_id as string | undefined) || "")
    : null;
  const selectedPosition = selectedTripId ? positionMap.get(selectedTripId) : null;
  const criticalStatuses = useMemo(
    () => statuses.filter((status) => status.status === "critical" || status.delayMinutes > 15),
    [statuses],
  );

  const priorityAlerts = useMemo(
    () =>
      alerts.filter(
        (alert) => alert.severity === "critical" || alert.severity === "warning",
      ),
    [alerts],
  );

  const gpsLiveCount = useMemo(
    () => positions.filter((position) => position.source === "real").length,
    [positions],
  );

  const fallbackCount = Math.max(0, positions.length - gpsLiveCount);
  const selectedPositionAge = selectedPosition
    ? formatPositionAge(selectedPosition.timestamp)
    : "Geen positie";
  const selectedDeviation =
    selectedPosition?.deviationKm != null
      ? `${selectedPosition.deviationKm.toFixed(1)} km`
      : "Niet gemeten";
  const selectedRemainingDistanceKm = useMemo(
    () =>
      selectedPosition
        ? calculateRemainingDistanceKm(selectedPosition, selectedStops, selectedStatus?.currentStopIndex ?? 0)
        : null,
    [selectedPosition, selectedStops, selectedStatus?.currentStopIndex],
  );
  const selectedMapsUrl = useMemo(
    () => buildMapsRouteUrl(selectedStops),
    [selectedStops],
  );
  const selectedContact = useMemo(
    () => findBestContact(selectedOrderContext, selectedStops),
    [selectedOrderContext, selectedStops],
  );
  const latestNotification =
    selectedTripNotifications[0] ?? selectedOrderNotifications[0] ?? null;
  const selectedNextTimeWindow = formatTrackingTimeWindow(selectedNextStop, selectedOrderContext);
  const selectedNotificationPreference = formatNotificationPreferences(
    selectedOrderContext?.notification_preferences,
  );
  const selectedLatestNotification = formatNotificationSummary(latestNotification);
  const selectedCustomerUpdateTarget =
    selectedContact.email || selectedContact.phone || selectedContact.name || "Geen ontvanger in order";
  const selectedRouteSummary =
    selectedRemainingDistanceKm == null
      ? "Geen positie"
      : selectedRemainingDistanceKm < 1
        ? "< 1 km resterend"
        : `${selectedRemainingDistanceKm.toFixed(1)} km resterend`;

  useEffect(() => {
    if (pageAccessLoggedRef.current || trips.length === 0) return;
    pageAccessLoggedRef.current = true;

    logTrackingAccess({
      purposeCode: "route_execution",
      accessType: "live_view",
      source: "live-tracking",
      metadata: {
        tripCount: trips.length,
        positionCount: positions.length,
      },
    });
  }, [trips.length, positions.length]);

  useEffect(() => {
    if (!selectedTripId) return;
    if (lastFocusedTripLoggedRef.current === selectedTripId) return;
    lastFocusedTripLoggedRef.current = selectedTripId;

    const selectedPosition = positions.find((p) => p.tripId === selectedTripId);
    const selectedTrip = trips.find((trip) => trip.id === selectedTripId) as any;

    logTrackingAccess({
      purposeCode: "route_execution",
      accessType: "live_view",
      tripId: selectedTripId,
      driverId: selectedTrip?.driver_id ?? selectedTrip?.driverId ?? null,
      vehicleId: selectedPosition?.vehicleId ?? selectedTrip?.vehicle_id ?? null,
      source: "live-tracking-trip-focus",
      metadata: {
        hasPosition: !!selectedPosition,
      },
    });
  }, [selectedTripId, positions, trips]);

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
          s.tripLabel.toLowerCase().includes(q) ||
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
      const tripLabel = st?.tripLabel || `Rit ${pos.tripId.slice(0, 8)}`;
      const stopsForPos = (((tripForPos as any)?.trip_stops || []) as TripStop[]).sort(
        (a, b) => a.stop_sequence - b.stop_sequence,
      );
      const currentStop = st && stopsForPos.length > 0
        ? stopsForPos[Math.max(0, Math.min(st.currentStopIndex, stopsForPos.length - 1))]
        : null;
      const nextStop = st && stopsForPos.length > 0
        ? stopsForPos[Math.max(0, Math.min(st.currentStopIndex + 1, stopsForPos.length - 1))]
        : null;
      const orderId =
        ((tripForPos as any)?.order_id as string | undefined) ||
        ((tripForPos as any)?.orderId as string | undefined);
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
        `<div style="font-size:12px;min-width:220px;">
          <b>${tripLabel}</b>
          <br/><span style="color:#6b7280;">${vInfo?.name || "Voertuig"}${vInfo ? ` (${vInfo.plate})` : ""}</span>
          <br/>Chauffeur: ${dName}
          <br/>Positie: ${pos.source === "real" ? "GPS live" : "Fallback positie"}
          <br/>Huidige stop: ${currentStop?.planned_address || "Niet bekend"}
          <br/>Volgende stop: ${nextStop?.planned_address || "Niet bekend"}
          <br/>Voortgang: ${st ? `${st.currentStopIndex}/${st.totalStops}` : "?"}
          <br/>ETA: ${etaStr}${delayStr}
          <br/><span style="color:#9ca3af;">${Math.round(pos.speed)} km/u</span>
          <div style="display:flex;gap:8px;margin-top:8px;">
            <a href="/dispatch" style="color:#9a6a2f;font-weight:700;">Dispatch</a>
            ${orderId ? `<a href="/orders/${orderId}" style="color:#9a6a2f;font-weight:700;">Order</a>` : ""}
          </div>
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
          <b>Stop #${seq}</b> — ${stop.stop_type === "PICKUP" ? "Ophaal" : stop.stop_type === "INTERMEDIATE" ? "Tussenstop" : "Levering"}
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
    <div className="page-container space-y-5">
      <PageHeader
        eyebrow="Tracking control"
        title={t("pages.tracking.title")}
        subtitle="Live regie over actieve ritten, ETA's, afwijkingen en chauffeurstatus."
        meta={`${kpis.total} actief`}
        actions={
          <button type="button" onClick={() => refetch()} className="btn-luxe">
            <Activity className="h-4 w-4" />
            Vernieuwen
          </button>
        }
      />

      <section className="card--luxe overflow-hidden">
        <div className="grid divide-y divide-[hsl(var(--gold)/0.12)] md:grid-cols-4 md:divide-x md:divide-y-0">
          {[
            { label: "Actieve ritten", value: kpis.total, icon: Truck, tone: "text-[hsl(var(--gold-deep))]" },
            { label: "Op tijd", value: `${kpis.onTimePct}%`, icon: CheckCircle2, tone: "text-emerald-600" },
            { label: "Vertraagd", value: kpis.delayed, icon: AlertTriangle, tone: kpis.delayed > 0 ? "text-amber-700" : "text-muted-foreground" },
            { label: "GPS live", value: `${gpsLiveCount}/${positions.length}`, icon: Radio, tone: fallbackCount > 0 ? "text-amber-700" : "text-emerald-600" },
          ].map((stat) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-4 px-5 py-4"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--gold)/0.16)] bg-[hsl(var(--gold-soft)/0.32)]">
                <stat.icon className={cn("h-4 w-4", stat.tone)} />
              </div>
              <div className="min-w-0">
                <p className="font-display text-2xl font-semibold leading-none tabular-nums text-foreground">
                  {stat.value}
                </p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {stat.label}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <SmartSignalCard
          icon={AlertTriangle}
          label="Nu ingrijpen"
          value={priorityAlerts.length.toString()}
          detail={priorityAlerts.length > 0 ? "Meldingen met planneractie" : "Geen urgente signalen"}
          tone={priorityAlerts.length > 0 ? "warning" : "ok"}
        />
        <SmartSignalCard
          icon={Clock3}
          label="ETA bewaking"
          value={statuses.filter((status) => (status.etaWindowDeltaMinutes ?? 0) > 0).length.toString()}
          detail="Buiten tijdvenster"
          tone={statuses.some((status) => (status.etaWindowDeltaMinutes ?? 0) > 0) ? "warning" : "ok"}
        />
        <SmartSignalCard
          icon={Route}
          label="Route-afwijking"
          value={positions.filter((position) => (position.deviationKm ?? 0) > 2).length.toString()}
          detail="Meer dan 2 km van route"
          tone={positions.some((position) => (position.deviationKm ?? 0) > 2) ? "critical" : "ok"}
        />
        <SmartSignalCard
          icon={Radio}
          label="Fallback GPS"
          value={fallbackCount.toString()}
          detail="Geen echte live positie"
          tone={fallbackCount > 0 ? "warning" : "ok"}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_25rem]">
        <div className="card--luxe overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[hsl(var(--gold)/0.12)] px-5 py-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--gold-deep))]" style={{ fontFamily: "var(--font-display)" }}>
                Live kaart
              </p>
              <h2 className="mt-1 text-base font-semibold text-foreground">Routepositie & stops</h2>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Realtime bewaking
            </div>
          </div>
          <div className="h-[34rem] min-h-[420px] bg-[hsl(var(--gold-soft)/0.12)] xl:h-[calc(100vh-27rem)]">
            <div ref={mapCallbackRef} className="h-full w-full" />
          </div>
        </div>

        <aside className="card--luxe flex min-h-[34rem] flex-col overflow-hidden xl:row-span-2 xl:h-[calc(100vh-18rem)]">
          <div className="border-b border-[hsl(var(--gold)/0.12)] px-4 py-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--gold-deep))]" style={{ fontFamily: "var(--font-display)" }}>
                  Control panel
                </p>
                <h2 className="mt-1 text-base font-semibold text-foreground">Ritten in uitvoering</h2>
              </div>
              <Badge variant="outline" className="border-[hsl(var(--gold)/0.18)] bg-[hsl(var(--gold-soft)/0.24)] text-[hsl(var(--gold-deep))]">
                {filteredStatuses.length}
              </Badge>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
              <input
                placeholder="Zoek rit, voertuig, chauffeur..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 w-full rounded-xl border border-[hsl(var(--gold)/0.18)] bg-white pl-9 pr-3 text-sm outline-none transition placeholder:text-muted-foreground/50 focus:border-[hsl(var(--gold)/0.45)] focus:ring-4 focus:ring-[hsl(var(--gold)/0.12)]"
              />
            </div>
            <div className="mt-3 flex rounded-xl border border-[hsl(var(--gold)/0.16)] bg-[hsl(var(--gold-soft)/0.16)] p-1">
              {FILTER_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setStatusFilter(opt.key)}
                  className={cn(
                    "flex-1 rounded-lg px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors",
                    statusFilter === opt.key
                      ? "bg-white text-[hsl(var(--gold-deep))] shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
            {priorityAlerts.length > 0 ? (
              <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50/70 px-3 py-3">
                <div className="mb-2 flex items-center gap-2">
                  <FileWarning className="h-4 w-4 text-amber-700" />
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-800">
                    Kritieke aandacht
                  </p>
                </div>
                <div className="space-y-1.5">
                  {priorityAlerts.slice(0, 3).map((alert) => (
                    <button
                      key={alert.id}
                      type="button"
                      onClick={() => handleTripClick(alert.tripId)}
                      className="flex w-full items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-left text-xs text-amber-900 shadow-sm"
                    >
                      <span className="truncate font-semibold">{alert.message}</span>
                      <span className="shrink-0 uppercase tracking-[0.12em]">{alert.severity}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : criticalStatuses.length > 0 && (
              <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50/70 px-3 py-3">
                <div className="mb-2 flex items-center gap-2">
                  <FileWarning className="h-4 w-4 text-amber-700" />
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-800">
                    Kritieke aandacht
                  </p>
                </div>
                <div className="space-y-1.5">
                  {criticalStatuses.slice(0, 3).map((status) => (
                    <button
                      key={status.tripId}
                      type="button"
                      onClick={() => handleTripClick(status.tripId)}
                      className="flex w-full items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-left text-xs text-amber-900 shadow-sm"
                    >
                      <span className="truncate font-semibold">{status.tripLabel}</span>
                      <span className="shrink-0 tabular-nums">+{status.delayMinutes} min</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {filteredStatuses.length === 0 ? (
              <div className="flex h-full min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-[hsl(var(--gold)/0.18)] bg-[hsl(var(--gold-soft)/0.1)] px-4 text-center">
                <Truck className="mb-3 h-8 w-8 text-muted-foreground/30" />
                <p className="text-sm font-medium text-foreground">Geen actieve ritten</p>
                <p className="mt-1 text-xs text-muted-foreground">Zodra dispatch actief is, verschijnen ritten hier.</p>
              </div>
            ) : (
              filteredStatuses.map((st) => {
                const vInfo = vehicleMap.get(st.vehicleId);
                const isSelected = selectedTripId === st.tripId;
                const tripPosition = positionMap.get(st.tripId);

                return (
                  <motion.button
                    key={st.tripId}
                    type="button"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={() => handleTripClick(st.tripId)}
                    className={cn(
                      "w-full rounded-2xl border px-3 py-3 text-left transition-all",
                      isSelected
                        ? "border-[hsl(var(--gold)/0.34)] bg-[linear-gradient(135deg,hsl(var(--gold-soft)/0.36),white)] shadow-[0_18px_40px_-30px_hsl(var(--gold-deep)/0.5)]"
                        : "border-[hsl(var(--gold)/0.1)] bg-white hover:border-[hsl(var(--gold)/0.24)] hover:bg-[hsl(var(--gold-soft)/0.12)]",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[st.status] }} />
                          <p className="truncate font-display text-sm font-semibold text-foreground">{st.tripLabel}</p>
                        </div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {vInfo ? `${vInfo.name} (${vInfo.plate})` : "Voertuig onbekend"} - {st.driverName}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          "shrink-0 border-0 text-[10px]",
                          st.status === "on_time" && "bg-emerald-50 text-emerald-700",
                          st.status === "delayed" && "bg-amber-50 text-amber-700",
                          st.status === "critical" && "bg-red-50 text-red-700",
                        )}
                      >
                        {st.status === "on_time" ? "Op tijd" : st.status === "delayed" ? "Vertraagd" : "Kritiek"}
                      </Badge>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-xl border border-[hsl(var(--gold)/0.1)] bg-[hsl(var(--gold-soft)/0.1)] px-2.5 py-2">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Stops</p>
                        <p className="mt-1 font-semibold text-foreground">{st.currentStopIndex}/{st.totalStops}</p>
                      </div>
                      <div className="rounded-xl border border-[hsl(var(--gold)/0.1)] bg-[hsl(var(--gold-soft)/0.1)] px-2.5 py-2">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">ETA</p>
                        <p className="mt-1 font-semibold text-foreground">{st.eta || "--:--"}</p>
                      </div>
                    </div>

                    <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Radio className={cn("h-3.5 w-3.5", tripPosition?.source === "real" ? "text-emerald-600" : "text-amber-700")} />
                      {tripPosition?.source === "real" ? "GPS live" : "Fallback positie"}
                      <span className="text-muted-foreground/50">-</span>
                      <span>{tripPosition ? formatPositionAge(tripPosition.timestamp) : "geen positie"}</span>
                    </div>

                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[hsl(var(--gold-soft)/0.35)]">
                      <div
                        className="h-1.5 rounded-full transition-all"
                        style={{
                          width: `${st.totalStops > 0 ? (st.currentStopIndex / st.totalStops) * 100 : 0}%`,
                          backgroundColor: STATUS_COLORS[st.status],
                        }}
                      />
                    </div>

                    {st.delayMinutes > 0 && (
                      <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-700">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        +{st.delayMinutes} min vertraging
                      </div>
                    )}
                    {(st.etaWindowDeltaMinutes ?? 0) > 0 && (
                      <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-red-700">
                        <Clock3 className="h-3.5 w-3.5" />
                        ETA {st.etaWindowDeltaMinutes} min buiten tijdvenster
                      </div>
                    )}
                    {(tripPosition?.deviationKm ?? 0) > 2 && (
                      <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-red-700">
                        <Route className="h-3.5 w-3.5" />
                        {tripPosition?.deviationKm?.toFixed(1)} km route-afwijking
                      </div>
                    )}
                  </motion.button>
                );
              })
            )}
          </div>

          <div className="border-t border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--gold-soft)/0.08)] px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))]">
                Meldingen
              </p>
              <span className="text-xs tabular-nums text-muted-foreground">{alerts.length}</span>
            </div>
            {alerts.length === 0 ? (
              <p className="rounded-xl border border-[hsl(var(--gold)/0.12)] bg-white px-3 py-2 text-xs text-muted-foreground">
                Geen afwijkingen op dit moment.
              </p>
            ) : (
              <div className="max-h-52 space-y-1 overflow-y-auto">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={cn(
                      "rounded-xl px-3 py-2 text-xs",
                      alert.severity === "critical" && "bg-red-50 text-red-700",
                      alert.severity === "warning" && "bg-amber-50 text-amber-700",
                      alert.severity === "info" && "bg-blue-50 text-blue-700",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => handleTripClick(alert.tripId)}
                      className="w-full text-left font-medium"
                    >
                      {alert.message}
                    </button>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Link to="/dispatch" className="rounded-lg bg-white/80 px-2 py-1 font-semibold text-inherit shadow-sm">
                        Dispatch
                      </Link>
                      {getTripOrderId(tripMap.get(alert.tripId)) && (
                        <Link
                          to={`/orders/${getTripOrderId(tripMap.get(alert.tripId))}`}
                          className="rounded-lg bg-white/80 px-2 py-1 font-semibold text-inherit shadow-sm"
                        >
                          Order
                        </Link>
                      )}
                      <Link
                        to={`/exceptions?trip=${alert.tripId}&type=${alert.type}`}
                        className="rounded-lg bg-white/80 px-2 py-1 font-semibold text-inherit shadow-sm"
                      >
                        Uitzondering
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        <div className="card--luxe overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[hsl(var(--gold)/0.12)] px-5 py-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--gold-deep))]" style={{ fontFamily: "var(--font-display)" }}>
                Ritdetail
              </p>
              <h2 className="mt-1 text-base font-semibold text-foreground">
                {selectedStatus ? selectedStatus.tripLabel : "Selecteer een rit"}
              </h2>
            </div>
            {selectedStatus && (
              <Badge
                variant="outline"
                className={cn(
                  "border-0 text-[10px]",
                  selectedStatus.status === "on_time" && "bg-emerald-50 text-emerald-700",
                  selectedStatus.status === "delayed" && "bg-amber-50 text-amber-700",
                  selectedStatus.status === "critical" && "bg-red-50 text-red-700",
                )}
              >
                {selectedStatus.status === "on_time"
                  ? "Op tijd"
                  : selectedStatus.status === "delayed"
                    ? "Vertraagd"
                    : "Kritiek"}
              </Badge>
            )}
          </div>

          {!selectedStatus ? (
            <div className="flex min-h-56 flex-col items-center justify-center px-6 py-8 text-center">
              <MapPinned className="mb-3 h-9 w-9 text-muted-foreground/30" />
              <p className="text-sm font-semibold text-foreground">Klik op een rit of voertuig</p>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Dan ziet de planner direct chauffeur, voertuig, voortgang, positiebron en de snelste vervolgactie.
              </p>
            </div>
          ) : (
            <div className="space-y-4 p-5">
              <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
                <DetailTile
                  icon={User}
                  label="Chauffeur"
                  value={selectedDriver?.name || selectedStatus.driverName || "Onbekend"}
                />
                <DetailTile
                  icon={Truck}
                  label="Voertuig"
                  value={selectedVehicle ? `${selectedVehicle.name} (${selectedVehicle.plate})` : "Voertuig onbekend"}
                />
                <DetailTile
                  icon={PackageCheck}
                  label="Voortgang"
                  value={`${selectedStatus.currentStopIndex}/${selectedStatus.totalStops} stops`}
                />
                <DetailTile
                  icon={MapPinned}
                  label="Huidige stop"
                  value={selectedCurrentStop?.planned_address || "Nog niet bekend"}
                />
                <DetailTile
                  icon={Route}
                  label="Volgende stop"
                  value={selectedNextStop?.planned_address || "Nog niet bekend"}
                />
                <DetailTile
                  icon={Radio}
                  label="Positiedata"
                  value={selectedPosition?.source === "real" ? "GPS live" : "Geen live GPS-rij"}
                />
                <DetailTile
                  icon={Clock3}
                  label="Laatste update"
                  value={selectedPositionAge}
                />
                <DetailTile
                  icon={AlertTriangle}
                  label="ETA marge"
                  value={(selectedStatus.etaWindowDeltaMinutes ?? 0) > 0 ? `${selectedStatus.etaWindowDeltaMinutes} min te laat` : "Binnen tijdvenster"}
                />
                <DetailTile
                  icon={Route}
                  label="Route-afwijking"
                  value={selectedDeviation}
                />
                <DetailTile
                  icon={Navigation}
                  label="Resterend"
                  value={selectedRouteSummary}
                />
                <DetailTile
                  icon={Clock3}
                  label="Tijdvenster"
                  value={selectedNextTimeWindow}
                />
              </div>

              <div className="grid gap-3 lg:grid-cols-3">
                <PlannerContextPanel
                  icon={Navigation}
                  label="Route-inzicht"
                  title={selectedRouteSummary}
                  lines={[
                    `Huidige stop: ${selectedCurrentStop?.planned_address || "Niet bekend"}`,
                    `Volgende stop: ${selectedNextStop?.planned_address || "Niet bekend"}`,
                    `Tijdvenster: ${selectedNextTimeWindow}`,
                  ]}
                  action={
                    selectedMapsUrl ? (
                      <a
                        href={selectedMapsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-luxe btn-luxe--secondary h-9 px-3 text-xs"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open in Maps
                      </a>
                    ) : null
                  }
                />
                <PlannerContextPanel
                  icon={Wifi}
                  label="Chauffeur & app"
                  title={selectedDriver?.name || selectedStatus.driverName || "Onbekend"}
                  lines={[
                    `Telefoon: ${selectedDriver?.phone || "Niet bekend"}`,
                    `Laatste GPS: ${selectedPositionAge}`,
                    `Snelheid: ${selectedPosition ? `${Math.round(selectedPosition.speed)} km/u` : "Geen positie"}`,
                    `Nauwkeurigheid: ${formatAccuracy(selectedPosition?.accuracy)}`,
                  ]}
                  action={
                    selectedDriver?.phone ? (
                      <a href={`tel:${selectedDriver.phone}`} className="btn-luxe btn-luxe--secondary h-9 px-3 text-xs">
                        <Phone className="h-3.5 w-3.5" />
                        Bel
                      </a>
                    ) : null
                  }
                />
                <PlannerContextPanel
                  icon={MessageSquare}
                  label="Klantcommunicatie"
                  title={selectedCustomerUpdateTarget}
                  lines={[
                    `Contact: ${selectedContact.name || "Niet bekend"}`,
                    `E-mail: ${selectedContact.email || "Niet bekend"}`,
                    `Telefoon: ${selectedContact.phone || "Niet bekend"}`,
                    `Voorkeur: ${selectedNotificationPreference}`,
                    `Laatste notificatie: ${selectedLatestNotification}`,
                  ]}
                  action={
                    selectedOrderId ? (
                      <Link to={`/orders/${selectedOrderId}#communicatie`} className="btn-luxe btn-luxe--secondary h-9 px-3 text-xs">
                        <Send className="h-3.5 w-3.5" />
                        ETA-update
                      </Link>
                    ) : null
                  }
                />
              </div>

              <div className="flex flex-wrap gap-2 border-t border-[hsl(var(--gold)/0.12)] pt-4">
                <Link to="/dispatch" className="btn-luxe">
                  <Truck className="h-4 w-4" />
                  Open dispatch
                </Link>
                {selectedOrderId && (
                  <Link to={`/orders/${selectedOrderId}`} className="btn-luxe btn-luxe--secondary">
                    <ExternalLink className="h-4 w-4" />
                    Open order
                  </Link>
                )}
                {selectedDriver?.phone && (
                  <a href={`tel:${selectedDriver.phone}`} className="btn-luxe btn-luxe--secondary">
                    <Phone className="h-4 w-4" />
                    Bel chauffeur
                  </a>
                )}
                {selectedMapsUrl && (
                  <a href={selectedMapsUrl} target="_blank" rel="noreferrer" className="btn-luxe btn-luxe--secondary">
                    <Navigation className="h-4 w-4" />
                    Open route
                  </a>
                )}
                <Link
                  to={`/exceptions?trip=${selectedStatus.tripId}`}
                  className="btn-luxe btn-luxe--secondary"
                >
                  <FileWarning className="h-4 w-4" />
                  Maak uitzondering
                </Link>
                {selectedOrderId && (
                  <Link
                    to={`/orders/${selectedOrderId}#communicatie`}
                    className="btn-luxe btn-luxe--secondary"
                  >
                    <Send className="h-4 w-4" />
                    Stuur ETA-update
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

function DetailTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Truck;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--gold-soft)/0.1)] px-4 py-3">
      <div className="mb-2 flex items-center gap-2 text-[hsl(var(--gold-deep))]">
        <Icon className="h-4 w-4" />
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em]">
          {label}
        </p>
      </div>
      <p className="line-clamp-2 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function SmartSignalCard({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: typeof Truck;
  label: string;
  value: string;
  detail: string;
  tone: "ok" | "warning" | "critical";
}) {
  return (
    <div className="card--luxe flex items-center gap-4 px-4 py-3">
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border",
          tone === "ok" && "border-emerald-100 bg-emerald-50 text-emerald-700",
          tone === "warning" && "border-amber-200 bg-amber-50 text-amber-700",
          tone === "critical" && "border-red-200 bg-red-50 text-red-700",
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </p>
        <div className="mt-1 flex items-baseline gap-2">
          <p className="font-display text-2xl font-semibold leading-none tabular-nums text-foreground">
            {value}
          </p>
          <p className="truncate text-xs text-muted-foreground">{detail}</p>
        </div>
      </div>
    </div>
  );
}

function PlannerContextPanel({
  icon: Icon,
  label,
  title,
  lines,
  action,
}: {
  icon: typeof Truck;
  label: string;
  title: string;
  lines: string[];
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[hsl(var(--gold)/0.12)] bg-white px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-[hsl(var(--gold-deep))]">
          <Icon className="h-4 w-4 shrink-0" />
          <p className="truncate text-[10px] font-semibold uppercase tracking-[0.16em]">
            {label}
          </p>
        </div>
        {action}
      </div>
      <p className="line-clamp-2 text-sm font-semibold text-foreground">{title}</p>
      <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
        {lines.map((line) => (
          <p key={line} className="line-clamp-2">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}

function formatPositionAge(timestamp: string): string {
  const ageMs = Date.now() - new Date(timestamp).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return "net bijgewerkt";
  const ageMinutes = Math.round(ageMs / 60_000);
  if (ageMinutes < 1) return "net bijgewerkt";
  if (ageMinutes === 1) return "1 min geleden";
  return `${ageMinutes} min geleden`;
}

function calculateRemainingDistanceKm(
  position: VehiclePosition,
  stops: TripStop[],
  currentStopIndex: number,
): number {
  const remainingStops = stops
    .filter((stop) => stop.planned_latitude != null && stop.planned_longitude != null)
    .filter((stop) => stop.stop_sequence > currentStopIndex)
    .sort((a, b) => a.stop_sequence - b.stop_sequence);

  if (remainingStops.length === 0) return 0;

  let distance = haversineKm(
    position.lat,
    position.lng,
    remainingStops[0].planned_latitude!,
    remainingStops[0].planned_longitude!,
  );

  for (let index = 0; index < remainingStops.length - 1; index += 1) {
    distance += haversineKm(
      remainingStops[index].planned_latitude!,
      remainingStops[index].planned_longitude!,
      remainingStops[index + 1].planned_latitude!,
      remainingStops[index + 1].planned_longitude!,
    );
  }

  return distance;
}

function buildMapsRouteUrl(stops: TripStop[]): string | null {
  const routeStops = stops
    .filter((stop) => stop.planned_address || (stop.planned_latitude != null && stop.planned_longitude != null))
    .sort((a, b) => a.stop_sequence - b.stop_sequence);

  if (routeStops.length < 2) return null;

  const origin = encodeURIComponent(formatStopForMaps(routeStops[0]));
  const destination = encodeURIComponent(formatStopForMaps(routeStops[routeStops.length - 1]));
  const waypoints = routeStops.slice(1, -1).map(formatStopForMaps).map(encodeURIComponent).join("|");
  const waypointParam = waypoints ? `&waypoints=${waypoints}` : "";

  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypointParam}&travelmode=driving`;
}

function formatStopForMaps(stop: TripStop): string {
  if (stop.planned_address) return stop.planned_address;
  return `${stop.planned_latitude},${stop.planned_longitude}`;
}

function findBestContact(order: unknown, stops: TripStop[]): {
  name: string | null;
  phone: string | null;
  email: string | null;
} {
  const orderRecord = (order ?? {}) as {
    recipient_name?: string | null;
    recipient_email?: string | null;
    recipient_phone?: string | null;
  };
  const stopWithContact =
    stops.find((stop) => stop.contact_name || stop.contact_phone) ?? null;

  return {
    name: orderRecord.recipient_name ?? stopWithContact?.contact_name ?? null,
    phone: orderRecord.recipient_phone ?? stopWithContact?.contact_phone ?? null,
    email: orderRecord.recipient_email ?? null,
  };
}

function formatTrackingTimeWindow(stop: TripStop | null, order: unknown): string {
  const orderRecord = (order ?? {}) as {
    time_window_start?: string | null;
    time_window_end?: string | null;
    pickup_time_window_start?: string | null;
    pickup_time_window_end?: string | null;
    delivery_time_window_start?: string | null;
    delivery_time_window_end?: string | null;
  };
  const start =
    orderRecord.time_window_start ??
    orderRecord.delivery_time_window_start ??
    orderRecord.pickup_time_window_start ??
    null;
  const end =
    orderRecord.time_window_end ??
    orderRecord.delivery_time_window_end ??
    orderRecord.pickup_time_window_end ??
    null;

  if (start || end) return [formatTimeValue(start), formatTimeValue(end)].filter(Boolean).join(" - ");

  if (!stop?.planned_time) return "Geen tijdvenster";
  const date = new Date(stop.planned_time);
  if (Number.isNaN(date.getTime())) return "Geen tijdvenster";
  return date.toLocaleString("nl-NL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTimeValue(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^\d{2}:\d{2}/.test(value)) return value.slice(0, 5);

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("nl-NL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatAccuracy(accuracy: number | null | undefined): string {
  if (accuracy == null || !Number.isFinite(accuracy)) return "Niet gemeten";
  return `± ${Math.round(accuracy)} m`;
}

function formatNotificationPreferences(preferences: unknown): string {
  if (!preferences || typeof preferences !== "object") return "Niet ingesteld";
  const prefs = preferences as Record<string, unknown>;
  const channels: string[] = [];
  if (prefs.email === true) channels.push("E-mail");
  if (prefs.sms === true) channels.push("SMS");
  if (channels.length === 0) return "Uit";
  return channels.join(" + ");
}

function formatNotificationSummary(log: NotificationLog | null): string {
  if (!log) return "Geen notification_log";
  const channel = log.channel || "Kanaal";
  const status = log.status || "Onbekend";
  const event = log.trigger_event || "Event";
  const moment = log.sent_at ?? log.created_at;
  const age = moment ? formatPositionAge(moment) : null;
  return `${channel} ${status} (${event})${age ? `, ${age}` : ""}`;
}

function getTripOrderId(trip: Trip | undefined): string | null {
  if (!trip) return null;
  return (
    ((trip as any).order_id as string | undefined) ||
    ((trip as any).orderId as string | undefined) ||
    null
  );
}

export default LiveTracking;
