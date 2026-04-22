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
  driverCertificateRecordSchema,
  type DriverCertificateRecordFormInput,
} from "@/lib/validation/driverCertificateRecordSchema";
import type { DriverCertification } from "@/hooks/useDriverCertifications";
import type { DriverCertificateRecord } from "@/hooks/useDriverCertificateRecords";
import { useExtractCertificate } from "@/hooks/useExtractCertificate";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driverId: string;
  certifications: DriverCertification[];
  /** Codes waarvoor al een record bestaat, wordt uitgesloten bij aanmaken. */
  existingCodes?: string[];
  record?: DriverCertificateRecord | null;
  /** Bestand dat al door de sectie is gekozen; triggert geen tweede AI-scan. */
  initialFile?: File | null;
  /** AI-voorstel dat al in de sectie is berekend; wordt als voorinvulling gebruikt. */
  initialSuggestion?: {
    certification_code: string | null;
    issued_date: string | null;
    expiry_date: string | null;
  } | null;
  onSubmit: (values: {
    certification_code: string;
    issued_date: string | null;
    expiry_date: string | null;
    notes: string | null;
    file: File | null;
  }) => Promise<void> | void;
  submitting?: boolean;
}

type LocalForm = DriverCertificateRecordFormInput;

const EMPTY: LocalForm = {
  certification_code: "",
  issued_date: "",
  expiry_date: "",
  notes: "",
};

const MAX_FILE_MB = 10;
const ACCEPTED =
  "application/pdf,image/png,image/jpeg,image/jpg,image/webp,image/heic,image/heif";

export function DriverCertificateRecordDialog({
  open,
  onOpenChange,
  certifications,
  existingCodes = [],
  record,
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
  const isEdit = Boolean(record);
  const extract = useExtractCertificate();

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (record) {
      setFile(null);
      setAiFilled(new Set());
      setForm({
        certification_code: record.certification_code,
        issued_date: record.issued_date ?? "",
        expiry_date: record.expiry_date ?? "",
        notes: record.notes ?? "",
      });
      return;
    }
    // Nieuw record: als de sectie al een bestand + AI-voorstel heeft
    // meegegeven, die direct vooringevuld tonen zodat de gebruiker
    // alleen hoeft te reviewen.
    setFile(initialFile ?? null);
    const filled = new Set<keyof LocalForm>();
    const base: LocalForm = { ...EMPTY };
    if (initialSuggestion?.certification_code) {
      base.certification_code = initialSuggestion.certification_code;
      filled.add("certification_code");
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
  }, [open, record, initialFile, initialSuggestion]);

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

  const availableCerts = certifications.filter((c) => {
    if (!c.is_active) return false;
    if (isEdit) return true; // bij bewerken is het huidige type altijd zichtbaar (Select is disabled)
    return !existingCodes.includes(c.code);
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
    // bewerken is de gebruiker bezig met een specifiek record; dan zou
    // het voorstellen van een ander type verwarrend zijn.
    if (isEdit) return;

    try {
      const result = await extract.mutateAsync(f);
      const filled = new Set<keyof LocalForm>();
      setForm((prev) => {
        const next = { ...prev };
        if (result.certification_code && !prev.certification_code) {
          next.certification_code = result.certification_code;
          filled.add("certification_code");
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
    const parsed = driverCertificateRecordSchema.safeParse(form);
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
      certification_code: parsed.data.certification_code,
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
            {isEdit ? "Certificaat bewerken" : "Certificaat toevoegen"}
          </DialogTitle>
          <DialogDescription>
            Leg het type, de geldigheidsduur en het scan-document vast.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="cr-type" className="flex items-center gap-2">
              Type *
              {aiFilled.has("certification_code") && <AiBadge />}
            </Label>
            <Select
              value={form.certification_code}
              onValueChange={(v) => updateField("certification_code", v)}
              disabled={isEdit}
            >
              <SelectTrigger id="cr-type">
                <SelectValue placeholder="Kies een certificaat-type" />
              </SelectTrigger>
              <SelectContent>
                {availableCerts.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.certification_code && (
              <p className="text-xs text-destructive">{errors.certification_code}</p>
            )}
            {isEdit && (
              <p className="text-[11px] text-muted-foreground">
                Type kan niet gewijzigd worden, verwijder en maak opnieuw aan.
              </p>
            )}
            {!isEdit && availableCerts.length === 0 && (
              <p className="text-[11px] text-muted-foreground italic">
                Alle beschikbare types zijn al toegevoegd aan deze chauffeur.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cr-issued" className="flex items-center gap-2">
                Uitgiftedatum
                {aiFilled.has("issued_date") && <AiBadge />}
              </Label>
              <Input
                id="cr-issued"
                type="date"
                value={form.issued_date ?? ""}
                onChange={(e) => updateField("issued_date", e.target.value)}
                className={aiFilled.has("issued_date") ? "bg-amber-50" : ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cr-expires" className="flex items-center gap-2">
                Vervaldatum
                {aiFilled.has("expiry_date") && <AiBadge />}
              </Label>
              <Input
                id="cr-expires"
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
            <Label htmlFor="cr-file">
              Document (PDF of foto, max {MAX_FILE_MB} MB)
            </Label>
            <Input id="cr-file" type="file" accept={ACCEPTED} onChange={onFile} />
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
            {isEdit && record?.document_name && !file && (
              <p className="text-[11px] text-muted-foreground">
                Huidig bestand: {record.document_name}. Kies een nieuw bestand om te vervangen.
              </p>
            )}
            {file && (
              <p className="text-[11px] text-muted-foreground">
                Nieuw: {file.name} ({Math.round(file.size / 1024)} KB)
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cr-notes">Notitie</Label>
            <Textarea
              id="cr-notes"
              rows={2}
              value={form.notes ?? ""}
              onChange={(e) => updateField("notes", e.target.value)}
              placeholder="Optioneel, bijv. uitgegeven door, locatie examen, opmerkingen."
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
            disabled={submitting || extract.isPending || (!isEdit && availableCerts.length === 0)}
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
