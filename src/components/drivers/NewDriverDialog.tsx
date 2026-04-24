import { useState, useEffect, useMemo, useRef } from "react";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { CalendarIcon, AlertTriangle, Maximize2, Minimize2, Eye, EyeOff, UserCheck, Truck, Bed, HeartPulse, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { useShiftTemplates } from "@/hooks/useShiftTemplates";
import { DriverCertificateRecordsSection } from "@/components/drivers/DriverCertificateRecordsSection";
import { driverSchema, driverBaseSchema, daysUntil, maskBsn } from "@/lib/validation/driverSchema";

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

const STATUS_BADGE: Record<
  string,
  { label: string; className: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  beschikbaar: {
    label: "Beschikbaar",
    className: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
    Icon: UserCheck,
  },
  onderweg: {
    label: "Onderweg",
    className: "bg-blue-500/10 text-blue-700 border-blue-200",
    Icon: Truck,
  },
  rust: {
    label: "Rust",
    className: "bg-amber-500/10 text-amber-700 border-amber-200",
    Icon: Bed,
  },
  ziek: {
    label: "Ziek",
    className: "bg-destructive/10 text-destructive border-destructive/20",
    Icon: HeartPulse,
  },
};

function initialsOf(name: string): string {
  const clean = name.trim().split(/\s+/);
  if (clean.length === 0) return "?";
  if (clean.length === 1) return clean[0].slice(0, 2).toUpperCase();
  return (clean[0][0] + clean[clean.length - 1][0]).toUpperCase();
}

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
  // Werkzaamheden (vrije tags: klant, voertuig, certificering)
  workTypes: string[];
  // Planning-defaults
  defaultShiftTemplateId: string;
  defaultVehicleId: string;
}

const WORK_TYPE_OPTIONS: string[] = [
  "Boxen",
  "Hoya",
  "ADR",
  "Kleine bus",
  "Bakbus",
  "DAF",
];

const FIELD_TO_TAB: Record<keyof FormState, string> = {
  name: "persoon",
  email: "persoon",
  phone: "persoon",
  birthDate: "persoon",
  street: "persoon",
  houseNumber: "persoon",
  houseNumberSuffix: "persoon",
  zipcode: "persoon",
  city: "persoon",
  country: "persoon",
  emergencyName: "persoon",
  emergencyRelation: "persoon",
  emergencyPhone: "persoon",
  legitimationType: "werk",
  license: "werk",
  legitimationExpiry: "werk",
  code95Expiry: "werk",
  hireDate: "werk",
  terminationDate: "werk",
  contractHours: "werk",
  employmentType: "werk",
  status: "werk",
  vehicleId: "werk",
  workTypes: "werk",
  defaultShiftTemplateId: "werk",
  defaultVehicleId: "werk",
  bsn: "administratie",
  iban: "administratie",
  personnelNumber: "administratie",
  selectedCerts: "certificaten",
};

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
  workTypes: [],
  defaultShiftTemplateId: "none",
  defaultVehicleId: "none",
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
    workTypes: driver.work_types ?? [],
    defaultShiftTemplateId: driver.default_shift_template_id ?? "none",
    defaultVehicleId: driver.default_vehicle_id ?? "none",
  };
}

