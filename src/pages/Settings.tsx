import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Database,
  Users,
  Palette,
  ChevronRight,
  Upload,
  Smartphone,
  BookOpen,
  Truck,
  FileText,
  Calculator,
  AlertTriangle,
  CheckCircle2,
  Bell,
  ShieldCheck,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { MasterDataSection } from "@/components/settings/MasterDataSection";
import { ShiftTemplateSettings } from "@/components/settings/ShiftTemplateSettings";
import { VehicleDocumentTypesSection } from "@/components/fleet/VehicleDocumentTypesSection";
import { useTenant, type TenantBrandingSettings } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { useLoadSettings, useSaveSettings } from "@/hooks/useSettings";
import {
  useIntegrationCredentials,
  useSaveIntegrationCredentials,
} from "@/hooks/useIntegrationCredentials";
import { useConnectorList } from "@/hooks/useConnectors";
import { useSaveSmsSettings, useSmsSettings } from "@/hooks/useSmsSettings";
import { supabase } from "@/integrations/supabase/client";
import { useUpdateTenantBranding } from "@/hooks/useUpdateTenant";
import { RateCardSettings } from "@/components/settings/RateCardSettings";
import { SurchargeSettings } from "@/components/settings/SurchargeSettings";
import { PricingPreview } from "@/components/settings/PricingPreview";
import { SettingsCommandPalette } from "@/components/settings/SettingsCommandPalette";
import { StickySaveBar } from "@/components/settings/StickySaveBar";
import { CostTypeSettings } from "@/components/settings/CostTypeSettings";
import { FuelPriceSettings } from "@/components/settings/FuelPriceSettings";
import { InboxSettings } from "@/components/settings/InboxSettings";
import { EtaNotificationSettings } from "@/components/settings/EtaNotificationSettings";
import { WebhookSettings } from "@/components/settings/WebhookSettings";
import { ApiTokenSettings } from "@/components/settings/ApiTokenSettings";
import { ConnectorCatalog } from "@/components/settings/ConnectorCatalog";
import { ConnectorDetail } from "@/components/settings/ConnectorDetail";
import { ExceptionRulesSettings } from "@/components/settings/ExceptionRulesSettings";
import { DeferredMount } from "@/components/performance/DeferredMount";
import { useTranslation } from "react-i18next";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEFAULT_SLA_SETTINGS, normalizeSlaSettings } from "@/lib/slaSettings";

const LANGUAGE_OPTIONS = [
  { value: "nl", label: "Nederlands" },
  { value: "en", label: "English" },
  { value: "de", label: "Deutsch" },
  { value: "fr", label: "Français" },
];

const LUXE_ICON_TILE =
  "h-10 w-10 rounded-xl flex items-center justify-center border border-[hsl(var(--gold)/0.3)]";
const LUXE_ICON_TILE_STYLE = {
  background: "linear-gradient(135deg, hsl(var(--gold-soft)/0.8), hsl(var(--gold-soft)/0.25))",
} as const;

interface NavItem {
  value: string;
  label: string;
  description?: string;
  target?: string;
  aliases?: string[];
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}
interface NavGroup {
  title: string;
  items: NavItem[];
}

function SettingsStatusCard({
  title,
  value,
  note,
  statusLabel,
  tone = "default",
  icon: Icon,
}: {
  title: string;
  value: string;
  note: string;
  statusLabel: string;
  tone?: "default" | "warning";
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}) {
  const warning = tone === "warning";

  return (
    <div className="card--luxe p-5 md:p-6">
      <div className="flex items-start justify-between gap-5">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
          <div className="mt-3 text-[2rem] leading-none font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
            {value}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-[0.12em] uppercase",
                warning
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-[hsl(var(--gold)/0.16)] bg-[hsl(var(--gold-soft)/0.22)] text-[hsl(var(--gold-deep))]",
              )}
            >
              {warning ? <AlertTriangle className="h-3 w-3" strokeWidth={1.8} /> : <CheckCircle2 className="h-3 w-3" strokeWidth={1.8} />}
              {statusLabel}
            </span>
          </div>
          <p className="mt-3 max-w-[24ch] text-xs leading-relaxed text-muted-foreground">{note}</p>
        </div>
        <div
          className={cn(
            "h-11 w-11 rounded-2xl flex items-center justify-center border shrink-0",
            warning
              ? "border-amber-200 bg-amber-50 text-amber-700"
              : "border-[hsl(var(--gold)/0.22)] bg-[hsl(var(--gold-soft)/0.22)] text-[hsl(var(--gold-deep))]",
          )}
        >
          <Icon className="h-4 w-4" strokeWidth={1.7} />
        </div>
      </div>
    </div>
  );
}

function SettingsOverviewCard({
  title,
  description,
  icon: Icon,
  items,
  onClick,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  items: Array<{ label: string; status: string; subtle?: boolean }>;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="card--luxe p-5 md:p-6 text-left transition-all hover:border-[hsl(var(--gold)/0.2)] hover:bg-[hsl(var(--gold-soft)/0.06)] group"
    >
      <div className="flex items-start justify-between gap-4">
        <div className={cn(LUXE_ICON_TILE, "h-11 w-11 rounded-2xl")} style={LUXE_ICON_TILE_STYLE}>
          <Icon className="h-4 w-4 text-[hsl(var(--gold-deep))]" strokeWidth={1.5} />
        </div>
        <ChevronRight className="h-4 w-4 text-[hsl(var(--gold)/0.45)] transition-colors group-hover:text-[hsl(var(--gold-deep))]" />
      </div>
      <h3 className="mt-5 text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-2 max-w-[38ch] text-xs leading-relaxed text-muted-foreground">{description}</p>

      <div className="mt-5 space-y-2.5">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between gap-4 rounded-xl bg-[hsl(var(--gold-soft)/0.09)] px-3.5 py-2.5"
          >
            <span className="text-sm text-foreground/90">{item.label}</span>
            <span className={cn("text-[11px] whitespace-nowrap", item.subtle ? "text-muted-foreground" : "font-medium text-[hsl(var(--gold-deep))]")}>
              {item.status}
            </span>
          </div>
        ))}
      </div>
    </button>
  );
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Basis",
    items: [
      { value: "algemeen", label: "Algemeen", description: "Taal en overzicht", icon: Database },
      { value: "branding", label: "Branding", description: "Logo en huisstijl", icon: Palette },
    ],
  },
  {
    title: "Operatie",
    items: [
      {
        value: "operationele-inrichting",
        label: "Operationele inrichting",
        description: "Stamdata en regels",
        icon: Truck,
      },
    ],
  },
  {
    title: "Communicatie",
    items: [
      {
        value: "communicatie",
        label: "Communicatie",
        description: "Meldingen en inboxen",
        target: "notificaties",
        aliases: ["notificaties", "sms", "eta-meldingen", "inboxen"],
        icon: Bell,
      },
    ],
  },
  {
    title: "Koppelingen",
    items: [
      {
        value: "koppelingen",
        label: "Koppelingen",
        description: "API en integraties",
        target: "integraties",
        aliases: ["integraties", "webhooks", "api-tokens"],
        icon: ShieldCheck,
      },
    ],
  },
];

const OPERATIONS_NAV_ITEMS: NavItem[] = [
  { value: "stamgegevens", label: "Stamgegevens" },
  { value: "rooster-types", label: "Rooster-types" },
  { value: "prijslogica", label: "Prijslogica" },
  { value: "sla", label: "SLA" },
  { value: "uitzonderingen", label: "Uitzonderingen" },
];

const COMMUNICATION_NAV_ITEMS: NavItem[] = [
  { value: "notificaties", label: "Notificaties" },
  { value: "sms", label: "SMS" },
  { value: "eta-meldingen", label: "ETA-meldingen" },
  { value: "inboxen", label: "Inboxen" },
];

const CONNECTION_NAV_ITEMS: NavItem[] = [
  { value: "integraties", label: "Integraties" },
  { value: "webhooks", label: "Webhooks" },
  { value: "api-tokens", label: "API-tokens" },
];

const TAB_TRIGGER_ITEMS: NavItem[] = [
  ...NAV_GROUPS.flatMap((group) => group.items),
  ...COMMUNICATION_NAV_ITEMS,
  ...CONNECTION_NAV_ITEMS,
];

const OPERATION_SECTION_COPY: Record<string, { title: string; description: string }> = {
  stamgegevens: {
    title: "Stamgegevens en documenten",
    description: "Beheer adresboek, labels en voertuigdocumenten als vaste basis voor orders en planning.",
  },
  "rooster-types": {
    title: "Rooster-types",
    description: "Richt standaarddiensten in die planners kunnen gebruiken bij het maken van chauffeursroosters.",
  },
  prijslogica: {
    title: "Prijslogica",
    description: "Bundel tariefkaarten, toeslagen, brandstofprijs en interne kostensoorten op een plek.",
  },
  sla: {
    title: "SLA-bewaking",
    description: "Bepaal wanneer orders risico lopen en wanneer planners waarschuwingen moeten krijgen.",
  },
  uitzonderingen: {
    title: "Uitzonderingsregels",
    description: "Stel in welke operationele signalen zichtbaar zijn en wanneer ze aandacht vragen.",
  },
};

const COMMUNICATION_SECTION_COPY: Record<string, { title: string; description: string }> = {
  notificaties: {
    title: "Notificaties",
    description: "Beheer e-mail, SMTP en algemene meldingen voor de operatie.",
  },
  sms: {
    title: "SMS",
    description: "Richt SMS-providers, templates en statusmomenten voor klantberichten in.",
  },
  "eta-meldingen": {
    title: "ETA-meldingen",
    description: "Stel klantmeldingen rond aankomsttijden en statusupdates in.",
  },
  inboxen: {
    title: "Inboxen",
    description: "Koppel mailboxen en intakekanalen aan de orderflow.",
  },
};

const CONNECTION_SECTION_COPY: Record<string, { title: string; description: string }> = {
  integraties: {
    title: "Integraties",
    description: "Beheer externe systemen zoals boekhouding, telematica en connectoren.",
  },
  webhooks: {
    title: "Webhooks",
    description: "Laat externe systemen live meeluisteren met gebeurtenissen in de TMS.",
  },
  "api-tokens": {
    title: "API-tokens",
    description: "Maak en beheer toegangssleutels voor technische koppelingen.",
  },
};

