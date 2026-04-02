import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useDrivers, type Driver } from "@/hooks/useDrivers";
import { useFleetVehicles } from "@/hooks/useFleet";

interface NewDriverDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driver?: Driver; // If provided, we are in edit mode
}

const CERTIFICATION_OPTIONS = ["ADR", "Koeling", "Laadklep", "Internationaal", "Douane"];

export function NewDriverDialog({ open, onOpenChange, driver }: NewDriverDialogProps) {
  const { createDriver, updateDriver } = useDrivers();
  const { data: vehicles } = useFleetVehicles();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [license, setLicense] = useState("");
  const [status, setStatus] = useState("beschikbaar");
  const [vehicleId, setVehicleId] = useState<string>("none");
  const [selectedCerts, setSelectedCerts] = useState<string[]>([]);

  useEffect(() => {
    if (driver && open) {
      setName(driver.name);
      setEmail(driver.email || "");
      setPhone(driver.phone || "");
      setLicense(driver.license_number || "");
      setStatus(driver.status);
      setVehicleId(driver.current_vehicle_id || "none");
      setSelectedCerts(driver.certifications || []);
    } else if (open) {
      // Reset
      setName("");
      setEmail("");
      setPhone("");
      setLicense("");
      setStatus("beschikbaar");
      setVehicleId("none");
      setSelectedCerts([]);
    }
  }, [driver, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    const driverData = {
      name,
      email: email || null,
      phone: phone || null,
      license_number: license || null,
      status,
      current_vehicle_id: vehicleId === "none" ? null : vehicleId,
      certifications: selectedCerts,
    };

    if (driver) {
      await updateDriver.mutateAsync({ id: driver.id, ...driverData });
    } else {
      await createDriver.mutateAsync(driverData);
    }
    onOpenChange(false);
  };

  const toggleCert = (cert: string) => {
    setSelectedCerts(prev => 
      prev.includes(cert) ? prev.filter(c => c !== cert) : [...prev, cert]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {driver ? "Chauffeur Bewerken" : "Nieuwe Chauffeur"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2 col-span-2">
              <Label htmlFor="name">Naam *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Volledige naam"
                required
                className="rounded-xl border-border/50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@voorbeeld.nl"
                className="rounded-xl border-border/50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefoon</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+31 6 ..."
                className="rounded-xl border-border/50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="license">Rijbewijsnummer</Label>
              <Input
                id="license"
                value={license}
                onChange={(e) => setLicense(e.target.value)}
                placeholder="NL-..."
                className="rounded-xl border-border/50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="rounded-xl border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-border/50">
                  <SelectItem value="beschikbaar">Beschikbaar</SelectItem>
                  <SelectItem value="onderweg">Onderweg</SelectItem>
                  <SelectItem value="rust">Rust</SelectItem>
                  <SelectItem value="ziek">Ziek</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 col-span-2">
              <Label htmlFor="vehicle">Toegewezen Voertuig</Label>
              <Select value={vehicleId} onValueChange={setVehicleId}>
                <SelectTrigger className="rounded-xl border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-border/50">
                  <SelectItem value="none">Geen voertuig</SelectItem>
                  {vehicles?.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name} ({v.plate})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            <Label>Certificeringen</Label>
            <div className="grid grid-cols-2 gap-2">
              {CERTIFICATION_OPTIONS.map((cert) => (
                <div key={cert} className="flex items-center space-x-2">
                  <Checkbox 
                    id={`cert-${cert}`} 
                    checked={selectedCerts.includes(cert)}
                    onCheckedChange={() => toggleCert(cert)}
                  />
                  <label
                    htmlFor={`cert-${cert}`}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    {cert}
                  </label>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="rounded-xl border-border/50"
            >
              Annuleren
            </Button>
            <Button type="submit" className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground px-8">
              {driver ? "Opslaan" : "Toevoegen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
