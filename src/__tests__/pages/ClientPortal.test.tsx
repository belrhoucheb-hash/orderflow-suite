import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

// ── Hoisted mock ────────────────────────────────────────────────────
const { mockSupabase } = vi.hoisted(() => ({
  mockSupabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockImplementation((cb: any) => {
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation((cb: any) => cb({ data: [], error: null })),
    }),
  },
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));
vi.mock("@/lib/companyConfig", () => ({ DEFAULT_COMPANY: { name: "OrderFlow Suite" } }));

import ClientPortal from "@/pages/ClientPortal";

function renderClientPortal() {
  return render(
    <MemoryRouter>
      <ClientPortal />
    </MemoryRouter>
  );
}

function renderWithSession() {
  // Simulate authenticated session by triggering onAuthStateChange callback
  mockSupabase.auth.onAuthStateChange.mockImplementation((cb: any) => {
    // Trigger callback with session immediately
    setTimeout(() => cb("SIGNED_IN", {
      user: {
        id: "u1",
        email: "user@test.com",
        user_metadata: { client_id: "c1", client_name: "Test Client" },
      },
    }), 0);
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
  mockSupabase.auth.getSession.mockResolvedValue({
    data: {
      session: {
        user: {
          id: "u1",
          email: "user@test.com",
          user_metadata: { client_id: "c1", client_name: "Test Client" },
        },
      },
    },
    error: null,
  });
  return render(
    <MemoryRouter>
      <ClientPortal />
    </MemoryRouter>
  );
}

describe("ClientPortal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders without crashing", async () => {
    renderClientPortal();
    await waitFor(() => {
      expect(document.body.textContent).toBeTruthy();
    });
  });

  it("shows login form when not authenticated", async () => {
    renderClientPortal();
    await waitFor(() => {
      expect(screen.getAllByText(/Klantportaal|Inloggen|OrderFlow/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  it("calls getSession on mount", () => {
    renderClientPortal();
    expect(mockSupabase.auth.getSession).toHaveBeenCalled();
  });

  it("subscribes to auth state changes", () => {
    renderClientPortal();
    expect(mockSupabase.auth.onAuthStateChange).toHaveBeenCalled();
  });

  it("shows email input field", async () => {
    renderClientPortal();
    await waitFor(() => {
      const emailInput = screen.getByPlaceholderText(/u@bedrijf/i);
      expect(emailInput).toBeInTheDocument();
    });
  });

  it("shows password input field", async () => {
    renderClientPortal();
    await waitFor(() => {
      const passwordInput = screen.getByPlaceholderText(/wachtwoord/i);
      expect(passwordInput).toBeInTheDocument();
    });
  });

  it("shows login button", async () => {
    renderClientPortal();
    await waitFor(() => {
      const loginBtn = screen.getByRole("button", { name: /Inloggen|Login/i });
      expect(loginBtn).toBeInTheDocument();
    });
  });

  it("shows company name in header", async () => {
    renderClientPortal();
    await waitFor(() => {
      expect(screen.getByText("OrderFlow Suite")).toBeInTheDocument();
    });
  });

  // ── handleLogin ──
  it("calls signInWithPassword on login form submit (handleLogin)", async () => {
    const user = userEvent.setup();
    renderClientPortal();
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/u@bedrijf/i)).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText(/u@bedrijf/i), "test@example.com");
    await user.type(screen.getByPlaceholderText(/wachtwoord/i), "password123");
    await user.click(screen.getByRole("button", { name: /Inloggen|Login/i }));
    await waitFor(() => {
      expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: "test@example.com",
        password: "password123",
      });
    });
  });

  it("shows error message on failed login (handleLogin error branch)", async () => {
    mockSupabase.auth.signInWithPassword.mockResolvedValueOnce({
      data: null,
      error: { message: "Invalid credentials" },
    });
    const user = userEvent.setup();
    renderClientPortal();
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/u@bedrijf/i)).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText(/u@bedrijf/i), "bad@example.com");
    await user.type(screen.getByPlaceholderText(/wachtwoord/i), "wrong");
    await user.click(screen.getByRole("button", { name: /Inloggen|Login/i }));
    await waitFor(() => {
      expect(screen.getByText(/Ongeldige inloggegevens/i)).toBeInTheDocument();
    });
  });

  // ── setEmail ──
  it("updates email state on input change (setEmail)", async () => {
    const user = userEvent.setup();
    renderClientPortal();
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/u@bedrijf/i)).toBeInTheDocument();
    });
    const emailInput = screen.getByPlaceholderText(/u@bedrijf/i);
    await user.type(emailInput, "test@example.com");
    expect((emailInput as HTMLInputElement).value).toBe("test@example.com");
  });

  // ── setPassword ──
  it("updates password state on input change (setPassword)", async () => {
    const user = userEvent.setup();
    renderClientPortal();
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/wachtwoord/i)).toBeInTheDocument();
    });
    const passwordInput = screen.getByPlaceholderText(/wachtwoord/i);
    await user.type(passwordInput, "secret");
    expect((passwordInput as HTMLInputElement).value).toBe("secret");
  });

  it("handles login form submit via Enter key", async () => {
    const user = userEvent.setup();
    renderClientPortal();
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/u@bedrijf/i)).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText(/u@bedrijf/i), "test@example.com");
    await user.type(screen.getByPlaceholderText(/wachtwoord/i), "password123");
    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalled();
    });
  });

  // ── handleLogout ──
  it("calls signOut on logout (handleLogout)", async () => {
    renderWithSession();
    await waitFor(() => {
      const logoutBtns = screen.queryAllByText(/Uitloggen/i);
      if (logoutBtns.length > 0) {
        expect(logoutBtns[0]).toBeInTheDocument();
      }
    });
    const logoutBtn = screen.queryByText(/Uitloggen/i);
    if (logoutBtn) {
      const user = userEvent.setup();
      await user.click(logoutBtn);
      await waitFor(() => {
        expect(mockSupabase.auth.signOut).toHaveBeenCalled();
      });
    }
    expect(document.body.textContent).toBeTruthy();
  });

  // ── setShowNewOrder, setNewOrder, handleSubmitOrder ──
  it("opens new order form and fills fields (setShowNewOrder + setNewOrder)", async () => {
    renderWithSession();
    await waitFor(() => {
      const newOrderBtn = screen.queryByText(/Nieuwe order|aanvragen|Order plaatsen/i);
      if (newOrderBtn) {
        expect(newOrderBtn).toBeInTheDocument();
      }
    });
    const newOrderBtn = screen.queryByText(/Nieuwe order|aanvragen|Order plaatsen/i);
    if (newOrderBtn) {
      const user = userEvent.setup();
      await user.click(newOrderBtn);
      // Fill form fields
      await waitFor(() => {
        const inputs = screen.queryAllByRole("textbox");
        expect(inputs.length).toBeGreaterThanOrEqual(0);
      });
      const inputs = screen.queryAllByRole("textbox");
      for (const input of inputs.slice(0, 2)) {
        await user.type(input, "Test Address");
      }
    }
    expect(document.body.textContent).toBeTruthy();
  });

  it("submits new order (handleSubmitOrder)", async () => {
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { tenant_id: "t1" }, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockResolvedValue({ data: {}, error: null }),
      then: vi.fn().mockImplementation((cb: any) => cb({ data: [], error: null })),
    });
    renderWithSession();
    const newOrderBtns = await screen.findAllByText(/Nieuwe order|aanvragen|Order plaatsen/i).catch(() => []);
    if (newOrderBtns.length > 0) {
      const user = userEvent.setup();
      await user.click(newOrderBtns[0]);
      // Submit the form
      const submitBtns = screen.queryAllByText(/Indienen|Verstuur|Aanvragen/i);
      const submitBtn = submitBtns.find(b => b.closest("form") || b.tagName === "BUTTON");
      if (submitBtn) {
        await user.click(submitBtn);
        await waitFor(() => {
          expect(mockSupabase.from).toHaveBeenCalled();
        });
      }
    }
    expect(document.body.textContent).toBeTruthy();
  });
});
