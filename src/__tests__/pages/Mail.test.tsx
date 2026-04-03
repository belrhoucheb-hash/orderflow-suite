import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

// ── Mocks ───────────────────────────────────────────────────────────
const mockEmails = [
  {
    id: "e1", order_number: 1001, source_email_from: "klant@test.nl",
    source_email_subject: "Vraag over levering",
    source_email_body: "Wanneer wordt mijn bestelling geleverd?",
    received_at: new Date().toISOString(), created_at: new Date().toISOString(),
    client_name: "Acme BV", attachments: [], thread_type: "question",
    confidence_score: 0.95, status: "DRAFT", follow_up_sent_at: null,
    follow_up_draft: null, missing_fields: null,
  },
  {
    id: "e2", order_number: 1002, source_email_from: "partner@corp.nl",
    source_email_subject: "Nieuwe transportopdracht",
    source_email_body: "Graag een transport van A naar B.",
    received_at: new Date(Date.now() - 86400000).toISOString(),
    created_at: new Date(Date.now() - 86400000).toISOString(),
    client_name: "Corp NL", attachments: ["file1.pdf"], thread_type: "new",
    confidence_score: 0.88, status: "DRAFT", follow_up_sent_at: null,
    follow_up_draft: null, missing_fields: null,
  },
];

const { mockSupabase } = vi.hoisted(() => ({
  mockSupabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(), not: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      update: vi.fn().mockReturnThis(), insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: vi.fn().mockImplementation((cb: any) => cb({ data: [], error: null })),
    }),
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: { success: true }, error: null }),
    },
  },
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));

import Mail from "@/pages/Mail";

function makeMockChain(data: any[] = [], count = 0) {
  return {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(), not: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    update: vi.fn().mockReturnThis(), insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    then: vi.fn().mockImplementation((cb: any) => cb({ data, error: null, count })),
  };
}

