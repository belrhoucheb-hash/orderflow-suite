import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRpc = vi.fn();
const mockFromSingle = vi.fn();
const mockSelect = vi.fn(() => ({
  eq: vi.fn().mockReturnThis(),
  single: mockFromSingle,
}));
const mockGetUser = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: mockRpc,
    from: vi.fn(() => ({
      select: mockSelect,
    })),
    auth: {
      getUser: mockGetUser,
    },
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useTestWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enqueues a targeted test delivery via RPC", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: "user-1" } } });
    mockFromSingle.mockResolvedValueOnce({ data: { id: "sub-1" }, error: null });
    mockRpc.mockResolvedValueOnce({ error: null });

    const { useTestWebhook } = await import("@/hooks/useWebhooks");
    const { result } = renderHook(() => useTestWebhook(), { wrapper });

    await result.current.mutateAsync("sub-1");

    expect(mockRpc).toHaveBeenCalledWith("enqueue_test_webhook_delivery", {
      p_subscription_id: "sub-1",
    });
  });
});
