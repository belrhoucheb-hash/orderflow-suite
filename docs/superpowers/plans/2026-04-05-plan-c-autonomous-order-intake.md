# Plan C: Autonomous Order Intake

> **Skill:** `superpowers:subagent-driven-development`
> **Parent:** [Release 2 Autonomy Overview](./2026-04-05-release2-autonomy-overview.md)
> **Dependencies:** Plan A (Confidence Store) + Plan B (Event Pipeline) must be complete
> **Date:** 2026-04-05

---

## Goal

Orders from known clients with high confidence get confirmed automatically. The system learns client address aliases, checks vehicle capacity at intake, and confirms without dispatcher involvement when confidence exceeds the tenant threshold.

**Before:** Email -> parse -> DRAFT -> dispatcher manually reviews -> CONFIRMED
**After:** Email -> parse -> address resolution -> capacity pre-check -> confidence evaluation -> auto-CONFIRMED (or DRAFT if below threshold)

---

## Architecture

```
Email arrives
     |
     v
parse-order (Gemini extraction)
     |
     v
Address Resolution -----> client_address_book (fuzzy match aliases)
     |
     v
Template Enrichment ----> client_extraction_templates (avg_weight, transport_type)
     |
     v
Capacity Pre-Check -----> vehicles + vehicle_availability + trips
     |
     v
shouldAutoExecute() ----> confidence_scores + tenant settings
     |
     +-- YES: status=CONFIRMED, send-confirmation, recordDecision(AUTO_EXECUTED)
     +-- NO:  status=DRAFT, recordDecision(PENDING), dispatcher reviews in Inbox
                  |
                  v (when dispatcher approves/modifies)
            learnAddress() if addresses differ
            recordDecision(APPROVED/MODIFIED)
```

---

## Tech Stack

- **Runtime:** React 18, TypeScript 5.8
- **Backend:** Supabase (PostgreSQL + Edge Functions, Deno)
- **AI:** Gemini 2.5 Flash (existing parse-order)
- **State:** TanStack Query 5
- **UI:** Shadcn/Tailwind
- **Tests:** Vitest (`npx vitest run src/test/<file>.test.ts`)

---

## File Structure

```
supabase/
  migrations/
    20260405140000_client_address_book.sql          # NEW — Task 1
    20260405140100_alter_extraction_templates.sql    # NEW — Task 2
  functions/
    parse-order/
      index.ts                                       # MODIFY — Task 6

src/
  types/
    addressBook.ts                                   # NEW — Task 3
  lib/
    addressResolver.ts                               # NEW — Task 4
    capacityPreCheck.ts                              # NEW — Task 5
  hooks/
    useInbox.ts                                      # MODIFY — Task 7
  test/
    addressResolver.test.ts                          # NEW — Task 4 (TDD)
    capacityPreCheck.test.ts                         # NEW — Task 5 (TDD)
```

---

## Task 1: Migration — `client_address_book` table

### 1.1 Create migration file

- [ ] Create `supabase/migrations/20260405140000_client_address_book.sql` with the following content:

```sql
-- Plan C: Client address book for learned address aliases
-- Each client can have shorthand aliases that map to full addresses

CREATE TABLE IF NOT EXISTS client_address_book (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  resolved_address TEXT NOT NULL,
  resolved_lat NUMERIC,
  resolved_lng NUMERIC,
  usage_count INTEGER NOT NULL DEFAULT 1,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, client_id, alias)
);

-- Index for lookups by tenant + client
CREATE INDEX idx_client_address_book_tenant_client
  ON client_address_book (tenant_id, client_id);

-- Index for alias text search (case-insensitive)
CREATE INDEX idx_client_address_book_alias_lower
  ON client_address_book (tenant_id, client_id, lower(alias));

-- RLS
ALTER TABLE client_address_book ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for client_address_book"
  ON client_address_book
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tm.tenant_id FROM tenant_members tm
      WHERE tm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tm.tenant_id FROM tenant_members tm
      WHERE tm.user_id = auth.uid()
    )
  );

-- Service role bypass for Edge Functions
CREATE POLICY "Service role full access on client_address_book"
  ON client_address_book
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
```

### 1.2 Verify migration

- [ ] Run: `cd C:/Users/Badr/Desktop/DevBadr/orderflow-suite && npx supabase db diff` to confirm no syntax errors

---

## Task 2: Migration — ALTER `client_extraction_templates`

### 2.1 Create migration file

- [ ] Create `supabase/migrations/20260405140100_alter_extraction_templates.sql` with the following content:

```sql
-- Plan C: Enrich client_extraction_templates with learning fields

ALTER TABLE client_extraction_templates
  ADD COLUMN IF NOT EXISTS default_transport_type TEXT,
  ADD COLUMN IF NOT EXISTS default_requirements TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS avg_weight_kg NUMERIC,
  ADD COLUMN IF NOT EXISTS avg_quantity NUMERIC,
  ADD COLUMN IF NOT EXISTS auto_confirm_eligible BOOLEAN NOT NULL DEFAULT false;

-- Mark templates with 20+ successes and no recent rejections as eligible
COMMENT ON COLUMN client_extraction_templates.auto_confirm_eligible IS
  'Set true when template has sufficient history for autonomous confirmation. '
  'Evaluated by parse-order after each successful extraction.';
```

### 2.2 Verify migration

- [ ] Run: `cd C:/Users/Badr/Desktop/DevBadr/orderflow-suite && npx supabase db diff` to confirm no syntax errors

---

## Task 3: Types — `src/types/addressBook.ts`

### 3.1 Create type file

- [ ] Create `src/types/addressBook.ts` with the following content:

