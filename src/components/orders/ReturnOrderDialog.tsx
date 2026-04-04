/**
 * F5: ReturnOrderDialog
 * Creates a retour order from a parent order, swapping pickup/delivery addresses.
 */
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { RotateCcw, ArrowRight } from "lucide-react";
import { useCreateReturnOrder, buildRetourPayload } from "@/hooks/useReturnOrders";
import type { ReturnReason } from "@/types/f5";

interface ParentOrder {
  id: string;
  order_number: number;
  client_name: string | null;
  tenant_id: string;
  pickup_address: string | null;
  delivery_address: string | null;
  weight_kg: number | null;
  quantity: number | null;
  unit: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  parentOrder: ParentOrder;
}

const RETURN_REASONS: { value: ReturnReason; label: string }[] = [
  { value: "BESCHADIGD", label: "Beschadigd" },
  { value: "VERKEERD", label: "Verkeerde levering" },
  { value: "WEIGERING", label: "Geweigerd door ontvanger" },
  { value: "OVERSCHOT", label: "Overschot / teveel geleverd" },
  { value: "OVERIG", label: "Overig" },
];

export function ReturnOrderDialog({ open, onOpenChange, parentOrder }: Props) {
  const [reason, setReason] = useState<ReturnReason>("OVERIG");
  const [notes, setNotes] = useState("");
  const createReturn = useCreateReturnOrder();

  const handleCreate = async () => {
    try {
      const payload = buildRetourPayload(parentOrder, reason);
      await createReturn.mutateAsync(payload);
      toast.success("Retourorder aangemaakt");
      onOpenChange(false);
      setNotes("");
    } catch (e: any) {
      toast.error(e.message ?? "Fout bij aanmaken retourorder");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-primary" />
            Retourorder aanmaken
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Address swap preview */}
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Adres omdraaien
            </p>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground truncate max-w-[160px]">
                {parentOrder.delivery_address ?? "—"}
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="font-medium truncate max-w-[160px]">
                {parentOrder.pickup_address ?? "—"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Ophalen bij het afleveradres, terugbrengen naar het ophaaladres
            </p>
          </div>

          {/* Reason */}
          <div className="space-y-1.5">
            <Label htmlFor="return-reason">Reden</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as ReturnReason)}>
              <SelectTrigger id="return-reason">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RETURN_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Optional notes */}
          <div className="space-y-1.5">
            <Label htmlFor="return-notes">Opmerkingen (optioneel)</Label>
            <Textarea
              id="return-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Bijv. pallets staan achter bij dock 3..."
              rows={3}
            />
          </div>

          {/* Order info */}
          <p className="text-xs text-muted-foreground">
            Behorend bij order #{parentOrder.order_number} — {parentOrder.client_name ?? "—"}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuleren
          </Button>
          <Button onClick={handleCreate} disabled={createReturn.isPending}>
            {createReturn.isPending ? "Aanmaken..." : "Retourorder aanmaken"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
