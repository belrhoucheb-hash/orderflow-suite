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

  // Financieel state — Royalty Cargo pricing model
  const [pricingMode, setPricingMode] = useState<"standard" | "override">("standard");
  const [kmVehicle, setKmVehicle] = useState<VehicleKey>("Caddy");
  const [kmAfstand, setKmAfstand] = useState("");
  const [dieselInclusief, setDieselInclusief] = useState(true);
  const [screeningIncl, setScreeningIncl] = useState(false);
  const [overrideBedrag, setOverrideBedrag] = useState("");
  const [overrideReden, setOverrideReden] = useState("");

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

  // Royalty Cargo pricing computation
  const pricing = useMemo(() => {
    const km = parseFloat(kmAfstand) || 0;
    const rounded = km > 0 ? Math.ceil(km / 5) * 5 : 0;
    const matrix = VEHICLE_MATRIX[kmVehicle];
    const matrixTariff = dieselInclusief ? matrix.inc : matrix.ex;
    const perKm = matrixTariff / KM_BASIS;
    const calcRaw = rounded * perKm;
    const screeningFee = screeningIncl ? matrix.screening : 0;
    const withScreening = calcRaw + screeningFee;
    const minApplied = calcRaw < matrix.min;
    const base = minApplied ? matrix.min : calcRaw;
    const total = base + screeningFee;
    return { km, rounded, matrixTariff, perKm, calcRaw, screeningFee, withScreening, minApplied, total, min: matrix.min };
  }, [kmAfstand, kmVehicle, dieselInclusief, screeningIncl]);

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
        pickup_time_window_start: pickupTimeFrom || null,
        pickup_time_window_end: pickupTimeTo || null,
        delivery_time_window_start: deliveryTimeFrom || null,
        delivery_time_window_end: deliveryTimeTo || null,
        notes: [klantReferentie && `Ref: ${klantReferentie}`, referentie].filter(Boolean).join(" — ") || null,
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
            <Button size="sm" variant="ghost" onClick={() => navigate("/orders")} className="h-9 px-3 text-xs gap-1.5">
              <X className="h-3.5 w-3.5" /> Annuleren
            </Button>
            <Button size="sm" variant="outline" onClick={() => window.print()} className="h-9 px-3 text-xs gap-1.5">
              <Printer className="h-3.5 w-3.5" /> Afdrukken
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleSave(false)} disabled={saving} className="h-9 px-3 text-xs gap-1.5">
              <Save className="h-3.5 w-3.5" /> Opslaan
            </Button>
            <Button
              size="sm"
              onClick={() => handleSave(true)}
              disabled={saving}
              className="h-9 px-4 text-xs gap-1.5 font-medium"
              style={{
                background: "linear-gradient(180deg, hsl(0 78% 48%), hsl(0 78% 38%))",
                boxShadow: "inset 0 1px 0 hsl(0 0% 100% / 0.2), 0 1px 2px hsl(var(--primary) / 0.35), 0 4px 12px -2px hsl(var(--primary) / 0.3)",
              }}
            >
              <Save className="h-3.5 w-3.5" /> Opslaan &amp; sluiten
            </Button>
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

      {/* ── Traject-preview banner ── */}
      {trajectPreview && trajectPreview.matched && trajectPreview.legs.length > 0 && (
        <div className="bg-card border-b border-border px-4 py-2">
          <div className={cn(
            "flex items-start gap-2 rounded-md border px-3 py-2 text-xs",
            trajectPreview.legs.length > 1
              ? "border-amber-300 bg-amber-50 text-amber-900"
              : "border-blue-300 bg-blue-50 text-blue-900",
          )}>
            <Route className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="flex-1 space-y-1">
              <div className="font-semibold flex items-center gap-2">
                <span>
                  {trajectPreview.legs.length > 1
                    ? `Deze boeking wordt gesplitst in ${trajectPreview.legs.length} legs`
                    : `Traject: ${trajectPreview.rule?.name ?? ""}`}
                </span>
                {afdeling && (
                  <span className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-white/70 border">
                    Afdeling: {afdeling}
                  </span>
                )}
              </div>
              <ul className="space-y-0.5">
                {trajectPreview.legs.map((leg) => (
                  <li key={leg.sequence} className="flex items-baseline gap-2">
                    <span className="font-medium">#{leg.sequence}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider bg-white/70 border">
                      {leg.department_code}
                    </span>
                    <span className="truncate">{leg.from || "?"} → {leg.to || "?"}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
      {trajectPreview && !trajectPreview.matched && trajectPreview.reason && (
        <div className="bg-card border-b border-border px-4 py-2">
          <div className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900">
            <Route className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{trajectPreview.reason}</span>
          </div>
        </div>
      )}
      {previewLoading && !trajectPreview && (
        <div className="bg-card border-b border-border px-4 py-1 text-xs text-muted-foreground">
          Traject-preview wordt berekend…
        </div>
      )}

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

            {/* ══ Chapter II · Transport ══ */}
            <section className="card--luxe p-6 relative">
              <span className="card-chapter">II</span>
              <div className="mb-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))] mb-1" style={{ fontFamily: "var(--font-display)" }}>
                  02 · Transport
                </div>
                <h3 className="section-title">Type en voertuig</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Afdeling wordt automatisch bepaald door het traject{afdeling ? ` (${afdeling})` : ""}. Chauffeur wordt later toegewezen.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
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
              </div>
            </section>

            {/* ══ Chapter III · Vrachtplanning ══ */}
            <section className="card--luxe p-6 relative">
              <span className="card-chapter">III</span>
              <div className="mb-4 flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))] mb-1" style={{ fontFamily: "var(--font-display)" }}>
                    03 · Vrachtplanning
                  </div>
                  <h3 className="section-title">Laad- en losstops</h3>
                  <p className="text-xs text-muted-foreground mt-1">Tijdvensters per regel, geen losse box meer.</p>
                </div>
                <Button size="sm" variant="ghost" onClick={addFreightLine} className="h-8 px-3 text-xs gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> Regel toevoegen
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[960px]">
                  <thead>
                    <tr className="border-b border-border/60 text-muted-foreground">
                      <th className="text-left font-semibold py-2 pr-2 w-[110px]">Activiteit <span className="text-red-600">*</span></th>
                      <th className="text-left font-semibold py-2 pr-2">Adres <span className="text-red-600">*</span></th>
                      <th className="text-left font-semibold py-2 pr-2 w-[140px]">Datum <span className="text-red-600">*</span></th>
                      <th className="text-left font-semibold py-2 pr-2 w-[180px]">Tijdvenster</th>
                      <th className="text-left font-semibold py-2 pr-2 w-[120px]">Referentie</th>
                      <th className="text-left font-semibold py-2 pr-2 w-[140px]">Contact op locatie</th>
                      <th className="text-left font-semibold py-2 pr-2 w-[160px]">Opmerking</th>
                      <th className="w-[36px]" />
                    </tr>
                  </thead>
                  <tbody>
                    {freightLines.map(line => (
                      <tr key={line.id} className="border-b border-border/40 align-top">
                        <td className="py-2 pr-2">
                          <Select value={line.activiteit} onValueChange={v => updateFreightLine(line.id, "activiteit", v)}>
                            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Laden">Laden</SelectItem>
                              <SelectItem value="Lossen">Lossen</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="py-2 pr-2">
                          <AddressAutocomplete
                            value={line.locatie}
                            onChange={v => {
                              updateFreightLine(line.id, "locatie", v);
                              if (line.activiteit === "Laden") clearError("pickup_address");
                              if (line.activiteit === "Lossen") clearError("delivery_address");
                            }}
                            className={cn(
                              "h-9 text-xs",
                              line.activiteit === "Laden" && errors.pickup_address && "border-red-500",
                              line.activiteit === "Lossen" && errors.delivery_address && "border-red-500",
                            )}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="date"
                            value={line.datum}
                            onChange={e => updateFreightLine(line.id, "datum", e.target.value)}
                            className="h-9 w-full text-xs rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <div className="flex items-center gap-1">
                            <input
                              type="time"
                              value={line.tijd}
                              onChange={e => updateFreightLine(line.id, "tijd", e.target.value)}
                              className="h-9 w-full text-xs rounded-md border border-input bg-background px-1.5 focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                            <span className="text-muted-foreground text-[10px]">→</span>
                            <input
                              type="time"
                              value={line.tijdTot}
                              onChange={e => updateFreightLine(line.id, "tijdTot", e.target.value)}
                              className="h-9 w-full text-xs rounded-md border border-input bg-background px-1.5 focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                          </div>
                        </td>
                        <td className="py-2 pr-2">
                          <Input
                            value={line.referentie}
                            onChange={e => updateFreightLine(line.id, "referentie", e.target.value)}
                            className="h-9 text-xs"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <Input
                            value={line.contactLocatie}
                            onChange={e => updateFreightLine(line.id, "contactLocatie", e.target.value)}
                            placeholder="Naam / telefoon"
                            className="h-9 text-xs"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <Input
                            value={line.opmerkingen}
                            onChange={e => updateFreightLine(line.id, "opmerkingen", e.target.value)}
                            placeholder="Bv. aanmelden receptie"
                            className="h-9 text-xs"
                          />
                        </td>
                        <td className="py-2">
                          <button
                            onClick={() => removeFreightLine(line.id)}
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
              <div className="pt-3">
                <button
                  onClick={addFreightLine}
                  className="text-xs text-[hsl(var(--gold-deep))] hover:text-foreground font-medium inline-flex items-center gap-1 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" /> Nieuwe vrachtregel
                </button>
              </div>
            </section>

            {/* ══ Chapter IV · Lading ══ */}
            <section className="card--luxe p-6 relative">
              <span className="card-chapter">IV</span>
              <div className="mb-4 flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))] mb-1" style={{ fontFamily: "var(--font-display)" }}>
                    04 · Lading
                  </div>
                  <h3 className="section-title">Wat wordt er vervoerd</h3>
                  <p className="text-xs text-muted-foreground mt-1">Voeg meerdere regels toe voor verschillende soorten lading.</p>
                </div>
                <Button size="sm" variant="ghost" onClick={addCargoRow} className="h-8 px-3 text-xs gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> Lading-regel
                </Button>
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

            {/* ══ Chapter V · Info volgt van klant ══ */}
            <section className="card--luxe p-6 relative" style={{ background: "linear-gradient(135deg, hsl(var(--card)) 0%, hsl(45 60% 96%) 100%)" }}>
              <span className="card-chapter">V</span>
              <div className="mb-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))] mb-1" style={{ fontFamily: "var(--font-display)" }}>
                  05 · Info volgt nog
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
                      <Select value={kmVehicle} onValueChange={v => setKmVehicle(v as VehicleKey)}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(VEHICLE_MATRIX) as VehicleKey[]).map(k => (
                            <SelectItem key={k} value={k}>{k}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
