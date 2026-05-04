import { useState } from "react";
import { Check, X, Play, MapPin, Navigation, AlertTriangle, Fingerprint, Package, Truck } from "lucide-react";
import { PackagingRegistration } from "./PackagingRegistration";
import { LiveTripMap } from "./LiveTripMap";
import { NextStopHero } from "./NextStopHero";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDriverTrips, useUpdateTripStatus, useUpdateStopStatus } from "@/hooks/useTrips";
import { checkTripCompletion } from "@/hooks/useBillingStatus";
import { TripStatusBadge, StopStatusBadge, TripProgressBar } from "@/components/dispatch/TripStatusBadge";
import type { TripStop } from "@/types/dispatch";
import { toast } from "sonner";
import { PreDepartureInfoCheck } from "./PreDepartureInfoCheck";
import { SwipeToConfirm } from "./SwipeToConfirm";
import { vibrate, HAPTICS } from "@/lib/haptics";

interface Props {
  driverId: string;
  currentPosition?: { lat: number; lng: number } | null;
  onStartPOD: (stop: TripStop) => void; // Callback to show POD capture in parent
  onTripStarted?: (tripId: string) => void;  // Called when trip becomes ACTIEF
  onTripCompleted?: (tripId: string) => void; // Called when trip is completed
}

