import { useEffect, useState } from "react";
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

export interface DriverCertificationFormValues {
  name: string;
  code: string;
  description: string;
  sort_order: number;
  is_active: boolean;
}

interface DriverCertificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Partial<DriverCertificationFormValues> | null;
  onSubmit: (values: DriverCertificationFormValues) => void;
  submitting?: boolean;
}

const empty: DriverCertificationFormValues = {
  name: "",
  code: "",
  description: "",
  sort_order: 0,
  is_active: true,
};

function toCode(raw: string): string {
  return raw.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

export function DriverCertificationDialog({
  open,
  onOpenChange,
  initial,
  onSubmit,
  submitting,
}: DriverCertificationDialogProps) {
  const [values, setValues] = useState<DriverCertificationFormValues>(empty);
  const isEdit = Boolean(initial?.code);

  useEffect(() => {
    if (open) {
      setValues({
        ...empty,
        ...(initial ?? {}),
        description: initial?.description ?? "",
        sort_order: initial?.sort_order ?? 0,
        is_active: initial?.is_active ?? true,
      });
    }
  }, [open, initial]);

  const canSubmit =
    values.name.trim().length > 0 && values.code.trim().length > 0 && !submitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Certificering bewerken" : "Nieuwe certificering"}
          </DialogTitle>
          <DialogDescription>
            Certificeringen die toegewezen kunnen worden aan chauffeurs, bijvoorbeeld ADR, Koeling of Douane.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="dc-name">Naam</Label>
            <Input
              id="dc-name"
              value={values.name}
              placeholder="ADR"
              onChange={(e) => {
                const name = e.target.value;
                setValues((v) => ({
                  ...v,
                  name,
                  code: isEdit ? v.code : toCode(name),
                }));
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dc-code">Code</Label>
            <Input
              id="dc-code"
              value={values.code}
              placeholder="adr"
              onChange={(e) => setValues((v) => ({ ...v, code: toCode(e.target.value) }))}
              disabled={isEdit}
            />
            <p className="text-[11px] text-muted-foreground">
              Technisch ID, niet meer te wijzigen na aanmaken.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-2">
          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="dc-description">Beschrijving</Label>
            <Textarea
              id="dc-description"
              value={values.description}
              placeholder="Toelichting die zichtbaar is bij beheer (optioneel)."
              rows={2}
              onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dc-sort">Volgorde</Label>
            <Input
              id="dc-sort"
              type="number"
              value={values.sort_order}
              onChange={(e) =>
                setValues((v) => ({ ...v, sort_order: Number(e.target.value) || 0 }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dc-active">Actief</Label>
            <div className="flex items-center h-10 gap-2">
              <input
                id="dc-active"
                type="checkbox"
                checked={values.is_active}
                onChange={(e) => setValues((v) => ({ ...v, is_active: e.target.checked }))}
              />
              <span className="text-xs text-muted-foreground">
                Alleen actieve certificeringen verschijnen in het chauffeur-formulier.
              </span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Annuleren
          </Button>
          <Button onClick={() => onSubmit(values)} disabled={!canSubmit}>
            {submitting ? "Opslaan..." : "Opslaan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
