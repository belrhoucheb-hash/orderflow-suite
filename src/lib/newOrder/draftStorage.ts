import { EMPTY_ADDRESS, type AddressValue } from "@/components/clients/AddressAutocomplete";
import type { FinancialTabPayload } from "@/components/orders/FinancialTab";
import { sanitizeFreightLine } from "./helpers";
import type { CargoRow, FreightLine } from "./types";

export type WizardStepKey = "intake" | "route" | "cargo" | "financial" | "review";
export type ContactChoiceMode = "existing" | "manual";
export type TransportFlowChoice = "import" | "export" | "direct";

export interface LocalDraftSnapshot {
  clientName: string;
  clientId: string | null;
  contactpersoon: string;
  contactChoiceMode: ContactChoiceMode;
  selectedContactId: string | null;
  manualContactName: string;
  manualContactEmail: string;
  manualContactPhone: string;
  prioriteit: string;
  klantReferentie: string;
  transportFlowChoice: TransportFlowChoice | "";
  transportType: string;
  transportTypeManual: boolean;
  afdeling: string;
  afdelingManual: boolean;
  voertuigtype: string;
  voertuigtypeManual: boolean;
  referentie: string;
  cargoRows: CargoRow[];
  freightLines: FreightLine[];
  pickupAddr: AddressValue;
  deliveryAddr: AddressValue;
  transportEenheid: string;
  quantity: string;
  weightKg: string;
  klepNodig: boolean;
  shipmentSecure: boolean;
}

export interface WizardStateSnapshot {
  step: WizardStepKey;
  intakeActiveQuestion: 1 | 2 | 3 | 4;
  routeActiveQuestion: 1 | 2 | 3 | 4;
  cargoActiveQuestion: 1 | 2 | 3 | 4;
  reviewActiveQuestion: 1 | 2 | 3;
}

export interface OrderReadinessSummary {
  score: number;
  blockersCount: number;
  warningsCount: number;
  infosCount: number;
}

export interface ServerDraftPayload {
  lifecycle: { model: "draft-shipment-trip"; draftStatus: string };
  validationEngineVersion: string | number;
  pricingEngineVersion: string | number;
  orderDraft: unknown;
  form: LocalDraftSnapshot;
  wizard: WizardStateSnapshot;
  pricingPayload: FinancialTabPayload;
  observability: {
    step: WizardStepKey;
    score: number;
    blockers: number;
    warnings: number;
    infos: number;
  };
  savedAt: string;
}

export interface DraftFormSetters {
  setClientName: (v: string) => void;
  setClientQuestionConfirmed: (v: boolean) => void;
  setClientId: (v: string | null) => void;
  setContactpersoon: (v: string) => void;
  setContactChoiceMode: (v: ContactChoiceMode) => void;
  setSelectedContactId: (v: string | null) => void;
  setManualContactName: (v: string) => void;
  setManualContactEmail: (v: string) => void;
  setManualContactPhone: (v: string) => void;
  setPrioriteit: (v: string) => void;
  setKlantReferentie: (v: string) => void;
  setTransportFlowChoice: (v: TransportFlowChoice | "") => void;
  setTransportType: (v: string) => void;
  setTransportTypeManual: (v: boolean) => void;
  setAfdeling: (v: string) => void;
  setAfdelingManual: (v: boolean) => void;
  setVoertuigtype: (v: string) => void;
  setVoertuigtypeManual: (v: boolean) => void;
  setReferentie: (v: string) => void;
  setTransportEenheid: (v: string) => void;
  setQuantity: (v: string) => void;
  setWeightKg: (v: string) => void;
  setCargoRows: (v: CargoRow[]) => void;
  setFreightLines: (v: FreightLine[]) => void;
  setPickupAddr: (v: AddressValue) => void;
  setDeliveryAddr: (v: AddressValue) => void;
  setKlepNodig: (v: boolean) => void;
  setShipmentSecure: (v: boolean) => void;
}

export interface DraftWizardSetters {
  setPricingPayload: (v: FinancialTabPayload) => void;
  setWizardStep: (v: WizardStepKey) => void;
  setIntakeActiveQuestion: (v: 1 | 2 | 3 | 4) => void;
  setRouteActiveQuestion: (v: 1 | 2 | 3 | 4) => void;
  setCargoActiveQuestion: (v: 1 | 2 | 3 | 4) => void;
  setReviewActiveQuestion: (v: 1 | 2 | 3) => void;
}

