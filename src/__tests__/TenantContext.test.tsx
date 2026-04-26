import { render, screen, waitFor, act } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import React, { ReactNode } from "react";

// ── Hoisted mocks ────────────────────────────────────────────────────
const { mockAuthValues, mockSupabase } = vi.hoisted(() => {
  const mockAuthValues = {
    user: null as any,
    session: null as any,
    loading: false,
    profile: null,
    roles: [] as string[],
    effectiveRole: "planner" as const,
    isAdmin: false,
    signOut: vi.fn(),
  };

  const mockSupabase = {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      limit: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    }),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  };

  return { mockAuthValues, mockSupabase };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockAuthValues,
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));

vi.mock("@/lib/companyConfig", () => ({
  DEFAULT_COMPANY: { name: "TestCo" },
}));

import { TenantProvider, useTenant } from "@/contexts/TenantContext";

// ── Helpers ──────────────────────────────────────────────────────────
const fakeTenantRow = {
  id: "t-001",
  name: "Acme Transport",
  slug: "acme",
  logo_url: "https://logo.png",
  primary_color: "#3b82f6",
};

function wrapper({ children }: { children: ReactNode }) {
  return <TenantProvider>{children}</TenantProvider>;
}

function setupFromMock(options: {
  maybeSingleData?: any;
  maybeSingleError?: any;
  maybeSingleResults?: Array<{ data: any; error?: any }>;
}) {
  let maybeSingleCallCount = 0;

  const makeMaybeSingle = () =>
    vi.fn().mockImplementation(() => {
      const results = options.maybeSingleResults || [{ data: null, error: null }];
      const idx = Math.min(maybeSingleCallCount, results.length - 1);
      maybeSingleCallCount++;
      return Promise.resolve(results[idx]);
    });

  const makeLimit = () =>
    vi.fn().mockReturnValue({ maybeSingle: makeMaybeSingle() });

  mockSupabase.from.mockImplementation(() => ({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: options.maybeSingleData ?? null,
          error: options.maybeSingleError ?? null,
        }),
        // When eq() is used as query reassignment (subdomain path),
        // the result also needs limit().maybeSingle()
        limit: makeLimit(),
      }),
      limit: makeLimit(),
    }),
  }));
}

