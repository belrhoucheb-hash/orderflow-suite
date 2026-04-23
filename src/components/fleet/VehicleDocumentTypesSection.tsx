import { useState } from "react";
import { Plus, Trash2, Edit2, FileText, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
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
  VehicleDocumentTypeDialog,
  type VehicleDocumentTypeFormValues,
} from "@/components/fleet/VehicleDocumentTypeDialog";
import {
  useCreateVehicleDocumentType,
  useDeleteVehicleDocumentType,
  useUpdateVehicleDocumentType,
  useVehicleDocumentTypes,
  type VehicleDocumentType,
} from "@/hooks/useVehicleDocumentTypes";

export function VehicleDocumentTypesSection() {
  const { data: types = [], isLoading } = useVehicleDocumentTypes();
  const createMut = useCreateVehicleDocumentType();
  const updateMut = useUpdateVehicleDocumentType();
  const deleteMut = useDeleteVehicleDocumentType();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<VehicleDocumentType | null>(null);
  const [pendingDelete, setPendingDelete] = useState<VehicleDocumentType | null>(null);

  const submitting = createMut.isPending || updateMut.isPending;

  const handleSubmit = async (values: VehicleDocumentTypeFormValues) => {
    if (editing) {
      await updateMut
        .mutateAsync({
          id: editing.id,
          name: values.name,
          description: values.description,
          sort_order: values.sort_order,
          is_active: values.is_active,
        })
        .then(() => {
          toast.success("Opgeslagen", { description: "Documenttype bijgewerkt." });
          setDialogOpen(false);
          setEditing(null);
        })
        .catch((err: Error) =>
          toast.error("Fout", { description: err.message || "Kon documenttype niet opslaan." }),
        );
    } else {
      await createMut
        .mutateAsync({
          code: values.code,
          name: values.name,
          description: values.description,
          sort_order: values.sort_order,
          is_active: values.is_active,
        })
        .then(() => {
          toast.success("Opgeslagen", { description: "Documenttype toegevoegd." });
          setDialogOpen(false);
          setEditing(null);
        })
        .catch((err: Error) =>
          toast.error("Fout", { description: err.message || "Kon documenttype niet opslaan." }),
        );
    }
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const t = pendingDelete;
    deleteMut.mutate(t.id, {
      onSuccess: () => toast.success("Verwijderd", { description: "Documenttype verwijderd." }),
      onError: (err: Error) =>
        toast.error("Fout", { description: err.message || "Kon documenttype niet verwijderen." }),
    });
    setPendingDelete(null);
  };

  return (
    <section className="space-y-4">
      <VehicleDocumentTypeDialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) setEditing(null);
        }}
        initial={
          editing
            ? {
                name: editing.name,
                code: editing.code,
                description: editing.description ?? "",
                sort_order: editing.sort_order,
                is_active: editing.is_active,
              }
            : null
        }
        onSubmit={handleSubmit}
        submitting={submitting}
      />

      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <FileText className="h-4.5 w-4.5 text-primary" strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="text-lg font-bold">Voertuigdocumenten</h3>
            <p className="text-xs text-muted-foreground">
              Types documenten die per voertuig vastgelegd kunnen worden, bijvoorbeeld APK, verzekering of tachograaf.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          className="h-8 gap-1.5 rounded-lg"
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
          Toevoegen
        </Button>
      </div>

      <div className="card--luxe overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center p-12 text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
            Laden...
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-[hsl(var(--gold-soft)/0.3)]">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[200px] text-xs uppercase tracking-wider font-semibold">
                  Naam
                </TableHead>
                <TableHead className="text-xs uppercase tracking-wider font-semibold">Code</TableHead>
                <TableHead className="text-xs uppercase tracking-wider font-semibold">
                  Beschrijving
                </TableHead>
                <TableHead className="w-[90px] text-xs uppercase tracking-wider font-semibold">
                  Status
                </TableHead>
                <TableHead className="w-[110px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {types.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-8">
                    Nog geen documenttypes. Voeg er een toe.
                  </TableCell>
                </TableRow>
              ) : (
                types.map((t) => (
                  <TableRow key={t.id} className="group transition-colors">
                    <TableCell className="font-medium text-xs">{t.name}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                        {t.code}
                      </code>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[320px] truncate">
                      {t.description || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {t.is_active ? "Actief" : "Inactief"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Documenttype ${t.name} bewerken`}
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setEditing(t);
                            setDialogOpen(true);
                          }}
                        >
                          <Edit2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Documenttype ${t.name} verwijderen`}
                          className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setPendingDelete(t)}
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => !o && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Documenttype verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `Documenttype "${pendingDelete.name}" wordt permanent verwijderd. Bestaande documenten van dit type blijven behouden, maar tonen alleen nog de code.`
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
    </section>
  );
}