```typescript
/** A learned address alias for a specific client */
export interface ClientAddressEntry {
  id: string;
  tenant_id: string;
  client_id: string;
  alias: string;
  resolved_address: string;
  resolved_lat: number | null;
  resolved_lng: number | null;
  usage_count: number;
  last_used_at: string;
  created_at: string;
}

/** Result of attempting to resolve a raw address string against the client address book */
export interface AddressResolveResult {
  /** The full resolved address */
  resolved_address: string;
  /** Latitude if known */
  resolved_lat: number | null;
  /** Longitude if known */
  resolved_lng: number | null;
  /** The alias that was matched */
  matched_alias: string;
  /** The address book entry ID */
  entry_id: string;
  /** How the match was made */
  match_type: "exact" | "fuzzy";
}
```

---

## Task 4: Lib + Tests — `src/lib/addressResolver.ts`

### TDD: Write tests first

### 4.1 Create test file

- [ ] Create `src/test/addressResolver.test.ts` with the following content:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  resolveClientAddress,
  learnAddress,
  levenshteinDistance,
} from "@/lib/addressResolver";

// ── Mock supabase ──
const mockFrom = vi.fn();
const mockSupabase = { from: mockFrom } as any;

function mockQuery(data: any[] | null, error: any = null) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: data?.[0] ?? null, error }),
    then: vi.fn().mockResolvedValue({ data, error }),
    upsert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
  };
  // Make chainable methods return the chain
  Object.values(chain).forEach((fn: any) => {
    if (typeof fn === "function" && fn.mockReturnThis) {
      // already set
    }
  });
  // Override: after the last method, resolve with data
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.ilike.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  mockFrom.mockReturnValue(chain);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Levenshtein distance tests ──
describe("levenshteinDistance", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshteinDistance("abc", "abc")).toBe(0);
  });

  it("returns correct distance for single char difference", () => {
    expect(levenshteinDistance("cat", "car")).toBe(1);
  });

  it("returns correct distance for insertions", () => {
    expect(levenshteinDistance("abc", "abcd")).toBe(1);
  });

  it("returns correct distance for deletions", () => {
    expect(levenshteinDistance("abcd", "abc")).toBe(1);
  });

  it("returns string length when comparing with empty string", () => {
    expect(levenshteinDistance("hello", "")).toBe(5);
    expect(levenshteinDistance("", "hello")).toBe(5);
  });

  it("handles case-insensitive comparison", () => {
    // The function should be called with lowercased strings
    expect(levenshteinDistance("depot", "depo")).toBe(1);
  });
});

// ── resolveClientAddress tests ──
describe("resolveClientAddress", () => {
  it("returns null when no address book entries exist", async () => {
    const chain = mockQuery([]);
    // Override: the final resolution returns empty array
    chain.limit.mockReturnValue({
      ...chain,
      then: vi.fn((cb: any) => cb({ data: [], error: null })),
    });
    // Use a simpler mock: from().select().eq()... resolves to empty data
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    });

    const result = await resolveClientAddress(
      mockSupabase,
      "tenant-1",
      "client-1",
      "Unknown Place 123"
    );
    expect(result).toBeNull();
  });

  it("returns exact match when alias matches exactly (case-insensitive)", async () => {
    const entries = [
      {
        id: "entry-1",
        alias: "De Veiling",
        resolved_address: "Veilingweg 10, 2295 KK Kwintsheul",
        resolved_lat: 52.05,
        resolved_lng: 4.22,
        usage_count: 5,
      },
    ];
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: entries, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    });

    const result = await resolveClientAddress(
      mockSupabase,
      "tenant-1",
      "client-1",
      "de veiling"
    );
    expect(result).not.toBeNull();
    expect(result!.resolved_address).toBe("Veilingweg 10, 2295 KK Kwintsheul");
    expect(result!.match_type).toBe("exact");
    expect(result!.matched_alias).toBe("De Veiling");
  });

  it("returns fuzzy match when alias is close (Levenshtein <= 3 for short strings)", async () => {
    const entries = [
      {
        id: "entry-2",
        alias: "Depot Rdam",
        resolved_address: "Waalhaven Z.z. 1, 3089 JH Rotterdam",
        resolved_lat: 51.89,
        resolved_lng: 4.42,
        usage_count: 12,
      },
    ];
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: entries, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    });

    // "Depo Rdam" has Levenshtein distance 1 from "Depot Rdam" → match
    const result = await resolveClientAddress(
      mockSupabase,
      "tenant-1",
      "client-1",
      "Depo Rdam"
    );
    expect(result).not.toBeNull();
    expect(result!.match_type).toBe("fuzzy");
    expect(result!.resolved_address).toBe("Waalhaven Z.z. 1, 3089 JH Rotterdam");
  });

  it("rejects fuzzy match when distance is too large", async () => {
    const entries = [
      {
        id: "entry-3",
        alias: "Depot Rotterdam",
        resolved_address: "Waalhaven Z.z. 1, 3089 JH Rotterdam",
        resolved_lat: 51.89,
        resolved_lng: 4.42,
        usage_count: 3,
      },
    ];
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: entries, error: null }),
        }),
      }),
    });

    // "Magazijn Amsterdam" is way too far from "Depot Rotterdam"
    const result = await resolveClientAddress(
      mockSupabase,
      "tenant-1",
      "client-1",
      "Magazijn Amsterdam"
    );
    expect(result).toBeNull();
  });
});

