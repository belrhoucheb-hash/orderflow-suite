import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import type { LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";

export interface RoutePreviewMapStop {
  id: string;
  label: string;
  line?: {
    lat?: number | null;
    lng?: number | null;
  } | null;
  onClick: () => void;
}

function routeMarkerMeta(label: string, index: number, total: number) {
  if (index === 0 || label === "Ophalen") {
    return { code: "L", title: "Laden", tone: "pickup" };
  }
  if (index === total - 1) {
    return { code: "B", title: "Bestemming", tone: "destination" };
  }
  return { code: "W", title: "Tussenstop", tone: "warehouse" };
}

export function RoutePreviewMap({ stops }: { stops: RoutePreviewMapStop[] }) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const mappedStops = useMemo(
    () =>
      stops
        .map((stop, index) => {
          const lat = stop.line?.lat;
          const lng = stop.line?.lng;
          if (lat == null || lng == null) return null;
          return {
            ...stop,
            index,
            position: [lat, lng] as LatLngExpression,
          };
        })
        .filter(Boolean) as Array<RoutePreviewMapStop & { index: number; position: LatLngExpression }>,
    [stops],
  );
  const positions = useMemo(() => mappedStops.map((stop) => stop.position), [mappedStops]);

  useEffect(() => {
    const node = mapRef.current;
    if (!node || positions.length === 0) return;

    const map = L.map(node, {
      center: positions[0],
      zoom: positions.length === 1 ? 14 : 9,
      zoomControl: true,
      attributionControl: false,
      dragging: true,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      boxZoom: false,
      keyboard: true,
      tap: true,
    });
    mapInstanceRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

    if (positions.length > 1) {
      L.polyline(positions, {
        color: "hsl(var(--gold))",
        weight: 4,
        opacity: 0.78,
      }).addTo(map);
      map.fitBounds(L.latLngBounds(positions), { padding: [18, 18], maxZoom: 13, animate: false });
    } else {
      map.setView(positions[0], 14, { animate: false });
    }

    mappedStops.forEach((stop) => {
      const meta = routeMarkerMeta(stop.label, stop.index, stops.length);
      const marker = L.divIcon({
        className: "",
        html: `
          <div class="route-preview-marker route-preview-marker--${meta.tone}" title="${meta.title}">
            <span class="route-preview-marker__code">${meta.code}</span>
            <span class="route-preview-marker__number">${stop.index + 1}</span>
          </div>
        `,
        iconSize: [34, 38],
        iconAnchor: [17, 32],
      });

      L.marker(stop.position, { icon: marker })
        .addTo(map)
        .bindTooltip(String(stop.index + 1), {
          direction: "top",
          offset: [0, -28],
          opacity: 0.95,
          className: "route-preview-marker-tooltip",
        })
        .on("click", stop.onClick);
    });

    window.setTimeout(() => map.invalidateSize(), 0);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [mappedStops, positions, stops.length]);

  if (positions.length === 0) {
    return (
      <div className="relative h-32 rounded-xl bg-[linear-gradient(90deg,hsl(var(--gold)_/_0.08)_1px,transparent_1px),linear-gradient(0deg,hsl(var(--gold)_/_0.08)_1px,transparent_1px)] bg-[length:22px_22px]">
        <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-muted-foreground">
          Kaart verschijnt zodra GPS-punten bekend zijn
        </div>
      </div>
    );
  }

  return <div ref={mapRef} className="h-32 w-full rounded-xl" aria-label="Routekaart" />;
}
