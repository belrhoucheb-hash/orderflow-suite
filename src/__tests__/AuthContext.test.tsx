import { render, screen, waitFor, act } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import React, { ReactNode } from "react";

// ── Supabase mock (hoisted so vi.mock factory can reference it) ──────
const { mockSupabase, mockUnsubscribe } = vi.hoisted(() => {
  const mockUnsubscribe = vi.fn();
  const mockSupabase = {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: mockUnsubscribe } },
      }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  };
  return { mockSupabase, mockUnsubscribe };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));

import { AuthProvider, useAuth } from "@/contexts/AuthContext";

// ── Helpers ──────────────────────────────────────────────────────────
let authChangeCallback: (event: string, session: any) => void;

const fakeUser = { id: "user-123", email: "test@example.com" };
const fakeSession = { user: fakeUser, access_token: "tok" };

function buildFromChain(profileData: any, rolesData: any, driverData: any = null) {
  mockSupabase.from.mockImplementation((table: string) => {
    if (table === "profiles") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: profileData, error: null }),
          }),
        }),
      };
    }
    if (table === "user_roles") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: rolesData, error: null }),
        }),
      };
    }
    if (table === "drivers") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: driverData, error: driverData ? null : { code: "PGRST116" } }),
          }),
        }),
      };
    }
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
  });
}

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

