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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface RequirementTypeFormValues {
  name: string;
  code: string;
  category: string;
  color: string;
}

interface RequirementTypeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Partial<RequirementTypeFormValues> | null;
  onSubmit: (values: RequirementTypeFormValues) => void;
  submitting?: boolean;
}

const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: "transport", label: "Transport" },
  { value: "equipment", label: "Equipment" },
  { value: "documentatie", label: "Documentatie" },
  { value: "veiligheid", label: "Veiligheid" },
];

const empty: RequirementTypeFormValues = {
  name: "",
  code: "",
  category: "transport",
  color: "#6b7280",
};

export function RequirementTypeDialog({ open, onOpenChange, initial, onSubmit, submitting }: RequirementTypeDialogProps) {
  const [values, setValues] = useState<RequirementTypeFormValues>(empty);

  useEffect(() => {
    if (open) setValues({ ...empty, ...(initial ?? {}) });
  }, [open, initial]);

  const canSubmit = values.name.trim().length > 0 && values.code.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{initial ? "Transportvereiste bewerken" : "Nieuwe transportvereiste"}</DialogTitle>
          <DialogDescription>
            Speciale kenmerken zoals ADR, koeling of laadklep. Wordt gebruikt door planning en tariefmotor.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="rt-name">Naam</Label>
            <Input
              id="rt-name"
              value={values.name}
              placeholder="ADR..."
              onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rt-code">Code</Label>
            <Input
              id="rt-code"
              value={values.code}
              placeholder="adr"
              onChange={(e) => setValues((v) => ({ ...v, code: e.target.value.toLowerCase().replace(/\s/g, "-") }))}
              disabled={Boolean(initial?.code)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="rt-category">Categorie</Label>
            <Select
              value={values.category}
              onValueChange={(val) => setValues((v) => ({ ...v, category: val }))}
            >
              <SelectTrigger id="rt-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rt-color">Kleur</Label>
            <div className="flex items-center gap-2">
              <input
                id="rt-color"
                type="color"
                value={values.color || "#6b7280"}
                onChange={(e) => setValues((v) => ({ ...v, color: e.target.value }))}
                className="h-9 w-12 rounded-md border border-input bg-background cursor-pointer"
              />
              <Input
                value={values.color}
                placeholder="#6b7280"
                onChange={(e) => setValues((v) => ({ ...v, color: e.target.value }))}
                className="font-mono"
              />
            </div>
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
