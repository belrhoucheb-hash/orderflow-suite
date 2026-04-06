import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect } from "vitest";
import "./inbox-test-setup";
import { baseDraft, baseForm, QWrapper } from "./inbox-test-setup";

// ═══════════════════════════════════════════════════════════════
// InboxSourcePanel
// ═══════════════════════════════════════════════════════════════
describe("SourcePanel", () => {
  const defaultProps = {
    selected: baseDraft as any,
    form: baseForm as any,
    onParseResult: vi.fn(),
  };

  it("renders email subject in header", async () => {
    const { SourcePanel } = await import("@/components/inbox/InboxSourcePanel");
    render(
      <QWrapper>
        <SourcePanel {...defaultProps} />
      </QWrapper>,
    );
    expect(screen.getByText("Transport aanvraag 2 pallets")).toBeInTheDocument();
  });

  it("renders email sender", async () => {
    const { SourcePanel } = await import("@/components/inbox/InboxSourcePanel");
    render(
      <QWrapper>
        <SourcePanel {...defaultProps} />
      </QWrapper>,
    );
    expect(screen.getByText("klant@example.nl")).toBeInTheDocument();
  });

  it("shows Inhoud and Bijlagen tabs", async () => {
    const { SourcePanel } = await import("@/components/inbox/InboxSourcePanel");
    render(
      <QWrapper>
        <SourcePanel {...defaultProps} />
      </QWrapper>,
    );
    expect(screen.getByText("Inhoud")).toBeInTheDocument();
    expect(screen.getByText("Bijlagen")).toBeInTheDocument();
  });

  it("shows Extraheer button", async () => {
    const { SourcePanel } = await import("@/components/inbox/InboxSourcePanel");
    render(
      <QWrapper>
        <SourcePanel {...defaultProps} />
      </QWrapper>,
    );
    expect(screen.getByText("Extraheer")).toBeInTheDocument();
  });

  it("renders email body content", async () => {
    const { SourcePanel } = await import("@/components/inbox/InboxSourcePanel");
    render(
      <QWrapper>
        <SourcePanel {...defaultProps} />
      </QWrapper>,
    );
    // The email body is rendered line by line with AI highlighting that splits text into spans
    // Check for a keyword that won't be split by the highlighter
    expect(screen.getByText(/Graag/)).toBeInTheDocument();
  });

  it("shows Geen onderwerp when subject is null", async () => {
    const { SourcePanel } = await import("@/components/inbox/InboxSourcePanel");
    render(
      <QWrapper>
        <SourcePanel {...defaultProps} selected={{ ...baseDraft, source_email_subject: null } as any} />
      </QWrapper>,
    );
    expect(screen.getByText("Geen onderwerp")).toBeInTheDocument();
  });

  it("shows dash when sender is null", async () => {
    const { SourcePanel } = await import("@/components/inbox/InboxSourcePanel");
    render(
      <QWrapper>
        <SourcePanel {...defaultProps} selected={{ ...baseDraft, source_email_from: null } as any} />
      </QWrapper>,
    );
    // The component shows "\u2014" for null sender
    const dashElements = screen.getAllByText("\u2014");
    expect(dashElements.length).toBeGreaterThanOrEqual(1);
  });

  it("shows Geen inhoud when body is null", async () => {
    const { SourcePanel } = await import("@/components/inbox/InboxSourcePanel");
    render(
      <QWrapper>
        <SourcePanel {...defaultProps} selected={{ ...baseDraft, source_email_body: null } as any} />
      </QWrapper>,
    );
    expect(screen.getByText("Geen inhoud beschikbaar")).toBeInTheDocument();
  });

  it("switches to attachment tab and shows Geen bijlagen", async () => {
    const { SourcePanel } = await import("@/components/inbox/InboxSourcePanel");
    render(
      <QWrapper>
        <SourcePanel {...defaultProps} />
      </QWrapper>,
    );
    fireEvent.click(screen.getByText("Bijlagen"));
    expect(screen.getByText("Geen bijlagen")).toBeInTheDocument();
  });

  it("shows attachments when present", async () => {
    const { SourcePanel } = await import("@/components/inbox/InboxSourcePanel");
    render(
      <QWrapper>
        <SourcePanel {...defaultProps} selected={{
          ...baseDraft,
          attachments: [
            { name: "document.pdf", url: "http://example.com/doc.pdf", type: "application/pdf" },
          ],
        } as any} />
      </QWrapper>,
    );
    fireEvent.click(screen.getByText("Bijlagen"));
    expect(screen.getByText("document.pdf")).toBeInTheDocument();
    expect(screen.getByText("PDF Document")).toBeInTheDocument();
  });

  it("shows image attachment", async () => {
    const { SourcePanel } = await import("@/components/inbox/InboxSourcePanel");
    render(
      <QWrapper>
        <SourcePanel {...defaultProps} selected={{
          ...baseDraft,
          attachments: [
            { name: "foto.jpg", url: "http://example.com/foto.jpg", type: "image/jpeg" },
          ],
        } as any} />
      </QWrapper>,
    );
    fireEvent.click(screen.getByText("Bijlagen"));
    expect(screen.getByText("foto.jpg")).toBeInTheDocument();
    expect(screen.getByText("Afbeelding")).toBeInTheDocument();
  });

  it("shows attachment count badge", async () => {
    const { SourcePanel } = await import("@/components/inbox/InboxSourcePanel");
    render(
      <QWrapper>
        <SourcePanel {...defaultProps} selected={{
          ...baseDraft,
          attachments: [
            { name: "a.pdf", url: "#", type: "application/pdf" },
            { name: "b.pdf", url: "#", type: "application/pdf" },
          ],
        } as any} />
      </QWrapper>,
    );
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("shows Beantwoorden and Doorsturen buttons", async () => {
    const { SourcePanel } = await import("@/components/inbox/InboxSourcePanel");
    render(
      <QWrapper>
        <SourcePanel {...defaultProps} />
      </QWrapper>,
    );
    expect(screen.getByText("Beantwoorden")).toBeInTheDocument();
    expect(screen.getByText("Doorsturen")).toBeInTheDocument();
  });

  it("opens reply mode when Beantwoorden clicked", async () => {
    const { SourcePanel } = await import("@/components/inbox/InboxSourcePanel");
    render(
      <QWrapper>
        <SourcePanel {...defaultProps} />
      </QWrapper>,
    );
    fireEvent.click(screen.getByText("Beantwoorden"));
    expect(screen.getByText(/Aan:/)).toBeInTheDocument();
    expect(screen.getByText("Annuleren")).toBeInTheDocument();
  });

  it("opens forward mode when Doorsturen clicked", async () => {
    const { SourcePanel } = await import("@/components/inbox/InboxSourcePanel");
    render(
      <QWrapper>
        <SourcePanel {...defaultProps} />
      </QWrapper>,
    );
    fireEvent.click(screen.getByText("Doorsturen"));
    expect(screen.getByText("Doorsturen", { selector: "p" })).toBeInTheDocument();
  });

  it("pre-fills reply with follow_up_draft when missing fields exist", async () => {
    const { SourcePanel } = await import("@/components/inbox/InboxSourcePanel");
    render(
      <QWrapper>
        <SourcePanel {...defaultProps} selected={{
          ...baseDraft,
          missing_fields: ["gewicht"],
          follow_up_draft: "Beste klant, wij missen het gewicht.",
        } as any} />
      </QWrapper>,
    );
    fireEvent.click(screen.getByText("Beantwoorden"));
    await waitFor(() => {
      const textarea = screen.getByPlaceholderText("Typ je antwoord...");
      expect(textarea).toHaveValue("Beste klant, wij missen het gewicht.");
    });
  });

  it("shows AI concept badge in reply mode for missing fields", async () => {
    const { SourcePanel } = await import("@/components/inbox/InboxSourcePanel");
    render(
      <QWrapper>
        <SourcePanel {...defaultProps} selected={{
          ...baseDraft,
          missing_fields: ["gewicht"],
          follow_up_draft: "concept",
        } as any} />
      </QWrapper>,
    );
    fireEvent.click(screen.getByText("Beantwoorden"));
    expect(screen.getByText("AI concept")).toBeInTheDocument();
  });

  it("cancels reply mode", async () => {
    const { SourcePanel } = await import("@/components/inbox/InboxSourcePanel");
    render(
      <QWrapper>
        <SourcePanel {...defaultProps} />
      </QWrapper>,
    );
    fireEvent.click(screen.getByText("Beantwoorden"));
    expect(screen.getByText("Annuleren")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Annuleren"));
    // Back to normal mode - reply/forward buttons visible
    expect(screen.getByText("Beantwoorden")).toBeInTheDocument();
  });

  it("disables send button when reply text is empty", async () => {
    const { SourcePanel } = await import("@/components/inbox/InboxSourcePanel");
    render(
      <QWrapper>
        <SourcePanel {...defaultProps} />
      </QWrapper>,
    );
    fireEvent.click(screen.getByText("Beantwoorden"));
    const sendBtn = screen.getByText("Verstuur");
    expect(sendBtn.closest("button")).toBeDisabled();
  });
});

// ═══════════════════════════════════════════════════════════════
// InboxSourcePanel -- Extended Coverage
// ═══════════════════════════════════════════════════════════════
describe("SourcePanel – highlightEmailBody", () => {
  const renderSource = async (body: string, form: any) => {
    const { SourcePanel } = await import("@/components/inbox/InboxSourcePanel");
    return render(
      <QWrapper>
        <SourcePanel
          selected={{ ...baseDraft, source_email_body: body } as any}
          form={form}
          onParseResult={vi.fn()}
        />
      </QWrapper>,
    );
  };

  it("highlights pickup address parts (>4 chars) with red", async () => {
    const { container } = await renderSource(
      "Ophalen in Amsterdam Centrum morgen",
      { ...baseForm, pickupAddress: "Amsterdam Centrum, Nederland" },
    );
    const redTags = container.querySelectorAll("span.text-red-600");
    expect(redTags.length).toBeGreaterThanOrEqual(1);
  });

  it("highlights delivery address parts with red", async () => {
    const { container } = await renderSource(
      "Afleveren in Rotterdam Zuid",
      { ...baseForm, deliveryAddress: "Rotterdam Zuid, Nederland" },
    );
    const redTags = container.querySelectorAll("span.text-red-600");
    expect(redTags.length).toBeGreaterThanOrEqual(1);
  });

  it("highlights weight value with blue (dot format)", async () => {
    const { container } = await renderSource(
      "Het totale gewicht is 22.000 kg",
      { ...baseForm, weight: "22.000" },
    );
    const blueTags = container.querySelectorAll("span.text-blue-600");
    expect(blueTags.length).toBeGreaterThanOrEqual(1);
  });

  it("highlights weight value with blue (comma format)", async () => {
    const { container } = await renderSource(
      "Het gewicht bedraagt 22,000 kg",
      { ...baseForm, weight: "22.000" },
    );
    const blueTags = container.querySelectorAll("span.text-blue-600");
    expect(blueTags.length).toBeGreaterThanOrEqual(1);
  });

  it("highlights quantity + unit (e.g. 12 pallets) with blue", async () => {
    const { container } = await renderSource(
      "Wij hebben 12 pallets klaarstaan",
      { ...baseForm, quantity: 12, unit: "Pallets" },
    );
    const blueTags = container.querySelectorAll("span.text-blue-600");
    expect(blueTags.length).toBeGreaterThanOrEqual(1);
  });

  it("highlights quantity with x-suffix (2x) with blue", async () => {
    const { container } = await renderSource(
      "Graag 2x ophalen",
      { ...baseForm, quantity: 2, unit: "Pallets" },
    );
    const blueTags = container.querySelectorAll("span.text-blue-600");
    expect(blueTags.length).toBeGreaterThanOrEqual(1);
  });

  it("highlights requirement keyword koeling in green", async () => {
    const { container } = await renderSource(
      "Dit is een koeling transport",
      { ...baseForm },
    );
    const greenTags = container.querySelectorAll("span.text-emerald-600");
    expect(greenTags.length).toBeGreaterThanOrEqual(1);
  });

  it("highlights requirement keyword ADR in green", async () => {
    const { container } = await renderSource(
      "De lading is ADR geclassificeerd",
      { ...baseForm },
    );
    const greenTags = container.querySelectorAll("span.text-emerald-600");
    expect(greenTags.length).toBeGreaterThanOrEqual(1);
  });

  it("highlights multiple requirement keywords (douane, laadklep)", async () => {
    const { container } = await renderSource(
      "Graag met laadklep en douane documenten",
      { ...baseForm },
    );
    const greenTags = container.querySelectorAll("span.text-emerald-600");
    expect(greenTags.length).toBeGreaterThanOrEqual(2);
  });

  it("deduplicates highlights (same word twice still highlights both occurrences)", async () => {
    const { container } = await renderSource(
      "pallets en nog meer pallets",
      { ...baseForm, quantity: 12, unit: "Pallets" },
    );
    const blueTags = container.querySelectorAll("span.text-blue-600");
    // "pallets" appears twice in body, dedup in highlight list but regex matches both
    expect(blueTags.length).toBeGreaterThanOrEqual(2);
  });

  it("does not highlight short address parts (<=4 chars)", async () => {
    const { container } = await renderSource(
      "Ophalen in NL, bij de haven",
      { ...baseForm, pickupAddress: "NL, Amsterdam Centrum" },
    );
    // "NL" is only 2 chars, should not be highlighted as address
    const redSpans = Array.from(container.querySelectorAll("span.text-red-600"));
    const nlHighlight = redSpans.find(s => s.textContent?.replace("AI", "").trim() === "NL");
    expect(nlHighlight).toBeUndefined();
  });

  it("returns body unchanged when form is null", async () => {
    const { container } = await renderSource("Plain text email body", null);
    expect(screen.getByText("Plain text email body")).toBeInTheDocument();
    const aiSpans = container.querySelectorAll("span.text-red-600, span.text-blue-600, span.text-emerald-600");
    expect(aiSpans.length).toBe(0);
  });

  it("returns body unchanged when no form data matches", async () => {
    const { container } = await renderSource(
      "Geen relevante termen hier",
      { ...baseForm, pickupAddress: "", deliveryAddress: "", weight: "", quantity: 0 },
    );
    const aiSpans = container.querySelectorAll("span.text-red-600, span.text-blue-600, span.text-emerald-600");
    expect(aiSpans.length).toBe(0);
  });

  it("highlights unit words (europallets, colli) independently", async () => {
    const { container } = await renderSource(
      "Levering van europallets en colli",
      { ...baseForm },
    );
    const blueTags = container.querySelectorAll("span.text-blue-600");
    expect(blueTags.length).toBeGreaterThanOrEqual(2);
  });

  it("each highlight span contains an AI superscript tag", async () => {
    const { container } = await renderSource(
      "Ophalen in Amsterdam Centrum",
      { ...baseForm, pickupAddress: "Amsterdam Centrum, Nederland" },
    );
    const highlightSpans = container.querySelectorAll("span.text-red-600.font-semibold");
    expect(highlightSpans.length).toBeGreaterThanOrEqual(1);
    highlightSpans.forEach(span => {
      const aiTag = span.querySelector("span");
      expect(aiTag?.textContent).toBe("AI");
    });
  });
});

describe("SourcePanel – handleParseWithAI", () => {
  it("calls parse-order and onParseResult with mapped fields", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const onParseResult = vi.fn();
    const mockExtracted = {
      extracted: {
        transport_type: "direct",
        pickup_address: "Utrecht",
        delivery_address: "Eindhoven",
        quantity: 5,
        unit: "Pallets",
        weight_kg: 1200,
        dimensions: "120x80",
        requirements: ["Koeling"],
        is_weight_per_unit: false,
        confidence_score: 92,
        field_confidence: { pickup_address: 0.95 },
        client_name: "Test BV",
      },
      missing_fields: [],
      follow_up_draft: null,
      thread_type: "new",
      changes_detected: [],
      anomalies: [],
    };
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({ data: mockExtracted, error: null });

    const { SourcePanel } = await import("@/components/inbox/InboxSourcePanel");
    render(
      <QWrapper>
        <SourcePanel selected={baseDraft as any} form={baseForm as any} onParseResult={onParseResult} />
      </QWrapper>,
    );

    fireEvent.click(screen.getByText("Extraheer"));

    await waitFor(() => {
      expect(supabase.functions.invoke).toHaveBeenCalledWith("parse-order", expect.objectContaining({
        body: expect.objectContaining({ emailBody: baseDraft.source_email_body }),
      }));
    });

    await waitFor(() => {
      expect(onParseResult).toHaveBeenCalledWith(expect.objectContaining({
        pickupAddress: "Utrecht",
        deliveryAddress: "Eindhoven",
        quantity: 5,
        unit: "Pallets",
        weight: "1200",
        requirements: ["Koeling"],
      }));
    });
  });

  it("normalizes confidence from 0-1 float to 0-100 int and saves to DB", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) });
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(), insert: vi.fn().mockReturnThis(),
      update: mockUpdate, delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: null }),
      ilike: vi.fn().mockReturnThis(), or: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as any);

    const mockExtracted = {
      extracted: {
        transport_type: "direct", pickup_address: "", delivery_address: "",
        quantity: 0, unit: "Pallets", weight_kg: 0, dimensions: "",
        requirements: [], is_weight_per_unit: false,
        confidence_score: 0.85, field_confidence: {},
      },
      missing_fields: [],
    };
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({ data: mockExtracted, error: null });

    const { SourcePanel } = await import("@/components/inbox/InboxSourcePanel");
    render(
      <QWrapper>
        <SourcePanel selected={baseDraft as any} form={baseForm as any} onParseResult={vi.fn()} />
      </QWrapper>,
    );

    fireEvent.click(screen.getByText("Extraheer"));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
        confidence_score: 85,
      }));
    });

    // Restore default mock
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(), insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(), delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: null }),
      ilike: vi.fn().mockReturnThis(), or: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as any);
  });

  it("shows toast.error when functions.invoke returns error", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { toast } = await import("sonner");
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({ data: null, error: { message: "Network error" } });

    const { SourcePanel } = await import("@/components/inbox/InboxSourcePanel");
    render(
      <QWrapper>
        <SourcePanel selected={baseDraft as any} form={baseForm as any} onParseResult={vi.fn()} />
      </QWrapper>,
    );

    fireEvent.click(screen.getByText("Extraheer"));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Fout bij AI extractie", expect.any(Object));
    });
  });

  it("shows Analyseert... while parsing", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    let resolveInvoke: any;
    vi.mocked(supabase.functions.invoke).mockReturnValueOnce(
      new Promise((res) => { resolveInvoke = res; }) as any,
    );

    const { SourcePanel } = await import("@/components/inbox/InboxSourcePanel");
    render(
      <QWrapper>
        <SourcePanel selected={baseDraft as any} form={baseForm as any} onParseResult={vi.fn()} />
      </QWrapper>,
    );

    fireEvent.click(screen.getByText("Extraheer"));
    expect(screen.getByText("Analyseert...")).toBeInTheDocument();

    resolveInvoke({ data: { extracted: { confidence_score: 90 } }, error: null });
  });
});

