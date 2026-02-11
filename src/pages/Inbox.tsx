import { useState } from "react";
import { Mail, Clock, Sparkles, Trash2, Plus, Search, ThermometerSnowflake, AlertTriangle, Truck, FileCheck, DatabaseZap } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface DraftEmail {
  id: string;
  draftId: string;
  client: string;
  subject: string;
  time: string;
  confidence: number;
  from: string;
  to: string;
  body: string;
  extracted: {
    transportType: string;
    pickupAddress: string;
    deliveryAddress: string;
    quantity: number;
    unit: string;
    weight: string;
    dimensions: string;
    requirements: string[];
    perUnit?: boolean;
  };
}

const initialDrafts: DraftEmail[] = [
  {
    id: "1",
    draftId: "DRAFT-1024",
    client: "Van Dijk Logistics",
    subject: "Ophalen europallets Breda → Schiphol",
    time: "09:14",
    confidence: 92,
    from: "m.vandijk@vandijklogistics.nl",
    to: "planning@royaltycargo.nl",
    body: "Hoi planner, graag 3 europallets ophalen bij Jansen in Breda, moet naar Schiphol voor vlucht KL882. Let op: ADR goederen! Gewicht is ca. 1200 kg, afmetingen 120x80x150 per pallet. Groeten, Marco",
    extracted: {
      transportType: "warehouse-air",
      pickupAddress: "Jansen BV, Industrieweg 12, 4811 AA Breda",
      deliveryAddress: "Schiphol Cargo, Anchoragelaan 48, 1118 LD Schiphol",
      quantity: 3,
      unit: "pallets",
      weight: "1200",
      dimensions: "120x80x150",
      requirements: ["adr"],
    },
  },
  {
    id: "2",
    draftId: "DRAFT-1025",
    client: "Rotterdam Fresh BV",
    subject: "Koeltransport Rotterdam → Venlo",
    time: "08:42",
    confidence: 78,
    from: "orders@rotterdamfresh.nl",
    to: "planning@royaltycargo.nl",
    body: "Beste, wij hebben een zending van 8 colli diepvriesproducten die van ons DC in Rotterdam naar Venlo moeten. Temperatuur moet onder -18°C blijven. Laadklep vereist. Graag morgen ophalen. Met vriendelijke groet, Lisa de Vries",
    extracted: {
      transportType: "direct",
      pickupAddress: "Rotterdam Fresh DC, Maasvlakteweg 90, 3199 KA Rotterdam",
      deliveryAddress: "Fresh Warehouse Venlo, Tradeport 120, 5928 RC Venlo",
      quantity: 8,
      unit: "colli",
      weight: "",
      dimensions: "",
      requirements: ["koeling", "laadklep"],
    },
  },
  {
    id: "3",
    draftId: "DRAFT-1026",
    client: "Amstel Export",
    subject: "Doos naar Duitsland - douane",
    time: "07:55",
    confidence: 61,
    from: "shipping@amstelexport.nl",
    to: "planning@royaltycargo.nl",
    body: "Hi, 1 doos met monsters naar klant in Düsseldorf. Moet via douane want het gaat om food samples. Gewicht 25 kg. Kan het vandaag nog weg? Dank, Ahmed",
    extracted: {
      transportType: "direct",
      pickupAddress: "Amstel Export, Herengracht 401, 1017 BP Amsterdam",
      deliveryAddress: "Düsseldorf, Duitsland",
      quantity: 1,
      unit: "box",
      weight: "25",
      dimensions: "",
      requirements: ["douane"],
    },
  },
];

const requirementOptions = [
  { id: "koeling", label: "Koeling", icon: ThermometerSnowflake },
  { id: "adr", label: "ADR", icon: AlertTriangle },
  { id: "laadklep", label: "Laadklep", icon: Truck },
  { id: "douane", label: "Douane", icon: FileCheck },
];

function ConfidenceBadge({ score }: { score: number }) {
  const isHigh = score >= 80;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border",
        isHigh
          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
          : "bg-amber-50 text-amber-700 border-amber-200"
      )}
    >
      <Sparkles className="h-3 w-3" />
      {score}% {isHigh ? "High" : "Low"}
    </span>
  );
}

