import { useState, useEffect } from "react";
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

interface ActiveShipment {
  id: string;
  order_number: number;
  status: string;
  pickup_address: string | null;
  delivery_address: string | null;
  time_window_end: string | null;
  notification_preferences: { email: boolean; sms: boolean };
}

const STATUS_LABELS: Record<string, string> = {
  PLANNED: "Gepland",
  IN_TRANSIT: "Onderweg",
  DELIVERED: "Afgeleverd",
};

export default function PortalTracking() {
  const { data: portalUser } = useCurrentPortalUser();
  const [shipments, setShipments] = useState<ActiveShipment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!portalUser?.client_id) return;

    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, status, pickup_address, delivery_address, time_window_end, notification_preferences")
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
    currentPrefs: { email: boolean; sms: boolean },
    field: "email" | "sms"
  ) => {
    const updated = { ...currentPrefs, [field]: !currentPrefs[field] };
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
        <p className="text-gray-500 mt-1">Volg uw actieve zendingen in realtime</p>
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

                {/* Map placeholder — use Leaflet in production */}
                <div className="h-48 rounded-lg bg-gray-100 flex items-center justify-center border border-gray-200">
                  <div className="text-center text-gray-400">
                    <MapPin className="h-8 w-8 mx-auto mb-1" />
                    <p className="text-xs">Live kaart wordt hier weergegeven</p>
                  </div>
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
