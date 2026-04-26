import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRpc = vi.fn();
const mockInvalidateQueries = vi.fn();
const mockUseTenant = vi.fn(() => ({ tenant: { id: "tenant-1" } }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: mockRpc,
  },
}));

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => mockUseTenant(),
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.invalidateQueries = mockInvalidateQueries as any;
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useIntegrationCredentials secure RPC flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads integration credentials via get_integration_credentials_ui RPC", async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        enabled: true,
        credentials: {
          administratieId: "adm-1",
          __hasStoredSecrets: true,
        },
      },
      error: null,
    });

    const { useIntegrationCredentials } = await import("@/hooks/useIntegrationCredentials");
    const { result } = renderHook(
      () => useIntegrationCredentials("snelstart"),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockRpc).toHaveBeenCalledWith("get_integration_credentials_ui", {
      p_provider: "snelstart",
    });
    expect(result.current.data).toEqual({
      enabled: true,
      credentials: {
        administratieId: "adm-1",
        __hasStoredSecrets: true,
      },
    });
  });

  it("saves integration credentials via save_integration_credentials_secure RPC", async () => {
    mockRpc.mockResolvedValueOnce({ error: null });

    const { useSaveIntegrationCredentials } = await import("@/hooks/useIntegrationCredentials");
    const { result } = renderHook(
      () => useSaveIntegrationCredentials("nostradamus"),
      { wrapper },
    );

    await result.current.mutateAsync({
      enabled: true,
      credentials: {
        baseUrl: "https://api.example.com",
        apiToken: "super-secret-token",
      },
    });

    expect(mockRpc).toHaveBeenCalledWith("save_integration_credentials_secure", {
      p_provider: "nostradamus",
      p_enabled: true,
      p_credentials: {
        baseUrl: "https://api.example.com",
        apiToken: "super-secret-token",
      },
    });
    expect(mockInvalidateQueries).toHaveBeenCalled();
  });
});
