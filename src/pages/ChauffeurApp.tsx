import { useState, useEffect, useRef, useCallback } from "react";
import { Truck, MapPin, Package, CheckCircle2, Navigation, LogOut, Check, Phone, Fingerprint, Camera, X, User, MessageSquare, Image, Clock, Coffee, Play, Square, WifiOff, RefreshCw, Bell, Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useDrivers } from "@/hooks/useDrivers";
import { useGPSTracking, useTimeTracking, useGeofenceCheck, useDriveTime } from "@/hooks/useDriverTracking";
import { usePositionReporter } from "@/hooks/usePositionReporter";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { TripFlow } from "@/components/chauffeur/TripFlow";
import { VehicleCheckScreen } from "@/components/chauffeur/VehicleCheckScreen";
import { MijnWeekView } from "@/components/chauffeur/MijnWeekView";
import { useVehicleCheckGate } from "@/hooks/useVehicleCheck";
import { useDriverTrips, useUpdateStopStatus, useSavePOD } from "@/hooks/useTrips";
import { useDriverSchedulesRealtime } from "@/hooks/useDriverSchedulesRealtime";
import { DriveTimeMonitor } from "@/components/chauffeur/DriveTimeMonitor";
import type { TripStop } from "@/types/dispatch";
import { cn } from "@/lib/utils";
import { savePendingPOD, getPendingPODs, syncPendingPODs } from "@/lib/offlineStore";
import { getPodFileUrl, uploadPodBlob } from "@/lib/podStorage";
import { compressImage, compressImageToDataUrl } from "@/lib/imageCompress";

/**
 * Hash a PIN using PBKDF2 (100k iteraties, SHA-256) met een per-driver salt.
 * De salt bevat het driver-id zodat dezelfde PIN bij twee drivers verschillende
 * hashes oplevert. PBKDF2 maakt brute-force op een 4-cijfer PIN (10k mogelijkheden)
 * rekenkundig duur genoeg om aanvallen via een gelekte hash onpraktisch te maken.
 *
 * BREAKING CHANGE: bestaande pin_hash waarden in de drivers-tabel zijn gemaakt met
 * het oude SHA-256-algoritme en valideren niet meer. Drivers moeten hun PIN opnieuw
 * instellen. Een toekomstige migratie kan een `pin_hash_version` kolom toevoegen om
 * beide algoritmes naast elkaar te ondersteunen tijdens een overgangsperiode.
 */
async function hashPin(pin: string, driverId: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = encoder.encode(`orderflow-pin-${driverId}`);
  const baseKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pin),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
    baseKey,
    256,
  );
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Record a failed PIN attempt in the database and check if the driver is locked out.
 * - After 3 failed attempts: lock for 5 minutes
 * - After 6 failed attempts: lock for 30 minutes
 * - After 10 failed attempts: lock permanently until admin resets
 *
 * De lockout staat op databasekolommen zodat beveiliging niet client-side te
 * omzeilen is. Als een query of update faalt, vallen we veilig terug zonder de
 * loginflow te blokkeren.
 */
async function recordFailedAttempt(driverId: string): Promise<{ locked: boolean; lockUntil?: Date; attempts: number }> {
  try {
    // Increment failed_pin_attempts in drivers table
    const { data: driver, error: fetchError } = await supabase
      .from("drivers" as any)
      .select("failed_pin_attempts, pin_locked_until")
      .eq("id", driverId)
      .single();

    if (fetchError) throw fetchError;

    const currentAttempts = ((driver as any)?.failed_pin_attempts ?? 0) + 1;
    const existingLock = (driver as any)?.pin_locked_until;

    // Check if already permanently locked
    if (existingLock === "permanent") {
      return { locked: true, attempts: currentAttempts };
    }

    // Determine lock duration based on attempt count
    let lockUntil: string | null = null;
    let locked = false;

    if (currentAttempts >= 10) {
      // Permanent lock — requires admin reset
      lockUntil = "permanent";
      locked = true;
    } else if (currentAttempts >= 6) {
      const lockDate = new Date(Date.now() + 30 * 60 * 1000);
      lockUntil = lockDate.toISOString();
      locked = true;
    } else if (currentAttempts >= 3) {
      const lockDate = new Date(Date.now() + 5 * 60 * 1000);
      lockUntil = lockDate.toISOString();
      locked = true;
    }

    await supabase
      .from("drivers" as any)
      .update({ failed_pin_attempts: currentAttempts, pin_locked_until: lockUntil })
      .eq("id", driverId);

    return {
      locked,
      lockUntil: lockUntil && lockUntil !== "permanent" ? new Date(lockUntil) : undefined,
      attempts: currentAttempts,
    };
  } catch {
    // Bij een tijdelijke queryfout laten we de loginflow doorgaan.
    return { locked: false, attempts: 0 };
  }
}

