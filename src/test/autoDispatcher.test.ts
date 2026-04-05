import { describe, it, expect } from "vitest";
import {
  type AnomalyType,
  type AnomalyResolution,
  type DispatchRules,
  type ExecutionAnomaly,
  ANOMALY_TYPES,
  ANOMALY_RESOLUTIONS,
  isValidAnomalyType,
  isValidResolution,
} from "@/types/dispatch-autonomy";
import {
  getTripsReadyForDispatch,
  dispatchTrip,
} from "@/lib/autoDispatcher";
import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Type Tests ───────────────────────────────────────────

describe("dispatch-autonomy types", () => {
  it("ANOMALY_TYPES contains all 4 types", () => {
    expect(ANOMALY_TYPES).toEqual(["STATIONARY", "LATE", "OFF_ROUTE", "MISSED_WINDOW"]);
  });

  it("isValidAnomalyType returns true for valid types", () => {
    expect(isValidAnomalyType("STATIONARY")).toBe(true);
    expect(isValidAnomalyType("LATE")).toBe(true);
    expect(isValidAnomalyType("OFF_ROUTE")).toBe(true);
    expect(isValidAnomalyType("MISSED_WINDOW")).toBe(true);
  });

  it("isValidAnomalyType returns false for invalid types", () => {
    expect(isValidAnomalyType("BOGUS")).toBe(false);
    expect(isValidAnomalyType("")).toBe(false);
  });

  it("isValidResolution validates correctly", () => {
    expect(isValidResolution("AUTO_REPLANNED")).toBe(true);
    expect(isValidResolution("PLANNER_RESOLVED")).toBe(true);
    expect(isValidResolution("IGNORED")).toBe(true);
    expect(isValidResolution("UNKNOWN")).toBe(false);
    expect(isValidResolution(null)).toBe(true); // null is valid (unresolved)
  });

  it("DispatchRules has correct defaults shape", () => {
    const defaults: DispatchRules = {
      id: "test-id",
      tenant_id: "tenant-1",
      auto_dispatch_enabled: false,
      dispatch_lead_time_min: 60,
      anomaly_stationary_min: 20,
      anomaly_late_threshold_min: 15,
      auto_replan_enabled: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    expect(defaults.auto_dispatch_enabled).toBe(false);
    expect(defaults.dispatch_lead_time_min).toBe(60);
  });
});

// ─── Mock Supabase client ──────────────────────────────────
function createMockSupabase(overrides: {
  tripsData?: any[];
  rulesData?: any;
  updateResult?: any;
  insertResult?: any;
} = {}): SupabaseClient {
  const { tripsData = [], rulesData = null, updateResult = {}, insertResult = {} } = overrides;

  const mockFrom = (table: string) => {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      gte: () => chain,
      lte: () => chain,
      in: () => chain,
      order: () => chain,
      single: () => Promise.resolve({ data: rulesData, error: null }),
      maybeSingle: () => Promise.resolve({ data: rulesData, error: null }),
      update: () => ({
        eq: () => Promise.resolve({ data: updateResult, error: null }),
      }),
      insert: () => Promise.resolve({ data: insertResult, error: null }),
      then: (resolve: any) => resolve({ data: tripsData, error: null }),
    };
    // Make the chain itself thenable for queries that end without .single()
    return chain;
  };

  return { from: mockFrom } as unknown as SupabaseClient;
}

describe("getTripsReadyForDispatch", () => {
  it("returns trips within lead time that are VERZENDKLAAR", async () => {
    const now = new Date("2026-04-05T07:00:00Z");
    const trip = {
      id: "trip-1",
      tenant_id: "t-1",
      dispatch_status: "VERZENDKLAAR",
      planned_date: "2026-04-05",
      stops: [{ planned_time: "2026-04-05T08:00:00Z", stop_sequence: 1 }],
    };

    const supabase = createMockSupabase({ tripsData: [trip] });
    const result = await getTripsReadyForDispatch(supabase as any, "t-1", now, 60);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("trip-1");
  });

  it("returns empty array when no trips match", async () => {
    const now = new Date("2026-04-05T07:00:00Z");
    const supabase = createMockSupabase({ tripsData: [] });
    const result = await getTripsReadyForDispatch(supabase as any, "t-1", now, 60);
    expect(result).toHaveLength(0);
  });

  it("filters out trips whose first stop is too far in future", async () => {
    const now = new Date("2026-04-05T05:00:00Z"); // 5 AM
    const trip = {
      id: "trip-1",
      tenant_id: "t-1",
      dispatch_status: "VERZENDKLAAR",
      planned_date: "2026-04-05",
      stops: [{ planned_time: "2026-04-05T14:00:00Z", stop_sequence: 1 }], // 2 PM, 9h away
    };

    // Lead time = 60 min, so trip at 2 PM should NOT be ready at 5 AM
    const result = await getTripsReadyForDispatch(
      createMockSupabase({ tripsData: [trip] }) as any,
      "t-1",
      now,
      60,
    );
    expect(result).toHaveLength(0);
  });
});

describe("dispatchTrip", () => {
  it("updates trip status to VERZONDEN", async () => {
    let updatedTable = "";
    let updatedStatus = "";

    const mockFrom = (table: string) => {
      const chain: any = {
        select: () => chain,
        eq: (_col: string, val: any) => {
          if (_col === "id" && table === "trips") updatedTable = table;
          return chain;
        },
        single: () => Promise.resolve({
          data: { id: "trip-1", tenant_id: "t-1", driver_id: "d-1", trip_number: 42 },
          error: null,
        }),
        update: (vals: any) => {
          if (table === "trips") updatedStatus = vals.dispatch_status;
          return {
            eq: () => Promise.resolve({ data: {}, error: null }),
          };
        },
        insert: () => Promise.resolve({ data: {}, error: null }),
      };
      return chain;
    };

    const supabase = { from: mockFrom } as unknown as SupabaseClient;
    await dispatchTrip(supabase, "trip-1");
    expect(updatedStatus).toBe("VERZONDEN");
  });
});