describe("SourcePanel – handleReply branches", () => {
  it("uses AI draft when missing_fields + follow_up_draft exist", async () => {
    const { SourcePanel } = await import("@/components/inbox/InboxSourcePanel");
    render(
      <QWrapper>
        <SourcePanel
          selected={{ ...baseDraft, missing_fields: ["gewicht"], follow_up_draft: "AI draft tekst" } as any}
          form={baseForm as any}
          onParseResult={vi.fn()}
        />
      </QWrapper>,
    );
    fireEvent.click(screen.getByText("Beantwoorden"));
    const textarea = screen.getByPlaceholderText("Typ je antwoord...");
    expect(textarea).toHaveValue("AI draft tekst");
  });

  it("generates template with bullet points when missing_fields but no follow_up_draft", async () => {
    const { SourcePanel } = await import("@/components/inbox/InboxSourcePanel");
    render(
      <QWrapper>
        <SourcePanel
          selected={{ ...baseDraft, missing_fields: ["gewicht", "afmetingen"], follow_up_draft: null } as any}
          form={baseForm as any}
          onParseResult={vi.fn()}
        />
      </QWrapper>,
    );
    fireEvent.click(screen.getByText("Beantwoorden"));
    const textarea = screen.getByPlaceholderText("Typ je antwoord...");
    const val = (textarea as HTMLTextAreaElement).value;
    expect(val).toContain("gewicht");
    expect(val).toContain("afmetingen");
    expect(val).toContain("ACME Corp");
    expect(val).toContain("\u2022");
  });

  it("sets empty reply text when no missing_fields", async () => {
    const { SourcePanel } = await import("@/components/inbox/InboxSourcePanel");
    render(
      <QWrapper>
        <SourcePanel
          selected={{ ...baseDraft, missing_fields: null } as any}
          form={baseForm as any}
          onParseResult={vi.fn()}
        />
      </QWrapper>,
    );
    fireEvent.click(screen.getByText("Beantwoorden"));
    const textarea = screen.getByPlaceholderText("Typ je antwoord...");
    expect(textarea).toHaveValue("");
  });

  it("uses Geachte heer/mevrouw when client_name is null", async () => {
    const { SourcePanel } = await import("@/components/inbox/InboxSourcePanel");
    render(
      <QWrapper>
        <SourcePanel
          selected={{ ...baseDraft, client_name: null, missing_fields: ["gewicht"], follow_up_draft: null } as any}
          form={baseForm as any}
          onParseResult={vi.fn()}
        />
      </QWrapper>,
    );
    fireEvent.click(screen.getByText("Beantwoorden"));
    const textarea = screen.getByPlaceholderText("Typ je antwoord...");
    expect((textarea as HTMLTextAreaElement).value).toContain("Geachte heer/mevrouw");
  });
});

