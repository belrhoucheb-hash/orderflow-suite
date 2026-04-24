// Helper voor edge functions om een webhook-event te publiceren.
//
// Wrapper rond de SQL-functie public.emit_webhook_event. Edge functions
// importeren alleen deze helper; de SQL-functie blijft de enige manier
// om deliveries in de outbox te schrijven.
//
// Fouten worden gelogd maar niet re-throwd: een falende emit mag nooit
// een orderflow-statuschange blokkeren. Als de outbox rijen mist, is
// dat pijnlijk maar te recoveren; als een order niet wordt ingepland
// omdat de emit faalde, niet.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface EmitResult {
  emitted: number;
  error: string | null;
}

export async function emitWebhookEvent(
  supabase: SupabaseClient,
  tenantId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<EmitResult> {
  try {
    const { data, error } = await supabase.rpc("emit_webhook_event", {
      p_tenant_id: tenantId,
      p_event_type: eventType,
      p_payload: payload,
    });

    if (error) {
      console.error(
        `[emit_webhook_event] failed for ${eventType}: ${error.message}`,
      );
      return { emitted: 0, error: error.message };
    }

    const count = typeof data === "number" ? data : 0;
    return { emitted: count, error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[emit_webhook_event] threw for ${eventType}: ${message}`);
    return { emitted: 0, error: message };
  }
}
