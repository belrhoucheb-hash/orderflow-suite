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

export interface VehicleTypeFormValues {
  name: string;
  code: string;
  sort_order?: number;
  max_length_cm: number | null;
  max_width_cm: number | null;
  max_height_cm: number | null;
  max_weight_kg: number | null;
  max_volume_m3: number | null;
  max_pallets: number | null;
  has_tailgate: boolean;
  has_cooling: boolean;
  adr_capable: boolean;
  default_capacity_kg?: number | null;
  default_capacity_pallets?: number | null;
}

interface VehicleTypeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Partial<VehicleTypeFormValues> | null;
  onSubmit: (values: VehicleTypeFormValues) => void;
  submitting?: boolean;
}

const empty: VehicleTypeFormValues = {
  name: "",
  code: "",
  max_length_cm: null,
  max_width_cm: null,
  max_height_cm: null,
  max_weight_kg: null,
  max_volume_m3: null,
  max_pallets: null,
  has_tailgate: false,
  has_cooling: false,
  adr_capable: false,
};

function numOrNull(s: string): number | null {
  if (!s.trim()) return null;
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function VehicleTypeDialog({ open, onOpenChange, initial, onSubmit, submitting }: VehicleTypeDialogProps) {
  const [values, setValues] = useState<VehicleTypeFormValues>(empty);

  useEffect(() => {
    if (open) setValues({ ...empty, ...(initial ?? {}) });
  }, [open, initial]);

  const canSubmit = values.name.trim().length > 0 && values.code.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? "Voertuigtype bewerken" : "Nieuw voertuigtype"}</DialogTitle>
          <DialogDescription>
            Afmetingen en gewicht worden door de tariefmotor gebruikt om het kleinste passende voertuig te kiezen.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="vt-name">Naam</Label>
            <Input
              id="vt-name"
              value={values.name}
              placeholder="Bakwagen met klep"
              onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vt-code">Code</Label>
            <Input
              id="vt-code"
              value={values.code}
              placeholder="bakwagen-klep"
              onChange={(e) => setValues((v) => ({ ...v, code: e.target.value.toLowerCase().replace(/\s/g, "-") }))}
              disabled={Boolean(initial?.code)}
            />
          </div>
        </div>

        <div className="space-y-3 pt-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Laadruimte</div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="vt-length">Max. lengte (cm)</Label>
              <Input
                id="vt-length"
                type="number"
                value={values.max_length_cm ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, max_length_cm: numOrNull(e.target.value) }))}
                placeholder="400"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vt-width">Max. breedte (cm)</Label>
              <Input
                id="vt-width"
                type="number"
                value={values.max_width_cm ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, max_width_cm: numOrNull(e.target.value) }))}
                placeholder="180"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vt-height">Max. hoogte (cm)</Label>
              <Input
                id="vt-height"
                type="number"
                value={values.max_height_cm ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, max_height_cm: numOrNull(e.target.value) }))}
                placeholder="190"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vt-weight">Max. gewicht (kg)</Label>
              <Input
                id="vt-weight"
                type="number"
                value={values.max_weight_kg ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, max_weight_kg: numOrNull(e.target.value) }))}
                placeholder="1200"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vt-volume">Volume (m³)</Label>
              <Input
                id="vt-volume"
                type="number"
                step="0.01"
                value={values.max_volume_m3 ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, max_volume_m3: numOrNull(e.target.value) }))}
                placeholder="12.60"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vt-pallets">Max. pallets</Label>
              <Input
                id="vt-pallets"
                type="number"
                value={values.max_pallets ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, max_pallets: numOrNull(e.target.value) }))}
                placeholder="6"
              />
            </div>
          </div>
        </div>

        <div className="space-y-3 pt-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Eigenschappen</div>
          <div className="grid grid-cols-3 gap-4">
            <label className="flex items-center gap-2 p-3 border rounded-md cursor-pointer hover:bg-muted/30">
              <input
                type="checkbox"
                checked={values.has_tailgate}
                onChange={(e) => setValues((v) => ({ ...v, has_tailgate: e.target.checked }))}
              />
              <span className="text-sm">Laadklep</span>
            </label>
            <label className="flex items-center gap-2 p-3 border rounded-md cursor-pointer hover:bg-muted/30">
              <input
                type="checkbox"
                checked={values.has_cooling}
                onChange={(e) => setValues((v) => ({ ...v, has_cooling: e.target.checked }))}
              />
              <span className="text-sm">Koeling</span>
            </label>
            <label className="flex items-center gap-2 p-3 border rounded-md cursor-pointer hover:bg-muted/30">
              <input
                type="checkbox"
                checked={values.adr_capable}
                onChange={(e) => setValues((v) => ({ ...v, adr_capable: e.target.checked }))}
              />
              <span className="text-sm">ADR-gevaarlijke stoffen</span>
            </label>
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
