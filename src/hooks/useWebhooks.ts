import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface WebhookSubscription {
  id: string;
  tenant_id: string;
  name: string;
  url: string;
  events: string[];
  is_active: boolean;
  description: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  failure_count: number;
  created_at: string;
  updated_at: string;
}

export interface WebhookDelivery {
  id: string;
  tenant_id: string;
  subscription_id: string;
  event_type: string;
  event_id: string;
  status: "PENDING" | "DELIVERED" | "FAILED" | "DEAD";
  attempt_count: number;
  next_attempt_at: string | null;
  last_attempt_at: string | null;
  delivered_at: string | null;
  created_at: string;
  payload: Record<string, unknown>;
}

export interface WebhookDeliveryAttempt {
  id: string;
  delivery_id: string;
  attempt_number: number;
  status_code: number | null;
  response_body: string | null;
  error_message: string | null;
  duration_ms: number | null;
  attempted_at: string;
}

export const AVAILABLE_EVENTS = [
  { value: "order.created", label: "Order aangemaakt" },
  { value: "order.confirmed", label: "Order bevestigd" },
  { value: "order.status_changed", label: "Order status gewijzigd" },
  { value: "trip.planned", label: "Rit gepland" },
  { value: "trip.dispatched", label: "Rit onderweg" },
  { value: "trip.completed", label: "Rit voltooid" },
  { value: "invoice.created", label: "Factuur aangemaakt" },
  { value: "invoice.sent", label: "Factuur verzonden" },
  { value: "invoice.paid", label: "Factuur betaald" },
] as const;

function generateSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function useWebhookSubscriptions() {
  return useQuery({
    queryKey: ["webhook_subscriptions"],
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("webhook_subscriptions" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as WebhookSubscription[];
    },
  });
}

export interface CreateWebhookInput {
  name: string;
  url: string;
  events: string[];
  description?: string;
}

export function useCreateWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateWebhookInput) => {
      const secret = generateSecret();
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes.user?.id ?? null;
      const tenantId = (userRes.user?.app_metadata as { tenant_id?: string })?.tenant_id;
      if (!tenantId) throw new Error("Geen tenant-id in sessie");

      const { data, error } = await supabase
        .from("webhook_subscriptions" as any)
        .insert({
          tenant_id: tenantId,
          name: input.name,
          url: input.url,
          events: input.events,
          secret,
          description: input.description ?? null,
          created_by: userId,
        })
        .select()
        .single();
      if (error) throw error;
      return { subscription: data as unknown as WebhookSubscription, secret };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["webhook_subscriptions"] });
      toast.success("Webhook aangemaakt");
    },
    onError: (err) => {
      toast.error("Aanmaken mislukt", {
        description: err instanceof Error ? err.message : String(err),
      });
    },
  });
}

export function useUpdateWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      patch: Partial<Pick<WebhookSubscription, "name" | "url" | "events" | "is_active" | "description">>;
    }) => {
      const { error } = await supabase
        .from("webhook_subscriptions" as any)
        .update(input.patch)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["webhook_subscriptions"] });
      toast.success("Webhook bijgewerkt");
    },
    onError: (err) => {
      toast.error("Bijwerken mislukt", {
        description: err instanceof Error ? err.message : String(err),
      });
    },
  });
}

export function useDeleteWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("webhook_subscriptions" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["webhook_subscriptions"] });
      qc.invalidateQueries({ queryKey: ["webhook_deliveries"] });
      toast.success("Webhook verwijderd");
    },
    onError: (err) => {
      toast.error("Verwijderen mislukt", {
        description: err instanceof Error ? err.message : String(err),
      });
    },
  });
}

export function useWebhookDeliveries(subscriptionId: string | null) {
  return useQuery({
    queryKey: ["webhook_deliveries", subscriptionId],
    enabled: !!subscriptionId,
    staleTime: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("webhook_deliveries" as any)
        .select("*")
        .eq("subscription_id", subscriptionId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as WebhookDelivery[];
    },
  });
}

export function useWebhookDeliveryAttempts(deliveryId: string | null) {
  return useQuery({
    queryKey: ["webhook_delivery_attempts", deliveryId],
    enabled: !!deliveryId,
    staleTime: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("webhook_delivery_attempts" as any)
        .select("*")
        .eq("delivery_id", deliveryId!)
        .order("attempt_number", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as WebhookDeliveryAttempt[];
    },
  });
}

export function useReplayDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (deliveryId: string) => {
      const { error } = await supabase
        .from("webhook_deliveries" as any)
        .update({
          status: "PENDING",
          next_attempt_at: new Date().toISOString(),
        })
        .eq("id", deliveryId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["webhook_deliveries"] });
      toast.success("Delivery opnieuw ingepland");
    },
    onError: (err) => {
      toast.error("Replay mislukt", {
        description: err instanceof Error ? err.message : String(err),
      });
    },
  });
}

export function useTestWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (subscriptionId: string) => {
      const { data: userRes } = await supabase.auth.getUser();
      const tenantId = (userRes.user?.app_metadata as { tenant_id?: string })?.tenant_id;
      if (!tenantId) throw new Error("Geen tenant-id in sessie");

      const { data: sub, error: subErr } = await supabase
        .from("webhook_subscriptions" as any)
        .select("id, url")
        .eq("id", subscriptionId)
        .single();
      if (subErr || !sub) throw subErr ?? new Error("Subscription niet gevonden");

      const { error: emitErr } = await supabase.rpc("emit_webhook_event" as any, {
        p_tenant_id: tenantId,
        p_event_type: "webhook.test",
        p_payload: {
          message: "Test-event vanuit OrderFlow Settings",
          occurred_at: new Date().toISOString(),
        },
      });
      if (emitErr) throw emitErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["webhook_deliveries"] });
      toast.success("Test-event verstuurd", {
        description: "Bekijk de delivery-log om de response te zien",
      });
    },
    onError: (err) => {
      toast.error("Test mislukt", {
        description: err instanceof Error ? err.message : String(err),
      });
    },
  });
}
