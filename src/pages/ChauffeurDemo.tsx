import { useMemo, useRef, useState, type ReactNode } from "react";
import { motion, useMotionValue, animate, AnimatePresence } from "framer-motion";
import {
  MapPin, Navigation, Phone, Menu, ChevronUp, ChevronRight, ChevronLeft,
  Truck, Clock, Coffee, Square, AlertTriangle, Fingerprint, Check, MessageSquare,
  Calendar as CalendarIcon, X, ShieldCheck, FileText, BarChart3, Receipt, Siren,
  Settings as SettingsIcon, Camera, ArrowLeft, Send, FileSignature, Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LiveTripMap } from "@/components/chauffeur/LiveTripMap";
import { SwipeToConfirm } from "@/components/chauffeur/SwipeToConfirm";
import { cn } from "@/lib/utils";
import type { TripStop } from "@/types/dispatch";
import { toast } from "sonner";
import { vibrate, HAPTICS } from "@/lib/haptics";

const driver = { name: "Jan Bakker", vehicle: { name: "MB Sprinter 314", plate: "82-VKR-3" } };
const currentPosition = { lat: 52.34, lng: 4.79 };

const tripBase = {
  trip_id: "demo-trip-1",
  order_id: "ord",
  stop_type: "DELIVERY" as const,
  planned_time: null,
  actual_arrival_time: null,
  actual_departure_time: null,
  failure_reason: null,
  notes: null,
  created_at: "",
  updated_at: "",
};

const stops: TripStop[] = [
  { ...tripBase, id: "stop-1", stop_sequence: 1, stop_status: "AFGELEVERD", stop_type: "PICKUP", planned_address: "Depot Hoofddorp, Kruisweg 12", planned_latitude: 52.30, planned_longitude: 4.69, contact_name: "Magazijn", contact_phone: "+31 20 123 0001", instructions: null },
  { ...tripBase, id: "stop-2", stop_sequence: 2, stop_status: "ONDERWEG", planned_address: "Albert Heijn XL, Buikslotermeerplein 250", planned_latitude: 52.395, planned_longitude: 4.940, contact_name: "Sander de Vries", contact_phone: "+31 6 1234 5678", instructions: "Aanbellen bij laaddock 3, geen vrachtwagens voor 10:00." },
  { ...tripBase, id: "stop-3", stop_sequence: 3, stop_status: "GEPLAND", planned_address: "HEMA DC, Pieter Goedkoopweg 1", planned_latitude: 52.379, planned_longitude: 4.900, contact_name: "Mariska Jansen", contact_phone: "+31 6 2233 4455", instructions: null },
  { ...tripBase, id: "stop-4", stop_sequence: 4, stop_status: "GEPLAND", planned_address: "Jumbo, Oosterdokskade 5", planned_latitude: 52.379, planned_longitude: 4.911, contact_name: "Ramon Bakker", contact_phone: null, instructions: "Achteringang gebruiken, zijstraat naast bibliotheek." },
];

const SHEET_PEEK = 240;
const SHEET_FULL = 720;
const SHEET_HIDDEN_OFFSET = SHEET_FULL - SHEET_PEEK;

type Menu =
  | null | "drawer" | "voertuigcheck" | "rooster" | "chat" | "incident"
  | "documenten" | "beschikbaarheid" | "cijfers" | "bonnetjes" | "instellingen" | "sos" | "cmr";

type CheckSide = "voor" | "links" | "rechts" | "achter" | "cabine" | "laadruimte";
const SIDES: { key: CheckSide; label: string }[] = [
  { key: "voor", label: "Voorkant" },
  { key: "links", label: "Linkerzijde" },
  { key: "rechts", label: "Rechterzijde" },
  { key: "achter", label: "Achterkant" },
  { key: "cabine", label: "Cabine" },
  { key: "laadruimte", label: "Laadruimte" },
];
const CHECKLIST = ["Banden ok", "Lichten ok", "Vloeistoffen ok", "Geen zichtbare schade"];

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, dLat = ((b.lat - a.lat) * Math.PI) / 180, dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180, lat2 = (b.lat * Math.PI) / 180;
  const s1 = Math.sin(dLat / 2), s2 = Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s1 * s1 + Math.cos(lat1) * Math.cos(lat2) * s2 * s2)));
}

/** Premium icon-bubble: gold-soft gradient cirkel met subtiele inset-glow. */
function IconBubble({
  icon,
  size = 36,
  variant = "gold",
  className,
}: {
  icon: ReactNode;
  size?: number;
  variant?: "gold" | "muted" | "danger" | "success" | "warn";
  className?: string;
}) {
  const palette = {
    gold: "bg-gradient-to-br from-[hsl(var(--gold-soft))] via-[hsl(var(--gold-light)/0.6)] to-[hsl(var(--gold-soft))] text-[hsl(var(--gold-deep))] shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_1px_2px_rgba(0,0,0,0.06)]",
    muted: "bg-slate-100 text-slate-500",
    danger: "bg-gradient-to-br from-red-100 to-red-50 text-red-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_1px_2px_rgba(0,0,0,0.06)]",
    success: "bg-gradient-to-br from-emerald-100 to-emerald-50 text-emerald-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_1px_2px_rgba(0,0,0,0.06)]",
    warn: "bg-gradient-to-br from-amber-100 to-amber-50 text-amber-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_1px_2px_rgba(0,0,0,0.06)]",
  }[variant];
  return (
    <span
      className={cn("flex items-center justify-center rounded-2xl shrink-0", palette, className)}
      style={{ width: size, height: size }}
    >
      {icon}
    </span>
  );
}

/** Hairline divider met gold gradient. */
function GoldRule() {
  return <div className="h-px bg-gradient-to-r from-transparent via-[hsl(var(--gold)/0.4)] to-transparent" />;
}

