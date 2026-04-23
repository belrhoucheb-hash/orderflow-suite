import { useState, useMemo } from "react";
import { Plus, Trash2, Edit2, ShieldCheck, Loader2 } from "lucide-react";
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
  DriverCertificationDialog,
  type DriverCertificationFormValues,
} from "@/components/drivers/DriverCertificationDialog";
import {
  useCreateDriverCertification,
  useDeleteDriverCertification,
  useDriverCertifications,
  useUpdateDriverCertification,
  type DriverCertification,
} from "@/hooks/useDriverCertifications";
import { useDrivers } from "@/hooks/useDrivers";

export function DriverCertificationsSection() {
  const { data: certifications = [], isLoading } = useDriverCertifications();
  const { data: drivers = [] } = useDrivers();
  const createMut = useCreateDriverCertification();
  const updateMut = useUpdateDriverCertification();
  const deleteMut = useDeleteDriverCertification();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DriverCertification | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DriverCertification | null>(null);

  const submitting = createMut.isPending || updateMut.isPending;

  const counts = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const d of drivers) {
      for (const code of d.certifications ?? []) {
        acc[code] = (acc[code] ?? 0) + 1;
      }
    }
    return acc;
  }, [drivers]);

  const handleSubmit = async (values: DriverCertificationFormValues) => {
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
          toast.success("Opgeslagen", { description: "Certificering bijgewerkt." });
          setDialogOpen(false);
          setEditing(null);
        })
        .catch((err: Error) =>
          toast.error("Fout", { description: err.message || "Kon certificering niet opslaan." }),
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
          toast.success("Opgeslagen", { description: "Certificering toegevoegd." });
          setDialogOpen(false);
          setEditing(null);
        })
        .catch((err: Error) =>
          toast.error("Fout", { description: err.message || "Kon certificering niet opslaan." }),
        );
    }
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const cert = pendingDelete;
    deleteMut.mutate(cert.id, {
      onSuccess: () => toast.success("Verwijderd", { description: "Certificering verwijderd." }),
      onError: (err: Error) =>
        toast.error("Fout", { description: err.message || "Kon certificering niet verwijderen." }),
    });
    setPendingDelete(null);
  };

  const pendingDeleteInUse = pendingDelete ? (counts[pendingDelete.code] ?? 0) : 0;

  return (
    <section className="space-y-4">
      <DriverCertificationDialog
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
            <ShieldCheck className="h-4.5 w-4.5 text-primary" strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="text-lg font-bold">Certificeringen</h3>
            <p className="text-xs text-muted-foreground">
              Beschikbare kenmerken die aan chauffeurs toegekend kunnen worden. Beheer zonder code-deploy.
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

      <Card className="rounded-2xl border-border/40 overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center p-12 text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
            Laden...
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[200px] text-xs uppercase tracking-wider font-semibold">
                  Naam
                </TableHead>
                <TableHead className="text-xs uppercase tracking-wider font-semibold">Code</TableHead>
                <TableHead className="text-xs uppercase tracking-wider font-semibold">
                  Beschrijving
                </TableHead>
                <TableHead className="w-[110px] text-xs uppercase tracking-wider font-semibold">
                  Chauffeurs
                </TableHead>
                <TableHead className="w-[90px] text-xs uppercase tracking-wider font-semibold">
                  Status
                </TableHead>
                <TableHead className="w-[110px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {certifications.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-8">
                    Nog geen certificeringen. Voeg er een toe.
                  </TableCell>
                </TableRow>
              ) : (
                certifications.map((cert) => (
                  <TableRow key={cert.id} className="group transition-colors">
                    <TableCell className="font-medium text-xs">{cert.name}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                        {cert.code}
                      </code>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[320px] truncate">
                      {cert.description || "—"}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums text-muted-foreground">
                      {counts[cert.code] ?? 0}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {cert.is_active ? "Actief" : "Inactief"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Certificering ${cert.name} bewerken`}
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setEditing(cert);
                            setDialogOpen(true);
                          }}
                        >
                          <Edit2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Certificering ${cert.name} verwijderen`}
                          className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setPendingDelete(cert)}
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
      </Card>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => !o && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Certificering verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete && pendingDeleteInUse > 0
                ? `"${pendingDelete.name}" is nog toegekend aan ${pendingDeleteInUse} chauffeur${pendingDeleteInUse === 1 ? "" : "s"}. Toch verwijderen?`
                : pendingDelete
                  ? `Certificering "${pendingDelete.name}" wordt permanent verwijderd.`
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
