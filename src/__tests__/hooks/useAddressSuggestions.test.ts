import { renderHook, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import type { ReactNode } from "react";
import React from "react";

const { mockFrom, mockSupabase } = vi.hoisted(() => {
  const mockFrom = vi.fn();
  const mockSupabase = {
    from: mockFrom,
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() }),
    removeChannel: vi.fn(),
  };

  return { mockFrom, mockSupabase };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc },
      React.createElement(BrowserRouter, null, children)
    );
}

import { useAddressSuggestions, recordAddressCorrection } from "@/hooks/useAddressSuggestions";

describe("useAddressSuggestions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is disabled when clientName is null", () => {
    const { result } = renderHook(() => useAddressSuggestions(null), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("is disabled when clientName is too short", () => {
    const { result } = renderHook(() => useAddressSuggestions("AB"), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("returns pickup and delivery suggestions sorted by frequency", async () => {
    const orders = [
      { pickup_address: "Amsterdam, NL", delivery_address: "Rotterdam, NL", created_at: "2026-01-01" },
      { pickup_address: "Amsterdam, NL", delivery_address: "Rotterdam, NL", created_at: "2026-01-02" },
      { pickup_address: "Utrecht, NL", delivery_address: "Den Haag, NL", created_at: "2026-01-03" },
      { pickup_address: "Amsterdam, NL", delivery_address: "Eindhoven, NL", created_at: "2026-01-04" },
    ];

    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: orders, error: null }),
    }));

    const { result } = renderHook(
      () => useAddressSuggestions("Acme Corp"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data!.pickup).toHaveLength(2);
    expect(result.current.data!.pickup[0].address).toBe("Amsterdam, NL");
    expect(result.current.data!.pickup[0].frequency).toBe(3);
    expect(result.current.data!.pickup[0].field).toBe("pickup");

    expect(result.current.data!.delivery).toHaveLength(3);
    expect(result.current.data!.delivery[0].address).toBe("Rotterdam, NL");
    expect(result.current.data!.delivery[0].frequency).toBe(2);
  });

  it("returns empty arrays when no orders found", async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    }));

    const { result } = renderHook(
      () => useAddressSuggestions("Nobody"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.pickup).toEqual([]);
    expect(result.current.data!.delivery).toEqual([]);
  });

  it("skips short addresses (length <= 3)", async () => {
    const orders = [
      { pickup_address: "AB", delivery_address: "CD", created_at: "2026-01-01" },
      { pickup_address: "Amsterdam, NL", delivery_address: null, created_at: "2026-01-02" },
    ];

    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: orders, error: null }),
    }));

    const { result } = renderHook(
      () => useAddressSuggestions("Test Client"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.pickup).toHaveLength(1); // Only "Amsterdam, NL"
    expect(result.current.data!.delivery).toHaveLength(0);
  });

  it("limits suggestions to top 5", async () => {
    const orders = Array.from({ length: 10 }, (_, i) => ({
      pickup_address: `Address ${i}, NL`,
      delivery_address: `Delivery ${i}, NL`,
      created_at: `2026-01-${String(i + 1).padStart(2, "0")}`,
    }));

    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: orders, error: null }),
    }));

    const { result } = renderHook(
      () => useAddressSuggestions("Acme Corp"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.pickup.length).toBeLessThanOrEqual(5);
    expect(result.current.data!.delivery.length).toBeLessThanOrEqual(5);
  });

  it("includes orderCount in results", async () => {
    const orders = [
      { pickup_address: "Amsterdam", delivery_address: "Rotterdam", created_at: "2026-01-01" },
    ];

    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: orders, error: null }),
    }));

    const { result } = renderHook(
      () => useAddressSuggestions("Test"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.orderCount).toBe(1);
  });

  it("handles error", async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: null, error: { message: "fail" } }),
    }));

    const { result } = renderHook(
      () => useAddressSuggestions("Acme"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("recordAddressCorrection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates the order with corrected address", async () => {
    mockFrom.mockImplementation(() => ({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    }));

    await recordAddressCorrection("o1", "pickup_address", "New Address, NL");

    expect(mockFrom).toHaveBeenCalledWith("orders");
  });

  it("throws on update error", async () => {
    mockFrom.mockImplementation(() => ({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: { message: "fail" } }),
    }));

    await expect(
      recordAddressCorrection("o1", "pickup_address", "Bad")
    ).rejects.toThrow();
  });
});
