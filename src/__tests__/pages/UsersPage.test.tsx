import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
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

const activity = [
  {
    id: "activity-1",
    user_id: "user-1",
    action: "user.role_updated",
    changes: { from: "medewerker", to: "admin" },
    created_at: "2026-04-23T14:32:00Z",
  },
  {
    id: "activity-2",
    user_id: "user-1",
    action: "user.invited",
    changes: { email: "regular@test.nl" },
    created_at: "2026-04-18T11:08:00Z",
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
    if (options.body?.action === "list_activity") {
      return Promise.resolve({ data: { activity }, error: null });
    }
    return Promise.resolve({ data: { ok: true }, error: null });
  });
}

function renderUsersPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <UsersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function expectTextVisible(text: string) {
  expect(screen.getAllByText(text).length).toBeGreaterThan(0);
}

function expectTextAbsent(text: string) {
  expect(screen.queryAllByText(text)).toHaveLength(0);
}

describe("UsersPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });
  afterEach(() => cleanup());

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
      expectTextVisible("Admin User");
      expectTextVisible("Regular User");
      expectTextVisible("regular@test.nl");
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
      expectTextVisible("Regular User");
    });

    fireEvent.click(screen.getAllByRole("button", { name: /Bewerken/i })[1]);

    await waitFor(() => {
      expect(screen.getByText("Gebruiker configureren")).toBeInTheDocument();
    });
    expect(screen.getByText("Account status")).toBeInTheDocument();
    expect(screen.getByText("Snelle acties")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Toegang" }));
    expect(screen.getByText("Toegangsrechten")).toBeInTheDocument();
    expect(screen.getByText("Dispatch")).toBeInTheDocument();
    expect(screen.getByText("Override (afwijking van rol)")).toBeInTheDocument();
    expect(screen.getAllByText("Beperkt").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText("Tarieven"));
    expect(screen.getByText("Beperkt geselecteerd")).toBeInTheDocument();
    expect(screen.getByText("Mag tarieven bekijken")).toBeInTheDocument();
    expect(screen.getByText("Mag tarieven niet bewerken")).toBeInTheDocument();
    expect(screen.getByText("Mag tarieven niet verwijderen")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Profiel" }));
    fireEvent.click(screen.getByRole("button", { name: "Bewerken" }));
    expect(screen.getByLabelText("Weergavenaam")).toHaveValue("Regular User");
    fireEvent.click(screen.getByRole("button", { name: "Activiteit" }));
    expect(screen.getByText("Overzicht van belangrijke acties en wijzigingen.")).toBeInTheDocument();
    expect(screen.getByText("Rol gewijzigd")).toBeInTheDocument();
    expect(screen.getByText("Rol gewijzigd van medewerker naar admin")).toBeInTheDocument();
    expect(screen.getByText("Gebruiker uitgenodigd")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    fireEvent.click(screen.getByRole("button", { name: "Uitnodigingen" }));
    expect(screen.queryByText("Rol gewijzigd")).not.toBeInTheDocument();
    expect(screen.getByText("Gebruiker uitgenodigd")).toBeInTheDocument();
  }, 15_000);

  it("shows admin impact feedback in the configuration sheet", async () => {
    renderUsersPage();
    await waitFor(() => {
      expectTextVisible("Regular User");
    });

    fireEvent.click(screen.getAllByRole("button", { name: /Bewerken/i })[1]);
    await waitFor(() => {
      expect(screen.getByText("Gebruiker configureren")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Toegang" }));
    fireEvent.click(screen.getByRole("button", { name: /Admin/i }));

    expect(screen.getByText("Volledige controle")).toBeInTheDocument();
    expect(screen.getByText("Met deze rol")).toBeInTheDocument();
    expect(screen.getByText("Tarieven aanpassen")).toBeInTheDocument();
    expect(screen.getByText("Gebruikers beheren")).toBeInTheDocument();
  }, 10_000);

  it("shows table headers", async () => {
    renderUsersPage();
    await waitFor(() => {
      expect(screen.getByText("Gebruiker")).toBeInTheDocument();
      expect(screen.getByText("Rol")).toBeInTheDocument();
      expect(screen.getByText("Status")).toBeInTheDocument();
      expect(screen.getByText("Acties")).toBeInTheDocument();
    });
  });

  it("filters users by email", async () => {
    renderUsersPage();
    await waitFor(() => {
      expectTextVisible("Regular User");
    });

    await userEvent.type(screen.getByPlaceholderText("Zoek op naam, e-mail of rol"), "regular@test.nl");

    expectTextAbsent("Admin User");
    expectTextVisible("Regular User");
  });

  it("filters users by status from the filter button", async () => {
    renderUsersPage();
    await waitFor(() => {
      expectTextVisible("Admin User");
      expectTextVisible("Regular User");
    });

    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    await userEvent.click(screen.getByRole("button", { name: "Inactief" }));

    expectTextAbsent("Admin User");
    expectTextVisible("Regular User");

    await userEvent.click(screen.getByRole("button", { name: "Actief" }));

    expectTextVisible("Admin User");
    expectTextAbsent("Regular User");
  });

  it("connects security action buttons to real user management actions", async () => {
    renderUsersPage();
    await waitFor(() => {
      expectTextVisible("Regular User");
    });

    await userEvent.click(screen.getAllByRole("button", { name: /Bewerken/i })[1]);
    await userEvent.click(screen.getByRole("button", { name: "Beveiliging" }));

    expect(screen.getByText("Actie vereist")).toBeInTheDocument();
    expect(screen.getByText("Two-factor authenticatie (2FA)")).toBeInTheDocument();
    expect(screen.getByText("Aanbeveling")).toBeInTheDocument();
    expect(screen.getByText("Actieve sessies")).toBeInTheDocument();
    expect(screen.getByText("Inlogbeveiliging")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "2FA verplichten" }));
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("admin-users", expect.objectContaining({
        body: expect.objectContaining({
          action: "update_security",
          tenant_id: "tenant-1",
          user_id: "user-2",
          security_patch: expect.objectContaining({ extra_security_enabled: true }),
        }),
      }));
    });

    await userEvent.click(screen.getByRole("button", { name: "Alle andere sessies beëindigen" }));
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("admin-users", expect.objectContaining({
        body: expect.objectContaining({
          action: "revoke_sessions",
          tenant_id: "tenant-1",
          user_id: "user-2",
        }),
      }));
    });

    await userEvent.click(screen.getByRole("button", { name: "Reset wachtwoord" }));
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("admin-users", expect.objectContaining({
        body: expect.objectContaining({
          action: "reset_password",
          tenant_id: "tenant-1",
          user_id: "user-2",
        }),
      }));
    });

    await userEvent.click(screen.getByRole("button", { name: "Deactiveer" }));
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("admin-users", expect.objectContaining({
        body: expect.objectContaining({
          action: "deactivate_user",
          tenant_id: "tenant-1",
          user_id: "user-2",
        }),
      }));
    });
  });

  it("opens all activity from the security tab", async () => {
    renderUsersPage();
    await waitFor(() => {
      expectTextVisible("Regular User");
    });

    await userEvent.click(screen.getAllByRole("button", { name: /Bewerken/i })[1]);
    await userEvent.click(screen.getByRole("button", { name: "Beveiliging" }));
    await userEvent.click(screen.getByRole("button", { name: "Bekijk alles" }));

    expect(screen.getByText("Overzicht van belangrijke acties en wijzigingen.")).toBeInTheDocument();
    expect(screen.getByText("Rol gewijzigd")).toBeInTheDocument();
    expect(screen.getByText("Gebruiker uitgenodigd")).toBeInTheDocument();
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
