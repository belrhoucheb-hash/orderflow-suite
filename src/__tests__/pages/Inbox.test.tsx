import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

// ── Hoisted mock ────────────────────────────────────────────────────
const { mockUseInbox, mockSetSelectedId, mockSetSearch, mockSetSidebarFilter,
  mockSetFilterDate, mockSetFilterClient, mockSetFilterType, mockSetMobileView,
  mockSetBulkSelected, mockHandleImportEmail, mockHandleLoadTestScenario,
  mockHandleCreateOrder, mockHandleAutoConfirmAllSafe, mockHandleAutoConfirmCurrent, mockHandleAutoConfirmSelected, mockHandleDelete, mockHandleAutoSave,
  mockUpdateField, mockToggleRequirement, mockEnrichAddresses, mockSetFormData,
  mockCreateOrderMutate, mockDeleteMutate, mockFileInputRef, mockGetDraftAutoConfirmAssessment, mockGetDraftCaseSummary } = vi.hoisted(() => {
  const ref = { current: null } as any;
  return {
    mockSetSelectedId: vi.fn(),
    mockSetSearch: vi.fn(),
    mockSetSidebarFilter: vi.fn(),
    mockSetFilterDate: vi.fn(),
    mockSetFilterClient: vi.fn(),
    mockSetFilterType: vi.fn(),
    mockSetMobileView: vi.fn(),
    mockSetBulkSelected: vi.fn(),
    mockHandleImportEmail: vi.fn(),
    mockHandleLoadTestScenario: vi.fn().mockResolvedValue(undefined),
    mockHandleCreateOrder: vi.fn(),
    mockHandleAutoConfirmAllSafe: vi.fn(),
    mockHandleAutoConfirmCurrent: vi.fn(),
    mockHandleAutoConfirmSelected: vi.fn(),
    mockHandleDelete: vi.fn(),
    mockHandleAutoSave: vi.fn(),
    mockUpdateField: vi.fn(),
    mockToggleRequirement: vi.fn(),
    mockEnrichAddresses: vi.fn().mockReturnValue({ result: {}, enrichments: [] }),
    mockSetFormData: vi.fn(),
    mockCreateOrderMutate: vi.fn(),
    mockDeleteMutate: vi.fn(),
    mockGetDraftAutoConfirmAssessment: vi.fn().mockReturnValue({
      eligible: false,
      confidence: 80,
      title: "Controle nodig",
      reason: "Nog handmatige review nodig.",
    }),
    mockGetDraftCaseSummary: vi.fn().mockReturnValue({
      status: { key: "review", label: "Planner review", description: "", tone: "", recommendedLabel: "Controleer intake" },
      blockers: [],
      nextStep: "Controleer intake",
    }),
    mockFileInputRef: ref,
    mockUseInbox: vi.fn(),
  };
});

function defaultHookReturn(overrides: any = {}) {
  return {
    selectedId: null, setSelectedId: mockSetSelectedId, formData: {}, search: "", setSearch: mockSetSearch,
    sidebarFilter: "alle", setSidebarFilter: mockSetSidebarFilter, filterDate: "", setFilterDate: mockSetFilterDate,
    filterClient: "", setFilterClient: mockSetFilterClient, filterType: "", setFilterType: mockSetFilterType,
    mobileView: "list", setMobileView: mockSetMobileView, bulkSelected: new Set(), setBulkSelected: mockSetBulkSelected,
    loadingScenario: null, fileInputRef: mockFileInputRef,
    drafts: [], isLoading: false, selected: null, form: null, filtered: [],
    needsAction: [], readyToGo: [], autoConfirmCandidates: [], intakeQueueStats: { total: 0, needsAction: 0, ready: 0, autoConfirm: 0, waitingForInfo: 0, followUpSent: 0 }, addressSuggestions: [], tenant: { id: "t1", name: "Test BV" },
    isCreatePending: false, handleImportEmail: mockHandleImportEmail, handleLoadTestScenario: mockHandleLoadTestScenario,
    handleCreateOrder: mockHandleCreateOrder, handleAutoConfirmAllSafe: mockHandleAutoConfirmAllSafe, handleAutoConfirmCurrent: mockHandleAutoConfirmCurrent, handleAutoConfirmSelected: mockHandleAutoConfirmSelected, handleDelete: mockHandleDelete, handleAutoSave: mockHandleAutoSave,
    updateField: mockUpdateField, toggleRequirement: mockToggleRequirement, enrichAddresses: mockEnrichAddresses, setFormData: mockSetFormData,
    getDraftAutoConfirmAssessment: mockGetDraftAutoConfirmAssessment,
    getDraftCaseSummary: mockGetDraftCaseSummary,
    createOrderMutation: { mutate: mockCreateOrderMutate, isPending: false },
    deleteMutation: { mutate: mockDeleteMutate, isPending: false },
    ...overrides,
  };
}

