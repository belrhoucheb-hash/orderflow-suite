// Connector-runtime: gedeelde wrapper voor alle connector-edge-functions.
//
// Verantwoordelijkheden:
//   - Credentials laden uit integration_credentials per (tenant, provider).
//   - Mapping-overrides laden uit integration_mapping per (tenant, provider).
//   - Retry-logic voor 5xx en netwerk-fouten (3 pogingen, 1s/3s/9s backoff).
//   - Per-call advisory-lock per (tenant, provider) tegen race-conditions
//     bij OAuth-token-refresh.
//   - Sync-log-write per actie.
//
// Iedere connector implementeert het Connector-interface en wordt
// aangeroepen via runConnector(). De runtime weet niets van het
// specifieke protocol (Snelstart REST, Exact OAuth, ...).
//
// TODO(connector-platform-depth): respecteer connector_event_policies bij
// push-events. Voor elke push moet eerst worden gecheckt of er een rij
// bestaat met (tenant_id, provider, event_type) waarvan enabled = false.
// Als die er is, returnt de runtime een SKIPPED-resultaat zonder API-call.
// Idem: respecteer integration_credentials.environment ('test' vs 'live')
// zodat een tenant ook tegen sandbox kan testen zonder live-data te raken.
// Tot die hook is gemaakt, vallen alle pushes terug op de oude default
// (alle events aan, environment=live) en blijft het gedrag identiek aan
// vóór de drag-drop / multi-env feature.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface ConnectorConfig {
  tenantId: string;
  provider: string;
  credentials: Record<string, unknown>;
  mapping: Record<string, string>;
}

export interface ConnectorPushResult {
  ok: boolean;
  externalId?: string;
  error?: string;
  recordsCount?: number;
}

export interface ConnectorPullResult {
  ok: boolean;
  records?: Array<Record<string, unknown>>;
  error?: string;
  cursor?: string;
}

export interface ConnectorTestResult {
  ok: boolean;
  message: string;
  details?: Record<string, unknown>;
}

export interface Connector {
  push(
    eventType: string,
    payload: Record<string, unknown>,
    config: ConnectorConfig,
    supabase: SupabaseClient,
  ): Promise<ConnectorPushResult>;

  pull?(
    since: string | null,
    config: ConnectorConfig,
    supabase: SupabaseClient,
  ): Promise<ConnectorPullResult>;

  testConnection(
    config: ConnectorConfig,
    supabase: SupabaseClient,
  ): Promise<ConnectorTestResult>;
}

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [1000, 3000, 9000];

/**
 * Laad credentials + mapping voor (tenant, provider). Throws als niet gevonden of disabled.
 *
 * NB: deze RPC leest uit `integration_credentials.credentials` (jsonb) en
 * resolvet geheime velden uit Vault. De optionele kolom
 * `credentials_encrypted` (bytea, sinds 20260504230100) wordt door de RPC
 * automatisch gebruikt zodra die in een toekomstige migratie de jsonb-kolom
 * vervangt. Edge functions hoeven daarom zelf niets te decoderen.
 */
export async function loadConfig(
  supabase: SupabaseClient,
  tenantId: string,
  provider: string,
): Promise<ConnectorConfig> {
  const { data, error: credErr } = await supabase.rpc("get_integration_credentials_runtime", {
    p_tenant_id: tenantId,
    p_provider: provider,
  });

  if (credErr) throw new Error(`credentials lookup failed: ${credErr.message}`);
  const cred = (Array.isArray(data) ? data[0] : data) as
    | { credentials?: Record<string, unknown>; enabled?: boolean }
    | null;
  if (!cred) throw new Error(`provider ${provider} niet geconfigureerd voor tenant`);
  if (!cred.enabled) throw new Error(`provider ${provider} staat uit voor tenant`);

  const { data: mappingRows, error: mapErr } = await supabase
    .from("integration_mapping")
    .select("key, value")
    .eq("tenant_id", tenantId)
    .eq("provider", provider);

  if (mapErr) throw new Error(`mapping lookup failed: ${mapErr.message}`);

  const mapping: Record<string, string> = {};
  for (const row of mappingRows ?? []) {
    mapping[(row as { key: string }).key] = (row as { value: string }).value;
  }

  return {
    tenantId,
    provider,
    credentials: (cred.credentials as Record<string, unknown>) ?? {},
    mapping,
  };
}

/** Schrijf een rij in integration_sync_log. Fire-and-forget. */
export async function writeLog(
  supabase: SupabaseClient,
  entry: {
    tenantId: string;
    provider: string;
    direction: "push" | "pull" | "test";
    status: "SUCCESS" | "FAILED" | "SKIPPED";
    eventType?: string;
    entityType?: string;
    entityId?: string;
    recordsCount?: number;
    errorMessage?: string;
    durationMs?: number;
    externalId?: string;
    connectionId?: string;
  },
): Promise<void> {
  try {
    await supabase.from("integration_sync_log").insert({
      tenant_id: entry.tenantId,
      provider: entry.provider,
      connection_id: entry.connectionId ?? null,
      direction: entry.direction,
      event_type: entry.eventType ?? null,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      status: entry.status,
      records_count: entry.recordsCount ?? 0,
      error_message: entry.errorMessage ?? null,
      duration_ms: entry.durationMs ?? null,
      external_id: entry.externalId ?? null,
    });
  } catch (e) {
    console.error("[connector-runtime] log write failed:", e instanceof Error ? e.message : e);
  }
}

/** Voer een async actie uit met retry op 5xx-achtige fouten. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  isRetriable: (err: unknown) => boolean = defaultRetriable,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetriable(err) || attempt === MAX_ATTEMPTS - 1) throw err;
      await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]));
    }
  }
  throw lastErr;
}

function defaultRetriable(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes("timeout") || msg.includes("network") || msg.includes("econn")) return true;
    const m = msg.match(/\b(\d{3})\b/);
    if (m) {
      const code = Number(m[1]);
      return code >= 500 && code < 600;
    }
  }
  return false;
}

/** Helper: pak een mapping-waarde of fallback default. */
export function mappingValue(
  config: ConnectorConfig,
  key: string,
  defaultValue: string,
): string {
  return config.mapping[key] || defaultValue;
}

/** Helper: pak een credentials-veld. */
export function credentialValue(
  config: ConnectorConfig,
  key: string,
): string | undefined {
  const v = config.credentials[key];
  return typeof v === "string" ? v : undefined;
}

/** Voer een connector-actie uit met automatische log-write. */
export async function runConnectorAction<T extends ConnectorPushResult | ConnectorPullResult | ConnectorTestResult>(
  supabase: SupabaseClient,
  meta: {
    tenantId: string;
    provider: string;
    direction: "push" | "pull" | "test";
    eventType?: string;
    entityType?: string;
    entityId?: string;
  },
  fn: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  let result: T;
  let errorMessage: string | undefined;
  try {
    result = await fn();
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : String(e);
    result = { ok: false, error: errorMessage } as T;
  }

  const duration = Date.now() - started;
  const r = result as { ok: boolean; recordsCount?: number; externalId?: string; error?: string };

  await writeLog(supabase, {
    tenantId: meta.tenantId,
    provider: meta.provider,
    direction: meta.direction,
    status: r.ok ? "SUCCESS" : "FAILED",
    eventType: meta.eventType,
    entityType: meta.entityType,
    entityId: meta.entityId,
    recordsCount: r.recordsCount,
    externalId: r.externalId,
    errorMessage: r.error ?? errorMessage,
    durationMs: duration,
  });

  return result;
}
