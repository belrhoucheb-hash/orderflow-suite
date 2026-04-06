import { useState, useEffect, useCallback } from "react";
import {
  MapPin,
  CheckCircle2,
  LogOut,
  Clock,
  Coffee,
  Play,
  Square,
  WifiOff,
  RefreshCw,
  Bell,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useDrivers } from "@/hooks/useDrivers";
import {
  useGPSTracking,
  useTimeTracking,
  useGeofenceCheck,
  useDriveTime,
} from "@/hooks/useDriverTracking";
import { usePositionReporter } from "@/hooks/usePositionReporter";
import { useNotifications } from "@/hooks/useNotifications";
import { usePinAuth } from "@/hooks/usePinAuth";
import { usePodCapture } from "@/hooks/usePodCapture";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { TripFlow } from "@/components/chauffeur/TripFlow";
import { useDriverTrips, useUpdateStopStatus } from "@/hooks/useTrips";
import { DriveTimeMonitor } from "@/components/chauffeur/DriveTimeMonitor";
import { ChauffeurLoginScreen } from "@/components/chauffeur/ChauffeurLoginScreen";
import { ChauffeurPinChange } from "@/components/chauffeur/ChauffeurPinChange";
import { PodCaptureSheet, PodViewer } from "@/components/chauffeur/PodCaptureSheet";
import { NotificationPanel } from "@/components/chauffeur/NotificationPanel";
import { OrderCard } from "@/components/chauffeur/OrderCard";
import type { TripStop } from "@/types/dispatch";

