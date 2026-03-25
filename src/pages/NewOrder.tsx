import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Save, X, Check, Printer, Mail, Plus, Minus, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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

const today = new Date().toISOString().split("T")[0];

const NewOrder = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [mainTab, setMainTab] = useState<MainTab>("algemeen");
  const [freightTab, setFreightTab] = useState<FreightTab>("vrachtregels");

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

  const [freightLines, setFreightLines] = useState<FreightLine[]>([
    { id: "1", activiteit: "Laden", transactietijd: "00:30", relatie: "", contactpersoon: "", datum: today, timeslot: "", referentie: "", opmerkingen: "" },
    { id: "2", activiteit: "Lossen", transactietijd: "00:30", relatie: "", contactpersoon: "", datum: today, timeslot: "", referentie: "", opmerkingen: "" },
  ]);

  const addFreightLine = () => {
    setFreightLines(prev => [...prev, {
      id: crypto.randomUUID(), activiteit: "Lossen", transactietijd: "00:30",
      relatie: "", contactpersoon: "", datum: today, timeslot: "", referentie: "", opmerkingen: "",
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
    } finally { setSaving(false); }
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

  // Tiny field wrapper to reduce repetition
  const Field = ({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) => (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide leading-none">{label}</span>
      {children}
    </div>
  );

  return (
    <div className="-m-6 min-h-[calc(100vh-3rem)]  flex flex-col">
      {/* ── Red title bar ── */}
      <div className="bg-primary text-primary-foreground h-9 px-4 flex items-center justify-between shrink-0">
        <span className="text-[13px] font-semibold tracking-wide">Transport order Nieuw</span>
        <button onClick={() => navigate("/orders")} className="hover:bg-primary-foreground/10 rounded p-0.5 transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* ── Toolbar ── */}
      <div className="bg-card border-b border-border/40 px-4 py-1.5 flex items-center gap-1.5 shrink-0 flex-wrap">
        {[
          { icon: Save, label: "Save & Close", primary: true, onClick: () => handleSave(true) },
          { icon: Save, label: "Save only", onClick: () => handleSave(false) },
          { icon: X, label: "Annuleren", destructive: true, onClick: () => navigate("/orders") },
          { icon: Check, label: "Goedkeuren" },
        ].map((btn, i) => (
          <Button
            key={i}
            size="sm"
            variant={btn.primary ? "default" : "outline"}
            disabled={saving}
            onClick={btn.onClick}
            className={cn(
              "h-7 px-2.5 text-[11px] gap-1 font-medium",
              btn.primary && "bg-primary hover:bg-primary/90 text-primary-foreground",
              btn.destructive && "text-destructive border-destructive/30 hover:bg-destructive/5",
            )}
          >
            <btn.icon className="h-3 w-3" />
            {btn.label}
          </Button>
        ))}

        <div className="w-px h-5 bg-border/60 mx-1" />

        <button className="text-[11px] text-primary hover:underline flex items-center gap-1">
          <Printer className="h-3 w-3" /> Afdrukken & Downloaden
        </button>
        <button className="text-[11px] text-primary hover:underline flex items-center gap-1 ml-2">
          <Mail className="h-3 w-3" /> E-mail versturen
        </button>

        {/* Right-aligned main tabs */}
        <div className="ml-auto flex">
          {mainTabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setMainTab(tab.key)}
              className={cn(
                "px-3 py-1.5 text-[10px] font-bold tracking-widest transition-colors",
                mainTab === tab.key
                  ? "text-foreground border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 bg-background overflow-y-auto">
        {mainTab === "algemeen" && (
          <div className="p-4 space-y-4">
            {/* ── Top form grid: mirroring FiLogic layout ── */}
            <div className="grid grid-cols-[1fr_280px] gap-4">
              {/* Left: fields */}
              <div className="space-y-3">
                {/* Row 1: Order meta */}
                <div className="flex gap-2">
                  <Field label="Ordernr." className="w-28">
                    <Input disabled placeholder="Auto" className="h-7 text-xs bg-muted/40 rounded-sm" />
                  </Field>
                  <Field label="Orderdatum" className="w-36">
                    <Input type="date" defaultValue={today} className="h-7 text-xs rounded-sm" />
                  </Field>
                  <Field label="Naam" className="flex-1">
                    <Input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Klantnaam" className="h-7 text-xs rounded-sm" />
                  </Field>
                  <Field label="Afdeling" className="w-24">
                    <Select><SelectTrigger className="h-7 text-xs rounded-sm"><SelectValue placeholder="—" /></SelectTrigger><SelectContent><SelectItem value="-">—</SelectItem></SelectContent></Select>
                  </Field>
                  <Field label="Soort" className="w-24">
                    <Select defaultValue="nieuw"><SelectTrigger className="h-7 text-xs rounded-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="nieuw">Nieuw</SelectItem><SelectItem value="retour">Retour</SelectItem></SelectContent></Select>
                  </Field>
                </div>

                {/* Row 2: Relatie (highlighted like FiLogic) */}
                <Field label="Relatie">
                  <Input
                    value={clientName}
                    onChange={e => setClientName(e.target.value)}
                    placeholder="Selecteer relatie..."
                    className="h-7 text-xs rounded-sm border-primary focus-visible:ring-primary/30"
                  />
                </Field>

                {/* Row 3: Contactpersoon */}
                <Field label="Contactpersoon">
                  <Input placeholder="Contactpersoon" className="h-7 text-xs rounded-sm" />
                </Field>

                {/* Row 4: Operations row */}
                <div className="flex gap-2">
                  <Field label="Operations" className="w-28">
                    <Input className="h-7 text-xs rounded-sm" />
                  </Field>
                  <Field label="Export" className="w-28">
                    <Input className="h-7 text-xs rounded-sm" />
                  </Field>
                  <Field label="Chauffeurs" className="w-28">
                    <Input className="h-7 text-xs rounded-sm" />
                  </Field>
                  <Field label="MRN doc:" className="flex-1">
                    <Input className="h-7 text-xs rounded-sm" />
                  </Field>
                </div>
              </div>

              {/* Right: Referentie box */}
              <Field label="Referentie">
                <Textarea
                  value={referentie}
                  onChange={e => setReferentie(e.target.value)}
                  placeholder="Referentie..."
                  className="flex-1 min-h-[140px] text-xs rounded-sm resize-none"
                />
              </Field>
            </div>

            {/* ── Freight sub-tabs ── */}
            <div className="flex border-b border-border/50 -mx-4 px-4">
              {freightTabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setFreightTab(tab.key)}
                  className={cn(
                    "px-3 py-1.5 text-[10px] font-bold tracking-widest whitespace-nowrap transition-colors border-b-2 -mb-px",
                    freightTab === tab.key
                      ? "text-foreground border-primary"
                      : "text-muted-foreground border-transparent hover:text-foreground"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* ── Vrachtregels ── */}
            {freightTab === "vrachtregels" && (
              <div className="space-y-3">
                {/* Freight lines */}
                {freightLines.map((line) => (
                  <div key={line.id} className="flex items-center gap-1 border border-border/30 rounded-sm bg-card p-1.5">
                    <div className="flex items-center gap-0.5 shrink-0">
                      <GripVertical className="h-3.5 w-3.5 text-muted-foreground/30 cursor-grab" />
                      <button onClick={() => removeFreightLine(line.id)} className="text-muted-foreground/50 hover:text-destructive p-0.5"><Minus className="h-3 w-3" /></button>
                      <button onClick={addFreightLine} className="text-muted-foreground/50 hover:text-primary p-0.5"><Plus className="h-3 w-3" /></button>
                    </div>
                    <div className="grid grid-cols-8 gap-1 flex-1">
                      <Field label="Activiteit">
                        <Select value={line.activiteit} onValueChange={v => updateFreightLine(line.id, "activiteit", v)}>
                          <SelectTrigger className="h-7 text-[11px] rounded-sm"><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="Laden">Laden</SelectItem><SelectItem value="Lossen">Lossen</SelectItem></SelectContent>
                        </Select>
                      </Field>
                      <Field label="Transactietijd">
                        <Input value={line.transactietijd} onChange={e => updateFreightLine(line.id, "transactietijd", e.target.value)} className="h-7 text-[11px] rounded-sm" />
                      </Field>
                      <Field label="Relatie">
                        <Input value={line.relatie} onChange={e => updateFreightLine(line.id, "relatie", e.target.value)} placeholder="Relatie" className="h-7 text-[11px] rounded-sm border-primary/40" />
                      </Field>
                      <Field label="Contactpersoon">
                        <Input value={line.contactpersoon} onChange={e => updateFreightLine(line.id, "contactpersoon", e.target.value)} className="h-7 text-[11px] rounded-sm" />
                      </Field>
                      <Field label="Datum">
                        <Input type="date" value={line.datum} onChange={e => updateFreightLine(line.id, "datum", e.target.value)} className="h-7 text-[11px] rounded-sm" />
                      </Field>
                      <Field label="Timeslot">
                        <Input value={line.timeslot} onChange={e => updateFreightLine(line.id, "timeslot", e.target.value)} className="h-7 text-[11px] rounded-sm" />
                      </Field>
                      <Field label="Referentie">
                        <Input value={line.referentie} onChange={e => updateFreightLine(line.id, "referentie", e.target.value)} className="h-7 text-[11px] rounded-sm" />
                      </Field>
                      <Field label="Opmerkingen">
                        <Input value={line.opmerkingen} onChange={e => updateFreightLine(line.id, "opmerkingen", e.target.value)} className="h-7 text-[11px] rounded-sm" />
                      </Field>
                    </div>
                  </div>
                ))}

                {/* Transport unit config row */}
                <div className="flex items-end gap-1 border border-border/20 rounded-sm bg-muted/20 p-1.5">
                  <Field label="Aantal*" className="w-16">
                    <Input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="0" className="h-7 text-[11px] rounded-sm" />
                  </Field>
                  <Field label="Transporteenheid / lading" className="w-40">
                    <Select value={unit} onValueChange={setUnit}>
                      <SelectTrigger className="h-7 text-[11px] rounded-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Europallet">Europallet</SelectItem>
                        <SelectItem value="Blokpallet">Blokpallet</SelectItem>
                        <SelectItem value="Colli">Colli</SelectItem>
                        <SelectItem value="Container">Container</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Voertuigtype" className="w-28">
                    <Select value={transportType} onValueChange={setTransportType}>
                      <SelectTrigger className="h-7 text-[11px] rounded-sm"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FTL">Vrachtwagen</SelectItem>
                        <SelectItem value="LTL">Bestelbus</SelectItem>
                        <SelectItem value="koel">Koelwagen</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  {[
                    { l: "Gewicht", v: weightKg, fn: setWeightKg },
                  ].map(f => (
                    <Field key={f.l} label={f.l} className="w-20">
                      <Input type="number" value={f.v} onChange={e => f.fn(e.target.value)} placeholder="0" className="h-7 text-[11px] rounded-sm" />
                    </Field>
                  ))}
                  <Field label="Afstand" className="w-16"><Input placeholder="0" className="h-7 text-[11px] rounded-sm" /></Field>
                  <Field label="Duur" className="w-16"><Input className="h-7 text-[11px] rounded-sm" /></Field>
                  <Field label="Opmerkin..." className="w-20"><Input className="h-7 text-[11px] rounded-sm" /></Field>
                  <Field label="Lengte" className="w-14"><Input placeholder="0" className="h-7 text-[11px] rounded-sm" /></Field>
                  <Field label="Breedte" className="w-14"><Input placeholder="0" className="h-7 text-[11px] rounded-sm" /></Field>
                  <Field label="Hoogte" className="w-14"><Input placeholder="0" className="h-7 text-[11px] rounded-sm" /></Field>
                  <Field label="Vlaggen" className="w-20"><Input className="h-7 text-[11px] rounded-sm" /></Field>
                  <Button
                    size="sm"
                    className="h-7 px-3 text-[11px] gap-1 bg-primary hover:bg-primary/90 text-primary-foreground shrink-0"
                    onClick={addFreightLine}
                  >
                    <Plus className="h-3 w-3" /> Toevoegen
                  </Button>
                </div>

                {/* Summary data grid */}
                <div className="border border-border/30 rounded-sm overflow-hidden">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="bg-muted/40">
                        {["Aankomstdatum", "Aantal", "Bestemming", "Gewicht", "Laadreferentie", "Losreferentie", "Tijdslot bestemming"].map(h => (
                          <th key={h} className="px-2 py-1.5 text-left font-bold text-foreground border-r border-border/20 last:border-r-0">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td colSpan={7} className="px-2 py-8 text-center text-muted-foreground text-xs">
                          No Rows To Show
                        </td>
                      </tr>
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-border/40 bg-muted/20">
                        <td className="px-2 py-1.5" />
                        <td className="px-2 py-1.5 font-medium tabular-nums">{quantity || "0,00"}</td>
                        <td className="px-2 py-1.5" />
                        <td className="px-2 py-1.5 font-medium tabular-nums">{weightKg || "0,00"}</td>
                        <td colSpan={3} className="px-2 py-1.5 text-right font-medium">Total: {quantity || 0}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {freightTab === "opmerkingen" && (
              <Field label="Opmerkingen voor planner" className="pt-2">
                <Textarea value={internalNote} onChange={e => setInternalNote(e.target.value)} placeholder="Notities..." className="min-h-[100px] text-xs resize-none rounded-sm" />
              </Field>
            )}

            {freightTab === "additionele_diensten" && (
              <p className="py-6 text-center text-xs text-muted-foreground">Geen additionele diensten geconfigureerd</p>
            )}

            {freightTab === "referenties" && (
              <div className="grid grid-cols-3 gap-3 pt-2">
                <Field label="Factuurreferentie"><Input value={invoiceRef} onChange={e => setInvoiceRef(e.target.value)} placeholder="INV-..." className="h-7 text-xs rounded-sm" /></Field>
                <Field label="Ophaaladres"><Input value={pickupAddress} onChange={e => setPickupAddress(e.target.value)} className="h-7 text-xs rounded-sm" /></Field>
                <Field label="Afleveradres"><Input value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} className="h-7 text-xs rounded-sm" /></Field>
              </div>
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