// ── Tests ────────────────────────────────────────────────────────────
describe("TenantContext", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthValues.user = null;
    mockAuthValues.session = null;
    mockAuthValues.loading = false;

    Object.defineProperty(window, "location", {
      writable: true,
      value: { ...originalLocation, hostname: "localhost" },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      writable: true,
      value: originalLocation,
    });
    document.documentElement.style.removeProperty("--primary");
    document.documentElement.style.removeProperty("--primary-foreground");
  });

  // ── useTenant outside provider ─────────────────────────────────────
  it("throws when useTenant is used outside TenantProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => {
      renderHook(() => useTenant());
    }).toThrow("useTenant must be used within a TenantProvider");
    spy.mockRestore();
  });

  // ── Loading state while auth is loading ────────────────────────────
  it("stays loading while auth is still loading", async () => {
    mockAuthValues.loading = true;

    const { result } = renderHook(() => useTenant(), { wrapper });

    expect(result.current.loading).toBe(true);
  });

  // ── Tenant resolved via user tenant_id (JWT path) ─────────────────
  it("resolves tenant via user app_metadata.tenant_id", async () => {
    mockAuthValues.user = { id: "u-1", app_metadata: { tenant_id: "t-001" } };
    setupFromMock({ maybeSingleData: fakeTenantRow });

    const { result } = renderHook(() => useTenant(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.tenant).toEqual({
      id: "t-001",
      name: "Acme Transport",
      slug: "acme",
      logoUrl: "https://logo.png",
      primaryColor: "#3b82f6",
    });
  });

  // ── Tenant resolved via subdomain slug ─────────────────────────────
  it("resolves tenant via subdomain slug when no tenant_id in JWT", async () => {
    Object.defineProperty(window, "location", {
      writable: true,
      value: { ...originalLocation, hostname: "acme.orderflow.nl" },
    });

    setupFromMock({ maybeSingleResults: [{ data: fakeTenantRow }] });

    const { result } = renderHook(() => useTenant(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.tenant).toEqual({
      id: "t-001",
      name: "Acme Transport",
      slug: "acme",
      logoUrl: "https://logo.png",
      primaryColor: "#3b82f6",
    });
  });

  // ── Localhost: no slug filter applied ──────────────────────────────
  it("does not filter by slug on localhost", async () => {
    setupFromMock({ maybeSingleResults: [{ data: fakeTenantRow }] });

    const { result } = renderHook(() => useTenant(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.tenant).not.toBeNull();
  });

  // ── 127.0.0.1 treated like localhost ───────────────────────────────
  it("does not filter by slug on 127.0.0.1", async () => {
    Object.defineProperty(window, "location", {
      writable: true,
      value: { ...originalLocation, hostname: "127.0.0.1" },
    });

    setupFromMock({ maybeSingleResults: [{ data: fakeTenantRow }] });

    const { result } = renderHook(() => useTenant(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tenant).not.toBeNull();
  });

  // ── Fallback: no tenant found via JWT or slug ──────────────────────
  it("falls back to first available tenant when primary resolution fails", async () => {
    mockAuthValues.user = { id: "u-1", app_metadata: { tenant_id: "nonexistent" } };

    // maybeSingle() returns null (id lookup fails), fallback maybeSingle returns data
    setupFromMock({
      maybeSingleData: null,
      maybeSingleResults: [{ data: fakeTenantRow }],
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { result } = renderHook(() => useTenant(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.tenant).not.toBeNull();
    expect(result.current.tenant?.id).toBe("t-001");
    expect(result.current.tenant?.name).toBe("Acme Transport");
    warnSpy.mockRestore();
  });

  // ── Ultimate fallback: no tenants in DB at all ─────────────────────
  it("creates hardcoded dev tenant when no tenants exist in database", async () => {
    setupFromMock({
      maybeSingleData: null,
      maybeSingleResults: [{ data: null }],
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(() => useTenant(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.tenant).toEqual({
      id: "00000000-0000-0000-0000-000000000001",
      name: "TestCo",
      slug: "localhost-dev",
      logoUrl: null,
      primaryColor: "#dc2626",
    });

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  // ── Error during tenant resolution ─────────────────────────────────
  it("handles thrown errors during tenant resolution", async () => {
    mockSupabase.from.mockImplementation(() => {
      throw new Error("Network failure");
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(() => useTenant(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.tenant).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith("Failed to load tenant", expect.any(Error));
    errorSpy.mockRestore();
  });

  // ── Tenant query returns error (but not exception) ─────────────────
  it("does not set tenant when supabase query returns an error object", async () => {
    mockAuthValues.user = { id: "u-1", app_metadata: { tenant_id: "t-001" } };

    // single() returns data AND error -> code checks `data && !error`
    setupFromMock({
      maybeSingleData: fakeTenantRow,
      maybeSingleError: { message: "RLS denied" },
      maybeSingleResults: [{ data: null }],
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(() => useTenant(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Falls through to fallback since error was present
    expect(result.current.tenant).not.toBeNull();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  // ── Default primaryColor when missing ──────────────────────────────
  it("defaults primaryColor to #dc2626 when tenant has no primary_color", async () => {
    mockAuthValues.user = { id: "u-1", app_metadata: { tenant_id: "t-001" } };

    const tenantNoPrimaryColor = { ...fakeTenantRow, primary_color: null };
    setupFromMock({ maybeSingleData: tenantNoPrimaryColor });

    const { result } = renderHook(() => useTenant(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.tenant?.primaryColor).toBe("#dc2626");
  });

  // ── CSS variables are set when tenant has primaryColor ─────────────
  it("injects CSS custom properties for tenant primary color", async () => {
    mockAuthValues.user = { id: "u-1", app_metadata: { tenant_id: "t-001" } };
    setupFromMock({ maybeSingleData: fakeTenantRow });

    renderHook(() => useTenant(), { wrapper });

    await waitFor(() => {
      const primary = document.documentElement.style.getPropertyValue("--primary");
      expect(primary).not.toBe("");
    });

    const fg = document.documentElement.style.getPropertyValue("--primary-foreground");
    expect(fg).toBe("0 0% 100%");
  });

  // ── CSS variables are removed when tenant has no primaryColor ──────
  it("removes CSS custom properties when tenant is null", async () => {
    document.documentElement.style.setProperty("--primary", "0 50% 50%");
    document.documentElement.style.setProperty("--primary-foreground", "0 0% 100%");

    mockSupabase.from.mockImplementation(() => {
      throw new Error("fail");
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    renderHook(() => useTenant(), { wrapper });

    await waitFor(() => {
      const primary = document.documentElement.style.getPropertyValue("--primary");
      expect(primary).toBe("");
    });
    spy.mockRestore();
  });

  // ── Renders children ───────────────────────────────────────────────
  it("renders children correctly", async () => {
    setupFromMock({ maybeSingleResults: [{ data: fakeTenantRow }] });

    render(
      <TenantProvider>
        <div data-testid="tenant-child">Tenant Content</div>
      </TenantProvider>
    );

    expect(screen.getByTestId("tenant-child")).toBeInTheDocument();
    expect(screen.getByText("Tenant Content")).toBeInTheDocument();
  });

  // ── Re-resolves tenant when user changes ───────────────────────────
  it("re-resolves tenant when user changes", async () => {
    const tenantA = { ...fakeTenantRow, id: "t-a", name: "Tenant A" };
    const tenantB = { ...fakeTenantRow, id: "t-b", name: "Tenant B" };

    let resolveCount = 0;
    mockSupabase.from.mockImplementation(() => {
      resolveCount++;
      const data = resolveCount <= 1 ? tenantA : tenantB;
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
          }),
          limit: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
          }),
        }),
      };
    });

    const { result, rerender } = renderHook(() => useTenant(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tenant?.name).toBe("Tenant A");

    mockAuthValues.user = { id: "u-new", app_metadata: { tenant_id: "t-b" } };
    rerender();

    await waitFor(() => expect(result.current.tenant?.name).toBe("Tenant B"));
  });

  // ── Tenant logoUrl is null when logo_url is null ───────────────────
  it("handles null logo_url", async () => {
    mockAuthValues.user = { id: "u-1", app_metadata: { tenant_id: "t-001" } };

    const tenantNoLogo = { ...fakeTenantRow, logo_url: null };
    setupFromMock({ maybeSingleData: tenantNoLogo });

    const { result } = renderHook(() => useTenant(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tenant?.logoUrl).toBeNull();
  });

  // ── hexToHSL: pure red ─────────────────────────────────────────────
  it("converts pure red (#ff0000) to correct HSL", async () => {
    mockAuthValues.user = { id: "u-1", app_metadata: { tenant_id: "t-001" } };
    const redTenant = { ...fakeTenantRow, primary_color: "#ff0000" };
    setupFromMock({ maybeSingleData: redTenant });

    renderHook(() => useTenant(), { wrapper });

    await waitFor(() => {
      const primary = document.documentElement.style.getPropertyValue("--primary");
      expect(primary).toBe("0.0 100.0% 50.0%");
    });
  });

  // ── hexToHSL: achromatic (grey) ────────────────────────────────────
  it("handles achromatic colors (grey) in hex to HSL conversion", async () => {
    mockAuthValues.user = { id: "u-1", app_metadata: { tenant_id: "t-001" } };
    const greyTenant = { ...fakeTenantRow, primary_color: "#808080" };
    setupFromMock({ maybeSingleData: greyTenant });

    renderHook(() => useTenant(), { wrapper });

    await waitFor(() => {
      const primary = document.documentElement.style.getPropertyValue("--primary");
      expect(primary).toContain("0.0%");
    });
  });

  // ── hexToHSL: pure green ───────────────────────────────────────────
  it("handles green-dominant hex color conversion", async () => {
    mockAuthValues.user = { id: "u-1", app_metadata: { tenant_id: "t-001" } };
    const greenTenant = { ...fakeTenantRow, primary_color: "#00ff00" };
    setupFromMock({ maybeSingleData: greenTenant });

    renderHook(() => useTenant(), { wrapper });

    await waitFor(() => {
      const primary = document.documentElement.style.getPropertyValue("--primary");
      expect(primary).toBe("120.0 100.0% 50.0%");
    });
  });

  // ── hexToHSL: pure blue ────────────────────────────────────────────
  it("handles blue-dominant hex color conversion", async () => {
    mockAuthValues.user = { id: "u-1", app_metadata: { tenant_id: "t-001" } };
    const blueTenant = { ...fakeTenantRow, primary_color: "#0000ff" };
    setupFromMock({ maybeSingleData: blueTenant });

    renderHook(() => useTenant(), { wrapper });

    await waitFor(() => {
      const primary = document.documentElement.style.getPropertyValue("--primary");
      expect(primary).toBe("240.0 100.0% 50.0%");
    });
  });

  // ── hexToHSL: magenta (red dominant, g < b) ───────────────────────
  it("handles red-dominant hex with g < b for hue wrapping (magenta)", async () => {
    mockAuthValues.user = { id: "u-1", app_metadata: { tenant_id: "t-001" } };
    const magentaTenant = { ...fakeTenantRow, primary_color: "#ff00ff" };
    setupFromMock({ maybeSingleData: magentaTenant });

    renderHook(() => useTenant(), { wrapper });

    await waitFor(() => {
      const primary = document.documentElement.style.getPropertyValue("--primary");
      expect(primary).toBe("300.0 100.0% 50.0%");
    });
  });

  // ── hexToHSL: lightness > 0.5 ─────────────────────────────────────
  it("handles colors with lightness > 0.5 for saturation calculation", async () => {
    mockAuthValues.user = { id: "u-1", app_metadata: { tenant_id: "t-001" } };
    // #ffcccc has l > 0.5 → uses d / (2 - max - min) for saturation
    const lightPinkTenant = { ...fakeTenantRow, primary_color: "#ffcccc" };
    setupFromMock({ maybeSingleData: lightPinkTenant });

    renderHook(() => useTenant(), { wrapper });

    await waitFor(() => {
      const primary = document.documentElement.style.getPropertyValue("--primary");
      expect(primary).not.toBe("");
      // Verify the HSL is reasonable for light pink
      expect(primary).toContain("0.0");
    });
  });

  // ── Slug resolution on non-localhost subdomain with error ──────────
  it("handles slug resolution error on non-localhost subdomain", async () => {
    Object.defineProperty(window, "location", {
      writable: true,
      value: { ...originalLocation, hostname: "broken.orderflow.nl" },
    });

    setupFromMock({
      maybeSingleResults: [
        { data: null, error: { message: "not found" } },
        { data: null },
      ],
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(() => useTenant(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Falls through to fallback(s) and ends up with dev mode tenant
    expect(result.current.tenant).not.toBeNull();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
