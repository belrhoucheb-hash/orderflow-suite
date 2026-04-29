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
import { useTenant } from "@/contexts/TenantContext";
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
      { value: "algemeen", label: "Algemeen" },
      { value: "branding", label: "Branding" },
      { value: "notificaties", label: "Notificaties" },
    ],
  },
  {
    title: "Communicatie",
    items: [
      { value: "sms", label: "SMS" },
      { value: "eta-meldingen", label: "ETA en klant-meldingen" },
      { value: "inboxen", label: "Inboxen" },
      { value: "integraties", label: "Integraties" },
      { value: "webhooks", label: "Webhooks" },
      { value: "api-tokens", label: "API-tokens" },
    ],
  },
  {
    title: "Prijzen",
    items: [
      { value: "tarieven", label: "Tarieven" },
      { value: "kosten", label: "Kosten" },
    ],
  },
  {
    title: "Operations",
    items: [
      { value: "operationele-inrichting", label: "Operationele inrichting" },
    ],
  },
];

const OPERATIONS_NAV_ITEMS: NavItem[] = [
  { value: "stamgegevens", label: "Stamgegevens" },
  { value: "rooster-types", label: "Rooster-types" },
  { value: "sla", label: "SLA" },
  { value: "uitzonderingen", label: "Uitzonderingen" },
];

