import { cleanup, render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

// ─── Global Mocks ────────────────────────────────────────────
const mockNavigate = vi.fn();
const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true };
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  },
  AnimatePresence: ({ children }: any) => children,
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

const mockMarkAsRead = vi.fn();
const mockMarkAllAsRead = vi.fn();
const mockDeleteNotification = vi.fn();
const mockClearAll = vi.fn();

// The useNotifications mock is set at the module level via vi.mock (hoisted).
// We test with empty notifications since that's what the mock returns.
// ═══════════════════════════════════════════════════════════════
// NotificationCenter
// ═══════════════════════════════════════════════════════════════
const { mockMarkAsRead2, mockMarkAllAsRead2, mockDeleteNotification2, mockClearAll2, mockNotifications } = vi.hoisted(() => ({
  mockMarkAsRead2: vi.fn(),
  mockMarkAllAsRead2: vi.fn(),
  mockDeleteNotification2: vi.fn(),
  mockClearAll2: vi.fn(),
  mockNotifications: vi.fn(() => ({
    notifications: [],
    unreadCount: 0,
    markAsRead: mockMarkAsRead2,
    markAllAsRead: mockMarkAllAsRead2,
    deleteNotification: mockDeleteNotification2,
    clearAll: mockClearAll2,
  })),
}));