// ── learnAddress tests ──
describe("learnAddress", () => {
  it("upserts an address entry into client_address_book", async () => {
    const upsertMock = vi.fn().mockResolvedValue({ data: null, error: null });
    mockFrom.mockReturnValue({
      upsert: upsertMock,
    });

    await learnAddress(
      mockSupabase,
      "tenant-1",
      "client-1",
      "De Veiling",
      "Veilingweg 10, 2295 KK Kwintsheul",
      52.05,
      4.22
    );

    expect(mockFrom).toHaveBeenCalledWith("client_address_book");
    expect(upsertMock).toHaveBeenCalledWith(
      {
        tenant_id: "tenant-1",
        client_id: "client-1",
        alias: "De Veiling",
        resolved_address: "Veilingweg 10, 2295 KK Kwintsheul",
        resolved_lat: 52.05,
        resolved_lng: 4.22,
        last_used_at: expect.any(String),
      },
      { onConflict: "tenant_id,client_id,alias" }
    );
  });

  it("upserts without lat/lng when not provided", async () => {
    const upsertMock = vi.fn().mockResolvedValue({ data: null, error: null });
    mockFrom.mockReturnValue({
      upsert: upsertMock,
    });

    await learnAddress(
      mockSupabase,
      "tenant-1",
      "client-1",
      "Kantoor",
      "Herengracht 100, 1015 BS Amsterdam"
    );

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        alias: "Kantoor",
        resolved_address: "Herengracht 100, 1015 BS Amsterdam",
        resolved_lat: null,
        resolved_lng: null,
      }),
      { onConflict: "tenant_id,client_id,alias" }
    );
  });
});
```

### 4.2 Run tests (expect FAIL — module not yet created)

- [ ] Run: `cd C:/Users/Badr/Desktop/DevBadr/orderflow-suite && npx vitest run src/test/addressResolver.test.ts`
- [ ] Confirm: tests fail with "Cannot find module" error

### 4.3 Implement `src/lib/addressResolver.ts`

- [ ] Create `src/lib/addressResolver.ts` with the following content:

```typescript
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
```

### 4.4 Run tests (expect PASS)

- [ ] Run: `cd C:/Users/Badr/Desktop/DevBadr/orderflow-suite && npx vitest run src/test/addressResolver.test.ts`
- [ ] Confirm: all tests pass

### 4.5 Commit

- [ ] Run:
```bash
cd C:/Users/Badr/Desktop/DevBadr/orderflow-suite && \
git add \
  supabase/migrations/20260405140000_client_address_book.sql \
  src/types/addressBook.ts \
  src/lib/addressResolver.ts \
  src/test/addressResolver.test.ts && \
git commit -m "feat(plan-c): add client_address_book table, addressResolver lib + tests

Adds learned address aliases per client with fuzzy matching (Levenshtein).
Includes migration, types, resolver logic, and 10 Vitest test cases.