export interface BuildLocalDraftInput {
  clientName: string;
  clientId: string | null;
  contactpersoon: string;
  contactChoiceMode: ContactChoiceMode;
  selectedContactId: string | null;
  manualContactName: string;
  manualContactEmail: string;
  manualContactPhone: string;
  prioriteit: string;
  klantReferentie: string;
  transportFlowChoice: TransportFlowChoice | "";
  transportType: string;
  transportTypeManual: boolean;
  afdeling: string;
  afdelingManual: boolean;
  voertuigtype: string;
  voertuigtypeManual: boolean;
  referentie: string;
  cargoRows: CargoRow[];
  freightLines: FreightLine[];
  pickupAddr: AddressValue;
  deliveryAddr: AddressValue;
  transportEenheid: string;
  quantity: string;
  weightKg: string;
  klepNodig: boolean;
  shipmentSecure: boolean;
}

export function buildLocalDraftSnapshot(input: BuildLocalDraftInput): LocalDraftSnapshot {
  return {
    clientName: input.clientName,
    clientId: input.clientId,
    contactpersoon: input.contactpersoon,
    contactChoiceMode: input.contactChoiceMode,
    selectedContactId: input.selectedContactId,
    manualContactName: input.manualContactName,
    manualContactEmail: input.manualContactEmail,
    manualContactPhone: input.manualContactPhone,
    prioriteit: input.prioriteit,
    klantReferentie: input.klantReferentie,
    transportFlowChoice: input.transportFlowChoice,
    transportType: input.transportType,
    transportTypeManual: input.transportTypeManual,
    afdeling: input.afdeling,
    afdelingManual: input.afdelingManual,
    voertuigtype: input.voertuigtype,
    voertuigtypeManual: input.voertuigtypeManual,
    referentie: input.referentie,
    cargoRows: input.cargoRows,
    freightLines: input.freightLines,
    pickupAddr: input.pickupAddr,
    deliveryAddr: input.deliveryAddr,
    transportEenheid: input.transportEenheid,
    quantity: input.quantity,
    weightKg: input.weightKg,
    klepNodig: input.klepNodig,
    shipmentSecure: input.shipmentSecure,
  };
}

export interface BuildServerDraftInput {
  readinessStatus: string;
  validationEngineVersion: string | number;
  pricingEngineVersion: string | number;
  orderDraft: unknown;
  form: LocalDraftSnapshot;
  wizard: WizardStateSnapshot;
  pricingPayload: FinancialTabPayload;
  readiness: OrderReadinessSummary;
}

export function buildServerDraftPayload(input: BuildServerDraftInput): ServerDraftPayload {
  return {
    lifecycle: { model: "draft-shipment-trip", draftStatus: input.readinessStatus },
    validationEngineVersion: input.validationEngineVersion,
    pricingEngineVersion: input.pricingEngineVersion,
    orderDraft: input.orderDraft,
    form: input.form,
    wizard: input.wizard,
    pricingPayload: input.pricingPayload,
    observability: {
      step: input.wizard.step,
      score: input.readiness.score,
      blockers: input.readiness.blockersCount,
      warnings: input.readiness.warningsCount,
      infos: input.readiness.infosCount,
    },
    savedAt: new Date().toISOString(),
  };
}

export interface ParsedLocalDraft {
  snapshot: Partial<LocalDraftSnapshot>;
  savedAt: string | null;
}

export function parseLocalDraft(raw: string | null): ParsedLocalDraft | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<LocalDraftSnapshot> & { savedAt?: string };
    return { snapshot: parsed, savedAt: parsed.savedAt ?? null };
  } catch {
    return null;
  }
}

export interface ParsedServerDraft {
  form: Partial<LocalDraftSnapshot>;
  wizard: Partial<WizardStateSnapshot>;
  pricingPayload: FinancialTabPayload | null;
}