describe("SourcePanel – handleForward", () => {
  it("pre-fills forwarded message with original sender, subject, and body", async () => {
    const { SourcePanel } = await import("@/components/inbox/InboxSourcePanel");
    render(
      <QWrapper>
        <SourcePanel selected={baseDraft as any} form={baseForm as any} onParseResult={vi.fn()} />
      </QWrapper>,
    );
    fireEvent.click(screen.getByText("Doorsturen"));
    const textarea = screen.getByPlaceholderText("Voeg een bericht toe...");
    const val = (textarea as HTMLTextAreaElement).value;
    expect(val).toContain("klant@example.nl");
    expect(val).toContain("Transport aanvraag 2 pallets");
    expect(val).toContain("Doorgestuurd bericht");
    expect(val).toContain("Graag 2 pallets ophalen in Amsterdam");
  });
});

describe("SourcePanel – handleSendReply", () => {
  it("sends reply with RE: subject via send-follow-up and shows toast.success", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { toast } = await import("sonner");
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({ data: null, error: null });

    const { SourcePanel } = await import("@/components/inbox/InboxSourcePanel");
    render(
      <QWrapper>
        <SourcePanel selected={baseDraft as any} form={baseForm as any} onParseResult={vi.fn()} />
      </QWrapper>,
    );

    fireEvent.click(screen.getByText("Beantwoorden"));
    const textarea = screen.getByPlaceholderText("Typ je antwoord...");
    fireEvent.change(textarea, { target: { value: "Bedankt voor uw bericht" } });
    fireEvent.click(screen.getByText("Verstuur"));

    await waitFor(() => {
      expect(supabase.functions.invoke).toHaveBeenCalledWith("send-follow-up", expect.objectContaining({
        body: expect.objectContaining({
          subject: "RE: Transport aanvraag 2 pallets",
          toEmail: "klant@example.nl",
        }),
      }));
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Antwoord verzonden");
    });
  });

  it("falls back to mailto: when send-follow-up fails", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { toast } = await import("sonner");
    const mockWindowOpen = vi.fn();
    const origOpen = window.open;
    window.open = mockWindowOpen;

    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({ data: null, error: { message: "fail" } });

    const { SourcePanel } = await import("@/components/inbox/InboxSourcePanel");
    render(
      <QWrapper>
        <SourcePanel selected={baseDraft as any} form={baseForm as any} onParseResult={vi.fn()} />
      </QWrapper>,
    );

    fireEvent.click(screen.getByText("Beantwoorden"));
    const textarea = screen.getByPlaceholderText("Typ je antwoord...");
    fireEvent.change(textarea, { target: { value: "Test reply text" } });
    fireEvent.click(screen.getByText("Verstuur"));

    await waitFor(() => {
      expect(mockWindowOpen).toHaveBeenCalledWith(expect.stringContaining("mailto:klant@example.nl"));
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("E-mail client geopend", expect.any(Object));
    });

    window.open = origOpen;
  });

  it("uses FW: subject prefix in forward mode", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({ data: null, error: null });

    const { SourcePanel } = await import("@/components/inbox/InboxSourcePanel");
    render(
      <QWrapper>
        <SourcePanel selected={baseDraft as any} form={baseForm as any} onParseResult={vi.fn()} />
      </QWrapper>,
    );

    fireEvent.click(screen.getByText("Doorsturen"));
    // The forward button in the send bar
    const sendBtns = screen.getAllByText("Doorsturen");
    const sendBtn = sendBtns.find(el => el.closest("button")?.querySelector("svg"));
    fireEvent.click(sendBtn?.closest("button") || sendBtns[sendBtns.length - 1]);

    await waitFor(() => {
      expect(supabase.functions.invoke).toHaveBeenCalledWith("send-follow-up", expect.objectContaining({
        body: expect.objectContaining({
          subject: "FW: Transport aanvraag 2 pallets",
          toEmail: "",
        }),
      }));
    });
  });

  it("resets reply mode after successful send", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({ data: null, error: null });

    const { SourcePanel } = await import("@/components/inbox/InboxSourcePanel");
    render(
      <QWrapper>
        <SourcePanel selected={baseDraft as any} form={baseForm as any} onParseResult={vi.fn()} />
      </QWrapper>,
    );

    fireEvent.click(screen.getByText("Beantwoorden"));
    const textarea = screen.getByPlaceholderText("Typ je antwoord...");
    fireEvent.change(textarea, { target: { value: "Some reply" } });
    fireEvent.click(screen.getByText("Verstuur"));

    await waitFor(() => {
      expect(screen.getByText("Beantwoorden")).toBeInTheDocument();
      expect(screen.getByText("Doorsturen")).toBeInTheDocument();
    });
  });
});

