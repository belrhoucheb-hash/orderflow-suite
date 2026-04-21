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
import { toast } from "sonner";
import { useDrivers, type Driver, type EmploymentType } from "@/hooks/useDrivers";
import { useFleetVehicles } from "@/hooks/useFleet";

interface NewDriverDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driver?: Driver; // If provided, we are in edit mode
}

const CERTIFICATION_OPTIONS = [
  "ADR",
  "Koeling",
  "Laadklep",
  "Internationaal",
  "Douane",
  "Boxen",
  "Hoya",
  "Bakbus",
  "DAF",
];

export function NewDriverDialog({ open, onOpenChange, driver }: NewDriverDialogProps) {
  const { createDriver, updateDriver } = useDrivers();
  const { data: vehicles } = useFleetVehicles();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [license, setLicense] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyRelation, setEmergencyRelation] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [status, setStatus] = useState("beschikbaar");
  const [vehicleId, setVehicleId] = useState<string>("none");
  const [selectedCerts, setSelectedCerts] = useState<string[]>([]);
  const [contractHours, setContractHours] = useState<string>("");
  const [employmentType, setEmploymentType] = useState<EmploymentType>("vast");

  useEffect(() => {
    if (driver && open) {
      setName(driver.name);
      setEmail(driver.email || "");
      setPhone(driver.phone || "");
      setLicense(driver.license_number || "");
      setBirthDate(driver.birth_date || "");
      setEmergencyName(driver.emergency_contact_name || "");
      setEmergencyRelation(driver.emergency_contact_relation || "");
      setEmergencyPhone(driver.emergency_contact_phone || "");
      setStatus(driver.status);
      setVehicleId(driver.current_vehicle_id || "none");
      setSelectedCerts(driver.certifications || []);
      setContractHours(driver.contract_hours_per_week?.toString() ?? "");
      setEmploymentType(driver.employment_type ?? "vast");
    } else if (open) {
      setName("");
      setEmail("");
      setPhone("");
      setLicense("");
      setBirthDate("");
      setEmergencyName("");
      setEmergencyRelation("");
      setEmergencyPhone("");
      setStatus("beschikbaar");
      setVehicleId("none");
      setSelectedCerts([]);
      setContractHours("");
      setEmploymentType("vast");
    }
  }, [driver, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    const parsedHours = contractHours.trim() === "" ? null : Number(contractHours);
    const driverData = {
      name,
      email: email || null,
      phone: phone || null,
      license_number: license || null,
      birth_date: birthDate || null,
      emergency_contact_name: emergencyName.trim() || null,
      emergency_contact_relation: emergencyRelation.trim() || null,
      emergency_contact_phone: emergencyPhone.trim() || null,
      status,
      current_vehicle_id: vehicleId === "none" ? null : vehicleId,
      certifications: selectedCerts,
      contract_hours_per_week: parsedHours !== null && !Number.isNaN(parsedHours) ? parsedHours : null,
      employment_type: employmentType,
    };

    try {
      if (driver) {
        await updateDriver.mutateAsync({ id: driver.id, ...driverData });
        toast.success("Chauffeur bijgewerkt");
      } else {
        await createDriver.mutateAsync(driverData);
        toast.success("Chauffeur toegevoegd");
      }
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message ?? "Fout bij opslaan chauffeur");
    }
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
              <Label htmlFor="license">Legitimatienummer</Label>
              <Input
                id="license"
                value={license}
                onChange={(e) => setLicense(e.target.value)}
                placeholder="Paspoort, ID-kaart of rijbewijs"
                className="rounded-xl border-border/50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="birth-date">Geboortedatum</Label>
              <Input
                id="birth-date"
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
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

            <div className="space-y-2">
              <Label htmlFor="contract-hours">Contracturen per week</Label>
              <Input
                id="contract-hours"
                type="number"
                min={0}
                max={80}
                value={contractHours}
                onChange={(e) => setContractHours(e.target.value)}
                placeholder="Bijv. 40"
                className="rounded-xl border-border/50"
              />
              <p className="text-[11px] text-muted-foreground">
                Leeg laten betekent geen contracturen-bewaking door auto-plan.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="employment-type">Dienstverband</Label>
              <Select value={employmentType} onValueChange={(v) => setEmploymentType(v as EmploymentType)}>
                <SelectTrigger className="rounded-xl border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-border/50">
                  <SelectItem value="vast">Vast</SelectItem>
                  <SelectItem value="flex">Flex</SelectItem>
                  <SelectItem value="ingehuurd">Ingehuurd</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t border-border/40">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Contact bij nood</Label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="emergency-name">Naam</Label>
                <Input
                  id="emergency-name"
                  value={emergencyName}
                  onChange={(e) => setEmergencyName(e.target.value)}
                  placeholder="Volledige naam"
                  className="rounded-xl border-border/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="emergency-relation">Relatie</Label>
                <Input
                  id="emergency-relation"
                  value={emergencyRelation}
                  onChange={(e) => setEmergencyRelation(e.target.value)}
                  placeholder="Partner, ouder, broer..."
                  className="rounded-xl border-border/50"
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label htmlFor="emergency-phone">Telefoonnummer</Label>
                <Input
                  id="emergency-phone"
                  value={emergencyPhone}
                  onChange={(e) => setEmergencyPhone(e.target.value)}
                  placeholder="+31 6 ..."
                  className="rounded-xl border-border/50"
                />
              </div>
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
