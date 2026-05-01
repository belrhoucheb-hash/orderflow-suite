import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAddVehicle } from "@/hooks/useFleet";
import { supabase } from "@/integrations/supabase/client";
import { vehicleInputSchema } from "@/lib/validation/vehicleSchema";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface VehicleTypeOption {
  code: string;
  name: string;
}

export function NewVehicleDialog({ open, onOpenChange }: Props) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [plate, setPlate] = useState("");
  const [type, setType] = useState("");
  const [capacityKg, setCapacityKg] = useState("");
  const [capacityPallets, setCapacityPallets] = useState("");
  const [loadLength, setLoadLength] = useState("");
  const [loadWidth, setLoadWidth] = useState("");
  const [loadHeight, setLoadHeight] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const addVehicle = useAddVehicle();

  const { data: vehicleTypes = [] } = useQuery<VehicleTypeOption[]>({
    queryKey: ["settings-vehicle-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_types")
        .select("code,name")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as VehicleTypeOption[];
    },
  });

  useEffect(() => {
    if (open && !type && vehicleTypes.length > 0) {
      setType(vehicleTypes[0].code);
    }
  }, [open, type, vehicleTypes]);

  useEffect(() => {
    if (!open) {
      setErrors({});
    }
  }, [open]);

  const reset = () => {
    setCode("");
    setName("");
    setPlate("");
    setType("");
    setCapacityKg("");
    setCapacityPallets("");
    setLoadLength("");
    setLoadWidth("");
    setLoadHeight("");
  };

  const handleSubmit = async () => {
    const parsed = vehicleInputSchema.safeParse({
      code,
      name,
      plate,
      type,
      capacity_kg: capacityKg ? Number(capacityKg) : undefined,
      capacity_pallets: capacityPallets ? Number(capacityPallets) : undefined,
      load_length_cm: loadLength ? Number(loadLength) : undefined,
      load_width_cm: loadWidth ? Number(loadWidth) : undefined,
      load_height_cm: loadHeight ? Number(loadHeight) : undefined,
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
      await addVehicle.mutateAsync({
        code: parsed.data.code,
        name: parsed.data.name,
        plate: parsed.data.plate,
        type: parsed.data.type,
        capacity_kg: parsed.data.capacity_kg,
        capacity_pallets: parsed.data.capacity_pallets,
        load_length_cm: parsed.data.load_length_cm,
        load_width_cm: parsed.data.load_width_cm,
        load_height_cm: parsed.data.load_height_cm,
      });
      toast.success("Voertuig toegevoegd");
      onOpenChange(false);
      reset();
    } catch (err: any) {
      toast.error(err?.message ?? "Fout bij toevoegen");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nieuw voertuig</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 pt-2">
          <div>
            <SectionTitle>Voertuiggegevens</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label className="text-xs text-muted-foreground">Code</Label>
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="VH-04" />
                {errors.code && <ErrorText>{errors.code}</ErrorText>}
              </div>
              <div className="col-span-2">
                <Label className="text-xs text-muted-foreground">Naam</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mercedes Sprinter" />
                {errors.name && <ErrorText>{errors.name}</ErrorText>}
              </div>
              <div className="col-span-2">
                <Label className="text-xs text-muted-foreground">Kenteken</Label>
                <Input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="XX-123-YY" />
                {errors.plate && <ErrorText>{errors.plate}</ErrorText>}
              </div>
            </div>
          </div>

          <div>
            <SectionTitle>Type</SectionTitle>
            <Select value={type} onValueChange={setType} disabled={vehicleTypes.length === 0}>
              <SelectTrigger>
                <SelectValue placeholder={vehicleTypes.length === 0 ? "Geen types, beheer via tab Types" : "Kies type"} />
              </SelectTrigger>
              <SelectContent>
                {vehicleTypes.map((vt) => (
                  <SelectItem key={vt.code} value={vt.code}>{vt.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.type && <ErrorText>{errors.type}</ErrorText>}
          </div>

          <div>
            <SectionTitle>Laadruimte</SectionTitle>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Lengte (cm)</Label>
                <Input
                  type="number"
                  min={0}
                  value={loadLength}
                  onChange={(e) => setLoadLength(e.target.value)}
                />
                {errors.load_length_cm && <ErrorText>{errors.load_length_cm}</ErrorText>}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Breedte (cm)</Label>
                <Input
                  type="number"
                  min={0}
                  value={loadWidth}
                  onChange={(e) => setLoadWidth(e.target.value)}
                />
                {errors.load_width_cm && <ErrorText>{errors.load_width_cm}</ErrorText>}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Hoogte (cm)</Label>
                <Input
                  type="number"
                  min={0}
                  value={loadHeight}
                  onChange={(e) => setLoadHeight(e.target.value)}
                />
                {errors.load_height_cm && <ErrorText>{errors.load_height_cm}</ErrorText>}
              </div>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Binnenmaat laadruimte, optioneel.
            </p>
          </div>

          <div>
            <SectionTitle>Capaciteit</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Max gewicht (kg)</Label>
                <Input type="number" value={capacityKg} onChange={(e) => setCapacityKg(e.target.value)} />
                {errors.capacity_kg && <ErrorText>{errors.capacity_kg}</ErrorText>}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Palletplaatsen</Label>
                <Input type="number" min={0} value={capacityPallets} onChange={(e) => setCapacityPallets(e.target.value)} />
                {errors.capacity_pallets && <ErrorText>{errors.capacity_pallets}</ErrorText>}
              </div>
            </div>
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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] uppercase tracking-[0.16em] text-[hsl(var(--gold-deep))] mb-2">
      {children}
    </h3>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs text-destructive">{children}</p>;
}
