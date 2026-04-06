import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect } from "vitest";
import "./inbox-test-setup";
import { baseDraft, baseForm, QWrapper } from "./inbox-test-setup";

describe("FollowUpPanel", () => {
  it("returns null when no missing fields and no draft", async () => {
    const { FollowUpPanel } = await import("@/components/inbox/InboxFollowUpPanel");
    const { container } = render(
      <QWrapper>
        <FollowUpPanel selected={{ ...baseDraft, missing_fields: [], follow_up_draft: null } as any} />
      </QWrapper>,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders missing fields badges", async () => {
    const { FollowUpPanel } = await import("@/components/inbox/InboxFollowUpPanel");
    render(
      <QWrapper>
        <FollowUpPanel selected={{ ...baseDraft, missing_fields: ["gewicht", "afmetingen"], follow_up_draft: "Beste klant..." } as any} />
      </QWrapper>,
    );
    expect(screen.getByText("Ontbrekende Gegevens")).toBeInTheDocument();
    expect(screen.getByText("gewicht")).toBeInTheDocument();
    expect(screen.getByText("afmetingen")).toBeInTheDocument();
  });

  it("shows already sent badge", async () => {
    const { FollowUpPanel } = await import("@/components/inbox/InboxFollowUpPanel");
    render(
      <QWrapper>
        <FollowUpPanel selected={{
          ...baseDraft,
          missing_fields: ["gewicht"],
          follow_up_draft: "Beste klant...",
          follow_up_sent_at: new Date().toISOString(),
        } as any} />
      </QWrapper>,
    );
    expect(screen.getByText(/Verzonden/)).toBeInTheDocument();
    expect(screen.getByText("Al verzonden")).toBeInTheDocument();
  });

  it("shows send button when draft exists", async () => {
    const { FollowUpPanel } = await import("@/components/inbox/InboxFollowUpPanel");
    render(
      <QWrapper>
        <FollowUpPanel selected={{ ...baseDraft, missing_fields: ["gewicht"], follow_up_draft: "Concept mail" } as any} />
      </QWrapper>,
    );
    expect(screen.getByText("Verstuur Follow-up")).toBeInTheDocument();
  });

  it("shows Opnieuw versturen button when already sent", async () => {
    const { FollowUpPanel } = await import("@/components/inbox/InboxFollowUpPanel");
    render(
      <QWrapper>
        <FollowUpPanel selected={{
          ...baseDraft,
          missing_fields: ["gewicht"],
          follow_up_draft: "Concept mail",
          follow_up_sent_at: new Date().toISOString(),
        } as any} />
      </QWrapper>,
    );
    expect(screen.getByText("Opnieuw versturen")).toBeInTheDocument();
  });

  it("renders textarea with follow_up_draft text", async () => {
    const { FollowUpPanel } = await import("@/components/inbox/InboxFollowUpPanel");
    render(
      <QWrapper>
        <FollowUpPanel selected={{ ...baseDraft, missing_fields: ["gewicht"], follow_up_draft: "Beste klant, stuur ons aub meer info" } as any} />
      </QWrapper>,
    );
    const textarea = screen.getByPlaceholderText("Concept follow-up mail...");
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveValue("Beste klant, stuur ons aub meer info");
  });

  it("shows email recipient from source_email_from", async () => {
    const { FollowUpPanel } = await import("@/components/inbox/InboxFollowUpPanel");
    render(
      <QWrapper>
        <FollowUpPanel selected={{ ...baseDraft, missing_fields: ["gewicht"], follow_up_draft: "draft" } as any} />
      </QWrapper>,
    );
    expect(screen.getByText(/klant@example.nl/)).toBeInTheDocument();
  });

  it("renders when draft exists but no missing fields", async () => {
    const { FollowUpPanel } = await import("@/components/inbox/InboxFollowUpPanel");
    render(
      <QWrapper>
        <FollowUpPanel selected={{ ...baseDraft, missing_fields: [], follow_up_draft: "Some draft text" } as any} />
      </QWrapper>,
    );
    expect(screen.getByText("Ontbrekende Gegevens")).toBeInTheDocument();
    const textarea = screen.getByPlaceholderText("Concept follow-up mail...");
    expect(textarea).toHaveValue("Some draft text");
  });

  it("extracts email from angle-bracket format", async () => {
    const { FollowUpPanel } = await import("@/components/inbox/InboxFollowUpPanel");
    render(
      <QWrapper>
        <FollowUpPanel selected={{
          ...baseDraft,
          source_email_from: "Klant Bedrijf <klant@bedrijf.nl>",
          missing_fields: ["gewicht"],
          follow_up_draft: "draft",
        } as any} />
      </QWrapper>,
    );
    expect(screen.getByText(/klant@bedrijf.nl/)).toBeInTheDocument();
  });

  it("allows editing draft textarea", async () => {
    const { FollowUpPanel } = await import("@/components/inbox/InboxFollowUpPanel");
    render(
      <QWrapper>
        <FollowUpPanel selected={{ ...baseDraft, missing_fields: ["gewicht"], follow_up_draft: "old text" } as any} />
      </QWrapper>,
    );
    const textarea = screen.getByPlaceholderText("Concept follow-up mail...");
    fireEvent.change(textarea, { target: { value: "new text" } });
    expect(textarea).toHaveValue("new text");
  });

  it("saves draft on textarea blur (onBlur -> saveDraft)", async () => {
    const { FollowUpPanel } = await import("@/components/inbox/InboxFollowUpPanel");
    render(
      <QWrapper>
        <FollowUpPanel selected={{ ...baseDraft, missing_fields: ["gewicht"], follow_up_draft: "my draft" } as any} />
      </QWrapper>,
    );
    const textarea = screen.getByPlaceholderText("Concept follow-up mail...");
    fireEvent.blur(textarea);
  });

  it("calls handleSend on Verstuur Follow-up click and invokes send-follow-up with correct params", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { toast } = await import("sonner");
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({ data: { success: true }, error: null });

    const { FollowUpPanel } = await import("@/components/inbox/InboxFollowUpPanel");
    render(
      <QWrapper>
        <FollowUpPanel selected={{ ...baseDraft, missing_fields: ["gewicht"], follow_up_draft: "mail body" } as any} />
      </QWrapper>,
    );
    fireEvent.click(screen.getByText("Verstuur Follow-up"));

    await waitFor(() => {
      expect(supabase.functions.invoke).toHaveBeenCalledWith("send-follow-up", expect.objectContaining({
        body: expect.objectContaining({
          orderId: baseDraft.id,
          toEmail: "klant@example.nl",
          body: "mail body",
        }),
      }));
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Follow-up verzonden", expect.any(Object));
    });
  });

  it("falls back to mailto: when send-follow-up edge function fails", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { toast } = await import("sonner");
    const mockWindowOpen = vi.fn();
    const origOpen = window.open;
    window.open = mockWindowOpen;

    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({ data: null, error: { message: "edge fn error" } });

    const { FollowUpPanel } = await import("@/components/inbox/InboxFollowUpPanel");
    render(
      <QWrapper>
        <FollowUpPanel selected={{ ...baseDraft, missing_fields: ["gewicht"], follow_up_draft: "follow-up text" } as any} />
      </QWrapper>,
    );
    fireEvent.click(screen.getByText("Verstuur Follow-up"));

    await waitFor(() => {
      expect(mockWindowOpen).toHaveBeenCalledWith(expect.stringContaining("mailto:klant@example.nl"));
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("E-mail client geopend", expect.any(Object));
    });

    window.open = origOpen;
  });

  it("handles send-follow-up returning data.error", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const mockWindowOpen = vi.fn();
    const origOpen = window.open;
    window.open = mockWindowOpen;

    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({ data: { error: "Server error" }, error: null });

    const { FollowUpPanel } = await import("@/components/inbox/InboxFollowUpPanel");
    render(
      <QWrapper>
        <FollowUpPanel selected={{ ...baseDraft, missing_fields: ["gewicht"], follow_up_draft: "body text" } as any} />
      </QWrapper>,
    );
    fireEvent.click(screen.getByText("Verstuur Follow-up"));

    await waitFor(() => {
      expect(mockWindowOpen).toHaveBeenCalledWith(expect.stringContaining("mailto:"));
    });

    window.open = origOpen;
  });

  it("shows error toast when no email and send is clicked", async () => {
    const { toast } = await import("sonner");
    const { FollowUpPanel } = await import("@/components/inbox/InboxFollowUpPanel");
    render(
      <QWrapper>
        <FollowUpPanel selected={{ ...baseDraft, source_email_from: "", missing_fields: ["gewicht"], follow_up_draft: "draft" } as any} />
      </QWrapper>,
    );
    fireEvent.click(screen.getByText("Verstuur Follow-up"));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Geen e-mailadres", expect.any(Object));
    });
  });

  it("disables send button when no draft text", async () => {
    const { FollowUpPanel } = await import("@/components/inbox/InboxFollowUpPanel");
    render(
      <QWrapper>
        <FollowUpPanel selected={{ ...baseDraft, missing_fields: ["gewicht"], follow_up_draft: "" } as any} />
      </QWrapper>,
    );
    const sendBtn = screen.getByText("Verstuur Follow-up").closest("button");
    expect(sendBtn).toBeDisabled();
  });
});
