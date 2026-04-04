/**
 * ConsolidationMap
 * Shows consolidation groups as color-coded clusters on a Leaflet map.
 * Uses raw Leaflet (consistent with PlanningMap) to avoid react-leaflet dependency.
 */
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { cn } from "@/lib/utils";
import type { ConsolidationGroup } from "@/types/consolidation";
import type { GeoCoord } from "@/data/geoData";

// 10 distinct colors for groups
const GROUP_COLORS = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#f97316", // orange
  "#84cc16", // lime
  "#ec4899", // pink
  "#6366f1", // indigo
];

// Default center of the Netherlands
const NL_CENTER: [number, number] = [52.13, 5.29];

interface ConsolidationMapProps {
  groups: ConsolidationGroup[];
  /** Map of order_id → GeoCoord for orders that have been geocoded */
  coordMap: Map<string, GeoCoord>;
  className?: string;
}

export function ConsolidationMap({ groups, coordMap, className }: ConsolidationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialise map
    const map = L.map(containerRef.current).setView(NL_CENTER, 8);
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
    }).addTo(map);

    const bounds = L.latLngBounds([]);

    // Draw each group
    groups.forEach((group, groupIdx) => {
      const color = GROUP_COLORS[groupIdx % GROUP_COLORS.length];
      const groupCoords: GeoCoord[] = [];

      (group.orders ?? []).forEach((co) => {
        const coord = coordMap.get(co.order_id);
        if (!coord) return;
        groupCoords.push(coord);

        // Marker for each order
        const icon = L.divIcon({
          className: "consolidation-marker",
          html: `<div style="width:12px;height:12px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.3);"></div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        });

        L.marker([coord.lat, coord.lng], { icon })
          .bindPopup(
            `<div style="font-size:12px;">
              <strong>${co.order?.client_name ?? "Order"}</strong><br/>
              ${co.order?.delivery_address ?? ""}<br/>
              <em>${group.name}</em>
            </div>`,
          )
          .addTo(map);

        bounds.extend([coord.lat, coord.lng]);
      });

      // Draw a circle around the group centroid if there are coords
      if (groupCoords.length > 0) {
        const centroid = _centroid(groupCoords);
        L.circle([centroid.lat, centroid.lng], {
          radius: 3000, // 3 km radius
          color,
          fillColor: color,
          fillOpacity: 0.08,
          weight: 1.5,
        }).addTo(map);
      }
    });

    // Fit map to bounds if we have any
    try {
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [40, 40] });
      }
    } catch {
      // no-op if bounds invalid
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, coordMap]);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {/* Map container */}
      <div
        ref={containerRef}
        data-testid="consolidation-map-container"
        className="w-full rounded-xl overflow-hidden border border-border/40 shadow-sm"
        style={{ height: 400 }}
      />

      {/* Legend */}
      {groups.length > 0 && (
        <div className="flex flex-wrap gap-2 px-1">
          {groups.map((group, idx) => {
            const color = GROUP_COLORS[idx % GROUP_COLORS.length];
            return (
              <div key={group.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  className="inline-block h-3 w-3 rounded-full shrink-0"
                  style={{ background: color }}
                />
                <span>{group.name}</span>
                <span className="text-muted-foreground/60">
                  ({(group.orders ?? []).length} orders)
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────

function _centroid(coords: GeoCoord[]): GeoCoord {
  const lat = coords.reduce((s, c) => s + c.lat, 0) / coords.length;
  const lng = coords.reduce((s, c) => s + c.lng, 0) / coords.length;
  return { lat, lng };
}