const Settings = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { tenant } = useTenant();
  const { t, i18n } = useTranslation();

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const updateBranding = useUpdateTenantBranding();

  const [brandingBaseline, setBrandingBaseline] = useState<string>("");

  useEffect(() => {
    if (tenant) {
      setCompanyName(tenant.name || "");
      setPrimaryColor(tenant.primaryColor || "#3b82f6");
      setLogoPreview(tenant.logoUrl || null);
      setPendingLogoFile(null);
      setBrandingBaseline(JSON.stringify({
        name: tenant.name || "",
        color: tenant.primaryColor || "#3b82f6",
        logoUrl: tenant.logoUrl || null,
      }));
    }
  }, [tenant]);

  const brandingCurrent = JSON.stringify({
    name: companyName,
    color: primaryColor,
    // pending-file markeert dirty, ongeacht preview-url
    logoUrl: pendingLogoFile ? "__pending__" : logoPreview,
  });
  const brandingDirty = brandingBaseline !== "" && brandingCurrent !== brandingBaseline;
  const revertBranding = () => {
    if (!tenant) return;
    setCompanyName(tenant.name || "");
    setPrimaryColor(tenant.primaryColor || "#3b82f6");
    setLogoPreview(tenant.logoUrl || null);
    setPendingLogoFile(null);
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

  const handleSaveBranding = async () => {
    await updateBranding.mutateAsync({
      name: companyName,
      primary_color: primaryColor,
      logo_file: pendingLogoFile,
    });
    setPendingLogoFile(null);
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
  const EMPTY_SNELSTART: SnelstartFields = {
    clientKey: "",
    subscriptionKey: "",
    administratieId: "",
    standaardGrootboek: "",
    btwGrootboek: "",
    mockMode: true,
  };
  const [snelstart, setSnelstart] = useState<{ enabled: boolean; fields: SnelstartFields }>(
    { enabled: false, fields: { ...EMPTY_SNELSTART } },
  );
  const [snelstartBaseline, setSnelstartBaseline] = useState<string>("");
  const [snelstartTesting, setSnelstartTesting] = useState(false);
  const { data: snelstartSaved } = useIntegrationCredentials<SnelstartFields>("snelstart");
  const saveSnelstart = useSaveIntegrationCredentials<SnelstartFields>("snelstart");
  useEffect(() => {
    if (snelstartSaved === undefined) return;
    const merged = {
      enabled: snelstartSaved.enabled,
      fields: { ...EMPTY_SNELSTART, ...snelstartSaved.credentials },
    };
    setSnelstart(merged);
    setSnelstartBaseline(JSON.stringify(merged));
  }, [snelstartSaved]);

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
  const { data: savedIntegrations } = useLoadSettings<typeof integrations>("integrations");
  const { data: savedNotifications } = useLoadSettings<typeof notifications>("notifications");
  const { data: savedSms } = useSmsSettings();
  const { data: savedSla } = useLoadSettings("sla");

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
  const connectorList = useConnectorList();
  const [slaSettings, setSlaSettings] = useState(DEFAULT_SLA_SETTINGS);

  // Load saved settings into state when fetched
  useEffect(() => {
    if (savedIntegrations && Object.keys(savedIntegrations).length > 0) {
      setIntegrations(prev => {
        const merged = { ...prev, ...savedIntegrations };
        setIntegrationsBaseline(JSON.stringify(merged));
        return merged;
      });
    } else if (savedIntegrations !== undefined) {
      setIntegrationsBaseline((prev) => prev || JSON.stringify(integrations));
    }
  }, [savedIntegrations]);

  useEffect(() => {
    if (savedNotifications && Object.keys(savedNotifications).length > 0) {
      setNotifications(prev => {
        const merged = { ...prev, ...savedNotifications };
        setNotificationsBaseline(JSON.stringify(merged));
        return merged;
      });
    } else if (savedNotifications !== undefined) {
      setNotificationsBaseline((prev) => prev || JSON.stringify(notifications));
    }
  }, [savedNotifications]);

  useEffect(() => {
    if (savedSms && Object.keys(savedSms).length > 0) {
      if (savedSms.smsProvider) setSmsProvider(savedSms.smsProvider);
      if (savedSms.twilioAccountSid) setTwilioAccountSid(savedSms.twilioAccountSid);
      setTwilioAuthToken(savedSms.twilioAuthToken ?? "");
      if (savedSms.twilioFromNumber) setTwilioFromNumber(savedSms.twilioFromNumber);
      setMessageBirdApiKey(savedSms.messageBirdApiKey ?? "");
      if (savedSms.messageBirdOriginator) setMessageBirdOriginator(savedSms.messageBirdOriginator);
      if (savedSms.smsEvents) setSmsEvents(prev => ({ ...prev, ...savedSms.smsEvents }));
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
  }, [savedSms]);

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
    if (location.pathname.includes("/branding")) return "branding";
    if (location.pathname.includes("/notificaties")) return "notificaties";
    if (location.pathname.includes("/sms")) return "sms";
    if (location.pathname.includes("/eta-meldingen")) return "eta-meldingen";
    if (location.pathname.includes("/integraties")) return "integraties";
    if (location.pathname.includes("/inboxen")) return "inboxen";
    if (location.pathname.includes("/tarieven")) return "tarieven";
    if (location.pathname.includes("/kosten")) return "kosten";
    if (location.pathname.includes("/webhooks")) return "webhooks";
    if (location.pathname.includes("/api-tokens")) return "api-tokens";
    return "algemeen";
  };

  const handleTabChange = (value: string) => {
    if (value === "algemeen") navigate("/settings");
    else navigate(`/settings/${value}`);
  };

  const getActiveOperationSection = () => {
    if (location.pathname.includes("/rooster-types")) return "rooster-types";
    if (location.pathname.includes("/sla")) return "sla";
    if (location.pathname.includes("/uitzonderingen")) return "uitzonderingen";
    return "stamgegevens";
  };

  const activeOperationSection = getActiveOperationSection();
  const handleOperationSectionChange = (value: string) => {
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
  const EMPTY_SMTP: SmtpFields = {
    host: "",
    port: "587",
    username: "",
    password: "",
    fromEmail: "",
    fromName: "",
  };
  const [smtpSettings, setSmtpSettings] = useState<{ enabled: boolean; fields: SmtpFields }>(
    { enabled: false, fields: { ...EMPTY_SMTP } },
  );
  const { data: smtpSaved } = useIntegrationCredentials<SmtpFields>("smtp");
  const saveSmtp = useSaveIntegrationCredentials<SmtpFields>("smtp");
  useEffect(() => {
    if (smtpSaved === undefined) return;
    setSmtpSettings({
      enabled: smtpSaved.enabled,
      fields: { ...EMPTY_SMTP, ...smtpSaved.credentials, password: "" },
    });
  }, [smtpSaved]);
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

  const activeTab = getActiveTab();
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
      title: "Operations",
      description: "Masterdata, roosters en prijslogica in balans.",
      icon: Truck,
      target: "operationele-inrichting",
      items: [
        { label: "Stamgegevens", status: "Actief" },
        { label: "SLA", status: slaSettings.enabled ? "Actief" : "Uit" },
        { label: "Uitzonderingen", status: "Regels", subtle: true },
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
        title={t('pages.settings.title')}
        subtitle={t('pages.settings.subtitle')}
      />

      <SettingsCommandPalette />

      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="flex-1 flex gap-6 min-h-0"
      >
        {/* Verborgen TabsList is nodig zodat Radix de controlled value + TabsContent correct orchestreert. */}
        <TabsList className="sr-only" aria-hidden="true">
          {NAV_GROUPS.flatMap((g) => g.items).map((item) => (
            <TabsTrigger key={item.value} value={item.value}>{item.label}</TabsTrigger>
          ))}
        </TabsList>

        {/* Sidebar-navigatie */}
        <aside className="w-56 shrink-0 border-r border-[hsl(var(--gold)/0.08)] pr-4 py-1 overflow-y-auto">
          <nav className="space-y-5">
            {NAV_GROUPS.map((group) => (
              <div key={group.title}>
                <p className="mb-2 px-3 text-[10px] font-display font-semibold uppercase tracking-[0.22em] text-[hsl(var(--gold-deep)/0.72)]">
                  {group.title}
                </p>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = activeTab === item.value;
                    return (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => handleTabChange(item.value)}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-xl text-[13px] transition-colors relative",
                          active
                            ? "bg-[linear-gradient(90deg,hsl(var(--gold-soft)/0.42),hsl(var(--gold-soft)/0.18))] text-[hsl(var(--gold-deep))] font-medium shadow-[inset_0_0_0_1px_hsl(var(--gold)/0.08)]"
                            : "text-muted-foreground hover:bg-[hsl(var(--gold-soft)/0.12)] hover:text-foreground"
                        )}
                      >
                        {active && (
                          <span className="absolute left-0 top-2.5 bottom-2.5 w-0.5 rounded-full bg-[hsl(var(--gold-deep))]" aria-hidden="true" />
                        )}
                        {item.label}
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
          <div className="card--luxe p-5 md:p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[11px] font-display font-semibold uppercase tracking-[0.16em] text-[hsl(var(--gold-deep))]">
                  Operationele inrichting
                </p>
                <h2 className="mt-2 text-xl font-semibold text-foreground">Basisregels voor planning en uitvoering</h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  Beheer stamdata, roosters, SLA-bewaking en uitzonderingsregels op een plek.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-4 lg:min-w-[560px]">
                {OPERATIONS_NAV_ITEMS.map((item) => {
                  const active = activeOperationSection === item.value;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => handleOperationSectionChange(item.value)}
                      className={cn(
                        "rounded-xl border px-3 py-2 text-sm transition-colors",
                        active
                          ? "border-[hsl(var(--gold)/0.28)] bg-[hsl(var(--gold-soft)/0.36)] text-[hsl(var(--gold-deep))] font-medium"
                          : "border-[hsl(var(--gold)/0.1)] bg-background/60 text-muted-foreground hover:bg-[hsl(var(--gold-soft)/0.14)] hover:text-foreground",
                      )}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {activeOperationSection === "stamgegevens" && (
            <div className="space-y-8">
              <MasterDataSection />
              <VehicleDocumentTypesSection />
            </div>
          )}

          {activeOperationSection === "rooster-types" && <ShiftTemplateSettings />}

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

          {activeOperationSection === "uitzonderingen" && <ExceptionRulesSettings />}
        </TabsContent>

        <TabsContent value="branding" className="outline-none">
          <div className="card--luxe p-6 space-y-6">
            <div>
              <p className="text-[11px] font-display font-semibold text-[hsl(var(--gold-deep))] uppercase tracking-[0.16em]">
                Branding
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Configureer je bedrijfsidentiteit.</p>
            </div>

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

            <div className="space-y-2">
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
        </TabsContent>

        {/* SMS Tab */}
        <TabsContent value="sms" className="outline-none">
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
        </TabsContent>

        {/* Integraties Tab , nieuwe connector-platform UI (sprint 8) */}
        <TabsContent value="integraties" className="outline-none">
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
        <TabsContent value="inboxen" className="outline-none">
          <InboxSettings />
        </TabsContent>

        <TabsContent value="eta-meldingen" className="outline-none">
          <EtaNotificationSettings />
        </TabsContent>

        <TabsContent value="tarieven" className="space-y-6">
          <PricingPreview />
          <RateCardSettings />
          <SurchargeSettings />
        </TabsContent>

        <TabsContent value="kosten" className="space-y-6">
          <FuelPriceSettings />
          <CostTypeSettings />
        </TabsContent>

        <TabsContent value="webhooks" className="space-y-6 outline-none">
          <WebhookSettings />
        </TabsContent>

        <TabsContent value="api-tokens" className="space-y-6 outline-none">
          <ApiTokenSettings clientId={null} />
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
