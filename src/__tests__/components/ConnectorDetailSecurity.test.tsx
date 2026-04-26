import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/connectors/catalog", () => ({
  findConnector: () => ({
    slug: "snelstart",
    name: "Snelstart",
    description: "Boekhouding",
    setupHint: "Configureer Snelstart",
    status: "live",
    mappingKeys: [],
    supportedEvents: [],
  }),
}));

vi.mock("@/hooks/useConnectors", () => ({
  useConnectorMapping: () => ({ data: {}, isLoading: false }),
  useSaveConnectorMapping: () => ({ mutate: vi.fn(), isPending: false }),
  useConnectorSyncLog: () => ({ data: [], isLoading: false }),
  useTestConnector: () => ({ mutate: vi.fn(), isPending: false }),
  usePullConnector: () => ({ mutate: vi.fn(), isPending: false }),
  buildExactOAuthUrl: () => null,
}));

vi.mock("@/hooks/useIntegrationCredentials", () => ({
  useIntegrationCredentials: () => ({
    data: {
      enabled: true,
      credentials: {
        administratieId: "adm-1",
        __hasStoredSecrets: true,
      },
    },
  }),
  useSaveIntegrationCredentials: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({ tenant: { id: "tenant-1" } }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ConnectorDetail } from "@/components/settings/ConnectorDetail";

function renderConnector() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ConnectorDetail slug="snelstart" onBack={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe("ConnectorDetail security regressions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not prefill stored connector secrets into password inputs", () => {
    renderConnector();

    const clientKeyInput = screen.getByLabelText("Client Key") as HTMLInputElement;
    const subscriptionKeyInput = screen.getByLabelText("Subscription Key") as HTMLInputElement;

    expect(clientKeyInput.value).toBe("");
    expect(subscriptionKeyInput.value).toBe("");
    expect(screen.getByLabelText("Administratie ID")).toHaveValue("adm-1");
  });
});
