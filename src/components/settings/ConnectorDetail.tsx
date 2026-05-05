import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, ExternalLink, RefreshCw, CheckCircle2, XCircle, Clock,
  Sparkles, Zap, Activity, BookOpen, Settings as SettingsIcon,
  ArrowLeftRight, ScrollText, Lock, KeyRound, Webhook, Radio, Globe2,
  ChevronRight, AlertTriangle, Filter, ChevronDown, Copy, Check, GripVertical, X,
  Wand2, ShieldAlert, ShieldCheck, RotateCcw, Info,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { findConnector, CATEGORY_LABELS } from "@/lib/connectors/catalog";
import { getSourceFields, type ConnectorSourceField } from "@/lib/connectors/sourceFields";
import { getMappingTemplates } from "@/lib/connectors/mappingTemplates";
import {
  useConnectorList,
  useConnectorMapping,
  useSaveConnectorMapping,
  useConnectorSyncLog,
  useTestConnector,
  usePullConnector,
  startExactOAuth,
  type SyncLogRow,
} from "@/hooks/useConnectors";
import {
  useIntegrationCredentials,
  useSaveIntegrationCredentials,
  type IntegrationEnvironment,
  type IntegrationProvider,
} from "@/hooks/useIntegrationCredentials";
import { SyncPoliciesPanel } from "@/components/settings/connectors/SyncPoliciesPanel";
import { TokenExpiryBanner } from "@/components/settings/connectors/TokenExpiryBanner";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
// Marketplace fase 4 toevoegingen, additief.
import { SyncGraphs } from "@/components/settings/connectors/SyncGraphs";
import { ThresholdTab } from "@/components/settings/connectors/ThresholdTab";
import { AuditTab } from "@/components/settings/connectors/AuditTab";
import { WebhookReplayDialog } from "@/components/settings/connectors/WebhookReplayDialog";
import { useReplaySyncEventsBulk } from "@/hooks/useReplaySyncEvent";
import { Checkbox } from "@/components/ui/checkbox";

function defaultExactRedirectUri(): string {
  const raw = String(import.meta.env.VITE_SUPABASE_URL ?? "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw);
    // Ondersteun zowel <ref>.supabase.co als zelf-gehoste varianten.
    return `${u.protocol}//${u.host}/functions/v1/oauth-callback-exact`;
  } catch {
    return "";
  }
}

interface Props {
  slug: string;
  onBack: () => void;
}

type TabKey = "overzicht" | "configuratie" | "mapping" | "log" | "thresholds" | "audit";

const BASE_TABS: Array<{ key: TabKey; label: string; icon: ReactNode }> = [
  { key: "overzicht", label: "Overzicht", icon: <BookOpen className="h-3.5 w-3.5" /> },
  { key: "configuratie", label: "Configuratie", icon: <SettingsIcon className="h-3.5 w-3.5" /> },
  { key: "mapping", label: "Mapping", icon: <ArrowLeftRight className="h-3.5 w-3.5" /> },
  { key: "log", label: "Sync-log", icon: <ScrollText className="h-3.5 w-3.5" /> },
  { key: "thresholds", label: "Drempels", icon: <ShieldAlert className="h-3.5 w-3.5" /> },
];

const ADMIN_TABS: Array<{ key: TabKey; label: string; icon: ReactNode }> = [
  { key: "audit", label: "Audit", icon: <ShieldCheck className="h-3.5 w-3.5" /> },
];

const CAPABILITY_ICON: Array<{ test: (cap: string) => boolean; icon: ReactNode }> = [
  { test: (c) => /oauth/i.test(c), icon: <Lock className="h-3 w-3" /> },
  { test: (c) => /api[\s-]?key/i.test(c), icon: <KeyRound className="h-3 w-3" /> },
  { test: (c) => /webhook/i.test(c), icon: <Webhook className="h-3 w-3" /> },
  { test: (c) => /realtime/i.test(c), icon: <Radio className="h-3 w-3" /> },
  { test: (c) => /bidirectioneel/i.test(c), icon: <ArrowLeftRight className="h-3 w-3" /> },
  { test: (c) => /(NL|BE|EU|wereldwijd|cloud)/i.test(c), icon: <Globe2 className="h-3 w-3" /> },
  { test: (c) => /push|sync/i.test(c), icon: <Zap className="h-3 w-3" /> },
];