export default function Inbox() {
  const [drafts, setDrafts] = useState<DraftEmail[]>(initialDrafts);
  const [selectedId, setSelectedId] = useState<string>(initialDrafts[0]?.id ?? "");
  const [formData, setFormData] = useState<Record<string, DraftEmail["extracted"]>>(() => {
    const map: Record<string, DraftEmail["extracted"]> = {};
    initialDrafts.forEach((d) => (map[d.id] = { ...d.extracted }));
    return map;
  });
  const [search, setSearch] = useState("");
  const { toast } = useToast();

  const selected = drafts.find((d) => d.id === selectedId);
  const form = selected ? formData[selected.id] : null;

  const updateField = (field: keyof DraftEmail["extracted"], value: any) => {
    if (!selected) return;
    setFormData((prev) => ({
      ...prev,
      [selected.id]: { ...prev[selected.id], [field]: value },
    }));
  };

  const toggleRequirement = (req: string) => {
    if (!form) return;
    const reqs = form.requirements.includes(req)
      ? form.requirements.filter((r) => r !== req)
      : [...form.requirements, req];
    updateField("requirements", reqs);
  };

  const handleCreateOrder = () => {
    if (!selected) return;
    const orderId = `2024-${String(Math.floor(Math.random() * 900) + 100).padStart(3, "0")}`;
    toast({
      title: "Order aangemaakt",
      description: `Order #${orderId} succesvol aangemaakt`,
    });
    const remaining = drafts.filter((d) => d.id !== selected.id);
    setDrafts(remaining);
    if (remaining.length > 0) setSelectedId(remaining[0].id);
    else setSelectedId("");
  };

  const handleDelete = () => {
    if (!selected) return;
    const remaining = drafts.filter((d) => d.id !== selected.id);
    setDrafts(remaining);
    if (remaining.length > 0) setSelectedId(remaining[0].id);
    else setSelectedId("");
  };

  const filtered = drafts.filter(
    (d) =>
      d.client.toLowerCase().includes(search.toLowerCase()) ||
      d.subject.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-[calc(100vh-5rem)] gap-0 -m-4 md:-m-6">
      {/* Left Column - Incoming Drafts */}
      <div className="w-[340px] min-w-[300px] border-r border-border/60 flex flex-col bg-card">
        <div className="p-4 pb-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground tracking-tight">Nieuwe Aanvragen</h2>
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-bold bg-primary/10 text-primary border-0">
                {drafts.length}
              </Badge>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Zoeken..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs bg-muted/50 border-border/40"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="px-2 pb-2 space-y-0.5">
            {filtered.map((draft) => (
              <button
                key={draft.id}
                onClick={() => setSelectedId(draft.id)}
                className={cn(
                  "w-full text-left p-3 rounded-lg transition-all duration-150",
                  selectedId === draft.id
                    ? "bg-primary/5 border border-primary/20"
                    : "hover:bg-muted/50 border border-transparent"
                )}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="text-xs font-semibold text-foreground truncate">{draft.client}</span>
                  <ConfidenceBadge score={draft.confidence} />
                </div>
                <p className="text-[11px] text-muted-foreground truncate mb-1.5">{draft.subject}</p>
                <div className="flex items-center gap-1.5 text-muted-foreground/60">
                  <Clock className="h-3 w-3" />
                  <span className="text-[10px]">{draft.time}</span>
                  <span className="text-[10px] ml-auto font-mono text-muted-foreground/40">#{draft.draftId}</span>
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="text-center py-8 text-xs text-muted-foreground">
                Geen aanvragen gevonden
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Right Column - Validation Workspace */}
      {selected && form ? (
        <div className="flex-1 flex flex-col min-w-0 bg-background">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-border/40 bg-card/80">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">
                Order Validatie: <span className="font-mono text-primary">#{selected.draftId}</span>
              </h2>
              <ConfidenceBadge score={selected.confidence} />
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive h-8 text-xs" onClick={handleDelete}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Verwijderen
              </Button>
              <Button size="sm" className="h-8 text-xs" onClick={handleCreateOrder}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Order Aanmaken
              </Button>
            </div>
          </div>

          {/* Split Content */}
          <div className="flex-1 flex overflow-hidden">
            {/* Panel A: Source Email */}
            <div className="w-[45%] border-r border-border/40 flex flex-col overflow-hidden">
              <div className="px-5 py-3 border-b border-border/30">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Bron E-mail</p>
                <h3 className="text-sm font-semibold text-foreground mb-2">{selected.subject}</h3>
                <div className="space-y-1 text-[11px]">
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-10">Van:</span>
                    <span className="text-foreground font-medium">{selected.from}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-10">Aan:</span>
                    <span className="text-foreground">{selected.to}</span>
                  </div>
                </div>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-5">
                  <div className="bg-muted/40 rounded-lg p-4 border border-border/30">
                    <p className="text-[13px] text-foreground/80 leading-relaxed whitespace-pre-wrap">{selected.body}</p>
                  </div>
                </div>
              </ScrollArea>
            </div>

            {/* Panel B: Extracted Data Form */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-5 py-3 border-b border-border/30">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">AI Geëxtraheerde Data</p>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-5 space-y-5">
                  {/* Section 1: Route Info */}
                  <div>
                    <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Route Informatie</h4>
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Transport Type</Label>
                        <Select value={form.transportType} onValueChange={(v) => updateField("transportType", v)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="direct">Direct</SelectItem>
                            <SelectItem value="warehouse-air">Warehouse-Air</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Ophaaladres</Label>
                        <div className="relative">
                          <Input className="h-8 text-xs pr-8" value={form.pickupAddress} onChange={(e) => updateField("pickupAddress", e.target.value)} />
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <DatabaseZap className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-primary/60 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent side="left" className="text-xs">Adres automatisch verrijkt uit adresboek</TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Afleveradres</Label>
                        <div className="relative">
                          <Input className="h-8 text-xs pr-8" value={form.deliveryAddress} onChange={(e) => updateField("deliveryAddress", e.target.value)} />
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <DatabaseZap className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-primary/60 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent side="left" className="text-xs">Adres automatisch verrijkt uit adresboek</TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    </div>
                  </div>

                  <Separator className="bg-border/40" />

                  {/* Section 2: Cargo Details */}
                  <div>
                    <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Lading Details</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Aantal</Label>
                        <Input type="number" className="h-8 text-xs" value={form.quantity} onChange={(e) => updateField("quantity", Number(e.target.value))} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Eenheid</Label>
                        <Select value={form.unit} onValueChange={(v) => updateField("unit", v)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pallets">Pallets</SelectItem>
                            <SelectItem value="colli">Colli</SelectItem>
                            <SelectItem value="box">Box</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Gewicht (kg)</Label>
                        <Input className="h-8 text-xs" value={form.weight} onChange={(e) => updateField("weight", e.target.value)} placeholder="—" />
                        <div className="flex items-center gap-1.5 mt-1">
                          <Checkbox
                            id={`per-unit-${selected.id}`}
                            checked={form.perUnit ?? false}
                            onCheckedChange={(checked) => updateField("perUnit", !!checked)}
                            className="h-3 w-3"
                          />
                          <label htmlFor={`per-unit-${selected.id}`} className="text-[10px] text-muted-foreground cursor-pointer">Per eenheid</label>
                        </div>
                        {form.perUnit && form.weight && form.quantity > 0 && (
                          <div className="space-y-1 mt-1.5">
                            <Label className="text-[10px] text-muted-foreground">Totaal gewicht (berekend)</Label>
                            <Input className="h-7 text-xs bg-muted/30 font-medium" readOnly value={`${form.quantity * Number(form.weight)} kg`} />
                          </div>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Afmetingen</Label>
                        <Input className="h-8 text-xs" value={form.dimensions} onChange={(e) => updateField("dimensions", e.target.value)} placeholder="—" />
                      </div>
                    </div>
                  </div>

                  <Separator className="bg-border/40" />

                  {/* Section 3: Requirements */}
                  <div>
                    <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Vereisten</h4>
                    <div className="flex flex-wrap gap-2">
                      {requirementOptions.map((req) => {
                        const active = form.requirements.includes(req.id);
                        return (
                          <button
                            key={req.id}
                            onClick={() => toggleRequirement(req.id)}
                            className={cn(
                              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-150",
                              active
                                ? "bg-primary/10 text-primary border-primary/30"
                                : "bg-muted/40 text-muted-foreground border-border/40 hover:bg-muted"
                            )}
                          >
                            <req.icon className="h-3 w-3" />
                            {req.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Missing fields warning */}
                  {(!form.weight || !form.dimensions) && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5" />
                        <div>
                          <p className="text-xs font-medium text-amber-800">Onvolledige gegevens</p>
                          <p className="text-[11px] text-amber-600 mt-0.5">
                            {[!form.weight && "Gewicht", !form.dimensions && "Afmetingen"].filter(Boolean).join(" en ")} ontbreekt. Controleer de e-mail of vul handmatig aan.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-background">
          <div className="text-center">
            <Mail className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Geen aanvragen meer te verwerken</p>
          </div>
        </div>
      )}
    </div>
  );
}
