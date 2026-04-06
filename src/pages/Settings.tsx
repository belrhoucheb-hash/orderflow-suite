import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Settings as SettingsIcon,
  Database,
  Users,
  Palette,
  Bell,
  ShieldCheck,
  ChevronRight,
  Upload,
  MessageSquare,
  Phone,
  Smartphone,
  Link,
  BookOpen,
  Truck,
  FileText,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { MasterDataSection } from "@/components/settings/MasterDataSection";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { useLoadSettings, useSaveSettings } from "@/hooks/useSettings";
import { RateCardSettings } from "@/components/settings/RateCardSettings";
import { SurchargeSettings } from "@/components/settings/SurchargeSettings";
import { CostTypeSettings } from "@/components/settings/CostTypeSettings";
import { FuelPriceSettings } from "@/components/settings/FuelPriceSettings";
import { useTranslation } from "react-i18next";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const LANGUAGE_OPTIONS = [
  { value: "nl", label: "Nederlands" },
  { value: "en", label: "English" },
  { value: "de", label: "Deutsch" },
  { value: "fr", label: "Français" },
];

const Settings = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { tenant } = useTenant();
  const { t, i18n } = useTranslation();

  const handleLanguageChange = (lng: string) => {
    i18n.changeLanguage(lng);
    localStorage.setItem("language", lng);
  };

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
    slack: { enabled: false, webhookUrl: "" },
    teams: { enabled: false, webhookUrl: "" },
    exactOnline: { enabled: false, apiKey: "" },
    twinfield: { enabled: false, username: "", password: "" },
    samsara: { enabled: false, apiKey: "" },
    transfollow: { enabled: false, apiKey: "" },
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
    if (location.pathname.includes("/gebruikers")) return "gebruikers";
    if (location.pathname.includes("/branding")) return "branding";
    if (location.pathname.includes("/sms")) return "sms";
    if (location.pathname.includes("/integraties")) return "integraties";
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
        title="Instellingen"
        subtitle="Beheer uw TMS platform configuratie en stamgegevens."
      />

      <Tabs 
        defaultValue={getActiveTab()} 
        onValueChange={handleTabChange}
        className="space-y-6"
      >
        <div className="border-b border-border/40 pb-px">
          <TabsList className="bg-transparent h-12 w-full justify-start gap-8 p-0">
            <TabsTrigger 
              value="algemeen" 
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground text-muted-foreground rounded-none px-1 h-full text-sm font-medium transition-all"
            >
              Algemeen
            </TabsTrigger>
            <TabsTrigger 
              value="stamgegevens" 
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground text-muted-foreground rounded-none px-1 h-full text-sm font-medium transition-all"
            >
              Stamgegevens
            </TabsTrigger>
            <TabsTrigger 
              value="branding" 
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground text-muted-foreground rounded-none px-1 h-full text-sm font-medium transition-all"
            >
              Branding
            </TabsTrigger>
            <TabsTrigger
              value="notificaties"
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground text-muted-foreground rounded-none px-1 h-full text-sm font-medium transition-all"
            >
              Notificaties
            </TabsTrigger>
            <TabsTrigger
              value="sms"
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground text-muted-foreground rounded-none px-1 h-full text-sm font-medium transition-all"
            >
              SMS
            </TabsTrigger>
            <TabsTrigger
              value="integraties"
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground text-muted-foreground rounded-none px-1 h-full text-sm font-medium transition-all"
            >
              Integraties
            </TabsTrigger>
            <TabsTrigger
              value="tarieven"
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground text-muted-foreground rounded-none px-1 h-full text-sm font-medium transition-all"
            >
              Tarieven
            </TabsTrigger>
            <TabsTrigger
              value="kosten"
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground text-muted-foreground rounded-none px-1 h-full text-sm font-medium transition-all"
            >
              Kosten
            </TabsTrigger>
            <TabsTrigger
              value="webhooks"
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground text-muted-foreground rounded-none px-1 h-full text-sm font-medium transition-all"
            >
              Webhooks
            </TabsTrigger>
            <TabsTrigger
              value="api"
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground text-muted-foreground rounded-none px-1 h-full text-sm font-medium transition-all"
            >
              API
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="algemeen" className="space-y-6 outline-none">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card className="rounded-2xl border-border/40 hover:shadow-md transition-all cursor-pointer group" onClick={() => handleTabChange("stamgegevens")}>
              <CardHeader className="pb-3">
                <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                  <Database className="h-4.5 w-4.5 text-amber-600" strokeWidth={1.5} />
                </div>
                <CardTitle className="text-base font-semibold">Stamgegevens</CardTitle>
                <CardDescription className="text-xs leading-relaxed">
                  Beheer voertuigtypes, eenheden en transportvereisten.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0 flex items-center justify-end">
                <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-border/40 hover:shadow-md transition-all cursor-pointer group" onClick={() => navigate("/users")}>
              <CardHeader className="pb-3">
                <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                  <Users className="h-4.5 w-4.5 text-blue-600" strokeWidth={1.5} />
                </div>
                <CardTitle className="text-base font-semibold">Gebruikersbeheer</CardTitle>
                <CardDescription className="text-xs leading-relaxed">
                  Beheer medewerkers en toegangsrechten.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0 flex items-center justify-end">
                <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-border/40 hover:shadow-md transition-all cursor-pointer group" onClick={() => handleTabChange("branding")}>
              <CardHeader className="pb-3">
                <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                  <Palette className="h-4.5 w-4.5 text-emerald-600" strokeWidth={1.5} />
                </div>
                <CardTitle className="text-base font-semibold">Branding & Kleuren</CardTitle>
                <CardDescription className="text-xs leading-relaxed">
                  Pas het thema, logo en kleuren van uw platform aan.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0 flex items-center justify-end">
                <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-2xl border-border/40 mt-6">
            <CardHeader>
              <CardTitle className="text-base font-semibold">{t('settings.language')}</CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                {t('settings.languageDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-w-xs">
                <Select value={i18n.language} onValueChange={handleLanguageChange}>
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
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stamgegevens" className="outline-none">
          <MasterDataSection />
        </TabsContent>

        <TabsContent value="branding" className="outline-none">
           <Card className="rounded-2xl border-border/40">
             <CardHeader>
               <CardTitle>Branding</CardTitle>
               <CardDescription>Configureer uw bedrijfsidentiteit.</CardDescription>
             </CardHeader>
             <CardContent className="space-y-6">
               <div className="space-y-2">
                 <Label htmlFor="companyName">Bedrijfsnaam</Label>
                 <Input
                   id="companyName"
                   value={companyName}
                   onChange={(e) => setCompanyName(e.target.value)}
                   placeholder="Uw bedrijfsnaam"
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
                     className="h-20 w-20 rounded-xl border-2 border-dashed border-border/60 flex items-center justify-center overflow-hidden bg-muted/30 cursor-pointer hover:border-primary/40 transition-colors"
                     onClick={() => fileInputRef.current?.click()}
                   >
                     {logoPreview ? (
                       <img src={logoPreview} alt="Logo preview" className="h-full w-full object-contain" />
                     ) : (
                       <Upload className="h-5 w-5 text-muted-foreground/50" strokeWidth={1.5} />
                     )}
                   </div>
                   <div className="flex flex-col gap-1">
                     <Button
                       variant="outline"
                       size="sm"
                       onClick={() => fileInputRef.current?.click()}
                     >
                       Bestand kiezen
                     </Button>
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

               <div className="pt-4 border-t border-border/40">
                 <TooltipProvider>
                   <Tooltip>
                     <TooltipTrigger asChild>
                       <span className="inline-block">
                         <Button onClick={() => toast.success("Branding opgeslagen", { description: "Wijzigingen worden doorgevoerd." })}>Opslaan</Button>
                       </span>
                     </TooltipTrigger>
                     <TooltipContent>
                       <p>Binnenkort beschikbaar</p>
                     </TooltipContent>
                   </Tooltip>
                 </TooltipProvider>
               </div>
             </CardContent>
           </Card>
        </TabsContent>

        <TabsContent value="notificaties" className="outline-none">
           <Card className="rounded-2xl border-border/40">
             <CardHeader>
               <CardTitle>Notificaties</CardTitle>
               <CardDescription>Beheer hoe en wanneer u meldingen ontvangt.</CardDescription>
             </CardHeader>
             <CardContent className="space-y-1">
               <div className="flex items-center justify-between py-4 border-b border-border/40">
                 <div className="space-y-0.5 pr-4">
                   <Label className="text-sm font-medium">E-mail bij nieuwe order</Label>
                   <p className="text-xs text-muted-foreground">Ontvang een melding zodra een nieuwe order wordt aangemaakt.</p>
                 </div>
                 <Switch checked={notifications.newOrder} onCheckedChange={() => toggleNotification("newOrder")} />
               </div>

               <div className="flex items-center justify-between py-4 border-b border-border/40">
                 <div className="space-y-0.5 pr-4">
                   <Label className="text-sm font-medium">E-mail bij annulering</Label>
                   <p className="text-xs text-muted-foreground">Ontvang een melding wanneer een order wordt geannuleerd.</p>
                 </div>
                 <Switch checked={notifications.cancellation} onCheckedChange={() => toggleNotification("cancellation")} />
               </div>

               <div className="flex items-center justify-between py-4 border-b border-border/40">
                 <div className="space-y-0.5 pr-4">
                   <Label className="text-sm font-medium">E-mail bij deadline overschrijding</Label>
                   <p className="text-xs text-muted-foreground">Ontvang een waarschuwing wanneer een order de geplande deadline overschrijdt.</p>
                 </div>
                 <Switch checked={notifications.deadlineExceeded} onCheckedChange={() => toggleNotification("deadlineExceeded")} />
               </div>

               <div className="flex items-center justify-between py-4 border-b border-border/40">
                 <div className="space-y-0.5 pr-4">
                   <Label className="text-sm font-medium">Dagelijkse samenvatting</Label>
                   <p className="text-xs text-muted-foreground">Ontvang elke ochtend een overzicht van de orders en activiteiten van de vorige dag.</p>
                 </div>
                 <Switch checked={notifications.dailySummary} onCheckedChange={() => toggleNotification("dailySummary")} />
               </div>

               <div className="flex items-center justify-between py-4">
                 <div className="space-y-0.5 pr-4">
                   <Label className="text-sm font-medium">Wekelijks rapport</Label>
                   <p className="text-xs text-muted-foreground">Ontvang elke maandag een wekelijks rapport met statistieken en trends.</p>
                 </div>
                 <Switch checked={notifications.weeklyReport} onCheckedChange={() => toggleNotification("weeklyReport")} />
               </div>

               <div className="pt-4 border-t border-border/40 mt-4">
                 <Button onClick={handleSaveNotifications} disabled={saveNotifications.isPending}>
                   {saveNotifications.isPending ? "Opslaan..." : "Notificaties Opslaan"}
                 </Button>
               </div>
             </CardContent>
           </Card>
        </TabsContent>

        {/* SMS Tab */}
        <TabsContent value="sms" className="outline-none">
          <Card className="rounded-2xl border-border/40">
            <CardHeader>
              <CardTitle>SMS Notificaties</CardTitle>
              <CardDescription>Stuur SMS berichten naar klanten bij belangrijke statusupdates.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Provider selection */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold">SMS Provider</Label>
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => setSmsProvider("twilio")}
                    className={cn(
                      "flex-1 rounded-lg border-2 p-4 text-left transition-all",
                      smsProvider === "twilio"
                        ? "border-primary bg-primary/5"
                        : "border-border/40 hover:border-border"
                    )}
                  >
                    <p className="text-sm font-semibold">Twilio</p>
                    <p className="text-xs text-muted-foreground mt-1">Wereldwijde SMS provider</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSmsProvider("messagebird")}
                    className={cn(
                      "flex-1 rounded-lg border-2 p-4 text-left transition-all",
                      smsProvider === "messagebird"
                        ? "border-primary bg-primary/5"
                        : "border-border/40 hover:border-border"
                    )}
                  >
                    <p className="text-sm font-semibold">MessageBird</p>
                    <p className="text-xs text-muted-foreground mt-1">Nederlandse SMS provider</p>
                  </button>
                </div>
              </div>

              {/* Provider credentials */}
              {smsProvider === "twilio" ? (
                <div className="space-y-4 rounded-lg border border-border/40 p-4">
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
                <div className="space-y-4 rounded-lg border border-border/40 p-4">
                  <div className="space-y-2">
                    <Label htmlFor="mbApiKey">API Key</Label>
                    <Input
                      id="mbApiKey"
                      type="password"
                      value={messageBirdApiKey}
                      onChange={(e) => setMessageBirdApiKey(e.target.value)}
                      placeholder="Uw MessageBird API Key"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mbOriginator">Originator</Label>
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
                <Label className="text-sm font-semibold">SMS Events</Label>
                <div className="rounded-lg border border-border/40 divide-y divide-border/30">
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
                      <Label className="text-sm font-medium">Vertraging melding</Label>
                      <p className="text-xs text-muted-foreground">Stuur een SMS bij een verwachte vertraging.</p>
                    </div>
                    <Switch checked={smsEvents.vertraging} onCheckedChange={() => toggleSmsEvent("vertraging")} />
                  </div>
                </div>
              </div>

              {/* SMS Template */}
              <div className="space-y-2">
                <Label htmlFor="smsTemplate">SMS Template</Label>
                <Textarea
                  id="smsTemplate"
                  value={smsTemplate}
                  onChange={(e) => setSmsTemplate(e.target.value)}
                  placeholder="Uw zending #{order_number} is onderweg. Verwachte levertijd: {eta}."
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Beschikbare variabelen: <code className="bg-muted px-1 rounded">{"{order_number}"}</code>, <code className="bg-muted px-1 rounded">{"{eta}"}</code>, <code className="bg-muted px-1 rounded">{"{status}"}</code>, <code className="bg-muted px-1 rounded">{"{tracking_url}"}</code>
                </p>
              </div>

              {/* Test SMS button */}
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    toast.success("Test SMS verstuurd", { description: "Een test SMS is verstuurd naar het geconfigureerde nummer.", });
                  }}
                >
                  <Smartphone className="h-4 w-4 mr-2" strokeWidth={1.5} />
                  Verstuur test SMS
                </Button>
              </div>

              {/* Save button */}
              <div className="pt-4 border-t border-border/40">
                <Button onClick={handleSaveSms} disabled={saveSms.isPending}>
                  {saveSms.isPending ? "Opslaan..." : "Opslaan"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Integraties Tab */}
        <TabsContent value="integraties" className="outline-none">
          <Card className="rounded-2xl border-border/40">
            <CardHeader>
              <CardTitle>Externe Integraties</CardTitle>
              <CardDescription>Koppel externe diensten en systemen aan uw TMS platform.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Slack */}
                <div className="rounded-xl border border-border/40 p-4 space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                        <MessageSquare className="h-4.5 w-4.5 text-purple-600" strokeWidth={1.5} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">Slack</p>
                        <p className="text-xs text-muted-foreground">Meldingen in Slack kanalen</p>
                      </div>
                    </div>
                    <Switch
                      checked={integrations.slack.enabled}
                      onCheckedChange={() => toggleIntegration("slack")}
                    />
                  </div>
                  {integrations.slack.enabled && (
                    <div className="space-y-2">
                      <Label htmlFor="slackWebhook" className="text-xs">Webhook URL</Label>
                      <Input
                        id="slackWebhook"
                        value={integrations.slack.webhookUrl}
                        onChange={(e) => updateIntegration("slack", "webhookUrl", e.target.value)}
                        placeholder="https://hooks.slack.com/services/..."
                        className="text-xs"
                      />
                    </div>
                  )}
                </div>

                {/* Microsoft Teams */}
                <div className="rounded-xl border border-border/40 p-4 space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                        <Users className="h-4.5 w-4.5 text-blue-600" strokeWidth={1.5} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">Teams</p>
                        <p className="text-xs text-muted-foreground">Microsoft Teams notificaties</p>
                      </div>
                    </div>
                    <Switch
                      checked={integrations.teams.enabled}
                      onCheckedChange={() => toggleIntegration("teams")}
                    />
                  </div>
                  {integrations.teams.enabled && (
                    <div className="space-y-2">
                      <Label htmlFor="teamsWebhook" className="text-xs">Webhook URL</Label>
                      <Input
                        id="teamsWebhook"
                        value={integrations.teams.webhookUrl}
                        onChange={(e) => updateIntegration("teams", "webhookUrl", e.target.value)}
                        placeholder="https://outlook.office.com/webhook/..."
                        className="text-xs"
                      />
                    </div>
                  )}
                </div>

                {/* Exact Online */}
                <div className="rounded-xl border border-border/40 p-4 space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                        <BookOpen className="h-4.5 w-4.5 text-emerald-600" strokeWidth={1.5} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">Exact Online</p>
                        <p className="text-xs text-muted-foreground">Boekhouding synchronisatie</p>
                      </div>
                    </div>
                    <Switch
                      checked={integrations.exactOnline.enabled}
                      onCheckedChange={() => toggleIntegration("exactOnline")}
                    />
                  </div>
                  {integrations.exactOnline.enabled && (
                    <div className="space-y-2">
                      <Label htmlFor="exactApiKey" className="text-xs">API Key</Label>
                      <Input
                        id="exactApiKey"
                        type="password"
                        value={integrations.exactOnline.apiKey}
                        onChange={(e) => updateIntegration("exactOnline", "apiKey", e.target.value)}
                        placeholder="Uw Exact Online API Key"
                        className="text-xs"
                      />
                    </div>
                  )}
                </div>

                {/* Twinfield */}
                <div className="rounded-xl border border-border/40 p-4 space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                        <FileText className="h-4.5 w-4.5 text-amber-600" strokeWidth={1.5} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">Twinfield</p>
                        <p className="text-xs text-muted-foreground">Facturatie koppeling</p>
                      </div>
                    </div>
                    <Switch
                      checked={integrations.twinfield.enabled}
                      onCheckedChange={() => toggleIntegration("twinfield")}
                    />
                  </div>
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
                </div>

                {/* Samsara */}
                <div className="rounded-xl border border-border/40 p-4 space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                        <Truck className="h-4.5 w-4.5 text-red-600" strokeWidth={1.5} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">Samsara</p>
                        <p className="text-xs text-muted-foreground">Telematica & GPS tracking</p>
                      </div>
                    </div>
                    <Switch
                      checked={integrations.samsara.enabled}
                      onCheckedChange={() => toggleIntegration("samsara")}
                    />
                  </div>
                  {integrations.samsara.enabled && (
                    <div className="space-y-2">
                      <Label htmlFor="samsaraApiKey" className="text-xs">API Key</Label>
                      <Input
                        id="samsaraApiKey"
                        type="password"
                        value={integrations.samsara.apiKey}
                        onChange={(e) => updateIntegration("samsara", "apiKey", e.target.value)}
                        placeholder="Uw Samsara API Key"
                        className="text-xs"
                      />
                    </div>
                  )}
                </div>

                {/* TransFollow */}
                <div className="rounded-xl border border-border/40 p-4 space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                        <Link className="h-4.5 w-4.5 text-indigo-600" strokeWidth={1.5} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">TransFollow</p>
                        <p className="text-xs text-muted-foreground">Digitale vrachtbrieven</p>
                      </div>
                    </div>
                    <Switch
                      checked={integrations.transfollow.enabled}
                      onCheckedChange={() => toggleIntegration("transfollow")}
                    />
                  </div>
                  {integrations.transfollow.enabled && (
                    <div className="space-y-2">
                      <Label htmlFor="transfollowApiKey" className="text-xs">API Key</Label>
                      <Input
                        id="transfollowApiKey"
                        type="password"
                        value={integrations.transfollow.apiKey}
                        onChange={(e) => updateIntegration("transfollow", "apiKey", e.target.value)}
                        placeholder="Uw TransFollow API Key"
                        className="text-xs"
                      />
                    </div>
                  )}
                </div>
              </div>
              <div className="pt-6 border-t border-border/40 mt-6">
                <Button onClick={handleSaveIntegrations} disabled={saveIntegrations.isPending}>
                  {saveIntegrations.isPending ? "Opslaan..." : "Integraties Opslaan"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Webhooks Tab */}
        <TabsContent value="webhooks" className="outline-none">
          <Card className="rounded-2xl border-border/40">
            <CardHeader>
              <CardTitle className="text-lg font-display">Outbound Webhooks</CardTitle>
              <CardDescription>Stuur automatisch meldingen naar externe systemen bij statuswijzigingen.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-lg border border-border/40 divide-y divide-border/30">
                {[
                  { event: "order.created", label: "Order aangemaakt", desc: "Wanneer een nieuwe order wordt aangemaakt" },
                  { event: "order.status_changed", label: "Status gewijzigd", desc: "Bij elke statuswijziging (PENDING → PLANNED → IN_TRANSIT → DELIVERED)" },
                  { event: "order.cancelled", label: "Order geannuleerd", desc: "Wanneer een order wordt geannuleerd" },
                  { event: "delivery.completed", label: "Levering voltooid", desc: "Wanneer een chauffeur de levering bevestigt met handtekening" },
                  { event: "invoice.created", label: "Factuur aangemaakt", desc: "Wanneer een nieuwe factuur wordt gegenereerd" },
                ].map((wh) => (
                  <div key={wh.event} className="flex items-center justify-between p-4">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">{wh.label}</p>
                      <p className="text-xs text-muted-foreground">{wh.desc}</p>
                      <code className="text-xs font-mono text-muted-foreground/60">{wh.event}</code>
                    </div>
                    <Switch />
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-semibold">Webhook URL</Label>
                <div className="flex gap-2">
                  <Input placeholder="https://jouw-systeem.nl/webhook" className="flex-1" />
                  <Button onClick={() => toast.success("Webhook URL opgeslagen")}>Opslaan</Button>
                </div>
                <p className="text-xs text-muted-foreground">Alle geselecteerde events worden als POST request naar deze URL gestuurd met een JSON payload.</p>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-semibold">Webhook Secret</Label>
                <div className="flex gap-2">
                  <Input type="password" placeholder="whsec_..." className="flex-1 font-mono" />
                  <Button variant="outline" onClick={() => toast.success("Webhook secret gegenereerd", { description: "whsec_" + Math.random().toString(36).slice(2, 18) })}>Genereer</Button>
                </div>
                <p className="text-xs text-muted-foreground">Optioneel. Wordt meegestuurd als X-Webhook-Secret header voor verificatie.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* API Tab */}
        <TabsContent value="api" className="outline-none">
          <Card className="rounded-2xl border-border/40">
            <CardHeader>
              <CardTitle className="text-lg font-display">API Toegang</CardTitle>
              <CardDescription>Beheer API keys voor externe integraties met je TMS.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <Label className="text-sm font-semibold">API Key</Label>
                <div className="flex gap-2">
                  <Input type="password" value="sk_live_••••••••••••••••••••••" readOnly className="flex-1 font-mono text-sm" />
                  <Button variant="outline" onClick={() => { navigator.clipboard.writeText("sk_live_demo_key_placeholder"); toast.success("API key gekopieerd"); }}>Kopieer</Button>
                  <Button variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => toast.success("API key hernieuwd", { description: "De oude key is ongeldig gemaakt." })}>Hernieuw</Button>
                </div>
                <p className="text-xs text-muted-foreground">Gebruik deze key in de Authorization header: <code className="bg-muted px-1 rounded">Bearer sk_live_...</code></p>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-semibold">API Endpoints</Label>
                <div className="rounded-lg border border-border/40 divide-y divide-border/30 font-mono text-sm">
                  {[
                    { method: "POST", path: "/api/orders", desc: "Order aanmaken" },
                    { method: "GET", path: "/api/orders/:id", desc: "Order ophalen" },
                    { method: "PATCH", path: "/api/orders/:id/status", desc: "Status wijzigen" },
                    { method: "GET", path: "/api/track/:order_number", desc: "Track & Trace (publiek)" },
                    { method: "GET", path: "/api/vehicles", desc: "Voertuigen ophalen" },
                    { method: "GET", path: "/api/drivers", desc: "Chauffeurs ophalen" },
                  ].map((ep) => (
                    <div key={ep.path} className="flex items-center gap-3 p-3">
                      <span className={cn(
                        "text-xs font-bold px-2 py-0.5 rounded uppercase",
                        ep.method === "POST" ? "bg-emerald-100 text-emerald-700" :
                        ep.method === "PATCH" ? "bg-amber-100 text-amber-700" :
                        "bg-blue-100 text-blue-700"
                      )}>{ep.method}</span>
                      <span className="text-xs flex-1">{ep.path}</span>
                      <span className="text-xs text-muted-foreground">{ep.desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg bg-muted/30 border border-border/30 p-4">
                <p className="text-sm font-semibold mb-2">Voorbeeld request</p>
                <pre className="text-xs text-muted-foreground bg-background rounded p-3 overflow-x-auto">{`curl -X POST https://api.royaltycargo.nl/orders \\
  -H "Authorization: Bearer sk_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "client_name": "Van der Berg Logistics",
    "pickup_address": "Transportweg 12, Rotterdam",
    "delivery_address": "Industrieweg 50, Nieuwegein",
    "quantity": 10,
    "unit": "Pallets",
    "weight_kg": 4000
  }'`}</pre>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tarieven" className="space-y-6">
          <RateCardSettings />
          <SurchargeSettings />
        </TabsContent>

        <TabsContent value="kosten" className="space-y-6">
          <FuelPriceSettings />
          <CostTypeSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Settings;