function capabilityIcon(cap: string): ReactNode {
  return CAPABILITY_ICON.find((m) => m.test(cap))?.icon ?? <Sparkles className="h-3 w-3" />;
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s geleden`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min geleden`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} u geleden`;
  const days = Math.floor(hr / 24);
  return `${days} d geleden`;
}

export function ConnectorDetail({ slug, onBack }: Props) {
  const connector = findConnector(slug);
  const list = useConnectorList();
  const live = list.data?.find((c) => c.slug === slug);
  const log = useConnectorSyncLog(slug);
  const test = useTestConnector(slug);
  const pull = usePullConnector(slug);
  const auth = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>("overzicht");
  const [environment, setEnvironment] = useState<IntegrationEnvironment>("live");
  // Voor de OAuth-token-banner halen we de live-credentials op zodat we
  // expires_at, client_id en redirect_uri kunnen tonen zonder dat de
  // gebruiker eerst de Configuratie-tab moet openen. Andere environments
  // hebben hun eigen credentials-set.
  const liveCreds = useIntegrationCredentials(
    slug as IntegrationProvider,
    environment,
    { enabled: connector?.authType === "oauth2" },
  );

  const tabs = useMemo(() => {
    return auth.isAdmin ? [...BASE_TABS, ...ADMIN_TABS] : BASE_TABS;
  }, [auth.isAdmin]);

  const lastSync = log.data?.[0];
  const stats = useMemo(() => {
    const rows = log.data ?? [];
    const total = rows.length;
    const success = rows.filter((r) => r.status === "SUCCESS").length;
    const failed = rows.filter((r) => r.status === "FAILED").length;
    const successRate = total === 0 ? null : Math.round((success / total) * 100);
    const avgDuration = rows.filter((r) => r.duration_ms != null).reduce((s, r) => s + (r.duration_ms ?? 0), 0) / Math.max(1, rows.filter((r) => r.duration_ms != null).length);
    return { total, success, failed, successRate, avgDuration: rows.length === 0 ? null : Math.round(avgDuration) };
  }, [log.data]);

  if (!connector) {
    return (
      <div className="card--luxe p-6">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Terug naar marketplace
        </Button>
        <p className="mt-4 text-sm text-muted-foreground">Onbekende connector: {slug}</p>
      </div>
    );
  }

  const isSoon = connector.status === "soon";
  const isLive = (live?.enabled ?? false) && (live?.hasCredentials ?? false);

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs font-display font-semibold text-[hsl(var(--gold-deep))] hover:gap-2 transition-all"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Terug naar marketplace
      </button>

      {/* HERO */}
      <Hero
        connector={connector}
        isLive={isLive}
        lastSync={lastSync ?? null}
        stats={stats}
        onTest={() => test.mutate()}
        testing={test.isPending}
        onPull={() => pull.mutate(undefined)}
        pulling={pull.isPending}
      />

      {!isSoon && connector.authType === "oauth2" && (
        <TokenExpiryBanner
          provider={slug}
          expiresAt={liveCreds.data?.expiresAt ?? null}
          clientId={(liveCreds.data?.credentials as Record<string, unknown> | undefined)?.clientId as string | undefined}
          redirectUri={(liveCreds.data?.credentials as Record<string, unknown> | undefined)?.redirectUri as string | undefined}
        />
      )}

      {isSoon ? (
        <RoadmapBody connector={connector} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
          <div className="space-y-4">
            {/* TABS */}
            <div className="flex flex-wrap gap-1.5 border-b border-[hsl(var(--gold)/0.18)]">
              {tabs.map((t) => {
                const active = activeTab === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setActiveTab(t.key)}
                    className={cn(
                      "h-10 px-4 text-xs font-display font-semibold inline-flex items-center gap-1.5 transition-all border-b-2 -mb-px",
                      active
                        ? "border-[hsl(var(--gold-deep))] text-[hsl(var(--gold-deep))]"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t.icon}
                    {t.label}
                  </button>
                );
              })}
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18 }}
              >
                {activeTab === "overzicht" && <OverviewTab slug={slug} />}
                {activeTab === "configuratie" && (
                  <ConnectionTab
                    slug={slug as IntegrationProvider}
                    environment={environment}
                    onEnvironmentChange={setEnvironment}
                  />
                )}
                {activeTab === "mapping" && <MappingTab slug={slug} />}
                {activeTab === "log" && <LogTab slug={slug} />}
                {activeTab === "thresholds" && <ThresholdTab slug={slug} />}
                {activeTab === "audit" && auth.isAdmin && <AuditTab slug={slug} />}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* SIDEBAR */}
          <Sidebar
            slug={slug}
            log={log.data ?? []}
            stats={stats}
            isLive={isLive}
            onPull={() => pull.mutate(undefined)}
            pulling={pull.isPending}
          />
        </div>
      )}
    </div>
  );
}

// ─── Hero ────────────────────────────────────────────────────────────

function Hero({
  connector,
  isLive,
  lastSync,
  stats,
  onTest,
  testing,
  onPull,
  pulling,
}: {
  connector: ReturnType<typeof findConnector> & object;
  isLive: boolean;
  lastSync: SyncLogRow | null;
  stats: { total: number; success: number; failed: number; successRate: number | null; avgDuration: number | null };
  onTest: () => void;
  testing: boolean;
  onPull: () => void;
  pulling: boolean;
}) {
  const isSoon = connector.status === "soon";
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="relative overflow-hidden rounded-[28px] border border-[hsl(var(--gold)/0.25)] bg-gradient-to-br from-white via-[hsl(var(--gold-soft)/0.25)] to-white p-6 sm:p-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_30px_60px_-30px_rgba(0,0,0,0.18)]"
    >
      <div
        aria-hidden
        className="absolute top-0 inset-x-0 h-1.5"
        style={{ backgroundColor: `#${connector.brandColor}` }}
      />
      <div
        aria-hidden
        className="absolute -top-24 -right-24 h-72 w-72 rounded-full blur-3xl pointer-events-none opacity-40"
        style={{ backgroundColor: `#${connector.brandColor}` }}
      />

      <div className="relative flex flex-col sm:flex-row sm:items-start gap-5">
        <BrandTile connector={connector} size={88} />

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-[10px] font-display font-semibold uppercase tracking-[0.22em] text-[hsl(var(--gold-deep))]">
              {CATEGORY_LABELS[connector.category]}
            </span>
            {connector.badge && (
              <Badge
                variant="outline"
                className="text-[9px] font-display font-bold uppercase tracking-[0.18em] border-[hsl(var(--gold)/0.3)] bg-white text-[hsl(var(--gold-deep))]"
              >
                {connector.badge.toUpperCase()}
              </Badge>
            )}
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-foreground leading-tight">
            {connector.name}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-2xl leading-relaxed">
            {connector.description}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <StatusPill isLive={isLive} status={connector.status} />
            {!isSoon && lastSync && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Clock className="h-3 w-3" />
                Laatst gesynchroniseerd: {formatRelative(lastSync.started_at)}
              </span>
            )}
            {!isSoon && stats.successRate !== null && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-700">
                <CheckCircle2 className="h-3 w-3" />
                {stats.successRate}% success rate · {stats.total} events
              </span>
            )}
          </div>

          {!isSoon && (
            <div className="mt-5 flex flex-wrap gap-2">
              {isLive ? (
                <>
                  <Button
                    onClick={onTest}
                    disabled={testing}
                    className="h-10 px-4 rounded-xl text-xs font-display font-semibold bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-deep))] text-white shadow-md hover:opacity-95 gap-1.5"
                  >
                    {testing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
                    Test verbinding
                  </Button>
                  {connector.slug === "nostradamus" && (
                    <Button
                      variant="outline"
                      onClick={onPull}
                      disabled={pulling}
                      className="h-10 px-4 rounded-xl text-xs font-display font-semibold border-[hsl(var(--gold)/0.3)] gap-1.5"
                    >
                      <RefreshCw className={cn("h-3.5 w-3.5", pulling && "animate-spin")} />
                      Sync nu
                    </Button>
                  )}
                </>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  Open de Configuratie-tab om verbinding te maken.
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function StatusPill({ isLive, status }: { isLive: boolean; status: string }) {
  if (isLive) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 h-6 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-display font-semibold text-emerald-700">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        Verbonden
      </span>
    );
  }
  if (status === "beta") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 h-6 rounded-full bg-amber-50 border border-amber-200 text-[11px] font-display font-semibold text-amber-700">
        Beta
      </span>
    );
  }
  if (status === "soon") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 h-6 rounded-full bg-slate-100 border border-slate-200 text-[11px] font-display font-semibold text-slate-600">
        <Clock className="h-3 w-3" />
        Roadmap
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 h-6 rounded-full bg-white border border-[hsl(var(--gold)/0.25)] text-[11px] font-display font-semibold text-muted-foreground">
      Niet verbonden
    </span>
  );
}

function BrandTile({
  connector,
  size = 56,
}: {
  connector: { logoUrl?: string; brandColor: string; brandInitial: string };
  size?: number;
}) {
  const radius = Math.round(size * 0.27);
  if (connector.logoUrl) {
    return (
      <div
        className="bg-white border border-[hsl(var(--gold)/0.22)] flex items-center justify-center overflow-hidden shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_4px_12px_rgba(0,0,0,0.08)]"
        style={{ width: size, height: size, borderRadius: radius }}
        aria-hidden="true"
      >
        <img src={connector.logoUrl} alt="" className="h-full w-full object-contain" />
      </div>
    );
  }
  return (
    <div
      className="flex items-center justify-center text-white font-display font-bold tracking-tight shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_2px_6px_rgba(0,0,0,0.12)]"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: `#${connector.brandColor}`,
        fontSize: size * 0.32,
      }}
      aria-hidden="true"
    >
      {connector.brandInitial}
    </div>
  );
}

// ─── Roadmap body ────────────────────────────────────────────────────

