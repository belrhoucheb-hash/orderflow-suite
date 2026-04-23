import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  vehicleDocumentInputSchema,
  type VehicleDocumentInput,
} from "@/lib/validation/vehicleSchema";
import type { VehicleDocumentType } from "@/hooks/useVehicleDocumentTypes";
import type { VehicleDocument as VehicleDocumentRow } from "@/hooks/useFleet";
import { useExtractVehicleDocument } from "@/hooks/useExtractVehicleDocument";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleId: string;
  types: VehicleDocumentType[];
  /** Codes waarvoor al een document bestaat, wordt uitgesloten bij aanmaken. */
  existingCodes?: string[];
  document?: VehicleDocumentRow | null;
  /** Bestand dat al door de sectie is gekozen; triggert geen tweede AI-scan. */
  initialFile?: File | null;
  /** AI-voorstel dat al in de sectie is berekend; wordt als voorinvulling gebruikt. */
  initialSuggestion?: {
    doc_type: string | null;
    issued_date: string | null;
    expiry_date: string | null;
  } | null;
  onSubmit: (values: {
    doc_type: string;
    issued_date: string | null;
    expiry_date: string | null;
    notes: string | null;
    file: File | null;
  }) => Promise<void> | void;
  submitting?: boolean;
}

type LocalForm = {
  doc_type: string;
  issued_date: string;
  expiry_date: string;
  notes: string;
};

const EMPTY: LocalForm = {
  doc_type: "",
  issued_date: "",
  expiry_date: "",
  notes: "",
};

const MAX_FILE_MB = 10;
const ACCEPTED =
  "application/pdf,image/png,image/jpeg,image/jpg,image/webp,image/heic,image/heif";

