import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Save, X, Check, Printer, Download, Mail, Plus, Trash2, Clock, Route } from "lucide-react";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { isValidAddress } from "@/components/inbox/utils";
import { useTenantOptional } from "@/contexts/TenantContext";
import { createShipmentWithLegs, inferAfdeling, type BookingInput } from "@/lib/trajectRouter";
import { previewLegs, type TrajectPreview } from "@/lib/trajectPreview";
import { supabase } from "@/integrations/supabase/client";
import { TRACKABLE_FIELDS, defaultExpectedBy } from "@/hooks/useOrderInfoRequests";
import { LuxeDatePicker } from "@/components/LuxeDatePicker";
import { LuxeTimePicker } from "@/components/LuxeTimePicker";

type MainTab = "algemeen" | "financieel" | "vrachtdossier";
type BottomTab = "vrachmeen" | "additionele_diensten" | "overige_referenties";

interface FreightLine {
  id: string;
  activiteit: "Laden" | "Lossen";
  locatie: string;
  datum: string;
  tijd: string;
  tijdTot: string;
  referentie: string;
  contactLocatie: string;
  opmerkingen: string;
}

interface FreightSummaryItem {
  id: string;
  aankomstdatum: string;
  aantal: string;
  bestemming: string;
  gewicht: string;
  laadreferentie: string;
  losreferentie: string;
  tijdslot: string;
  eenheid: string;
  afmetingen: string;
}