function RoadmapBody({ connector }: { connector: NonNullable<ReturnType<typeof findConnector>> }) {
  return (
    <div className="card--luxe p-6 space-y-5">
      <div className="flex items-start gap-3">
        <span className="h-10 w-10 rounded-xl bg-[hsl(var(--gold-soft))] flex items-center justify-center text-[hsl(var(--gold-deep))] shrink-0">
          <Sparkles className="h-5 w-5" />
        </span>
        <div>
          <p className="text-base font-display font-semibold text-foreground">Op de productroadmap</p>
          <p className="text-sm text-muted-foreground mt-1">
            Deze koppeling staat aangekondigd, we werken aan de uitrol. Tot die tijd tonen we hier nog geen Configuratie- of Sync-instellingen. Wil je dat we 'm versnellen? Stuur een verzoek via Vraag aan op de marketplace-pagina.
          </p>
        </div>
      </div>
      <div className="rounded-2xl border border-[hsl(var(--gold)/0.18)] bg-white p-4">
        <p className="text-[11px] font-display font-semibold uppercase tracking-[0.22em] text-[hsl(var(--gold-deep))] mb-2">Capability</p>
        <div className="flex flex-wrap gap-1.5">
          {(connector.capabilities ?? []).map((cap) => (
            <span
              key={cap}
              className="inline-flex h-6 items-center gap-1 px-2 rounded-full bg-[hsl(var(--gold-soft)/0.55)] text-[hsl(var(--gold-deep))] text-[10px] font-display font-semibold"
            >
              {capabilityIcon(cap)}
              {cap}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Tabs ────────────────────────────────────────────────────────────

function OverviewTab({ slug }: { slug: string }) {
  const connector = findConnector(slug)!;
  return (
    <div className="space-y-5">
      <div className="card--luxe p-5 space-y-4">
        <h3 className="text-base font-display font-semibold tracking-tight">Over deze koppeling</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{connector.description}</p>
        <p className="text-sm text-muted-foreground leading-relaxed">{connector.setupHint}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card--luxe p-5">
          <p className="text-[11px] font-display font-semibold uppercase tracking-[0.22em] text-[hsl(var(--gold-deep))] mb-3">Capabilities</p>
          <div className="flex flex-wrap gap-1.5">
            {(connector.capabilities ?? []).length > 0 ? (
              (connector.capabilities ?? []).map((cap) => (
                <span
                  key={cap}
                  className="inline-flex h-7 items-center gap-1.5 px-3 rounded-full bg-[hsl(var(--gold-soft)/0.55)] text-[hsl(var(--gold-deep))] text-[11px] font-display font-semibold"
                >
                  {capabilityIcon(cap)}
                  {cap}
                </span>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">Geen capability-tags gespecificeerd.</p>
            )}
          </div>
        </div>

        <div className="card--luxe p-5">
          <p className="text-[11px] font-display font-semibold uppercase tracking-[0.22em] text-[hsl(var(--gold-deep))] mb-3">Supported events</p>
          {connector.supportedEvents.length > 0 ? (
            <div className="space-y-1.5">
              {connector.supportedEvents.map((e) => (
                <div key={e} className="flex items-center justify-between rounded-xl border border-[hsl(var(--gold)/0.18)] bg-white px-3 py-2">
                  <code className="text-xs font-mono text-foreground">{e}</code>
                  <Badge variant="outline" className="text-[9px] font-display font-bold uppercase tracking-[0.18em] border-emerald-200 bg-emerald-50 text-emerald-700">
                    Live
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Deze connector werkt op pull-basis, geen push-events.</p>
          )}
        </div>
      </div>

      <div className="card--luxe p-5">
        <p className="text-[11px] font-display font-semibold uppercase tracking-[0.22em] text-[hsl(var(--gold-deep))] mb-3">Wat heb je nodig</p>
        <ul className="space-y-2">
          {checklistItems(connector).map((item, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm text-foreground">
              <span className="h-5 w-5 rounded-full bg-[hsl(var(--gold-soft))] text-[hsl(var(--gold-deep))] flex items-center justify-center mt-0.5 shrink-0">
                <Check className="h-3 w-3" strokeWidth={2.5} />
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function checklistItems(connector: NonNullable<ReturnType<typeof findConnector>>): string[] {
  if (connector.authType === "oauth2") {
    return [
      "App-registratie bij de provider met Client ID en Client Secret",
      "Redirect-URI naar de OrderFlow OAuth callback",
      "Toegang tot de juiste administratie of werkmaatschappij",
    ];
  }
  if (connector.authType === "api_key") {
    return [
      "Een geldige API-key uit de provider-omgeving",
      "Eventueel een base-URL of endpoint-pad",
      "Personeels- of administratie-id voor het mappen van records",
    ];
  }
  return [
    "Client Key, Subscription Key en Administratie-ID",
    "Toegangsrechten op de administratie",
  ];
}

// ─── Configuratie tab (bestaande connection forms) ──────────────────

function ConnectionTab({
  slug,
  environment,
  onEnvironmentChange,
}: {
  slug: IntegrationProvider;
  environment: IntegrationEnvironment;
  onEnvironmentChange: (env: IntegrationEnvironment) => void;
}) {
  const connector = findConnector(slug)!;
  const creds = useIntegrationCredentials(slug, environment);
  const save = useSaveIntegrationCredentials(slug, environment);
  const test = useTestConnector(slug);

  let form: ReactNode;
  if (slug === "exact_online") {
    form = (
      <ExactConnectionForm
        setupHint={connector.setupHint}
        creds={creds.data?.credentials ?? {}}
        enabled={creds.data?.enabled ?? false}
        onSave={(c, en) => save.mutateAsync({ enabled: en, credentials: c })}
        onTest={() => test.mutate()}
        saving={save.isPending}
        testing={test.isPending}
      />
    );
  } else if (slug === "nostradamus") {
    form = (
      <NostradamusConnectionForm
        setupHint={connector.setupHint}
        creds={creds.data?.credentials ?? {}}
        enabled={creds.data?.enabled ?? false}
        onSave={(c, en) => save.mutateAsync({ enabled: en, credentials: c })}
        onTest={() => test.mutate()}
        saving={save.isPending}
        testing={test.isPending}
      />
    );
  } else {
    form = (
      <SnelstartConnectionForm
        setupHint={connector.setupHint}
        creds={creds.data?.credentials ?? {}}
        enabled={creds.data?.enabled ?? false}
        onSave={(c, en) => save.mutateAsync({ enabled: en, credentials: c })}
        onTest={() => test.mutate()}
        saving={save.isPending}
        testing={test.isPending}
      />
    );
  }

  return (
    <div className="space-y-5">
      <EnvironmentToggle value={environment} onChange={onEnvironmentChange} />
      {form}
      <SyncPoliciesPanel slug={slug} />
    </div>
  );
}

function EnvironmentToggle({
  value,
  onChange,
}: {
  value: IntegrationEnvironment;
  onChange: (env: IntegrationEnvironment) => void;
}) {
  const options: Array<{ key: IntegrationEnvironment; label: string; hint: string }> = [
    { key: "test", label: "Test", hint: "Sandbox-credentials, geen invloed op productie" },
    { key: "live", label: "Live", hint: "Echte productie-koppeling met klantdata" },
  ];
  return (
    <div className="card--luxe p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div>
        <p className="text-[11px] font-display font-semibold uppercase tracking-[0.22em] text-[hsl(var(--gold-deep))]">
          Omgeving
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Test- en Live-credentials worden apart bewaard. Wisselen wijzigt
          uitsluitend wat je hieronder ziet, niet wat actief is.
        </p>
      </div>
      <div
        role="tablist"
        aria-label="Omgeving"
        className="inline-flex p-1 rounded-2xl border border-[hsl(var(--gold)/0.25)] bg-white shrink-0"
      >
        {options.map((opt) => {
          const active = value === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(opt.key)}
              title={opt.hint}
              className={cn(
                "h-8 px-4 rounded-xl text-xs font-display font-semibold transition-all",
                active
                  ? "bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-deep))] text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ExactConnectionForm({
  setupHint,
  creds,
  enabled,
  onSave,
  onTest,
  saving,
  testing,
}: {
  setupHint: string;
  creds: Record<string, unknown>;
  enabled: boolean;
  onSave: (c: Record<string, unknown>, en: boolean) => Promise<void>;
  onTest: () => void;
  saving: boolean;
  testing: boolean;
}) {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const defaultRedirect = useMemo(() => defaultExactRedirectUri(), []);
  const [clientId, setClientId] = useState((creds.clientId as string) ?? "");
  const [clientSecret, setClientSecret] = useState("");
  const [redirectUri, setRedirectUri] = useState(
    (creds.redirectUri as string) ?? defaultRedirect ?? "",
  );
  const [divisionId, setDivisionId] = useState((creds.divisionId as string) ?? "");
  const [active, setActive] = useState(enabled);
  const [oauthOpen, setOauthOpen] = useState(false);
  const [oauthStep, setOauthStep] = useState(0);
  const [copied, setCopied] = useState(false);
  const [oauthSuccess, setOauthSuccess] = useState(false);
  // Snapshot van hasStoredSecrets bij modal-open, zodat polling kan zien dat er
  // nieuw werd opgeslagen na de OAuth-flow (transition false -> true).
  const storedAtOpenRef = useRef<boolean>(false);

  useEffect(() => {
    setClientId((creds.clientId as string) ?? "");
    setRedirectUri(
      (creds.redirectUri as string) || defaultRedirect || "",
    );
    setDivisionId((creds.divisionId as string) ?? "");
    setActive(enabled);
  }, [creds, enabled, defaultRedirect]);

  const hasStoredSecrets = creds.__hasStoredSecrets === true;
  const hasCreds = Boolean(enabled || hasStoredSecrets);
  const canStartOAuth = Boolean(tenant && clientId.trim() && redirectUri.trim());

  // Detect OAuth-callback success via BroadcastChannel (primair).
  useEffect(() => {
    if (!oauthOpen) return;
    if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return;
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel("orderflow-oauth");
    } catch {
      return;
    }
    const onMessage = (ev: MessageEvent) => {
      const data = ev.data as { ok?: boolean; provider?: string } | null;
      if (!data || data.provider !== "exact_online") return;
      if (data.ok) {
        markSuccess();
      }
    };
    bc.addEventListener("message", onMessage);
    return () => {
      bc?.removeEventListener("message", onMessage);
      bc?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oauthOpen]);

  // Polling-fallback wanneer BroadcastChannel niet beschikbaar of cross-origin niet aankomt.
  useEffect(() => {
    if (!oauthOpen || oauthSuccess) return;
    const interval = window.setInterval(() => {
      // Vraag de credentials-query opnieuw, en kijk of hasStoredSecrets sinds open
      // van false naar true is gegaan.
      queryClient
        .invalidateQueries({ queryKey: ["integration_credentials", tenant?.id, "exact_online"] })
        .catch(() => {});
    }, 2000);
    return () => window.clearInterval(interval);
  }, [oauthOpen, oauthSuccess, queryClient, tenant?.id]);

  // Detect transition false -> true via creds-prop (na invalidate refetcht parent).
  useEffect(() => {
    if (!oauthOpen || oauthSuccess) return;
    if (!storedAtOpenRef.current && hasStoredSecrets) {
      markSuccess();
    }
  }, [oauthOpen, oauthSuccess, hasStoredSecrets]);

  function markSuccess() {
    setOauthSuccess(true);
    setOauthStep(2);
    queryClient.invalidateQueries({
      queryKey: ["integration_credentials", tenant?.id, "exact_online"],
    });
    // Modal blijft 2s open met "Verbonden"-bevestiging, dan automatisch sluiten.
    window.setTimeout(() => {
      setOauthOpen(false);
    }, 2000);
  }

  const handleStartOAuth = async () => {
    if (!tenant) return;
    storedAtOpenRef.current = hasStoredSecrets;
    setOauthSuccess(false);
    setOauthOpen(true);
    setOauthStep(0);
    try {
      const url = await startExactOAuth({
        tenantId: tenant.id,
        clientId,
        redirectUri,
      });
      if (!url) {
        toast.error("Vul eerst Client ID en Redirect URI in");
        setOauthOpen(false);
        return;
      }
      setOauthStep(1);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error("Exact-koppeling starten mislukt", {
        description: e instanceof Error ? e.message : String(e),
      });
      setOauthOpen(false);
    }
  };

  const saveExact = async () => {
    try {
      await onSave(
        { ...creds, clientId, clientSecret, redirectUri, divisionId },
        active,
      );
      setClientSecret("");
      toast.success("Configuratie opgeslagen");
    } catch (error) {
      toast.error("Opslaan mislukt", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const copyRedirect = () => {
    if (!redirectUri) return;
    navigator.clipboard.writeText(redirectUri);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="card--luxe p-5 space-y-5">
      <div className="rounded-xl border border-[hsl(var(--gold)/0.18)] bg-[hsl(var(--gold-soft)/0.3)] p-3 text-xs text-foreground/80 leading-relaxed">
        {setupHint}
      </div>

      <div className="flex items-center justify-between p-3 rounded-xl border border-[hsl(var(--gold)/0.18)] bg-white">
        <div>
          <Label className="text-sm font-display font-semibold">Connector actief</Label>
          <p className="text-[11px] text-muted-foreground">Pauzeer hier zonder credentials te verwijderen.</p>
        </div>
        <Switch checked={active} onCheckedChange={setActive} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Client ID" id="exact-client-id" value={clientId} onChange={setClientId} />
        <Field label="Client Secret" id="exact-client-secret" type="password" value={clientSecret} onChange={setClientSecret} placeholder={hasStoredSecrets ? "Leeg laten behoudt huidige secret" : ""} />
        <div className="space-y-1.5 sm:col-span-2">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="exact-redirect-uri" className="text-xs font-display font-semibold uppercase tracking-[0.16em] text-muted-foreground">Redirect URI</Label>
            {defaultRedirect && redirectUri === defaultRedirect && (
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[hsl(var(--gold-soft))] text-[hsl(var(--gold-deep))] cursor-help"
                      aria-label="Auto-gegenereerd voor jouw Supabase-project"
                    >
                      <Info className="h-2.5 w-2.5" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-[11px]">
                    Auto-gegenereerd voor jouw Supabase-project
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <div className="relative">
            <Input
              id="exact-redirect-uri"
              value={redirectUri}
              onChange={(e) => setRedirectUri(e.target.value)}
              placeholder="https://<project>.supabase.co/functions/v1/oauth-callback-exact"
              className="pr-10"
            />
            {redirectUri && (
              <button
                type="button"
                onClick={copyRedirect}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-[hsl(var(--gold-soft)/0.5)] transition-colors"
                aria-label="Kopieer URI"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>
            )}
          </div>
        </div>
        <Field label="Division ID" id="exact-division-id" value={divisionId} onChange={setDivisionId} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={saveExact} disabled={saving} className="gap-1.5">
          {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          {saving ? "Opslaan..." : "Configuratie opslaan"}
        </Button>
        {canStartOAuth && (
          <Button onClick={handleStartOAuth} variant="outline" className="gap-1.5 border-[hsl(var(--gold)/0.35)]">
            <ExternalLink className="h-3.5 w-3.5" />
            {hasCreds ? "Opnieuw verbinden met Exact" : "Verbind via OAuth"}
          </Button>
        )}
        {hasCreds && (
          <Button variant="outline" onClick={onTest} disabled={testing} className="gap-1.5">
            <Activity className="h-3.5 w-3.5" />
            {testing ? "Testen..." : "Test verbinding"}
          </Button>
        )}
      </div>

      <Dialog open={oauthOpen} onOpenChange={setOauthOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display tracking-tight">OAuth-flow</DialogTitle>
            <DialogDescription>Verbind je Exact Online-account met OrderFlow in 3 stappen.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Stepper
              steps={["Inloggen bij Exact", "Toegang verlenen", "Klaar"]}
              active={oauthSuccess ? 2 : oauthStep}
            />
            <div
              className={cn(
                "rounded-xl border p-3 text-xs leading-relaxed",
                oauthSuccess
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-[hsl(var(--gold)/0.18)] bg-[hsl(var(--gold-soft)/0.3)] text-foreground/80",
              )}
            >
              {oauthSuccess ? (
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Verbonden met Exact Online. Dit venster sluit automatisch.
                </span>
              ) : oauthStep < 2 ? (
                <>Het Exact Online inlog-venster is geopend in een nieuw tabblad. Log in en bevestig dat OrderFlow toegang krijgt tot je administratie. Daarna word je terug gestuurd, en wordt deze melding automatisch gesloten.</>
              ) : (
                <>Je Exact Online-koppeling is actief. Test 'm via de Test verbinding-knop in deze tab.</>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setOauthOpen(false)}>Sluiten</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NostradamusConnectionForm({
  setupHint,
  creds,
  enabled,
  onSave,
  onTest,
  saving,
  testing,
}: {
  setupHint?: string;
  creds: Record<string, unknown>;
  enabled: boolean;
  onSave: (c: Record<string, unknown>, en: boolean) => Promise<void>;
  onTest: () => void;
  saving: boolean;
  testing: boolean;
}) {
  const [baseUrl, setBaseUrl] = useState((creds.baseUrl as string) ?? "");
  const [endpointPath, setEndpointPath] = useState((creds.endpointPath as string) ?? "");
  const [apiToken, setApiToken] = useState((creds.apiToken as string) ?? "");
  const [tokenHeader, setTokenHeader] = useState((creds.tokenHeader as string) ?? "Authorization");
  const [tokenPrefix, setTokenPrefix] = useState((creds.tokenPrefix as string) ?? "Bearer");
  const [sinceParam, setSinceParam] = useState((creds.sinceParam as string) ?? "since");
  const [untilParam, setUntilParam] = useState((creds.untilParam as string) ?? "until");
  const [mockMode, setMockMode] = useState(creds.mockMode === true);
  const [active, setActive] = useState(enabled);

  const save = async () => {
    try {
      await onSave(
        { baseUrl, endpointPath, apiToken, tokenHeader, tokenPrefix, sinceParam, untilParam, mockMode },
        active,
      );
      toast.success("Opgeslagen");
    } catch (e) {
      toast.error("Opslaan mislukt", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  return (
    <div className="card--luxe p-5 space-y-5">
      {setupHint && (
        <div className="rounded-xl border border-[hsl(var(--gold)/0.18)] bg-[hsl(var(--gold-soft)/0.3)] p-3 text-xs text-foreground/80 leading-relaxed">
          {setupHint}
        </div>
      )}

      <div className="flex items-center justify-between p-3 rounded-xl border border-[hsl(var(--gold)/0.18)] bg-white">
        <div>
          <Label className="text-sm font-display font-semibold">Connector actief</Label>
          <p className="text-[11px] text-muted-foreground">Pauzeer hier zonder credentials te verwijderen.</p>
        </div>
        <Switch checked={active} onCheckedChange={setActive} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Basis-URL" id="nostra-base-url" value={baseUrl} onChange={setBaseUrl} placeholder="https://api.example.com" />
        <Field label="Endpoint-pad" id="nostra-endpoint" value={endpointPath} onChange={setEndpointPath} placeholder="/hours/worked" />
        <Field label="API-token" id="nostra-token" type="password" value={apiToken} onChange={setApiToken} className="sm:col-span-2" />
        <Field label="Token-header" id="nostra-token-header" value={tokenHeader} onChange={setTokenHeader} placeholder="Authorization" />
        <Field label="Token-prefix" id="nostra-token-prefix" value={tokenPrefix} onChange={setTokenPrefix} placeholder="Bearer" />
        <Field label="Queryparam vanaf" id="nostra-since-param" value={sinceParam} onChange={setSinceParam} placeholder="since" />
        <Field label="Queryparam t/m" id="nostra-until-param" value={untilParam} onChange={setUntilParam} placeholder="until" />
      </div>

      <div className="flex items-center justify-between p-3 rounded-xl border border-[hsl(var(--gold)/0.18)] bg-white">
        <div>
          <Label className="text-sm font-display font-semibold">Mock-modus</Label>
          <p className="text-[11px] text-muted-foreground">Importeert voorbeelduren zonder externe call, handig voor eerste validatie.</p>
        </div>
        <Switch checked={mockMode} onCheckedChange={setMockMode} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={save} disabled={saving} className="gap-1.5">
          {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          {saving ? "Opslaan..." : "Configuratie opslaan"}
        </Button>
        <Button variant="outline" onClick={onTest} disabled={testing} className="gap-1.5">
          <Activity className="h-3.5 w-3.5" />
          {testing ? "Testen..." : "Test verbinding"}
        </Button>
      </div>
    </div>
  );
}

function SnelstartConnectionForm({
  setupHint,
  creds,
  enabled,
  onSave,
  onTest,
  saving,
  testing,
}: {
  setupHint?: string;
  creds: Record<string, unknown>;
  enabled: boolean;
  onSave: (c: Record<string, unknown>, en: boolean) => Promise<void>;
  onTest: () => void;
  saving: boolean;
  testing: boolean;
}) {
  const [clientKey, setClientKey] = useState((creds.clientKey as string) ?? "");
  const [subKey, setSubKey] = useState((creds.subscriptionKey as string) ?? "");
  const [adminId, setAdminId] = useState((creds.administratieId as string) ?? "");
  const [mockMode, setMockMode] = useState(creds.mockMode === true);
  const [active, setActive] = useState(enabled);

  const save = async () => {
    try {
      await onSave(
        { clientKey, subscriptionKey: subKey, administratieId: adminId, mockMode },
        active,
      );
      toast.success("Opgeslagen");
    } catch (e) {
      toast.error("Opslaan mislukt", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  return (
    <div className="card--luxe p-5 space-y-5">
      {setupHint && (
        <div className="rounded-xl border border-[hsl(var(--gold)/0.18)] bg-[hsl(var(--gold-soft)/0.3)] p-3 text-xs text-foreground/80 leading-relaxed">
          {setupHint}
        </div>
      )}

      <div className="flex items-center justify-between p-3 rounded-xl border border-[hsl(var(--gold)/0.18)] bg-white">
        <div>
          <Label className="text-sm font-display font-semibold">Connector actief</Label>
          <p className="text-[11px] text-muted-foreground">Pauzeer hier zonder credentials te verwijderen.</p>
        </div>
        <Switch checked={active} onCheckedChange={setActive} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Client Key" id="ck" type="password" value={clientKey} onChange={setClientKey} />
        <Field label="Subscription Key" id="sk" type="password" value={subKey} onChange={setSubKey} />
        <Field label="Administratie ID" id="ai" value={adminId} onChange={setAdminId} className="sm:col-span-2" />
      </div>

      <div className="flex items-center justify-between p-3 rounded-xl border border-[hsl(var(--gold)/0.18)] bg-white">
        <div>
          <Label className="text-sm font-display font-semibold">Mock-modus</Label>
          <p className="text-[11px] text-muted-foreground">Geen echte API-call, alleen log voor testen.</p>
        </div>
        <Switch checked={mockMode} onCheckedChange={setMockMode} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={save} disabled={saving} className="gap-1.5">
          {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          {saving ? "Opslaan..." : "Configuratie opslaan"}
        </Button>
        <Button variant="outline" onClick={onTest} disabled={testing} className="gap-1.5">
          <Activity className="h-3.5 w-3.5" />
          {testing ? "Testen..." : "Test verbinding"}
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  id,
  value,
  onChange,
  placeholder,
  type = "text",
  className,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="text-xs font-display font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</Label>
      <Input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

function Stepper({ steps, active }: { steps: string[]; active: number }) {
  return (
    <div className="flex items-center gap-2">
      {steps.map((step, i) => {
        const done = i < active;
        const current = i === active;
        return (
          <div key={step} className="flex items-center gap-2 flex-1">
            <span className={cn(
              "h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-display font-bold shrink-0 transition-all",
              done ? "bg-emerald-500 text-white" :
              current ? "bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-deep))] text-white shadow-md" :
              "bg-slate-100 text-slate-400",
            )}>
              {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
            </span>
            <span className={cn(
              "text-[11px] font-display font-semibold flex-1 truncate",
              current || done ? "text-foreground" : "text-muted-foreground",
            )}>
              {step}
            </span>
            {i < steps.length - 1 && (
              <div className={cn("h-px flex-1", done ? "bg-emerald-300" : "bg-slate-200")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Mapping tab ─────────────────────────────────────────────────────

function MappingTab({ slug }: { slug: string }) {
  const connector = findConnector(slug)!;
  const mapping = useConnectorMapping(slug);
  const save = useSaveConnectorMapping(slug);
  const [values, setValues] = useState<Record<string, string>>({});
  const [initialized, setInitialized] = useState(false);
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  const sourceFields = useMemo(() => getSourceFields(slug), [slug]);
  const templates = useMemo(() => getMappingTemplates(slug), [slug]);

  useEffect(() => {
    if (mapping.data && !initialized) {
      setValues(mapping.data);
      setInitialized(true);
    }
  }, [mapping.data, initialized]);

  if (connector.mappingKeys.length === 0) {
    return (
      <div className="card--luxe p-6 text-center">
        <span className="mx-auto h-10 w-10 rounded-2xl bg-[hsl(var(--gold-soft))] flex items-center justify-center text-[hsl(var(--gold-deep))] mb-3">
          <ArrowLeftRight className="h-5 w-5" />
        </span>
        <p className="text-sm font-display font-semibold text-foreground">Geen mapping-velden</p>
        <p className="text-xs text-muted-foreground mt-1">Deze connector werkt met vaste defaults, geen handmatige mapping nodig.</p>
      </div>
    );
  }

  const applyTemplate = (templateId: string) => {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;
    setValues((prev) => ({ ...prev, ...template.values }));
    toast.success("Template toegepast", { description: template.label });
  };

  const handleDrop = (targetKey: string, sourceKey: string) => {
    setValues((prev) => ({ ...prev, [targetKey]: sourceKey }));
    setHoverKey(null);
  };

  const clearTarget = (targetKey: string) => {
    setValues((prev) => ({ ...prev, [targetKey]: "" }));
  };

  return (
    <div className="space-y-4">
      {templates.length > 0 && (
        <div className="card--luxe p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Wand2 className="h-3.5 w-3.5 text-[hsl(var(--gold-deep))]" />
            <p className="text-[11px] font-display font-semibold uppercase tracking-[0.22em] text-[hsl(var(--gold-deep))]">
              Templates
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {templates.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => applyTemplate(tpl.id)}
                title={tpl.description}
                className="h-8 px-3 rounded-full text-[11px] font-display font-semibold border border-[hsl(var(--gold)/0.3)] bg-white text-foreground hover:bg-[hsl(var(--gold-soft)/0.5)] hover:border-[hsl(var(--gold)/0.55)] transition-all"
              >
                {tpl.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="card--luxe p-5 space-y-4">
        <p className="text-xs text-muted-foreground">
          Sleep een bron-veld naar het juiste doel-veld. Of typ een waarde in
          het tekstveld als de bron niet in de lijst staat. Lege velden
          gebruiken de default uit de connector-definitie.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-5">
          {/* BRON-VELDEN */}
          <div className="space-y-2">
            <p className="text-[10px] font-display font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Bron, OrderFlow
            </p>
            {sourceFields.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Voor deze connector zijn geen voorgedefinieerde bron-velden,
                gebruik de tekstvelden rechts.
              </p>
            ) : (
              <div className="space-y-1.5">
                {sourceFields.map((field) => (
                  <SourcePill key={field.key} field={field} />
                ))}
              </div>
            )}
          </div>

          {/* DOEL-VELDEN */}
          <div className="space-y-2">
            <p className="text-[10px] font-display font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Doel, {connector.name}
            </p>
            <div className="space-y-2">
              {connector.mappingKeys.map((m) => (
                <TargetRow
                  key={m.key}
                  mappingKey={m.key}
                  label={m.label}
                  placeholder={m.placeholder}
                  value={values[m.key] ?? ""}
                  hover={hoverKey === m.key}
                  onChange={(v) =>
                    setValues((prev) => ({ ...prev, [m.key]: v }))
                  }
                  onClear={() => clearTarget(m.key)}
                  onDragEnter={() => setHoverKey(m.key)}
                  onDragLeave={() => setHoverKey((curr) => (curr === m.key ? null : curr))}
                  onDrop={(sourceKey) => handleDrop(m.key, sourceKey)}
                />
              ))}
            </div>
          </div>
        </div>

        <MappingPreview
          values={values}
          mappingKeys={connector.mappingKeys}
          sourceFields={sourceFields}
        />

        <Button
          onClick={() => save.mutate(values)}
          disabled={save.isPending}
          className="gap-1.5"
        >
          {save.isPending ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          {save.isPending ? "Opslaan..." : "Mapping opslaan"}
        </Button>
      </div>
    </div>
  );
}

function SourcePill({ field }: { field: ConnectorSourceField }) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", field.key);
        e.dataTransfer.effectAllowed = "copy";
      }}
      title={field.hint}
      className="group inline-flex items-center gap-2 w-full h-9 px-3 rounded-xl bg-[hsl(var(--gold-soft)/0.6)] border border-[hsl(var(--gold)/0.25)] text-xs font-display font-semibold text-[hsl(var(--gold-deep))] cursor-grab active:cursor-grabbing hover:bg-[hsl(var(--gold-soft))] hover:border-[hsl(var(--gold)/0.5)] transition-all"
    >
      <GripVertical className="h-3.5 w-3.5 opacity-60 group-hover:opacity-100 shrink-0" />
      <span className="truncate">{field.label}</span>
      <code className="ml-auto text-[10px] font-mono opacity-70 shrink-0">
        {field.key}
      </code>
    </div>
  );
}

function TargetRow({
  mappingKey,
  label,
  placeholder,
  value,
  hover,
  onChange,
  onClear,
  onDragEnter,
  onDragLeave,
  onDrop,
}: {
  mappingKey: string;
  label: string;
  placeholder: string;
  value: string;
  hover: boolean;
  onChange: (v: string) => void;
  onClear: () => void;
  onDragEnter: () => void;
  onDragLeave: () => void;
  onDrop: (sourceKey: string) => void;
}) {
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const sourceKey = e.dataTransfer.getData("text/plain");
    if (sourceKey) onDrop(sourceKey);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={handleDrop}
      className={cn(
        "rounded-xl border-2 border-dashed bg-white p-3 transition-all",
        hover
          ? "border-[hsl(var(--gold))] bg-[hsl(var(--gold-soft)/0.4)] shadow-[0_0_0_4px_hsl(var(--gold)/0.15)]"
          : value
            ? "border-[hsl(var(--gold)/0.4)] border-solid"
            : "border-[hsl(var(--gold)/0.2)]",
      )}
    >
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <Label
          htmlFor={`map-${mappingKey}`}
          className="text-[11px] font-display font-semibold uppercase tracking-[0.16em] text-muted-foreground"
        >
          {label}
        </Label>
        {value && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Wis veld"
            className="h-5 w-5 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--gold-soft)/0.6)] transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      <Input
        id={`map-${mappingKey}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={hover ? "Laat hier los..." : placeholder}
        className={cn(
          "h-9 text-sm",
          hover && "border-[hsl(var(--gold))] bg-white",
        )}
      />
    </div>
  );
}

function MappingPreview({
  values,
  mappingKeys,
  sourceFields,
}: {
  values: Record<string, string>;
  mappingKeys: Array<{ key: string; label: string; placeholder: string }>;
  sourceFields: ConnectorSourceField[];
}) {
  const exampleByKey = useMemo(() => {
    const map: Record<string, string> = {};
    for (const f of sourceFields) {
      map[f.key] = f.example ?? f.label;
    }
    return map;
  }, [sourceFields]);

  const preview = useMemo(() => {
    const out: Record<string, string> = {};
    for (const m of mappingKeys) {
      const v = values[m.key];
      if (!v) {
        out[m.key] = `(default: ${m.placeholder})`;
      } else if (exampleByKey[v] !== undefined) {
        out[m.key] = exampleByKey[v];
      } else {
        out[m.key] = v;
      }
    }
    return out;
  }, [mappingKeys, values, exampleByKey]);

  return (
    <div className="rounded-xl border border-[hsl(var(--gold)/0.2)] bg-[hsl(var(--gold-soft)/0.18)] p-4 space-y-2">
      <p className="text-[10px] font-display font-semibold uppercase tracking-[0.22em] text-[hsl(var(--gold-deep))]">
        Live preview
      </p>
      <pre className="text-[11px] font-mono text-foreground/90 whitespace-pre-wrap break-all leading-relaxed">
        {JSON.stringify(preview, null, 2)}
      </pre>
    </div>
  );
}

// ─── Sync-log tab ────────────────────────────────────────────────────

function LogTab({ slug }: { slug: string }) {
  const log = useConnectorSyncLog(slug);
  const [statusFilter, setStatusFilter] = useState<"all" | "SUCCESS" | "FAILED" | "SKIPPED">("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  // Marketplace fase 4: replay-multi-select.
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [replayRow, setReplayRow] = useState<SyncLogRow | null>(null);
  const bulkReplay = useReplaySyncEventsBulk(slug);

  const filtered = (log.data ?? []).filter((r) => statusFilter === "all" || r.status === statusFilter);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkReplay = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    try {
      await bulkReplay.mutateAsync(ids);
      toast.success(`${ids.length} events opnieuw verstuurd`);
      setSelected(new Set());
    } catch (e) {
      toast.error("Bulk-replay mislukt", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  return (
    <div className="card--luxe p-5 space-y-4">
      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-[hsl(var(--gold)/0.3)] bg-[hsl(var(--gold-soft)/0.4)] p-2">
          <span className="text-xs font-display font-semibold text-[hsl(var(--gold-deep))]">
            {selected.size} {selected.size === 1 ? "event" : "events"} geselecteerd
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>Wis selectie</Button>
            <Button size="sm" onClick={handleBulkReplay} disabled={bulkReplay.isPending} className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" />
              Opnieuw proberen ({selected.size})
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        {(["all", "SUCCESS", "FAILED", "SKIPPED"] as const).map((s) => {
          const active = statusFilter === s;
          const label = s === "all" ? "Alles" : s === "SUCCESS" ? "Succes" : s === "FAILED" ? "Mislukt" : "Overgeslagen";
          const count = s === "all" ? (log.data ?? []).length : (log.data ?? []).filter((r) => r.status === s).length;
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "h-7 px-2.5 rounded-full text-[10px] font-display font-semibold border inline-flex items-center gap-1.5 transition-all",
                active
                  ? "bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-deep))] text-white border-transparent shadow-sm"
                  : "bg-white text-foreground border-[hsl(var(--gold)/0.25)] hover:border-[hsl(var(--gold)/0.45)]",
              )}
            >
              {label}
              <span className={cn("inline-flex h-4 min-w-4 px-1 items-center justify-center rounded-full text-[9px] tabular-nums", active ? "bg-white/25 text-white" : "bg-[hsl(var(--gold-soft))] text-[hsl(var(--gold-deep))]")}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {log.isLoading && <p className="text-sm text-muted-foreground">Laden...</p>}
      {!log.isLoading && filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[hsl(var(--gold)/0.3)] p-8 text-center">
          <Clock className="h-6 w-6 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">Nog geen events met dit filter.</p>
        </div>
      )}
      <div className="space-y-2">
        {filtered.map((row) => (
          <LogRow
            key={row.id}
            row={row}
            expanded={expanded === row.id}
            onToggle={() => setExpanded((prev) => prev === row.id ? null : row.id)}
            selected={selected.has(row.id)}
            onSelectChange={() => toggleSelect(row.id)}
            onReplay={() => setReplayRow(row)}
          />
        ))}
      </div>

      <WebhookReplayDialog row={replayRow} open={!!replayRow} onClose={() => setReplayRow(null)} />
    </div>
  );
}

function LogRow({
  row,
  expanded,
  onToggle,
  selected,
  onSelectChange,
  onReplay,
}: {
  row: SyncLogRow;
  expanded: boolean;
  onToggle: () => void;
  selected: boolean;
  onSelectChange: () => void;
  onReplay: () => void;
}) {
  const Icon = row.status === "SUCCESS" ? CheckCircle2 : row.status === "FAILED" ? XCircle : Clock;
  const tone = row.status === "SUCCESS" ? "text-emerald-600" : row.status === "FAILED" ? "text-destructive" : "text-amber-500";
  const isFailed = row.status === "FAILED";

  return (
    <div className={cn("rounded-xl border bg-white", selected ? "border-[hsl(var(--gold)/0.5)] ring-1 ring-[hsl(var(--gold)/0.2)]" : "border-[hsl(var(--gold)/0.16)]")}>
      <div className="flex items-start gap-2 p-3">
        {isFailed && (
          <div className="pt-0.5">
            <Checkbox
              checked={selected}
              onCheckedChange={onSelectChange}
              aria-label="Selecteer voor bulk-replay"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
        <button
          type="button"
          onClick={onToggle}
          className="flex-1 flex items-start gap-3 text-left hover:bg-[hsl(var(--gold-soft)/0.25)] -m-1 p-1 rounded-lg transition-colors"
        >
          <Icon className={cn("h-4 w-4 shrink-0 mt-0.5", tone)} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-display font-bold uppercase tracking-[0.16em] text-muted-foreground">{row.direction}</span>
              {row.event_type && <code className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[hsl(var(--gold-soft)/0.5)] text-[hsl(var(--gold-deep))]">{row.event_type}</code>}
              <span className="text-[11px] text-muted-foreground ml-auto tabular-nums">
                {new Date(row.started_at).toLocaleString("nl-NL")}
              </span>
            </div>
            {row.error_message && (
              <p className="text-xs text-destructive mt-1 line-clamp-1">{row.error_message}</p>
            )}
            <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
              {row.records_count > 0 && <span>{row.records_count} record{row.records_count === 1 ? "" : "s"}</span>}
              {row.duration_ms != null && <span className="tabular-nums">{row.duration_ms}ms</span>}
              {row.external_id && <span className="font-mono text-[10px]">ID {row.external_id}</span>}
            </div>
          </div>
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0 mt-1", expanded && "rotate-180")} />
        </button>
        {isFailed && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onReplay();
            }}
            className="h-7 px-2 gap-1 text-[10px] font-display font-semibold border-[hsl(var(--gold)/0.3)]"
          >
            <RotateCcw className="h-3 w-3" />
            Opnieuw
          </Button>
        )}
      </div>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden border-t border-[hsl(var(--gold)/0.12)]"
          >
            <div className="p-3 bg-[hsl(var(--gold-soft)/0.18)] text-[11px] font-mono space-y-1">
              <div><span className="text-muted-foreground">id:</span> {row.id}</div>
              {row.entity_type && <div><span className="text-muted-foreground">entity:</span> {row.entity_type} {row.entity_id ?? ""}</div>}
              <div><span className="text-muted-foreground">started_at:</span> {row.started_at}</div>
              {row.error_message && <div className="text-destructive"><span className="text-muted-foreground">error:</span> {row.error_message}</div>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────

function Sidebar({
  slug,
  log,
  stats,
  isLive,
  onPull,
  pulling,
}: {
  slug: string;
  log: SyncLogRow[];
  stats: { total: number; success: number; failed: number; successRate: number | null; avgDuration: number | null };
  isLive: boolean;
  onPull: () => void;
  pulling: boolean;
}) {
  const recent = log.slice(0, 5);
  const supportsPull = slug === "nostradamus";

  return (
    <aside className="space-y-4">
      {/* Marketplace fase 4: Sync-graphs bovenaan de sidebar. */}
      <SyncGraphs slug={slug} log={log} />

      <div className="card--luxe p-4 space-y-3">
        <p className="text-[11px] font-display font-semibold uppercase tracking-[0.22em] text-[hsl(var(--gold-deep))]">Stats laatste 50 events</p>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Events" value={stats.total} tone="muted" />
          <Stat label="Succes" value={stats.success} tone="success" />
          <Stat label="Mislukt" value={stats.failed} tone={stats.failed > 0 ? "danger" : "muted"} />
          <Stat label="Rate" value={stats.successRate === null ? "—" : `${stats.successRate}%`} tone="gold" />
        </div>
        {stats.avgDuration !== null && (
          <p className="text-[11px] text-muted-foreground tabular-nums">
            Gem. duur {stats.avgDuration}ms per event
          </p>
        )}
      </div>

      {isLive && supportsPull && (
        <div className="card--luxe p-4 space-y-3 bg-gradient-to-br from-white to-[hsl(var(--gold-soft)/0.3)]">
          <p className="text-[11px] font-display font-semibold uppercase tracking-[0.22em] text-[hsl(var(--gold-deep))]">Snelle acties</p>
          <Button
            onClick={onPull}
            disabled={pulling}
            className="w-full gap-1.5 bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-deep))] text-white hover:opacity-95"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", pulling && "animate-spin")} />
            {pulling ? "Bezig met sync..." : "Sync nu"}
          </Button>
        </div>
      )}

      <div className="card--luxe p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-display font-semibold uppercase tracking-[0.22em] text-[hsl(var(--gold-deep))]">Activity feed</p>
          <span className="text-[10px] text-muted-foreground tabular-nums">{recent.length}/5</span>
        </div>
        {recent.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nog geen events.</p>
        ) : (
          <div className="space-y-2">
            {recent.map((row) => {
              const Icon = row.status === "SUCCESS" ? CheckCircle2 : row.status === "FAILED" ? XCircle : Clock;
              const tone = row.status === "SUCCESS" ? "text-emerald-600" : row.status === "FAILED" ? "text-destructive" : "text-amber-500";
              return (
                <div key={row.id} className="flex items-start gap-2.5 text-xs">
                  <Icon className={cn("h-3.5 w-3.5 shrink-0 mt-0.5", tone)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono text-muted-foreground uppercase">{row.direction}</span>
                      {row.event_type && <code className="text-[10px] font-mono text-foreground truncate">{row.event_type}</code>}
                    </div>
                    <p className="text-[10px] text-muted-foreground tabular-nums">{formatRelative(row.started_at)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card--luxe p-4 space-y-2 border-amber-200/70 bg-gradient-to-br from-amber-50/50 to-white">
        <div className="flex items-start gap-2.5">
          <span className="h-7 w-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-3.5 w-3.5" />
          </span>
          <div>
            <p className="text-xs font-display font-semibold text-foreground">Iets niet logisch?</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
              Open de Sync-log met filter Mislukt om de oorzaak te zien. Je kan failures herproberen vanuit het log-record (volgt in fase 4).
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone: "success" | "danger" | "gold" | "muted" }) {
  const palette = {
    success: "bg-emerald-50/70 border-emerald-200/60 text-emerald-700",
    danger: "bg-red-50/70 border-red-200/60 text-red-700",
    gold: "bg-[hsl(var(--gold-soft)/0.6)] border-[hsl(var(--gold)/0.3)] text-[hsl(var(--gold-deep))]",
    muted: "bg-slate-50 border-slate-200/70 text-slate-600",
  }[tone];
  return (
    <div className={cn("rounded-xl border p-2.5", palette)}>
      <p className="text-[9px] font-display font-semibold uppercase tracking-[0.18em] opacity-80">{label}</p>
      <p className="font-display text-lg font-semibold tabular-nums leading-tight mt-0.5">{value}</p>
    </div>
  );
}
