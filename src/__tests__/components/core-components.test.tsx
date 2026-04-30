import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";

// ─── Global Mocks ────────────────────────────────────────────
const mockSignOut = vi.fn();
const mockNavigate = vi.fn();
const { mockReloadForFreshBuild } = vi.hoisted(() => ({
  mockReloadForFreshBuild: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

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
    not: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    then: vi.fn().mockImplementation((cb) => cb({ data: [], error: null })),
  }),
  channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }) }),
  removeChannel: vi.fn(),
};
vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    session: { user: { id: "u1" } },
    user: { id: "u1", email: "t@t.nl" },
    profile: { display_name: "Test User", avatar_url: null },
    roles: ["admin"],
    effectiveRole: "admin",
    isAdmin: true,
    loading: false,
    signOut: mockSignOut,
  }),
  AuthProvider: ({ children }: any) => children,
}));

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({
    tenant: { id: "t1", name: "TestBedrijf", slug: "test", logoUrl: null, primaryColor: "#dc2626" },
    loading: false,
  }),
  useTenantOptional: () => ({
    tenant: { id: "t1", name: "TestBedrijf", slug: "test", logoUrl: null, primaryColor: "#dc2626" },
    loading: false,
  }),
  TenantProvider: ({ children }: any) => children,
}));

vi.mock("@/lib/chunkReload", () => ({
  isChunkLoadError: (error: unknown) => {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "";

    return /failed to fetch dynamically imported module/i.test(message);
  },
  reloadForFreshBuild: mockReloadForFreshBuild,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'nav.dashboard': 'Dashboard',
        'nav.inbox': 'Inbox',
        'nav.orders': 'Orders',
        'nav.clients': 'Klanten',
        'nav.planning': 'Planbord',
        'nav.dispatch': 'Dispatch',
        'nav.tracking': 'Live Tracking',
        'nav.trips': 'Ritoverzicht',
        'nav.drivers': 'Chauffeurs',
        'nav.fleet': 'Vloot',
        'nav.reporting': 'Rapportage',
        'nav.exceptions': 'Uitzonderingen',
        'nav.autonomy': 'Autonomie',
        'nav.invoicing': 'Facturatie',
        'nav.users': 'Gebruikers',
        'nav.settings': 'Instellingen',
        'sections.navigation': 'Navigatie',
        'sections.admin': 'Admin',
        'nav.admin': 'Admin',
      };
      return translations[key] || key;
    },
    i18n: { language: 'nl', changeLanguage: vi.fn() }
  }),
  I18nextProvider: ({ children }: any) => children,
}));

vi.mock("@/assets/logo.png", () => ({ default: "mock-logo.png" }));
vi.mock("@/lib/companyConfig", () => ({ DEFAULT_COMPANY: { name: "TestCo", address: "Test Addr 1", country: "NL" } }));

// Mock hooks used by AppLayout
vi.mock("@/hooks/useSLAMonitor", () => ({ useSLAMonitor: vi.fn() }));
vi.mock("@/hooks/useOrders", () => ({ useOrdersSubscription: vi.fn() }));
vi.mock("@/hooks/useTrips", () => ({
  useAutoCompleteTripCheck: vi.fn(),
  useDriverTrips: vi.fn().mockReturnValue({ data: [], isLoading: false }),
  useUpdateTripStatus: vi.fn().mockReturnValue({ mutateAsync: vi.fn() }),
  useUpdateStopStatus: vi.fn().mockReturnValue({ mutateAsync: vi.fn() }),
}));
vi.mock("@/hooks/useInvoices", () => ({ useAutoInvoiceGeneration: vi.fn() }));
vi.mock("@/hooks/useInbox", () => ({ useInboxSubscription: vi.fn() }));
vi.mock("@/hooks/useNotificationCenter", () => ({
  useNotificationCenter: () => ({
    notifications: [],
    unreadCount: 0,
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    dismiss: vi.fn(),
    isLoading: false,
  }),
}));
vi.mock("@/hooks/useNotifications", () => ({
  useNotifications: () => ({
    notifications: [],
    unreadCount: 0,
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    deleteNotification: vi.fn(),
    clearAll: vi.fn(),
  }),
}));

function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = createQueryClient();
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

