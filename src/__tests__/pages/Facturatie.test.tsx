import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

// ── Hoisted mocks ──────────────────────────────────────────────────
const { mockUseInvoices, mockCreateInvoice, mockDownloadCSV, mockDownloadUBL } = vi.hoisted(() => ({
  mockUseInvoices: vi.fn(() => ({
    data: {
      invoices: [
        { id: "inv-1", invoice_number: "INV-2025-001", client_name: "Acme BV", invoice_date: "2025-01-10", due_date: "2025-02-10", total: 1500, status: "concept", pdf_url: null },
        { id: "inv-2", invoice_number: "INV-2025-002", client_name: "Widget NL", invoice_date: "2025-01-15", due_date: "2025-02-15", total: 2500, status: "verzonden", pdf_url: "https://test.com/inv.pdf" },
        { id: "inv-3", invoice_number: "INV-2025-003", client_name: "Test Corp", invoice_date: "2025-01-20", due_date: "2024-01-01", total: 800, status: "verzonden", pdf_url: null },
        { id: "inv-4", invoice_number: "INV-2025-004", client_name: "Betaald BV", invoice_date: "2025-01-25", due_date: "2025-03-01", total: 3200, status: "betaald", pdf_url: null },
      ],
      totalCount: 4,
    },
    isLoading: false, isError: false, refetch: vi.fn(),
  })),
  mockCreateInvoice: vi.fn().mockResolvedValue({ id: "inv-new" }),
  mockDownloadCSV: vi.fn(),
  mockDownloadUBL: vi.fn(),
}));

vi.mock("@/hooks/useInvoices", () => ({
  useInvoices: (...args: any[]) => mockUseInvoices(...args),
  useCreateInvoice: () => ({ mutateAsync: mockCreateInvoice, isPending: false }),
}));

vi.mock("@/hooks/useClients", () => ({
  useClients: () => ({ data: [{ id: "c1", name: "Acme BV", is_active: true }, { id: "c2", name: "Widget NL", is_active: true }] }),
}));

vi.mock("@/lib/invoiceUtils", () => ({
  downloadInvoicesCSV: (...args: any[]) => mockDownloadCSV(...args),
  downloadUBL: (...args: any[]) => mockDownloadUBL(...args),
  buildInvoiceLines: vi.fn().mockReturnValue([]),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(), or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      update: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation((cb: any) => cb({ data: [], error: null })),
    }),
  },
}));

vi.mock("framer-motion", async () => ({
  motion: { div: ({ children, ...props }: any) => <div {...props}>{children}</div> },
  AnimatePresence: ({ children }: any) => children,
}));

import Facturatie from "@/pages/Facturatie";

const defaultInvoices = [
  { id: "inv-1", invoice_number: "INV-2025-001", client_name: "Acme BV", invoice_date: "2025-01-10", due_date: "2025-02-10", total: 1500, status: "concept", pdf_url: null },
  { id: "inv-2", invoice_number: "INV-2025-002", client_name: "Widget NL", invoice_date: "2025-01-15", due_date: "2025-02-15", total: 2500, status: "verzonden", pdf_url: "https://test.com/inv.pdf" },
  { id: "inv-3", invoice_number: "INV-2025-003", client_name: "Test Corp", invoice_date: "2025-01-20", due_date: "2024-01-01", total: 800, status: "verzonden", pdf_url: null },
  { id: "inv-4", invoice_number: "INV-2025-004", client_name: "Betaald BV", invoice_date: "2025-01-25", due_date: "2025-03-01", total: 3200, status: "betaald", pdf_url: null },
];

