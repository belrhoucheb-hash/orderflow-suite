import { useState, useEffect } from "react";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { CalendarIcon, AlertTriangle } from "lucide-react";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  useDrivers,
  useDriverCertificationExpiry,
  type Driver,
  type EmploymentType,
  type LegitimationType,
  type EmergencyRelation,
} from "@/hooks/useDrivers";
import { useFleetVehicles } from "@/hooks/useFleet";
import { useDriverCertifications } from "@/hooks/useDriverCertifications";
import { DriverCertificateRecordsSection } from "@/components/drivers/DriverCertificateRecordsSection";
import { driverSchema, daysUntil } from "@/lib/validation/driverSchema";

interface NewDriverDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driver?: Driver;
}

const LEGITIMATION_LABELS: Record<LegitimationType, string> = {
  rijbewijs: "Rijbewijs",
  paspoort: "Paspoort",
  "id-kaart": "ID-kaart",
};

const LEGITIMATION_PLACEHOLDERS: Record<LegitimationType, string> = {
  rijbewijs: "Rijbewijsnummer",
  paspoort: "Paspoortnummer",
  "id-kaart": "ID-kaart-nummer",
};

interface FormState {
  name: string;
  email: string;
  phone: string;
  license: string;
  legitimationType: LegitimationType | "";
  legitimationExpiry: string;
  code95Expiry: string;
  birthDate: string;
  // Adres
  street: string;
  houseNumber: string;
  houseNumberSuffix: string;
  zipcode: string;
  city: string;
  country: string;
  // Noodcontact
  emergencyName: string;
  emergencyRelation: EmergencyRelation | "";
  emergencyPhone: string;
  // Werk
  status: string;
  vehicleId: string;
  contractHours: string;
  employmentType: EmploymentType;
  hireDate: string;
  terminationDate: string;
  // Administratie
  bsn: string;
  iban: string;
  personnelNumber: string;
  // Certs
  selectedCerts: string[];
}

const INITIAL: FormState = {
  name: "",
  email: "",
  phone: "",
  license: "",
  legitimationType: "",
  legitimationExpiry: "",
  code95Expiry: "",
  birthDate: "",
  street: "",
  houseNumber: "",
  houseNumberSuffix: "",
  zipcode: "",
  city: "",
  country: "NL",
  emergencyName: "",
  emergencyRelation: "",
  emergencyPhone: "",
  status: "beschikbaar",
  vehicleId: "none",
  contractHours: "",
  employmentType: "vast",
  hireDate: "",
  terminationDate: "",
  bsn: "",
  iban: "",
  personnelNumber: "",
  selectedCerts: [],
};

function parseDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  try {
    const d = parseISO(value);
    return Number.isNaN(d.getTime()) ? undefined : d;
  } catch {
    return undefined;
  }
}

function toFormState(driver: Driver): FormState {
  return {
    name: driver.name,
    email: driver.email ?? "",
    phone: driver.phone ?? "",
    license: driver.license_number ?? "",
    legitimationType: (driver.legitimation_type ?? "") as LegitimationType | "",
    legitimationExpiry: driver.legitimation_expiry_date ?? "",
    code95Expiry: driver.code95_expiry_date ?? "",
    birthDate: driver.birth_date ?? "",
    street: driver.street ?? "",
    houseNumber: driver.house_number ?? "",
    houseNumberSuffix: driver.house_number_suffix ?? "",
    zipcode: driver.zipcode ?? "",
    city: driver.city ?? "",
    country: driver.country ?? "NL",
    emergencyName: driver.emergency_contact_name ?? "",
    emergencyRelation: (driver.emergency_contact_relation ?? "") as EmergencyRelation | "",
    emergencyPhone: driver.emergency_contact_phone ?? "",
    status: driver.status,
    vehicleId: driver.current_vehicle_id ?? "none",
    contractHours: driver.contract_hours_per_week?.toString() ?? "",
    employmentType: driver.employment_type ?? "vast",
    hireDate: driver.hire_date ?? "",
    terminationDate: driver.termination_date ?? "",
    bsn: driver.bsn ?? "",
    iban: driver.iban ?? "",
    personnelNumber: driver.personnel_number ?? "",
    selectedCerts: driver.certifications ?? [],
  };
}

