import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockInvoke = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: mockInvoke,
    },
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useInvitePortalUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("invokes the edge function instead of browser-side auth flows", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        user: {
          id: "portal-user-1",
          email: "test@example.com",
        },
      },
      error: null,
    });

    const { useInvitePortalUser } = await import("@/hooks/useClientPortalUsers");
    const { result } = renderHook(() => useInvitePortalUser(), { wrapper });

    await result.current.mutateAsync({
      email: "test@example.com",
      client_id: "client-1",
      tenant_id: "tenant-1",
      portal_role: "viewer",
    });

    expect(mockInvoke).toHaveBeenCalledWith("invite-portal-user", {
      body: {
        email: "test@example.com",
        client_id: "client-1",
        tenant_id: "tenant-1",
        portal_role: "viewer",
        redirect_to: "http://localhost:3000/portal",
      },
    });
  });
});