export default function ChauffeurDemo() {
  const [stopState, setStopState] = useState(stops);
  const [menu, setMenu] = useState<Menu>(null);
  const [vehicleCheckDone, setVehicleCheckDone] = useState(false);
  const [available, setAvailable] = useState(true);
  const [checkPhotos, setCheckPhotos] = useState<Record<CheckSide, boolean>>({
    voor: false, links: false, rechts: false, achter: false, cabine: false, laadruimte: false,
  });
  const [checkList, setCheckList] = useState<Record<string, boolean>>({});

  // CMR state
  const [cmrStop, setCmrStop] = useState<TripStop | null>(null);
  const [cmrName, setCmrName] = useState("");
  const [cmrEmail, setCmrEmail] = useState("");
  const [cmrSendCopy, setCmrSendCopy] = useState(true);
  const [cmrSigned, setCmrSigned] = useState(false);
  const cmrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);

  // Rooster state
  const [roosterView, setRoosterView] = useState<"week" | "maand">("week");
  const [roosterMonth, setRoosterMonth] = useState(4); // mei (0-indexed)

  const sheetY = useMotionValue(SHEET_HIDDEN_OFFSET);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentStop = useMemo(
    () => stopState.find((s) => ["ONDERWEG", "AANGEKOMEN", "LADEN", "LOSSEN"].includes(s.stop_status)) ?? stopState[0],
    [stopState],
  );
  const remaining = stopState.filter((s) => !["AFGELEVERD", "MISLUKT", "OVERGESLAGEN"].includes(s.stop_status)).length;
  const stopCoord = currentStop?.planned_latitude && currentStop?.planned_longitude
    ? { lat: currentStop.planned_latitude, lng: currentStop.planned_longitude }
    : null;
  const km = stopCoord ? haversineKm(currentPosition, stopCoord) : null;
  const eta = km !== null ? Math.max(1, Math.round((km / 50) * 60)) : null;

  const allPhotosDone = Object.values(checkPhotos).every(Boolean);
  const allChecksDone = CHECKLIST.every((c) => checkList[c]);
  const canFinishCheck = allPhotosDone && allChecksDone;

  const setStatus = (id: string, status: TripStop["stop_status"]) => {
    setStopState((prev) => prev.map((s) => (s.id === id ? { ...s, stop_status: status } : s)));
  };

  const handleArrived = async (id: string) => {
    setStatus(id, "AANGEKOMEN");
    vibrate(HAPTICS.short);
    toast.success("Aankomst geregistreerd", {
      action: { label: "Ongedaan", onClick: () => setStatus(id, "ONDERWEG") },
      duration: 5000,
    });
  };
  const handleStartUnload = async (id: string) => { setStatus(id, "LOSSEN"); vibrate(HAPTICS.short); toast.success("Lossen gestart"); };
  const openCMR = (stop: TripStop) => {
    setCmrStop(stop);
    setCmrName(stop.contact_name ?? "");
    setCmrEmail("");
    setCmrSigned(false);
    setMenu("cmr");
  };

  const expandSheet = () => animate(sheetY, 0, { type: "spring", stiffness: 300, damping: 32 });
  const collapseSheet = () => animate(sheetY, SHEET_HIDDEN_OFFSET, { type: "spring", stiffness: 300, damping: 32 });

  const finishVehicleCheck = () => {
    setVehicleCheckDone(true);
    setMenu(null);
    vibrate(HAPTICS.success);
    toast.success("Voertuigcheck voltooid", { description: "Je kunt nu beginnen met rijden." });
  };

  // CMR signature canvas
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
  const cmrSubmit = () => {
    if (!cmrStop) return;
    if (!cmrSigned || !cmrName.trim()) { toast.error("Naam ontvanger en handtekening zijn vereist"); return; }
    setStatus(cmrStop.id, "AFGELEVERD");
    vibrate(HAPTICS.long);
    toast.success("CMR ondertekend en opgeslagen", { description: cmrSendCopy && cmrEmail ? `Kopie verzonden naar ${cmrEmail}` : "Klant geinformeerd, POD vastgelegd." });
    setMenu(null); setCmrStop(null);
  };

  return (
    <div className="min-h-screen w-full flex items-start justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-0 sm:p-8">
      <div
        ref={containerRef}
        className="relative w-full sm:max-w-[420px] sm:h-[900px] h-screen overflow-hidden sm:rounded-[44px] sm:border sm:border-[hsl(var(--gold)/0.3)] sm:shadow-[0_30px_60px_-15px_rgba(0,0,0,0.5)] bg-slate-100"
      >
        {/* FULL-BLEED MAP */}
        <div className="absolute inset-0">
          <LiveTripMap
            currentPosition={currentPosition}
            stops={stopState}
            currentStopId={currentStop?.id ?? null}
            height="100%"
            className="w-full h-full"
          />
        </div>

        {/* GLASS HEADER */}
        <div className="absolute top-0 left-0 right-0 z-20 p-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMenu("drawer")}
              className="h-11 w-11 rounded-full bg-white/90 backdrop-blur-md shadow-[0_4px_20px_-4px_rgba(0,0,0,0.15)] border border-[hsl(var(--gold)/0.25)] flex items-center justify-center"
              aria-label="Menu"
            >
              <Menu className="h-[18px] w-[18px] text-foreground" strokeWidth={2.25} />
            </button>
            <div className="flex-1 flex items-center gap-2.5 rounded-full bg-white/85 backdrop-blur-md px-3 py-1.5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.15)] border border-[hsl(var(--gold)/0.22)]">
              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[hsl(var(--gold-light))] via-[hsl(var(--gold))] to-[hsl(var(--gold-deep))] flex items-center justify-center text-white font-bold font-display text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]">
                {driver.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold leading-tight font-display truncate">{driver.name}</p>
                <p className="text-[10px] text-muted-foreground tabular-nums flex items-center gap-1.5">
                  <span className={cn("inline-block h-1.5 w-1.5 rounded-full", available ? "bg-emerald-500 animate-pulse" : "bg-slate-400")} />
                  {driver.vehicle.plate} · {remaining} stops
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Drive-time pill (right side) */}
        <div className="absolute right-3 z-20" style={{ top: 78 }}>
          <div className="rounded-full bg-white/90 backdrop-blur-md shadow-[0_4px_20px_-4px_rgba(0,0,0,0.15)] border border-[hsl(var(--gold)/0.22)] pl-2 pr-3 py-1.5 text-[11px] font-semibold tabular-nums text-foreground flex items-center gap-1.5">
            <IconBubble icon={<Clock className="h-3 w-3" />} size={20} />
            2:42 / 4:30
          </div>
        </div>

        {/* Voertuigcheck banner */}
        {!vehicleCheckDone && (
          <button
            onClick={() => setMenu("voertuigcheck")}
            className="absolute left-3 right-3 z-20 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 backdrop-blur-md text-white shadow-lg border border-amber-400/50 p-3 flex items-center gap-3"
            style={{ top: 78 + 48 }}
          >
            <span className="h-9 w-9 rounded-xl bg-white/20 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5" strokeWidth={2.25} />
            </span>
            <div className="flex-1 text-left">
              <p className="text-[12px] font-semibold leading-tight">Voertuigcheck vereist</p>
              <p className="text-[10px] text-amber-50">6 foto's en checklist voor je kunt rijden</p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0" />
          </button>
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
          className="absolute left-0 right-0 bottom-0 z-30 bg-white shadow-[0_-20px_50px_-10px_rgba(0,0,0,0.25)] rounded-t-[28px] border-t border-[hsl(var(--gold)/0.25)] overflow-hidden"
        >
          <div style={{ height: SHEET_FULL }} className="flex flex-col">
            <button
              onClick={() => (sheetY.get() < SHEET_HIDDEN_OFFSET / 2 ? collapseSheet() : expandSheet())}
              className="w-full pt-2.5 pb-1 flex justify-center"
              aria-label="Open details"
            >
              <span className="block h-1.5 w-12 rounded-full bg-gradient-to-r from-[hsl(var(--gold)/0.3)] via-[hsl(var(--gold-deep)/0.5)] to-[hsl(var(--gold)/0.3)]" />
            </button>

            {/* PEEK CONTENT */}
            <div className="px-5 pt-1 pb-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-deep))] text-white text-xs font-bold font-display shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_2px_4px_rgba(0,0,0,0.1)]">
                    {currentStop?.stop_sequence}
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
                {currentStop?.planned_address}
              </p>
              {(currentStop?.contact_name || currentStop?.contact_phone) && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {currentStop.contact_name}{currentStop.contact_name && currentStop.contact_phone ? " · " : ""}{currentStop.contact_phone}
                </p>
              )}

              <div className="flex items-center gap-2 mt-3">
                {!vehicleCheckDone ? (
                  <button
                    onClick={() => setMenu("voertuigcheck")}
                    className="flex-1 h-[60px] rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 text-white font-display font-semibold text-sm flex items-center justify-center gap-2 shadow-md"
                  >
                    <ShieldCheck className="h-4 w-4" strokeWidth={2.25} />
                    Voltooi eerst voertuigcheck
                  </button>
                ) : (
                  <div className="flex-1">
                    {currentStop && currentStop.stop_status === "ONDERWEG" && (
                      <SwipeToConfirm label="Veeg om aankomst te melden" icon={<MapPin className="h-4 w-4" />} onConfirm={() => handleArrived(currentStop.id)} />
                    )}
                    {currentStop && currentStop.stop_status === "AANGEKOMEN" && (
                      <SwipeToConfirm label="Veeg om te starten met lossen" icon={<Truck className="h-4 w-4" />} onConfirm={() => handleStartUnload(currentStop.id)} />
                    )}
                    {currentStop && currentStop.stop_status === "LOSSEN" && (
                      <SwipeToConfirm label="Veeg om CMR te tekenen" icon={<FileSignature className="h-4 w-4" />} variant="success" onConfirm={async () => { openCMR(currentStop); }} />
                    )}
                  </div>
                )}
                <button
                  onClick={() => currentStop?.planned_address && window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(currentStop.planned_address)}`, "_blank")}
                  className="h-[60px] w-[60px] rounded-2xl bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-deep))] text-white shadow-md flex items-center justify-center"
                  aria-label="Navigeer"
                >
                  <Navigation className="h-5 w-5" strokeWidth={2.25} />
                </button>
                <button
                  onClick={() => currentStop?.contact_phone && window.open(`tel:${currentStop.contact_phone}`)}
                  disabled={!currentStop?.contact_phone}
                  className={cn(
                    "h-[60px] w-[60px] rounded-2xl border flex items-center justify-center shrink-0",
                    currentStop?.contact_phone
                      ? "border-[hsl(var(--gold)/0.4)] bg-white text-[hsl(var(--gold-deep))]"
                      : "border-slate-200 bg-slate-50 text-slate-300",
                  )}
                  aria-label="Bel"
                >
                  <Phone className="h-5 w-5" strokeWidth={2.25} />
                </button>
              </div>
            </div>

            <GoldRule />

            {/* EXPANDED CONTENT */}
            <div className="px-5 py-4 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => setMenu("rooster")} className="rounded-2xl border border-[hsl(var(--gold)/0.18)] bg-gradient-to-br from-[hsl(var(--gold-soft)/0.5)] to-[hsl(var(--gold-soft)/0.2)] py-3 flex flex-col items-center gap-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                  <IconBubble icon={<CalendarIcon className="h-4 w-4" strokeWidth={2.25} />} size={32} />
                  <span className="text-[11px] font-semibold font-display">Rooster</span>
                </button>
                <button onClick={() => setMenu("chat")} className="rounded-2xl border border-[hsl(var(--gold)/0.18)] bg-gradient-to-br from-[hsl(var(--gold-soft)/0.5)] to-[hsl(var(--gold-soft)/0.2)] py-3 flex flex-col items-center gap-1.5 relative shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                  <IconBubble icon={<MessageSquare className="h-4 w-4" strokeWidth={2.25} />} size={32} />
                  <span className="text-[11px] font-semibold font-display">Chat</span>
                  <span className="absolute top-2 right-3 h-2 w-2 rounded-full bg-red-500" />
                </button>
                <button onClick={() => setMenu("incident")} className="rounded-2xl border border-red-200/70 bg-gradient-to-br from-red-50 to-red-50/40 py-3 flex flex-col items-center gap-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                  <IconBubble icon={<AlertTriangle className="h-4 w-4" strokeWidth={2.25} />} size={32} variant="danger" />
                  <span className="text-[11px] font-semibold font-display text-red-700">Probleem</span>
                </button>
              </div>

              <div className="rounded-2xl border border-amber-200/70 bg-gradient-to-br from-amber-50/80 to-amber-50/30 p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                <div className="flex items-center justify-between text-[11px] font-semibold mb-2">
                  <span className="flex items-center gap-2">
                    <IconBubble icon={<Clock className="h-3 w-3" strokeWidth={2.5} />} size={22} variant="warn" />
                    Rijtijd
                  </span>
                  <span className="tabular-nums text-amber-800 font-display">2:42 / 4:30</span>
                </div>
                <div className="h-1.5 rounded-full bg-amber-100 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-amber-400 to-amber-500" style={{ width: "60%" }} />
                </div>
                <p className="text-[10px] text-amber-800 mt-2">Nog 1u 48m tot wettelijke pauze van 45 min.</p>
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-[hsl(var(--gold)/0.18)] bg-white p-3 shadow-[inset_0_1px_0_rgba(255,255,255,1)]">
                <div className="flex items-center gap-2.5">
                  <IconBubble icon={<Clock className="h-4 w-4" strokeWidth={2.25} />} size={36} variant="success" />
                  <div>
                    <p className="text-sm font-semibold font-display leading-tight">Aan het werk</p>
                    <p className="text-[11px] text-muted-foreground tabular-nums">5u 12m vandaag</p>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <Button variant="outline" size="sm" className="rounded-xl h-8 px-2.5 text-[11px] font-semibold border-[hsl(var(--gold)/0.3)]">
                    <Coffee className="h-3 w-3 mr-1" />
                    Pauze
                  </Button>
                  <Button size="sm" className="rounded-xl h-8 px-2.5 text-[11px] font-semibold bg-red-500 hover:bg-red-600 text-white">
                    <Square className="h-3 w-3 mr-1" />
                    Stop
                  </Button>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--gold-deep))] mb-2">Resterende stops</p>
                <div className="space-y-2">
                  {stopState.map((stop, i) => {
                    const isCurrent = stop.id === currentStop?.id;
                    const isDone = ["AFGELEVERD", "MISLUKT", "OVERGESLAGEN"].includes(stop.stop_status);
                    return (
                      <div
                        key={stop.id}
                        className={cn(
                          "rounded-2xl border p-3 flex items-center gap-3",
                          isCurrent && "border-[hsl(var(--gold)/0.4)] bg-gradient-to-br from-[hsl(var(--gold-soft)/0.4)] to-[hsl(var(--gold-soft)/0.15)] shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]",
                          isDone && "border-slate-200 bg-slate-50/60 opacity-70",
                          !isCurrent && !isDone && "border-[hsl(var(--gold)/0.14)] bg-white",
                        )}
                      >
                        <span className={cn(
                          "h-9 w-9 rounded-xl flex items-center justify-center text-xs font-bold font-display shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]",
                          isDone ? "bg-gradient-to-br from-emerald-100 to-emerald-50 text-emerald-700" :
                          isCurrent ? "bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-deep))] text-white" :
                          "bg-gradient-to-br from-[hsl(var(--gold-soft))] to-[hsl(var(--gold-soft)/0.5)] text-[hsl(var(--gold-deep))]",
                        )}>
                          {isDone ? <Check className="h-4 w-4" strokeWidth={2.5} /> : i + 1}
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
            </div>
          </div>
        </motion.div>

        {/* DRAG-UP HINT */}
        <button
          onClick={expandSheet}
          className="absolute z-20 left-1/2 -translate-x-1/2 flex items-center gap-1 text-[10px] font-semibold text-muted-foreground bg-white/85 backdrop-blur-sm rounded-full px-2.5 py-1 shadow-sm border border-[hsl(var(--gold)/0.18)]"
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
                className="absolute top-0 left-0 bottom-0 z-50 w-[80%] max-w-[340px] bg-white flex flex-col"
              >
                <div className="bg-gradient-to-br from-[hsl(var(--gold-deep))] via-[hsl(var(--gold-deep)/0.95)] to-[hsl(var(--gold))] p-5 text-white relative overflow-hidden">
                  <div className="absolute -top-16 -right-16 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
                  <button onClick={() => setMenu(null)} className="absolute top-3 right-3 h-8 w-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                    <X className="h-4 w-4" />
                  </button>
                  <div className="h-14 w-14 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center font-display font-bold text-2xl mb-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]">
                    {driver.name.charAt(0)}
                  </div>
                  <p className="font-display text-[19px] font-semibold leading-tight tracking-tight">{driver.name}</p>
                  <p className="text-xs text-white/85 tabular-nums mt-0.5">{driver.vehicle.name} · {driver.vehicle.plate}</p>
                  <button
                    onClick={() => setAvailable(!available)}
                    className="mt-4 inline-flex items-center gap-2 text-xs font-semibold bg-white/20 backdrop-blur-sm rounded-full px-3 py-1.5 border border-white/20"
                  >
                    <span className={cn("h-2 w-2 rounded-full", available ? "bg-emerald-300 animate-pulse" : "bg-slate-300")} />
                    {available ? "Beschikbaar" : "Niet beschikbaar"}
                  </button>
                </div>
                <nav className="flex-1 overflow-y-auto py-3 px-2">
                  {[
                    { k: "voertuigcheck" as Menu, l: "Voertuigcheck", I: ShieldCheck, badge: vehicleCheckDone ? "Voltooid" : "Vereist", danger: !vehicleCheckDone },
                    { k: "rooster" as Menu, l: "Mijn rooster", I: CalendarIcon },
                    { k: "beschikbaarheid" as Menu, l: "Beschikbaarheid", I: Check },
                    { k: "chat" as Menu, l: "Chat met planner", I: MessageSquare, badge: "1" },
                    { k: "documenten" as Menu, l: "Mijn documenten", I: FileText, badge: "ADR verloopt" },
                    { k: "cijfers" as Menu, l: "Mijn cijfers", I: BarChart3 },
                    { k: "bonnetjes" as Menu, l: "Bonnetjes & tank", I: Receipt },
                    { k: "incident" as Menu, l: "Probleem melden", I: AlertTriangle },
                    { k: "instellingen" as Menu, l: "Instellingen", I: SettingsIcon },
                    { k: "sos" as Menu, l: "SOS / Noodhulp", I: Siren, danger: true },
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
                      <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-[hsl(var(--gold-deep))] transition-colors" />
                    </button>
                  ))}
                </nav>
                <div className="p-4 border-t border-slate-100 text-[10px] text-muted-foreground tracking-wide">
                  OrderFlow Driver Portal · v2.4.0
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* VOERTUIGCHECK WIZARD */}
        {menu === "voertuigcheck" && (
          <div className="absolute inset-0 z-50 bg-white flex flex-col">
            <div className="flex items-center gap-3 p-4 border-b border-[hsl(var(--gold)/0.16)]">
              <button onClick={() => setMenu(vehicleCheckDone ? null : "drawer")} className="h-9 w-9 rounded-xl bg-slate-100 flex items-center justify-center">
                <ArrowLeft className="h-4 w-4" strokeWidth={2.25} />
              </button>
              <IconBubble icon={<ShieldCheck className="h-4 w-4" strokeWidth={2.25} />} size={36} />
              <div className="flex-1">
                <p className="font-display font-bold text-base leading-tight">Voertuigcheck</p>
                <p className="text-[11px] text-muted-foreground tabular-nums">{driver.vehicle.name} · {driver.vehicle.plate}</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--gold-deep))] mb-2.5">Foto's exterieur en interieur</p>
                <div className="grid grid-cols-2 gap-2.5">
                  {SIDES.map((s) => (
                    <button
                      key={s.key}
                      onClick={() => { setCheckPhotos((prev) => ({ ...prev, [s.key]: true })); vibrate(HAPTICS.short); }}
                      className={cn(
                        "aspect-[4/3] rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-2 relative transition-all",
                        checkPhotos[s.key]
                          ? "border-emerald-400 bg-gradient-to-br from-emerald-50 to-emerald-50/40"
                          : "border-[hsl(var(--gold)/0.3)] bg-gradient-to-br from-[hsl(var(--gold-soft)/0.3)] to-[hsl(var(--gold-soft)/0.1)]",
                      )}
                    >
                      <IconBubble
                        icon={checkPhotos[s.key] ? <Check className="h-5 w-5" strokeWidth={2.5} /> : <Camera className="h-5 w-5" strokeWidth={2} />}
                        size={44}
                        variant={checkPhotos[s.key] ? "success" : "gold"}
                      />
                      <span className={cn("text-xs font-semibold font-display", checkPhotos[s.key] ? "text-emerald-700" : "text-foreground")}>
                        {s.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--gold-deep))] mb-2.5">Checklist</p>
                <div className="space-y-2">
                  {CHECKLIST.map((c) => (
                    <button
                      key={c}
                      onClick={() => setCheckList((prev) => ({ ...prev, [c]: !prev[c] }))}
                      className={cn(
                        "w-full flex items-center gap-3 p-3 rounded-2xl border text-left transition-colors",
                        checkList[c]
                          ? "border-emerald-300 bg-gradient-to-br from-emerald-50 to-emerald-50/40"
                          : "border-[hsl(var(--gold)/0.18)] bg-white",
                      )}
                    >
                      <span className={cn(
                        "h-6 w-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-colors",
                        checkList[c] ? "border-emerald-500 bg-emerald-500" : "border-slate-300",
                      )}>
                        {checkList[c] && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
                      </span>
                      <span className="text-sm font-semibold font-display">{c}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-amber-50/40 border border-amber-200/70 p-3 text-[11px] text-amber-800 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <p>Vind je schade? Tik bij het betreffende paneel op de foto en voeg een opmerking toe. De planner krijgt automatisch een melding.</p>
              </div>
            </div>

            <div className="p-4 border-t border-[hsl(var(--gold)/0.16)] bg-white">
              <Button
                disabled={!canFinishCheck}
                onClick={finishVehicleCheck}
                className={cn(
                  "w-full h-12 rounded-2xl font-display font-semibold text-sm shadow-md",
                  canFinishCheck
                    ? "bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-deep))] hover:opacity-95 text-white"
                    : "bg-slate-200 text-slate-400",
                )}
              >
                <ShieldCheck className="h-4 w-4 mr-2" strokeWidth={2.25} />
                Voertuigcheck afronden
              </Button>
              {!canFinishCheck && (
                <p className="text-[10px] text-muted-foreground text-center mt-2">
                  Maak alle 6 foto's en vink de checklist af.
                </p>
              )}
            </div>
          </div>
        )}

        {/* CMR SIGNING */}
        {menu === "cmr" && cmrStop && (
          <div className="absolute inset-0 z-50 bg-white flex flex-col">
            <div className="flex items-center gap-3 p-4 border-b border-[hsl(var(--gold)/0.16)]">
              <button onClick={() => setMenu(null)} className="h-9 w-9 rounded-xl bg-slate-100 flex items-center justify-center">
                <ArrowLeft className="h-4 w-4" strokeWidth={2.25} />
              </button>
              <IconBubble icon={<FileSignature className="h-4 w-4" strokeWidth={2.25} />} size={36} />
              <div className="flex-1">
                <p className="font-display font-bold text-base leading-tight">CMR ondertekenen</p>
                <p className="text-[11px] text-muted-foreground truncate">{cmrStop.planned_address}</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* CMR Preview */}
              <div className="rounded-2xl border border-[hsl(var(--gold)/0.25)] bg-gradient-to-br from-[hsl(var(--gold-soft)/0.4)] to-[hsl(var(--gold-soft)/0.15)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--gold-deep))]">CMR vrachtbrief</p>
                  <span className="text-[10px] font-semibold text-muted-foreground tabular-nums">#CMR-2026-04829</span>
                </div>
                <div className="space-y-2 text-[12px]">
                  <div className="flex justify-between"><span className="text-muted-foreground">Vervoerder</span><span className="font-semibold">Royalty Cargo</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Voertuig</span><span className="font-semibold tabular-nums">{driver.vehicle.plate}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Chauffeur</span><span className="font-semibold">{driver.name}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Lading</span><span className="font-semibold">8 europallets · 1.420 kg</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Aflevering</span><span className="font-semibold text-right max-w-[60%] truncate">{cmrStop.planned_address}</span></div>
                </div>
              </div>

              {/* Recipient */}
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))]">Ontvanger</label>
                <input
                  value={cmrName}
                  onChange={(e) => setCmrName(e.target.value)}
                  placeholder="Naam van ontvanger"
                  className="mt-1.5 w-full h-11 px-3 rounded-xl border border-[hsl(var(--gold)/0.25)] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold)/0.3)]"
                />
              </div>

              {/* Signature */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))]">Handtekening ontvanger</label>
                  {cmrSigned && (
                    <button onClick={cmrClear} className="text-[10px] font-semibold text-muted-foreground underline">
                      Wissen
                    </button>
                  )}
                </div>
                <div className="rounded-2xl border-2 border-dashed border-[hsl(var(--gold)/0.3)] bg-gradient-to-br from-[hsl(var(--gold-soft)/0.3)] to-white relative overflow-hidden" style={{ height: 180 }}>
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

              {/* Send copy */}
              <div className={cn(
                "rounded-2xl border p-3 transition-colors",
                cmrSendCopy ? "border-[hsl(var(--gold)/0.3)] bg-gradient-to-br from-[hsl(var(--gold-soft)/0.4)] to-[hsl(var(--gold-soft)/0.15)]" : "border-slate-200 bg-white",
              )}>
                <button
                  onClick={() => setCmrSendCopy(!cmrSendCopy)}
                  className="w-full flex items-center justify-between"
                >
                  <span className="flex items-center gap-2.5">
                    <IconBubble icon={<Mail className="h-4 w-4" strokeWidth={2.25} />} size={32} />
                    <span className="text-sm font-semibold font-display">Kopie naar klant mailen</span>
                  </span>
                  <span className={cn("h-6 w-11 rounded-full transition-colors", cmrSendCopy ? "bg-[hsl(var(--gold-deep))]" : "bg-slate-300")}>
                    <span className={cn("block h-5 w-5 rounded-full bg-white shadow transition-transform mt-0.5 ml-0.5", cmrSendCopy && "translate-x-5")} />
                  </span>
                </button>
                {cmrSendCopy && (
                  <input
                    value={cmrEmail}
                    onChange={(e) => setCmrEmail(e.target.value)}
                    placeholder="ontvanger@bedrijf.nl"
                    type="email"
                    className="mt-2.5 w-full h-9 px-3 rounded-xl border border-[hsl(var(--gold)/0.25)] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold)/0.3)] bg-white"
                  />
                )}
              </div>
            </div>

            <div className="p-4 border-t border-[hsl(var(--gold)/0.16)] bg-white">
              <Button
                disabled={!cmrSigned || !cmrName.trim()}
                onClick={cmrSubmit}
                className={cn(
                  "w-full h-12 rounded-2xl font-display font-semibold text-sm shadow-md",
                  cmrSigned && cmrName.trim()
                    ? "bg-gradient-to-br from-emerald-500 to-emerald-600 hover:opacity-95 text-white"
                    : "bg-slate-200 text-slate-400",
                )}
              >
                <Send className="h-4 w-4 mr-2" strokeWidth={2.25} />
                CMR ondertekend, aflevering voltooien
              </Button>
            </div>
          </div>
        )}

        {/* ROOSTER (week + maand) */}
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
                      ? "bg-white text-[hsl(var(--gold-deep))] shadow-sm"
                      : "text-muted-foreground",
                  )}
                >
                  {v}
                </button>
              ))}
            </div>

            {roosterView === "week" ? (
              <div className="space-y-2">
                {[
                  { day: "Maandag 4 mei", shift: "Dagdienst", start: "07:00", vehicle: "82-VKR-3", status: "Gewerkt" },
                  { day: "Dinsdag 5 mei", shift: "Dagdienst", start: "07:00", vehicle: "82-VKR-3", status: "Vandaag" },
                  { day: "Woensdag 6 mei", shift: "Dagdienst", start: "07:30", vehicle: "82-VKR-3", status: "Gepland" },
                  { day: "Donderdag 7 mei", shift: "Dagdienst", start: "07:00", vehicle: "12-RBL-9", status: "Gepland" },
                  { day: "Vrijdag 8 mei", shift: "Dagdienst", start: "07:00", vehicle: "82-VKR-3", status: "Gepland" },
                  { day: "Zaterdag 9 mei", shift: "Vrij", start: "-", vehicle: "-", status: "Vrij" },
                  { day: "Zondag 10 mei", shift: "Vrij", start: "-", vehicle: "-", status: "Vrij" },
                ].map((row) => (
                  <div key={row.day} className="rounded-2xl border border-[hsl(var(--gold)/0.18)] p-3 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,1)]">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold font-display">{row.day}</p>
                      <span className={cn(
                        "text-[10px] font-semibold rounded-full px-2.5 py-0.5",
                        row.status === "Vandaag" && "bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-deep))] text-white shadow-sm",
                        row.status === "Vrij" && "bg-slate-100 text-slate-500",
                        row.status === "Gepland" && "bg-[hsl(var(--gold-soft))] text-[hsl(var(--gold-deep))]",
                        row.status === "Gewerkt" && "bg-emerald-50 text-emerald-700",
                      )}>{row.status}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground tabular-nums mt-1">{row.shift} · Start {row.start} · {row.vehicle}</p>
                  </div>
                ))}
              </div>
            ) : (
              <MonthGrid month={roosterMonth} onPrev={() => setRoosterMonth((m) => Math.max(0, m - 1))} onNext={() => setRoosterMonth((m) => Math.min(11, m + 1))} />
            )}
          </BottomDrawer>
        )}

        {/* BESCHIKBAARHEID */}
        {menu === "beschikbaarheid" && (
          <BottomDrawer title="Beschikbaarheid" onClose={() => setMenu(null)}>
            <div className="rounded-2xl border border-[hsl(var(--gold)/0.2)] bg-gradient-to-br from-[hsl(var(--gold-soft)/0.4)] to-white p-4 flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <IconBubble icon={<Check className="h-4 w-4" strokeWidth={2.5} />} size={40} variant={available ? "success" : "muted"} />
                <div>
                  <p className="font-display font-semibold text-sm">Vandaag beschikbaar</p>
                  <p className="text-[11px] text-muted-foreground">Planner kan je inplannen</p>
                </div>
              </div>
              <button onClick={() => setAvailable(!available)} className={cn("h-7 w-12 rounded-full transition-colors", available ? "bg-emerald-500" : "bg-slate-300")}>
                <span className={cn("block h-5 w-5 rounded-full bg-white shadow transition-transform mx-1", available && "translate-x-5")} />
              </button>
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--gold-deep))] mb-2">Komende week</p>
            <div className="space-y-2">
              {["Maandag 11 mei","Dinsdag 12 mei","Woensdag 13 mei","Donderdag 14 mei","Vrijdag 15 mei","Zaterdag 16 mei","Zondag 17 mei"].map((d, i) => (
                <div key={d} className="rounded-2xl border border-[hsl(var(--gold)/0.14)] p-3 flex items-center justify-between bg-white">
                  <p className="text-sm font-semibold font-display">{d}</p>
                  <select className="text-xs font-semibold bg-[hsl(var(--gold-soft)/0.4)] rounded-full px-3 py-1.5 border-0 cursor-pointer">
                    <option>{i < 5 ? "Beschikbaar" : "Niet beschikbaar"}</option>
                    <option>Beschikbaar</option>
                    <option>Liever niet</option>
                    <option>Niet beschikbaar</option>
                  </select>
                </div>
              ))}
            </div>
          </BottomDrawer>
        )}

        {/* DOCUMENTEN */}
        {menu === "documenten" && (
          <BottomDrawer title="Mijn documenten" onClose={() => setMenu(null)}>
            <div className="space-y-2">
              {[
                { l: "Rijbewijs CE", date: "geldig tot 14-08-2029", status: "ok" },
                { l: "Code 95", date: "geldig tot 22-11-2027", status: "ok" },
                { l: "ADR Basis + Tank", date: "verloopt over 18 dagen", status: "warn" },
                { l: "Medische keuring", date: "geldig tot 03-05-2027", status: "ok" },
                { l: "Tachograafkaart", date: "geldig tot 30-09-2028", status: "ok" },
                { l: "Identiteitsbewijs", date: "geldig tot 12-04-2031", status: "ok" },
              ].map((d) => (
                <div key={d.l} className="rounded-2xl border border-[hsl(var(--gold)/0.18)] p-3 flex items-center gap-3 bg-white">
                  <IconBubble icon={<FileText className="h-4 w-4" strokeWidth={2.25} />} size={40} variant={d.status === "warn" ? "warn" : "success"} />
                  <div className="flex-1">
                    <p className="text-sm font-semibold font-display">{d.l}</p>
                    <p className={cn("text-[11px]", d.status === "warn" ? "text-amber-700 font-semibold" : "text-muted-foreground")}>{d.date}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300" />
                </div>
              ))}
            </div>
          </BottomDrawer>
        )}

        {/* MIJN CIJFERS */}
        {menu === "cijfers" && (
          <BottomDrawer title="Mijn cijfers" onClose={() => setMenu(null)}>
            <div className="grid grid-cols-2 gap-3">
              {[
                { l: "Deze week", v: "32u 14m", s: "uren gewerkt" },
                { l: "Ritten", v: "47", s: "deze maand" },
                { l: "Stops", v: "189", s: "deze maand" },
                { l: "On-time", v: "96%", s: "stops op tijd" },
                { l: "Km gereden", v: "2.184", s: "deze maand" },
                { l: "Pauzes", v: "100%", s: "compliant EU 561" },
              ].map((m) => (
                <div key={m.l} className="rounded-2xl border border-[hsl(var(--gold)/0.18)] p-3.5 bg-gradient-to-br from-white to-[hsl(var(--gold-soft)/0.2)] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{m.l}</p>
                  <p className="font-display text-2xl font-bold tabular-nums text-foreground mt-1">{m.v}</p>
                  <p className="text-[11px] text-muted-foreground">{m.s}</p>
                </div>
              ))}
            </div>
          </BottomDrawer>
        )}

        {/* BONNETJES */}
        {menu === "bonnetjes" && (
          <BottomDrawer title="Bonnetjes & tank" onClose={() => setMenu(null)}>
            <Button className="w-full h-12 rounded-2xl bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-deep))] text-white font-display font-semibold mb-3 shadow-md">
              <Camera className="h-4 w-4 mr-2" strokeWidth={2.25} /> Bon scannen
            </Button>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--gold-deep))] mb-2">Recent</p>
            <div className="space-y-2">
              {[
                { d: "5 mei", l: "Shell Hoofddorp", a: "€ 142,30", t: "Diesel" },
                { d: "3 mei", l: "Q-Park Amsterdam Centrum", a: "€ 12,50", t: "Parkeren" },
                { d: "1 mei", l: "BP Diemen", a: "€ 138,90", t: "Diesel" },
                { d: "29 apr", l: "Tol Westerscheldetunnel", a: "€ 10,40", t: "Tol" },
              ].map((b) => (
                <div key={b.d + b.l} className="rounded-2xl border border-[hsl(var(--gold)/0.16)] p-3 flex items-center gap-3 bg-white">
                  <IconBubble icon={<Receipt className="h-4 w-4" strokeWidth={2.25} />} size={36} />
                  <div className="flex-1">
                    <p className="text-sm font-semibold font-display">{b.l}</p>
                    <p className="text-[11px] text-muted-foreground">{b.d} · {b.t}</p>
                  </div>
                  <p className="font-display tabular-nums font-semibold text-sm">{b.a}</p>
                </div>
              ))}
            </div>
          </BottomDrawer>
        )}

        {/* INSTELLINGEN */}
        {menu === "instellingen" && (
          <BottomDrawer title="Instellingen" onClose={() => setMenu(null)}>
            <div className="space-y-2">
              {[
                { l: "Taal", v: "Nederlands" },
                { l: "Voorkeurs-navigatie", v: "Google Maps" },
                { l: "Donker thema", v: "Auto" },
                { l: "Trillingen", v: "Aan" },
                { l: "GPS-precisie", v: "Hoog (alleen tijdens rit)" },
                { l: "Notificaties", v: "Aan" },
              ].map((s) => (
                <div key={s.l} className="rounded-2xl border border-[hsl(var(--gold)/0.16)] p-3 flex items-center justify-between bg-white">
                  <p className="text-sm font-semibold font-display">{s.l}</p>
                  <span className="text-xs text-muted-foreground">{s.v}</span>
                </div>
              ))}
            </div>
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
              <p className="text-sm text-white/80 mb-8 max-w-xs">Kies wat je nu nodig hebt. De planner krijgt direct een melding met je locatie.</p>
              <div className="w-full max-w-xs space-y-3">
                <Button className="w-full h-14 rounded-2xl bg-white text-red-600 font-display font-bold shadow-md">
                  <Phone className="h-5 w-5 mr-2" /> Bel planner direct
                </Button>
                <Button className="w-full h-14 rounded-2xl bg-white/15 text-white font-display font-bold border border-white/30 backdrop-blur-sm">
                  <AlertTriangle className="h-5 w-5 mr-2" /> Pech onderweg
                </Button>
                <Button className="w-full h-14 rounded-2xl bg-white/15 text-white font-display font-bold border border-white/30 backdrop-blur-sm">
                  <Siren className="h-5 w-5 mr-2" /> Ongeval melden
                </Button>
                <Button className="w-full h-14 rounded-2xl bg-white/15 text-white font-display font-bold border border-white/30 backdrop-blur-sm">
                  <Phone className="h-5 w-5 mr-2" /> Bel 112
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* CHAT */}
        {menu === "chat" && (
          <BottomDrawer title="Chat met planner" onClose={() => setMenu(null)} large>
            <div className="space-y-2 mb-3">
              {[
                { from: "planner", body: "Goeiemorgen Jan, je rit van vandaag is klaar. Eerste stop AH Buikslotermeer.", time: "06:42" },
                { from: "driver", body: "Ontvangen, ik vertrek over 10 min.", time: "06:45" },
                { from: "planner", body: "Top. Bij stop 3 (HEMA DC) is het laaddok bezet tot 11:00, hou daar rekening mee.", time: "07:12" },
                { from: "driver", body: "Begrepen, ga eerst Jumbo doen.", time: "07:13" },
              ].map((m, i) => (
                <div key={i} className={cn("flex", m.from === "driver" ? "justify-end" : "justify-start")}>
                  <div className={cn(
                    "max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                    m.from === "driver"
                      ? "bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-deep))] text-white rounded-br-sm"
                      : "bg-[hsl(var(--gold-soft)/0.6)] text-foreground rounded-bl-sm border border-[hsl(var(--gold)/0.18)]",
                  )}>
                    <p className="leading-snug">{m.body}</p>
                    <p className={cn("text-[10px] mt-0.5 tabular-nums", m.from === "driver" ? "text-white/70" : "text-muted-foreground")}>{m.time}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input placeholder="Bericht aan planner..." className="flex-1 h-10 px-3 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold)/0.3)]" />
              <Button className="rounded-xl h-10 px-4 text-xs bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-deep))] hover:opacity-95 text-white">Stuur</Button>
            </div>
          </BottomDrawer>
        )}

        {/* INCIDENT */}
        {menu === "incident" && (
          <BottomDrawer title="Probleem melden" onClose={() => setMenu(null)}>
            <p className="text-sm text-muted-foreground mb-3">Kies een categorie. Foto verplicht, opmerking optioneel.</p>
            <div className="grid grid-cols-2 gap-3">
              {["Schade", "Geweigerd", "Geen toegang", "Onbereikbaar"].map((c) => (
                <button key={c} className="rounded-2xl border border-[hsl(var(--gold)/0.2)] p-4 flex flex-col items-center gap-2.5 hover:border-[hsl(var(--gold)/0.4)] transition-colors bg-gradient-to-br from-white to-[hsl(var(--gold-soft)/0.2)]">
                  <IconBubble icon={<AlertTriangle className="h-5 w-5" strokeWidth={2.25} />} size={44} variant="warn" />
                  <span className="text-sm font-semibold font-display">{c}</span>
                </button>
              ))}
            </div>
          </BottomDrawer>
        )}
      </div>
    </div>
  );
}

const MAANDEN = ["Januari","Februari","Maart","April","Mei","Juni","Juli","Augustus","September","Oktober","November","December"];

function MonthGrid({ month, onPrev, onNext }: { month: number; onPrev: () => void; onNext: () => void }) {
  // Mock day-status pattern: weekend = vrij, today = mei 5, rest gepland behalve 1-4 = gewerkt
  const daysInMonth = new Date(2026, month + 1, 0).getDate();
  const firstDay = (new Date(2026, month, 1).getDay() + 6) % 7; // monday-first
  const today = month === 4 ? 5 : -1;

  const dayStatus = (d: number, weekend: boolean): "gewerkt" | "vandaag" | "gepland" | "vrij" => {
    if (d === today) return "vandaag";
    if (weekend) return "vrij";
    if (month === 4 && d < 5) return "gewerkt";
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
        <p className="font-display font-semibold text-base tracking-tight">{MAANDEN[month]} 2026</p>
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
            "bg-slate-50 text-slate-400 border border-slate-100";
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
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Vrij</p>
          <p className="font-display font-bold text-xl tabular-nums text-slate-600 mt-0.5">{totals.vrij}</p>
        </div>
      </div>
    </div>
  );
}

function BottomDrawer({ title, onClose, large, children }: { title: string; onClose: () => void; large?: boolean; children: ReactNode }) {
  return (
    <div className="absolute inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end" onClick={onClose}>
      <div className={cn("bg-white w-full rounded-t-[28px] flex flex-col shadow-[0_-30px_60px_-15px_rgba(0,0,0,0.3)]", large ? "max-h-[88%]" : "max-h-[80%]")} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-[hsl(var(--gold)/0.16)]">
          <h3 className="font-display font-bold text-lg tracking-tight">{title}</h3>
          <button onClick={onClose} className="h-8 w-8 rounded-xl bg-slate-100 flex items-center justify-center"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {children}
        </div>
      </div>
    </div>
  );
}
