import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  Truck, MapPin, Clock, Loader2, Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrentPortalUser } from "@/hooks/useClientPortalUsers";
import { useVehiclePositions } from "@/hooks/useTracking";
import type { Trip } from "@/types/dispatch";
import type { VehiclePosition } from "@/types/tracking";
import { MapContainer, Marker, Polyline, TileLayer } from "react-leaflet";
import L, { type LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

interface ActiveShipment {
  id: string;
  order_number: number;
  status: string;
  pickup_address: string | null;
  delivery_address: string | null;
  time_window_end: string | null;
  notification_preferences: { email: boolean; sms: boolean };
  pickup_lat: number | null;
  pickup_lng: number | null;
  geocoded_pickup_lat: number | null;
  geocoded_pickup_lng: number | null;
  delivery_lat: number | null;
  delivery_lng: number | null;
  geocoded_delivery_lat: number | null;
  geocoded_delivery_lng: number | null;
  vehicle_id: string | null;
  driver_id: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_LABELS: Record<string, string> = {
  PLANNED: "Gepland",
  IN_TRANSIT: "Onderweg",
  DELIVERED: "Afgeleverd",
};

const NL_CENTER: LatLngExpression = [52.1326, 5.2913];

function resolveCoords(
  directLat: number | null,
  directLng: number | null,
  fallbackLat: number | null,
  fallbackLng: number | null,
): [number, number] | null {
  const lat = directLat ?? fallbackLat;
  const lng = directLng ?? fallbackLng;
  return lat != null && lng != null ? [lat, lng] : null;
}

function createShipmentTrips(shipments: ActiveShipment[]): Trip[] {
  return shipments
    .filter((shipment) => shipment.vehicle_id)
    .map((shipment) => {
      const pickupCoords = resolveCoords(
        shipment.pickup_lat,
        shipment.pickup_lng,
        shipment.geocoded_pickup_lat,
        shipment.geocoded_pickup_lng,
      );
      const deliveryCoords = resolveCoords(
        shipment.delivery_lat,
        shipment.delivery_lng,
        shipment.geocoded_delivery_lat,
        shipment.geocoded_delivery_lng,
      );

      return {
        id: shipment.id,
        tenant_id: "",
        trip_number: shipment.order_number,
        vehicle_id: shipment.vehicle_id!,
        driver_id: shipment.driver_id,
        dispatch_status: shipment.status === "IN_TRANSIT" ? "ACTIEF" : "VERZONDEN",
        planned_date: shipment.created_at.split("T")[0] ?? "",
        planned_start_time: shipment.created_at,
        actual_start_time: shipment.status === "IN_TRANSIT" ? shipment.created_at : null,
        actual_end_time: null,
        total_distance_km: null,
        total_duration_min: null,
        dispatcher_id: null,
        dispatched_at: null,
        received_at: null,
        accepted_at: null,
        started_at: shipment.status === "IN_TRANSIT" ? shipment.created_at : null,
        completed_at: null,
        notes: null,
        created_at: shipment.created_at,
        updated_at: shipment.updated_at,
        trip_stops: [
          ...(shipment.pickup_address
            ? [{
                id: `${shipment.id}-pickup`,
                trip_id: shipment.id,
                order_id: shipment.id,
                stop_type: "PICKUP" as const,
                stop_sequence: 1,
                stop_status: "AFGELEVERD" as const,
                planned_address: shipment.pickup_address,
                planned_latitude: pickupCoords?.[0] ?? null,
                planned_longitude: pickupCoords?.[1] ?? null,
                planned_time: null,
                actual_arrival_time: null,
                actual_departure_time: null,
                contact_name: null,
                contact_phone: null,
                instructions: null,
                failure_reason: null,
                notes: null,
                created_at: shipment.created_at,
                updated_at: shipment.updated_at,
              }]
            : []),
          ...(shipment.delivery_address
            ? [{
                id: `${shipment.id}-delivery`,
                trip_id: shipment.id,
                order_id: shipment.id,
                stop_type: "DELIVERY" as const,
                stop_sequence: shipment.pickup_address ? 2 : 1,
                stop_status: shipment.status === "IN_TRANSIT" ? "ONDERWEG" as const : "GEPLAND" as const,
                planned_address: shipment.delivery_address,
                planned_latitude: deliveryCoords?.[0] ?? null,
                planned_longitude: deliveryCoords?.[1] ?? null,
                planned_time: shipment.time_window_end,
                actual_arrival_time: null,
                actual_departure_time: null,
                contact_name: null,
                contact_phone: null,
                instructions: null,
                failure_reason: null,
                notes: null,
                created_at: shipment.created_at,
                updated_at: shipment.updated_at,
              }]
            : []),
        ],
      } as Trip;
    });
}

function ShipmentMap({
  shipment,
  position,
}: {
  shipment: ActiveShipment;
  position?: VehiclePosition;
}) {
  const pickupCoords = resolveCoords(
    shipment.pickup_lat,
    shipment.pickup_lng,
    shipment.geocoded_pickup_lat,
    shipment.geocoded_pickup_lng,
  );
  const deliveryCoords = resolveCoords(
    shipment.delivery_lat,
    shipment.delivery_lng,
    shipment.geocoded_delivery_lat,
    shipment.geocoded_delivery_lng,
  );

  const routePoints = [pickupCoords, deliveryCoords].filter(Boolean) as [number, number][];
  const vehiclePoint = position ? ([position.lat, position.lng] as [number, number]) : null;
  const mapPoints = [...routePoints, ...(vehiclePoint ? [vehiclePoint] : [])];

  if (mapPoints.length === 0) {
    return (
      <div className="h-48 rounded-lg bg-gray-100 flex items-center justify-center border border-gray-200">
        <div className="text-center text-gray-400">
          <MapPin className="h-8 w-8 mx-auto mb-1" />
          <p className="text-xs">Nog geen locatiegegevens beschikbaar</p>
        </div>
      </div>
    );
  }

  const center = mapPoints[0] ?? (NL_CENTER as [number, number]);

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <MapContainer
        center={center}
        zoom={8}
        scrollWheelZoom={false}
        dragging={false}
        doubleClickZoom={false}
        touchZoom={false}
        boxZoom={false}
        keyboard={false}
        attributionControl={false}
        className="h-48 w-full"
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {pickupCoords && <Marker position={pickupCoords} />}
        {deliveryCoords && <Marker position={deliveryCoords} />}
        {vehiclePoint && (
          <Marker
            position={vehiclePoint}
            icon={L.divIcon({
              className: "shipment-vehicle-marker",
              html: `<div style="width:18px;height:18px;border-radius:999px;background:#dc2626;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.25);"></div>`,
              iconSize: [18, 18],
              iconAnchor: [9, 9],
            })}
          />
        )}
        {routePoints.length >= 2 && (
          <Polyline positions={routePoints} pathOptions={{ color: "#2563eb", weight: 4, opacity: 0.75 }} />
        )}
        {vehiclePoint && deliveryCoords && (
          <Polyline positions={[vehiclePoint, deliveryCoords]} pathOptions={{ color: "#dc2626", weight: 3, opacity: 0.7, dashArray: "6 6" }} />
        )}
      </MapContainer>
    </div>
  );
}

export default function PortalTracking() {
  const { data: portalUser } = useCurrentPortalUser();
  const [shipments, setShipments] = useState<ActiveShipment[]>([]);
  const [loading, setLoading] = useState(true);
  const trackingTrips = useMemo(() => createShipmentTrips(shipments), [shipments]);
  const { data: positions = [] } = useVehiclePositions(trackingTrips);
  const positionsByTrip = useMemo(() => {
    const map = new Map<string, VehiclePosition>();
    positions.forEach((position) => map.set(position.tripId, position));
    return map;
  }, [positions]);

  useEffect(() => {
    if (!portalUser?.client_id) return;

    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, status, pickup_address, delivery_address, time_window_end, notification_preferences, pickup_lat, pickup_lng, geocoded_pickup_lat, geocoded_pickup_lng, delivery_lat, delivery_lng, geocoded_delivery_lat, geocoded_delivery_lng, vehicle_id, driver_id, created_at, updated_at")
        .eq("client_id", portalUser.client_id)
        .in("status", ["PLANNED", "IN_TRANSIT"])
        .order("created_at", { ascending: false });

      if (!error) setShipments((data ?? []) as ActiveShipment[]);
      setLoading(false);
    };

    load();

    // Subscribe to realtime updates
    const channel = supabase
      .channel("portal-tracking")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `client_id=eq.${portalUser.client_id}`,
        },
        () => load()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [portalUser?.client_id]);

  const handleToggleNotification = async (
    orderId: string,
    currentPrefs: { email: boolean; sms: boolean } | undefined,
    field: "email" | "sms"
  ) => {
    const basePrefs = currentPrefs ?? { email: true, sms: false };
    const updated = { ...basePrefs, [field]: !basePrefs[field] };
    await supabase
      .from("orders")
      .update({ notification_preferences: updated })
      .eq("id", orderId);

    setShipments((prev) =>
      prev.map((s) =>
        s.id === orderId ? { ...s, notification_preferences: updated } : s
      )
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tracking</h1>
        <p className="text-gray-500 mt-1">Volg uw actieve zendingen en ETA-updates</p>
      </div>

      {shipments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Truck className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">Geen actieve zendingen</p>
            <p className="text-gray-400 text-sm mt-1">
              Zendingen die gepland of onderweg zijn verschijnen hier.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {shipments.map((shipment) => (
            <Card key={shipment.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    #{shipment.order_number}
                    <Badge
                      className={cn(
                        "text-[11px] border-0 rounded-full",
                        shipment.status === "IN_TRANSIT"
                          ? "bg-red-100 text-red-700"
                          : "bg-purple-100 text-purple-700"
                      )}
                    >
                      {STATUS_LABELS[shipment.status] ?? shipment.status}
                    </Badge>
                  </CardTitle>
                  {shipment.time_window_end && (
                    <div className="flex items-center gap-1.5 text-sm text-gray-600">
                      <Clock className="h-4 w-4" />
                      ETA: {new Date(shipment.time_window_end).toLocaleTimeString("nl-NL", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {shipment.pickup_address && (
                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-500">Ophalen</p>
                        <p className="text-sm text-gray-900">{shipment.pickup_address}</p>
                      </div>
                    </div>
                  )}
                  {shipment.delivery_address && (
                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-500">Leveren</p>
                        <p className="text-sm text-gray-900">{shipment.delivery_address}</p>
                      </div>
                    </div>
                  )}
                </div>

                <ShipmentMap shipment={shipment} position={positionsByTrip.get(shipment.id)} />

                <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                    Route
                  </span>
                  {positionsByTrip.get(shipment.id) && (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                      Voertuig live of gesimuleerd op basis van ritdata
                    </span>
                  )}
                </div>

                {/* Notification preferences */}
                <div className="flex items-center gap-6 pt-2 border-t border-gray-100">
                  <Bell className="h-4 w-4 text-gray-400" />
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={shipment.notification_preferences?.email ?? true}
                      onCheckedChange={() =>
                        handleToggleNotification(shipment.id, shipment.notification_preferences, "email")
                      }
                    />
                    <Label className="text-xs text-gray-600">E-mail updates</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={shipment.notification_preferences?.sms ?? false}
                      onCheckedChange={() =>
                        handleToggleNotification(shipment.id, shipment.notification_preferences, "sms")
                      }
                    />
                    <Label className="text-xs text-gray-600">SMS updates</Label>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
