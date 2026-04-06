/**
 * Confidence Store — shared helper for Supabase Edge Functions.
 *
 * Inserts AI decision records into the `ai_decisions` table so that
 * every extraction / planning / dispatch decision is tracked with its
 * confidence score and per-field confidences.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// ── Types (mirror src/types/confidence.ts, kept minimal for Deno) ──

export type AIDecisionType =
  | "order_extraction"
  | "planning_assignment"
  | "dispatch_auto"
  | "invoice_auto";

export interface RecordAIDecisionParams {
  tenantId: string;
  decisionType: AIDecisionType;
  entityId?: string;
  entityType?: string; // 'order' | 'trip' | 'invoice'
  confidenceScore: number;
  fieldConfidences?: Record<string, number>;
  aiSuggestion: Record<string, unknown>;
  wasAutoApproved?: boolean;
  processingTimeMs?: number;
  modelVersion?: string;
}

export interface AIDecisionRow {
  id: string;
  tenant_id: string;
  decision_type: AIDecisionType;
  entity_id: string | null;
  entity_type: string | null;
  confidence_score: number;
  field_confidences: Record<string, number>;
  ai_suggestion: Record<string, unknown>;
  was_auto_approved: boolean;
  processing_time_ms: number | null;
  model_version: string | null;
  created_at: string;
}

// ── Insert an AI decision ──────────────────────────────────────

export async function recordAIDecision(
  supabase: SupabaseClient,
  params: RecordAIDecisionParams,
): Promise<AIDecisionRow | null> {
  try {
    const { data, error } = await supabase
      .from("ai_decisions")
      .insert({
        tenant_id: params.tenantId,
        decision_type: params.decisionType,
        entity_id: params.entityId ?? null,
        entity_type: params.entityType ?? null,
        confidence_score: params.confidenceScore,
        field_confidences: params.fieldConfidences ?? {},
        ai_suggestion: params.aiSuggestion,
        was_auto_approved: params.wasAutoApproved ?? false,
        processing_time_ms: params.processingTimeMs ?? null,
        model_version: params.modelVersion ?? null,
      })
      .select()
      .single();

    if (error) {
      console.error("[confidenceStore] insert error:", error.message);
      return null;
    }
    return data as AIDecisionRow;
  } catch (e) {
    console.error("[confidenceStore] unexpected error:", e);
    return null;
  }
}

// ── Fetch corrected decisions for few-shot prompt building ─────

export interface CorrectedDecision {
  id: string;
  ai_suggestion: Record<string, unknown>;
  final_values: Record<string, unknown>;
  correction_summary: Record<string, unknown> | null;
  field_confidences: Record<string, number>;
  created_at: string;
}

export async function fetchCorrectedDecisions(
  supabase: SupabaseClient,
  tenantId: string,
  clientId: string | null,
  limit = 10,
): Promise<CorrectedDecision[]> {
  try {
    let query = supabase
      .from("ai_decisions")
      .select(
        "id, ai_suggestion, final_values, correction_summary, field_confidences, created_at",
      )
      .eq("tenant_id", tenantId)
      .eq("was_corrected", true)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (clientId) {
      query = query.eq("entity_type", "order");
      // We filter by client via a join or post-filter; for simplicity
      // the edge function should pass the client_id if available on the entity.
    }

    const { data, error } = await query;
    if (error) {
      console.error("[confidenceStore] fetchCorrected error:", error.message);
      return [];
    }
    return (data ?? []) as CorrectedDecision[];
  } catch (e) {
    console.error("[confidenceStore] fetchCorrected unexpected:", e);
    return [];
  }
}