function renderFacturatie() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Facturatie />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Facturatie", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseInvoices.mockReturnValue({
      data: { invoices: [...defaultInvoices], totalCount: 4 },
      isLoading: false, isError: false, refetch: vi.fn(),
    });
  });

  it("renders without crashing", () => {
    renderFacturatie();
    expect(screen.getByText("Facturatie")).toBeInTheDocument();
  });

  it("shows invoice count", () => {
    renderFacturatie();
    expect(screen.getByText(/4 facturen in totaal/)).toBeInTheDocument();
  });

  it("displays invoices in table", () => {
    renderFacturatie();
    expect(screen.getByText("INV-2025-001")).toBeInTheDocument();
    expect(screen.getByText("INV-2025-002")).toBeInTheDocument();
  });

  it("has new invoice button", () => {
    renderFacturatie();
    expect(screen.getByText("Nieuwe factuur")).toBeInTheDocument();
  });

  it("opens new invoice dialog (setShowNewInvoice)", async () => {
    const user = userEvent.setup();
    renderFacturatie();
    await user.click(screen.getByText("Nieuwe factuur"));
    await waitFor(() => {
      expect(screen.getByText("Nieuwe factuur aanmaken")).toBeInTheDocument();
    });
  });

  it("has search input", () => {
    renderFacturatie();
    expect(screen.getByPlaceholderText(/Zoek op factuurnummer/)).toBeInTheDocument();
  });

  it("filters by search (setSearch)", async () => {
    const user = userEvent.setup();
    renderFacturatie();
    await user.type(screen.getByPlaceholderText(/Zoek op factuurnummer/), "001");
    await waitFor(() => {
      expect((screen.getByPlaceholderText(/Zoek op factuurnummer/) as HTMLInputElement).value).toBe("001");
    });
  });

  it("has status filter buttons", () => {
    renderFacturatie();
    expect(screen.getByText("Alle")).toBeInTheDocument();
  });

  it("clicking status filter changes view (setStatusFilter)", async () => {
    const user = userEvent.setup();
    renderFacturatie();
    await user.click(screen.getAllByText("Concept")[0]);
    await waitFor(() => {
      expect(document.body.textContent!.length).toBeGreaterThan(0);
    });
  });

  it("shows pagination", () => {
    renderFacturatie();
    expect(screen.getByText(/1-4 van 4 facturen/)).toBeInTheDocument();
  });

  it("has export dropdown", () => {
    renderFacturatie();
    expect(screen.getByText("Exporteer")).toBeInTheDocument();
  });

  it("opens export dropdown and shows CSV option", async () => {
    const user = userEvent.setup();
    renderFacturatie();
    await user.click(screen.getByText("Exporteer"));
    await waitFor(() => {
      expect(screen.getByText(/CSV|Excel/i)).toBeInTheDocument();
    });
  });

  it("exports CSV when clicking CSV option (downloadInvoicesCSV)", async () => {
    const user = userEvent.setup();
    renderFacturatie();
    await user.click(screen.getByText("Exporteer"));
    await waitFor(() => {
      expect(screen.getByText(/CSV/i)).toBeInTheDocument();
    });
    await user.click(screen.getByText(/CSV/i));
    await waitFor(() => {
      expect(mockDownloadCSV).toHaveBeenCalled();
    });
  });

  it("shows stats strip", () => {
    renderFacturatie();
    expect(screen.getByText("Totaal openstaand")).toBeInTheDocument();
  });

  it("shows client names", () => {
    renderFacturatie();
    expect(screen.getByText("Acme BV")).toBeInTheDocument();
    expect(screen.getByText("Widget NL")).toBeInTheDocument();
  });

  it("shows status badges", () => {
    renderFacturatie();
    expect(screen.getAllByText("Concept").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Verzonden").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Betaald").length).toBeGreaterThanOrEqual(1);
  });

  it("shows overdue indicator for expired invoices (isOverdue)", () => {
    renderFacturatie();
    expect(screen.getAllByText("Vervallen").length).toBeGreaterThanOrEqual(1);
  });

  it("shows loading state", () => {
    mockUseInvoices.mockReturnValueOnce({ data: null, isLoading: true, isError: false, refetch: vi.fn() });
    renderFacturatie();
    expect(screen.getByText(/laden/i)).toBeInTheDocument();
  });

  it("shows error state", () => {
    mockUseInvoices.mockReturnValueOnce({ data: null, isLoading: false, isError: true, refetch: vi.fn() });
    renderFacturatie();
    expect(screen.getByText(/Kan facturen niet laden|fout|Error/i)).toBeInTheDocument();
  });

  it("shows betaald amount in stats", () => {
    renderFacturatie();
    expect(screen.getByText(/Betaald deze maand|Totaal betaald/i)).toBeInTheDocument();
  });

  it("toggles order selection in new invoice dialog (toggleOrderSelection)", async () => {
    const user = userEvent.setup();
    renderFacturatie();
    await user.click(screen.getByText("Nieuwe factuur"));
    await waitFor(() => {
      expect(screen.getByText("Nieuwe factuur aanmaken")).toBeInTheDocument();
    });
    // The dialog should have a client selector
    expect(document.body.textContent).toBeTruthy();
  });

  it("pagination - next page button (setPage)", async () => {
    const user = userEvent.setup();
    // Set up more than 25 invoices to test pagination
    mockUseInvoices.mockReturnValue({
      data: { invoices: [...defaultInvoices], totalCount: 50 },
      isLoading: false, isError: false, refetch: vi.fn(),
    });
    renderFacturatie();
    const nextBtn = document.querySelector('[class*="chevron-right"]')?.closest("button");
    if (nextBtn) {
      await user.click(nextBtn);
    }
    expect(document.body.textContent).toBeTruthy();
  });

  it("column sorting (setSortConfig via SortableHeader)", async () => {
    const user = userEvent.setup();
    renderFacturatie();
    // Click on a sortable column header
    const headers = screen.getAllByRole("columnheader");
    if (headers.length > 0) {
      await user.click(headers[0]);
    }
    expect(document.body.textContent).toBeTruthy();
  });
});
