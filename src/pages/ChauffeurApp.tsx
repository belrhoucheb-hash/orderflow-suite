import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from "react";
import { motion, useMotionValue, animate, AnimatePresence } from "framer-motion";
import {
  Truck, MapPin, Navigation, LogOut, Fingerprint, X, MessageSquare, Clock, Coffee, Play, Square,
  WifiOff, RefreshCw, Bell, Calendar as CalendarIcon, Phone, Menu, ChevronUp, ChevronRight, ChevronLeft,
  ShieldCheck, AlertTriangle, FileText, BarChart3, Receipt, Siren, Settings as SettingsIcon, Check,
  FileSignature, Mail, Send, Sun, Moon, Gauge, Bell as BellIcon, Vibrate, Languages, ClipboardCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDrivers } from "@/hooks/useDrivers";
import { useGPSTracking, useTimeTracking, useGeofenceCheck, useDriveTime } from "@/hooks/useDriverTracking";
import { usePositionReporter } from "@/hooks/usePositionReporter";
import { useTenantOptional } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { VehicleCheckScreen } from "@/components/chauffeur/VehicleCheckScreen";
import { MijnWeekView } from "@/components/chauffeur/MijnWeekView";
import { SwipeToConfirm } from "@/components/chauffeur/SwipeToConfirm";
import { DriverChatPanel } from "@/components/chauffeur/DriverChatPanel";
import { LiveTripMap } from "@/components/chauffeur/LiveTripMap";
import { IconBubble } from "@/components/chauffeur/IconBubble";
import { TachograafImport } from "@/components/chauffeur/TachograafImport";
import { IncidentDialog } from "@/components/chauffeur/IncidentDialog";
import { useVehicleCheckGate } from "@/hooks/useVehicleCheck";
import { useDriverTrips, useUpdateStopStatus, useSavePOD } from "@/hooks/useTrips";
import { useDriverSchedulesRealtime } from "@/hooks/useDriverSchedulesRealtime";
import { DriveTimeMonitor } from "@/components/chauffeur/DriveTimeMonitor";
import type { TripStop } from "@/types/dispatch";
import { cn } from "@/lib/utils";
import { savePendingPOD, getPendingPODs, syncPendingPODs } from "@/lib/offlineStore";
import { uploadPodBlob } from "@/lib/podStorage";
import { vibrate, HAPTICS } from "@/lib/haptics";
import { compressImage, compressImageToDataUrl } from "@/lib/imageCompress";
import { generateCmrPdf } from "@/lib/cmrPdf";
import { useVehiclesRaw } from "@/hooks/useVehiclesRaw";
import { usePreferences, type ThemePref } from "@/hooks/usePreferences";
import {
  useDriverSelfAvailabilityRange,
  useSaveDriverSelfAvailability,
  plannerToSelf,
  type DriverSelfStatus,
} from "@/hooks/useDriverSelfAvailability";
import { useDriverStats } from "@/hooks/useDriverStats";
import { useDriverReceipts, useCreateDriverReceipt, type ReceiptType } from "@/hooks/useDriverReceipts";
import { useDriverCertificateRecords } from "@/hooks/useDriverCertificateRecords";
import { useDriverCertifications } from "@/hooks/useDriverCertifications";

/**
 * Hash a PIN using PBKDF2 (100k iteraties, SHA-256) met een per-driver salt.
 * De salt bevat het driver-id zodat dezelfde PIN bij twee drivers verschillende
 * hashes oplevert. PBKDF2 maakt brute-force op een 4-cijfer PIN (10k mogelijkheden)
 * rekenkundig duur genoeg om aanvallen via een gelekte hash onpraktisch te maken.
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
 */
async function recordFailedAttempt(driverId: string): Promise<{ locked: boolean; lockUntil?: Date; attempts: number }> {
  try {
    const { data: driver, error: fetchError } = await supabase
      .from("drivers" as any)
      .select("failed_pin_attempts, pin_locked_until")
      .eq("id", driverId)
      .single();

    if (fetchError) throw fetchError;

    const currentAttempts = ((driver as any)?.failed_pin_attempts ?? 0) + 1;
    const existingLock = (driver as any)?.pin_locked_until;

    if (existingLock === "permanent") {
      return { locked: true, attempts: currentAttempts };
    }

    let lockUntil: string | null = null;
    let locked = false;

    if (currentAttempts >= 10) {
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
    return { locked: false, attempts: 0 };
  }
}

async function resetFailedAttempts(driverId: string): Promise<void> {
  try {
    await supabase
      .from("drivers" as any)
      .update({ failed_pin_attempts: 0, pin_locked_until: null })
      .eq("id", driverId);
  } catch {
    // Reset is ondersteunend.
  }
}

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

    await resetFailedAttempts(driverId);
    return { locked: false };
  } catch {
    return { locked: false };
  }
}

// ─────────────────────────────────────────────────────────────────────
// Drawer-menus voor de driver portal
// ─────────────────────────────────────────────────────────────────────
type DrawerMenu =
  | null
  | "drawer"
  | "voertuigcheck"
  | "rooster"
  | "chat"
  | "incident"
  | "documenten"
  | "beschikbaarheid"
  | "cijfers"
  | "bonnetjes"
  | "instellingen"
  | "tachograaf"
  | "sos"
  | "cmr";

const SHEET_PEEK = 240;
const SHEET_FULL = 720;
const SHEET_HIDDEN_OFFSET = SHEET_FULL - SHEET_PEEK;

const PLANNER_PHONE = (import.meta.env.VITE_PLANNER_PHONE as string | undefined) || "+31 20 123 4567";

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, dLat = ((b.lat - a.lat) * Math.PI) / 180, dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180, lat2 = (b.lat * Math.PI) / 180;
  const s1 = Math.sin(dLat / 2), s2 = Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s1 * s1 + Math.cos(lat1) * Math.cos(lat2) * s2 * s2)));
}

function GoldRule() {
  return <div className="h-px bg-gradient-to-r from-transparent via-[hsl(var(--gold)/0.4)] to-transparent" />;
}

