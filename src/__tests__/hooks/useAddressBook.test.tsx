import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFrom, mockRpc, mockTenant } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
  mockTenant: { id: "tenant-1", name: "Test tenant" },
}));

vi.mock("@/contexts/TenantContext", () => ({
  useTenantOptional: () => ({ tenant: mockTenant }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: mockFrom,
    rpc: mockRpc,
  },
}));

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

import { useUpsertAddressBookEntry } from "@/hooks/useAddressBook";

describe("useUpsertAddressBookEntry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({
      data: {
        action: "updated",
        matched_name: "Royalty Cargo Solutions B.V.",
        message: "Royalty Cargo Solutions B.V. bestond al op dit adres en is bijgewerkt.",
        row: {
          id: "address-1",
          tenant_id: "tenant-1",
          label: "Royalty Cargo Solutions B.V.",
          company_name: "Royalty Cargo Solutions B.V.",
          address: "Bijlmermeerstraat 28, 2131 HG Hoofddorp",
          normalized_company_key: "royalty cargo solutions",
          normalized_key: "NL|2131hg|hoofddorp|bijlmermeerstraat|28|",
        },
      },
      error: null,
    });
  });

  it("gebruikt de RPC-upsert zodat duplicate matching niet client-side op 25 rijen wordt begrensd", async () => {
    const { result } = renderHook(() => useUpsertAddressBookEntry(), { wrapper: createWrapper() });

    await result.current.mutateAsync({
      label: "Royalty Cargo Solutions BV",
      company_name: "Royalty Cargo Solutions BV",
      street: "Bijlmermeerstraat",
      house_number: "28",
      zipcode: "2131 HG",
      city: "Hoofddorp",
      country: "NL",
      location_type: "both",
    });

    await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(1));
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRpc).toHaveBeenCalledWith(
      "upsert_address_book_entry",
      expect.objectContaining({
        p_entry: expect.objectContaining({
          tenant_id: "tenant-1",
          normalized_company_key: "royalty cargo solutions",
          normalized_key: "NL|2131hg|hoofddorp|bijlmermeerstraat|28|",
        }),
      }),
    );
  });
});
