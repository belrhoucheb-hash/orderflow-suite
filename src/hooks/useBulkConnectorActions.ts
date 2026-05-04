// Hook voor de bulk-acties op de marketplace.
//
// Niet via een mutation per stuk, maar één hook die de drie acties bundelt:
//   - testAll        , itereert door alle live connectors en roept connector-<provider>?action=test
//   - setAllEnabled  , update alle integration_credentials in één call
//   - replayFailedLast24h , delegate naar Edge Function connectors-bulk-replay
//
// `testAll` rapporteert progress via een callback zodat de dialog live kan updaten.

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useConnectorList } from "@/hooks/useConnectors";

export type BulkTestStatus = "pending" | "success" | "failed";

export interface BulkTestProgressItem {
  slug: string;
  name: string;
  status: BulkTestStatus;
  message?: string;
}

export function useBulkConnectorActions() {
  const { tenant } = useTenant();
  const list = useConnectorList();
  const qc = useQueryClient();
  const [isPending, setIsPending] = useState(false);

  const testAll = useCallback(
    async (onProgress: (items: BulkTestProgressItem[]) => void): Promise<BulkTestProgressItem[]> => {
      if (!tenant?.id) throw new Error("Geen tenant");
      const liveConnectors = (list.data ?? []).filter((c) => c.enabled && c.hasCredentials && c.status !== "soon");
      const items: BulkTestProgressItem[] = liveConnectors.map((c) => ({
        slug: c.slug,
        name: c.name,
        status: "pending",
      }));
      onProgress([...items]);
      setIsPending(true);
      try {
        for (let i = 0; i < liveConnectors.length; i++) {
          const c = liveConnectors[i];
          try {
            const { data, error } = await supabase.functions.invoke(`connector-${c.slug}`, {
              body: { action: "test", tenant_id: tenant.id },
            });
            if (error) throw error;
            const ok = (data as { ok?: boolean })?.ok ?? false;
            items[i] = {
              ...items[i],
              status: ok ? "success" : "failed",
              message: (data as { message?: string })?.message,
            };
          } catch (err) {
            items[i] = {
              ...items[i],
              status: "failed",
              message: err instanceof Error ? err.message : String(err),
            };
          }
          onProgress([...items]);
        }
        qc.invalidateQueries({ queryKey: ["connector_sync_log"] });
        return items;
      } finally {
        setIsPending(false);
      }
    },
    [list.data, tenant?.id, qc],
  );

  const setAllEnabled = useCallback(
    async (enabled: boolean) => {
      if (!tenant?.id) throw new Error("Geen tenant");
      setIsPending(true);
      try {
        const { error } = await supabase
          .from("integration_credentials" as never)
          .update({ enabled } as never)
          .eq("tenant_id", tenant.id);
        if (error) throw error;
        qc.invalidateQueries({ queryKey: ["connectors_list"] });
        qc.invalidateQueries({ queryKey: ["integration_credentials"] });
      } finally {
        setIsPending(false);
      }
    },
    [tenant?.id, qc],
  );

  const replayFailedLast24h = useCallback(async () => {
    if (!tenant?.id) throw new Error("Geen tenant");
    setIsPending(true);
    try {
      const { data, error } = await supabase.functions.invoke("connectors-bulk-replay", {
        body: { tenant_id: tenant.id, window_hours: 24 },
      });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["connector_sync_log"] });
      return data as { ok: boolean; queued?: number; message?: string };
    } finally {
      setIsPending(false);
    }
  }, [tenant?.id, qc]);

  return { testAll, setAllEnabled, replayFailedLast24h, isPending };
}
