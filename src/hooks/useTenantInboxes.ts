import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantOptional } from "@/contexts/TenantContext";

export interface TenantInbox {
  id: string;
  tenant_id: string;
  label: string;
  provider: "imap";
  host: string;
  port: number;
  username: string;
  folder: string;
  is_active: boolean;
  last_polled_at: string | null;
  last_error: string | null;
  consecutive_failures: number;
  next_poll_at: string | null;
  has_password: boolean;
  created_at: string;
  updated_at: string;
}

export interface InboxInput {
  label: string;
  host: string;
  port: number;
  username: string;
  folder?: string;
  password?: string;
}

export interface TestConnectionResult {
  ok: boolean;
  error?: string;
}

const QKEY = ["tenant-inboxes"] as const;

export function useTenantInboxes() {
  const qc = useQueryClient();
  const { tenant } = useTenantOptional();
  const tenantId = tenant?.id;

  const list = useQuery({
    queryKey: QKEY,
    enabled: !!tenantId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_inboxes" as any)
        .select("id, tenant_id, label, provider, host, port, username, folder, is_active, last_polled_at, last_error, consecutive_failures, next_poll_at, password_secret_id, created_at, updated_at")
        .order("label");
      if (error) throw error;
      return (data as any[]).map<TenantInbox>((r) => ({
        id: r.id,
        tenant_id: r.tenant_id,
        label: r.label,
        provider: r.provider,
        host: r.host,
        port: r.port,
        username: r.username,
        folder: r.folder,
        is_active: r.is_active,
        last_polled_at: r.last_polled_at,
        last_error: r.last_error,
        consecutive_failures: r.consecutive_failures,
        next_poll_at: r.next_poll_at,
        has_password: !!r.password_secret_id,
        created_at: r.created_at,
        updated_at: r.updated_at,
      }));
    },
  });

  const create = useMutation({
    mutationFn: async (input: InboxInput) => {
      if (!tenantId) throw new Error("Geen tenant-context");
      if (!input.password) throw new Error("Wachtwoord is verplicht bij nieuwe inbox");

      const { data: inserted, error } = await supabase
        .from("tenant_inboxes" as any)
        .insert({
          tenant_id: tenantId,
          label: input.label,
          host: input.host,
          port: input.port,
          username: input.username,
          folder: input.folder || "INBOX",
        })
        .select("id")
        .single();
      if (error) throw error;

      // Audit: created
      await supabase.from("tenant_inbox_audit" as any).insert({
        inbox_id: (inserted as any).id,
        tenant_id: tenantId,
        action: "created",
        detail: { label: input.label },
      });

      // Wachtwoord via RPC (versleuteld in vault)
      const { error: pwErr } = await supabase.rpc("set_tenant_inbox_password" as any, {
        p_inbox_id: (inserted as any).id,
        p_password: input.password,
      });
      if (pwErr) throw pwErr;

      await supabase.from("tenant_inbox_audit" as any).insert({
        inbox_id: (inserted as any).id,
        tenant_id: tenantId,
        action: "password_changed",
      });

      return (inserted as any).id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QKEY }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...input }: Partial<InboxInput> & { id: string }) => {
      if (!tenantId) throw new Error("Geen tenant-context");

      const { password, ...rest } = input;

      if (Object.keys(rest).length > 0) {
        const { error } = await supabase
          .from("tenant_inboxes" as any)
          .update(rest)
          .eq("id", id);
        if (error) throw error;

        await supabase.from("tenant_inbox_audit" as any).insert({
          inbox_id: id,
          tenant_id: tenantId,
          action: "updated",
          detail: rest,
        });
      }

      if (password) {
        const { error: pwErr } = await supabase.rpc("set_tenant_inbox_password" as any, {
          p_inbox_id: id,
          p_password: password,
        });
        if (pwErr) throw pwErr;

        await supabase.from("tenant_inbox_audit" as any).insert({
          inbox_id: id,
          tenant_id: tenantId,
          action: "password_changed",
        });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QKEY }),
  });

  const setActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      if (!tenantId) throw new Error("Geen tenant-context");

      // Reset backoff bij reactiveren
      const update: Record<string, any> = { is_active };
      if (is_active) {
        update.consecutive_failures = 0;
        update.next_poll_at = null;
        update.last_error = null;
      }

      const { error } = await supabase
        .from("tenant_inboxes" as any)
        .update(update)
        .eq("id", id);
      if (error) throw error;

      await supabase.from("tenant_inbox_audit" as any).insert({
        inbox_id: id,
        tenant_id: tenantId,
        action: is_active ? "activated" : "deactivated",
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QKEY }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (!tenantId) throw new Error("Geen tenant-context");

      // Audit vóór delete (foreign key wordt SET NULL door trigger)
      await supabase.from("tenant_inbox_audit" as any).insert({
        inbox_id: id,
        tenant_id: tenantId,
        action: "deleted",
      });

      const { error } = await supabase.from("tenant_inboxes" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QKEY }),
  });

  const testConnection = useMutation({
    mutationFn: async (
      input: { inboxId: string } | (InboxInput & { tenantId: string }),
    ): Promise<TestConnectionResult> => {
      const body = "inboxId" in input ? { inboxId: input.inboxId } : input;
      const { data, error } = await supabase.functions.invoke("test-inbox-connection", {
        body,
      });
      if (error) {
        return { ok: false, error: error.message };
      }
      return data as TestConnectionResult;
    },
  });

  return {
    ...list,
    create,
    update,
    setActive,
    remove,
    testConnection,
  };
}
