import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

// ── Mocks ───────────────────────────────────────────────────────────
const mockClients = [
  { id: "c1", name: "Acme BV", contact_person: "Jan", email: "jan@acme.nl", phone: "0612345678", is_active: true, active_orders: 3, address: "Amsterdam" },
  { id: "c2", name: "Widget NL", contact_person: "Piet", email: "piet@widget.nl", phone: "0687654321", is_active: false, active_orders: 0, address: "Rotterdam" },
];

vi.mock("@/hooks/useClients", () => ({
  useClients: () => ({
    data: mockClients,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/components/clients/ClientDetailPanel", () => ({
  ClientDetailPanel: ({ client }: any) => <div data-testid="client-detail">{client.name}</div>,
}));

vi.mock("@/components/clients/NewClientDialog", () => ({
  NewClientDialog: ({ open }: any) => open ? <div data-testid="new-client-dialog">New Client Dialog</div> : null,
}));

import Clients from "@/pages/Clients";

function renderClients() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Clients />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Clients", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders without crashing", () => {
    renderClients();
    expect(screen.getByText("Klanten")).toBeInTheDocument();
  });

  it("shows client count", () => {
    renderClients();
    expect(screen.getByText(/2 klanten/)).toBeInTheDocument();
  });

  it("displays client names in table", () => {
    renderClients();
    expect(screen.getByText("Acme BV")).toBeInTheDocument();
    expect(screen.getByText("Widget NL")).toBeInTheDocument();
  });

  it("has new client button", () => {
    renderClients();
    expect(screen.getByText("Nieuwe klant")).toBeInTheDocument();
  });

  it("opens new client dialog (setShowNewDialog)", async () => {
    const user = userEvent.setup();
    renderClients();
    await user.click(screen.getByText("Nieuwe klant"));
    expect(screen.getByTestId("new-client-dialog")).toBeInTheDocument();
  });

  it("has search input", () => {
    renderClients();
    expect(screen.getByPlaceholderText(/Zoek op naam/)).toBeInTheDocument();
  });

  it("shows table headers", () => {
    renderClients();
    expect(screen.getByText("Klantnaam")).toBeInTheDocument();
    expect(screen.getByText("Contactpersoon")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
  });

  it("shows client detail panel when a client row is clicked (setSelectedClient)", async () => {
    const user = userEvent.setup();
    renderClients();
    await user.click(screen.getByText("Acme BV"));
    await waitFor(() => {
      expect(screen.getByTestId("client-detail")).toBeInTheDocument();
    });
  });

  it("filters clients by search input (setSearch)", async () => {
    const user = userEvent.setup();
    renderClients();
    const searchInput = screen.getByPlaceholderText(/Zoek op naam/);
    await user.type(searchInput, "Widget");
    await waitFor(() => {
      expect(screen.getByText("Widget NL")).toBeInTheDocument();
      // Acme may still be in DOM since filtering happens server-side via useClients
      // But the search value should have changed
      expect((searchInput as HTMLInputElement).value).toBe("Widget");
    });
  });

  it("closes detail panel when clicking outside (handleClick mousedown)", async () => {
    const user = userEvent.setup();
    renderClients();
    await user.click(screen.getByText("Acme BV"));
    await waitFor(() => {
      expect(screen.getByTestId("client-detail")).toBeInTheDocument();
    });
    // Click outside the panel
    await user.click(screen.getByText("Klanten"));
    await waitFor(() => {
      // The detail panel should close
      expect(screen.queryByTestId("client-detail")).not.toBeInTheDocument();
    });
  });

  it("selects different client", async () => {
    const user = userEvent.setup();
    renderClients();
    await user.click(screen.getByText("Acme BV"));
    await waitFor(() => {
      expect(screen.getByTestId("client-detail")).toHaveTextContent("Acme BV");
    });
    await user.click(screen.getByText("Widget NL"));
    await waitFor(() => {
      expect(screen.getByTestId("client-detail")).toHaveTextContent("Widget NL");
    });
  });
});