interface CargoRow {
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

type VehicleKey = "Caddy" | "Bus" | "Koel klein" | "Koel groot" | "Bakbus" | "DAF Truck" | "Hoya";

const VEHICLE_MATRIX: Record<VehicleKey, { ex: number; inc: number; min: number; screening: number }> = {
  "Caddy":       { ex: 841,     inc: 1103.30, min: 115,    screening: 107.50 },
  "Bus":         { ex: 986,     inc: 1291.80, min: 125,    screening: 107.50 },
  "Koel klein":  { ex: 1073,    inc: 1404.90, min: 125,    screening: 107.50 },
  "Koel groot":  { ex: 1189,    inc: 1555.70, min: 135,    screening: 107.50 },
  "Bakbus":      { ex: 1276,    inc: 1668.80, min: 145,    screening: 107.50 },
  "DAF Truck":   { ex: 1986.50, inc: 2592.45, min: 275,    screening: 217.50 },
  "Hoya":        { ex: 913.50,  inc: 1197.55, min: 97.50,  screening: 107.50 },
};
const KM_BASIS = 725;

const PERCENTAGE_TOESLAGEN = [
  { key: "ochtend_avond", label: "Ochtend / avond", percentage: 35 },
  { key: "zaterdag", label: "Zaterdag", percentage: 50 },
  { key: "zondag_feestdag", label: "Zondag / feestdag", percentage: 75 },
] as const;

const VASTE_TOESLAGEN = [
  { key: "wachturen", label: "Wachturen", tarief: 52.50, unit: "/ u" },
  { key: "extra_stops", label: "Extra stops", tarief: 45.00, unit: "" },
] as const;

const today = new Date().toISOString().split("T")[0];
const todayFormatted = new Date().toLocaleDateString("nl-NL", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

const NewOrder = () => {
  const navigate = useNavigate();
  const { tenant } = useTenantOptional();
  const [saving, setSaving] = useState(false);
  const [trajectPreview, setTrajectPreview] = useState<TrajectPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [mainTab, setMainTab] = useState<MainTab>("algemeen");
  const [bottomTab, setBottomTab] = useState<BottomTab>("vrachmeen");

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  const clearError = (field: string) => {
    setErrors(prev => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  // Form state
  const [clientName, setClientName] = useState("");
  const [contactpersoon, setContactpersoon] = useState("");
  const [prioriteit, setPrioriteit] = useState("Standaard");
  const [klantReferentie, setKlantReferentie] = useState("");
  const [transportType, setTransportType] = useState("");
  const [afdeling, setAfdeling] = useState("");
  const [afdelingManual, setAfdelingManual] = useState(false);
  const [voertuigtype, setVoertuigtype] = useState("");
  const [chauffeur, setChauffeur] = useState("");
  const [mrnDoc, setMrnDoc] = useState("");
  const [referentie, setReferentie] = useState("");

  // Detailed freight entry
  const [quantity, setQuantity] = useState("");
  const [transportEenheid, setTransportEenheid] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [afstand, setAfstand] = useState("");
  const [totaleDuur, setTotaleDuur] = useState("");
  const [afmetingen, setAfmetingen] = useState("");

  // Time windows
  const [pickupTimeFrom, setPickupTimeFrom] = useState("");
  const [pickupTimeTo, setPickupTimeTo] = useState("");
  const [deliveryTimeFrom, setDeliveryTimeFrom] = useState("");
  const [deliveryTimeTo, setDeliveryTimeTo] = useState("");

  // Freight summary (items added via "Toevoegen aan Vrachtlijst")
  const [freightSummary, setFreightSummary] = useState<FreightSummaryItem[]>([]);

  // §22 Info-tracking: welke velden "volgt van klant"
  const [infoFollows, setInfoFollows] = useState<Record<string, boolean>>({});
  const [infoContactName, setInfoContactName] = useState("");
  const [infoContactEmail, setInfoContactEmail] = useState("");

  const toggleInfoFollow = (fieldName: string) => {
    setInfoFollows(prev => ({ ...prev, [fieldName]: !prev[fieldName] }));
  };

  // Klep / laadklep
  const [klepNodig, setKlepNodig] = useState(false);

  // PMT (EDD / X-RAY) — conditioneel bij luchtvracht
  const [shipmentSecure, setShipmentSecure] = useState(true);
  const [pmtMethode, setPmtMethode] = useState<"" | "edd" | "xray">("");
  const [pmtOperator, setPmtOperator] = useState("");
  const [pmtReferentie, setPmtReferentie] = useState("");
  const [pmtDatum, setPmtDatum] = useState("");
  const [pmtLocatie, setPmtLocatie] = useState("");
  const [pmtSeal, setPmtSeal] = useState("");
  const [pmtByCustomer, setPmtByCustomer] = useState(true);
  const showPmt = transportType === "Express";

  // Financieel state — Royalty Cargo pricing model
  const [pricingMode, setPricingMode] = useState<"standard" | "override">("standard");
  const [kmVehicle, setKmVehicle] = useState<VehicleKey>("Caddy");
  const [vehicleManual, setVehicleManual] = useState(false);
  const [kmAfstand, setKmAfstand] = useState("");
  const [dieselInclusief, setDieselInclusief] = useState(true);
  const [screeningIncl, setScreeningIncl] = useState(false);
  const [overrideBedrag, setOverrideBedrag] = useState("");
  const [overrideReden, setOverrideReden] = useState("");

  // Toeslagen state
  const [activeToeslagen, setActiveToeslagen] = useState<Record<string, boolean>>({});
  const [wachturenAantal, setWachturenAantal] = useState(0);
  const [extraStopsAantal, setExtraStopsAantal] = useState(0);
  const [tolBedrag, setTolBedrag] = useState("");

  // Freight lines
  const [freightLines, setFreightLines] = useState<FreightLine[]>([
    { id: "1", activiteit: "Laden", locatie: "", datum: "", tijd: "", tijdTot: "", referentie: "", contactLocatie: "", opmerkingen: "" },
    { id: "2", activiteit: "Lossen", locatie: "", datum: "", tijd: "", tijdTot: "", referentie: "", contactLocatie: "", opmerkingen: "" },
  ]);

  const addFreightLine = () => {
    setFreightLines(prev => [...prev, {
      id: crypto.randomUUID(), activiteit: "Lossen", locatie: "", datum: "", tijd: "", tijdTot: "", referentie: "", contactLocatie: "", opmerkingen: "",
    }]);
  };

  const removeFreightLine = (id: string) => {
    if (freightLines.length <= 1) return;
    setFreightLines(prev => prev.filter(l => l.id !== id));
  };

  const updateFreightLine = (id: string, field: keyof FreightLine, value: string) => {
    setFreightLines(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));
  };

  const addToFreightSummary = () => {
    const ladenLine = freightLines.find(f => f.activiteit === "Laden");
    const lossenLine = freightLines.find(f => f.activiteit === "Lossen");
    if (!quantity && !lossenLine?.locatie && !weightKg) {
      toast.error("Vul minimaal aantal, bestemming of gewicht in");
      return;
    }
    const item: FreightSummaryItem = {
      id: crypto.randomUUID(),
      aankomstdatum: lossenLine?.datum || ladenLine?.datum || "",
      aantal: quantity ? `${quantity} ${transportEenheid || "stuks"}` : "",
      bestemming: lossenLine?.locatie || "",
      gewicht: weightKg ? `${weightKg} kg` : "",
      laadreferentie: ladenLine?.referentie || "",
      losreferentie: lossenLine?.referentie || "",
      tijdslot: [pickupTimeFrom, pickupTimeTo].filter(Boolean).join(" - ") || "",
      eenheid: transportEenheid || "",
      afmetingen: afmetingen || "",
    };
    setFreightSummary(prev => [...prev, item]);
    // Reset detail fields
    setQuantity("");
    setWeightKg("");
    setAfstand("");
    setTotaleDuur("");
    setAfmetingen("");
    toast.success("Item toegevoegd aan vrachtlijst");
  };

  const removeFromFreightSummary = (id: string) => {
    setFreightSummary(prev => prev.filter(item => item.id !== id));
  };

  // Cargo rows — multi-row lading-invoer
  const [cargoRows, setCargoRows] = useState<CargoRow[]>([
    { id: "1", aantal: "", eenheid: "Pallets", gewicht: "", lengte: "", breedte: "", hoogte: "", stapelbaar: true, adr: "", omschrijving: "" },
  ]);

  const addCargoRow = () => {
    setCargoRows(prev => [...prev, {
      id: crypto.randomUUID(), aantal: "", eenheid: "Pallets", gewicht: "", lengte: "", breedte: "", hoogte: "", stapelbaar: true, adr: "", omschrijving: "",
    }]);
  };
  const removeCargoRow = (id: string) => {
    if (cargoRows.length <= 1) return;
    setCargoRows(prev => prev.filter(r => r.id !== id));
  };
  const updateCargoRow = <K extends keyof CargoRow>(id: string, field: K, value: CargoRow[K]) => {
    setCargoRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  // Aggregated cargo totals (gebruikt door handleSave om de bestaande quantity/weight/unit state
  // te voeden zonder de Supabase-integratie te breken).
  const cargoTotals = useMemo(() => {
    const totAantal = cargoRows.reduce((s, r) => s + (parseInt(r.aantal) || 0), 0);
    const totGewicht = cargoRows.reduce((s, r) => s + (parseFloat(r.gewicht) || 0), 0);
    const primaryUnit = cargoRows.find(r => r.aantal && r.eenheid)?.eenheid || cargoRows[0]?.eenheid || "";
    return { totAantal, totGewicht, primaryUnit };
  }, [cargoRows]);

  // Sync cargo totals into legacy quantity/weight/unit state zodra de gebruiker iets typt
  // in de cargo-rows. Zo blijft handleSave + validatie ongewijzigd werken.
  useEffect(() => {
    if (cargoTotals.totAantal > 0) setQuantity(String(cargoTotals.totAantal));
    if (cargoTotals.totGewicht > 0) setWeightKg(String(cargoTotals.totGewicht));
    if (cargoTotals.primaryUnit) setTransportEenheid(cargoTotals.primaryUnit);
  }, [cargoTotals.totAantal, cargoTotals.totGewicht, cargoTotals.primaryUnit]);

  // Vehicle capacity mapping voor auto-selectie
  const VEHICLE_CAPACITY: Record<VehicleKey, { maxKg: number; L: number; B: number; H: number }> = {
    "Caddy":       { maxKg: 400,  L: 180, B: 110, H: 110 },
    "Hoya":        { maxKg: 500,  L: 200, B: 120, H: 120 },
    "Bus":         { maxKg: 800,  L: 280, B: 150, H: 150 },
    "Koel klein":  { maxKg: 600,  L: 240, B: 130, H: 130 },
    "Koel groot":  { maxKg: 1000, L: 320, B: 160, H: 170 },
    "Bakbus":      { maxKg: 1200, L: 400, B: 180, H: 190 },
    "DAF Truck":   { maxKg: 8000, L: 700, B: 240, H: 240 },
  };

  const VEHICLE_PREFERENCE: VehicleKey[] = ["Caddy", "Hoya", "Bus", "Koel klein", "Koel groot", "Bakbus", "DAF Truck"];

  const autoVehicleResult = useMemo(() => {
    const totalWeight = cargoTotals.totGewicht;
    const maxL = Math.max(0, ...cargoRows.map(r => parseFloat(r.lengte) || 0));
    const maxB = Math.max(0, ...cargoRows.map(r => parseFloat(r.breedte) || 0));
    const maxH = Math.max(0, ...cargoRows.map(r => parseFloat(r.hoogte) || 0));

    if (totalWeight <= 0 && maxL <= 0 && maxB <= 0 && maxH <= 0) return null;

    const minIndex = klepNodig ? VEHICLE_PREFERENCE.indexOf("Bakbus") : 0;

    for (let i = minIndex; i < VEHICLE_PREFERENCE.length; i++) {
      const key = VEHICLE_PREFERENCE[i];
      const cap = VEHICLE_CAPACITY[key];
      if (totalWeight <= cap.maxKg && maxL <= cap.L && maxB <= cap.B && maxH <= cap.H) {
        return { vehicle: key, forced: klepNodig && i >= minIndex && VEHICLE_PREFERENCE.indexOf(key) >= minIndex && minIndex > 0 };
      }
    }
    return null;
  }, [cargoRows, cargoTotals.totGewicht, klepNodig]);

  // Auto-select vehicle wanneer gebruiker niet handmatig heeft gekozen
  useEffect(() => {
    if (vehicleManual) return;
    if (autoVehicleResult) {
      setKmVehicle(autoVehicleResult.vehicle);
    }
  }, [autoVehicleResult, vehicleManual]);

  // Royalty Cargo pricing computation
  const pricing = useMemo(() => {
    const km = parseFloat(kmAfstand) || 0;
    const rounded = km > 0 ? Math.ceil(km / 5) * 5 : 0;
    const matrix = VEHICLE_MATRIX[kmVehicle];
    const matrixTariff = dieselInclusief ? matrix.inc : matrix.ex;
    const perKm = matrixTariff / KM_BASIS;
    const calcRaw = rounded * perKm;
    const screeningFee = screeningIncl ? matrix.screening : 0;
    const minApplied = calcRaw < matrix.min;
    const base = minApplied ? matrix.min : calcRaw;

    // Percentage-toeslagen (toggles)
    const percToeslagItems = PERCENTAGE_TOESLAGEN
      .filter(t => activeToeslagen[t.key])
      .map(t => ({ label: t.label, percentage: t.percentage, amount: base * (t.percentage / 100) }));
    const percToeslagTotaal = percToeslagItems.reduce((s, t) => s + t.amount, 0);

    // Vaste toeslagen
    const wachturenBedrag = wachturenAantal * 52.50;
    const extraStopsBedrag = extraStopsAantal * 45.00;
    const tolBedragNum = parseFloat(tolBedrag.replace(",", ".")) || 0;
    const vastToeslagTotaal = wachturenBedrag + extraStopsBedrag + tolBedragNum;

    const total = base + percToeslagTotaal + vastToeslagTotaal + screeningFee;
    return {
      km, rounded, matrixTariff, perKm, calcRaw, screeningFee, minApplied, min: matrix.min, base,
      percToeslagItems, percToeslagTotaal,
      wachturenBedrag, extraStopsBedrag, tolBedragNum, vastToeslagTotaal,
      total,
    };
  }, [kmAfstand, kmVehicle, dieselInclusief, screeningIncl, activeToeslagen, wachturenAantal, extraStopsAantal, tolBedrag]);

  // 8.12 – Save ALL form fields to the database, not just a subset.
  // Fields without a dedicated DB column are stored in the `attachments` JSON
  // column as structured metadata so nothing is lost.
  const handleSave = async (andClose: boolean) => {
    const pickupLine = freightLines.find(f => f.activiteit === "Laden");
    const deliveryLine = freightLines.find(f => f.activiteit === "Lossen");

    // -- Validation --
    const validUnits = ["Pallets", "Colli", "Box"];
    const newErrors: Record<string, string> = {};

    if (!clientName.trim()) newErrors.client_name = "Klantnaam is verplicht";
    if (!afdeling.trim()) newErrors.afdeling = "Afdeling is verplicht — wordt normaal automatisch bepaald";
    if (!pickupLine?.locatie?.trim()) newErrors.pickup_address = "Ophaaladres is verplicht";
    else if (!isValidAddress(pickupLine.locatie)) newErrors.pickup_address = "Onvolledig ophaaladres — straat + huisnummer vereist";
    if (!deliveryLine?.locatie?.trim()) newErrors.delivery_address = "Afleveradres is verplicht";
    else if (!isValidAddress(deliveryLine.locatie)) newErrors.delivery_address = "Onvolledig afleveradres — straat + huisnummer vereist";
    if (!quantity || parseInt(quantity) <= 0) newErrors.quantity = "Aantal moet groter zijn dan 0";
    if (!weightKg || parseFloat(weightKg) <= 0) newErrors.weight_kg = "Gewicht moet groter zijn dan 0";
    if (!transportEenheid || !validUnits.includes(transportEenheid)) newErrors.unit = `Eenheid moet een van ${validUnits.join(", ")} zijn`;

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      const count = Object.keys(newErrors).length;
      toast.error(`Formulier bevat ${count} validatiefout${count > 1 ? "en" : ""}`, {
        description: Object.values(newErrors).join(" | "),
      });
      return;
    }

    setErrors({});
    setSaving(true);
    try {
      if (!tenant?.id) throw new Error("Geen actieve tenant gevonden");

      const lossenLocaties = freightLines
        .filter(f => f.activiteit === "Lossen" && f.locatie?.trim())
        .map(f => f.locatie.trim());
      const finalDeliveryAddress =
        lossenLocaties.length >= 2 ? lossenLocaties[lossenLocaties.length - 1] : undefined;

      // §24 Pricing wiring — bereken totaal + details voor audit
      const pricingPayload: { cents: number | null; details: Record<string, unknown> | null } = (() => {
        if (pricingMode === "override") {
          const amt = parseFloat(overrideBedrag.replace(",", "."));
          if (!Number.isFinite(amt) || amt <= 0) return { cents: null, details: null };
          return {
            cents: Math.round(amt * 100),
            details: {
              mode: "override",
              amount: amt,
              reason: overrideReden.trim() || null,
            },
          };
        }
        if (pricing.total <= 0) return { cents: null, details: null };
        return {
          cents: Math.round(pricing.total * 100),
          details: {
            mode: "standard",
            vehicle: kmVehicle,
            km: pricing.km,
            km_rounded: pricing.rounded,
            diesel_included: dieselInclusief,
            matrix_tariff: pricing.matrixTariff,
            per_km: pricing.perKm,
            calc_raw: pricing.calcRaw,
            screening_included: screeningIncl,
            screening_fee: pricing.screeningFee,
            min_applied: pricing.minApplied,
            min_tariff: pricing.min,
            perc_toeslagen: pricing.percToeslagItems,
            perc_toeslag_totaal: pricing.percToeslagTotaal,
            wachturen: { aantal: wachturenAantal, bedrag: pricing.wachturenBedrag },
            extra_stops: { aantal: extraStopsAantal, bedrag: pricing.extraStopsBedrag },
            tol_bedrag: pricing.tolBedragNum,
            vast_toeslag_totaal: pricing.vastToeslagTotaal,
            total: pricing.total,
          },
        };
      })();

      // §25 Cargo-detail als JSONB array
      const cargoPayload = cargoRows
        .filter(r => r.aantal || r.gewicht)
        .map(r => ({
          aantal: parseInt(r.aantal) || 0,
          eenheid: r.eenheid || null,
          gewicht: parseFloat(r.gewicht) || 0,
          lengte: parseFloat(r.lengte) || null,
          breedte: parseFloat(r.breedte) || null,
          hoogte: parseFloat(r.hoogte) || null,
          stapelbaar: r.stapelbaar,
          adr: r.adr || null,
          omschrijving: r.omschrijving || null,
        }));

      // §25 PMT-gegevens als JSONB
      const pmtPayload = showPmt ? {
        secure: shipmentSecure,
        methode: shipmentSecure ? null : (pmtMethode || null),
        operator: pmtOperator.trim() || null,
        referentie: pmtReferentie.trim() || null,
        datum: pmtDatum || null,
        locatie: pmtLocatie.trim() || null,
        seal: pmtSeal.trim() || null,
        by_customer: pmtByCustomer,
      } : null;

      // §25 Dimensions samengesteld uit cargo-rij afmetingen
      const dimParts = cargoRows
        .filter(r => r.lengte && r.breedte && r.hoogte)
        .map(r => `${r.lengte}×${r.breedte}×${r.hoogte}cm`);
      const dimensionsStr = dimParts.length > 0 ? dimParts.join(", ") : (afmetingen || null);

      // Requirements array
      const reqs: string[] = [];
      if (klepNodig) reqs.push("laadklep");

      const booking: BookingInput = {
        pickup_address: pickupLine?.locatie || null,
        delivery_address: deliveryLine?.locatie || null,
        final_delivery_address: finalDeliveryAddress,
        client_name: clientName.trim(),
        client_id: null,
        transport_type: transportType || null,
        afdeling: afdeling || null,
        weight_kg: weightKg ? parseInt(weightKg) : null,
        quantity: quantity ? parseInt(quantity) : null,
        unit: transportEenheid || null,
        priority: prioriteit || null,
        requirements: reqs.length > 0 ? reqs : null,
        pickup_time_window_start: pickupLine?.tijd || pickupTimeFrom || null,
        pickup_time_window_end: pickupLine?.tijdTot || pickupTimeTo || null,
        delivery_time_window_start: deliveryLine?.tijd || deliveryTimeFrom || null,
        delivery_time_window_end: deliveryLine?.tijdTot || deliveryTimeTo || null,
        notes: referentie.trim() || null,
        price_total_cents: pricingPayload.cents,
        pricing: pricingPayload.details,
        // §25 Shipment-level velden
        contact_person: contactpersoon || null,
        vehicle_type: voertuigtype || null,
        client_reference: klantReferentie.trim() || null,
        mrn_document: mrnDoc.trim() || null,
        requires_tail_lift: klepNodig,
        pmt: pmtPayload,
        cargo: cargoPayload.length > 0 ? cargoPayload : null,
        // Per-leg detail
        pickup_date_str: pickupLine?.datum || null,
        delivery_date_str: deliveryLine?.datum || null,
        pickup_reference: pickupLine?.referentie || null,
        delivery_reference: deliveryLine?.referentie || null,
        pickup_contact: pickupLine?.contactLocatie || null,
        delivery_contact: deliveryLine?.contactLocatie || null,
        pickup_notes: pickupLine?.opmerkingen || null,
        delivery_notes: deliveryLine?.opmerkingen || null,
        dimensions: dimensionsStr,
      };

      const { shipment, legs } = await createShipmentWithLegs(booking, tenant.id);

      // §22 Info-tracking: insert info-requests voor elk veld dat "volgt van klant"
      const checkedFields = TRACKABLE_FIELDS.filter(f => infoFollows[f.name]);
      if (checkedFields.length > 0 && legs.length > 0) {
        const pickupIso = (() => {
          const d = pickupLine?.datum;
          const t = pickupLine?.tijd || pickupTimeFrom;
          if (!d) return null;
          const combined = t ? `${d}T${t}:00` : `${d}T08:00:00`;
          const parsed = new Date(combined);
          return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
        })();
        const expected_by = defaultExpectedBy(pickupIso);
        const rows = legs.flatMap((leg: any) =>
          checkedFields.map(f => ({
            tenant_id: tenant.id,
            order_id: leg.id,
            field_name: f.name,
            field_label: f.label,
            status: "PENDING",
            promised_by_name: infoContactName.trim() || (contactpersoon || null),
            promised_by_email: infoContactEmail.trim() || null,
            expected_by,
          }))
        );
        const { error: infoErr } = await (supabase as any)
          .from("order_info_requests")
          .insert(rows);
        if (infoErr) {
          console.warn("[NewOrder] info-request insert faalde:", infoErr);
          toast.warning("Order opgeslagen, maar info-tracking kon niet worden aangemaakt");
        }
      }

      // Auto-rappel voor EXPORT placeholder leg-2: pickup === delivery betekent
      // dat de echte eindbestemming (Dubai, etc.) nog volgt van de klant.
      let exportRappelCreated = false;
      if (
        legs.length === 2 &&
        (legs[1] as any).leg_role === "EXPORT_LEG" &&
        (legs[1] as any).pickup_address &&
        (legs[1] as any).pickup_address === (legs[1] as any).delivery_address
      ) {
        try {
          const { data: existing } = await (supabase as any)
            .from("order_info_requests")
            .select("id")
            .eq("order_id", (legs[1] as any).id)
            .eq("field_name", "delivery_address")
            .eq("status", "PENDING")
            .maybeSingle();
          if (!existing) {
            const leg0Start = (legs[0] as any).time_window_start as string | null | undefined;
            const base = leg0Start ? new Date(leg0Start) : new Date(Date.now() + 24 * 3600 * 1000);
            const expected_by = leg0Start
              ? new Date(base.getTime() - 24 * 3600 * 1000).toISOString()
              : base.toISOString();
            const { error: rappelErr } = await (supabase as any)
              .from("order_info_requests")
              .insert({
                order_id: (legs[1] as any).id,
                tenant_id: tenant.id,
                field_name: "delivery_address",
                field_label: "Eindbestemming export",
                status: "PENDING",
                expected_by,
                promised_by_name: null,
              });
            if (rappelErr) {
              console.warn("[NewOrder] export-rappel insert faalde:", rappelErr);
            } else {
              exportRappelCreated = true;
            }
          }
        } catch (e) {
          console.warn("[NewOrder] export-rappel check faalde:", e);
        }
      }

      const baseMsg =
        legs.length > 1
          ? `Shipment aangemaakt met ${legs.length} legs (${legs.map((l) => l.leg_role).join(" + ")})`
          : "Order aangemaakt";
      toast.success(
        exportRappelCreated ? `${baseMsg} — Rappel voor eindbestemming is aangemaakt` : baseMsg,
      );
      if (andClose) {
        // Navigeer naar de eerste leg; OrderDetail toont de shipment-context
        if (legs[0]?.id) navigate(`/orders/${legs[0].id}`);
        else navigate("/orders");
      }
    } catch (e: any) {
      toast.error(e.message || "Fout bij opslaan");
    } finally { setSaving(false); }
  };

  // Auto-infer afdeling zolang de planner 'm niet handmatig heeft gekozen.
  useEffect(() => {
    if (afdelingManual) return;
    const pickup = freightLines.find((f) => f.activiteit === "Laden")?.locatie || "";
    const delivery = freightLines.find((f) => f.activiteit === "Lossen")?.locatie || "";
    const inferred = inferAfdeling(pickup, delivery);
    setAfdeling(inferred ?? "");
  }, [freightLines, afdelingManual]);

  // Live traject-preview zodra beide adressen ingevuld zijn.
  useEffect(() => {
    const pickup = freightLines.find((f) => f.activiteit === "Laden")?.locatie || "";
    const delivery = freightLines.find((f) => f.activiteit === "Lossen")?.locatie || "";
    if (!tenant?.id || !pickup || !delivery) {
      setTrajectPreview(null);
      return;
    }
    // Debounce 400ms: voorkomt dat preview bij elke letter een DB-roundtrip doet
    // + stopt ook de flickerende "geen rule gevonden"-melding tijdens typen.
    let cancelled = false;
    const timer = setTimeout(() => {
      setPreviewLoading(true);
      previewLegs(
        {
          pickup_address: pickup,
          delivery_address: delivery,
          client_name: clientName.trim(),
          afdeling: afdeling || null,
        },
        tenant.id,
      )
        .then((p) => {
          if (!cancelled) setTrajectPreview(p);
        })
        .catch(() => {
          if (!cancelled) setTrajectPreview(null);
        })
        .finally(() => {
          if (!cancelled) setPreviewLoading(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [freightLines, clientName, afdeling, tenant?.id]);

  const mainTabs: { key: MainTab; label: string }[] = [
    { key: "algemeen", label: "Algemeen" },
    { key: "financieel", label: "Financieel" },
    { key: "vrachtdossier", label: "Vrachtdossier" },
  ];

  const bottomTabs: { key: BottomTab; label: string }[] = [
    { key: "vrachmeen", label: "VRACHMEEN" },
    { key: "additionele_diensten", label: "ADDITIONELE DIENSTEN" },
    { key: "overige_referenties", label: "OVERIGE REFERENTIES" },
  ];

  return (
    <div className="-m-6 min-h-[calc(100vh-3rem)] flex flex-col bg-muted/30">
      {/* ── Luxe hero header ── */}
      <div className="relative bg-card border-b border-border/50 shrink-0">
        <span
          className="absolute top-0 left-0 right-0 h-px pointer-events-none"
          style={{ background: "linear-gradient(90deg, transparent, hsl(var(--gold) / 0.4), transparent)" }}
        />
        <div className="px-6 py-5 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="inline-flex items-center gap-2 mb-2">
              <span className="w-4 h-px bg-[hsl(var(--gold))]" />
              <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-[hsl(var(--gold-deep))]">
                Orders · nieuw
              </span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground leading-tight" style={{ fontFamily: "var(--font-display)" }}>
              Nieuwe order
            </h1>
            <p className="text-xs text-muted-foreground mt-1.5">{todayFormatted}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => navigate("/orders")}
              className="inline-flex items-center justify-center h-10 px-[1.125rem] rounded-[0.625rem] text-sm font-medium cursor-pointer border border-transparent bg-transparent text-muted-foreground transition-all duration-200 hover:text-foreground hover:bg-[hsl(var(--muted)_/_0.5)]"
            >
              Annuleren
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center justify-center h-10 px-[1.125rem] rounded-[0.625rem] text-sm font-medium cursor-pointer border border-[hsl(var(--border)_/_0.7)] bg-white text-foreground transition-all duration-200 hover:bg-[hsl(var(--muted)_/_0.6)] hover:border-[hsl(var(--border))]"
            >
              Afdrukken
            </button>
            <button
              type="button"
              onClick={() => handleSave(false)}
              disabled={saving}
              className="inline-flex items-center justify-center h-10 px-[1.125rem] rounded-[0.625rem] text-sm font-medium cursor-pointer border border-[hsl(var(--border)_/_0.7)] bg-white text-foreground transition-all duration-200 hover:bg-[hsl(var(--muted)_/_0.6)] hover:border-[hsl(var(--border))] disabled:opacity-50"
            >
              Opslaan
            </button>
            <button
              type="button"
              onClick={() => handleSave(true)}
              disabled={saving}
              className="inline-flex items-center justify-center h-10 px-[1.125rem] rounded-[0.625rem] text-sm font-medium cursor-pointer border border-transparent text-white relative overflow-hidden transition-all duration-200 hover:-translate-y-px disabled:opacity-50"
              style={{
                background: "linear-gradient(180deg, hsl(0 78% 48%) 0%, hsl(0 78% 38%) 100%)",
                boxShadow: "0 1px 2px hsl(var(--primary) / 0.4), 0 4px 12px -2px hsl(var(--primary) / 0.3), inset 0 1px 0 hsl(0 0% 100% / 0.2), inset 0 -1px 0 hsl(0 0% 0% / 0.1)",
              }}
            >
              Opslaan & sluiten
            </button>
          </div>
        </div>

        {/* ── Main tabs ── */}
        <div className="px-6 flex shrink-0 overflow-x-auto whitespace-nowrap border-t border-border/40">
          {mainTabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setMainTab(tab.key)}
              className={cn(
                "relative px-4 py-3 text-xs font-medium tracking-wide transition-colors border-b-2 -mb-px shrink-0",
                mainTab === tab.key
                  ? "text-foreground border-foreground"
                  : "text-muted-foreground border-transparent hover:text-foreground"
              )}
              style={mainTab === tab.key ? { fontFamily: "var(--font-display)" } : undefined}
            >
              {tab.label}
              {mainTab === tab.key && (
                <span className="absolute left-1/2 -translate-x-1/2 -bottom-[5px] w-[3px] h-[3px] rounded-full bg-[hsl(var(--gold))]" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto">
        {mainTab === "algemeen" && (
          <div className="max-w-[1320px] mx-auto px-6 pt-4 pb-8 space-y-5">
            {/* ══ Chapter I · Klant & order ══ */}
            <section className="card--luxe p-6 relative">
              <span className="card-chapter">I</span>
              <div className="mb-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))] mb-1" style={{ fontFamily: "var(--font-display)" }}>
                  01 · Klant &amp; order
                </div>
                <h3 className="section-title">Klantgegevens &amp; referentie</h3>
                <p className="text-xs text-muted-foreground mt-1">Wie is de klant en waar verwijs je naar.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-x-5 gap-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Klant <span className="text-red-600">*</span></label>
                  <Input
                    value={clientName}
                    onChange={e => { setClientName(e.target.value); clearError("client_name"); }}
                    placeholder="Zoek klant of relatie…"
                    className={cn("h-9 text-sm", errors.client_name && "border-red-500")}
                  />
                  {errors.client_name && <span className="text-[11px] text-red-500">{errors.client_name}</span>}
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Contactpersoon</label>
                  <Select value={contactpersoon} onValueChange={setContactpersoon}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Jan de Vries">Jan de Vries</SelectItem>
                      <SelectItem value="Piet Jansen">Piet Jansen</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Prioriteit</label>
                  <Select value={prioriteit} onValueChange={setPrioriteit}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Standaard">Standaard</SelectItem>
                      <SelectItem value="Spoed">Spoed</SelectItem>
                      <SelectItem value="Retour">Retour</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Klant-referentie <span className="text-red-600">*</span></label>
                  <Input
                    value={klantReferentie}
                    onChange={e => setKlantReferentie(e.target.value)}
                    placeholder="PO-nummer of bestelreferentie"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Opmerkingen voor planner</label>
                  <Textarea
                    value={referentie}
                    onChange={e => setReferentie(e.target.value)}
                    rows={2}
                    placeholder="Bijzonderheden, instructies…"
                    className="text-sm resize-none"
                  />
                </div>
              </div>
            </section>

{/* ══ Chapter II · Vrachtplanning ══ */}
            <section className="card--luxe p-6 relative">
              <span className="card-chapter">III</span>
              <div className="mb-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))] mb-1" style={{ fontFamily: "var(--font-display)" }}>
                  02 · Vrachtplanning
                </div>
                <h3 className="section-title">Laad- en losstops</h3>
                <p className="text-xs text-muted-foreground mt-1">Adres, datum en tijdvenster per stop.</p>
              </div>

              <div className="space-y-0 divide-y divide-[hsl(var(--border)_/_0.4)]">
                {freightLines.map((line, idx) => (
                  <div key={line.id} className="py-5 first:pt-0 last:pb-0">
                    {/* Type + stop-nummer + verwijder */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <span className="w-6 h-6 rounded-md bg-[hsl(var(--gold-soft))] text-[hsl(var(--gold-deep))] inline-flex items-center justify-center">
                          <Route className="h-3 w-3" />
                        </span>
                        <Select value={line.activiteit} onValueChange={v => updateFreightLine(line.id, "activiteit", v)}>
                          <SelectTrigger className="h-7 w-auto text-sm font-semibold border-0 bg-transparent px-0 shadow-none focus:ring-0 gap-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Laden">Laden</SelectItem>
                            <SelectItem value="Lossen">Lossen</SelectItem>
                          </SelectContent>
                        </Select>
                        <span className="text-[10px] text-muted-foreground tracking-wider uppercase">Stop {idx + 1}</span>
                      </div>
                      {freightLines.length > 2 && (
                        <button
                          onClick={() => removeFreightLine(line.id)}
                          className="text-muted-foreground/50 hover:text-muted-foreground transition-colors p-1"
                          aria-label="Stop verwijderen"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Adres */}
                    <div className="mb-3">
                      <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                        {line.activiteit === "Laden" ? "Ophaaladres" : "Afleveradres"}
                      </label>
                      <AddressAutocomplete
                        value={line.locatie}
                        onChange={v => {
                          updateFreightLine(line.id, "locatie", v);
                          if (line.activiteit === "Laden") clearError("pickup_address");
                          if (line.activiteit === "Lossen") clearError("delivery_address");
                        }}
                        className={cn(
                          "h-10 text-sm",
                          line.activiteit === "Laden" && errors.pickup_address && "border-[hsl(var(--primary))]",
                          line.activiteit === "Lossen" && errors.delivery_address && "border-[hsl(var(--primary))]",
                        )}
                      />
                      {line.activiteit === "Laden" && errors.pickup_address && <span className="text-[11px] text-[hsl(var(--primary))] mt-0.5 block">{errors.pickup_address}</span>}
                      {line.activiteit === "Lossen" && errors.delivery_address && <span className="text-[11px] text-[hsl(var(--primary))] mt-0.5 block">{errors.delivery_address}</span>}
                    </div>

                    {/* Datum + tijdvenster */}
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground block mb-1.5">Datum</label>
                        <LuxeDatePicker
                          value={line.datum}
                          onChange={v => updateFreightLine(line.id, "datum", v)}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground block mb-1.5">Tijd van</label>
                        <LuxeTimePicker
                          value={line.tijd}
                          onChange={v => updateFreightLine(line.id, "tijd", v)}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground block mb-1.5">Tijd tot</label>
                        <LuxeTimePicker
                          value={line.tijdTot}
                          onChange={v => updateFreightLine(line.id, "tijdTot", v)}
                        />
                      </div>
                    </div>

                    {/* Extra velden */}
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground block mb-1.5">Referentie</label>
                        <Input
                          value={line.referentie}
                          onChange={e => updateFreightLine(line.id, "referentie", e.target.value)}
                          placeholder="PO-nummer"
                          className="h-9 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground block mb-1.5">Contact op locatie</label>
                        <Input
                          value={line.contactLocatie}
                          onChange={e => updateFreightLine(line.id, "contactLocatie", e.target.value)}
                          placeholder="Naam / telefoon"
                          className="h-9 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground block mb-1.5">Opmerking</label>
                        <Input
                          value={line.opmerkingen}
                          onChange={e => updateFreightLine(line.id, "opmerkingen", e.target.value)}
                          placeholder="Bv. aanmelden receptie"
                          className="h-9 text-sm"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-4">
                <button
                  type="button"
                  onClick={addFreightLine}
                  className="text-xs text-[hsl(var(--gold-deep))] hover:text-foreground font-medium inline-flex items-center gap-1.5 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" /> Tussenstop toevoegen
                </button>
              </div>
            </section>

            {/* ── Traject-preview (onder stops) ── */}
            {(trajectPreview || previewLoading) && (
              <div className="card--luxe p-5 relative">
                {previewLoading && !trajectPreview && (
                  <div className="text-xs text-muted-foreground">Traject wordt berekend…</div>
                )}
                {trajectPreview && trajectPreview.matched && trajectPreview.legs.length > 0 && (
                  <div className="flex items-start gap-3">
                    <span className="w-7 h-7 rounded-lg bg-[hsl(var(--gold-soft))] text-[hsl(var(--gold-deep))] inline-flex items-center justify-center shrink-0 mt-0.5">
                      <Route className="h-3.5 w-3.5" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold flex items-center gap-2 flex-wrap">
                        <span>
                          {trajectPreview.legs.length > 1
                            ? `Boeking wordt gesplitst in ${trajectPreview.legs.length} legs`
                            : `Traject: ${trajectPreview.rule?.name ?? ""}`}
                        </span>
                        {afdeling && (
                          <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-md bg-[hsl(var(--gold-soft))] text-[hsl(var(--gold-deep))] border border-[hsl(var(--gold)_/_0.25)]">
                            {afdeling}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 space-y-1.5">
                        {trajectPreview.legs.map((leg) => (
                          <div key={leg.sequence} className="flex items-center gap-2 text-xs">
                            <span className="w-5 h-5 rounded-md bg-[hsl(var(--muted)_/_0.5)] text-muted-foreground inline-flex items-center justify-center text-[10px] font-bold shrink-0">
                              {leg.sequence}
                            </span>
                            <span className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-[hsl(var(--gold-soft)_/_0.5)] text-[hsl(var(--gold-deep))] border border-[hsl(var(--gold)_/_0.15)]">
                              {leg.department_code}
                            </span>
                            <span className="text-muted-foreground truncate">{leg.from || "?"} → {leg.to || "?"}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                {trajectPreview && !trajectPreview.matched && trajectPreview.reason && (
                  <div className="flex items-start gap-3">
                    <span className="w-7 h-7 rounded-lg bg-[hsl(var(--muted))] text-muted-foreground inline-flex items-center justify-center shrink-0 mt-0.5">
                      <Route className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-xs text-muted-foreground">{trajectPreview.reason}</span>
                  </div>
                )}
              </div>
            )}

            {/* ══ Chapter III · Transport ══ */}
            <section className="card--luxe p-6 relative">
              <span className="card-chapter">II</span>
              <div className="mb-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))] mb-1" style={{ fontFamily: "var(--font-display)" }}>
                  03 · Transport
                </div>
                <h3 className="section-title">Type en voertuig</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Afdeling wordt automatisch bepaald door het traject{afdeling ? ` (${afdeling})` : ""}. Chauffeur wordt later toegewezen.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-x-5 gap-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Transport type <span className="text-red-600">*</span></label>
                  <Select value={transportType} onValueChange={setTransportType}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecteer…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FTL">FTL</SelectItem>
                      <SelectItem value="LTL">LTL</SelectItem>
                      <SelectItem value="Koel">Koel</SelectItem>
                      <SelectItem value="Express">Express</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Voertuigtype</label>
                  <Select value={voertuigtype} onValueChange={setVoertuigtype}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecteer…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Vrachtwagen">Vrachtwagen</SelectItem>
                      <SelectItem value="Bestelbus">Bestelbus</SelectItem>
                      <SelectItem value="Trailer">Trailer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Afdeling <span className="text-red-600">*</span></label>
                  <Select
                    value={afdeling || undefined}
                    onValueChange={v => { setAfdeling(v); setAfdelingManual(true); clearError("afdeling"); }}
                  >
                    <SelectTrigger className={cn("h-9 text-sm", errors.afdeling && "border-red-500")}>
                      <SelectValue placeholder="Selecteer…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OPS">Operations</SelectItem>
                      <SelectItem value="EXPORT">Export</SelectItem>
                      <SelectItem value="IMPORT">Import</SelectItem>
                    </SelectContent>
                  </Select>
                  {!afdelingManual && afdeling && (
                    <span className="text-[10px] text-[hsl(var(--gold-deep))] tracking-wider mt-0.5 block">
                      Automatisch bepaald op basis van traject
                    </span>
                  )}
                  {afdelingManual && (
                    <button
                      type="button"
                      onClick={() => setAfdelingManual(false)}
                      className="text-[10px] text-muted-foreground hover:text-foreground underline mt-0.5 block"
                    >
                      Terug naar automatische detectie
                    </button>
                  )}
                  {errors.afdeling && <span className="text-[11px] text-red-500">{errors.afdeling}</span>}
                </div>
              </div>
            </section>

            
            {/* ══ Chapter IV · Lading ══ */}
            <section className="card--luxe p-6 relative">
              <span className="card-chapter">IV</span>
              <div className="mb-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))] mb-1" style={{ fontFamily: "var(--font-display)" }}>
                  04 · Lading
                </div>
                <h3 className="section-title">Wat wordt er vervoerd</h3>
                <p className="text-xs text-muted-foreground mt-1">Voeg meerdere regels toe voor verschillende soorten lading.</p>
              </div>

              <div className="overflow-x-auto mb-4">
                <table className="w-full text-xs min-w-[900px]">
                  <thead>
                    <tr className="border-b border-border/60 text-muted-foreground">
                      <th className="text-left font-semibold py-2 pr-2 w-[80px]">Aantal eenheden <span className="text-red-600">*</span></th>
                      <th className="text-left font-semibold py-2 pr-2 w-[120px]">Eenheid <span className="text-red-600">*</span></th>
                      <th className="text-left font-semibold py-2 pr-2 w-[100px]">Gewicht (kg) <span className="text-red-600">*</span></th>
                      <th className="text-left font-semibold py-2 pr-2 w-[180px]">L × B × H (cm)</th>
                      <th className="text-center font-semibold py-2 pr-2 w-[90px]">Stapelbaar</th>
                      <th className="text-left font-semibold py-2 pr-2 w-[110px]">ADR / UN</th>
                      <th className="text-left font-semibold py-2 pr-2">Omschrijving</th>
                      <th className="w-[36px]" />
                    </tr>
                  </thead>
                  <tbody>
                    {cargoRows.map(row => (
                      <tr key={row.id} className="border-b border-border/40">
                        <td className="py-2 pr-2">
                          <Input
                            type="number"
                            value={row.aantal}
                            onChange={e => { updateCargoRow(row.id, "aantal", e.target.value); clearError("quantity"); }}
                            className="h-9 text-xs tabular-nums"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <Select value={row.eenheid} onValueChange={v => { updateCargoRow(row.id, "eenheid", v); clearError("unit"); }}>
                            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Pallets">Pallets</SelectItem>
                              <SelectItem value="Colli">Colli</SelectItem>
                              <SelectItem value="Box">Box</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="py-2 pr-2">
                          <Input
                            type="number"
                            value={row.gewicht}
                            onChange={e => { updateCargoRow(row.id, "gewicht", e.target.value); clearError("weight_kg"); }}
                            className="h-9 text-xs tabular-nums"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <div className="dim-group">
                            <Input type="number" value={row.lengte} onChange={e => updateCargoRow(row.id, "lengte", e.target.value)} className="h-9 text-xs tabular-nums w-[56px] px-1.5" />
                            <span className="dim-sep">×</span>
                            <Input type="number" value={row.breedte} onChange={e => updateCargoRow(row.id, "breedte", e.target.value)} className="h-9 text-xs tabular-nums w-[56px] px-1.5" />
                            <span className="dim-sep">×</span>
                            <Input type="number" value={row.hoogte} onChange={e => updateCargoRow(row.id, "hoogte", e.target.value)} className="h-9 text-xs tabular-nums w-[56px] px-1.5" />
                          </div>
                        </td>
                        <td className="py-2 pr-2 text-center">
                          <label className="toggle">
                            <input
                              type="checkbox"
                              checked={row.stapelbaar}
                              onChange={e => updateCargoRow(row.id, "stapelbaar", e.target.checked)}
                            />
                            <span></span>
                          </label>
                        </td>
                        <td className="py-2 pr-2">
                          <Input
                            value={row.adr}
                            onChange={e => updateCargoRow(row.id, "adr", e.target.value)}
                            placeholder="—"
                            className="h-9 text-xs tabular-nums"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <Input
                            value={row.omschrijving}
                            onChange={e => updateCargoRow(row.id, "omschrijving", e.target.value)}
                            className="h-9 text-xs"
                          />
                        </td>
                        <td className="py-2">
                          <button
                            onClick={() => removeCargoRow(row.id)}
                            className="text-muted-foreground hover:text-destructive transition-colors p-1"
                            aria-label="Regel verwijderen"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mb-4">
                <button
                  type="button"
                  onClick={addCargoRow}
                  className="text-xs text-[hsl(var(--gold-deep))] hover:text-foreground font-medium inline-flex items-center gap-1 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" /> Lading-regel toevoegen
                </button>
              </div>

              {/* Klep / laadklep toggle */}
              <div className="flex items-center gap-3 mb-4">
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={klepNodig}
                    onChange={e => setKlepNodig(e.target.checked)}
                  />
                  <span></span>
                </label>
                <span className="text-xs font-medium text-foreground">Klep / laadklep nodig</span>
              </div>

              {(errors.quantity || errors.weight_kg || errors.unit) && (
                <div className="text-xs text-red-500 mb-3 space-y-0.5">
                  {errors.quantity && <div>{errors.quantity}</div>}
                  {errors.weight_kg && <div>{errors.weight_kg}</div>}
                  {errors.unit && <div>{errors.unit}</div>}
                </div>
              )}

              {/* Totalen */}
              <div className="cargo-summary">
                <div className="sum-card">
                  <span className="sum-label">Totaal aantal</span>
                  <span className="sum-value">{cargoTotals.totAantal} <span className="sum-unit">{cargoTotals.primaryUnit || "stuks"}</span></span>
                </div>
                <div className="sum-card">
                  <span className="sum-label">Totaal gewicht</span>
                  <span className="sum-value">{cargoTotals.totGewicht.toLocaleString("nl-NL")} <span className="sum-unit">kg</span></span>
                </div>
                <div className="sum-card">
                  <span className="sum-label">Afstand · auto</span>
                  <span className="sum-value">{afstand || "—"} <span className="sum-unit">km</span></span>
                </div>
                <div className="sum-card">
                  <span className="sum-label">Duur · auto</span>
                  <span className="sum-value">{totaleDuur || "—"}</span>
                </div>
              </div>
            </section>

            {/* ══ Chapter V · Luchtvracht-beveiliging (PMT) ══ */}
            {showPmt && (
            <section className="card--luxe p-6 relative">
              <span className="card-chapter">V</span>
              <div className="mb-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))] mb-1" style={{ fontFamily: "var(--font-display)" }}>
                  05 · Luchtvracht-beveiliging
                </div>
                <h3 className="section-title">PMT · EDD of X-RAY</h3>
                <p className="text-xs text-muted-foreground mt-1">Verschijnt automatisch bij luchtvracht. Standaard gaat de sectie uit van een vooraf beveiligde zending.</p>
              </div>

              {/* Secure toggle */}
              <div className="flex items-center justify-between p-4 rounded-[0.875rem] bg-[hsl(var(--muted)_/_0.3)] border border-[hsl(var(--border)_/_0.5)] mb-4">
                <div>
                  <div className="text-[0.9375rem] font-semibold" style={{ fontFamily: "var(--font-display)" }}>Zending is vooraf beveiligd (Secure)</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Uitzetten wanneer screening nog moet gebeuren, er wordt dan een PMT-traject gestart.</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={shipmentSecure}
                  onClick={() => setShipmentSecure(!shipmentSecure)}
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                    shipmentSecure ? "bg-[hsl(var(--gold))]" : "bg-[hsl(var(--border))]",
                  )}
                >
                  <span className={cn(
                    "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
                    shipmentSecure ? "translate-x-5" : "translate-x-0",
                  )} />
                </button>
              </div>

              {/* PMT-methode + gegevens (als NIET secure) */}
              {!shipmentSecure && (
                <div className="space-y-4">
                  <div className="text-xs font-medium text-muted-foreground tracking-wider uppercase mb-2">PMT-methode</div>
                  <div className="grid grid-cols-2 gap-2.5">
                    {(["edd", "xray"] as const).map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPmtMethode(m)}
                        className={cn(
                          "flex items-center gap-3 p-4 rounded-xl border transition-all text-left",
                          pmtMethode === m
                            ? "border-[hsl(var(--gold))] bg-[hsl(var(--gold-soft)_/_0.4)] shadow-[0_0_0_1px_hsl(var(--gold)_/_0.3)]"
                            : "border-[hsl(var(--border)_/_0.5)] bg-white hover:border-[hsl(var(--gold)_/_0.4)]",
                        )}
                      >
                        <span className="w-8 h-8 rounded-lg bg-[hsl(var(--gold-soft))] text-[hsl(var(--gold-deep))] inline-flex items-center justify-center shrink-0">
                          {m === "edd" ? (
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11H7a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-2M9 11V7a3 3 0 116 0v4M9 11h6"/></svg>
                          ) : (
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M6 11v6M10 11v6M14 11v6M18 11v6"/></svg>
                          )}
                        </span>
                        <span className="text-sm font-semibold">{m === "edd" ? "EDD · Hondenscan" : "X-RAY · Röntgenscan"}</span>
                      </button>
                    ))}
                  </div>

                  {pmtMethode && (
                    <div className="pt-2 space-y-4">
                      <div className="text-xs font-medium text-muted-foreground tracking-wider uppercase">PMT-gegevens voor RCS-verklaring</div>
                      <div className="grid grid-cols-2 gap-x-5 gap-y-4">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground block mb-1.5">Operator / screeningsbedrijf</label>
                          <Input value={pmtOperator} onChange={e => setPmtOperator(e.target.value)} placeholder="Bv. Schiphol Cargo Security BV" className="h-9 text-sm" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground block mb-1.5">PMT-referentienummer</label>
                          <Input value={pmtReferentie} onChange={e => setPmtReferentie(e.target.value)} placeholder="PMT-2026-…" className="h-9 text-sm tabular-nums" style={{ fontFamily: "var(--font-display)" }} />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground block mb-1.5">Datum / tijd screening</label>
                          <LuxeDatePicker value={pmtDatum} onChange={setPmtDatum} />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground block mb-1.5">Locatie screening</label>
                          <Input value={pmtLocatie} onChange={e => setPmtLocatie(e.target.value)} placeholder="Bv. Schiphol Zuidoost, Gebouw 4" className="h-9 text-sm" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground block mb-1.5">Seal-nummer (na screening)</label>
                          <Input value={pmtSeal} onChange={e => setPmtSeal(e.target.value)} placeholder="Optioneel, wordt later ingevuld" className="h-9 text-sm tabular-nums" style={{ fontFamily: "var(--font-display)" }} />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground block mb-1.5">PMT-keuze bepaald door klant</label>
                          <div className="flex items-center gap-3 h-[42px]">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={pmtByCustomer}
                              onClick={() => setPmtByCustomer(!pmtByCustomer)}
                              className={cn(
                                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                                pmtByCustomer ? "bg-[hsl(var(--gold))]" : "bg-[hsl(var(--border))]",
                              )}
                            >
                              <span className={cn(
                                "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
                                pmtByCustomer ? "translate-x-5" : "translate-x-0",
                              )} />
                            </button>
                            <span className="text-[0.8125rem] text-muted-foreground">{pmtByCustomer ? "Bevestigd door klant" : "Niet bevestigd"}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
            )}

            {/* ═��� Chapter VI · Info volgt van klant ══ */}
            <section className="card--luxe p-6 relative" style={{ background: "linear-gradient(135deg, hsl(var(--card)) 0%, hsl(45 60% 96%) 100%)" }}>
              <span className="card-chapter">VI</span>
              <div className="mb-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))] mb-1" style={{ fontFamily: "var(--font-display)" }}>
                  06 · Info volgt nog
                </div>
                <h3 className="section-title">Info volgt nog van klant <span className="text-[11px] font-normal text-muted-foreground">(optioneel, blokkeert inplannen niet)</span></h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Aangevinkte velden komen op de rappellijst. T-4u vóór pickup stuurt het systeem een herinnering, T-1u escalatie naar planner.
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-2">
                {TRACKABLE_FIELDS.map(f => (
                  <label key={f.name} className="flex items-center gap-2 text-xs cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={!!infoFollows[f.name]}
                      onChange={() => toggleInfoFollow(f.name)}
                      className="h-3.5 w-3.5 rounded border-border accent-amber-600"
                    />
                    <span>{f.label}</span>
                  </label>
                ))}
              </div>
              {Object.values(infoFollows).some(Boolean) && (
                <div className="mt-4 pt-4 border-t border-amber-200/60 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] text-muted-foreground font-medium block mb-1">Contactpersoon die levert</label>
                    <Input
                      value={infoContactName}
                      onChange={e => setInfoContactName(e.target.value)}
                      placeholder="Naam"
                      className="h-9 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground font-medium block mb-1">E-mail voor herinneringen</label>
                    <Input
                      type="email"
                      value={infoContactEmail}
                      onChange={e => setInfoContactEmail(e.target.value)}
                      placeholder="klant@voorbeeld.nl"
                      className="h-9 text-xs"
                    />
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {mainTab === "financieel" && (
          <div className="max-w-[1320px] mx-auto px-6 pt-4 pb-8 space-y-5">

            {/* ══ Chapter I · Tariefstructuur ══ */}
            <section className="card--luxe p-6 relative">
              <span className="card-chapter">I</span>
              <div className="mb-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))] mb-1" style={{ fontFamily: "var(--font-display)" }}>
                  01 · Tariefstructuur
                </div>
                <h3 className="section-title">Hoe wordt deze rit berekend</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Basistarieven volgen de Royalty Cargo tariefmatrix. Kilometers worden automatisch afgerond naar boven op 5.
                </p>
              </div>

              {pricingMode === "standard" && (
                <div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-x-5 gap-y-4">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1">Voertuigtype <span className="text-red-600">*</span></label>
                      <Select value={kmVehicle} onValueChange={v => { setKmVehicle(v as VehicleKey); setVehicleManual(true); }}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(VEHICLE_MATRIX) as VehicleKey[]).map(k => (
                            <SelectItem key={k} value={k}>{k}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {!vehicleManual && autoVehicleResult && (
                        <span className="text-[10px] text-[hsl(var(--gold-deep))] tracking-wider mt-0.5 block">
                          Automatisch geselecteerd op basis van lading
                        </span>
                      )}
                      {!vehicleManual && autoVehicleResult?.forced && (
                        <span className="text-[10px] text-amber-700 tracking-wider mt-0.5 block">
                          Voertuig opgeschaald vanwege laadklep-vereiste
                        </span>
                      )}
                      {vehicleManual && autoVehicleResult && (
                        <button
                          type="button"
                          onClick={() => setVehicleManual(false)}
                          className="text-[10px] text-muted-foreground hover:text-foreground underline mt-0.5 block"
                        >
                          Terug naar automatische selectie
                        </button>
                      )}
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1">Afstand (km) <span className="text-red-600">*</span></label>
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          value={kmAfstand}
                          onChange={e => setKmAfstand(e.target.value)}
                          className="h-9 text-sm tabular-nums"
                          placeholder="0"
                        />
                        <span className="text-[11px] text-[hsl(var(--gold-deep))] font-semibold tracking-wider whitespace-nowrap">
                          → {pricing.rounded}
                        </span>
                      </div>
                      <span className="text-[10px] text-[hsl(var(--gold-deep))] tracking-wider mt-0.5 block">afronding op 5 omhoog</span>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1">Dieseltoeslag</label>
                      <div className="inline-flex rounded-md border border-border overflow-hidden h-9">
                        <button
                          type="button"
                          onClick={() => setDieselInclusief(true)}
                          className={cn(
                            "px-3 text-xs font-medium transition-colors",
                            dieselInclusief ? "bg-[hsl(var(--gold-soft))] text-[hsl(var(--gold-deep))]" : "bg-background text-muted-foreground hover:text-foreground",
                          )}
                        >Incl. (+30%)</button>
                        <button
                          type="button"
                          onClick={() => setDieselInclusief(false)}
                          className={cn(
                            "px-3 text-xs font-medium transition-colors border-l border-border",
                            !dieselInclusief ? "bg-[hsl(var(--gold-soft))] text-[hsl(var(--gold-deep))]" : "bg-background text-muted-foreground hover:text-foreground",
                          )}
                        >Excl.</button>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1">Screening / docs</label>
                      <div className="flex items-center gap-2.5 h-9">
                        <label className="toggle">
                          <input type="checkbox" checked={screeningIncl} onChange={e => setScreeningIncl(e.target.checked)} />
                          <span></span>
                        </label>
                        <span className="text-xs text-muted-foreground">
                          Incl. (€ {VEHICLE_MATRIX[kmVehicle].screening.toFixed(2).replace(".", ",")})
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Live tariefberekening */}
                  <div
                    className="mt-6 flex items-center gap-4 p-4 rounded-xl"
                    style={{
                      background: "linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--gold-soft) / 0.35) 100%)",
                      border: "1px solid hsl(var(--gold) / 0.25)",
                      boxShadow: "inset 0 1px 0 hsl(0 0% 100%)",
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--gold-deep))]">Tarief {kmVehicle}</div>
                      <div className="text-xs text-muted-foreground mt-1 tabular-nums">
                        <span className="text-foreground">{pricing.rounded} km</span> ×{" "}
                        <span className="text-foreground">€ {pricing.perKm.toFixed(4).replace(".", ",")} / km</span>{" "}
                        <span className="opacity-60">(€ {pricing.matrixTariff.toFixed(2).replace(".", ",")} ÷ {KM_BASIS} km basis)</span>
                        {pricing.screeningFee > 0 && <> + € {pricing.screeningFee.toFixed(2).replace(".", ",")} screening</>}
                      </div>
                    </div>
                    <span
                      className="text-2xl font-semibold tabular-nums text-[hsl(var(--gold-deep))]"
                      style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.02em" }}
                    >
                      € {pricing.total.toFixed(2).replace(".", ",")}
                    </span>
                  </div>

                  {pricing.minApplied && pricing.km > 0 && (
                    <div className="mt-3 p-3 rounded-lg text-xs" style={{ background: "hsl(38 92% 95%)", border: "1px solid hsl(38 70% 80%)", color: "hsl(30 60% 28%)" }}>
                      <strong>Minimum toegepast</strong> · Berekende prijs (€ {pricing.calcRaw.toFixed(2).replace(".", ",")}) ligt onder het minimumtarief voor {kmVehicle} (€ {pricing.min.toFixed(2).replace(".", ",")}).
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setPricingMode("override")}
                    className="mt-4 px-3.5 py-2 text-xs text-muted-foreground hover:text-[hsl(var(--gold-deep))] inline-flex items-center gap-2 rounded-md transition-colors"
                    style={{ border: "1px dashed hsl(var(--border))" }}
                  >
                    Afwijkend tarief gebruiken (Schiphol-regio, maatwerk, spoed)
                  </button>
                </div>
              )}

              {pricingMode === "override" && (
                <div>
                  <div
                    className="callout--luxe mb-5"
                    style={{
                      background: "linear-gradient(135deg, hsl(var(--card)) 0%, hsl(38 92% 95%) 100%)",
                      borderColor: "hsl(38 70% 80%)",
                    }}
                  >
                    <div className="flex-1">
                      <div className="callout--luxe__title" style={{ color: "hsl(30 60% 28%)" }}>Afwijkend tarief actief</div>
                      <div className="callout--luxe__body">Standaard km-berekening is overschreven. Vul handmatig in.</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-x-5 gap-y-4">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1">Handmatig tarief <span className="text-red-600">*</span></label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">€</span>
                        <Input
                          type="number"
                          step="0.01"
                          value={overrideBedrag}
                          onChange={e => setOverrideBedrag(e.target.value)}
                          placeholder="0,00"
                          className="h-9 text-sm pl-7 tabular-nums font-medium"
                        />
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-xs font-medium text-muted-foreground block mb-1">Reden afwijking</label>
                      <Input
                        value={overrideReden}
                        onChange={e => setOverrideReden(e.target.value)}
                        placeholder="Bv. Schiphol-regio, spoedrit, maatwerk-afspraak"
                        className="h-9 text-sm"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPricingMode("standard")}
                    className="mt-4 px-3.5 py-2 text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-2 rounded-md transition-colors"
                    style={{ border: "1px dashed hsl(var(--border))" }}
                  >
                    ← Terug naar standaard km-berekening
                  </button>
                </div>
              )}
            </section>

            {/* ══ Chapter II · Toeslagen ══ */}
            <section className="card--luxe p-6 relative">
              <span className="card-chapter">II</span>
              <div className="mb-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))] mb-1" style={{ fontFamily: "var(--font-display)" }}>
                  02 · Toeslagen
                </div>
                <h3 className="section-title">Percentage- en vaste toeslagen</h3>
                <p className="text-xs text-muted-foreground mt-1">Worden automatisch toegepast op het basistarief. Niet-cumulatief tenzij aangegeven.</p>
              </div>

              {/* Tijdgebonden percentage-toeslagen */}
              <div className="mb-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-3">Tijdgebonden toeslagen</div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                  {PERCENTAGE_TOESLAGEN.map(t => (
                    <label
                      key={t.key}
                      className={cn(
                        "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                        activeToeslagen[t.key]
                          ? "border-[hsl(var(--gold)/0.5)] bg-[hsl(var(--gold-soft)/0.5)]"
                          : "border-border hover:border-[hsl(var(--gold)/0.3)]",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={!!activeToeslagen[t.key]}
                        onChange={e => setActiveToeslagen(prev => ({ ...prev, [t.key]: e.target.checked }))}
                        className="h-3.5 w-3.5 rounded border-border accent-amber-600 mt-0.5"
                      />
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-medium">{t.label}</span>
                        <span className="text-sm font-semibold text-[hsl(var(--gold-deep))]" style={{ fontFamily: "var(--font-display)" }}>+{t.percentage}%</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Vaste toeslagen */}
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-3">Vaste toeslagen</div>
                <div className="overflow-x-auto rounded-lg border border-border/60">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/30 border-b border-border/60">
                        <th className="px-3 py-2 text-left font-semibold">Omschrijving</th>
                        <th className="px-3 py-2 text-center font-semibold w-[110px]">Aantal</th>
                        <th className="px-3 py-2 text-right font-semibold w-[130px]">Tarief</th>
                        <th className="px-3 py-2 text-right font-semibold w-[140px]">Subtotaal</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-border/40">
                        <td className="px-3 py-2">Wachturen</td>
                        <td className="px-3 py-2 text-center">
                          <Input
                            type="number"
                            min={0}
                            value={wachturenAantal || ""}
                            onChange={e => setWachturenAantal(parseInt(e.target.value) || 0)}
                            className="h-8 w-[72px] mx-auto text-center text-xs tabular-nums"
                          />
                        </td>
                        <td className="px-3 py-2 text-right text-muted-foreground tabular-nums" style={{ fontFamily: "var(--font-display)" }}>€ 52,50 / u</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium" style={{ fontFamily: "var(--font-display)" }}>€ {pricing.wachturenBedrag.toFixed(2).replace(".", ",")}</td>
                      </tr>
                      <tr className="border-b border-border/40">
                        <td className="px-3 py-2">Extra stops</td>
                        <td className="px-3 py-2 text-center">
                          <Input
                            type="number"
                            min={0}
                            value={extraStopsAantal || ""}
                            onChange={e => setExtraStopsAantal(parseInt(e.target.value) || 0)}
                            className="h-8 w-[72px] mx-auto text-center text-xs tabular-nums"
                          />
                        </td>
                        <td className="px-3 py-2 text-right text-muted-foreground tabular-nums" style={{ fontFamily: "var(--font-display)" }}>€ 45,00</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium" style={{ fontFamily: "var(--font-display)" }}>€ {pricing.extraStopsBedrag.toFixed(2).replace(".", ",")}</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2">Tolheffing / andere kosten</td>
                        <td className="px-3 py-2 text-center text-muted-foreground">—</td>
                        <td className="px-3 py-2 text-right">
                          <div className="inline-flex items-center gap-1 justify-end">
                            <span className="text-muted-foreground">€</span>
                            <Input
                              type="number"
                              step="0.01"
                              value={tolBedrag}
                              onChange={e => setTolBedrag(e.target.value)}
                              placeholder="0,00"
                              className="h-8 w-[90px] text-right text-xs tabular-nums"
                            />
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium" style={{ fontFamily: "var(--font-display)" }}>€ {pricing.tolBedragNum.toFixed(2).replace(".", ",")}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* ══ Chapter III · Totaaloverzicht ══ */}
            <section className="card--luxe p-6 relative">
              <span className="card-chapter">III</span>
              <div className="mb-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))] mb-1" style={{ fontFamily: "var(--font-display)" }}>
                  03 · Totaaloverzicht
                </div>
                <h3 className="section-title">Berekend totaal</h3>
                <p className="text-xs text-muted-foreground mt-1">Alle bedragen exclusief BTW tenzij anders aangegeven.</p>
              </div>

              <div className="max-w-[560px] ml-auto tabular-nums space-y-3">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-muted-foreground">Basistarief ({pricing.rounded} km × € {pricing.perKm.toFixed(4).replace(".", ",")})</span>
                  <span className="text-sm font-medium" style={{ fontFamily: "var(--font-display)" }}>€ {pricing.base.toFixed(2).replace(".", ",")}</span>
                </div>
                {pricing.screeningFee > 0 && (
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-muted-foreground">Screening / docs</span>
                    <span className="text-sm font-medium" style={{ fontFamily: "var(--font-display)" }}>€ {pricing.screeningFee.toFixed(2).replace(".", ",")}</span>
                  </div>
                )}
                {pricing.percToeslagItems.map(t => (
                  <div key={t.label} className="flex justify-between items-baseline">
                    <span className="text-xs text-muted-foreground">{t.label} (+{t.percentage}%)</span>
                    <span className="text-sm font-medium" style={{ fontFamily: "var(--font-display)" }}>€ {t.amount.toFixed(2).replace(".", ",")}</span>
                  </div>
                ))}
                {pricing.wachturenBedrag > 0 && (
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-muted-foreground">Wachturen ({wachturenAantal} × € 52,50)</span>
                    <span className="text-sm font-medium" style={{ fontFamily: "var(--font-display)" }}>€ {pricing.wachturenBedrag.toFixed(2).replace(".", ",")}</span>
                  </div>
                )}
                {pricing.extraStopsBedrag > 0 && (
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-muted-foreground">Extra stops ({extraStopsAantal} × € 45,00)</span>
                    <span className="text-sm font-medium" style={{ fontFamily: "var(--font-display)" }}>€ {pricing.extraStopsBedrag.toFixed(2).replace(".", ",")}</span>
                  </div>
                )}
                {pricing.tolBedragNum > 0 && (
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-muted-foreground">Tolheffing / andere kosten</span>
                    <span className="text-sm font-medium" style={{ fontFamily: "var(--font-display)" }}>€ {pricing.tolBedragNum.toFixed(2).replace(".", ",")}</span>
                  </div>
                )}

                <div className="pt-3 mt-3" style={{ borderTop: "1px solid hsl(var(--gold) / 0.3)" }}>
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>Subtotaal excl. BTW</span>
                    <span
                      className="text-2xl font-semibold text-[hsl(var(--gold-deep))]"
                      style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.02em" }}
                    >
                      € {pricing.total.toFixed(2).replace(".", ",")}
                    </span>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {mainTab === "vrachtdossier" && (
          <div className="max-w-[1320px] mx-auto px-6 pt-4 pb-8 space-y-5">
            <section className="card--luxe p-6 relative">
              <span className="card-chapter">I</span>
              <div className="mb-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))] mb-1" style={{ fontFamily: "var(--font-display)" }}>
                  01 · Vrachtoverzicht
                </div>
                <h3 className="section-title">Samenvatting van deze order</h3>
                <p className="text-xs text-muted-foreground mt-1">Read-only preview van de ingevoerde vracht- en ladingregels.</p>
              </div>

              {freightLines.filter(l => l.locatie).length === 0 && cargoRows.every(r => !r.aantal && !r.gewicht) ? (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  Geen vrachtgegevens ingevoerd. Ga naar Algemeen om vracht- en ladingregels toe te voegen.
                </p>
              ) : (
                <div className="space-y-5">
                  {freightLines.filter(l => l.locatie).length > 0 && (
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-2">Vrachtplanning</div>
                      <div className="overflow-x-auto rounded-lg border border-border/60">
                        <table className="w-full text-xs min-w-[560px]">
                          <thead>
                            <tr className="bg-muted/30 border-b border-border/60">
                              <th className="px-3 py-2 text-left font-semibold">Activiteit</th>
                              <th className="px-3 py-2 text-left font-semibold">Locatie</th>
                              <th className="px-3 py-2 text-left font-semibold">Datum</th>
                              <th className="px-3 py-2 text-left font-semibold">Tijd</th>
                              <th className="px-3 py-2 text-left font-semibold">Referentie</th>
                            </tr>
                          </thead>
                          <tbody>
                            {freightLines.filter(l => l.locatie).map(l => (
                              <tr key={l.id} className="border-b border-border/40">
                                <td className="px-3 py-2">{l.activiteit}</td>
                                <td className="px-3 py-2">{l.locatie}</td>
                                <td className="px-3 py-2">{l.datum}</td>
                                <td className="px-3 py-2">{[l.tijd, l.tijdTot].filter(Boolean).join(" → ")}</td>
                                <td className="px-3 py-2">{l.referentie}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {cargoRows.some(r => r.aantal || r.gewicht) && (
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-2">Lading</div>
                      <div className="overflow-x-auto rounded-lg border border-border/60">
                        <table className="w-full text-xs min-w-[560px]">
                          <thead>
                            <tr className="bg-muted/30 border-b border-border/60">
                              <th className="px-3 py-2 text-left font-semibold">Aantal</th>
                              <th className="px-3 py-2 text-left font-semibold">Eenheid</th>
                              <th className="px-3 py-2 text-left font-semibold">Gewicht</th>
                              <th className="px-3 py-2 text-left font-semibold">L × B × H</th>
                              <th className="px-3 py-2 text-left font-semibold">Omschrijving</th>
                            </tr>
                          </thead>
                          <tbody>
                            {cargoRows.filter(r => r.aantal || r.gewicht).map(r => (
                              <tr key={r.id} className="border-b border-border/40">
                                <td className="px-3 py-2 tabular-nums">{r.aantal}</td>
                                <td className="px-3 py-2">{r.eenheid}</td>
                                <td className="px-3 py-2 tabular-nums">{r.gewicht} kg</td>
                                <td className="px-3 py-2 tabular-nums">{[r.lengte, r.breedte, r.hoogte].filter(Boolean).join(" × ")}</td>
                                <td className="px-3 py-2">{r.omschrijving}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="card--luxe p-6 relative">
              <span className="card-chapter">II</span>
              <div className="mb-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))] mb-1" style={{ fontFamily: "var(--font-display)" }}>
                  02 · Bijlagen
                </div>
                <h3 className="section-title">Documenten &amp; scans</h3>
              </div>
              <p className="text-xs text-muted-foreground">Bijlagen worden beschikbaar na opslaan.</p>
            </section>
          </div>
        )}

      </div>
    </div>
  );
};

export default NewOrder;
