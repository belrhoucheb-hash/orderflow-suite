import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateDocument } from "@/hooks/useFleet";
import { toast } from "sonner";

const DOC_TYPES = [
  { value: "apk", label: "APK Keuring" },
  { value: "verzekering", label: "Verzekeringsbewijs" },
  { value: "adr", label: "ADR-keuring" },
  { value: "tachograaf", label: "Tachograaf IJking" },
];

interface Props {
  vehicleId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DocumentDialog({ vehicleId, open, onOpenChange }: Props) {
  const [docType, setDocType] = useState("apk");
  const [expiryDate, setExpiryDate] = useState("");
  const [notes, setNotes] = useState("");
  const create = useCreateDocument();

  const handleSubmit = async () => {
    try {
      await create.mutateAsync({
        vehicle_id: vehicleId,
        doc_type: docType,
        expiry_date: expiryDate || undefined,
        notes: notes || undefined,
      });
      toast.success("Document toegevoegd");
      onOpenChange(false);
      setDocType("apk");
      setExpiryDate("");
      setNotes("");
    } catch {
      toast.error("Fout bij toevoegen document");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Document Toevoegen</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label className="text-xs text-muted-foreground">Type document</Label>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DOC_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Vervaldatum</Label>
            <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Notities</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optionele notities..." />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Annuleren</Button>
            <Button onClick={handleSubmit} disabled={create.isPending}>Toevoegen</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
