import { useState } from "react";
import { AlertTriangle, XCircle, DoorClosed, PhoneOff, Camera, Trash2, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CameraCapture } from "./CameraCapture";
import { uploadPodBlob } from "@/lib/podStorage";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type IncidentCategory = "SCHADE" | "GEWEIGERD" | "GEEN_TOEGANG" | "ONBEREIKBAAR";

interface IncidentSubmitResult {
  incidentId: string;
  category: IncidentCategory;
  reason: string;
  // Status waar de stop in moet vallen na dit incident.
  newStopStatus: "MISLUKT" | "OVERGESLAGEN";
  notes: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string | null;
  tripStopId: string;
  orderId: string | null;
  driverId: string;
  onSubmitted: (result: IncidentSubmitResult) => void;
}

const CATEGORIES: Array<{
  value: IncidentCategory;
  label: string;
  description: string;
  icon: typeof AlertTriangle;
  reason: string;
  newStopStatus: "MISLUKT" | "OVERGESLAGEN";
}> = [
  {
    value: "SCHADE",
    label: "Schade",
    description: "Beschadigd pakket of voertuig",
    icon: AlertTriangle,
    reason: "Schade gemeld",
    newStopStatus: "MISLUKT",
  },
  {
    value: "GEWEIGERD",
    label: "Geweigerd door ontvanger",
    description: "Ontvanger heeft de zending niet aangenomen",
    icon: XCircle,
    reason: "Geweigerd door ontvanger",
    newStopStatus: "OVERGESLAGEN",
  },
  {
    value: "GEEN_TOEGANG",
    label: "Geen toegang",
    description: "Dichte deur of gesloten poort",
    icon: DoorClosed,
    reason: "Geen toegang tot locatie",
    newStopStatus: "MISLUKT",
  },
  {
    value: "ONBEREIKBAAR",
    label: "Onbereikbaar",
    description: "Contactpersoon niet bereikbaar",
    icon: PhoneOff,
    reason: "Ontvanger onbereikbaar",
    newStopStatus: "MISLUKT",
  },
];

