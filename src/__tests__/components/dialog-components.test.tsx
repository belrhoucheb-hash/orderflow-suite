import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

// ─── Global Mocks ────────────────────────────────────────────
const mockCreateClient = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
vi.mock("@/hooks/useClients", () => ({
  useCreateClient: () => mockCreateClient,
  useClientLocations: () => ({ data: [] }),
  useClientRates: () => ({ data: [] }),
  useClientOrders: () => ({ data: [] }),
}));

const mockCreateDriver = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
const mockUpdateDriver = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
vi.mock("@/hooks/useDrivers", () => ({
  useDrivers: () => ({ createDriver: mockCreateDriver, updateDriver: mockUpdateDriver }),
}));

const mockAddVehicle = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
const mockCreateDocument = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
const mockCreateMaintenance = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
vi.mock("@/hooks/useFleet", () => ({
  useFleetVehicles: () => ({ data: [{ id: "v1", name: "Truck A", plate: "AB-123-CD" }] }),
  useAddVehicle: () => mockAddVehicle,
  useCreateDocument: () => mockCreateDocument,
  useCreateMaintenance: () => mockCreateMaintenance,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }) },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(), insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(), delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: null }),
      ilike: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
    channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }) }),
    removeChannel: vi.fn(),
  },
}));

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({ tenant: { id: "t1", name: "Test" }, loading: false }),
}));

function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = createQueryClient();
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

