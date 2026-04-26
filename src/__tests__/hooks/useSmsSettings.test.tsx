import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRpc = vi.fn();
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
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useSmsSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads masked SMS settings via get_sms_settings_ui", async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        smsProvider: "twilio",
        twilioAccountSid: "AC123",
        twilioFromNumber: "+31612345678",
        hasTwilioAuthToken: true,
      },
      error: null,
    });

    const { useSmsSettings } = await import("@/hooks/useSmsSettings");
    const { result } = renderHook(() => useSmsSettings(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockRpc).toHaveBeenCalledWith("get_sms_settings_ui");
    expect(result.current.data).toEqual({
      smsProvider: "twilio",
      twilioAccountSid: "AC123",
      twilioFromNumber: "+31612345678",
      hasTwilioAuthToken: true,
    });
    expect(result.current.data).not.toHaveProperty("twilioAuthToken");
  });

  it("saves SMS settings through save_sms_settings_secure", async () => {
    mockRpc.mockResolvedValueOnce({ error: null });

    const { useSaveSmsSettings } = await import("@/hooks/useSmsSettings");
    const { result } = renderHook(() => useSaveSmsSettings(), { wrapper });

    await result.current.mutateAsync({
      smsProvider: "messagebird",
      messageBirdApiKey: "mb-secret",
      messageBirdOriginator: "OrderFlow",
    });

    expect(mockRpc).toHaveBeenCalledWith("save_sms_settings_secure", {
      p_settings: {
        smsProvider: "messagebird",
        messageBirdApiKey: "mb-secret",
        messageBirdOriginator: "OrderFlow",
      },
    });
  });
});
