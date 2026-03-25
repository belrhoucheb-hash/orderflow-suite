import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Save, X, Check, Printer, Mail, ArrowLeft, Plus, Minus, GripVertical, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

type MainTab = "algemeen" | "financieel" | "facturen" | "callbacks" | "vrachtdossier";
type FreightTab = "vrachtregels" | "additionele_diensten" | "opmerkingen" | "referenties";

interface FreightLine {
  id: string;
  activiteit: "Laden" | "Lossen";
  transactietijd: string;
  relatie: string;
  contactpersoon: string;
  datum: string;
  timeslot: string;
  referentie: string;
  opmerkingen: string;
}

const NewOrder = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [mainTab, setMainTab] = useState<MainTab>("algemeen");
  const [freightTab, setFreightTab] = useState<FreightTab>("vrachtregels");

  // Form state
  const [clientName, setClientName] = useState("");
  const [pickupAddress, setPickupAddress] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [transportType, setTransportType] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("Europallet");
  const [dimensions, setDimensions] = useState("");
  const [invoiceRef, setInvoiceRef] = useState("");
  const [barcode, setBarcode] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [referentie, setReferentie] = useState("");

  // Freight lines
  const today = new Date().toISOString().split("T")[0];
  const [freightLines, setFreightLines] = useState<FreightLine[]>([
    { id: "1", activiteit: "Laden", transactietijd: "00:30", relatie: "", contactpersoon: "", datum: today, timeslot: "", referentie: "", opmerkingen: "" },
    { id: "2", activiteit: "Lossen", transactietijd: "00:30", relatie: "", contactpersoon: "", datum: today, timeslot: "", referentie: "", opmerkingen: "" },
  ]);

  const addFreightLine = () => {
    setFreightLines(prev => [...prev, {
      id: crypto.randomUUID(),
      activiteit: "Lossen",
      transactietijd: "00:30",
      relatie: "",
      contactpersoon: "",
      datum: today,
      timeslot: "",
      referentie: "",
      opmerkingen: "",
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
    if (!clientName.trim()) {
      toast.error("Vul minimaal een klantnaam in");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("orders").insert({
        client_name: clientName.trim(),
        pickup_address: pickupAddress.trim() || null,
        delivery_address: deliveryAddress.trim() || null,
        transport_type: transportType || null,
        weight_kg: weightKg ? parseInt(weightKg) : null,
        quantity: quantity ? parseInt(quantity) : null,
        unit: unit || null,
        dimensions: dimensions.trim() || null,
        invoice_ref: invoiceRef.trim() || null,
        barcode: barcode.trim() || null,
        internal_note: internalNote.trim() || null,
        status: "DRAFT",
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success("Order aangemaakt");
      if (andClose) navigate("/orders");
    } catch (e: any) {
      toast.error(e.message || "Fout bij opslaan");
    } finally {
      setSaving(false);
    }
  };

  const mainTabs: { key: MainTab; label: string }[] = [
    { key: "algemeen", label: "ALGEMEEN" },
    { key: "financieel", label: "FINANCIEEL" },
    { key: "facturen", label: "FACTUREN" },
    { key: "callbacks", label: "CALLBACKS" },
    { key: "vrachtdossier", label: "VRACHTDOSSIER" },
  ];

  const freightTabs: { key: FreightTab; label: string }[] = [
    { key: "vrachtregels", label: "VRACHTREGELS" },
    { key: "additionele_diensten", label: "ADDITIONELE DIENSTEN" },
    { key: "opmerkingen", label: "OPMERKINGEN VOOR PLANNER" },
    { key: "referenties", label: "OVERIGE REFERENTIES" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-0"
    >
      {/* Red Header Bar */}
      <div className="bg-primary text-primary-foreground px-5 py-2.5 rounded-t-xl flex items-center justify-between">
        <h1 className="text-base font-semibold">Transport order Nieuw</h1>
        <Button
          variant="ghost"
          size="icon"
          className="text-primary-foreground hover:bg-primary-foreground/10 h-7 w-7"
          onClick={() => navigate("/orders")}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Action Bar */}
      <div className="bg-card border-x border-border/40 px-5 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={() => handleSave(true)}
            disabled={saving}
          >
            <Save className="h-3.5 w-3.5" />
            Save & Close
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => handleSave(false)}
            disabled={saving}
          >
            <Save className="h-3.5 w-3.5" />
            Save only
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/5"
            onClick={() => navigate("/orders")}
          >
            <X className="h-3.5 w-3.5" />
            Annuleren
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5">
            <Check className="h-3.5 w-3.5" />
            Goedkeuren
          </Button>
          <Separator orientation="vertical" className="h-6 mx-1" />
          <button className="text-xs text-primary hover:underline flex items-center gap-1">
            <Printer className="h-3.5 w-3.5" /> Afdrukken & Downloaden
          </button>
          <button className="text-xs text-primary hover:underline flex items-center gap-1">
            <Mail className="h-3.5 w-3.5" /> E-mail versturen
          </button>
        </div>
      </div>

      {/* Main Tabs */}
      <div className="bg-card border-x border-border/40 px-5">
        <div className="flex border-b border-border/40 overflow-x-auto">
          {mainTabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setMainTab(tab.key)}
              className={cn(
                "px-4 py-2.5 text-[11px] font-semibold tracking-wider whitespace-nowrap transition-colors border-b-2 -mb-px",
                mainTab === tab.key
                  ? "text-foreground border-primary"
                  : "text-muted-foreground border-transparent hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="bg-card border border-border/40 rounded-b-xl p-5 space-y-5">
        {mainTab === "algemeen" && (
          <>
            {/* Top fields row */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-5">
              {/* Left column - main fields */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground">Ordernr.</Label>
                    <Input disabled placeholder="Auto" className="h-9 text-sm bg-muted/30" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground">Orderdatum</Label>
                    <div className="relative">
                      <Input
                        type="date"
                        defaultValue={today}
                        className="h-9 text-sm"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground">Naam</Label>
                    <Input
                      value={clientName}
                      onChange={e => setClientName(e.target.value)}
                      placeholder="Klantnaam"
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground">Soort</Label>
                    <Select defaultValue="nieuw">
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nieuw">Nieuw</SelectItem>
                        <SelectItem value="retour">Retour</SelectItem>
                        <SelectItem value="crossdock">Crossdock</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Relatie / Client */}
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-muted-foreground">Relatie (Klant)</Label>
                  <Input
                    value={clientName}
                    onChange={e => setClientName(e.target.value)}
                    placeholder="Selecteer of typ klantnaam..."
                    className="h-9 text-sm border-primary/50 focus:border-primary"
                  />
                </div>

                {/* Contactpersoon */}
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-muted-foreground">Contactpersoon</Label>
                  <Input placeholder="Contactpersoon" className="h-9 text-sm" />
                </div>

                {/* Extra fields row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground">Transport type</Label>
                    <Select value={transportType} onValueChange={setTransportType}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Selecteer..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FTL">FTL</SelectItem>
                        <SelectItem value="LTL">LTL</SelectItem>
                        <SelectItem value="express">Express</SelectItem>
                        <SelectItem value="koel">Koeltransport</SelectItem>
                        <SelectItem value="bulk">Bulk</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground">Chauffeurs</Label>
                    <Input placeholder="Chauffeur" className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground">Barcode</Label>
                    <Input value={barcode} onChange={e => setBarcode(e.target.value)} placeholder="Barcode" className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground">MRN doc</Label>
                    <Input placeholder="MRN doc" className="h-9 text-sm" />
                  </div>
                </div>
              </div>

              {/* Right column - Referentie */}
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Referentie</Label>
                <Textarea
                  value={referentie}
                  onChange={e => setReferentie(e.target.value)}
                  placeholder="Referentie / opmerkingen..."
                  className="min-h-[180px] text-sm resize-none"
                />
              </div>
            </div>

            <Separator />

            {/* Freight Tabs */}
            <div className="flex border-b border-border/40 overflow-x-auto">
              {freightTabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setFreightTab(tab.key)}
                  className={cn(
                    "px-4 py-2 text-[11px] font-semibold tracking-wider whitespace-nowrap transition-colors border-b-2 -mb-px",
                    freightTab === tab.key
                      ? "text-foreground border-primary"
                      : "text-muted-foreground border-transparent hover:text-foreground"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Freight content */}
            {freightTab === "vrachtregels" && (
              <div className="space-y-4">
                {/* Freight lines */}
                {freightLines.map((line) => (
                  <div key={line.id} className="flex items-start gap-2 p-3 bg-muted/20 rounded-lg border border-border/30">
                    <div className="flex flex-col items-center gap-1 pt-2">
                      <GripVertical className="h-4 w-4 text-muted-foreground/40 cursor-grab" />
                      <button
                        onClick={() => removeFreightLine(line.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={addFreightLine}
                        className="text-muted-foreground hover:text-primary transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 flex-1">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Activiteit</Label>
                        <Select
                          value={line.activiteit}
                          onValueChange={v => updateFreightLine(line.id, "activiteit", v)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Laden">Laden</SelectItem>
                            <SelectItem value="Lossen">Lossen</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Transactietijd</Label>
                        <Input
                          value={line.transactietijd}
                          onChange={e => updateFreightLine(line.id, "transactietijd", e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Relatie</Label>
                        <Input
                          value={line.relatie}
                          onChange={e => updateFreightLine(line.id, "relatie", e.target.value)}
                          placeholder="Relatie"
                          className="h-8 text-xs border-primary/40"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Contactpersoon</Label>
                        <Input
                          value={line.contactpersoon}
                          onChange={e => updateFreightLine(line.id, "contactpersoon", e.target.value)}
                          placeholder="Contact"
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Datum</Label>
                        <Input
                          type="date"
                          value={line.datum}
                          onChange={e => updateFreightLine(line.id, "datum", e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Timeslot</Label>
                        <Input
                          value={line.timeslot}
                          onChange={e => updateFreightLine(line.id, "timeslot", e.target.value)}
                          placeholder="Timeslot"
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Referentie</Label>
                        <Input
                          value={line.referentie}
                          onChange={e => updateFreightLine(line.id, "referentie", e.target.value)}
                          placeholder="Ref"
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Opmerkingen</Label>
                        <Input
                          value={line.opmerkingen}
                          onChange={e => updateFreightLine(line.id, "opmerkingen", e.target.value)}
                          placeholder="Opmerkingen"
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                  </div>
                ))}

                {/* Transport unit row */}
                <div className="p-3 bg-muted/10 rounded-lg border border-border/20">
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-9 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Aantal*</Label>
                      <Input
                        type="number"
                        value={quantity}
                        onChange={e => setQuantity(e.target.value)}
                        placeholder="0"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-[10px] text-muted-foreground">Transporteenheid / lading</Label>
                      <Select value={unit} onValueChange={setUnit}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Europallet">Europallet</SelectItem>
                          <SelectItem value="Blokpallet">Blokpallet</SelectItem>
                          <SelectItem value="Colli">Colli</SelectItem>
                          <SelectItem value="Doos">Doos</SelectItem>
                          <SelectItem value="Container">Container</SelectItem>
                          <SelectItem value="Losse lading">Losse lading</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Voertuigtype</Label>
                      <Select value={transportType} onValueChange={setTransportType}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="FTL">Vrachtwagen</SelectItem>
                          <SelectItem value="LTL">Bestelbus</SelectItem>
                          <SelectItem value="koel">Koelwagen</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Gewicht</Label>
                      <Input
                        type="number"
                        value={weightKg}
                        onChange={e => setWeightKg(e.target.value)}
                        placeholder="0"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Afstand</Label>
                      <Input placeholder="0" className="h-8 text-xs" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Duur</Label>
                      <Input placeholder="" className="h-8 text-xs" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Dimensies</Label>
                      <Input
                        value={dimensions}
                        onChange={e => setDimensions(e.target.value)}
                        placeholder="L×B×H"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        size="sm"
                        className="h-8 gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs w-full"
                        onClick={addFreightLine}
                      >
                        <Plus className="h-3 w-3" /> Toevoegen
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Summary table */}
                <div className="border border-border/30 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/30 border-b border-border/30">
                        <th className="px-3 py-2 text-left font-semibold text-foreground">Aankomstdatum</th>
                        <th className="px-3 py-2 text-left font-semibold text-foreground">Aantal</th>
                        <th className="px-3 py-2 text-left font-semibold text-foreground">Bestemming</th>
                        <th className="px-3 py-2 text-left font-semibold text-foreground">Gewicht</th>
                        <th className="px-3 py-2 text-left font-semibold text-foreground">Laadreferentie</th>
                        <th className="px-3 py-2 text-left font-semibold text-foreground">Losreferentie</th>
                        <th className="px-3 py-2 text-left font-semibold text-foreground">Tijdslot bestemming</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                          No Rows To Show
                        </td>
                      </tr>
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-border/30 bg-muted/10">
                        <td className="px-3 py-2" />
                        <td className="px-3 py-2 text-xs font-medium tabular-nums">{quantity ? `${quantity}` : "0,00"}</td>
                        <td className="px-3 py-2" />
                        <td className="px-3 py-2 text-xs font-medium tabular-nums">{weightKg ? `${weightKg}` : "0,00"}</td>
                        <td colSpan={3} className="px-3 py-2 text-right text-xs font-medium">
                          Total: {quantity || 0}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {freightTab === "opmerkingen" && (
              <div className="space-y-2">
                <Label className="text-[11px] text-muted-foreground">Opmerkingen voor planner</Label>
                <Textarea
                  value={internalNote}
                  onChange={e => setInternalNote(e.target.value)}
                  placeholder="Notities of opmerkingen voor de planner..."
                  className="min-h-[120px] text-sm resize-none"
                />
              </div>
            )}

            {freightTab === "additionele_diensten" && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Geen additionele diensten geconfigureerd
              </div>
            )}

            {freightTab === "referenties" && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-muted-foreground">Factuurreferentie</Label>
                  <Input value={invoiceRef} onChange={e => setInvoiceRef(e.target.value)} placeholder="INV-..." className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-muted-foreground">Ophaaladres</Label>
                  <Input value={pickupAddress} onChange={e => setPickupAddress(e.target.value)} placeholder="Ophaaladres" className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-muted-foreground">Afleveradres</Label>
                  <Input value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} placeholder="Afleveradres" className="h-9 text-sm" />
                </div>
              </div>
            )}
          </>
        )}

        {mainTab !== "algemeen" && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {mainTab === "financieel" && "Financiële gegevens worden beschikbaar na opslaan"}
            {mainTab === "facturen" && "Geen facturen beschikbaar"}
            {mainTab === "callbacks" && "Geen callbacks geconfigureerd"}
            {mainTab === "vrachtdossier" && "Vrachtdossier wordt aangemaakt na opslaan"}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default NewOrder;
