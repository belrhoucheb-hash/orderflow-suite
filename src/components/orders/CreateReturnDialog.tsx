import { useState } from "react";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useCreateReturnOrder } from "@/hooks/useReturnOrders";
import { RETURN_REASON_LABELS, type ReturnReason } from "@/types/packaging";

interface Props {
  parentOrderId: string;
  parentOrderNumber: string;
  defaultQuantity?: number;
  defaultWeightKg?: number;
  pickupAddress?: string;
  deliveryAddress?: string;
}

export function CreateReturnDialog({
  parentOrderId,
  parentOrderNumber,
  defaultQuantity,
  defaultWeightKg,
  pickupAddress,
  deliveryAddress,
}: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReturnReason | "">("");
  const [notes, setNotes] = useState("");
  const [quantity, setQuantity] = useState(defaultQuantity ?? 0);
  const [weight, setWeight] = useState(defaultWeightKg ?? 0);

  const createReturn = useCreateReturnOrder();

  const handleSubmit = async () => {
    if (!reason) {
      toast.error("Selecteer een retour reden");
      return;
    }

    try {
      await createReturn.mutateAsync({
        parentOrderId,
        returnReason: reason as ReturnReason,
        notes: notes || undefined,
        quantity: quantity > 0 ? quantity : undefined,
        weight_kg: weight > 0 ? weight : undefined,
      });

      toast.success("Retourorder aangemaakt");
      setOpen(false);
      setReason("");
      setNotes("");
    } catch (err: any) {
      toast.error(`Fout bij aanmaken retour: ${err.message}`);
    }
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="gap-2">
        <Undo2 className="h-4 w-4" />
        Retour aanmaken
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Retour aanmaken</DialogTitle>
            <DialogDescription>
              Maak een retourorder aan voor {parentOrderNumber}. Ophaal- en afleveradres worden automatisch omgedraaid.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Address preview (reversed) */}
            <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
              <p><span className="text-muted-foreground">Ophalen:</span> {deliveryAddress || "—"}</p>
              <p><span className="text-muted-foreground">Afleveren:</span> {pickupAddress || "—"}</p>
            </div>

            {/* Return reason */}
            <div className="space-y-2">
              <Label>Reden retour *</Label>
              <Select value={reason} onValueChange={(v) => setReason(v as ReturnReason)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecteer reden..." />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(RETURN_REASON_LABELS) as [ReturnReason, string][]).map(
                    ([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Quantity */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Aantal</Label>
                <Input
                  type="number"
                  min={0}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>Gewicht (kg)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.1}
                  value={weight}
                  onChange={(e) => setWeight(Number(e.target.value))}
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Opmerkingen</Label>
              <Textarea
                placeholder="Optionele toelichting..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Annuleren
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createReturn.isPending || !reason}
              className="gap-2"
            >
              {createReturn.isPending ? "Bezig..." : "Retour aanmaken"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
