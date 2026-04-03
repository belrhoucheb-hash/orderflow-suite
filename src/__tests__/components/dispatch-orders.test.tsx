import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

// ─── Global Mocks ────────────────────────────────────────────
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }) },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(), insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(), delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: null }),
      ilike: vi.fn().mockReturnThis(), or: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(), gte: vi.fn().mockReturnThis(), lt: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
    channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }) }),
    removeChannel: vi.fn(),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    session: { user: { id: "u1" } }, user: { id: "u1", email: "t@t.nl" },
    profile: { display_name: "Test", avatar_url: null }, roles: ["admin"],
    effectiveRole: "admin", isAdmin: true, loading: false, signOut: vi.fn(),
  }),
}));
vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({ tenant: { id: "t1", name: "Test", slug: "test", logoUrl: null, primaryColor: "#dc2626" }, loading: false }),
}));

vi.mock("@/lib/companyConfig", () => ({ DEFAULT_COMPANY: { name: "TestCo", address: "Test Addr 1", country: "NL" } }));
vi.mock("qrcode.react", () => ({ QRCodeSVG: () => <div data-testid="qr-code" /> }));
vi.mock("@/utils/ssccUtils", () => ({ generateSscc18: () => "012345678901234567" }));
vi.mock("@/utils/zplGenerator", () => ({ generateZplLabel: () => "^XA^XZ" }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

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
// TripStatusBadge
// ═══════════════════════════════════════════════════════════════
describe("TripStatusBadge", () => {
  it("renders status label", async () => {
    const { TripStatusBadge } = await import("@/components/dispatch/TripStatusBadge");
    render(<TripStatusBadge status="CONCEPT" />);
    expect(screen.getByText("Concept")).toBeInTheDocument();
  });

  it("renders ACTIEF with ping animation dot", async () => {
    const { TripStatusBadge } = await import("@/components/dispatch/TripStatusBadge");
    const { container } = render(<TripStatusBadge status="ACTIEF" />);
    expect(screen.getByText("Actief")).toBeInTheDocument();
    expect(container.querySelector(".animate-ping")).toBeInTheDocument();
  });

  it("renders all trip statuses without crashing", async () => {
    const { TripStatusBadge } = await import("@/components/dispatch/TripStatusBadge");
    const statuses = ["CONCEPT", "VERZENDKLAAR", "VERZONDEN", "ONTVANGEN", "GEACCEPTEERD", "GEWEIGERD", "ACTIEF", "VOLTOOID", "AFGEBROKEN"];
    for (const status of statuses) {
      const { unmount } = render(<TripStatusBadge status={status as any} />);
      unmount();
    }
  });
});

describe("StopStatusBadge", () => {
  it("renders stop status label", async () => {
    const { StopStatusBadge } = await import("@/components/dispatch/TripStatusBadge");
    render(<StopStatusBadge status="GEPLAND" />);
    expect(screen.getByText("Gepland")).toBeInTheDocument();
  });
});

describe("TripProgressBar", () => {
  it("renders progress fraction", async () => {
    const { TripProgressBar } = await import("@/components/dispatch/TripStatusBadge");
    render(<TripProgressBar stops={[
      { stop_status: "AFGELEVERD" },
      { stop_status: "GEPLAND" },
      { stop_status: "MISLUKT" },
    ]} />);
    expect(screen.getByText("2/3")).toBeInTheDocument();
  });

  it("handles empty stops", async () => {
    const { TripProgressBar } = await import("@/components/dispatch/TripStatusBadge");
    render(<TripProgressBar stops={[]} />);
    expect(screen.getByText("0/0")).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════
// SmartLabel
// ═══════════════════════════════════════════════════════════════
describe("SmartLabel", () => {
  const mockOrder = {
    id: "abc-123-def-456",
    order_number: 1001,
    quantity: 5,
    unit: "Pallets",
    weight_kg: 500,
    pickup_address: "Amsterdam, NL",
    delivery_address: "Rotterdam, NL",
    requirements: ["ADR", "KOELING"],
  };

  it("renders order info", async () => {
    const SmartLabel = (await import("@/components/orders/SmartLabel")).default;
    render(<SmartLabel order={mockOrder} />);
    expect(screen.getByText("#1001")).toBeInTheDocument();
    expect(screen.getByText(/5 Pallets/)).toBeInTheDocument();
    expect(screen.getByText(/500 kg/)).toBeInTheDocument();
  });

  it("renders QR code", async () => {
    const SmartLabel = (await import("@/components/orders/SmartLabel")).default;
    render(<SmartLabel order={mockOrder} />);
    expect(screen.getByTestId("qr-code")).toBeInTheDocument();
  });

  it("shows ADR and KOEL badges for matching requirements", async () => {
    const SmartLabel = (await import("@/components/orders/SmartLabel")).default;
    render(<SmartLabel order={mockOrder} />);
    expect(screen.getByText("ADR")).toBeInTheDocument();
    expect(screen.getByText("Koel")).toBeInTheDocument();
  });

  it("shows piece number info", async () => {
    const SmartLabel = (await import("@/components/orders/SmartLabel")).default;
    render(<SmartLabel order={mockOrder} pieceNumber={3} totalPieces={10} />);
    expect(screen.getByText("Piece 3/5")).toBeInTheDocument(); // uses order.quantity
  });

  it("renders addresses", async () => {
    const SmartLabel = (await import("@/components/orders/SmartLabel")).default;
    render(<SmartLabel order={mockOrder} />);
    // Addresses are rendered with CSS uppercase, but text content stays as-is
    expect(screen.getByText("Amsterdam, NL")).toBeInTheDocument();
    expect(screen.getByText("Rotterdam, NL")).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════
// CMRDocument
// ═══════════════════════════════════════════════════════════════
describe("CMRDocument", () => {
  const mockOrder = {
    id: "abc-123",
    order_number: 1001,
    client_name: "ACME Corp",
    pickup_address: "Amsterdam",
    delivery_address: "Rotterdam",
    weight_kg: 5000,
    quantity: 10,
    unit: "Europallets",
    requirements: ["ADR"],
    is_weight_per_unit: false,
    cmr_number: null,
    time_window_start: null,
    time_window_end: null,
    invoice_ref: null,
    dimensions: null,
    internal_note: null,
    pod_signature_url: null,
    pod_signed_by: null,
  };

  it("renders CMR header", async () => {
    const CMRDocument = (await import("@/components/orders/CMRDocument")).default;
    render(<CMRDocument order={mockOrder} />);
    expect(screen.getByText("CMR VRACHTBRIEF")).toBeInTheDocument();
    expect(screen.getByText("International Consignment Note")).toBeInTheDocument();
  });

  it("renders sender and carrier info", async () => {
    const CMRDocument = (await import("@/components/orders/CMRDocument")).default;
    render(<CMRDocument order={mockOrder} tenantName="MijnBedrijf" />);
    expect(screen.getByText("ACME Corp")).toBeInTheDocument();
    // tenantName appears multiple times (carrier, signature, footer), use getAllByText
    expect(screen.getAllByText("MijnBedrijf").length).toBeGreaterThanOrEqual(1);
  });

  it("shows ADR document in attached documents", async () => {
    const CMRDocument = (await import("@/components/orders/CMRDocument")).default;
    render(<CMRDocument order={mockOrder} />);
    expect(screen.getByText(/ADR-transportdocument/)).toBeInTheDocument();
  });

  it("computes weight correctly without per-unit", async () => {
    const CMRDocument = (await import("@/components/orders/CMRDocument")).default;
    render(<CMRDocument order={mockOrder} />);
    // toLocaleString for 5000 = "5,000" or "5.000" depending on locale
    expect(screen.getByText(/5.*000 kg/)).toBeInTheDocument();
  });

  it("computes weight with per-unit", async () => {
    const CMRDocument = (await import("@/components/orders/CMRDocument")).default;
    render(<CMRDocument order={{ ...mockOrder, is_weight_per_unit: true }} />);
    // 5000 * 10 = 50000
    expect(screen.getByText(/50.*000 kg/)).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════
// PodViewer
// ═══════════════════════════════════════════════════════════════
describe("PodViewer", () => {
  it("returns null when no PoD data", async () => {
    const PodViewer = (await import("@/components/orders/PodViewer")).default;
    const { container } = render(<PodViewer order={{ pod_signature_url: null, pod_photos: [], pod_signed_by: null }} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders when signed_by exists", async () => {
    const PodViewer = (await import("@/components/orders/PodViewer")).default;
    render(<PodViewer order={{ pod_signature_url: null, pod_photos: [], pod_signed_by: "Jan" }} />);
    expect(screen.getByText("Proof of Delivery")).toBeInTheDocument();
    expect(screen.getByText(/Jan/)).toBeInTheDocument();
  });

  it("renders signature preview", async () => {
    const PodViewer = (await import("@/components/orders/PodViewer")).default;
    render(<PodViewer order={{ pod_signature_url: "http://sig.png", pod_photos: [], pod_signed_by: "Jan" }} />);
    expect(screen.getByText("Handtekening")).toBeInTheDocument();
    expect(screen.getByAltText("Handtekening ontvanger")).toBeInTheDocument();
  });

  it("renders photo grid", async () => {
    const PodViewer = (await import("@/components/orders/PodViewer")).default;
    render(
      <PodViewer order={{
        pod_signature_url: null,
        pod_photos: ["http://photo1.jpg", "http://photo2.jpg"],
        pod_signed_by: "Jan",
      }} />,
    );
    expect(screen.getByText("Foto-bewijs (2)")).toBeInTheDocument();
  });

  it("hides download in compact mode", async () => {
    const PodViewer = (await import("@/components/orders/PodViewer")).default;
    render(<PodViewer order={{ pod_signature_url: "http://sig.png", pod_photos: [], pod_signed_by: "Jan" }} compact />);
    expect(screen.queryByText("Download PoD")).not.toBeInTheDocument();
  });

  it("shows download in full mode", async () => {
    const PodViewer = (await import("@/components/orders/PodViewer")).default;
    render(<PodViewer order={{ pod_signature_url: "http://sig.png", pod_photos: [], pod_signed_by: "Jan" }} />);
    expect(screen.getByText("Download PoD")).toBeInTheDocument();
  });

  it("triggers download on Download PoD click", async () => {
    const PodViewer = (await import("@/components/orders/PodViewer")).default;
    render(<PodViewer order={{ pod_signature_url: "http://sig.png", pod_photos: [], pod_signed_by: "Jan", order_number: 1001 }} />);
    // Clicking Download PoD creates an anchor element and clicks it
    fireEvent.click(screen.getByText("Download PoD"));
    // The handler ran without throwing
  });

  it("renders pod_signed_at timestamp", async () => {
    const PodViewer = (await import("@/components/orders/PodViewer")).default;
    render(<PodViewer order={{ pod_signature_url: null, pod_photos: [], pod_signed_by: "Jan", pod_signed_at: "2026-04-01T10:30:00Z" }} />);
    // Should display the formatted date
    const dateText = screen.getByText(/apr/i);
    expect(dateText).toBeInTheDocument();
  });

  it("renders pod_notes", async () => {
    const PodViewer = (await import("@/components/orders/PodViewer")).default;
    render(<PodViewer order={{ pod_signature_url: null, pod_photos: [], pod_signed_by: "Jan", pod_notes: "Pakket beschadigd" }} />);
    expect(screen.getByText(/"Pakket beschadigd"/)).toBeInTheDocument();
  });

  it("renders signature dialog trigger as zoom button", async () => {
    const PodViewer = (await import("@/components/orders/PodViewer")).default;
    render(<PodViewer order={{ pod_signature_url: "http://sig.png", pod_photos: [], pod_signed_by: "Jan" }} />);
    // Clicking the signature image should open zoom dialog
    const sigImg = screen.getByAltText("Handtekening ontvanger");
    const button = sigImg.closest("button");
    expect(button).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════
// LabelWorkshop
// ═══════════════════════════════════════════════════════════════
describe("LabelWorkshop", () => {
  const mockOrder = {
    id: "abc",
    order_number: 1001,
    quantity: 5,
    unit: "Colli",
    pickup_address: "A",
    delivery_address: "B",
    weight_kg: 100,
    requirements: [],
  };

  it("renders trigger button", async () => {
    const LabelWorkshop = (await import("@/components/orders/LabelWorkshop")).default;
    render(<LabelWorkshop order={mockOrder} />);
    expect(screen.getByText("Label Workshop")).toBeInTheDocument();
  });

  it("opens dialog on click", async () => {
    const LabelWorkshop = (await import("@/components/orders/LabelWorkshop")).default;
    render(<LabelWorkshop order={mockOrder} />);
    fireEvent.click(screen.getByText("Label Workshop"));
    expect(screen.getByText(/Genereer verzendlabels/)).toBeInTheDocument();
    expect(screen.getByText(/PDF \/ Browser Print/)).toBeInTheDocument();
    expect(screen.getByText(/ZPL Code/)).toBeInTheDocument();
  });

  it("shows dialog title and order number", async () => {
    const LabelWorkshop = (await import("@/components/orders/LabelWorkshop")).default;
    render(<LabelWorkshop order={mockOrder} />);
    fireEvent.click(screen.getByText("Label Workshop"));
    // Multiple elements may contain "Label Workshop" (trigger button + dialog title)
    const workshopElements = screen.getAllByText(/Label Workshop/);
    expect(workshopElements.length).toBeGreaterThanOrEqual(2);
    // Multiple #1001 elements may exist (dialog desc + hidden print labels)
    const orderNumbers = screen.getAllByText(/#1001/);
    expect(orderNumbers.length).toBeGreaterThanOrEqual(1);
  });

  it("shows quantity and start sequence inputs", async () => {
    const LabelWorkshop = (await import("@/components/orders/LabelWorkshop")).default;
    render(<LabelWorkshop order={mockOrder} />);
    fireEvent.click(screen.getByText("Label Workshop"));
    expect(screen.getByText("Aantal Labels (Colli)")).toBeInTheDocument();
    expect(screen.getByText("Start Volgnummer")).toBeInTheDocument();
  });

  it("shows SSCC-18 configuration section", async () => {
    const LabelWorkshop = (await import("@/components/orders/LabelWorkshop")).default;
    render(<LabelWorkshop order={mockOrder} />);
    fireEvent.click(screen.getByText("Label Workshop"));
    expect(screen.getByText("SSCC-18 Configuratie")).toBeInTheDocument();
  });

  it("shows total labels count", async () => {
    const LabelWorkshop = (await import("@/components/orders/LabelWorkshop")).default;
    render(<LabelWorkshop order={mockOrder} />);
    fireEvent.click(screen.getByText("Label Workshop"));
    expect(screen.getByText(/Totaal 5 labels/)).toBeInTheDocument();
  });

  it("shows Start Afdruk button in footer", async () => {
    const LabelWorkshop = (await import("@/components/orders/LabelWorkshop")).default;
    render(<LabelWorkshop order={mockOrder} />);
    fireEvent.click(screen.getByText("Label Workshop"));
    expect(screen.getByText("Start Afdruk")).toBeInTheDocument();
  });

  it("shows Annuleren button in footer", async () => {
    const LabelWorkshop = (await import("@/components/orders/LabelWorkshop")).default;
    render(<LabelWorkshop order={mockOrder} />);
    fireEvent.click(screen.getByText("Label Workshop"));
    expect(screen.getByText("Annuleren")).toBeInTheDocument();
  });

  it("shows total badge with order unit and quantity", async () => {
    const LabelWorkshop = (await import("@/components/orders/LabelWorkshop")).default;
    render(<LabelWorkshop order={mockOrder} />);
    fireEvent.click(screen.getByText("Label Workshop"));
    expect(screen.getByText(/Totaal: 5 Colli/)).toBeInTheDocument();
  });

  it("updates quantity when input changes", async () => {
    const LabelWorkshop = (await import("@/components/orders/LabelWorkshop")).default;
    render(<LabelWorkshop order={mockOrder} />);
    fireEvent.click(screen.getByText("Label Workshop"));
    const qtyInput = screen.getByDisplayValue("5");
    fireEvent.change(qtyInput, { target: { value: "10" } });
    expect(screen.getByText(/Totaal 10 labels/)).toBeInTheDocument();
  });

  it("copies ZPL code when ZPL option clicked", async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    const { toast } = await import("sonner");
    const LabelWorkshop = (await import("@/components/orders/LabelWorkshop")).default;
    render(<LabelWorkshop order={mockOrder} />);
    fireEvent.click(screen.getByText("Label Workshop"));
    fireEvent.click(screen.getByText(/ZPL Code/));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("^XA^XZ");
    expect(toast.success).toHaveBeenCalledWith("ZPL Code gekopieerd!", expect.any(Object));
  });

  it("triggers print when PDF option clicked", async () => {
    const { toast } = await import("sonner");
    const LabelWorkshop = (await import("@/components/orders/LabelWorkshop")).default;
    render(<LabelWorkshop order={mockOrder} />);
    fireEvent.click(screen.getByText("Label Workshop"));
    fireEvent.click(screen.getByText(/PDF \/ Browser Print/));
    expect(toast.info).toHaveBeenCalledWith("Print preview wordt voorbereid...", expect.any(Object));
  });

  it("shows Zebra printer description", async () => {
    const LabelWorkshop = (await import("@/components/orders/LabelWorkshop")).default;
    render(<LabelWorkshop order={mockOrder} />);
    fireEvent.click(screen.getByText("Label Workshop"));
    expect(screen.getByText(/Raw code voor industriële labelprinters/)).toBeInTheDocument();
  });

  it("shows PDF description", async () => {
    const LabelWorkshop = (await import("@/components/orders/LabelWorkshop")).default;
    render(<LabelWorkshop order={mockOrder} />);
    fireEvent.click(screen.getByText("Label Workshop"));
    expect(screen.getByText(/Perfect voor standaard kantoorprinters/)).toBeInTheDocument();
  });

  it("updates start sequence when input changes", async () => {
    const LabelWorkshop = (await import("@/components/orders/LabelWorkshop")).default;
    render(<LabelWorkshop order={mockOrder} />);
    fireEvent.click(screen.getByText("Label Workshop"));
    const seqInput = screen.getByDisplayValue("1");
    fireEvent.change(seqInput, { target: { value: "5" } });
    expect(seqInput).toHaveValue(5);
  });

  it("closes dialog when Annuleren is clicked", async () => {
    const LabelWorkshop = (await import("@/components/orders/LabelWorkshop")).default;
    render(<LabelWorkshop order={mockOrder} />);
    fireEvent.click(screen.getByText("Label Workshop"));
    expect(screen.getByText(/Genereer verzendlabels/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Annuleren"));
    // Dialog should close
    await waitFor(() => {
      expect(screen.queryByText(/Genereer verzendlabels/)).not.toBeInTheDocument();
    });
  });

  it("triggers print via Start Afdruk footer button", async () => {
    const { toast } = await import("sonner");
    const LabelWorkshop = (await import("@/components/orders/LabelWorkshop")).default;
    render(<LabelWorkshop order={mockOrder} />);
    fireEvent.click(screen.getByText("Label Workshop"));
    fireEvent.click(screen.getByText("Start Afdruk"));
    expect(toast.info).toHaveBeenCalledWith("Print preview wordt voorbereid...", expect.any(Object));
  });

  it("handles zero quantity gracefully", async () => {
    const LabelWorkshop = (await import("@/components/orders/LabelWorkshop")).default;
    render(<LabelWorkshop order={{ ...mockOrder, quantity: 0 }} />);
    fireEvent.click(screen.getByText("Label Workshop"));
    // Even with 0 it still renders
    expect(screen.getByText("Aantal Labels (Colli)")).toBeInTheDocument();
  });
});
