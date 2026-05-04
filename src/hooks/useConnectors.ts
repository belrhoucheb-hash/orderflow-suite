import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import {
  CONNECTOR_CATALOG,
  findConnector,
  type ConnectorDefinition,
} from "@/lib/connectors/catalog";

// ─── Catalog merged with live status ────────────────────────────────

export interface ConnectorWithStatus extends ConnectorDefinition {
  enabled: boolean;
  hasCredentials: boolean;
}

export function useConnectorList(options?: { enabled?: boolean }) {
  const { tenant } = useTenant();
  const enabled = options?.enabled ?? true;
  return useQuery({
    queryKey: ["connectors_list", tenant?.id],
    enabled: enabled && !!tenant?.id,
    staleTime: 30_000,
    queryFn: async (): Promise<ConnectorWithStatus[]> => {
      const { data, error } = await supabase
        .from("integration_credentials" as any)
        .select("provider, enabled, credentials")
        .eq("tenant_id", tenant!.id);
      if (error) throw error;

      const byProvider = new Map<string, { enabled: boolean; hasCreds: boolean }>();
      for (const row of (data ?? []) as Array<{
        provider: string;
        enabled: boolean;
        credentials: Record<string, unknown>;
      }>) {
        byProvider.set(row.provider, {
          enabled: row.enabled,
          hasCreds: Object.keys(row.credentials ?? {}).length > 0,
        });
      }

      return CONNECTOR_CATALOG.map((c) => {
        const live = byProvider.get(c.slug);
        return {
          ...c,
          enabled: live?.enabled ?? false,
          hasCredentials: live?.hasCreds ?? false,
        };
      });
    },
  });
}

export function useConnector(slug: string | null) {
  const list = useConnectorList();
  return {
    ...list,
    data: list.data?.find((c) => c.slug === slug) ?? (slug ? findConnector(slug) : undefined),
  };
}

// ─── Mapping ────────────────────────────────────────────────────────

export interface MappingRow {
  key: string;
  value: string;
}

export function useConnectorMapping(provider: string) {
  const { tenant } = useTenant();
  return useQuery({
    queryKey: ["connector_mapping", tenant?.id, provider],
    enabled: !!tenant?.id,
    staleTime: 30_000,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase
        .from("integration_mapping" as any)
        .select("key, value")
        .eq("tenant_id", tenant!.id)
        .eq("provider", provider);
      if (error) throw error;
      const out: Record<string, string> = {};
      for (const row of (data ?? []) as MappingRow[]) out[row.key] = row.value;
      return out;
    },
  });
}

export function useSaveConnectorMapping(provider: string) {
  const { tenant } = useTenant();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entries: Record<string, string>) => {
      if (!tenant?.id) throw new Error("Geen tenant");
      const rows = Object.entries(entries)
        .filter(([, v]) => v !== "")
        .map(([key, value]) => ({
          tenant_id: tenant.id,
          provider,
          key,
          value,
        }));
      if (rows.length === 0) return;
      const { error } = await supabase
        .from("integration_mapping" as any)
        .upsert(rows, { onConflict: "tenant_id,provider,key" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["connector_mapping"] });
      toast.success("Mapping opgeslagen");
    },
    onError: (err) => {
      toast.error("Opslaan mislukt", {
        description: err instanceof Error ? err.message : String(err),
      });
    },
  });
}

// ─── Sync log ───────────────────────────────────────────────────────

export interface SyncLogRow {
  id: string;
  provider: string;
  direction: "push" | "pull" | "test";
  event_type: string | null;
  entity_type: string | null;
  entity_id: string | null;
  status: "SUCCESS" | "FAILED" | "SKIPPED";
  records_count: number;
  error_message: string | null;
  duration_ms: number | null;
  external_id: string | null;
  started_at: string;
}

export function useConnectorSyncLog(provider: string) {
  const { tenant } = useTenant();
  return useQuery({
    queryKey: ["connector_sync_log", tenant?.id, provider],
    enabled: !!tenant?.id,
    staleTime: 10_000,
    queryFn: async (): Promise<SyncLogRow[]> => {
      const { data, error } = await supabase
        .from("integration_sync_log" as any)
        .select("*")
        .eq("tenant_id", tenant!.id)
        .eq("provider", provider)
        .order("started_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as SyncLogRow[];
    },
  });
}

// ─── Test connection ────────────────────────────────────────────────

export function useTestConnector(provider: string) {
  const { tenant } = useTenant();
  return useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error("Geen tenant");
      const { data, error } = await supabase.functions.invoke(`connector-${provider}`, {
        body: { action: "test", tenant_id: tenant.id },
      });
      if (error) throw error;
      return data as { ok: boolean; message: string };
    },
    onSuccess: (res) => {
      if (res.ok) toast.success(res.message ?? "Verbinding werkt");
      else toast.error("Verbinding mislukt", { description: res.message });
    },
    onError: (err) => {
      toast.error("Test-call mislukt", {
        description: err instanceof Error ? err.message : String(err),
      });
    },
  });
}