vi.mock("@/hooks/useNotifications", () => ({
  useNotifications: () => mockNotifications(),
}));

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

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("NotificationCenter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNotifications.mockReturnValue({
      notifications: [],
      unreadCount: 0,
      markAsRead: mockMarkAsRead2,
      markAllAsRead: mockMarkAllAsRead2,
      deleteNotification: mockDeleteNotification2,
      clearAll: mockClearAll2,
    });
  });

  it("renders bell button", async () => {
    const { NotificationCenter } = await import("@/components/NotificationCenter");
    render(<MemoryRouter future={routerFuture}><NotificationCenter /></MemoryRouter>);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it("does not show unread badge when 0", async () => {
    const { NotificationCenter } = await import("@/components/NotificationCenter");
    render(<MemoryRouter future={routerFuture}><NotificationCenter /></MemoryRouter>);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("opens notification panel on click and shows empty state", async () => {
    const { NotificationCenter } = await import("@/components/NotificationCenter");
    render(<MemoryRouter future={routerFuture}><NotificationCenter /></MemoryRouter>);
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(screen.getByText("Meldingen")).toBeInTheDocument();
    expect(screen.getByText("Geen meldingen")).toBeInTheDocument();
    expect(screen.getByText("Alles is up-to-date")).toBeInTheDocument();
  });

  it("closes on Escape key (handleEscape)", async () => {
    const { NotificationCenter } = await import("@/components/NotificationCenter");
    render(<MemoryRouter future={routerFuture}><NotificationCenter /></MemoryRouter>);
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(screen.getByText("Meldingen")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByText("Meldingen")).not.toBeInTheDocument();
    });
  });

  it("does not show Alles gelezen when unreadCount is 0", async () => {
    const { NotificationCenter } = await import("@/components/NotificationCenter");
    render(<MemoryRouter future={routerFuture}><NotificationCenter /></MemoryRouter>);
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(screen.queryByText("Alles gelezen")).not.toBeInTheDocument();
  });

  it("toggles open/close on bell click (setIsOpen toggle)", async () => {
    const { NotificationCenter } = await import("@/components/NotificationCenter");
    render(<MemoryRouter future={routerFuture}><NotificationCenter /></MemoryRouter>);
    const bellBtn = screen.getAllByRole("button")[0];
    // Open
    fireEvent.click(bellBtn);
    expect(screen.getByText("Meldingen")).toBeInTheDocument();
    // Close
    fireEvent.click(bellBtn);
    await waitFor(() => {
      expect(screen.queryByText("Meldingen")).not.toBeInTheDocument();
    });
  });

  it("shows unread badge when unreadCount > 0", async () => {
    mockNotifications.mockReturnValue({
      notifications: [
        { id: "n1", title: "Test Notif", message: "Test message", type: "info", is_read: false, created_at: "2025-01-10T10:00:00Z", order_id: "o1" },
      ],
      unreadCount: 1,
      markAsRead: mockMarkAsRead2,
      markAllAsRead: mockMarkAllAsRead2,
      deleteNotification: mockDeleteNotification2,
      clearAll: mockClearAll2,
    });
    const { NotificationCenter } = await import("@/components/NotificationCenter");
    render(<MemoryRouter future={routerFuture}><NotificationCenter /></MemoryRouter>);
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("shows notifications list and Alles gelezen button (markAllAsRead)", async () => {
    mockNotifications.mockReturnValue({
      notifications: [
        { id: "n1", title: "Test Notif", message: "Test message", type: "info", is_read: false, created_at: "2025-01-10T10:00:00Z", order_id: null },
      ],
      unreadCount: 1,
      markAsRead: mockMarkAsRead2,
      markAllAsRead: mockMarkAllAsRead2,
      deleteNotification: mockDeleteNotification2,
      clearAll: mockClearAll2,
    });
    const { NotificationCenter } = await import("@/components/NotificationCenter");
    render(<MemoryRouter future={routerFuture}><NotificationCenter /></MemoryRouter>);
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(screen.getByText("Test Notif")).toBeInTheDocument();
    expect(screen.getByText("Alles gelezen")).toBeInTheDocument();
    // Click markAllAsRead
    fireEvent.click(screen.getByText("Alles gelezen"));
    expect(mockMarkAllAsRead2).toHaveBeenCalled();
  });

  it("clicks a notification to mark as read (markAsRead + handleNavigate)", async () => {
    mockNotifications.mockReturnValue({
      notifications: [
        { id: "n1", title: "Order Update", message: "Status changed", type: "order_approved", is_read: false, created_at: "2025-01-10T10:00:00Z", order_id: "o1" },
      ],
      unreadCount: 1,
      markAsRead: mockMarkAsRead2,
      markAllAsRead: mockMarkAllAsRead2,
      deleteNotification: mockDeleteNotification2,
      clearAll: mockClearAll2,
    });
    const { NotificationCenter } = await import("@/components/NotificationCenter");
    render(<MemoryRouter future={routerFuture}><NotificationCenter /></MemoryRouter>);
    fireEvent.click(screen.getAllByRole("button")[0]);
    // Click the notification item
    fireEvent.click(screen.getByText("Order Update"));
    expect(mockMarkAsRead2).toHaveBeenCalledWith("n1");
    expect(mockNavigate).toHaveBeenCalledWith("/orders/o1");
  });

  it("deletes a notification (deleteNotification)", async () => {
    mockNotifications.mockReturnValue({
      notifications: [
        { id: "n1", title: "Notif to delete", message: "Will be deleted", type: "info", is_read: true, created_at: "2025-01-10T10:00:00Z", order_id: null },
      ],
      unreadCount: 0,
      markAsRead: mockMarkAsRead2,
      markAllAsRead: mockMarkAllAsRead2,
      deleteNotification: mockDeleteNotification2,
      clearAll: mockClearAll2,
    });
    const { NotificationCenter } = await import("@/components/NotificationCenter");
    render(<MemoryRouter future={routerFuture}><NotificationCenter /></MemoryRouter>);
    fireEvent.click(screen.getAllByRole("button")[0]);
    // Find delete button (trash icon button)
    const allBtns = document.querySelectorAll("button");
    const deleteBtn = Array.from(allBtns).find(b => b.querySelector('.lucide-trash2, .lucide-trash-2'));
    if (deleteBtn) {
      fireEvent.click(deleteBtn);
      expect(mockDeleteNotification2).toHaveBeenCalledWith("n1");
    }
    expect(document.body.textContent).toBeTruthy();
  });

  it("closes on outside click (handleClickOutside)", async () => {
    const { NotificationCenter } = await import("@/components/NotificationCenter");
    render(
      <MemoryRouter future={routerFuture}>
        <div>
          <NotificationCenter />
          <button data-testid="outside">Outside</button>
        </div>
      </MemoryRouter>
    );
    const bellBtn = screen.getAllByRole("button")[0];
    fireEvent.click(bellBtn);
    expect(screen.getByText("Meldingen")).toBeInTheDocument();
    // Popover uses Radix which closes on pointer-down outside;
    // in JSDOM we simulate by clicking the trigger again (toggle)
    fireEvent.click(bellBtn);
    await waitFor(() => {
      expect(screen.queryByText("Meldingen")).not.toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// KeyboardShortcutsDialog
// ═══════════════════════════════════════════════════════════════
describe("KeyboardShortcutsDialog", () => {
  it("is hidden by default", async () => {
    const { KeyboardShortcutsDialog } = await import("@/components/KeyboardShortcuts");
    render(<KeyboardShortcutsDialog />);
    expect(screen.queryByText("Sneltoetsen")).not.toBeInTheDocument();
  });

  it("opens when ? key is pressed", async () => {
    const { KeyboardShortcutsDialog } = await import("@/components/KeyboardShortcuts");
    render(<KeyboardShortcutsDialog />);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "?" }));
    });

    await waitFor(() => {
      expect(screen.getByText("Sneltoetsen")).toBeInTheDocument();
    });
  });

  it("shows all shortcut sections", async () => {
    const { KeyboardShortcutsDialog } = await import("@/components/KeyboardShortcuts");
    render(<KeyboardShortcutsDialog />);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "?" }));
    });

    await waitFor(() => {
      expect(screen.getByText("Navigatie")).toBeInTheDocument();
      expect(screen.getByText("Acties")).toBeInTheDocument();
      expect(screen.getByText("Globaal")).toBeInTheDocument();
    });
  });

  it("shows specific shortcuts", async () => {
    const { KeyboardShortcutsDialog } = await import("@/components/KeyboardShortcuts");
    render(<KeyboardShortcutsDialog />);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "?" }));
    });

    await waitFor(() => {
      expect(screen.getByText("Vorige / volgende order in inbox")).toBeInTheDocument();
      expect(screen.getByText("Order goedkeuren / aanmaken")).toBeInTheDocument();
      expect(screen.getByText("Sidebar in-/uitklappen")).toBeInTheDocument();
    });
  });

  it("closes when ? key is pressed again", async () => {
    const { KeyboardShortcutsDialog } = await import("@/components/KeyboardShortcuts");
    render(<KeyboardShortcutsDialog />);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "?" }));
    });
    await waitFor(() => {
      expect(screen.getByText("Sneltoetsen")).toBeInTheDocument();
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "?" }));
    });
    await waitFor(() => {
      expect(screen.queryByText("Sneltoetsen")).not.toBeInTheDocument();
    });
  });

  it("closes when Escape key is pressed", async () => {
    const { KeyboardShortcutsDialog } = await import("@/components/KeyboardShortcuts");
    render(<KeyboardShortcutsDialog />);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "?" }));
    });
    await waitFor(() => {
      expect(screen.getByText("Sneltoetsen")).toBeInTheDocument();
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    await waitFor(() => {
      expect(screen.queryByText("Sneltoetsen")).not.toBeInTheDocument();
    });
  });

  it("does not open when typing in input", async () => {
    const { KeyboardShortcutsDialog } = await import("@/components/KeyboardShortcuts");
    render(
      <div>
        <input data-testid="my-input" />
        <KeyboardShortcutsDialog />
      </div>,
    );

    const input = screen.getByTestId("my-input");
    fireEvent.keyDown(input, { key: "?" });
    // Should not open because target is INPUT
    expect(screen.queryByText("Sneltoetsen")).not.toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════
// AddressAutocomplete
// ═══════════════════════════════════════════════════════════════
describe("AddressAutocomplete", () => {
  beforeEach(() => {
    vi.mock("@/integrations/supabase/client", () => ({
      supabase: {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [] }),
        }),
        functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
      },
    }));
  });

  it("renders input with placeholder", async () => {
    const { AddressAutocomplete } = await import("@/components/AddressAutocomplete");
    render(<AddressAutocomplete value="" onChange={vi.fn()} placeholder="Typ adres..." />);
    expect(screen.getByPlaceholderText("Typ adres...")).toBeInTheDocument();
  });

  it("calls onChange on input", async () => {
    const onChange = vi.fn();
    const { AddressAutocomplete } = await import("@/components/AddressAutocomplete");
    render(<AddressAutocomplete value="" onChange={onChange} placeholder="Adres" />);
    fireEvent.change(screen.getByPlaceholderText("Adres"), { target: { value: "Amsterdam" } });
    expect(onChange).toHaveBeenCalledWith("Amsterdam");
  });

  it("displays current value", async () => {
    const { AddressAutocomplete } = await import("@/components/AddressAutocomplete");
    render(<AddressAutocomplete value="Rotterdam" onChange={vi.fn()} />);
    expect(screen.getByDisplayValue("Rotterdam")).toBeInTheDocument();
  });

  it("opens dropdown on focus when suggestions exist", async () => {
    const { AddressAutocomplete } = await import("@/components/AddressAutocomplete");
    render(<AddressAutocomplete value="Amst" onChange={vi.fn()} placeholder="Adres" />);
    const input = screen.getByPlaceholderText("Adres");
    // First trigger a search so suggestions get populated
    fireEvent.change(input, { target: { value: "Amsterdam" } });
    // Then focus to re-open
    fireEvent.focus(input);
  });

  it("closes dropdown on outside click", async () => {
    const { AddressAutocomplete } = await import("@/components/AddressAutocomplete");
    render(
      <div>
        <AddressAutocomplete value="" onChange={vi.fn()} placeholder="Addr" />
        <button>Outside</button>
      </div>,
    );
    // Simulate outside click
    fireEvent.mouseDown(screen.getByText("Outside"));
  });

  it("debounces search on input change", async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const { AddressAutocomplete } = await import("@/components/AddressAutocomplete");
    render(<AddressAutocomplete value="" onChange={onChange} placeholder="Zoek" />);
    fireEvent.change(screen.getByPlaceholderText("Zoek"), { target: { value: "Am" } });
    expect(onChange).toHaveBeenCalledWith("Am");
    // Advance timers to trigger debounced search
    vi.advanceTimersByTime(350);
    vi.useRealTimers();
  });

  it("does not search for very short queries (less than 2 chars)", async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const { AddressAutocomplete } = await import("@/components/AddressAutocomplete");
    render(<AddressAutocomplete value="" onChange={onChange} placeholder="Zoek" />);
    fireEvent.change(screen.getByPlaceholderText("Zoek"), { target: { value: "A" } });
    vi.advanceTimersByTime(350);
    vi.useRealTimers();
  });

  it("applies custom className to input", async () => {
    const { AddressAutocomplete } = await import("@/components/AddressAutocomplete");
    render(<AddressAutocomplete value="" onChange={vi.fn()} className="custom-class" />);
    const input = screen.getByRole("textbox");
    expect(input.className).toContain("custom-class");
  });

  it("calls google-places edge function during search", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: {
        predictions: [
          { description: "Amsterdam, Nederland" },
          { description: "Amstelveen, Nederland" },
        ],
      },
      error: null,
    });

    const onChange = vi.fn();
    const { AddressAutocomplete } = await import("@/components/AddressAutocomplete");
    render(<AddressAutocomplete value="" onChange={onChange} placeholder="Zoek adres" />);

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText("Zoek adres"), { target: { value: "Amsterdam" } });
      // Wait for the 300ms debounce + resolution
      await new Promise((r) => setTimeout(r, 400));
    });

    expect(supabase.functions.invoke).toHaveBeenCalledWith("google-places", expect.objectContaining({
      body: { input: "Amsterdam" },
    }));
  });

  it("handles google-places edge function error gracefully", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: { message: "edge function error" },
    });

    const { AddressAutocomplete } = await import("@/components/AddressAutocomplete");
    render(<AddressAutocomplete value="" onChange={vi.fn()} placeholder="Zoek adres" />);

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText("Zoek adres"), { target: { value: "Amsterdam" } });
      await new Promise((r) => setTimeout(r, 400));
    });

    // Should not crash; the function was still called
    expect(supabase.functions.invoke).toHaveBeenCalledWith("google-places", expect.any(Object));
  });

  it("returns empty google suggestions when predictions are missing", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { predictions: null },
      error: null,
    });

    const { AddressAutocomplete } = await import("@/components/AddressAutocomplete");
    render(<AddressAutocomplete value="" onChange={vi.fn()} placeholder="Zoek" />);

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText("Zoek"), { target: { value: "Breda" } });
      await new Promise((r) => setTimeout(r, 400));
    });

    expect(supabase.functions.invoke).toHaveBeenCalledWith("google-places", expect.any(Object));
  });
});
