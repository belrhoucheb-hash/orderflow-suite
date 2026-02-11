import { useState, useEffect } from "react";
import { Mail, Clock, Sparkles, Trash2, Plus, Search, ThermometerSnowflake, AlertTriangle, Truck, FileCheck, DatabaseZap, Loader2, FileText, Eye, Download, Image as ImageIcon, Paperclip } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface OrderDraft {
  id: string;
  order_number: number;
  status: string;
  source_email_from: string | null;
  source_email_subject: string | null;
  source_email_body: string | null;
  confidence_score: number | null;
  transport_type: string | null;
  pickup_address: string | null;
  delivery_address: string | null;
  quantity: number | null;
  unit: string | null;
  weight_kg: number | null;
  is_weight_per_unit: boolean;
  dimensions: string | null;
  requirements: string[] | null;
  client_name: string | null;
  received_at: string | null;
  created_at: string;
  attachments: { name: string; url: string; type: string }[] | null;
}

interface FormState {
  transportType: string;
  pickupAddress: string;
  deliveryAddress: string;
  quantity: number;
  unit: string;
  weight: string;
  dimensions: string;
  requirements: string[];
  perUnit: boolean;
}

function orderToForm(order: OrderDraft): FormState {
  return {
    transportType: order.transport_type?.toLowerCase().replace("_", "-") || "direct",
    pickupAddress: order.pickup_address || "",
    deliveryAddress: order.delivery_address || "",
    quantity: order.quantity || 0,
    unit: order.unit || "Pallets",
    weight: order.weight_kg?.toString() || "",
    dimensions: order.dimensions || "",
    requirements: order.requirements || [],
    perUnit: order.is_weight_per_unit,
  };
}

const requirementOptions = [
  { id: "Koeling", label: "Koeling", icon: ThermometerSnowflake },
  { id: "ADR", label: "ADR", icon: AlertTriangle },
  { id: "Laadklep", label: "Laadklep", icon: Truck },
  { id: "Douane", label: "Douane", icon: FileCheck },
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

function formatTime(dateStr: string | null) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
}

