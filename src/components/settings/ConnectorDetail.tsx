import { useState } from "react";
import { ArrowLeft, ExternalLink, RefreshCw, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { findConnector } from "@/lib/connectors/catalog";
import {
  useConnectorMapping,
  useSaveConnectorMapping,
  useConnectorSyncLog,
  useTestConnector,
  usePullConnector,
  buildExactOAuthUrl,
  type SyncLogRow,
} from "@/hooks/useConnectors";
import {
  useIntegrationCredentials,
  useSaveIntegrationCredentials,
  type IntegrationProvider,
} from "@/hooks/useIntegrationCredentials";
import { useTenant } from "@/contexts/TenantContext";

interface Props {
  slug: string;
  onBack: () => void;
}

export function ConnectorDetail({ slug, onBack }: Props) {
  const connector = findConnector(slug);

  if (!connector) {
    return (
      <div className="card--luxe p-6">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Terug
        </Button>
        <p className="mt-4 text-sm text-muted-foreground">Onbekende connector: {slug}</p>
      </div>
    );
  }

  if (connector.status === "soon") {
    return (
      <div className="card--luxe p-6 space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Terug
        </Button>
        <h2 className="text-xl font-semibold">{connector.name}</h2>
        <p className="text-sm text-muted-foreground">{connector.description}</p>
        <Badge variant="secondary">Binnenkort beschikbaar</Badge>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Terug
        </Button>
        <h2 className="text-xl font-semibold text-foreground">{connector.name}</h2>
      </div>

      <Tabs defaultValue="connection" className="w-full">
        <TabsList>
          <TabsTrigger value="connection">Verbinding</TabsTrigger>
          <TabsTrigger value="mapping">Mapping</TabsTrigger>
          <TabsTrigger value="sync">Sync</TabsTrigger>
          <TabsTrigger value="log">Log</TabsTrigger>
        </TabsList>

        <TabsContent value="connection">
          <ConnectionTab slug={slug as IntegrationProvider} />
        </TabsContent>
        <TabsContent value="mapping">
          <MappingTab slug={slug} />
        </TabsContent>
        <TabsContent value="sync">
          <SyncTab slug={slug} />
        </TabsContent>
        <TabsContent value="log">
          <LogTab slug={slug} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ConnectionTab({ slug }: { slug: IntegrationProvider }) {
  const connector = findConnector(slug)!;
  const creds = useIntegrationCredentials(slug);
  const save = useSaveIntegrationCredentials(slug);
  const test = useTestConnector(slug);
  const { tenant } = useTenant();

  if (slug === "exact_online") {
    const oauthUrl = tenant ? buildExactOAuthUrl(tenant.id) : null;
    const hasCreds = Boolean(
      creds.data?.enabled ||
      (creds.data?.credentials as Record<string, unknown> | undefined)?.__hasStoredSecrets,
    );
    return (
      <div className="card--luxe p-5 space-y-4">
        <p className="text-sm text-muted-foreground">{connector.setupHint}</p>
        {oauthUrl ? (
          <Button asChild>
            <a href={oauthUrl} target="_blank" rel="noopener noreferrer" className="gap-2">
              <ExternalLink className="h-4 w-4" />
              {hasCreds ? "Opnieuw verbinden met Exact" : "Verbinden met Exact Online"}
            </a>
          </Button>
        ) : (
          <p className="text-sm text-destructive">
            VITE_EXACT_CLIENT_ID en VITE_EXACT_REDIRECT_URI ontbreken in env.
          </p>
        )}
        {hasCreds && (
          <Button
            variant="outline"
            onClick={() => test.mutate()}
            disabled={test.isPending}
            className="gap-2"
          >
            {test.isPending ? "Testen..." : "Test verbinding"}
          </Button>
        )}
      </div>
    );
  }

  if (slug === "nostradamus") {
    return (
      <NostradamusConnectionForm
        creds={creds.data?.credentials ?? {}}
        enabled={creds.data?.enabled ?? false}
        onSave={(c, en) => save.mutateAsync({ enabled: en, credentials: c })}
        onTest={() => test.mutate()}
        saving={save.isPending}
        testing={test.isPending}
      />
    );
  }

  // Generieke API-key/credentials-form (Snelstart, AFAS, Samsara)
  return (
    <SnelstartConnectionForm
      creds={creds.data?.credentials ?? {}}
      enabled={creds.data?.enabled ?? false}
      onSave={(c, en) => save.mutateAsync({ enabled: en, credentials: c })}
      onTest={() => test.mutate()}
      saving={save.isPending}
      testing={test.isPending}
    />
  );
}

function NostradamusConnectionForm({
  creds,
  enabled,
  onSave,
  onTest,
  saving,
  testing,
}: {
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
        {
          baseUrl,
          endpointPath,
          apiToken,
          tokenHeader,
          tokenPrefix,
          sinceParam,
          untilParam,
          mockMode,
        },
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
    <div className="card--luxe p-5 space-y-4">
      <div className="flex items-center justify-between">
        <Label>Actief</Label>
        <Switch checked={active} onCheckedChange={setActive} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="nostra-base-url">Basis-URL</Label>
        <Input id="nostra-base-url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="nostra-endpoint">Endpoint-pad</Label>
        <Input id="nostra-endpoint" value={endpointPath} onChange={(e) => setEndpointPath(e.target.value)} placeholder="/hours/worked" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="nostra-token">API-token</Label>
        <Input id="nostra-token" type="password" value={apiToken} onChange={(e) => setApiToken(e.target.value)} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="nostra-token-header">Token-header</Label>
          <Input id="nostra-token-header" value={tokenHeader} onChange={(e) => setTokenHeader(e.target.value)} placeholder="Authorization" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="nostra-token-prefix">Token-prefix</Label>
          <Input id="nostra-token-prefix" value={tokenPrefix} onChange={(e) => setTokenPrefix(e.target.value)} placeholder="Bearer" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="nostra-since-param">Queryparam vanaf</Label>
          <Input id="nostra-since-param" value={sinceParam} onChange={(e) => setSinceParam(e.target.value)} placeholder="since" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="nostra-until-param">Queryparam t/m</Label>
          <Input id="nostra-until-param" value={untilParam} onChange={(e) => setUntilParam(e.target.value)} placeholder="until" />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <Label>Mock-modus</Label>
          <p className="text-xs text-muted-foreground">Importeert voorbeelduren zonder externe call, handig voor eerste validatie.</p>
        </div>
        <Switch checked={mockMode} onCheckedChange={setMockMode} />
      </div>
      <div className="flex gap-2 pt-2">
        <Button onClick={save} disabled={saving}>
          {saving ? "Opslaan..." : "Opslaan"}
        </Button>
        <Button variant="outline" onClick={onTest} disabled={testing}>
          {testing ? "Testen..." : "Test verbinding"}
        </Button>
      </div>
    </div>
  );
}

function SnelstartConnectionForm({
  creds,
  enabled,
  onSave,
  onTest,
  saving,
  testing,
}: {
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
        {
          clientKey,
          subscriptionKey: subKey,
          administratieId: adminId,
          mockMode,
        },
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
    <div className="card--luxe p-5 space-y-4">
      <div className="flex items-center justify-between">
        <Label>Actief</Label>
        <Switch checked={active} onCheckedChange={setActive} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ck">Client Key</Label>
        <Input id="ck" type="password" value={clientKey} onChange={(e) => setClientKey(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="sk">Subscription Key</Label>
        <Input id="sk" type="password" value={subKey} onChange={(e) => setSubKey(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ai">Administratie ID</Label>
        <Input id="ai" value={adminId} onChange={(e) => setAdminId(e.target.value)} />
      </div>
      <div className="flex items-center justify-between">
        <div>
          <Label>Mock-modus</Label>
          <p className="text-xs text-muted-foreground">Geen echte API-call, alleen log voor testen.</p>
        </div>
        <Switch checked={mockMode} onCheckedChange={setMockMode} />
      </div>
      <div className="flex gap-2 pt-2">
        <Button onClick={save} disabled={saving}>
          {saving ? "Opslaan..." : "Opslaan"}
        </Button>
        <Button variant="outline" onClick={onTest} disabled={testing}>
          {testing ? "Testen..." : "Test verbinding"}
        </Button>
      </div>
    </div>
  );
}

function MappingTab({ slug }: { slug: string }) {
  const connector = findConnector(slug)!;
  const mapping = useConnectorMapping(slug);
  const save = useSaveConnectorMapping(slug);
  const [values, setValues] = useState<Record<string, string>>({});

  // Init values from loaded mapping (one-shot via useEffect would be better but
  // we keep state local; reload re-renders).
  if (mapping.data && Object.keys(values).length === 0) {
    setValues(mapping.data);
  }

  if (connector.mappingKeys.length === 0) {
    return (
      <div className="card--luxe p-5">
        <p className="text-sm text-muted-foreground">
          Deze connector heeft (nog) geen instelbare mapping-velden.
        </p>
      </div>
    );
  }

  return (
    <div className="card--luxe p-5 space-y-4">
      {connector.mappingKeys.map((m) => (
        <div key={m.key} className="space-y-2">
          <Label htmlFor={`map-${m.key}`}>{m.label}</Label>
          <Input
            id={`map-${m.key}`}
            value={values[m.key] ?? ""}
            placeholder={m.placeholder}
            onChange={(e) => setValues((prev) => ({ ...prev, [m.key]: e.target.value }))}
          />
        </div>
      ))}
      <Button onClick={() => save.mutate(values)} disabled={save.isPending}>
        {save.isPending ? "Opslaan..." : "Mapping opslaan"}
      </Button>
    </div>
  );
}

function SyncTab({ slug }: { slug: string }) {
  const connector = findConnector(slug)!;
  const pull = usePullConnector(slug);

  if (slug === "nostradamus") {
    return (
      <div className="card--luxe p-5 space-y-4">
        <p className="text-sm text-muted-foreground">
          Haal gewerkte uren op uit Nostradamus en koppel records via het personeelsnummer van de chauffeur.
        </p>
        <div className="flex gap-2">
          <Button
            onClick={() => pull.mutate()}
            disabled={pull.isPending}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${pull.isPending ? "animate-spin" : ""}`} />
            {pull.isPending ? "Uren ophalen..." : "Uren ophalen"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          De pull importeert standaard de laatste 14 dagen en overschrijft bestaande dagtotalen voor dezelfde chauffeur/datum.
        </p>
      </div>
    );
  }

  return (
    <div className="card--luxe p-5 space-y-4">
      <p className="text-sm text-muted-foreground">
        Deze connector reageert op de volgende events. Push gebeurt automatisch zodra het event optreedt en de koppeling actief is.
      </p>
      <div className="space-y-2">
        {connector.supportedEvents.map((e) => (
          <div key={e} className="flex items-center justify-between p-3 rounded border border-border">
            <code className="text-xs">{e}</code>
            <Badge variant="outline" className="text-[10px]">Ingeschakeld</Badge>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground pt-2">
        Per-event aan/uit-toggles komen in een latere versie. Voor nu kun je de hele koppeling op inactief zetten in de Verbinding-tab als je geen sync wilt.
      </p>
    </div>
  );
}

function LogTab({ slug }: { slug: string }) {
  const log = useConnectorSyncLog(slug);
  return (
    <div className="card--luxe p-5">
      {log.isLoading && <p className="text-sm text-muted-foreground">Laden...</p>}
      {!log.isLoading && (log.data?.length ?? 0) === 0 && (
        <p className="text-sm text-muted-foreground">Nog geen sync-acties geregistreerd.</p>
      )}
      <div className="space-y-2">
        {(log.data ?? []).map((row) => <LogRow key={row.id} row={row} />)}
      </div>
    </div>
  );
}

function LogRow({ row }: { row: SyncLogRow }) {
  const Icon = row.status === "SUCCESS" ? CheckCircle2 : row.status === "FAILED" ? XCircle : Clock;
  const color = row.status === "SUCCESS" ? "text-emerald-600" : row.status === "FAILED" ? "text-destructive" : "text-amber-500";

  return (
    <div className="flex items-start gap-3 p-3 rounded border border-border">
      <Icon className={`h-4 w-4 ${color} shrink-0 mt-0.5`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono">{row.direction}</span>
          {row.event_type && <span className="text-xs font-mono">{row.event_type}</span>}
          <span className="text-[11px] text-muted-foreground ml-auto">
            {new Date(row.started_at).toLocaleString("nl-NL")}
          </span>
        </div>
        {row.error_message && (
          <p className="text-xs text-destructive mt-1">{row.error_message}</p>
        )}
        {row.external_id && (
          <p className="text-[11px] text-muted-foreground mt-1 font-mono">ID {row.external_id}</p>
        )}
        <div className="text-[11px] text-muted-foreground mt-0.5">
          {row.records_count > 0 && `${row.records_count} record${row.records_count === 1 ? "" : "s"}`}
          {row.duration_ms != null && ` , ${row.duration_ms}ms`}
        </div>
      </div>
    </div>
  );
}
