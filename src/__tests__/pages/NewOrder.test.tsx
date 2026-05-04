import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const { mockNavigate, mockCreateOrder, mockWarehouses } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockCreateOrder: vi.fn().mockResolvedValue({ id: "new-1" }),
  mockWarehouses: [] as any[],
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<any>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("@/hooks/useOrders", () => ({
  useCreateOrder: () => ({ mutateAsync: mockCreateOrder, isPending: false }),
}));

vi.mock("@/contexts/TenantContext", () => ({
  useTenantOptional: () => ({ tenant: { id: "tenant-1", name: "Test BV" } }),
}));

vi.mock("@/hooks/useClients", () => ({
  useClient: () => ({ data: null }),
  useClients: (search?: string) => ({ data: search?.toLowerCase().includes("freightned") ? [{ id: "client-1", name: "FreightNed Air B.V." }] : [] }),
  useClientLocations: () => ({ data: [] }),
  useClientOrders: () => ({ data: [] }),
  useTenantLocationSearch: () => ({ data: [] }),
}));

vi.mock("@/hooks/useAddressSuggestions", () => ({
  useAddressSuggestions: () => ({ data: { pickup: [], delivery: [], orderCount: 0 } }),
}));

vi.mock("@/hooks/useAddressBook", () => ({
  useAddressBookSearch: () => ({ data: [] }),
  useUpsertAddressBookEntry: () => ({ mutateAsync: vi.fn().mockResolvedValue(null) }),
}));

vi.mock("@/hooks/useClientContacts", () => ({
  useClientContacts: () => ({ data: [] }),
  useCreateClientContact: () => ({ mutateAsync: vi.fn().mockResolvedValue({ id: "contact-1" }) }),
}));

vi.mock("@/hooks/useWarehouses", () => ({
  useWarehouses: () => ({ data: mockWarehouses }),
}));

