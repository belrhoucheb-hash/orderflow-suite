import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi, describe, it, expect, afterEach } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: "u1" } } } }) },
    channel: () => ({
      on: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
      subscribe: () => ({}),
    }),
    removeChannel: () => {},
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: async () => ({ data: [], error: null }),
          }),
        }),
      }),
    }),
  },
}));

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({ tenant: { id: "tenant-1", name: "Test" } }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { DriverChatPanel } from "@/components/chauffeur/DriverChatPanel";

describe("DriverChatPanel", () => {
  afterEach(() => cleanup());

  function renderWithClient(ui: React.ReactNode) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  }

  it("toont een lege-state met aanwijzing", () => {
    renderWithClient(<DriverChatPanel driverId="driver-1" active />);
    expect(screen.getByText("Planner")).toBeTruthy();
    expect(screen.getByPlaceholderText("Schrijf een bericht...")).toBeTruthy();
  });
});
