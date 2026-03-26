import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Save, X, Check, Printer, Download, Mail, Plus, Trash2, Clock } from "lucide-react";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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

const today = new Date().toISOString().split("T")[0];
const todayFormatted = new Date().toLocaleDateString("nl-NL", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

const NewOrder = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [mainTab, setMainTab] = useState<MainTab>("algemeen");
  const [bottomTab, setBottomTab] = useState<BottomTab>("vrachmeen");

  // Form state
  const [clientName, setClientName] = useState("");
  const [contactpersoon, setContactpersoon] = useState("");
  const [transportType, setTransportType] = useState("");
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

  // Freight lines
  const [freightLines, setFreightLines] = useState<FreightLine[]>([
    { id: "1", activiteit: "Laden", locatie: "", datum: "25 Maart 08:30", tijd: "", referentie: "", opmerkingen: "" },
    { id: "2", activiteit: "Lossen", locatie: "", datum: "25 Maart 14:30", tijd: "", referentie: "", opmerkingen: "" },
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

  const handleSave = async (andClose: boolean) => {
    if (!clientName.trim()) { toast.error("Vul minimaal een klantnaam in"); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from("orders").insert({
        client_name: clientName.trim(),
        transport_type: transportType || null,
        weight_kg: weightKg ? parseInt(weightKg) : null,
        quantity: quantity ? parseInt(quantity) : null,
        unit: transportEenheid || null,
        status: "DRAFT",
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success("Order aangemaakt");
      if (andClose) navigate("/orders");
    } catch (e: any) {
      toast.error(e.message || "Fout bij opslaan");
    } finally { setSaving(false); }
  };

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
          <span className="text-sm font-semibold tracking-wide">Transport order Nieuw</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            onClick={() => handleSave(true)}
            disabled={saving}
            className="h-7 px-3 text-[11px] gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
          >
            <Save className="h-3 w-3" /> Opslaan & Sluiten
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleSave(false)}
            disabled={saving}
            className="h-7 px-3 text-[11px] gap-1.5 font-medium border-sidebar-border text-sidebar-foreground bg-sidebar-accent hover:bg-sidebar-accent/80"
          >
            <Save className="h-3 w-3" /> Opslaan
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate("/orders")}
            className="h-7 px-3 text-[11px] gap-1.5 font-medium border-sidebar-border text-sidebar-foreground bg-sidebar-accent hover:bg-sidebar-accent/80"
          >
            <X className="h-3 w-3" /> Annuleren
          </Button>
        </div>
      </div>

      {/* ── Secondary toolbar ── */}
      <div className="bg-card border-b border-border px-4 py-1.5 flex items-center justify-between shrink-0">
        <span className="text-[11px] text-muted-foreground">{todayFormatted}</span>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" className="h-7 px-2.5 text-[11px] gap-1 font-medium">
            <Check className="h-3 w-3" /> Goedkeuren
          </Button>
          <Button size="sm" variant="outline" className="h-7 px-2.5 text-[11px] gap-1 font-medium">
            <Printer className="h-3 w-3" /> Afdrukken
          </Button>
          <Button size="sm" variant="outline" className="h-7 px-2.5 text-[11px] gap-1 font-medium">
            <Download className="h-3 w-3" /> Downloaden
          </Button>
          <Button size="sm" variant="outline" className="h-7 px-2.5 text-[11px] gap-1 font-medium">
            <Mail className="h-3 w-3" /> E-mail
          </Button>
        </div>
      </div>

      {/* ── Main tabs ── */}
      <div className="bg-card border-b border-border px-4 flex shrink-0">
        {mainTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setMainTab(tab.key)}
            className={cn(
              "px-4 py-2 text-[11px] font-bold tracking-wider transition-colors border-b-2 -mb-px",
              mainTab === tab.key
                ? "text-foreground border-primary"
                : "text-muted-foreground border-transparent hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto">
        {mainTab === "algemeen" && (
          <div className="p-4 space-y-4">
            {/* ── Top 3-column grid ── */}
            <div className="grid grid-cols-3 gap-4">
              {/* Column 1: Algemene Ordergegevens */}
              <div className="bg-card border border-border rounded-lg p-4 space-y-3">
                <h3 className="text-xs font-bold text-foreground">Algemene Ordergegevens</h3>
                <div className="space-y-2">
                  <div>
                    <span className="text-[10px] text-muted-foreground font-medium">Klantgegevens</span>
                    <Input
                      value={clientName}
                      onChange={e => setClientName(e.target.value)}
                      placeholder="Zoek klant of relatie..."
                      className="h-8 text-xs mt-0.5"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground font-medium">Contactpersoon</span>
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
                    <span className="text-[10px] text-muted-foreground font-medium w-20 shrink-0">Ordernummer:</span>
                    <span className="text-xs text-muted-foreground">[Auto-gen]</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-muted-foreground font-medium w-20 shrink-0">Orderdatum:</span>
                    <Input type="date" defaultValue={today} className="h-8 text-xs flex-1" />
                  </div>
                  <div className="text-[10px] text-muted-foreground ml-[calc(5rem+0.75rem)]">
                    {todayFormatted}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-muted-foreground font-medium w-20 shrink-0">Soort order:</span>
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
            <div className="bg-card border border-border rounded-lg p-3 flex items-end gap-3">
              <div className="space-y-0.5">
                <span className="text-[10px] text-muted-foreground font-medium">Transport type:</span>
                <Select value={transportType} onValueChange={setTransportType}>
                  <SelectTrigger className="h-8 text-xs w-32"><SelectValue placeholder="Selecter..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FTL">FTL</SelectItem>
                    <SelectItem value="LTL">LTL</SelectItem>
                    <SelectItem value="koel">Koel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-0.5">
                <span className="text-[10px] text-muted-foreground font-medium">Voertuigtype:</span>
                <Select value={voertuigtype} onValueChange={setVoertuigtype}>
                  <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vrachtwagen">Vrachtwagen</SelectItem>
                    <SelectItem value="bestelbus">Bestelbus</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-0.5">
                <span className="text-[10px] text-muted-foreground font-medium">Chauffeur:</span>
                <Input value={chauffeur} onChange={e => setChauffeur(e.target.value)} className="h-8 text-xs w-36" />
              </div>
              <div className="space-y-0.5">
                <span className="text-[10px] text-muted-foreground font-medium">MRN doc:</span>
                <Input value={mrnDoc} onChange={e => setMrnDoc(e.target.value)} className="h-8 text-xs w-36" />
              </div>
            </div>

            {/* ── Vrachtplanning ── */}
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-foreground">Vrachtplanning</h3>
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                {/* Table header */}
                <div className="grid grid-cols-[140px_1fr_180px_140px_140px_40px] gap-px bg-muted/60 px-3 py-2 border-b border-border">
                  <span className="text-[10px] font-bold text-foreground">Type Activiteit</span>
                  <span className="text-[10px] font-bold text-foreground">Locatie/Adres</span>
                  <span className="text-[10px] font-bold text-foreground">Datum & Tijd</span>
                  <span className="text-[10px] font-bold text-foreground">Referentie</span>
                  <span className="text-[10px] font-bold text-foreground">Opmerkingen</span>
                  <span />
                </div>
                {/* Rows */}
                {freightLines.map((line) => (
                  <div key={line.id} className="grid grid-cols-[140px_1fr_180px_140px_140px_40px] gap-2 px-3 py-1.5 border-b border-border/50 items-center">
                    <Select value={line.activiteit} onValueChange={v => updateFreightLine(line.id, "activiteit", v)}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Laden">↓ Laden</SelectItem>
                        <SelectItem value="Lossen">↑ Lossen</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      value={line.locatie}
                      onChange={e => updateFreightLine(line.id, "locatie", e.target.value)}
                      className="h-8 text-xs border-primary/40"
                    />
                    <div className="flex items-center gap-1">
                      <Input
                        value={line.datum}
                        onChange={e => updateFreightLine(line.id, "datum", e.target.value)}
                        placeholder="Datum & tijd"
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
                    className="text-[11px] text-muted-foreground hover:text-foreground font-medium flex items-center gap-1 transition-colors"
                  >
                    <Plus className="h-3 w-3" /> Nieuwe Vrachtregel
                  </button>
                </div>
              </div>
            </div>

            {/* ── Gedetailleerde Vrachtinvoer ── */}
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-foreground">Gedetailleerde Vrachtinvoer</h3>
              <div className="bg-card border border-border rounded-lg p-3 flex items-end gap-3 flex-wrap">
                <div className="space-y-0.5">
                  <span className="text-[10px] text-muted-foreground font-medium">Aantal eenheden</span>
                  <Input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="" className="h-8 text-xs w-24" />
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] text-muted-foreground font-medium">Transporteenheid type</span>
                  <Select value={transportEenheid} onValueChange={setTransportEenheid}>
                    <SelectTrigger className="h-8 text-xs w-44"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="europallet">Europallet</SelectItem>
                      <SelectItem value="blokpallet">Blokpallet</SelectItem>
                      <SelectItem value="colli">Colli</SelectItem>
                      <SelectItem value="container">Container</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] text-muted-foreground font-medium">Voertuigtype</span>
                  <Select>
                    <SelectTrigger className="h-8 text-xs w-32"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vrachtwagen">Vrachtwagen</SelectItem>
                      <SelectItem value="bestelbus">Bestelbus</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] text-muted-foreground font-medium">Gewicht (kg)</span>
                  <Input type="number" value={weightKg} onChange={e => setWeightKg(e.target.value)} className="h-8 text-xs w-24" />
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] text-muted-foreground font-medium">Afstand (km)</span>
                  <Input value={afstand} onChange={e => setAfstand(e.target.value)} className="h-8 text-xs w-24" />
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] text-muted-foreground font-medium">Totale duur</span>
                  <Input value={totaleDuur} onChange={e => setTotaleDuur(e.target.value)} className="h-8 text-xs w-28" />
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] text-muted-foreground font-medium">Afmetingen (LxBxH)</span>
                  <Input value={afmetingen} onChange={e => setAfmetingen(e.target.value)} placeholder="LxBxH" className="h-8 text-xs w-28" />
                </div>
                <Button
                  size="sm"
                  onClick={addFreightLine}
                  className="h-8 px-3 text-[11px] gap-1 bg-primary hover:bg-primary/90 text-primary-foreground font-medium shrink-0"
                >
                  <Plus className="h-3 w-3" /> Toevoegen aan Vrachtlijst
                </Button>
              </div>
            </div>

            {/* ── Overzicht Vrachtlijst ── */}
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-foreground">Overzicht Vrachtlijst</h3>
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      {["Aankomstdatum", "Aantal", "Bestemming", "Gewicht", "Laadreferentie", "Losreferentie", "Tijdslot"].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-bold text-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground text-xs">
                        Geen vrachtitems toegevoegd. Gebruik de bovenstaande velden om een item toe te voegen.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Bottom tabs ── */}
            <div className="flex border-t border-border pt-2 mt-2">
              {bottomTabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setBottomTab(tab.key)}
                  className={cn(
                    "px-4 py-1.5 text-[10px] font-bold tracking-wider transition-colors",
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

        {mainTab !== "algemeen" && (
          <p className="py-16 text-center text-xs text-muted-foreground">
            {mainTab === "financieel" && "Financiële gegevens worden beschikbaar na opslaan"}
            {mainTab === "facturen" && "Geen facturen beschikbaar"}
            {mainTab === "callbacks" && "Geen callbacks geconfigureerd"}
            {mainTab === "vrachtdossier" && "Vrachtdossier wordt aangemaakt na opslaan"}
          </p>
        )}
      </div>
    </div>
  );
};

export default NewOrder;