export function IncidentDialog({
  open,
  onOpenChange,
  tenantId,
  tripStopId,
  orderId,
  driverId,
  onSubmitted,
}: Props) {
  const [step, setStep] = useState<"category" | "photo" | "details">("category");
  const [category, setCategory] = useState<IncidentCategory | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [photoBlobs, setPhotoBlobs] = useState<Blob[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    photoPreviews.forEach((u) => URL.revokeObjectURL(u));
    setStep("category");
    setCategory(null);
    setShowCamera(false);
    setPhotoBlobs([]);
    setPhotoPreviews([]);
    setNotes("");
    setSubmitting(false);
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handlePickCategory = (c: IncidentCategory) => {
    setCategory(c);
    setStep("photo");
    setShowCamera(true);
  };

  const handlePhotoCaptured = (blob: Blob) => {
    setPhotoBlobs((prev) => [...prev, blob]);
    setPhotoPreviews((prev) => [...prev, URL.createObjectURL(blob)]);
    setShowCamera(false);
    setStep("details");
  };

  const handleRemovePhoto = (index: number) => {
    setPhotoBlobs((prev) => prev.filter((_, i) => i !== index));
    setPhotoPreviews((prev) => {
      const url = prev[index];
      if (url) URL.revokeObjectURL(url);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSubmit = async () => {
    if (!category) return;
    const meta = CATEGORIES.find((c) => c.value === category);
    if (!meta) return;
    if (!tenantId) {
      toast.error("Tenant niet beschikbaar, kan incident niet opslaan");
      return;
    }
    if (photoBlobs.length === 0) {
      toast.error("Foto is verplicht bij een incident");
      return;
    }

    setSubmitting(true);
    try {
      const photoPaths: string[] = [];
      for (const blob of photoBlobs) {
        const path = await uploadPodBlob(blob, {
          orderId: orderId ?? tripStopId,
          kind: "photo",
          contentType: blob.type || "image/jpeg",
          extension: "jpg",
        });
        if (path) photoPaths.push(path);
      }

      const { data: incident, error: insertErr } = await supabase
        .from("stop_incidents" as any)
        .insert({
          tenant_id: tenantId,
          trip_stop_id: tripStopId,
          order_id: orderId ?? null,
          driver_id: driverId,
          category,
          photo_urls: photoPaths,
          notes: notes.trim() || null,
        })
        .select("id")
        .single();
      if (insertErr) throw insertErr;

      onSubmitted({
        incidentId: ((incident as unknown) as { id: string }).id,
        category,
        reason: meta.reason,
        newStopStatus: meta.newStopStatus,
        notes: notes.trim() || null,
      });
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message ?? "Incident opslaan mislukt");
    } finally {
      setSubmitting(false);
    }
  };

  const selectedMeta = category ? CATEGORIES.find((c) => c.value === category) : null;

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-md p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-3 border-b border-slate-100">
            <DialogTitle className="text-base font-semibold text-slate-900">
              Probleem melden
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              {step === "category" && "Kies wat er gebeurde."}
              {step === "photo" && "Maak een foto van de situatie."}
              {step === "details" && "Voeg eventueel een toelichting toe en bevestig."}
            </DialogDescription>
          </DialogHeader>

          {step === "category" && (
            <div className="grid grid-cols-2 gap-3 p-5">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => handlePickCategory(cat.value)}
                  className={cn(
                    "flex flex-col items-start gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-left transition-all",
                    "hover:border-amber-300 hover:bg-amber-50 active:scale-[0.98]",
                  )}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                    <cat.icon className="h-5 w-5" />
                  </span>
                  <p className="text-sm font-semibold text-slate-900">{cat.label}</p>
                  <p className="text-[11px] leading-tight text-slate-500">{cat.description}</p>
                </button>
              ))}
            </div>
          )}

          {step === "details" && selectedMeta && (
            <div className="space-y-4 p-5">
              <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                  <selectedMeta.icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{selectedMeta.label}</p>
                  <p className="text-[11px] text-slate-500">{selectedMeta.description}</p>
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold text-slate-700">
                  Foto&apos;s ({photoPreviews.length})
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {photoPreviews.map((url, i) => (
                    <div key={url} className="relative aspect-square overflow-hidden rounded-lg bg-slate-100">
                      <img src={url} alt="" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(i)}
                        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-red-600 shadow-sm"
                        aria-label="Verwijder foto"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setShowCamera(true)}
                    className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-slate-300 text-slate-400 hover:border-amber-300 hover:text-amber-600"
                    aria-label="Foto toevoegen"
                  >
                    <Camera className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="incident-notes" className="mb-1 block text-xs font-semibold text-slate-700">
                  Opmerkingen (optioneel)
                </label>
                <Textarea
                  id="incident-notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Bijvoorbeeld: hek op slot, geen contactpersoon aanwezig..."
                />
              </div>
            </div>
          )}

          <DialogFooter className="flex flex-row gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
            {step === "category" ? (
              <Button variant="ghost" className="ml-auto" onClick={() => handleClose(false)}>
                Annuleren
              </Button>
            ) : (
              <>
                <Button variant="ghost" onClick={() => handleClose(false)} disabled={submitting}>
                  Annuleren
                </Button>
                {step === "details" && (
                  <Button
                    className="ml-auto bg-red-600 hover:bg-red-700 text-white"
                    onClick={handleSubmit}
                    disabled={submitting || photoBlobs.length === 0}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        Opslaan...
                      </>
                    ) : (
                      "Probleem indienen"
                    )}
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showCamera && (
        <CameraCapture
          label="Foto van de situatie"
          onCapture={handlePhotoCaptured}
          onCancel={() => {
            setShowCamera(false);
            if (photoBlobs.length === 0) {
              setStep("category");
              setCategory(null);
            } else {
              setStep("details");
            }
          }}
        />
      )}
    </>
  );
}
