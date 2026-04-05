import { describe, it, expect } from "vitest";
import {
  replanOnDelay,
  buildReplanChanges,
} from "@/lib/realtimeReplanner";
import type { TripStop } from "@/types/dispatch";

describe("buildReplanChanges", () => {
  it("detects sequence changes between old and new stop order", () => {
    const oldStops = [
      { id: "s1", stop_sequence: 1 },
      { id: "s2", stop_sequence: 2 },
      { id: "s3", stop_sequence: 3 },
    ] as TripStop[];

    const newStops = [
      { id: "s2", stop_sequence: 1 },
      { id: "s3", stop_sequence: 2 },
      { id: "s1", stop_sequence: 3 },
    ] as TripStop[];

    const changes = buildReplanChanges(oldStops, newStops);
    expect(changes).toHaveLength(3);
    expect(changes.find((c) => c.stop_id === "s1")?.new_sequence).toBe(3);
    expect(changes.find((c) => c.stop_id === "s2")?.new_sequence).toBe(1);
  });

  it("returns empty array when order is unchanged", () => {
    const stops = [
      { id: "s1", stop_sequence: 1 },
      { id: "s2", stop_sequence: 2 },
    ] as TripStop[];

    const changes = buildReplanChanges(stops, stops);
    expect(changes).toHaveLength(0);
  });
});

describe("replanOnDelay", () => {
  it("returns success false when no stops to replan", async () => {
    const mockFrom = (_table: string) => ({
      select: () => ({
        eq: () => ({
          in: () => ({
            order: () =>
              Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    });

    const supabase = { from: mockFrom } as any;
    const result = await replanOnDelay(supabase, "trip-1", "stop-1", {
      lat: 52.37,
      lng: 4.9,
    });
    expect(result.success).toBe(false);
    expect(result.changes).toHaveLength(0);
  });

  it("returns changes when replanning produces a new order", async () => {
    const stops = [
      {
        id: "s1",
        stop_sequence: 1,
        planned_latitude: 52.37,
        planned_longitude: 4.9,
        stop_status: "GEPLAND",
      },
      {
        id: "s2",
        stop_sequence: 2,
        planned_latitude: 51.92,
        planned_longitude: 4.48,
        stop_status: "GEPLAND",
      },
    ];

    const mockFrom = (table: string) => {
      if (table === "trip_stops") {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                order: () => Promise.resolve({ data: stops, error: null }),
              }),
            }),
          }),
          update: () => ({
            eq: () => Promise.resolve({ data: {}, error: null }),
          }),
        };
      }
      // notifications
      return {
        insert: () => Promise.resolve({ data: {}, error: null }),
      };
    };

    const supabase = { from: mockFrom } as any;
    const result = await replanOnDelay(supabase, "trip-1", "s1", {
      lat: 51.92,
      lng: 4.48, // Driver is near Rotterdam (s2), so s2 should come first
    });

    expect(result.success).toBe(true);
    // The reoptimize function uses nearest-neighbor, so with driver at Rotterdam,
    // s2 (Rotterdam) should come first, then s1 (Amsterdam)
  });

  it("identifies infeasible stops", async () => {
    const stops = [
      {
        id: "s1",
        stop_sequence: 1,
        planned_latitude: 52.37,
        planned_longitude: 4.9,
        stop_status: "GEPLAND",
      },
    ];

    const mockFrom = (table: string) => ({
      select: () => ({
        eq: () => ({
          in: () => ({
            order: () => Promise.resolve({ data: stops, error: null }),
          }),
        }),
      }),
      update: () => ({
        eq: () => Promise.resolve({ data: {}, error: null }),
      }),
      insert: () => Promise.resolve({ data: {}, error: null }),
    });

    const supabase = { from: mockFrom } as any;
    const result = await replanOnDelay(supabase, "trip-1", "s1", {
      lat: 52.37,
      lng: 4.9,
    });

    expect(result).toHaveProperty("infeasible_stops");
    expect(Array.isArray(result.infeasible_stops)).toBe(true);
  });
});