/**
 * Reset failed PIN attempts after a successful login.
 */
async function resetFailedAttempts(driverId: string): Promise<void> {
  try {
    await supabase
      .from("drivers" as any)
      .update({ failed_pin_attempts: 0, pin_locked_until: null })
      .eq("id", driverId);
  } catch {
    // Reset is ondersteunend; een mislukte reset mag de chauffeur niet blokkeren.
  }
}

/**
 * Check if a driver is currently locked out based on DB state.
 */
async function checkLockStatus(driverId: string): Promise<{ locked: boolean; lockUntil?: Date }> {
  try {
    const { data, error } = await supabase
      .from("drivers" as any)
      .select("failed_pin_attempts, pin_locked_until")
      .eq("id", driverId)
      .single();

    if (error) throw error;

    const lockedUntil = (data as any)?.pin_locked_until;
    if (!lockedUntil) return { locked: false };

    if (lockedUntil === "permanent") {
      return { locked: true };
    }

    const lockDate = new Date(lockedUntil);
    if (lockDate > new Date()) {
      return { locked: true, lockUntil: lockDate };
    }

    // Lock expired — reset
    await resetFailedAttempts(driverId);
    return { locked: false };
  } catch {
    return { locked: false };
  }
}

export default function ChauffeurApp() {
  // Realtime: vang wijzigingen op driver_schedules zodat "Mijn week" en de
  // rooster-context van de chauffeur live blijven, zonder hard refresh.
  useDriverSchedulesRealtime();

  const { data: drivers, isLoading: driversLoading } = useDrivers();
  // activeDriverId mag NIET rechtstreeks uit localStorage komen: anders kan een
  // aanvaller via DevTools een willekeurig driver-id zetten en zo ingelogd raken
  // zonder PIN-verificatie. localStorage bevat alleen een UI-hint (laatst gebruikte
  // driver) om de picker te kunnen preselecteren; inloggen vereist altijd een
  // succesvolle PIN-verificatie in handlePinSubmit.
  // Test-mode mag een test-only key uitlezen om de PIN-flow te omzeilen, productie
  // bouwt deze tak niet in (`import.meta.env.MODE === "test"` is alleen waar in vitest).
  const [activeDriverId, setActiveDriverId] = useState<string | null>(
    import.meta.env.MODE === "test" ? localStorage.getItem("orderflow_test_driver_id") : null,
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

  const handleDriverSelect = async (driverId: string) => {
    setPendingDriverId(driverId);
    setPinInput("");
    setPinError("");
    setPinAttempts(0);
    setPinLockedUntil(null);

    // Check server-side lock status
    const lockStatus = await checkLockStatus(driverId);
    if (lockStatus.locked) {
      if (!lockStatus.lockUntil) {
        setPinError("Account is permanent geblokkeerd. Neem contact op met de beheerder.");
        setPinLockedUntil(Date.now() + 999_999_999); // effectively permanent in UI
      } else {
        setPinLockedUntil(lockStatus.lockUntil.getTime());
        setPinError("Account is tijdelijk geblokkeerd.");
      }
    }
  };

  const handlePinSubmit = async () => {
    if (pinLockedUntil && Date.now() < pinLockedUntil) return;
    if (pinInput.length !== 4) { setPinError("PIN moet 4 cijfers zijn"); return; }
    if (!pendingDriverId) return;

    setPinVerifying(true);
    try {
      // Re-check server-side lock status before attempting
      const lockStatus = await checkLockStatus(pendingDriverId);
      if (lockStatus.locked) {
        if (!lockStatus.lockUntil) {
          setPinError("Account is permanent geblokkeerd. Neem contact op met de beheerder.");
          setPinLockedUntil(Date.now() + 999_999_999);
        } else {
          setPinLockedUntil(lockStatus.lockUntil.getTime());
          setPinError("Account is tijdelijk geblokkeerd.");
        }
        return;
      }

      const { data, error } = await supabase
        .from("drivers" as any)
        .select("pin_hash, must_change_pin")
        .eq("id", pendingDriverId)
        .single();

      if (error) throw error;

      const storedHash = (data as any)?.pin_hash;

      // If no PIN is set, force the driver to create one
      if (!storedHash) {
        setShowChangePin(true);
        setPinError("Geen PIN ingesteld. Stel een nieuwe PIN in.");
        return;
      }

      const inputHash = await hashPin(pinInput, pendingDriverId);
      const isHashMatch = inputHash === storedHash;

      if (!isHashMatch) {
        // Record failed attempt server-side
        const attemptResult = await recordFailedAttempt(pendingDriverId);
        const newAttempts = pinAttempts + 1;
        setPinAttempts(newAttempts);

        if (attemptResult.locked) {
          if (!attemptResult.lockUntil) {
            setPinError("Account is permanent geblokkeerd. Neem contact op met de beheerder.");
            setPinLockedUntil(Date.now() + 999_999_999);
          } else {
            setPinLockedUntil(attemptResult.lockUntil.getTime());
            setPinError("Te veel pogingen. Account is tijdelijk geblokkeerd.");
          }
        } else {
          const remaining = 3 - (attemptResult.attempts % 3 || 3);
          setPinError(`Onjuiste PIN. Nog ${remaining > 0 ? remaining : 0} poging(en).`);
        }
        setPinInput("");
        return;
      }

      // PIN correct — reset failed attempts
      await resetFailedAttempts(pendingDriverId);
      setPinAttempts(0);

      if ((data as any)?.must_change_pin) {
        setShowChangePin(true);
      } else {
        setActiveDriverId(pendingDriverId);
        setPendingDriverId(null);
      }
    } catch {
      setPinError("Fout bij PIN-verificatie. Probeer opnieuw.");
      setPinInput("");
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
      const hashedNewPin = await hashPin(newPin, pendingDriverId!);
      await supabase
        .from("drivers" as any)
        .update({ pin_hash: hashedNewPin, must_change_pin: false })
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

  // Tabs in het hoofd-dashboard: "vandaag" toont ritten, "week" toont
  // het persoonlijke weekrooster (read-only). Geen routing, alleen lokaal.
  const [activeTab, setActiveTab] = useState<"vandaag" | "week">("vandaag");

  const showLegacyOrders = false;
  const orders: any[] = [];
  const loadingOrders = false;
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

  // -- Offline POD state --
  const [pendingPODCount, setPendingPODCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  const refreshPendingCount = useCallback(async () => {
    try {
      const pending = await getPendingPODs();
      setPendingPODCount(pending.length);
    } catch {
      // IndexedDB not available — ignore
    }
  }, []);

  const handleSyncPending = useCallback(async () => {
    if (isSyncing || !navigator.onLine) return;
    setIsSyncing(true);
    try {
      const result = await syncPendingPODs();
      if (result.synced > 0) {
        toast.success(`${result.synced} POD(s) gesynchroniseerd`);
      }
      if (result.abandoned > 0) {
        toast.warning(`${result.abandoned} POD(s) verwijderd na herhaalde fouten. Neem contact op met de planner.`, { duration: 10000 });
      }
      if (result.failed > 0 && result.failed <= 2) {
        toast.error(`${result.failed} POD(s) niet gesynchroniseerd. Volgende poging bij herladen.`);
      }
      await refreshPendingCount();
    } catch {
      toast.error("Synchronisatie mislukt");
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, refreshPendingCount]);

  // On mount: check pending PODs and sync if online
  useEffect(() => {
    refreshPendingCount();
    if (navigator.onLine) {
      handleSyncPending();
    }

    const handleOnline = () => {
      toast.info("Verbinding hersteld, bezig met synchroniseren...");
      handleSyncPending();
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [refreshPendingCount, handleSyncPending]);

  // -- Chauffeur Notifications --
  const [driverNotifications, setDriverNotifications] = useState<any[]>([]);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [showNotifPanel, setShowNotifPanel] = useState(false);

  // Fetch driver's user_id and subscribe to notifications
  useEffect(() => {
    if (!activeDriverId) return;

    let channel: ReturnType<typeof supabase.channel> | null = null;

    const setupNotifications = async () => {
      // Look up user_id for this driver
      const { data: driverRow } = await supabase
        .from("drivers" as any)
        .select("user_id")
        .eq("id", activeDriverId)
        .single();

      const driverUserId = (driverRow as any)?.user_id;
      if (!driverUserId) return;

      // Fetch existing unread notifications
      const { data: existing } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", driverUserId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (existing) {
        setDriverNotifications(existing);
        setUnreadNotifCount(existing.filter((n: any) => !n.is_read).length);
      }

      // Subscribe to new notifications
      channel = supabase
        .channel("chauffeur-notifications")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${driverUserId}`,
          },
          (payload) => {
            const newNotif = payload.new as any;
            setDriverNotifications(prev => [newNotif, ...prev]);
            setUnreadNotifCount(prev => prev + 1);
            toast.info(newNotif.title, { description: newNotif.message });
          }
        )
        .subscribe();
    };

    setupNotifications();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [activeDriverId]);

  const markDriverNotifRead = async (notifId: string) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", notifId);
    setDriverNotifications(prev => prev.map(n => n.id === notifId ? { ...n, is_read: true } : n));
    setUnreadNotifCount(prev => Math.max(0, prev - 1));
  };

  const markAllDriverNotifsRead = async () => {
    const unreadIds = driverNotifications.filter(n => !n.is_read).map(n => n.id);
    if (unreadIds.length === 0) return;
    for (const id of unreadIds) {
      await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    }
    setDriverNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadNotifCount(0);
  };

  // -- GPS & Time Tracking --
  const { isTracking, currentPosition, startTracking, stopTracking, error: gpsError } = useGPSTracking(activeDriverId);

  // -- Position Reporter (GPS -> vehicle_positions) --
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const activeDriverVehicleId = drivers?.find(d => d.id === activeDriverId)?.current_vehicle_id || null;

  // Voertuigcheck-gate: mag chauffeur vandaag orders zien voor dit voertuig?
  const gateQ = useVehicleCheckGate(activeDriverId, activeDriverVehicleId);
  const positionReporter = usePositionReporter(
    activeTripId,
    activeDriverId,
    activeDriverVehicleId,
    null, // tenantId — will be set by RLS context
  );
  const { isClocked, isOnBreak, clockIn, clockOut, startBreak, endBreak, totalHoursToday, todayEntries } = useTimeTracking(activeDriverId);

  // -- Drive Time Monitor (EU 561/2006) --
  const driveTime = useDriveTime(isClocked, isOnBreak, todayEntries);

  // -- Geofence Arrival Detection --
  const { data: driverTrips = [] } = useDriverTrips(activeDriverId);
  const updateStopStatus = useUpdateStopStatus();
  const savePOD = useSavePOD();
  const allActiveStops: TripStop[] = driverTrips.flatMap(
    (trip: any) => (trip.trip_stops || []) as TripStop[]
  );

  const handleGeofenceArrival = useCallback(async (stopId: string) => {
    try {
      await updateStopStatus.mutateAsync({ stopId, status: "AANGEKOMEN" });
      toast.success("Aankomst geregistreerd!");
    } catch {
      toast.error("Kon aankomst niet registreren");
    }
  }, [updateStopStatus]);

  useGeofenceCheck(currentPosition, allActiveStops, handleGeofenceArrival);

  const handleToggleGPS = () => {
    if (isTracking) {
      stopTracking();
      toast.info("GPS tracking gestopt");
    } else {
      if (!activeTripId) {
        toast.info("GPS start automatisch tijdens een actieve rit.", {
          description: "Zo blijft tracking beperkt tot route-uitvoering.",
        });
        return;
      }
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
      // Alleen een UI-hint voor preselect in de driver-picker bij de volgende
      // sessie. Deze waarde geeft GEEN login, de PIN-flow blijft verplicht.
      localStorage.setItem("orderflow_last_driver_id", activeDriverId);
    }
  }, [activeDriverId]);

  const activeDriver = drivers?.find(d => d.id === activeDriverId);

  const handleLogout = () => {
    setActiveDriverId(null);
    setPendingDriverId(null);
    setPinInput("");
    setPinError("");
    setShowChangePin(false);
  };

  const [viewingPod, setViewingPod] = useState<any | null>(null);

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
      reader.onload = async (ev) => {
        const dataUrl = ev.target?.result as string;
        if (!dataUrl) return;
        try {
          const compressed = await compressImageToDataUrl(dataUrl, 1600, 0.8);
          setPodPhotos(prev => [...prev, compressed]);
        } catch (err) {
          console.error("Foto-compressie mislukt, originele versie gebruikt:", err);
          setPodPhotos(prev => [...prev, dataUrl]);
        }
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

        const storagePath = await uploadPodBlob(blob, {
          orderId,
          kind: "signature",
          contentType: "image/png",
          extension: "png",
        });

        resolve(storagePath);
      }, "image/png");
    });
  };

  // -- Upload photos to Supabase Storage (parallel) --
  const uploadPhotos = async (orderId: string): Promise<string[]> => {
    if (podPhotos.length === 0) return [];

    const tasks = podPhotos.map(async (dataUrl, index) => {
      const blob = await compressImage(dataUrl, 1600, 0.8);
      const storagePath = await uploadPodBlob(blob, {
        orderId,
        kind: "photo",
        contentType: "image/jpeg",
        extension: "jpg",
      });
      if (!storagePath) throw new Error(`Foto ${index + 1} upload zonder pad`);
      return storagePath;
    });

    const results = await Promise.allSettled(tasks);
    const urls: string[] = [];
    let failures = 0;
    results.forEach((res, idx) => {
      if (res.status === "fulfilled") {
        urls.push(res.value);
      } else {
        failures++;
        console.error(`POD foto ${idx + 1} upload mislukt:`, res.reason);
      }
    });

    if (failures > 0) {
      toast.error(`${failures} foto('s) konden niet worden geupload`);
    }

    return urls;
  };

  const [viewingPodSignatureUrl, setViewingPodSignatureUrl] = useState<string | null>(null);
  const [viewingPodPhotoUrls, setViewingPodPhotoUrls] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    const resolvePodEvidence = async () => {
      if (!viewingPod) {
        setViewingPodSignatureUrl(null);
        setViewingPodPhotoUrls([]);
        return;
      }

      const [signatureUrl, photoUrls] = await Promise.all([
        getPodFileUrl(viewingPod.pod_signature_url, {
          orderId: viewingPod.id,
          purpose: "view",
        }),
        Promise.all(
          (Array.isArray(viewingPod.pod_photos) ? viewingPod.pod_photos : []).map((photo: string) =>
            getPodFileUrl(photo, { orderId: viewingPod.id, purpose: "view" })
          ),
        ),
      ]);

      if (!cancelled) {
        setViewingPodSignatureUrl(signatureUrl);
        setViewingPodPhotoUrls(photoUrls.filter((url): url is string => !!url));
      }
    };

    resolvePodEvidence();

    return () => {
      cancelled = true;
    };
  }, [viewingPod]);

  // -- Complete delivery with full PoD --
  const handleCompleteDelivery = async () => {
    if (!selectedOrder) return;
    if (isCanvasEmpty() && !podSignedBy) {
      toast.error("Laat de ontvanger tekenen of vul een naam in");
      return;
    }

    const tripStopId: string | null = selectedOrder._tripStopId || null;
    if (!tripStopId) {
      toast.error("Geen trip-stop gekoppeld aan deze aflevering");
      return;
    }

    setIsSubmitting(true);
    try {
      const [signatureUrl, photoUrls] = await Promise.all([
        uploadSignature(selectedOrder.id),
        uploadPhotos(selectedOrder.id),
      ]);

      await savePOD.mutateAsync({
        trip_stop_id: tripStopId,
        order_id: selectedOrder.id || undefined,
        signature_url: signatureUrl ?? "",
        photos: photoUrls.map((url) => ({ url, type: "delivery_photo" })),
        recipient_name: podSignedBy || "",
        notes: podNotes || undefined,
      });

      await updateStopStatus.mutateAsync({ stopId: tripStopId, status: "AFGELEVERD" });

      toast.success("Zending succesvol afgeleverd!", {
        description: "Handtekening en bewijs zijn opgeslagen."
      });
      resetPodState();
      setSelectedOrder(null);
    } catch(err) {
      console.error("Online POD submit failed, saving offline:", err);

      // Fallback: save to IndexedDB for later sync
      try {
        const canvas = canvasRef.current;
        const signatureDataUrl = canvas && !isCanvasEmpty() ? canvas.toDataURL("image/png") : "";

        await savePendingPOD({
          id: `pod-${selectedOrder.id}-${Date.now()}`,
          tripStopId,
          orderId: selectedOrder.id,
          recipientName: podSignedBy || "",
          signatureDataUrl,
          photoDataUrls: [...podPhotos],
          notes: podNotes || "",
          createdAt: new Date().toISOString(),
        });

        await refreshPendingCount();

        toast.info("Opgeslagen offline, wordt gesynchroniseerd bij verbinding", {
          icon: "📴",
          duration: 5000,
        });
        resetPodState();
        setSelectedOrder(null);
      } catch (offlineErr) {
        console.error("Offline save also failed:", offlineErr);
        toast.error("Kon aflevering niet voltooien en niet offline opslaan.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

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

  // GATE: voertuigcheck verplicht vóór orderlijst zichtbaar is.
  // Fail-closed: alleen doorlaten als gate-query expliciet passed=true geeft.
  if (activeDriverId) {
    if (!activeDriverVehicleId) {
      return (
        <div className="h-screen w-full flex items-center justify-center bg-slate-50 p-4">
          <div className="max-w-sm text-center text-sm text-slate-700">
            Geen voertuig toegewezen. Neem contact op met de planner voor je kunt rijden.
          </div>
        </div>
      );
    }
    if (gateQ.isLoading) {
      return (
        <div className="h-screen w-full flex items-center justify-center bg-slate-50">
          <div className="text-slate-600">Voertuigcheck laden…</div>
        </div>
      );
    }
    if (gateQ.isError) {
      return (
        <div className="h-screen w-full flex items-center justify-center bg-slate-50 p-4">
          <div className="max-w-sm text-center text-sm text-red-700">
            Kon voertuigcheck niet laden: {(gateQ.error as any)?.message ?? "onbekende fout"}.
            <button
              className="mt-3 block mx-auto underline"
              onClick={() => gateQ.refetch()}
            >
              Opnieuw proberen
            </button>
          </div>
        </div>
      );
    }
    if (!gateQ.data?.passed) {
      if (!activeDriver?.tenant_id) {
        return (
          <div className="h-screen w-full flex items-center justify-center bg-slate-50 p-4">
            <div className="max-w-sm text-center text-sm text-slate-700">
              Geen tenant-koppeling. Neem contact op met de planner.
            </div>
          </div>
        );
      }
      return (
        <VehicleCheckScreen
          tenantId={activeDriver.tenant_id}
          driverId={activeDriverId}
          vehicleId={activeDriverVehicleId}
          onCompleted={() => gateQ.refetch()}
        />
      );
    }
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
            <p className="text-xs text-primary-foreground/80 font-medium tracking-wide flex items-center gap-1.5">
              {orders.filter(o => o.status === "DELIVERED").length} / {orders.length} Voltooid
              {activeTripId && (
                <span className={`inline-block h-2 w-2 rounded-full ${positionReporter.isTracking ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`} title={positionReporter.isTracking ? "GPS tracking actief" : "Geen GPS signaal"} />
              )}
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
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowNotifPanel(!showNotifPanel)}
            className="relative rounded-full h-10 w-10 text-white hover:bg-white/20"
            title="Notificaties"
          >
            <Bell className="h-5 w-5" />
            {unreadNotifCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-5 min-w-[20px] px-1 rounded-full bg-red-500 text-xs text-white flex items-center justify-center font-bold shadow-sm">
                {unreadNotifCount > 9 ? "9+" : unreadNotifCount}
              </span>
            )}
          </Button>
          <Button variant="ghost" size="icon" onClick={handleLogout} className="text-white hover:bg-white/20 rounded-full h-10 w-10">
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {/* Notification Panel */}
      {showNotifPanel && (
        <div className="absolute top-[72px] right-2 left-2 z-50 bg-white rounded-2xl shadow-2xl border border-slate-200 max-h-[60vh] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-900">Notificaties</h3>
            <div className="flex items-center gap-2">
              {unreadNotifCount > 0 && (
                <button onClick={markAllDriverNotifsRead} className="text-xs text-primary font-semibold">
                  Alles gelezen
                </button>
              )}
              <button onClick={() => setShowNotifPanel(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="overflow-y-auto flex-1">
            {driverNotifications.length === 0 ? (
              <div className="py-10 text-center text-slate-400">
                <Bell className="h-8 w-8 mx-auto mb-2 text-slate-200" />
                <p className="text-sm font-medium">Geen notificaties</p>
              </div>
            ) : (
              driverNotifications.map((n: any) => (
                <button
                  key={n.id}
                  onClick={() => { if (!n.is_read) markDriverNotifRead(n.id); }}
                  className={`w-full text-left px-4 py-3 border-b border-slate-50 transition-colors ${!n.is_read ? "bg-primary/5" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${!n.is_read ? "bg-green-100" : "bg-slate-100"}`}>
                      <Truck className={`h-4 w-4 ${!n.is_read ? "text-green-600" : "text-slate-400"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900 truncate">{n.title}</p>
                        {!n.is_read && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
                      <p className="text-xs text-slate-300 mt-1">
                        {new Date(n.created_at).toLocaleString("nl-NL", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Offline POD Banner */}
      {pendingPODCount > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <WifiOff className="h-4 w-4 text-amber-600" />
            <span className="text-sm font-medium text-amber-800">
              {pendingPODCount} ongesynchroniseerde POD{pendingPODCount > 1 ? "s" : ""}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSyncPending}
            disabled={isSyncing || !navigator.onLine}
            className="text-amber-700 hover:text-amber-900 hover:bg-amber-100 h-8 px-3 text-xs font-semibold"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Bezig..." : "Synchroniseer"}
          </Button>
        </div>
      )}

      {/* TAB BAR */}
      <div className="bg-white border-b border-slate-200 px-3 py-2 flex items-center gap-2">
        <button
          onClick={() => setActiveTab("vandaag")}
          className={cn(
            "flex-1 h-10 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-1.5",
            activeTab === "vandaag"
              ? "bg-primary text-white shadow-sm"
              : "bg-slate-50 text-slate-600 hover:bg-slate-100",
          )}
        >
          <Truck className="h-4 w-4" />
          Vandaag
        </button>
        <button
          onClick={() => setActiveTab("week")}
          className={cn(
            "flex-1 h-10 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-1.5",
            activeTab === "week"
              ? "bg-primary text-white shadow-sm"
              : "bg-slate-50 text-slate-600 hover:bg-slate-100",
          )}
        >
          <CalendarIcon className="h-4 w-4" />
          Mijn week
        </button>
      </div>

      {/* CONTENT */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24">
        {activeTab === "week" ? (
          activeDriverId ? (
            <MijnWeekView driverId={activeDriverId} />
          ) : null
        ) : (
        <>
        {/* Clock In/Out & Time Tracking */}
        <Card className="rounded-2xl border-none shadow-sm bg-white ring-1 ring-slate-200">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className={cn(
                "mt-0.5 h-9 w-9 rounded-full flex items-center justify-center shrink-0",
                activeTripId && (positionReporter.isTracking || isTracking)
                  ? "bg-emerald-100 text-emerald-600"
                  : "bg-slate-100 text-slate-400",
              )}>
                <MapPin className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">GPS privacy</p>
                  <Badge className={cn(
                    "border-0 text-[11px] font-semibold",
                    activeTripId && (positionReporter.isTracking || isTracking)
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-100 text-slate-600",
                  )}>
                    {activeTripId && (positionReporter.isTracking || isTracking) ? "Actieve rit" : "Uit"}
                  </Badge>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  Locatie wordt alleen gebruikt voor route-uitvoering, ETA en veiligheid tijdens een actieve rit.
                  Toegang door planners wordt gelogd.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

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

        {/* Drive Time Monitor (EU 561/2006) */}
        <DriveTimeMonitor
          continuousDriveH={driveTime.continuousDriveH}
          dailyDriveH={driveTime.dailyDriveH}
          statusColor={driveTime.statusColor}
          warning={driveTime.warning}
          isVisible={isClocked && !isOnBreak}
        />

        {/* Trip-based workflow (new) */}
        {activeDriverId && (
          <TripFlow driverId={activeDriverId} currentPosition={currentPosition ? { lat: currentPosition.latitude, lng: currentPosition.longitude } : null} onStartPOD={(stop) => {
            // Map trip stop to order-like object for POD capture
            const fakeOrder = { id: stop.order_id || stop.id, client_name: stop.contact_name || "", delivery_address: stop.planned_address || "", status: "IN_TRANSIT", _tripStopId: stop.id };
            setSelectedOrder(fakeOrder);
          }} onTripStarted={(tripId) => {
            setActiveTripId(tripId);
            if (!positionReporter.isTracking) positionReporter.startTracking();
            if (!isTracking) startTracking();
          }} onTripCompleted={(tripId) => {
            if (activeTripId === tripId) {
              positionReporter.stopTracking();
              if (isTracking) stopTracking();
              setActiveTripId(null);
            }
          }} />
        )}


        {showLegacyOrders && (loadingOrders ? (
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
        ))}
        </>
        )}
      </div>

      {/* MODAL - PoD VIEWER for delivered orders */}
      {showLegacyOrders && viewingPod && (
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
              {viewingPodSignatureUrl && (
                <div>
                  <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-2">Handtekening</p>
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
                    <img src={viewingPodSignatureUrl} alt="Handtekening" className="w-full max-h-40 object-contain" />
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
              {viewingPodPhotoUrls.length > 0 && (
                <div>
                  <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-2">Foto-bewijs ({viewingPodPhotoUrls.length})</p>
                  <div className="grid grid-cols-2 gap-2">
                    {viewingPodPhotoUrls.map((url, i) => (
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
                   <Button
                     className="flex-1 rounded-2xl bg-green-600 hover:bg-green-700 text-white shadow-sm h-12"
                     onClick={() => {
                       const encoded = encodeURIComponent(selectedOrder.delivery_address || "");
                       window.open(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`, "_blank");
                     }}
                   >
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
