import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateMaintenance } from "@/hooks/useFleet";
import { vehicleMaintenanceInputSchema } from "@/lib/validation/vehicleSchema";
import { toast } from "sonner";

const MAINTENANCE_TYPES = [
  { value: "apk", label: "APK" },
  { value: "grote_beurt", label: "Grote beurt" },
  { value: "kleine_beurt", label: "Kleine beurt" },
  { value: "bandenwissel", label: "Bandenwissel" },
  { value: "overig", label: "Overig" },
];

interface Props {
  vehicleId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MaintenanceDialog({ vehicleId, open, onOpenChange }: Props) {
  const [type, setType] = useState("apk");
  const [scheduledDate, setScheduledDate] = useState("");
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useCreateMaintenance();

  useEffect(() => {
    if (!open) setErrors({});
  }, [open]);

  const handleSubmit = async () => {
    const parsed = vehicleMaintenanceInputSchema.safeParse({
      maintenance_type: type,
      scheduled_date: scheduledDate,
      cost: cost ? Number(cost) : undefined,
      description: notes,
    });

    if (!parsed.success) {
      const map: Record<string, string> = {};
      parsed.error.issues.forEach((i) => {
        map[i.path.join(".")] = i.message;
      });
      setErrors(map);
      return;
    }
    setErrors({});

    try {
      await create.mutateAsync({
        vehicle_id: vehicleId,
        maintenance_type: parsed.data.maintenance_type,
        scheduled_date: parsed.data.scheduled_date,
        cost: parsed.data.cost,
        description: parsed.data.description || undefined,
      });
      toast.success("Onderhoud ingepland");
      onOpenChange(false);
      setType("apk");
      setScheduledDate("");
      setCost("");
      setNotes("");
    } catch {
      toast.error("Fout bij inplannen onderhoud");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Onderhoud Plannen</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label className="text-xs text-muted-foreground">Type onderhoud</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MAINTENANCE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.maintenance_type && <ErrorText>{errors.maintenance_type}</ErrorText>}
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Geplande datum</Label>
            <Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
            {errors.scheduled_date && <ErrorText>{errors.scheduled_date}</ErrorText>}
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Geschatte kosten (EUR)</Label>
            <Input type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" />
            {errors.cost && <ErrorText>{errors.cost}</ErrorText>}
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Notities</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optionele notities..." />
            {errors.description && <ErrorText>{errors.description}</ErrorText>}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Annuleren</Button>
            <Button onClick={handleSubmit} disabled={create.isPending}>Inplannen</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs text-destructive">{children}</p>;
}