Part of Plan C: Autonomous Order Intake."
```

---

## Task 5: Lib + Tests — `src/lib/capacityPreCheck.ts`

### TDD: Write tests first

### 5.1 Create test file

- [ ] Create `src/test/capacityPreCheck.test.ts` with the following content:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkAvailableCapacity } from "@/lib/capacityPreCheck";

// ── Mock supabase ──
const mockFrom = vi.fn();
const mockSupabase = { from: mockFrom } as any;

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Helper: set up mockFrom to return different data for different table names.
 */
function setupMocks(config: {
  vehicles?: any[];
  vehiclesError?: any;
  availability?: any[];
  availabilityError?: any;
  tripStops?: any[];
  tripStopsError?: any;
}) {
  mockFrom.mockImplementation((table: string) => {
    if (table === "vehicles") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            contains: vi.fn().mockResolvedValue({
              data: config.vehicles ?? [],
              error: config.vehiclesError ?? null,
            }),
            // When no contains is called (no requirements)
            then: vi.fn((cb: any) =>
              cb({
                data: config.vehicles ?? [],
                error: config.vehiclesError ?? null,
              })
            ),
          }),
          // Direct resolve when no features filter
          then: vi.fn((cb: any) =>
            cb({
              data: config.vehicles ?? [],
              error: config.vehiclesError ?? null,
            })
          ),
        }),
      };
    }

    if (table === "vehicle_availability") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: config.availability ?? [],
                error: config.availabilityError ?? null,
              }),
            }),
          }),
        }),
      };
    }

    if (table === "trip_stops") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: config.tripStops ?? [],
              error: config.tripStopsError ?? null,
            }),
          }),
        }),
      };
    }

    // Fallback for trips table
    if (table === "trips") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            }),
            in: vi.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          }),
        }),
      };
    }

    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    };
  });
}

describe("checkAvailableCapacity", () => {
  it("returns available=true with a suggested vehicle when capacity exists", async () => {
    setupMocks({
      vehicles: [
        {
          id: "v-1",
          capacity_kg: 10000,
          capacity_pallets: 33,
          features: ["Koeling"],
        },
      ],
      availability: [], // no unavailability records = available
      tripStops: [],    // no existing load
    });

    // Override the chain for this specific test
    mockFrom.mockImplementation((table: string) => {
      if (table === "vehicles") {
        const chain: any = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.contains = vi.fn().mockResolvedValue({
          data: [
            { id: "v-1", capacity_kg: 10000, capacity_pallets: 33, features: ["Koeling"] },
          ],
          error: null,
        });
        return chain;
      }
      if (table === "vehicle_availability") {
        const chain: any = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.in = vi.fn().mockResolvedValue({ data: [], error: null });
        return chain;
      }
      if (table === "trips") {
        const chain: any = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.in = vi.fn().mockResolvedValue({ data: [], error: null });
        return chain;
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    const result = await checkAvailableCapacity(
      mockSupabase,
      "tenant-1",
      "2026-04-10",
      ["Koeling"],
      2000,
      5
    );

    expect(result.available).toBe(true);
    expect(result.suggestedVehicleId).toBe("v-1");
  });

  it("returns available=false when no vehicles match requirements", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "vehicles") {
        const chain: any = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.contains = vi.fn().mockResolvedValue({
          data: [], // no vehicles with ADR
          error: null,
        });
        return chain;
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    const result = await checkAvailableCapacity(
      mockSupabase,
      "tenant-1",
      "2026-04-10",
      ["ADR"],
      500
    );

    expect(result.available).toBe(false);
    expect(result.suggestedVehicleId).toBeNull();
    expect(result.reason).toContain("Geen voertuig");
  });

  it("returns available=false when all matching vehicles are unavailable", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "vehicles") {
        const chain: any = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.contains = vi.fn().mockResolvedValue({
          data: [{ id: "v-2", capacity_kg: 8000, capacity_pallets: 20, features: [] }],
          error: null,
        });
        return chain;
      }
      if (table === "vehicle_availability") {
        const chain: any = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.in = vi.fn().mockResolvedValue({
          data: [{ vehicle_id: "v-2", status: "unavailable" }],
          error: null,
        });
        return chain;
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    const result = await checkAvailableCapacity(
      mockSupabase,
      "tenant-1",
      "2026-04-10",
      [],
      3000
    );

    expect(result.available).toBe(false);
    expect(result.reason).toContain("niet beschikbaar");
  });

  it("returns available=false when weight exceeds remaining capacity", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "vehicles") {
        const chain: any = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.contains = vi.fn().mockResolvedValue({
          data: [{ id: "v-3", capacity_kg: 5000, capacity_pallets: 15, features: [] }],
          error: null,
        });
        return chain;
      }
      if (table === "vehicle_availability") {
        const chain: any = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.in = vi.fn().mockResolvedValue({ data: [], error: null });
        return chain;
      }
      if (table === "trips") {
        const chain: any = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.in = vi.fn().mockResolvedValue({
          data: [
            { vehicle_id: "v-3", total_weight_kg: 4000, total_pallets: 10 },
          ],
          error: null,
        });
        return chain;
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    const result = await checkAvailableCapacity(
      mockSupabase,
      "tenant-1",
      "2026-04-10",
      [],
      2000 // 4000 existing + 2000 = 6000 > 5000 capacity
    );

    expect(result.available).toBe(false);
    expect(result.reason).toContain("capaciteit");
  });

  it("selects the vehicle with the most remaining capacity", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "vehicles") {
        const chain: any = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.contains = vi.fn().mockResolvedValue({
          data: [
            { id: "v-small", capacity_kg: 3000, capacity_pallets: 10, features: [] },
            { id: "v-big", capacity_kg: 20000, capacity_pallets: 33, features: [] },
          ],
          error: null,
        });
        return chain;
      }
      if (table === "vehicle_availability") {
        const chain: any = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.in = vi.fn().mockResolvedValue({ data: [], error: null });
        return chain;
      }
      if (table === "trips") {
        const chain: any = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.in = vi.fn().mockResolvedValue({ data: [], error: null });
        return chain;
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    const result = await checkAvailableCapacity(
      mockSupabase,
      "tenant-1",
      "2026-04-10",
      [],
      2500
    );

    expect(result.available).toBe(true);
    // Both fit, but v-big has more remaining capacity
    expect(result.suggestedVehicleId).toBe("v-big");
  });

  it("handles no requirements (empty array) by querying all vehicles", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "vehicles") {
        const chain: any = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockResolvedValue({
          data: [{ id: "v-any", capacity_kg: 15000, capacity_pallets: 33, features: [] }],
          error: null,
        });
        return chain;
      }
      if (table === "vehicle_availability") {
        const chain: any = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.in = vi.fn().mockResolvedValue({ data: [], error: null });
        return chain;
      }
      if (table === "trips") {
        const chain: any = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.in = vi.fn().mockResolvedValue({ data: [], error: null });
        return chain;
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    const result = await checkAvailableCapacity(
      mockSupabase,
      "tenant-1",
      "2026-04-10",
      [],
      1000
    );

    expect(result.available).toBe(true);
    expect(result.suggestedVehicleId).toBe("v-any");
  });

  it("returns available=false when palletCount exceeds vehicle pallet capacity", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "vehicles") {
        const chain: any = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.contains = vi.fn().mockResolvedValue({
          data: [{ id: "v-4", capacity_kg: 20000, capacity_pallets: 10, features: [] }],
          error: null,
        });
        return chain;
      }
      if (table === "vehicle_availability") {
        const chain: any = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.in = vi.fn().mockResolvedValue({ data: [], error: null });
        return chain;
      }
      if (table === "trips") {
        const chain: any = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.in = vi.fn().mockResolvedValue({
          data: [{ vehicle_id: "v-4", total_weight_kg: 0, total_pallets: 8 }],
          error: null,
        });
        return chain;
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    const result = await checkAvailableCapacity(
      mockSupabase,
      "tenant-1",
      "2026-04-10",
      [],
      500,
      5 // 8 existing + 5 = 13 > 10 capacity
    );

    expect(result.available).toBe(false);
    expect(result.reason).toContain("capaciteit");
  });

  it("returns available=true and skips capacity check when weight is 0", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "vehicles") {
        const chain: any = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockResolvedValue({
          data: [{ id: "v-5", capacity_kg: 5000, capacity_pallets: 15, features: [] }],
          error: null,
        });
        return chain;
      }
      if (table === "vehicle_availability") {
        const chain: any = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.in = vi.fn().mockResolvedValue({ data: [], error: null });
        return chain;
      }
      if (table === "trips") {
        const chain: any = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.in = vi.fn().mockResolvedValue({ data: [], error: null });
        return chain;
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    const result = await checkAvailableCapacity(
      mockSupabase,
      "tenant-1",
      "2026-04-10",
      [],
      0
    );

    expect(result.available).toBe(true);
  });

  it("returns available=false on database error", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "vehicles") {
        const chain: any = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockResolvedValue({
          data: null,
          error: { message: "DB connection failed" },
        });
        return chain;
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    const result = await checkAvailableCapacity(
      mockSupabase,
      "tenant-1",
      "2026-04-10",
      [],
      1000
    );

    expect(result.available).toBe(false);
    expect(result.reason).toContain("fout");
  });
});
```

### 5.2 Run tests (expect FAIL — module not yet created)

- [ ] Run: `cd C:/Users/Badr/Desktop/DevBadr/orderflow-suite && npx vitest run src/test/capacityPreCheck.test.ts`
- [ ] Confirm: tests fail with "Cannot find module" error

