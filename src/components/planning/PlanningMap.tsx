import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { type FleetVehicle } from "@/hooks/useVehicles";
import { type GeoCoord, vehicleColors } from "@/data/geoData";
import { type PlanOrder, type Assignments, WAREHOUSE } from "./types";
import { getCity, getTotalWeight } from "./planningUtils";

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

export function PlanningMap({
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

    // Draw warehouse marker
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

    // Draw polylines per vehicle
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
  }, [orders, orderCoords, orderToVehicle, highlightedIds, assignments, fleetVehicles]);

  return <div ref={mapRef} className="h-full w-full" />;
}
