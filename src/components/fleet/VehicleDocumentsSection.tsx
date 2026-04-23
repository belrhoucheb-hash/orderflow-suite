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
import {
  useVehicleDocuments,
  useCreateDocument,
  useUpdateDocument,
  useDeleteDocument,
  getVehicleDocumentDownloadUrl,
  type VehicleDocument,
} from "@/hooks/useFleet";
import { useVehicleDocumentTypes } from "@/hooks/useVehicleDocumentTypes";
import { useExtractVehicleDocument } from "@/hooks/useExtractVehicleDocument";
import { DocumentDialog } from "./DocumentDialog";

interface Props {
  vehicleId: string;
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

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  const parts = d.split("-");
  if (parts.length !== 3) return d;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

export function VehicleDocumentsSection({ vehicleId }: Props) {
  const { data: documents = [], isLoading } = useVehicleDocuments(vehicleId);
  const { data: types = [] } = useVehicleDocumentTypes();
  const createMut = useCreateDocument();
  const updateMut = useUpdateDocument();
  const deleteMut = useDeleteDocument();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<VehicleDocument | null>(null);
  const [pendingDelete, setPendingDelete] = useState<VehicleDocument | null>(null);
  // Bestand + AI-voorstel die meegegeven worden aan de dialog zodra de
  // scan klaar is. Zo ziet de gebruiker in één keer de vooringevulde
  // velden en hoeft alleen te reviewen/op te slaan.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<{
    doc_type: string | null;
    issued_date: string | null;
    expiry_date: string | null;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const extract = useExtractVehicleDocument();

  const submitting = createMut.isPending || updateMut.isPending;

  const typeNameByCode = useMemo(() => {
    const m: Record<string, string> = {};
    types.forEach((t) => {
      m[t.code] = t.name;
    });
    return m;
  }, [types]);

  const existingCodes = useMemo(() => documents.map((d) => d.doc_type), [documents]);

  const sorted = useMemo(() => {
    // Verlopen en bijna-verlopende documenten eerst, zonder einddatum onderaan.
    return [...documents].sort((a, b) => {
      const sa = expiryStatus(a.expiry_date ?? null);
      const sb = expiryStatus(b.expiry_date ?? null);
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
  }, [documents]);

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
        doc_type: result.doc_type,
        issued_date: result.issued_date,
        expiry_date: result.expiry_date,
      });
      if (!result.doc_type && !result.issued_date && !result.expiry_date) {
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

  const onEdit = (d: VehicleDocument) => {
    setEditing(d);
    setPendingFile(null);
    setAiSuggestion(null);
    setDialogOpen(true);
  };

  const onSubmit = async (values: {
    doc_type: string;
    issued_date: string | null;
    expiry_date: string | null;
    notes: string | null;
    file: File | null;
  }) => {
    try {
      if (editing) {
        await updateMut.mutateAsync({
          id: editing.id,
          vehicle_id: editing.vehicle_id ?? vehicleId,
          previous_document_url: editing.file_url ?? null,
          issued_date: values.issued_date,
          expiry_date: values.expiry_date,
          notes: values.notes,
          file: values.file,
        });
        toast.success("Document bijgewerkt");
      } else {
        await createMut.mutateAsync({
          vehicle_id: vehicleId,
          doc_type: values.doc_type,
          issued_date: values.issued_date,
          expiry_date: values.expiry_date,
          notes: values.notes,
          file: values.file,
        });
        toast.success("Document toegevoegd");
      }
      setDialogOpen(false);
      setEditing(null);
    } catch (err: any) {
      toast.error(err?.message ?? "Opslaan mislukt");
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const d = pendingDelete;
    setPendingDelete(null);
    try {
      await deleteMut.mutateAsync({
        id: d.id,
        vehicle_id: d.vehicle_id ?? vehicleId,
        document_url: d.file_url ?? null,
      });
      toast.success("Document verwijderd");
    } catch (err: any) {
      toast.error(err?.message ?? "Verwijderen mislukt");
    }
  };

  const onDownload = async (d: VehicleDocument) => {
    const url = d.file_url ?? null;
    if (!url) return;
    try {
      const full = await getVehicleDocumentDownloadUrl(url);
      window.open(full, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      toast.error(err?.message ?? "Kon bestand niet openen");
    }
  };

  const triggerPicker = () => fileInputRef.current?.click();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Documenten en keuringen</h3>
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
            {extract.isPending ? "Scannen..." : "Upload document"}
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
            {sorted.map((d) => {
              const documentUrl = d.file_url ?? null;
              const documentName = d.document_name ?? null;
              return (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">
                    {typeNameByCode[d.doc_type] ?? d.doc_type}
                  </TableCell>
                  <TableCell className="text-xs tabular-nums">
                    {formatDate(d.issued_date ?? null)}
                  </TableCell>
                  <TableCell className="text-xs tabular-nums">
                    {formatDate(d.expiry_date ?? null)}
                  </TableCell>
                  <TableCell>
                    <ExpiryBadge expiresAt={d.expiry_date ?? null} />
                  </TableCell>
                  <TableCell>
                    {documentUrl ? (
                      <button
                        type="button"
                        onClick={() => onDownload(d)}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        title={documentName ?? undefined}
                      >
                        <FileText className="h-3.5 w-3.5" />
                        <span className="max-w-[140px] truncate">
                          {documentName ?? "Openen"}
                        </span>
                      </button>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">&mdash;</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      {documentUrl && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => onDownload(d)}
                          title="Downloaden"
                          aria-label="Document downloaden"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => onEdit(d)}
                        title="Bewerken"
                        aria-label="Document bewerken"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => setPendingDelete(d)}
                        title="Verwijderen"
                        aria-label="Document verwijderen"
                        disabled={deleteMut.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <DocumentDialog
        open={dialogOpen}
        onOpenChange={(v) => {
          setDialogOpen(v);
          if (!v) {
            setEditing(null);
            setPendingFile(null);
            setAiSuggestion(null);
          }
        }}
        vehicleId={vehicleId}
        types={types}
        existingCodes={existingCodes}
        document={editing}
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
            <AlertDialogTitle>Document verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `Document "${typeNameByCode[pendingDelete.doc_type] ?? pendingDelete.doc_type}" verdwijnt uit de app. Het bestand en de metadata blijven bewaard voor de fiscale bewaarplicht (7 jaar).`
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