export function TripFlow({ driverId, currentPosition = null, onStartPOD, onTripStarted, onTripCompleted }: Props) {
  const { data: trips = [], isLoading } = useDriverTrips(driverId);
  const updateTrip = useUpdateTripStatus();
  const updateStop = useUpdateStopStatus();
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [packagingStopId, setPackagingStopId] = useState<string | null>(null);
  const [pendingStartTripId, setPendingStartTripId] = useState<string | null>(null);
  const plannerPhone = (import.meta as any).env?.VITE_PLANNER_PHONE ?? null;

  const selectedTrip = trips.find(t => t.id === selectedTripId);
  const stops = (selectedTrip as any)?.trip_stops as TripStop[] || [];
  const sortedStops = [...stops].sort((a, b) => a.stop_sequence - b.stop_sequence);
  const currentStop = sortedStops.find(s => ["ONDERWEG", "AANGEKOMEN", "LADEN", "LOSSEN"].includes(s.stop_status));

  // ─── Trip Inbox (no trip selected) ───
  if (!selectedTripId) {
    if (isLoading) return <div className="p-6 text-center text-muted-foreground">Ritten laden...</div>;
    if (trips.length === 0) return (
      <div className="p-8 text-center">
        <Truck className="h-12 w-12 text-[hsl(var(--gold)/0.3)] mx-auto mb-3" />
        <p className="text-sm font-semibold text-slate-600 font-display">Geen ritten</p>
        <p className="text-xs text-slate-400 mt-1">Er zijn momenteel geen ritten naar je verstuurd.</p>
      </div>
    );

    return (
      <div className="space-y-3">
        <p className="text-[10px] font-bold text-[hsl(var(--gold-deep))] uppercase tracking-[0.18em] mb-2 font-display">
          Ritten ({trips.length})
        </p>
        {trips.map(trip => {
          const tripStops = (trip as any).trip_stops || [];
          const needsAction = ["VERZONDEN", "ONTVANGEN"].includes(trip.dispatch_status);
          const isActive = trip.dispatch_status === "ACTIEF";
          return (
            <button
              key={trip.id}
              onClick={() => setSelectedTripId(trip.id)}
              className={cn(
                "card--luxe w-full text-left p-4 transition-all active:scale-[0.99]",
                isActive && "border-emerald-300 bg-emerald-50/40",
                needsAction && "border-[hsl(var(--gold)/0.45)] bg-[hsl(var(--gold-soft)/0.35)]",
                !isActive && !needsAction && "border-[hsl(var(--gold)/0.18)]",
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <TripStatusBadge status={trip.dispatch_status} />
                <span className="text-xs text-slate-400 tabular-nums font-display">{trip.planned_date}</span>
              </div>
              <p className="text-sm font-bold text-slate-900 font-display">{tripStops.length} stops</p>
              <TripProgressBar stops={tripStops} />
              {needsAction && (
                <div className="flex gap-2 mt-3">
                  <Button size="sm" className="btn-luxe btn-luxe--primary flex-1 h-9 text-xs"
                    onClick={(e) => { e.stopPropagation(); handleAccept(trip.id); }}>
                    <Check className="h-3.5 w-3.5 mr-1" /> Accepteren
                  </Button>
                  <Button size="sm" variant="outline" className="btn-luxe btn-luxe--secondary flex-1 h-9 text-xs text-red-600 border-red-200 hover:bg-red-50"
                    onClick={(e) => { e.stopPropagation(); handleRefuse(trip.id); }}>
                    <X className="h-3.5 w-3.5 mr-1" /> Weigeren
                  </Button>
                </div>
              )}
              {isActive && (
                <p className="text-xs text-emerald-700 font-semibold mt-2 flex items-center gap-1 font-display">
                  <Play className="h-3 w-3 fill-current" /> Rit is actief, tik om te bekijken
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
      vibrate(HAPTICS.short);
    } catch (e: any) {
      toast.error(e.message);
      vibrate(HAPTICS.errorBurst);
    }
  };

  const handleRefuse = async (tripId: string) => {
    try {
      await updateTrip.mutateAsync({ tripId, status: "GEWEIGERD" });
      toast.info("Rit geweigerd, dispatcher wordt op de hoogte gebracht");
      setSelectedTripId(null);
    } catch (e: any) {
      toast.error(e.message);
      vibrate(HAPTICS.errorBurst);
    }
  };

  /** §22 REQ-22.6, triggert pre-departure info-check, die bij ok de echte start doet. */
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
      vibrate(HAPTICS.short);
    } catch (e: any) {
      toast.error(e.message);
      vibrate(HAPTICS.errorBurst);
    }
  };

  const orderIdsInTrip: string[] = Array.from(new Set(
    sortedStops
      .map(s => (s as any).order_id as string | null | undefined)
      .filter((v): v is string => !!v)
  ));

  const handleArrived = async (stopId: string) => {
    try {
      await updateStop.mutateAsync({ stopId, status: "AANGEKOMEN" });
      vibrate(HAPTICS.short);
      toast.success("Aangekomen bij stop", {
        action: {
          label: "Ongedaan maken",
          onClick: async () => {
            try {
              await updateStop.mutateAsync({ stopId, status: "ONDERWEG" });
              toast.info("Aankomst teruggedraaid");
            } catch (e: any) {
              toast.error("Kon niet terugzetten: " + (e.message ?? ""));
            }
          },
        },
        duration: 5000,
      });
    } catch (e: any) {
      toast.error(e.message);
      vibrate(HAPTICS.errorBurst);
    }
  };

  const handleStartUnload = async (stopId: string) => {
    try {
      await updateStop.mutateAsync({ stopId, status: "LOSSEN" });
      vibrate(HAPTICS.short);
    } catch (e: any) {
      toast.error(e.message);
      vibrate(HAPTICS.errorBurst);
    }
  };

  const handleCompleteStop = (stop: TripStop) => {
    vibrate(HAPTICS.short);
    onStartPOD(stop);
  };

  const handleFailStop = async (stopId: string) => {
    try {
      await updateStop.mutateAsync({ stopId, status: "MISLUKT", extra: { failure_reason: "Door chauffeur gemeld" } });
      const nextStop = sortedStops.find(s => s.stop_status === "GEPLAND");
      if (nextStop) await updateStop.mutateAsync({ stopId: nextStop.id, status: "ONDERWEG" });
      else if (selectedTrip) {
        const completed = await checkTripCompletion(selectedTrip.id);
        if (completed) onTripCompleted?.(selectedTrip.id);
      }
      toast.info("Probleem gemeld");
    } catch (e: any) {
      toast.error(e.message);
      vibrate(HAPTICS.errorBurst);
    }
  };

  const handleNavigate = (address: string) => {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`, "_blank");
  };

  if (!selectedTrip) return null;

  return (
    <div className="flex flex-col">
      <PreDepartureInfoCheck
        open={!!pendingStartTripId}
        orderIds={orderIdsInTrip}
        plannerPhone={plannerPhone}
        onCancel={() => setPendingStartTripId(null)}
        onProceed={doStartTrip}
      />
      {/* Trip header */}
      <div className="card--luxe p-4 mb-3 border-[hsl(var(--gold)/0.18)]">
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => setSelectedTripId(null)} className="text-xs text-[hsl(var(--gold-deep))] hover:underline font-display">
            ← Terug
          </button>
          <TripStatusBadge status={selectedTrip.dispatch_status} />
        </div>
        <TripProgressBar stops={sortedStops} />

        {selectedTrip.dispatch_status === "GEACCEPTEERD" && (
          <Button className="btn-luxe btn-luxe--primary w-full mt-3 h-12 text-sm font-bold" onClick={handleStartTrip}>
            <Play className="h-4 w-4 mr-2 fill-current" /> Start rit
          </Button>
        )}

        {["VERZONDEN", "ONTVANGEN"].includes(selectedTrip.dispatch_status) && (
          <div className="flex gap-2 mt-3">
            <Button className="btn-luxe btn-luxe--primary flex-1 h-10" onClick={() => handleAccept(selectedTrip.id)}>
              <Check className="h-4 w-4 mr-1" /> Accepteren
            </Button>
            <Button variant="outline" className="btn-luxe btn-luxe--secondary flex-1 h-10 text-red-600 border-red-200" onClick={() => handleRefuse(selectedTrip.id)}>
              <X className="h-4 w-4 mr-1" /> Weigeren
            </Button>
          </div>
        )}
      </div>

      {/* Live navigation hero + map (only while trip is active) */}
      {selectedTrip.dispatch_status === "ACTIEF" && currentStop && (
        <div className="space-y-3 px-4 pt-4">
          <NextStopHero
            stop={currentStop}
            currentPosition={currentPosition ?? null}
            onNavigate={() => handleNavigate(currentStop.planned_address || "")}
            onCall={() => {
              if (currentStop.contact_phone) {
                window.location.href = `tel:${currentStop.contact_phone}`;
              }
            }}
          />
          <LiveTripMap
            currentPosition={currentPosition ?? null}
            stops={sortedStops}
            currentStopId={currentStop.id}
          />
        </div>
      )}

      {/* Stop list */}
      <div className="space-y-3">
        {sortedStops.map((stop, i) => {
          const isCurrentStop = stop.id === currentStop?.id;
          const isDone = ["AFGELEVERD", "MISLUKT", "OVERGESLAGEN"].includes(stop.stop_status);

          return (
            <div key={stop.id} className={cn(
              "card--luxe p-4 transition-all",
              isCurrentStop ? "border-[hsl(var(--gold)/0.5)] bg-[hsl(var(--gold-soft)/0.28)]" :
              isDone ? "border-[hsl(var(--gold)/0.1)] opacity-60" :
              "border-[hsl(var(--gold)/0.18)]"
            )}>
              {/* Stop header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold tabular-nums font-display",
                    isDone ? "bg-emerald-100 text-emerald-700" :
                    isCurrentStop ? "bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-deep))] text-white shadow-sm" :
                    "bg-[hsl(var(--gold-soft)/0.6)] text-[hsl(var(--gold-deep))]",
                  )}>
                    {isDone ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  <span className="text-[10px] font-semibold uppercase text-[hsl(var(--gold-deep))] tracking-[0.18em] font-display">
                    {stop.stop_type === "PICKUP" ? "Ophalen" : "Leveren"}
                  </span>
                </div>
                <StopStatusBadge status={stop.stop_status as any} />
              </div>

              {/* Address */}
              <p className="text-sm font-bold text-slate-900 mb-1 font-display">{stop.planned_address || "Adres onbekend"}</p>
              {stop.contact_name && (
                <p className="text-xs text-slate-500">
                  {stop.contact_name}
                  {stop.contact_phone && (
                    <>
                      {" · "}
                      <a href={`tel:${stop.contact_phone}`} className="text-[hsl(var(--gold-deep))] underline tabular-nums">
                        {stop.contact_phone}
                      </a>
                    </>
                  )}
                </p>
              )}
              {stop.instructions && <p className="text-xs text-amber-700 mt-1">📋 {stop.instructions}</p>}

              {/* Navigate button — always visible for non-completed stops */}
              {!isDone && stop.planned_address && (
                <Button
                  className="btn-luxe btn-luxe--primary w-full mt-2 h-11 font-semibold"
                  onClick={() => handleNavigate(stop.planned_address || "")}
                >
                  <Navigation className="h-4 w-4 mr-2" /> Navigeer naar adres
                </Button>
              )}

              {/* Actions, only for current stop */}
              {isCurrentStop && (
                <div className="mt-3 space-y-2">
                  {stop.stop_status === "ONDERWEG" && (
                    <SwipeToConfirm
                      label="Veeg om aan te komen"
                      icon={<MapPin className="h-4 w-4" />}
                      onConfirm={() => handleArrived(stop.id)}
                    />
                  )}
                  {stop.stop_status === "AANGEKOMEN" && (
                    <SwipeToConfirm
                      label="Veeg om te starten met lossen"
                      icon={<Package className="h-4 w-4" />}
                      onConfirm={() => handleStartUnload(stop.id)}
                    />
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
                          className="btn-luxe btn-luxe--secondary w-full h-9 text-xs gap-1.5"
                          onClick={() => setPackagingStopId(stop.id)}
                        >
                          <Package className="h-3.5 w-3.5" /> Emballage registreren
                        </Button>
                      )}
                      <div className="flex gap-2 items-stretch">
                        <div className="flex-1">
                          <SwipeToConfirm
                            label="Veeg om aflevering te voltooien"
                            icon={<Fingerprint className="h-4 w-4" />}
                            variant="success"
                            onConfirm={() => handleCompleteStop(stop)}
                          />
                        </div>
                        <Button
                          variant="outline"
                          className="btn-luxe btn-luxe--secondary h-[60px] px-3 text-red-600 border-red-200 shrink-0"
                          onClick={() => handleFailStop(stop.id)}
                          aria-label="Probleem melden"
                        >
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
