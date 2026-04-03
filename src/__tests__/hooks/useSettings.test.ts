import { renderHook, waitFor, act } from "@testing-library/react";
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
vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({ tenant: { id: "tenant-1" }, loading: false }),
}));

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc },
      React.createElement(BrowserRouter, null, children)
    );
}

import { useLoadSettings, useSaveSettings } from "@/hooks/useSettings";

describe("useLoadSettings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches settings for a category", async () => {
    const settings = { apiKey: "abc123", enabled: true };
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { settings }, error: null }),
    }));

    const { result } = renderHook(() => useLoadSettings("integrations"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(settings);
  });

  it("returns empty object when no settings found", async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }));

    const { result } = renderHook(() => useLoadSettings("notifications"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({});
  });

  it("handles error", async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: "fail" } }),
    }));

    const { result } = renderHook(() => useLoadSettings("general"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useSaveSettings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("upserts settings", async () => {
    mockFrom.mockImplementation(() => ({
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }));

    const { result } = renderHook(() => useSaveSettings("integrations"), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ apiKey: "new-key" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("handles upsert error", async () => {
    mockFrom.mockImplementation(() => ({
      upsert: vi.fn().mockResolvedValue({ error: { message: "fail" } }),
    }));

    const { result } = renderHook(() => useSaveSettings("integrations"), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ apiKey: "bad" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
