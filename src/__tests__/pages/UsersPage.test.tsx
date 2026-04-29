import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const mockInvoke = vi.fn();

const users = [
  {
    user_id: "user-1",
    display_name: "Admin User",
    avatar_url: null,
    created_at: "2025-01-01T00:00:00Z",
    email: "admin@test.nl",
    last_sign_in_at: "2025-01-10T00:00:00Z",
    roles: ["admin"],
  },
  {
    user_id: "user-2",
    display_name: "Regular User",
    avatar_url: null,
    created_at: "2025-01-05T00:00:00Z",
    email: "regular@test.nl",
    last_sign_in_at: null,
    roles: ["medewerker"],
  },
];

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    session: { user: { id: "user-1" } },
    user: { id: "user-1", email: "admin@test.nl" },
    profile: { display_name: "Admin User", avatar_url: null },
    roles: ["admin"],
    effectiveRole: "admin",
    isAdmin: true,
    loading: false,
    signOut: vi.fn(),
  }),
}));

vi.mock("@/contexts/TenantContext", () => ({
  useTenantOptional: () => ({ tenant: { id: "tenant-1" } }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: (...args: any[]) => mockInvoke(...args),
    },
  },
}));

vi.mock("framer-motion", async () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    tr: ({ children, ...props }: any) => <tr {...props}>{children}</tr>,
  },
}));

import UsersPage from "@/pages/UsersPage";

function setupDefaultMocks() {
  mockInvoke.mockImplementation((_functionName: string, options: { body?: any }) => {
    if (options.body?.action === "list") {
      return Promise.resolve({ data: { users }, error: null });
    }
    return Promise.resolve({ data: { ok: true }, error: null });
  });
}

function renderUsersPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("UsersPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it("renders without crashing", async () => {
    renderUsersPage();
    await waitFor(() => {
      expect(screen.getByText(/Gebruikers/i)).toBeInTheDocument();
    });
  });

  it("loads users through the admin-users function", async () => {
    renderUsersPage();
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("admin-users", expect.objectContaining({
        body: expect.objectContaining({ action: "list", tenant_id: "tenant-1" }),
      }));
    });
  });

  it("shows user list after loading", async () => {
    renderUsersPage();
    await waitFor(() => {
      expect(screen.getByText("Admin User")).toBeInTheDocument();
      expect(screen.getByText("Regular User")).toBeInTheDocument();
      expect(screen.getByText("regular@test.nl")).toBeInTheDocument();
    });
  });

  it("does not render the old KPI strip", async () => {
    renderUsersPage();
    await waitFor(() => {
      expect(screen.getByText("Gebruikersbeheer")).toBeInTheDocument();
    });
    expect(screen.queryByText("Totaal")).not.toBeInTheDocument();
  });

  it("shows role badges", async () => {
    renderUsersPage();
    await waitFor(() => {
      expect(screen.getAllByText("Admin").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Medewerker").length).toBeGreaterThan(0);
    });
  });

  it("opens user configuration from the table", async () => {
    renderUsersPage();
    await waitFor(() => {
      expect(screen.getByText("Regular User")).toBeInTheDocument();
    });

    await userEvent.click(screen.getAllByRole("button", { name: /Configureren/i })[1]);

    expect(screen.getByText("Gebruiker configureren")).toBeInTheDocument();
    expect(screen.getByLabelText("Weergavenaam")).toHaveValue("Regular User");
    expect(screen.getByText("Rechten voor Medewerker")).toBeInTheDocument();
    expect(screen.getByText("Gebruikers uitnodigen of rollen wijzigen")).toBeInTheDocument();
  });

  it("shows table headers", async () => {
    renderUsersPage();
    await waitFor(() => {
      expect(screen.getByText("Gebruiker")).toBeInTheDocument();
      expect(screen.getByText("Toegang")).toBeInTheDocument();
      expect(screen.getByText("Beheer")).toBeInTheDocument();
    });
  });

  it("filters users by email", async () => {
    renderUsersPage();
    await waitFor(() => {
      expect(screen.getByText("Regular User")).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText("Zoek op naam, e-mail of rol"), "regular@test.nl");

    expect(screen.queryByText("Admin User")).not.toBeInTheDocument();
    expect(screen.getByText("Regular User")).toBeInTheDocument();
  });

  it("invites a new user", async () => {
    renderUsersPage();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Uitnodigen/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /Uitnodigen/i }));
    await userEvent.type(screen.getByLabelText("Naam"), "Nieuwe Planner");
    await userEvent.type(screen.getByLabelText("E-mail"), "nieuw@test.nl");
    await userEvent.click(screen.getByRole("button", { name: /Versturen/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("admin-users", expect.objectContaining({
        body: expect.objectContaining({
          action: "invite",
          email: "nieuw@test.nl",
          display_name: "Nieuwe Planner",
          role: "medewerker",
          tenant_id: "tenant-1",
        }),
      }));
    });
  });
});
