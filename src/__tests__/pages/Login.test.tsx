import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

// ── Hoisted mocks ───────────────────────────────────────────────────
const { mockNavigate, mockSupabase } = vi.hoisted(() => {
  const mockNavigate = vi.fn();
  const mockSupabase = {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signInWithOAuth: vi.fn(),
      signOut: vi.fn(),
      resetPasswordForEmail: vi.fn(),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
    channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }) }),
    removeChannel: vi.fn(),
  };
  return { mockNavigate, mockSupabase };
});

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<any>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({ tenant: { id: "t1", name: "Test BV", slug: "test", logoUrl: null, primaryColor: "#dc2626" }, loading: false }),
  TenantProvider: ({ children }: any) => children,
}));

vi.mock("@/lib/companyConfig", () => ({
  DEFAULT_COMPANY: { name: "OrderFlow Suite" },
}));

import Login from "@/pages/Login";

function renderLogin() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>
  );
}

describe("Login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    renderLogin();
    expect(screen.getByText("Test BV")).toBeInTheDocument();
    expect(screen.getByText("TMS Platform")).toBeInTheDocument();
  });

  it("shows login tab by default with email and password fields", () => {
    renderLogin();
    expect(screen.getByLabelText("E-mailadres")).toBeInTheDocument();
    expect(screen.getByLabelText("Wachtwoord")).toBeInTheDocument();
    // Both the tab button and submit button say "Inloggen"
    const loginButtons = screen.getAllByText("Inloggen");
    expect(loginButtons.length).toBeGreaterThanOrEqual(2);
  });

  it("switches to register tab", async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.click(screen.getByText("Registreren"));
    expect(screen.getByLabelText("Volledige naam")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Account aanmaken" })).toBeInTheDocument();
  });

  it("toggles password visibility", async () => {
    const user = userEvent.setup();
    renderLogin();
    const passwordInput = screen.getByLabelText("Wachtwoord");
    expect(passwordInput).toHaveAttribute("type", "password");
    const toggleButtons = screen.getAllByRole("button").filter(b => !b.textContent);
    const toggleBtn = toggleButtons[0];
    await user.click(toggleBtn);
    expect(passwordInput).toHaveAttribute("type", "text");
  });

  it("handles successful login and navigates", async () => {
    mockSupabase.auth.signInWithPassword.mockResolvedValueOnce({ error: null });
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText("E-mailadres"), "test@test.nl");
    await user.type(screen.getByLabelText("Wachtwoord"), "password123");
    const submitBtn = document.querySelector("form button[type='submit']") as HTMLElement;
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: "test@test.nl",
        password: "password123",
      });
    });
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });
  });

  it("shows error on failed login", async () => {
    mockSupabase.auth.signInWithPassword.mockResolvedValueOnce({ error: { message: "Invalid login" } });
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText("E-mailadres"), "bad@test.nl");
    await user.type(screen.getByLabelText("Wachtwoord"), "wrong");
    const submitBtn = document.querySelector("form button[type='submit']") as HTMLElement;
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText("Ongeldig e-mailadres of wachtwoord")).toBeInTheDocument();
    });
  });

  it("handles successful registration", async () => {
    mockSupabase.auth.signUp.mockResolvedValueOnce({ error: null });
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByText("Registreren"));
    await user.type(screen.getByLabelText("Volledige naam"), "Jan de Vries");
    await user.type(screen.getByLabelText("E-mailadres"), "jan@test.nl");
    await user.type(screen.getByLabelText("Wachtwoord"), "geheim123");
    await user.click(screen.getByRole("button", { name: "Account aanmaken" }));

    await waitFor(() => {
      expect(mockSupabase.auth.signUp).toHaveBeenCalledWith({
        email: "jan@test.nl",
        password: "geheim123",
        options: { data: { display_name: "Jan de Vries" } },
      });
    });
    await waitFor(() => {
      expect(screen.getByText(/Account aangemaakt/)).toBeInTheDocument();
    });
  });

  it("validates short password on register", async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByText("Registreren"));
    await user.type(screen.getByLabelText("Volledige naam"), "Test");
    await user.type(screen.getByLabelText("E-mailadres"), "test@test.nl");
    await user.type(screen.getByLabelText("Wachtwoord"), "abc");
    await user.click(screen.getByRole("button", { name: "Account aanmaken" }));

    await waitFor(() => {
      expect(screen.getByText("Wachtwoord moet minimaal 6 tekens zijn")).toBeInTheDocument();
    });
    expect(mockSupabase.auth.signUp).not.toHaveBeenCalled();
  });

  it("shows forgot password form and sends reset email", async () => {
    mockSupabase.auth.resetPasswordForEmail.mockResolvedValueOnce({ error: null });
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByText("Wachtwoord vergeten?"));
    expect(screen.getByText("Wachtwoord resetten")).toBeInTheDocument();

    await user.type(screen.getByLabelText("E-mailadres"), "test@test.nl");
    const resetSubmit = document.querySelector("form button[type='submit']") as HTMLElement;
    await user.click(resetSubmit);

    await waitFor(() => {
      expect(mockSupabase.auth.resetPasswordForEmail).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getAllByText(/Reset link verstuurd/).length).toBeGreaterThanOrEqual(1);
    });
  });

  it("navigates back from forgot password", async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByText("Wachtwoord vergeten?"));
    await user.click(screen.getByText("Terug naar inloggen"));

    // Both tab button and submit button say "Inloggen"
    const loginBtns = screen.getAllByText("Inloggen");
    expect(loginBtns.length).toBeGreaterThanOrEqual(2);
  });

  it("calls Google OAuth on Google button click", async () => {
    mockSupabase.auth.signInWithOAuth.mockResolvedValueOnce({ error: null });
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByText("Inloggen met Google"));
    expect(mockSupabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: expect.any(String) },
    });
  });

  it("handles duplicate email on registration", async () => {
    mockSupabase.auth.signUp.mockResolvedValueOnce({ error: { message: "User already registered" } });
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByText("Registreren"));
    await user.type(screen.getByLabelText("Volledige naam"), "Test");
    await user.type(screen.getByLabelText("E-mailadres"), "existing@test.nl");
    await user.type(screen.getByLabelText("Wachtwoord"), "geheim123");
    await user.click(screen.getByRole("button", { name: "Account aanmaken" }));

    await waitFor(() => {
      expect(screen.getByText("Dit e-mailadres is al geregistreerd")).toBeInTheDocument();
    });
  });
});
