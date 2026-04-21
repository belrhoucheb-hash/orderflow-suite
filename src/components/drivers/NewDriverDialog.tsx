import { useState, useEffect } from "react";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
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
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  useDrivers,
  type Driver,
  type EmploymentType,
  type LegitimationType,
} from "@/hooks/useDrivers";
import { useFleetVehicles } from "@/hooks/useFleet";
import { useDriverCertifications } from "@/hooks/useDriverCertifications";

interface NewDriverDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driver?: Driver; // If provided, we are in edit mode
}

const LEGITIMATION_LABELS: Record<LegitimationType, string> = {
  rijbewijs: "Rijbewijs",
  paspoort: "Paspoort",
  "id-kaart": "ID-kaart",
};

function parseBirthDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  try {
    const d = parseISO(value);
    return Number.isNaN(d.getTime()) ? undefined : d;
  } catch {
    return undefined;
  }
}

export function NewDriverDialog({ open, onOpenChange, driver }: NewDriverDialogProps) {
  const { createDriver, updateDriver } = useDrivers();
  const { data: vehicles } = useFleetVehicles();
  const { data: certifications = [] } = useDriverCertifications();
  const activeCertifications = certifications.filter((c) => c.is_active);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [license, setLicense] = useState("");
  const [legitimationType, setLegitimationType] = useState<LegitimationType | "">("");
  const [birthDate, setBirthDate] = useState("");
  const [birthDateOpen, setBirthDateOpen] = useState(false);
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
      setLegitimationType(driver.legitimation_type ?? "");
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
      setLegitimationType("");
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
      legitimation_type: legitimationType === "" ? null : legitimationType,
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

  const birthDateParsed = parseBirthDate(birthDate);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] flex flex-col rounded-2xl p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/40">
          <DialogTitle className="font-display text-xl">
            {driver ? "Chauffeur bewerken" : "Nieuwe chauffeur"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* ── Basis ─────────────────────────────────────── */}
            <div className="space-y-3">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Basis</Label>
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
              </div>
            </div>

            {/* ── Persoonsgegevens ──────────────────────────── */}
            <div className="space-y-3 pt-2 border-t border-border/40">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Persoonsgegevens</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="legitimation-type">Type legitimatie</Label>
                  <Select
                    value={legitimationType === "" ? "none" : legitimationType}
                    onValueChange={(v) => setLegitimationType(v === "none" ? "" : (v as LegitimationType))}
                  >
                    <SelectTrigger id="legitimation-type" className="rounded-xl border-border/50">
                      <SelectValue placeholder="Kies..." />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-border/50">
                      <SelectItem value="none">Onbekend</SelectItem>
                      <SelectItem value="rijbewijs">Rijbewijs</SelectItem>
                      <SelectItem value="paspoort">Paspoort</SelectItem>
                      <SelectItem value="id-kaart">ID-kaart</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="license">Legitimatienummer</Label>
                  <Input
                    id="license"
                    value={license}
                    onChange={(e) => setLicense(e.target.value)}
                    placeholder={
                      legitimationType
                        ? `Nummer van ${LEGITIMATION_LABELS[legitimationType as LegitimationType].toLowerCase()}`
                        : "Documentnummer"
                    }
                    className="rounded-xl border-border/50"
                  />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="birth-date">Geboortedatum</Label>
                  <Popover open={birthDateOpen} onOpenChange={setBirthDateOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        id="birth-date"
                        type="button"
                        variant="outline"
                        className={cn(
                          "w-full justify-start rounded-xl border-border/50 font-normal",
                          !birthDateParsed && "text-muted-foreground",
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {birthDateParsed
                          ? format(birthDateParsed, "d MMMM yyyy", { locale: nl })
                          : "Kies een datum"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 rounded-xl" align="start">
                      <Calendar
                        mode="single"
                        locale={nl}
                        selected={birthDateParsed}
                        onSelect={(d) => {
                          setBirthDate(d ? format(d, "yyyy-MM-dd") : "");
                          setBirthDateOpen(false);
                        }}
                        captionLayout="dropdown-buttons"
                        fromYear={1940}
                        toYear={new Date().getFullYear()}
                        defaultMonth={birthDateParsed ?? new Date(1990, 0, 1)}
                        disabled={(d) => d > new Date()}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>

            {/* ── Werkinformatie ────────────────────────────── */}
            <div className="space-y-3 pt-2 border-t border-border/40">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Werkinformatie</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger id="status" className="rounded-xl border-border/50">
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
                <div className="space-y-2">
                  <Label htmlFor="vehicle">Toegewezen voertuig</Label>
                  <Select value={vehicleId} onValueChange={setVehicleId}>
                    <SelectTrigger id="vehicle" className="rounded-xl border-border/50">
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
                    <SelectTrigger id="employment-type" className="rounded-xl border-border/50">
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
            </div>

            {/* ── Contact bij nood ──────────────────────────── */}
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

            {/* ── Certificeringen ───────────────────────────── */}
            <div className="space-y-3 pt-2 border-t border-border/40">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Certificeringen</Label>
              {activeCertifications.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  Nog geen certificeringen ingericht. Beheer ze via tab Certificeringen.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {activeCertifications.map((cert) => (
                    <div key={cert.code} className="flex items-center space-x-2">
                      <Checkbox
                        id={`cert-${cert.code}`}
                        checked={selectedCerts.includes(cert.code)}
                        onCheckedChange={() => toggleCert(cert.code)}
                      />
                      <label
                        htmlFor={`cert-${cert.code}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        {cert.name}
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t border-border/40 bg-background/80 backdrop-blur-sm">
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
