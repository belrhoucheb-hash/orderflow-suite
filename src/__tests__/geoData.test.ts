import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// Polyfill AbortSignal.timeout if not available in test environment
if (!AbortSignal.timeout) {
  (AbortSignal as any).timeout = (ms: number) => {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), ms);
    return ctrl.signal;
  };
}

// We need to reset modules between tests because geocodeAddress uses a module-level cache
let geocodeAddress: typeof import("@/data/geoData").geocodeAddress;
let originalFetch: typeof globalThis.fetch;
let fetchSpy: ReturnType<typeof vi.fn>;

describe("geocodeAddress - external fetch calls", () => {
  beforeEach(async () => {
    vi.resetModules();
    fetchSpy = vi.fn();
    originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy;
    const mod = await import("@/data/geoData");
    geocodeAddress = mod.geocodeAddress;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns cached city coordinates without calling fetch", async () => {
    const result = await geocodeAddress("Amsterdam");
    expect(result).toEqual({ lat: 52.37, lng: 4.9 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns null for empty address without calling fetch", async () => {
    const result = await geocodeAddress("");
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("calls PDOK API for unknown address and parses POINT response", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        response: {
          docs: [{ centroide_ll: "POINT(5.123 52.456)" }],
        },
      }),
    });

    const result = await geocodeAddress("Keizersgracht 100, 1015 AA unique-pdok-1");
    expect(result).toEqual({ lat: 52.456, lng: 5.123 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("api.pdok.nl"),
      expect.any(Object),
    );
  });

  it("falls back to Nominatim when PDOK returns no docs", async () => {
    // PDOK: empty docs
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ response: { docs: [] } }),
    });
    // Nominatim: result
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ lat: "48.8566", lon: "2.3522" }],
    });

    const result = await geocodeAddress("Paris, France unique-nom-1");
    expect(result).toEqual({ lat: 48.8566, lng: 2.3522 });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy).toHaveBeenNthCalledWith(1, expect.stringContaining("pdok"), expect.any(Object));
    expect(fetchSpy).toHaveBeenNthCalledWith(2, expect.stringContaining("nominatim"), expect.any(Object));
  });

  it("falls back to Nominatim when PDOK fetch throws", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("PDOK timeout"));
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ lat: "51.05", lon: "3.72" }],
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await geocodeAddress("Gent, Belgium unique-nom-2");
    expect(result).toEqual({ lat: 51.05, lng: 3.72 });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("PDOK"), expect.any(Error));
    warnSpy.mockRestore();
  });

  it("returns null when both PDOK and Nominatim fail", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("PDOK error"));
    fetchSpy.mockRejectedValueOnce(new Error("Nominatim error"));

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await geocodeAddress("Unknown Place 12345 unique-fail-1");
    expect(result).toBeNull();
    warnSpy.mockRestore();
  });

  it("returns null when Nominatim returns empty array", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ response: { docs: [] } }),
    });
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    const result = await geocodeAddress("Nowhere Land 99999 unique-empty-1");
    expect(result).toBeNull();
  });

  it("handles PDOK returning non-ok response", async () => {
    fetchSpy.mockResolvedValueOnce({ ok: false });
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ lat: "52.50", lon: "13.40" }],
    });

    const result = await geocodeAddress("Berlin, Germany unique-nonok-1");
    expect(result).toEqual({ lat: 52.50, lng: 13.40 });
  });

  it("handles PDOK doc without centroide_ll field", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ response: { docs: [{ woonplaatsnaam: "Test" }] } }),
    });
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ lat: "50.0", lon: "4.0" }],
    });

    const result = await geocodeAddress("Some place without coords unique-nocoord-1");
    expect(result).toEqual({ lat: 50.0, lng: 4.0 });
  });

  it("sends User-Agent header to Nominatim", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ response: { docs: [] } }),
    });
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ lat: "40.0", lon: "-3.0" }],
    });

    await geocodeAddress("Madrid unique-ua-1");
    expect(fetchSpy).toHaveBeenNthCalledWith(2,
      expect.stringContaining("nominatim"),
      expect.objectContaining({
        headers: { "User-Agent": "orderflow-suite/1.0" },
      }),
    );
  });

  it("handles Nominatim returning non-ok response", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ response: { docs: [] } }),
    });
    fetchSpy.mockResolvedValueOnce({ ok: false });

    const result = await geocodeAddress("Nonok Nominatim unique-nonok-2");
    expect(result).toBeNull();
  });
});