function SourcePanel({ selected }: { selected: OrderDraft }) {
  const [activeTab, setActiveTab] = useState<"email" | "attachment">("email");
  const attachments = (selected.attachments || []) as { name: string; url: string; type: string }[];
  const hasAttachments = attachments.length > 0;

  return (
    <div className="w-[45%] border-r border-border/40 flex flex-col overflow-hidden">
      <div className="px-5 py-3 border-b border-border/30">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Bron E-mail</p>
        <h3 className="text-sm font-semibold text-foreground mb-2">{selected.source_email_subject || "Geen onderwerp"}</h3>
        <div className="space-y-1 text-[11px] mb-3">
          <div className="flex gap-2">
            <span className="text-muted-foreground w-10">Van:</span>
            <span className="text-foreground font-medium">{selected.source_email_from || "—"}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-muted-foreground w-10">Aan:</span>
            <span className="text-foreground">planning@royaltycargo.nl</span>
          </div>
        </div>

        {/* Segmented Control Tabs */}
        <div className="inline-flex rounded-full bg-muted/60 p-0.5 border border-border/40">
          <button
            onClick={() => setActiveTab("email")}
            className={cn(
              "px-3 py-1 rounded-full text-[11px] font-medium transition-all duration-150",
              activeTab === "email"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            E-mail Body
          </button>
          <button
            onClick={() => setActiveTab("attachment")}
            className={cn(
              "px-3 py-1 rounded-full text-[11px] font-medium transition-all duration-150 flex items-center gap-1",
              activeTab === "attachment"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Paperclip className="h-3 w-3" />
            Bijlage {hasAttachments && `(${attachments.length})`}
          </button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        {activeTab === "email" ? (
          <div className="p-5">
            <div className="bg-muted/40 rounded-lg p-4 border border-border/30">
              <p className="text-[13px] text-foreground/80 leading-relaxed whitespace-pre-wrap">{selected.source_email_body || "Geen inhoud"}</p>
            </div>
          </div>
        ) : (
          <div className="p-5">
            {hasAttachments ? (
              <div className="space-y-2">
                {attachments.map((att, i) => {
                  const isPdf = att.type === "application/pdf";
                  const isImage = att.type.startsWith("image/");
                  return (
                    <div key={i} className="bg-card rounded-lg border border-border/40 p-3">
                      {isImage && att.url !== "#" && (
                        <div className="mb-3 rounded-md overflow-hidden border border-border/30 bg-muted/20">
                          <img src={att.url} alt={att.name} className="w-full h-40 object-cover" />
                        </div>
                      )}
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
                          isPdf ? "bg-destructive/10" : "bg-primary/10"
                        )}>
                          {isPdf ? <FileText className="h-4 w-4 text-destructive" /> : <ImageIcon className="h-4 w-4 text-primary" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{att.name}</p>
                          <p className="text-[10px] text-muted-foreground">{isPdf ? "PDF Document" : "Afbeelding"}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          {isPdf && (
                            <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={() => window.open(att.url, "_blank")}>
                              <Eye className="h-3 w-3" /> Bekijk PDF
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.open(att.url, "_blank")}>
                            <Download className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <Paperclip className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Geen bijlagen</p>
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

export default function Inbox() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string>("");
  const [formData, setFormData] = useState<Record<string, FormState>>({});
  const [search, setSearch] = useState("");

  const { data: drafts = [], isLoading } = useQuery({
    queryKey: ["draft-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("status", "DRAFT")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as OrderDraft[];
    },
  });

  // Initialize form data when drafts load
  useEffect(() => {
    if (drafts.length > 0) {
      const map: Record<string, FormState> = {};
      drafts.forEach((d) => {
        if (!formData[d.id]) {
          map[d.id] = orderToForm(d);
        }
      });
      if (Object.keys(map).length > 0) {
        setFormData((prev) => ({ ...prev, ...map }));
      }
      if (!selectedId || !drafts.find((d) => d.id === selectedId)) {
        setSelectedId(drafts[0].id);
      }
    }
  }, [drafts]);

  const createOrderMutation = useMutation({
    mutationFn: async ({ id, form }: { id: string; form: FormState }) => {
      const { error } = await supabase
        .from("orders")
        .update({
          status: "OPEN",
          transport_type: form.transportType.toUpperCase().replace("-", "_"),
          pickup_address: form.pickupAddress,
          delivery_address: form.deliveryAddress,
          quantity: form.quantity,
          unit: form.unit,
          weight_kg: form.weight ? Number(form.weight) : null,
          is_weight_per_unit: form.perUnit,
          dimensions: form.dimensions || null,
          requirements: form.requirements,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { id }) => {
      const order = drafts.find((d) => d.id === id);
      toast({
        title: "Order opgeslagen",
        description: `Order #${order?.order_number} status gewijzigd naar OPEN`,
      });
      queryClient.invalidateQueries({ queryKey: ["draft-orders"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("orders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["draft-orders"] });
    },
  });

  const selected = drafts.find((d) => d.id === selectedId);
  const form = selected ? formData[selected.id] : null;

  const updateField = (field: keyof FormState, value: any) => {
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
    if (!selected || !form) return;
    createOrderMutation.mutate({ id: selected.id, form });
  };

  const handleDelete = () => {
    if (!selected) return;
    deleteMutation.mutate(selected.id);
  };

  const filtered = drafts.filter(
    (d) =>
      (d.client_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (d.source_email_subject || "").toLowerCase().includes(search.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-5rem)]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

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
                  <span className="text-xs font-semibold text-foreground truncate">{draft.client_name || "Onbekend"}</span>
                  {draft.confidence_score && <ConfidenceBadge score={draft.confidence_score} />}
                </div>
                <p className="text-[11px] text-muted-foreground truncate mb-1.5">{draft.source_email_subject || "Geen onderwerp"}</p>
                <div className="flex items-center gap-1.5 text-muted-foreground/60">
                  <Clock className="h-3 w-3" />
                  <span className="text-[10px]">{formatTime(draft.received_at)}</span>
                  <span className="text-[10px] ml-auto font-mono text-muted-foreground/40">#{draft.order_number}</span>
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
                Order Validatie: <span className="font-mono text-primary">#{selected.order_number}</span>
              </h2>
              {selected.confidence_score && <ConfidenceBadge score={selected.confidence_score} />}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive h-8 text-xs" onClick={handleDelete} disabled={deleteMutation.isPending}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Verwijderen
              </Button>
              <Button size="sm" className="h-8 text-xs" onClick={handleCreateOrder} disabled={createOrderMutation.isPending}>
                {createOrderMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                Order Aanmaken
              </Button>
            </div>
          </div>

          {/* Split Content */}
          <div className="flex-1 flex overflow-hidden">
            {/* Panel A: Source Email */}
            <SourcePanel selected={selected} />

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
                            <SelectItem value="Pallets">Pallets</SelectItem>
                            <SelectItem value="Colli">Colli</SelectItem>
                            <SelectItem value="Box">Box</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Gewicht (kg)</Label>
                        <Input className="h-8 text-xs" value={form.weight} onChange={(e) => updateField("weight", e.target.value)} placeholder="—" />
                        <div className="flex items-center gap-1.5 mt-1">
                          <Checkbox
                            id={`per-unit-${selected.id}`}
                            checked={form.perUnit}
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
