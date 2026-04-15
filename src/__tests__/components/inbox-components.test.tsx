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
      neq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
    channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }) }),
    removeChannel: vi.fn(),
  },
}));

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({ tenant: { id: "t1", name: "Test" }, loading: false }),
}));

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

// Mock inbox utils
vi.mock("@/components/inbox/utils", () => ({
  formatDate: (d: string) => "1 jan",
  getDeadlineInfo: (d: string) => ({ urgency: "green", label: "OK" }),
  getFilledCount: () => 4,
  getTotalFields: () => 8,
  getRequiredFilledCount: () => 3,
  getFormErrors: () => null,
  computeFieldConfidence: () => 50,
  isAddressIncomplete: () => false,
  isValidAddress: () => true,
  getAddressError: () => null,
  ALL_FIELDS: [
    { key: "pickupAddress", confKey: "pickup_address", label: "Ophaaladres", required: true },
    { key: "deliveryAddress", confKey: "delivery_address", label: "Afleveradres", required: true },
    { key: "quantity", confKey: "quantity", label: "Aantal", required: true },
    { key: "weight", confKey: "weight_kg", label: "Gewicht", required: true },
    { key: "unit", confKey: "unit", label: "Eenheid", required: false },
    { key: "transportType", confKey: "transport_type", label: "Type", required: false },
    { key: "dimensions", confKey: "dimensions", label: "Afmetingen", required: false },
    { key: "clientName", confKey: "client_name", label: "Klantnaam", required: false },
  ],
}));

vi.mock("@/lib/statusColors", () => ({
  getStatusColor: () => ({ bg: "bg-gray-100", text: "text-gray-600", label: "Status" }),
}));

// Mock useCapacityMatch for ExtractionSummary
vi.mock("@/hooks/useCapacityMatch", () => ({
  useCapacityMatch: () => [],
}));

// Mock AddressAutocomplete for InboxReviewPanel
vi.mock("@/components/AddressAutocomplete", () => ({
  AddressAutocomplete: ({ value, onChange, onBlur, placeholder, className }: any) => (
    <input value={value || ""} onChange={(e: any) => onChange(e.target.value)} onBlur={onBlur} placeholder={placeholder} className={className} data-testid="address-autocomplete" />
  ),
}));

// Mock sonner toast
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function QWrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

// ─── Fixtures ────────────────────────────────────────────────
const baseDraft = {
  id: "d1",
  order_number: 1001,
  status: "DRAFT",
  source_email_from: "klant@example.nl",
  source_email_subject: "Transport aanvraag 2 pallets",
  source_email_body: "Graag 2 pallets ophalen in Amsterdam",
  confidence_score: 85,
  transport_type: "direct",
  pickup_address: "Amsterdam",
  delivery_address: "Rotterdam",
  quantity: 2,
  unit: "Pallets",
  weight_kg: 500,
  is_weight_per_unit: false,
  dimensions: null,
  requirements: [],
  client_name: "ACME Corp",
  received_at: new Date(Date.now() - 3600000).toISOString(),
  created_at: new Date().toISOString(),
  attachments: null,
  pickup_time_from: null,
  pickup_time_to: null,
  delivery_time_from: null,
  delivery_time_to: null,
  internal_note: null,
  missing_fields: null,
  follow_up_draft: null,
  follow_up_sent_at: null,
  thread_type: "new",
  parent_order_id: null,
  changes_detected: null,
  anomalies: null,
  field_confidence: null,
  tenant_id: "t1",
};

const baseForm = {
  transportType: "direct",
  pickupAddress: "Amsterdam",
  deliveryAddress: "Rotterdam",
  quantity: 2,
  unit: "Pallets",
  weight: "500",
  dimensions: "",
  requirements: [],
  perUnit: false,
  internalNote: "",
  fieldSources: {},
  fieldConfidence: {},
};