// ═══════════════════════════════════════════════════════════════
// ErrorBoundary
// ═══════════════════════════════════════════════════════════════
describe("ErrorBoundary", () => {
  // Must import dynamically after mocks
  let ErrorBoundary: any;
  beforeEach(async () => {
    mockReloadForFreshBuild.mockClear();
    const mod = await import("@/components/ErrorBoundary");
    ErrorBoundary = mod.ErrorBoundary;
  });

  it("renders children when no error", () => {
    render(
      <ErrorBoundary>
        <div>Hello</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("renders error UI when child throws", () => {
    const Bomb = () => { throw new Error("boom"); };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Er is iets misgegaan")).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();
    expect(screen.getByText("Probeer opnieuw")).toBeInTheDocument();
    spy.mockRestore();
  });

  it("resets error state on retry click", () => {
    let shouldThrow = true;
    const MaybeBomb = () => { if (shouldThrow) throw new Error("boom"); return <div>Recovered</div>; };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <MaybeBomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText("boom")).toBeInTheDocument();
    shouldThrow = false;
    fireEvent.click(screen.getByText("Probeer opnieuw"));
    expect(screen.getByText("Recovered")).toBeInTheDocument();
    spy.mockRestore();
  });

  it("shows default message when error has no message", () => {
    const Bomb = () => { throw new Error(); };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Een onverwachte fout is opgetreden.")).toBeInTheDocument();
    spy.mockRestore();
  });

  it("starts a refresh flow for stale lazy chunks", () => {
    const Bomb = () => {
      throw new Error("Failed to fetch dynamically imported module: /assets/Clients-abc123.js");
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Nieuwe versie laden")).toBeInTheDocument();
    expect(screen.getByText("De app is net bijgewerkt. We laden de nieuwste versie automatisch.")).toBeInTheDocument();
    expect(screen.queryByText(/Failed to fetch dynamically imported module/)).not.toBeInTheDocument();
    expect(mockReloadForFreshBuild).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("Nu herladen"));
    expect(mockReloadForFreshBuild).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});

// ═══════════════════════════════════════════════════════════════
// ProtectedRoute
// ═══════════════════════════════════════════════════════════════
describe("ProtectedRoute", () => {
  it("renders children when session exists", async () => {
    const { ProtectedRoute } = await import("@/components/ProtectedRoute");
    render(
      <Wrapper>
        <ProtectedRoute><div>Protected Content</div></ProtectedRoute>
      </Wrapper>,
    );
    expect(screen.getByText("Protected Content")).toBeInTheDocument();
  });

  it("redirects to /login when no session", async () => {
    vi.doMock("@/contexts/AuthContext", () => ({
      useAuth: () => ({ session: null, loading: false, user: null, profile: null, roles: [], effectiveRole: "planner", isAdmin: false, signOut: vi.fn() }),
    }));
    // Reset module cache
    vi.resetModules();
    const { ProtectedRoute } = await import("@/components/ProtectedRoute");
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <ProtectedRoute><div>Should not render</div></ProtectedRoute>
      </MemoryRouter>,
    );
    expect(screen.queryByText("Should not render")).not.toBeInTheDocument();
    // Restore
    vi.doMock("@/contexts/AuthContext", () => ({
      useAuth: () => ({
        session: { user: { id: "u1" } }, user: { id: "u1", email: "t@t.nl" },
        profile: { display_name: "Test User", avatar_url: null }, roles: ["admin"],
        effectiveRole: "admin", isAdmin: true, loading: false, signOut: mockSignOut,
      }),
    }));
    vi.resetModules();
  });

  it("shows loading spinner when loading", async () => {
    vi.doMock("@/contexts/AuthContext", () => ({
      useAuth: () => ({ session: null, loading: true, user: null, profile: null, roles: [], effectiveRole: "planner", isAdmin: false, signOut: vi.fn() }),
    }));
    vi.resetModules();
    const { ProtectedRoute } = await import("@/components/ProtectedRoute");
    const { container } = render(
      <MemoryRouter>
        <ProtectedRoute><div>Content</div></ProtectedRoute>
      </MemoryRouter>,
    );
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
    expect(screen.queryByText("Content")).not.toBeInTheDocument();
    // Restore
    vi.doMock("@/contexts/AuthContext", () => ({
      useAuth: () => ({
        session: { user: { id: "u1" } }, user: { id: "u1", email: "t@t.nl" },
        profile: { display_name: "Test User", avatar_url: null }, roles: ["admin"],
        effectiveRole: "admin", isAdmin: true, loading: false, signOut: mockSignOut,
      }),
    }));
    vi.resetModules();
  });
});

// ═══════════════════════════════════════════════════════════════
// NavLink
// ═══════════════════════════════════════════════════════════════
describe("NavLink", () => {
  it("renders with base className", async () => {
    const { NavLink } = await import("@/components/NavLink");
    render(
      <MemoryRouter initialEntries={["/test"]}>
        <NavLink to="/test" className="base-class" activeClassName="active-class">Link Text</NavLink>
      </MemoryRouter>,
    );
    const link = screen.getByText("Link Text");
    expect(link).toBeInTheDocument();
    expect(link.tagName).toBe("A");
    expect(link.className).toContain("base-class");
    expect(link.className).toContain("active-class");
  });

  it("does not apply activeClassName on non-matching route", async () => {
    const { NavLink } = await import("@/components/NavLink");
    render(
      <MemoryRouter initialEntries={["/other"]}>
        <NavLink to="/test" className="base-class" activeClassName="active-class">Link</NavLink>
      </MemoryRouter>,
    );
    const link = screen.getByText("Link");
    expect(link.className).toContain("base-class");
    expect(link.className).not.toContain("active-class");
  });
});

// ═══════════════════════════════════════════════════════════════
// ClickableAddress
// ═══════════════════════════════════════════════════════════════
describe("ClickableAddress", () => {
  it("renders address with Google Maps link", async () => {
    const { ClickableAddress } = await import("@/components/ClickableAddress");
    render(<ClickableAddress address="Amsterdam, NL" />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", expect.stringContaining("google.com/maps"));
    expect(link).toHaveAttribute("href", expect.stringContaining("Amsterdam"));
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.getByText("Amsterdam, NL")).toBeInTheDocument();
  });

  it("renders fallback when address is null", async () => {
    const { ClickableAddress } = await import("@/components/ClickableAddress");
    render(<ClickableAddress address={null} />);
    expect(screen.getByText("Ontbreekt")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders custom fallback", async () => {
    const { ClickableAddress } = await import("@/components/ClickableAddress");
    render(<ClickableAddress address={null} fallback={<span>N/A</span>} />);
    expect(screen.getByText("N/A")).toBeInTheDocument();
  });

  it("hides icon when showIcon=false", async () => {
    const { ClickableAddress } = await import("@/components/ClickableAddress");
    const { container } = render(<ClickableAddress address="Test" showIcon={false} />);
    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });

  it("shows icon by default", async () => {
    const { ClickableAddress } = await import("@/components/ClickableAddress");
    const { container } = render(<ClickableAddress address="Test" />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════
// QueryError
// ═══════════════════════════════════════════════════════════════
describe("QueryError", () => {
  it("renders default message", async () => {
    const { QueryError } = await import("@/components/QueryError");
    render(<QueryError />);
    expect(screen.getByText("Er ging iets mis")).toBeInTheDocument();
    expect(screen.getByText(/Kan de gegevens niet laden/)).toBeInTheDocument();
  });

  it("renders custom message", async () => {
    const { QueryError } = await import("@/components/QueryError");
    render(<QueryError message="Custom fout" />);
    expect(screen.getByText("Custom fout")).toBeInTheDocument();
  });

  it("shows retry button when onRetry is provided", async () => {
    const { QueryError } = await import("@/components/QueryError");
    const onRetry = vi.fn();
    render(<QueryError onRetry={onRetry} />);
    const btn = screen.getByText("Opnieuw proberen");
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("hides retry button when onRetry is not provided", async () => {
    const { QueryError } = await import("@/components/QueryError");
    render(<QueryError />);
    expect(screen.queryByText("Opnieuw proberen")).not.toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════
// OnboardingWizard
// ═══════════════════════════════════════════════════════════════
describe("OnboardingWizard", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("opens when onboarding not dismissed", async () => {
    const { OnboardingWizard } = await import("@/components/OnboardingWizard");
    render(<Wrapper><OnboardingWizard /></Wrapper>);
    expect(screen.getByText(/Welkom bij/)).toBeInTheDocument();
    expect(screen.getByText("Stap 1 van 5")).toBeInTheDocument();
  });

  it("does not open when previously dismissed", async () => {
    localStorage.setItem("onboarding_dismissed", "true");
    const { OnboardingWizard } = await import("@/components/OnboardingWizard");
    render(<Wrapper><OnboardingWizard /></Wrapper>);
    expect(screen.queryByText(/Welkom bij/)).not.toBeInTheDocument();
  });

  it("navigates through steps", async () => {
    const { OnboardingWizard } = await import("@/components/OnboardingWizard");
    render(<Wrapper><OnboardingWizard /></Wrapper>);
    expect(screen.getByText("Stap 1 van 5")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Volgende"));
    expect(screen.getByText("Stap 2 van 5")).toBeInTheDocument();
    expect(screen.getByText("Klanten toevoegen")).toBeInTheDocument();
  });

  it("dismisses and saves to localStorage", async () => {
    const { OnboardingWizard } = await import("@/components/OnboardingWizard");
    render(<Wrapper><OnboardingWizard /></Wrapper>);
    // Click the close button (X icon button)
    const closeButtons = screen.getAllByRole("button");
    const xBtn = closeButtons.find((b) => b.querySelector("svg"));
    if (xBtn) fireEvent.click(xBtn);
    expect(localStorage.getItem("onboarding_dismissed")).toBe("true");
  });

  it("shows action buttons on step 2+", async () => {
    const { OnboardingWizard } = await import("@/components/OnboardingWizard");
    render(<Wrapper><OnboardingWizard /></Wrapper>);
    fireEvent.click(screen.getByText("Volgende"));
    expect(screen.getByText("Ga naar Klanten")).toBeInTheDocument();
  });

  it("shows finish button on last step", async () => {
    const { OnboardingWizard } = await import("@/components/OnboardingWizard");
    render(<Wrapper><OnboardingWizard /></Wrapper>);
    // Go to step 5
    for (let i = 0; i < 4; i++) {
      fireEvent.click(screen.getByText("Volgende"));
    }
    expect(screen.getByText("Aan de slag")).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════
// AppLayout
// ═══════════════════════════════════════════════════════════════
describe("AppLayout", () => {
  it("renders layout structure with sidebar, header and main", async () => {
    const { AppLayout } = await import("@/components/AppLayout");
    render(<Wrapper><AppLayout /></Wrapper>);
    // Checks Outlet is rendered (empty route = nothing), but header with NotificationCenter exists
    expect(screen.getAllByRole("button").length).toBeGreaterThanOrEqual(1);
  });

  it("calls SLA monitor and subscription hooks", async () => {
    const { useSLAMonitor } = await import("@/hooks/useSLAMonitor");
    const { useOrdersSubscription } = await import("@/hooks/useOrders");
    const { useAutoCompleteTripCheck } = await import("@/hooks/useTrips");
    const { useAutoInvoiceGeneration } = await import("@/hooks/useInvoices");
    const { AppLayout } = await import("@/components/AppLayout");
    render(<Wrapper><AppLayout /></Wrapper>);
    expect(useSLAMonitor).toHaveBeenCalled();
    expect(useOrdersSubscription).toHaveBeenCalled();
    expect(useAutoCompleteTripCheck).toHaveBeenCalled();
    expect(useAutoInvoiceGeneration).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// AppSidebar
// ═══════════════════════════════════════════════════════════════
describe("AppSidebar", () => {
  let SidebarProvider: any;
  beforeEach(async () => {
    const mod = await import("@/components/ui/sidebar");
    SidebarProvider = mod.SidebarProvider;
  });

  it("renders navigation items", async () => {
    const { AppSidebar } = await import("@/components/AppSidebar");
    const qc = createQueryClient();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <TooltipProvider><SidebarProvider><AppSidebar /></SidebarProvider></TooltipProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Inbox")).toBeInTheDocument();
    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(screen.getByText("Planbord")).toBeInTheDocument();
    expect(screen.getByText("Dispatch")).toBeInTheDocument();
  });

  it("renders admin section for admin users", async () => {
    const { AppSidebar } = await import("@/components/AppSidebar");
    const qc = createQueryClient();
    render(<QueryClientProvider client={qc}><MemoryRouter><TooltipProvider><SidebarProvider><AppSidebar /></SidebarProvider></TooltipProvider></MemoryRouter></QueryClientProvider>);
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText("Gebruikers")).toBeInTheDocument();
    expect(screen.getByText("Instellingen")).toBeInTheDocument();
  });

  it("renders tenant name", async () => {
    const { AppSidebar } = await import("@/components/AppSidebar");
    const qc = createQueryClient();
    render(<QueryClientProvider client={qc}><MemoryRouter><TooltipProvider><SidebarProvider><AppSidebar /></SidebarProvider></TooltipProvider></MemoryRouter></QueryClientProvider>);
    expect(screen.getByText("TestBedrijf")).toBeInTheDocument();
  });

  it("renders user display name and email", async () => {
    const { AppSidebar } = await import("@/components/AppSidebar");
    const qc = createQueryClient();
    render(<QueryClientProvider client={qc}><MemoryRouter><TooltipProvider><SidebarProvider><AppSidebar /></SidebarProvider></TooltipProvider></MemoryRouter></QueryClientProvider>);
    expect(screen.getByText("Test User")).toBeInTheDocument();
    expect(screen.getByText("t@t.nl")).toBeInTheDocument();
  });

  it("renders theme toggle button and toggles theme", async () => {
    const { AppSidebar } = await import("@/components/AppSidebar");
    const qc = createQueryClient();
    render(<QueryClientProvider client={qc}><MemoryRouter><TooltipProvider><SidebarProvider><AppSidebar /></SidebarProvider></TooltipProvider></MemoryRouter></QueryClientProvider>);
    const themeButton = screen.getByLabelText("Donker thema");
    expect(themeButton).toBeInTheDocument();
    fireEvent.click(themeButton);
    // After toggling to dark, label should change
    expect(screen.getByLabelText("Licht thema")).toBeInTheDocument();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("theme")).toBe("dark");
    // Toggle back
    fireEvent.click(screen.getByLabelText("Licht thema"));
    expect(screen.getByLabelText("Donker thema")).toBeInTheDocument();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem("theme")).toBe("light");
  });

  it("renders logout button and calls signOut + navigate on click", async () => {
    const { AppSidebar } = await import("@/components/AppSidebar");
    const qc = createQueryClient();
    render(<QueryClientProvider client={qc}><MemoryRouter><TooltipProvider><SidebarProvider><AppSidebar /></SidebarProvider></TooltipProvider></MemoryRouter></QueryClientProvider>);
    const logoutButton = screen.getByLabelText("Uitloggen");
    expect(logoutButton).toBeInTheDocument();
    fireEvent.click(logoutButton);
    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith("/login");
    });
  });

  it("renders navigation links with correct aria-labels", async () => {
    const { AppSidebar } = await import("@/components/AppSidebar");
    const qc = createQueryClient();
    render(<QueryClientProvider client={qc}><MemoryRouter><TooltipProvider><SidebarProvider><AppSidebar /></SidebarProvider></TooltipProvider></MemoryRouter></QueryClientProvider>);
    expect(screen.getByLabelText("Dashboard")).toBeInTheDocument();
    expect(screen.getByLabelText("Inbox")).toBeInTheDocument();
    expect(screen.getByLabelText("Orders")).toBeInTheDocument();
  });

  it("applies active class to current route", async () => {
    const { AppSidebar } = await import("@/components/AppSidebar");
    const qc = createQueryClient();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/orders"]}>
          <TooltipProvider><SidebarProvider><AppSidebar /></SidebarProvider></TooltipProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const ordersLink = screen.getByLabelText("Orders");
    expect(ordersLink.getAttribute("aria-current")).toBe("page");
  });

  it("uses saved dark theme from localStorage on mount", async () => {
    localStorage.setItem("theme", "dark");
    const { AppSidebar } = await import("@/components/AppSidebar");
    const qc = createQueryClient();
    render(<QueryClientProvider client={qc}><MemoryRouter><TooltipProvider><SidebarProvider><AppSidebar /></SidebarProvider></TooltipProvider></MemoryRouter></QueryClientProvider>);
    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
    // Cleanup
    document.documentElement.classList.remove("dark");
    localStorage.removeItem("theme");
  });
});

// ═══════════════════════════════════════════════════════════════
// MobileNav
// ═══════════════════════════════════════════════════════════════
describe("MobileNav", () => {
  it("renders primary navigation items", async () => {
    const { MobileNav } = await import("@/components/MobileNav");
    render(<Wrapper><MobileNav /></Wrapper>);
    expect(screen.getByLabelText("Dashboard")).toBeInTheDocument();
    expect(screen.getByLabelText("Inbox")).toBeInTheDocument();
    expect(screen.getByLabelText("Orders")).toBeInTheDocument();
    expect(screen.getByLabelText("Planbord")).toBeInTheDocument();
  });

  it("renders Meer button", async () => {
    const { MobileNav } = await import("@/components/MobileNav");
    render(<Wrapper><MobileNav /></Wrapper>);
    expect(screen.getByLabelText("Meer navigatie")).toBeInTheDocument();
    expect(screen.getByText("Meer")).toBeInTheDocument();
  });

  it("opens sheet with more items when Meer is clicked", async () => {
    const { MobileNav } = await import("@/components/MobileNav");
    render(<Wrapper><MobileNav /></Wrapper>);
    fireEvent.click(screen.getByLabelText("Meer navigatie"));
    await waitFor(() => {
      expect(screen.getByText("Navigatie")).toBeInTheDocument();
      expect(screen.getByText("Dispatch")).toBeInTheDocument();
      expect(screen.getByText("Ritoverzicht")).toBeInTheDocument();
      expect(screen.getByText("Klanten")).toBeInTheDocument();
      expect(screen.getByText("Chauffeurs")).toBeInTheDocument();
      expect(screen.getByText("Vloot")).toBeInTheDocument();
      expect(screen.getByText("Rapportage")).toBeInTheDocument();
      expect(screen.getByText("Uitzonderingen")).toBeInTheDocument();
      expect(screen.getByText("Facturatie")).toBeInTheDocument();
      expect(screen.getByText("Instellingen")).toBeInTheDocument();
    });
  });

  it("navigates and closes sheet when more-menu item clicked", async () => {
    const { MobileNav } = await import("@/components/MobileNav");
    render(<Wrapper><MobileNav /></Wrapper>);
    fireEvent.click(screen.getByLabelText("Meer navigatie"));
    await waitFor(() => {
      expect(screen.getByText("Dispatch")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Dispatch"));
    expect(mockNavigate).toHaveBeenCalledWith("/dispatch");
  });

  it("highlights Meer button when a more-menu item is active", async () => {
    const { MobileNav } = await import("@/components/MobileNav");
    const qc = createQueryClient();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/dispatch"]}>
          <MobileNav />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const meerButton = screen.getByLabelText("Meer navigatie");
    expect(meerButton.className).toContain("text-primary");
  });
});

// ═══════════════════════════════════════════════════════════════
// BarcodeScanner
// ═══════════════════════════════════════════════════════════════
describe("BarcodeScanner", () => {
  beforeEach(() => {
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: {
        getUserMedia: vi.fn().mockRejectedValue(new Error("Not allowed")),
      },
    });
  });

  it("returns null when not open", async () => {
    const { BarcodeScanner } = await import("@/components/BarcodeScanner");
    const { container } = render(<BarcodeScanner isOpen={false} onScan={vi.fn()} onClose={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders scanner UI when open", async () => {
    const { BarcodeScanner } = await import("@/components/BarcodeScanner");
    render(<BarcodeScanner isOpen={true} onScan={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText("Scan barcode of QR code")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Barcode / QR code...")).toBeInTheDocument();
    expect(screen.getByText("Bevestig")).toBeInTheDocument();
  });

  it("manual entry triggers onScan", async () => {
    const onScan = vi.fn();
    const { BarcodeScanner } = await import("@/components/BarcodeScanner");
    render(<BarcodeScanner isOpen={true} onScan={onScan} onClose={vi.fn()} />);
    const input = screen.getByPlaceholderText("Barcode / QR code...");
    fireEvent.change(input, { target: { value: "12345" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onScan).toHaveBeenCalledWith("12345");
  });

  it("close button calls onClose", async () => {
    const onClose = vi.fn();
    const { BarcodeScanner } = await import("@/components/BarcodeScanner");
    render(<BarcodeScanner isOpen={true} onScan={vi.fn()} onClose={onClose} />);
    const buttons = screen.getAllByRole("button");
    // The close button contains X icon
    fireEvent.click(buttons[0]);
    expect(onClose).toHaveBeenCalled();
  });
});
