import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantOptional } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { createNotification } from "@/hooks/useNotifications";
import { defaultExpectedBy } from "@/hooks/useOrderInfoRequests";
import { recordDecision, resolveDecision } from "@/lib/confidenceEngine";
import type { DecisionType, Resolution } from "@/types/confidence";
import type {
  CreateExceptionActionInput,
  ExceptionAction,
  ExceptionActionFilters,
  ExceptionActionRun,
  ExceptionActionStatus,
  ExceptionActionType,
  RecordExceptionActionRunInput,
} from "@/types/exceptionActions";
import {
  mapRowToExceptionAction,
  mapRowToExceptionActionRun,
} from "@/types/exceptionActions";

interface OrderContextRow {
  id: string;
  order_number: string | null;
  client_id: string | null;
  client_name: string | null;
  recipient_email: string | null;
  recipient_phone: string | null;
  delivery_date: string | null;
}

async function fetchOrderContext(orderId: string): Promise<OrderContextRow | null> {
  const { data, error } = await (supabase as any)
    .from("orders")
    .select("id, order_number, client_id, client_name, recipient_email, recipient_phone, delivery_date")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as OrderContextRow | null;
}

function inferDecisionContext(input: {
  actionType: string;
  payload?: Record<string, unknown>;
}): { decisionType: DecisionType; entityType: "order" | "trip" | "invoice"; entityId?: string } {
  const payload = input.payload ?? {};
  const orderId = typeof payload.orderId === "string" ? payload.orderId : undefined;
  const tripId = typeof payload.tripId === "string" ? payload.tripId : undefined;

  if (input.actionType === "FLAG_BILLING_REVIEW") {
    return { decisionType: "INVOICING", entityType: "order", entityId: orderId };
  }
  if (tripId && !orderId) {
    return { decisionType: "DISPATCH", entityType: "trip", entityId: tripId };
  }
  return { decisionType: "DISPATCH", entityType: "order", entityId: orderId ?? tripId };
}

function mapActionStatusToDecisionResolution(action: ExceptionAction, status: ExceptionActionStatus): Resolution | null {
  if (status === "REJECTED") return "REJECTED";
  if (status === "AUTO_EXECUTED") return "AUTO_EXECUTED";
  if (status === "APPROVED") return "APPROVED";
  if (status === "EXECUTED") {
    return action.requiresApproval ? "APPROVED" : "AUTO_EXECUTED";
  }
  return null;
}

async function fetchTripDriverContext(tripId: string | undefined, orderId?: string) {
  let resolvedTripId = tripId;

  if (!resolvedTripId && orderId) {
    const { data: stop } = await (supabase as any)
      .from("trip_stops")
      .select("trip_id")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    resolvedTripId = stop?.trip_id ?? undefined;
  }

  if (!resolvedTripId) return null;

  const { data, error } = await (supabase as any)
    .from("trips")
    .select("id, trip_number, driver_id")
    .eq("id", resolvedTripId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.driver_id) return { tripId: resolvedTripId, tripNumber: data?.trip_number ?? null, driverUserId: null };

  const { data: driver } = await (supabase as any)
    .from("drivers")
    .select("user_id, name")
    .eq("id", data.driver_id)
    .maybeSingle();

  return {
    tripId: resolvedTripId,
    tripNumber: data.trip_number ?? null,
    driverUserId: driver?.user_id ?? null,
    driverName: driver?.name ?? null,
  };
}

async function insertNotificationLog(input: {
  tenantId: string;
  orderId?: string;
  tripId?: string;
  recipientEmail?: string | null;
  recipientPhone?: string | null;
  subject?: string | null;
  body: string;
  triggerEvent?: string;
}) {
  const channel = input.recipientPhone ? "SMS" : "EMAIL";
  const { error } = await (supabase as any)
    .from("notification_log")
    .insert({
      tenant_id: input.tenantId,
      order_id: input.orderId ?? null,
      trip_id: input.tripId ?? null,
      recipient_email: input.recipientEmail ?? null,
      recipient_phone: input.recipientPhone ?? null,
      channel,
      trigger_event: input.triggerEvent ?? "EXCEPTION",
      status: "SENT",
      subject: input.subject ?? null,
      body: input.body,
      sent_at: new Date().toISOString(),
    });
  if (error) throw error;
}

