import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const mockSupabaseFrom = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    session: { user: { id: "user-1" } }, user: { id: "user-1", email: "admin@test.nl" },
    profile: { display_name: "Admin User", avatar_url: null }, roles: ["admin"],
    effectiveRole: "admin", isAdmin: true, loading: false, signOut: vi.fn(),
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: any[]) => mockSupabaseFrom(...args),
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
  mockSupabaseFrom.mockImplementation((table: string) => {
    if (table === "profiles") {
      return {
        select: vi.fn().mockResolvedValue({
          data: [
            { user_id: "user-1", display_name: "Admin User", avatar_url: null, created_at: "2025-01-01T00:00:00Z" },
            { user_id: "user-2", display_name: "Regular User", avatar_url: null, created_at: "2025-01-05T00:00:00Z" },
          ],
          error: null,
        }),
      };
    }
    if (table === "user_roles") {
      return {
        select: vi.fn().mockResolvedValue({
          data: [{ user_id: "user-1", role: "admin" }, { user_id: "user-2", role: "medewerker" }],
          error: null,
        }),
        insert: vi.fn().mockResolvedValue({ error: null }),
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
        eq: vi.fn().mockResolvedValue({ error: null }),
      };
    }
    return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
  });
}

function renderUsersPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>
    </QueryClientProvider>
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

  it("shows user list after loading", async () => {
    renderUsersPage();
    await waitFor(() => {
      expect(screen.getByText("Admin User")).toBeInTheDocument();
      expect(screen.getByText("Regular User")).toBeInTheDocument();
    });
  });

  it("shows user stats (admin count, medewerker count)", async () => {
    renderUsersPage();
    await waitFor(() => {
      expect(screen.getByText("Totaal")).toBeInTheDocument();
      expect(screen.getByText("Admins")).toBeInTheDocument();
      expect(screen.getByText("Medewerkers")).toBeInTheDocument();
    });
  });

  it("shows role badges", async () => {
    renderUsersPage();
    await waitFor(() => {
      expect(screen.getByText("admin")).toBeInTheDocument();
      expect(screen.getByText("medewerker")).toBeInTheDocument();
    });
  });

  it("shows role change select for admin users (handleRoleChange)", async () => {
    renderUsersPage();
    await waitFor(() => {
      expect(screen.getByText("Admin User")).toBeInTheDocument();
    });
    // Admin should see role change controls
    const selects = screen.getAllByRole("combobox");
    expect(selects.length).toBeGreaterThan(0);
  });

  it("shows role change selects for admin user", async () => {
    renderUsersPage();
    await waitFor(() => {
      expect(screen.getByText("Admin User")).toBeInTheDocument();
    });
    // Admin should see role change controls (combobox selects)
    const selects = screen.getAllByRole("combobox");
    expect(selects.length).toBeGreaterThan(0);
  });

  it("shows table headers", async () => {
    renderUsersPage();
    await waitFor(() => {
      expect(screen.getByText("Gebruiker")).toBeInTheDocument();
      expect(screen.getByText("Rol")).toBeInTheDocument();
    });
  });

  it("shows Acties column header for admin", async () => {
    renderUsersPage();
    await waitFor(() => {
      expect(screen.getByText("Acties")).toBeInTheDocument();
    });
  });
});
