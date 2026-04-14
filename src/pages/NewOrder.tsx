import { useEffect, useState } from "react";
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

type MainTab = "algemeen" | "financieel" | "facturen" | "callbacks" | "vrachtdossier";
type BottomTab = "vrachmeen" | "additionele_diensten" | "overige_referenties";

interface FreightLine {
  id: string;
  activiteit: "Laden" | "Lossen";
  locatie: string;
  datum: string;
  tijd: string;
  referentie: string;
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

  // Financieel state
  const [tariefType, setTariefType] = useState("");
  const [bedrag, setBedrag] = useState("");
  const [toeslag, setToeslag] = useState("");

  // Freight lines
  const [freightLines, setFreightLines] = useState<FreightLine[]>([
    { id: "1", activiteit: "Laden", locatie: "", datum: "", tijd: "", referentie: "", opmerkingen: "" },
    { id: "2", activiteit: "Lossen", locatie: "", datum: "", tijd: "", referentie: "", opmerkingen: "" },
  ]);

  const addFreightLine = () => {
    setFreightLines(prev => [...prev, {
      id: crypto.randomUUID(), activiteit: "Lossen", locatie: "", datum: "", tijd: "", referentie: "", opmerkingen: "",
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

      const booking: BookingInput = {
        pickup_address: pickupLine?.locatie || null,
        delivery_address: deliveryLine?.locatie || null,
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
        notes: referentie || null,
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

      toast.success(
        legs.length > 1
          ? `Shipment aangemaakt met ${legs.length} legs (${legs.map((l) => l.leg_role).join(" + ")})`
          : "Order aangemaakt",
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
    { key: "algemeen", label: "ALGEMEEN" },
    { key: "financieel", label: "FINANCIEEL" },
    { key: "facturen", label: "FACTUREN" },
    { key: "callbacks", label: "CALLBACKS" },
    { key: "vrachtdossier", label: "VRACHTDOSSIER" },
  ];

  const bottomTabs: { key: BottomTab; label: string }[] = [
    { key: "vrachmeen", label: "VRACHMEEN" },
    { key: "additionele_diensten", label: "ADDITIONELE DIENSTEN" },
    { key: "overige_referenties", label: "OVERIGE REFERENTIES" },
  ];

  return (
    <div className="-m-6 min-h-[calc(100vh-3rem)] flex flex-col bg-muted/30">
      {/* ── Header bar ── */}
      <div className="bg-sidebar-background text-sidebar-foreground h-10 px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold tracking-wide">Nieuwe Order</span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button
            size="sm"
            onClick={() => handleSave(true)}
            disabled={saving}
            className="h-7 px-3 text-xs gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
          >
            <Save className="h-3 w-3" /> <span className="hidden sm:inline">Opslaan &</span> Sluiten
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleSave(false)}
            disabled={saving}
            className="h-7 px-3 text-xs gap-1.5 font-medium border-sidebar-border text-sidebar-foreground bg-sidebar-accent hover:bg-sidebar-accent/80"
          >
            <Save className="h-3 w-3" /> Opslaan
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate("/orders")}
            className="h-7 px-3 text-xs gap-1.5 font-medium border-sidebar-border text-sidebar-foreground bg-sidebar-accent hover:bg-sidebar-accent/80"
          >
            <X className="h-3 w-3" /> Annuleren
          </Button>
        </div>
      </div>

      {/* ── Secondary toolbar ── */}
      <div className="bg-card border-b border-border px-4 py-1.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <span className="text-xs text-muted-foreground">{todayFormatted}</span>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => handleSave(true)} className="h-7 px-2.5 text-xs gap-1 font-medium">
            <Check className="h-3 w-3" /> Goedkeuren
          </Button>
          <Button size="sm" variant="outline" onClick={() => window.print()} className="h-7 px-2.5 text-xs gap-1 font-medium">
            <Printer className="h-3 w-3" /> Afdrukken
          </Button>
          <Button size="sm" variant="outline" onClick={() => toast("PDF download wordt voorbereid...")} className="h-7 px-2.5 text-xs gap-1 font-medium">
            <Download className="h-3 w-3" /> Downloaden
          </Button>
          <Button size="sm" variant="outline" onClick={() => toast("E-mail functie wordt voorbereid...")} className="h-7 px-2.5 text-xs gap-1 font-medium">
            <Mail className="h-3 w-3" /> E-mail
          </Button>
        </div>
      </div>

      {/* ── Main tabs ── */}
      <div className="bg-card border-b border-border px-4 flex shrink-0 overflow-x-auto whitespace-nowrap">
        {mainTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setMainTab(tab.key)}
            className={cn(
              "px-4 py-2 text-xs font-bold tracking-wider transition-colors border-b-2 -mb-px shrink-0",
              mainTab === tab.key
                ? "text-foreground border-primary"
                : "text-muted-foreground border-transparent hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
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
          <div className="p-4 space-y-4">
            {/* ── Top 3-column grid ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Column 1: Algemene Ordergegevens */}
              <div className="bg-card border border-border rounded-lg p-4 space-y-3">
                <h3 className="text-xs font-bold text-foreground">Algemene Ordergegevens</h3>
                <div className="space-y-2">
                  <div>
                    <span className="text-xs text-muted-foreground font-medium">Klantgegevens</span>
                    <Input
                      value={clientName}
                      onChange={e => { setClientName(e.target.value); clearError("client_name"); }}
                      placeholder="Zoek klant of relatie..."
                      className={cn("h-8 text-xs mt-0.5", errors.client_name && "border-red-500")}
                    />
                    {errors.client_name && <span className="text-xs text-red-500">{errors.client_name}</span>}
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground font-medium">Contactpersoon</span>
                    <Select value={contactpersoon} onValueChange={setContactpersoon}>
                      <SelectTrigger className="h-8 text-xs mt-0.5"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent><SelectItem value="-">—</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Column 2: Orderdetails */}
              <div className="bg-card border border-border rounded-lg p-4 space-y-3">
                <h3 className="text-xs font-bold text-foreground">Orderdetails</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground font-medium w-20 shrink-0">Ordernummer:</span>
                    <span className="text-xs text-muted-foreground">[Auto-gen]</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground font-medium w-20 shrink-0">Orderdatum:</span>
                    <Input type="date" defaultValue={today} className="h-8 text-xs flex-1" />
                  </div>
                  <div className="text-xs text-muted-foreground ml-[calc(5rem+0.75rem)]">
                    {todayFormatted}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground font-medium w-20 shrink-0">Soort order:</span>
                    <Select>
                      <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nieuw">Nieuw</SelectItem>
                        <SelectItem value="retour">Retour</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Column 3: Referentie & Opmerkingen */}
              <div className="bg-card border border-border rounded-lg p-4 space-y-2">
                <h3 className="text-xs font-bold text-foreground">Referentie & Opmerkingen</h3>
                <Textarea
                  value={referentie}
                  onChange={e => setReferentie(e.target.value)}
                  placeholder="Bestelreferentie en opmerkingen voor planner..."
                  className="flex-1 min-h-[120px] text-xs resize-none"
                />
              </div>
            </div>

            {/* ── Transport row ── */}
            <div className="bg-card border border-border rounded-lg p-3 flex items-end gap-3 flex-wrap">
              <div className="space-y-0.5">
                <span className="text-xs text-muted-foreground font-medium">Transport type:</span>
                <Select value={transportType} onValueChange={setTransportType}>
                  <SelectTrigger className="h-8 text-xs w-32"><SelectValue placeholder="Selecter..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FTL">FTL</SelectItem>
                    <SelectItem value="LTL">LTL</SelectItem>
                    <SelectItem value="koel">Koel</SelectItem>
                    <SelectItem value="retour">Retour</SelectItem>
                    <SelectItem value="express">Express</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-0.5">
                <span className="text-xs text-muted-foreground font-medium">Afdeling:</span>
                <Select
                  value={afdeling}
                  onValueChange={(v) => { setAfdelingManual(true); setAfdeling(v); }}
                >
                  <SelectTrigger className="h-8 text-xs w-32"><SelectValue placeholder="Selecter..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OPS">Operations</SelectItem>
                    <SelectItem value="EXPORT">Export</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-0.5">
                <span className="text-xs text-muted-foreground font-medium">Voertuigtype:</span>
                <Select value={voertuigtype} onValueChange={setVoertuigtype}>
                  <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vrachtwagen">Vrachtwagen</SelectItem>
                    <SelectItem value="bestelbus">Bestelbus</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-0.5">
                <span className="text-xs text-muted-foreground font-medium">Chauffeur:</span>
                <Input value={chauffeur} onChange={e => setChauffeur(e.target.value)} className="h-8 text-xs w-36" />
              </div>
              <div className="space-y-0.5">
                <span className="text-xs text-muted-foreground font-medium">MRN doc:</span>
                <Input value={mrnDoc} onChange={e => setMrnDoc(e.target.value)} className="h-8 text-xs w-36" />
              </div>
            </div>

            {/* ── §22 Info volgt van klant ── */}
            <div className="bg-amber-50/40 border border-amber-200 rounded-lg p-3 space-y-2">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="space-y-0.5">
                  <h3 className="text-xs font-bold text-foreground">
                    Info volgt nog van klant <span className="text-[10px] font-normal text-muted-foreground">(optioneel — blokkeert inplannen niet)</span>
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Aangevinkte velden komen op de rappellijst. T-4u vóór pickup stuurt het systeem een herinnering; T-1u escalatie naar planner.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1">
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
                <div className="flex flex-wrap gap-2 pt-1 border-t border-amber-200">
                  <div className="space-y-0.5 flex-1 min-w-[180px]">
                    <span className="text-[11px] text-muted-foreground font-medium">Contactpersoon die levert:</span>
                    <Input
                      value={infoContactName}
                      onChange={e => setInfoContactName(e.target.value)}
                      placeholder="Naam"
                      className="h-7 text-xs"
                    />
                  </div>
                  <div className="space-y-0.5 flex-1 min-w-[200px]">
                    <span className="text-[11px] text-muted-foreground font-medium">E-mail voor herinneringen:</span>
                    <Input
                      type="email"
                      value={infoContactEmail}
                      onChange={e => setInfoContactEmail(e.target.value)}
                      placeholder="klant@voorbeeld.nl"
                      className="h-7 text-xs"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* ── Vrachtplanning ── */}
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-foreground">Vrachtplanning</h3>
              <div className="bg-card border border-border rounded-lg overflow-x-auto">
                {/* Table header */}
                <div className="grid grid-cols-[140px_1fr_180px_140px_140px_90px_40px] gap-px bg-muted/60 px-3 py-2 border-b border-border min-w-[780px]">
                  <span className="text-xs font-bold text-foreground">Type Activiteit</span>
                  <span className="text-xs font-bold text-foreground">Locatie/Adres</span>
                  <span className="text-xs font-bold text-foreground">Datum & Tijd</span>
                  <span className="text-xs font-bold text-foreground">Referentie</span>
                  <span className="text-xs font-bold text-foreground">Opmerkingen</span>
                  <span className="text-xs font-bold text-foreground">Afdeling</span>
                  <span />
                </div>
                {/* Rows */}
                {freightLines.map((line) => (
                  <div key={line.id} className="grid grid-cols-[140px_1fr_180px_140px_140px_90px_40px] gap-2 px-3 py-1.5 border-b border-border/50 items-center min-w-[780px]">
                    <Select value={line.activiteit} onValueChange={v => updateFreightLine(line.id, "activiteit", v)}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Laden">↓ Laden</SelectItem>
                        <SelectItem value="Lossen">↑ Lossen</SelectItem>
                      </SelectContent>
                    </Select>
                    <AddressAutocomplete
                      value={line.locatie}
                      onChange={v => {
                        updateFreightLine(line.id, "locatie", v);
                        if (line.activiteit === "Laden") clearError("pickup_address");
                        if (line.activiteit === "Lossen") clearError("delivery_address");
                      }}
                      className={cn(
                        "h-8 text-xs border-primary/40",
                        line.activiteit === "Laden" && errors.pickup_address && "border-red-500",
                        line.activiteit === "Lossen" && errors.delivery_address && "border-red-500"
                      )}
                    />
                    <div className="flex items-center gap-1">
                      <Input
                        type="datetime-local"
                        value={line.datum}
                        onChange={e => updateFreightLine(line.id, "datum", e.target.value)}
                        placeholder="Selecteer datum & tijd"
                        className="h-8 text-xs flex-1"
                      />
                      <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    </div>
                    <Input
                      value={line.referentie}
                      onChange={e => updateFreightLine(line.id, "referentie", e.target.value)}
                      className="h-8 text-xs"
                    />
                    <Input
                      value={line.opmerkingen}
                      onChange={e => updateFreightLine(line.id, "opmerkingen", e.target.value)}
                      className="h-8 text-xs"
                    />
                    <div className="flex items-center">
                      {afdeling && (
                        <span
                          className={cn(
                            "text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded border",
                            line.activiteit === "Laden"
                              ? "bg-blue-50 text-blue-800 border-blue-200"
                              : afdeling === "EXPORT"
                                ? "bg-amber-50 text-amber-800 border-amber-200"
                                : "bg-blue-50 text-blue-800 border-blue-200",
                          )}
                        >
                          {line.activiteit === "Laden" ? "OPS" : afdeling}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => removeFreightLine(line.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors p-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {/* Add row */}
                <div className="px-3 py-2">
                  <button
                    onClick={addFreightLine}
                    className="text-xs text-muted-foreground hover:text-foreground font-medium flex items-center gap-1 transition-colors"
                  >
                    <Plus className="h-3 w-3" /> Nieuwe Vrachtregel
                  </button>
                </div>
              </div>
            </div>

            {/* ── Tijdvensters ── */}
            <div className="bg-card border border-border rounded-lg p-3 flex items-end gap-6 flex-wrap">
              <div className="space-y-0.5">
                <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Ophaalvenster
                </span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="time"
                    value={pickupTimeFrom}
                    onChange={e => setPickupTimeFrom(e.target.value)}
                    className="h-8 text-xs rounded-md border border-input bg-background px-2 py-1 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                  />
                  <span className="text-xs text-muted-foreground">tot</span>
                  <input
                    type="time"
                    value={pickupTimeTo}
                    onChange={e => setPickupTimeTo(e.target.value)}
                    className="h-8 text-xs rounded-md border border-input bg-background px-2 py-1 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                  />
                </div>
              </div>
              <div className="space-y-0.5">
                <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Levervenster
                </span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="time"
                    value={deliveryTimeFrom}
                    onChange={e => setDeliveryTimeFrom(e.target.value)}
                    className="h-8 text-xs rounded-md border border-input bg-background px-2 py-1 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                  />
                  <span className="text-xs text-muted-foreground">tot</span>
                  <input
                    type="time"
                    value={deliveryTimeTo}
                    onChange={e => setDeliveryTimeTo(e.target.value)}
                    className="h-8 text-xs rounded-md border border-input bg-background px-2 py-1 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                  />
                </div>
              </div>
            </div>

            {/* ── Gedetailleerde Vrachtinvoer ── */}
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-foreground">Gedetailleerde Vrachtinvoer</h3>
              <div className="bg-card border border-border rounded-lg p-3 flex items-end gap-3 flex-wrap">
                <div className="space-y-0.5">
                  <span className="text-xs text-muted-foreground font-medium">Aantal eenheden</span>
                  <Input type="number" value={quantity} onChange={e => { setQuantity(e.target.value); clearError("quantity"); }} placeholder="" className={cn("h-8 text-xs w-24", errors.quantity && "border-red-500")} />
                  {errors.quantity && <span className="text-xs text-red-500">{errors.quantity}</span>}
                </div>
                <div className="space-y-0.5">
                  <span className="text-xs text-muted-foreground font-medium">Transporteenheid type</span>
                  <Select value={transportEenheid} onValueChange={v => { setTransportEenheid(v); clearError("unit"); }}>
                    <SelectTrigger className={cn("h-8 text-xs w-44", errors.unit && "border-red-500")}><SelectValue placeholder="Selecteer..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Pallets">Pallets</SelectItem>
                      <SelectItem value="Colli">Colli</SelectItem>
                      <SelectItem value="Box">Box</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.unit && <span className="text-xs text-red-500">{errors.unit}</span>}
                </div>
                <div className="space-y-0.5">
                  <span className="text-xs text-muted-foreground font-medium">Voertuigtype</span>
                  <Select>
                    <SelectTrigger className="h-8 text-xs w-32"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vrachtwagen">Vrachtwagen</SelectItem>
                      <SelectItem value="bestelbus">Bestelbus</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-0.5">
                  <span className="text-xs text-muted-foreground font-medium">Gewicht (kg)</span>
                  <Input type="number" value={weightKg} onChange={e => { setWeightKg(e.target.value); clearError("weight_kg"); }} className={cn("h-8 text-xs w-24", errors.weight_kg && "border-red-500")} />
                  {errors.weight_kg && <span className="text-xs text-red-500">{errors.weight_kg}</span>}
                </div>
                <div className="space-y-0.5">
                  <span className="text-xs text-muted-foreground font-medium">Afstand (km)</span>
                  <Input value={afstand} onChange={e => setAfstand(e.target.value)} className="h-8 text-xs w-24" />
                </div>
                <div className="space-y-0.5">
                  <span className="text-xs text-muted-foreground font-medium">Totale duur</span>
                  <Input value={totaleDuur} onChange={e => setTotaleDuur(e.target.value)} className="h-8 text-xs w-28" />
                </div>
                <div className="space-y-0.5">
                  <span className="text-xs text-muted-foreground font-medium">Afmetingen (LxBxH)</span>
                  <Input value={afmetingen} onChange={e => setAfmetingen(e.target.value)} placeholder="LxBxH" className="h-8 text-xs w-28" />
                </div>
                <Button
                  size="sm"
                  onClick={addToFreightSummary}
                  className="h-8 px-3 text-xs gap-1 bg-primary hover:bg-primary/90 text-primary-foreground font-medium shrink-0"
                >
                  <Plus className="h-3 w-3" /> Toevoegen aan Vrachtlijst
                </Button>
              </div>
            </div>

            {/* ── Overzicht Vrachtlijst ── */}
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-foreground">Overzicht Vrachtlijst</h3>
              <div className="bg-card border border-border rounded-lg overflow-x-auto">
                <table className="w-full text-xs min-w-[640px]">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      {["Aankomstdatum", "Aantal", "Bestemming", "Gewicht", "Laadreferentie", "Losreferentie", "Tijdslot"].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-bold text-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {freightSummary.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground text-xs">
                          Geen vrachtitems toegevoegd. Gebruik de bovenstaande velden om een item toe te voegen.
                        </td>
                      </tr>
                    ) : (
                      freightSummary.map((item) => (
                        <tr key={item.id} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="px-3 py-2 text-xs">{item.aankomstdatum}</td>
                          <td className="px-3 py-2 text-xs">{item.aantal}</td>
                          <td className="px-3 py-2 text-xs">{item.bestemming}</td>
                          <td className="px-3 py-2 text-xs">{item.gewicht}</td>
                          <td className="px-3 py-2 text-xs">{item.laadreferentie}</td>
                          <td className="px-3 py-2 text-xs">{item.losreferentie}</td>
                          <td className="px-3 py-2 text-xs flex items-center gap-1">
                            {item.tijdslot}
                            <button
                              onClick={() => removeFromFreightSummary(item.id)}
                              className="ml-auto text-muted-foreground hover:text-destructive transition-colors p-0.5"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Bottom tabs ── */}
            <div className="flex border-t border-border pt-2 mt-2 overflow-x-auto whitespace-nowrap">
              {bottomTabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setBottomTab(tab.key)}
                  className={cn(
                    "px-4 py-1.5 text-xs font-bold tracking-wider transition-colors shrink-0",
                    bottomTab === tab.key
                      ? "text-foreground border-b-2 border-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {bottomTab === "additionele_diensten" && (
              <p className="py-4 text-center text-xs text-muted-foreground">Geen additionele diensten geconfigureerd</p>
            )}
            {bottomTab === "overige_referenties" && (
              <p className="py-4 text-center text-xs text-muted-foreground">Geen overige referenties</p>
            )}
          </div>
        )}

        {mainTab === "financieel" && (
          <div className="p-4 space-y-4 max-w-xl">
            <div className="bg-card border border-border rounded-lg p-4 space-y-3">
              <h3 className="text-xs font-bold text-foreground">Tariefgegevens</h3>
              <div className="space-y-2">
                <div>
                  <span className="text-xs text-muted-foreground font-medium">Tarief type</span>
                  <Select value={tariefType} onValueChange={setTariefType}>
                    <SelectTrigger className="h-8 text-xs mt-0.5"><SelectValue placeholder="Selecteer tarief type..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="per_rit">Per rit</SelectItem>
                      <SelectItem value="per_pallet">Per pallet</SelectItem>
                      <SelectItem value="per_km">Per km</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground font-medium">Bedrag</span>
                  <Input
                    type="number"
                    step="0.01"
                    value={bedrag}
                    onChange={e => setBedrag(e.target.value)}
                    placeholder="0.00"
                    className="h-8 text-xs mt-0.5"
                  />
                </div>
                <div>
                  <span className="text-xs text-muted-foreground font-medium">Toeslag</span>
                  <Input
                    type="number"
                    step="0.01"
                    value={toeslag}
                    onChange={e => setToeslag(e.target.value)}
                    placeholder="0.00"
                    className="h-8 text-xs mt-0.5"
                  />
                </div>
                <div className="pt-2 border-t border-border">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground">Totaal</span>
                    <span className="text-sm font-bold text-foreground">
                      {((parseFloat(bedrag) || 0) + (parseFloat(toeslag) || 0)).toFixed(2)} EUR
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {mainTab === "facturen" && (
          <p className="py-16 text-center text-xs text-muted-foreground">
            Facturen worden beschikbaar nadat de order is opgeslagen en goedgekeurd.
          </p>
        )}

        {mainTab === "callbacks" && (
          <p className="py-16 text-center text-xs text-muted-foreground">
            Callbacks kunnen worden ingesteld nadat de order is opgeslagen.
          </p>
        )}

        {mainTab === "vrachtdossier" && (
          <div className="p-4 space-y-4">
            <div className="bg-card border border-border rounded-lg p-4 space-y-3">
              <h3 className="text-xs font-bold text-foreground">Vrachtoverzicht</h3>
              {freightLines.filter(l => l.locatie).length === 0 && freightSummary.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  Geen vrachtgegevens ingevoerd. Ga naar het tabblad Algemeen om vrachtregels toe te voegen.
                </p>
              ) : (
                <div className="space-y-3">
                  {/* Freight planning lines */}
                  {freightLines.filter(l => l.locatie).length > 0 && (
                    <div>
                      <span className="text-xs font-medium text-muted-foreground">Vrachtplanning</span>
                      <div className="mt-1 border border-border rounded overflow-x-auto">
                        <table className="w-full text-xs min-w-[480px]">
                          <thead>
                            <tr className="bg-muted/50 border-b border-border">
                              <th className="px-3 py-1.5 text-left font-bold">Activiteit</th>
                              <th className="px-3 py-1.5 text-left font-bold">Locatie</th>
                              <th className="px-3 py-1.5 text-left font-bold">Datum</th>
                              <th className="px-3 py-1.5 text-left font-bold">Referentie</th>
                            </tr>
                          </thead>
                          <tbody>
                            {freightLines.filter(l => l.locatie).map(line => (
                              <tr key={line.id} className="border-b border-border/50">
                                <td className="px-3 py-1.5">{line.activiteit}</td>
                                <td className="px-3 py-1.5">{line.locatie}</td>
                                <td className="px-3 py-1.5">{line.datum}</td>
                                <td className="px-3 py-1.5">{line.referentie}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  {/* Summary items */}
                  {freightSummary.length > 0 && (
                    <div>
                      <span className="text-xs font-medium text-muted-foreground">Vrachtlijst items</span>
                      <div className="mt-1 border border-border rounded overflow-x-auto">
                        <table className="w-full text-xs min-w-[480px]">
                          <thead>
                            <tr className="bg-muted/50 border-b border-border">
                              <th className="px-3 py-1.5 text-left font-bold">Aantal</th>
                              <th className="px-3 py-1.5 text-left font-bold">Bestemming</th>
                              <th className="px-3 py-1.5 text-left font-bold">Gewicht</th>
                              <th className="px-3 py-1.5 text-left font-bold">Datum</th>
                            </tr>
                          </thead>
                          <tbody>
                            {freightSummary.map(item => (
                              <tr key={item.id} className="border-b border-border/50">
                                <td className="px-3 py-1.5">{item.aantal}</td>
                                <td className="px-3 py-1.5">{item.bestemming}</td>
                                <td className="px-3 py-1.5">{item.gewicht}</td>
                                <td className="px-3 py-1.5">{item.aankomstdatum}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="bg-card border border-border rounded-lg p-4 space-y-3">
              <h3 className="text-xs font-bold text-foreground">Bijlagen</h3>
              <p className="text-xs text-muted-foreground">
                Bijlagen kunnen worden toegevoegd nadat de order is opgeslagen.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NewOrder;
