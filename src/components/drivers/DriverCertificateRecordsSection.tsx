import { useMemo, useRef, useState } from "react";
import { Download, FileText, Loader2, Pencil, Sparkles, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDriverCertifications } from "@/hooks/useDriverCertifications";
import {
  getCertificateDownloadUrl,
  useCreateDriverCertificateRecord,
  useDeleteDriverCertificateRecord,
  useDriverCertificateRecords,
  useUpdateDriverCertificateRecord,
  type DriverCertificateRecord,
} from "@/hooks/useDriverCertificateRecords";
import { useExtractCertificate } from "@/hooks/useExtractCertificate";
import { DriverCertificateRecordDialog } from "./DriverCertificateRecordDialog";

interface Props {
  driverId: string;
}

type ExpiryStatus = "expired" | "soon-1w" | "soon-1m" | "soon-3m" | "ok" | "none";

function expiryStatus(expiresAt: string | null): ExpiryStatus {
  if (!expiresAt) return "none";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expiresAt);
  const diffDays = Math.floor((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "expired";
  if (diffDays <= 7) return "soon-1w";
  if (diffDays <= 31) return "soon-1m";
  if (diffDays <= 92) return "soon-3m";
  return "ok";
}

function ExpiryBadge({ expiresAt }: { expiresAt: string | null }) {
  const status = expiryStatus(expiresAt);
  const base =
    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase";
  if (status === "none") {
    return <span className={`${base} bg-muted text-muted-foreground`}>Geen einddatum</span>;
  }
  if (status === "expired") {
    return <span className={`${base} bg-red-100 text-red-800`}>Verlopen</span>;
  }
  if (status === "soon-1w") {
    return <span className={`${base} bg-red-100 text-red-800`}>&lt; 1 week</span>;
  }
  if (status === "soon-1m") {
    return <span className={`${base} bg-orange-100 text-orange-800`}>&lt; 1 maand</span>;
  }
  if (status === "soon-3m") {
    return <span className={`${base} bg-amber-100 text-amber-900`}>&lt; 3 maanden</span>;
  }
  return <span className={`${base} bg-emerald-100 text-emerald-800`}>Geldig</span>;
}

function formatDate(d: string | null) {
  if (!d) return "—";
  const parts = d.split("-");
  if (parts.length !== 3) return d;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

export function DriverCertificateRecordsSection({ driverId }: Props) {
  const { data: records = [], isLoading } = useDriverCertificateRecords(driverId);
  const { data: certifications = [] } = useDriverCertifications();
  const createMut = useCreateDriverCertificateRecord();
  const updateMut = useUpdateDriverCertificateRecord();
  const deleteMut = useDeleteDriverCertificateRecord();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DriverCertificateRecord | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DriverCertificateRecord | null>(null);
  // Bestand + AI-voorstel die meegegeven worden aan de dialog zodra de
  // scan klaar is. Zo ziet de gebruiker in één keer de vooringevulde
  // velden en hoeft alleen te reviewen/op te slaan.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<{
    certification_code: string | null;
    issued_date: string | null;
    expiry_date: string | null;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const extract = useExtractCertificate();

  const submitting = createMut.isPending || updateMut.isPending;

  const certNameByCode = useMemo(() => {
    const m: Record<string, string> = {};
    certifications.forEach((c) => {
      m[c.code] = c.name;
    });
    return m;
  }, [certifications]);

  const existingCodes = useMemo(() => records.map((r) => r.certification_code), [records]);

  const sorted = useMemo(() => {
    // Verlopen en bijna-verlopende records eerst, zonder einddatum onderaan.
    return [...records].sort((a, b) => {
      const sa = expiryStatus(a.expiry_date);
      const sb = expiryStatus(b.expiry_date);
      const order: ExpiryStatus[] = [
        "expired",
        "soon-1w",
        "soon-1m",
        "soon-3m",
        "ok",
        "none",
      ];
      return order.indexOf(sa) - order.indexOf(sb);
    });
  }, [records]);

  const MAX_FILE_MB = 10;

  const onFileChosen = async (file: File) => {
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      toast.error(`Bestand is te groot (max ${MAX_FILE_MB} MB)`);
      return;
    }
    setEditing(null);
    setPendingFile(file);
    setAiSuggestion(null);

    try {
      const result = await extract.mutateAsync(file);
      setAiSuggestion({
        certification_code: result.certification_code,
        issued_date: result.issued_date,
        expiry_date: result.expiry_date,
      });
      if (!result.certification_code && !result.issued_date && !result.expiry_date) {
        toast.warning("AI kon niets herkennen, vul de velden handmatig aan");
      } else if (result.confidence < 0.5) {
        toast.warning("AI-voorstel met lage zekerheid, controleer de velden");
      } else {
        toast.success("AI-voorstel ingevuld, controleer en pas eventueel aan");
      }
    } catch (err: any) {
      toast.error(err?.message ?? "AI-scan mislukt, vul handmatig aan");
    } finally {
      setDialogOpen(true);
    }
  };

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (f) onFileChosen(f);
    // reset zodat hetzelfde bestand opnieuw gekozen kan worden
    e.target.value = "";
  };

  const onAddManual = () => {
    setEditing(null);
    setPendingFile(null);
    setAiSuggestion(null);
    setDialogOpen(true);
  };

  const onEdit = (r: DriverCertificateRecord) => {
    setEditing(r);
    setPendingFile(null);
    setAiSuggestion(null);
    setDialogOpen(true);
  };

  const onSubmit = async (values: {
    certification_code: string;
    issued_date: string | null;
    expiry_date: string | null;
    notes: string | null;
    file: File | null;
  }) => {
    try {
      if (editing) {
        await updateMut.mutateAsync({
          id: editing.id,
          driver_id: editing.driver_id,
          previous_document_url: editing.document_url,
          issued_date: values.issued_date,
          expiry_date: values.expiry_date,
          notes: values.notes,
          file: values.file,
        });
        toast.success("Certificaat bijgewerkt");
      } else {
        await createMut.mutateAsync({
          driver_id: driverId,
          certification_code: values.certification_code,
          issued_date: values.issued_date,
          expiry_date: values.expiry_date,
          notes: values.notes,
          file: values.file,
        });
        toast.success("Certificaat toegevoegd");
      }
      setDialogOpen(false);
      setEditing(null);
    } catch (err: any) {
      toast.error(err?.message ?? "Opslaan mislukt");
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const r = pendingDelete;
    setPendingDelete(null);
    try {
      await deleteMut.mutateAsync({
        id: r.id,
        driver_id: r.driver_id,
        document_url: r.document_url,
      });
      toast.success("Certificaat verwijderd");
    } catch (err: any) {
      toast.error(err?.message ?? "Verwijderen mislukt");
    }
  };

  const onDownload = async (r: DriverCertificateRecord) => {
    if (!r.document_url) return;
    try {
      const url = await getCertificateDownloadUrl(r.document_url);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      toast.error(err?.message ?? "Kon bestand niet openen");
    }
  };

  const triggerPicker = () => fileInputRef.current?.click();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Certificaten</h3>
          <p className="text-[11px] text-muted-foreground">
            Upload een PDF of foto, de AI leest type, uitgifte- en vervaldatum uit.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={triggerPicker}
            className="h-8"
            disabled={extract.isPending}
          >
            {extract.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5 mr-1" />
            )}
            {extract.isPending ? "Scannen..." : "Upload certificaat"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onAddManual}
            className="h-8"
            disabled={extract.isPending}
          >
            Handmatig
          </Button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/jpg,image/webp,image/heic,image/heif"
        className="hidden"
        onChange={onFileInput}
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : sorted.length === 0 ? (
        <button
          type="button"
          onClick={triggerPicker}
          disabled={extract.isPending}
          className="w-full rounded-lg border-2 border-dashed border-border py-10 text-center text-xs text-muted-foreground hover:border-primary hover:bg-muted/40 transition-colors flex flex-col items-center gap-2 disabled:opacity-60 disabled:cursor-wait"
        >
          {extract.isPending ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="font-medium">AI scant het document...</span>
            </>
          ) : (
            <>
              <div className="rounded-full bg-primary/10 p-3">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <span className="font-medium text-foreground">
                Sleep een PDF of foto hierheen, of klik om te uploaden
              </span>
              <span>
                De AI leest automatisch het type, de uitgiftedatum en de vervaldatum uit.
              </span>
            </>
          )}
        </button>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Uitgegeven</TableHead>
              <TableHead>Vervalt</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Bestand</TableHead>
              <TableHead className="text-right">Acties</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">
                  {certNameByCode[r.certification_code] ?? r.certification_code}
                </TableCell>
                <TableCell className="text-xs tabular-nums">
                  {formatDate(r.issued_date)}
                </TableCell>
                <TableCell className="text-xs tabular-nums">
                  {formatDate(r.expiry_date)}
                </TableCell>
                <TableCell>
                  <ExpiryBadge expiresAt={r.expiry_date} />
                </TableCell>
                <TableCell>
                  {r.document_url ? (
                    <button
                      type="button"
                      onClick={() => onDownload(r)}
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      title={r.document_name ?? undefined}
                    >
                      <FileText className="h-3.5 w-3.5" />
                      <span className="max-w-[140px] truncate">
                        {r.document_name ?? "Openen"}
                      </span>
                    </button>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex gap-1">
                    {r.document_url && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => onDownload(r)}
                        title="Downloaden"
                        aria-label="Certificaat downloaden"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => onEdit(r)}
                      title="Bewerken"
                      aria-label="Certificaat bewerken"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => setPendingDelete(r)}
                      title="Verwijderen"
                      aria-label="Certificaat verwijderen"
                      disabled={deleteMut.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <DriverCertificateRecordDialog
        open={dialogOpen}
        onOpenChange={(v) => {
          setDialogOpen(v);
          if (!v) {
            setEditing(null);
            setPendingFile(null);
            setAiSuggestion(null);
          }
        }}
        driverId={driverId}
        certifications={certifications}
        existingCodes={existingCodes}
        record={editing}
        initialFile={pendingFile}
        initialSuggestion={aiSuggestion}
        onSubmit={onSubmit}
        submitting={submitting}
      />

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => !o && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Certificaat verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `Certificaat "${certNameByCode[pendingDelete.certification_code] ?? pendingDelete.certification_code}" en eventuele uploads worden permanent verwijderd.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