async function executeEtaUpdate(params: {
  tenantId: string;
  orderId?: string;
  tripId?: string;
  payload?: Record<string, unknown>;
}) {
  if (!params.orderId) {
    throw new Error("Geen order gekoppeld aan ETA-update");
  }

  const order = await fetchOrderContext(params.orderId);
  if (!order) throw new Error("Order niet gevonden");

  const message = `Proactieve ETA-update voor order ${order.order_number ?? params.orderId}: we zien een afwijking in planning of uitvoering.`;

  await insertNotificationLog({
    tenantId: params.tenantId,
    orderId: params.orderId,
    tripId: params.tripId,
    recipientEmail: order.recipient_email,
    recipientPhone: order.recipient_phone,
    subject: `ETA-update order ${order.order_number ?? ""}`.trim(),
    body: message,
  });

  await createNotification({
    type: "ETA_EXCEPTION_COPILOT",
    title: "ETA-update voorbereid",
    message,
    order_id: params.orderId,
    tenant_id: params.tenantId,
    metadata: {
      source: "exception_copilot",
      trip_id: params.tripId ?? null,
      ...(params.payload ?? {}),
    },
  });
}

async function executeRequestMissingInfo(params: {
  tenantId: string;
  orderId?: string;
  payload?: Record<string, unknown>;
}) {
  if (!params.orderId) {
    throw new Error("Geen order gekoppeld aan infoverzoek");
  }

  const order = await fetchOrderContext(params.orderId);
  if (!order) throw new Error("Order niet gevonden");

  const rawFields = Array.isArray(params.payload?.missingFields)
    ? (params.payload?.missingFields as string[])
    : [];
  const fields = rawFields.length > 0 ? rawFields : ["aanvullende_informatie"];

  const rows = fields.map((field) => ({
    tenant_id: params.tenantId,
    order_id: params.orderId,
    field_name: field,
    field_label: field,
    promised_by_name: order.client_name ?? null,
    promised_by_email: order.recipient_email ?? null,
    expected_by: defaultExpectedBy(order.delivery_date),
    status: "PENDING",
  }));

  const { error } = await (supabase as any)
    .from("order_info_requests")
    .insert(rows);
  if (error && !String(error.message || "").toLowerCase().includes("duplicate")) {
    throw error;
  }

  await createNotification({
    type: "ORDER_INFO_REQUEST",
    title: "Infoverzoek aangemaakt",
    message: `Openstaand informatieverzoek voor order ${order.order_number ?? params.orderId}.`,
    order_id: params.orderId,
    tenant_id: params.tenantId,
    metadata: {
      source: "exception_copilot",
      requested_fields: fields,
    },
  });
}

async function executeBillingReview(params: {
  tenantId: string;
  userId?: string | null;
  orderId?: string;
  payload?: Record<string, unknown>;
}) {
  if (!params.orderId) {
    throw new Error("Geen order gekoppeld aan billing review");
  }

  const order = await fetchOrderContext(params.orderId);
  if (!order) throw new Error("Order niet gevonden");

  const reason = `Exception Copilot markeerde order ${order.order_number ?? params.orderId} voor billing review`;

  const { error: orderError } = await (supabase as any)
    .from("orders")
    .update({
      billing_status: "GEBLOKKEERD",
      billing_blocked_reason: reason,
    })
    .eq("id", params.orderId);
  if (orderError) throw orderError;

  const { error: chargeError } = await (supabase as any)
    .from("order_charges")
    .insert({
      tenant_id: params.tenantId,
      order_id: params.orderId,
      charge_type: "manual",
      description: "Billing review vereist",
      source_description: reason,
      amount_cents: 0,
      created_by: params.userId ?? null,
    });
  if (chargeError) throw chargeError;

  await createNotification({
    type: "BILLING_REVIEW",
    title: "Order gemarkeerd voor facturatie-review",
    message: reason,
    order_id: params.orderId,
    tenant_id: params.tenantId,
    metadata: {
      source: "exception_copilot",
      ...(params.payload ?? {}),
    },
  });
}