export default function ChauffeurApp() {
  useDriverSchedulesRealtime();

  const { tenant } = useTenantOptional();
  const { data: drivers, isLoading: driversLoading } = useDrivers();

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

    const lockStatus = await checkLockStatus(driverId);
    if (lockStatus.locked) {
      if (!lockStatus.lockUntil) {
        setPinError("Account is permanent geblokkeerd. Neem contact op met de beheerder.");
        setPinLockedUntil(Date.now() + 999_999_999);
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

      if (!storedHash) {
        setShowChangePin(true);
        setPinError("Geen PIN ingesteld. Stel een nieuwe PIN in.");
        return;
      }

      const inputHash = await hashPin(pinInput, pendingDriverId);
      const isHashMatch = inputHash === storedHash;

      if (!isHashMatch) {
        const attemptResult = await recordFailedAttempt(pendingDriverId);
        const newAttempts = pinAttempts + 1;
        setPinAttempts(newAttempts);
        vibrate(HAPTICS.errorBurst);

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

      await resetFailedAttempts(pendingDriverId);
      setPinAttempts(0);
      vibrate(HAPTICS.short);

      if ((data as any)?.must_change_pin) {
        setShowChangePin(true);
      } else {
        setActiveDriverId(pendingDriverId);
        setPendingDriverId(null);
      }
    } catch {
      setPinError("Fout bij PIN-verificatie. Probeer opnieuw.");
      setPinInput("");
      vibrate(HAPTICS.errorBurst);
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

  // ────────────────────────────────────────────────────────────────────
  // Driver dashboard state (gebaseerd op het Uber-style demo-frame)
  // ────────────────────────────────────────────────────────────────────
  const preferences = usePreferences();

  const [menu, setMenu] = useState<DrawerMenu>(null);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [roosterView, setRoosterView] = useState<"week" | "maand">("week");
  const [roosterMonth, setRoosterMonth] = useState(new Date().getMonth());

  // CMR signing state
  const [cmrStop, setCmrStop] = useState<TripStop | null>(null);
  const [cmrName, setCmrName] = useState("");
  const [cmrEmail, setCmrEmail] = useState("");
  const [cmrSendCopy, setCmrSendCopy] = useState(true);
  const [cmrSigned, setCmrSigned] = useState(false);
  const cmrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);

  // Bottom-sheet
  const sheetY = useMotionValue(SHEET_HIDDEN_OFFSET);
  const expandSheet = useCallback(
    () => animate(sheetY, 0, { type: "spring", stiffness: 300, damping: 32 }),
    [sheetY],
  );
  const collapseSheet = useCallback(
    () => animate(sheetY, SHEET_HIDDEN_OFFSET, { type: "spring", stiffness: 300, damping: 32 }),
    [sheetY],
  );

  // -- Offline POD state --
  const [pendingPODCount, setPendingPODCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const isSyncingRef = useRef(false);
  const lastSyncErrorAtRef = useRef(0);

  const refreshPendingCount = useCallback(async () => {
    try {
      const pending = await getPendingPODs();
      setPendingPODCount(pending.length);
    } catch {
      // IndexedDB not available
    }
  }, []);

  const handleSyncPending = useCallback(async () => {
    if (isSyncingRef.current || !navigator.onLine) return;
    isSyncingRef.current = true;
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
      const now = Date.now();
      if (now - lastSyncErrorAtRef.current > 60_000) {
        lastSyncErrorAtRef.current = now;
        toast.error("Synchronisatie mislukt", { id: "pod-sync-failed" });
      }
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [refreshPendingCount]);

  useEffect(() => {
    refreshPendingCount();
    if (!activeDriverId) return;
    if (navigator.onLine) {
      handleSyncPending();
    }

    const handleOnline = () => {
      toast.info("Verbinding hersteld, bezig met synchroniseren...");
      handleSyncPending();
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [activeDriverId, refreshPendingCount, handleSyncPending]);

  // -- Chauffeur Notifications --
  const [driverNotifications, setDriverNotifications] = useState<any[]>([]);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);

  useEffect(() => {
    if (!activeDriverId) return;

    let channel: ReturnType<typeof supabase.channel> | null = null;

    const setupNotifications = async () => {
      const { data: driverRow } = await supabase
        .from("drivers" as any)
        .select("user_id")
        .eq("id", activeDriverId)
        .single();

      const driverUserId = (driverRow as any)?.user_id;
      if (!driverUserId) return;

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
  const { isTracking, currentPosition, startTracking, stopTracking } = useGPSTracking(
    activeDriverId,
    preferences.gpsMode,
  );

  // -- Position Reporter --
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const activeDriverVehicleId = drivers?.find(d => d.id === activeDriverId)?.current_vehicle_id || null;
  // Voertuig-info nodig voor de CMR-PDF (naam + kenteken).
  const vehiclesRawOptions = useMemo(() => ({ includeInactive: true }), []);
  const { data: rawVehicles = [] } = useVehiclesRaw(vehiclesRawOptions);

  const gateQ = useVehicleCheckGate(activeDriverId, activeDriverVehicleId);
  const positionReporter = usePositionReporter(
    activeTripId,
    activeDriverId,
    activeDriverVehicleId,
    tenant?.id ?? null,
  );
  const { isClocked, isOnBreak, clockIn, clockOut, startBreak, endBreak, totalHoursToday, todayEntries } = useTimeTracking(activeDriverId);

  const driveTime = useDriveTime(isClocked, isOnBreak, todayEntries);

  const { data: driverTrips = [] } = useDriverTrips(activeDriverId);
  const updateStopStatus = useUpdateStopStatus();
  const savePOD = useSavePOD();
  const allActiveStops: TripStop[] = useMemo(
    () => driverTrips.flatMap((trip: any) => (trip.trip_stops || []) as TripStop[]),
    [driverTrips],
  );

  const currentStop = useMemo(
    () =>
      allActiveStops.find((s) =>
        ["ONDERWEG", "AANGEKOMEN", "LADEN", "LOSSEN"].includes(s.stop_status),
      ) ?? allActiveStops.find((s) => s.stop_status === "GEPLAND") ?? null,
    [allActiveStops],
  );

  const remainingStopsCount = allActiveStops.filter(
    (s) => !["AFGELEVERD", "MISLUKT", "OVERGESLAGEN"].includes(s.stop_status),
  ).length;
  const completedTripStops = allActiveStops.filter((s) => s.stop_status === "AFGELEVERD").length;
  const totalTripStops = allActiveStops.length;

  // -- Geofence Arrival Detection --
  const handleGeofenceArrival = useCallback(async (stopId: string) => {
    const matched = allActiveStops.find((s) => s.id === stopId);
    const stopAddress = matched?.planned_address || `Stop #${matched?.stop_sequence ?? "?"}`;
    try {
      await updateStopStatus.mutateAsync({ stopId, status: "AANGEKOMEN" });
      toast.success(`Aangekomen bij ${stopAddress}`, {
        id: `arrival-${stopId}`,
        duration: 5000,
        action: {
          label: "Ongedaan",
          onClick: () => {
            updateStopStatus.mutate({ stopId, status: "ONDERWEG" });
          },
        },
      });
    } catch {
      toast.error("Kon aankomst niet registreren");
    }
  }, [allActiveStops, updateStopStatus]);

  useGeofenceCheck(currentPosition, allActiveStops, handleGeofenceArrival);

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

  const formatHours = (hours: number): string => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}u ${m}m`;
  };

  useEffect(() => {
    if (activeDriverId) {
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
    if (isTracking) stopTracking();
    if (positionReporter.isTracking) positionReporter.stopTracking();
    setActiveTripId(null);
  };

  // ────────────────────────────────────────────────────────────────────
  // Stop status transities (vanuit het bottom-sheet)
  // ────────────────────────────────────────────────────────────────────
  const setStopStatus = useCallback(async (id: string, status: TripStop["stop_status"]) => {
    try {
      await updateStopStatus.mutateAsync({ stopId: id, status });
    } catch {
      toast.error("Kon status niet bijwerken");
    }
  }, [updateStopStatus]);

  const handleArrived = async (id: string) => {
    await setStopStatus(id, "AANGEKOMEN");
    vibrate(HAPTICS.short);
    toast.success("Aankomst geregistreerd");
  };

  const handleStartUnload = async (id: string) => {
    const stop = allActiveStops.find((s) => s.id === id);
    const nextStatus: TripStop["stop_status"] = stop?.stop_type === "PICKUP" ? "LADEN" : "LOSSEN";
    await setStopStatus(id, nextStatus);
    vibrate(HAPTICS.short);
    toast.success(nextStatus === "LADEN" ? "Laden gestart" : "Lossen gestart");
  };

  const openCMR = (stop: TripStop) => {
    setCmrStop(stop);
    setCmrName(stop.contact_name ?? "");
    setCmrEmail("");
    setCmrSigned(false);
    setMenu("cmr");
  };

  // CMR canvas helpers
  const cmrPoint = (e: React.MouseEvent | React.TouchEvent) => {
    const c = cmrCanvasRef.current; if (!c) return { x: 0, y: 0 };
    const r = c.getBoundingClientRect();
    const sx = c.width / r.width, sy = c.height / r.height;
    if ("touches" in e) return { x: (e.touches[0].clientX - r.left) * sx, y: (e.touches[0].clientY - r.top) * sy };
    return { x: ((e as React.MouseEvent).clientX - r.left) * sx, y: ((e as React.MouseEvent).clientY - r.top) * sy };
  };
  const cmrStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault(); const c = cmrCanvasRef.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    const { x, y } = cmrPoint(e); ctx.beginPath(); ctx.moveTo(x, y); ctx.strokeStyle = "#0f172a"; ctx.lineWidth = 2.5; ctx.lineCap = "round";
    isDrawingRef.current = true; setCmrSigned(true);
  };
  const cmrDraw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawingRef.current) return; e.preventDefault();
    const c = cmrCanvasRef.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    const { x, y } = cmrPoint(e); ctx.lineTo(x, y); ctx.stroke();
  };
  const cmrEnd = () => { isDrawingRef.current = false; };
  const cmrClear = () => {
    const c = cmrCanvasRef.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height); setCmrSigned(false);
  };

  const cmrSubmit = async () => {
    if (!cmrStop) return;
    if (!cmrSigned || !cmrName.trim()) {
      toast.error("Naam ontvanger en handtekening zijn vereist");
      return;
    }
    const canvas = cmrCanvasRef.current;
    if (!canvas) return;

    try {
      // Upload signature blob
      const signatureUrl = await new Promise<string | null>((resolve) => {
        canvas.toBlob(async (blob) => {
          if (!blob) return resolve(null);
          const path = await uploadPodBlob(blob, {
            orderId: cmrStop.order_id || cmrStop.id,
            kind: "signature",
            contentType: "image/png",
            extension: "png",
          });
          resolve(path);
        }, "image/png");
      });

      const savedPod = await savePOD.mutateAsync({
        trip_stop_id: cmrStop.id,
        order_id: cmrStop.order_id || undefined,
        signature_url: signatureUrl ?? "",
        photos: [],
        recipient_name: cmrName.trim(),
        notes: cmrSendCopy && cmrEmail ? `Kopie verzonden naar ${cmrEmail}` : undefined,
      });

      await updateStopStatus.mutateAsync({ stopId: cmrStop.id, status: "AFGELEVERD" });

      // CMR-PDF on-device genereren en koppelen. Fail-soft: als PDF-generatie of
      // upload faalt, blijft de POD staan, alleen ontbreekt de gegenereerde PDF.
      try {
        const signatureDataUrl = canvas.toDataURL("image/png");
        const vehicle = rawVehicles.find((v) => v.id === activeDriverVehicleId) ?? null;
        const orderIdForCmr = cmrStop.order_id || cmrStop.id;

        const pdfBlob = await generateCmrPdf({
          orderId: orderIdForCmr,
          recipientName: cmrName.trim(),
          signatureDataUrl,
          photoUrls: [],
          vehicle: vehicle ? { name: vehicle.name, plate: vehicle.plate } : null,
          driver: activeDriver ? { name: activeDriver.name } : null,
          pickup: null,
          delivery: { address: cmrStop.planned_address ?? null },
          weightKg: null,
          palletCount: null,
          signedAt: new Date().toISOString(),
          notes: cmrSendCopy && cmrEmail ? `Kopie verzonden naar ${cmrEmail}` : null,
          reference: orderIdForCmr,
        });

        const cmrPath = await uploadPodBlob(pdfBlob, {
          orderId: orderIdForCmr,
          kind: "cmr",
          contentType: "application/pdf",
          extension: "pdf",
        });

        if (cmrPath && savedPod?.id) {
          const { error: patchError } = await supabase
            .from("proof_of_delivery")
            .update({ cmr_pdf_url: cmrPath } as any)
            .eq("id", savedPod.id);
          if (patchError) {
            console.warn("CMR-PDF niet gekoppeld aan POD:", patchError);
          }
        }
      } catch (cmrErr) {
        console.warn("CMR-PDF generatie faalde, POD is wel opgeslagen:", cmrErr);
      }

      vibrate(HAPTICS.long);
      toast.success("CMR ondertekend en opgeslagen", {
        description: cmrSendCopy && cmrEmail ? `Kopie verzonden naar ${cmrEmail}` : "POD vastgelegd.",
      });
      setMenu(null);
      setCmrStop(null);
    } catch (err) {
      console.error("CMR submit failed, saving offline:", err);
      try {
        const signatureDataUrl = canvas.toDataURL("image/png");
        await savePendingPOD({
          id: `pod-${cmrStop.id}-${Date.now()}`,
          tripStopId: cmrStop.id,
          orderId: cmrStop.order_id || cmrStop.id,
          recipientName: cmrName.trim(),
          signatureDataUrl,
          photoDataUrls: [],
          notes: cmrSendCopy && cmrEmail ? `Kopie naar ${cmrEmail}` : "",
          createdAt: new Date().toISOString(),
        });
        await refreshPendingCount();
        toast.info("Opgeslagen offline, wordt gesynchroniseerd bij verbinding");
        setMenu(null);
        setCmrStop(null);
      } catch {
        toast.error("Kon aflevering niet voltooien");
        vibrate(HAPTICS.errorBurst);
      }
    }
  };

  // Trip starten / stoppen — dit gebeurde voorheen in TripFlow callbacks. We
  // emuleren het nu vanuit currentStop: zodra de chauffeur swipet richting
  // ONDERWEG of AANGEKOMEN, starten we GPS tracking via positionReporter.
  useEffect(() => {
    const activeTrip = driverTrips.find((t: any) =>
      (t.trip_stops || []).some((s: TripStop) =>
        ["ONDERWEG", "AANGEKOMEN", "LADEN", "LOSSEN"].includes(s.stop_status),
      ),
    );
    const newTripId = activeTrip?.id ?? null;
    if (newTripId !== activeTripId) {
      setActiveTripId(newTripId);
      if (newTripId) {
        if (!positionReporter.isTracking) positionReporter.startTracking();
        if (!isTracking) startTracking();
      } else {
        if (positionReporter.isTracking) positionReporter.stopTracking();
        if (isTracking) stopTracking();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverTrips]);

  // ─── RENDERS ───────────────────────────────────────────────────────

  const luxeAuthBg = "h-screen w-full flex flex-col p-6 items-center justify-center bg-gradient-to-b from-[hsl(var(--gold-soft)/0.45)] via-background to-background";

  if (driversLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[hsl(var(--gold-soft)/0.18)]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[hsl(var(--gold-deep))]" />
      </div>
    );
  }

  if (showChangePin && pendingDriverId) {
    const pendingDriver = drivers?.find(d => d.id === pendingDriverId);
    return (
      <div className={luxeAuthBg}>
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div
              className="h-16 w-16 rounded-2xl mx-auto flex items-center justify-center shadow-lg mb-6"
              style={{
                background: "linear-gradient(180deg, hsl(var(--gold)) 0%, hsl(var(--gold-deep)) 100%)",
                boxShadow: "0 10px 30px -10px hsl(var(--gold-deep) / 0.45)",
              }}
            >
              <Fingerprint className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">PIN wijzigen</h1>
            <p className="text-muted-foreground mt-2">
              Welkom {pendingDriver?.name}, stel een nieuwe PIN in.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Nieuwe PIN (4 cijfers)</label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={newPin}
                onChange={e => { setNewPin(e.target.value.replace(/\D/g, "")); setPinError(""); }}
                placeholder="----"
                className="text-center text-2xl tracking-[0.5em] font-mono tabular-nums h-14 mt-1 border-[hsl(var(--gold)/0.35)]"
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Bevestig PIN</label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={confirmNewPin}
                onChange={e => { setConfirmNewPin(e.target.value.replace(/\D/g, "")); setPinError(""); }}
                placeholder="----"
                className="text-center text-2xl tracking-[0.5em] font-mono tabular-nums h-14 mt-1 border-[hsl(var(--gold)/0.35)]"
              />
            </div>
            {pinError && <p className="text-sm text-red-500 text-center">{pinError}</p>}
            <Button
              className="btn-luxe btn-luxe--primary w-full h-12 text-base"
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

  if (pendingDriverId && !activeDriverId) {
    const pendingDriver = drivers?.find(d => d.id === pendingDriverId);
    return (
      <div className={luxeAuthBg}>
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div
              className="h-16 w-16 rounded-2xl mx-auto flex items-center justify-center mb-6"
              style={{
                background: "linear-gradient(180deg, hsl(var(--gold)) 0%, hsl(var(--gold-deep)) 100%)",
                boxShadow: "0 10px 30px -10px hsl(var(--gold-deep) / 0.45)",
              }}
            >
              <Fingerprint className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">PIN invoeren</h1>
            <p className="text-muted-foreground mt-2">
              {pendingDriver?.name}, voer je 4-cijferige PIN in
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
              className="text-center text-3xl tracking-[0.5em] font-mono tabular-nums h-16 border-[hsl(var(--gold)/0.35)]"
              disabled={!!pinLockedUntil && Date.now() < pinLockedUntil}
              autoFocus
            />

            {pinError && (
              <p className="text-sm text-red-500 text-center">{pinError}</p>
            )}
            {pinLockCountdown > 0 && (
              <p className="text-sm text-amber-600 text-center font-medium tabular-nums">
                Geblokkeerd: {Math.floor(pinLockCountdown / 60)}:{(pinLockCountdown % 60).toString().padStart(2, "0")} resterend
              </p>
            )}

            <Button
              className="btn-luxe btn-luxe--primary w-full h-12 text-base"
              onClick={handlePinSubmit}
              disabled={pinInput.length !== 4 || pinVerifying || (!!pinLockedUntil && Date.now() < pinLockedUntil)}
            >
              {pinVerifying ? "Verifying..." : "Inloggen"}
            </Button>

            <button
              onClick={() => { setPendingDriverId(null); setPinInput(""); setPinError(""); }}
              className="w-full text-sm text-muted-foreground hover:text-[hsl(var(--gold-deep))] transition-colors"
            >
              Terug naar chauffeur selectie
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!activeDriverId) {
    return (
      <div className={luxeAuthBg}>
        <div className="w-full max-w-sm">
          <div className="text-center mb-10">
            <div
              className="h-16 w-16 rounded-2xl mx-auto flex items-center justify-center mb-6"
              style={{
                background: "linear-gradient(180deg, hsl(var(--gold)) 0%, hsl(var(--gold-deep)) 100%)",
                boxShadow: "0 10px 30px -10px hsl(var(--gold-deep) / 0.5)",
              }}
            >
              <Truck className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-3xl font-display font-bold text-foreground tracking-tight">OrderFlow PWA</h1>
            <p className="text-muted-foreground mt-2">Driver Portal - Selecteer je profiel</p>
          </div>

          <div className="space-y-3">
            {drivers?.slice(0, 6).map(driver => (
              <button
                key={driver.id}
                onClick={() => handleDriverSelect(driver.id)}
                className="card--luxe w-full p-4 flex items-center gap-4 border-[hsl(var(--gold)/0.18)] hover:border-[hsl(var(--gold)/0.45)] hover:bg-[hsl(var(--gold-soft)/0.3)] transition-all active:scale-[0.98]"
              >
                <div className="h-12 w-12 rounded-full bg-gradient-to-br from-[hsl(var(--gold-soft))] to-[hsl(var(--gold-soft)/0.5)] ring-1 ring-[hsl(var(--gold)/0.3)] flex items-center justify-center text-[hsl(var(--gold-deep))] font-bold font-display">
                  {driver.name.charAt(0)}
                </div>
                <div className="text-left flex-1">
                  <h3 className="font-semibold text-foreground font-display">{driver.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    Voertuig: {driver.current_vehicle_id ? 'Toegewezen' : 'Geen vrachtwagen'}
                  </p>
                </div>
                <Fingerprint className="h-5 w-5 text-[hsl(var(--gold)/0.6)]" />
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // GATE: voertuigcheck verplicht.
  if (activeDriverId) {
    if (!activeDriverVehicleId) {
      return (
        <div className="h-screen w-full flex items-center justify-center bg-background p-4">
          <div className="max-w-sm text-center text-sm text-foreground">
            Geen voertuig toegewezen. Neem contact op met de planner voor je kunt rijden.
          </div>
        </div>
      );
    }
    if (gateQ.isLoading) {
      return (
        <div className="h-screen w-full flex items-center justify-center bg-background">
          <div className="text-muted-foreground">Voertuigcheck laden…</div>
        </div>
      );
    }
    if (gateQ.isError) {
      return (
        <div className="h-screen w-full flex items-center justify-center bg-background p-4">
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
          <div className="h-screen w-full flex items-center justify-center bg-background p-4">
            <div className="max-w-sm text-center text-sm text-foreground">
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

  // ────────────────────────────────────────────────────────────────────
  // MAIN DRIVER DASHBOARD — Uber-style frame met echte data
  // ────────────────────────────────────────────────────────────────────
  const mappedPosition = currentPosition
    ? { lat: currentPosition.latitude, lng: currentPosition.longitude }
    : null;

  const stopCoord = currentStop?.planned_latitude && currentStop?.planned_longitude
    ? { lat: currentStop.planned_latitude, lng: currentStop.planned_longitude }
    : null;
  const km = mappedPosition && stopCoord ? haversineKm(mappedPosition, stopCoord) : null;
  const eta = km !== null ? Math.max(1, Math.round((km / 50) * 60)) : null;

  const driveTimeText = `${Math.floor(driveTime.continuousDriveH)}:${String(Math.round((driveTime.continuousDriveH % 1) * 60)).padStart(2, "0")} / 4:30`;
  const driveTimePct = Math.min(100, (driveTime.continuousDriveH / 4.5) * 100);

  return (
    <div className="h-screen w-full bg-background text-foreground overflow-hidden fixed inset-0 flex flex-col">
      {/* OFFLINE POD BANNER */}
      {pendingPODCount > 0 && (
        <div className="absolute top-0 left-0 right-0 z-30 bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between">
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

      {/* FULL-BLEED MAP */}
      <div className="absolute inset-0">
        <LiveTripMap
          currentPosition={mappedPosition}
          stops={allActiveStops}
          currentStopId={currentStop?.id ?? null}
          height="100%"
          className="w-full h-full"
        />
      </div>

      {/* GLASS HEADER */}
      <div className={cn("absolute left-0 right-0 z-20 p-3", pendingPODCount > 0 ? "top-10" : "top-0")}>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMenu("drawer")}
            className="h-11 w-11 rounded-full bg-card/90 backdrop-blur-md shadow-[0_4px_20px_-4px_rgba(0,0,0,0.15)] border border-[hsl(var(--gold)/0.25)] flex items-center justify-center"
            aria-label="Menu"
          >
            <Menu className="h-[18px] w-[18px] text-foreground" strokeWidth={2.25} />
          </button>
          <div className="flex-1 flex items-center gap-2.5 rounded-full bg-card/85 backdrop-blur-md px-3 py-1.5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.15)] border border-[hsl(var(--gold)/0.22)]">
            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[hsl(var(--gold-light))] via-[hsl(var(--gold))] to-[hsl(var(--gold-deep))] flex items-center justify-center text-white font-bold font-display text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]">
              {activeDriver?.name?.charAt(0) ?? "?"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold leading-tight font-display truncate">{activeDriver?.name}</p>
              <p className="text-[10px] text-muted-foreground tabular-nums flex items-center gap-1.5">
                <span className={cn("inline-block h-1.5 w-1.5 rounded-full", isClocked ? "bg-emerald-500 animate-pulse" : "bg-slate-400")} />
                {completedTripStops} / {totalTripStops} voltooid · {remainingStopsCount} stops
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowNotifPanel(!showNotifPanel)}
            className="relative h-11 w-11 rounded-full bg-card/90 backdrop-blur-md shadow-[0_4px_20px_-4px_rgba(0,0,0,0.15)] border border-[hsl(var(--gold)/0.25)] flex items-center justify-center"
            title="Notificaties"
          >
            <Bell className="h-[18px] w-[18px] text-foreground" strokeWidth={2.25} />
            {unreadNotifCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-5 min-w-[20px] px-1 rounded-full bg-red-500 text-xs text-white flex items-center justify-center font-bold shadow-sm tabular-nums">
                {unreadNotifCount > 9 ? "9+" : unreadNotifCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* DRIVE-TIME PILL */}
      <div className="absolute right-3 z-20" style={{ top: pendingPODCount > 0 ? 130 : 90 }}>
        <div className="rounded-full bg-card/90 backdrop-blur-md shadow-[0_4px_20px_-4px_rgba(0,0,0,0.15)] border border-[hsl(var(--gold)/0.22)] pl-2 pr-3 py-1.5 text-[11px] font-semibold tabular-nums text-foreground flex items-center gap-1.5">
          <IconBubble icon={<Clock className="h-3 w-3" />} size={20} />
          {driveTimeText}
        </div>
      </div>

      {/* NOTIFICATION PANEL */}
      {showNotifPanel && (
        <div className="absolute right-2 left-2 z-40 card--luxe rounded-2xl shadow-2xl border-[hsl(var(--gold)/0.25)] max-h-[60vh] overflow-hidden flex flex-col p-0" style={{ top: pendingPODCount > 0 ? 100 : 64 }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--gold)/0.18)]">
            <h3 className="text-sm font-bold text-foreground font-display">Notificaties</h3>
            <div className="flex items-center gap-2">
              {unreadNotifCount > 0 && (
                <button onClick={markAllDriverNotifsRead} className="text-xs text-[hsl(var(--gold-deep))] font-semibold hover:underline">
                  Alles gelezen
                </button>
              )}
              <button onClick={() => setShowNotifPanel(false)} className="text-muted-foreground hover:text-[hsl(var(--gold-deep))]">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="overflow-y-auto flex-1">
            {driverNotifications.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">
                <Bell className="h-8 w-8 mx-auto mb-2 text-[hsl(var(--gold)/0.3)]" />
                <p className="text-sm font-medium">Geen notificaties</p>
              </div>
            ) : (
              driverNotifications.map((n: any) => (
                <button
                  key={n.id}
                  onClick={() => { if (!n.is_read) markDriverNotifRead(n.id); }}
                  className={cn(
                    "w-full text-left px-4 py-3 border-b border-border transition-colors",
                    !n.is_read && "bg-[hsl(var(--gold-soft)/0.35)]",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${!n.is_read ? "bg-emerald-100" : "bg-muted"}`}>
                      <Truck className={`h-4 w-4 ${!n.is_read ? "text-emerald-600" : "text-muted-foreground"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground truncate font-display">{n.title}</p>
                        {!n.is_read && <span className="h-2 w-2 rounded-full bg-[hsl(var(--gold-deep))] shrink-0" />}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                      <p className="text-xs text-muted-foreground/70 mt-1 tabular-nums">
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

      {/* BOTTOM SHEET */}
      <motion.div
        drag="y"
        dragConstraints={{ top: 0, bottom: SHEET_HIDDEN_OFFSET }}
        dragElastic={0.05}
        dragMomentum={false}
        onDragEnd={(_, info) => {
          const current = sheetY.get();
          if (info.velocity.y < -300) expandSheet();
          else if (info.velocity.y > 300) collapseSheet();
          else current < SHEET_HIDDEN_OFFSET / 2 ? expandSheet() : collapseSheet();
        }}
        style={{ y: sheetY, height: SHEET_FULL }}
        className="absolute left-0 right-0 bottom-0 z-30 bg-card text-card-foreground shadow-[0_-20px_50px_-10px_rgba(0,0,0,0.25)] rounded-t-[28px] border-t border-[hsl(var(--gold)/0.25)] overflow-hidden"
      >
        <div style={{ height: SHEET_FULL }} className="flex flex-col">
          <button
            onClick={() => (sheetY.get() < SHEET_HIDDEN_OFFSET / 2 ? collapseSheet() : expandSheet())}
            className="w-full pt-2.5 pb-1 flex justify-center"
            aria-label="Open details"
          >
            <span className="block h-1.5 w-12 rounded-full bg-gradient-to-r from-[hsl(var(--gold)/0.3)] via-[hsl(var(--gold-deep)/0.5)] to-[hsl(var(--gold)/0.3)]" />
          </button>

          {/* PEEK CONTENT — Next Stop Hero + SwipeToConfirm */}
          <div className="px-5 pt-1 pb-4">
            {currentStop ? (
              <>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-deep))] text-white text-xs font-bold font-display shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_2px_4px_rgba(0,0,0,0.1)]">
                      {currentStop.stop_sequence}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--gold-deep))]">
                      Volgende stop
                    </span>
                  </div>
                  {km !== null && (
                    <div className="text-right">
                      <p className="font-display text-base font-semibold tabular-nums leading-none">
                        {km.toFixed(1).replace(".", ",")} km
                      </p>
                      <p className="text-[10px] text-muted-foreground tabular-nums tracking-wider">ca. {eta} min</p>
                    </div>
                  )}
                </div>
                <p className="font-display text-[20px] font-semibold leading-snug">
                  {currentStop.planned_address || "Adres onbekend"}
                </p>
                {(currentStop.contact_name || currentStop.contact_phone) && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {currentStop.contact_name}{currentStop.contact_name && currentStop.contact_phone ? " · " : ""}{currentStop.contact_phone}
                  </p>
                )}

                <div className="flex items-center gap-2 mt-3">
                  <div className="flex-1">
                    {currentStop.stop_status === "GEPLAND" && (
                      <SwipeToConfirm
                        label="Veeg om te starten met rijden"
                        icon={<Navigation className="h-4 w-4" />}
                        onConfirm={() => setStopStatus(currentStop.id, "ONDERWEG")}
                      />
                    )}
                    {currentStop.stop_status === "ONDERWEG" && (
                      <SwipeToConfirm
                        label="Veeg om aankomst te melden"
                        icon={<MapPin className="h-4 w-4" />}
                        onConfirm={() => handleArrived(currentStop.id)}
                      />
                    )}
                    {currentStop.stop_status === "AANGEKOMEN" && (
                      <SwipeToConfirm
                        label={currentStop.stop_type === "PICKUP" ? "Veeg om te starten met laden" : "Veeg om te starten met lossen"}
                        icon={<Truck className="h-4 w-4" />}
                        onConfirm={() => handleStartUnload(currentStop.id)}
                      />
                    )}
                    {(currentStop.stop_status === "LADEN" || currentStop.stop_status === "LOSSEN") && (
                      <SwipeToConfirm
                        label="Veeg om CMR te tekenen"
                        icon={<FileSignature className="h-4 w-4" />}
                        variant="success"
                        onConfirm={() => openCMR(currentStop)}
                      />
                    )}
                  </div>
                  <button
                    onClick={() =>
                      currentStop.planned_address &&
                      window.open(
                        `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(currentStop.planned_address)}`,
                        "_blank",
                      )
                    }
                    className="h-[60px] w-[60px] rounded-2xl bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-deep))] text-white shadow-md flex items-center justify-center"
                    aria-label="Navigeer"
                  >
                    <Navigation className="h-5 w-5" strokeWidth={2.25} />
                  </button>
                  <button
                    onClick={() => currentStop.contact_phone && window.open(`tel:${currentStop.contact_phone}`)}
                    disabled={!currentStop.contact_phone}
                    className={cn(
                      "h-[60px] w-[60px] rounded-2xl border flex items-center justify-center shrink-0",
                      currentStop.contact_phone
                        ? "border-[hsl(var(--gold)/0.4)] bg-card text-[hsl(var(--gold-deep))]"
                        : "border-border bg-muted text-muted-foreground",
                    )}
                    aria-label="Bel"
                  >
                    <Phone className="h-5 w-5" strokeWidth={2.25} />
                  </button>
                </div>
              </>
            ) : (
              <div className="py-8 text-center">
                <IconBubble icon={<ClipboardCheck className="h-5 w-5" />} size={48} variant="success" className="mx-auto" />
                <p className="font-display text-base font-semibold mt-3">Geen actieve stops</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Je hebt geen stops in behandeling. Sleep omhoog voor je rooster en cijfers.
                </p>
              </div>
            )}
          </div>

          <GoldRule />

          {/* EXPANDED CONTENT */}
          <div className="px-5 py-4 space-y-4 overflow-y-auto">
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setMenu("rooster")}
                className="rounded-2xl border border-[hsl(var(--gold)/0.18)] bg-gradient-to-br from-[hsl(var(--gold-soft)/0.5)] to-[hsl(var(--gold-soft)/0.2)] py-3 flex flex-col items-center gap-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]"
              >
                <IconBubble icon={<CalendarIcon className="h-4 w-4" strokeWidth={2.25} />} size={32} />
                <span className="text-[11px] font-semibold font-display">Rooster</span>
              </button>
              <button
                onClick={() => setMenu("chat")}
                className="rounded-2xl border border-[hsl(var(--gold)/0.18)] bg-gradient-to-br from-[hsl(var(--gold-soft)/0.5)] to-[hsl(var(--gold-soft)/0.2)] py-3 flex flex-col items-center gap-1.5 relative shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]"
              >
                <IconBubble icon={<MessageSquare className="h-4 w-4" strokeWidth={2.25} />} size={32} />
                <span className="text-[11px] font-semibold font-display">Chat</span>
              </button>
              <button
                onClick={() => setMenu("incident")}
                className="rounded-2xl border border-red-200/70 bg-gradient-to-br from-red-50 to-red-50/40 py-3 flex flex-col items-center gap-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]"
              >
                <IconBubble icon={<AlertTriangle className="h-4 w-4" strokeWidth={2.25} />} size={32} variant="danger" />
                <span className="text-[11px] font-semibold font-display text-red-700">Probleem</span>
              </button>
            </div>

            {/* DRIVE-TIME MONITOR */}
            <DriveTimeMonitor
              continuousDriveH={driveTime.continuousDriveH}
              dailyDriveH={driveTime.dailyDriveH}
              statusColor={driveTime.statusColor}
              warning={driveTime.warning}
              isVisible={isClocked && !isOnBreak}
            />

            <div className="rounded-2xl border border-amber-200/70 bg-gradient-to-br from-amber-50/80 to-amber-50/30 p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
              <div className="flex items-center justify-between text-[11px] font-semibold mb-2">
                <span className="flex items-center gap-2">
                  <IconBubble icon={<Clock className="h-3 w-3" strokeWidth={2.5} />} size={22} variant="warn" />
                  Rijtijd
                </span>
                <span className="tabular-nums text-amber-800 font-display">{driveTimeText}</span>
              </div>
              <div className="h-1.5 rounded-full bg-amber-100 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-amber-400 to-amber-500" style={{ width: `${driveTimePct}%` }} />
              </div>
              <p className="text-[10px] text-amber-800 mt-2">
                Continue rijtijd, max 4u 30m voor verplichte pauze.
              </p>
            </div>

            {/* CLOCK CARD */}
            <div className="flex items-center justify-between rounded-2xl border border-[hsl(var(--gold)/0.18)] bg-card p-3 shadow-[inset_0_1px_0_rgba(255,255,255,1)]">
              <div className="flex items-center gap-2.5">
                <IconBubble
                  icon={<Clock className="h-4 w-4" strokeWidth={2.25} />}
                  size={36}
                  variant={isClocked && !isOnBreak ? "success" : isOnBreak ? "warn" : "muted"}
                />
                <div>
                  <p className="text-sm font-semibold font-display leading-tight">
                    {isClocked ? (isOnBreak ? "Op pauze" : "Aan het werk") : "Niet ingeklokt"}
                  </p>
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    {formatHours(totalHoursToday)} vandaag
                  </p>
                </div>
              </div>
              <div className="flex gap-1.5">
                {isClocked && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleToggleBreak}
                    className={cn(
                      "rounded-xl h-8 px-2.5 text-[11px] font-semibold border-[hsl(var(--gold)/0.3)]",
                      isOnBreak && "bg-amber-50 text-amber-700 border-amber-300",
                    )}
                  >
                    <Coffee className="h-3 w-3 mr-1" />
                    Pauze
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={isClocked ? handleClockOut : handleClockIn}
                  className={cn(
                    "rounded-xl h-8 px-2.5 text-[11px] font-semibold",
                    isClocked
                      ? "bg-red-500 hover:bg-red-600 text-white"
                      : "btn-luxe btn-luxe--primary",
                  )}
                >
                  {isClocked ? (
                    <>
                      <Square className="h-3 w-3 mr-1" />
                      Uitklokken
                    </>
                  ) : (
                    <>
                      <Play className="h-3 w-3 mr-1" />
                      Inklokken
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* STOP-LIST */}
            {allActiveStops.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--gold-deep))] mb-2">Resterende stops</p>
                <div className="space-y-2">
                  {allActiveStops.map((stop, i) => {
                    const isCurrent = stop.id === currentStop?.id;
                    const isDone = ["AFGELEVERD", "MISLUKT", "OVERGESLAGEN"].includes(stop.stop_status);
                    return (
                      <div
                        key={stop.id}
                        className={cn(
                          "rounded-2xl border p-3 flex items-center gap-3",
                          isCurrent && "border-[hsl(var(--gold)/0.4)] bg-gradient-to-br from-[hsl(var(--gold-soft)/0.4)] to-[hsl(var(--gold-soft)/0.15)] shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]",
                          isDone && "border-border bg-muted/40 opacity-70",
                          !isCurrent && !isDone && "border-[hsl(var(--gold)/0.14)] bg-card",
                        )}
                      >
                        <span className={cn(
                          "h-9 w-9 rounded-xl flex items-center justify-center text-xs font-bold font-display shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]",
                          isDone ? "bg-gradient-to-br from-emerald-100 to-emerald-50 text-emerald-700" :
                          isCurrent ? "bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-deep))] text-white" :
                          "bg-gradient-to-br from-[hsl(var(--gold-soft))] to-[hsl(var(--gold-soft)/0.5)] text-[hsl(var(--gold-deep))]",
                        )}>
                          {isDone ? <Check className="h-4 w-4" strokeWidth={2.5} /> : stop.stop_sequence ?? i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold font-display truncate">{stop.planned_address}</p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {stop.stop_type === "PICKUP" ? "Ophalen" : "Leveren"}
                            {stop.contact_name ? ` · ${stop.contact_name}` : ""}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* DRAG-UP HINT */}
      <button
        onClick={expandSheet}
        className="absolute z-20 left-1/2 -translate-x-1/2 flex items-center gap-1 text-[10px] font-semibold text-muted-foreground bg-card/85 backdrop-blur-sm rounded-full px-2.5 py-1 shadow-sm border border-[hsl(var(--gold)/0.18)]"
        style={{ bottom: SHEET_PEEK + 8 }}
      >
        <ChevronUp className="h-3 w-3" />
        Sleep voor details
      </button>

      {/* HAMBURGER DRAWER */}
      <AnimatePresence>
        {menu === "drawer" && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-40 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setMenu(null)}
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 32 }}
              className="absolute top-0 left-0 bottom-0 z-50 w-[80%] max-w-[340px] bg-card text-card-foreground flex flex-col"
            >
              <div className="bg-gradient-to-br from-[hsl(var(--gold-deep))] via-[hsl(var(--gold-deep)/0.95)] to-[hsl(var(--gold))] p-5 text-white relative overflow-hidden">
                <div className="absolute -top-16 -right-16 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
                <button onClick={() => setMenu(null)} className="absolute top-3 right-3 h-8 w-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                  <X className="h-4 w-4" />
                </button>
                <div className="h-14 w-14 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center font-display font-bold text-2xl mb-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]">
                  {activeDriver?.name?.charAt(0) ?? "?"}
                </div>
                <p className="font-display text-[19px] font-semibold leading-tight tracking-tight">{activeDriver?.name}</p>
                <p className="text-xs text-white/85 tabular-nums mt-0.5">
                  {activeDriverVehicleId ? `Voertuig: ${activeDriverVehicleId.slice(0, 8)}` : "Geen voertuig"}
                </p>
                <button
                  onClick={() => setMenu("beschikbaarheid")}
                  className="mt-4 inline-flex items-center gap-2 text-xs font-semibold bg-white/20 backdrop-blur-sm rounded-full px-3 py-1.5 border border-white/20"
                >
                  <span className={cn("h-2 w-2 rounded-full", isClocked ? "bg-emerald-300 animate-pulse" : "bg-slate-300")} />
                  {isClocked ? "Aan het werk" : "Beschikbaar"}
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto py-3 px-2">
                {[
                  { k: "voertuigcheck" as DrawerMenu, l: "Voertuigcheck", I: ShieldCheck, badge: gateQ.data?.passed ? "Voltooid" : "Vereist", danger: !gateQ.data?.passed },
                  { k: "rooster" as DrawerMenu, l: "Mijn rooster", I: CalendarIcon },
                  { k: "beschikbaarheid" as DrawerMenu, l: "Beschikbaarheid", I: Check },
                  { k: "chat" as DrawerMenu, l: "Chat met planner", I: MessageSquare },
                  { k: "documenten" as DrawerMenu, l: "Mijn documenten", I: FileText },
                  { k: "cijfers" as DrawerMenu, l: "Mijn cijfers", I: BarChart3 },
                  { k: "bonnetjes" as DrawerMenu, l: "Bonnetjes & tank", I: Receipt },
                  { k: "tachograaf" as DrawerMenu, l: "Tachograaf", I: Gauge },
                  { k: "incident" as DrawerMenu, l: "Probleem melden", I: AlertTriangle },
                  { k: "instellingen" as DrawerMenu, l: "Instellingen", I: SettingsIcon },
                  { k: "sos" as DrawerMenu, l: "SOS / Noodhulp", I: Siren, danger: true },
                ].map((item) => (
                  <button
                    key={item.k}
                    onClick={() => setMenu(item.k)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 my-0.5 rounded-2xl text-sm font-semibold font-display hover:bg-[hsl(var(--gold-soft)/0.4)] transition-colors text-left group",
                      item.danger && "text-red-600 hover:bg-red-50/50",
                    )}
                  >
                    <IconBubble
                      icon={<item.I className="h-4 w-4" strokeWidth={2.25} />}
                      size={36}
                      variant={item.danger ? "danger" : "gold"}
                    />
                    <span className="flex-1">{item.l}</span>
                    {item.badge && (
                      <span className={cn(
                        "text-[10px] font-bold rounded-full px-2 py-0.5",
                        item.danger ? "bg-red-100 text-red-700" : "bg-[hsl(var(--gold-soft))] text-[hsl(var(--gold-deep))]",
                      )}>
                        {item.badge}
                      </span>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-[hsl(var(--gold-deep))] transition-colors" />
                  </button>
                ))}
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 my-0.5 rounded-2xl text-sm font-semibold font-display hover:bg-muted transition-colors text-left group text-muted-foreground"
                  title="Uitloggen"
                >
                  <IconBubble icon={<LogOut className="h-4 w-4" strokeWidth={2.25} />} size={36} variant="muted" />
                  <span className="flex-1">Uitloggen</span>
                </button>
              </nav>
              <div className="p-4 border-t border-border text-[10px] text-muted-foreground tracking-wide">
                OrderFlow Driver Portal · v2.4.0
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* VOERTUIGCHECK */}
      {menu === "voertuigcheck" && activeDriver?.tenant_id && activeDriverVehicleId && (
        <div className="absolute inset-0 z-50 bg-card flex flex-col">
          <div className="flex items-center gap-3 p-4 border-b border-[hsl(var(--gold)/0.16)]">
            <button onClick={() => setMenu("drawer")} className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center">
              <ChevronLeft className="h-4 w-4" strokeWidth={2.25} />
            </button>
            <p className="font-display font-bold text-base leading-tight flex-1">Voertuigcheck</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            <VehicleCheckScreen
              tenantId={activeDriver.tenant_id}
              driverId={activeDriverId}
              vehicleId={activeDriverVehicleId}
              onCompleted={() => {
                gateQ.refetch();
                setMenu(null);
                vibrate(HAPTICS.success);
                toast.success("Voertuigcheck voltooid");
              }}
            />
          </div>
        </div>
      )}

      {/* CMR SIGNING */}
      {menu === "cmr" && cmrStop && (
        <div className="absolute inset-0 z-50 bg-card flex flex-col">
          <div className="flex items-center gap-3 p-4 border-b border-[hsl(var(--gold)/0.16)]">
            <button onClick={() => setMenu(null)} className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center">
              <ChevronLeft className="h-4 w-4" strokeWidth={2.25} />
            </button>
            <IconBubble icon={<FileSignature className="h-4 w-4" strokeWidth={2.25} />} size={36} />
            <div className="flex-1">
              <p className="font-display font-bold text-base leading-tight">CMR ondertekenen</p>
              <p className="text-[11px] text-muted-foreground truncate">{cmrStop.planned_address}</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="rounded-2xl border border-[hsl(var(--gold)/0.25)] bg-gradient-to-br from-[hsl(var(--gold-soft)/0.4)] to-[hsl(var(--gold-soft)/0.15)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--gold-deep))]">CMR vrachtbrief</p>
                <span className="text-[10px] font-semibold text-muted-foreground tabular-nums">#{cmrStop.id.slice(0, 8)}</span>
              </div>
              <div className="space-y-2 text-[12px]">
                <div className="flex justify-between"><span className="text-muted-foreground">Chauffeur</span><span className="font-semibold">{activeDriver?.name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Aflevering</span><span className="font-semibold text-right max-w-[60%] truncate">{cmrStop.planned_address}</span></div>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))]">Ontvanger</label>
              <input
                value={cmrName}
                onChange={(e) => setCmrName(e.target.value)}
                placeholder="Naam van ontvanger"
                className="mt-1.5 w-full h-11 px-3 rounded-xl border border-[hsl(var(--gold)/0.25)] bg-card text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold)/0.3)]"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))]">Handtekening ontvanger</label>
                {cmrSigned && (
                  <button onClick={cmrClear} className="text-[10px] font-semibold text-muted-foreground underline">
                    Wissen
                  </button>
                )}
              </div>
              <div className="rounded-2xl border-2 border-dashed border-[hsl(var(--gold)/0.3)] bg-gradient-to-br from-[hsl(var(--gold-soft)/0.3)] to-card relative overflow-hidden" style={{ height: 180 }}>
                <canvas
                  ref={cmrCanvasRef}
                  width={600}
                  height={300}
                  className="absolute inset-0 w-full h-full touch-none cursor-crosshair"
                  style={{ touchAction: "none" }}
                  onMouseDown={cmrStart}
                  onMouseMove={cmrDraw}
                  onMouseUp={cmrEnd}
                  onMouseLeave={cmrEnd}
                  onTouchStart={cmrStart}
                  onTouchMove={cmrDraw}
                  onTouchEnd={cmrEnd}
                />
                {!cmrSigned && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-xs text-muted-foreground tracking-wide">Teken hieronder</span>
                  </div>
                )}
              </div>
            </div>

            <div className={cn(
              "rounded-2xl border p-3 transition-colors",
              cmrSendCopy ? "border-[hsl(var(--gold)/0.3)] bg-gradient-to-br from-[hsl(var(--gold-soft)/0.4)] to-[hsl(var(--gold-soft)/0.15)]" : "border-border bg-card",
            )}>
              <button
                onClick={() => setCmrSendCopy(!cmrSendCopy)}
                className="w-full flex items-center justify-between"
              >
                <span className="flex items-center gap-2.5">
                  <IconBubble icon={<Mail className="h-4 w-4" strokeWidth={2.25} />} size={32} />
                  <span className="text-sm font-semibold font-display">Kopie naar klant mailen</span>
                </span>
                <span className={cn("h-6 w-11 rounded-full transition-colors", cmrSendCopy ? "bg-[hsl(var(--gold-deep))]" : "bg-muted")}>
                  <span className={cn("block h-5 w-5 rounded-full bg-white shadow transition-transform mt-0.5 ml-0.5", cmrSendCopy && "translate-x-5")} />
                </span>
              </button>
              {cmrSendCopy && (
                <input
                  value={cmrEmail}
                  onChange={(e) => setCmrEmail(e.target.value)}
                  placeholder="ontvanger@bedrijf.nl"
                  type="email"
                  className="mt-2.5 w-full h-9 px-3 rounded-xl border border-[hsl(var(--gold)/0.25)] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold)/0.3)] bg-card"
                />
              )}
            </div>
          </div>

          <div className="p-4 border-t border-[hsl(var(--gold)/0.16)] bg-card">
            <Button
              disabled={!cmrSigned || !cmrName.trim()}
              onClick={cmrSubmit}
              className={cn(
                "w-full h-12 rounded-2xl font-display font-semibold text-sm shadow-md",
                cmrSigned && cmrName.trim()
                  ? "bg-gradient-to-br from-emerald-500 to-emerald-600 hover:opacity-95 text-white"
                  : "bg-muted text-muted-foreground",
              )}
            >
              <Send className="h-4 w-4 mr-2" strokeWidth={2.25} />
              CMR ondertekend, aflevering voltooien
            </Button>
          </div>
        </div>
      )}

      {/* ROOSTER */}
      {menu === "rooster" && (
        <BottomDrawer title="Mijn rooster" onClose={() => setMenu(null)} large>
          <div className="flex items-center gap-1 p-1 rounded-2xl bg-[hsl(var(--gold-soft)/0.4)] border border-[hsl(var(--gold)/0.18)] mb-4">
            {(["week", "maand"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setRoosterView(v)}
                className={cn(
                  "flex-1 h-9 rounded-xl text-xs font-semibold font-display capitalize transition-all",
                  roosterView === v
                    ? "bg-card text-[hsl(var(--gold-deep))] shadow-sm"
                    : "text-muted-foreground",
                )}
              >
                {v}
              </button>
            ))}
          </div>
          {roosterView === "week" ? (
            <MijnWeekView driverId={activeDriverId} />
          ) : (
            <MonthGrid
              month={roosterMonth}
              onPrev={() => setRoosterMonth((m) => Math.max(0, m - 1))}
              onNext={() => setRoosterMonth((m) => Math.min(11, m + 1))}
            />
          )}
        </BottomDrawer>
      )}

      {/* BESCHIKBAARHEID */}
      {menu === "beschikbaarheid" && (
        <BottomDrawer title="Beschikbaarheid" onClose={() => setMenu(null)}>
          <AvailabilityPanel driverId={activeDriverId} isClocked={isClocked} />
        </BottomDrawer>
      )}

      {/* DOCUMENTEN */}
      {menu === "documenten" && (
        <BottomDrawer title="Mijn documenten" onClose={() => setMenu(null)}>
          <DocumentsPanel driverId={activeDriverId} />
        </BottomDrawer>
      )}

      {/* CIJFERS */}
      {menu === "cijfers" && (
        <BottomDrawer title="Mijn cijfers" onClose={() => setMenu(null)}>
          <StatsPanel driverId={activeDriverId} completed={completedTripStops} totalStops={totalTripStops} hoursToday={totalHoursToday} />
        </BottomDrawer>
      )}

      {/* BONNETJES */}
      {menu === "bonnetjes" && (
        <BottomDrawer title="Bonnetjes & tank" onClose={() => setMenu(null)}>
          <ReceiptsPanel driverId={activeDriverId} />
        </BottomDrawer>
      )}

      {/* TACHOGRAAF */}
      {menu === "tachograaf" && (
        <BottomDrawer title="Tachograaf" onClose={() => setMenu(null)}>
          <TachograafImport driverId={activeDriverId} />
        </BottomDrawer>
      )}

      {/* INSTELLINGEN */}
      {menu === "instellingen" && (
        <BottomDrawer title="Instellingen" onClose={() => setMenu(null)}>
          <SettingsPanel preferences={preferences} />
        </BottomDrawer>
      )}

      {/* INCIDENT */}
      {menu === "incident" && currentStop && activeDriver?.tenant_id && (
        <IncidentDialog
          open
          onOpenChange={(o) => { if (!o) setMenu(null); }}
          tenantId={activeDriver.tenant_id}
          tripStopId={currentStop.id}
          orderId={currentStop.order_id || null}
          driverId={activeDriverId}
          onSubmitted={async (result) => {
            await updateStopStatus.mutateAsync({ stopId: currentStop.id, status: result.newStopStatus });
            setMenu(null);
          }}
        />
      )}
      {menu === "incident" && (!currentStop || !activeDriver?.tenant_id) && (
        <BottomDrawer title="Probleem melden" onClose={() => setMenu(null)}>
          <p className="text-sm text-muted-foreground">
            Probleem melden is alleen beschikbaar zodra je een actieve stop hebt.
          </p>
        </BottomDrawer>
      )}

      {/* SOS */}
      {menu === "sos" && (
        <div className="absolute inset-0 z-50 bg-gradient-to-br from-red-700 via-red-600 to-red-700 text-white flex flex-col p-6">
          <button onClick={() => setMenu("drawer")} className="absolute top-4 right-4 h-9 w-9 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="h-20 w-20 rounded-3xl bg-white/15 backdrop-blur-sm flex items-center justify-center mb-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]">
              <Siren className="h-10 w-10 animate-pulse" strokeWidth={2} />
            </div>
            <h2 className="font-display text-3xl font-bold mb-2 tracking-tight">SOS / Noodhulp</h2>
            <p className="text-sm text-white/80 mb-8 max-w-xs">
              Kies wat je nu nodig hebt. De planner krijgt direct een melding met je locatie.
            </p>
            <div className="w-full max-w-xs space-y-3">
              <Button
                onClick={() => window.open(`tel:${PLANNER_PHONE.replace(/\s+/g, "")}`)}
                className="w-full h-14 rounded-2xl bg-white text-red-600 font-display font-bold shadow-md hover:bg-white/90"
              >
                <Phone className="h-5 w-5 mr-2" /> Bel planner direct
              </Button>
              <Button className="w-full h-14 rounded-2xl bg-white/15 text-white font-display font-bold border border-white/30 backdrop-blur-sm hover:bg-white/25">
                <AlertTriangle className="h-5 w-5 mr-2" /> Pech onderweg
              </Button>
              <Button className="w-full h-14 rounded-2xl bg-white/15 text-white font-display font-bold border border-white/30 backdrop-blur-sm hover:bg-white/25">
                <Siren className="h-5 w-5 mr-2" /> Ongeval melden
              </Button>
              <Button
                onClick={() => window.open("tel:112")}
                className="w-full h-14 rounded-2xl bg-white/15 text-white font-display font-bold border border-white/30 backdrop-blur-sm hover:bg-white/25"
              >
                <Phone className="h-5 w-5 mr-2" /> Bel 112
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* CHAT */}
      {menu === "chat" && activeDriverId && (
        <BottomDrawer title="Chat met planner" onClose={() => setMenu(null)} large>
          <div className="h-[60vh] -mx-4 -mb-4">
            <DriverChatPanel driverId={activeDriverId} active />
          </div>
        </BottomDrawer>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sub-componenten — alleen gebruikt binnen ChauffeurApp
// ─────────────────────────────────────────────────────────────────────

const MAANDEN = ["Januari","Februari","Maart","April","Mei","Juni","Juli","Augustus","September","Oktober","November","December"];

function MonthGrid({ month, onPrev, onNext }: { month: number; onPrev: () => void; onNext: () => void }) {
  const year = new Date().getFullYear();
  const today = new Date();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = (new Date(year, month, 1).getDay() + 6) % 7;
  const todayDay = today.getMonth() === month && today.getFullYear() === year ? today.getDate() : -1;

  const dayStatus = (d: number, weekend: boolean): "gewerkt" | "vandaag" | "gepland" | "vrij" => {
    if (d === todayDay) return "vandaag";
    if (weekend) return "vrij";
    if (today.getMonth() === month && d < todayDay) return "gewerkt";
    return "gepland";
  };

  const cells: Array<{ d: number | null; status?: ReturnType<typeof dayStatus>; weekend?: boolean }> = [];
  for (let i = 0; i < firstDay; i++) cells.push({ d: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = (firstDay + d - 1) % 7;
    const weekend = dow === 5 || dow === 6;
    cells.push({ d, status: dayStatus(d, weekend), weekend });
  }

  const totals = {
    gewerkt: cells.filter((c) => c.status === "gewerkt").length,
    gepland: cells.filter((c) => c.status === "gepland").length,
    vrij: cells.filter((c) => c.status === "vrij").length,
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={onPrev} className="h-9 w-9 rounded-xl bg-[hsl(var(--gold-soft)/0.4)] border border-[hsl(var(--gold)/0.18)] flex items-center justify-center">
          <ChevronLeft className="h-4 w-4 text-[hsl(var(--gold-deep))]" strokeWidth={2.25} />
        </button>
        <p className="font-display font-semibold text-base tracking-tight">{MAANDEN[month]} {year}</p>
        <button onClick={onNext} className="h-9 w-9 rounded-xl bg-[hsl(var(--gold-soft)/0.4)] border border-[hsl(var(--gold)/0.18)] flex items-center justify-center">
          <ChevronRight className="h-4 w-4 text-[hsl(var(--gold-deep))]" strokeWidth={2.25} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-2">
        {["M","D","W","D","V","Z","Z"].map((d, i) => (
          <span key={i} className="text-[10px] font-semibold uppercase text-muted-foreground text-center tracking-wider">{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((c, i) => {
          if (c.d === null) return <span key={i} />;
          const cls =
            c.status === "vandaag" ? "bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-deep))] text-white shadow-md" :
            c.status === "gewerkt" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" :
            c.status === "gepland" ? "bg-[hsl(var(--gold-soft)/0.5)] text-[hsl(var(--gold-deep))] border border-[hsl(var(--gold)/0.18)]" :
            "bg-muted text-muted-foreground border border-border";
          return (
            <button
              key={i}
              className={cn("aspect-square rounded-xl text-[12px] font-semibold font-display flex items-center justify-center tabular-nums", cls)}
            >
              {c.d}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-3 gap-2 mt-4">
        <div className="rounded-2xl border border-emerald-200/60 bg-emerald-50/60 p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-emerald-700">Gewerkt</p>
          <p className="font-display font-bold text-xl tabular-nums text-emerald-800 mt-0.5">{totals.gewerkt}</p>
        </div>
        <div className="rounded-2xl border border-[hsl(var(--gold)/0.2)] bg-[hsl(var(--gold-soft)/0.4)] p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--gold-deep))]">Gepland</p>
          <p className="font-display font-bold text-xl tabular-nums text-[hsl(var(--gold-deep))] mt-0.5">{totals.gepland}</p>
        </div>
        <div className="rounded-2xl border border-border bg-muted p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Vrij</p>
          <p className="font-display font-bold text-xl tabular-nums text-foreground mt-0.5">{totals.vrij}</p>
        </div>
      </div>
    </div>
  );
}

function BottomDrawer({ title, onClose, large, children }: { title: string; onClose: () => void; large?: boolean; children: ReactNode }) {
  return (
    <div className="absolute inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end" onClick={onClose}>
      <div
        className={cn("bg-card text-card-foreground w-full rounded-t-[28px] flex flex-col shadow-[0_-30px_60px_-15px_rgba(0,0,0,0.3)]", large ? "max-h-[88%]" : "max-h-[80%]")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-[hsl(var(--gold)/0.16)]">
          <h3 className="font-display font-bold text-lg tracking-tight">{title}</h3>
          <button onClick={onClose} className="h-8 w-8 rounded-xl bg-muted flex items-center justify-center"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {children}
        </div>
      </div>
    </div>
  );
}

// Beschikbaarheid persisteert in `driver_availability` met de driver-eigen
// statusset (beschikbaar / niet_beschikbaar / liever_niet). Planner-statussen
// (werkt/verlof/ziek/...) worden gemapped naar de driver-set zodat de UI
// altijd één van drie waardes laat zien.
function AvailabilityPanel({ driverId, isClocked }: { driverId: string; isClocked: boolean }) {
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const monday = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    d.setHours(0, 0, 0, 0);
    return d;
  }, [todayKey]);
  const sunday = useMemo(() => {
    const d = new Date(monday);
    d.setDate(d.getDate() + 6);
    return d;
  }, [monday]);
  const fromKey = monday.toISOString().slice(0, 10);
  const toKey = sunday.toISOString().slice(0, 10);

  const range = useDriverSelfAvailabilityRange(driverId, fromKey, toKey);
  const save = useSaveDriverSelfAvailability(driverId);

  const statusByDate = useMemo(() => {
    const map = new Map<string, DriverSelfStatus>();
    for (const row of range.data ?? []) {
      map.set(row.date, plannerToSelf(row.status));
    }
    return map;
  }, [range.data]);

  const todayStatus: DriverSelfStatus = statusByDate.get(todayKey) ?? "beschikbaar";
  const available = todayStatus === "beschikbaar";

  const days = ["Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag", "Zondag"];

  const handleToday = (next: boolean) => {
    save.mutate(
      { date: todayKey, status: next ? "beschikbaar" : "niet_beschikbaar" },
      {
        onError: (err) => {
          toast.error("Beschikbaarheid niet opgeslagen", {
            description: err instanceof Error ? err.message : undefined,
          });
        },
      },
    );
  };

  const handleDay = (date: string, status: DriverSelfStatus) => {
    save.mutate(
      { date, status },
      {
        onError: (err) => {
          toast.error("Beschikbaarheid niet opgeslagen", {
            description: err instanceof Error ? err.message : undefined,
          });
        },
      },
    );
  };

  return (
    <div>
      <div className="rounded-2xl border border-[hsl(var(--gold)/0.2)] bg-gradient-to-br from-[hsl(var(--gold-soft)/0.4)] to-card p-4 flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <IconBubble icon={<Check className="h-4 w-4" strokeWidth={2.5} />} size={40} variant={available ? "success" : "muted"} />
          <div>
            <p className="font-display font-semibold text-sm">Vandaag {available ? "beschikbaar" : todayStatus === "liever_niet" ? "liever niet" : "niet beschikbaar"}</p>
            <p className="text-[11px] text-muted-foreground">
              {isClocked ? "Je bent ingeklokt" : "Planner kan je inplannen"}
            </p>
          </div>
        </div>
        <button
          onClick={() => handleToday(!available)}
          disabled={save.isPending}
          className={cn("h-7 w-12 rounded-full transition-colors", available ? "bg-emerald-500" : "bg-muted")}
        >
          <span className={cn("block h-5 w-5 rounded-full bg-white shadow transition-transform mx-1", available && "translate-x-5")} />
        </button>
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--gold-deep))] mb-2">Deze week</p>
      <div className="space-y-2">
        {days.map((d, i) => {
          const date = new Date(monday);
          date.setDate(monday.getDate() + i);
          const dateKey = date.toISOString().slice(0, 10);
          const label = `${d} ${date.getDate()} ${MAANDEN[date.getMonth()].toLowerCase().slice(0, 3)}`;
          const dayStatus: DriverSelfStatus = statusByDate.get(dateKey) ?? (i < 5 ? "beschikbaar" : "niet_beschikbaar");
          return (
            <div key={d} className="rounded-2xl border border-[hsl(var(--gold)/0.14)] p-3 flex items-center justify-between bg-card">
              <p className="text-sm font-semibold font-display">{label}</p>
              <select
                value={dayStatus}
                onChange={(e) => handleDay(dateKey, e.target.value as DriverSelfStatus)}
                disabled={save.isPending}
                className="text-xs font-semibold bg-[hsl(var(--gold-soft)/0.4)] rounded-full px-3 py-1.5 border-0 cursor-pointer text-foreground"
              >
                <option value="beschikbaar">Beschikbaar</option>
                <option value="liever_niet">Liever niet</option>
                <option value="niet_beschikbaar">Niet beschikbaar</option>
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Documenten tonen de driver_certification_expiry-rijen voor deze chauffeur
// uit de bestaande tabel (gevuld door planner). Vervaldatum-warnings:
// rood < 30 dagen, amber < 90 dagen, groen voor de rest.
function DocumentsPanel({ driverId }: { driverId: string }) {
  const records = useDriverCertificateRecords(driverId);
  const types = useDriverCertifications();

  const typeName = (code: string) =>
    types.data?.find((t) => t.code.toLowerCase() === code.toLowerCase())?.name ?? code.toUpperCase();

  const docs = (records.data ?? []).map((rec) => {
    const expiry = rec.expiry_date ? new Date(rec.expiry_date) : null;
    const now = new Date();
    let status: "ok" | "warn" | "err" = "ok";
    let dateLabel = "Geen vervaldatum bekend";
    if (expiry) {
      const days = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const formatted = expiry.toLocaleDateString("nl-NL", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      if (days < 0) {
        status = "err";
        dateLabel = `Verlopen op ${formatted}`;
      } else if (days < 30) {
        status = "err";
        dateLabel = `Verloopt over ${days} dagen (${formatted})`;
      } else if (days < 90) {
        status = "warn";
        dateLabel = `Verloopt over ${days} dagen (${formatted})`;
      } else {
        dateLabel = `Geldig tot ${formatted}`;
      }
    }
    return {
      id: rec.id,
      label: typeName(rec.certification_code),
      dateLabel,
      status,
    };
  });

  if (records.isLoading) {
    return <p className="text-xs text-muted-foreground">Bezig met ophalen...</p>;
  }

  if (records.isError) {
    return (
      <p className="text-xs text-red-600">
        Documenten konden niet worden opgehaald. Probeer het later opnieuw.
      </p>
    );
  }

  if (docs.length === 0) {
    return (
      <div className="py-6 text-center">
        <IconBubble icon={<FileText className="h-5 w-5" />} size={48} className="mx-auto" />
        <p className="font-display font-semibold mt-3">Nog geen documenten</p>
        <p className="text-xs text-muted-foreground mt-1">
          Je certificeringen verschijnen hier zodra de planner ze heeft toegevoegd.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {docs.map((d) => (
        <div key={d.id} className="rounded-2xl border border-[hsl(var(--gold)/0.18)] p-3 flex items-center gap-3 bg-card">
          <IconBubble
            icon={<FileText className="h-4 w-4" strokeWidth={2.25} />}
            size={40}
            variant={d.status === "err" ? "danger" : d.status === "warn" ? "warn" : "success"}
          />
          <div className="flex-1">
            <p className="text-sm font-semibold font-display">{d.label}</p>
            <p className={cn("text-[11px]", d.status === "err" ? "text-red-700 font-semibold" : d.status === "warn" ? "text-amber-700 font-semibold" : "text-muted-foreground")}>{d.dateLabel}</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      ))}
    </div>
  );
}

// Mijn cijfers, geaggregeerd uit driver_time_entries, trips en trip_stops.
// Vandaag-tellers (gewerkt + stops) komen nog uit de live ChauffeurApp-state
// omdat die al per tick wordt herrekend; week/maand-cijfers komen uit
// useDriverStats.
function StatsPanel({ driverId, completed, totalStops, hoursToday }: { driverId: string; completed: number; totalStops: number; hoursToday: number }) {
  const stats = useDriverStats(driverId);
  const data = stats.data;

  const fmtHours = (h: number) => `${Math.floor(h)}u ${Math.round((h % 1) * 60)}m`;
  const fmtPct = (n: number | null | undefined) =>
    typeof n === "number" ? `${Math.round(n * 100)}%` : "—";
  const fmtKm = (km: number | null | undefined) =>
    typeof km === "number" ? `${Math.round(km)} km` : "—";

  const items = [
    { l: "Vandaag gewerkt", v: fmtHours(hoursToday), s: "uren" },
    { l: "Stops vandaag", v: `${completed}/${totalStops || 0}`, s: "voltooid" },
    { l: "Deze week", v: data ? fmtHours(data.hoursThisWeek) : "…", s: "uren" },
    { l: "Ritten", v: data ? String(data.tripsThisMonth) : "…", s: "deze maand" },
    { l: "On-time", v: data ? fmtPct(data.onTimeRate) : "…", s: "stops op tijd" },
    { l: "Km gereden", v: data ? fmtKm(data.kmThisMonth) : "…", s: "deze maand" },
    { l: "Stops afgeleverd", v: data ? String(data.stopsDeliveredThisMonth) : "…", s: "deze maand" },
    { l: "Pauze", v: data ? fmtPct(data.breakComplianceRate) : "…", s: "compliant" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map((m) => (
        <div key={m.l} className="rounded-2xl border border-[hsl(var(--gold)/0.18)] p-3.5 bg-gradient-to-br from-card to-[hsl(var(--gold-soft)/0.2)] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{m.l}</p>
          <p className="font-display text-2xl font-bold tabular-nums text-foreground mt-1">{m.v}</p>
          <p className="text-[11px] text-muted-foreground">{m.s}</p>
        </div>
      ))}
    </div>
  );
}

// Bonnetjes uit driver_receipts. Bon-scan upload naar bucket `receipts`
// onder {tenant_id}/{driver_id}/{timestamp}.{ext} en insert met status
// pending_ocr. OCR-extractie (bedrag, locatie) volgt asynchroon.
function ReceiptsPanel({ driverId }: { driverId: string }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [scanType, setScanType] = useState<ReceiptType>("diesel");
  const list = useDriverReceipts(driverId);
  const create = useCreateDriverReceipt();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Bestand te groot, max 10 MB");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    try {
      await create.mutateAsync({ driver_id: driverId, file, type: scanType });
      toast.success("Bon ontvangen, planner verwerkt 'm");
    } catch (err) {
      toast.error("Bon uploaden mislukt", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const typeOptions: { value: ReceiptType; label: string }[] = [
    { value: "diesel", label: "Diesel" },
    { value: "parking", label: "Parkeren" },
    { value: "tol", label: "Tol" },
    { value: "overig", label: "Overig" },
  ];

  const formatScannedAt = (iso: string) =>
    new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });

  const formatAmount = (amount: number | null, currency: string) =>
    typeof amount === "number"
      ? new Intl.NumberFormat("nl-NL", { style: "currency", currency }).format(amount)
      : "Bedrag wordt verwerkt";

  const statusChip = (status: string) => {
    switch (status) {
      case "approved":
        return { label: "goedgekeurd", className: "bg-emerald-100 text-emerald-700" };
      case "rejected":
        return { label: "afgekeurd", className: "bg-red-100 text-red-700" };
      case "ocr_done":
        return { label: "klaar voor controle", className: "bg-amber-100 text-amber-700" };
      case "pending_ocr":
      default:
        return { label: "wordt verwerkt", className: "bg-muted text-muted-foreground" };
    }
  };

  const receipts = list.data ?? [];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[hsl(var(--gold)/0.18)] bg-card p-4 space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--gold-deep))]">
          Bon scannen
        </p>
        <div className="grid grid-cols-2 gap-2">
          {typeOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setScanType(opt.value)}
              className={cn(
                "h-10 rounded-xl text-xs font-semibold font-display transition-colors",
                scanType === opt.value
                  ? "bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-deep))] text-white shadow-sm"
                  : "bg-[hsl(var(--gold-soft)/0.4)] text-foreground hover:bg-[hsl(var(--gold-soft)/0.6)]",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <Button
          onClick={() => fileInputRef.current?.click()}
          disabled={create.isPending}
          className="w-full h-12 rounded-2xl bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-deep))] text-white font-display font-semibold shadow-md"
        >
          <Receipt className="h-4 w-4 mr-2" strokeWidth={2.25} />
          {create.isPending ? "Bezig met uploaden..." : "Bon scannen"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          className="hidden"
          onChange={handleFile}
        />
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--gold-deep))] mb-2">
          Recente bonnen
        </p>
        {list.isLoading ? (
          <p className="text-xs text-muted-foreground">Bezig met ophalen...</p>
        ) : receipts.length === 0 ? (
          <div className="py-6 text-center">
            <IconBubble icon={<Receipt className="h-5 w-5" />} size={48} className="mx-auto" />
            <p className="font-display font-semibold mt-3">Nog geen bonnetjes</p>
            <p className="text-xs text-muted-foreground mt-1">
              Scan je eerste bon zodra je tankt of parkeert.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {receipts.map((r) => {
              const chip = statusChip(r.status);
              const typeLabel = typeOptions.find((t) => t.value === r.type)?.label ?? r.type;
              return (
                <div
                  key={r.id}
                  className="rounded-2xl border border-[hsl(var(--gold)/0.18)] p-3 flex items-center gap-3 bg-card"
                >
                  <IconBubble icon={<Receipt className="h-4 w-4" strokeWidth={2.25} />} size={36} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold font-display truncate">
                      {typeLabel} · {formatAmount(r.total_amount, r.currency)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatScannedAt(r.scanned_at)}
                      {r.location ? ` · ${r.location}` : ""}
                    </p>
                  </div>
                  <span className={cn("text-[10px] font-semibold rounded-full px-2 py-0.5", chip.className)}>
                    {chip.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsPanel({ preferences }: { preferences: ReturnType<typeof usePreferences> }) {
  const themeOptions: Array<{ value: ThemePref; label: string; icon: typeof Sun }> = [
    { value: "licht", label: "Licht", icon: Sun },
    { value: "donker", label: "Donker", icon: Moon },
    { value: "auto", label: "Auto", icon: SettingsIcon },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[hsl(var(--gold)/0.18)] bg-card p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--gold-deep))] mb-2 flex items-center gap-2">
          <Sun className="h-3.5 w-3.5" /> Thema
        </p>
        <div className="flex gap-2">
          {themeOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => preferences.setTheme(opt.value)}
              className={cn(
                "flex-1 h-10 rounded-xl text-xs font-semibold font-display flex items-center justify-center gap-1.5 transition-colors",
                preferences.theme === opt.value
                  ? "bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-deep))] text-white shadow-sm"
                  : "bg-[hsl(var(--gold-soft)/0.4)] text-foreground hover:bg-[hsl(var(--gold-soft)/0.6)]",
              )}
            >
              <opt.icon className="h-3.5 w-3.5" />
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-[hsl(var(--gold)/0.18)] bg-card p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--gold-deep))] mb-2 flex items-center gap-2">
          <Gauge className="h-3.5 w-3.5" /> GPS-precisie
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => preferences.setGpsMode("hoog")}
            className={cn(
              "flex-1 h-12 rounded-xl text-xs font-semibold font-display flex flex-col items-center justify-center gap-0.5 transition-colors",
              preferences.gpsMode === "hoog"
                ? "bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-deep))] text-white shadow-sm"
                : "bg-[hsl(var(--gold-soft)/0.4)] text-foreground hover:bg-[hsl(var(--gold-soft)/0.6)]",
            )}
          >
            <span>Hoog</span>
            <span className="text-[9px] font-normal opacity-80">live + accuraat</span>
          </button>
          <button
            onClick={() => preferences.setGpsMode("spaar")}
            className={cn(
              "flex-1 h-12 rounded-xl text-xs font-semibold font-display flex flex-col items-center justify-center gap-0.5 transition-colors",
              preferences.gpsMode === "spaar"
                ? "bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-deep))] text-white shadow-sm"
                : "bg-[hsl(var(--gold-soft)/0.4)] text-foreground hover:bg-[hsl(var(--gold-soft)/0.6)]",
            )}
          >
            <span>Spaarmodus</span>
            <span className="text-[9px] font-normal opacity-80">batterij sparen</span>
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">
          Wijziging gaat in op de volgende rit.
        </p>
      </div>

      <ToggleRow
        icon={<Vibrate className="h-4 w-4" />}
        label="Trillingen"
        description="Haptische feedback bij swipes"
        checked={preferences.hapticsEnabled}
        onChange={preferences.setHapticsEnabled}
      />
      <ToggleRow
        icon={<BellIcon className="h-4 w-4" />}
        label="Notificaties"
        description="Pushmeldingen van planner"
        checked={preferences.notificationsEnabled}
        onChange={preferences.setNotificationsEnabled}
      />

      <div className="rounded-2xl border border-[hsl(var(--gold)/0.18)] bg-card p-4 flex items-center gap-3">
        <IconBubble icon={<Languages className="h-4 w-4" strokeWidth={2.25} />} size={36} />
        <div className="flex-1">
          <p className="text-sm font-semibold font-display">Taal</p>
          <p className="text-[11px] text-muted-foreground">Nederlands</p>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({
  icon, label, description, checked, onChange,
}: {
  icon: ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="rounded-2xl border border-[hsl(var(--gold)/0.18)] bg-card p-3 flex items-center gap-3">
      <IconBubble icon={icon} size={36} />
      <div className="flex-1">
        <p className="text-sm font-semibold font-display">{label}</p>
        <p className="text-[11px] text-muted-foreground">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={cn("h-7 w-12 rounded-full transition-colors", checked ? "bg-[hsl(var(--gold-deep))]" : "bg-muted")}
        aria-pressed={checked}
        aria-label={label}
      >
        <span className={cn("block h-5 w-5 rounded-full bg-white shadow transition-transform mx-1", checked && "translate-x-5")} />
      </button>
    </div>
  );
}
