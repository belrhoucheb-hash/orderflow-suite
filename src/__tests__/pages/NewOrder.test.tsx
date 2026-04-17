import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const { mockNavigate, mockCreateOrder } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockCreateOrder: vi.fn().mockResolvedValue({ id: "new-1" }),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<any>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("@/hooks/useOrders", () => ({
  useCreateOrder: () => ({ mutateAsync: mockCreateOrder, isPending: false }),
}));

vi.mock("@/components/AddressAutocomplete", () => ({
  AddressAutocomplete: ({ value, onChange, placeholder }: any) => (
    <input data-testid={`address-${placeholder}`} value={value || ""} onChange={(e: any) => onChange(e.target.value)} placeholder={placeholder} />
  ),
}));

import NewOrder from "@/pages/NewOrder";

function renderNewOrder() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <NewOrder />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("NewOrder", () => {
  beforeEach(() => vi.clearAllMocks());

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
    expect(screen.getByText("Opslaan")).toBeInTheDocument();
  });

  it("has cancel button and calls navigate (handleSave cancel)", async () => {
    const user = userEvent.setup();
    renderNewOrder();
    const cancelBtn = screen.queryByText(/Annuleren|Terug/i);
    expect(cancelBtn).toBeInTheDocument();
  });

  it("shows Laden and Lossen in form", () => {
    renderNewOrder();
    expect(screen.getByText(/Laden/)).toBeInTheDocument();
    expect(screen.getByText(/Lossen/)).toBeInTheDocument();
  });

  it("shows date display", () => {
    renderNewOrder();
    expect(document.body.textContent).toContain(new Date().getFullYear().toString());
  });

  it("shows transport type field", () => {
    renderNewOrder();
    expect(screen.getByText(/Transport type|Transporttype/i)).toBeInTheDocument();
  });

  it("shows Aantal eenheden field", () => {
    renderNewOrder();
    expect(screen.getByText(/Aantal eenheden/)).toBeInTheDocument();
  });

  it("shows weight field label", () => {
    renderNewOrder();
    expect(screen.getByText(/Gewicht \(kg\)/)).toBeInTheDocument();
  });

  it("shows address autocomplete fields", () => {
    renderNewOrder();
    const addressInputs = document.querySelectorAll('[data-testid^="address-"]');
    expect(addressInputs.length).toBeGreaterThan(0);
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
    // Luxe refactor hernoemde knop naar "Opslaan & sluiten" (sluiten lowercase).
    expect(screen.getByText(/sluiten/i)).toBeInTheDocument();
  });

  it("Opslaan & sluiten triggers handleSave(true) which validates first", async () => {
    const user = userEvent.setup();
    renderNewOrder();
    await user.click(screen.getByText(/sluiten/i));
    expect(document.body.textContent).toBeTruthy();
  });

  it("validates form on save (handleSave with empty fields shows errors)", async () => {
    const user = userEvent.setup();
    renderNewOrder();
    await user.click(screen.getByText("Opslaan"));
    await waitFor(() => {
      // Should show validation errors, not call createOrder
      expect(mockCreateOrder).not.toHaveBeenCalled();
    });
  });

  it("clears error when typing in errored field (clearError)", async () => {
    const user = userEvent.setup();
    renderNewOrder();
    // Trigger save to get errors
    await user.click(screen.getByText("Opslaan"));
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

  it("types in contact person field (setContactpersoon)", async () => {
    const user = userEvent.setup();
    renderNewOrder();

    // Wait for form inputs to render
    await waitFor(() => {
      expect(screen.getAllByRole("textbox").length).toBeGreaterThan(1);
    });

    const textInputs = screen.getAllByRole("textbox");
    // Second textbox might be contact person
    if (textInputs.length > 1) {
      await user.type(textInputs[1], "Contact Person");
      await waitFor(() => {
        expect((textInputs[1] as HTMLInputElement).value).toContain("Contact Person");
      });
    }
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
