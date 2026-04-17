import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, AlertTriangle, Loader2, ShieldAlert, Info } from "lucide-react";
import { CameraCapture } from "./CameraCapture";
import { toast } from "sonner";
import {
  REQUIRED_SIDES,
  OPTIONAL_SIDES,
  type PhotoSide,
  type VehicleCheckPhoto,
  useBaseline,
  useStartVehicleCheck,
  useSubmitVehicleCheck,
  useUploadCheckPhoto,
} from "@/hooks/useVehicleCheck";

const SIDE_LABEL: Record<PhotoSide, string> = {
  front: "Voorkant",
  rear: "Achterkant",
  left: "Linkerzijde",
  right: "Rechterzijde",
  interior_front: "Interieur cabine",
  interior_cargo: "Interieur laadruimte",
  dashboard: "Dashboard (km-stand)",
  klep: "Klep",
  koelunit: "Koelunit",
};

const CHECKLIST_ITEMS: { key: string; label: string }[] = [
  { key: "lights", label: "Lichten (koplampen, remlichten, knipperlichten)" },
  { key: "tires", label: "Banden (profiel, spanning, geen zichtbare schade)" },
  { key: "fluids", label: "Vloeistoffen (olie, koelvloeistof, ruitensproeier)" },
  { key: "wipers", label: "Ruitenwissers" },
  { key: "mirrors", label: "Spiegels heel en juist afgesteld" },
  { key: "safety_kit", label: "Veiligheidsuitrusting (hesje, gevarendriehoek)" },
  { key: "first_aid", label: "Eerste-hulpkit aanwezig" },
  { key: "fire_ext", label: "Brandblusser aanwezig en geldig" },
  { key: "tacho_card", label: "Tachograafkaart aanwezig" },
  { key: "fuel_level", label: "Tankstand genoteerd" },
];

interface Props {
  tenantId: string;
  driverId: string | null;
  vehicleId: string;
  onCompleted: () => void;
  asBaselineSeed?: boolean;
  onCancel?: () => void;
}

function severityClasses(sev: "none" | "minor" | "blocking" | undefined): string {
  switch (sev) {
    case "blocking":
      return "border-red-400/60 bg-red-50 dark:bg-red-950/20";
    case "minor":
      return "border-[hsl(var(--gold))/0.5] bg-[hsl(var(--gold-soft))/0.5]";
    case "none":
      return "border-emerald-400/50 bg-emerald-50/60 dark:bg-emerald-950/15";
    default:
      return "border-[hsl(var(--border))/0.6] bg-card";
  }
}

