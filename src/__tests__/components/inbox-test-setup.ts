import { vi } from "vitest";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

// ─── Global Mocks ────────────────────────────────────────────
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }) },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(), insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(), delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: null }),
      ilike: vi.fn().mockReturnThis(), or: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
    channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }) }),
    removeChannel: vi.fn(),
  },
}));

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({ tenant: { id: "t1", name: "Test" }, loading: false }),
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: any) => React.createElement("div", props, children),
    span: ({ children, ...props }: any) => React.createElement("span", props, children),
  },
  AnimatePresence: ({ children }: any) => children,
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

vi.mock("@/components/inbox/utils", () => ({
  formatDate: (d: string) => "1 jan",
  getDeadlineInfo: (d: string) => ({ urgency: "green", label: "OK" }),
  getFilledCount: () => 4,
  getTotalFields: () => 8,
  getRequiredFilledCount: () => 3,
  getFormErrors: () => null,
  computeFieldConfidence: () => 50,
  isAddressIncomplete: () => false,
  isValidAddress: () => true,
  getAddressError: () => null,
  ALL_FIELDS: [
    { key: "pickupAddress", confKey: "pickup_address", label: "Ophaaladres", required: true },
    { key: "deliveryAddress", confKey: "delivery_address", label: "Afleveradres", required: true },
    { key: "quantity", confKey: "quantity", label: "Aantal", required: true },
    { key: "weight", confKey: "weight_kg", label: "Gewicht", required: true },
    { key: "unit", confKey: "unit", label: "Eenheid", required: false },
    { key: "transportType", confKey: "transport_type", label: "Type", required: false },
    { key: "dimensions", confKey: "dimensions", label: "Afmetingen", required: false },
    { key: "clientName", confKey: "client_name", label: "Klantnaam", required: false },
  ],
}));

vi.mock("@/lib/statusColors", () => ({
  getStatusColor: () => ({ bg: "bg-gray-100", text: "text-gray-600", label: "Status" }),
}));

vi.mock("@/hooks/useCapacityMatch", () => ({
  useCapacityMatch: () => [],
}));

vi.mock("@/components/AddressAutocomplete", () => ({
  AddressAutocomplete: ({ value, onChange, placeholder, className }: any) =>
    React.createElement("input", {
      value: value || "",
      onChange: (e: any) => onChange(e.target.value),
      placeholder,
      className,
      "data-testid": "address-autocomplete",
    }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

// ─── Helpers & Fixtures ──────────────────────────────────────
export function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

export function QWrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(
    QueryClientProvider,
    { client: createQueryClient() },
    React.createElement(MemoryRouter, null, children)
  );
}

export const baseDraft = {
  id: "d1",
  order_number: 1001,
  status: "DRAFT",
  source_email_from: "klant@example.nl",
  source_email_subject: "Transport aanvraag 2 pallets",
  source_email_body: "Graag 2 pallets ophalen in Amsterdam",
  confidence_score: 85,
  transport_type: "direct",
  pickup_address: "Amsterdam",
  delivery_address: "Rotterdam",
  quantity: 2,
  unit: "Pallets",
  weight_kg: 500,
  is_weight_per_unit: false,
  dimensions: null,
  requirements: [],
  client_name: "ACME Corp",
  received_at: new Date(Date.now() - 3600000).toISOString(),
  created_at: new Date().toISOString(),
  attachments: null,
  pickup_time_from: null,
  pickup_time_to: null,
  delivery_time_from: null,
  delivery_time_to: null,
  internal_note: null,
  missing_fields: null,
  follow_up_draft: null,
  follow_up_sent_at: null,
  thread_type: "new",
  parent_order_id: null,
  changes_detected: null,
  anomalies: null,
  field_confidence: null,
  tenant_id: "t1",
};

export const baseForm = {
  transportType: "direct",
  pickupAddress: "Amsterdam",
  deliveryAddress: "Rotterdam",
  quantity: 2,
  unit: "Pallets",
  weight: "500",
  dimensions: "",
  requirements: [],
  perUnit: false,
  internalNote: "",
  fieldSources: {},
  fieldConfidence: {},
};
