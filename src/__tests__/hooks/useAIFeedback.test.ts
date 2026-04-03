import { vi, describe, it, expect, beforeEach } from "vitest";

const { mockFrom, mockSupabase } = vi.hoisted(() => {
  const mockFrom = vi.fn();
  const mockSupabase = {
    from: mockFrom,
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  };

  return { mockFrom, mockSupabase };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));

import {
  saveCorrection,
  getClientCorrections,
  getExtractionPatterns,
  buildAIContext,
} from "@/hooks/useAIFeedback";

describe("saveCorrection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("saves a correction to the database", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "orders") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { tenant_id: "t1" }, error: null }),
        };
      }
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    });

    await saveCorrection("o1", "Acme", "weight", "100", "200");

    expect(mockFrom).toHaveBeenCalledWith("ai_corrections");
  });

  it("uses provided tenantId without lookup", async () => {
    mockFrom.mockImplementation(() => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
    }));

    await saveCorrection("o1", "Acme", "weight", "100", "200", "provided-tenant");

    // Should not query orders table
    expect(mockFrom).not.toHaveBeenCalledWith("orders");
    expect(mockFrom).toHaveBeenCalledWith("ai_corrections");
  });

  it("skips when correctedValue is empty", async () => {
    await saveCorrection("o1", "Acme", "weight", "100", "");

    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("skips when values are identical", async () => {
    await saveCorrection("o1", "Acme", "weight", "100", "100");

    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("handles database errors gracefully", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFrom.mockImplementation((table: string) => {
      if (table === "orders") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { tenant_id: "t1" }, error: null }),
        };
      }
      return {
        insert: vi.fn().mockRejectedValue(new Error("DB error")),
      };
    });

    await saveCorrection("o1", "Acme", "weight", "100", "200");

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe("getClientCorrections", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns empty string for empty client name", async () => {
    const result = await getClientCorrections("");
    expect(result).toBe("");
  });

  it("returns formatted corrections for a client", async () => {
    const corrections = [
      { field_name: "weight", ai_value: "100", corrected_value: "200", created_at: "2026-01-01" },
      { field_name: "pickupAddress", ai_value: "A", corrected_value: "B", created_at: "2026-01-02" },
    ];
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: corrections, error: null }),
    }));

    const result = await getClientCorrections("Acme");

    expect(result).toContain("HISTORISCHE CORRECTIES");
    expect(result).toContain("weight");
    expect(result).toContain("100");
    expect(result).toContain("200");
  });

  it("returns empty string when no corrections found", async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    }));

    const result = await getClientCorrections("Nobody");
    expect(result).toBe("");
  });

  it("handles errors gracefully", async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockRejectedValue(new Error("fail")),
    }));

    const result = await getClientCorrections("Acme");
    expect(result).toBe("");
  });
});

describe("getExtractionPatterns", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns patterns from recent successful orders", async () => {
    const orders = [
      { client_name: "Acme", pickup_address: "Amsterdam", delivery_address: "Rotterdam" },
      { client_name: "Acme", pickup_address: "Amsterdam", delivery_address: "Utrecht" },
      { client_name: "Beta", pickup_address: "Den Haag", delivery_address: "Eindhoven" },
    ];
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: orders, error: null }),
    }));

    const result = await getExtractionPatterns();

    expect(result).toContain("BEKENDE KLANT-ADRESSEN");
    expect(result).toContain("Acme");
  });

  it("returns empty string when fewer than 3 orders", async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [{ client_name: "A" }], error: null }),
    }));

    const result = await getExtractionPatterns();
    expect(result).toBe("");
  });

  it("handles errors gracefully", async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockRejectedValue(new Error("fail")),
    }));

    const result = await getExtractionPatterns();
    expect(result).toBe("");
  });
});

describe("buildAIContext", () => {
  beforeEach(() => vi.clearAllMocks());

  it("combines corrections and patterns", async () => {
    // Mock both queries to return data
    let callIndex = 0;
    mockFrom.mockImplementation(() => {
      callIndex++;
      if (callIndex <= 1) {
        // getClientCorrections
        return {
          select: vi.fn().mockReturnThis(),
          ilike: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({
            data: [{ field_name: "weight", ai_value: "1", corrected_value: "2", created_at: "2026-01-01" }],
            error: null,
          }),
        };
      }
      // getExtractionPatterns
      return {
        select: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
    });

    const result = await buildAIContext("Acme");
    expect(result).toContain("CORRECTIES");
  });
});
