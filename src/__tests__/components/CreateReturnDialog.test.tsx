import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

// ─── Supabase mock ────────────────────────────────────────────
const { mockSupabase } = vi.hoisted(() => {
  const mockSupabase = {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: vi.fn().mockImplementation((cb: any) => cb({ data: [], error: null })),
    }),
    channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() }),
    removeChannel: vi.fn(),
  };
  return { mockSupabase };
});
vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

import { CreateReturnDialog } from "@/components/orders/CreateReturnDialog";

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("CreateReturnDialog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the trigger button", () => {
    renderWithProviders(
      <CreateReturnDialog
        parentOrderId="order-1"
        parentOrderNumber="RCS-2026-0001"
      />
    );
    expect(screen.getByRole("button", { name: /retour aanmaken/i })).toBeInTheDocument();
  });

  it("opens dialog on button click", async () => {
    renderWithProviders(
      <CreateReturnDialog
        parentOrderId="order-1"
        parentOrderNumber="RCS-2026-0001"
        pickupAddress="Straat 1, Amsterdam"
        deliveryAddress="Laan 2, Rotterdam"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /retour aanmaken/i }));

    await waitFor(() => {
      expect(screen.getByText(/maak een retourorder aan voor/i)).toBeInTheDocument();
    });
  });

  it("shows reversed addresses in dialog", async () => {
    renderWithProviders(
      <CreateReturnDialog
        parentOrderId="order-1"
        parentOrderNumber="RCS-2026-0001"
        pickupAddress="Straat 1, Amsterdam"
        deliveryAddress="Laan 2, Rotterdam"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /retour aanmaken/i }));

    await waitFor(() => {
      // Delivery becomes pickup in the return dialog
      expect(screen.getByText(/laan 2, rotterdam/i)).toBeInTheDocument();
      // Pickup becomes delivery
      expect(screen.getByText(/straat 1, amsterdam/i)).toBeInTheDocument();
    });
  });

  it("shows return reason selector", async () => {
    renderWithProviders(
      <CreateReturnDialog
        parentOrderId="order-1"
        parentOrderNumber="RCS-2026-0001"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /retour aanmaken/i }));

    await waitFor(() => {
      expect(screen.getByText("Reden retour *")).toBeInTheDocument();
    });
  });

  it("closes dialog when Annuleren is clicked", async () => {
    renderWithProviders(
      <CreateReturnDialog
        parentOrderId="order-1"
        parentOrderNumber="RCS-2026-0001"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /retour aanmaken/i }));
    await waitFor(() => expect(screen.getByText(/maak een retourorder aan voor/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /annuleren/i }));
    await waitFor(() => {
      expect(screen.queryByText(/maak een retourorder aan voor/i)).not.toBeInTheDocument();
    });
  });
});