export function parseServerDraftPayload(payloadJson: unknown): ParsedServerDraft {
  const payload = (payloadJson ?? {}) as {
    form?: Partial<LocalDraftSnapshot>;
    wizard?: Partial<WizardStateSnapshot>;
    pricingPayload?: FinancialTabPayload;
  };
  return {
    form: payload.form ?? {},
    wizard: payload.wizard ?? {},
    pricingPayload: payload.pricingPayload ?? null,
  };
}

export function applyDraftFormSnapshot(
  parsed: Partial<LocalDraftSnapshot>,
  setters: DraftFormSetters,
): void {
  if (parsed.clientName) {
    setters.setClientName(parsed.clientName);
    if (parsed.clientName.trim().length >= 2) setters.setClientQuestionConfirmed(true);
  }
  if (parsed.clientId) setters.setClientId(parsed.clientId);
  if (parsed.contactpersoon) setters.setContactpersoon(parsed.contactpersoon);
  if (parsed.contactChoiceMode) setters.setContactChoiceMode(parsed.contactChoiceMode);
  if (parsed.selectedContactId) setters.setSelectedContactId(parsed.selectedContactId);
  if (parsed.manualContactName) setters.setManualContactName(parsed.manualContactName);
  if (parsed.manualContactEmail) setters.setManualContactEmail(parsed.manualContactEmail);
  if (parsed.manualContactPhone) setters.setManualContactPhone(parsed.manualContactPhone);
  if (parsed.prioriteit) setters.setPrioriteit(parsed.prioriteit);
  if (parsed.klantReferentie) setters.setKlantReferentie(parsed.klantReferentie);
  if (parsed.transportFlowChoice) setters.setTransportFlowChoice(parsed.transportFlowChoice);
  if (parsed.transportType) setters.setTransportType(parsed.transportType);
  if (typeof parsed.transportTypeManual === "boolean") setters.setTransportTypeManual(parsed.transportTypeManual);
  if (parsed.afdeling) setters.setAfdeling(parsed.afdeling);
  if (typeof parsed.afdelingManual === "boolean") setters.setAfdelingManual(parsed.afdelingManual);
  if (parsed.voertuigtype) setters.setVoertuigtype(parsed.voertuigtype);
  if (typeof parsed.voertuigtypeManual === "boolean") setters.setVoertuigtypeManual(parsed.voertuigtypeManual);
  if (parsed.referentie) setters.setReferentie(parsed.referentie);
  if (parsed.transportEenheid) setters.setTransportEenheid(parsed.transportEenheid);
  if (parsed.quantity) setters.setQuantity(parsed.quantity);
  if (parsed.weightKg) setters.setWeightKg(parsed.weightKg);
  if (Array.isArray(parsed.cargoRows) && parsed.cargoRows.length > 0) setters.setCargoRows(parsed.cargoRows);
  if (Array.isArray(parsed.freightLines) && parsed.freightLines.length > 0) {
    setters.setFreightLines(parsed.freightLines.map(sanitizeFreightLine));
  }
  if (parsed.pickupAddr) setters.setPickupAddr({ ...EMPTY_ADDRESS, ...parsed.pickupAddr });
  if (parsed.deliveryAddr) setters.setDeliveryAddr({ ...EMPTY_ADDRESS, ...parsed.deliveryAddr });
  if (typeof parsed.klepNodig === "boolean") setters.setKlepNodig(parsed.klepNodig);
  if (typeof parsed.shipmentSecure === "boolean") setters.setShipmentSecure(parsed.shipmentSecure);
}

export function applyDraftWizardSnapshot(
  wizard: Partial<WizardStateSnapshot>,
  pricingPayload: FinancialTabPayload | null,
  setters: DraftWizardSetters,
): void {
  if (pricingPayload) setters.setPricingPayload(pricingPayload);
  if (wizard.step) setters.setWizardStep(wizard.step);
  if (wizard.intakeActiveQuestion) setters.setIntakeActiveQuestion(wizard.intakeActiveQuestion);
  if (wizard.routeActiveQuestion) setters.setRouteActiveQuestion(wizard.routeActiveQuestion);
  if (wizard.cargoActiveQuestion) setters.setCargoActiveQuestion(wizard.cargoActiveQuestion);
  if (wizard.reviewActiveQuestion) setters.setReviewActiveQuestion(wizard.reviewActiveQuestion);
}
