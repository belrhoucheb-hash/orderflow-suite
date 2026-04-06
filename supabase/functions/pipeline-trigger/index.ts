import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://orderflow-suite.vercel.app",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface DirectPayload {
  tenant_id: string;
  entity_type: "order" | "trip" | "invoice";
  entity_id: string;
  previous_status: string;
  new_status: string;
}

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: Record<string, unknown>;
  old_record: Record<string, unknown>;
}

const STATUS_TO_EVENT: Record<string, string> = {
  DRAFT: "ORDER_CREATED",
  PENDING: "ORDER_CREATED",
  CONFIRMED: "ORDER_CONFIRMED",
  PLANNED: "TRIP_PLANNED",
  DISPATCHED: "TRIP_DISPATCHED",
  IN_TRANSIT: "TRIP_DISPATCHED",
  DELIVERED: "DELIVERY_COMPLETE",
};

const EVENT_TO_ACTION: Record<string, string | null> = {
  ORDER_CREATED: "CONFIRM_ORDER",
  ORDER_CONFIRMED: "ASSIGN_VEHICLE",
  TRIP_PLANNED: "DISPATCH_TRIP",
  TRIP_DISPATCHED: null,
  DELIVERY_COMPLETE: "SEND_INVOICE",
  INVOICE_READY: null,
};

const EVENT_TO_DECISION_TYPE: Record<string, string> = {
  ORDER_CREATED: "ORDER_INTAKE",
  ORDER_CONFIRMED: "PLANNING",
  TRIP_PLANNED: "DISPATCH",
  TRIP_DISPATCHED: "DISPATCH",
  DELIVERY_COMPLETE: "INVOICING",
  INVOICE_READY: "INVOICING",
};

const ACTION_PRIORITY: Record<string, number> = {
  CONFIRM_ORDER: 10,
  ASSIGN_VEHICLE: 5,
  DISPATCH_TRIP: 8,
  SEND_INVOICE: 3,
};

const TABLE_TO_ENTITY: Record<string, string> = {
  orders: "order",
  trips: "trip",
  invoices: "invoice",
};

