import { useState, useEffect, useRef, useCallback } from "react";
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
import { VehicleDocumentTypesSection } from "@/components/fleet/VehicleDocumentTypesSection";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { useLoadSettings, useSaveSettings } from "@/hooks/useSettings";
import { RateCardSettings } from "@/components/settings/RateCardSettings";
import { SurchargeSettings } from "@/components/settings/SurchargeSettings";
import { CostTypeSettings } from "@/components/settings/CostTypeSettings";
import { FuelPriceSettings } from "@/components/settings/FuelPriceSettings";
import { InboxSettings } from "@/components/settings/InboxSettings";
import { useTranslation } from "react-i18next";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
      { value: "inboxen", label: "Inboxen" },
      { value: "integraties", label: "Integraties" },
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
    title: "Data",
    items: [{ value: "stamgegevens", label: "Stamgegevens" }],
  },
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (tenant) {
      setCompanyName(tenant.name || "");
      setPrimaryColor(tenant.primaryColor || "#3b82f6");
      if (tenant.logoUrl) setLogoPreview(tenant.logoUrl);
    }
  }, [tenant]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setLogoPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
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

  // -- Settings persistence hooks --
  const { data: savedIntegrations } = useLoadSettings<typeof integrations>("integrations");
  const { data: savedNotifications } = useLoadSettings<typeof notifications>("notifications");
  const { data: savedSms } = useLoadSettings<Record<string, any>>("sms");

  const saveIntegrations = useSaveSettings("integrations");
  const saveNotifications = useSaveSettings("notifications");
  const saveSms = useSaveSettings("sms");

  // Load saved settings into state when fetched
  useEffect(() => {
    if (savedIntegrations && Object.keys(savedIntegrations).length > 0) {
      setIntegrations(prev => ({ ...prev, ...savedIntegrations }));
    }
  }, [savedIntegrations]);

  useEffect(() => {
    if (savedNotifications && Object.keys(savedNotifications).length > 0) {
      setNotifications(prev => ({ ...prev, ...savedNotifications }));
    }
  }, [savedNotifications]);

  useEffect(() => {
    if (savedSms && Object.keys(savedSms).length > 0) {
      if (savedSms.smsProvider) setSmsProvider(savedSms.smsProvider);
      if (savedSms.twilioAccountSid) setTwilioAccountSid(savedSms.twilioAccountSid);
      if (savedSms.twilioAuthToken) setTwilioAuthToken(savedSms.twilioAuthToken);
      if (savedSms.twilioFromNumber) setTwilioFromNumber(savedSms.twilioFromNumber);
      if (savedSms.messageBirdApiKey) setMessageBirdApiKey(savedSms.messageBirdApiKey);
      if (savedSms.messageBirdOriginator) setMessageBirdOriginator(savedSms.messageBirdOriginator);
      if (savedSms.smsEvents) setSmsEvents(prev => ({ ...prev, ...savedSms.smsEvents }));
      if (savedSms.smsTemplate) setSmsTemplate(savedSms.smsTemplate);
    }
  }, [savedSms]);

  const handleSaveIntegrations = async () => {
    try {
      await saveIntegrations.mutateAsync(integrations as any);
      toast.success("Integratie-instellingen opgeslagen");
    } catch {
      toast.error("Fout bij opslaan", { description: "Probeer het opnieuw." });
    }
  };

  const handleSaveNotifications = async () => {
    try {
      await saveNotifications.mutateAsync(notifications as any);
      toast.success("Notificatie-instellingen opgeslagen");
    } catch {
      toast.error("Fout bij opslaan", { description: "Probeer het opnieuw." });
    }
  };

  const handleSaveSms = async () => {
    try {
      await saveSms.mutateAsync({
        smsProvider, twilioAccountSid, twilioAuthToken, twilioFromNumber,
        messageBirdApiKey, messageBirdOriginator, smsEvents, smsTemplate,
      });
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
    if (location.pathname.includes("/stamgegevens")) return "stamgegevens";
    if (location.pathname.includes("/branding")) return "branding";
    if (location.pathname.includes("/notificaties")) return "notificaties";
    if (location.pathname.includes("/sms")) return "sms";
    if (location.pathname.includes("/integraties")) return "integraties";
    if (location.pathname.includes("/inboxen")) return "inboxen";
    if (location.pathname.includes("/tarieven")) return "tarieven";
    if (location.pathname.includes("/kosten")) return "kosten";
    return "algemeen";
  };

  const handleTabChange = (value: string) => {
    if (value === "algemeen") navigate("/settings");
    else navigate(`/settings/${value}`);
  };

  return (
    <div className="flex flex-col gap-6 h-full pb-12">
      <PageHeader
        title={t('pages.settings.title')}
        subtitle={t('pages.settings.subtitle')}
      />

      <Tabs
        value={getActiveTab()}
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
        <aside className="w-56 shrink-0 border-r border-[hsl(var(--gold)/0.15)] pr-4 py-1 overflow-y-auto">
          <nav className="space-y-5">
            {NAV_GROUPS.map((group) => (
              <div key={group.title}>
                <p className="text-[10px] font-display font-semibold text-[hsl(var(--gold-deep))] uppercase tracking-[0.18em] mb-2 px-3">
                  {group.title}
                </p>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = getActiveTab() === item.value;
                    return (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => handleTabChange(item.value)}
                        className={cn(
                          "w-full text-left px-3 py-1.5 rounded-md text-[13px] transition-colors relative",
                          active
                            ? "bg-[hsl(var(--gold-soft)/0.5)] text-[hsl(var(--gold-deep))] font-medium"
                            : "text-muted-foreground hover:bg-[hsl(var(--gold-soft)/0.25)] hover:text-foreground"
                        )}
                      >
                        {active && (
                          <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-[hsl(var(--gold-deep))]" aria-hidden="true" />
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <button
              type="button"
              onClick={() => handleTabChange("stamgegevens")}
              className="card--luxe p-5 text-left hover:shadow-md transition-all group"
            >
              <div className={LUXE_ICON_TILE} style={LUXE_ICON_TILE_STYLE}>
                <Database className="h-4 w-4 text-[hsl(var(--gold-deep))]" strokeWidth={1.5} />
              </div>
              <h3 className="mt-3 text-base font-semibold text-foreground">Stamgegevens</h3>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Beheer voertuigtypes, ladingeenheden en transportvereisten.
              </p>
              <div className="mt-3 flex items-center justify-end">
                <ChevronRight className="h-4 w-4 text-[hsl(var(--gold)/0.4)] group-hover:text-[hsl(var(--gold-deep))] transition-colors" />
              </div>
            </button>

            <button
              type="button"
              onClick={() => navigate("/users")}
              className="card--luxe p-5 text-left hover:shadow-md transition-all group"
            >
              <div className={LUXE_ICON_TILE} style={LUXE_ICON_TILE_STYLE}>
                <Users className="h-4 w-4 text-[hsl(var(--gold-deep))]" strokeWidth={1.5} />
              </div>
              <h3 className="mt-3 text-base font-semibold text-foreground">Gebruikersbeheer</h3>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Beheer medewerkers en toegangsrechten.
              </p>
              <div className="mt-3 flex items-center justify-end">
                <ChevronRight className="h-4 w-4 text-[hsl(var(--gold)/0.4)] group-hover:text-[hsl(var(--gold-deep))] transition-colors" />
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleTabChange("branding")}
              className="card--luxe p-5 text-left hover:shadow-md transition-all group"
            >
              <div className={LUXE_ICON_TILE} style={LUXE_ICON_TILE_STYLE}>
                <Palette className="h-4 w-4 text-[hsl(var(--gold-deep))]" strokeWidth={1.5} />
              </div>
              <h3 className="mt-3 text-base font-semibold text-foreground">Branding en kleuren</h3>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Pas het thema, logo en kleuren van je platform aan.
              </p>
              <div className="mt-3 flex items-center justify-end">
                <ChevronRight className="h-4 w-4 text-[hsl(var(--gold)/0.4)] group-hover:text-[hsl(var(--gold-deep))] transition-colors" />
              </div>
            </button>
          </div>

          <div className="card--luxe p-5 mt-6">
            <p className="text-[11px] font-display font-semibold text-[hsl(var(--gold-deep))] uppercase tracking-[0.16em]">
              {t('settings.language')}
            </p>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              {t('settings.languageDescription')}
            </p>
            <div className="max-w-xs mt-4">
              <Select value={currentLang} onValueChange={handleLanguageChange}>
                <SelectTrigger>
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
        </TabsContent>

        <TabsContent value="stamgegevens" className="outline-none space-y-8">
          <MasterDataSection />
          <VehicleDocumentTypesSection />
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
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-block">
                      <button
                        type="button"
                        onClick={() => toast.success("Branding opgeslagen", { description: "Wijzigingen worden doorgevoerd." })}
                        className="btn-luxe btn-luxe--primary !h-9"
                      >
                        Opslaan
                      </button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Binnenkort beschikbaar</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
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

        {/* Integraties Tab */}
        <TabsContent value="integraties" className="outline-none">
          <div className="card--luxe p-6">
            <div className="pb-4">
              <p className="text-[11px] font-display font-semibold text-[hsl(var(--gold-deep))] uppercase tracking-[0.16em]">
                Externe integraties
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Koppel externe diensten en systemen aan je TMS-platform.</p>
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

            </div>

            <div className="pt-6 border-t border-[hsl(var(--gold)/0.12)] mt-6">
              <button
                type="button"
                onClick={handleSaveIntegrations}
                disabled={saveIntegrations.isPending}
                className="btn-luxe btn-luxe--primary !h-9"
              >
                {saveIntegrations.isPending ? "Opslaan..." : "Integraties opslaan"}
              </button>
            </div>
          </div>
        </TabsContent>

        {/* Inboxen Tab */}
        <TabsContent value="inboxen" className="outline-none">
          <InboxSettings />
        </TabsContent>

        <TabsContent value="tarieven" className="space-y-6">
          <RateCardSettings />
          <SurchargeSettings />
        </TabsContent>

        <TabsContent value="kosten" className="space-y-6">
          <FuelPriceSettings />
          <CostTypeSettings />
        </TabsContent>
        </div>
      </Tabs>
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