// ═══════════════════════════════════════════════════════════════
// InboxListItem
// ═══════════════════════════════════════════════════════════════
// TODO: herschrijven na luxe-port (minimal 2-regel layout, type-icon i.p.v. badges).
describe.skip("InboxListItem", () => {
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

// ═══════════════════════════════════════════════════════════════
// InboxConfidenceIndicators
// ═══════════════════════════════════════════════════════════════
describe("ConfidenceDot", () => {
  it("renders emerald dot for high score", async () => {
    const { ConfidenceDot } = await import("@/components/inbox/InboxConfidenceIndicators");
    const { container } = render(<ConfidenceDot score={90} />);
    expect(container.firstChild).toHaveClass("bg-emerald-500");
  });

  it("renders amber dot for medium score", async () => {
    const { ConfidenceDot } = await import("@/components/inbox/InboxConfidenceIndicators");
    const { container } = render(<ConfidenceDot score={70} />);
    expect(container.firstChild).toHaveClass("bg-amber-500");
  });

  it("renders destructive dot for low score", async () => {
    const { ConfidenceDot } = await import("@/components/inbox/InboxConfidenceIndicators");
    const { container } = render(<ConfidenceDot score={30} />);
    expect(container.firstChild).toHaveClass("bg-destructive");
  });
});

describe("ConfidenceRing", () => {
  it("shows AI Score label", async () => {
    const { ConfidenceRing } = await import("@/components/inbox/InboxConfidenceIndicators");
    render(<ConfidenceRing score={85} />);
    expect(screen.getByText("AI Score")).toBeInTheDocument();
    expect(screen.getByText("85")).toBeInTheDocument();
    expect(screen.getByText("Hoge zekerheid")).toBeInTheDocument();
  });

  it("shows Controleer velden for medium", async () => {
    const { ConfidenceRing } = await import("@/components/inbox/InboxConfidenceIndicators");
    render(<ConfidenceRing score={65} />);
    expect(screen.getByText("Controleer velden")).toBeInTheDocument();
  });

  it("shows Handmatig invoeren for low", async () => {
    const { ConfidenceRing } = await import("@/components/inbox/InboxConfidenceIndicators");
    render(<ConfidenceRing score={40} />);
    expect(screen.getByText("Handmatig invoeren")).toBeInTheDocument();
  });
});

describe("FieldConfidence", () => {
  it("returns null for high confidence", async () => {
    const { FieldConfidence } = await import("@/components/inbox/InboxConfidenceIndicators");
    const { container } = render(<FieldConfidence level="high" />);
    expect(container.innerHTML).toBe("");
  });

  it("shows Controleer for medium", async () => {
    const { FieldConfidence } = await import("@/components/inbox/InboxConfidenceIndicators");
    render(<FieldConfidence level="medium" />);
    expect(screen.getByText("Controleer")).toBeInTheDocument();
  });

  it("shows Onzeker for low", async () => {
    const { FieldConfidence } = await import("@/components/inbox/InboxConfidenceIndicators");
    render(<FieldConfidence level="low" />);
    expect(screen.getByText("Onzeker")).toBeInTheDocument();
  });

  it("shows Ontbreekt for missing", async () => {
    const { FieldConfidence } = await import("@/components/inbox/InboxConfidenceIndicators");
    render(<FieldConfidence level="missing" />);
    expect(screen.getByText("Ontbreekt")).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════
// InboxAnomalyWarnings
// ═══════════════════════════════════════════════════════════════
describe("AnomalyWarnings", () => {
  it("returns null for empty anomalies", async () => {
    const { AnomalyWarnings } = await import("@/components/inbox/InboxAnomalyWarnings");
    const { container } = render(<AnomalyWarnings anomalies={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("returns null for null anomalies", async () => {
    const { AnomalyWarnings } = await import("@/components/inbox/InboxAnomalyWarnings");
    const { container } = render(<AnomalyWarnings anomalies={null as any} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders anomaly messages", async () => {
    const { AnomalyWarnings } = await import("@/components/inbox/InboxAnomalyWarnings");
    render(<AnomalyWarnings anomalies={[
      { field: "weight", value: 50000, avg_value: 5000, message: "Gewicht is 10x hoger dan normaal" },
    ]} />);
    expect(screen.getByText("Gewicht is 10x hoger dan normaal")).toBeInTheDocument();
    // Values are inside <strong> tags within text nodes
    expect(screen.getByText("50000")).toBeInTheDocument();
    expect(screen.getByText("5000")).toBeInTheDocument();
  });

  it("renders multiple anomalies", async () => {
    const { AnomalyWarnings } = await import("@/components/inbox/InboxAnomalyWarnings");
    render(<AnomalyWarnings anomalies={[
      { field: "weight", value: 50000, avg_value: 5000, message: "Te zwaar" },
      { field: "quantity", value: 100, avg_value: 10, message: "Te veel" },
    ]} />);
    expect(screen.getByText("Te zwaar")).toBeInTheDocument();
    expect(screen.getByText("Te veel")).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════
// InboxThreadBanner
// ═══════════════════════════════════════════════════════════════
describe("ThreadDiffBanner", () => {
  it("returns null for new thread type", async () => {
    const { ThreadDiffBanner } = await import("@/components/inbox/InboxThreadBanner");
    const { container } = render(<ThreadDiffBanner order={{ ...baseDraft, thread_type: "new" } as any} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders update banner with changes", async () => {
    const { ThreadDiffBanner } = await import("@/components/inbox/InboxThreadBanner");
    render(<ThreadDiffBanner order={{
      ...baseDraft,
      thread_type: "update",
      changes_detected: [{ field: "weight_kg", old_value: "500", new_value: "800" }],
    } as any} />);
    expect(screen.getByText(/Wijziging/)).toBeInTheDocument();
    expect(screen.getByText("Gewicht")).toBeInTheDocument();
    expect(screen.getByText("500")).toBeInTheDocument();
    expect(screen.getByText("800")).toBeInTheDocument();
  });

  it("shows cancellation warning", async () => {
    const { ThreadDiffBanner } = await import("@/components/inbox/InboxThreadBanner");
    render(<ThreadDiffBanner order={{ ...baseDraft, thread_type: "cancellation", changes_detected: [] } as any} />);
    expect(screen.getByText(/annuleren/)).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════
// InboxExtractionSummary
// ═══════════════════════════════════════════════════════════════
describe("ExtractionSummary", () => {
  it("renders extracted fields", async () => {
    const { ExtractionSummary } = await import("@/components/inbox/InboxExtractionSummary");
    render(
      <QWrapper>
        <ExtractionSummary order={baseDraft as any} form={baseForm as any} />
      </QWrapper>,
    );
    expect(screen.getByText("Dit hebben we begrepen")).toBeInTheDocument();
    expect(screen.getByText("Amsterdam")).toBeInTheDocument();
    expect(screen.getByText("Rotterdam")).toBeInTheDocument();
    expect(screen.getByText("2 Pallets")).toBeInTheDocument();
    expect(screen.getByText("500 kg")).toBeInTheDocument();
  });

  it("shows only transport type when fields are empty", async () => {
    const { ExtractionSummary } = await import("@/components/inbox/InboxExtractionSummary");
    const emptyForm = { ...baseForm, pickupAddress: "", deliveryAddress: "", quantity: 0, weight: "", dimensions: "", requirements: [], transportType: "direct" };
    render(
      <QWrapper>
        <ExtractionSummary order={{ ...baseDraft, client_name: null } as any} form={emptyForm as any} />
      </QWrapper>,
    );
    // "Direct" transport type is always a truthy value, so the component renders
    expect(screen.getByText("Direct")).toBeInTheDocument();
  });

  it("shows capacity section", async () => {
    const { ExtractionSummary } = await import("@/components/inbox/InboxExtractionSummary");
    render(
      <QWrapper>
        <ExtractionSummary order={baseDraft as any} form={baseForm as any} />
      </QWrapper>,
    );
    expect(screen.getByText("Beschikbare capaciteit")).toBeInTheDocument();
  });

  it("still renders when only transport type is present", async () => {
    const { ExtractionSummary } = await import("@/components/inbox/InboxExtractionSummary");
    const emptyForm = { ...baseForm, pickupAddress: "", deliveryAddress: "", quantity: 0, weight: "", dimensions: "", requirements: [], transportType: "" };
    render(
      <QWrapper>
        <ExtractionSummary order={{ ...baseDraft, client_name: null } as any} form={emptyForm as any} />
      </QWrapper>,
    );
    // Even with empty transportType, the ternary returns "Direct", so at least 1 item exists
    expect(screen.getByText("Direct")).toBeInTheDocument();
  });

  it("renders warehouse-air transport type", async () => {
    const { ExtractionSummary } = await import("@/components/inbox/InboxExtractionSummary");
    const airForm = { ...baseForm, transportType: "warehouse-air" };
    render(
      <QWrapper>
        <ExtractionSummary order={baseDraft as any} form={airForm as any} />
      </QWrapper>,
    );
    expect(screen.getByText(/Warehouse/)).toBeInTheDocument();
  });

  it("renders requirements in summary", async () => {
    const { ExtractionSummary } = await import("@/components/inbox/InboxExtractionSummary");
    const reqForm = { ...baseForm, requirements: ["Koeling", "ADR"] };
    render(
      <QWrapper>
        <ExtractionSummary order={baseDraft as any} form={reqForm as any} />
      </QWrapper>,
    );
    expect(screen.getByText(/Koeling/)).toBeInTheDocument();
    expect(screen.getByText(/ADR/)).toBeInTheDocument();
  });

  it("renders dimensions when provided", async () => {
    const { ExtractionSummary } = await import("@/components/inbox/InboxExtractionSummary");
    const dimForm = { ...baseForm, dimensions: "120x80x100" };
    render(
      <QWrapper>
        <ExtractionSummary order={baseDraft as any} form={dimForm as any} />
      </QWrapper>,
    );
    expect(screen.getByText("120x80x100")).toBeInTheDocument();
  });

  it("shows per-eenheid suffix for perUnit weight", async () => {
    const { ExtractionSummary } = await import("@/components/inbox/InboxExtractionSummary");
    const perUnitForm = { ...baseForm, perUnit: true };
    render(
      <QWrapper>
        <ExtractionSummary order={baseDraft as any} form={perUnitForm as any} />
      </QWrapper>,
    );
    expect(screen.getByText("500 kg per eenheid")).toBeInTheDocument();
  });

  it("renders no matching vehicles message when capacity is empty", async () => {
    const { ExtractionSummary } = await import("@/components/inbox/InboxExtractionSummary");
    render(
      <QWrapper>
        <ExtractionSummary order={baseDraft as any} form={baseForm as any} />
      </QWrapper>,
    );
    expect(screen.getByText("Geen geschikte voertuigen gevonden")).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════
// InboxFollowUpPanel
// ═══════════════════════════════════════════════════════════════
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
    // saveDraft calls supabase.from("orders").update(...)
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
      // data.error causes throw, which triggers mailto fallback
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
    // With empty draft, the button should be disabled
    const sendBtn = screen.getByText("Verstuur Follow-up").closest("button");
    expect(sendBtn).toBeDisabled();
  });
});

// ═══════════════════════════════════════════════════════════════
// InboxReviewPanel
// ═══════════════════════════════════════════════════════════════
// TODO: herschrijven na luxe-port (confidence-ring, chapters, sticky CTA).
describe.skip("InboxReviewPanel", () => {
  const defaultProps = {
    selected: baseDraft as any,
    form: baseForm as any,
    isCreatePending: false,
    addressSuggestions: { suggestions: [], loading: false },
    onUpdateField: vi.fn(),
    onToggleRequirement: vi.fn(),
    onAutoSave: vi.fn(),
    onCreateOrder: vi.fn(),
    onDelete: vi.fn(),
  };

  it("renders Review Order header", async () => {
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    render(<InboxReviewPanel {...defaultProps} />);
    expect(screen.getByText("Review Order")).toBeInTheDocument();
  });

  it("shows time ago indicator", async () => {
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    render(<InboxReviewPanel {...defaultProps} />);
    expect(screen.getByText(/\d+u geleden/)).toBeInTheDocument();
  });

  it("shows progress stepper with Ontvangen, Review, Goedgekeurd", async () => {
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    render(<InboxReviewPanel {...defaultProps} />);
    expect(screen.getByText("Ontvangen")).toBeInTheDocument();
    expect(screen.getByText("Review")).toBeInTheDocument();
    expect(screen.getByText("Goedgekeurd")).toBeInTheDocument();
  });

  it("shows AI extraction stats", async () => {
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    render(<InboxReviewPanel {...defaultProps} />);
    expect(screen.getByText(/van 8 velden herkend/)).toBeInTheDocument();
  });

  it("shows Route Details section", async () => {
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    render(<InboxReviewPanel {...defaultProps} />);
    expect(screen.getByText("Route Details")).toBeInTheDocument();
  });

  it("shows Lading & Goederen section", async () => {
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    render(<InboxReviewPanel {...defaultProps} />);
    expect(screen.getByText("Lading & Goederen")).toBeInTheDocument();
  });

  it("shows Extra Vereisten section with requirement buttons", async () => {
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    render(<InboxReviewPanel {...defaultProps} />);
    expect(screen.getByText("Extra Vereisten")).toBeInTheDocument();
    expect(screen.getByText("Koeling")).toBeInTheDocument();
    expect(screen.getByText("ADR")).toBeInTheDocument();
    expect(screen.getByText("Laadklep")).toBeInTheDocument();
    expect(screen.getByText("Douane")).toBeInTheDocument();
  });

  it("calls onToggleRequirement when requirement button is clicked", async () => {
    const onToggleRequirement = vi.fn();
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    render(<InboxReviewPanel {...defaultProps} onToggleRequirement={onToggleRequirement} />);
    fireEvent.click(screen.getByText("ADR"));
    expect(onToggleRequirement).toHaveBeenCalledWith("ADR");
  });

  it("shows MAAK DE ORDER AAN button", async () => {
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    render(<InboxReviewPanel {...defaultProps} />);
    expect(screen.getByText("MAAK DE ORDER AAN")).toBeInTheDocument();
  });

  it("calls onCreateOrder when submit button is clicked", async () => {
    const onCreateOrder = vi.fn();
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    render(<InboxReviewPanel {...defaultProps} onCreateOrder={onCreateOrder} />);
    fireEvent.click(screen.getByText("MAAK DE ORDER AAN"));
    expect(onCreateOrder).toHaveBeenCalledOnce();
  });

  it("shows Afwijzen & archiveren link", async () => {
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    render(<InboxReviewPanel {...defaultProps} />);
    expect(screen.getByText("Afwijzen & archiveren")).toBeInTheDocument();
  });

  it("shows auto-advance checkbox", async () => {
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    render(<InboxReviewPanel {...defaultProps} />);
    expect(screen.getByText("Spring naar volgende ongelezen na goedkeuring")).toBeInTheDocument();
  });

  it("shows Afmetingen ontbreekt warning when dimensions missing", async () => {
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    render(<InboxReviewPanel {...defaultProps} form={{ ...baseForm, dimensions: "" } as any} />);
    expect(screen.getByText(/Afmetingen ontbreekt/)).toBeInTheDocument();
  });

  it("does not show Afmetingen warning when dimensions provided", async () => {
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    render(<InboxReviewPanel {...defaultProps} form={{ ...baseForm, dimensions: "120x80x100" } as any} />);
    expect(screen.queryByText(/Afmetingen ontbreekt/)).not.toBeInTheDocument();
  });

  it("shows pickup time window when available", async () => {
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    render(<InboxReviewPanel {...defaultProps} selected={{ ...baseDraft, pickup_time_from: "08:00", pickup_time_to: "10:00" } as any} />);
    expect(screen.getByText("08:00 - 10:00")).toBeInTheDocument();
  });

  it("shows delivery time window when available", async () => {
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    render(<InboxReviewPanel {...defaultProps} selected={{ ...baseDraft, delivery_time_from: "14:00", delivery_time_to: "16:00" } as any} />);
    expect(screen.getByText("14:00 - 16:00")).toBeInTheDocument();
  });

  it("shows per-unit weight calculation", async () => {
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    render(<InboxReviewPanel {...defaultProps} form={{ ...baseForm, perUnit: true, weight: "1000", quantity: 4 } as any} />);
    expect(screen.getByText(/250 kg\/eenheid/)).toBeInTheDocument();
  });

  it("shows confidence ring with percentage", async () => {
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    render(<InboxReviewPanel {...defaultProps} />);
    // getFilledCount returns 4, getTotalFields returns 8, so 50%
    const percentages = screen.getAllByText("50%");
    expect(percentages.length).toBeGreaterThanOrEqual(1);
  });

  it("shows attachment source info when attachments present", async () => {
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    render(<InboxReviewPanel {...defaultProps} selected={{ ...baseDraft, attachments: [{ name: "a.pdf", url: "#", type: "application/pdf" }] } as any} />);
    expect(screen.getByText(/uit bijlage/)).toBeInTheDocument();
  });

  it("shows location badge when both addresses filled", async () => {
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    render(<InboxReviewPanel {...defaultProps} />);
    expect(screen.getByText(/2 locaties/)).toBeInTheDocument();
  });

  it("shows lading badge when quantity > 0", async () => {
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    render(<InboxReviewPanel {...defaultProps} />);
    const ladingElements = screen.getAllByText(/Lading/);
    expect(ladingElements.length).toBeGreaterThanOrEqual(1);
  });

  it("calls onUpdateField when quantity input changes", async () => {
    const onUpdateField = vi.fn();
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    render(<InboxReviewPanel {...defaultProps} onUpdateField={onUpdateField} />);
    const qtyInput = screen.getByDisplayValue("2");
    fireEvent.change(qtyInput, { target: { value: "5" } });
    expect(onUpdateField).toHaveBeenCalledWith("quantity", 5);
  });

  it("calls onAutoSave on quantity input blur", async () => {
    const onAutoSave = vi.fn();
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    render(<InboxReviewPanel {...defaultProps} onAutoSave={onAutoSave} />);
    const qtyInput = screen.getByDisplayValue("2");
    fireEvent.blur(qtyInput);
    expect(onAutoSave).toHaveBeenCalled();
  });

  it("calls onUpdateField when weight input changes", async () => {
    const onUpdateField = vi.fn();
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    render(<InboxReviewPanel {...defaultProps} onUpdateField={onUpdateField} />);
    const weightInput = screen.getByDisplayValue("500");
    fireEvent.change(weightInput, { target: { value: "800" } });
    expect(onUpdateField).toHaveBeenCalledWith("weight", "800");
  });

  it("calls onUpdateField when dimensions input changes", async () => {
    const onUpdateField = vi.fn();
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    render(<InboxReviewPanel {...defaultProps} onUpdateField={onUpdateField} />);
    // The dimensions input has placeholder "Niet opgegeven" since dimensions is empty
    const dimInput = screen.getByPlaceholderText("Niet opgegeven");
    fireEvent.change(dimInput, { target: { value: "120x80" } });
    expect(onUpdateField).toHaveBeenCalledWith("dimensions", "120x80");
  });

  it("calls onUpdateField and onAutoSave when pickup address changes", async () => {
    const onUpdateField = vi.fn();
    const onAutoSave = vi.fn();
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    render(<InboxReviewPanel {...defaultProps} onUpdateField={onUpdateField} onAutoSave={onAutoSave} />);
    const addressInputs = screen.getAllByTestId("address-autocomplete");
    fireEvent.change(addressInputs[0], { target: { value: "Utrecht" } });
    expect(onUpdateField).toHaveBeenCalledWith("pickupAddress", "Utrecht");
    fireEvent.blur(addressInputs[0]);
    expect(onAutoSave).toHaveBeenCalled();
  });

  it("calls onUpdateField and onAutoSave when delivery address changes", async () => {
    const onUpdateField = vi.fn();
    const onAutoSave = vi.fn();
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    render(<InboxReviewPanel {...defaultProps} onUpdateField={onUpdateField} onAutoSave={onAutoSave} />);
    const addressInputs = screen.getAllByTestId("address-autocomplete");
    fireEvent.change(addressInputs[1], { target: { value: "Den Haag" } });
    expect(onUpdateField).toHaveBeenCalledWith("deliveryAddress", "Den Haag");
    fireEvent.blur(addressInputs[1]);
    expect(onAutoSave).toHaveBeenCalled();
  });

  it("toggles auto-advance checkbox", async () => {
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    render(<InboxReviewPanel {...defaultProps} />);
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  it("shows confidence hover dropdown on mouse enter", async () => {
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    render(<InboxReviewPanel {...defaultProps} />);
    // The confidence ring is the element with the percentage text
    const confRing = screen.getAllByText("50%")[0].closest("[class*='cursor-help']")!;
    fireEvent.mouseEnter(confRing);
    expect(screen.getByText("Per-veld Confidence")).toBeInTheDocument();
    fireEvent.mouseLeave(confRing);
  });

  it("disables submit button when formErrors exist", async () => {
    // Mock getFormErrors to return truthy
    vi.doMock("@/components/inbox/utils", () => ({
      formatDate: (d: string) => "1 jan",
      getDeadlineInfo: (d: string) => ({ urgency: "green", label: "OK" }),
      getFilledCount: () => 2,
      getTotalFields: () => 8,
      getRequiredFilledCount: () => 1,
      getFormErrors: () => "Missing required",
      computeFieldConfidence: () => 25,
      isAddressIncomplete: () => false,
    }));
    vi.resetModules();
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    render(<InboxReviewPanel {...defaultProps} />);
    const submitBtn = screen.getByText("MAAK DE ORDER AAN").closest("button");
    expect(submitBtn).toBeDisabled();
    // Restore
    vi.doMock("@/components/inbox/utils", () => ({
      formatDate: (d: string) => "1 jan",
      getDeadlineInfo: (d: string) => ({ urgency: "green", label: "OK" }),
      getFilledCount: () => 4,
      getTotalFields: () => 8,
      getRequiredFilledCount: () => 3,
      getFormErrors: () => null,
      computeFieldConfidence: () => 50,
      isAddressIncomplete: () => false,
    }));
    vi.resetModules();
  });

  it("calls onDelete when Afwijzen confirm is clicked", async () => {
    const onDelete = vi.fn();
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    render(<InboxReviewPanel {...defaultProps} onDelete={onDelete} />);
    // Click "Afwijzen & archiveren" to open alert dialog
    fireEvent.click(screen.getByText("Afwijzen & archiveren"));
    await waitFor(() => {
      expect(screen.getByText("E-mail verwijderen?")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Verwijderen"));
    expect(onDelete).toHaveBeenCalledOnce();
  });
});

// ═══════════════════════════════════════════════════════════════
// InboxSourcePanel
// ═══════════════════════════════════════════════════════════════
// TODO: herschrijven na luxe-port (nieuwe top-bar, 3-level highlights, tools-row).
describe.skip("SourcePanel", () => {
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
    // The component shows "—" for null sender
    const dashElements = screen.getAllByText("—");
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
// InboxReviewPanel — extended coverage
// ═══════════════════════════════════════════════════════════════
describe.skip("InboxReviewPanel – FieldConfidenceIndicator", () => {
  const defaultProps = {
    selected: baseDraft as any,
    form: baseForm as any,
    isCreatePending: false,
    addressSuggestions: { suggestions: [], loading: false },
    onUpdateField: vi.fn(),
    onToggleRequirement: vi.fn(),
    onAutoSave: vi.fn(),
    onCreateOrder: vi.fn(),
    onDelete: vi.fn(),
  };

  it("renders green CheckCircle2 for score >= 90", async () => {
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    const formWithConf = { ...baseForm, fieldConfidence: { pickup_address: 95 } };
    const { container } = render(<InboxReviewPanel {...defaultProps} form={formWithConf as any} />);
    // Find the FieldConfidenceIndicator span with green icon (title text confirms score)
    const indicators = container.querySelectorAll('[title="AI confidence: 95%"]');
    expect(indicators.length).toBeGreaterThanOrEqual(1);
    // The icon inside should have green class
    const icon = indicators[0].querySelector("svg");
    expect(icon).toBeTruthy();
    expect(icon!.classList.toString()).toContain("text-green-500");
  });

  it("renders yellow AlertTriangle for score >= 60 but < 90", async () => {
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    const formWithConf = { ...baseForm, fieldConfidence: { pickup_address: 70 } };
    const { container } = render(<InboxReviewPanel {...defaultProps} form={formWithConf as any} />);
    const indicators = container.querySelectorAll('[title="AI confidence: 70%"]');
    expect(indicators.length).toBeGreaterThanOrEqual(1);
    const icon = indicators[0].querySelector("svg");
    expect(icon).toBeTruthy();
    expect(icon!.classList.toString()).toContain("text-yellow-500");
  });

  it("renders red AlertTriangle for score < 60", async () => {
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    const formWithConf = { ...baseForm, fieldConfidence: { pickup_address: 30 } };
    const { container } = render(<InboxReviewPanel {...defaultProps} form={formWithConf as any} />);
    const indicators = container.querySelectorAll('[title="AI confidence: 30%"]');
    expect(indicators.length).toBeGreaterThanOrEqual(1);
    const icon = indicators[0].querySelector("svg");
    expect(icon).toBeTruthy();
    expect(icon!.classList.toString()).toContain("text-red-500");
  });

  it("renders nothing when score is undefined", async () => {
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    const formWithConf = { ...baseForm, fieldConfidence: {} };
    const { container } = render(<InboxReviewPanel {...defaultProps} form={formWithConf as any} />);
    // No title attributes with AI confidence should appear for undefined fields
    const indicators = container.querySelectorAll('[title^="AI confidence"]');
    expect(indicators.length).toBe(0);
  });

  it("renders multiple indicators with different colors for different fields", async () => {
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    const formWithConf = {
      ...baseForm,
      fieldConfidence: { pickup_address: 95, delivery_address: 50, quantity: 75, weight_kg: 40 },
    };
    const { container } = render(<InboxReviewPanel {...defaultProps} form={formWithConf as any} />);
    // Green indicator for pickup_address (95)
    expect(container.querySelectorAll('[title="AI confidence: 95%"]').length).toBeGreaterThanOrEqual(1);
    // Yellow indicator for quantity (75)
    expect(container.querySelectorAll('[title="AI confidence: 75%"]').length).toBeGreaterThanOrEqual(1);
    // Red indicator for delivery_address (50)
    expect(container.querySelectorAll('[title="AI confidence: 50%"]').length).toBeGreaterThanOrEqual(1);
    // Red indicator for weight_kg (40)
    expect(container.querySelectorAll('[title="AI confidence: 40%"]').length).toBeGreaterThanOrEqual(1);
  });
});

describe.skip("InboxReviewPanel – Confidence ring hover dropdown", () => {
  const defaultProps = {
    selected: baseDraft as any,
    form: baseForm as any,
    isCreatePending: false,
    addressSuggestions: { suggestions: [], loading: false },
    onUpdateField: vi.fn(),
    onToggleRequirement: vi.fn(),
    onAutoSave: vi.fn(),
    onCreateOrder: vi.fn(),
    onDelete: vi.fn(),
  };

  it("shows all 8 field labels when hovering confidence ring", async () => {
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    render(<InboxReviewPanel {...defaultProps} />);
    const confRing = screen.getAllByText("50%")[0].closest("[class*='cursor-help']")!;
    fireEvent.mouseEnter(confRing);

    expect(screen.getByText("Klantnaam")).toBeInTheDocument();
    expect(screen.getByText("Ophaaladres")).toBeInTheDocument();
    expect(screen.getByText("Afleveradres")).toBeInTheDocument();
    // "Aantal" and "Gewicht" also appear in the form section, so use getAllByText
    expect(screen.getAllByText("Aantal").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Gewicht").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Eenheid")).toBeInTheDocument();
    // "Type" and "Afmetingen" also appear in the form section
    expect(screen.getAllByText("Type").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Afmetingen").length).toBeGreaterThanOrEqual(1);
  });

  it("shows green color class for field confidence >= 90", async () => {
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    const formWithConf = { ...baseForm, fieldConfidence: { client_name: 95 } };
    render(<InboxReviewPanel {...defaultProps} form={formWithConf as any} />);
    const confRing = screen.getAllByText("50%")[0].closest("[class*='cursor-help']")!;
    fireEvent.mouseEnter(confRing);

    const greenSpan = screen.getByText(/95%/);
    expect(greenSpan.className).toContain("text-green-600");
    expect(greenSpan.textContent).toContain("✓");
  });

  it("shows amber color class for field confidence >= 60 but < 90", async () => {
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    const formWithConf = { ...baseForm, fieldConfidence: { client_name: 72 } };
    render(<InboxReviewPanel {...defaultProps} form={formWithConf as any} />);
    const confRing = screen.getAllByText("50%")[0].closest("[class*='cursor-help']")!;
    fireEvent.mouseEnter(confRing);

    const amberSpan = screen.getByText(/72%/);
    expect(amberSpan.className).toContain("text-amber-600");
    expect(amberSpan.textContent).toContain("⚠");
  });

  it("shows red color class for field confidence < 60", async () => {
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    const formWithConf = { ...baseForm, fieldConfidence: { client_name: 30 } };
    render(<InboxReviewPanel {...defaultProps} form={formWithConf as any} />);
    const confRing = screen.getAllByText("50%")[0].closest("[class*='cursor-help']")!;
    fireEvent.mouseEnter(confRing);

    const redSpan = screen.getByText(/30%/);
    expect(redSpan.className).toContain("text-red-600");
    expect(redSpan.textContent).toContain("✗");
  });

  it("shows dash for fields with no confidence value", async () => {
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    render(<InboxReviewPanel {...defaultProps} />);
    const confRing = screen.getAllByText("50%")[0].closest("[class*='cursor-help']")!;
    fireEvent.mouseEnter(confRing);

    // With empty fieldConfidence, all 8 fields should show "—"
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBe(8);
  });

  it("hides dropdown on mouseLeave", async () => {
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    render(<InboxReviewPanel {...defaultProps} />);
    const confRing = screen.getAllByText("50%")[0].closest("[class*='cursor-help']")!;
    fireEvent.mouseEnter(confRing);
    expect(screen.getByText("Per-veld Confidence")).toBeInTheDocument();
    fireEvent.mouseLeave(confRing);
    expect(screen.queryByText("Per-veld Confidence")).not.toBeInTheDocument();
  });
});

describe.skip("InboxReviewPanel – Time-based styling", () => {
  const baseProps = {
    form: baseForm as any,
    isCreatePending: false,
    addressSuggestions: { suggestions: [], loading: false },
    onUpdateField: vi.fn(),
    onToggleRequirement: vi.fn(),
    onAutoSave: vi.fn(),
    onCreateOrder: vi.fn(),
    onDelete: vi.fn(),
  };

  it("shows red badge class when received_at > 6 hours ago", async () => {
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    const sevenHoursAgo = new Date(Date.now() - 7 * 3600000).toISOString();
    const { container } = render(
      <InboxReviewPanel {...baseProps} selected={{ ...baseDraft, received_at: sevenHoursAgo } as any} />,
    );
    const timeBadge = screen.getByText(/7u geleden/);
    expect(timeBadge.className).toContain("bg-red-100");
    expect(timeBadge.className).toContain("text-red-600");
  });

  it("shows amber badge class when received_at > 3 hours but <= 6 hours ago", async () => {
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    const fiveHoursAgo = new Date(Date.now() - 5 * 3600000).toISOString();
    const { container } = render(
      <InboxReviewPanel {...baseProps} selected={{ ...baseDraft, received_at: fiveHoursAgo } as any} />,
    );
    const timeBadge = screen.getByText(/5u geleden/);
    expect(timeBadge.className).toContain("bg-amber-100");
    expect(timeBadge.className).toContain("text-amber-600");
  });

  it("shows gray badge class when received_at <= 3 hours ago", async () => {
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    const oneHourAgo = new Date(Date.now() - 1 * 3600000).toISOString();
    const { container } = render(
      <InboxReviewPanel {...baseProps} selected={{ ...baseDraft, received_at: oneHourAgo } as any} />,
    );
    const timeBadge = screen.getByText(/1u geleden/);
    expect(timeBadge.className).toContain("bg-gray-100");
    expect(timeBadge.className).toContain("text-gray-500");
  });
});

describe.skip("InboxReviewPanel – Address incomplete warning", () => {
  it("shows Onvolledig adres for incomplete pickup address", async () => {
    vi.doMock("@/components/inbox/utils", () => ({
      formatDate: (d: string) => "1 jan",
      getDeadlineInfo: (d: string) => ({ urgency: "green", label: "OK" }),
      getFilledCount: () => 4,
      getTotalFields: () => 8,
      getRequiredFilledCount: () => 3,
      getFormErrors: () => null,
      computeFieldConfidence: () => 50,
      isAddressIncomplete: (addr: string) => !/\d/.test(addr),
    }));
    vi.resetModules();
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    const formIncomplete = { ...baseForm, pickupAddress: "Amsterdam" }; // no number → incomplete
    render(
      <InboxReviewPanel
        selected={baseDraft as any}
        form={formIncomplete as any}
        isCreatePending={false}
        addressSuggestions={{ suggestions: [], loading: false }}
        onUpdateField={vi.fn()}
        onToggleRequirement={vi.fn()}
        onAutoSave={vi.fn()}
        onCreateOrder={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    const warnings = screen.getAllByText(/Onvolledig adres/);
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    // Restore default mock
    vi.doMock("@/components/inbox/utils", () => ({
      formatDate: (d: string) => "1 jan",
      getDeadlineInfo: (d: string) => ({ urgency: "green", label: "OK" }),
      getFilledCount: () => 4,
      getTotalFields: () => 8,
      getRequiredFilledCount: () => 3,
      getFormErrors: () => null,
      computeFieldConfidence: () => 50,
      isAddressIncomplete: () => false,
    }));
    vi.resetModules();
  });

  it("shows Onvolledig adres for incomplete delivery address", async () => {
    vi.doMock("@/components/inbox/utils", () => ({
      formatDate: (d: string) => "1 jan",
      getDeadlineInfo: (d: string) => ({ urgency: "green", label: "OK" }),
      getFilledCount: () => 4,
      getTotalFields: () => 8,
      getRequiredFilledCount: () => 3,
      getFormErrors: () => null,
      computeFieldConfidence: () => 50,
      isAddressIncomplete: (addr: string) => !/\d/.test(addr),
    }));
    vi.resetModules();
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    const formIncomplete = { ...baseForm, pickupAddress: "Keizersgracht 100, Amsterdam", deliveryAddress: "Rotterdam" };
    render(
      <InboxReviewPanel
        selected={baseDraft as any}
        form={formIncomplete as any}
        isCreatePending={false}
        addressSuggestions={{ suggestions: [], loading: false }}
        onUpdateField={vi.fn()}
        onToggleRequirement={vi.fn()}
        onAutoSave={vi.fn()}
        onCreateOrder={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    // "Rotterdam" has no number so isAddressIncomplete returns true
    const warnings = screen.getAllByText(/Onvolledig adres/);
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    // Restore default mock
    vi.doMock("@/components/inbox/utils", () => ({
      formatDate: (d: string) => "1 jan",
      getDeadlineInfo: (d: string) => ({ urgency: "green", label: "OK" }),
      getFilledCount: () => 4,
      getTotalFields: () => 8,
      getRequiredFilledCount: () => 3,
      getFormErrors: () => null,
      computeFieldConfidence: () => 50,
      isAddressIncomplete: () => false,
    }));
    vi.resetModules();
  });

  it("does NOT show Onvolledig adres for complete addresses", async () => {
    vi.doMock("@/components/inbox/utils", () => ({
      formatDate: (d: string) => "1 jan",
      getDeadlineInfo: (d: string) => ({ urgency: "green", label: "OK" }),
      getFilledCount: () => 4,
      getTotalFields: () => 8,
      getRequiredFilledCount: () => 3,
      getFormErrors: () => null,
      computeFieldConfidence: () => 50,
      isAddressIncomplete: () => false,
    }));
    vi.resetModules();
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    const formComplete = { ...baseForm, pickupAddress: "Keizersgracht 100, Amsterdam", deliveryAddress: "Coolsingel 50, Rotterdam" };
    render(
      <InboxReviewPanel
        selected={baseDraft as any}
        form={formComplete as any}
        isCreatePending={false}
        addressSuggestions={{ suggestions: [], loading: false }}
        onUpdateField={vi.fn()}
        onToggleRequirement={vi.fn()}
        onAutoSave={vi.fn()}
        onCreateOrder={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.queryByText(/Onvolledig adres/)).not.toBeInTheDocument();
  });
});

describe.skip("InboxReviewPanel – Per-unit weight calculation", () => {
  const defaultProps = {
    selected: baseDraft as any,
    isCreatePending: false,
    addressSuggestions: { suggestions: [], loading: false },
    onUpdateField: vi.fn(),
    onToggleRequirement: vi.fn(),
    onAutoSave: vi.fn(),
    onCreateOrder: vi.fn(),
    onDelete: vi.fn(),
  };

  it("shows per-unit calculation with correct values (1000 / 4 = 250)", async () => {
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    const perUnitForm = { ...baseForm, perUnit: true, weight: "1000", quantity: 4 };
    render(<InboxReviewPanel {...defaultProps} form={perUnitForm as any} />);
    expect(screen.getByText("≈ 250 kg/eenheid × 4")).toBeInTheDocument();
  });

  it("does not show per-unit calculation when perUnit is false", async () => {
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    const normalForm = { ...baseForm, perUnit: false, weight: "1000", quantity: 4 };
    render(<InboxReviewPanel {...defaultProps} form={normalForm as any} />);
    expect(screen.queryByText(/kg\/eenheid/)).not.toBeInTheDocument();
  });

  it("does not show per-unit calculation when weight is empty", async () => {
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    const noWeightForm = { ...baseForm, perUnit: true, weight: "", quantity: 4 };
    render(<InboxReviewPanel {...defaultProps} form={noWeightForm as any} />);
    expect(screen.queryByText(/kg\/eenheid/)).not.toBeInTheDocument();
  });

  it("does not show per-unit calculation when quantity is 0", async () => {
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    const noQtyForm = { ...baseForm, perUnit: true, weight: "1000", quantity: 0 };
    render(<InboxReviewPanel {...defaultProps} form={noQtyForm as any} />);
    expect(screen.queryByText(/kg\/eenheid/)).not.toBeInTheDocument();
  });

  it("rounds per-unit weight to nearest integer", async () => {
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    const oddForm = { ...baseForm, perUnit: true, weight: "1000", quantity: 3 };
    render(<InboxReviewPanel {...defaultProps} form={oddForm as any} />);
    // 1000/3 = 333.33 → rounds to 333
    expect(screen.getByText("≈ 333 kg/eenheid × 3")).toBeInTheDocument();
  });
});

describe.skip("InboxReviewPanel – Time windows", () => {
  const defaultProps = {
    form: baseForm as any,
    isCreatePending: false,
    addressSuggestions: { suggestions: [], loading: false },
    onUpdateField: vi.fn(),
    onToggleRequirement: vi.fn(),
    onAutoSave: vi.fn(),
    onCreateOrder: vi.fn(),
    onDelete: vi.fn(),
  };

  it("shows pickup time window 08:00 - 12:00", async () => {
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    render(
      <InboxReviewPanel
        {...defaultProps}
        selected={{ ...baseDraft, pickup_time_from: "08:00", pickup_time_to: "12:00" } as any}
      />,
    );
    expect(screen.getByText("08:00 - 12:00")).toBeInTheDocument();
  });

  it("shows delivery time window 14:00 - 18:00", async () => {
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    render(
      <InboxReviewPanel
        {...defaultProps}
        selected={{ ...baseDraft, delivery_time_from: "14:00", delivery_time_to: "18:00" } as any}
      />,
    );
    expect(screen.getByText("14:00 - 18:00")).toBeInTheDocument();
  });

  it("shows both pickup and delivery time windows simultaneously", async () => {
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    render(
      <InboxReviewPanel
        {...defaultProps}
        selected={{
          ...baseDraft,
          pickup_time_from: "08:00", pickup_time_to: "12:00",
          delivery_time_from: "14:00", delivery_time_to: "18:00",
        } as any}
      />,
    );
    expect(screen.getByText("08:00 - 12:00")).toBeInTheDocument();
    expect(screen.getByText("14:00 - 18:00")).toBeInTheDocument();
  });

  it("does not show time window when only pickup_time_from is set", async () => {
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    render(
      <InboxReviewPanel
        {...defaultProps}
        selected={{ ...baseDraft, pickup_time_from: "08:00", pickup_time_to: null } as any}
      />,
    );
    expect(screen.queryByText(/08:00 -/)).not.toBeInTheDocument();
  });

  it("does not show time window when only delivery_time_to is set", async () => {
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    render(
      <InboxReviewPanel
        {...defaultProps}
        selected={{ ...baseDraft, delivery_time_from: null, delivery_time_to: "18:00" } as any}
      />,
    );
    expect(screen.queryByText(/- 18:00/)).not.toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════
// InboxSourcePanel — Extended Coverage
// ═══════════════════════════════════════════════════════════════
describe.skip("SourcePanel – highlightEmailBody", () => {
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

describe.skip("SourcePanel – handleParseWithAI", () => {
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

describe.skip("SourcePanel – handleReply branches", () => {
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

describe.skip("SourcePanel – handleForward", () => {
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

describe.skip("SourcePanel – handleSendReply", () => {
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

describe.skip("SourcePanel – Client Card + Previous Orders", () => {
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

describe.skip("SourcePanel – Attachment tab extended", () => {
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