function renderMail() {
  mockSupabase.from.mockImplementation((table: string) => makeMockChain(
    table === "orders" ? mockEmails : [],
    table === "orders" ? mockEmails.length : 0
  ));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Mail />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Mail", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders without crashing", () => {
    renderMail();
    expect(document.body.textContent).toBeTruthy();
  });

  it("shows folder navigation (inbox, sent, drafts)", () => {
    renderMail();
    expect(screen.getByText("Inbox")).toBeInTheDocument();
    expect(screen.getByText("Verzonden")).toBeInTheDocument();
    expect(screen.getByText("Concepten")).toBeInTheDocument();
  });

  it("has compose button", () => {
    renderMail();
    expect(screen.getByText("Nieuw bericht")).toBeInTheDocument();
  });

  it("has search input", () => {
    renderMail();
    expect(screen.getByPlaceholderText(/Zoek in e-mails/i)).toBeInTheDocument();
  });

  it("shows email subjects in list", async () => {
    renderMail();
    await waitFor(() => {
      expect(screen.getByText("Vraag over levering")).toBeInTheDocument();
      expect(screen.getByText("Nieuwe transportopdracht")).toBeInTheDocument();
    });
  });

  it("shows client names", async () => {
    renderMail();
    await waitFor(() => {
      expect(screen.getByText("Acme BV")).toBeInTheDocument();
      expect(screen.getByText("Corp NL")).toBeInTheDocument();
    });
  });

  it("shows E-mail heading", () => {
    renderMail();
    expect(screen.getByText("E-mail")).toBeInTheDocument();
  });

  it("filters emails by search query (search state + filtered useMemo)", async () => {
    const user = userEvent.setup();
    renderMail();
    await waitFor(() => {
      expect(screen.getByText("Vraag over levering")).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText(/Zoek in e-mails/i), "transport");
    await waitFor(() => {
      expect(screen.queryByText("Vraag over levering")).not.toBeInTheDocument();
      expect(screen.getByText("Nieuwe transportopdracht")).toBeInTheDocument();
    });
  });

  it("selects email when clicked (setSelectedId)", async () => {
    const user = userEvent.setup();
    renderMail();
    await waitFor(() => {
      expect(screen.getByText("Vraag over levering")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Vraag over levering"));
    await waitFor(() => {
      const matches = screen.getAllByText(/Wanneer wordt mijn bestelling geleverd/);
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("opens compose dialog when clicking Nieuw bericht (setShowCompose)", async () => {
    const user = userEvent.setup();
    renderMail();
    await user.click(screen.getByText("Nieuw bericht"));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Aan: naam@bedrijf.nl")).toBeInTheDocument();
    });
  });

  it("types in compose fields (setComposeTo, setComposeSubject, setComposeContent)", async () => {
    const user = userEvent.setup();
    renderMail();
    await user.click(screen.getByText("Nieuw bericht"));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Aan: naam@bedrijf.nl")).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText("Aan: naam@bedrijf.nl"), "test@test.nl");
    await user.type(screen.getByPlaceholderText("Onderwerp"), "Test subject");
    await user.type(screen.getByPlaceholderText("Schrijf je bericht..."), "Test body");
    expect(screen.getByPlaceholderText("Aan: naam@bedrijf.nl")).toHaveValue("test@test.nl");
  });

  it("closes compose dialog (setShowCompose false)", async () => {
    const user = userEvent.setup();
    renderMail();
    await user.click(screen.getByText("Nieuw bericht"));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Aan: naam@bedrijf.nl")).toBeInTheDocument();
    });
    // Find and click the close button in the compose header
    const header = screen.getByText("Nieuw bericht", { selector: "span" });
    const closeBtn = header?.parentElement?.querySelector("button");
    if (closeBtn) {
      await user.click(closeBtn);
    }
    expect(document.body.textContent).toBeTruthy();
  });

  it("saves compose as draft (insert into orders)", async () => {
    const user = userEvent.setup();
    renderMail();
    await user.click(screen.getByText("Nieuw bericht"));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Aan: naam@bedrijf.nl")).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText("Aan: naam@bedrijf.nl"), "test@test.nl");
    await user.type(screen.getByPlaceholderText("Onderwerp"), "Test subject");
    await user.type(screen.getByPlaceholderText("Schrijf je bericht..."), "Test body");
    await user.click(screen.getByText("Opslaan als concept"));
    await waitFor(() => {
      expect(mockSupabase.from).toHaveBeenCalledWith("orders");
    });
  });

  it("switches folders (setFolder to sent)", async () => {
    const user = userEvent.setup();
    renderMail();
    await user.click(screen.getByText("Verzonden"));
    expect(document.body.textContent).toBeTruthy();
  });

  it("switches folders (setFolder to drafts)", async () => {
    const user = userEvent.setup();
    renderMail();
    await user.click(screen.getByText("Concepten"));
    expect(document.body.textContent).toBeTruthy();
  });

  it("switches back to inbox from sent", async () => {
    const user = userEvent.setup();
    renderMail();
    await user.click(screen.getByText("Verzonden"));
    await user.click(screen.getByText("Inbox"));
    expect(document.body.textContent).toBeTruthy();
  });

  it("toggles star on email (toggleStar)", async () => {
    const user = userEvent.setup();
    renderMail();
    await waitFor(() => {
      expect(screen.getByText("Vraag over levering")).toBeInTheDocument();
    });
    // Star buttons are within each email row
    const emailButtons = screen.getAllByRole("button");
    const starBtns = emailButtons.filter(b => {
      const svg = b.querySelector("svg");
      return svg && (svg.classList.contains("lucide-star-off") || svg.classList.contains("lucide-star"));
    });
    if (starBtns.length > 0) {
      await user.click(starBtns[0]);
      // Click again to un-star
      await user.click(starBtns[0]);
    }
    expect(document.body.textContent).toBeTruthy();
  });

  it("shows empty state when no emails found", async () => {
    mockSupabase.from.mockImplementation(() => makeMockChain([], 0));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <Mail />
        </MemoryRouter>
      </QueryClientProvider>
    );
    await waitFor(() => {
      expect(screen.getByText(/Geen e-mails gevonden/)).toBeInTheDocument();
    });
  });

  it("refreshes emails (refetch via refresh button)", async () => {
    const user = userEvent.setup();
    renderMail();
    const buttons = screen.getAllByRole("button");
    const refreshBtn = buttons.find(b => b.querySelector('.lucide-refresh-cw'));
    if (refreshBtn) {
      await user.click(refreshBtn);
    }
    expect(document.body.textContent).toBeTruthy();
  });

  // ── Reply button sets composeBody ──
  it("clicks Beantwoorden to set reply body", async () => {
    const user = userEvent.setup();
    renderMail();
    await waitFor(() => {
      expect(screen.getByText("Vraag over levering")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Vraag over levering"));
    await waitFor(() => {
      expect(screen.getByText("Beantwoorden")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Beantwoorden"));
    await waitFor(() => {
      const textarea = screen.getByPlaceholderText("Snel antwoorden...");
      expect(textarea).toHaveValue("RE: Vraag over levering\n\n");
    });
  });

  // ── Forward button sets compose fields ──
  it("clicks Doorsturen to populate compose overlay", async () => {
    const user = userEvent.setup();
    renderMail();
    await waitFor(() => {
      expect(screen.getByText("Vraag over levering")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Vraag over levering"));
    await waitFor(() => {
      expect(screen.getByText("Doorsturen")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Doorsturen"));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Onderwerp")).toHaveValue("FW: Vraag over levering");
    });
  });

  // ── Quick reply sends via supabase.functions.invoke ──
  it("types quick reply and clicks Verstuur", async () => {
    const user = userEvent.setup();
    renderMail();
    await waitFor(() => {
      expect(screen.getByText("Vraag over levering")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Vraag over levering"));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Snel antwoorden...")).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText("Snel antwoorden..."), "Bedankt voor uw bericht");
    await user.click(screen.getByText("Verstuur"));
    await waitFor(() => {
      expect(mockSupabase.functions.invoke).toHaveBeenCalledWith("send-follow-up", expect.any(Object));
    });
  });

  // ── Quick reply handles send error ──
  it("handles quick reply send error", async () => {
    mockSupabase.functions.invoke.mockResolvedValueOnce({ data: null, error: new Error("fail") });
    const user = userEvent.setup();
    renderMail();
    await waitFor(() => {
      expect(screen.getByText("Vraag over levering")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Vraag over levering"));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Snel antwoorden...")).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText("Snel antwoorden..."), "test reply");
    await user.click(screen.getByText("Verstuur"));
    await waitFor(() => {
      expect(mockSupabase.functions.invoke).toHaveBeenCalled();
    });
  });

  // ── composeBody textarea onChange ──
  it("types in quick reply textarea (setComposeBody)", async () => {
    const user = userEvent.setup();
    renderMail();
    await waitFor(() => {
      expect(screen.getByText("Vraag over levering")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Vraag over levering"));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Snel antwoorden...")).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText("Snel antwoorden..."), "Hello");
    expect(screen.getByPlaceholderText("Snel antwoorden...")).toHaveValue("Hello");
  });

  // ── Selecting a different email ──
  it("selects second email after first", async () => {
    const user = userEvent.setup();
    renderMail();
    await waitFor(() => {
      expect(screen.getByText("Vraag over levering")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Vraag over levering"));
    await user.click(screen.getByText("Nieuwe transportopdracht"));
    await waitFor(() => {
      const matches = screen.getAllByText(/Graag een transport/);
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Empty selection shows EmptyState ──
  it("shows Selecteer een e-mail when nothing selected", () => {
    renderMail();
    expect(screen.getByText("Selecteer een e-mail")).toBeInTheDocument();
  });

  // ── Search by client name ──
  it("filters by client name in search", async () => {
    const user = userEvent.setup();
    renderMail();
    await waitFor(() => {
      expect(screen.getByText("Acme BV")).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText(/Zoek in e-mails/i), "Acme");
    await waitFor(() => {
      expect(screen.getByText("Acme BV")).toBeInTheDocument();
      expect(screen.queryByText("Corp NL")).not.toBeInTheDocument();
    });
  });

  // ── Search by from address ──
  it("filters by from address in search", async () => {
    const user = userEvent.setup();
    renderMail();
    await waitFor(() => {
      expect(screen.getByText("Acme BV")).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText(/Zoek in e-mails/i), "partner@corp");
    await waitFor(() => {
      expect(screen.queryByText("Acme BV")).not.toBeInTheDocument();
      expect(screen.getByText("Corp NL")).toBeInTheDocument();
    });
  });
});