async function executePodReminder(params: {
  tenantId: string;
  orderId?: string;
  tripId?: string;
}) {
  const tripContext = await fetchTripDriverContext(params.tripId, params.orderId);
  if (!tripContext?.driverUserId) {
    throw new Error("Geen gekoppelde chauffeur gevonden voor POD-reminder");
  }

  await createNotification({
    type: "POD_REMINDER",
    title: "POD ontbreekt nog",
    message: `Rond de aflevering af door de POD direct te uploaden voor rit ${tripContext.tripNumber ?? ""}`.trim(),
    user_id: tripContext.driverUserId,
    order_id: params.orderId,
    tenant_id: params.tenantId,
    metadata: {
      source: "exception_copilot",
      trip_id: tripContext.tripId,
    },
  });
}

function buildActionQuery(filters: ExceptionActionFilters | undefined, tenantId: string) {
  let query = (supabase as any)
    .from("exception_actions")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("recommended", { ascending: false })
    .order("confidence", { ascending: false })
    .order("created_at", { ascending: false });

  if (filters?.sourceType) {
    query = query.eq("source_type", filters.sourceType);
  }
  if (filters?.sourceRef) {
    query = query.eq("source_ref", filters.sourceRef);
  }
  if (filters?.exceptionId) {
    query = query.eq("exception_id", filters.exceptionId);
  }
  if (filters?.status && filters.status !== "ALL") {
    query = query.eq("status", filters.status);
  }
  if (filters?.recommendedOnly) {
    query = query.eq("recommended", true);
  }

  return query;
}

export function useExceptionActions(filters?: ExceptionActionFilters) {
  const { tenant } = useTenantOptional();

  return useQuery({
    queryKey: ["exception-actions", tenant?.id, filters],
    enabled: !!tenant?.id,
    queryFn: async (): Promise<ExceptionAction[]> => {
      const { data, error } = await buildActionQuery(filters, tenant!.id);
      if (error) throw error;
      return ((data ?? []) as any[]).map(mapRowToExceptionAction);
    },
    staleTime: 10_000,
    refetchInterval: 60_000,
  });
}

export function useRecommendedExceptionAction(sourceType?: string, sourceRef?: string) {
  const result = useExceptionActions({
    sourceType: sourceType as any,
    sourceRef,
    status: "PENDING",
    recommendedOnly: true,
  });

  return {
    ...result,
    data: result.data?.[0] ?? null,
  };
}

export function useExceptionActionRuns(exceptionActionId: string | null) {
  const { tenant } = useTenantOptional();

  return useQuery({
    queryKey: ["exception-action-runs", tenant?.id, exceptionActionId],
    enabled: !!tenant?.id && !!exceptionActionId,
    queryFn: async (): Promise<ExceptionActionRun[]> => {
      const { data, error } = await (supabase as any)
        .from("exception_action_runs")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .eq("exception_action_id", exceptionActionId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as any[]).map(mapRowToExceptionActionRun);
    },
    staleTime: 10_000,
  });
}

