import { describe, expect, it } from "vitest";
import { mapDraftStatusToPersisted, validateOrderDraft, type OrderDraft } from "@/lib/orderDraft";

function baseDraft(overrides: Partial<OrderDraft> = {}): OrderDraft {
  return {
    clientId: "client-1",
    clientName: "FreightNed",
    contactName: "Planner",
    stops: [
      {
        id: "pickup",
        type: "pickup",
        label: "Ophalen",
        sequence: 0,
        address: {
          display: "Bijlmermeerstraat 30, 2131 HC Hoofddorp",
          street: "Bijlmermeerstraat",
          zipcode: "2131 HC",
          city: "Hoofddorp",
          lat: 52.30,
          lng: 4.70,
          source: "google",
        },
        date: "2026-05-01",
        timeFrom: "06:00",
        timeTo: "09:00",
      },
      {
        id: "delivery",
        type: "delivery",
        label: "Eindbestemming",
        sequence: 1,
        address: {
          display: "Incheonweg 7, 1437 EK Rozenburg",
          street: "Incheonweg",
          zipcode: "1437 EK",
          city: "Rozenburg",
          lat: 52.28,
          lng: 4.75,
          source: "google",
        },
        date: "2026-05-01",
        timeFrom: "10:00",
        timeTo: "12:00",
      },
    ],
    cargoLines: [
      { id: "cargo-1", quantity: 2, unit: "Pallets", weightKg: 500, lengthCm: 120, widthCm: 80, heightCm: 140 },
    ],
    transport: {
      type: "LTL",
      department: "OPS",
      vehicleType: null,
      secure: true,
      manualOverrides: {},
    },
    pricing: { totalCents: null },
    ...overrides,
  };
}

describe("order draft readiness", () => {
  it("marks a minimally executable order ready even without vehicle or tariff", () => {
    const result = validateOrderDraft(baseDraft());

    expect(result.status).toBe("READY_FOR_PLANNING");
    expect(result.persistedStatus).toBe("PENDING");
    expect(result.blockers).toHaveLength(0);
    expect(result.warnings.some((warning) => warning.key === "tarief")).toBe(true);
  });

  it("blocks missing hard minimum fields", () => {
    const result = validateOrderDraft(baseDraft({
      clientId: null,
      clientName: "",
      stops: [],
      cargoLines: [],
    }));

    expect(result.status).toBe("DRAFT_INCOMPLETE");
    expect(result.persistedStatus).toBe("DRAFT");
    expect(result.blockers.map((issue) => issue.key)).toEqual(
      expect.arrayContaining(["klant", "ophaaladres", "afleveradres", "pickupdatum", "ladingregel"]),
    );
  });

  it("blocks impossible time ordering", () => {
    const draft = baseDraft();
    draft.stops[1] = { ...draft.stops[1], timeFrom: "08:00", timeTo: "09:00" };

    const result = validateOrderDraft(draft);

    expect(result.blockers.some((issue) => issue.key === "delivery_time_window")).toBe(true);
  });

  it("keeps blocking after cargo is reset back to zero", () => {
    const result = validateOrderDraft(baseDraft({
      cargoLines: [{ id: "cargo-1", quantity: 0, unit: "Pallets", weightKg: 0 }],
    }));

    expect(result.persistedStatus).toBe("DRAFT");
    expect(result.blockers.map((issue) => issue.key)).toEqual(
      expect.arrayContaining(["aantal", "gewicht"]),
    );
  });

  it("blocks route reuse when pickup and delivery resolve to the same address", () => {
    const draft = baseDraft();
    draft.stops[1] = {
      ...draft.stops[1],
      address: { ...draft.stops[0].address },
    };

    const result = validateOrderDraft(draft);

    expect(result.blockers.some((issue) => issue.key === "adrescontrole")).toBe(true);
  });

  it("requires EDD or X-RAY after switching road transport to unsecured air freight", () => {
    const result = validateOrderDraft(baseDraft({
      transport: {
        type: "Luchtvracht",
        department: "Export",
        vehicleType: null,
        secure: false,
        pmtMethod: null,
        manualOverrides: { transportType: true },
      },
    }));

    expect(result.blockers.some((issue) => issue.key === "screening")).toBe(true);
  });

  it("only blocks vehicle when a chosen vehicle does not fit", () => {
    const result = validateOrderDraft(baseDraft({
      cargoLines: [{ id: "cargo-1", quantity: 10, unit: "Pallets", weightKg: 2500 }],
      transport: {
        type: "LTL",
        department: "OPS",
        vehicleType: "Bestelbus",
        secure: true,
        manualOverrides: { vehicleType: true },
      },
    }));

    expect(result.blockers.some((issue) => issue.key === "voertuig")).toBe(true);
    expect(result.infos.some((issue) => issue.key === "vehicle-manual")).toBe(true);
  });

  it("maps UI statuses to existing persisted order statuses", () => {
    expect(mapDraftStatusToPersisted("DRAFT_INCOMPLETE")).toBe("DRAFT");
    expect(mapDraftStatusToPersisted("READY_FOR_PLANNING")).toBe("PENDING");
    expect(mapDraftStatusToPersisted("NEEDS_REVIEW")).toBe("NEEDS_REVIEW");
    expect(mapDraftStatusToPersisted("PLANNED")).toBe("PLANNED");
  });
});
