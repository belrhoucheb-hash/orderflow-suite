import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

// ── Hoisted mock ────────────────────────────────────────────────────
const { mockSupabase } = vi.hoisted(() => ({
  mockSupabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  },
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));
vi.mock("@/lib/companyConfig", () => ({ DEFAULT_COMPANY: { name: "OrderFlow Suite" } }));

import TrackTrace from "@/pages/TrackTrace";

function renderTrackTrace() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <TrackTrace />
    </MemoryRouter>
  );
}

function setupMockOrder(orderData: any) {
  mockSupabase.from.mockImplementation(() => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: orderData, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: orderData, error: null }),
  }));
}

describe("TrackTrace", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it("renders without crashing", () => {
    renderTrackTrace();
    expect(screen.getByText(/Track & Trace|Track/i)).toBeInTheDocument();
  });

  it("has search input for order number", () => {
    renderTrackTrace();
    const input = screen.getByPlaceholderText(/ordernummer|zending|trackingcode/i);
    expect(input).toBeInTheDocument();
  });

  it("has search button", () => {
    renderTrackTrace();
    const btn = screen.getByRole("button", { name: /zoek|track|volg/i });
    expect(btn).toBeInTheDocument();
  });

  it("shows page title", () => {
    renderTrackTrace();
    expect(screen.getByText(/Track/i)).toBeInTheDocument();
  });

  it("shows company name", () => {
    renderTrackTrace();
    expect(screen.getByText("OrderFlow Suite")).toBeInTheDocument();
  });

  it("shows description text", () => {
    renderTrackTrace();
    expect(screen.getByText(/ordernummer in om uw zending te volgen/i)).toBeInTheDocument();
  });

  it("search button is disabled when input is empty", () => {
    renderTrackTrace();
    const btn = screen.getByRole("button", { name: /volg zending/i });
    expect(btn).toBeDisabled();
  });

  it("search button is enabled when input has value", async () => {
    const user = userEvent.setup();
    renderTrackTrace();
    await user.type(screen.getByPlaceholderText(/ordernummer|trackingcode/i), "1001");
    const btn = screen.getByRole("button", { name: /volg zending/i });
    expect(btn).not.toBeDisabled();
  });

  it("shows not found message when order is not found", async () => {
    const user = userEvent.setup();
    mockSupabase.from.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }));
    renderTrackTrace();
    await user.type(screen.getByPlaceholderText(/ordernummer|trackingcode/i), "99999");
    await user.click(screen.getByRole("button", { name: /volg zending/i }));
    await waitFor(() => {
      expect(screen.getByText("Geen zending gevonden")).toBeInTheDocument();
    });
  });

  it("shows order details when order is found", async () => {
    const user = userEvent.setup();
    setupMockOrder({
      order_number: 1001,
      client_name: "Acme BV",
      status: "IN_TRANSIT",
      pickup_address: "Amsterdam",
      delivery_address: "Rotterdam",
      weight_kg: 500,
      created_at: "2025-01-10T10:00:00Z",
    });
    renderTrackTrace();
    await user.type(screen.getByPlaceholderText(/ordernummer|trackingcode/i), "1001");
    await user.click(screen.getByRole("button", { name: /volg zending/i }));
    await waitFor(() => {
      expect(screen.getByText("#1001")).toBeInTheDocument();
      expect(screen.getByText("Acme BV")).toBeInTheDocument();
      expect(screen.getAllByText("Onderweg").length).toBeGreaterThan(0);
    });
  });

  it("shows timeline steps", async () => {
    const user = userEvent.setup();
    setupMockOrder({
      order_number: 1001,
      client_name: "Test",
      status: "PLANNED",
      pickup_address: "A",
      delivery_address: "B",
      weight_kg: 100,
      created_at: "2025-01-10T10:00:00Z",
    });
    renderTrackTrace();
    await user.type(screen.getByPlaceholderText(/ordernummer|trackingcode/i), "1001");
    await user.click(screen.getByRole("button", { name: /volg zending/i }));
    await waitFor(() => {
      expect(screen.getByText("Order ontvangen")).toBeInTheDocument();
      expect(screen.getAllByText("In behandeling").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Gepland").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Onderweg").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Afgeleverd").length).toBeGreaterThan(0);
    });
  });

  it("shows delivery status badge", async () => {
    const user = userEvent.setup();
    setupMockOrder({
      order_number: 1002,
      client_name: "Widget",
      status: "DELIVERED",
      pickup_address: "X",
      delivery_address: "Y",
      weight_kg: 200,
      created_at: "2025-01-10T10:00:00Z",
    });
    renderTrackTrace();
    await user.type(screen.getByPlaceholderText(/ordernummer|trackingcode/i), "1002");
    await user.click(screen.getByRole("button", { name: /volg zending/i }));
    await waitFor(() => {
      expect(screen.getAllByText("Afgeleverd").length).toBeGreaterThan(0);
    });
  });

  it("handles Enter key to search", async () => {
    const user = userEvent.setup();
    setupMockOrder({
      order_number: 1001,
      client_name: "Test",
      status: "PENDING",
      pickup_address: "A",
      delivery_address: "B",
      weight_kg: 100,
      created_at: "2025-01-10T10:00:00Z",
    });
    renderTrackTrace();
    const input = screen.getByPlaceholderText(/ordernummer|trackingcode/i);
    await user.type(input, "1001");
    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(screen.getByText("#1001")).toBeInTheDocument();
    });
  });

  it("shows error message on API failure", async () => {
    const user = userEvent.setup();
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockSupabase.from.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: "DB error" } }),
      maybeSingle: vi.fn().mockRejectedValue(new Error("DB error")),
    }));
    renderTrackTrace();
    await user.type(screen.getByPlaceholderText(/ordernummer|trackingcode/i), "1001");
    await user.click(screen.getByRole("button", { name: /volg zending/i }));
    await waitFor(() => {
      expect(screen.getByText(/fout opgetreden/i)).toBeInTheDocument();
    });
    consoleErrorSpy.mockRestore();
  });

  it("shows pickup and delivery addresses", async () => {
    const user = userEvent.setup();
    setupMockOrder({
      order_number: 1001,
      client_name: "Test",
      status: "IN_TRANSIT",
      pickup_address: "Amsterdam Centrum",
      delivery_address: "Rotterdam Zuid",
      weight_kg: 100,
      created_at: "2025-01-10T10:00:00Z",
    });
    renderTrackTrace();
    await user.type(screen.getByPlaceholderText(/ordernummer|trackingcode/i), "1001");
    await user.click(screen.getByRole("button", { name: /volg zending/i }));
    await waitFor(() => {
      expect(screen.getByText(/Amsterdam Centrum/)).toBeInTheDocument();
      expect(screen.getByText(/Rotterdam Zuid/)).toBeInTheDocument();
    });
  });

  it("does not search when query is empty/whitespace", async () => {
    const user = userEvent.setup();
    renderTrackTrace();
    // Click search with empty input should not trigger
    const btn = screen.getByRole("button", { name: /volg zending/i });
    expect(btn).toBeDisabled();
  });

  it("shows cancelled status", async () => {
    const user = userEvent.setup();
    setupMockOrder({
      order_number: 1003,
      client_name: "Cancel Corp",
      status: "CANCELLED",
      pickup_address: "X",
      delivery_address: "Y",
      weight_kg: 50,
      created_at: "2025-01-10T10:00:00Z",
    });
    renderTrackTrace();
    await user.type(screen.getByPlaceholderText(/ordernummer|trackingcode/i), "1003");
    await user.click(screen.getByRole("button", { name: /volg zending/i }));
    await waitFor(() => {
      expect(screen.getByText("Geannuleerd")).toBeInTheDocument();
    });
  });
});
