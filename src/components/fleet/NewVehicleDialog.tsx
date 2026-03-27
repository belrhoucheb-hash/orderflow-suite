import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAddVehicle } from "@/hooks/useFleet";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewVehicleDialog({ open, onOpenChange }: Props) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [plate, setPlate] = useState("");
  const [type, setType] = useState("bakwagen");
  const [brand, setBrand] = useState("");
  const [capacityKg, setCapacityKg] = useState("");
  const [capacityPallets, setCapacityPallets] = useState("");
  const addVehicle = useAddVehicle();

  const handleSubmit = async () => {
    if (!code || !name || !plate) {
      toast.error("Vul minimaal code, naam en kenteken in");
      return;
    }
    try {
      await addVehicle.mutateAsync({
        code,
        name,
        plate,
        type,
        brand: brand || undefined,
        capacity_kg: capacityKg ? parseInt(capacityKg) : undefined,
        capacity_pallets: capacityPallets ? parseInt(capacityPallets) : undefined,
      });
      toast.success("Voertuig toegevoegd");
      onOpenChange(false);
      setCode(""); setName(""); setPlate(""); setBrand(""); setCapacityKg(""); setCapacityPallets("");
    } catch {
      toast.error("Fout bij toevoegen");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nieuw Voertuig</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs text-muted-foreground">Code</Label><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="VH-04" /></div>
            <div><Label className="text-xs text-muted-foreground">Kenteken</Label><Input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="XX-123-YY" /></div>
          </div>
          <div><Label className="text-xs text-muted-foreground">Naam</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mercedes Sprinter" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="busje">Busje</SelectItem>
                  <SelectItem value="bakwagen">Bakwagen</SelectItem>
                  <SelectItem value="koelwagen">Koelwagen</SelectItem>
                  <SelectItem value="trekker">Trekker</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs text-muted-foreground">Merk</Label><Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Mercedes" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs text-muted-foreground">Max gewicht (kg)</Label><Input type="number" value={capacityKg} onChange={(e) => setCapacityKg(e.target.value)} /></div>
            <div><Label className="text-xs text-muted-foreground">Palletplaatsen</Label><Input type="number" value={capacityPallets} onChange={(e) => setCapacityPallets(e.target.value)} /></div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Annuleren</Button>
            <Button onClick={handleSubmit} disabled={addVehicle.isPending}>Toevoegen</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