const TABLE_STATUS_FIELD: Record<string, string> = {
  orders: "status",
  trips: "dispatch_status",
  invoices: "status",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();

    let tenantId: string;
    let entityType: string;
    let entityId: string;
    let previousStatus: string;
    let newStatus: string;

    if (body.type && body.table && body.record) {
      const webhook = body as WebhookPayload;

      if (webhook.type !== "UPDATE") {
        return new Response(
          JSON.stringify({ skipped: true, reason: "Only UPDATE events trigger pipeline" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const statusField = TABLE_STATUS_FIELD[webhook.table] ?? "status";
      const oldStatus = String(webhook.old_record[statusField] ?? "");
      const curStatus = String(webhook.record[statusField] ?? "");

      if (oldStatus === curStatus) {
        return new Response(
          JSON.stringify({ skipped: true, reason: "Status did not change" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      tenantId = String(webhook.record.tenant_id);
      entityType = TABLE_TO_ENTITY[webhook.table] ?? webhook.table;
      entityId = String(webhook.record.id);
      previousStatus = oldStatus;
      newStatus = curStatus;
    } else {
      const direct = body as DirectPayload;
      tenantId = direct.tenant_id;
      entityType = direct.entity_type;
      entityId = direct.entity_id;
      previousStatus = direct.previous_status;
      newStatus = direct.new_status;
    }

    if (!tenantId || !entityType || !entityId || !newStatus) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: tenant_id, entity_type, entity_id, new_status" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if autonomy is enabled for this tenant
    const { data: tenant, error: tenantErr } = await supabase
      .from("tenants")
      .select("settings")
      .eq("id", tenantId)
      .single();

    if (tenantErr) {
      return new Response(
        JSON.stringify({ error: `Tenant lookup failed: ${tenantErr.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const settings = (tenant?.settings as Record<string, unknown>) ?? {};
    const autonomy = (settings.autonomy as Record<string, unknown>) ?? {};

    if (!autonomy.enabled) {
      await supabase.from("pipeline_events").insert({
        tenant_id: tenantId,
        entity_type: entityType,
        entity_id: entityId,
        event_type: STATUS_TO_EVENT[newStatus] ?? newStatus,
        previous_status: previousStatus,
        new_status: newStatus,
        evaluation_result: "BLOCKED",
        confidence_at_evaluation: null,
        action_taken: { reason: "Autonomy disabled for tenant" },
      });

      return new Response(
        JSON.stringify({ skipped: true, reason: "Autonomy not enabled for tenant" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Evaluate next step
    const eventType = STATUS_TO_EVENT[newStatus] ?? null;

    if (!eventType) {
      await supabase.from("pipeline_events").insert({
        tenant_id: tenantId,
        entity_type: entityType,
        entity_id: entityId,
        event_type: newStatus,
        previous_status: previousStatus,
        new_status: newStatus,
        evaluation_result: "BLOCKED",
        confidence_at_evaluation: null,
        action_taken: { reason: "No event mapping for status" },
      });

      return new Response(
        JSON.stringify({ result: "BLOCKED", reason: "No event mapping for status" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const actionType = EVENT_TO_ACTION[eventType];

    if (!actionType) {
      await supabase.from("pipeline_events").insert({
        tenant_id: tenantId,
        entity_type: entityType,
        entity_id: entityId,
        event_type: eventType,
        previous_status: previousStatus,
        new_status: newStatus,
        evaluation_result: "BLOCKED",
        confidence_at_evaluation: null,
        action_taken: { reason: "No action for this event type" },
      });

      return new Response(
        JSON.stringify({ result: "BLOCKED", reason: "No action for this event type" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get confidence score
    const decisionType = EVENT_TO_DECISION_TYPE[eventType];

    const { data: scoreRow } = await supabase
      .from("confidence_scores")
      .select("current_score")
      .eq("tenant_id", tenantId)
      .eq("decision_type", decisionType)
      .is("client_id", null)
      .maybeSingle();

    const confidence = scoreRow?.current_score ?? 50;

    // Check threshold
    const thresholds = (autonomy.thresholds as Record<string, number>) ?? {};
    const threshold = thresholds[decisionType]
      ?? (autonomy.global_threshold as number)
      ?? 95;

    const shouldAuto = confidence >= threshold;

    // Record decision
    const { data: decision, error: decisionErr } = await supabase
      .from("decision_log")
      .insert({
        tenant_id: tenantId,
        decision_type: decisionType,
        entity_type: entityType,
        entity_id: entityId,
        proposed_action: { actionType, status: newStatus },
        input_confidence: confidence,
        model_confidence: confidence,
        resolution: shouldAuto ? "AUTO_EXECUTED" : "PENDING",
      })
      .select()
      .single();

    if (decisionErr) {
      console.error("Failed to record decision:", decisionErr);
      return new Response(
        JSON.stringify({ error: `Decision logging failed: ${decisionErr.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (shouldAuto) {
      let execError: string | null = null;

      try {
        let updateResult: { error: { message: string } | null };
        switch (actionType) {
          case "CONFIRM_ORDER":
            updateResult = await supabase.from("orders").update({ status: "CONFIRMED" }).eq("id", entityId);
            break;
          case "ASSIGN_VEHICLE":
            updateResult = await supabase.from("orders").update({ status: "PLANNED" }).eq("id", entityId);
            break;
          case "DISPATCH_TRIP":
            updateResult = await supabase.from("trips").update({ dispatch_status: "VERZONDEN" }).eq("id", entityId);
            break;
          case "SEND_INVOICE":
            updateResult = await supabase.from("invoices").update({ status: "verzonden" }).eq("id", entityId);
            break;
          default:
            updateResult = { error: { message: `Unknown action: ${actionType}` } };
        }
        if (updateResult.error) {
          execError = updateResult.error.message;
        }
      } catch (e) {
        execError = e instanceof Error ? e.message : String(e);
      }

      await supabase.from("pipeline_events").insert({
        tenant_id: tenantId,
        entity_type: entityType,
        entity_id: entityId,
        event_type: eventType,
        previous_status: previousStatus,
        new_status: newStatus,
        evaluation_result: execError ? "BLOCKED" : "AUTO_EXECUTE",
        confidence_at_evaluation: confidence,
        action_taken: { actionType, decisionId: decision.id, error: execError },
      });

      return new Response(
        JSON.stringify({
          result: execError ? "BLOCKED" : "AUTO_EXECUTE",
          actionType, confidence, decisionId: decision.id, error: execError,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      const priority = ACTION_PRIORITY[actionType] ?? 0;
      const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();

      const { error: vqErr } = await supabase.from("validation_queue").insert({
        tenant_id: tenantId,
        decision_log_id: decision.id,
        entity_type: entityType,
        entity_id: entityId,
        action_type: actionType,
        proposed_action: { actionType, status: newStatus },
        confidence,
        priority,
        status: "PENDING",
        expires_at: expiresAt,
      });

      if (vqErr) {
        console.error("Failed to create validation request:", vqErr);
      }

      await supabase.from("pipeline_events").insert({
        tenant_id: tenantId,
        entity_type: entityType,
        entity_id: entityId,
        event_type: eventType,
        previous_status: previousStatus,
        new_status: newStatus,
        evaluation_result: "NEEDS_VALIDATION",
        confidence_at_evaluation: confidence,
        action_taken: { actionType, decisionId: decision.id, validationRequired: true },
      });

      return new Response(
        JSON.stringify({
          result: "NEEDS_VALIDATION",
          actionType, confidence, threshold, decisionId: decision.id,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (e) {
    console.error("pipeline-trigger error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