### 5.3 Implement `src/lib/capacityPreCheck.ts`

- [ ] Create `src/lib/capacityPreCheck.ts` with the following content:

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";

export interface CapacityCheckResult {
  /** Whether there is at least one vehicle with sufficient remaining capacity */
  available: boolean;
  /** The vehicle ID with the most remaining capacity, or null */
  suggestedVehicleId: string | null;
  /** Human-readable reason (Dutch) */
  reason: string;
}

interface VehicleRow {
  id: string;
  capacity_kg: number;
  capacity_pallets: number | null;
  features: string[];
}

interface TripLoadRow {
  vehicle_id: string;
  total_weight_kg: number;
  total_pallets: number;
}

/**
 * Quick capacity pre-check at order intake time.
 *
 * Queries vehicles with matching features, subtracts already-assigned load
 * for the given date from trips, and returns the first vehicle with enough
 * remaining capacity.
 *
 * @param supabase - Supabase client (service role or user)
 * @param tenantId - Tenant UUID
 * @param date - The date to check (ISO 8601 date string, e.g. "2026-04-10")
 * @param requirements - Required vehicle features (e.g. ["Koeling", "ADR"])
 * @param weightKg - Required weight capacity in kg
 * @param palletCount - Required pallet count (optional)
 */
export async function checkAvailableCapacity(
  supabase: SupabaseClient,
  tenantId: string,
  date: string,
  requirements: string[],
  weightKg: number,
  palletCount?: number
): Promise<CapacityCheckResult> {
  try {
    // ── Step 1: Find vehicles that match requirements ──
    let vehicleQuery = supabase
      .from("vehicles")
      .select("id, capacity_kg, capacity_pallets, features")
      .eq("tenant_id", tenantId);

    let vehicleResult;
    if (requirements.length > 0) {
      vehicleResult = await vehicleQuery.contains("features", requirements);
    } else {
      vehicleResult = await vehicleQuery;
    }

    const { data: vehicles, error: vehicleError } = vehicleResult;

    if (vehicleError || !vehicles || vehicles.length === 0) {
      return {
        available: false,
        suggestedVehicleId: null,
        reason: vehicleError
          ? `Capaciteitscontrole fout: ${vehicleError.message}`
          : `Geen voertuig gevonden met vereisten: ${requirements.join(", ") || "geen"}`,
      };
    }

    const vehicleIds = vehicles.map((v: VehicleRow) => v.id);

    // ── Step 2: Check vehicle availability for the date ──
    const { data: unavailable } = await supabase
      .from("vehicle_availability")
      .select("vehicle_id, status")
      .eq("date", date)
      .eq("status", "unavailable")
      .in("vehicle_id", vehicleIds);

    const unavailableIds = new Set(
      (unavailable || []).map((u: any) => u.vehicle_id)
    );
    const availableVehicles = vehicles.filter(
      (v: VehicleRow) => !unavailableIds.has(v.id)
    );

    if (availableVehicles.length === 0) {
      return {
        available: false,
        suggestedVehicleId: null,
        reason: `Alle ${vehicles.length} voertuig(en) met juiste vereisten zijn niet beschikbaar op ${date}`,
      };
    }

    // ── Step 3: Get existing trip loads for available vehicles on this date ──
    const availableIds = availableVehicles.map((v: VehicleRow) => v.id);

    const { data: existingTrips } = await supabase
      .from("trips")
      .select("vehicle_id, total_weight_kg, total_pallets")
      .eq("date", date)
      .in("vehicle_id", availableIds);

    // Build a map of used capacity per vehicle
    const usedCapacity = new Map<string, { weight: number; pallets: number }>();
    for (const trip of existingTrips || []) {
      const t = trip as TripLoadRow;
      const existing = usedCapacity.get(t.vehicle_id) || {
        weight: 0,
        pallets: 0,
      };
      existing.weight += t.total_weight_kg || 0;
      existing.pallets += t.total_pallets || 0;
      usedCapacity.set(t.vehicle_id, existing);
    }

    // ── Step 4: Find vehicles with enough remaining capacity ──
    // Sort by most remaining capacity (prefer emptier vehicles)
    type VehicleWithRemaining = VehicleRow & {
      remainingKg: number;
      remainingPallets: number;
    };

    const candidates: VehicleWithRemaining[] = availableVehicles
      .map((v: VehicleRow) => {
        const used = usedCapacity.get(v.id) || { weight: 0, pallets: 0 };
        return {
          ...v,
          remainingKg: (v.capacity_kg || 0) - used.weight,
          remainingPallets: (v.capacity_pallets || 0) - used.pallets,
        };
      })
      .filter((v: VehicleWithRemaining) => {
        // Weight check (skip if weight is 0 — unknown weight)
        if (weightKg > 0 && v.remainingKg < weightKg) return false;
        // Pallet check (skip if palletCount not provided)
        if (
          palletCount &&
          palletCount > 0 &&
          v.capacity_pallets &&
          v.remainingPallets < palletCount
        )
          return false;
        return true;
      })
      .sort(
        (a: VehicleWithRemaining, b: VehicleWithRemaining) =>
          b.remainingKg - a.remainingKg
      );

    if (candidates.length === 0) {
      return {
        available: false,
        suggestedVehicleId: null,
        reason: `Geen voertuig met voldoende resterende capaciteit op ${date} (nodig: ${weightKg}kg${palletCount ? `, ${palletCount} pallets` : ""})`,
      };
    }

    const best = candidates[0];
    return {
      available: true,
      suggestedVehicleId: best.id,
      reason: `Voertuig beschikbaar: ${best.remainingKg}kg/${best.remainingPallets} pallets resterend`,
    };
  } catch (err: any) {
    return {
      available: false,
      suggestedVehicleId: null,
      reason: `Capaciteitscontrole fout: ${err.message || "onbekend"}`,
    };
  }
}
```

### 5.4 Run tests (expect PASS)

- [ ] Run: `cd C:/Users/Badr/Desktop/DevBadr/orderflow-suite && npx vitest run src/test/capacityPreCheck.test.ts`
- [ ] Confirm: all tests pass

### 5.5 Commit

- [ ] Run:
```bash
cd C:/Users/Badr/Desktop/DevBadr/orderflow-suite && \
git add \
  supabase/migrations/20260405140100_alter_extraction_templates.sql \
  src/lib/capacityPreCheck.ts \
  src/test/capacityPreCheck.test.ts && \