describe("SourcePanel – Client Card + Previous Orders", () => {
  it("renders client card with name, city, stats, and previous orders", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const mockClients = [{ id: "c1", name: "ACME Corp", email: "info@acme.nl", phone: "+31612345678", address: "Keizersgracht 1", city: "Amsterdam" }];
    const mockOrders = [
      { id: "o1", order_number: 900, status: "CONFIRMED", pickup_address: "Utrecht, NL", delivery_address: "Den Haag, NL", weight_kg: 800, quantity: 3, unit: "Pallets", created_at: "2026-01-10T10:00:00Z" },
      { id: "o2", order_number: 901, status: "DRAFT", pickup_address: "Leiden, NL", delivery_address: "Breda, NL", weight_kg: 400, quantity: 1, unit: "Colli", created_at: "2026-01-05T10:00:00Z" },
    ];

    const mockChain = {
      select: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      limit: vi.fn(),
      neq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      or: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };

    let callCount = 0;
    mockChain.limit.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve({ data: mockClients });
      return Promise.resolve({ data: mockOrders });
    });

    vi.mocked(supabase.from).mockReturnValue(mockChain as any);

    const { SourcePanel } = await import("@/components/inbox/InboxSourcePanel");
    render(
      <QWrapper>
        <SourcePanel selected={baseDraft as any} form={baseForm as any} onParseResult={vi.fn()} />
      </QWrapper>,
    );

    await waitFor(() => {
      // Client name rendered in the client card
      const acmeElements = screen.getAllByText("ACME Corp");
      expect(acmeElements.length).toBeGreaterThanOrEqual(1);
    });

    // City text may appear multiple times, just check it exists
    const amsterdamElements = screen.getAllByText("Amsterdam");
    expect(amsterdamElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(screen.getByText("Gem. kg")).toBeInTheDocument();
    expect(screen.getByText("\u2713")).toBeInTheDocument();
    expect(screen.getByText("#900")).toBeInTheDocument();
    expect(screen.getByText("#901")).toBeInTheDocument();
    expect(screen.getByText("Eerdere orders")).toBeInTheDocument();

    // Restore default mock
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(), insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(), delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: null }),
      ilike: vi.fn().mockReturnThis(), or: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as any);
  });
});

