import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkAvailableCapacity } from "@/lib/capacityPreCheck";

// ── Mock supabase ──
const mockFrom = vi.fn();
const mockSupabase = { from: mockFrom } as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("checkAvailableCapacity", () => {
  it("returns available=true with a suggested vehicle when capacity exists", async () => {
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
        const vehicleData = {
          data: [{ id: "v-2", capacity_kg: 8000, capacity_pallets: 20, features: [] }],
          error: null,
        };
        const chain: any = {
          then: (resolve: any) => resolve(vehicleData),
        };
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.contains = vi.fn().mockResolvedValue(vehicleData);
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
        const vehicleData = {
          data: [{ id: "v-3", capacity_kg: 5000, capacity_pallets: 15, features: [] }],
          error: null,
        };
        const chain: any = {
          then: (resolve: any) => resolve(vehicleData),
        };
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.contains = vi.fn().mockResolvedValue(vehicleData);
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
        const vehicleData = {
          data: [
            { id: "v-small", capacity_kg: 3000, capacity_pallets: 10, features: [] },
            { id: "v-big", capacity_kg: 20000, capacity_pallets: 33, features: [] },
          ],
          error: null,
        };
        const chain: any = {
          then: (resolve: any) => resolve(vehicleData),
        };
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.contains = vi.fn().mockResolvedValue(vehicleData);
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
        const vehicleData = {
          data: [{ id: "v-4", capacity_kg: 20000, capacity_pallets: 10, features: [] }],
          error: null,
        };
        const chain: any = {
          then: (resolve: any) => resolve(vehicleData),
        };
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.contains = vi.fn().mockResolvedValue(vehicleData);
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