git commit -m "feat(plan-c): add capacityPreCheck lib + ALTER extraction_templates + tests

Capacity pre-check at intake: queries vehicles by features, checks
availability, subtracts existing trip loads, returns best-fit vehicle.
Also adds learning columns to client_extraction_templates.

Part of Plan C: Autonomous Order Intake."
```

---

## Task 6: Modify `supabase/functions/parse-order/index.ts`

### 6.1 Add address resolution + auto-confirm logic after extraction

After the existing Step 5 (template upsert, around line 717), but **before** the final `return new Response(...)`, add the autonomous intake logic.

- [ ] In `supabase/functions/parse-order/index.ts`, locate the section after `upsertClientTemplate` (line ~717) and before the final response (line ~719). Add the following new steps:

```typescript
    // ── Step 6 (Plan C): Autonomous Order Intake ──
    // Only run if we have a tenant and client email
    let autoConfirmed = false;
    let autoConfirmReason = "";
    let capacityCheck: { available: boolean; suggestedVehicleId: string | null; reason: string } | null = null;

    if (tenantIdStr && clientEmail) {
      try {
        // 6a: Resolve client_id from client_name
        let clientId: string | null = null;
        if (extracted.client_name) {
          const { data: clientMatch } = await supabase
            .from("clients")
            .select("id")
            .eq("tenant_id", tenantIdStr)
            .ilike("name", `%${extracted.client_name}%`)
            .limit(1);
          if (clientMatch && clientMatch.length > 0) {
            clientId = clientMatch[0].id;
          }
        }

        // 6b: Address resolution from client_address_book
        if (clientId) {
          const resolveAddress = async (raw: string): Promise<string> => {
            if (!raw) return raw;
            const { data: entries } = await supabase
              .from("client_address_book")
              .select("id, alias, resolved_address, resolved_lat, resolved_lng, usage_count")
              .eq("tenant_id", tenantIdStr)
              .eq("client_id", clientId!);

            if (!entries || entries.length === 0) return raw;

            const lower = raw.trim().toLowerCase();

            // Exact match
            const exact = entries.find((e: any) => e.alias.trim().toLowerCase() === lower);
            if (exact) {
              // Increment usage (fire-and-forget)
              supabase.from("client_address_book")
                .update({ usage_count: (exact.usage_count || 1) + 1, last_used_at: new Date().toISOString() })
                .eq("id", exact.id).then();
              return exact.resolved_address;
            }

            // Simple fuzzy: Levenshtein on short aliases
            for (const entry of entries) {
              const aliasLower = entry.alias.trim().toLowerCase();
              const maxDist = aliasLower.length <= 10 ? 2 : 3;
              let dist = 0;
              // Quick Levenshtein
              const m = lower.length, n = aliasLower.length;
              if (Math.abs(m - n) > maxDist) continue;
              const dp: number[][] = [];
              for (let i = 0; i <= m; i++) { dp[i] = [i]; }
              for (let j = 0; j <= n; j++) { dp[0][j] = j; }
              for (let i = 1; i <= m; i++) {
                for (let j = 1; j <= n; j++) {
                  dp[i][j] = Math.min(
                    dp[i-1][j] + 1,
                    dp[i][j-1] + 1,
                    dp[i-1][j-1] + (lower[i-1] === aliasLower[j-1] ? 0 : 1)
                  );
                }
              }
              dist = dp[m][n];
              if (dist <= maxDist) {
                supabase.from("client_address_book")
                  .update({ usage_count: (entry.usage_count || 1) + 1, last_used_at: new Date().toISOString() })
                  .eq("id", entry.id).then();
                return entry.resolved_address;
              }
            }
            return raw;
          };

          const [resolvedPickup, resolvedDelivery] = await Promise.all([
            resolveAddress(extracted.pickup_address || ""),
            resolveAddress(extracted.delivery_address || ""),
          ]);

          if (resolvedPickup !== extracted.pickup_address) {
            extracted.pickup_address = resolvedPickup;
          }
          if (resolvedDelivery !== extracted.delivery_address) {
            extracted.delivery_address = resolvedDelivery;
          }
        }

        // 6c: Enrich extraction template with averages
        if (clientEmail && tenantIdStr) {
          try {
            const { data: tpl } = await supabase
              .from("client_extraction_templates")
              .select("id, auto_confirm_eligible, default_transport_type, default_requirements, avg_weight_kg, avg_quantity, success_count")
              .eq("client_email", clientEmail)
              .eq("tenant_id", tenantIdStr)
              .limit(1)
              .single();

            if (tpl && tpl.id) {
              // Update rolling averages
              const currentAvgW = tpl.avg_weight_kg || 0;
              const currentAvgQ = tpl.avg_quantity || 0;
              const count = tpl.success_count || 1;
              const newAvgW = extracted.weight_kg
                ? (currentAvgW * (count - 1) + extracted.weight_kg) / count
                : currentAvgW;
              const newAvgQ = extracted.quantity
                ? (currentAvgQ * (count - 1) + extracted.quantity) / count
                : currentAvgQ;

              const enrichPayload: Record<string, any> = {
                avg_weight_kg: Math.round(newAvgW * 100) / 100,
                avg_quantity: Math.round(newAvgQ * 100) / 100,
              };
              if (extracted.transport_type && !tpl.default_transport_type) {
                enrichPayload.default_transport_type = extracted.transport_type;
              }
              if (extracted.requirements?.length > 0 && (!tpl.default_requirements || tpl.default_requirements.length === 0)) {
                enrichPayload.default_requirements = extracted.requirements;
              }
              // Mark auto_confirm_eligible when 20+ successes
              if (!tpl.auto_confirm_eligible && count >= 20) {
                enrichPayload.auto_confirm_eligible = true;
              }

              await supabase
                .from("client_extraction_templates")
                .update(enrichPayload)
                .eq("id", tpl.id);

              // 6d: Check if eligible for auto-confirm
              if (tpl.auto_confirm_eligible || count >= 20) {
                // Call confidence engine: shouldAutoExecute
                // This is imported from Plan A's confidenceEngine
                const { data: shouldAutoData } = await supabase.functions.invoke("pipeline-trigger", {
                  body: {
                    action: "shouldAutoExecute",
                    tenantId: tenantIdStr,
                    decisionType: "ORDER_INTAKE",
                    inputConfidence: extracted.confidence_score,
                    clientId: clientId,
                  },
                });

                if (shouldAutoData?.auto === true) {
                  autoConfirmed = true;
                  autoConfirmReason = shouldAutoData.reason || "Auto-confirm: confidence above threshold";
                }
              }
            }
          } catch (tplErr) {
            console.error("Template enrichment error:", tplErr);
          }
        }

        // 6e: Capacity pre-check (even if not auto-confirming, useful metadata)
        if (extracted.pickup_date || extracted.delivery_date) {
          try {
            const checkDate = extracted.delivery_date || extracted.pickup_date;
            const reqFeatures = extracted.requirements || [];

            // Quick capacity check via DB queries
            let vehicleQuery = supabase
              .from("vehicles")
              .select("id, capacity_kg, capacity_pallets, features")
              .eq("tenant_id", tenantIdStr);

            const vResult = reqFeatures.length > 0
              ? await vehicleQuery.contains("features", reqFeatures)
              : await vehicleQuery;

            if (vResult.data && vResult.data.length > 0) {
              const vIds = vResult.data.map((v: any) => v.id);
              const { data: unavail } = await supabase
                .from("vehicle_availability")
                .select("vehicle_id")
                .eq("date", checkDate)
                .eq("status", "unavailable")
                .in("vehicle_id", vIds);

              const unavailSet = new Set((unavail || []).map((u: any) => u.vehicle_id));
              const availVehicles = vResult.data.filter((v: any) => !unavailSet.has(v.id));

              if (availVehicles.length > 0) {
                capacityCheck = {
                  available: true,
                  suggestedVehicleId: availVehicles[0].id,
                  reason: `${availVehicles.length} voertuig(en) beschikbaar`,
                };
              } else {
                capacityCheck = {
                  available: false,
                  suggestedVehicleId: null,
                  reason: "Geen voertuig beschikbaar op deze datum",
                };
                // If no capacity, don't auto-confirm
                autoConfirmed = false;
                autoConfirmReason = "Geen voertuigcapaciteit beschikbaar";
              }
            }
          } catch (capErr) {
            console.error("Capacity pre-check error:", capErr);
          }
        }

      } catch (autonomyErr) {
        console.error("Autonomous intake error:", autonomyErr);
      }
    }