export function DocumentDialog({
  open,
  onOpenChange,
  types,
  existingCodes = [],
  document: docRecord,
  initialFile,
  initialSuggestion,
  onSubmit,
  submitting,
}: Props) {
  const [form, setForm] = useState<LocalForm>(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Houdt bij welke velden door de AI zijn voorgesteld en nog niet door
  // de gebruiker aangeraakt zijn, zodat we die met een badge kunnen
  // markeren als "AI-voorstel, nog niet bevestigd".
  const [aiFilled, setAiFilled] = useState<Set<keyof LocalForm>>(new Set());
  const isEdit = Boolean(docRecord);
  const extract = useExtractVehicleDocument();

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (docRecord) {
      setFile(null);
      setAiFilled(new Set());
      setForm({
        doc_type: docRecord.doc_type,
        issued_date: docRecord.issued_date ?? "",
        expiry_date: docRecord.expiry_date ?? "",
        notes: docRecord.notes ?? "",
      });
      return;
    }
    // Nieuw document: als de sectie al een bestand + AI-voorstel heeft
    // meegegeven, die direct vooringevuld tonen zodat de gebruiker
    // alleen hoeft te reviewen.
    setFile(initialFile ?? null);
    const filled = new Set<keyof LocalForm>();
    const base: LocalForm = { ...EMPTY };
    if (initialSuggestion?.doc_type) {
      base.doc_type = initialSuggestion.doc_type;
      filled.add("doc_type");
    }
    if (initialSuggestion?.issued_date) {
      base.issued_date = initialSuggestion.issued_date;
      filled.add("issued_date");
    }
    if (initialSuggestion?.expiry_date) {
      base.expiry_date = initialSuggestion.expiry_date;
      filled.add("expiry_date");
    }
    setForm(base);
    setAiFilled(filled);
  }, [open, docRecord, initialFile, initialSuggestion]);

  const updateField = <K extends keyof LocalForm>(key: K, value: LocalForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    // Zodra de gebruiker een AI-voorgesteld veld zelf aanpast, verdwijnt
    // het "AI-voorstel" label omdat het dan een bewuste keuze is.
    setAiFilled((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const availableTypes = types.filter((t) => {
    if (!t.is_active) return false;
    if (isEdit) return true; // bij bewerken is het huidige type altijd zichtbaar (Select is disabled)
    return !existingCodes.includes(t.code);
  });

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (!f) {
      setFile(null);
      return;
    }
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      toast.error(`Bestand is te groot (max ${MAX_FILE_MB} MB)`);
      e.target.value = "";
      return;
    }
    setFile(f);

    // Alleen bij het aanmaken laten we de AI de velden voorstellen. Bij
    // bewerken is de gebruiker bezig met een specifiek document; dan zou
    // het voorstellen van een ander type verwarrend zijn.
    if (isEdit) return;

    try {
      const result = await extract.mutateAsync(f);
      const filled = new Set<keyof LocalForm>();
      setForm((prev) => {
        const next = { ...prev };
        if (result.doc_type && !prev.doc_type) {
          next.doc_type = result.doc_type;
          filled.add("doc_type");
        }
        if (result.issued_date && !prev.issued_date) {
          next.issued_date = result.issued_date;
          filled.add("issued_date");
        }
        if (result.expiry_date && !prev.expiry_date) {
          next.expiry_date = result.expiry_date;
          filled.add("expiry_date");
        }
        return next;
      });
      setAiFilled(filled);
      if (filled.size === 0) {
        toast.warning("AI kon niets herkennen, vul de velden handmatig aan");
      } else if (result.confidence < 0.5) {
        toast.warning("AI heeft een voorstel gedaan met lage zekerheid, controleer de velden");
      } else {
        toast.success("AI-voorstel ingevuld, controleer en pas eventueel aan");
      }
    } catch (err: any) {
      toast.error(err?.message ?? "AI-scan mislukt, vul handmatig aan");
    }
  };

  const handleSubmit = async () => {
    const parsed = vehicleDocumentInputSchema.safeParse({
      doc_type: form.doc_type,
      issued_date: form.issued_date,
      expiry_date: form.expiry_date,
      notes: form.notes,
    } satisfies VehicleDocumentInput);
    if (!parsed.success) {
      const map: Record<string, string> = {};
      parsed.error.issues.forEach((i) => {
        map[i.path.join(".")] = i.message;
      });
      setErrors(map);
      return;
    }
    setErrors({});
    await onSubmit({
      doc_type: parsed.data.doc_type,
      issued_date: parsed.data.issued_date || null,
      expiry_date: parsed.data.expiry_date || null,
      notes: parsed.data.notes || null,
      file,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Document bewerken" : "Document toevoegen"}
          </DialogTitle>
          <DialogDescription>
            Leg het type, de geldigheidsduur en het scan-document vast.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="vd-type" className="flex items-center gap-2">
              Type *
              {aiFilled.has("doc_type") && <AiBadge />}
            </Label>
            <Select
              value={form.doc_type}
              onValueChange={(v) => updateField("doc_type", v)}
              disabled={isEdit}
            >
              <SelectTrigger id="vd-type">
                <SelectValue placeholder="Kies een documenttype" />
              </SelectTrigger>
              <SelectContent>
                {availableTypes.map((t) => (
                  <SelectItem key={t.code} value={t.code}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.doc_type && (
              <p className="text-xs text-destructive">{errors.doc_type}</p>
            )}
            {isEdit && (
              <p className="text-[11px] text-muted-foreground">
                Type kan niet gewijzigd worden, verwijder en maak opnieuw aan.
              </p>
            )}
            {!isEdit && availableTypes.length === 0 && (
              <p className="text-[11px] text-muted-foreground italic">
                Alle beschikbare types zijn al toegevoegd aan dit voertuig.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="vd-issued" className="flex items-center gap-2">
                Uitgiftedatum
                {aiFilled.has("issued_date") && <AiBadge />}
              </Label>
              <Input
                id="vd-issued"
                type="date"
                value={form.issued_date ?? ""}
                onChange={(e) => updateField("issued_date", e.target.value)}
                className={aiFilled.has("issued_date") ? "bg-amber-50" : ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vd-expires" className="flex items-center gap-2">
                Vervaldatum
                {aiFilled.has("expiry_date") && <AiBadge />}
              </Label>
              <Input
                id="vd-expires"
                type="date"
                value={form.expiry_date ?? ""}
                onChange={(e) => updateField("expiry_date", e.target.value)}
                className={aiFilled.has("expiry_date") ? "bg-amber-50" : ""}
              />
              {errors.expiry_date && (
                <p className="text-xs text-destructive">{errors.expiry_date}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="vd-file">
              Document (PDF of foto, max {MAX_FILE_MB} MB)
            </Label>
            <Input id="vd-file" type="file" accept={ACCEPTED} onChange={onFile} />
            {!isEdit && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                {extract.isPending ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    AI scant het document, type en datums worden automatisch voorgesteld...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3 w-3" />
                    Na uploaden stelt de AI automatisch type, uitgifte- en vervaldatum voor.
                  </>
                )}
              </p>
            )}
            {isEdit && docRecord?.document_name && !file && (
              <p className="text-[11px] text-muted-foreground">
                Huidig bestand: {docRecord.document_name}. Kies een nieuw bestand om te vervangen.
              </p>
            )}
            {file && (
              <p className="text-[11px] text-muted-foreground">
                Nieuw: {file.name} ({Math.round(file.size / 1024)} KB)
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="vd-notes">Notitie</Label>
            <Textarea
              id="vd-notes"
              rows={2}
              value={form.notes ?? ""}
              onChange={(e) => updateField("notes", e.target.value)}
              placeholder="Optioneel, bijv. uitgegeven door, keuringsinstantie, opmerkingen."
            />
            {errors.notes && <p className="text-xs text-destructive">{errors.notes}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting || extract.isPending}
          >
            Annuleren
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || extract.isPending || (!isEdit && availableTypes.length === 0)}
          >
            {submitting ? "Opslaan..." : "Opslaan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AiBadge() {
  return (
    <span
      title="Automatisch voorgesteld door AI, controleer of dit klopt"
      className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-900 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
    >
      <Sparkles className="h-2.5 w-2.5" />
      AI-voorstel
    </span>
  );
}
