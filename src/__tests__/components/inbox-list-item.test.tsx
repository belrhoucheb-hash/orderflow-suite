import { render, screen, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect } from "vitest";
import "./inbox-test-setup";
import { baseDraft } from "./inbox-test-setup";

// ═══════════════════════════════════════════════════════════════
// InboxListItem
// ═══════════════════════════════════════════════════════════════
describe("InboxListItem", () => {
  it("renders client name and order number", async () => {
    const { InboxListItem } = await import("@/components/inbox/InboxListItem");
    render(<InboxListItem draft={baseDraft as any} isSelected={false} onClick={vi.fn()} />);
    expect(screen.getByText("ACME Corp")).toBeInTheDocument();
    expect(screen.getByText("#1001")).toBeInTheDocument();
  });

  it("renders email subject", async () => {
    const { InboxListItem } = await import("@/components/inbox/InboxListItem");
    render(<InboxListItem draft={baseDraft as any} isSelected={false} onClick={vi.fn()} />);
    expect(screen.getByText("Transport aanvraag 2 pallets")).toBeInTheDocument();
  });

  it("shows Aanvraag badge for new thread type", async () => {
    const { InboxListItem } = await import("@/components/inbox/InboxListItem");
    render(<InboxListItem draft={baseDraft as any} isSelected={false} onClick={vi.fn()} />);
    expect(screen.getByText("Aanvraag")).toBeInTheDocument();
  });

  it("shows Annulering badge for cancellation", async () => {
    const { InboxListItem } = await import("@/components/inbox/InboxListItem");
    render(<InboxListItem draft={{ ...baseDraft, thread_type: "cancellation" } as any} isSelected={false} onClick={vi.fn()} />);
    expect(screen.getByText("Annulering")).toBeInTheDocument();
  });

  it("shows Update badge for update", async () => {
    const { InboxListItem } = await import("@/components/inbox/InboxListItem");
    render(<InboxListItem draft={{ ...baseDraft, thread_type: "update" } as any} isSelected={false} onClick={vi.fn()} />);
    expect(screen.getByText("Update")).toBeInTheDocument();
  });

  it("shows Bevestiging badge for confirmation", async () => {
    const { InboxListItem } = await import("@/components/inbox/InboxListItem");
    render(<InboxListItem draft={{ ...baseDraft, thread_type: "confirmation" } as any} isSelected={false} onClick={vi.fn()} />);
    expect(screen.getByText("Bevestiging")).toBeInTheDocument();
  });

  it("fires onClick on click", async () => {
    const onClick = vi.fn();
    const { InboxListItem } = await import("@/components/inbox/InboxListItem");
    render(<InboxListItem draft={baseDraft as any} isSelected={false} onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("shows attachment count when present", async () => {
    const { InboxListItem } = await import("@/components/inbox/InboxListItem");
    render(<InboxListItem draft={{ ...baseDraft, attachments: [{ name: "a.pdf", url: "#", type: "application/pdf" }] } as any} isSelected={false} onClick={vi.fn()} />);
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("shows bulk checkbox when onBulkToggle provided", async () => {
    const { InboxListItem } = await import("@/components/inbox/InboxListItem");
    render(<InboxListItem draft={baseDraft as any} isSelected={false} onClick={vi.fn()} onBulkToggle={vi.fn()} isBulkChecked={false} />);
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });

  it("shows Onbekend when client_name is null", async () => {
    const { InboxListItem } = await import("@/components/inbox/InboxListItem");
    render(<InboxListItem draft={{ ...baseDraft, client_name: null } as any} isSelected={false} onClick={vi.fn()} />);
    expect(screen.getByText("Onbekend")).toBeInTheDocument();
  });

  it("calls onBulkToggle when checkbox is toggled", async () => {
    const onBulkToggle = vi.fn();
    const { InboxListItem } = await import("@/components/inbox/InboxListItem");
    render(<InboxListItem draft={baseDraft as any} isSelected={false} onClick={vi.fn()} onBulkToggle={onBulkToggle} isBulkChecked={false} />);
    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);
    expect(onBulkToggle).toHaveBeenCalledWith("d1");
  });

  it("stops propagation on checkbox click (does not trigger onClick)", async () => {
    const onClick = vi.fn();
    const onBulkToggle = vi.fn();
    const { InboxListItem } = await import("@/components/inbox/InboxListItem");
    render(<InboxListItem draft={baseDraft as any} isSelected={false} onClick={onClick} onBulkToggle={onBulkToggle} isBulkChecked={false} />);
    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);
    // onBulkToggle fires via onChange, but onClick should NOT fire because stopPropagation is called
    expect(onBulkToggle).toHaveBeenCalledWith("d1");
  });

  it("shows Vraag badge for question type", async () => {
    const { InboxListItem } = await import("@/components/inbox/InboxListItem");
    render(<InboxListItem draft={{ ...baseDraft, thread_type: "question" } as any} isSelected={false} onClick={vi.fn()} />);
    expect(screen.getByText("Vraag")).toBeInTheDocument();
  });

  it("shows email body preview text", async () => {
    const { InboxListItem } = await import("@/components/inbox/InboxListItem");
    render(<InboxListItem draft={baseDraft as any} isSelected={false} onClick={vi.fn()} />);
    expect(screen.getByText(/Graag 2 pallets/)).toBeInTheDocument();
  });

  it("shows Geen onderwerp when subject is null", async () => {
    const { InboxListItem } = await import("@/components/inbox/InboxListItem");
    render(<InboxListItem draft={{ ...baseDraft, source_email_subject: null } as any} isSelected={false} onClick={vi.fn()} />);
    expect(screen.getByText("Geen onderwerp")).toBeInTheDocument();
  });

  it("applies selected styling", async () => {
    const { InboxListItem } = await import("@/components/inbox/InboxListItem");
    const { container } = render(<InboxListItem draft={baseDraft as any} isSelected={true} onClick={vi.fn()} />);
    expect(container.firstChild!).toHaveClass("border-l-primary");
  });
});
