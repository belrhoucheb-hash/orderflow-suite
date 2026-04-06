import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect } from "vitest";
import "./inbox-test-setup";
import { baseDraft, baseForm } from "./inbox-test-setup";

// ═══════════════════════════════════════════════════════════════
// InboxReviewPanel
// ═══════════════════════════════════════════════════════════════
describe("InboxReviewPanel", () => {
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
// InboxReviewPanel -- extended coverage
// ═══════════════════════════════════════════════════════════════
describe("InboxReviewPanel – FieldConfidenceIndicator", () => {
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

describe("InboxReviewPanel – Confidence ring hover dropdown", () => {
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
    expect(greenSpan.textContent).toContain("\u2713");
  });

  it("shows amber color class for field confidence >= 60 but < 90", async () => {
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    const formWithConf = { ...baseForm, fieldConfidence: { client_name: 72 } };
    render(<InboxReviewPanel {...defaultProps} form={formWithConf as any} />);
    const confRing = screen.getAllByText("50%")[0].closest("[class*='cursor-help']")!;
    fireEvent.mouseEnter(confRing);

    const amberSpan = screen.getByText(/72%/);
    expect(amberSpan.className).toContain("text-amber-600");
    expect(amberSpan.textContent).toContain("\u26a0");
  });

  it("shows red color class for field confidence < 60", async () => {
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    const formWithConf = { ...baseForm, fieldConfidence: { client_name: 30 } };
    render(<InboxReviewPanel {...defaultProps} form={formWithConf as any} />);
    const confRing = screen.getAllByText("50%")[0].closest("[class*='cursor-help']")!;
    fireEvent.mouseEnter(confRing);

    const redSpan = screen.getByText(/30%/);
    expect(redSpan.className).toContain("text-red-600");
    expect(redSpan.textContent).toContain("\u2717");
  });

  it("shows dash for fields with no confidence value", async () => {
    const { InboxReviewPanel } = await import("@/components/inbox/InboxReviewPanel");
    render(<InboxReviewPanel {...defaultProps} />);
    const confRing = screen.getAllByText("50%")[0].closest("[class*='cursor-help']")!;
    fireEvent.mouseEnter(confRing);

    // With empty fieldConfidence, all 8 fields should show "\u2014"
    const dashes = screen.getAllByText("\u2014");
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

describe("InboxReviewPanel – Time-based styling", () => {
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

describe("InboxReviewPanel – Address incomplete warning", () => {
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
    const formIncomplete = { ...baseForm, pickupAddress: "Amsterdam" }; // no number -> incomplete
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

describe("InboxReviewPanel – Per-unit weight calculation", () => {
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
    expect(screen.getByText("\u2248 250 kg/eenheid \u00d7 4")).toBeInTheDocument();
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
    // 1000/3 = 333.33 -> rounds to 333
    expect(screen.getByText("\u2248 333 kg/eenheid \u00d7 3")).toBeInTheDocument();
  });
});

describe("InboxReviewPanel – Time windows", () => {
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
