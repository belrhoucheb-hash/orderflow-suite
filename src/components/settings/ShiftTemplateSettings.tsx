import { useEffect, useState } from "react";
import { Plus, Edit2, Trash2, Loader2, CalendarClock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { toast } from "sonner";
import { useShiftTemplates } from "@/hooks/useShiftTemplates";
import {
  shiftTemplateInputSchema,
  type ShiftTemplateInput,
} from "@/lib/validation/shiftTemplateSchema";
import type { ShiftTemplate } from "@/types/rooster";

interface DialogFormState {
  name: string;
  default_start_time: string;
  default_end_time: string;
  color: string;
  sort_order: string;
  is_active: boolean;
}

const EMPTY_FORM: DialogFormState = {
  name: "",
  default_start_time: "08:00",
  default_end_time: "16:30",
  color: "#94a3b8",
  sort_order: "0",
  is_active: true,
};

function templateToForm(template: ShiftTemplate): DialogFormState {
  return {
    name: template.name,
    default_start_time: template.default_start_time,
    default_end_time: template.default_end_time ?? "",
    color: template.color,
    sort_order: String(template.sort_order ?? 0),
    is_active: template.is_active,
  };
}

function formatTime(value: string | null): string {
  if (!value) return "–";
  return value.slice(0, 5);
}

export function ShiftTemplateSettings() {
  const {
    templates,
    isLoading,
    createTemplate,
    updateTemplate,
    deleteTemplate,
  } = useShiftTemplates({ includeInactive: true });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<DialogFormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<ShiftTemplate | null>(null);

  useEffect(() => {
    if (!dialogOpen) {
      setErrors({});
    }
  }, [dialogOpen]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setDialogOpen(true);
  };

  const openEdit = (template: ShiftTemplate) => {
    setEditingId(template.id);
    setForm(templateToForm(template));
    setErrors({});
    setDialogOpen(true);
  };

  const submitting = createTemplate.isPending || updateTemplate.isPending;

  const handleSubmit = async () => {
    const parsed = shiftTemplateInputSchema.safeParse({
      name: form.name,
      default_start_time: form.default_start_time,
      default_end_time: form.default_end_time === "" ? null : form.default_end_time,
      color: form.color,
      sort_order: Number.isFinite(Number(form.sort_order)) ? Number(form.sort_order) : 0,
      is_active: form.is_active,
    });

    if (!parsed.success) {
      const next: Record<string, string> = {};
      parsed.error.issues.forEach((issue) => {
        const key = String(issue.path[0] ?? "");
        if (key) next[key] = issue.message;
      });
      setErrors(next);
      return;
    }
    setErrors({});

    const payload = parsed.data as ShiftTemplateInput;

    try {
      if (editingId) {
        await updateTemplate.mutateAsync({ id: editingId, patch: payload });
        toast.success("Rooster-type bijgewerkt");
      } else {
        await createTemplate.mutateAsync(payload);
        toast.success("Rooster-type aangemaakt");
      }
      setDialogOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Onbekende fout";
      toast.error("Opslaan mislukt", { description: message });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteTemplate.mutateAsync(deleteTarget.id);
      toast.success("Rooster-type verwijderd");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Onbekende fout";
      toast.error("Verwijderen mislukt", { description: message });
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-3">
          <div
            className="h-9 w-9 rounded-xl flex items-center justify-center border border-[hsl(var(--gold)/0.3)]"
            style={{
              background:
                "linear-gradient(135deg, hsl(var(--gold-soft)/0.8), hsl(var(--gold-soft)/0.25))",
            }}
          >
            <CalendarClock className="h-4 w-4 text-[hsl(var(--gold-deep))]" strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="text-lg font-bold">Rooster-types</h3>
            <p className="text-xs text-muted-foreground">
              Diensttypes zoals Vroeg, Dag of Laat. Gebruikt als template in de rooster-module.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="btn-luxe btn-luxe--primary !h-8"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
          Toevoegen
        </button>
      </div>

      <Card className="card--luxe overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center p-12 text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
            Laden...
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-[hsl(var(--gold-soft)/0.3)]">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[220px] text-xs uppercase tracking-wider font-semibold">
                  Naam
                </TableHead>
                <TableHead className="w-[90px] text-xs uppercase tracking-wider font-semibold">
                  Kleur
                </TableHead>
                <TableHead className="w-[90px] text-xs uppercase tracking-wider font-semibold">
                  Start
                </TableHead>
                <TableHead className="w-[90px] text-xs uppercase tracking-wider font-semibold">
                  Eind
                </TableHead>
                <TableHead className="w-[90px] text-xs uppercase tracking-wider font-semibold">
                  Volgorde
                </TableHead>
                <TableHead className="w-[90px] text-xs uppercase tracking-wider font-semibold">
                  Actief
                </TableHead>
                <TableHead className="w-[110px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-8">
                    Nog geen rooster-types. Voeg Vroeg, Dag en Laat toe om de rooster-module te gebruiken.
                  </TableCell>
                </TableRow>
              )}
              {templates.map((template) => (
                <TableRow key={template.id} className="transition-colors">
                  <TableCell className="font-medium text-xs">{template.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span
                        className="h-4 w-4 rounded-full border border-border/40"
                        style={{ background: template.color }}
                        aria-label={`Kleur ${template.color}`}
                      />
                      <code className="text-[11px] font-mono text-muted-foreground uppercase">
                        {template.color}
                      </code>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono">
                    {formatTime(template.default_start_time)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono">
                    {formatTime(template.default_end_time)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {template.sort_order}
                  </TableCell>
                  <TableCell>
                    <span
                      className={
                        template.is_active
                          ? "inline-flex items-center rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[11px] font-medium"
                          : "inline-flex items-center rounded-full bg-muted text-muted-foreground border border-border/40 px-2 py-0.5 text-[11px] font-medium"
                      }
                    >
                      {template.is_active ? "Actief" : "Inactief"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Bewerken ${template.name}`}
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => openEdit(template)}
                      >
                        <Edit2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Verwijderen ${template.name}`}
                        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleteTarget(template)}
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Rooster-type bewerken" : "Nieuw rooster-type"}
            </DialogTitle>
            <DialogDescription>
              Diensttype met standaardtijden en kleur. De tijden dienen als prefill bij het plannen van een chauffeur.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="st-name">Naam</Label>
              <Input
                id="st-name"
                value={form.name}
                placeholder="Bijv. Vroeg"
                onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))}
                aria-invalid={!!errors.name}
              />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="st-start">Starttijd</Label>
                <Input
                  id="st-start"
                  type="time"
                  value={form.default_start_time}
                  onChange={(e) =>
                    setForm((v) => ({ ...v, default_start_time: e.target.value }))
                  }
                  aria-invalid={!!errors.default_start_time}
                />
                {errors.default_start_time && (
                  <p className="text-xs text-destructive">{errors.default_start_time}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="st-end">Eindtijd (optioneel)</Label>
                <Input
                  id="st-end"
                  type="time"
                  value={form.default_end_time}
                  onChange={(e) =>
                    setForm((v) => ({ ...v, default_end_time: e.target.value }))
                  }
                  aria-invalid={!!errors.default_end_time}
                />
                {errors.default_end_time && (
                  <p className="text-xs text-destructive">{errors.default_end_time}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="st-color">Kleur</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="st-color"
                    type="color"
                    value={/^#[0-9a-f]{6}$/i.test(form.color) ? form.color : "#94a3b8"}
                    onChange={(e) => setForm((v) => ({ ...v, color: e.target.value }))}
                    className="h-9 w-12 rounded-md border border-input bg-background cursor-pointer"
                    aria-label="Kleurpicker"
                  />
                  <Input
                    value={form.color}
                    placeholder="#94a3b8"
                    onChange={(e) => setForm((v) => ({ ...v, color: e.target.value }))}
                    className="font-mono"
                    aria-invalid={!!errors.color}
                  />
                </div>
                {errors.color && (
                  <p className="text-xs text-destructive">{errors.color}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="st-sort">Volgorde</Label>
                <Input
                  id="st-sort"
                  type="number"
                  min={0}
                  step={1}
                  value={form.sort_order}
                  onChange={(e) => setForm((v) => ({ ...v, sort_order: e.target.value }))}
                  aria-invalid={!!errors.sort_order}
                />
                {errors.sort_order && (
                  <p className="text-xs text-destructive">{errors.sort_order}</p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border/40 px-4 py-3">
              <div>
                <Label className="text-sm font-medium">Actief</Label>
                <p className="text-xs text-muted-foreground">
                  Inactieve rooster-types verschijnen niet in keuzelijsten.
                </p>
              </div>
              <Switch
                checked={form.is_active}
                onCheckedChange={(checked) =>
                  setForm((v) => ({ ...v, is_active: checked }))
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={submitting}
            >
              Annuleren
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Opslaan..." : "Opslaan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rooster-type verwijderen</AlertDialogTitle>
            <AlertDialogDescription>
              Je staat op het punt "{deleteTarget?.name}" te verwijderen. Chauffeurs
              die dit rooster-type als standaard hebben, verliezen de koppeling.
              Historische rooster-regels behouden de verwijzing niet meer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
