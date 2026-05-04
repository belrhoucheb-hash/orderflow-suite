// Hook voor het opnieuw versturen van een sync-log event via de
// connector-replay-event Edge Function.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";

export interface ReplayInput {
  eventId: string;
  eventType: string | null;
  payload: Record<string, unknown>;
  edited: boolean;
}

export function useReplaySyncEvent(provider: string | null) {
  const { tenant } = useTenant();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ReplayInput) => {
      if (!tenant?.id) throw new Error("Geen tenant");
      if (!provider) throw new Error("Geen provider");
      const { data, error } = await supabase.functions.invoke("connector-replay-event", {
        body: {
          tenant_id: tenant.id,
          provider,
          original_event_id: input.eventId,
          event_type: input.eventType,
          payload: input.payload,
          edited: input.edited,
        },
      });
      if (error) throw error;
      return data as { ok: boolean; message?: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["connector_sync_log"] });
      qc.invalidateQueries({ queryKey: ["connector_audit_log"] });
    },
  });
}

export function useReplaySyncEventsBulk(provider: string | null) {
  const { tenant } = useTenant();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (eventIds: string[]) => {
      if (!tenant?.id) throw new Error("Geen tenant");
      if (!provider) throw new Error("Geen provider");
      const { data, error } = await supabase.functions.invoke("connector-replay-event", {
        body: {
          tenant_id: tenant.id,
          provider,
          bulk_event_ids: eventIds,
        },
      });
      if (error) throw error;
      return data as { ok: boolean; replayed?: number; message?: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["connector_sync_log"] });
      qc.invalidateQueries({ queryKey: ["connector_audit_log"] });
    },
  });
}
