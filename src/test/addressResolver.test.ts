import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  resolveClientAddress,
  learnAddress,
  levenshteinDistance,
} from "@/lib/addressResolver";

// ── Mock supabase ──
const mockFrom = vi.fn();
const mockSupabase = { from: mockFrom } as any;

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
        eq: vi.fn().mockReturnValue({
          then: vi.fn(),
        }),
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
        eq: vi.fn().mockReturnValue({
          then: vi.fn(),
        }),
      }),
    });

    // "Depo Rdam" has Levenshtein distance 1 from "Depot Rdam" -> match
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