```

### 6.2 Modify the final response to include auto-confirm data

- [ ] Replace the existing final `return new Response(JSON.stringify({...}))` (around line 719) with:

```typescript
    return new Response(JSON.stringify({
      extracted,
      missing_fields: missingFields,
      follow_up_draft: followUpDraft,
      thread_type: threadType,
      changes_detected: changes,
      anomalies,
      auto_confirmed: autoConfirmed,
      auto_confirm_reason: autoConfirmReason,
      capacity_check: capacityCheck,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
```

### 6.3 Verify the Edge Function has no syntax errors

- [ ] Run: `cd C:/Users/Badr/Desktop/DevBadr/orderflow-suite && npx supabase functions serve parse-order --no-verify-jwt 2>&1 | head -5` (should start without errors, then Ctrl+C)

### 6.4 Commit

- [ ] Run:
```bash
cd C:/Users/Badr/Desktop/DevBadr/orderflow-suite && \
git add supabase/functions/parse-order/index.ts && \
git commit -m "feat(plan-c): add autonomous intake logic to parse-order

After extraction: resolve addresses from client_address_book, enrich
extraction template with rolling averages, evaluate auto-confirm
eligibility via confidence engine, and run capacity pre-check.
Returns auto_confirmed flag + capacity_check in response.

Part of Plan C: Autonomous Order Intake."
```

---

## Task 7: Modify `src/hooks/useInbox.ts`

### 7.1 Add address learning to `handleCreateOrder`

When the dispatcher approves an order, compare the dispatcher's final addresses against the AI-extracted addresses. If different, learn the new address mapping.

- [ ] In `src/hooks/useInbox.ts`, add import at the top (after existing imports):

```typescript
import { learnAddress } from "@/lib/addressResolver";
import { recordDecision } from "@/lib/confidenceEngine";
```

### 7.2 Modify `createOrderMutation.mutationFn`

- [ ] Inside `createOrderMutation`'s `mutationFn` (around line 300), after the existing `clientId` resolution and before the `supabase.from("orders").update(...)` call, add address learning logic:

```typescript
      // ── Plan C: Learn address aliases when dispatcher changes addresses ──
      if (clientId && orderTenantId) {
        const { data: originalOrder } = await supabase
          .from("orders")
          .select("pickup_address, delivery_address")
          .eq("id", id)
          .single();

        if (originalOrder) {
          // If dispatcher changed pickup address, learn the mapping
          if (
            originalOrder.pickup_address &&
            form.pickupAddress &&
            originalOrder.pickup_address !== form.pickupAddress
          ) {
            await learnAddress(
              supabase,
              orderTenantId,
              clientId,
              originalOrder.pickup_address,
              form.pickupAddress
            );
          }
          // If dispatcher changed delivery address, learn the mapping
          if (
            originalOrder.delivery_address &&
            form.deliveryAddress &&
            originalOrder.delivery_address !== form.deliveryAddress
          ) {
            await learnAddress(
              supabase,
              orderTenantId,
              clientId,
              originalOrder.delivery_address,
              form.deliveryAddress
            );
          }
        }
      }
```

### 7.3 Add decision recording to `createOrderMutation.onSuccess`

- [ ] Inside `createOrderMutation`'s `onSuccess` (around line 359), after the existing `toast.success`, add:

```typescript
      // ── Plan C: Record decision (dispatcher approved the order) ──
      try {
        const orderForm = formData[id];
        const orderData = drafts.find((d) => d.id === id);
        if (orderData && tenant?.id) {
          const wasModified =
            orderForm &&
            orderData &&
            (orderForm.pickupAddress !== orderData.pickup_address ||
              orderForm.deliveryAddress !== orderData.delivery_address ||
              orderForm.quantity !== orderData.quantity ||
              orderForm.weight !== String(orderData.weight_kg || ""));

          await recordDecision(supabase, {
            tenantId: tenant.id,
            decisionType: "ORDER_INTAKE",
            entityType: "order",
            entityId: id,
            clientId: orderData.client_id || null,
            proposedAction: {
              pickup_address: orderData.pickup_address,
              delivery_address: orderData.delivery_address,
              quantity: orderData.quantity,
              weight_kg: orderData.weight_kg,
            },
            actualAction: wasModified
              ? {
                  pickup_address: orderForm.pickupAddress,
                  delivery_address: orderForm.deliveryAddress,
                  quantity: orderForm.quantity,
                  weight_kg: orderForm.weight ? Number(orderForm.weight) : null,
                }
              : undefined,
            inputConfidence: orderData.confidence_score || 0,
            resolution: wasModified ? "MODIFIED" : "APPROVED",
          });
        }
      } catch (decisionErr) {
        console.error("Decision recording error:", decisionErr);
      }
```

### 7.4 Handle auto-confirmed orders in auto-extraction effect

- [ ] In the `runExtraction` async function (inside the `useEffect` at line ~607), after the `supabase.from("orders").update(...)` call and before `await queryClient.invalidateQueries`, add auto-confirm handling:

```typescript
        // ── Plan C: Handle auto-confirmed orders ──
        if (parseData.auto_confirmed) {
          await supabase
            .from("orders")
            .update({ status: "CONFIRMED" })
            .eq("id", selected.id);

          // Send confirmation email
          try {
            await supabase.functions.invoke("send-confirmation", {
              body: { orderId: selected.id },
            });
          } catch (confirmErr) {
            console.error("Auto-confirm send error:", confirmErr);
          }

          toast.success("Order automatisch bevestigd", {
            description: `Confidence voldoende — bevestiging verzonden naar ${selected.source_email_from || "klant"}`,
          });
        }
```

### 7.5 Run full test suite to verify no regressions

- [ ] Run: `cd C:/Users/Badr/Desktop/DevBadr/orderflow-suite && npx vitest run`
- [ ] Confirm: all existing tests still pass

### 7.6 Commit

- [ ] Run:
```bash
cd C:/Users/Badr/Desktop/DevBadr/orderflow-suite && \
git add src/hooks/useInbox.ts && \
git commit -m "feat(plan-c): add address learning + decision recording to useInbox

When dispatcher approves/modifies an order:
- Compares final addresses with AI-extracted, calls learnAddress if different
- Records decision via confidenceEngine (APPROVED/MODIFIED)
When auto-extraction detects auto_confirmed from parse-order:
- Sets status=CONFIRMED, sends confirmation email, shows toast

Part of Plan C: Autonomous Order Intake."
```

---

## Task 8: Full Verification

### 8.1 TypeScript compilation check

- [ ] Run: `cd C:/Users/Badr/Desktop/DevBadr/orderflow-suite && npx tsc --noEmit`
- [ ] Confirm: no type errors

### 8.2 Run all Plan C tests

- [ ] Run: `cd C:/Users/Badr/Desktop/DevBadr/orderflow-suite && npx vitest run src/test/addressResolver.test.ts src/test/capacityPreCheck.test.ts`
- [ ] Confirm: all 20 tests pass

### 8.3 Run full test suite

- [ ] Run: `cd C:/Users/Badr/Desktop/DevBadr/orderflow-suite && npx vitest run`
- [ ] Confirm: all tests pass, no regressions

### 8.4 Final commit (if any fixups needed)

- [ ] If any fixes were required, commit with: `fix(plan-c): <description of fix>`

---

## Summary

| Artifact | File | Status |
|----------|------|--------|
| Migration: client_address_book | `supabase/migrations/20260405140000_client_address_book.sql` | NEW |
| Migration: ALTER templates | `supabase/migrations/20260405140100_alter_extraction_templates.sql` | NEW |
| Types: address book | `src/types/addressBook.ts` | NEW |
| Lib: address resolver | `src/lib/addressResolver.ts` | NEW |
| Lib: capacity pre-check | `src/lib/capacityPreCheck.ts` | NEW |
| Edge Function: parse-order | `supabase/functions/parse-order/index.ts` | MODIFIED |
| Hook: useInbox | `src/hooks/useInbox.ts` | MODIFIED |
| Tests: address resolver | `src/test/addressResolver.test.ts` | NEW (10 tests) |
| Tests: capacity pre-check | `src/test/capacityPreCheck.test.ts` | NEW (10 tests) |

**Total: ~600 lines new code, 20 test cases, 1 new table, 1 ALTER, 2 new libs, 2 modified files.**