export function NewDriverDialog({ open, onOpenChange, driver }: NewDriverDialogProps) {
  const isEdit = Boolean(driver);
  const { createDriver, updateDriver } = useDrivers();
  const { data: vehicles } = useFleetVehicles();
  const { data: certifications = [] } = useDriverCertifications();
  const activeCertifications = certifications.filter((c) => c.is_active);

  const { data: certExpiries, upsertExpiry, deleteExpiry } = useDriverCertificationExpiry(
    driver?.id ?? null,
  );

  const [form, setForm] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tab, setTab] = useState("basis");
  const [birthDateOpen, setBirthDateOpen] = useState(false);
  const [legitExpiryOpen, setLegitExpiryOpen] = useState(false);
  const [code95ExpiryOpen, setCode95ExpiryOpen] = useState(false);
  const [hireDateOpen, setHireDateOpen] = useState(false);
  const [terminationDateOpen, setTerminationDateOpen] = useState(false);
  const [certExpiryDates, setCertExpiryDates] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setForm(driver ? toFormState(driver) : INITIAL);
    setErrors({});
    setTab("basis");
  }, [driver, open]);

  useEffect(() => {
    if (!certExpiries) return;
    const map: Record<string, string> = {};
    certExpiries.forEach((e) => {
      if (e.expiry_date) map[e.certification_code] = e.expiry_date;
    });
    setCertExpiryDates(map);
  }, [certExpiries]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsed = driverSchema.safeParse({
      name: form.name,
      email: form.email,
      phone: form.phone,
      street: form.street,
      house_number: form.houseNumber,
      house_number_suffix: form.houseNumberSuffix,
      zipcode: form.zipcode,
      city: form.city,
      country: form.country || "NL",
      legitimation_type: form.legitimationType === "" ? null : form.legitimationType,
      license_number: form.license,
      legitimation_expiry_date: form.legitimationExpiry,
      code95_expiry_date: form.code95Expiry,
      birth_date: form.birthDate,
      bsn: form.bsn,
      iban: form.iban,
      personnel_number: form.personnelNumber,
      hire_date: form.hireDate,
      termination_date: form.terminationDate,
      contract_hours_per_week:
        form.contractHours.trim() === "" ? null : Number(form.contractHours),
      employment_type: form.employmentType,
      certifications: form.selectedCerts,
      emergency_contact_name: form.emergencyName,
      emergency_contact_relation: form.emergencyRelation === "" ? null : form.emergencyRelation,
      emergency_contact_phone: form.emergencyPhone,
    });

    if (!parsed.success) {
      const map: Record<string, string> = {};
      parsed.error.issues.forEach((i) => {
        map[i.path.join(".")] = i.message;
      });
      setErrors(map);
      const tabFor = resolveTabForError(Object.keys(map));
      if (tabFor) setTab(tabFor);
      toast.error("Controleer de velden in rood");
      return;
    }
    setErrors({});

    const payload = {
      name: parsed.data.name,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      license_number: parsed.data.license_number || null,
      legitimation_type: parsed.data.legitimation_type ?? null,
      legitimation_expiry_date: parsed.data.legitimation_expiry_date || null,
      code95_expiry_date: parsed.data.code95_expiry_date || null,
      birth_date: parsed.data.birth_date || null,
      street: parsed.data.street || null,
      house_number: parsed.data.house_number || null,
      house_number_suffix: parsed.data.house_number_suffix || null,
      zipcode: parsed.data.zipcode || null,
      city: parsed.data.city || null,
      country: parsed.data.country || "NL",
      bsn: parsed.data.bsn || null,
      iban: parsed.data.iban || null,
      personnel_number: parsed.data.personnel_number || null,
      hire_date: parsed.data.hire_date || null,
      termination_date: parsed.data.termination_date || null,
      contract_hours_per_week: parsed.data.contract_hours_per_week ?? null,
      employment_type: parsed.data.employment_type,
      certifications: parsed.data.certifications,
      emergency_contact_name: parsed.data.emergency_contact_name || null,
      emergency_contact_relation:
        (parsed.data.emergency_contact_relation as string | null) || null,
      emergency_contact_phone: parsed.data.emergency_contact_phone || null,
      // Status en vehicle alleen in edit-mode meegeven, bij create default
      ...(isEdit
        ? {
            status: form.status,
            current_vehicle_id: form.vehicleId === "none" ? null : form.vehicleId,
          }
        : {}),
    };

    try {
      let savedId: string;
      if (driver) {
        const saved = await updateDriver.mutateAsync({ id: driver.id, ...payload });
        savedId = (saved as any)?.id ?? driver.id;
        toast.success("Chauffeur bijgewerkt");
      } else {
        const saved = await createDriver.mutateAsync(payload);
        savedId = (saved as any)?.id;
        toast.success("Chauffeur toegevoegd");
      }

      // Cert-vervaldata synchroniseren met de aangevinkte certs:
      // 1) upsert voor aangevinkte certs met een ingevulde vervaldatum,
      // 2) delete expiry-rijen die horen bij certs die NIET meer zijn aangevinkt,
      //    zodat uitgevinkte certificeringen niet blijven meetellen in
      //    "Verlopend 60d"-kaart.
      const selected = new Set(form.selectedCerts);
      const expiryFailures: string[] = [];

      for (const code of form.selectedCerts) {
        const expiry = certExpiryDates[code];
        if (expiry && expiry.trim() !== "") {
          try {
            await upsertExpiry.mutateAsync({
              driver_id: savedId,
              certification_code: code,
              expiry_date: expiry,
            });
          } catch {
            expiryFailures.push(code);
          }
        }
      }

      if (certExpiries) {
        for (const row of certExpiries) {
          if (!selected.has(row.certification_code)) {
            try {
              await deleteExpiry.mutateAsync(row.id);
            } catch {
              expiryFailures.push(row.certification_code);
            }
          }
        }
      }

      if (expiryFailures.length > 0) {
        toast.warning(
          `Chauffeur opgeslagen, vervaldata van ${expiryFailures.length} certificering(en) konden niet worden bijgewerkt`,
        );
      }

      onOpenChange(false);
    } catch (err: any) {
      const msg = err?.message ?? "Fout bij opslaan chauffeur";
      if (msg.includes("uniq_drivers_personnel_number_per_tenant")) {
        setErrors({ personnel_number: "Dit personeelsnummer is al in gebruik" });
        setTab("administratie");
        toast.error("Personeelsnummer bestaat al");
      } else {
        toast.error(msg);
      }
    }
  };

  const toggleCert = (cert: string) => {
    setField(
      "selectedCerts",
      form.selectedCerts.includes(cert)
        ? form.selectedCerts.filter((c) => c !== cert)
        : [...form.selectedCerts, cert],
    );
  };

  const birthDateParsed = parseDate(form.birthDate);
  const legitExpiryParsed = parseDate(form.legitimationExpiry);
  const code95ExpiryParsed = parseDate(form.code95Expiry);
  const hireDateParsed = parseDate(form.hireDate);
  const terminationDateParsed = parseDate(form.terminationDate);
  const isPending = createDriver.isPending || updateDriver.isPending;

  const licenseLabel = form.legitimationType
    ? LEGITIMATION_PLACEHOLDERS[form.legitimationType as LegitimationType]
    : "Legitimatienummer";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px] max-h-[92vh] flex flex-col rounded-2xl p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-border/40">
          <DialogTitle className="font-display text-xl">
            {driver ? "Chauffeur bewerken" : "Nieuwe chauffeur"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col min-h-0">
            <div className="px-6 pt-3 border-b border-border/40">
              <TabsList className="h-9">
                <TabsTrigger value="basis">Basis</TabsTrigger>
                <TabsTrigger value="adres">Adres</TabsTrigger>
                <TabsTrigger value="legitimatie">Legitimatie</TabsTrigger>
                <TabsTrigger value="werk">Werk</TabsTrigger>
                <TabsTrigger value="administratie">Administratie</TabsTrigger>
                <TabsTrigger value="nood">Nood</TabsTrigger>
                <TabsTrigger value="certificaten" disabled={!driver}>
                  Certificaten
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {/* ────── Basis ────── */}
              <TabsContent value="basis" className="mt-0 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Naam *</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => setField("name", e.target.value)}
                    placeholder="Volledige naam"
                    required
                    className="rounded-xl border-border/50"
                  />
                  {errors.name && <ErrorText>{errors.name}</ErrorText>}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FieldWithError label="Email" id="email" error={errors.email}>
                    <Input
                      id="email"
                      type="email"
                      value={form.email}
                      onChange={(e) => setField("email", e.target.value)}
                      placeholder="email@voorbeeld.nl"
                      className="rounded-xl border-border/50"
                    />
                  </FieldWithError>
                  <FieldWithError label="Telefoon" id="phone" error={errors.phone}>
                    <Input
                      id="phone"
                      value={form.phone}
                      onChange={(e) => setField("phone", e.target.value)}
                      placeholder="+31 6 ..."
                      className="rounded-xl border-border/50"
                    />
                  </FieldWithError>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="birth-date">Geboortedatum</Label>
                  <DatePickerButton
                    id="birth-date"
                    open={birthDateOpen}
                    onOpenChange={setBirthDateOpen}
                    value={birthDateParsed}
                    onSelect={(d) => setField("birthDate", d ? format(d, "yyyy-MM-dd") : "")}
                    fromYear={1940}
                    toYear={new Date().getFullYear() - 16}
                    defaultMonth={new Date(1985, 0, 1)}
                  />
                  {errors.birth_date && <ErrorText>{errors.birth_date}</ErrorText>}
                </div>
              </TabsContent>

              {/* ────── Adres ────── */}
              <TabsContent value="adres" className="mt-0 space-y-4">
                <p className="text-xs text-muted-foreground">
                  Woonadres chauffeur, gebruikt voor CAO woon-werk-toeslag.
                </p>
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-8 space-y-2">
                    <Label htmlFor="street">Straat</Label>
                    <Input
                      id="street"
                      value={form.street}
                      onChange={(e) => setField("street", e.target.value)}
                      className="rounded-xl border-border/50"
                    />
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="house-number">Nr.</Label>
                    <Input
                      id="house-number"
                      value={form.houseNumber}
                      onChange={(e) => setField("houseNumber", e.target.value)}
                      className="rounded-xl border-border/50"
                    />
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="house-suffix">Bijvoegsel</Label>
                    <Input
                      id="house-suffix"
                      value={form.houseNumberSuffix}
                      onChange={(e) => setField("houseNumberSuffix", e.target.value)}
                      className="rounded-xl border-border/50"
                    />
                  </div>
                  <div className="col-span-4 space-y-2">
                    <Label htmlFor="zipcode">Postcode</Label>
                    <Input
                      id="zipcode"
                      value={form.zipcode}
                      onChange={(e) => setField("zipcode", e.target.value)}
                      className="rounded-xl border-border/50"
                    />
                  </div>
                  <div className="col-span-6 space-y-2">
                    <Label htmlFor="city">Plaats</Label>
                    <Input
                      id="city"
                      value={form.city}
                      onChange={(e) => setField("city", e.target.value)}
                      className="rounded-xl border-border/50"
                    />
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="country">Land</Label>
                    <Input
                      id="country"
                      value={form.country}
                      onChange={(e) => setField("country", e.target.value.toUpperCase())}
                      maxLength={2}
                      className="rounded-xl border-border/50"
                    />
                  </div>
                </div>
              </TabsContent>

              {/* ────── Legitimatie ────── */}
              <TabsContent value="legitimatie" className="mt-0 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="legitimation-type">Type legitimatie</Label>
                    <Select
                      value={form.legitimationType === "" ? "none" : form.legitimationType}
                      onValueChange={(v) =>
                        setField(
                          "legitimationType",
                          v === "none" ? "" : (v as LegitimationType),
                        )
                      }
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
                    <Label htmlFor="license">{licenseLabel}</Label>
                    <Input
                      id="license"
                      value={form.license}
                      onChange={(e) => setField("license", e.target.value)}
                      placeholder={licenseLabel}
                      className="rounded-xl border-border/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="legit-expiry">
                      Legitimatie geldig tot
                    </Label>
                    <DatePickerButton
                      id="legit-expiry"
                      open={legitExpiryOpen}
                      onOpenChange={setLegitExpiryOpen}
                      value={legitExpiryParsed}
                      onSelect={(d) =>
                        setField("legitimationExpiry", d ? format(d, "yyyy-MM-dd") : "")
                      }
                      fromYear={new Date().getFullYear()}
                      toYear={new Date().getFullYear() + 20}
                    />
                    <ExpiryWarning isoDate={form.legitimationExpiry} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="code95-expiry">
                      Code 95 geldig tot
                    </Label>
                    <DatePickerButton
                      id="code95-expiry"
                      open={code95ExpiryOpen}
                      onOpenChange={setCode95ExpiryOpen}
                      value={code95ExpiryParsed}
                      onSelect={(d) =>
                        setField("code95Expiry", d ? format(d, "yyyy-MM-dd") : "")
                      }
                      fromYear={new Date().getFullYear()}
                      toYear={new Date().getFullYear() + 10}
                    />
                    <ExpiryWarning isoDate={form.code95Expiry} />
                  </div>
                </div>
              </TabsContent>

              {/* ────── Werk ────── */}
              <TabsContent value="werk" className="mt-0 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="hire-date">Indienstdatum</Label>
                    <DatePickerButton
                      id="hire-date"
                      open={hireDateOpen}
                      onOpenChange={setHireDateOpen}
                      value={hireDateParsed}
                      onSelect={(d) => setField("hireDate", d ? format(d, "yyyy-MM-dd") : "")}
                      fromYear={2000}
                      toYear={new Date().getFullYear() + 1}
                    />
                    {errors.hire_date && <ErrorText>{errors.hire_date}</ErrorText>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="termination-date">Uitdienst (optioneel)</Label>
                    <DatePickerButton
                      id="termination-date"
                      open={terminationDateOpen}
                      onOpenChange={setTerminationDateOpen}
                      value={terminationDateParsed}
                      onSelect={(d) =>
                        setField("terminationDate", d ? format(d, "yyyy-MM-dd") : "")
                      }
                      fromYear={2000}
                      toYear={new Date().getFullYear() + 5}
                    />
                    {errors.termination_date && <ErrorText>{errors.termination_date}</ErrorText>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contract-hours">Contracturen per week</Label>
                    <Input
                      id="contract-hours"
                      type="number"
                      min={0}
                      max={48}
                      value={form.contractHours}
                      onChange={(e) => setField("contractHours", e.target.value)}
                      placeholder="Bijv. 40"
                      className="rounded-xl border-border/50"
                    />
                    {errors.contract_hours_per_week && (
                      <ErrorText>{errors.contract_hours_per_week}</ErrorText>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="employment-type">Dienstverband</Label>
                    <Select
                      value={form.employmentType}
                      onValueChange={(v) => setField("employmentType", v as EmploymentType)}
                    >
                      <SelectTrigger id="employment-type" className="rounded-xl border-border/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border-border/50">
                        <SelectItem value="vast">Vast</SelectItem>
                        <SelectItem value="flex">Flex</SelectItem>
                        <SelectItem value="ingehuurd">Ingehuurd</SelectItem>
                        <SelectItem value="zzp">ZZP</SelectItem>
                        <SelectItem value="uitzendkracht">Uitzendkracht</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {isEdit && (
                  <div className="grid grid-cols-2 gap-4 pt-3 border-t border-border/40">
                    <div className="space-y-2">
                      <Label htmlFor="status">Status</Label>
                      <Select value={form.status} onValueChange={(v) => setField("status", v)}>
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
                      <Select
                        value={form.vehicleId}
                        onValueChange={(v) => setField("vehicleId", v)}
                      >
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
                  </div>
                )}
              </TabsContent>

              {/* ────── Administratie ────── */}
              <TabsContent value="administratie" className="mt-0 space-y-4">
                <p className="text-xs text-muted-foreground">
                  Gegevens voor loonadministratie. BSN en IBAN worden gemaskeerd in overzichten.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <FieldWithError
                    label="Personeelsnummer"
                    id="personnel-number"
                    error={errors.personnel_number}
                  >
                    <Input
                      id="personnel-number"
                      value={form.personnelNumber}
                      onChange={(e) => setField("personnelNumber", e.target.value)}
                      placeholder="Bijv. 0042"
                      className="rounded-xl border-border/50"
                    />
                  </FieldWithError>
                  <FieldWithError label="BSN" id="bsn" error={errors.bsn}>
                    <Input
                      id="bsn"
                      inputMode="numeric"
                      value={form.bsn}
                      onChange={(e) => setField("bsn", e.target.value)}
                      placeholder="9 cijfers"
                      maxLength={11}
                      className="rounded-xl border-border/50 font-mono"
                    />
                  </FieldWithError>
                  <div className="col-span-2">
                    <FieldWithError label="IBAN" id="iban" error={errors.iban}>
                      <Input
                        id="iban"
                        value={form.iban}
                        onChange={(e) => setField("iban", e.target.value.toUpperCase())}
                        placeholder="NL12 ABCD 1234 5678 90"
                        className="rounded-xl border-border/50 font-mono tracking-wider"
                      />
                    </FieldWithError>
                  </div>
                </div>
              </TabsContent>

              {/* ────── Nood ────── */}
              <TabsContent value="nood" className="mt-0 space-y-4">
                <p className="text-xs text-muted-foreground">
                  Wie moet er gebeld worden bij een incident.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="emergency-name">Naam</Label>
                    <Input
                      id="emergency-name"
                      value={form.emergencyName}
                      onChange={(e) => setField("emergencyName", e.target.value)}
                      placeholder="Volledige naam"
                      className="rounded-xl border-border/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="emergency-relation">Relatie</Label>
                    <Select
                      value={form.emergencyRelation === "" ? "none" : form.emergencyRelation}
                      onValueChange={(v) =>
                        setField(
                          "emergencyRelation",
                          v === "none" ? "" : (v as EmergencyRelation),
                        )
                      }
                    >
                      <SelectTrigger id="emergency-relation" className="rounded-xl border-border/50">
                        <SelectValue placeholder="Kies..." />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border-border/50">
                        <SelectItem value="none">Onbekend</SelectItem>
                        <SelectItem value="partner">Partner</SelectItem>
                        <SelectItem value="ouder">Ouder</SelectItem>
                        <SelectItem value="kind">Kind</SelectItem>
                        <SelectItem value="broer-zus">Broer of zus</SelectItem>
                        <SelectItem value="overig">Overig</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="emergency-phone">Telefoonnummer</Label>
                    <Input
                      id="emergency-phone"
                      value={form.emergencyPhone}
                      onChange={(e) => setField("emergencyPhone", e.target.value)}
                      placeholder="+31 6 ..."
                      className="rounded-xl border-border/50"
                    />
                    {errors.emergency_contact_phone && (
                      <ErrorText>{errors.emergency_contact_phone}</ErrorText>
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* ────── Certificaten ────── */}
              <TabsContent value="certificaten" className="mt-0 space-y-4">
                {driver ? (
                  <DriverCertificateRecordsSection driverId={driver.id} />
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    Sla eerst de chauffeur op, daarna kun je certificaten met datums en documenten vastleggen.
                  </p>
                )}
              </TabsContent>
            </div>
          </Tabs>

          <DialogFooter className="px-6 py-3 border-t border-border/40 bg-background/80 backdrop-blur-sm">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
              className="rounded-xl border-border/50"
            >
              Annuleren
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground px-8"
            >
              {isPending ? "Opslaan..." : driver ? "Opslaan" : "Toevoegen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function resolveTabForError(paths: string[]): string | null {
  if (paths.some((p) => ["name", "email", "phone", "birth_date"].includes(p))) return "basis";
  if (paths.some((p) =>
    ["street", "house_number", "house_number_suffix", "zipcode", "city", "country"].includes(p),
  ))
    return "adres";
  if (paths.some((p) =>
    ["legitimation_type", "license_number", "legitimation_expiry_date", "code95_expiry_date"].includes(p),
  ))
    return "legitimatie";
  if (paths.some((p) =>
    ["hire_date", "termination_date", "contract_hours_per_week", "employment_type"].includes(p),
  ))
    return "werk";
  if (paths.some((p) => ["bsn", "iban", "personnel_number"].includes(p))) return "administratie";
  if (paths.some((p) =>
    ["emergency_contact_name", "emergency_contact_relation", "emergency_contact_phone"].includes(p),
  ))
    return "nood";
  return null;
}

function FieldWithError({
  label,
  id,
  error,
  children,
}: {
  label: string;
  id: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-destructive mt-1">{children}</p>;
}

function DatePickerButton({
  id,
  open,
  onOpenChange,
  value,
  onSelect,
  fromYear,
  toYear,
  defaultMonth,
}: {
  id: string;
  open: boolean;
  onOpenChange: (b: boolean) => void;
  value: Date | undefined;
  onSelect: (d: Date | undefined) => void;
  fromYear: number;
  toYear: number;
  defaultMonth?: Date;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          className={cn(
            // Zelfde look als field-luxe inputs: lichte achtergrond met
            // subtiele gold border, geen accent-fill op hover of open.
            "flex h-10 w-full items-center gap-2 rounded-xl border px-3 py-2 text-sm",
            "border-[hsl(var(--gold)/0.25)] bg-[hsl(var(--card))] text-foreground",
            "hover:border-[hsl(var(--gold)/0.5)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--gold)/0.4)]",
            "data-[state=open]:border-[hsl(var(--gold)/0.6)]",
            !value && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="h-4 w-4 text-[hsl(var(--gold-deep))]" />
          <span className="truncate">
            {value ? format(value, "d MMMM yyyy", { locale: nl }) : "Kies een datum"}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0 rounded-xl border-[hsl(var(--gold)/0.25)] shadow-lg"
        align="start"
      >
        <Calendar
          mode="single"
          locale={nl}
          selected={value}
          onSelect={(d) => {
            onSelect(d);
            onOpenChange(false);
          }}
          captionLayout="dropdown-buttons"
          fromYear={fromYear}
          toYear={toYear}
          defaultMonth={value ?? defaultMonth ?? new Date()}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

function ExpiryWarning({ isoDate }: { isoDate: string }) {
  const days = daysUntil(isoDate);
  if (days === null) return null;
  if (days < 0) {
    return (
      <p className="flex items-center gap-1 text-xs text-destructive">
        <AlertTriangle className="h-3 w-3" /> Verlopen {Math.abs(days)} dagen geleden
      </p>
    );
  }
  if (days < 60) {
    return (
      <p className="flex items-center gap-1 text-xs text-amber-600">
        <AlertTriangle className="h-3 w-3" /> Verloopt over {days} dagen
      </p>
    );
  }
  return null;
}

function ExpiryBadge({ isoDate }: { isoDate: string | undefined }) {
  const days = daysUntil(isoDate);
  if (days === null) return <span className="text-[11px] text-muted-foreground">—</span>;
  if (days < 0) {
    return <span className="text-[11px] text-destructive">Verlopen</span>;
  }
  if (days < 60) {
    return <span className="text-[11px] text-amber-600">{days}d</span>;
  }
  return <span className="text-[11px] text-emerald-600">OK</span>;
}