function GroupedSettingsHeader({
  eyebrow,
  title,
  description,
  items,
  activeValue,
  onChange,
}: {
  eyebrow: string;
  title: string;
  description: string;
  items: NavItem[];
  activeValue: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-[hsl(var(--gold)/0.14)] bg-card shadow-sm">
      <div className="border-b border-[hsl(var(--gold)/0.14)] bg-[linear-gradient(180deg,hsl(var(--gold-soft)/0.32),hsl(var(--card)))] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-display font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))]">
            {eyebrow}
            </p>
            <h2 className="mt-2 text-xl font-semibold text-foreground">{title}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
          </div>
        </div>
      </div>
      <div className="bg-[hsl(var(--gold-soft)/0.12)] px-5 py-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item) => {
            const active = activeValue === item.value;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => onChange(item.value)}
                className={cn(
                  "h-9 rounded-md px-3 text-sm font-medium ring-1 transition-colors",
                  active
                    ? "bg-[hsl(var(--gold-soft)/0.72)] text-[hsl(var(--gold-deep))] ring-[hsl(var(--gold)/0.24)]"
                    : "bg-background text-muted-foreground ring-border/40 hover:bg-[hsl(var(--gold-soft)/0.36)] hover:text-foreground",
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const Settings = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { tenant } = useTenant();
  const { t, i18n } = useTranslation();
  const activeSettingsTab = useMemo(() => {
    const path = location.pathname;
    if (path.includes("/operationele-inrichting")) return "operationele-inrichting";
    if (path.includes("/stamgegevens")) return "operationele-inrichting";
    if (path.includes("/rooster-types")) return "operationele-inrichting";
    if (path.includes("/sla")) return "operationele-inrichting";
    if (path.includes("/uitzonderingen")) return "operationele-inrichting";
    if (path.includes("/prijslogica")) return "operationele-inrichting";
    if (path.includes("/tarieven")) return "operationele-inrichting";
    if (path.includes("/kosten")) return "operationele-inrichting";
    if (path.includes("/branding")) return "branding";
    if (path.includes("/notificaties")) return "notificaties";
    if (path.includes("/sms")) return "sms";
    if (path.includes("/eta-meldingen")) return "eta-meldingen";
    if (path.includes("/integraties")) return "integraties";
    if (path.includes("/inboxen")) return "inboxen";
    if (path.includes("/webhooks")) return "webhooks";
    if (path.includes("/api-tokens")) return "api-tokens";
    return "algemeen";
  }, [location.pathname]);

  // Local state mirrors i18n.language so React always re-renders on change.
  const [currentLang, setCurrentLang] = useState(i18n.language || "nl");

  useEffect(() => {
    if (!i18n.on) return; // Skip in test environments without full i18n
    const onChanged = (lng: string) => setCurrentLang(lng);
    i18n.on("languageChanged", onChanged);
    return () => { i18n.off?.("languageChanged", onChanged); };
  }, [i18n]);

  const handleLanguageChange = useCallback((lng: string) => {
    i18n.changeLanguage(lng);
    localStorage.setItem("language", lng);
    // Eagerly update local state so Select reflects the new value immediately
    setCurrentLang(lng);
  }, [i18n]);

  // Branding state
  const [companyName, setCompanyName] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#3b82f6");
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [pendingLogoFile, setPendingLogoFile] = useState<File | null>(null);
  const [darkLogoPreview, setDarkLogoPreview] = useState<string | null>(null);
  const [pendingDarkLogoFile, setPendingDarkLogoFile] = useState<File | null>(null);
  const [appIconPreview, setAppIconPreview] = useState<string | null>(null);
  const [pendingAppIconFile, setPendingAppIconFile] = useState<File | null>(null);
  const [brandingSettings, setBrandingSettings] = useState<TenantBrandingSettings>({});
  const [invoiceTemplateName, setInvoiceTemplateName] = useState<string | null>(null);
  const [invoiceTemplateUrl, setInvoiceTemplateUrl] = useState<string | null>(null);
  const [pendingInvoiceTemplateFile, setPendingInvoiceTemplateFile] = useState<File | null>(null);
  const [clearInvoiceTemplate, setClearInvoiceTemplate] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const darkLogoInputRef = useRef<HTMLInputElement>(null);
  const appIconInputRef = useRef<HTMLInputElement>(null);
  const invoiceTemplateInputRef = useRef<HTMLInputElement>(null);
  const updateBranding = useUpdateTenantBranding();

  const [brandingBaseline, setBrandingBaseline] = useState<string>("");

  useEffect(() => {
    if (tenant) {
      setCompanyName(tenant.name || "");
      setPrimaryColor(tenant.primaryColor || "#3b82f6");
      setLogoPreview(tenant.logoUrl || null);
      setPendingLogoFile(null);
      setBrandingSettings(tenant.brandingSettings ?? {});
      setDarkLogoPreview(tenant.brandingSettings?.darkLogoUrl || null);
      setPendingDarkLogoFile(null);
      setAppIconPreview(tenant.brandingSettings?.appIconUrl || null);
      setPendingAppIconFile(null);
      setInvoiceTemplateName(tenant.invoiceTemplateFilename || null);
      setInvoiceTemplateUrl(tenant.invoiceTemplateUrl || null);
      setPendingInvoiceTemplateFile(null);
      setClearInvoiceTemplate(false);
      setBrandingBaseline(JSON.stringify({
        name: tenant.name || "",
        color: tenant.primaryColor || "#3b82f6",
        logoUrl: tenant.logoUrl || null,
        darkLogoUrl: tenant.brandingSettings?.darkLogoUrl || null,
        appIconUrl: tenant.brandingSettings?.appIconUrl || null,
        brandingSettings: tenant.brandingSettings ?? {},
        invoiceTemplateName: tenant.invoiceTemplateFilename || null,
        invoiceTemplateUrl: tenant.invoiceTemplateUrl || null,
      }));
    }
  }, [tenant]);

  const brandingCurrent = JSON.stringify({
    name: companyName,
    color: primaryColor,
    // pending-file markeert dirty, ongeacht preview-url
    logoUrl: pendingLogoFile ? "__pending__" : logoPreview,
    darkLogoUrl: pendingDarkLogoFile ? "__pending__" : darkLogoPreview,
    appIconUrl: pendingAppIconFile ? "__pending__" : appIconPreview,
    brandingSettings,
    invoiceTemplateName: pendingInvoiceTemplateFile ? pendingInvoiceTemplateFile.name : invoiceTemplateName,
    invoiceTemplateUrl: pendingInvoiceTemplateFile
      ? "__pending__"
      : clearInvoiceTemplate
        ? null
        : invoiceTemplateUrl,
  });
  const brandingDirty = brandingBaseline !== "" && brandingCurrent !== brandingBaseline;
  const revertBranding = () => {
    if (!tenant) return;
    setCompanyName(tenant.name || "");
    setPrimaryColor(tenant.primaryColor || "#3b82f6");
    setLogoPreview(tenant.logoUrl || null);
    setPendingLogoFile(null);
    setBrandingSettings(tenant.brandingSettings ?? {});
    setDarkLogoPreview(tenant.brandingSettings?.darkLogoUrl || null);
    setPendingDarkLogoFile(null);
    setAppIconPreview(tenant.brandingSettings?.appIconUrl || null);
    setPendingAppIconFile(null);
    setInvoiceTemplateName(tenant.invoiceTemplateFilename || null);
    setInvoiceTemplateUrl(tenant.invoiceTemplateUrl || null);
    setPendingInvoiceTemplateFile(null);
    setClearInvoiceTemplate(false);
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast.error("Logo te groot", { description: "Maximaal 2 MB." });
        return;
      }
      setPendingLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setLogoPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleBrandAssetChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    options: {
      setFile: (file: File | null) => void;
      setPreview: (value: string | null) => void;
      label: string;
    },
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error(`${options.label} te groot`, { description: "Maximaal 2 MB." });
      e.target.value = "";
      return;
    }

    options.setFile(file);
    const reader = new FileReader();
    reader.onloadend = () => options.setPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const updateBrandingSetting = (key: keyof TenantBrandingSettings, value: string) => {
    setBrandingSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleInvoiceTemplateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Geen PDF", { description: "Upload een factuursjabloon als PDF-bestand." });
      e.target.value = "";
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("Sjabloon te groot", { description: "Maximaal 10 MB." });
      e.target.value = "";
      return;
    }

    setPendingInvoiceTemplateFile(file);
    setInvoiceTemplateName(file.name);
    setInvoiceTemplateUrl(null);
    setClearInvoiceTemplate(false);
  };

  const handleClearInvoiceTemplate = () => {
    setPendingInvoiceTemplateFile(null);
    setInvoiceTemplateName(null);
    setInvoiceTemplateUrl(null);
    setClearInvoiceTemplate(true);
    if (invoiceTemplateInputRef.current) invoiceTemplateInputRef.current.value = "";
  };

  const handleSaveBranding = async () => {
    await updateBranding.mutateAsync({
      name: companyName,
      primary_color: primaryColor,
      logo_file: pendingLogoFile,
      invoice_template_file: pendingInvoiceTemplateFile,
      clear_invoice_template: clearInvoiceTemplate,
      dark_logo_file: pendingDarkLogoFile,
      app_icon_file: pendingAppIconFile,
      branding_settings: {
        ...brandingSettings,
        darkLogoUrl: pendingDarkLogoFile ? darkLogoPreview : brandingSettings.darkLogoUrl,
        appIconUrl: pendingAppIconFile ? appIconPreview : brandingSettings.appIconUrl,
      },
    });
    setPendingLogoFile(null);
    setPendingDarkLogoFile(null);
    setPendingAppIconFile(null);
    setPendingInvoiceTemplateFile(null);
    setClearInvoiceTemplate(false);
  };

  // Notification settings state
  const [notifications, setNotifications] = useState({
    newOrder: true,
    cancellation: true,
    deadlineExceeded: true,
    dailySummary: false,
    weeklyReport: false,
  });

  const toggleNotification = (key: keyof typeof notifications) => {
    setNotifications((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // SMS settings state
  const [smsProvider, setSmsProvider] = useState<"twilio" | "messagebird">("twilio");
  const [twilioAccountSid, setTwilioAccountSid] = useState("");
  const [twilioAuthToken, setTwilioAuthToken] = useState("");
  const [twilioFromNumber, setTwilioFromNumber] = useState("");
  const [messageBirdApiKey, setMessageBirdApiKey] = useState("");
  const [messageBirdOriginator, setMessageBirdOriginator] = useState("");
  const [smsEvents, setSmsEvents] = useState({
    onderweg: true,
    afgeleverd: true,
    vertraging: false,
  });
  const [smsTemplate, setSmsTemplate] = useState("");

  const toggleSmsEvent = (key: keyof typeof smsEvents) => {
    setSmsEvents((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Integrations state
  const [integrations, setIntegrations] = useState({
    exactOnline: { enabled: false, apiKey: "" },
    twinfield: { enabled: false, username: "", password: "" },
    samsara: { enabled: false, apiKey: "" },
  });

  interface SnelstartFields {
    clientKey: string;
    subscriptionKey: string;
    administratieId: string;
    standaardGrootboek: string;
    btwGrootboek: string;
    mockMode: boolean;
  }
  const EMPTY_SNELSTART = useMemo<SnelstartFields>(() => ({
    clientKey: "",
    subscriptionKey: "",
    administratieId: "",
    standaardGrootboek: "",
    btwGrootboek: "",
    mockMode: true,
  }), []);
  const [snelstart, setSnelstart] = useState<{ enabled: boolean; fields: SnelstartFields }>(
    { enabled: false, fields: { ...EMPTY_SNELSTART } },
  );
  const [snelstartBaseline, setSnelstartBaseline] = useState<string>("");
  const [snelstartTesting, setSnelstartTesting] = useState(false);
  const { data: snelstartSaved } = useIntegrationCredentials<SnelstartFields>("snelstart", {
    enabled: false,
  });
  const saveSnelstart = useSaveIntegrationCredentials<SnelstartFields>("snelstart");
  useEffect(() => {
    if (snelstartSaved === undefined) return;
    const merged = {
      enabled: snelstartSaved.enabled,
      fields: { ...EMPTY_SNELSTART, ...snelstartSaved.credentials },
    };
    setSnelstart(merged);
    setSnelstartBaseline(JSON.stringify(merged));
  }, [EMPTY_SNELSTART, snelstartSaved]);

  const snelstartDirty =
    snelstartBaseline !== "" && JSON.stringify(snelstart) !== snelstartBaseline;
  const revertSnelstart = () => {
    if (!snelstartBaseline) return;
    try { setSnelstart(JSON.parse(snelstartBaseline)); } catch { /* noop */ }
  };
  const updateSnelstartField = (field: keyof SnelstartFields, value: string | boolean) => {
    setSnelstart((prev) => ({ ...prev, fields: { ...prev.fields, [field]: value } }));
  };
  const handleSaveSnelstart = async () => {
    try {
      await saveSnelstart.mutateAsync({
        enabled: snelstart.enabled,
        credentials: snelstart.fields,
      });
      setSnelstartBaseline(JSON.stringify(snelstart));
      toast.success("Snelstart-koppeling opgeslagen");
    } catch {
      toast.error("Fout bij opslaan", { description: "Probeer het opnieuw." });
    }
  };
  const handleTestSnelstart = async () => {
    if (!snelstart.enabled) {
      toast.error("Zet de koppeling eerst aan");
      return;
    }
    setSnelstartTesting(true);
    try {
      if (snelstart.fields.mockMode) {
        toast.success("Testmodus actief, boekingen worden gesimuleerd");
        return;
      }
      if (!snelstart.fields.clientKey || !snelstart.fields.subscriptionKey) {
        toast.error("Vul clientKey en subscriptionKey in");
        return;
      }
      const res = await fetch("https://auth.snelstart.nl/b2b/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "clientcredentials",
          client_id: snelstart.fields.clientKey,
          client_secret: snelstart.fields.subscriptionKey,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        toast.error(`Verbinding mislukt (${res.status})`, { description: text.slice(0, 160) });
        return;
      }
      toast.success("Verbinding met Snelstart OK");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error("Verbinding mislukt", { description: message });
    } finally {
      setSnelstartTesting(false);
    }
  };

  // -- Settings persistence hooks --
  const activeOperationSectionForLoading = useMemo(() => {
    const path = location.pathname;
    if (path.includes("/rooster-types")) return "rooster-types";
    if (path.includes("/prijslogica")) return "prijslogica";
    if (path.includes("/tarieven")) return "prijslogica";
    if (path.includes("/kosten")) return "prijslogica";
    if (path.includes("/sla")) return "sla";
    if (path.includes("/uitzonderingen")) return "uitzonderingen";
    return "stamgegevens";
  }, [location.pathname]);
  const shouldLoadNotifications = activeSettingsTab === "algemeen" || activeSettingsTab === "notificaties";
  const shouldLoadSms = activeSettingsTab === "algemeen" || activeSettingsTab === "sms";
  const shouldLoadSla =
    activeSettingsTab === "algemeen" ||
    (activeSettingsTab === "operationele-inrichting" && activeOperationSectionForLoading === "sla");
  const shouldLoadConnectors = activeSettingsTab === "algemeen" || activeSettingsTab === "integraties";
  const shouldLoadSmtp = activeSettingsTab === "notificaties";

  const { data: savedIntegrations } = useLoadSettings<typeof integrations>("integrations", {
    enabled: false,
  });
  const { data: savedNotifications } = useLoadSettings<typeof notifications>("notifications", {
    enabled: shouldLoadNotifications,
  });
  const { data: savedSms } = useSmsSettings({ enabled: shouldLoadSms });
  const { data: savedSla } = useLoadSettings("sla", { enabled: shouldLoadSla });

  const saveIntegrations = useSaveSettings("integrations");
  const saveNotifications = useSaveSettings("notifications");
  const saveSms = useSaveSmsSettings();
  const saveSla = useSaveSettings("sla");

  // Baseline-state voor dirty-detectie per tab. Wordt gezet na load-
  // succes en na save-succes, dan is de huidige state "schoon".
  const [notificationsBaseline, setNotificationsBaseline] = useState<string>("");
  const [smsBaseline, setSmsBaseline] = useState<string>("");
  const [integrationsBaseline, setIntegrationsBaseline] = useState<string>("");
  const [slaBaseline, setSlaBaseline] = useState<string>("");
  const connectorList = useConnectorList({ enabled: shouldLoadConnectors });
  const [slaSettings, setSlaSettings] = useState(DEFAULT_SLA_SETTINGS);

  // Load saved settings into state when fetched
  useEffect(() => {
    if (savedIntegrations && Object.keys(savedIntegrations).length > 0) {
      setIntegrations(prev => {
        const merged = { ...prev, ...savedIntegrations };
        setIntegrationsBaseline(JSON.stringify(merged));
        return JSON.stringify(prev) === JSON.stringify(merged) ? prev : merged;
      });
    } else if (savedIntegrations !== undefined) {
      setIntegrationsBaseline((prev) => prev || JSON.stringify(integrations));
    }
  }, [integrations, savedIntegrations]);

  useEffect(() => {
    if (savedNotifications && Object.keys(savedNotifications).length > 0) {
      setNotifications(prev => {
        const merged = { ...prev, ...savedNotifications };
        setNotificationsBaseline(JSON.stringify(merged));
        return JSON.stringify(prev) === JSON.stringify(merged) ? prev : merged;
      });
    } else if (savedNotifications !== undefined) {
      setNotificationsBaseline((prev) => prev || JSON.stringify(notifications));
    }
  }, [notifications, savedNotifications]);

  useEffect(() => {
    if (savedSms && Object.keys(savedSms).length > 0) {
      if (savedSms.smsProvider) setSmsProvider(savedSms.smsProvider);
      if (savedSms.twilioAccountSid) setTwilioAccountSid(savedSms.twilioAccountSid);
      setTwilioAuthToken(savedSms.twilioAuthToken ?? "");
      if (savedSms.twilioFromNumber) setTwilioFromNumber(savedSms.twilioFromNumber);
      setMessageBirdApiKey(savedSms.messageBirdApiKey ?? "");
      if (savedSms.messageBirdOriginator) setMessageBirdOriginator(savedSms.messageBirdOriginator);
      if (savedSms.smsEvents) {
        setSmsEvents(prev => {
          const merged = { ...prev, ...savedSms.smsEvents };
          return JSON.stringify(prev) === JSON.stringify(merged) ? prev : merged;
        });
      }
      if (savedSms.smsTemplate) setSmsTemplate(savedSms.smsTemplate);
      setSmsBaseline(JSON.stringify({
        smsProvider: savedSms.smsProvider ?? "twilio",
        twilioAccountSid: savedSms.twilioAccountSid ?? "",
        twilioAuthToken: "",
        twilioFromNumber: savedSms.twilioFromNumber ?? "",
        messageBirdApiKey: "",
        messageBirdOriginator: savedSms.messageBirdOriginator ?? "",
        smsEvents: { onderweg: true, afgeleverd: true, vertraging: false, ...(savedSms.smsEvents ?? {}) },
        smsTemplate: savedSms.smsTemplate ?? "",
      }));
    } else if (savedSms !== undefined) {
      setSmsBaseline((prev) => prev || JSON.stringify({
        smsProvider, twilioAccountSid, twilioAuthToken, twilioFromNumber,
        messageBirdApiKey, messageBirdOriginator, smsEvents, smsTemplate,
      }));
    }
  }, [
    messageBirdApiKey,
    messageBirdOriginator,
    savedSms,
    smsEvents,
    smsProvider,
    smsTemplate,
    twilioAccountSid,
    twilioAuthToken,
    twilioFromNumber,
  ]);

  useEffect(() => {
    if (savedSla !== undefined) {
      const merged = normalizeSlaSettings(savedSla as Record<string, unknown>);
      setSlaSettings(merged);
      setSlaBaseline(JSON.stringify(merged));
    }
  }, [savedSla]);

  const notificationsCurrent = JSON.stringify(notifications);
  const notificationsDirty = notificationsBaseline !== "" && notificationsCurrent !== notificationsBaseline;
  const revertNotifications = () => {
    if (!notificationsBaseline) return;
    try { setNotifications(JSON.parse(notificationsBaseline)); } catch { /* noop */ }
  };

  const integrationsCurrent = JSON.stringify(integrations);
  const integrationsDirty = integrationsBaseline !== "" && integrationsCurrent !== integrationsBaseline;
  const revertIntegrations = () => {
    if (!integrationsBaseline) return;
    try { setIntegrations(JSON.parse(integrationsBaseline)); } catch { /* noop */ }
  };

  const smsCurrent = JSON.stringify({
    smsProvider, twilioAccountSid, twilioAuthToken, twilioFromNumber,
    messageBirdApiKey, messageBirdOriginator, smsEvents, smsTemplate,
  });
  const smsDirty = smsBaseline !== "" && smsCurrent !== smsBaseline;
  const revertSms = () => {
    if (!smsBaseline) return;
    try {
      const b = JSON.parse(smsBaseline);
      setSmsProvider(b.smsProvider ?? "twilio");
      setTwilioAccountSid(b.twilioAccountSid ?? "");
      setTwilioAuthToken(b.twilioAuthToken ?? "");
      setTwilioFromNumber(b.twilioFromNumber ?? "");
      setMessageBirdApiKey(b.messageBirdApiKey ?? "");
      setMessageBirdOriginator(b.messageBirdOriginator ?? "");
      setSmsEvents(b.smsEvents ?? { onderweg: true, afgeleverd: true, vertraging: false });
      setSmsTemplate(b.smsTemplate ?? "");
    } catch { /* noop */ }
  };

  const handleSaveIntegrations = async () => {
    try {
      await saveIntegrations.mutateAsync(integrations as any);
      setIntegrationsBaseline(JSON.stringify(integrations));
      toast.success("Integratie-instellingen opgeslagen");
    } catch {
      toast.error("Fout bij opslaan", { description: "Probeer het opnieuw." });
    }
  };

  const handleSaveNotifications = async () => {
    try {
      await saveNotifications.mutateAsync(notifications as any);
      setNotificationsBaseline(JSON.stringify(notifications));
      toast.success("Notificatie-instellingen opgeslagen");
    } catch {
      toast.error("Fout bij opslaan", { description: "Probeer het opnieuw." });
    }
  };

  const handleSaveSms = async () => {
    try {
      const payload = {
        smsProvider, twilioAccountSid, twilioAuthToken, twilioFromNumber,
        messageBirdApiKey, messageBirdOriginator, smsEvents, smsTemplate,
      };
      await saveSms.mutateAsync(payload as any);
      setTwilioAuthToken("");
      setMessageBirdApiKey("");
      setSmsBaseline(JSON.stringify({
        ...payload,
        twilioAuthToken: "",
        messageBirdApiKey: "",
      }));
      toast.success("SMS instellingen opgeslagen");
    } catch {
      toast.error("Fout bij opslaan", { description: "Probeer het opnieuw." });
    }
  };

  const toggleIntegration = (key: keyof typeof integrations) => {
    setIntegrations((prev) => ({
      ...prev,
      [key]: { ...prev[key], enabled: !prev[key].enabled },
    }));
  };

  const updateIntegration = (key: keyof typeof integrations, field: string, value: string) => {
    setIntegrations((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  };

  // Determine active tab based on URL
  const getActiveTab = () => {
    if (location.pathname.includes("/operationele-inrichting")) return "operationele-inrichting";
    if (location.pathname.includes("/stamgegevens")) return "operationele-inrichting";
    if (location.pathname.includes("/rooster-types")) return "operationele-inrichting";
    if (location.pathname.includes("/sla")) return "operationele-inrichting";
    if (location.pathname.includes("/uitzonderingen")) return "operationele-inrichting";
    if (location.pathname.includes("/prijslogica")) return "operationele-inrichting";
    if (location.pathname.includes("/tarieven")) return "operationele-inrichting";
    if (location.pathname.includes("/kosten")) return "operationele-inrichting";
    if (location.pathname.includes("/branding")) return "branding";
    if (location.pathname.includes("/notificaties")) return "notificaties";
    if (location.pathname.includes("/sms")) return "sms";
    if (location.pathname.includes("/eta-meldingen")) return "eta-meldingen";
    if (location.pathname.includes("/integraties")) return "integraties";
    if (location.pathname.includes("/inboxen")) return "inboxen";
    if (location.pathname.includes("/webhooks")) return "webhooks";
    if (location.pathname.includes("/api-tokens")) return "api-tokens";
    return "algemeen";
  };

  const handleTabChange = (value: string) => {
    const item = NAV_GROUPS.flatMap((group) => group.items).find((navItem) => navItem.value === value);
    const target = item?.target ?? value;
    if (target === "algemeen") navigate("/settings");
    else navigate(`/settings/${target}`);
  };

  const getActiveOperationSection = () => {
    if (location.pathname.includes("/rooster-types")) return "rooster-types";
    if (location.pathname.includes("/prijslogica")) return "prijslogica";
    if (location.pathname.includes("/tarieven")) return "prijslogica";
    if (location.pathname.includes("/kosten")) return "prijslogica";
    if (location.pathname.includes("/sla")) return "sla";
    if (location.pathname.includes("/uitzonderingen")) return "uitzonderingen";
    return "stamgegevens";
  };

  const activeOperationSection = getActiveOperationSection();
  const activeOperationCopy = OPERATION_SECTION_COPY[activeOperationSection] ?? OPERATION_SECTION_COPY.stamgegevens;
  const handleOperationSectionChange = (value: string) => {
    navigate(`/settings/${value}`);
  };

  const getActiveCommunicationSection = () => {
    if (location.pathname.includes("/sms")) return "sms";
    if (location.pathname.includes("/eta-meldingen")) return "eta-meldingen";
    if (location.pathname.includes("/inboxen")) return "inboxen";
    return "notificaties";
  };

  const activeCommunicationSection = getActiveCommunicationSection();
  const activeCommunicationCopy =
    COMMUNICATION_SECTION_COPY[activeCommunicationSection] ?? COMMUNICATION_SECTION_COPY.notificaties;
  const handleCommunicationSectionChange = (value: string) => {
    navigate(`/settings/${value}`);
  };

  const getActiveConnectionSection = () => {
    if (location.pathname.includes("/webhooks")) return "webhooks";
    if (location.pathname.includes("/api-tokens")) return "api-tokens";
    return "integraties";
  };

  const activeConnectionSection = getActiveConnectionSection();
  const activeConnectionCopy = CONNECTION_SECTION_COPY[activeConnectionSection] ?? CONNECTION_SECTION_COPY.integraties;
  const handleConnectionSectionChange = (value: string) => {
    navigate(`/settings/${value}`);
  };

  const slaCurrent = JSON.stringify(slaSettings);
  const slaDirty = slaBaseline !== "" && slaCurrent !== slaBaseline;
  const revertSla = () => {
    if (!slaBaseline) return;
    try {
      setSlaSettings(JSON.parse(slaBaseline));
    } catch {
      /* noop */
    }
  };

  const handleSaveSla = async () => {
    try {
      await saveSla.mutateAsync(slaSettings as unknown as Record<string, unknown>);
      setSlaBaseline(JSON.stringify(slaSettings));
      toast.success("SLA-instellingen opgeslagen");
    } catch {
      toast.error("Fout bij opslaan", { description: "Probeer het opnieuw." });
    }
  };

  interface SmtpFields {
    host: string;
    port: string;
    username: string;
    password: string;
    fromEmail: string;
    fromName: string;
  }
  const EMPTY_SMTP = useMemo<SmtpFields>(() => ({
    host: "",
    port: "587",
    username: "",
    password: "",
    fromEmail: "",
    fromName: "",
  }), []);
  const [smtpSettings, setSmtpSettings] = useState<{ enabled: boolean; fields: SmtpFields }>(
    { enabled: false, fields: { ...EMPTY_SMTP } },
  );
  const { data: smtpSaved } = useIntegrationCredentials<SmtpFields>("smtp", {
    enabled: shouldLoadSmtp,
  });
  const saveSmtp = useSaveIntegrationCredentials<SmtpFields>("smtp");
  useEffect(() => {
    if (smtpSaved === undefined) return;
    setSmtpSettings({
      enabled: smtpSaved.enabled,
      fields: { ...EMPTY_SMTP, ...smtpSaved.credentials, password: "" },
    });
  }, [EMPTY_SMTP, smtpSaved]);
  const updateSmtpField = (field: keyof SmtpFields, value: string) => {
    setSmtpSettings((prev) => ({ ...prev, fields: { ...prev.fields, [field]: value } }));
  };
  const handleSaveSmtp = async () => {
    try {
      await saveSmtp.mutateAsync({
        enabled: smtpSettings.enabled,
        credentials: smtpSettings.fields,
      });
      setSmtpSettings((prev) => ({ ...prev, fields: { ...prev.fields, password: "" } }));
      toast.success("SMTP-config opgeslagen");
    } catch (error) {
      toast.error("SMTP-config opslaan mislukt", {
        description: error instanceof Error ? error.message : "Probeer het opnieuw.",
      });
    }
  };

  const activeTab = activeSettingsTab;
  const connectorSummary = useMemo(() => {
    const items = connectorList.data ?? [];
    return {
      total: items.length,
      active: items.filter((item) => item.enabled).length,
      connected: items.filter((item) => item.enabled && item.hasCredentials).length,
      incomplete: items.filter((item) => item.enabled && !item.hasCredentials).length,
    };
  }, [connectorList.data]);

  const smsConfigured = useMemo(() => {
    if (smsProvider === "twilio") {
      return Boolean(
        twilioAccountSid &&
        twilioFromNumber &&
        (twilioAuthToken || savedSms?.hasTwilioAuthToken),
      );
    }

    return Boolean(
      messageBirdOriginator &&
      (messageBirdApiKey || savedSms?.hasMessageBirdApiKey),
    );
  }, [
    messageBirdApiKey,
    messageBirdOriginator,
    savedSms?.hasMessageBirdApiKey,
    savedSms?.hasTwilioAuthToken,
    smsProvider,
    twilioAccountSid,
    twilioAuthToken,
    twilioFromNumber,
  ]);

  const attentionItems = useMemo(() => {
    const items: Array<{ title: string; description: string; target: string }> = [];

    if (!logoPreview) {
      items.push({
        title: "Branding nog niet compleet",
        description: "Voeg een logo toe zodat login, portal en documenten consistenter ogen.",
        target: "branding",
      });
    }

    if (!smsConfigured) {
      items.push({
        title: "SMS-configuratie onvolledig",
        description: "Klantmeldingen kunnen nog niet volledig betrouwbaar worden verstuurd.",
        target: "sms",
      });
    }

    if (connectorSummary.connected === 0) {
      items.push({
        title: "Nog geen actieve koppelingen",
        description: "Er is nog geen externe integratie volledig verbonden met de omgeving.",
        target: "integraties",
      });
    } else if (connectorSummary.incomplete > 0) {
      items.push({
        title: "Integraties vragen aandacht",
        description: `${connectorSummary.incomplete} koppeling${connectorSummary.incomplete === 1 ? "" : "en"} mist nog volledige configuratie.`,
        target: "integraties",
      });
    }

    if (Object.values(notifications).every((value) => value === false)) {
      items.push({
        title: "Geen notificaties actief",
        description: "Belangrijke operationele meldingen staan volledig uitgeschakeld.",
        target: "notificaties",
      });
    }

    return items.slice(0, 4);
  }, [connectorSummary.connected, connectorSummary.incomplete, logoPreview, notifications, smsConfigured]);

  const nextSteps = useMemo(() => {
    const steps: Array<{ title: string; description: string; target: string }> = [];

    if (!logoPreview) {
      steps.push({
        title: "Werk de branding af",
        description: "Upload een logo en controleer de primaire kleur.",
        target: "branding",
      });
    }
    if (!smsConfigured) {
      steps.push({
        title: "Rond klantmeldingen af",
        description: "Maak de SMS-provider compleet voor onderweg- en afleverberichten.",
        target: "sms",
      });
    }
    if (connectorSummary.connected === 0) {
      steps.push({
        title: "Verbind je eerste integratie",
        description: "Start met boekhouding of Nostradamus om operationele data te synchroniseren.",
        target: "integraties",
      });
    }
    if (steps.length === 0) {
      steps.push({
        title: "Controleer ETA en inboxen",
        description: "Loop communicatiekanalen na zodat planners en klanten dezelfde flow volgen.",
        target: "eta-meldingen",
      });
      steps.push({
        title: "Loop beheerrechten langs",
        description: "Controleer gebruikers en toegangsniveaus voor admins en planners.",
        target: "algemeen",
      });
    }

    return steps.slice(0, 3);
  }, [connectorSummary.connected, logoPreview, smsConfigured]);

  const overviewCards = [
    {
      title: "Bedrijf",
      description: "Merk, taal en team op een vaste plek.",
      icon: Palette,
      target: "branding",
      items: [
        { label: "Branding en kleuren", status: logoPreview ? "Klaar" : "Aanvullen" },
        { label: "Taal van de omgeving", status: LANGUAGE_OPTIONS.find((opt) => opt.value === currentLang)?.label ?? "Nederlands" },
        { label: "Gebruikersbeheer", status: "Beheren", subtle: true },
      ],
    },
    {
      title: "Operatie",
      description: "Masterdata, roosters en prijslogica in balans.",
      icon: Truck,
      target: "operationele-inrichting",
      items: [
        { label: "Stamgegevens", status: "Actief" },
        { label: "Tarieven en kosten", status: "Beheren" },
        { label: "SLA", status: slaSettings.enabled ? "Actief" : "Uit" },
        { label: "Roosters en uitzonderingen", status: "Regels", subtle: true },
      ],
    },
    {
      title: "Communicatie",
      description: "Updates, ETA's en berichtenverkeer beheren.",
      icon: Smartphone,
      target: "sms",
      items: [
        { label: "SMS", status: smsConfigured ? "Klaar" : "Niet compleet" },
        { label: "Notificaties", status: `${Object.values(notifications).filter(Boolean).length} actief` },
        { label: "Inboxen en ETA", status: "Controleren", subtle: true },
      ],
    },
    {
      title: "Platform & integraties",
      description: "Connectoren en toegang in een rustig technisch cluster.",
      icon: Database,
      target: "integraties",
      items: [
        { label: "Connectoren", status: `${connectorSummary.connected} verbonden` },
        { label: "Webhooks", status: "Beschikbaar", subtle: true },
        { label: "API-tokens", status: "Beheer", subtle: true },
      ],
    },
  ] as const;

  return (
    <div className="flex flex-col gap-6 h-full pb-12">
      <PageHeader
        eyebrow="Beheer"
        title={t('pages.settings.title')}
        subtitle={t('pages.settings.subtitle')}
      />

      <SettingsCommandPalette />

      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:gap-6"
      >
        {/* Verborgen TabsList is nodig zodat Radix de controlled value + TabsContent correct orchestreert. */}
        <TabsList className="sr-only" aria-hidden="true">
          {TAB_TRIGGER_ITEMS.map((item) => (
            <TabsTrigger key={item.value} value={item.value}>{item.label}</TabsTrigger>
          ))}
        </TabsList>

        {/* Sidebar-navigatie */}
        <aside className="w-full shrink-0 lg:w-[270px] lg:overflow-y-auto">
          <nav className="overflow-hidden rounded-xl border border-[hsl(var(--gold)/0.16)] bg-[linear-gradient(180deg,hsl(var(--card)),hsl(var(--gold-soft)/0.16))] shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
            {NAV_GROUPS.map((group) => (
              <div key={group.title} className="border-b border-[hsl(var(--gold)/0.10)] p-3.5 last:border-b-0">
                <p className="mb-2.5 px-1 text-[10px] font-display font-semibold uppercase tracking-[0.24em] text-[hsl(var(--gold-deep)/0.72)]">
                  {group.title}
                </p>
                <div className="space-y-1.5">
                  {group.items.map((item) => {
                    const active = activeTab === item.value || item.aliases?.includes(activeTab);
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => handleTabChange(item.value)}
                        className={cn(
                          "group relative w-full rounded-lg px-3 py-2.5 text-left ring-1 transition-all",
                          active
                            ? "bg-[linear-gradient(135deg,hsl(var(--gold-soft)/0.82),hsl(var(--card)))] text-[hsl(var(--gold-deep))] ring-[hsl(var(--gold)/0.28)] shadow-sm"
                            : "bg-transparent text-muted-foreground ring-transparent hover:bg-[hsl(var(--gold-soft)/0.30)] hover:text-foreground"
                        )}
                      >
                        {active && (
                          <span className="absolute left-0 top-2.5 bottom-2.5 w-0.5 rounded-full bg-[hsl(var(--gold-deep))]" aria-hidden="true" />
                        )}
                        <span className="flex items-center gap-3">
                          {Icon && (
                            <span
                              className={cn(
                                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-1 transition-colors",
                                active
                                  ? "bg-card text-[hsl(var(--gold-deep))] ring-[hsl(var(--gold)/0.22)]"
                                  : "bg-background/80 text-muted-foreground ring-border/40 group-hover:bg-card group-hover:text-[hsl(var(--gold-deep))]",
                              )}
                            >
                              <Icon className="h-4 w-4" strokeWidth={1.7} />
                            </span>
                          )}
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold leading-5">{item.label}</span>
                            {item.description && (
                              <span className="mt-0.5 block truncate text-[11px] font-normal leading-4 text-muted-foreground">
                                {item.description}
                              </span>
                            )}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        {/* Content-area */}
        <div className="flex-1 min-w-0 pb-6">

        <TabsContent value="algemeen" className="space-y-6 outline-none">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-6">
              <div className="card--luxe p-4 md:p-5">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-[hsl(var(--gold)/0.1)] bg-[hsl(var(--gold-soft)/0.08)] px-4 py-3">
                    <p className="text-[10px] font-display font-semibold uppercase tracking-[0.16em] text-[hsl(var(--gold-deep))]">
                      Omgeving
                    </p>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {companyName.trim() || "Bedrijfsnaam instellen"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[hsl(var(--gold)/0.1)] bg-[hsl(var(--gold-soft)/0.08)] px-4 py-3">
                    <p className="text-[10px] font-display font-semibold uppercase tracking-[0.16em] text-[hsl(var(--gold-deep))]">
                      Taal
                    </p>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {LANGUAGE_OPTIONS.find((opt) => opt.value === currentLang)?.label ?? "Nederlands"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[hsl(var(--gold)/0.1)] bg-[hsl(var(--gold-soft)/0.08)] px-4 py-3">
                    <p className="text-[10px] font-display font-semibold uppercase tracking-[0.16em] text-[hsl(var(--gold-deep))]">
                      Status
                    </p>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {attentionItems.length === 0 ? "Rustig en compleet" : `${attentionItems.length} punt${attentionItems.length === 1 ? "" : "en"} open`}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <SettingsStatusCard
                  title="Integraties actief"
                  value={String(connectorSummary.connected)}
                  note={`${connectorSummary.total} beschikbaar in de omgeving`}
                  statusLabel={connectorSummary.connected > 0 ? "Verbonden" : "Nog leeg"}
                  tone={connectorSummary.connected > 0 ? "default" : "warning"}
                  icon={ShieldCheck}
                />
                <SettingsStatusCard
                  title="Communicatie gereed"
                  value={smsConfigured ? "Ja" : "Actie"}
                  note={`${Object.values(notifications).filter(Boolean).length} meldingen actief`}
                  statusLabel={smsConfigured ? "Klaar" : "Aandacht"}
                  tone={smsConfigured ? "default" : "warning"}
                  icon={Bell}
                />
                <SettingsStatusCard
                  title="Open aandachtspunten"
                  value={String(attentionItems.length)}
                  note={attentionItems.length === 0 ? "Omgeving oogt rustig" : "Vraagt nog afronding"}
                  statusLabel={attentionItems.length === 0 ? "Stabiel" : "Controleren"}
                  tone={attentionItems.length === 0 ? "default" : "warning"}
                  icon={AlertTriangle}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {overviewCards.map((card) => (
                  <SettingsOverviewCard
                    key={card.title}
                    title={card.title}
                    description={card.description}
                    icon={card.icon}
                    onClick={() => handleTabChange(card.target)}
                    items={card.items}
                  />
                ))}
              </div>

              <div className="card--luxe p-5 md:p-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div className="max-w-sm">
                    <p className="text-[11px] font-display font-semibold text-[hsl(var(--gold-deep))] uppercase tracking-[0.16em]">
                      {t('settings.language')}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                      Houd de taalinstelling centraal, zodat labels en flows overal gelijk blijven.
                    </p>
                  </div>
                  <div className="w-full max-w-xs">
                    <Select value={currentLang} onValueChange={handleLanguageChange}>
                      <SelectTrigger className="h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LANGUAGE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-5">
              <div className="card--luxe p-5 md:p-6 space-y-5">
                <div>
                  <p className="text-[11px] font-display font-semibold text-[hsl(var(--gold-deep))] uppercase tracking-[0.16em]">
                    Aandacht nodig
                  </p>
                  <p className="mt-1 max-w-[26ch] text-xs leading-relaxed text-muted-foreground">
                    Alleen wat de omgeving nu echt tegenhoudt of onaf laat voelen.
                  </p>
                </div>
                {attentionItems.length === 0 ? (
                  <div className="rounded-2xl border border-[hsl(var(--gold)/0.12)] bg-[linear-gradient(180deg,hsl(var(--gold-soft)/0.14),hsl(var(--gold-soft)/0.08))] px-4 py-4">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--gold-soft)/0.7)] text-[hsl(var(--gold-deep))]">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </span>
                      <div>
                        <div className="text-sm font-medium text-foreground">Geen directe aandachtspunten</div>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            De basis oogt compleet. Gebruik de aanbevelingen hieronder alleen voor verdere verfijning.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                    <div className="space-y-3">
                      {attentionItems.map((item) => (
                        <button
                        key={item.title}
                        type="button"
                        onClick={() => handleTabChange(item.target)}
                          className="w-full rounded-2xl border border-[hsl(var(--gold)/0.08)] bg-[linear-gradient(180deg,hsl(var(--gold-soft)/0.11),hsl(var(--gold-soft)/0.06))] px-4 py-3.5 text-left transition-colors hover:bg-[hsl(var(--gold-soft)/0.16)]"
                      >
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--gold-soft)/0.65)] text-[hsl(var(--gold-deep))]">
                            <AlertTriangle className="h-3.5 w-3.5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-foreground">{item.title}</div>
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
                          </div>
                          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--gold)/0.45)]" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="card--luxe p-5 md:p-6 space-y-5">
                <div>
                  <p className="text-[11px] font-display font-semibold text-[hsl(var(--gold-deep))] uppercase tracking-[0.16em]">
                    Volgende stappen
                  </p>
                  <p className="mt-1 max-w-[26ch] text-xs leading-relaxed text-muted-foreground">
                    Kleine stappen om de omgeving nog netter en consistenter te maken.
                  </p>
                </div>
                  <div className="space-y-3">
                    {nextSteps.map((step, index) => (
                    <button
                      key={step.title}
                      type="button"
                      onClick={() => handleTabChange(step.target)}
                      className="w-full rounded-2xl border border-[hsl(var(--gold)/0.07)] bg-[linear-gradient(180deg,hsl(var(--gold-soft)/0.09),hsl(var(--gold-soft)/0.05))] px-4 py-3.5 text-left transition-colors hover:bg-[hsl(var(--gold-soft)/0.12)]"
                    >
                      <div className="flex items-start gap-3">
                        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--gold)/0.18)] text-[11px] font-semibold text-[hsl(var(--gold-deep))]">
                          {index + 1}
                        </span>
                        <div className="flex-1">
                          <div className="text-sm font-medium text-foreground">{step.title}</div>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{step.description}</p>
                        </div>
                        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--gold)/0.4)]" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="operationele-inrichting" className="outline-none space-y-6">
          <GroupedSettingsHeader
            eyebrow="Operationele inrichting"
            title={activeOperationCopy.title}
            description={activeOperationCopy.description}
            items={OPERATIONS_NAV_ITEMS}
            activeValue={activeOperationSection}
            onChange={handleOperationSectionChange}
          />

          {activeOperationSection === "stamgegevens" && (
            <div className="space-y-8">
              <DeferredMount label="Stamgegevens laden">
                <MasterDataSection />
                <VehicleDocumentTypesSection />
              </DeferredMount>
            </div>
          )}

          {activeOperationSection === "rooster-types" && (
            <DeferredMount label="Rooster-types laden">
              <ShiftTemplateSettings />
            </DeferredMount>
          )}

          {activeOperationSection === "sla" && (
            <div className="card--luxe p-6 space-y-6">
              <div>
                <p className="text-[11px] font-display font-semibold uppercase tracking-[0.16em] text-[hsl(var(--gold-deep))]">
                  SLA
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Bepaal wanneer een order als SLA-risico telt en wanneer waarschuwingen moeten verschijnen.
                </p>
              </div>

              <div className="rounded-2xl border border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--gold-soft)/0.08)] p-4 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">SLA-bewaking actief</Label>
                    <p className="text-xs text-muted-foreground">
                      Gebruik tenant-eigen deadlines in notificaties en uitzonderingen.
                    </p>
                  </div>
                  <Switch
                    checked={slaSettings.enabled}
                    onCheckedChange={(value) => setSlaSettings((prev) => ({ ...prev, enabled: value }))}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="sla-deadline-hours">SLA deadline in uren</Label>
                    <Input
                      id="sla-deadline-hours"
                      type="number"
                      min={1}
                      step={1}
                      value={slaSettings.deadlineHours}
                      onChange={(e) => setSlaSettings((prev) => ({ ...prev, deadlineHours: Number(e.target.value || 1) }))}
                    />
                    <p className="text-xs text-muted-foreground">
                      Na dit aantal uur in `DRAFT` wordt een order als SLA-risico gezien.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="sla-warning-minutes">Waarschuwing in minuten</Label>
                    <Input
                      id="sla-warning-minutes"
                      type="number"
                      min={5}
                      step={5}
                      value={slaSettings.warningMinutes}
                      onChange={(e) => setSlaSettings((prev) => ({ ...prev, warningMinutes: Number(e.target.value || 5) }))}
                    />
                    <p className="text-xs text-muted-foreground">
                      Binnen dit venster verschijnt een SLA-waarschuwing voordat de deadline verloopt.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-[hsl(var(--gold)/0.1)] bg-[hsl(var(--gold-soft)/0.08)] px-4 py-3">
                  <p className="text-[10px] font-display font-semibold uppercase tracking-[0.16em] text-[hsl(var(--gold-deep))]">
                    Deadline
                  </p>
                  <p className="mt-2 text-lg font-semibold text-foreground">{slaSettings.deadlineHours} uur</p>
                </div>
                <div className="rounded-2xl border border-[hsl(var(--gold)/0.1)] bg-[hsl(var(--gold-soft)/0.08)] px-4 py-3">
                  <p className="text-[10px] font-display font-semibold uppercase tracking-[0.16em] text-[hsl(var(--gold-deep))]">
                    Waarschuwing
                  </p>
                  <p className="mt-2 text-lg font-semibold text-foreground">{slaSettings.warningMinutes} min</p>
                </div>
                <div className="rounded-2xl border border-[hsl(var(--gold)/0.1)] bg-[hsl(var(--gold-soft)/0.08)] px-4 py-3">
                  <p className="text-[10px] font-display font-semibold uppercase tracking-[0.16em] text-[hsl(var(--gold-deep))]">
                    Status
                  </p>
                  <p className="mt-2 text-lg font-semibold text-foreground">{slaSettings.enabled ? "Actief" : "Uit"}</p>
                </div>
              </div>
            </div>
          )}

          {activeOperationSection === "uitzonderingen" && (
            <DeferredMount label="Uitzonderingen laden">
              <ExceptionRulesSettings />
            </DeferredMount>
          )}

          {activeOperationSection === "prijslogica" && (
            <div className="space-y-6">
              <DeferredMount label="Prijslogica laden">
                <PricingPreview />
                <RateCardSettings />
                <SurchargeSettings />
                <FuelPriceSettings />
                <CostTypeSettings />
              </DeferredMount>
            </div>
          )}
        </TabsContent>

        <TabsContent value="branding" className="outline-none">
          <div className="card--luxe p-6 space-y-6">
            <div>
              <p className="text-[11px] font-display font-semibold text-[hsl(var(--gold-deep))] uppercase tracking-[0.16em]">
                Tenant branding
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Beheer huisstijl, logo en factuurdocumenten per tenant.
              </p>
            </div>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Bedrijfsnaam</Label>
                  <Input
                    id="companyName"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Bedrijfsnaam"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="primaryColor">Primaire kleur</Label>
                  <div className="flex items-center gap-3">
                    <Input
                      id="primaryColor"
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="w-16 h-10 p-1 cursor-pointer"
                    />
                    <Input
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="max-w-[140px] font-mono text-sm"
                      placeholder="#000000"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-[hsl(var(--gold)/0.14)] bg-[hsl(var(--gold-soft)/0.18)] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))]">
                      Preview
                    </p>
                    <p className="mt-1 text-sm font-medium text-foreground">{companyName || "Bedrijfsnaam"}</p>
                  </div>
                  <div
                    className="h-9 w-9 rounded-full border border-[hsl(var(--gold)/0.22)]"
                    style={{ backgroundColor: primaryColor }}
                    aria-hidden="true"
                  />
                </div>
                <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-[hsl(var(--gold)/0.26)] bg-card">
                  {logoPreview ? (
                    <img src={logoPreview} alt="Logo preview" className="max-h-20 max-w-[180px] object-contain" />
                  ) : (
                    <Palette className="h-5 w-5 text-[hsl(var(--gold-deep))]" strokeWidth={1.5} />
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-2 rounded-xl border border-[hsl(var(--gold)/0.14)] bg-card p-4">
                <Label>Logo upload</Label>
                <div className="flex items-center gap-4">
                  <div
                    className="h-20 w-20 rounded-xl border-2 border-dashed border-[hsl(var(--gold)/0.3)] flex items-center justify-center overflow-hidden bg-[hsl(var(--gold-soft)/0.25)] cursor-pointer hover:border-[hsl(var(--gold-deep))] transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {logoPreview ? (
                      <img src={logoPreview} alt="Logo preview" className="h-full w-full object-contain" />
                    ) : (
                      <Upload className="h-5 w-5 text-[hsl(var(--gold-deep))]" strokeWidth={1.5} />
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="btn-luxe !h-9"
                    >
                      <Upload className="h-3.5 w-3.5" strokeWidth={1.5} />
                      Bestand kiezen
                    </button>
                    <p className="text-xs text-muted-foreground">PNG, JPG of SVG. Max 2MB.</p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml"
                    className="hidden"
                    onChange={handleLogoChange}
                  />
                </div>
              </div>

              <div className="space-y-3 rounded-xl border border-[hsl(var(--gold)/0.14)] bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Label>Factuursjabloon</Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      PDF-template voor facturen van deze tenant.
                    </p>
                  </div>
                  <span className="rounded-full border border-[hsl(var(--gold)/0.18)] bg-[hsl(var(--gold-soft)/0.32)] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--gold-deep))]">
                    PDF
                  </span>
                </div>

                <div className="flex items-center gap-3 rounded-lg border border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--gold-soft)/0.14)] p-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[hsl(var(--gold)/0.18)] bg-card">
                    <FileText className="h-4 w-4 text-[hsl(var(--gold-deep))]" strokeWidth={1.7} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {invoiceTemplateName || "Nog geen sjabloon gekoppeld"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {pendingInvoiceTemplateFile
                        ? "Nieuw bestand klaar om op te slaan"
                        : invoiceTemplateUrl
                          ? "Actief factuursjabloon"
                          : "Upload bijvoorbeeld het RCS factuursjabloon"}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => invoiceTemplateInputRef.current?.click()}
                    className="btn-luxe !h-9"
                  >
                    <Upload className="h-3.5 w-3.5" strokeWidth={1.5} />
                    PDF kiezen
                  </button>
                  {invoiceTemplateUrl && !pendingInvoiceTemplateFile && (
                    <a
                      href={invoiceTemplateUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-luxe !h-9"
                    >
                      Bekijken
                    </a>
                  )}
                  {(invoiceTemplateName || pendingInvoiceTemplateFile) && (
                    <button
                      type="button"
                      onClick={handleClearInvoiceTemplate}
                      className="btn-luxe !h-9"
                    >
                      Verwijderen
                    </button>
                  )}
                </div>
                <input
                  ref={invoiceTemplateInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={handleInvoiceTemplateChange}
                />
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-4 rounded-xl border border-[hsl(var(--gold)/0.14)] bg-card p-4">
                <div>
                  <Label>Logo varianten</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Gebruik aparte assets voor donkere navigatie en browser/app-iconen.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-[hsl(var(--gold)/0.12)] bg-[#101010] p-3">
                    <p className="mb-2 text-[10px] uppercase tracking-[0.16em] text-white/55">Donkere navigatie</p>
                    <button
                      type="button"
                      onClick={() => darkLogoInputRef.current?.click()}
                      className="flex h-20 w-full items-center justify-center rounded-lg border border-dashed border-white/20 bg-white/5"
                    >
                      {darkLogoPreview || logoPreview ? (
                        <img src={darkLogoPreview || logoPreview || ""} alt="Donker logo preview" className="max-h-14 max-w-[160px] object-contain" />
                      ) : (
                        <Upload className="h-5 w-5 text-white/70" strokeWidth={1.5} />
                      )}
                    </button>
                    <button type="button" onClick={() => darkLogoInputRef.current?.click()} className="btn-luxe mt-3 !h-8 w-full">
                      Donker logo kiezen
                    </button>
                    <input
                      ref={darkLogoInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml"
                      className="hidden"
                      onChange={(e) => handleBrandAssetChange(e, {
                        label: "Donker logo",
                        setFile: setPendingDarkLogoFile,
                        setPreview: setDarkLogoPreview,
                      })}
                    />
                  </div>

                  <div className="rounded-lg border border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--gold-soft)/0.14)] p-3">
                    <p className="mb-2 text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--gold-deep))]">App-icon</p>
                    <button
                      type="button"
                      onClick={() => appIconInputRef.current?.click()}
                      className="flex h-20 w-full items-center justify-center rounded-lg border border-dashed border-[hsl(var(--gold)/0.24)] bg-card"
                    >
                      {appIconPreview || logoPreview ? (
                        <img src={appIconPreview || logoPreview || ""} alt="App icon preview" className="h-14 w-14 rounded-xl object-contain" />
                      ) : (
                        <Upload className="h-5 w-5 text-[hsl(var(--gold-deep))]" strokeWidth={1.5} />
                      )}
                    </button>
                    <button type="button" onClick={() => appIconInputRef.current?.click()} className="btn-luxe mt-3 !h-8 w-full">
                      Icon kiezen
                    </button>
                    <input
                      ref={appIconInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml"
                      className="hidden"
                      onChange={(e) => handleBrandAssetChange(e, {
                        label: "App-icon",
                        setFile: setPendingAppIconFile,
                        setPreview: setAppIconPreview,
                      })}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4 rounded-xl border border-[hsl(var(--gold)/0.14)] bg-card p-4">
                <div>
                  <Label>Portal branding</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Tekst die klanten zien in het klantportaal en op publieke schermen.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="portalTitle">Portaal titel</Label>
                  <Input
                    id="portalTitle"
                    value={brandingSettings.portalTitle ?? ""}
                    onChange={(e) => updateBrandingSetting("portalTitle", e.target.value)}
                    placeholder="Welkom bij je transportportaal"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="portalSubtitle">Portaal subtitel</Label>
                  <Textarea
                    id="portalSubtitle"
                    value={brandingSettings.portalSubtitle ?? ""}
                    onChange={(e) => updateBrandingSetting("portalSubtitle", e.target.value)}
                    rows={3}
                    placeholder="Volg orders, documenten en updates op een centrale plek."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="portalCtaLabel">Primaire knoptekst</Label>
                  <Input
                    id="portalCtaLabel"
                    value={brandingSettings.portalCtaLabel ?? ""}
                    onChange={(e) => updateBrandingSetting("portalCtaLabel", e.target.value)}
                    placeholder="Open portaal"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-[hsl(var(--gold)/0.14)] bg-card p-4">
              <div className="mb-4">
                <Label>Document branding</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Bedrijfsgegevens voor facturen, labels, pakbonnen en PDF-exports.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="documentEmail">Document e-mail</Label>
                  <Input
                    id="documentEmail"
                    type="email"
                    value={brandingSettings.documentEmail ?? ""}
                    onChange={(e) => updateBrandingSetting("documentEmail", e.target.value)}
                    placeholder="finance@example.nl"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="documentKvk">KvK</Label>
                  <Input
                    id="documentKvk"
                    value={brandingSettings.documentKvk ?? ""}
                    onChange={(e) => updateBrandingSetting("documentKvk", e.target.value)}
                    placeholder="12345678"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="documentVat">BTW-nummer</Label>
                  <Input
                    id="documentVat"
                    value={brandingSettings.documentVat ?? ""}
                    onChange={(e) => updateBrandingSetting("documentVat", e.target.value)}
                    placeholder="NL123456789B01"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="documentAddress">Adresregel</Label>
                  <Input
                    id="documentAddress"
                    value={brandingSettings.documentAddress ?? ""}
                    onChange={(e) => updateBrandingSetting("documentAddress", e.target.value)}
                    placeholder="Straat 1, 1111 AA Plaats"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="documentFooter">Document footer</Label>
                  <Textarea
                    id="documentFooter"
                    value={brandingSettings.documentFooter ?? ""}
                    onChange={(e) => updateBrandingSetting("documentFooter", e.target.value)}
                    rows={2}
                    placeholder="Bedankt voor uw vertrouwen. Op alle diensten zijn onze voorwaarden van toepassing."
                  />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--gold-soft)/0.14)] p-4">
              <div className="flex items-start gap-3">
                <FileText className="mt-0.5 h-4 w-4 text-[hsl(var(--gold-deep))]" strokeWidth={1.7} />
                <div>
                  <p className="text-sm font-medium text-foreground">Tenant-specifieke documenten</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Dit sjabloon wordt op tenantniveau opgeslagen, zodat Royalty Cargo Solutions, een andere klant
                    of een latere vestiging elk een eigen factuurtemplate kan gebruiken.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-[hsl(var(--gold)/0.12)]">
              <button
                type="button"
                onClick={handleSaveBranding}
                disabled={updateBranding.isPending}
                className="btn-luxe btn-luxe--primary !h-9"
              >
                {updateBranding.isPending ? "Opslaan..." : "Opslaan"}
              </button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="notificaties" className="outline-none">
          <div className="space-y-6">
          <GroupedSettingsHeader
            eyebrow="Communicatie"
            title={activeCommunicationCopy.title}
            description={activeCommunicationCopy.description}
            items={COMMUNICATION_NAV_ITEMS}
            activeValue={activeCommunicationSection}
            onChange={handleCommunicationSectionChange}
          />
          <div className="card--luxe p-6 space-y-1">
            <div className="pb-4">
              <p className="text-[11px] font-display font-semibold text-[hsl(var(--gold-deep))] uppercase tracking-[0.16em]">
                Notificaties
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Beheer hoe en wanneer je meldingen ontvangt.</p>
            </div>

            <div className="rounded-2xl border border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--gold-soft)/0.1)] p-4 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <Label className="text-sm font-medium">Tenant-eigen SMTP</Label>
                  <p className="text-xs text-muted-foreground">
                    Gebruik de mailbox van deze tenant voor bevestigingen, follow-ups en klantnotificaties.
                  </p>
                </div>
                <Switch
                  checked={smtpSettings.enabled}
                  onCheckedChange={(value) => setSmtpSettings((prev) => ({ ...prev, enabled: value }))}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="smtp-host">SMTP host</Label>
                  <Input id="smtp-host" value={smtpSettings.fields.host} onChange={(e) => updateSmtpField("host", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-port">Poort</Label>
                  <Input id="smtp-port" value={smtpSettings.fields.port} onChange={(e) => updateSmtpField("port", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-username">Gebruikersnaam</Label>
                  <Input id="smtp-username" value={smtpSettings.fields.username} onChange={(e) => updateSmtpField("username", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-password">Wachtwoord</Label>
                  <Input
                    id="smtp-password"
                    type="password"
                    value={smtpSettings.fields.password}
                    onChange={(e) => updateSmtpField("password", e.target.value)}
                    placeholder={(smtpSaved?.credentials as Record<string, unknown> | undefined)?.__hasStoredSecrets ? "Leeg laten behoudt huidige secret" : ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-from-email">From e-mail</Label>
                  <Input id="smtp-from-email" value={smtpSettings.fields.fromEmail} onChange={(e) => updateSmtpField("fromEmail", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-from-name">From naam</Label>
                  <Input id="smtp-from-name" value={smtpSettings.fields.fromName} onChange={(e) => updateSmtpField("fromName", e.target.value)} />
                </div>
              </div>
              <div>
                <button
                  type="button"
                  onClick={handleSaveSmtp}
                  disabled={saveSmtp.isPending}
                  className="btn-luxe !h-9"
                >
                  {saveSmtp.isPending ? "Opslaan..." : "SMTP-config opslaan"}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between py-4 border-t border-[hsl(var(--gold)/0.12)]">
              <div className="space-y-0.5 pr-4">
                <Label className="text-sm font-medium">E-mail bij nieuwe order</Label>
                <p className="text-xs text-muted-foreground">Ontvang een melding zodra een nieuwe order wordt aangemaakt.</p>
              </div>
              <Switch checked={notifications.newOrder} onCheckedChange={() => toggleNotification("newOrder")} />
            </div>

            <div className="flex items-center justify-between py-4 border-t border-[hsl(var(--gold)/0.12)]">
              <div className="space-y-0.5 pr-4">
                <Label className="text-sm font-medium">E-mail bij annulering</Label>
                <p className="text-xs text-muted-foreground">Ontvang een melding wanneer een order wordt geannuleerd.</p>
              </div>
              <Switch checked={notifications.cancellation} onCheckedChange={() => toggleNotification("cancellation")} />
            </div>

            <div className="flex items-center justify-between py-4 border-t border-[hsl(var(--gold)/0.12)]">
              <div className="space-y-0.5 pr-4">
                <Label className="text-sm font-medium">E-mail bij deadline-overschrijding</Label>
                <p className="text-xs text-muted-foreground">Ontvang een waarschuwing wanneer een order de geplande deadline overschrijdt.</p>
              </div>
              <Switch checked={notifications.deadlineExceeded} onCheckedChange={() => toggleNotification("deadlineExceeded")} />
            </div>

            <div className="flex items-center justify-between py-4 border-t border-[hsl(var(--gold)/0.12)]">
              <div className="space-y-0.5 pr-4">
                <Label className="text-sm font-medium">Dagelijkse samenvatting</Label>
                <p className="text-xs text-muted-foreground">Ontvang elke ochtend een overzicht van de orders en activiteiten van de vorige dag.</p>
              </div>
              <Switch checked={notifications.dailySummary} onCheckedChange={() => toggleNotification("dailySummary")} />
            </div>

            <div className="flex items-center justify-between py-4 border-t border-[hsl(var(--gold)/0.12)]">
              <div className="space-y-0.5 pr-4">
                <Label className="text-sm font-medium">Wekelijks rapport</Label>
                <p className="text-xs text-muted-foreground">Ontvang elke maandag een wekelijks rapport met statistieken en trends.</p>
              </div>
              <Switch checked={notifications.weeklyReport} onCheckedChange={() => toggleNotification("weeklyReport")} />
            </div>

            <div className="pt-4 mt-4 border-t border-[hsl(var(--gold)/0.12)]">
              <button
                type="button"
                onClick={handleSaveNotifications}
                disabled={saveNotifications.isPending}
                className="btn-luxe btn-luxe--primary !h-9"
              >
                {saveNotifications.isPending ? "Opslaan..." : "Notificaties opslaan"}
              </button>
            </div>
          </div>
          </div>
        </TabsContent>

        {/* SMS Tab */}
        <TabsContent value="sms" className="outline-none">
          <div className="space-y-6">
          <GroupedSettingsHeader
            eyebrow="Communicatie"
            title={activeCommunicationCopy.title}
            description={activeCommunicationCopy.description}
            items={COMMUNICATION_NAV_ITEMS}
            activeValue={activeCommunicationSection}
            onChange={handleCommunicationSectionChange}
          />
          <div className="card--luxe p-6 space-y-6">
            <div>
              <p className="text-[11px] font-display font-semibold text-[hsl(var(--gold-deep))] uppercase tracking-[0.16em]">
                SMS-notificaties
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Stuur SMS-berichten naar klanten bij belangrijke statusupdates.</p>
            </div>

            {/* Provider selection */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold">SMS-provider</Label>
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setSmsProvider("twilio")}
                  className={cn(
                    "flex-1 rounded-lg border p-4 text-left transition-all",
                    smsProvider === "twilio"
                      ? "border-[hsl(var(--gold-deep))] bg-[hsl(var(--gold-soft)/0.3)]"
                      : "border-[hsl(var(--gold)/0.2)] hover:border-[hsl(var(--gold-deep))]"
                  )}
                >
                  <p className="text-sm font-semibold">Twilio</p>
                  <p className="text-xs text-muted-foreground mt-1">Wereldwijde SMS-provider.</p>
                </button>
                <button
                  type="button"
                  onClick={() => setSmsProvider("messagebird")}
                  className={cn(
                    "flex-1 rounded-lg border p-4 text-left transition-all",
                    smsProvider === "messagebird"
                      ? "border-[hsl(var(--gold-deep))] bg-[hsl(var(--gold-soft)/0.3)]"
                      : "border-[hsl(var(--gold)/0.2)] hover:border-[hsl(var(--gold-deep))]"
                  )}
                >
                  <p className="text-sm font-semibold">MessageBird</p>
                  <p className="text-xs text-muted-foreground mt-1">Nederlandse SMS-provider.</p>
                </button>
              </div>
            </div>

            {/* Provider credentials */}
            {smsProvider === "twilio" ? (
              <div className="space-y-4 rounded-lg border border-[hsl(var(--gold)/0.2)] p-4 bg-[hsl(var(--gold-soft)/0.15)]">
                  <div className="space-y-2">
                    <Label htmlFor="twilioSid">Account SID</Label>
                    <Input
                      id="twilioSid"
                      value={twilioAccountSid}
                      onChange={(e) => setTwilioAccountSid(e.target.value)}
                      placeholder="AC..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="twilioToken">Auth Token</Label>
                    <Input
                      id="twilioToken"
                      type="password"
                      value={twilioAuthToken}
                      onChange={(e) => setTwilioAuthToken(e.target.value)}
                      placeholder="Uw Twilio Auth Token"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="twilioFrom">From Number</Label>
                    <Input
                      id="twilioFrom"
                      value={twilioFromNumber}
                      onChange={(e) => setTwilioFromNumber(e.target.value)}
                      placeholder="+31612345678"
                    />
                  </div>
                </div>
            ) : (
              <div className="space-y-4 rounded-lg border border-[hsl(var(--gold)/0.2)] p-4 bg-[hsl(var(--gold-soft)/0.15)]">
                <div className="space-y-2">
                  <Label htmlFor="mbApiKey">API-key</Label>
                  <Input
                    id="mbApiKey"
                    type="password"
                    value={messageBirdApiKey}
                    onChange={(e) => setMessageBirdApiKey(e.target.value)}
                    placeholder="MessageBird API-key"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mbOriginator">Afzender</Label>
                  <Input
                    id="mbOriginator"
                    value={messageBirdOriginator}
                    onChange={(e) => setMessageBirdOriginator(e.target.value)}
                    placeholder="Bedrijfsnaam of telefoonnummer"
                  />
                </div>
              </div>
            )}

            {/* SMS Event toggles */}
            <div className="space-y-1">
              <Label className="text-sm font-semibold">SMS-events</Label>
              <div className="rounded-lg border border-[hsl(var(--gold)/0.2)] divide-y divide-[hsl(var(--gold)/0.12)]">
                <div className="flex items-center justify-between p-4">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Zending onderweg</Label>
                    <p className="text-xs text-muted-foreground">Stuur een SMS wanneer de zending onderweg is.</p>
                  </div>
                  <Switch checked={smsEvents.onderweg} onCheckedChange={() => toggleSmsEvent("onderweg")} />
                </div>
                <div className="flex items-center justify-between p-4">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Zending afgeleverd</Label>
                    <p className="text-xs text-muted-foreground">Stuur een SMS wanneer de zending is afgeleverd.</p>
                  </div>
                  <Switch checked={smsEvents.afgeleverd} onCheckedChange={() => toggleSmsEvent("afgeleverd")} />
                </div>
                <div className="flex items-center justify-between p-4">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Vertragingsmelding</Label>
                    <p className="text-xs text-muted-foreground">Stuur een SMS bij een verwachte vertraging.</p>
                  </div>
                  <Switch checked={smsEvents.vertraging} onCheckedChange={() => toggleSmsEvent("vertraging")} />
                </div>
              </div>
            </div>

            {/* SMS Template */}
            <div className="space-y-2">
              <Label htmlFor="smsTemplate">SMS-template</Label>
              <Textarea
                id="smsTemplate"
                value={smsTemplate}
                onChange={(e) => setSmsTemplate(e.target.value)}
                placeholder="Je zending #{order_number} is onderweg. Verwachte levertijd: {eta}."
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Beschikbare variabelen: <code className="bg-[hsl(var(--gold-soft)/0.4)] border border-[hsl(var(--gold)/0.2)] px-1 rounded">{"{order_number}"}</code>, <code className="bg-[hsl(var(--gold-soft)/0.4)] border border-[hsl(var(--gold)/0.2)] px-1 rounded">{"{eta}"}</code>, <code className="bg-[hsl(var(--gold-soft)/0.4)] border border-[hsl(var(--gold)/0.2)] px-1 rounded">{"{status}"}</code>, <code className="bg-[hsl(var(--gold-soft)/0.4)] border border-[hsl(var(--gold)/0.2)] px-1 rounded">{"{tracking_url}"}</code>
              </p>
            </div>

            {/* Test SMS button */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => toast.success("Test-SMS verstuurd", { description: "Een test-SMS is verstuurd naar het geconfigureerde nummer." })}
                className="btn-luxe !h-9"
              >
                <Smartphone className="h-3.5 w-3.5" strokeWidth={1.5} />
                Verstuur test-SMS
              </button>
            </div>

            {/* Save button */}
            <div className="pt-4 border-t border-[hsl(var(--gold)/0.12)]">
              <button
                type="button"
                onClick={handleSaveSms}
                disabled={saveSms.isPending}
                className="btn-luxe btn-luxe--primary !h-9"
              >
                {saveSms.isPending ? "Opslaan..." : "Opslaan"}
              </button>
            </div>
          </div>
          </div>
        </TabsContent>

        {/* Integraties Tab , nieuwe connector-platform UI (sprint 8) */}
        <TabsContent value="integraties" className="space-y-6 outline-none">
          <GroupedSettingsHeader
            eyebrow="Koppelingen"
            title={activeConnectionCopy.title}
            description={activeConnectionCopy.description}
            items={CONNECTION_NAV_ITEMS}
            activeValue={activeConnectionSection}
            onChange={handleConnectionSectionChange}
          />
          {(() => {
            const m = location.pathname.match(/\/integraties\/([\w-]+)/);
            const slug = m?.[1];
            if (slug) {
              return (
                <ConnectorDetail
                  slug={slug}
                  onBack={() => navigate("/settings/integraties")}
                />
              );
            }
            return (
              <ConnectorCatalog
                onSelect={(s) => navigate(`/settings/integraties/${s}`)}
              />
            );
          })()}
        </TabsContent>

        {/* Legacy Integraties Tab (verborgen, blijft staan voor de save-bar logica) */}
        <TabsContent value="__legacy_integraties_hidden__" className="hidden">
          <div className="card--luxe p-6">
            <div className="pb-4">
              <p className="text-[11px] font-display font-semibold text-[hsl(var(--gold-deep))] uppercase tracking-[0.16em]">
                Externe integraties (legacy)
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Vervangen door de connector-catalogus boven.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <IntegrationCard
                title="Exact Online"
                description="Boekhouding-synchronisatie."
                icon={BookOpen}
                enabled={integrations.exactOnline.enabled}
                onToggle={() => toggleIntegration("exactOnline")}
              >
                {integrations.exactOnline.enabled && (
                  <div className="space-y-2">
                    <Label htmlFor="exactApiKey" className="text-xs">API-key</Label>
                    <Input
                      id="exactApiKey"
                      type="password"
                      value={integrations.exactOnline.apiKey}
                      onChange={(e) => updateIntegration("exactOnline", "apiKey", e.target.value)}
                      placeholder="Exact Online API-key"
                      className="text-xs"
                    />
                  </div>
                )}
              </IntegrationCard>

              <IntegrationCard
                title="Twinfield"
                description="Facturatiekoppeling."
                icon={FileText}
                enabled={integrations.twinfield.enabled}
                onToggle={() => toggleIntegration("twinfield")}
              >
                {integrations.twinfield.enabled && (
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <Label htmlFor="twinfieldUser" className="text-xs">Gebruikersnaam</Label>
                      <Input
                        id="twinfieldUser"
                        value={integrations.twinfield.username}
                        onChange={(e) => updateIntegration("twinfield", "username", e.target.value)}
                        placeholder="Gebruikersnaam"
                        className="text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="twinfieldPass" className="text-xs">Wachtwoord</Label>
                      <Input
                        id="twinfieldPass"
                        type="password"
                        value={integrations.twinfield.password}
                        onChange={(e) => updateIntegration("twinfield", "password", e.target.value)}
                        placeholder="Wachtwoord"
                        className="text-xs"
                      />
                    </div>
                  </div>
                )}
              </IntegrationCard>

              <IntegrationCard
                title="Samsara"
                description="Telematica en GPS-tracking."
                icon={Truck}
                enabled={integrations.samsara.enabled}
                onToggle={() => toggleIntegration("samsara")}
              >
                {integrations.samsara.enabled && (
                  <div className="space-y-2">
                    <Label htmlFor="samsaraApiKey" className="text-xs">API-key</Label>
                    <Input
                      id="samsaraApiKey"
                      type="password"
                      value={integrations.samsara.apiKey}
                      onChange={(e) => updateIntegration("samsara", "apiKey", e.target.value)}
                      placeholder="Samsara API-key"
                      className="text-xs"
                    />
                  </div>
                )}
              </IntegrationCard>

              <IntegrationCard
                title="Snelstart"
                description="Boekhoud-synchronisatie. Verzonden facturen worden automatisch als verkoopboeking geboekt."
                icon={Calculator}
                enabled={snelstart.enabled}
                onToggle={() => setSnelstart((p) => ({ ...p, enabled: !p.enabled }))}
              >
                {snelstart.enabled && (
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3 rounded-lg border border-[hsl(var(--gold)/0.15)] bg-[hsl(var(--gold-soft)/0.3)] px-3 py-2">
                      <div>
                        <p className="text-xs font-semibold text-foreground">Testmodus</p>
                        <p className="text-[11px] text-muted-foreground">
                          Simuleer boekingen zonder echte Snelstart-account, handig totdat de API-sleutels klaar zijn.
                        </p>
                      </div>
                      <Switch
                        checked={snelstart.fields.mockMode}
                        onCheckedChange={(v) => updateSnelstartField("mockMode", v)}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="snelstartClientKey" className="text-xs">Client-key</Label>
                      <Input
                        id="snelstartClientKey"
                        type="password"
                        value={snelstart.fields.clientKey}
                        onChange={(e) => updateSnelstartField("clientKey", e.target.value)}
                        placeholder="Snelstart client-key"
                        className="text-xs"
                        disabled={snelstart.fields.mockMode}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="snelstartSubKey" className="text-xs">Subscription-key</Label>
                      <Input
                        id="snelstartSubKey"
                        type="password"
                        value={snelstart.fields.subscriptionKey}
                        onChange={(e) => updateSnelstartField("subscriptionKey", e.target.value)}
                        placeholder="Snelstart subscription-key"
                        className="text-xs"
                        disabled={snelstart.fields.mockMode}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="snelstartAdminId" className="text-xs">Administratie-ID</Label>
                      <Input
                        id="snelstartAdminId"
                        value={snelstart.fields.administratieId}
                        onChange={(e) => updateSnelstartField("administratieId", e.target.value)}
                        placeholder="UUID van de administratie"
                        className="text-xs"
                        disabled={snelstart.fields.mockMode}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label htmlFor="snelstartGrb" className="text-xs">Grootboek omzet</Label>
                        <Input
                          id="snelstartGrb"
                          value={snelstart.fields.standaardGrootboek}
                          onChange={(e) => updateSnelstartField("standaardGrootboek", e.target.value)}
                          placeholder="bv. 8000"
                          className="text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="snelstartBtw" className="text-xs">Grootboek BTW</Label>
                        <Input
                          id="snelstartBtw"
                          value={snelstart.fields.btwGrootboek}
                          onChange={(e) => updateSnelstartField("btwGrootboek", e.target.value)}
                          placeholder="bv. 1500"
                          className="text-xs"
                        />
                      </div>
                    </div>
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={handleTestSnelstart}
                        disabled={snelstartTesting}
                        className="text-[11px] font-medium text-[hsl(var(--gold-deep))] hover:underline disabled:opacity-50"
                      >
                        {snelstartTesting ? "Bezig met testen..." : "Verbinding testen"}
                      </button>
                    </div>
                  </div>
                )}
              </IntegrationCard>

            </div>

            <div className="pt-6 border-t border-[hsl(var(--gold)/0.12)] mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={async () => {
                  await handleSaveIntegrations();
                  if (snelstartDirty) await handleSaveSnelstart();
                }}
                disabled={saveIntegrations.isPending || saveSnelstart.isPending}
                className="btn-luxe btn-luxe--primary !h-9"
              >
                {saveIntegrations.isPending || saveSnelstart.isPending
                  ? "Opslaan..."
                  : "Integraties opslaan"}
              </button>
            </div>
          </div>
        </TabsContent>

        {/* Inboxen Tab */}
        <TabsContent value="inboxen" className="space-y-6 outline-none">
          <GroupedSettingsHeader
            eyebrow="Communicatie"
            title={activeCommunicationCopy.title}
            description={activeCommunicationCopy.description}
            items={COMMUNICATION_NAV_ITEMS}
            activeValue={activeCommunicationSection}
            onChange={handleCommunicationSectionChange}
          />
          <DeferredMount label="Inboxen laden">
            <InboxSettings />
          </DeferredMount>
        </TabsContent>

        <TabsContent value="eta-meldingen" className="space-y-6 outline-none">
          <GroupedSettingsHeader
            eyebrow="Communicatie"
            title={activeCommunicationCopy.title}
            description={activeCommunicationCopy.description}
            items={COMMUNICATION_NAV_ITEMS}
            activeValue={activeCommunicationSection}
            onChange={handleCommunicationSectionChange}
          />
          <DeferredMount label="ETA-meldingen laden">
            <EtaNotificationSettings />
          </DeferredMount>
        </TabsContent>

        <TabsContent value="webhooks" className="space-y-6 outline-none">
          <GroupedSettingsHeader
            eyebrow="Koppelingen"
            title={activeConnectionCopy.title}
            description={activeConnectionCopy.description}
            items={CONNECTION_NAV_ITEMS}
            activeValue={activeConnectionSection}
            onChange={handleConnectionSectionChange}
          />
          <DeferredMount label="Webhooks laden">
            <WebhookSettings />
          </DeferredMount>
        </TabsContent>

        <TabsContent value="api-tokens" className="space-y-6 outline-none">
          <GroupedSettingsHeader
            eyebrow="Koppelingen"
            title={activeConnectionCopy.title}
            description={activeConnectionCopy.description}
            items={CONNECTION_NAV_ITEMS}
            activeValue={activeConnectionSection}
            onChange={handleConnectionSectionChange}
          />
          <DeferredMount label="API-tokens laden">
            <ApiTokenSettings clientId={null} />
          </DeferredMount>
        </TabsContent>
        </div>
      </Tabs>

      {/* Actieve tab bepaalt welke save-bar zichtbaar is. Slechts één tegelijk. */}
      {activeTab === "branding" && (
        <StickySaveBar
          dirty={brandingDirty}
          saving={updateBranding.isPending}
          onSave={handleSaveBranding}
          onRevert={revertBranding}
          label="Branding heeft niet-opgeslagen wijzigingen"
        />
      )}
      {activeTab === "notificaties" && (
        <StickySaveBar
          dirty={notificationsDirty}
          saving={saveNotifications.isPending}
          onSave={handleSaveNotifications}
          onRevert={revertNotifications}
          label="Notificaties hebben niet-opgeslagen wijzigingen"
        />
      )}
      {activeTab === "operationele-inrichting" && activeOperationSection === "sla" && (
        <StickySaveBar
          dirty={slaDirty}
          saving={saveSla.isPending}
          onSave={handleSaveSla}
          onRevert={revertSla}
          label="SLA-instellingen hebben niet-opgeslagen wijzigingen"
        />
      )}
      {activeTab === "sms" && (
        <StickySaveBar
          dirty={smsDirty}
          saving={saveSms.isPending}
          onSave={handleSaveSms}
          onRevert={revertSms}
          label="SMS-instellingen hebben niet-opgeslagen wijzigingen"
        />
      )}
      {/* Save-bar uit voor integraties: nieuwe connector-UI heeft per-tab save-knoppen. */}
      {false && activeTab === "integraties" && (
        <StickySaveBar
          dirty={integrationsDirty || snelstartDirty}
          saving={saveIntegrations.isPending || saveSnelstart.isPending}
          onSave={async () => {
            if (integrationsDirty) await handleSaveIntegrations();
            if (snelstartDirty) await handleSaveSnelstart();
          }}
          onRevert={() => { revertIntegrations(); revertSnelstart(); }}
          label="Integraties hebben niet-opgeslagen wijzigingen"
        />
      )}
    </div>
  );
};

export default Settings;

function IntegrationCard({
  title,
  description,
  icon: Icon,
  enabled,
  onToggle,
  children,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  enabled: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[hsl(var(--gold)/0.2)] bg-[hsl(var(--gold-soft)/0.15)] p-4 space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className="h-10 w-10 rounded-xl flex items-center justify-center border border-[hsl(var(--gold)/0.3)]"
            style={{ background: "linear-gradient(135deg, hsl(var(--gold-soft)/0.8), hsl(var(--gold-soft)/0.25))" }}
          >
            <Icon className="h-4 w-4 text-[hsl(var(--gold-deep))]" strokeWidth={1.5} />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <Switch checked={enabled} onCheckedChange={onToggle} />
      </div>
      {children}
    </div>
  );
}