export function useCreateExceptionAction() {
  const { tenant } = useTenantOptional();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateExceptionActionInput): Promise<ExceptionAction> => {
      if (!tenant?.id) throw new Error("Geen tenant context");

      const decisionContext = inferDecisionContext({
        actionType: input.actionType,
        payload: input.payload,
      });
      const orderId = typeof input.payload?.orderId === "string" ? input.payload.orderId : undefined;
      const order = orderId ? await fetchOrderContext(orderId) : null;
      const decision = await recordDecision(supabase, {
        tenantId: tenant.id,
        decisionType: decisionContext.decisionType,
        entityType: decisionContext.entityType,
        entityId: decisionContext.entityId ?? input.sourceRef,
        clientId: order?.client_id ?? null,
        proposedAction: {
          title: input.title,
          actionType: input.actionType,
          sourceType: input.sourceType,
          sourceRef: input.sourceRef,
          impact: input.impact ?? {},
        },
        inputConfidence: input.confidence,
        modelConfidence: input.confidence,
        resolution: "PENDING",
      });

      const insertPayload = {
        tenant_id: tenant.id,
        exception_id: input.exceptionId ?? null,
        source_type: input.sourceType,
        source_ref: input.sourceRef,
        action_type: input.actionType,
        title: input.title,
        description: input.description ?? null,
        confidence: input.confidence,
        impact_json: input.impact ?? {},
        payload_json: {
          ...(input.payload ?? {}),
          decisionLogId: decision.id,
        },
        status: input.status ?? "PENDING",
        recommended: input.recommended ?? false,
        requires_approval: input.requiresApproval ?? true,
      };

      const { data, error } = await (supabase as any)
        .from("exception_actions")
        .insert(insertPayload)
        .select("*")
        .single();
      if (error) throw error;

      return mapRowToExceptionAction(data);
    },
    onSuccess: (action) => {
      queryClient.invalidateQueries({ queryKey: ["exception-actions"] });
      toast.success(`Actievoorstel toegevoegd: ${action.title}`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Kon actievoorstel niet opslaan");
    },
  });
}

export function useRecordExceptionActionRun() {
  const { tenant } = useTenantOptional();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: RecordExceptionActionRunInput): Promise<ExceptionActionRun> => {
      if (!tenant?.id) throw new Error("Geen tenant context");

      const { data, error } = await (supabase as any)
        .from("exception_action_runs")
        .insert({
          tenant_id: tenant.id,
          exception_action_id: input.exceptionActionId,
          run_type: input.runType,
          result: input.result,
          notes: input.notes ?? null,
          payload_json: input.payload ?? {},
          created_by: user?.id ?? null,
        })
        .select("*")
        .single();
      if (error) throw error;

      return mapRowToExceptionActionRun(data);
    },
    onSuccess: (_run, variables) => {
      queryClient.invalidateQueries({ queryKey: ["exception-action-runs", tenant?.id, variables.exceptionActionId] });
    },
  });
}

interface UpdateExceptionActionStatusInput {
  id: string;
  status: ExceptionActionStatus;
  notes?: string;
  payload?: Record<string, unknown>;
}

export function useUpdateExceptionActionStatus() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const recordRun = useRecordExceptionActionRun();

  return useMutation({
    mutationFn: async ({ id, status }: UpdateExceptionActionStatusInput): Promise<ExceptionAction> => {
      const { data: existing, error: readError } = await (supabase as any)
        .from("exception_actions")
        .select("*")
        .eq("id", id)
        .single();
      if (readError) throw readError;

      const updatePayload: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
      };

      if (status === "EXECUTED" || status === "AUTO_EXECUTED") {
        updatePayload.executed_at = new Date().toISOString();
        updatePayload.executed_by = user?.id ?? null;
      }

      const { data, error } = await (supabase as any)
        .from("exception_actions")
        .update(updatePayload)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;

      const mapped = mapRowToExceptionAction(data);
      const existingMapped = mapRowToExceptionAction(existing);
      const decisionLogId =
        typeof existingMapped.payload?.decisionLogId === "string"
          ? existingMapped.payload.decisionLogId
          : typeof mapped.payload?.decisionLogId === "string"
            ? mapped.payload.decisionLogId
            : undefined;

      const decisionResolution = mapActionStatusToDecisionResolution(mapped, status);
      if (decisionLogId && decisionResolution) {
        await resolveDecision(
          supabase,
          decisionLogId,
          decisionResolution,
          {
            actionType: mapped.actionType,
            title: mapped.title,
            status,
          },
          user?.id,
        );
      }

      return mapped;
    },
    onSuccess: async (action, variables) => {
      queryClient.invalidateQueries({ queryKey: ["exception-actions"] });
      queryClient.invalidateQueries({ queryKey: ["decision-feed"] });
      queryClient.invalidateQueries({ queryKey: ["autonomy-score"] });
      queryClient.invalidateQueries({ queryKey: ["correction-log"] });
      queryClient.invalidateQueries({ queryKey: ["autonomy-trend"] });

      const runTypeMap: Record<ExceptionActionStatus, RecordExceptionActionRunInput["runType"]> = {
        PENDING: "PROPOSED",
        APPROVED: "APPROVED",
        REJECTED: "REJECTED",
        AUTO_EXECUTED: "AUTO_EXECUTED",
        EXECUTED: "EXECUTED",
        FAILED: "FAILED",
      };

      const resultMap: Record<ExceptionActionStatus, RecordExceptionActionRunInput["result"]> = {
        PENDING: "ACKNOWLEDGED",
        APPROVED: "ACKNOWLEDGED",
        REJECTED: "SKIPPED",
        AUTO_EXECUTED: "SUCCESS",
        EXECUTED: "SUCCESS",
        FAILED: "FAILED",
      };

      await recordRun.mutateAsync({
        exceptionActionId: action.id,
        runType: runTypeMap[variables.status],
        result: resultMap[variables.status],
        notes: variables.notes,
        payload: variables.payload,
      });
    },
  });
}