vi.mock("@/hooks/useInbox", () => ({ useInbox: () => mockUseInbox() }));
vi.mock("@/lib/companyConfig", () => ({ DEFAULT_COMPANY: { name: "OrderFlow Suite" } }));
vi.mock("@/components/inbox/InboxSourcePanel", () => ({
  SourcePanel: ({ onParseResult }: any) => (
    <div data-testid="source-panel">
      <button data-testid="parse-btn" onClick={() => onParseResult({ client_name: "Test" })}>Parse</button>
    </div>
  ),
}));
vi.mock("@/components/inbox/InboxListItem", () => ({
  InboxListItem: ({ draft, onClick, onBulkToggle, isBulkChecked }: any) => (
    <div data-testid="inbox-item" onClick={onClick}>
      <span>{draft.client_name}</span>
      <button data-testid={`bulk-${draft.id}`} onClick={(e) => { e.stopPropagation(); onBulkToggle(draft.id); }}>
        {isBulkChecked ? "checked" : "unchecked"}
      </button>
    </div>
  ),
}));
vi.mock("@/components/inbox/InboxReviewPanel", () => ({
  InboxReviewPanel: ({ onCreateOrder, onAutoConfirm, onDelete, onAutoSave, onUpdateField, onToggleRequirement }: any) => (
    <div data-testid="review-panel">
      <button data-testid="create-order-btn" onClick={onCreateOrder}>Create</button>
      <button data-testid="auto-confirm-btn" onClick={onAutoConfirm}>AutoConfirm</button>
      <button data-testid="delete-btn" onClick={onDelete}>Delete</button>
      <button data-testid="autosave-btn" onClick={onAutoSave}>AutoSave</button>
      <button data-testid="update-field-btn" onClick={() => onUpdateField("client_name", "X")}>UpdateField</button>
      <button data-testid="toggle-req-btn" onClick={() => onToggleRequirement("ADR")}>ToggleReq</button>
    </div>
  ),
}));
vi.mock("@/components/inbox/utils", () => ({ TEST_SCENARIOS: [{ name: "s1" }, { name: "s2" }], getFormErrors: vi.fn().mockReturnValue(null) }));

import Inbox from "@/pages/Inbox";

function renderInbox() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Inbox />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const mockDraft = { id: "d1", client_name: "Acme", subject: "Order 1", status: "pending", created_at: "2025-01-01" };
const mockDraft2 = { id: "d2", client_name: "Beta Corp", subject: "Order 2", status: "ready", created_at: "2025-01-02" };
const mockForm = { client_name: "Acme", pickup_address: "A", delivery_address: "B" };

