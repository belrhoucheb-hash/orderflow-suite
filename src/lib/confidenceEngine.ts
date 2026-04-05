import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DecisionType,
  Resolution,
  Trend,
  DecisionLogEntry,
  AutonomyConfig,
  RecordDecisionInput,
  ShouldAutoExecuteResult,
} from "@/types/confidence";

// ─── Pure Helper Functions ──────────────────────────────────

/**
 * Compute a confidence score from decision counts.
 * Approved = 1.0, Modified = 0.5, Rejected = 0.0.
 * Returns 50 (neutral) when no decisions exist.
 */
export function computeScoreFromCounts(
  approved: number,
  modified: number,
  rejected: number
): number {
  const total = approved + modified + rejected;
  if (total === 0) return 50;
  const weighted = approved * 1.0 + modified * 0.5 + rejected * 0.0;
  return Math.round((weighted / total) * 10000) / 100;
}

/**
 * Compute trend by comparing recent resolutions vs. previous resolutions.
 * Returns STABLE if fewer than 5 recent decisions.
 * RISING if recent score > previous by >5 points.
 * FALLING if recent score < previous by >5 points.
 */
export function computeTrend(
  recentResolutions: Resolution[],
  previousResolutions: Resolution[]
): Trend {
  if (recentResolutions.length < 5) return "STABLE";

  const scoreFromResolutions = (resolutions: Resolution[]): number => {
    let approved = 0;
    let modified = 0;
    let rejected = 0;
    for (const r of resolutions) {
      if (r === "APPROVED" || r === "AUTO_EXECUTED") approved++;
      else if (r === "MODIFIED") modified++;
      else if (r === "REJECTED") rejected++;
    }
    return computeScoreFromCounts(approved, modified, rejected);
  };

  const recentScore = scoreFromResolutions(recentResolutions);
  const previousScore =
    previousResolutions.length > 0
      ? scoreFromResolutions(previousResolutions)
      : recentScore;

  const diff = recentScore - previousScore;
  if (diff > 5) return "RISING";
  if (diff < -5) return "FALLING";
  return "STABLE";
}

// ─── Database Functions ─────────────────────────────────────

/**
 * Record a new decision (proposed or auto-executed) in the decision_log.
 */
