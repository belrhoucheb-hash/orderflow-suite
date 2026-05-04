import type { AddressValue } from "@/components/clients/AddressAutocomplete";

export interface FreightLine {
  id: string;
  activiteit: "Laden" | "Lossen";
  companyName?: string;
  locatie: string;
  datum: string;
  tijd: string;
  tijdTot: string;
  referentie: string;
  contactLocatie: string;
  opmerkingen: string;
  driverInstructions?: string;
  requiresTailLift?: boolean;
  temperatureControlled?: boolean;
  photoRequired?: boolean;
  vehicleTypeId?: string | null;
  vehicleTypeLabel?: string | null;
  warehouseId?: string;
  warehouseReferenceMode?: "manual" | "order_number";
  warehouseReferencePrefix?: string | null;
  // Optionele coord-info per leg, voorbereidend voor hub-routing
  // op afstand en betere Webfleet-export per stop.
  lat?: number | null;
  lng?: number | null;
  coords_manual?: boolean;
}

export interface CargoRow {
  id: string;
  aantal: string;
  eenheid: string;
  gewicht: string;
  lengte: string;
  breedte: string;
  hoogte: string;
  stapelbaar: boolean;
  adr: string;
  omschrijving: string;
}

export interface PlannerLocationOption {
  id: string;
  label: string;
  subtitle: string;
  badge: string;
  value: AddressValue;
  addressString: string;
  companyName?: string;
  contactHint?: string;
  notesHint?: string;
  driverInstructions?: string;
  requiresTailLift?: boolean;
  temperatureControlled?: boolean;
  photoRequired?: boolean;
  timeWindowStart?: string | null;
  timeWindowEnd?: string | null;
  warehouseId?: string;
  warehouseReferenceMode?: "manual" | "order_number";
  warehouseReferencePrefix?: string | null;
  warehouseReference?: string | null;
}

export interface SmartOrderDraft {
  raw: string;
  clientHint: string;
  pickupHint: string;
  deliveryHint: string;
  pickupDate: string;
  pickupFrom: string;
  pickupTo: string;
  deliveryDate: string;
  deliveryBefore: string;
  quantity: string;
  unit: "Pallets" | "Colli" | "Box";
  weightKg: string;
  reference: string;
  priority: "Standaard" | "Spoed" | "Retour";
  missing: string[];
  matchedClientId?: string | null;
  matchedClientName?: string | null;
}

export interface RouteLegInsight {
  id: string;
  fromLabel: string;
  toLabel: string;
  distanceLabel: string;
  durationLabel: string;
  etaLabel: string;
  hasGps: boolean;
}

export interface GooglePlaceDetailsResult {
  formatted_address?: string;
  street?: string;
  house_number?: string;
  zipcode?: string;
  city?: string;
  country?: string;
  lat?: number | null;
  lng?: number | null;
}
