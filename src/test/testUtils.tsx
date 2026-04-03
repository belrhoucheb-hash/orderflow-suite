import { render, type RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { vi } from "vitest";
import type { ReactElement, ReactNode } from "react";

// Shared mock for supabase
export const mockSupabase = {
  auth: {
    getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
    signUp: vi.fn().mockResolvedValue({ data: {}, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    signInWithOAuth: vi.fn().mockResolvedValue({ data: {}, error: null }),
    resetPasswordForEmail: vi.fn().mockResolvedValue({ data: {}, error: null }),
  },
  from: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    then: vi.fn().mockResolvedValue({ data: [], error: null }),
  }),
  channel: vi.fn().mockReturnValue({
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
  }),
  removeChannel: vi.fn(),
  storage: {
    from: vi.fn().mockReturnValue({
      upload: vi.fn().mockResolvedValue({ data: { path: "test.png" }, error: null }),
      getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "https://test.com/test.png" } }),
      download: vi.fn().mockResolvedValue({ data: new Blob(), error: null }),
    }),
  },
};

// Mock the supabase client module
vi.mock("@/integrations/supabase/client", () => ({
  supabase: mockSupabase,
}));

// Create a fresh query client for each test
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

// Wrapper with all providers
export function createWrapper(queryClient?: QueryClient) {
  const qc = queryClient ?? createTestQueryClient();
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <BrowserRouter>{children}</BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    );
  };
}

// Custom render with providers
export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper"> & { queryClient?: QueryClient }
) {
  const { queryClient, ...renderOptions } = options ?? {};
  return render(ui, { wrapper: createWrapper(queryClient), ...renderOptions });
}

// Mock data factories
export const mockOrder = (overrides = {}) => ({
  id: "order-1",
  tenant_id: "tenant-1",
  order_number: "ORD-001",
  status: "nieuw",
  client_id: "client-1",
  client_name: "Test Klant",
  pickup_address: "Amsterdam",
  delivery_address: "Rotterdam",
  pickup_date: "2026-04-01",
  delivery_date: "2026-04-02",
  cargo_description: "Test cargo",
  weight_kg: 1000,
  volume_m3: 10,
  price: 500,
  notes: "",
  created_at: "2026-04-01T00:00:00Z",
  updated_at: "2026-04-01T00:00:00Z",
  ...overrides,
});

export const mockInvoice = (overrides = {}) => ({
  id: "invoice-1",
  tenant_id: "tenant-1",
  invoice_number: "FAC-2026-001",
  client_id: "client-1",
  client_name: "Test Klant",
  client_address: "Teststraat 1, Amsterdam",
  client_btw_number: "NL123456789B01",
  client_kvk_number: "12345678",
  invoice_date: "2026-04-01",
  due_date: "2026-05-01",
  status: "concept",
  subtotal: 1000,
  btw_percentage: 21,
  btw_amount: 210,
  total: 1210,
  notes: "",
  invoice_lines: [],
  created_at: "2026-04-01T00:00:00Z",
  ...overrides,
});

export const mockClient = (overrides = {}) => ({
  id: "client-1",
  tenant_id: "tenant-1",
  name: "Test Klant BV",
  email: "info@testklant.nl",
  phone: "020-1234567",
  address: "Teststraat 1, Amsterdam",
  btw_number: "NL123456789B01",
  kvk_number: "12345678",
  contact_person: "Jan Jansen",
  created_at: "2026-04-01T00:00:00Z",
  ...overrides,
});

export const mockDriver = (overrides = {}) => ({
  id: "driver-1",
  tenant_id: "tenant-1",
  name: "Piet de Vries",
  phone: "06-12345678",
  email: "piet@test.nl",
  license_number: "1234567890",
  license_expiry: "2028-01-01",
  status: "beschikbaar",
  created_at: "2026-04-01T00:00:00Z",
  ...overrides,
});

export const mockVehicle = (overrides = {}) => ({
  id: "vehicle-1",
  tenant_id: "tenant-1",
  license_plate: "AB-123-CD",
  type: "vrachtwagen",
  brand: "DAF",
  model: "XF",
  year: 2023,
  status: "beschikbaar",
  max_weight_kg: 20000,
  max_volume_m3: 80,
  created_at: "2026-04-01T00:00:00Z",
  ...overrides,
});

export const mockUser = (overrides = {}) => ({
  id: "user-1",
  email: "test@test.nl",
  app_metadata: {},
  user_metadata: { display_name: "Test User" },
  aud: "authenticated",
  created_at: "2026-04-01T00:00:00Z",
  ...overrides,
});

export const mockSession = (overrides = {}) => ({
  access_token: "mock-token",
  refresh_token: "mock-refresh",
  expires_in: 3600,
  token_type: "bearer",
  user: mockUser(),
  ...overrides,
});
