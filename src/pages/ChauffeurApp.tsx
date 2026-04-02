import { useState, useEffect, useRef } from "react";
import { Truck, MapPin, Package, CheckCircle2, Navigation, LogOut, Check, Phone, Fingerprint, Camera, X, User, MessageSquare, Image, Clock, Coffee, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useDrivers } from "@/hooks/useDrivers";
import { useGPSTracking, useTimeTracking } from "@/hooks/useDriverTracking";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { TripFlow } from "@/components/chauffeur/TripFlow";
import { useDriverTrips, useUpdateStopStatus, useSavePOD } from "@/hooks/useTrips";
import type { TripStop } from "@/types/dispatch";

export default function ChauffeurApp() {
  const { data: drivers, isLoading: driversLoading } = useDrivers();
  const [activeDriverId, setActiveDriverId] = useState<string | null>(
    localStorage.getItem("orderflow_driver_id")
  );

  // PIN authentication state
  const [pendingDriverId, setPendingDriverId] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinAttempts, setPinAttempts] = useState(0);
  const [pinLockedUntil, setPinLockedUntil] = useState<number | null>(null);
  const [pinLockCountdown, setPinLockCountdown] = useState(0);
  const [pinVerifying, setPinVerifying] = useState(false);
  const [showChangePin, setShowChangePin] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [confirmNewPin, setConfirmNewPin] = useState("");

  // Lockout countdown timer
  useEffect(() => {
    if (!pinLockedUntil) { setPinLockCountdown(0); return; }
    const tick = () => {
      const remaining = Math.ceil((pinLockedUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        setPinLockedUntil(null);
        setPinLockCountdown(0);
        setPinAttempts(0);
      } else {
        setPinLockCountdown(remaining);
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [pinLockedUntil]);

  const handleDriverSelect = (driverId: string) => {
    setPendingDriverId(driverId);
    setPinInput("");
    setPinError("");
    setPinAttempts(0);
    setPinLockedUntil(null);
  };

  const handlePinSubmit = async () => {
    if (pinLockedUntil && Date.now() < pinLockedUntil) return;
    if (pinInput.length !== 4) { setPinError("PIN moet 4 cijfers zijn"); return; }
    if (!pendingDriverId) return;

    setPinVerifying(true);
    try {
      const { data, error } = await supabase
        .from("drivers" as any)
        .select("pin_hash, must_change_pin")
        .eq("id", pendingDriverId)
        .single();

      if (error) throw error;

      const storedPin = (data as any)?.pin_hash || "0000";
      if (pinInput !== storedPin) {
        const newAttempts = pinAttempts + 1;
        setPinAttempts(newAttempts);
        if (newAttempts >= 3) {
          const lockUntil = Date.now() + 5 * 60 * 1000;
          setPinLockedUntil(lockUntil);
          setPinError("Te veel pogingen. Geblokkeerd voor 5 minuten.");
        } else {
          setPinError(`Onjuiste PIN. Nog ${3 - newAttempts} poging(en).`);
        }
        setPinInput("");
        return;
      }

      // PIN correct
      if ((data as any)?.must_change_pin) {
        setShowChangePin(true);
      } else {
        setActiveDriverId(pendingDriverId);
        setPendingDriverId(null);
      }
    } catch (err) {
      // If pin_hash column doesn't exist yet, accept default "0000"
      if (pinInput === "0000") {
        setActiveDriverId(pendingDriverId);
        setPendingDriverId(null);
      } else {
        setPinError("Onjuiste PIN");
        setPinInput("");
      }
    } finally {
      setPinVerifying(false);
    }
  };

  const handleChangePin = async () => {
    if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
      setPinError("Nieuwe PIN moet 4 cijfers zijn"); return;
    }
    if (newPin !== confirmNewPin) {
      setPinError("PIN-codes komen niet overeen"); return;
    }
    try {
      await supabase
        .from("drivers" as any)
        .update({ pin_hash: newPin, must_change_pin: false })
        .eq("id", pendingDriverId);

      toast.success("PIN succesvol gewijzigd");
      setActiveDriverId(pendingDriverId);
      setPendingDriverId(null);
      setShowChangePin(false);
      setNewPin("");
      setConfirmNewPin("");
    } catch {
      setPinError("Kon PIN niet wijzigen. Probeer opnieuw.");
    }
  };

  const [orders, setOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [isSigning, setIsSigning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // PoD fields
  const [podSignedBy, setPodSignedBy] = useState("");
  const [podNotes, setPodNotes] = useState("");
  const [podPhotos, setPodPhotos] = useState<string[]>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // -- GPS & Time Tracking --
  const { isTracking, currentPosition, startTracking, stopTracking, error: gpsError } = useGPSTracking(activeDriverId);
  const { isClocked, isOnBreak, clockIn, clockOut, startBreak, endBreak, totalHoursToday } = useTimeTracking(activeDriverId);

  const handleToggleGPS = () => {
    if (isTracking) {
      stopTracking();
      toast.info("GPS tracking gestopt");
    } else {
      startTracking();
      toast.success("GPS tracking gestart");
    }
  };

  const handleClockIn = async () => {
    try {
      await clockIn();
      toast.success("Ingeklokt!");
    } catch {
      toast.error("Kon niet inklokken");
    }
  };

  const handleClockOut = async () => {
    try {
      if (isTracking) stopTracking();
      await clockOut();
      toast.success("Uitgeklokt!");
    } catch {
      toast.error("Kon niet uitklokken");
    }
  };

  const handleToggleBreak = async () => {
    try {
      if (isOnBreak) {
        await endBreak();
        toast.info("Pauze beeindigd");
      } else {
        await startBreak();
        toast.info("Pauze gestart");
      }
    } catch {
      toast.error("Kon pauze niet wijzigen");
    }
  };

  // Format hours to "Xu Ym"
  const formatHours = (hours: number): string => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}u ${m}m`;
  };

  // -- Login Effect --
  useEffect(() => {
    if (activeDriverId) {
      localStorage.setItem("orderflow_driver_id", activeDriverId);
      fetchDriverOrders(activeDriverId);
    } else {
      localStorage.removeItem("orderflow_driver_id");
      setOrders([]);
    }
  }, [activeDriverId]);

  const activeDriver = drivers?.find(d => d.id === activeDriverId);

  const fetchDriverOrders = async (driverId: string) => {
    setLoadingOrders(true);
    try {
      const driver = drivers?.find(d => d.id === driverId);
      if (!driver?.current_vehicle_id) {
        setOrders([]);
        return;
      }

      const { data, error } = await supabase
        .from("orders" as any)
        .select("*")
        .eq("vehicle_id", driver.current_vehicle_id)
        .in("status", ["PLANNED", "IN_TRANSIT", "DELIVERED"])
        .order("stop_sequence", { ascending: true });

      if (error) throw error;
      setOrders(data || []);
    } catch (err: any) {
      toast.error("Fout bij ophalen rittenlijst");
    } finally {
      setLoadingOrders(false);
    }
  };

  const handleLogout = () => {
    setActiveDriverId(null);
    setPendingDriverId(null);
    setPinInput("");
    setPinError("");
    setShowChangePin(false);
  };

  // -- Reset PoD state --
  const resetPodState = () => {
    setPodSignedBy("");
    setPodNotes("");
    setPodPhotos([]);
    setIsSigning(false);
  };

  // -- Photo handling --
  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      if (podPhotos.length >= 4) {
        toast.error("Maximaal 4 foto's toegestaan");
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        setPodPhotos(prev => [...prev, dataUrl]);
      };
      reader.readAsDataURL(file);
    });

    // Reset input
    if (photoInputRef.current) photoInputRef.current.value = "";
  };

  const removePhoto = (index: number) => {
    setPodPhotos(prev => prev.filter((_, i) => i !== index));
  };

  // -- Signature Canvas Logic --
  const getCanvasPoint = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    if ("touches" in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: ((e as React.MouseEvent).clientX - rect.left) * scaleX,
      y: ((e as React.MouseEvent).clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCanvasPoint(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCanvasPoint(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const isCanvasEmpty = () => {
    const canvas = canvasRef.current;
    if (!canvas) return true;
    const ctx = canvas.getContext("2d");
    if (!ctx) return true;
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] > 0) return false;
    }
    return true;
  };

  // -- Upload signature to Supabase Storage --
  const uploadSignature = async (orderId: string): Promise<string | null> => {
    const canvas = canvasRef.current;
    if (!canvas || isCanvasEmpty()) return null;

    return new Promise((resolve) => {
      canvas.toBlob(async (blob) => {
        if (!blob) { resolve(null); return; }

        const fileName = `signatures/${orderId}-${Date.now()}.png`;
        const { error: uploadError } = await supabase.storage
          .from("pod-files")
          .upload(fileName, blob, { contentType: "image/png", upsert: true });

        if (uploadError) {
          console.error("Signature upload error:", uploadError);
          resolve(null);
          return;
        }

        const { data: urlData } = supabase.storage
          .from("pod-files")
          .getPublicUrl(fileName);

        resolve(urlData?.publicUrl || null);
      }, "image/png");
    });
  };

  // -- Upload photos to Supabase Storage --
  const uploadPhotos = async (orderId: string): Promise<string[]> => {
    const urls: string[] = [];
    
    for (let i = 0; i < podPhotos.length; i++) {
      const dataUrl = podPhotos[i];
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      
      const fileName = `photos/${orderId}-${Date.now()}-${i}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("pod-files")
        .upload(fileName, blob, { contentType: "image/jpeg", upsert: true });

      if (uploadError) {
        console.error("Photo upload error:", uploadError);
        continue;
      }

      const { data: urlData } = supabase.storage
        .from("pod-files")
        .getPublicUrl(fileName);

      if (urlData?.publicUrl) urls.push(urlData.publicUrl);
    }

    return urls;
  };

  // -- Complete delivery with full PoD --
  const handleCompleteDelivery = async () => {
    if (!selectedOrder) return;
    if (isCanvasEmpty() && !podSignedBy) {
      toast.error("Laat de ontvanger tekenen of vul een naam in");
      return;
    }

    setIsSubmitting(true);
    try {
      // Upload signature
      const signatureUrl = await uploadSignature(selectedOrder.id);
      
      // Upload photos
      const photoUrls = await uploadPhotos(selectedOrder.id);

      // Update order
      const { error } = await supabase
        .from("orders" as any)
        .update({
          status: "DELIVERED",
          pod_signature_url: signatureUrl,
          pod_photos: photoUrls,
          pod_signed_by: podSignedBy || null,
          pod_signed_at: new Date().toISOString(),
          pod_notes: podNotes || null,
        })
        .eq("id", selectedOrder.id);
        
      if (error) throw error;
      
      toast.success("Zending succesvol afgeleverd!", {
        description: "Handtekening en bewijs zijn opgeslagen."
      });
      resetPodState();
      setSelectedOrder(null);
      if (activeDriverId) fetchDriverOrders(activeDriverId);
    } catch(err) {
      toast.error("Kon aflevering niet voltooien.");
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- View Delivered PoD ---
  const [viewingPod, setViewingPod] = useState<any | null>(null);

  // --- RENDERS ---

  if (driversLoading) {
    return <div className="h-screen w-full flex items-center justify-center bg-slate-50"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>;
  }

  // PIN CHANGE SCREEN
  if (showChangePin && pendingDriverId) {
    const pendingDriver = drivers?.find(d => d.id === pendingDriverId);
    return (
      <div className="h-screen w-full bg-slate-50 flex flex-col p-6 items-center justify-center">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="h-16 w-16 bg-amber-500 rounded-2xl mx-auto flex items-center justify-center shadow-lg shadow-amber-500/30 mb-6">
              <Fingerprint className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl font-display font-bold text-slate-900 tracking-tight">PIN wijzigen</h1>
            <p className="text-muted-foreground mt-2">
              Welkom {pendingDriver?.name}! Stel een nieuwe PIN in.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700">Nieuwe PIN (4 cijfers)</label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={newPin}
                onChange={e => { setNewPin(e.target.value.replace(/\D/g, "")); setPinError(""); }}
                placeholder="----"
                className="text-center text-2xl tracking-[0.5em] font-mono h-14 mt-1"
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Bevestig PIN</label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={confirmNewPin}
                onChange={e => { setConfirmNewPin(e.target.value.replace(/\D/g, "")); setPinError(""); }}
                placeholder="----"
                className="text-center text-2xl tracking-[0.5em] font-mono h-14 mt-1"
              />
            </div>
            {pinError && <p className="text-sm text-red-500 text-center">{pinError}</p>}
            <Button
              className="w-full h-12 text-base"
              onClick={handleChangePin}
              disabled={newPin.length !== 4 || confirmNewPin.length !== 4}
            >
              PIN opslaan
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // PIN INPUT SCREEN
  if (pendingDriverId && !activeDriverId) {
    const pendingDriver = drivers?.find(d => d.id === pendingDriverId);
    return (
      <div className="h-screen w-full bg-slate-50 flex flex-col p-6 items-center justify-center">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="h-16 w-16 bg-primary rounded-2xl mx-auto flex items-center justify-center shadow-lg shadow-primary/30 mb-6">
              <Fingerprint className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl font-display font-bold text-slate-900 tracking-tight">PIN invoeren</h1>
            <p className="text-muted-foreground mt-2">
              {pendingDriver?.name} - Voer je 4-cijferige PIN in
            </p>
          </div>

          <div className="space-y-4">
            <Input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pinInput}
              onChange={e => { setPinInput(e.target.value.replace(/\D/g, "")); setPinError(""); }}
              onKeyDown={e => { if (e.key === "Enter") handlePinSubmit(); }}
              placeholder="----"
              className="text-center text-3xl tracking-[0.5em] font-mono h-16"
              disabled={!!pinLockedUntil && Date.now() < pinLockedUntil}
              autoFocus
            />

            {pinError && (
              <p className="text-sm text-red-500 text-center">{pinError}</p>
            )}
            {pinLockCountdown > 0 && (
              <p className="text-sm text-amber-600 text-center font-medium">
                Geblokkeerd: {Math.floor(pinLockCountdown / 60)}:{(pinLockCountdown % 60).toString().padStart(2, "0")} resterend
              </p>
            )}

            <Button
              className="w-full h-12 text-base"
              onClick={handlePinSubmit}
              disabled={pinInput.length !== 4 || pinVerifying || (!!pinLockedUntil && Date.now() < pinLockedUntil)}
            >
              {pinVerifying ? "Verifying..." : "Inloggen"}
            </Button>

            <button
              onClick={() => { setPendingDriverId(null); setPinInput(""); setPinError(""); }}
              className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Terug naar chauffeur selectie
            </button>
          </div>
        </div>
      </div>
    );
  }

  // LOGIN SCREEN (driver selection)
  if (!activeDriverId) {
    return (
      <div className="h-screen w-full bg-slate-50 flex flex-col p-6 items-center justify-center">
        <div className="w-full max-w-sm">
          <div className="text-center mb-10">
            <div className="h-16 w-16 bg-primary rounded-2xl mx-auto flex items-center justify-center shadow-lg shadow-primary/30 mb-6">
              <Truck className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-3xl font-display font-bold text-slate-900 tracking-tight">OrderFlow PWA</h1>
            <p className="text-muted-foreground mt-2">Driver Portal - Selecteer je profiel</p>
          </div>

          <div className="space-y-3">
            {drivers?.slice(0, 6).map(driver => (
              <button
                key={driver.id}
                onClick={() => handleDriverSelect(driver.id)}
                className="w-full bg-white p-4 rounded-2xl border border-slate-200 flex items-center gap-4 hover:border-primary/50 hover:shadow-md transition-all active:scale-95"
              >
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                  {driver.name.charAt(0)}
                </div>
                <div className="text-left flex-1">
                  <h3 className="font-semibold text-slate-900">{driver.name}</h3>
                  <p className="text-xs text-slate-500">
                    Voertuig: {driver.current_vehicle_id ? 'Toegewezen' : 'Geen vrachtwagen'}
                  </p>
                </div>
                <Fingerprint className="h-5 w-5 text-slate-300" />
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // MAIN DRIVER DASHBOARD
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
            <p className="text-xs text-primary-foreground/80 font-medium tracking-wide">
              {orders.filter(o => o.status === "DELIVERED").length} / {orders.length} Voltooid
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleToggleGPS}
            className={`rounded-full h-10 w-10 transition-colors ${
              isTracking
                ? "bg-emerald-500/30 text-emerald-300 hover:bg-emerald-500/40"
                : "text-white/60 hover:bg-white/20"
            }`}
            title={isTracking ? "GPS actief" : "GPS uit"}
          >
            <MapPin className={`h-5 w-5 ${isTracking ? "animate-pulse" : ""}`} />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleLogout} className="text-white hover:bg-white/20 rounded-full h-10 w-10">
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {/* CONTENT */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24">
        {/* Clock In/Out & Time Tracking */}
        <Card className="rounded-2xl border-none shadow-sm bg-white ring-1 ring-slate-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
                  isClocked ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400"
                }`}>
                  <Clock className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    {isClocked ? (isOnBreak ? "Op pauze" : "Aan het werk") : "Niet ingeklokt"}
                  </p>
                  <p className="text-xs text-slate-500">
                    Vandaag: {formatHours(totalHoursToday)} gewerkt
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {isClocked && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleToggleBreak}
                    className={`rounded-xl h-9 px-3 text-xs font-semibold ${
                      isOnBreak
                        ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <Coffee className="h-3.5 w-3.5 mr-1.5" />
                    Pauze
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={isClocked ? handleClockOut : handleClockIn}
                  className={`rounded-xl h-9 px-4 text-xs font-semibold shadow-sm ${
                    isClocked
                      ? "bg-red-500 hover:bg-red-600 text-white"
                      : "bg-emerald-500 hover:bg-emerald-600 text-white"
                  }`}
                >
                  {isClocked ? (
                    <>
                      <Square className="h-3.5 w-3.5 mr-1.5" />
                      Uitklokken
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5 mr-1.5" />
                      Inklokken
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Trip-based workflow (new) */}
        {activeDriverId && (
          <TripFlow driverId={activeDriverId} onStartPOD={(stop) => {
            // Map trip stop to order-like object for POD capture
            const fakeOrder = { id: stop.order_id || stop.id, client_name: stop.contact_name || "", delivery_address: stop.planned_address || "", status: "IN_TRANSIT", _tripStopId: stop.id };
            setSelectedOrder(fakeOrder);
          }} />
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
            <Card 
              key={order.id} 
              onClick={() => {
                if (order.status === "DELIVERED") {
                  setViewingPod(order);
                } else {
                  setSelectedOrder(order);
                }
              }}
              className={`rounded-2xl border-none shadow-sm transition-all active:scale-[0.98] ${
                order.status === "DELIVERED" ? "bg-emerald-50/80 ring-1 ring-emerald-200" : "bg-white ring-1 ring-slate-200"
              }`}
            >
              <CardContent className="p-0">
                <div className="p-5 flex gap-4">
                  {/* Sequence Badge */}
                  <div className="flex flex-col items-center gap-2">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-sm shadow-sm ${
                      order.status === "DELIVERED" ? "bg-emerald-500 text-white" : "bg-primary text-white"
                    }`}>
                      {order.status === "DELIVERED" ? <Check className="h-4 w-4" /> : idx + 1}
                    </div>
                  </div>
                  
                  {/* Order Details */}
                  <div className="flex-1 pb-1">
                    <div className="flex justify-between items-start mb-1">
                      <h3 className={`font-semibold ${order.status === "DELIVERED" ? "text-emerald-700" : "text-slate-900"}`}>
                        {order.client_name || `Order #${order.order_number}`}
                      </h3>
                      {order.status === "DELIVERED" && order.pod_signature_url && (
                        <Badge className="bg-emerald-100 text-emerald-700 text-xs border-0">PoD ✓</Badge>
                      )}
                    </div>
                    <div className="flex items-start gap-2 text-slate-500 text-sm mt-1">
                      <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-slate-400" />
                      <span className="line-clamp-2 leading-relaxed">{order.delivery_address}</span>
                    </div>
                    
                    <div className="flex items-center gap-4 mt-4 pt-3 border-t border-slate-100/80">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                        <Package className="h-3.5 w-3.5" />
                        {order.quantity} {order.unit || "Colli"}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                        <Truck className="h-3.5 w-3.5" />
                        {order.weight_kg} kg
                      </div>
                      {order.status === "DELIVERED" && (
                        <div className="flex items-center gap-1 text-xs text-emerald-600 ml-auto">
                          <Image className="h-3 w-3" />
                          Bekijk PoD
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* MODAL - PoD VIEWER for delivered orders */}
      {viewingPod && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex flex-col justify-end backdrop-blur-sm" onClick={() => setViewingPod(null)}>
          <div className="bg-white rounded-t-[32px] max-h-[80vh] w-full flex flex-col overflow-hidden animate-in slide-in-from-bottom-8 duration-300 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-lg text-slate-900">{viewingPod.client_name}</h3>
                <p className="text-xs text-emerald-600 font-medium">Afgeleverd ✓</p>
              </div>
              <Button variant="secondary" onClick={() => setViewingPod(null)} className="rounded-full bg-slate-100/80 text-slate-600 hover:bg-slate-200">Sluiten</Button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Signature */}
              {viewingPod.pod_signature_url && (
                <div>
                  <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-2">Handtekening</p>
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
                    <img src={viewingPod.pod_signature_url} alt="Handtekening" className="w-full max-h-40 object-contain" />
                  </div>
                </div>
              )}
              
              {/* Metadata */}
              <div className="space-y-2">
                {viewingPod.pod_signed_by && (
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-slate-400" />
                    <span>Getekend door: <strong>{viewingPod.pod_signed_by}</strong></span>
                  </div>
                )}
                {viewingPod.pod_signed_at && (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    <span>{new Date(viewingPod.pod_signed_at).toLocaleString("nl-NL", {
                      day: "numeric", month: "long", year: "numeric",
                      hour: "2-digit", minute: "2-digit"
                    })}</span>
                  </div>
                )}
                {viewingPod.pod_notes && (
                  <div className="flex items-start gap-2 text-sm text-slate-600">
                    <MessageSquare className="h-4 w-4 mt-0.5 text-slate-400" />
                    <span className="italic">"{viewingPod.pod_notes}"</span>
                  </div>
                )}
              </div>

              {/* Photos */}
              {Array.isArray(viewingPod.pod_photos) && viewingPod.pod_photos.length > 0 && (
                <div>
                  <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-2">Foto-bewijs ({viewingPod.pod_photos.length})</p>
                  <div className="grid grid-cols-2 gap-2">
                    {viewingPod.pod_photos.map((url: string, i: number) => (
                      <div key={i} className="aspect-square rounded-xl overflow-hidden border border-slate-200">
                        <img src={url} alt={`PoD foto ${i+1}`} className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL - ORDER DETAIL & POD */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex flex-col justify-end backdrop-blur-sm">
          <div className="bg-white rounded-t-[32px] h-[92vh] w-full flex flex-col overflow-hidden animate-in slide-in-from-bottom-8 duration-300 shadow-2xl">
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0">
              <h3 className="font-bold text-xl text-slate-900 line-clamp-1">{selectedOrder.client_name}</h3>
              <Button variant="secondary" onClick={() => { setSelectedOrder(null); resetPodState(); }} className="rounded-full bg-slate-100/80 text-slate-600 hover:bg-slate-200">Terug</Button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 flex flex-col">
              {/* Address card */}
              <div className="bg-blue-50/50 rounded-3xl p-5 mb-6 border border-blue-100/50">
                <p className="text-sm font-semibold text-blue-600 mb-1 flex items-center gap-2">
                  <MapPin className="h-4 w-4" /> Afleveradres
                </p>
                <p className="text-slate-900 font-medium text-lg leading-snug mt-2">{selectedOrder.delivery_address}</p>
                <div className="flex gap-3 mt-5">
                   <Button className="flex-1 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white shadow-sm h-12">
                     <Navigation className="h-4 w-4 mr-2" /> Start Navigatie
                   </Button>
                   <Button variant="secondary" size="icon" className="h-12 w-12 rounded-2xl flex-shrink-0 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-100">
                     <Phone className="h-5 w-5" />
                   </Button>
                </div>
              </div>

              {isSigning ? (
                <div className="flex-1 flex flex-col">
                  {/* Step indicator */}
                  <div className="flex items-center gap-3 mb-5 bg-slate-50 rounded-2xl p-3">
                    <div className="h-8 w-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">1</div>
                    <div className="flex-1">
                      <h4 className="font-bold text-slate-900">Proof of Delivery</h4>
                      <p className="text-xs text-slate-500">Laat de ontvanger tekenen en vul de gegevens in</p>
                    </div>
                  </div>

                  {/* Receiver name */}
                  <div className="mb-4">
                    <label className="text-xs font-semibold text-slate-700 mb-1.5 block flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5" /> Naam ontvanger
                    </label>
                    <Input
                      value={podSignedBy}
                      onChange={(e) => setPodSignedBy(e.target.value)}
                      placeholder="Naam van de persoon die tekent..."
                      className="rounded-xl h-11 text-sm"
                    />
                  </div>
                  
                  {/* Signature canvas */}
                  <div className="mb-4">
                    <label className="text-xs font-semibold text-slate-700 mb-1.5 block flex items-center gap-1.5">
                      <Fingerprint className="h-3.5 w-3.5" /> Digitale handtekening
                    </label>
                    <div className="border-2 border-dashed border-slate-300 rounded-[20px] bg-slate-50 relative overflow-hidden shadow-inner" style={{ height: 200 }}>
                      <canvas 
                        ref={canvasRef}
                        width={600} 
                        height={300}
                        className="absolute inset-0 w-full h-full touch-none cursor-crosshair"
                        onMouseDown={startDrawing}
                        onMouseMove={draw}
                        onMouseUp={stopDrawing}
                        onMouseLeave={stopDrawing}
                        onTouchStart={startDrawing}
                        onTouchMove={draw}
                        onTouchEnd={stopDrawing}
                        style={{ touchAction: "none" }}
                      />
                    </div>
                    <Button variant="ghost" size="sm" onClick={clearCanvas} className="mt-1.5 text-xs text-slate-500 hover:text-slate-700">
                      Wis handtekening
                    </Button>
                  </div>

                  {/* Photo upload */}
                  <div className="mb-4">
                    <label className="text-xs font-semibold text-slate-700 mb-1.5 block flex items-center gap-1.5">
                      <Camera className="h-3.5 w-3.5" /> Foto-bewijs (optioneel, max 4)
                    </label>
                    <div className="flex gap-2 flex-wrap">
                      {podPhotos.map((photo, i) => (
                        <div key={i} className="relative h-20 w-20 rounded-xl overflow-hidden border border-slate-200">
                          <img src={photo} alt={`Photo ${i+1}`} className="w-full h-full object-cover" />
                          <button 
                            onClick={() => removePhoto(i)}
                            className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center shadow-sm"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      {podPhotos.length < 4 && (
                        <button
                          onClick={() => photoInputRef.current?.click()}
                          className="h-20 w-20 rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 hover:border-primary hover:text-primary transition-colors"
                        >
                          <Camera className="h-5 w-5 mb-0.5" />
                          <span className="text-xs font-medium">Foto</span>
                        </button>
                      )}
                    </div>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      onChange={handlePhotoCapture}
                      className="hidden"
                    />
                  </div>

                  {/* Notes */}
                  <div className="mb-4">
                    <label className="text-xs font-semibold text-slate-700 mb-1.5 block flex items-center gap-1.5">
                      <MessageSquare className="h-3.5 w-3.5" /> Opmerkingen (optioneel)
                    </label>
                    <Textarea
                      value={podNotes}
                      onChange={(e) => setPodNotes(e.target.value)}
                      placeholder="Schade, afwijkingen, bijzonderheden..."
                      className="rounded-xl text-sm resize-none"
                      rows={2}
                    />
                  </div>
                  
                  {/* Submit button */}
                  <div className="mt-auto pb-4">
                    <Button 
                      onClick={handleCompleteDelivery}
                      disabled={isSubmitting}
                      className="w-full rounded-[20px] bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/25 h-14 font-semibold text-lg transition-transform active:scale-95"
                    >
                      {isSubmitting ? (
                        <span className="flex items-center gap-2">
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                          Bezig met opslaan...
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <CheckCircle2 className="h-5 w-5" />
                          Aflevering bevestigen
                        </span>
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-auto pt-8 pb-4">
                  <Button 
                    onClick={() => { 
                      setIsSigning(true); 
                      setTimeout(() => clearCanvas(), 150); 
                    }} 
                    className="w-full h-16 rounded-[20px] text-lg font-bold shadow-xl shadow-primary/20 transition-transform active:scale-95"
                  >
                    <Fingerprint className="h-5 w-5 mr-2" />
                    Proof of Delivery (Teken)
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