describe("SourcePanel – Attachment tab extended", () => {
  it("shows Bekijk button for PDF attachment", async () => {
    const { SourcePanel } = await import("@/components/inbox/InboxSourcePanel");
    render(
      <QWrapper>
        <SourcePanel
          selected={{ ...baseDraft, attachments: [{ name: "factuur.pdf", url: "http://example.com/factuur.pdf", type: "application/pdf" }] } as any}
          form={baseForm as any}
          onParseResult={vi.fn()}
        />
      </QWrapper>,
    );
    fireEvent.click(screen.getByText("Bijlagen"));
    expect(screen.getByText("Bekijk")).toBeInTheDocument();
    expect(screen.getByText("PDF Document")).toBeInTheDocument();
  });

  it("shows preview image for image attachment", async () => {
    const { SourcePanel } = await import("@/components/inbox/InboxSourcePanel");
    render(
      <QWrapper>
        <SourcePanel
          selected={{ ...baseDraft, attachments: [{ name: "foto.jpg", url: "http://example.com/foto.jpg", type: "image/jpeg" }] } as any}
          form={baseForm as any}
          onParseResult={vi.fn()}
        />
      </QWrapper>,
    );
    fireEvent.click(screen.getByText("Bijlagen"));
    const img = screen.getByAltText("foto.jpg");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "http://example.com/foto.jpg");
    expect(screen.getByText("Afbeelding")).toBeInTheDocument();
  });

  it("calls window.open when Bekijk button clicked on PDF", async () => {
    const mockWindowOpen = vi.fn();
    const origOpen = window.open;
    window.open = mockWindowOpen;

    const { SourcePanel } = await import("@/components/inbox/InboxSourcePanel");
    render(
      <QWrapper>
        <SourcePanel
          selected={{ ...baseDraft, attachments: [{ name: "doc.pdf", url: "http://example.com/doc.pdf", type: "application/pdf" }] } as any}
          form={baseForm as any}
          onParseResult={vi.fn()}
        />
      </QWrapper>,
    );
    fireEvent.click(screen.getByText("Bijlagen"));
    fireEvent.click(screen.getByText("Bekijk"));
    expect(mockWindowOpen).toHaveBeenCalledWith("http://example.com/doc.pdf", "_blank");

    window.open = origOpen;
  });

  it("calls window.open when download button clicked on image", async () => {
    const mockWindowOpen = vi.fn();
    const origOpen = window.open;
    window.open = mockWindowOpen;

    const { SourcePanel } = await import("@/components/inbox/InboxSourcePanel");
    const { container } = render(
      <QWrapper>
        <SourcePanel
          selected={{ ...baseDraft, attachments: [{ name: "image.png", url: "http://example.com/image.png", type: "image/png" }] } as any}
          form={baseForm as any}
          onParseResult={vi.fn()}
        />
      </QWrapper>,
    );
    fireEvent.click(screen.getByText("Bijlagen"));
    // The download button is a ghost icon button
    const buttons = container.querySelectorAll("button");
    const downloadBtn = Array.from(buttons).find(b => b.classList.contains("h-7") && b.classList.contains("w-7"));
    expect(downloadBtn).toBeDefined();
    fireEvent.click(downloadBtn!);
    expect(mockWindowOpen).toHaveBeenCalledWith("http://example.com/image.png", "_blank");

    window.open = origOpen;
  });

  it("does not show image preview when url is #", async () => {
    const { SourcePanel } = await import("@/components/inbox/InboxSourcePanel");
    render(
      <QWrapper>
        <SourcePanel
          selected={{ ...baseDraft, attachments: [{ name: "photo.jpg", url: "#", type: "image/jpeg" }] } as any}
          form={baseForm as any}
          onParseResult={vi.fn()}
        />
      </QWrapper>,
    );
    fireEvent.click(screen.getByText("Bijlagen"));
    // When url is "#", the image preview should not render (att.url !== "#" check)
    expect(screen.queryByAltText("photo.jpg")).not.toBeInTheDocument();
  });
});
