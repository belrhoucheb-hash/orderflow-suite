import { useEffect, useRef } from "react";
import { Map as MapIcon, Clock, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { mockOrders, statusColors, statusLabels } from "@/data/mockData";
import "leaflet/dist/leaflet.css";

// Dummy coordinates for demo
const routeStops = [
  { label: "Rotterdam Haven", lat: 51.9225, lng: 4.4792, orders: ["RCS-2026-0001"] },
  { label: "Utrecht Industrieweg", lat: 52.0907, lng: 5.1214, orders: ["RCS-2026-0001"] },
  { label: "Amsterdam Centrum", lat: 52.3676, lng: 4.9041, orders: ["RCS-2026-0002"] },
  { label: "Eindhoven Centrum", lat: 51.4416, lng: 5.4697, orders: ["RCS-2026-0002"] },
  { label: "Schiphol Cargo", lat: 52.3105, lng: 4.7683, orders: ["RCS-2026-0003"] },
  { label: "Den Haag", lat: 52.0705, lng: 4.3007, orders: ["RCS-2026-0006"] },
];

const Routes = () => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    import("leaflet").then((L) => {
      const map = L.map(mapRef.current!, {
        center: [52.1, 5.0],
        zoom: 8,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      // Custom red marker
      const icon = L.divIcon({
        html: `<div style="background:hsl(0,78%,42%);width:12px;height:12px;border-radius:50%;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,.3)"></div>`,
        className: "",
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });

      routeStops.forEach((stop) => {
        L.marker([stop.lat, stop.lng], { icon }).addTo(map).bindPopup(`<b>${stop.label}</b><br/>Orders: ${stop.orders.join(", ")}`);
      });

      // Draw route lines
      const coords = routeStops.map((s) => [s.lat, s.lng] as [number, number]);
      L.polyline(coords, { color: "hsl(0,78%,42%)", weight: 2, opacity: 0.6, dashArray: "8 4" }).addTo(map);

      mapInstanceRef.current = map;
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  const activeOrders = mockOrders.filter((o) => o.status === "onderweg" || o.status === "in_behandeling");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <MapIcon className="h-6 w-6 text-primary" />Routekaart
        </h1>
        <p className="text-sm text-muted-foreground">Bekijk geplande routes en stops</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Card className="overflow-hidden">
            <div ref={mapRef} className="h-[500px] w-full" />
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-display">Actieve routes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {activeOrders.map((order) => (
                <div key={order.id} className="p-3 rounded-lg bg-muted/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{order.orderNumber}</span>
                    <Badge variant="outline" className={`text-[10px] ${statusColors[order.status]}`}>{statusLabels[order.status]}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p className="flex items-center gap-1.5"><MapPin className="h-3 w-3 text-primary" />{order.pickupAddress}</p>
                    <p className="flex items-center gap-1.5"><MapPin className="h-3 w-3 text-emerald-600" />{order.deliveryAddress}</p>
                    <p className="flex items-center gap-1.5"><Clock className="h-3 w-3" />ETA: {new Date(order.estimatedDelivery).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-display">Stops vandaag</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {routeStops.map((stop, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">{i + 1}</div>
                    <span className="text-muted-foreground">{stop.label}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Routes;