export function VehicleCheckScreen({
  tenantId,
  driverId,
  vehicleId,
  onCompleted,
  asBaselineSeed = false,
  onCancel,
}: Props) {
  const baselineQ = useBaseline(vehicleId);
  const start = useStartVehicleCheck();
  const upload = useUploadCheckPhoto();
  const submit = useSubmitVehicleCheck();

  const [checkId, setCheckId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Partial<Record<PhotoSide, VehicleCheckPhoto>>>({});
  const [uploading, setUploading] = useState<PhotoSide | null>(null);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState("");
  const [cameraSide, setCameraSide] = useState<PhotoSide | null>(null);
  const [errorBySide, setErrorBySide] = useState<Partial<Record<PhotoSide, string>>>({});
  const [driverNotes, setDriverNotes] = useState<Partial<Record<PhotoSide, string>>>({});
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    start.mutate(
      { tenantId, driverId, vehicleId, asBaselineSeed },
      {
        onSuccess: (id) => setCheckId(id),
        onError: (e: any) => toast.error("Kon check niet starten: " + e.message),
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const baselinePhotoBySide = useMemo(() => {
    const map = new Map<PhotoSide, VehicleCheckPhoto>();
    for (const p of baselineQ.data?.photos ?? []) map.set(p.side, p);
    return map;
  }, [baselineQ.data]);

  const handleFile = async (side: PhotoSide, file: Blob) => {
    if (!checkId) return;
    setUploading(side);
    setErrorBySide((prev) => ({ ...prev, [side]: undefined }));
    try {
      const baseline = baselinePhotoBySide.get(side);
      console.log("[VehicleCheck] uploading", side, { checkId, tenantId, baseline });
      const result = await upload.mutateAsync({
        checkId,
        tenantId,
        side,
        file,
        baselinePhotoPath: baseline?.storage_path ?? null,
        baselineDescription: baseline?.ai_description ?? null,
      });
      console.log("[VehicleCheck] result", side, result);
      setPhotos((prev) => ({ ...prev, [side]: result }));
      setDriverNotes((prev) => ({ ...prev, [side]: result.ai_description ?? "" }));
      if (result.severity === "blocking") {
        toast.error(`Blokkerende schade gevonden op ${SIDE_LABEL[side]}`);
      } else if (result.severity === "minor") {
        toast.warning(`Kleine afwijking op ${SIDE_LABEL[side]}`);
      } else {
        toast.success(`${SIDE_LABEL[side]} OK`);
      }
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      console.error("[VehicleCheck] upload failed", side, e);
      setErrorBySide((prev) => ({ ...prev, [side]: msg }));
      toast.error("Upload/analyse mislukt: " + msg);
    } finally {
      setUploading(null);
    }
  };

  const photosDoneCount = REQUIRED_SIDES.reduce((n, s) => (photos[s] ? n + 1 : n), 0);
  const photosTotal = REQUIRED_SIDES.length;
  const checklistDoneCount = CHECKLIST_ITEMS.reduce(
    (n, c) => (checklist[c.key] ? n + 1 : n),
    0,
  );
  const checklistTotal = CHECKLIST_ITEMS.length;
  const allPhotosDone = photosDoneCount === photosTotal;
  const allChecklistDone = checklistDoneCount === checklistTotal;
  const canSubmit = !!checkId && allPhotosDone && allChecklistDone && !submit.isPending;

  const handleSubmit = async () => {
    if (!checkId) return;
    try {
      const photoList = [...REQUIRED_SIDES, ...OPTIONAL_SIDES]
        .map((s) => photos[s]!)
        .filter(Boolean);
      const res = await submit.mutateAsync({
        tenantId,
        checkId,
        driverId,
        vehicleId,
        checklist,
        notes,
        photos: photoList,
        driverNotes,
        baselineCheckId: baselineQ.data?.checkId ?? null,
        asBaselineSeed,
      });
      if (asBaselineSeed) {
        toast.success("Baseline vastgelegd. Deze check is nu de referentie.");
        onCompleted();
        return;
      }
      if (res.status === "DAMAGE_FOUND") {
        toast.error(
          `${res.damagedCount} schade(s) gemeld. Planner is geïnformeerd. Wacht op vrijgave voor je kunt rijden.`,
          { duration: 8000 },
        );
      } else {
        toast.success("Check OK. Je kunt beginnen met rijden.");
        onCompleted();
      }
    } catch (e: any) {
      toast.error("Submit mislukt: " + (e?.message ?? e));
    }
  };

  return (
    <>
    {cameraSide && (
      <CameraCapture
        label={`Foto: ${SIDE_LABEL[cameraSide]}`}
        onCancel={() => setCameraSide(null)}
        onCapture={(blob) => {
          const side = cameraSide;
          setCameraSide(null);
          if (side) handleFile(side, blob);
        }}
      />
    )}
    <div
      className="min-h-screen bg-background p-4 pb-28"
      style={{ fontFamily: "var(--font-ui)" }}
    >
      <div className="max-w-2xl mx-auto">
        <header className="mb-6">
          <div className="flex items-start gap-3">
            <div
              className="h-9 w-9 rounded-full border flex items-center justify-center shrink-0 mt-1"
              style={{
                background: "hsl(var(--gold-soft) / 0.3)",
                borderColor: "hsl(var(--gold) / 0.25)",
                color: "hsl(var(--gold-deep))",
              }}
            >
              <ShieldAlert className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div
                className="flex items-center gap-2 mb-2"
                style={{ fontFamily: "var(--font-display)" }}
              >
                <span
                  aria-hidden
                  className="inline-block h-[1px] w-6"
                  style={{ background: "hsl(var(--gold) / 0.5)" }}
                />
                <span className="text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--gold-deep))] font-semibold">
                  {asBaselineSeed ? "Baseline vastleggen" : "Pre-trip inspectie"}
                </span>
              </div>
              <h1
                className="text-[2.25rem] leading-[1.05] font-semibold tracking-tight text-foreground"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {asBaselineSeed ? "Baseline-check" : "Voertuigcheck"}
              </h1>
              <div
                className="mt-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground/70"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {asBaselineSeed
                  ? "Huidige staat van het voertuig vastleggen als referentie"
                  : "Verplicht vóór dienst, zonder OK-check geen orders"}
              </div>
            </div>
          </div>

          {!baselineQ.data?.checkId && !baselineQ.isLoading && (
            <div className="callout--luxe mt-4">
              <Info className="callout--luxe__icon" />
              <div>
                <div className="callout--luxe__title">Geen baseline beschikbaar</div>
                <div className="callout--luxe__body">
                  Eerste check voor dit voertuig. Schade-detectie begint vanaf de
                  volgende check; eventuele bestaande schade kun je nu vastleggen
                  in de opmerkingen.
                </div>
              </div>
            </div>
          )}
        </header>

        <section className="card--luxe p-5 mb-4">
          <div className="chapter-badge mb-3">Stap 1 · Foto's</div>
          <h2
            className="text-[1.35rem] leading-tight font-semibold tracking-tight mb-2"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Foto's, alle {REQUIRED_SIDES.length} zijdes
          </h2>
          <ProgressStrip
            label="Foto's"
            done={photosDoneCount}
            total={photosTotal}
          />
          <div className="grid grid-cols-2 gap-3 mt-4">
            {REQUIRED_SIDES.map((side) => {
              const done = photos[side];
              return (
                <div
                  key={side}
                  className={`rounded-xl border p-3 transition-colors ${severityClasses(
                    done?.severity,
                  )}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className="text-[11px] uppercase tracking-[0.14em] font-semibold text-foreground"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {SIDE_LABEL[side]}
                    </span>
                    {done ? (
                      done.severity === "blocking" ? (
                        <span className="text-xs font-semibold text-red-700 px-2 py-0.5 rounded-full bg-red-100">
                          Blokkerend
                        </span>
                      ) : done.severity === "minor" ? (
                        <span
                          className="text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{
                            color: "hsl(var(--gold-deep))",
                            background: "hsl(var(--gold-soft))",
                            border: "1px solid hsl(var(--gold) / 0.35)",
                          }}
                        >
                          Minor
                        </span>
                      ) : (
                        <Check className="h-4 w-4 text-emerald-600" />
                      )
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className={`btn-luxe w-full ${done ? "" : "btn-luxe--primary"}`}
                    disabled={uploading === side || !checkId}
                    onClick={() => setCameraSide(side)}
                  >
                    {uploading === side ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Analyseren…
                      </>
                    ) : (
                      <>
                        <Camera className="h-4 w-4" />
                        {done ? "Opnieuw" : "Foto maken"}
                      </>
                    )}
                  </button>
                  {done?.ai_diff && (
                    <p className="text-xs text-foreground/80 mt-2 italic leading-snug">
                      {done.ai_diff}
                    </p>
                  )}
                  {done &&
                    done.severity !== "none" &&
                    typeof done.confidence === "number" && (
                      <p
                        className="text-[10px] uppercase tracking-[0.14em] mt-1.5 font-semibold"
                        style={{
                          color: "hsl(var(--gold-deep))",
                          fontFamily: "var(--font-display)",
                        }}
                      >
                        AI-zekerheid {Math.round(done.confidence * 100)}%
                      </p>
                    )}
                  {errorBySide[side] && (
                    <p className="text-[11px] text-red-700 mt-2 leading-snug break-words">
                      {errorBySide[side]}
                    </p>
                  )}
                  {done && (
                    <textarea
                      value={driverNotes[side] ?? ""}
                      onChange={(e) =>
                        setDriverNotes((prev) => ({ ...prev, [side]: e.target.value }))
                      }
                      placeholder="Correctie of aanvulling (optioneel)"
                      rows={2}
                      className="w-full mt-2 rounded-lg px-2.5 py-2 text-[0.8rem] leading-relaxed resize-none outline-none transition-colors"
                      style={{
                        fontFamily: "var(--font-ui)",
                        background:
                          "linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--gold-soft) / 0.18) 100%)",
                        border: "1px solid hsl(var(--gold) / 0.28)",
                        color: "hsl(var(--foreground))",
                        boxShadow: "inset 0 1px 0 hsl(0 0% 100% / 0.3)",
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = "hsl(var(--gold) / 0.55)";
                        e.currentTarget.style.boxShadow =
                          "inset 0 1px 0 hsl(0 0% 100% / 0.3), 0 0 0 3px hsl(var(--gold) / 0.12)";
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = "hsl(var(--gold) / 0.28)";
                        e.currentTarget.style.boxShadow =
                          "inset 0 1px 0 hsl(0 0% 100% / 0.3)";
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-6">
            <div
              className="text-[10px] uppercase tracking-[0.14em] font-semibold text-muted-foreground/70 mb-3"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Optioneel (indien van toepassing)
            </div>
            <div className="grid grid-cols-2 gap-3">
              {OPTIONAL_SIDES.map((side) => {
                const done = photos[side];
                return (
                  <div
                    key={side}
                    className={`rounded-xl border p-3 transition-colors ${severityClasses(
                      done?.severity,
                    )}`}
                    style={{ opacity: done ? 1 : 0.7 }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className="text-[11px] uppercase tracking-[0.14em] font-semibold text-foreground"
                        style={{ fontFamily: "var(--font-display)" }}
                      >
                        {SIDE_LABEL[side]}
                      </span>
                      {done ? (
                        done.severity === "blocking" ? (
                          <span className="text-xs font-semibold text-red-700 px-2 py-0.5 rounded-full bg-red-100">
                            Blokkerend
                          </span>
                        ) : done.severity === "minor" ? (
                          <span
                            className="text-xs font-semibold px-2 py-0.5 rounded-full"
                            style={{
                              color: "hsl(var(--gold-deep))",
                              background: "hsl(var(--gold-soft))",
                              border: "1px solid hsl(var(--gold) / 0.35)",
                            }}
                          >
                            Minor
                          </span>
                        ) : (
                          <Check className="h-4 w-4 text-emerald-600" />
                        )
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className={`btn-luxe w-full ${done ? "" : "btn-luxe--primary"}`}
                      disabled={uploading === side || !checkId}
                      onClick={() => setCameraSide(side)}
                    >
                      {uploading === side ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" /> Analyseren…
                        </>
                      ) : (
                        <>
                          <Camera className="h-4 w-4" />
                          {done ? "Opnieuw" : "Foto maken"}
                        </>
                      )}
                    </button>
                    {done?.ai_diff && (
                      <p className="text-xs text-foreground/80 mt-2 italic leading-snug">
                        {done.ai_diff}
                      </p>
                    )}
                    {done &&
                      done.severity !== "none" &&
                      typeof done.confidence === "number" && (
                        <p
                          className="text-[10px] uppercase tracking-[0.14em] mt-1.5 font-semibold"
                          style={{
                            color: "hsl(var(--gold-deep))",
                            fontFamily: "var(--font-display)",
                          }}
                        >
                          AI-zekerheid {Math.round(done.confidence * 100)}%
                        </p>
                      )}
                    {errorBySide[side] && (
                      <p className="text-[11px] text-red-700 mt-2 leading-snug break-words">
                        {errorBySide[side]}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="card--luxe p-5 mb-4">
          <div className="chapter-badge mb-3">Stap 2 · Checklist</div>
          <h2
            className="text-[1.35rem] leading-tight font-semibold tracking-tight mb-2"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Inspectie
          </h2>
          <ProgressStrip
            label="Checklist"
            done={checklistDoneCount}
            total={checklistTotal}
          />
          <ul className="space-y-2.5 mt-4">
            {CHECKLIST_ITEMS.map((item) => {
              const checked = !!checklist[item.key];
              return (
                <li key={item.key}>
                  <label
                    className={`flex items-center gap-3 text-[0.9375rem] cursor-pointer rounded-lg border px-3.5 py-2.5 transition-colors ${
                      checked
                        ? "border-[hsl(var(--gold))/0.45] bg-[hsl(var(--gold-soft))/0.45]"
                        : "border-border/60 hover:bg-muted/40"
                    }`}
                    style={{ fontFamily: "var(--font-ui)", letterSpacing: "-0.005em" }}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[hsl(var(--gold-deep))]"
                      checked={checked}
                      onChange={(e) =>
                        setChecklist((prev) => ({ ...prev, [item.key]: e.target.checked }))
                      }
                    />
                    <span className={checked ? "text-foreground font-medium" : "text-foreground/80"}>
                      {item.label}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="card--luxe p-5 mb-4">
          <div className="chapter-badge mb-3">Stap 3 · Opmerkingen</div>
          <h2
            className="text-[1.05rem] font-semibold mb-3"
            style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.01em" }}
          >
            Notities
          </h2>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optioneel: extra bevindingen, bijzonderheden, uitleg bij een minor flag"
            rows={3}
            className="w-full rounded-lg px-3 py-2.5 text-[0.9rem] leading-relaxed resize-none outline-none transition-colors"
            style={{
              fontFamily: "var(--font-ui)",
              background: "linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--gold-soft) / 0.18) 100%)",
              border: "1px solid hsl(var(--gold) / 0.28)",
              color: "hsl(var(--foreground))",
              boxShadow: "inset 0 1px 0 hsl(0 0% 100% / 0.3)",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "hsl(var(--gold) / 0.55)";
              e.currentTarget.style.boxShadow =
                "inset 0 1px 0 hsl(0 0% 100% / 0.3), 0 0 0 3px hsl(var(--gold) / 0.12)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "hsl(var(--gold) / 0.28)";
              e.currentTarget.style.boxShadow = "inset 0 1px 0 hsl(0 0% 100% / 0.3)";
            }}
          />
        </section>

        <div
          className="fixed bottom-0 left-0 right-0 backdrop-blur p-4"
          style={{
            background: "hsl(var(--card) / 0.92)",
            borderTop: "1px solid hsl(var(--gold) / 0.25)",
            boxShadow: "0 -8px 24px -12px hsl(var(--gold) / 0.15)",
          }}
        >
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            {onCancel && (
              <button
                type="button"
                className="btn-luxe"
                style={{
                  height: "3rem",
                  fontSize: "0.95rem",
                  letterSpacing: "-0.005em",
                  fontFamily: "var(--font-display)",
                }}
                onClick={onCancel}
              >
                Annuleren
              </button>
            )}
            <button
              type="button"
              className="btn-luxe btn-luxe--primary flex-1"
              style={{
                height: "3rem",
                fontSize: "0.95rem",
                letterSpacing: "-0.005em",
                fontFamily: "var(--font-display)",
              }}
              disabled={!canSubmit}
              onClick={handleSubmit}
            >
              {submit.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Versturen…
                </>
              ) : asBaselineSeed ? (
                <>Baseline vastleggen</>
              ) : (
                <>Check afronden</>
              )}
            </button>
            {!(allPhotosDone && allChecklistDone) && (
              <p className="text-xs text-muted-foreground mt-2 text-center flex items-center justify-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Alle {REQUIRED_SIDES.length} foto's + {CHECKLIST_ITEMS.length} checklist-items verplicht
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

function ProgressStrip({
  label,
  done,
  total,
}: {
  label: string;
  done: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const complete = done >= total;
  return (
    <div className="mb-1">
      <div className="flex items-center justify-between mb-1.5">
        <span
          className="text-[10px] uppercase tracking-[0.14em] font-semibold text-muted-foreground"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {label}
        </span>
        <span
          className="text-[11px] font-semibold tabular-nums"
          style={{
            fontFamily: "var(--font-display)",
            color: complete ? "hsl(var(--gold-deep))" : "hsl(var(--foreground) / 0.7)",
          }}
        >
          {done} van {total}
        </span>
      </div>
      <div
        className="h-1.5 w-full rounded-full overflow-hidden"
        style={{
          background: "hsl(var(--gold-soft) / 0.4)",
          border: "1px solid hsl(var(--gold) / 0.18)",
        }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
      >
        <div
          className="h-full transition-[width] duration-300"
          style={{
            width: `${pct}%`,
            background:
              "linear-gradient(90deg, hsl(var(--gold)) 0%, hsl(var(--gold-deep)) 100%)",
            boxShadow: "0 0 6px hsl(var(--gold) / 0.45)",
          }}
        />
      </div>
    </div>
  );
}
