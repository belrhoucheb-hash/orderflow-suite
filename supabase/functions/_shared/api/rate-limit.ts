// Sliding-window rate-limit per token.
//
// Simpele implementatie: SELECT COUNT(*) over laatste window. Niet
// atomic, dus onder gelijktijdige requests kan het aantal iets over de
// limiet gaan. Voor v1 acceptabel, geen Redis nodig.
//
// Defaults: 300 requests per minuut per token.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: string;
  limit: number;
}

export const DEFAULT_RATE_LIMIT = 300; // per minuut
export const DEFAULT_WINDOW_MS = 60_000;

export async function checkRateLimit(
  supabase: SupabaseClient,
  tokenId: string,
  limit = DEFAULT_RATE_LIMIT,
  windowMs = DEFAULT_WINDOW_MS,
): Promise<RateLimitResult> {
  const windowStart = new Date(Date.now() - windowMs).toISOString();
  const resetAt = new Date(Date.now() + windowMs).toISOString();

  const { count, error } = await supabase
    .from("api_request_log")
    .select("id", { count: "exact", head: true })
    .eq("token_id", tokenId)
    .gte("created_at", windowStart);

  if (error) {
    // Bij DB-error rather geen 500, laat request door. Log zichtbaar.
    console.error("[rate-limit] count failed:", error.message);
    return { ok: true, remaining: limit, resetAt, limit };
  }

  const used = count ?? 0;
  const remaining = Math.max(0, limit - used);
  const ok = used < limit;

  return { ok, remaining, resetAt, limit };
}