// ── Tests ────────────────────────────────────────────────────────────
describe("AuthContext", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.clearAllMocks();
    localStorage.clear();

    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    mockSupabase.auth.onAuthStateChange.mockImplementation((cb: any) => {
      authChangeCallback = cb;
      return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── useAuth outside provider ───────────────────────────────────────
  it("throws when useAuth is used outside AuthProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => {
      renderHook(() => useAuth());
    }).toThrow("useAuth must be used within AuthProvider");
    spy.mockRestore();
  });

  // ── Loading state ──────────────────────────────────────────────────
  it("starts in loading state", () => {
    mockSupabase.auth.getSession.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.loading).toBe(true);
    expect(result.current.session).toBeNull();
    expect(result.current.user).toBeNull();
  });

  // ── Logged out state ───────────────────────────────────────────────
  it("resolves to logged-out state when no session exists", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.session).toBeNull();
    expect(result.current.user).toBeNull();
    expect(result.current.profile).toBeNull();
    expect(result.current.roles).toEqual([]);
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.effectiveRole).toBe("planner");
  });

  // ── Logged in – admin ──────────────────────────────────────────────
  it("fetches profile and roles for a logged-in admin user", async () => {
    const profileData = { display_name: "Admin User", avatar_url: "https://img.png" };
    const rolesData = [{ role: "admin" }];
    buildFromChain(profileData, rolesData);
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: fakeSession }, error: null });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => { vi.runAllTimers(); });

    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.isAdmin).toBe(true));

    expect(result.current.session).toEqual(fakeSession);
    expect(result.current.user).toEqual(fakeUser);
    expect(result.current.effectiveRole).toBe("admin");
    expect(result.current.profile).toEqual(profileData);
    expect(result.current.roles).toEqual(["admin"]);
  });

  // ── Logged in – medewerker (planner) ───────────────────────────────
  it("maps medewerker role to planner effectiveRole", async () => {
    const profileData = { display_name: "Planner", avatar_url: null };
    const rolesData = [{ role: "medewerker" }];
    buildFromChain(profileData, rolesData);
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: fakeSession }, error: null });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => { vi.runAllTimers(); });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.roles).toEqual(["medewerker"]));

    expect(result.current.effectiveRole).toBe("planner");
    expect(result.current.isAdmin).toBe(false);
  });

  // ── Logged in – chauffeur (via localStorage + linked driver record) ──
  it("detects chauffeur mode only when user is a linked driver in DB", async () => {
    localStorage.setItem("chauffeur_mode", "true");
    const profileData = { display_name: "Driver", avatar_url: null };
    const rolesData: any[] = [];
    // Provide a linked driver record — this is required for chauffeur role
    buildFromChain(profileData, rolesData, { id: "driver-1" });
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: fakeSession }, error: null });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => { vi.runAllTimers(); });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.effectiveRole).toBe("chauffeur");
    expect(result.current.isAdmin).toBe(false);
  });

  // ── localStorage chauffeur_mode alone is NOT enough (security fix) ──
  it("does NOT grant chauffeur role from localStorage alone without linked driver", async () => {
    localStorage.setItem("chauffeur_mode", "true");
    const profileData = { display_name: "Attacker", avatar_url: null };
    const rolesData: any[] = [];
    // No linked driver record — chauffeur_mode should be ignored
    buildFromChain(profileData, rolesData, null);
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: fakeSession }, error: null });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => { vi.runAllTimers(); });
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Should fall through to planner, NOT chauffeur
    expect(result.current.effectiveRole).toBe("planner");
  });

  // ── Admin takes priority over chauffeur_mode ───────────────────────
  it("admin role takes priority over chauffeur_mode localStorage", async () => {
    localStorage.setItem("chauffeur_mode", "true");
    const profileData = { display_name: "Admin", avatar_url: null };
    const rolesData = [{ role: "admin" }];
    buildFromChain(profileData, rolesData, { id: "driver-1" });
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: fakeSession }, error: null });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => { vi.runAllTimers(); });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.roles).toEqual(["admin"]));

    expect(result.current.effectiveRole).toBe("admin");
  });

  // ── No roles defaults to planner ───────────────────────────────────
  it("defaults to planner when no roles assigned", async () => {
    buildFromChain({ display_name: "Nobody", avatar_url: null }, []);
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: fakeSession }, error: null });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => { vi.runAllTimers(); });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.effectiveRole).toBe("planner");
  });

  // ── onAuthStateChange fires with session ───────────────────────────
  it("handles onAuthStateChange with a new session", async () => {
    const profileData = { display_name: "Auth Change User", avatar_url: null };
    const rolesData = [{ role: "medewerker" }];
    buildFromChain(profileData, rolesData);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();

    await act(async () => {
      authChangeCallback("SIGNED_IN", fakeSession);
      vi.runAllTimers();
    });

    await waitFor(() => expect(result.current.user).toEqual(fakeUser));
    expect(result.current.session).toEqual(fakeSession);
  });

  // ── onAuthStateChange fires with null session (logout) ─────────────
  it("handles onAuthStateChange with null session (sign out)", async () => {
    buildFromChain({ display_name: "User", avatar_url: null }, [{ role: "admin" }]);
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: fakeSession }, error: null });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => { vi.runAllTimers(); });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.user).toEqual(fakeUser));

    await act(async () => {
      authChangeCallback("SIGNED_OUT", null);
    });

    expect(result.current.session).toBeNull();
    expect(result.current.user).toBeNull();
    expect(result.current.profile).toBeNull();
    expect(result.current.roles).toEqual([]);
  });

  // ── signOut clears state and localStorage ──────────────────────────
  it("signOut clears all state and removes localStorage keys", async () => {
    localStorage.setItem("debug_bypass", "yes");
    localStorage.setItem("chauffeur_mode", "true");

    buildFromChain({ display_name: "User", avatar_url: null }, [{ role: "admin" }]);
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: fakeSession }, error: null });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => { vi.runAllTimers(); });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.user).toEqual(fakeUser));

    await act(async () => {
      await result.current.signOut();
    });

    expect(mockSupabase.auth.signOut).toHaveBeenCalled();
    expect(result.current.session).toBeNull();
    expect(result.current.user).toBeNull();
    expect(result.current.profile).toBeNull();
    expect(result.current.roles).toEqual([]);
    expect(localStorage.getItem("debug_bypass")).toBeNull();
    expect(localStorage.getItem("chauffeur_mode")).toBeNull();
  });

  // ── Unsubscribe on unmount ─────────────────────────────────────────
  it("unsubscribes from auth state change on unmount", async () => {
    const { unmount } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {});
    unmount();

    expect(mockUnsubscribe).toHaveBeenCalled();
  });

  // ── Profile/roles null when fetch returns null ─────────────────────
  it("handles null profile and roles data gracefully", async () => {
    mockSupabase.from.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }));
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: fakeSession }, error: null });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => { vi.runAllTimers(); });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.profile).toBeNull();
    expect(result.current.roles).toEqual([]);
  });

  // ── Renders children ───────────────────────────────────────────────
  it("renders children correctly", async () => {
    render(
      <AuthProvider>
        <div data-testid="child">Hello</div>
      </AuthProvider>
    );

    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  // ── Multiple roles ─────────────────────────────────────────────────
  it("handles multiple roles (admin + medewerker)", async () => {
    const profileData = { display_name: "Multi", avatar_url: null };
    const rolesData = [{ role: "medewerker" }, { role: "admin" }];
    buildFromChain(profileData, rolesData);
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: fakeSession }, error: null });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => { vi.runAllTimers(); });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.roles).toEqual(["medewerker", "admin"]));

    expect(result.current.effectiveRole).toBe("admin");
    expect(result.current.isAdmin).toBe(true);
  });
});