export async function recordDecision(
  supabase: SupabaseClient,
  params: RecordDecisionInput
): Promise<DecisionLogEntry> {
  const { data, error } = await supabase
    .from("decision_log")
    .insert({
      tenant_id: params.tenantId,
      decision_type: params.decisionType,
      entity_type: params.entityType,
      entity_id: params.entityId,
      client_id: params.clientId ?? null,
      proposed_action: params.proposedAction,
      input_confidence: params.inputConfidence,
      model_confidence: params.modelConfidence,
      resolution: params.resolution ?? "PENDING",
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as DecisionLogEntry;
}

/**
 * Resolve a decision: update the decision_log row with the outcome,
 * then recalculate the confidence score for this tenant+type+client.
 */
export async function resolveDecision(
  supabase: SupabaseClient,
  decisionId: string,
  resolution: Resolution,
  actualAction?: Record<string, unknown>,
  resolvedBy?: string
): Promise<void> {
  const { error: updateError } = await supabase
    .from("decision_log")
    .update({
      resolution,
      actual_action: actualAction ?? null,
      resolved_by: resolvedBy ?? null,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", decisionId);

  if (updateError) throw new Error(updateError.message);

  const { data: decision, error: readError } = await supabase
    .from("decision_log")
    .select("tenant_id, decision_type, client_id")
    .eq("id", decisionId)
    .single();

  if (readError) throw new Error(readError.message);

  await recalculateScore(
    supabase,
    decision.tenant_id,
    decision.decision_type as DecisionType,
    decision.client_id ?? undefined
  );

  if (decision.client_id) {
    await recalculateScore(
      supabase,
      decision.tenant_id,
      decision.decision_type as DecisionType
    );
  }
}

/**
 * Get the current confidence score for a decision type + optional client.
 * Returns 50 (neutral) if no data exists yet.
 */
export async function getConfidence(
  supabase: SupabaseClient,
  tenantId: string,
  decisionType: DecisionType,
  clientId?: string
): Promise<number> {
  let query = supabase
    .from("confidence_scores")
    .select("current_score")
    .eq("tenant_id", tenantId)
    .eq("decision_type", decisionType);

  if (clientId) {
    query = query.eq("client_id", clientId);
  } else {
    query = query.is("client_id", null);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  return data?.current_score ?? 50;
}

/**
 * Determine whether the system should auto-execute a decision.
 *
 * Combined score = (inputConfidence + outcomeConfidence) / 2
 * where outcomeConfidence is the historical accuracy from confidence_scores.
 */
export async function shouldAutoExecute(
  supabase: SupabaseClient,
  config: AutonomyConfig,
  tenantId: string,
  decisionType: DecisionType,
  inputConfidence: number,
  clientId?: string,
  options?: { orderValueEur?: number; requirements?: string[] }
): Promise<ShouldAutoExecuteResult> {
  if (!config.enabled) {
    return {
      auto: false,
      reason: "Autonomy is disabled for this tenant",
      inputConfidence,
      outcomeConfidence: 0,
      threshold: 0,
      combinedScore: 0,
    };
  }

  // Check value-based guardrail
  if (
    options?.orderValueEur != null &&
    options.orderValueEur > config.max_autonomous_value_eur
  ) {
    return {
      auto: false,
      reason: `Order value €${options.orderValueEur} exceeds max autonomous value €${config.max_autonomous_value_eur}`,
      inputConfidence,
      outcomeConfidence: 0,
      threshold: 0,
      combinedScore: 0,
    };
  }

  // Check category-based guardrail (e.g. ADR, KOELING always require human)
  if (options?.requirements?.length && config.require_human_for.length) {
    const blocked = options.requirements.filter((r) =>
      config.require_human_for.includes(r)
    );
    if (blocked.length > 0) {
      return {
        auto: false,
        reason: `Requirements [${blocked.join(", ")}] require human review`,
        inputConfidence,
        outcomeConfidence: 0,
        threshold: 0,
        combinedScore: 0,
      };
    }
  }

  const outcomeConfidence = await getConfidence(
    supabase,
    tenantId,
    decisionType,
    clientId
  );

  const combinedScore = Math.round((inputConfidence + outcomeConfidence) / 2);

  const threshold =
    config.thresholds[decisionType as keyof typeof config.thresholds] ??
    config.global_threshold;

  const auto = combinedScore >= threshold;

  return {
    auto,
    reason: auto
      ? `Combined score ${combinedScore} >= threshold ${threshold}`
      : `Combined score ${combinedScore} < threshold ${threshold}`,
    inputConfidence,
    outcomeConfidence,
    threshold,
    combinedScore,
  };
}

/**
 * Recalculate the confidence_scores row for a given tenant+type+client
 * from the decision_log. Upserts the result.
 */
export async function recalculateScore(
  supabase: SupabaseClient,
  tenantId: string,
  decisionType: DecisionType,
  clientId?: string
): Promise<void> {
  let countQuery = supabase
    .from("decision_log")
    .select("resolution")
    .eq("tenant_id", tenantId)
    .eq("decision_type", decisionType)
    .in("resolution", ["APPROVED", "MODIFIED", "REJECTED", "AUTO_EXECUTED"]);

  if (clientId) {
    countQuery = countQuery.eq("client_id", clientId);
  } else {
    countQuery = countQuery.is("client_id", null);
  }

  const { data: allResolved, error: countError } = await countQuery;
  if (countError) throw new Error(countError.message);

  const rows = allResolved || [];

  let approved = 0;
  let modified = 0;
  let rejected = 0;

  for (const row of rows) {
    if (row.resolution === "APPROVED" || row.resolution === "AUTO_EXECUTED") approved++;
    else if (row.resolution === "MODIFIED") modified++;
    else if (row.resolution === "REJECTED") rejected++;
  }

  const currentScore = computeScoreFromCounts(approved, modified, rejected);
  const totalDecisions = approved + modified + rejected;

  let trendQuery = supabase
    .from("decision_log")
    .select("resolution")
    .eq("tenant_id", tenantId)
    .eq("decision_type", decisionType)
    .in("resolution", ["APPROVED", "MODIFIED", "REJECTED", "AUTO_EXECUTED"])
    .order("created_at", { ascending: false })
    .limit(40);

  if (clientId) {
    trendQuery = trendQuery.eq("client_id", clientId);
  } else {
    trendQuery = trendQuery.is("client_id", null);
  }

  const { data: trendData, error: trendError } = await trendQuery;
  if (trendError) throw new Error(trendError.message);

  const trendRows = trendData || [];
  const recentResolutions = trendRows
    .slice(0, 20)
    .map((r) => r.resolution as Resolution);
  const previousResolutions = trendRows
    .slice(20, 40)
    .map((r) => r.resolution as Resolution);

  const trend = computeTrend(recentResolutions, previousResolutions);

  // Manual upsert to handle NULL client_id correctly
  // (PostgreSQL treats NULL != NULL, so onConflict won't match NULL client_id rows)
  const payload = {
    current_score: currentScore,
    total_decisions: totalDecisions,
    approved_count: approved,
    modified_count: modified,
    rejected_count: rejected,
    trend,
    last_updated: new Date().toISOString(),
  };

  let existingQuery = supabase
    .from("confidence_scores")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("decision_type", decisionType);

  if (clientId) {
    existingQuery = existingQuery.eq("client_id", clientId);
  } else {
    existingQuery = existingQuery.is("client_id", null);
  }

  const { data: existing, error: existingError } = await existingQuery.maybeSingle();
  if (existingError) throw new Error(existingError.message);

  if (existing) {
    const { error: updateError } = await supabase
      .from("confidence_scores")
      .update(payload)
      .eq("id", existing.id);
    if (updateError) throw new Error(updateError.message);
  } else {
    const { error: insertError } = await supabase
      .from("confidence_scores")
      .insert({
        tenant_id: tenantId,
        decision_type: decisionType,
        client_id: clientId ?? null,
        ...payload,
      });
    if (insertError) throw new Error(insertError.message);
  }
}
