import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { TripStop } from "@/types/dispatch";

interface Props {
  currentPosition: { lat: number; lng: number } | null;
  stops: TripStop[];
  currentStopId: string | null;
  height?: number | string;
  className?: string;
}

interface Coord {
  lat: number;
  lng: number;
}

function getStopCoord(stop: TripStop): Coord | null {
  const order = (stop as any).order ?? null;
  const candidates: Array<[unknown, unknown]> = [
    [stop.planned_latitude, stop.planned_longitude],
    [order?.geocoded_pickup_lat, order?.geocoded_pickup_lng],
    [order?.geocoded_delivery_lat, order?.geocoded_delivery_lng],
  ];
  for (const [lat, lng] of candidates) {
    if (typeof lat === "number" && typeof lng === "number" && !Number.isNaN(lat) && !Number.isNaN(lng)) {
      return { lat, lng };
    }
  }
  return null;
}

export function LiveTripMap({ currentPosition, stops, currentStopId, height = 280, className }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const driverMarkerRef = useRef<L.Marker | null>(null);
  const layersRef = useRef<L.Layer[]>([]);
  const lastFitKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [52.1, 5.3],
      zoom: 8,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      driverMarkerRef.current = null;
      layersRef.current = [];
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const layer of layersRef.current) {
      map.removeLayer(layer);
    }
    layersRef.current = [];

    const stopCoords: Array<{ stop: TripStop; coord: Coord; index: number }> = [];
    stops.forEach((stop, index) => {
      const coord = getStopCoord(stop);
      if (coord) stopCoords.push({ stop, coord, index });
    });

    stopCoords.forEach(({ stop, coord, index }) => {
      const isCurrent = stop.id === currentStopId;
      const isDone = ["AFGELEVERD", "MISLUKT", "OVERGESLAGEN"].includes(stop.stop_status);
      const size = isCurrent ? 32 : 24;
      const bg = isDone
        ? "hsl(var(--gold-soft))"
        : isCurrent
        ? "hsl(var(--gold-deep))"
        : "hsl(var(--gold))";
      const ring = isCurrent ? "0 0 0 4px hsl(var(--gold) / 0.25)" : "0 1px 4px rgba(0,0,0,.24)";

      const icon = L.divIcon({
        className: "",
        html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};border:2px solid white;box-shadow:${ring};display:flex;align-items:center;justify-content:center;color:white;font-size:${isCurrent ? 13 : 11}px;font-weight:700;">${index + 1}</div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });

      const marker = L.marker([coord.lat, coord.lng], { icon }).addTo(map);
      layersRef.current.push(marker);
    });

    if (currentPosition) {
      const driverIcon = L.divIcon({
        className: "",
        html: `
          <div style="position:relative;width:36px;height:36px;">
            <div style="position:absolute;inset:0;border-radius:50%;background:hsl(var(--gold) / 0.25);animation:livetrip-pulse 1.6s ease-out infinite;"></div>
            <div style="position:absolute;inset:6px;border-radius:50%;background:hsl(var(--gold-deep));border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;color:white;font-size:14px;">&#9650;</div>
          </div>
          <style>@keyframes livetrip-pulse{0%{transform:scale(0.6);opacity:0.7}100%{transform:scale(1.6);opacity:0}}</style>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      if (driverMarkerRef.current) {
        driverMarkerRef.current.setLatLng([currentPosition.lat, currentPosition.lng]);
      } else {
        driverMarkerRef.current = L.marker([currentPosition.lat, currentPosition.lng], {
          icon: driverIcon,
          zIndexOffset: 1000,
        }).addTo(map);
      }
    } else if (driverMarkerRef.current) {
      map.removeLayer(driverMarkerRef.current);
      driverMarkerRef.current = null;
    }

    const currentIndex = stopCoords.findIndex((s) => s.stop.id === currentStopId);
    const upcoming = currentIndex >= 0 ? stopCoords.slice(currentIndex) : stopCoords;

    if (currentPosition && upcoming.length > 0) {
      const activeLine = L.polyline(
        [
          [currentPosition.lat, currentPosition.lng],
          [upcoming[0].coord.lat, upcoming[0].coord.lng],
        ],
        {
          color: "hsl(var(--gold-deep))",
          weight: 4,
          opacity: 0.9,
        },
      ).addTo(map);
      layersRef.current.push(activeLine);
    }

    if (upcoming.length > 1) {
      const remaining = L.polyline(
        upcoming.map(({ coord }) => [coord.lat, coord.lng]),
        {
          color: "hsl(var(--gold-deep))",
          weight: 3,
          opacity: 0.55,
          dashArray: "8 6",
        },
      ).addTo(map);
      layersRef.current.push(remaining);
    }

    const fitKey = `${currentStopId ?? "none"}|${stopCoords.length}|${currentPosition ? "pos" : "nopos"}`;
    if (fitKey !== lastFitKeyRef.current) {
      const points: Array<[number, number]> = [];
      if (currentPosition) points.push([currentPosition.lat, currentPosition.lng]);
      for (const { coord } of stopCoords) points.push([coord.lat, coord.lng]);
      if (points.length === 1) {
        map.setView(points[0], 13);
      } else if (points.length > 1) {
        map.fitBounds(L.latLngBounds(points), { padding: [30, 30] });
      }
      lastFitKeyRef.current = fitKey;
    }
  }, [stops, currentStopId, currentPosition]);

  return (
    <div
      ref={containerRef}
      className={className ?? "w-full overflow-hidden rounded-2xl border border-[hsl(var(--gold)/0.2)] shadow-sm"}
      style={{ height }}
    />
  );
}