describe("Inbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseInbox.mockReturnValue(defaultHookReturn());
  });

  it("renders without crashing", () => {
    renderInbox();
    expect(document.body.textContent).toBeTruthy();
  });

  it("shows loading state", () => {
    mockUseInbox.mockReturnValue(defaultHookReturn({ isLoading: true }));
    renderInbox();
    expect(screen.getByText(/laden/i)).toBeInTheDocument();
  });

  it("shows no loading state when not loading", () => {
    renderInbox();
    expect(screen.queryByText(/Inbox laden/)).not.toBeInTheDocument();
  });

  // ── setSidebarFilter ──
  it("clicks sidebar filter buttons (setSidebarFilter)", async () => {
    const user = userEvent.setup();
    renderInbox();
    await user.click(screen.getAllByRole("button", { name: /actie nodig/i })[0]);
    expect(mockSetSidebarFilter).toHaveBeenCalledWith("actie");
  });

  it("clicks Alle sidebar button", async () => {
    const user = userEvent.setup();
    renderInbox();
    await user.click(screen.getByText("Alle"));
    expect(mockSetSidebarFilter).toHaveBeenCalledWith("alle");
  });

  it("clicks Klaar sidebar button", async () => {
    const user = userEvent.setup();
    renderInbox();
    await user.click(screen.getByText("Klaar"));
    expect(mockSetSidebarFilter).toHaveBeenCalledWith("klaar");
  });

  it("clicks Verzonden sidebar button", async () => {
    const user = userEvent.setup();
    renderInbox();
    await user.click(screen.getByText("Verzonden"));
    expect(mockSetSidebarFilter).toHaveBeenCalledWith("verzonden");
  });

  it("clicks Concepten sidebar button", async () => {
    const user = userEvent.setup();
    renderInbox();
    await user.click(screen.getByText("Concepten"));
    expect(mockSetSidebarFilter).toHaveBeenCalledWith("concepten");
  });

  // ── setSearch ──
  it("types in search input (setSearch)", () => {
    renderInbox();
    const input = screen.getByPlaceholderText(/Zoek op order of klant/);
    fireEvent.change(input, { target: { value: "test" } });
    expect(mockSetSearch).toHaveBeenCalledWith("test");
  });

  // ── setFilterDate ──
  it("changes date filter (setFilterDate)", () => {
    renderInbox();
    const select = screen.getByDisplayValue("Datum");
    fireEvent.change(select, { target: { value: "today" } });
    expect(mockSetFilterDate).toHaveBeenCalledWith("today");
  });

  it("changes date filter to week", () => {
    renderInbox();
    const select = screen.getByDisplayValue("Datum");
    fireEvent.change(select, { target: { value: "week" } });
    expect(mockSetFilterDate).toHaveBeenCalledWith("week");
  });

  it("changes date filter to month", () => {
    renderInbox();
    const select = screen.getByDisplayValue("Datum");
    fireEvent.change(select, { target: { value: "month" } });
    expect(mockSetFilterDate).toHaveBeenCalledWith("month");
  });

  // ── setFilterType ──
  it("changes type filter (setFilterType)", () => {
    renderInbox();
    const select = screen.getByDisplayValue("Type");
    fireEvent.change(select, { target: { value: "new" } });
    expect(mockSetFilterType).toHaveBeenCalledWith("new");
  });

  it("changes type filter to update", () => {
    renderInbox();
    const select = screen.getByDisplayValue("Type");
    fireEvent.change(select, { target: { value: "update" } });
    expect(mockSetFilterType).toHaveBeenCalledWith("update");
  });

  it("changes type filter to cancellation", () => {
    renderInbox();
    const select = screen.getByDisplayValue("Type");
    fireEvent.change(select, { target: { value: "cancellation" } });
    expect(mockSetFilterType).toHaveBeenCalledWith("cancellation");
  });

  // ── setFilterClient ──
  it("changes client filter (setFilterClient)", () => {
    mockUseInbox.mockReturnValue(defaultHookReturn({
      drafts: [{ id: "d1", client_name: "Acme" }],
    }));
    renderInbox();
    const select = screen.getByDisplayValue("Klant");
    fireEvent.change(select, { target: { value: "Acme" } });
    expect(mockSetFilterClient).toHaveBeenCalledWith("Acme");
  });

  // ── Item click: setSelectedId + setMobileView ──
  it("clicking an inbox item sets selectedId and mobileView", async () => {
    const user = userEvent.setup();
    mockUseInbox.mockReturnValue(defaultHookReturn({
      filtered: [mockDraft],
    }));
    renderInbox();
    await user.click(screen.getByText("Acme"));
    expect(mockSetSelectedId).toHaveBeenCalledWith("d1");
    expect(mockSetMobileView).toHaveBeenCalledWith("source");
  });

  // ── Bulk toggle: setBulkSelected ──
  it("toggles bulk selection on an item (setBulkSelected)", async () => {
    const user = userEvent.setup();
    mockUseInbox.mockReturnValue(defaultHookReturn({
      filtered: [mockDraft],
    }));
    renderInbox();
    await user.click(screen.getByTestId("bulk-d1"));
    expect(mockSetBulkSelected).toHaveBeenCalled();
  });

  // ── Bulk bar: approve (createOrderMutation.mutate) ──
  it("shows bulk bar and clicks Goedkeuren", async () => {
    const user = userEvent.setup();
    mockUseInbox.mockReturnValue(defaultHookReturn({
      bulkSelected: new Set(["d1"]),
      formData: { d1: mockForm },
    }));
    renderInbox();
    expect(screen.getByText("1 geselecteerd")).toBeInTheDocument();
    await user.click(screen.getByText("Goedkeuren"));
    expect(mockCreateOrderMutate).toHaveBeenCalled();
  });

  // ── Bulk bar: approve multiple items ──
  it("bulk approves multiple items", async () => {
    const user = userEvent.setup();
    mockUseInbox.mockReturnValue(defaultHookReturn({
      bulkSelected: new Set(["d1", "d2"]),
      formData: { d1: mockForm, d2: { client_name: "Beta", pickup_address: "X", delivery_address: "Y" } },
    }));
    renderInbox();
    expect(screen.getByText("2 geselecteerd")).toBeInTheDocument();
    await user.click(screen.getByText("Goedkeuren"));
    expect(mockCreateOrderMutate).toHaveBeenCalledTimes(2);
  });

  // ── Bulk bar: delete (deleteMutation.mutate) ──
  it("shows bulk bar and clicks Verwijder", async () => {
    const user = userEvent.setup();
    mockUseInbox.mockReturnValue(defaultHookReturn({
      bulkSelected: new Set(["d1"]),
    }));
    renderInbox();
    await user.click(screen.getByText("Verwijder"));
    expect(mockDeleteMutate).toHaveBeenCalledWith("d1");
  });

  // ── Bulk bar: delete multiple ──
  it("bulk deletes multiple items", async () => {
    const user = userEvent.setup();
    mockUseInbox.mockReturnValue(defaultHookReturn({
      bulkSelected: new Set(["d1", "d2"]),
    }));
    renderInbox();
    await user.click(screen.getByText("Verwijder"));
    expect(mockDeleteMutate).toHaveBeenCalledTimes(2);
  });

  // ── Bulk bar: cancel (setBulkSelected to empty set) ──
  it("shows bulk bar and clicks Annuleer", async () => {
    const user = userEvent.setup();
    mockUseInbox.mockReturnValue(defaultHookReturn({
      bulkSelected: new Set(["d1"]),
    }));
    renderInbox();
    await user.click(screen.getByText("Annuleer"));
    expect(mockSetBulkSelected).toHaveBeenCalled();
  });

  // ── handleImportEmail via file input ──
  it("triggers handleImportEmail via file input onChange", () => {
    mockUseInbox.mockReturnValue(defaultHookReturn());
    renderInbox();
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();
    const file = new File(["email"], "test.eml", { type: "message/rfc822" });
    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(mockHandleImportEmail).toHaveBeenCalledWith(file);
  });

  // ── file input with no file selected ──
  it("does not call handleImportEmail when no file selected", () => {
    mockUseInbox.mockReturnValue(defaultHookReturn());
    renderInbox();
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [] } });
    expect(mockHandleImportEmail).not.toHaveBeenCalled();
  });

  // ── Importeer .eml button triggers fileInputRef.current.click() ──
  it("clicks Importeer .eml button without error", async () => {
    mockUseInbox.mockReturnValue(defaultHookReturn());
    const user = userEvent.setup();
    renderInbox();
    // Button calls fileInputRef.current?.click() - just verify no crash
    await user.click(screen.getByText("Importeer .eml"));
    expect(document.body.textContent).toBeTruthy();
  });

  // ── handleLoadTestScenario ──
  it("clicks Laad testdata to call handleLoadTestScenario for each scenario", async () => {
    const user = userEvent.setup();
    renderInbox();
    await user.click(screen.getByText("Laad testdata"));
    await waitFor(() => {
      expect(mockHandleLoadTestScenario).toHaveBeenCalledTimes(2);
    });
  });

  // ── Selected state: shows SourcePanel and ReviewPanel ──
  it("shows source and review panels when a draft is selected", () => {
    mockUseInbox.mockReturnValue(defaultHookReturn({
      selected: mockDraft,
      form: mockForm,
    }));
    renderInbox();
    expect(screen.getByTestId("source-panel")).toBeInTheDocument();
    expect(screen.getByTestId("review-panel")).toBeInTheDocument();
  });

  // ── ReviewPanel: handleCreateOrder ──
  it("calls handleCreateOrder from review panel", async () => {
    const user = userEvent.setup();
    mockUseInbox.mockReturnValue(defaultHookReturn({
      selected: mockDraft,
      form: mockForm,
    }));
    renderInbox();
    await user.click(screen.getByTestId("create-order-btn"));
    expect(mockHandleCreateOrder).toHaveBeenCalled();
  });

  it("calls handleAutoConfirmCurrent from review panel", async () => {
    const user = userEvent.setup();
    mockUseInbox.mockReturnValue(defaultHookReturn({
      selected: mockDraft,
      form: mockForm,
    }));
    renderInbox();
    await user.click(screen.getByTestId("auto-confirm-btn"));
    expect(mockHandleAutoConfirmCurrent).toHaveBeenCalled();
  });

  // ── ReviewPanel: handleDelete ──
  it("calls handleDelete from review panel", async () => {
    const user = userEvent.setup();
    mockUseInbox.mockReturnValue(defaultHookReturn({
      selected: mockDraft,
      form: mockForm,
    }));
    renderInbox();
    await user.click(screen.getByTestId("delete-btn"));
    expect(mockHandleDelete).toHaveBeenCalled();
  });

  // ── ReviewPanel: handleAutoSave ──
  it("calls handleAutoSave from review panel", async () => {
    const user = userEvent.setup();
    mockUseInbox.mockReturnValue(defaultHookReturn({
      selected: mockDraft,
      form: mockForm,
    }));
    renderInbox();
    await user.click(screen.getByTestId("autosave-btn"));
    expect(mockHandleAutoSave).toHaveBeenCalled();
  });

  // ── ReviewPanel: updateField ──
  it("calls updateField from review panel", async () => {
    const user = userEvent.setup();
    mockUseInbox.mockReturnValue(defaultHookReturn({
      selected: mockDraft,
      form: mockForm,
    }));
    renderInbox();
    await user.click(screen.getByTestId("update-field-btn"));
    expect(mockUpdateField).toHaveBeenCalledWith("client_name", "X");
  });

  // ── ReviewPanel: toggleRequirement ──
  it("calls toggleRequirement from review panel", async () => {
    const user = userEvent.setup();
    mockUseInbox.mockReturnValue(defaultHookReturn({
      selected: mockDraft,
      form: mockForm,
    }));
    renderInbox();
    await user.click(screen.getByTestId("toggle-req-btn"));
    expect(mockToggleRequirement).toHaveBeenCalledWith("ADR");
  });

  // ── SourcePanel: onParseResult triggers enrichAddresses + setFormData ──
  it("calls enrichAddresses and setFormData via SourcePanel onParseResult", async () => {
    const user = userEvent.setup();
    mockUseInbox.mockReturnValue(defaultHookReturn({
      selected: mockDraft,
      form: mockForm,
    }));
    renderInbox();
    await user.click(screen.getByTestId("parse-btn"));
    expect(mockEnrichAddresses).toHaveBeenCalledWith({ client_name: "Test" });
    expect(mockSetFormData).toHaveBeenCalled();
  });

  // ── Empty state ──
  it("shows empty state when filtered list is empty", () => {
    mockUseInbox.mockReturnValue(defaultHookReturn({ filtered: [] }));
    renderInbox();
    expect(screen.getByText("Geen berichten")).toBeInTheDocument();
  });

  // ── Unselected state shows placeholder ──
  it("shows placeholder when no email is selected", () => {
    renderInbox();
    expect(screen.getByText("Selecteer een e-mail")).toBeInTheDocument();
  });

  // ── Tenant name ──
  it("shows tenant name in sidebar", () => {
    renderInbox();
    expect(screen.getByText("Test BV")).toBeInTheDocument();
  });

  // ── Default company name ──
  it("shows default company name when no tenant", () => {
    mockUseInbox.mockReturnValue(defaultHookReturn({ tenant: null }));
    renderInbox();
    expect(screen.getByText("OrderFlow Suite")).toBeInTheDocument();
  });

  // ── loadingScenario shows "Laden..." ──
  it("shows Laden... text when loadingScenario is set", () => {
    mockUseInbox.mockReturnValue(defaultHookReturn({ loadingScenario: 0 }));
    renderInbox();
    expect(screen.getByText("Laden...")).toBeInTheDocument();
  });

  // ── Multiple items in filtered list ──
  it("renders multiple inbox items", () => {
    mockUseInbox.mockReturnValue(defaultHookReturn({
      filtered: [mockDraft, mockDraft2],
    }));
    renderInbox();
    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("Beta Corp")).toBeInTheDocument();
  });

  // ── Click second item ──
  it("clicking second inbox item sets correct selectedId", async () => {
    const user = userEvent.setup();
    mockUseInbox.mockReturnValue(defaultHookReturn({
      filtered: [mockDraft, mockDraft2],
    }));
    renderInbox();
    await user.click(screen.getByText("Beta Corp"));
    expect(mockSetSelectedId).toHaveBeenCalledWith("d2");
    expect(mockSetMobileView).toHaveBeenCalledWith("source");
  });

  // ── Sidebar filter counts ──
  it("shows count badges in sidebar when there are items", () => {
    mockUseInbox.mockReturnValue(defaultHookReturn({
      drafts: [mockDraft, mockDraft2],
      needsAction: [mockDraft],
      readyToGo: [mockDraft2],
      autoConfirmCandidates: [mockDraft2],
    }));
    renderInbox();
    // The sidebar shows counts for drafts (2), needsAction (1), readyToGo (1)
    expect(screen.getAllByText("2").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("1").length).toBeGreaterThanOrEqual(1);
  });

  it("shows auto-confirm summary and triggers safe confirm action", async () => {
    const user = userEvent.setup();
    mockUseInbox.mockReturnValue(defaultHookReturn({
      autoConfirmCandidates: [mockDraft],
    }));
    renderInbox();
    expect(screen.getByText("Veilige intakekandidaten")).toBeInTheDocument();
    await user.click(screen.getByText("Bevestig veilig"));
    expect(mockHandleAutoConfirmAllSafe).toHaveBeenCalled();
  });

  it("shows intake queue cards and switches focus", async () => {
    const user = userEvent.setup();
    mockUseInbox.mockReturnValue(defaultHookReturn({
      intakeQueueStats: { total: 6, needsAction: 2, ready: 3, autoConfirm: 1, waitingForInfo: 4, followUpSent: 5 },
    }));
    renderInbox();
    expect(screen.getByText("Wacht op info")).toBeInTheDocument();
    expect(screen.getByText("Reactie")).toBeInTheDocument();
    expect(screen.getByText("Verstuurd")).toBeInTheDocument();
    await user.click(screen.getByText("Wacht op info"));
    expect(mockSetSidebarFilter).toHaveBeenCalledWith("concepten");
  });
});
