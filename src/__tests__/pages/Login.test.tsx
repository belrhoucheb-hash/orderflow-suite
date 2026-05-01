import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
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
      mfa: {
        getAuthenticatorAssuranceLevel: vi.fn(),
        listFactors: vi.fn(),
        challenge: vi.fn(),
        enroll: vi.fn(),
        verify: vi.fn(),
      },
    },
    rpc: vi.fn(),
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
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Login />
    </MemoryRouter>
  );
}

describe("Login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mockSupabase.rpc.mockResolvedValue({ data: null, error: null });
    mockSupabase.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal1" },
      error: null,
    });
    mockSupabase.auth.mfa.listFactors.mockResolvedValue({ data: { totp: [] }, error: null });
    mockSupabase.auth.mfa.challenge.mockResolvedValue({ data: { id: "challenge-1" }, error: null });
    mockSupabase.auth.mfa.enroll.mockResolvedValue({
      data: { id: "factor-new", totp: { qr_code: "data:image/svg+xml;base64,abc", secret: "SECRET" } },
      error: null,
    });
    mockSupabase.auth.mfa.verify.mockResolvedValue({ data: {}, error: null });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it("renders without crashing", () => {
    renderLogin();
    expect(screen.getByText("Welkom terug")).toBeInTheDocument();
    expect(screen.getByText(/Log in om verder te gaan met OrderFlow Suite/)).toBeInTheDocument();
  });

  it("shows private login with email and password fields", () => {
    renderLogin();
    expect(screen.getByLabelText("E-mailadres")).toBeInTheDocument();
    expect(screen.getByLabelText("Wachtwoord")).toBeInTheDocument();
    expect(screen.queryByText("Registreren")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Google" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Microsoft" })).not.toBeInTheDocument();
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

  it("requires authenticator verification when 2FA is enabled", async () => {
    mockSupabase.rpc.mockImplementation(async (name: string) => {
      if (name === "office_login_policy") {
        return {
          data: [{
            login_protection_enabled: true,
            max_login_attempts: 5,
            lockout_minutes: 15,
            requires_2fa: true,
            verification_method: "authenticator_app",
          }],
          error: null,
        };
      }
      return { data: null, error: null };
    });
    mockSupabase.auth.signInWithPassword.mockResolvedValueOnce({ error: null });
    mockSupabase.auth.mfa.listFactors.mockResolvedValueOnce({
      data: { totp: [{ id: "factor-1", status: "verified" }] },
      error: null,
    });
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText("E-mailadres"), "secure@test.nl");
    await user.type(screen.getByLabelText("Wachtwoord"), "password123");
    const submitBtn = document.querySelector("form button[type='submit']") as HTMLElement;
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText("2FA-code invoeren")).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("6-cijferige code"), "123456");
    await user.click(screen.getByRole("button", { name: "Bevestigen" }));

    await waitFor(() => {
      expect(mockSupabase.auth.mfa.verify).toHaveBeenCalledWith({
        factorId: "factor-1",
        challengeId: "challenge-1",
        code: "123456",
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

    expect(screen.getByRole("button", { name: "Inloggen" })).toBeInTheDocument();
  });
});