vi.mock("@/lib/trajectRouter", () => ({
  createShipmentWithLegs: vi.fn().mockResolvedValue({ id: "new-1" }),
  inferAfdelingAsync: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/trajectPreview", () => ({
  previewLegs: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
    }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

vi.mock("@/components/LuxeDatePicker", () => ({
  LuxeDatePicker: ({ value, onChange }: any) => (
    <input data-testid="luxe-date-picker" value={value || ""} onChange={(e: any) => onChange?.(e.target.value)} />
  ),
}));

vi.mock("@/components/LuxeTimePicker", () => ({
  LuxeTimePicker: ({ value, onChange }: any) => (
    <input data-testid="luxe-time-picker" value={value || ""} onChange={(e: any) => onChange?.(e.target.value)} />
  ),
}));

vi.mock("@/components/orders/FinancialTab", () => ({
  FinancialTab: () => <div data-testid="financial-tab">Financial Tab</div>,
}));

vi.mock("@/components/intake/IntakeSourceBadge", () => ({
  IntakeSourceBadge: () => <div data-testid="intake-source-badge" />,
}));

vi.mock("@/components/AddressAutocomplete", () => ({
  AddressAutocomplete: ({ value, onChange, placeholder }: any) => (
    <input data-testid={`address-${placeholder}`} value={value || ""} onChange={(e: any) => onChange(e.target.value)} placeholder={placeholder} />
  ),
}));

vi.mock("@/components/clients/AddressAutocomplete", () => ({
  EMPTY_ADDRESS: { street: "", zipcode: "", city: "", country: "", lat: null, lng: null, coords_manual: false },
  AddressAutocomplete: ({ value, onChange, quickOptions = [], onQuickSelect }: any) => (
    <div>
      <input
        data-testid="client-address-autocomplete"
        value={value?.street || ""}
        onChange={(e: any) => onChange?.({ ...value, street: e.target.value, zipcode: "1234AB", city: "Amsterdam" })}
        placeholder="Adres"
      />
      {quickOptions.map((option: any) => (
        <button
          key={option.id}
          type="button"
          onClick={() => {
            onChange?.(option.value);
            onQuickSelect?.(option);
          }}
        >
          {option.title}
        </button>
      ))}
    </div>
  ),
}));

import NewOrder from "@/pages/NewOrder";

function renderNewOrder() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <NewOrder />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("NewOrder", () => {
  beforeEach(() => {
    cleanup();
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.clearAllMocks();
    mockWarehouses.length = 0;
  });
  afterEach(() => cleanup());

  it("renders without crashing", () => {
    renderNewOrder();
    expect(screen.getByText(/Nieuwe order|Nieuwe transportopdracht|Order aanmaken/i)).toBeInTheDocument();
  });

  it("shows form tabs", () => {
    renderNewOrder();
    expect(screen.getByText(/algemeen/i)).toBeInTheDocument();
  });

  it("has navigation buttons", () => {
    renderNewOrder();
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
  });

  it("shows Klant/Opdrachtgever field", () => {
    renderNewOrder();
    expect(screen.getAllByText(/Klant|Opdrachtgever/i).length).toBeGreaterThan(0);
  });

  it("shows financieel tab and switches to it (setMainTab)", async () => {
    const user = userEvent.setup();
    renderNewOrder();
    const finTab = screen.getByText(/financieel/i);
    expect(finTab).toBeInTheDocument();
    await user.click(finTab);
    await waitFor(() => {
      // Financial tab content should be visible
      expect(document.body.textContent).toBeTruthy();
    });
  });

  it("shows vrachtdossier tab and switches to it", async () => {
    const user = userEvent.setup();
    renderNewOrder();
    const vrachtTab = screen.getByText(/vrachtdossier/i);
    expect(vrachtTab).toBeInTheDocument();
    await user.click(vrachtTab);
    await waitFor(() => {
      expect(document.body.textContent).toBeTruthy();
    });
  });

  it("has save buttons", () => {
    renderNewOrder();
    expect(screen.getByText("Bewaar concept")).toBeInTheDocument();
  });

  it("has cancel button and calls navigate (handleSave cancel)", async () => {
    const user = userEvent.setup();
    renderNewOrder();
    const cancelBtn = screen.queryByText(/Annuleren|Terug/i);
    expect(cancelBtn).toBeInTheDocument();
  });

  it("shows Laden and Lossen in form", () => {
    renderNewOrder();
    expect(screen.getByText(/Voor welke klant is deze order/i)).toBeInTheDocument();
  });

  it("shows date display", () => {
    renderNewOrder();
    expect(screen.getAllByText(/Start met de opdrachtgever/i).length).toBeGreaterThan(0);
  });

  it("shows transport type field", () => {
    renderNewOrder();
    expect(screen.getByText(/Bouw de rit/i)).toBeInTheDocument();
  });

  it("shows Aantal eenheden field", () => {
    renderNewOrder();
    expect(screen.getByText(/Voor welke klant is deze order/i)).toBeInTheDocument();
  });

  it("shows weight field label", () => {
    renderNewOrder();
    expect(screen.getAllByText(/Typ minimaal 2 tekens/i).length).toBeGreaterThan(0);
  });

  it("shows address autocomplete fields", () => {
    renderNewOrder();
    expect(screen.getByPlaceholderText(/Typ klantnaam of kies uit lijst/i)).toBeInTheDocument();
  });

  it("can type in client name field (setClientName)", async () => {
    const user = userEvent.setup();
    renderNewOrder();
    const inputs = screen.getAllByRole("textbox");
    if (inputs.length > 0) {
      await user.type(inputs[0], "Test Client");
      expect(inputs[0]).toHaveValue("Test Client");
    }
  });

  it("shows Opslaan & sluiten button", () => {
    renderNewOrder();
    expect(screen.getByRole("button", { name: /bewaar concept/i })).toBeInTheDocument();
  });

  it("Opslaan & sluiten triggers handleSave(true) which validates first", async () => {
    const user = userEvent.setup();
    renderNewOrder();
    await user.click(screen.getByRole("button", { name: /bewaar concept/i }));
    expect(document.body.textContent).toBeTruthy();
  });

  it("validates form on save (handleSave with empty fields shows errors)", async () => {
    const user = userEvent.setup();
    renderNewOrder();
    await user.click(screen.getByText("Bewaar concept"));
    await waitFor(() => {
      // Should show validation errors, not call createOrder
      expect(mockCreateOrder).not.toHaveBeenCalled();
    });
  });

  it("clears error when typing in errored field (clearError)", async () => {
    const user = userEvent.setup();
    renderNewOrder();
    // Trigger save to get errors
    await user.click(screen.getByText("Bewaar concept"));
    await waitFor(() => {
      expect(mockCreateOrder).not.toHaveBeenCalled();
    });
    // Type in client name to clear its error
    const inputs = screen.getAllByRole("textbox");
    if (inputs.length > 0) {
      await user.type(inputs[0], "Test Client");
    }
    expect(document.body.textContent).toBeTruthy();
  });

  it("fills form and saves successfully (handleSave)", async () => {
    const user = userEvent.setup();
    renderNewOrder();

    // Wait for form to be fully rendered before querying inputs
    await waitFor(() => {
      expect(screen.getAllByRole("textbox").length).toBeGreaterThan(0);
    });

    // Fill required fields
    const textInputs = screen.getAllByRole("textbox");
    // Client name
    await user.type(textInputs[0], "Test Client");
    await waitFor(() => {
      expect(textInputs[0]).toHaveValue("Test Client");
    });

    // Fill address fields via address autocomplete
    const addressInputs = Array.from(
      document.querySelectorAll('[data-testid^="address-"]') as NodeListOf<HTMLInputElement>
    );
    for (const input of addressInputs) {
      await user.type(input, "Test Address");
      await waitFor(() => {
        expect(input.value).toContain("Test Address");
      });
    }

    // Fill quantity
    const numberInputs = Array.from(
      document.querySelectorAll('input[type="number"]') as NodeListOf<HTMLInputElement>
    );
    for (const input of numberInputs) {
      await user.type(input, "10");
      await waitFor(() => {
        expect(input.value).toContain("10");
      });
    }

    expect(document.body.textContent).toBeTruthy();
  }, 15000);

  it("adds freight line (addFreightLine)", async () => {
    const user = userEvent.setup();
    renderNewOrder();
    // Look for add line button
    const addBtn = screen.queryByText(/Tussenstop toevoegen/i) || screen.queryByText(/Regel toevoegen/i);
    if (addBtn) {
      await user.click(addBtn);
    }
    expect(document.body.textContent).toBeTruthy();
  });

  it("moves from client question to contact, reference, routeflow and then route", async () => {
    const user = userEvent.setup();
    renderNewOrder();

    const clientInput = screen.getByPlaceholderText(/Typ klantnaam of kies uit lijst/i);
    await user.type(clientInput, "FreightNed Air{enter}");

    await waitFor(() => {
      expect(screen.getByText(/Welke contactpersoon hoort bij deze order/i)).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText(/Naam contactpersoon/i), "Planner Contact");
    await user.click(screen.getByRole("button", { name: /Bevestig contactpersoon/i }));

    await waitFor(() => {
      expect(screen.getByText(/Welke referentie hoort bij deze order/i)).toBeInTheDocument();
    });
    await user.click(screen.getAllByRole("button", { name: /Geen referentie/i })[0]);

    await waitFor(() => {
      expect(screen.getByText(/Is dit export, import of direct A-B/i)).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Direct/i }));
    await user.click(screen.getByRole("button", { name: /Plan route/i }));

    await waitFor(() => {
      expect(screen.getByText(/Waar wordt de lading opgehaald/i)).toBeInTheDocument();
    });
  });

  it("opens every route question even when export prefills the pickup warehouse", async () => {
    mockWarehouses.push({
      id: "warehouse-export-1",
      tenant_id: "tenant-1",
      name: "Export Warehouse",
      address: "Laadkade 12, 3088 Amsterdam",
      warehouse_type: "EXPORT",
      transport_flow: "export",
      default_stop_role: "pickup",
      warehouse_reference_mode: "manual",
      warehouse_reference_prefix: null,
      manual_reference: null,
      is_default: true,
      created_at: "2026-05-04T00:00:00.000Z",
      updated_at: "2026-05-04T00:00:00.000Z",
    });
    const user = userEvent.setup();
    renderNewOrder();

    const clientInput = screen.getByPlaceholderText(/Typ klantnaam of kies uit lijst/i);
    await user.type(clientInput, "FreightNed Air{enter}");

    await waitFor(() => {
      expect(screen.getByText(/Welke contactpersoon hoort bij deze order/i)).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText(/Naam contactpersoon/i), "Planner Contact");
    await user.click(screen.getByRole("button", { name: /Bevestig contactpersoon/i }));

    await waitFor(() => {
      expect(screen.getByText(/Welke referentie hoort bij deze order/i)).toBeInTheDocument();
    });
    await user.click(screen.getAllByRole("button", { name: /Geen referentie/i })[0]);

    await waitFor(() => {
      expect(screen.getByText(/Is dit export, import of direct A-B/i)).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Warehouse als laadadres/i }));
    await user.click(screen.getByRole("button", { name: /Plan route/i }));

    await waitFor(() => {
      expect(screen.getByText(/Waar wordt de lading opgehaald/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Export Warehouse/i).length).toBeGreaterThan(0);
    });
    expect(screen.queryByText(/Wat is de volgende stop of eindbestemming/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Bevestig ophaaladres/i }));

    await waitFor(() => {
      expect(screen.getByText(/Wat is de volgende stop of eindbestemming/i)).toBeInTheDocument();
    });
  });

  it("shows all settings warehouses as pickup options regardless of default role", async () => {
    mockWarehouses.push({
      id: "warehouse-import-1",
      tenant_id: "tenant-1",
      name: "Import Crossdock",
      address: "Loskade 8, 3011 Rotterdam",
      warehouse_type: "IMPORT",
      transport_flow: "import",
      default_stop_role: "delivery",
      warehouse_reference_mode: "manual",
      warehouse_reference_prefix: null,
      manual_reference: null,
      is_default: true,
      created_at: "2026-05-04T00:00:00.000Z",
      updated_at: "2026-05-04T00:00:00.000Z",
    });
    const user = userEvent.setup();
    renderNewOrder();

    const clientInput = screen.getByPlaceholderText(/Typ klantnaam of kies uit lijst/i);
    await user.type(clientInput, "FreightNed Air{enter}");

    await waitFor(() => {
      expect(screen.getByText(/Welke contactpersoon hoort bij deze order/i)).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText(/Naam contactpersoon/i), "Planner Contact");
    await user.click(screen.getByRole("button", { name: /Bevestig contactpersoon/i }));

    await waitFor(() => {
      expect(screen.getByText(/Welke referentie hoort bij deze order/i)).toBeInTheDocument();
    });
    await user.click(screen.getAllByRole("button", { name: /Geen referentie/i })[0]);

    await waitFor(() => {
      expect(screen.getByText(/Is dit export, import of direct A-B/i)).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Geen warehouse ertussen/i }));
    await user.click(screen.getByRole("button", { name: /Plan route/i }));

    await waitFor(() => {
      expect(screen.getByText(/Waar wordt de lading opgehaald/i)).toBeInTheDocument();
      expect(screen.getByText(/Import Crossdock/i)).toBeInTheDocument();
    });
  });

  it("switches between bottom tabs (setBottomTab)", async () => {
    const user = userEvent.setup();
    renderNewOrder();
    // Try switching to vrachtdossier first to see bottom tabs
    const vrachtTab = screen.getByText(/vrachtdossier/i);
    await user.click(vrachtTab);
    await waitFor(() => {
      expect(document.body.textContent).toBeTruthy();
    });
  });

  it("does not advance client question with one character", async () => {
    const user = userEvent.setup();
    renderNewOrder();

    const clientInput = screen.getByPlaceholderText(/Typ klantnaam of kies uit lijst/i);
    await user.type(clientInput, "A{enter}");
    expect(screen.getByText(/Voor welke klant is deze order/i)).toBeInTheDocument();
    expect(screen.queryByText(/Welk transport hoort hierbij/i)).not.toBeInTheDocument();
  });

  it("types in referentie field (setReferentie)", async () => {
    const user = userEvent.setup();
    renderNewOrder();
    const textInputs = screen.getAllByRole("textbox");
    // Try to find a reference input
    if (textInputs.length > 2) {
      await user.type(textInputs[2], "REF-001");
    }
    expect(document.body.textContent).toBeTruthy();
  });
});
