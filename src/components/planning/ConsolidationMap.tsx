import { MapContainer, TileLayer, Marker, Popup, Circle } from "react-leaflet";
import type { ConsolidationGroup } from "@/types/consolidation";
import type { GeoCoord } from "@/data/geoData";
import L from "leaflet";

const CLUSTER_COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#14b8a6", "#6366f1",
];

interface Props {
  groups: ConsolidationGroup[];
  coordMap: Map<string, GeoCoord>;
  center?: [number, number];
  zoom?: number;
}

function makeColorIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="width:14px;height:14px;background:${color};border:2px solid white;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.3)"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

export function ConsolidationMap({ groups, coordMap, center = [52.3, 4.9], zoom = 9 }: Props) {
  return (
    <MapContainer center={center} zoom={zoom} className="h-[400px] w-full rounded-lg border">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/">OSM</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {groups.map((group, groupIdx) => {
        const color = CLUSTER_COLORS[groupIdx % CLUSTER_COLORS.length];
        const icon = makeColorIcon(color);

        // Calculate centroid for cluster circle
        const coords: GeoCoord[] = [];
        (group.orders || []).forEach((co) => {
          const coord = coordMap.get(co.order_id);
          if (coord) coords.push(coord);
        });

        const centroid = coords.length > 0
          ? { lat: coords.reduce((s, c) => s + c.lat, 0) / coords.length, lng: coords.reduce((s, c) => s + c.lng, 0) / coords.length }
          : null;

        return (
          <div key={group.id}>
            {centroid && (
              <Circle
                center={[centroid.lat, centroid.lng]}
                radius={5000}
                pathOptions={{ color, fillColor: color, fillOpacity: 0.1, weight: 2 }}
              />
            )}
            {(group.orders || []).map((co) => {
              const coord = coordMap.get(co.order_id);
              if (!coord) return null;
              return (
                <Marker key={co.id} position={[coord.lat, coord.lng]} icon={icon}>
                  <Popup>
                    <div className="text-xs">
                      <p className="font-semibold">{group.name}</p>
                      <p>#{co.order?.order_number} {co.order?.client_name}</p>
                      <p>{co.order?.delivery_address}</p>
                      <p>{co.order?.weight_kg} kg</p>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </div>
        );
      })}
    </MapContainer>
  );
}