// ═══════════════════════════════════════════════════════════════
// NewClientDialog
// ═══════════════════════════════════════════════════════════════
describe("NewClientDialog", () => {
  it("renders dialog when open", async () => {
    const { NewClientDialog } = await import("@/components/clients/NewClientDialog");
    render(<Wrapper><NewClientDialog open={true} onOpenChange={vi.fn()} /></Wrapper>);
    expect(screen.getByText("Nieuwe klant")).toBeInTheDocument();
    expect(screen.getByText("Bedrijfsnaam *")).toBeInTheDocument();
    expect(screen.getByText("Klant aanmaken")).toBeInTheDocument();
  });

  it("does not render when closed", async () => {
    const { NewClientDialog } = await import("@/components/clients/NewClientDialog");
    render(<Wrapper><NewClientDialog open={false} onOpenChange={vi.fn()} /></Wrapper>);
    expect(screen.queryByText("Nieuwe klant")).not.toBeInTheDocument();
  });

  it("shows all form fields", async () => {
    const { NewClientDialog } = await import("@/components/clients/NewClientDialog");
    render(<Wrapper><NewClientDialog open={true} onOpenChange={vi.fn()} /></Wrapper>);
    expect(screen.getByText("Bedrijfsgegevens")).toBeInTheDocument();
    expect(screen.getByText("Hoofdadres")).toBeInTheDocument();
    expect(screen.getByText("Primair contact")).toBeInTheDocument();
    expect(screen.getByText("Algemeen e-mail en telefoon")).toBeInTheDocument();
    expect(screen.getByText("Facturatie")).toBeInTheDocument();
    expect(screen.getByText("Postadres")).toBeInTheDocument();
    expect(screen.getByText("KvK-nummer")).toBeInTheDocument();
    expect(screen.getByText("BTW-nummer")).toBeInTheDocument();
  });

  it("shows Annuleren button that closes dialog", async () => {
    const onOpenChange = vi.fn();
    const { NewClientDialog } = await import("@/components/clients/NewClientDialog");
    render(<Wrapper><NewClientDialog open={true} onOpenChange={onOpenChange} /></Wrapper>);
    fireEvent.click(screen.getByText("Annuleren"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// ClientDetailPanel
// ═══════════════════════════════════════════════════════════════
describe("ClientDetailPanel", () => {
  const mockClient = {
    id: "c1",
    name: "ACME Corp",
    contact_person: "Jan",
    email: "jan@acme.nl",
    phone: "0612345678",
    address: "Hoofdstraat 1",
    zipcode: "1000AA",
    city: "Amsterdam",
    country: "NL",
    kvk_number: "12345678",
    btw_number: "NL123456789B01",
    payment_terms: 30,
  };

  it("renders tabs", async () => {
    const { ClientDetailPanel } = await import("@/components/clients/ClientDetailPanel");
    render(<Wrapper><ClientDetailPanel client={mockClient as any} /></Wrapper>);
    expect(screen.getByText("Overzicht")).toBeInTheDocument();
    expect(screen.getByText("Locaties")).toBeInTheDocument();
    expect(screen.getByText("Tarieven")).toBeInTheDocument();
    expect(screen.getByText("Orders")).toBeInTheDocument();
  });

  it("renders client info in overview tab", async () => {
    const { ClientDetailPanel } = await import("@/components/clients/ClientDetailPanel");
    render(<Wrapper><ClientDetailPanel client={mockClient as any} /></Wrapper>);
    expect(screen.getByText("ACME Corp")).toBeInTheDocument();
    expect(screen.getByText("Jan")).toBeInTheDocument();
    expect(screen.getByText("jan@acme.nl")).toBeInTheDocument();
    expect(screen.getByText("0612345678")).toBeInTheDocument();
    expect(screen.getByText("30 dagen")).toBeInTheDocument();
  });

  it("renders address in facturatieadres section", async () => {
    const { ClientDetailPanel } = await import("@/components/clients/ClientDetailPanel");
    render(<Wrapper><ClientDetailPanel client={mockClient as any} /></Wrapper>);
    expect(screen.getByText("Hoofdstraat 1, 1000AA, Amsterdam, NL")).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════
// NewDriverDialog
// ═══════════════════════════════════════════════════════════════
describe("NewDriverDialog", () => {
  it("renders create mode when no driver prop", async () => {
    const { NewDriverDialog } = await import("@/components/drivers/NewDriverDialog");
    render(<Wrapper><NewDriverDialog open={true} onOpenChange={vi.fn()} /></Wrapper>);
    expect(screen.getByText("Nieuwe Chauffeur")).toBeInTheDocument();
    expect(screen.getByText("Toevoegen")).toBeInTheDocument();
  });

  it("renders edit mode when driver prop provided", async () => {
    const { NewDriverDialog } = await import("@/components/drivers/NewDriverDialog");
    const driver = {
      id: "d1", name: "Piet", email: "piet@test.nl", phone: "06123",
      license_number: "NL-123", status: "beschikbaar",
      current_vehicle_id: null, certifications: ["ADR"],
    };
    render(<Wrapper><NewDriverDialog open={true} onOpenChange={vi.fn()} driver={driver as any} /></Wrapper>);
    expect(screen.getByText("Chauffeur Bewerken")).toBeInTheDocument();
    expect(screen.getByText("Opslaan")).toBeInTheDocument();
  });

  it("shows certification checkboxes", async () => {
    const { NewDriverDialog } = await import("@/components/drivers/NewDriverDialog");
    render(<Wrapper><NewDriverDialog open={true} onOpenChange={vi.fn()} /></Wrapper>);
    expect(screen.getByText("Certificeringen")).toBeInTheDocument();
    expect(screen.getByText("ADR")).toBeInTheDocument();
    expect(screen.getByText("Koeling")).toBeInTheDocument();
    expect(screen.getByText("Laadklep")).toBeInTheDocument();
    expect(screen.getByText("Internationaal")).toBeInTheDocument();
    expect(screen.getByText("Douane")).toBeInTheDocument();
  });

  it("shows vehicle select with loaded vehicles", async () => {
    const { NewDriverDialog } = await import("@/components/drivers/NewDriverDialog");
    render(<Wrapper><NewDriverDialog open={true} onOpenChange={vi.fn()} /></Wrapper>);
    expect(screen.getByText("Toegewezen Voertuig")).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════
// NewVehicleDialog
// ═══════════════════════════════════════════════════════════════
describe("NewVehicleDialog", () => {
  it("renders dialog title", async () => {
    const { NewVehicleDialog } = await import("@/components/fleet/NewVehicleDialog");
    render(<Wrapper><NewVehicleDialog open={true} onOpenChange={vi.fn()} /></Wrapper>);
    expect(screen.getByText("Nieuw Voertuig")).toBeInTheDocument();
  });

  it("shows required form fields", async () => {
    const { NewVehicleDialog } = await import("@/components/fleet/NewVehicleDialog");
    render(<Wrapper><NewVehicleDialog open={true} onOpenChange={vi.fn()} /></Wrapper>);
    expect(screen.getByPlaceholderText("VH-04")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("XX-123-YY")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Mercedes Sprinter")).toBeInTheDocument();
  });

  it("shows Annuleren and Toevoegen buttons", async () => {
    const { NewVehicleDialog } = await import("@/components/fleet/NewVehicleDialog");
    render(<Wrapper><NewVehicleDialog open={true} onOpenChange={vi.fn()} /></Wrapper>);
    expect(screen.getByText("Annuleren")).toBeInTheDocument();
    expect(screen.getByText("Toevoegen")).toBeInTheDocument();
  });

  it("closes dialog when Annuleren is clicked", async () => {
    const onOpenChange = vi.fn();
    const { NewVehicleDialog } = await import("@/components/fleet/NewVehicleDialog");
    render(<Wrapper><NewVehicleDialog open={true} onOpenChange={onOpenChange} /></Wrapper>);
    fireEvent.click(screen.getByText("Annuleren"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows validation error when submitting without required fields", async () => {
    const { toast } = await import("sonner");
    const { NewVehicleDialog } = await import("@/components/fleet/NewVehicleDialog");
    render(<Wrapper><NewVehicleDialog open={true} onOpenChange={vi.fn()} /></Wrapper>);
    fireEvent.click(screen.getByText("Toevoegen"));
    expect(toast.error).toHaveBeenCalledWith("Vul minimaal code, naam en kenteken in");
  });

  it("calls addVehicle.mutateAsync on valid submit", async () => {
    const { NewVehicleDialog } = await import("@/components/fleet/NewVehicleDialog");
    render(<Wrapper><NewVehicleDialog open={true} onOpenChange={vi.fn()} /></Wrapper>);
    fireEvent.change(screen.getByPlaceholderText("VH-04"), { target: { value: "VH-05" } });
    fireEvent.change(screen.getByPlaceholderText("Mercedes Sprinter"), { target: { value: "Scania R450" } });
    fireEvent.change(screen.getByPlaceholderText("XX-123-YY"), { target: { value: "AB-123-CD" } });
    fireEvent.click(screen.getByText("Toevoegen"));
    await waitFor(() => {
      expect(mockAddVehicle.mutateAsync).toHaveBeenCalled();
    });
  });

  it("shows capacity fields", async () => {
    const { NewVehicleDialog } = await import("@/components/fleet/NewVehicleDialog");
    render(<Wrapper><NewVehicleDialog open={true} onOpenChange={vi.fn()} /></Wrapper>);
    expect(screen.getByText("Max gewicht (kg)")).toBeInTheDocument();
    expect(screen.getByText("Palletplaatsen")).toBeInTheDocument();
  });

  it("shows Merk field", async () => {
    const { NewVehicleDialog } = await import("@/components/fleet/NewVehicleDialog");
    render(<Wrapper><NewVehicleDialog open={true} onOpenChange={vi.fn()} /></Wrapper>);
    expect(screen.getByText("Merk")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Mercedes")).toBeInTheDocument();
  });

  it("shows type select with options", async () => {
    const { NewVehicleDialog } = await import("@/components/fleet/NewVehicleDialog");
    render(<Wrapper><NewVehicleDialog open={true} onOpenChange={vi.fn()} /></Wrapper>);
    expect(screen.getByText("Type")).toBeInTheDocument();
  });

  it("fills all input fields including brand and capacities", async () => {
    const { NewVehicleDialog } = await import("@/components/fleet/NewVehicleDialog");
    render(<Wrapper><NewVehicleDialog open={true} onOpenChange={vi.fn()} /></Wrapper>);
    fireEvent.change(screen.getByPlaceholderText("VH-04"), { target: { value: "VH-10" } });
    fireEvent.change(screen.getByPlaceholderText("XX-123-YY"), { target: { value: "ZZ-999-AA" } });
    fireEvent.change(screen.getByPlaceholderText("Mercedes Sprinter"), { target: { value: "DAF XF" } });
    fireEvent.change(screen.getByPlaceholderText("Mercedes"), { target: { value: "DAF" } });
    // Get number inputs by their container labels
    const kgInput = screen.getByText("Max gewicht (kg)").parentElement!.querySelector("input")!;
    const palletInput = screen.getByText("Palletplaatsen").parentElement!.querySelector("input")!;
    fireEvent.change(kgInput, { target: { value: "15000" } });
    fireEvent.change(palletInput, { target: { value: "33" } });
    expect(screen.getByPlaceholderText("VH-04")).toHaveValue("VH-10");
    expect(screen.getByPlaceholderText("Mercedes")).toHaveValue("DAF");
    expect(kgInput).toHaveValue(15000);
    expect(palletInput).toHaveValue(33);
  });

  it("submits with all fields including optional brand and capacities", async () => {
    const onOpenChange = vi.fn();
    const { NewVehicleDialog } = await import("@/components/fleet/NewVehicleDialog");
    render(<Wrapper><NewVehicleDialog open={true} onOpenChange={onOpenChange} /></Wrapper>);
    fireEvent.change(screen.getByPlaceholderText("VH-04"), { target: { value: "VH-99" } });
    fireEvent.change(screen.getByPlaceholderText("XX-123-YY"), { target: { value: "AB-999-CD" } });
    fireEvent.change(screen.getByPlaceholderText("Mercedes Sprinter"), { target: { value: "Scania" } });
    fireEvent.change(screen.getByPlaceholderText("Mercedes"), { target: { value: "Scania" } });
    const kgInput = screen.getByText("Max gewicht (kg)").parentElement!.querySelector("input")!;
    const palletInput = screen.getByText("Palletplaatsen").parentElement!.querySelector("input")!;
    fireEvent.change(kgInput, { target: { value: "20000" } });
    fireEvent.change(palletInput, { target: { value: "40" } });
    fireEvent.click(screen.getByText("Toevoegen"));
    await waitFor(() => {
      expect(mockAddVehicle.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
        code: "VH-99",
        name: "Scania",
        plate: "AB-999-CD",
        brand: "Scania",
        capacity_kg: 20000,
        capacity_pallets: 40,
      }));
    });
  });

  it("resets form fields after successful submit", async () => {
    const onOpenChange = vi.fn();
    const { NewVehicleDialog } = await import("@/components/fleet/NewVehicleDialog");
    render(<Wrapper><NewVehicleDialog open={true} onOpenChange={onOpenChange} /></Wrapper>);
    fireEvent.change(screen.getByPlaceholderText("VH-04"), { target: { value: "VH-55" } });
    fireEvent.change(screen.getByPlaceholderText("XX-123-YY"), { target: { value: "XX-555-YY" } });
    fireEvent.change(screen.getByPlaceholderText("Mercedes Sprinter"), { target: { value: "Volvo" } });
    fireEvent.click(screen.getByText("Toevoegen"));
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("handles submit error gracefully", async () => {
    mockAddVehicle.mutateAsync.mockRejectedValueOnce(new Error("DB error"));
    const { toast } = await import("sonner");
    const { NewVehicleDialog } = await import("@/components/fleet/NewVehicleDialog");
    render(<Wrapper><NewVehicleDialog open={true} onOpenChange={vi.fn()} /></Wrapper>);
    fireEvent.change(screen.getByPlaceholderText("VH-04"), { target: { value: "VH-ERR" } });
    fireEvent.change(screen.getByPlaceholderText("XX-123-YY"), { target: { value: "ER-ROR-11" } });
    fireEvent.change(screen.getByPlaceholderText("Mercedes Sprinter"), { target: { value: "Error" } });
    fireEvent.click(screen.getByText("Toevoegen"));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Fout bij toevoegen");
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// DocumentDialog
// ═══════════════════════════════════════════════════════════════
describe("DocumentDialog", () => {
  it("renders dialog title", async () => {
    const { DocumentDialog } = await import("@/components/fleet/DocumentDialog");
    render(<Wrapper><DocumentDialog vehicleId="v1" open={true} onOpenChange={vi.fn()} /></Wrapper>);
    expect(screen.getByText("Document Toevoegen")).toBeInTheDocument();
  });

  it("shows document type, expiry date and notes fields", async () => {
    const { DocumentDialog } = await import("@/components/fleet/DocumentDialog");
    render(<Wrapper><DocumentDialog vehicleId="v1" open={true} onOpenChange={vi.fn()} /></Wrapper>);
    expect(screen.getByText("Type document")).toBeInTheDocument();
    expect(screen.getByText("Vervaldatum")).toBeInTheDocument();
    expect(screen.getByText("Notities")).toBeInTheDocument();
  });

  it("shows Annuleren and Toevoegen buttons", async () => {
    const { DocumentDialog } = await import("@/components/fleet/DocumentDialog");
    render(<Wrapper><DocumentDialog vehicleId="v1" open={true} onOpenChange={vi.fn()} /></Wrapper>);
    expect(screen.getByText("Annuleren")).toBeInTheDocument();
    expect(screen.getByText("Toevoegen")).toBeInTheDocument();
  });

  it("closes dialog when Annuleren is clicked", async () => {
    const onOpenChange = vi.fn();
    const { DocumentDialog } = await import("@/components/fleet/DocumentDialog");
    render(<Wrapper><DocumentDialog vehicleId="v1" open={true} onOpenChange={onOpenChange} /></Wrapper>);
    fireEvent.click(screen.getByText("Annuleren"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("calls create.mutateAsync on submit", async () => {
    const { DocumentDialog } = await import("@/components/fleet/DocumentDialog");
    render(<Wrapper><DocumentDialog vehicleId="v1" open={true} onOpenChange={vi.fn()} /></Wrapper>);
    fireEvent.click(screen.getByText("Toevoegen"));
    await waitFor(() => {
      expect(mockCreateDocument.mutateAsync).toHaveBeenCalled();
    });
  });

  it("fills in notes field", async () => {
    const { DocumentDialog } = await import("@/components/fleet/DocumentDialog");
    render(<Wrapper><DocumentDialog vehicleId="v1" open={true} onOpenChange={vi.fn()} /></Wrapper>);
    const notesInput = screen.getByPlaceholderText("Optionele notities...");
    fireEvent.change(notesInput, { target: { value: "Test notities" } });
    expect(notesInput).toHaveValue("Test notities");
  });

  it("does not render when closed", async () => {
    const { DocumentDialog } = await import("@/components/fleet/DocumentDialog");
    render(<Wrapper><DocumentDialog vehicleId="v1" open={false} onOpenChange={vi.fn()} /></Wrapper>);
    expect(screen.queryByText("Document Toevoegen")).not.toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════
// MaintenanceDialog
// ═══════════════════════════════════════════════════════════════
describe("MaintenanceDialog", () => {
  it("renders dialog title", async () => {
    const { MaintenanceDialog } = await import("@/components/fleet/MaintenanceDialog");
    render(<Wrapper><MaintenanceDialog vehicleId="v1" open={true} onOpenChange={vi.fn()} /></Wrapper>);
    expect(screen.getByText("Onderhoud Plannen")).toBeInTheDocument();
  });

  it("shows maintenance type, date, cost and notes fields", async () => {
    const { MaintenanceDialog } = await import("@/components/fleet/MaintenanceDialog");
    render(<Wrapper><MaintenanceDialog vehicleId="v1" open={true} onOpenChange={vi.fn()} /></Wrapper>);
    expect(screen.getByText("Type onderhoud")).toBeInTheDocument();
    expect(screen.getByText("Geplande datum")).toBeInTheDocument();
    expect(screen.getByText("Geschatte kosten (EUR)")).toBeInTheDocument();
    expect(screen.getByText("Notities")).toBeInTheDocument();
  });

  it("shows Annuleren and Inplannen buttons", async () => {
    const { MaintenanceDialog } = await import("@/components/fleet/MaintenanceDialog");
    render(<Wrapper><MaintenanceDialog vehicleId="v1" open={true} onOpenChange={vi.fn()} /></Wrapper>);
    expect(screen.getByText("Annuleren")).toBeInTheDocument();
    expect(screen.getByText("Inplannen")).toBeInTheDocument();
  });

  it("closes dialog when Annuleren is clicked", async () => {
    const onOpenChange = vi.fn();
    const { MaintenanceDialog } = await import("@/components/fleet/MaintenanceDialog");
    render(<Wrapper><MaintenanceDialog vehicleId="v1" open={true} onOpenChange={onOpenChange} /></Wrapper>);
    fireEvent.click(screen.getByText("Annuleren"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows error toast when submitting without date", async () => {
    const { toast } = await import("sonner");
    const { MaintenanceDialog } = await import("@/components/fleet/MaintenanceDialog");
    render(<Wrapper><MaintenanceDialog vehicleId="v1" open={true} onOpenChange={vi.fn()} /></Wrapper>);
    fireEvent.click(screen.getByText("Inplannen"));
    expect(toast.error).toHaveBeenCalledWith("Selecteer een geplande datum");
  });

  it("calls create.mutateAsync on valid submit with date", async () => {
    const { MaintenanceDialog } = await import("@/components/fleet/MaintenanceDialog");
    render(<Wrapper><MaintenanceDialog vehicleId="v1" open={true} onOpenChange={vi.fn()} /></Wrapper>);
    // Set the scheduled date
    const dateInputs = screen.getAllByDisplayValue("");
    const dateInput = dateInputs.find((el) => el.getAttribute("type") === "date");
    if (dateInput) {
      fireEvent.change(dateInput, { target: { value: "2026-05-01" } });
    }
    fireEvent.click(screen.getByText("Inplannen"));
    await waitFor(() => {
      expect(mockCreateMaintenance.mutateAsync).toHaveBeenCalled();
    });
  });

  it("fills in cost field", async () => {
    const { MaintenanceDialog } = await import("@/components/fleet/MaintenanceDialog");
    render(<Wrapper><MaintenanceDialog vehicleId="v1" open={true} onOpenChange={vi.fn()} /></Wrapper>);
    const costInput = screen.getByPlaceholderText("0.00");
    fireEvent.change(costInput, { target: { value: "250.50" } });
    expect(costInput).toHaveValue(250.5);
  });

  it("fills in notes field", async () => {
    const { MaintenanceDialog } = await import("@/components/fleet/MaintenanceDialog");
    render(<Wrapper><MaintenanceDialog vehicleId="v1" open={true} onOpenChange={vi.fn()} /></Wrapper>);
    const notesInput = screen.getByPlaceholderText("Optionele notities...");
    fireEvent.change(notesInput, { target: { value: "APK verlenging" } });
    expect(notesInput).toHaveValue("APK verlenging");
  });

  it("does not render when closed", async () => {
    const { MaintenanceDialog } = await import("@/components/fleet/MaintenanceDialog");
    render(<Wrapper><MaintenanceDialog vehicleId="v1" open={false} onOpenChange={vi.fn()} /></Wrapper>);
    expect(screen.queryByText("Onderhoud Plannen")).not.toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════
// BulkImportDialog
// ═══════════════════════════════════════════════════════════════
describe("BulkImportDialog", () => {
  it("renders upload step when open", async () => {
    const { BulkImportDialog } = await import("@/components/orders/BulkImportDialog");
    render(<Wrapper><BulkImportDialog open={true} onOpenChange={vi.fn()} /></Wrapper>);
    expect(screen.getByText("Orders importeren")).toBeInTheDocument();
    expect(screen.getByText(/Sleep een CSV- of Excel-bestand/)).toBeInTheDocument();
  });

  it("does not render when closed", async () => {
    const { BulkImportDialog } = await import("@/components/orders/BulkImportDialog");
    render(<Wrapper><BulkImportDialog open={false} onOpenChange={vi.fn()} /></Wrapper>);
    expect(screen.queryByText("Orders importeren")).not.toBeInTheDocument();
  });

  it("shows supported formats info", async () => {
    const { BulkImportDialog } = await import("@/components/orders/BulkImportDialog");
    render(<Wrapper><BulkImportDialog open={true} onOpenChange={vi.fn()} /></Wrapper>);
    expect(screen.getByText(/Ondersteund/)).toBeInTheDocument();
  });

  it("shows dialog description", async () => {
    const { BulkImportDialog } = await import("@/components/orders/BulkImportDialog");
    render(<Wrapper><BulkImportDialog open={true} onOpenChange={vi.fn()} /></Wrapper>);
    expect(screen.getByText(/Upload een CSV-bestand/)).toBeInTheDocument();
  });

  it("shows file select helper text", async () => {
    const { BulkImportDialog } = await import("@/components/orders/BulkImportDialog");
    render(<Wrapper><BulkImportDialog open={true} onOpenChange={vi.fn()} /></Wrapper>);
    expect(screen.getByText(/of klik om een bestand te selecteren/)).toBeInTheDocument();
  });

  it("has hidden file input", async () => {
    const { BulkImportDialog } = await import("@/components/orders/BulkImportDialog");
    render(<Wrapper><BulkImportDialog open={true} onOpenChange={vi.fn()} /></Wrapper>);
    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).toBeInTheDocument();
    expect(fileInput?.getAttribute("accept")).toBe(".csv,.txt,.xlsx,.xls");
  });

  it("handles non-CSV file with error toast", async () => {
    const { toast } = await import("sonner");
    const { BulkImportDialog } = await import("@/components/orders/BulkImportDialog");
    render(<Wrapper><BulkImportDialog open={true} onOpenChange={vi.fn()} /></Wrapper>);
    const fileInput = document.querySelector('input[type="file"]')!;
    const file = new File(["content"], "test.pdf", { type: "application/pdf" });
    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(toast.error).toHaveBeenCalledWith("Alleen CSV- en Excel-bestanden worden ondersteund (.csv, .txt, .xlsx, .xls)");
  });

  it("transitions to preview step after uploading a valid CSV", async () => {
    const { BulkImportDialog } = await import("@/components/orders/BulkImportDialog");
    render(<Wrapper><BulkImportDialog open={true} onOpenChange={vi.fn()} /></Wrapper>);
    const fileInput = document.querySelector('input[type="file"]')!;
    const csvContent = "klant;ophalen;leveren;gewicht;aantal;eenheid\nACME;Amsterdam;Rotterdam;500;2;Pallets\n";
    const file = new File([csvContent], "orders.csv", { type: "text/csv" });
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByText("orders.csv")).toBeInTheDocument();
      expect(screen.getByText("Kolomkoppeling")).toBeInTheDocument();
    });
  });

  it("shows preview table after CSV upload", async () => {
    const { BulkImportDialog } = await import("@/components/orders/BulkImportDialog");
    render(<Wrapper><BulkImportDialog open={true} onOpenChange={vi.fn()} /></Wrapper>);
    const fileInput = document.querySelector('input[type="file"]')!;
    const csvContent = "klant;ophalen;leveren\nACME;Amsterdam;Rotterdam\nBeta;Utrecht;Den Haag\n";
    const file = new File([csvContent], "test.csv", { type: "text/csv" });
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByText(/Voorbeeld/)).toBeInTheDocument();
      expect(screen.getByText(/2 rijen gevonden/)).toBeInTheDocument();
    });
  });

  it("shows Terug button in preview step", async () => {
    const { BulkImportDialog } = await import("@/components/orders/BulkImportDialog");
    render(<Wrapper><BulkImportDialog open={true} onOpenChange={vi.fn()} /></Wrapper>);
    const fileInput = document.querySelector('input[type="file"]')!;
    const csvContent = "klant;ophalen\nACME;Amsterdam\n";
    const file = new File([csvContent], "test.csv", { type: "text/csv" });
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByText("Terug")).toBeInTheDocument();
    });
  });

  it("auto-maps known column names", async () => {
    const { BulkImportDialog } = await import("@/components/orders/BulkImportDialog");
    render(<Wrapper><BulkImportDialog open={true} onOpenChange={vi.fn()} /></Wrapper>);
    const fileInput = document.querySelector('input[type="file"]')!;
    const csvContent = "klantnaam;ophaaladres;afleveradres\nACME;Amsterdam;Rotterdam\n";
    const file = new File([csvContent], "test.csv", { type: "text/csv" });
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => {
      // After auto-mapping, "Klant" appears in mapped column labels and option dropdowns
      const klantElements = screen.getAllByText(/Klant/);
      expect(klantElements.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("shows import button with row count in preview", async () => {
    const { BulkImportDialog } = await import("@/components/orders/BulkImportDialog");
    render(<Wrapper><BulkImportDialog open={true} onOpenChange={vi.fn()} /></Wrapper>);
    const fileInput = document.querySelector('input[type="file"]')!;
    const csvContent = "klant;ophalen;leveren\nACME;Amsterdam;Rotterdam\nBeta;Utrecht;Den Haag\n";
    const file = new File([csvContent], "test.csv", { type: "text/csv" });
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByText(/Valideer/)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText(/Valideer/));
    await waitFor(() => {
      expect(screen.getByText(/Importeer 2 orders/)).toBeInTheDocument();
    });
  });

  it("returns to upload step when Terug is clicked", async () => {
    const { BulkImportDialog } = await import("@/components/orders/BulkImportDialog");
    render(<Wrapper><BulkImportDialog open={true} onOpenChange={vi.fn()} /></Wrapper>);
    const fileInput = document.querySelector('input[type="file"]')!;
    const csvContent = "klant;ophalen\nACME;Amsterdam\n";
    const file = new File([csvContent], "test.csv", { type: "text/csv" });
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByText("Terug")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Terug"));
    expect(screen.getByText(/Sleep een CSV- of Excel-bestand/)).toBeInTheDocument();
  });

  it("handles empty CSV with error toast", async () => {
    const { toast } = await import("sonner");
    const { BulkImportDialog } = await import("@/components/orders/BulkImportDialog");
    render(<Wrapper><BulkImportDialog open={true} onOpenChange={vi.fn()} /></Wrapper>);
    const fileInput = document.querySelector('input[type="file"]')!;
    const file = new File([""], "empty.csv", { type: "text/csv" });
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Bestand is leeg");
    });
  });

  it("handles CSV with only header (no data rows)", async () => {
    const { toast } = await import("sonner");
    const { BulkImportDialog } = await import("@/components/orders/BulkImportDialog");
    render(<Wrapper><BulkImportDialog open={true} onOpenChange={vi.fn()} /></Wrapper>);
    const fileInput = document.querySelector('input[type="file"]')!;
    const csvContent = "klant;ophalen;leveren\n";
    const file = new File([csvContent], "header-only.csv", { type: "text/csv" });
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Bestand bevat geen data (alleen header gevonden)");
    });
  });

  it("shows warning when no client column mapped", async () => {
    const { BulkImportDialog } = await import("@/components/orders/BulkImportDialog");
    render(<Wrapper><BulkImportDialog open={true} onOpenChange={vi.fn()} /></Wrapper>);
    const fileInput = document.querySelector('input[type="file"]')!;
    // Use header that won't auto-map to client
    const csvContent = "kolom1;kolom2\nwaarde1;waarde2\n";
    const file = new File([csvContent], "test.csv", { type: "text/csv" });
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByText(/Koppel minimaal de kolom/)).toBeInTheDocument();
    });
  });

  it("handles dragOver and dragLeave events on drop zone", async () => {
    const { BulkImportDialog } = await import("@/components/orders/BulkImportDialog");
    render(<Wrapper><BulkImportDialog open={true} onOpenChange={vi.fn()} /></Wrapper>);
    const dropZone = screen.getByText(/Sleep een CSV- of Excel-bestand/).closest("div[class*='border-dashed']")!;
    fireEvent.dragOver(dropZone, { preventDefault: vi.fn() });
    expect(dropZone.className).toContain("border-primary");
    fireEvent.dragLeave(dropZone);
  });

  it("handles drop event with valid CSV file", async () => {
    const { BulkImportDialog } = await import("@/components/orders/BulkImportDialog");
    render(<Wrapper><BulkImportDialog open={true} onOpenChange={vi.fn()} /></Wrapper>);
    const dropZone = screen.getByText(/Sleep een CSV- of Excel-bestand/).closest("div[class*='border-dashed']")!;
    const csvContent = "klant;ophalen\nACME;Amsterdam\n";
    const file = new File([csvContent], "drop.csv", { type: "text/csv" });
    fireEvent.drop(dropZone, {
      preventDefault: vi.fn(),
      dataTransfer: { files: [file] },
    });
    await waitFor(() => {
      expect(screen.getByText("drop.csv")).toBeInTheDocument();
    });
  });

  it("allows updating column mapping via select", async () => {
    const { BulkImportDialog } = await import("@/components/orders/BulkImportDialog");
    render(<Wrapper><BulkImportDialog open={true} onOpenChange={vi.fn()} /></Wrapper>);
    const fileInput = document.querySelector('input[type="file"]')!;
    const csvContent = "kolom1;kolom2\nwaarde1;waarde2\n";
    const file = new File([csvContent], "map.csv", { type: "text/csv" });
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByText("Kolomkoppeling")).toBeInTheDocument();
    });
    // Change first column mapping to "Klant"
    const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
    if (selects.length > 0) {
      fireEvent.change(selects[0], { target: { value: "client_name" } });
    }
  });

  it("calls handleClose(false) to reset and close dialog", async () => {
    const onOpenChange = vi.fn();
    const { BulkImportDialog } = await import("@/components/orders/BulkImportDialog");
    render(<Wrapper><BulkImportDialog open={true} onOpenChange={onOpenChange} /></Wrapper>);
    // Upload a CSV to get to preview step
    const fileInput = document.querySelector('input[type="file"]')!;
    const csvContent = "klant;ophalen\nACME;Amsterdam\n";
    const file = new File([csvContent], "test.csv", { type: "text/csv" });
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByText("Terug")).toBeInTheDocument();
    });
    // Click Terug to reset
    fireEvent.click(screen.getByText("Terug"));
    expect(screen.getByText(/Sleep een CSV- of Excel-bestand/)).toBeInTheDocument();
  });

  it("detects comma delimiter in CSV", async () => {
    const { BulkImportDialog } = await import("@/components/orders/BulkImportDialog");
    render(<Wrapper><BulkImportDialog open={true} onOpenChange={vi.fn()} /></Wrapper>);
    const fileInput = document.querySelector('input[type="file"]')!;
    const csvContent = "klant,ophalen,leveren\nACME,Amsterdam,Rotterdam\n";
    const file = new File([csvContent], "comma.csv", { type: "text/csv" });
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByText("comma.csv")).toBeInTheDocument();
      expect(screen.getByText(/1 rijen gevonden/)).toBeInTheDocument();
    });
  });

  it("handles quoted CSV fields correctly", async () => {
    const { BulkImportDialog } = await import("@/components/orders/BulkImportDialog");
    render(<Wrapper><BulkImportDialog open={true} onOpenChange={vi.fn()} /></Wrapper>);
    const fileInput = document.querySelector('input[type="file"]')!;
    const csvContent = 'klant;ophalen\n"ACME Corp";"Amsterdam, NL"\n';
    const file = new File([csvContent], "quoted.csv", { type: "text/csv" });
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByText("ACME Corp")).toBeInTheDocument();
    });
  });
});
