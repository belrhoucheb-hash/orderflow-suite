import { useState } from "react";
import { Check, X, Play, MapPin, Navigation, AlertTriangle, Camera, Fingerprint, Package, Truck, ChevronRight, Clock } from "lucide-react";
import { PackagingRegistration } from "./PackagingRegistration";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useDriverTrips, useUpdateTripStatus, useUpdateStopStatus } from "@/hooks/useTrips";
import { checkTripCompletion } from "@/hooks/useBillingStatus";
import { TripStatusBadge, StopStatusBadge, TripProgressBar } from "@/components/dispatch/TripStatusBadge";
import type { Trip, TripStop } from "@/types/dispatch";
import { toast } from "sonner";
import { PreDepartureInfoCheck } from "./PreDepartureInfoCheck";
import { IncidentDialog } from "./IncidentDialog";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  driverId: string;
  onStartPOD: (stop: TripStop) => void; // Callback to show POD capture in parent
  onTripStarted?: (tripId: string) => void;  // Called when trip becomes ACTIEF
  onTripCompleted?: (tripId: string) => void; // Called when trip is completed
}

export function TripFlow({ driverId, onStartPOD, onTripStarted, onTripCompleted }: Props) {
  const { tenant } = useTenant();
  const { data: trips = [], isLoading } = useDriverTrips(driverId);
  const updateTrip = useUpdateTripStatus();
  const updateStop = useUpdateStopStatus();
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [packagingStopId, setPackagingStopId] = useState<string | null>(null);
  const [pendingStartTripId, setPendingStartTripId] = useState<string | null>(null);
  const [incidentStop, setIncidentStop] = useState<TripStop | null>(null);
  const plannerPhone = (import.meta as any).env?.VITE_PLANNER_PHONE ?? null;

  const selectedTrip = trips.find(t => t.id === selectedTripId);
  const stops = (selectedTrip as any)?.trip_stops as TripStop[] || [];
  const sortedStops = [...stops].sort((a, b) => a.stop_sequence - b.stop_sequence);
  const currentStop = sortedStops.find(s => ["ONDERWEG", "AANGEKOMEN", "LADEN", "LOSSEN"].includes(s.stop_status));

  // ─── Trip Inbox (no trip selected) ───
  if (!selectedTripId) {
    if (isLoading) return <div className="p-6 text-center text-gray-400">Ritten laden...</div>;
    if (trips.length === 0) return (
      <div className="p-8 text-center">
        <Truck className="h-12 w-12 text-gray-200 mx-auto mb-3" />
        <p className="text-sm font-semibold text-gray-500">Geen ritten</p>
        <p className="text-xs text-gray-400 mt-1">Er zijn momenteel geen ritten naar je verstuurd.</p>
      </div>
    );

    return (
      <div className="space-y-3 p-4">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Ritten ({trips.length})</p>
        {trips.map(trip => {
          const tripStops = (trip as any).trip_stops || [];
          const needsAction = ["VERZONDEN", "ONTVANGEN"].includes(trip.dispatch_status);
          const isActive = trip.dispatch_status === "ACTIEF";
          return (
            <button key={trip.id} onClick={() => setSelectedTripId(trip.id)}
              className={cn("w-full text-left rounded-xl border p-4 transition-all",
                isActive ? "border-green-300 bg-green-50 shadow-sm" :
                needsAction ? "border-amber-300 bg-amber-50 shadow-sm" :
                "border-gray-200 bg-white hover:border-gray-300"
              )}>
              <div className="flex items-center justify-between mb-2">
                <TripStatusBadge status={trip.dispatch_status} />
                <span className="text-xs text-gray-400">{trip.planned_date}</span>
              </div>
              <p className="text-sm font-bold text-gray-900">{tripStops.length} stops</p>
              <TripProgressBar stops={tripStops} />
              {needsAction && (
                <div className="flex gap-2 mt-3">
                  <Button size="sm" className="flex-1 h-9 text-xs bg-green-600 hover:bg-green-700"
                    onClick={(e) => { e.stopPropagation(); handleAccept(trip.id); }}>
                    <Check className="h-3.5 w-3.5 mr-1" /> Accepteren
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 h-9 text-xs text-red-600 border-red-200 hover:bg-red-50"
                    onClick={(e) => { e.stopPropagation(); handleRefuse(trip.id); }}>
                    <X className="h-3.5 w-3.5 mr-1" /> Weigeren
                  </Button>
                </div>
              )}
              {isActive && (
                <p className="text-xs text-green-600 font-semibold mt-2 flex items-center gap-1">
                  <Play className="h-3 w-3 fill-current" /> Rit is actief — tik om te bekijken
                </p>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  // ─── Active Trip View ───
  const handleAccept = async (tripId: string) => {
    try {
      await updateTrip.mutateAsync({ tripId, status: "GEACCEPTEERD" });
      toast.success("Rit geaccepteerd");
    } catch (e: any) { toast.error(e.message); }
  };

  const handleRefuse = async (tripId: string) => {
    try {
      await updateTrip.mutateAsync({ tripId, status: "GEWEIGERD" });
      toast.info("Rit geweigerd — dispatcher wordt op de hoogte gebracht");
      setSelectedTripId(null);
    } catch (e: any) { toast.error(e.message); }
  };

  /** §22 REQ-22.6 — triggert pre-departure info-check, die bij ok de echte start doet. */
  const handleStartTrip = () => {
    if (!selectedTrip) return;
    setPendingStartTripId(selectedTrip.id);
  };

  const doStartTrip = async () => {
    if (!selectedTrip) return;
    setPendingStartTripId(null);
    try {
      await updateTrip.mutateAsync({ tripId: selectedTrip.id, status: "ACTIEF" });
      const firstStop = sortedStops.find(s => s.stop_status === "GEPLAND");
      if (firstStop) await updateStop.mutateAsync({ stopId: firstStop.id, status: "ONDERWEG" });
      onTripStarted?.(selectedTrip.id);
      toast.success("Rit gestart");
    } catch (e: any) { toast.error(e.message); }
  };

  const orderIdsInTrip: string[] = Array.from(new Set(
    sortedStops
      .map(s => (s as any).order_id as string | null | undefined)
      .filter((v): v is string => !!v)
  ));

  const handleArrived = async (stopId: string) => {
    try {
      await updateStop.mutateAsync({ stopId, status: "AANGEKOMEN" });
      toast.success("Aangekomen bij stop");
    } catch (e: any) { toast.error(e.message); }
  };

  const handleStartUnload = async (stopId: string) => {
    try {
      await updateStop.mutateAsync({ stopId, status: "LOSSEN" });
    } catch (e: any) { toast.error(e.message); }
  };

  const handleCompleteStop = async (stop: TripStop) => {
    // Trigger POD capture in parent
    onStartPOD(stop);
  };

  const handleFailStop = (stop: TripStop) => {
    // Open de gestructureerde incident-dialog. De daadwerkelijke status-
    // overgang gebeurt pas na een succesvolle incident-insert.
    setIncidentStop(stop);
  };

  const handleIncidentSubmitted = async (result: {
    incidentId: string;
    reason: string;
    newStopStatus: "MISLUKT" | "OVERGESLAGEN";
    notes: string | null;
  }) => {
    if (!incidentStop) return;
    const stopId = incidentStop.id;
    setIncidentStop(null);
    try {
      await updateStop.mutateAsync({
        stopId,
        status: result.newStopStatus,
        extra: {
          failure_reason: result.reason,
          extra: {
            incident_id: result.incidentId,
            incident_notes: result.notes,
          },
        },
      });

      // Plan-board waarschuwen: planner-notificatie met severity high.
      if (tenant?.id) {
        try {
          await supabase.from("notifications").insert({
            tenant_id: tenant.id,
            type: "warning",
            title: "Incident bij stop",
            message: `Chauffeur heeft een incident gemeld: ${result.reason}.`,
            icon: "alert-triangle",
            order_id: incidentStop.order_id ?? null,
            metadata: {
              severity: "high",
              incident_id: result.incidentId,
              trip_stop_id: stopId,
              category: "stop_incident",
            },
            is_read: false,
          });
        } catch (notifErr) {
          console.warn("Planner-notificatie mislukt:", notifErr);
        }
      }

      // Advance to next stop
      const nextStop = sortedStops.find((s) => s.stop_status === "GEPLAND");
      if (nextStop) {
        await updateStop.mutateAsync({ stopId: nextStop.id, status: "ONDERWEG" });
      } else if (selectedTrip) {
        const completed = await checkTripCompletion(selectedTrip.id);
        if (completed) onTripCompleted?.(selectedTrip.id);
      }
      toast.info("Probleem gemeld");
    } catch (e: any) {
      toast.error(e.message ?? "Kon stopstatus niet bijwerken");
    }
  };

  const handleNavigate = (address: string) => {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`, "_blank");
  };

  if (!selectedTrip) return null;

  return (
    <div className="flex flex-col h-full">
      <PreDepartureInfoCheck
        open={!!pendingStartTripId}
        orderIds={orderIdsInTrip}
        plannerPhone={plannerPhone}
        onCancel={() => setPendingStartTripId(null)}
        onProceed={doStartTrip}
      />
      {incidentStop && (
        <IncidentDialog
          open={!!incidentStop}
          onOpenChange={(open) => { if (!open) setIncidentStop(null); }}
          tenantId={tenant?.id ?? null}
          tripStopId={incidentStop.id}
          orderId={incidentStop.order_id ?? null}
          driverId={driverId}
          onSubmitted={handleIncidentSubmitted}
        />
      )}
      {/* Trip header */}
      <div className="p-4 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => setSelectedTripId(null)} className="text-xs text-gray-400 hover:text-gray-600">← Terug</button>
          <TripStatusBadge status={selectedTrip.dispatch_status} />
        </div>
        <TripProgressBar stops={sortedStops} />

        {selectedTrip.dispatch_status === "GEACCEPTEERD" && (
          <Button className="w-full mt-3 h-12 text-sm font-bold bg-green-600 hover:bg-green-700 rounded-xl" onClick={handleStartTrip}>
            <Play className="h-4 w-4 mr-2 fill-current" /> Start Rit
          </Button>
        )}

        {["VERZONDEN", "ONTVANGEN"].includes(selectedTrip.dispatch_status) && (
          <div className="flex gap-2 mt-3">
            <Button className="flex-1 h-10 bg-green-600 hover:bg-green-700" onClick={() => handleAccept(selectedTrip.id)}>
              <Check className="h-4 w-4 mr-1" /> Accepteren
            </Button>
            <Button variant="outline" className="flex-1 h-10 text-red-600 border-red-200" onClick={() => handleRefuse(selectedTrip.id)}>
              <X className="h-4 w-4 mr-1" /> Weigeren
            </Button>
          </div>
        )}
      </div>

      {/* Stop list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {sortedStops.map((stop, i) => {
          const isCurrentStop = stop.id === currentStop?.id;
          const isDone = ["AFGELEVERD", "MISLUKT", "OVERGESLAGEN"].includes(stop.stop_status);
          const order = (stop as any).order;

          return (
            <div key={stop.id} className={cn(
              "rounded-xl border p-4 transition-all",
              isCurrentStop ? "border-primary bg-primary/5 shadow-md" :
              isDone ? "border-gray-100 bg-gray-50 opacity-60" :
              "border-gray-200 bg-white"
            )}>
              {/* Stop header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={cn("h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold",
                    isDone ? "bg-green-100 text-green-600" : isCurrentStop ? "bg-primary/10 text-primary" : "bg-gray-100 text-gray-500"
                  )}>
                    {isDone ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  <span className="text-xs font-semibold uppercase text-gray-400">{stop.stop_type === "PICKUP" ? "Ophalen" : "Leveren"}</span>
                </div>
                <StopStatusBadge status={stop.stop_status as any} />
              </div>

              {/* Address */}
              <p className="text-sm font-bold text-gray-900 mb-1">{stop.planned_address || "Adres onbekend"}</p>
              {stop.contact_name && <p className="text-xs text-gray-500">{stop.contact_name} {stop.contact_phone && `· ${stop.contact_phone}`}</p>}
              {stop.instructions && <p className="text-xs text-amber-600 mt-1">📋 {stop.instructions}</p>}

              {/* Navigate button — always visible for non-completed stops */}
              {!isDone && stop.planned_address && (
                <Button
                  className="w-full mt-2 h-11 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl shadow-sm"
                  onClick={() => handleNavigate(stop.planned_address || "")}
                >
                  <Navigation className="h-4 w-4 mr-2" /> Navigeer naar adres
                </Button>
              )}

              {/* Actions — only for current stop */}
              {isCurrentStop && (
                <div className="mt-3 space-y-2">
                  {stop.stop_status === "ONDERWEG" && (
                    <Button size="sm" className="w-full h-10" onClick={() => handleArrived(stop.id)}>
                      <MapPin className="h-4 w-4 mr-1" /> Ik ben er
                    </Button>
                  )}
                  {stop.stop_status === "AANGEKOMEN" && (
                    <Button className="w-full h-10" onClick={() => handleStartUnload(stop.id)}>
                      <Package className="h-4 w-4 mr-1" /> Start lossen
                    </Button>
                  )}
                  {stop.stop_status === "LOSSEN" && (
                    <>
                      {/* Emballage registration inline */}
                      {packagingStopId === stop.id ? (
                        <PackagingRegistration
                          clientId={(stop as any).order?.client_id ?? ""}
                          orderId={(stop as any).order_id ?? undefined}
                          tripStopId={stop.id}
                          onClose={() => setPackagingStopId(null)}
                        />
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full h-9 text-xs gap-1.5 border-amber-200 text-amber-700 hover:bg-amber-50"
                          onClick={() => setPackagingStopId(stop.id)}
                        >
                          <Package className="h-3.5 w-3.5" /> Emballage registreren
                        </Button>
                      )}
                      <div className="flex gap-2">
                        <Button className="flex-1 h-10 bg-green-600 hover:bg-green-700" onClick={() => handleCompleteStop(stop)}>
                          <Fingerprint className="h-4 w-4 mr-1" /> Aflevering voltooien
                        </Button>
                        <Button variant="outline" className="h-10 text-red-600 border-red-200" onClick={() => handleFailStop(stop)}>
                          <AlertTriangle className="h-4 w-4" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
