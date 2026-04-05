import type { SupabaseClient } from "@supabase/supabase-js";
import type { AddressResolveResult } from "@/types/addressBook";

/**
 * Compute the Levenshtein (edit) distance between two strings.
 * Used for fuzzy matching address aliases.
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  // Use two rows instead of full matrix for O(min(m,n)) space
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);

  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,       // deletion
        curr[j - 1] + 1,   // insertion
        prev[j - 1] + cost  // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[n];
}

/**
 * Maximum allowed Levenshtein distance for fuzzy matching.
 * Short strings (<=10 chars) allow distance 2, longer strings allow 3.
 */
function maxAllowedDistance(aliasLength: number): number {
  return aliasLength <= 10 ? 2 : 3;
}

/**
 * Resolve a raw address string against the client's learned address book.
 *
 * Strategy:
 * 1. Fetch all address book entries for this tenant+client
 * 2. Try exact case-insensitive match (trimmed)
 * 3. Try fuzzy match (Levenshtein) if no exact match
 * 4. On match: increment usage_count, update last_used_at
 *
 * @returns AddressResolveResult if matched, null otherwise
 */
export async function resolveClientAddress(
  supabase: SupabaseClient,
  tenantId: string,
  clientId: string,
  rawAddress: string
): Promise<AddressResolveResult | null> {
  if (!rawAddress || !clientId || !tenantId) return null;

  const trimmed = rawAddress.trim();
  const lower = trimmed.toLowerCase();

  // Fetch all aliases for this client in this tenant
  const { data: entries, error } = await supabase
    .from("client_address_book")
    .select("id, alias, resolved_address, resolved_lat, resolved_lng, usage_count")
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId);

  if (error || !entries || entries.length === 0) return null;

  // 1) Exact match (case-insensitive, trimmed)
  const exactMatch = entries.find(
    (e: any) => e.alias.trim().toLowerCase() === lower
  );

  if (exactMatch) {
    // Increment usage_count (fire-and-forget)
    supabase
      .from("client_address_book")
      .update({
        usage_count: (exactMatch.usage_count || 1) + 1,
        last_used_at: new Date().toISOString(),
      })
      .eq("id", exactMatch.id)
      .then(() => {});

    return {
      resolved_address: exactMatch.resolved_address,
      resolved_lat: exactMatch.resolved_lat,
      resolved_lng: exactMatch.resolved_lng,
      matched_alias: exactMatch.alias,
      entry_id: exactMatch.id,
      match_type: "exact",
    };
  }

  // 2) Fuzzy match — find the closest alias within allowed distance
  let bestMatch: any = null;
  let bestDistance = Infinity;

  for (const entry of entries) {
    const aliasLower = entry.alias.trim().toLowerCase();
    const dist = levenshteinDistance(lower, aliasLower);
    const maxDist = maxAllowedDistance(aliasLower.length);

    if (dist <= maxDist && dist < bestDistance) {
      bestDistance = dist;
      bestMatch = entry;
    }
  }

  if (bestMatch) {
    // Increment usage_count (fire-and-forget)
    supabase
      .from("client_address_book")
      .update({
        usage_count: (bestMatch.usage_count || 1) + 1,
        last_used_at: new Date().toISOString(),
      })
      .eq("id", bestMatch.id)
      .then(() => {});

    return {
      resolved_address: bestMatch.resolved_address,
      resolved_lat: bestMatch.resolved_lat,
      resolved_lng: bestMatch.resolved_lng,
      matched_alias: bestMatch.alias,
      entry_id: bestMatch.id,
      match_type: "fuzzy",
    };
  }

  return null;
}

/**
 * Learn a new address alias for a client, or update an existing one.
 * Uses upsert on the (tenant_id, client_id, alias) unique constraint.
 */
export async function learnAddress(
  supabase: SupabaseClient,
  tenantId: string,
  clientId: string,
  alias: string,
  resolvedAddress: string,
  lat?: number | null,
  lng?: number | null
): Promise<void> {
  if (!tenantId || !clientId || !alias || !resolvedAddress) return;

  await supabase.from("client_address_book").upsert(
    {
      tenant_id: tenantId,
      client_id: clientId,
      alias: alias,
      resolved_address: resolvedAddress,
      resolved_lat: lat ?? null,
      resolved_lng: lng ?? null,
      last_used_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,client_id,alias" }
  );
}