export default function ChauffeurApp() {
  const { data: drivers, isLoading: driversLoading } = useDrivers();
  const [activeDriverId, setActiveDriverId] = useState<string | null>(
    localStorage.getItem("orderflow_driver_id")
  );

  // -- PIN Auth --
  const pinAuth = usePinAuth((driverId) => setActiveDriverId(driverId));

  // -- Orders --
  const [orders, setOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  const fetchDriverOrders = useCallback(async (driverId: string) => {
    setLoadingOrders(true);
    try {
      const driver = drivers?.find((d) => d.id === driverId);
      if (!driver?.current_vehicle_id) { setOrders([]); return; }
      const { data, error } = await supabase
        .from("orders" as any)
        .select("*")
        .eq("vehicle_id", driver.current_vehicle_id)
        .in("status", ["PLANNED", "IN_TRANSIT", "DELIVERED"])
        .order("stop_sequence", { ascending: true });
      if (error) throw error;
      setOrders(data || []);
    } catch {
      toast.error("Fout bij ophalen rittenlijst");
    } finally {
      setLoadingOrders(false);
    }
  }, [drivers]);

  // -- PoD Capture --
  const pod = usePodCapture(() => {
    if (activeDriverId) fetchDriverOrders(activeDriverId);
  });

  // -- Notifications --
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [showNotifPanel, setShowNotifPanel] = useState(false);

  // -- GPS & Time Tracking --
  const { isTracking, currentPosition, startTracking, stopTracking } = useGPSTracking(activeDriverId);
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const activeDriverVehicleId = drivers?.find((d) => d.id === activeDriverId)?.current_vehicle_id || null;
  const positionReporter = usePositionReporter(activeTripId, activeDriverId, activeDriverVehicleId, null);
  const { isClocked, isOnBreak, clockIn, clockOut, startBreak, endBreak, totalHoursToday, todayEntries } = useTimeTracking(activeDriverId);
  const driveTime = useDriveTime(isClocked, isOnBreak, todayEntries);

  // -- Geofence --
  const { data: driverTrips = [] } = useDriverTrips(activeDriverId);
  const updateStopStatus = useUpdateStopStatus();
  const allActiveStops: TripStop[] = driverTrips.flatMap(
    (trip: any) => (trip.trip_stops || []) as TripStop[]
  );
  const handleGeofenceArrival = useCallback(async (stopId: string) => {
    try {
      await updateStopStatus.mutateAsync({ stopId, status: "AANGEKOMEN" });
      toast.success("Aankomst geregistreerd!");
    } catch { toast.error("Kon aankomst niet registreren"); }
  }, [updateStopStatus]);
  useGeofenceCheck(currentPosition, allActiveStops, handleGeofenceArrival);

  // -- Offline POD sync on mount --
  useEffect(() => {
    pod.refreshPendingCount();
    if (navigator.onLine) pod.handleSyncPending();
    const handleOnline = () => {
      toast.info("Verbinding hersteld, bezig met synchroniseren...");
      pod.handleSyncPending();
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [pod.refreshPendingCount, pod.handleSyncPending]);

  // -- Login persistence --
  useEffect(() => {
    if (activeDriverId) {
      localStorage.setItem("orderflow_driver_id", activeDriverId);
      fetchDriverOrders(activeDriverId);
    } else {
      localStorage.removeItem("orderflow_driver_id");
      setOrders([]);
    }
  }, [activeDriverId, fetchDriverOrders]);

  const activeDriver = drivers?.find((d) => d.id === activeDriverId);

  // -- Action handlers --
  const handleToggleGPS = () => {
    if (isTracking) { stopTracking(); toast.info("GPS tracking gestopt"); }
    else { startTracking(); toast.success("GPS tracking gestart"); }
  };

  const handleClockIn = async () => {
    try { await clockIn(); toast.success("Ingeklokt!"); }
    catch { toast.error("Kon niet inklokken"); }
  };

  const handleClockOut = async () => {
    try { if (isTracking) stopTracking(); await clockOut(); toast.success("Uitgeklokt!"); }
    catch { toast.error("Kon niet uitklokken"); }
  };

  const handleToggleBreak = async () => {
    try {
      if (isOnBreak) { await endBreak(); toast.info("Pauze beeindigd"); }
      else { await startBreak(); toast.info("Pauze gestart"); }
    } catch { toast.error("Kon pauze niet wijzigen"); }
  };

  const formatHours = (hours: number): string => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}u ${m}m`;
  };

  const handleLogout = () => { setActiveDriverId(null); pinAuth.resetPinState(); };

  // --- RENDERS ---

  if (driversLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (pinAuth.showChangePin && pinAuth.pendingDriverId) {
    const pendingDriver = drivers?.find((d) => d.id === pinAuth.pendingDriverId);
    return (
      <ChauffeurPinChange
        driverName={pendingDriver?.name || ""}
        newPin={pinAuth.newPin} setNewPin={pinAuth.setNewPin}
        confirmNewPin={pinAuth.confirmNewPin} setConfirmNewPin={pinAuth.setConfirmNewPin}
        pinError={pinAuth.pinError} setPinError={pinAuth.setPinError}
        handleChangePin={pinAuth.handleChangePin}
      />
    );
  }

  if (!activeDriverId) {
    return (
      <ChauffeurLoginScreen
        drivers={drivers || []}
        pendingDriverId={pinAuth.pendingDriverId}
        pinInput={pinAuth.pinInput} setPinInput={pinAuth.setPinInput}
        pinError={pinAuth.pinError} setPinError={pinAuth.setPinError}
        pinVerifying={pinAuth.pinVerifying}
        pinLockedUntil={pinAuth.pinLockedUntil}
        pinLockCountdown={pinAuth.pinLockCountdown}
        handleDriverSelect={pinAuth.handleDriverSelect}
        handlePinSubmit={pinAuth.handlePinSubmit}
      />
    );
  }

  return (
    <div className="h-screen w-full bg-slate-50 flex flex-col overflow-hidden fixed inset-0">
      {/* HEADER */}
      <header className="bg-primary px-6 py-5 text-white flex justify-between items-center z-10 shadow-md">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-white/20 rounded-full flex items-center justify-center font-bold">
            {activeDriver?.name.charAt(0)}
          </div>
          <div>
            <h2 className="font-semibold text-lg leading-tight">{activeDriver?.name}</h2>
            <p className="text-xs text-primary-foreground/80 font-medium tracking-wide flex items-center gap-1.5">
              {orders.filter((o) => o.status === "DELIVERED").length} / {orders.length} Voltooid
              {activeTripId && (
                <span className={`inline-block h-2 w-2 rounded-full ${positionReporter.isTracking ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`}
                  title={positionReporter.isTracking ? "GPS tracking actief" : "Geen GPS signaal"} />
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={handleToggleGPS}
            className={`rounded-full h-10 w-10 transition-colors ${isTracking ? "bg-emerald-500/30 text-emerald-300 hover:bg-emerald-500/40" : "text-white/60 hover:bg-white/20"}`}
            title={isTracking ? "GPS actief" : "GPS uit"}>
            <MapPin className={`h-5 w-5 ${isTracking ? "animate-pulse" : ""}`} />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setShowNotifPanel(!showNotifPanel)}
            className="relative rounded-full h-10 w-10 text-white hover:bg-white/20" title="Notificaties">
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-5 min-w-[20px] px-1 rounded-full bg-red-500 text-xs text-white flex items-center justify-center font-bold shadow-sm">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Button>
          <Button variant="ghost" size="icon" onClick={handleLogout} className="text-white hover:bg-white/20 rounded-full h-10 w-10">
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {showNotifPanel && (
        <NotificationPanel
          notifications={notifications}
          unreadCount={unreadCount}
          markAsRead={markAsRead}
          markAllAsRead={markAllAsRead}
          onClose={() => setShowNotifPanel(false)}
        />
      )}

      {/* Offline POD Banner */}
      {pod.pendingPODCount > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <WifiOff className="h-4 w-4 text-amber-600" />
            <span className="text-sm font-medium text-amber-800">
              {pod.pendingPODCount} ongesynchroniseerde POD{pod.pendingPODCount > 1 ? "s" : ""}
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={pod.handleSyncPending}
            disabled={pod.isSyncing || !navigator.onLine}
            className="text-amber-700 hover:text-amber-900 hover:bg-amber-100 h-8 px-3 text-xs font-semibold">
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${pod.isSyncing ? "animate-spin" : ""}`} />
            {pod.isSyncing ? "Bezig..." : "Synchroniseer"}
          </Button>
        </div>
      )}

      {/* CONTENT */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24">
        {/* Clock In/Out & Time Tracking */}
        <Card className="rounded-2xl border-none shadow-sm bg-white ring-1 ring-slate-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${isClocked ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400"}`}>
                  <Clock className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    {isClocked ? (isOnBreak ? "Op pauze" : "Aan het werk") : "Niet ingeklokt"}
                  </p>
                  <p className="text-xs text-slate-500">Vandaag: {formatHours(totalHoursToday)} gewerkt</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {isClocked && (
                  <Button variant="outline" size="sm" onClick={handleToggleBreak}
                    className={`rounded-xl h-9 px-3 text-xs font-semibold ${isOnBreak ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                    <Coffee className="h-3.5 w-3.5 mr-1.5" />Pauze
                  </Button>
                )}
                <Button size="sm" onClick={isClocked ? handleClockOut : handleClockIn}
                  className={`rounded-xl h-9 px-4 text-xs font-semibold shadow-sm ${isClocked ? "bg-red-500 hover:bg-red-600 text-white" : "bg-emerald-500 hover:bg-emerald-600 text-white"}`}>
                  {isClocked ? (<><Square className="h-3.5 w-3.5 mr-1.5" />Uitklokken</>) : (<><Play className="h-3.5 w-3.5 mr-1.5" />Inklokken</>)}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <DriveTimeMonitor continuousDriveH={driveTime.continuousDriveH} dailyDriveH={driveTime.dailyDriveH}
          statusColor={driveTime.statusColor} warning={driveTime.warning} isVisible={isClocked && !isOnBreak} />

        {activeDriverId && (
          <TripFlow driverId={activeDriverId}
            onStartPOD={(stop) => {
              pod.setSelectedOrder({
                id: stop.order_id || stop.id, client_name: stop.contact_name || "",
                delivery_address: stop.planned_address || "", status: "IN_TRANSIT", _tripStopId: stop.id,
              });
            }}
            onTripStarted={(tripId) => { setActiveTripId(tripId); if (!positionReporter.isTracking) positionReporter.startTracking(); }}
            onTripCompleted={(tripId) => { if (activeTripId === tripId) { positionReporter.stopTracking(); setActiveTripId(null); } }}
          />
        )}

        <div className="px-4 mt-4 mb-2">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Directe orders (legacy)</p>
        </div>

        {loadingOrders ? (
          <div className="text-center py-10 text-muted-foreground animate-pulse">Laden...</div>
        ) : orders.length === 0 ? (
          <div className="text-center py-20 bg-white mx-4 rounded-3xl border border-slate-100 shadow-sm mt-10">
            <CheckCircle2 className="h-16 w-16 text-emerald-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-800">Geen actieve ritten</h3>
            <p className="text-slate-500 text-sm mt-1 px-8">Je hebt momenteel geen toegewezen orders voor jouw voertuig.</p>
          </div>
        ) : (
          orders.map((order, idx) => (
            <OrderCard key={order.id} order={order} index={idx}
              onClick={() => { order.status === "DELIVERED" ? pod.setViewingPod(order) : pod.setSelectedOrder(order); }}
            />
          ))
        )}
      </div>

      <PodViewer viewingPod={pod.viewingPod} onClose={() => pod.setViewingPod(null)} />
      <PodCaptureSheet
        selectedOrder={pod.selectedOrder} isSigning={pod.isSigning} isSubmitting={pod.isSubmitting}
        podSignedBy={pod.podSignedBy} setPodSignedBy={pod.setPodSignedBy}
        podNotes={pod.podNotes} setPodNotes={pod.setPodNotes}
        podPhotos={pod.podPhotos} photoInputRef={pod.photoInputRef}
        handlePhotoCapture={pod.handlePhotoCapture} removePhoto={pod.removePhoto}
        canvasRef={pod.canvasRef} startDrawing={pod.startDrawing} draw={pod.draw}
        stopDrawing={pod.stopDrawing} clearCanvas={pod.clearCanvas} startSigning={pod.startSigning}
        handleCompleteDelivery={pod.handleCompleteDelivery} resetPodState={pod.resetPodState}
        onClose={() => pod.setSelectedOrder(null)}
      />
    </div>
  );
}