interface ExecuteExceptionActionInput {
  actionId: string;
  actionType: ExceptionActionType | string;
  payload?: Record<string, unknown>;
}

export function useExecuteExceptionAction() {
  const { tenant } = useTenantOptional();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const updateStatus = useUpdateExceptionActionStatus();

  return useMutation({
    mutationFn: async ({ actionId, actionType, payload }: ExecuteExceptionActionInput) => {
      if (!tenant?.id) throw new Error("Geen tenant context");

      const normalizedPayload = payload ?? {};
      const orderId = typeof normalizedPayload.orderId === "string" ? normalizedPayload.orderId : undefined;
      const tripId = typeof normalizedPayload.tripId === "string" ? normalizedPayload.tripId : undefined;
      const requiresApproval = normalizedPayload.requiresApproval === true;
      const currentStatus = typeof normalizedPayload.currentStatus === "string" ? normalizedPayload.currentStatus : undefined;

      if (requiresApproval && currentStatus !== "APPROVED") {
        throw new Error("Keur deze actie eerst goed voordat je hem uitvoert");
      }

      try {
        if (actionType === "SEND_ETA_UPDATE") {
          await executeEtaUpdate({
            tenantId: tenant.id,
            orderId,
            tripId,
            payload: normalizedPayload,
          });
        } else if (actionType === "REQUEST_MISSING_INFO") {
          await executeRequestMissingInfo({
            tenantId: tenant.id,
            orderId,
            payload: normalizedPayload,
          });
        } else if (actionType === "FLAG_BILLING_REVIEW") {
          await executeBillingReview({
            tenantId: tenant.id,
            userId: user?.id ?? null,
            orderId,
            payload: normalizedPayload,
          });
        } else if (actionType === "REMIND_DRIVER_FOR_POD") {
          await executePodReminder({
            tenantId: tenant.id,
            orderId,
            tripId,
          });
        }

        await updateStatus.mutateAsync({
          id: actionId,
          status: requiresApproval ? "EXECUTED" : "AUTO_EXECUTED",
          payload: {
            actionType,
            ...(normalizedPayload ?? {}),
          },
        });

        return { success: true };
      } catch (error) {
        await updateStatus.mutateAsync({
          id: actionId,
          status: "FAILED",
          payload: {
            actionType,
            ...(normalizedPayload ?? {}),
            error: error instanceof Error ? error.message : String(error),
          },
        });
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["order_info_requests"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notification_log"] });
      queryClient.invalidateQueries({ queryKey: ["decision-feed"] });
      queryClient.invalidateQueries({ queryKey: ["autonomy-score"] });
      toast.success("Exception-actie uitgevoerd");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Kon exception-actie niet uitvoeren");
    },
  });
}