export function NewDriverDialog({ open, onOpenChange, driver }: NewDriverDialogProps) {
  const isEdit = Boolean(driver);
  const { createDriver, updateDriver } = useDrivers();
  const { data: vehicles } = useFleetVehicles();
  const { data: certifications = [] } = useDriverCertifications();
  const activeCertifications = certifications.filter((c) => c.is_active);
  const { templates: shiftTemplates } = useShiftTemplates();
  const activeVehicles = (vehicles ?? []).filter((v) => v.isActive);

  const { data: certExpiries, upsertExpiry } = useDriverCertificationExpiry(
    driver?.id ?? null,
  );

  const [form, setForm] = useState<FormState>(INITIAL);
  const [initialForm, setInitialForm] = useState<FormState>(INITIAL);
  const [pendingClose, setPendingClose] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tab, setTab] = useState("persoon");
  const [birthDateOpen, setBirthDateOpen] = useState(false);
  const [legitExpiryOpen, setLegitExpiryOpen] = useState(false);
  const [code95ExpiryOpen, setCode95ExpiryOpen] = useState(false);
  const [hireDateOpen, setHireDateOpen] = useState(false);
  const [terminationDateOpen, setTerminationDateOpen] = useState(false);
  const [certExpiryDates, setCertExpiryDates] = useState<Record<string, string>>({});
  const [maximized, setMaximized] = useState(false);
  const [showBsn, setShowBsn] = useState(false);
  const [quickMode, setQuickMode] = useState(false);
  const [createdDriverId, setCreatedDriverId] = useState<string | null>(null);

  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!open) return;
    const base = driver ? toFormState(driver) : INITIAL;
    setForm(base);
    setInitialForm(base);
    setErrors({});
    setTab("persoon");
    setPendingClose(false);
    setQuickMode(!driver);
    setCreatedDriverId(null);
    // Gemaskeerd starten wanneer een bestaande driver opengeklapt wordt,
    // zichtbaar bij aanmaken zodat de gebruiker kan typen.
    setShowBsn(!driver);
  }, [driver, open]);

  const isDirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(initialForm),
    [form, initialForm],
  );

  const dirtyByTab = useMemo(() => {
    const counts: Record<string, number> = {};
    const keys = Object.keys(form) as Array<keyof FormState>;
    for (const key of keys) {
      const before = initialForm[key];
      const after = form[key];
      let changed = false;
      if (Array.isArray(before) && Array.isArray(after)) {
        changed = JSON.stringify([...before].sort()) !== JSON.stringify([...after].sort());
      } else {
        changed = before !== after;
      }
      if (changed) {
        const tab = FIELD_TO_TAB[key];
        if (tab) counts[tab] = (counts[tab] ?? 0) + 1;
      }
    }
    return counts;
  }, [form, initialForm]);

  const dirtyTotal = useMemo(
    () => Object.values(dirtyByTab).reduce((a, b) => a + b, 0),
    [dirtyByTab],
  );

  const errorsByTab = useMemo(() => {
    const FIELD_ALIAS_TO_TAB: Record<string, string> = {
      name: "persoon",
      email: "persoon",
      phone: "persoon",
      birth_date: "persoon",
      street: "persoon",
      house_number: "persoon",
      house_number_suffix: "persoon",
      zipcode: "persoon",
      city: "persoon",
      country: "persoon",
      emergency_contact_name: "persoon",
      emergency_contact_relation: "persoon",
      emergency_contact_phone: "persoon",
      legitimation_type: "werk",
      license_number: "werk",
      legitimation_expiry_date: "werk",
      code95_expiry_date: "werk",
      hire_date: "werk",
      termination_date: "werk",
      contract_hours_per_week: "werk",
      employment_type: "werk",
      bsn: "administratie",
      iban: "administratie",
      personnel_number: "administratie",
    };
    const counts: Record<string, number> = {};
    for (const path of Object.keys(errors)) {
      const tab = FIELD_ALIAS_TO_TAB[path];
      if (tab) counts[tab] = (counts[tab] ?? 0) + 1;
    }
    return counts;
  }, [errors]);

  const requestClose = (next: boolean) => {
    if (next) {
      onOpenChange(true);
      return;
    }
    if (isDirty) {
      setPendingClose(true);
      return;
    }
    onOpenChange(false);
  };

  const confirmDiscard = () => {
    setPendingClose(false);
    onOpenChange(false);
  };

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

  const validateField = (fieldKey: keyof FormState, rawValue: any) => {
    const schemaShape: Partial<Record<keyof FormState, string>> = {
      email: "email",
      phone: "phone",
      iban: "iban",
      bsn: "bsn",
      personnelNumber: "personnel_number",
      legitimationExpiry: "legitimation_expiry_date",
      code95Expiry: "code95_expiry_date",
      birthDate: "birth_date",
      hireDate: "hire_date",
      terminationDate: "termination_date",
      contractHours: "contract_hours_per_week",
    };
    const zodPath = schemaShape[fieldKey];
    if (!zodPath) return;

    const value =
      fieldKey === "contractHours"
        ? (typeof rawValue === "string" && rawValue.trim() === "" ? null : Number(rawValue))
        : rawValue;

    const partial = driverBaseSchema.pick({ [zodPath]: true } as any);
    const result = partial.safeParse({ [zodPath]: value });

    setErrors((prev) => {
      const next = { ...prev };
      if (result.success) {
        delete next[zodPath];
      } else {
        const issue = result.error.issues.find((i) => i.path[0] === zodPath);
        if (issue) next[zodPath] = issue.message;
      }
      // Extra domein-regel: terminationDate < hireDate (dekking buiten superRefine)
      if (fieldKey === "terminationDate" || fieldKey === "hireDate") {
        const hire = fieldKey === "hireDate" ? rawValue : form.hireDate;
        const term = fieldKey === "terminationDate" ? rawValue : form.terminationDate;
        if (hire && term && typeof hire === "string" && typeof term === "string") {
          if (term < hire) {
            next.termination_date = "Uitdienst moet na indienst zijn";
          } else if (next.termination_date === "Uitdienst moet na indienst zijn") {
            delete next.termination_date;
          }
        } else if (next.termination_date === "Uitdienst moet na indienst zijn") {
          delete next.termination_date;
        }
      }
      return next;
    });
  };

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
      // Scroll eerste foute veld in zicht en focus het. Twee RAFs zodat de
      // tab-switch en aria-invalid-re-render eerst kunnen plaatsvinden.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const firstInvalid = formRef.current?.querySelector<HTMLElement>(
            '[aria-invalid="true"]',
          );
          if (firstInvalid) {
            firstInvalid.scrollIntoView({ block: "center", behavior: "smooth" });
            firstInvalid.focus();
          }
        });
      });
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
      work_types: form.workTypes,
      emergency_contact_name: parsed.data.emergency_contact_name || null,
      emergency_contact_relation:
        (parsed.data.emergency_contact_relation as string | null) || null,
      emergency_contact_phone: parsed.data.emergency_contact_phone || null,
      default_shift_template_id:
        form.defaultShiftTemplateId === "none" ? null : form.defaultShiftTemplateId,
      default_vehicle_id:
        form.defaultVehicleId === "none" ? null : form.defaultVehicleId,
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
      const isCreateMode = !driver;
      if (driver) {
        const saved = await updateDriver.mutateAsync({ id: driver.id, ...payload });
        savedId = (saved as any)?.id ?? driver.id;
        toast.success("Chauffeur bijgewerkt");
      } else {
        const saved = await createDriver.mutateAsync(payload);
        savedId = (saved as any)?.id;
        if (!savedId) {
          toast.error("Chauffeur aangemaakt, maar id ontbreekt");
          return;
        }
      }

      // Alleen upserten voor aangevinkte certs met een ingevulde
      // vervaldatum. Rijen in driver_certification_expiry worden hier
      // NIET meer gedelete op basis van selectedCerts, omdat die tabel
      // inmiddels ook geuploade documenten (document_url / document_name)
      // bevat via DriverCertificateRecordsSection. Een checkbox uitvinken
      // mag zo'n rij-met-bestand niet stilletjes weggooien, dat moet
      // bewust via de prullenbak in de certificaten-tab.
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

      if (expiryFailures.length > 0) {
        toast.warning(
          `Chauffeur opgeslagen, vervaldata van ${expiryFailures.length} certificering(en) konden niet worden bijgewerkt`,
        );
      }

      if (isCreateMode) {
        setCreatedDriverId(savedId);
        setQuickMode(false);
        setTab("certificaten");
        setInitialForm(form);
        toast.success("Chauffeur aangemaakt, voeg nu certificaten toe");
      } else {
        onOpenChange(false);
      }
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
    <Dialog open={open} onOpenChange={requestClose}>
      <DialogContent
        className={cn(
          "flex flex-col rounded-2xl p-0 gap-0",
          maximized
            ? "sm:max-w-[min(1400px,96vw)] w-[96vw] h-[94vh] max-h-[94vh]"
            : "sm:max-w-[720px] max-h-[92vh]",
        )}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>
            {driver ? "Chauffeur bewerken" : "Nieuwe chauffeur"}
          </DialogTitle>
        </DialogHeader>
        <DialogHero
          driver={driver}
          draftName={form.name}
          dirtyTotal={dirtyTotal}
          trailing={
            <button
              type="button"
              onClick={() => setMaximized((v) => !v)}
              aria-label={maximized ? "Scherm verkleinen" : "Groot scherm"}
              title={maximized ? "Verkleinen" : "Vergroten"}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
            >
              {maximized ? (
                <Minimize2 className="h-4 w-4" strokeWidth={1.5} />
              ) : (
                <Maximize2 className="h-4 w-4" strokeWidth={1.5} />
              )}
            </button>
          }
        />

        <form
          ref={formRef}
          onSubmit={handleSubmit}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              void handleSubmit(e as unknown as React.FormEvent);
            }
          }}
          className="flex flex-col flex-1 min-h-0"
        >
          {quickMode ? (
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              <SectionHeading>Snel toevoegen</SectionHeading>
              <p className="text-xs text-muted-foreground">
                Vul de essentiele gegevens in. Overige velden zoals legitimatie, administratie en certificaten voeg je later toe of via Volledige intake.
              </p>
              <div className="space-y-2">
                <Label htmlFor="quick-name">Naam *</Label>
                <Input
                  id="quick-name"
                  autoFocus
                  value={form.name}
                  onChange={(e) => setField("name", e.target.value)}
                  placeholder="Volledige naam"
                  required
                  aria-invalid={!!errors.name}
                  aria-describedby={errors.name ? "quick-name-error" : undefined}
                  className="rounded-xl border-border/50"
                />
                {errors.name && <ErrorText id="quick-name-error">{errors.name}</ErrorText>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="quick-email">Email</Label>
                <Input
                  id="quick-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setField("email", e.target.value)}
                  onBlur={() => validateField("email", form.email)}
                  placeholder="email@voorbeeld.nl"
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? "quick-email-error" : undefined}
                  className="rounded-xl border-border/50"
                />
                {errors.email && <ErrorText id="quick-email-error">{errors.email}</ErrorText>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="quick-phone">Telefoon</Label>
                <Input
                  id="quick-phone"
                  value={form.phone}
                  onChange={(e) => setField("phone", e.target.value)}
                  onBlur={() => validateField("phone", form.phone)}
                  placeholder="+31 6 ..."
                  aria-invalid={!!errors.phone}
                  aria-describedby={errors.phone ? "quick-phone-error" : undefined}
                  className="rounded-xl border-border/50"
                />
                {errors.phone && <ErrorText id="quick-phone-error">{errors.phone}</ErrorText>}
              </div>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setQuickMode(false)}
                  className="text-[11px] uppercase tracking-[0.16em] text-[hsl(var(--gold-deep))] hover:text-foreground transition-colors font-semibold"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Volledige intake openen →
                </button>
              </div>
            </div>
          ) : (
          <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col min-h-0">
            <div className="px-6 pt-3 border-b border-border/40">
              <TabsList className="h-9">
                {[
                  { value: "persoon", label: "Persoon" },
                  { value: "werk", label: "Werk" },
                  { value: "administratie", label: "Administratie" },
                  { value: "certificaten", label: "Certificaten", disabled: !driver && !createdDriverId },
                ].map((t) => {
                  const count = dirtyByTab[t.value] ?? 0;
                  const errorCount = errorsByTab[t.value] ?? 0;
                  return (
                    <TabsTrigger key={t.value} value={t.value} disabled={t.disabled}>
                      <span className="inline-flex items-center gap-1.5">
                        {t.label}
                        {errorCount > 0 ? (
                          <span
                            aria-label={`${errorCount} fout${errorCount === 1 ? "" : "en"}`}
                            className="inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full text-[9px] font-bold tabular-nums"
                            style={{
                              background: "hsl(var(--destructive))",
                              color: "hsl(var(--destructive-foreground))",
                            }}
                          >
                            {errorCount}
                          </span>
                        ) : count > 0 ? (
                          <span
                            aria-label={`${count} ongeslagen wijziging${count === 1 ? "" : "en"}`}
                            className="inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full text-[9px] font-bold tabular-nums"
                            style={{
                              background: "hsl(var(--gold-deep))",
                              color: "hsl(var(--card))",
                            }}
                          >
                            {count}
                          </span>
                        ) : null}
                      </span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {/* ────── Persoon ────── */}
              <TabsContent value="persoon" className="mt-0 space-y-6">
                <section className="space-y-4">
                  <SectionHeading>Basis</SectionHeading>
                  <div className="space-y-2">
                    <Label htmlFor="name">Naam *</Label>
                    <Input
                      id="name"
                      autoFocus
                      value={form.name}
                      onChange={(e) => setField("name", e.target.value)}
                      placeholder="Volledige naam"
                      required
                      aria-invalid={!!errors.name}
                      aria-describedby={errors.name ? "name-error" : undefined}
                      className="rounded-xl border-border/50"
                    />
                    {errors.name && <ErrorText id="name-error">{errors.name}</ErrorText>}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FieldWithError label="Email" id="email" error={errors.email} errorId="email-error">
                      <Input
                        id="email"
                        type="email"
                        value={form.email}
                        onChange={(e) => setField("email", e.target.value)}
                        onBlur={() => validateField("email", form.email)}
                        placeholder="email@voorbeeld.nl"
                        aria-invalid={!!errors.email}
                        aria-describedby={errors.email ? "email-error" : undefined}
                        className="rounded-xl border-border/50"
                      />
                    </FieldWithError>
                    <FieldWithError label="Telefoon" id="phone" error={errors.phone} errorId="phone-error">
                      <Input
                        id="phone"
                        value={form.phone}
                        onChange={(e) => setField("phone", e.target.value)}
                        onBlur={() => validateField("phone", form.phone)}
                        placeholder="+31 6 ..."
                        aria-invalid={!!errors.phone}
                        aria-describedby={errors.phone ? "phone-error" : undefined}
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
                      onSelect={(d) => {
                        const v = d ? format(d, "yyyy-MM-dd") : "";
                        setField("birthDate", v);
                        validateField("birthDate", v);
                      }}
                      fromYear={1940}
                      toYear={new Date().getFullYear() - 16}
                      defaultMonth={new Date(1985, 0, 1)}
                    />
                    {errors.birth_date && <ErrorText>{errors.birth_date}</ErrorText>}
                  </div>
                </section>

                <section className="space-y-4">
                  <SectionHeading>Adres</SectionHeading>
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
                </section>

                <section className="space-y-4">
                  <SectionHeading>Noodcontact</SectionHeading>
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
                </section>
              </TabsContent>

              {/* ────── Werk (Dienstverband + Legitimatie) ────── */}
              <TabsContent value="werk" className="mt-0 space-y-6">
                <section className="space-y-4">
                  <SectionHeading>Dienstverband</SectionHeading>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="hire-date">Indienstdatum</Label>
                    <DatePickerButton
                      id="hire-date"
                      open={hireDateOpen}
                      onOpenChange={setHireDateOpen}
                      value={hireDateParsed}
                      onSelect={(d) => {
                        const v = d ? format(d, "yyyy-MM-dd") : "";
                        setField("hireDate", v);
                        validateField("hireDate", v);
                      }}
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
                      onSelect={(d) => {
                        const v = d ? format(d, "yyyy-MM-dd") : "";
                        setField("terminationDate", v);
                        validateField("terminationDate", v);
                      }}
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
                      onBlur={() => validateField("contractHours", form.contractHours)}
                      placeholder="Bijv. 40"
                      aria-invalid={!!errors.contract_hours_per_week}
                      aria-describedby={errors.contract_hours_per_week ? "contract-hours-error" : undefined}
                      className="rounded-xl border-border/50"
                    />
                    {errors.contract_hours_per_week ? (
                      <ErrorText id="contract-hours-error">{errors.contract_hours_per_week}</ErrorText>
                    ) : Number(form.contractHours) > 40 ? (
                      <p className="flex items-center gap-1 text-xs text-amber-700">
                        <AlertTriangle className="h-3 w-3" /> Meer dan 40u per week, controleer de CAO
                      </p>
                    ) : null}
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

                <div className="pt-3 border-t border-border/40 space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-foreground">Planning</p>
                    <p className="text-[11px] text-muted-foreground">
                      Standaardwaarden die de rooster-module gebruikt bij "Pas standaardrooster toe".
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="default-shift-template">Standaardrooster</Label>
                      <Select
                        value={form.defaultShiftTemplateId}
                        onValueChange={(v) => setField("defaultShiftTemplateId", v)}
                      >
                        <SelectTrigger
                          id="default-shift-template"
                          className="rounded-xl border-border/50"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-border/50">
                          <SelectItem value="none">Geen standaard</SelectItem>
                          {shiftTemplates.map((template) => (
                            <SelectItem key={template.id} value={template.id}>
                              {template.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="default-vehicle">Standaardvoertuig</Label>
                      <Select
                        value={form.defaultVehicleId}
                        onValueChange={(v) => setField("defaultVehicleId", v)}
                      >
                        <SelectTrigger
                          id="default-vehicle"
                          className="rounded-xl border-border/50"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-border/50">
                          <SelectItem value="none">Geen standaard</SelectItem>
                          {activeVehicles.map((v) => (
                            <SelectItem key={v.id} value={v.id}>
                              {v.name} ({v.plate})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
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

                <div className="pt-3 border-t border-border/40 space-y-2">
                  <Label>Werkzaamheden</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Vink aan wat deze chauffeur mag of kan uitvoeren.
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {WORK_TYPE_OPTIONS.map((wt) => {
                      const checked = form.workTypes.includes(wt);
                      return (
                        <label
                          key={wt}
                          className="flex items-center gap-2 rounded-xl border border-border/40 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => {
                              const on = v === true;
                              setField(
                                "workTypes",
                                on
                                  ? [...form.workTypes, wt]
                                  : form.workTypes.filter((x) => x !== wt),
                              );
                            }}
                          />
                          <span>{wt}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                </section>

                <section className="space-y-4">
                  <SectionHeading>Legitimatie</SectionHeading>
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
                      <Label htmlFor="legit-expiry">Legitimatie geldig tot</Label>
                      <DatePickerButton
                        id="legit-expiry"
                        open={legitExpiryOpen}
                        onOpenChange={setLegitExpiryOpen}
                        value={legitExpiryParsed}
                        onSelect={(d) => {
                          const v = d ? format(d, "yyyy-MM-dd") : "";
                          setField("legitimationExpiry", v);
                          validateField("legitimationExpiry", v);
                        }}
                        fromYear={new Date().getFullYear()}
                        toYear={new Date().getFullYear() + 20}
                      />
                      <ExpiryWarning isoDate={form.legitimationExpiry} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="code95-expiry">Code 95 geldig tot</Label>
                      <DatePickerButton
                        id="code95-expiry"
                        open={code95ExpiryOpen}
                        onOpenChange={setCode95ExpiryOpen}
                        value={code95ExpiryParsed}
                        onSelect={(d) => {
                          const v = d ? format(d, "yyyy-MM-dd") : "";
                          setField("code95Expiry", v);
                          validateField("code95Expiry", v);
                        }}
                        fromYear={new Date().getFullYear()}
                        toYear={new Date().getFullYear() + 10}
                      />
                      <ExpiryWarning isoDate={form.code95Expiry} />
                    </div>
                  </div>
                </section>
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
                    errorId="personnel-number-error"
                  >
                    <Input
                      id="personnel-number"
                      value={form.personnelNumber}
                      onChange={(e) => {
                        setField("personnelNumber", e.target.value);
                        if (errors.personnel_number) {
                          setErrors((prev) => {
                            const next = { ...prev };
                            delete next.personnel_number;
                            return next;
                          });
                        }
                      }}
                      onBlur={() => validateField("personnelNumber", form.personnelNumber)}
                      placeholder="Bijv. 0042"
                      aria-invalid={!!errors.personnel_number}
                      aria-describedby={errors.personnel_number ? "personnel-number-error" : undefined}
                      className="rounded-xl border-border/50"
                    />
                  </FieldWithError>
                  <FieldWithError label="BSN" id="bsn" error={errors.bsn} errorId="bsn-error">
                    <div className="relative">
                      <Input
                        id="bsn"
                        inputMode="numeric"
                        value={form.bsn}
                        onChange={(e) => setField("bsn", e.target.value)}
                        onFocus={() => {
                          if (isEdit && form.bsn && !showBsn) setShowBsn(true);
                        }}
                        onBlur={() => validateField("bsn", form.bsn)}
                        placeholder="9 cijfers"
                        maxLength={11}
                        aria-invalid={!!errors.bsn}
                        aria-describedby={errors.bsn ? "bsn-error" : undefined}
                        className={cn(
                          "rounded-xl border-border/50 font-mono pr-10",
                          !showBsn && form.bsn && "text-transparent caret-foreground selection:text-transparent",
                        )}
                      />
                      {!showBsn && form.bsn && (
                        <div
                          aria-hidden
                          className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-foreground pointer-events-none select-none"
                        >
                          {maskBsn(form.bsn)}
                        </div>
                      )}
                      {isEdit && form.bsn && (
                        <button
                          type="button"
                          onClick={() => setShowBsn((v) => !v)}
                          aria-label={showBsn ? "BSN verbergen" : "BSN tonen"}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {showBsn ? (
                            <EyeOff className="h-4 w-4" strokeWidth={1.5} />
                          ) : (
                            <Eye className="h-4 w-4" strokeWidth={1.5} />
                          )}
                        </button>
                      )}
                    </div>
                  </FieldWithError>
                  <div className="col-span-2">
                    <FieldWithError label="IBAN" id="iban" error={errors.iban} errorId="iban-error">
                      <Input
                        id="iban"
                        value={form.iban}
                        onChange={(e) => setField("iban", e.target.value.toUpperCase())}
                        onBlur={() => {
                          const clean = form.iban.replace(/\s+/g, "").toUpperCase();
                          let formatted = form.iban;
                          if (clean.length > 0) {
                            formatted = clean.match(/.{1,4}/g)?.join(" ") ?? clean;
                            if (formatted !== form.iban) {
                              setField("iban", formatted);
                            }
                          }
                          validateField("iban", formatted);
                        }}
                        placeholder="NL12 ABCD 1234 5678 90"
                        aria-invalid={!!errors.iban}
                        aria-describedby={errors.iban ? "iban-error" : undefined}
                        className="rounded-xl border-border/50 font-mono tracking-wider"
                      />
                    </FieldWithError>
                  </div>
                </div>
              </TabsContent>

              {/* ────── Certificaten ────── */}
              <TabsContent value="certificaten" className="mt-0 space-y-4">
                {driver ? (
                  <DriverCertificateRecordsSection driverId={driver.id} />
                ) : createdDriverId ? (
                  <DriverCertificateRecordsSection driverId={createdDriverId} />
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    Sla eerst de chauffeur op, daarna kun je certificaten met datums en documenten vastleggen.
                  </p>
                )}
              </TabsContent>
            </div>
          </Tabs>
          )}

          <DialogFooter className="px-6 py-3 border-t border-border/40 bg-background/80 backdrop-blur-sm">
            <Button
              type="button"
              variant="outline"
              onClick={() => requestClose(false)}
              disabled={isPending}
              className="rounded-xl border-border/50"
            >
              Annuleren
            </Button>
            <Button
              type="submit"
              disabled={isPending || form.name.trim() === ""}
              className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground px-8 gap-2"
            >
              <span>
                {isPending
                  ? "Opslaan..."
                  : driver || createdDriverId
                    ? "Opslaan"
                    : quickMode
                      ? "Snel toevoegen"
                      : "Toevoegen"}
              </span>
              {!isPending && driver && dirtyTotal > 0 && (
                <span
                  aria-hidden
                  className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full text-[10px] font-bold tabular-nums"
                  style={{
                    background: "hsl(var(--card) / 0.25)",
                    color: "hsl(var(--primary-foreground))",
                  }}
                >
                  {dirtyTotal}
                </span>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      <AlertDialog
        open={pendingClose}
        onOpenChange={(o) => !o && setPendingClose(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Wijzigingen weggooien?</AlertDialogTitle>
            <AlertDialogDescription>
              Je hebt wijzigingen die nog niet zijn opgeslagen. Sluit je de dialog nu,
              dan gaan ze verloren.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Doorgaan met bewerken</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDiscard}>
              Wijzigingen weggooien
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

function resolveTabForError(paths: string[]): string | null {
  const PERSOON = ["name", "email", "phone", "birth_date", "street", "house_number", "house_number_suffix", "zipcode", "city", "country", "emergency_contact_name", "emergency_contact_relation", "emergency_contact_phone"];
  const WERK = ["legitimation_type", "license_number", "legitimation_expiry_date", "code95_expiry_date", "hire_date", "termination_date", "contract_hours_per_week", "employment_type"];
  const ADMIN = ["bsn", "iban", "personnel_number"];
  if (paths.some((p) => PERSOON.includes(p))) return "persoon";
  if (paths.some((p) => WERK.includes(p))) return "werk";
  if (paths.some((p) => ADMIN.includes(p))) return "administratie";
  return null;
}

function FieldWithError({
  label,
  id,
  error,
  errorId,
  children,
}: {
  label: string;
  id: string;
  error?: string;
  errorId?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <ErrorText id={errorId}>{error}</ErrorText>}
    </div>
  );
}

function ErrorText({ id, children }: { id?: string; children: React.ReactNode }) {
  return <p id={id} className="text-xs text-destructive mt-1">{children}</p>;
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2" style={{ fontFamily: "var(--font-display)" }}>
      <span aria-hidden className="inline-block h-[1px] w-6" style={{ background: "hsl(var(--gold)/0.5)" }} />
      <h3 className="text-[10px] uppercase tracking-[0.22em] text-[hsl(var(--gold-deep))] font-semibold">
        {children}
      </h3>
      <span aria-hidden className="flex-1 h-px" style={{ background: "linear-gradient(90deg, hsl(var(--gold)/0.2), transparent)" }} />
    </div>
  );
}

function DialogHero({
  driver,
  draftName,
  dirtyTotal,
  trailing,
}: {
  driver?: Driver;
  draftName?: string;
  dirtyTotal?: number;
  trailing?: React.ReactNode;
}) {
  const isEdit = Boolean(driver);
  const trimmedDraft = (draftName ?? "").trim();
  const name = isEdit ? driver!.name : trimmedDraft;
  const hasName = name.length > 0;

  const statusCfg = isEdit
    ? STATUS_BADGE[driver!.status] ?? STATUS_BADGE.beschikbaar
    : null;
  const StatusIcon = statusCfg?.Icon;

  const hireDate = isEdit && driver!.hire_date ? parseISO(driver!.hire_date) : null;
  const hireLabel = hireDate && !Number.isNaN(hireDate.getTime())
    ? format(hireDate, "MMMM yyyy", { locale: nl })
    : null;
  const lastUpdate = isEdit && driver!.updated_at ? parseISO(driver!.updated_at) : null;
  const lastUpdateLabel = lastUpdate && !Number.isNaN(lastUpdate.getTime())
    ? format(lastUpdate, "d MMM yyyy", { locale: nl })
    : null;

  return (
    <div
      className="relative px-6 py-4 border-b border-[hsl(var(--gold)/0.15)]"
      style={{
        background: "linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--gold-soft)/0.22) 100%)",
      }}
    >
      <span
        aria-hidden
        className="absolute top-0 left-0 right-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, hsl(var(--gold)/0.4) 50%, transparent)" }}
      />
      <div className="flex items-center gap-4 pr-10">
        <div
          className="relative shrink-0 h-12 w-12 rounded-full flex items-center justify-center font-bold text-base"
          style={{
            background: "linear-gradient(135deg, hsl(var(--gold-soft)/0.7), hsl(var(--gold)/0.2))",
            color: "hsl(var(--gold-deep))",
            boxShadow: "inset 0 0 0 1px hsl(var(--gold)/0.25)",
          }}
        >
          {hasName ? (
            initialsOf(name)
          ) : (
            <Plus className="h-5 w-5" strokeWidth={2.25} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1" style={{ fontFamily: "var(--font-display)" }}>
            <span aria-hidden className="inline-block h-[1px] w-4" style={{ background: "hsl(var(--gold)/0.5)" }} />
            <span className="text-[9px] uppercase tracking-[0.28em] text-[hsl(var(--gold-deep))] font-semibold">
              {isEdit ? "Chauffeur bewerken" : "Nieuwe chauffeur"}
            </span>
            {isEdit && driver!.personnel_number && (
              <>
                <span aria-hidden className="inline-block h-[3px] w-[3px] rounded-full" style={{ background: "hsl(var(--gold)/0.5)" }} />
                <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70 font-mono">
                  #{driver!.personnel_number}
                </span>
              </>
            )}
            {!isEdit && (dirtyTotal ?? 0) > 0 && (
              <>
                <span aria-hidden className="inline-block h-[3px] w-[3px] rounded-full" style={{ background: "hsl(var(--gold)/0.5)" }} />
                <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70 tabular-nums">
                  {dirtyTotal} {dirtyTotal === 1 ? "veld ingevuld" : "velden ingevuld"}
                </span>
              </>
            )}
          </div>
          <h2
            className={cn(
              "text-lg font-semibold tracking-tight leading-tight truncate",
              hasName ? "text-foreground" : "text-muted-foreground/50 italic font-normal",
            )}
            style={{ fontFamily: "var(--font-display)" }}
          >
            {hasName ? name : "Naam in te vullen"}
          </h2>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {isEdit && statusCfg && StatusIcon ? (
              <span
                className={cn(
                  "inline-flex items-center h-5 px-1.5 rounded text-[10px] font-bold uppercase tracking-wider border-none",
                  statusCfg.className,
                )}
              >
                <StatusIcon className="h-3 w-3 mr-1" />
                {statusCfg.label}
              </span>
            ) : (
              <span
                className="inline-flex items-center h-5 px-1.5 rounded text-[10px] font-bold uppercase tracking-wider border"
                style={{
                  background: "hsl(var(--gold-soft)/0.5)",
                  color: "hsl(var(--gold-deep))",
                  borderColor: "hsl(var(--gold)/0.35)",
                }}
              >
                Concept
              </span>
            )}
            {isEdit && (
              <span
                className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70 font-medium"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {driver!.employment_type}
                {driver!.contract_hours_per_week ? `, ${driver!.contract_hours_per_week}u` : ""}
              </span>
            )}
            {isEdit && hireLabel && (
              <span
                className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70"
                style={{ fontFamily: "var(--font-display)" }}
              >
                · In dienst {hireLabel}
              </span>
            )}
            {!isEdit && (
              <span
                className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Doorloop alle tabbladen, sla op en voeg daarna certificaten toe
              </span>
            )}
          </div>
        </div>
        {isEdit && lastUpdateLabel && (
          <div className="text-right shrink-0 hidden md:block">
            <div
              className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground/60 font-semibold"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Laatst gewijzigd
            </div>
            <div
              className="text-[11px] text-muted-foreground tabular-nums mt-0.5"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {lastUpdateLabel}
            </div>
          </div>
        )}
        {trailing && <div className="shrink-0">{trailing}</div>}
      </div>
    </div>
  );
}

// Probeert "dd-mm-jjjj", "d-m-jjjj", "ddmmjjjj" of dezelfde varianten
// met "/" of "." als scheidingsteken te parsen. Bij ongeldige invoer
// geven we null terug zodat de aanroeper de oude waarde kan herstellen.
function parseDutchDate(input: string): Date | null {
  const cleaned = input.trim();
  if (!cleaned) return null;
  const match = cleaned.match(/^(\d{1,2})[-/.\s]?(\d{1,2})[-/.\s]?(\d{2}|\d{4})$/);
  if (!match) return null;
  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  let year = parseInt(match[3], 10);
  if (match[3].length === 2) year += year >= 70 ? 1900 : 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
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
  const [text, setText] = useState(value ? format(value, "dd-MM-yyyy") : "");
  const [parseError, setParseError] = useState(false);

  // Houd de tekst in sync als de waarde van buiten verandert (bijv. via
  // de kalenderselectie of als het formulier herlaadt).
  useEffect(() => {
    setText(value ? format(value, "dd-MM-yyyy") : "");
    setParseError(false);
  }, [value]);

  const commit = () => {
    const trimmed = text.trim();
    if (trimmed === "") {
      setParseError(false);
      onSelect(undefined);
      return;
    }
    const parsed = parseDutchDate(trimmed);
    if (parsed) {
      setParseError(false);
      onSelect(parsed);
    } else {
      // Ongeldige invoer: melden en tekst behouden zodat de gebruiker
      // kan corrigeren.
      setParseError(true);
    }
  };

  return (
    <div className="space-y-1">
      <Popover open={open} onOpenChange={onOpenChange}>
        <div
          className={cn(
            "flex h-10 w-full items-center gap-2 rounded-xl border px-3 py-2 text-sm",
            "bg-[hsl(var(--card))] text-foreground",
            parseError
              ? "border-destructive focus-within:border-destructive focus-within:ring-2 focus-within:ring-destructive/40"
              : "border-[hsl(var(--gold)/0.25)] focus-within:border-[hsl(var(--gold)/0.6)] focus-within:ring-2 focus-within:ring-[hsl(var(--gold)/0.4)]",
          )}
        >
          <input
            id={id}
            type="text"
            inputMode="numeric"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (parseError) setParseError(false);
            }}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
                (e.currentTarget as HTMLInputElement).blur();
              }
            }}
            placeholder="dd-mm-jjjj"
            className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
          />
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Open kalender"
              className="text-[hsl(var(--gold-deep))] hover:text-[hsl(var(--gold-deep))]"
            >
              <CalendarIcon className="h-4 w-4" />
            </button>
          </PopoverTrigger>
        </div>
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
      {parseError && (
        <p className="text-xs text-destructive">
          Ongeldige datum, gebruik dd-mm-jjjj (bijv. 19-03-1994).
        </p>
      )}
    </div>
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
