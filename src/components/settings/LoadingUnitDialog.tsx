import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface LoadingUnitFormValues {
  name: string;
  code: string;
  default_weight_kg: number | null;
  default_dimensions: string;
}

interface LoadingUnitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Partial<LoadingUnitFormValues> | null;
  onSubmit: (values: LoadingUnitFormValues) => void;
  submitting?: boolean;
}

const empty: LoadingUnitFormValues = {
  name: "",
  code: "",
  default_weight_kg: null,
  default_dimensions: "",
};

function numOrNull(s: string): number | null {
  if (!s.trim()) return null;
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function LoadingUnitDialog({ open, onOpenChange, initial, onSubmit, submitting }: LoadingUnitDialogProps) {
  const [values, setValues] = useState<LoadingUnitFormValues>(empty);

  useEffect(() => {
    if (open) setValues({ ...empty, ...(initial ?? {}) });
  }, [open, initial]);

  const canSubmit = values.name.trim().length > 0 && values.code.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{initial ? "Ladingeenheid bewerken" : "Nieuwe ladingeenheid"}</DialogTitle>
          <DialogDescription>
            Eenheid voor orders en capaciteitsberekening, bijvoorbeeld europallet of rolcontainer.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="lu-name">Naam</Label>
            <Input
              id="lu-name"
              value={values.name}
              placeholder="Europallet..."
              onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lu-code">Code</Label>
            <Input
              id="lu-code"
              value={values.code}
              placeholder="europallet"
              onChange={(e) => setValues((v) => ({ ...v, code: e.target.value.toLowerCase().replace(/\s/g, "-") }))}
              disabled={Boolean(initial?.code)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="lu-weight">Standaardgewicht (kg)</Label>
            <Input
              id="lu-weight"
              type="number"
              value={values.default_weight_kg ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, default_weight_kg: numOrNull(e.target.value) }))}
              placeholder="750"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lu-dim">Afmetingen</Label>
            <Input
              id="lu-dim"
              value={values.default_dimensions}
              placeholder="120x80x144 cm"
              onChange={(e) => setValues((v) => ({ ...v, default_dimensions: e.target.value }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Annuleren</Button>
          <Button onClick={() => onSubmit(values)} disabled={!canSubmit || submitting}>
            {submitting ? "Opslaan..." : "Opslaan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