export function usePullConnector(provider: string) {
  const { tenant } = useTenant();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params?: { since?: string | null; until?: string | null }) => {
      if (!tenant?.id) throw new Error("Geen tenant");
      const { data, error } = await supabase.functions.invoke(`connector-${provider}`, {
        body: {
          action: "pull",
          tenant_id: tenant.id,
          since: params?.since ?? null,
          until: params?.until ?? null,
        },
      });
      if (error) throw error;
      return data as { ok: boolean; recordsCount?: number; imported?: number; skipped?: number; message?: string; error?: string };
    },
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(res.message ?? "Gegevens opgehaald");
        qc.invalidateQueries({ queryKey: ["connector_sync_log"] });
        qc.invalidateQueries({ queryKey: ["drivers"] });
        qc.invalidateQueries({ queryKey: ["driver_actual_hours_per_week"] });
        qc.invalidateQueries({ queryKey: ["driver_availability_range"] });
        qc.invalidateQueries({ queryKey: ["driver_availability"] });
        qc.invalidateQueries({ queryKey: ["driver_personnel_card"] });
      } else {
        toast.error("Ophalen mislukt", {
          description: res.error ?? res.message ?? "Onbekende fout",
        });
      }
    },
    onError: (err) => {
      toast.error("Pull mislukt", {
        description: err instanceof Error ? err.message : String(err),
      });
    },
  });
}

// ─── Event policies ─────────────────────────────────────────────────
// Per-tenant aan/uit-vlag per (provider, event_type). Default = aan zodra
// connector enabled is. Ontbrekende rij wordt door de runtime ook als 'aan'
// behandeld zodat een nieuwe tenant niet handmatig elk event hoeft aan te
// vinken.

export interface ConnectorEventPolicy {
  event_type: string;
  enabled: boolean;
}

export function useEventPolicies(provider: string) {
  const { tenant } = useTenant();
  return useQuery({
    queryKey: ["connector_event_policies", tenant?.id, provider],
    enabled: !!tenant?.id,
    staleTime: 30_000,
    queryFn: async (): Promise<Record<string, boolean>> => {
      const { data, error } = await supabase
        .from("connector_event_policies" as any)
        .select("event_type, enabled")
        .eq("tenant_id", tenant!.id)
        .eq("provider", provider);
      if (error) throw error;
      const out: Record<string, boolean> = {};
      for (const row of ((data ?? []) as unknown) as ConnectorEventPolicy[]) {
        out[row.event_type] = row.enabled;
      }
      return out;
    },
  });
}

export function useSaveEventPolicy(provider: string) {
  const { tenant } = useTenant();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { eventType: string; enabled: boolean }) => {
      if (!tenant?.id) throw new Error("Geen tenant");
      const { error } = await supabase
        .from("connector_event_policies" as any)
        .upsert(
          {
            tenant_id: tenant.id,
            provider,
            event_type: input.eventType,
            enabled: input.enabled,
          },
          { onConflict: "tenant_id,provider,event_type" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["connector_event_policies"] });
    },
    onError: (err) => {
      toast.error("Kon event-policy niet opslaan", {
        description: err instanceof Error ? err.message : String(err),
      });
    },
  });
}

// ─── OAuth-flow start (Exact) ───────────────────────────────────────
// State wordt server-side HMAC-signed door exact-oauth-start om CSRF
// op de callback te voorkomen. Frontend heeft geen toegang tot het
// secret, dus de URL moet via die edge function opgehaald worden.

export async function startExactOAuth(input: {
  tenantId: string;
  clientId?: string | null;
  redirectUri?: string | null;
}): Promise<string | null> {
  const clientId = input.clientId?.trim();
  const redirectUri = input.redirectUri?.trim();
  if (!clientId || !redirectUri) return null;
  const { data, error } = await supabase.functions.invoke<{ authorize_url: string }>(
    "exact-oauth-start",
    {
      body: {
        tenant_id: input.tenantId,
      },
    },
  );
  if (error || !data?.authorize_url) {
    throw new Error(error?.message ?? "Kon Exact-authorize-URL niet ophalen");
  }
  return data.authorize_url;
}
