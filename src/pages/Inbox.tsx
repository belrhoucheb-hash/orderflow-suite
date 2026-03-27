import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Mail, Clock, Sparkles, Trash2, Plus, Search, ThermometerSnowflake, AlertTriangle, Truck, FileCheck, DatabaseZap, Loader2, FileText, Eye, Download, Image as ImageIcon, Paperclip, Upload, FlaskConical, MapPin, ArrowLeft, CheckCircle2, Zap, Package, Route, ShieldCheck, Scale, Ruler, Bot, Inbox as InboxIcon, ChevronRight, MailOpen, Timer, Users, Merge, StickyNote, TriangleAlert, FileType, Send, CircleAlert } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useFleetVehicles } from "@/hooks/useFleet";
import { useAddressSuggestions, type AddressSuggestion } from "@/hooks/useAddressSuggestions";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { type ClientRecord, type OrderDraft, type FieldSource, type FieldSources, type FormState, THREAD_TYPE_CONFIG, requirementOptions } from "@/components/inbox/types";
import { ThreadDiffBanner } from "@/components/inbox/InboxThreadBanner";
import { AnomalyWarnings } from "@/components/inbox/InboxAnomalyWarnings";
import { ConfidenceDot, ConfidenceRing, FieldConfidence } from "@/components/inbox/InboxConfidenceIndicators";
import { FollowUpPanel } from "@/components/inbox/InboxFollowUpPanel";
import { ExtractionSummary } from "@/components/inbox/InboxExtractionSummary";
import { useCapacityMatch, type CapacityMatch } from "@/hooks/useCapacityMatch";
import { SourcePanel } from "@/components/inbox/InboxSourcePanel";

function orderToForm(order: OrderDraft): FormState {
  return {
    transportType: order.transport_type?.toLowerCase().replace("_", "-") || "direct",
    pickupAddress: order.pickup_address || "",
    deliveryAddress: order.delivery_address || "",
    quantity: order.quantity || 0,
    unit: order.unit || "Pallets",
    weight: order.weight_kg ? order.weight_kg.toString() : "",
    dimensions: order.dimensions || "",
    requirements: order.requirements || [],
    perUnit: order.is_weight_per_unit,
    internalNote: order.internal_note || "",
    fieldSources: {},
  };
}

const TEST_SCENARIOS = [
  {
    label: "A: Gevaarlijke Rekensom",
    description: "Test: Math + ADR",
    email: "Hoi, graag transport voor 5 pallets chemisch afval (ADR). Gewicht is 800 kg per pallet. Ophalen bij Shell Pernis, leveren bij Jansen in Venlo.",
  },
  {
    label: "B: Koelvracht via Lucht",
    description: "Test: Koeling + Type",
    email: "Order voor Schiphol Cargo. 10 dozen vis, moet gekoeld blijven op 2 graden. Totaal 500kg. Leveren bij KLM Cargo loods.",
  },
  {
    label: "C: Vage Mail",
    description: "Test: Incomplete Data",
    email: "Graag 2 pallets naar Groningen. Morgen ophalen.",
  },
];

function isAddressIncomplete(address: string): boolean {
  if (!address || address.trim().length < 5) return true;
  const hasNumber = /\d/.test(address);
  const hasZipcode = /\d{4}\s?[A-Za-z]{2}/.test(address);
  return !hasNumber && !hasZipcode;
}

function tryEnrichAddress(address: string, clients: ClientRecord[]): { enriched: string; matchedClient: string | null } {
  if (!address || clients.length === 0) return { enriched: address, matchedClient: null };
  const lowerAddr = address.toLowerCase();
  const match = clients.find((c) => {
    const nameParts = c.name.toLowerCase().split(/\s+/);
    return nameParts.some((part) => part.length > 2 && lowerAddr.includes(part));
  });
  if (!match || !match.address) return { enriched: address, matchedClient: null };
  if (/\d{4}\s?[A-Za-z]{2}/.test(address)) return { enriched: address, matchedClient: null };
  const parts = [match.address, match.zipcode, match.city].filter(Boolean);
  return { enriched: parts.join(", "), matchedClient: match.name };
}

const FIELD_LABELS: Record<string, string> = {
  weight_kg: "Gewicht",
  quantity: "Aantal",
  pickup_address: "Ophaaladres",
  delivery_address: "Afleveradres",
  requirements: "Vereisten",
  unit: "Eenheid",
  dimensions: "Afmetingen",
  transport_type: "Transport type",
  client_name: "Klantnaam",
};

function formatTime(dateStr: string | null) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  
  if (isToday) return `Vandaag ${formatTime(dateStr)}`;
  if (isYesterday) return `Gisteren ${formatTime(dateStr)}`;
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" }) + ` ${formatTime(dateStr)}`;
}

// ─── Deadline Indicator ───
// Calculates a planning deadline based on received_at: must be planned within 4 hours of receipt
function getDeadlineInfo(receivedAt: string | null): { label: string; urgency: "red" | "amber" | "green" | "neutral"; minutesLeft: number } {
  if (!receivedAt) return { label: "", urgency: "neutral", minutesLeft: Infinity };
  const received = new Date(receivedAt);
  // Deadline = 4 hours after receipt (typical SLA)
  const deadline = new Date(received.getTime() + 4 * 60 * 60 * 1000);
  const now = new Date();
  const diffMs = deadline.getTime() - now.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin <= 0) {
    return { label: "Nu inplannen!", urgency: "red", minutesLeft: 0 };
  }
  if (diffMin < 60) {
    return { label: `Nog ${diffMin} min`, urgency: "red", minutesLeft: diffMin };
  }
  if (diffMin < 120) {
    const hrs = Math.floor(diffMin / 60);
    const mins = diffMin % 60;
    return { label: `Nog ${hrs}u ${mins}m`, urgency: "amber", minutesLeft: diffMin };
  }
  const hrs = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  return { label: `Nog ${hrs}u ${mins}m`, urgency: "green", minutesLeft: diffMin };
}

// ─── Duplicate Detection ───
// Compares orders on client_name + delivery_address within a time window
const DUPLICATE_WINDOW_MINUTES = 60;

function normalizeStr(s: string | null): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

function findDuplicates(orders: OrderDraft[]): Map<string, string[]> {
  // Map each order id → list of duplicate order ids
  const dupeMap = new Map<string, string[]>();
  for (let i = 0; i < orders.length; i++) {
    for (let j = i + 1; j < orders.length; j++) {
      const a = orders[i];
      const b = orders[j];
      // Must share client name
      const clientA = normalizeStr(a.client_name);
      const clientB = normalizeStr(b.client_name);
      if (!clientA || clientA !== clientB) continue;
      // Must share delivery address (fuzzy)
      const addrA = normalizeStr(a.delivery_address);
      const addrB = normalizeStr(b.delivery_address);
      if (!addrA || addrA !== addrB) continue;
      // Must be received within time window
      if (a.received_at && b.received_at) {
        const diffMin = Math.abs(new Date(a.received_at).getTime() - new Date(b.received_at).getTime()) / 60000;
        if (diffMin > DUPLICATE_WINDOW_MINUTES) continue;
      }
      // Mark both as duplicates of each other
      if (!dupeMap.has(a.id)) dupeMap.set(a.id, []);
      if (!dupeMap.has(b.id)) dupeMap.set(b.id, []);
      dupeMap.get(a.id)!.push(`#${b.order_number}`);
      dupeMap.get(b.id)!.push(`#${a.order_number}`);
    }
  }
  return dupeMap;
}

// ─── Capacity Check ───
function getCapacityWarning(vehicles: { status?: string }[]): { hasWarning: boolean; message: string } {
  const totalVehicles = vehicles.length;
  if (totalVehicles === 0) return { hasWarning: false, message: "" };
  const busy = vehicles.filter((v) => v.status !== "beschikbaar").length;
  const freeCount = totalVehicles - busy;
  if (freeCount === 0) {
    return { hasWarning: true, message: "Geen capaciteit beschikbaar — vloot zit 100% vol voor vandaag/morgen" };
  }
  if (freeCount === 1) {
    return { hasWarning: true, message: `Slechts ${freeCount} voertuig beschikbaar — plan met zorg` };
  }
  return { hasWarning: false, message: "" };
}

function SourceBadge({ source }: { source?: FieldSource }) {
  if (!source) return null;
  return (
    <Badge variant="outline" className="text-[9px] h-4 py-0 font-normal border-primary/20 bg-primary/5 text-primary">
      {source.type === 'ai' ? 'AI' : 'Draft'}
    </Badge>
  );
}

function FormField({ label, icon: Icon, children, className, source, warning, confidence }: { label: string; icon?: any; children: React.ReactNode; className?: string; source?: FieldSource; warning?: string; confidence?: "high" | "medium" | "low" | "missing" }) {
  const hasIssue = warning || confidence === "low" || confidence === "missing";
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between gap-1">
        <Label className={cn("text-[11px] font-medium flex items-center gap-1.5", hasIssue ? "text-destructive font-semibold" : "text-muted-foreground")}>
          {Icon && <Icon className="h-3 w-3" />}
          {label}
          {confidence === "missing" && <span className="text-[9px] text-destructive/80 font-normal ml-1">— ontbreekt in bericht</span>}
        </Label>
        <div className="flex items-center gap-1.5">
          {confidence && <FieldConfidence level={confidence} />}
          {source && <SourceBadge source={source} />}
        </div>
      </div>
      {children}
    </div>
  );
}

function AddressSuggestionsDropdown({ suggestions, onSelect, isOpen, onClose }: {
  suggestions: AddressSuggestion[];
  onSelect: (address: string) => void;
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!isOpen || suggestions.length === 0) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className="absolute z-50 left-0 right-0 top-full mt-1 rounded-lg border border-border bg-card shadow-lg overflow-hidden"
    >
      <div className="px-2.5 py-1.5 border-b border-border/30 bg-muted/30">
        <p className="text-[9px] font-semibold text-muted-foreground/70 uppercase tracking-wider flex items-center gap-1">
          <Clock className="h-2.5 w-2.5" /> Historische adressen
        </p>
      </div>
      {suggestions.map((s, i) => (
        <button
          key={i}
          className="w-full text-left px-3 py-2 hover:bg-primary/5 transition-colors border-b border-border/10 last:border-0"
          onClick={() => { onSelect(s.address); onClose(); }}
        >
          <p className="text-[11px] font-medium text-foreground truncate">{s.address}</p>
          <p className="text-[9px] text-muted-foreground/60">{s.frequency}× gebruikt</p>
        </button>
      ))}
    </motion.div>
  );
}

export default function Inbox() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string>("");
  const [formData, setFormData] = useState<Record<string, FormState>>({});
  const [search, setSearch] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "source" | "detail">("list");
  const [showTestPanel, setShowTestPanel] = useState(false);
  const [groupByClient, setGroupByClient] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [showPickupSuggestions, setShowPickupSuggestions] = useState(false);
  const [showDeliverySuggestions, setShowDeliverySuggestions] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: vehicles = [] } = useFleetVehicles();

  // Capacity warning
  const capacityWarning = useMemo(() => getCapacityWarning(vehicles), [vehicles]);

  const handleImportEmail = async (file: File) => {
    setIsImporting(true);
    try {
      const formPayload = new FormData();
      formPayload.append("file", file);
      const { data, error } = await supabase.functions.invoke("import-email", { body: formPayload });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "E-mail geïmporteerd", description: `Draft order #${data.order_number} aangemaakt met ${data.attachments_uploaded} bijlage(n)` });
      queryClient.invalidateQueries({ queryKey: ["draft-orders"] });
    } catch (e: any) {
      console.error("Import error:", e);
      toast({ title: "Import mislukt", description: e.message || "Probeer het opnieuw", variant: "destructive" });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-addressbook"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, name, address, zipcode, city, country");
      if (error) throw error;
      return data as ClientRecord[];
    },
  });

  const enrichAddresses = useCallback((formState: Partial<FormState>): { result: Partial<FormState>; enrichments: string[] } => {
    const enrichments: string[] = [];
    const result = { ...formState };
    if (result.pickupAddress) {
      const pickup = tryEnrichAddress(result.pickupAddress, clients);
      if (pickup.matchedClient) { result.pickupAddress = pickup.enriched; enrichments.push(`Ophaaladres verrijkt via "${pickup.matchedClient}"`); }
    }
    if (result.deliveryAddress) {
      const delivery = tryEnrichAddress(result.deliveryAddress, clients);
      if (delivery.matchedClient) { result.deliveryAddress = delivery.enriched; enrichments.push(`Afleveradres verrijkt via "${delivery.matchedClient}"`); }
    }
    return { result, enrichments };
  }, [clients]);

  const [loadingScenario, setLoadingScenario] = useState<number | null>(null);

  const handleLoadTestScenario = useCallback(async (scenarioIndex: number) => {
    setLoadingScenario(scenarioIndex);
    try {
      const scenario = TEST_SCENARIOS[scenarioIndex];
      const subjectLine = `Test: ${scenario.label}`;

      // Check for existing DRAFT with same subject to prevent duplicates
      const { data: existing } = await supabase
        .from("orders")
        .select("id")
        .eq("status", "DRAFT")
        .eq("source_email_subject", subjectLine)
        .limit(1);

      if (existing && existing.length > 0) {
        setSelectedId(existing[0].id);
        toast({ title: "Al aanwezig", description: `Test scenario "${scenario.label}" staat al in de inbox.` });
        setLoadingScenario(null);
        return;
      }

      const { data: newOrder, error } = await supabase.from("orders").insert({
        status: "DRAFT", source_email_from: "test@royaltycargo.nl", source_email_subject: subjectLine,
        source_email_body: scenario.email, client_name: "Test Scenario",
      }).select().single();
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["draft-orders"] });
      setSelectedId(newOrder.id);
      toast({ title: "Test data geladen", description: `${scenario.label} - AI analyse wordt gestart...` });
      const { data: parseData, error: parseError } = await supabase.functions.invoke("parse-order", { body: { emailBody: scenario.email } });
      if (parseError) throw parseError;
      if (parseData?.error) throw new Error(parseData.error);
      const ext = parseData.extracted;
      const parsedForm: FormState = {
        transportType: ext.transport_type || "direct", pickupAddress: ext.pickup_address || "", deliveryAddress: ext.delivery_address || "",
        quantity: ext.quantity || 0, unit: ext.unit || "Pallets", weight: ext.weight_kg?.toString() || "", dimensions: ext.dimensions || "",
        requirements: ext.requirements || [], perUnit: ext.is_weight_per_unit || false, internalNote: "", fieldSources: ext.field_sources || {},
      };
      const { result: enriched, enrichments } = enrichAddresses(parsedForm);
      setFormData((prev) => ({ ...prev, [newOrder.id]: enriched as FormState }));
      if (enrichments.length > 0) toast({ title: "Adresboek verrijking", description: enrichments.join(". ") });
      const enrichedForm = enriched as FormState;
      await supabase.from("orders").update({
        confidence_score: ext.confidence_score, client_name: ext.client_name || "Test Scenario", transport_type: ext.transport_type,
        pickup_address: enrichedForm.pickupAddress, delivery_address: enrichedForm.deliveryAddress, quantity: ext.quantity,
        unit: ext.unit, weight_kg: ext.weight_kg, is_weight_per_unit: ext.is_weight_per_unit, dimensions: ext.dimensions, requirements: ext.requirements,
        missing_fields: parseData.missing_fields || [], follow_up_draft: parseData.follow_up_draft || null,
      }).eq("id", newOrder.id);
      await queryClient.invalidateQueries({ queryKey: ["draft-orders"] });
      toast({ title: "AI Extractie voltooid", description: `Confidence: ${ext.confidence_score}%` });
    } catch (e: any) {
      console.error("Test scenario error:", e);
      toast({ title: "Test scenario fout", description: e.message, variant: "destructive" });
    } finally {
      setLoadingScenario(null);
    }
  }, [queryClient, toast, enrichAddresses]);

  const { data: drafts = [], isLoading } = useQuery({
    queryKey: ["draft-orders"],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("*").eq("status", "DRAFT").order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as OrderDraft[];
    },
  });

  useEffect(() => {
    if (drafts.length > 0) {
      const map: Record<string, FormState> = {};
      drafts.forEach((d) => { if (!formData[d.id]) map[d.id] = orderToForm(d); });
      if (Object.keys(map).length > 0) setFormData((prev) => ({ ...prev, ...map }));
      if (!selectedId || !drafts.find((d) => d.id === selectedId)) setSelectedId(drafts[0].id);
    }
  }, [drafts]);

  const createOrderMutation = useMutation({
    mutationFn: async ({ id, form }: { id: string; form: FormState }) => {
      const { error } = await supabase.from("orders").update({
        status: "OPEN", transport_type: form.transportType.toUpperCase().replace("-", "_"), pickup_address: form.pickupAddress,
        delivery_address: form.deliveryAddress, quantity: form.quantity, unit: form.unit,
        weight_kg: form.weight ? Number(form.weight) : null, is_weight_per_unit: form.perUnit, dimensions: form.dimensions || null,
        requirements: form.requirements, internal_note: form.internalNote || null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: async (_, { id }) => {
      const order = drafts.find((d) => d.id === id);
      toast({ title: "Order opgeslagen", description: `Order #${order?.order_number} status gewijzigd naar OPEN` });
      queryClient.invalidateQueries({ queryKey: ["draft-orders"] });

      // Send confirmation email to client
      if (order?.source_email_from) {
        try {
          const { data, error: confirmError } = await supabase.functions.invoke("send-confirmation", {
            body: { orderId: id },
          });
          if (confirmError) throw confirmError;
          if (data?.error && !data?.skipped) throw new Error(data.error);
          if (data?.success) {
            toast({ title: "✉️ Bevestiging verzonden", description: `Orderbevestiging gestuurd naar ${order.source_email_from}` });
          }
        } catch (e: any) {
          console.error("Confirmation email error:", e);
          // Don't block order creation on email failure
          toast({ title: "Bevestiging niet verzonden", description: e.message || "SMTP niet geconfigureerd", variant: "destructive" });
        }
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("orders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["draft-orders"] }); },
  });

  // Save internal note to DB on blur
  const saveNoteMutation = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      const { error } = await supabase.from("orders").update({ internal_note: note || null }).eq("id", id);
      if (error) throw error;
    },
  });

  const selected = drafts.find((d) => d.id === selectedId);
  const form = selected ? formData[selected.id] : null;

  // Address suggestions based on selected order's client
  const { data: addressSuggestions } = useAddressSuggestions(selected?.client_name || null);

  // Bulk selection helpers
  const toggleBulkSelect = (id: string) => {
    setBulkSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllSimilar = (clientName: string) => {
    const similar = drafts.filter(d => d.client_name === clientName).map(d => d.id);
    setBulkSelected(new Set(similar));
    toast({ title: "Selectie", description: `${similar.length} orders van ${clientName} geselecteerd` });
  };

  const handleBulkApprove = () => {
    const ids = Array.from(bulkSelected);
    ids.forEach(id => {
      const f = formData[id];
      if (f) createOrderMutation.mutate({ id, form: f });
    });
    setBulkSelected(new Set());
  };

  const updateField = (field: keyof FormState, value: any) => {
    if (!selected) return;
    setFormData((prev) => ({ ...prev, [selected.id]: { ...prev[selected.id], [field]: value } }));
  };

  const toggleRequirement = (req: string) => {
    if (!form) return;
    const reqs = form.requirements.includes(req) ? form.requirements.filter((r) => r !== req) : [...form.requirements, req];
    updateField("requirements", reqs);
  };

  const handleCreateOrder = () => { if (!selected || !form) return; createOrderMutation.mutate({ id: selected.id, form }); };
  const handleDelete = () => { if (!selected) return; deleteMutation.mutate(selected.id); };

  const filtered = drafts.filter(
    (d) => (d.client_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (d.source_email_subject || "").toLowerCase().includes(search.toLowerCase())
  );

  // Group by client
  const groupedByClient = useMemo(() => {
    if (!groupByClient) return null;
    const groups: Record<string, OrderDraft[]> = {};
    filtered.forEach((d) => {
      const key = d.client_name || "Onbekend";
      if (!groups[key]) groups[key] = [];
      groups[key].push(d);
    });
    return groups;
  }, [filtered, groupByClient]);

  const highConf = drafts.filter(d => (d.confidence_score || 0) >= 80).length;
  const lowConf = drafts.filter(d => (d.confidence_score || 0) > 0 && (d.confidence_score || 0) < 80).length;
  const noConf = drafts.filter(d => !d.confidence_score).length;

  // Merge handler — merge multiple orders from same client into one multi-stop order
  const handleMerge = (clientName: string, orders: OrderDraft[]) => {
    if (orders.length < 2) return;
    toast({
      title: "Orders samenvoegen",
      description: `${orders.length} orders van ${clientName} worden samengevoegd tot 1 multi-stop transportopdracht (komt in volgende versie)`,
    });
  };

  // Duplicate detection
  const duplicateMap = useMemo(() => findDuplicates(drafts), [drafts]);

  // Find the single most urgent item (lowest minutesLeft among red items)
  const mostUrgentId = useMemo(() => {
    let best: { id: string; min: number } | null = null;
    for (const d of filtered) {
      const dl = getDeadlineInfo(d.received_at);
      if (dl.urgency === "red" && (best === null || dl.minutesLeft < best.min)) {
        best = { id: d.id, min: dl.minutesLeft };
      }
    }
    return best?.id || null;
  }, [filtered]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-5rem)]">
        <div className="text-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto mb-3" />
          <p className="text-xs text-muted-foreground">Inbox laden...</p>
        </div>
      </div>
    );
  }

  const renderInboxItem = (draft: OrderDraft) => {
    const isSelected = selectedId === draft.id;
    const conf = draft.confidence_score || 0;
    const hasReqs = (draft.requirements || []).length > 0;
    const hasNote = !!draft.internal_note;
    const isDuplicate = duplicateMap.has(draft.id);
    const threadType = draft.thread_type || "new";
    const threadConfig = THREAD_TYPE_CONFIG[threadType];
    const changes = (draft.changes_detected || []) as { field: string; old_value: string; new_value: string }[];
    const deadline = getDeadlineInfo(draft.received_at);

    const isBulkChecked = bulkSelected.has(draft.id);

    return (
      <div key={draft.id} className="flex items-start gap-1">
        <div className="pt-3 pl-1 shrink-0">
          <Checkbox
            className="h-3.5 w-3.5"
            checked={isBulkChecked}
            onCheckedChange={() => toggleBulkSelect(draft.id)}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
        <motion.button
          layoutId={draft.id}
          onClick={() => { setSelectedId(draft.id); setMobileView("source"); }}
          className={cn(
            "flex-1 text-left px-3 py-2 rounded-lg transition-all duration-150 group relative",
            isSelected ? "bg-primary/[0.06] ring-1 ring-primary/20" : "hover:bg-muted/30",
            deadline.urgency === "red" && !isSelected && "border-l-2 border-l-destructive",
            isBulkChecked && "ring-1 ring-primary/30 bg-primary/[0.04]"
          )}
        >
        {/* Row 1: Dot + Client + Thread Badge + SLA */}
        <div className="flex items-center gap-1.5 mb-0.5">
          {conf > 0 && <ConfidenceDot score={conf} />}
          <span className="text-[12px] font-semibold text-foreground truncate leading-tight flex-1">
            {draft.client_name || "Nieuwe aanvraag"}
          </span>
          {(() => {
            // Action-specific badge instead of generic thread type
            const hasMissing = (draft.missing_fields || []).length > 0;
            const noScore = !draft.confidence_score;
            const lowScore = (draft.confidence_score || 0) > 0 && (draft.confidence_score || 0) < 80;
            
            if (isDuplicate) return <span className="inline-flex items-center text-[9px] font-semibold px-1.5 py-0.5 rounded border shrink-0 text-amber-700 bg-amber-500/15 border-amber-500/25">Duplicaat?</span>;
            if (threadType !== "new" && threadConfig) return <span className={cn("inline-flex items-center text-[9px] font-semibold px-1.5 py-0.5 rounded border shrink-0", threadConfig.listColor)}>{threadConfig.listLabel}</span>;
            if (hasMissing) return <span className="inline-flex items-center text-[9px] font-semibold px-1.5 py-0.5 rounded border shrink-0 text-destructive bg-destructive/10 border-destructive/20">Data mist</span>;
            if (noScore) return <span className="inline-flex items-center text-[9px] font-semibold px-1.5 py-0.5 rounded border shrink-0 text-muted-foreground bg-muted border-border">Nieuw</span>;
            if (lowScore) return <span className="inline-flex items-center text-[9px] font-semibold px-1.5 py-0.5 rounded border shrink-0 text-amber-700 bg-amber-500/15 border-amber-500/25">Review</span>;
            return <span className="inline-flex items-center text-[9px] font-semibold px-1.5 py-0.5 rounded border shrink-0 text-emerald-700 bg-emerald-500/15 border-emerald-500/25">Gereed</span>;
          })()}
        </div>

        {/* Row 2: Subject */}
        <p className="text-[11px] text-muted-foreground truncate mb-1 leading-snug">
          {draft.source_email_subject || "Geen onderwerp"}
        </p>

        {/* Inline duplicate indicator */}
        {isDuplicate && (
          <div className="flex items-center gap-1 mb-1 text-[10px] text-amber-600">
            <Merge className="h-2.5 w-2.5" />
            <span className="font-medium">Mogelijk duplicaat van {duplicateMap.get(draft.id)!.join(", ")}</span>
          </div>
        )}

        {/* Inline change diffs for update threads */}
        {threadType === "update" && changes.length > 0 && (
          <div className="mb-1 space-y-0.5">
            {changes.slice(0, 2).map((change, i) => (
              <div key={i} className="flex items-center gap-1 text-[10px]">
                <span className="text-muted-foreground font-medium">{FIELD_LABELS[change.field] || change.field}:</span>
                <span className="text-muted-foreground/50 line-through">{change.old_value}</span>
                <span className="text-muted-foreground/40">→</span>
                <span className="text-primary font-semibold">{change.new_value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Row 3: Time + icons */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground/50">{formatDate(draft.received_at)}</span>
          
          {/* SLA indicator */}
          {deadline.urgency !== "neutral" && (
            <span className={cn(
              "inline-flex items-center gap-0.5 text-[9px] font-medium px-1 py-0.5 rounded",
              deadline.urgency === "red" && "text-destructive bg-destructive/8",
              deadline.urgency === "amber" && "text-amber-600 bg-amber-500/8",
              deadline.urgency === "green" && "text-muted-foreground",
            )}>
              <Timer className="h-2.5 w-2.5" />
              {deadline.label}
            </span>
          )}

          <span className="flex-1" />

          {/* Compact icons */}
          {hasReqs && draft.requirements!.slice(0, 2).map(r => {
            const opt = requirementOptions.find(o => o.id === r);
            return opt ? (
              <Tooltip key={r}>
                <TooltipTrigger>
                  <opt.icon className={cn("h-3 w-3", opt.color.split(' ')[0])} />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-[10px]">{opt.label}</TooltipContent>
              </Tooltip>
            ) : null;
          })}
          {(draft.anomalies as any[])?.length > 0 && (
            <Tooltip>
              <TooltipTrigger><Bot className="h-3 w-3 text-amber-500" /></TooltipTrigger>
              <TooltipContent side="top" className="text-[10px] max-w-[250px]">{(draft.anomalies as any[])[0]?.message}</TooltipContent>
            </Tooltip>
          )}
          {hasNote && (
            <Tooltip>
              <TooltipTrigger><StickyNote className="h-3 w-3 text-muted-foreground/50" /></TooltipTrigger>
              <TooltipContent side="top" className="text-[10px] max-w-[200px]">{draft.internal_note}</TooltipContent>
            </Tooltip>
          )}
          {isDuplicate && (
            <Tooltip>
              <TooltipTrigger><AlertTriangle className="h-3 w-3 text-amber-500" /></TooltipTrigger>
              <TooltipContent side="top" className="text-[10px] max-w-[250px]">Duplicaat van {duplicateMap.get(draft.id)!.join(", ")}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </motion.button>
      </div>
    );
  };

  return (
    <div className="flex h-[calc(100vh-5rem)] gap-0 -m-4 md:-m-6">
      <ResizablePanelGroup direction="horizontal" className="h-full">
      {/* ─── Left: Inbox List ─── */}
      <ResizablePanel defaultSize={25} minSize={15} maxSize={40} className={cn(
        "flex flex-col bg-card",
        mobileView !== "list" && "hidden md:flex"
      )}>
        {/* Header */}
        <div className="p-4 pb-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-foreground tracking-tight">Inbox</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {(() => {
                  const actionCount = drafts.filter(d => {
                    const hasMissing = (d.missing_fields || []).length > 0;
                    const lowConf = (d.confidence_score || 0) > 0 && (d.confidence_score || 0) < 80;
                    const noScore = !d.confidence_score;
                    return hasMissing || lowConf || noScore;
                  }).length;
                  const readyCount = drafts.length - actionCount;
                  if (actionCount > 0 && readyCount > 0) return <><strong className="text-amber-600">{actionCount}</strong> vereisen actie · <strong className="text-emerald-600">{readyCount}</strong> klaar</>;
                  if (actionCount > 0) return <><strong className="text-amber-600">{actionCount}</strong> vereisen actie</>;
                  if (readyCount > 0) return <><strong className="text-emerald-600">{readyCount}</strong> klaar voor planning</>;
                  return "Geen aanvragen";
                })()}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <input ref={fileInputRef} type="file" accept=".eml,.msg" className="hidden"
                onChange={(e) => { const file = e.target.files?.[0]; if (file) handleImportEmail(file); }} />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => fileInputRef.current?.click()} disabled={isImporting}>
                    {isImporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Import .eml bestand</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" className={cn("h-8 w-8", groupByClient && "bg-primary/10 border-primary/30")} onClick={() => setGroupByClient(!groupByClient)}>
                    <Users className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Groepeer per klant</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" className={cn("h-8 w-8", showTestPanel && "bg-muted")} onClick={() => setShowTestPanel(!showTestPanel)}>
                    <FlaskConical className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Test data</TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Capacity Warning Banner */}
          {capacityWarning.hasWarning && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="mb-3 rounded-lg border border-destructive/20 bg-destructive/5 p-2.5 flex items-start gap-2"
            >
              <TriangleAlert className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
              <p className="text-[10px] text-destructive font-medium leading-snug">{capacityWarning.message}</p>
            </motion.div>
          )}

          {/* Stats bar */}
          {drafts.length > 0 && (
            <div className="flex items-center gap-3 mb-3">
              {highConf > 0 && (
                <div className="flex items-center gap-1 text-[10px] text-emerald-600">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {highConf} hoge AI
                </div>
              )}
              {lowConf > 0 && (
                <div className="flex items-center gap-1 text-[10px] text-amber-600">
                  <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  {lowConf} review
                </div>
              )}
              {noConf > 0 && (
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
                  {noConf} nieuw
                </div>
              )}
            </div>
          )}

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
            <Input placeholder="Zoek op klant of onderwerp..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9 text-xs bg-background border-border/40 rounded-lg" />
          </div>

          {/* Bulk Actions Bar */}
          <AnimatePresence>
            {bulkSelected.size > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="mb-3 rounded-lg border border-primary/20 bg-primary/5 p-2.5 overflow-hidden"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-primary">
                    {bulkSelected.size} geselecteerd
                  </span>
                  <div className="flex items-center gap-1.5">
                    {(() => {
                      // "Select all similar" — find client of first selected
                      const firstId = Array.from(bulkSelected)[0];
                      const firstDraft = drafts.find(d => d.id === firstId);
                      const clientName = firstDraft?.client_name;
                      const similarCount = clientName ? drafts.filter(d => d.client_name === clientName).length : 0;
                      if (clientName && similarCount > bulkSelected.size) {
                        return (
                          <Button variant="outline" size="sm" className="h-6 text-[9px] gap-1" onClick={() => selectAllSimilar(clientName)}>
                            <Users className="h-2.5 w-2.5" /> Alle {similarCount} van {clientName}
                          </Button>
                        );
                      }
                      return null;
                    })()}
                    <Button variant="outline" size="sm" className="h-6 text-[9px] gap-1" onClick={() => setBulkSelected(new Set())}>
                      Deselecteer
                    </Button>
                    <Button size="sm" className="h-6 text-[9px] gap-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleBulkApprove}>
                      <CheckCircle2 className="h-2.5 w-2.5" /> Goedkeuren
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Test Panel */}
        <AnimatePresence>
          {showTestPanel && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
              <div className="px-4 py-2.5 border-y border-border/30 bg-muted/20">
                <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-[0.1em] mb-2">Test Scenario's</p>
                <div className="flex flex-wrap gap-1.5">
                  {TEST_SCENARIOS.map((scenario, i) => (
                    <Button key={i} variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={() => handleLoadTestScenario(i)} disabled={loadingScenario !== null}>
                      {loadingScenario === i ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                      {scenario.label}
                    </Button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Order List */}
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-0.5">
            {groupByClient && groupedByClient ? (
              Object.entries(groupedByClient).map(([clientName, orders]) => (
                <div key={clientName} className="mb-2">
                  <div className="flex items-center justify-between px-3 py-1.5 mb-0.5">
                    <div className="flex items-center gap-1.5">
                      <Users className="h-3 w-3 text-muted-foreground/50" />
                      <span className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-wider">{clientName}</span>
                      <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">{orders.length}</Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" className="h-6 text-[9px] gap-1 text-primary" onClick={() => selectAllSimilar(clientName)}>
                        <CheckCircle2 className="h-2.5 w-2.5" /> Selecteer alle
                      </Button>
                      {orders.length >= 2 && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-6 text-[9px] gap-1 text-primary" onClick={() => handleMerge(clientName, orders)}>
                              <Merge className="h-3 w-3" /> Samenvoegen
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent className="text-[10px]">Combineer tot multi-stop opdracht</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                  {orders.map(renderInboxItem)}
                </div>
              ))
            ) : (() => {
              // Split into "Actie nodig" and "Klaar voor planning"
              const needsAction = filtered.filter(d => {
                const hasMissing = (d.missing_fields || []).length > 0;
                const lowConf = (d.confidence_score || 0) > 0 && (d.confidence_score || 0) < 80;
                const noScore = !d.confidence_score;
                return hasMissing || lowConf || noScore;
              });
              const readyToGo = filtered.filter(d => {
                const hasMissing = (d.missing_fields || []).length > 0;
                const score = d.confidence_score || 0;
                return !hasMissing && score >= 80;
              });

              return (
                <>
                  {needsAction.length > 0 && (
                    <div className="mb-1">
                      <div className="flex items-center gap-1.5 px-3 py-1.5 mb-0.5">
                        <CircleAlert className="h-3 w-3 text-amber-500" />
                        <span className="text-[10px] font-bold text-amber-600/80 uppercase tracking-wider">Actie nodig</span>
                        <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4 bg-amber-500/10 text-amber-600 border-amber-500/20">{needsAction.length}</Badge>
                      </div>
                      {needsAction.map(renderInboxItem)}
                    </div>
                  )}
                  {readyToGo.length > 0 && (
                    <div className="mb-1">
                      <div className="flex items-center gap-1.5 px-3 py-1.5 mb-0.5">
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        <span className="text-[10px] font-bold text-emerald-600/80 uppercase tracking-wider">Klaar voor planning</span>
                        <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">{readyToGo.length}</Badge>
                        {readyToGo.length === 1 ? (
                          <Button
                            size="sm"
                            className="h-6 text-[10px] gap-1 bg-emerald-600 hover:bg-emerald-700 text-white ml-auto px-2.5 shadow-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedId(readyToGo[0].id);
                              const f = formData[readyToGo[0].id];
                              if (f) createOrderMutation.mutate({ id: readyToGo[0].id, form: f });
                            }}
                          >
                            <Zap className="h-2.5 w-2.5" /> Direct inplannen
                          </Button>
                        ) : readyToGo.length > 1 ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-[10px] gap-1 text-emerald-600 border-emerald-200 hover:bg-emerald-50 ml-auto px-2.5"
                            onClick={() => {
                              readyToGo.forEach(d => {
                                const f = formData[d.id];
                                if (f) createOrderMutation.mutate({ id: d.id, form: f });
                              });
                            }}
                          >
                            <Zap className="h-2.5 w-2.5" /> Alle {readyToGo.length} inplannen
                          </Button>
                        ) : null}
                      </div>
                      {readyToGo.map(renderInboxItem)}
                    </div>
                  )}
                </>
              );
            })()}
            
            {filtered.length === 0 && (
              <div className="text-center py-16">
                <div className="h-14 w-14 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-3"><InboxIcon className="h-6 w-6 text-muted-foreground/30" /></div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Geen aanvragen</p>
                <p className="text-[11px] text-muted-foreground/60">Alle orders zijn verwerkt</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </ResizablePanel>

      <ResizableHandle withHandle />

      {/* ─── Middle: Source Email ─── */}
      {selected && form ? (
        <>
          <ResizablePanel defaultSize={35} minSize={20} maxSize={50} className={cn(
            "flex flex-col min-w-0",
            mobileView !== "source" && "hidden md:flex"
          )}>
            {/* Mobile back + next buttons */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-border/30 bg-card md:hidden">
              <Button variant="ghost" size="sm" className="h-8 text-[11px] gap-1" onClick={() => setMobileView("list")}>
                <ArrowLeft className="h-3.5 w-3.5" /> Inbox
              </Button>
              <Button size="sm" className="h-8 text-[11px] gap-1" onClick={() => setMobileView("detail")}>
                Order <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
            <SourcePanel selected={selected} form={form} onParseResult={(data) => {
              if (!selected) return;
              const { result: enriched, enrichments } = enrichAddresses(data);
              setFormData((prev) => ({ ...prev, [selected.id]: { ...prev[selected.id], ...enriched } }));
              if (enrichments.length > 0) toast({ title: "Adresboek verrijking", description: enrichments.join(". ") });
            }} />
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* ─── Right: Order Form ─── */}
          <ResizablePanel defaultSize={40} minSize={25} className={cn(
            "flex flex-col min-w-0 bg-background",
            mobileView !== "detail" && "hidden md:flex"
          )}>
            {/* Header Bar */}
            <div className="px-4 py-2.5 border-b border-border/30 bg-card space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <Button variant="ghost" size="icon" className="md:hidden h-7 w-7 shrink-0" onClick={() => setMobileView("source")}>
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Package className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-foreground leading-tight truncate">
                      Order <span className="font-mono text-primary">#{selected.order_number}</span>
                      <span className="text-muted-foreground font-normal text-xs ml-1.5 hidden sm:inline">{selected.client_name || "Onbekende klant"}</span>
                    </h2>
                  </div>
                  
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {(() => {
                    const dl = getDeadlineInfo(selected.received_at);
                    if (dl.urgency === "neutral") return null;
                    return (
                      <span className={cn(
                        "inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md",
                        dl.urgency === "red" && "bg-destructive/10 text-destructive",
                        dl.urgency === "amber" && "bg-amber-500/10 text-amber-600",
                        dl.urgency === "green" && "bg-emerald-500/10 text-emerald-600",
                      )}>
                        <Timer className="h-3 w-3" />
                        <span className="hidden sm:inline">{dl.label}</span>
                      </span>
                    );
                  })()}
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive h-8 w-8" onClick={handleDelete} disabled={deleteMutation.isPending}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" className="h-8 text-[11px] gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm" onClick={handleCreateOrder} disabled={createOrderMutation.isPending}>
                    {createOrderMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    <span className="hidden sm:inline">Order</span> Aanmaken
                  </Button>
                </div>
              </div>
            </div>

            {/* Extracted Data */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <ScrollArea className="flex-1">
                <div className="p-4 space-y-3">
                  {/* Thread Diff Banner */}
                  <ThreadDiffBanner order={selected} />

                  {/* Anomaly Warnings */}
                  <AnomalyWarnings anomalies={(selected.anomalies || []) as { field: string; value: number; avg_value: number; message: string }[]} />

                  {/* Confidence Ring — prominent */}
                  {selected.confidence_score != null && (
                    <ConfidenceRing score={selected.confidence_score} />
                  )}

                  {/* ── Route Section ── */}
                  <div className="rounded-xl bg-muted/20 p-4 space-y-3">
                    <div className="flex items-center gap-2 pb-1 border-b border-border/20">
                      <Route className="h-3.5 w-3.5 text-primary" />
                      <h4 className="text-[11px] font-bold text-foreground uppercase tracking-[0.08em]">Route</h4>
                    </div>
                    {(() => {
                      const aiScore = selected.confidence_score || 0;
                      const highAI = aiScore >= 85;
                      // At high AI confidence, filled fields are trusted
                      const getConfidence = (val: string | number | undefined | null, useAddressCheck = false): "high" | "medium" | "low" | "missing" => {
                        if (!val || val === "" || val === 0) return "missing";
                        if (highAI) return "high";
                        if (useAddressCheck && typeof val === "string" && isAddressIncomplete(val)) return "low";
                        return aiScore >= 60 ? "medium" : "low";
                      };
                      return (
                        <>
                          <FormField label="Transport Type" source={form.fieldSources?.transport_type} confidence={getConfidence(form.transportType)}>
                            <Select value={form.transportType} onValueChange={(v) => updateField("transportType", v)}>
                              <SelectTrigger className="h-9 text-xs rounded-lg bg-card"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="direct">Direct Transport</SelectItem>
                                <SelectItem value="warehouse-air">Warehouse → Air</SelectItem>
                              </SelectContent>
                            </Select>
                          </FormField>
                          
                          <FormField label="Ophaaladres" icon={MapPin} source={form.fieldSources?.pickup_address}
                            confidence={getConfidence(form.pickupAddress, true)}>
                             <div className="relative">
                               <AddressAutocomplete
                                 value={form.pickupAddress}
                                 onChange={(val) => updateField("pickupAddress", val)}
                                 placeholder={!form.pickupAddress ? "⚠ Niet gevonden in bericht" : "Voer ophaaladres in..."}
                                 className={cn("h-9 text-xs pr-9 rounded-lg", !form.pickupAddress ? "bg-destructive/5 border-destructive ring-1 ring-destructive/30 placeholder:text-destructive/50" : "bg-card")}
                               />
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button type="button" className="absolute right-2.5 top-1/2 -translate-y-1/2"
                                    onClick={() => {
                                      if (addressSuggestions?.pickup?.length) {
                                        setShowPickupSuggestions(prev => !prev);
                                      } else {
                                        const { enriched, matchedClient } = tryEnrichAddress(form.pickupAddress, clients);
                                        if (matchedClient) { updateField("pickupAddress", enriched); toast({ title: "Adresboek", description: `Verrijkt via "${matchedClient}"` }); }
                                        else toast({ title: "Adresboek", description: "Geen match gevonden", variant: "destructive" });
                                      }
                                    }}>
                                    <DatabaseZap className="h-3.5 w-3.5 text-primary/40 hover:text-primary transition-colors" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="left" className="text-[10px]">
                                  {addressSuggestions?.pickup?.length ? `${addressSuggestions.pickup.length} historische adressen` : "Zoek in adresboek"}
                                </TooltipContent>
                              </Tooltip>
                              <AnimatePresence>
                                <AddressSuggestionsDropdown
                                  suggestions={addressSuggestions?.pickup || []}
                                  isOpen={showPickupSuggestions}
                                  onClose={() => setShowPickupSuggestions(false)}
                                  onSelect={(addr) => updateField("pickupAddress", addr)}
                                />
                              </AnimatePresence>
                            </div>
                            {!form.pickupAddress && addressSuggestions?.pickup && addressSuggestions.pickup.length > 0 && (
                              <button
                                className="mt-1.5 text-[10px] text-primary font-medium hover:underline flex items-center gap-1 bg-primary/5 rounded-md px-2 py-1.5 border border-primary/15 w-full text-left"
                                onClick={() => { updateField("pickupAddress", addressSuggestions.pickup[0].address); toast({ title: "Adres ingevuld", description: `Meest gebruikte adres voor deze klant (${addressSuggestions.pickup[0].frequency}× eerder)` }); }}
                              >
                                <Sparkles className="h-3 w-3 shrink-0" />
                                <span className="flex-1 truncate">
                                  <span className="text-muted-foreground">Voorstel op basis van {addressSuggestions.orderCount || addressSuggestions.pickup[0].frequency} eerdere orders:</span>{" "}
                                  <span className="font-semibold text-foreground">{addressSuggestions.pickup[0].address}</span>
                                </span>
                              </button>
                            )}
                            {!form.pickupAddress && (!addressSuggestions?.pickup || addressSuggestions.pickup.length === 0) && selected?.client_name && (
                              <p className="mt-1 text-[10px] text-muted-foreground/60 italic">Geen historische ophaal­adressen gevonden voor {selected.client_name}</p>
                            )}
                          </FormField>

                          <FormField label="Afleveradres" icon={MapPin} source={form.fieldSources?.delivery_address}
                            confidence={getConfidence(form.deliveryAddress, true)}>
                             <div className="relative">
                               <AddressAutocomplete
                                 value={form.deliveryAddress}
                                 onChange={(val) => updateField("deliveryAddress", val)}
                                 placeholder={!form.deliveryAddress ? "⚠ Niet gevonden in bericht" : "Voer afleveradres in..."}
                                 className={cn("h-9 text-xs pr-9 rounded-lg", !form.deliveryAddress ? "bg-destructive/5 border-destructive ring-1 ring-destructive/30 placeholder:text-destructive/50" : "bg-card")}
                               />
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button type="button" className="absolute right-2.5 top-1/2 -translate-y-1/2"
                                    onClick={() => {
                                      if (addressSuggestions?.delivery?.length) {
                                        setShowDeliverySuggestions(prev => !prev);
                                      } else {
                                        const { enriched, matchedClient } = tryEnrichAddress(form.deliveryAddress, clients);
                                        if (matchedClient) { updateField("deliveryAddress", enriched); toast({ title: "Adresboek", description: `Verrijkt via "${matchedClient}"` }); }
                                        else toast({ title: "Adresboek", description: "Geen match gevonden", variant: "destructive" });
                                      }
                                    }}>
                                    <DatabaseZap className="h-3.5 w-3.5 text-primary/40 hover:text-primary transition-colors" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="left" className="text-[10px]">
                                  {addressSuggestions?.delivery?.length ? `${addressSuggestions.delivery.length} historische adressen` : "Zoek in adresboek"}
                                </TooltipContent>
                              </Tooltip>
                              <AnimatePresence>
                                <AddressSuggestionsDropdown
                                  suggestions={addressSuggestions?.delivery || []}
                                  isOpen={showDeliverySuggestions}
                                  onClose={() => setShowDeliverySuggestions(false)}
                                  onSelect={(addr) => updateField("deliveryAddress", addr)}
                                />
                              </AnimatePresence>
                            </div>
                            {!form.deliveryAddress && addressSuggestions?.delivery && addressSuggestions.delivery.length > 0 && (
                              <button
                                className="mt-1.5 text-[10px] text-primary font-medium hover:underline flex items-center gap-1 bg-primary/5 rounded-md px-2 py-1.5 border border-primary/15 w-full text-left"
                                onClick={() => { updateField("deliveryAddress", addressSuggestions.delivery[0].address); toast({ title: "Adres ingevuld", description: `Meest gebruikte adres voor deze klant (${addressSuggestions.delivery[0].frequency}× eerder)` }); }}
                              >
                                <Sparkles className="h-3 w-3 shrink-0" />
                                <span className="flex-1 truncate">
                                  <span className="text-muted-foreground">Voorstel op basis van {addressSuggestions.orderCount || addressSuggestions.delivery[0].frequency} eerdere orders:</span>{" "}
                                  <span className="font-semibold text-foreground">{addressSuggestions.delivery[0].address}</span>
                                </span>
                              </button>
                            )}
                            {!form.deliveryAddress && (!addressSuggestions?.delivery || addressSuggestions.delivery.length === 0) && selected?.client_name && (
                              <p className="mt-1 text-[10px] text-muted-foreground/60 italic">Geen historische aflever­adressen gevonden voor {selected.client_name}</p>
                            )}
                          </FormField>
                        </>
                      );
                    })()}
                  </div>

                  {/* ── Lading Section ── */}
                  <div className="rounded-xl bg-muted/20 p-4 space-y-3">
                    <div className="flex items-center gap-2 pb-1 border-b border-border/20">
                      <Package className="h-3.5 w-3.5 text-primary" />
                      <h4 className="text-[11px] font-bold text-foreground uppercase tracking-[0.08em]">Lading</h4>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <FormField label="Aantal" source={form.fieldSources?.quantity} confidence={form.quantity ? "high" : "missing"}>
                        <Input type="number" className="h-9 text-xs rounded-lg bg-card" value={form.quantity} onChange={(e) => updateField("quantity", Number(e.target.value))} />
                      </FormField>
                      <FormField label="Eenheid" source={form.fieldSources?.unit} confidence="high">
                        <Select value={form.unit} onValueChange={(v) => updateField("unit", v)}>
                          <SelectTrigger className="h-9 text-xs rounded-lg bg-card"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Pallets">Pallets</SelectItem>
                            <SelectItem value="Colli">Colli</SelectItem>
                            <SelectItem value="Box">Box</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormField>
                      <FormField label="Gewicht (kg)" icon={Scale} source={form.fieldSources?.weight_kg}
                        confidence={!form.weight ? "missing" : "high"}>
                        <Input className={cn("h-9 text-xs rounded-lg", !form.weight ? "bg-destructive/5 border-destructive ring-1 ring-destructive/30 placeholder:text-destructive/50" : "bg-card")}
                          value={form.weight} onChange={(e) => updateField("weight", e.target.value)} placeholder={!form.weight ? "⚠ Niet gevonden" : "—"} />
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <Checkbox id={`pu-${selected.id}`} checked={form.perUnit} onCheckedChange={(c) => updateField("perUnit", !!c)} className="h-3 w-3" />
                          <label htmlFor={`pu-${selected.id}`} className="text-[10px] text-muted-foreground cursor-pointer">Per eenheid</label>
                        </div>
                        {form.perUnit && form.weight && form.quantity > 0 && (
                          <div className="mt-2 px-2.5 py-1.5 rounded-md bg-primary/5 border border-primary/10">
                            <p className="text-[10px] text-primary font-semibold">Totaal: {form.quantity * Number(form.weight)} kg</p>
                          </div>
                        )}
                      </FormField>
                      <FormField label="Afmetingen (LxBxH)" icon={Ruler} source={form.fieldSources?.dimensions}
                        confidence={!form.dimensions ? "missing" : "high"}>
                        <Input className={cn("h-9 text-xs rounded-lg", !form.dimensions ? "bg-destructive/5 border-destructive ring-1 ring-destructive/30 placeholder:text-destructive/50" : "bg-card")}
                          value={form.dimensions} onChange={(e) => updateField("dimensions", e.target.value)} placeholder={!form.dimensions ? "⚠ Niet gevonden" : "—"} />
                      </FormField>
                    </div>
                  </div>

                  {/* ── Vereisten Section ── */}
                  <div className="rounded-xl bg-muted/20 p-4 space-y-3">
                    <div className="flex items-center gap-2 pb-1 border-b border-border/20">
                      <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                      <h4 className="text-[11px] font-bold text-foreground uppercase tracking-[0.08em]">Vereisten</h4>
                      {form.requirements.length === 0 && (
                        <span className="text-[9px] text-muted-foreground/60 ml-auto italic">Geen vereisten gedetecteerd in bericht</span>
                      )}
                    </div>
                    {/* Active requirements shown prominently */}
                    {form.requirements.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {requirementOptions.filter(r => form.requirements.includes(r.id)).map((req) => (
                          <button
                            key={req.id}
                            onClick={() => toggleRequirement(req.id)}
                            className={cn("flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border shadow-sm transition-all duration-200", req.color, "border-current/20")}
                          >
                            <req.icon className="h-3.5 w-3.5" />
                            {req.label}
                            <CheckCircle2 className="h-3 w-3 ml-1" />
                          </button>
                        ))}
                      </div>
                    )}
                    {/* Inactive requirements as compact row */}
                    {requirementOptions.filter(r => !form.requirements.includes(r.id)).length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {requirementOptions.filter(r => !form.requirements.includes(r.id)).map((req) => (
                          <button
                            key={req.id}
                            onClick={() => toggleRequirement(req.id)}
                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium text-muted-foreground/40 border border-border/15 hover:border-border/40 hover:text-muted-foreground transition-all"
                          >
                            <req.icon className="h-3 w-3" />
                            {req.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ── Interne Notitie ── */}
                  <div className="rounded-xl bg-muted/20 p-4 space-y-2">
                    <div className="flex items-center gap-2 pb-1 border-b border-border/20">
                      <StickyNote className="h-3.5 w-3.5 text-muted-foreground" />
                      <h4 className="text-[11px] font-bold text-foreground uppercase tracking-[0.08em]">Interne Notitie</h4>
                      <span className="text-[9px] text-muted-foreground/50 ml-auto">Zichtbaar voor planners</span>
                    </div>
                    <Textarea
                      placeholder="Bijv: Klant gebeld, mag ook iets later geleverd worden..."
                      value={form.internalNote}
                      onChange={(e) => updateField("internalNote", e.target.value)}
                      onBlur={() => {
                        if (selected) saveNoteMutation.mutate({ id: selected.id, note: form.internalNote });
                      }}
                      className="text-xs min-h-[64px] rounded-lg resize-none bg-card border-border/30 placeholder:text-muted-foreground/40"
                    />
                  </div>

                  {/* Duplicate warning */}
                  {selected && duplicateMap.has(selected.id) && (
                    <div className="rounded-xl border border-amber-300/40 bg-amber-50/50 p-3.5">
                      <div className="flex items-start gap-2.5">
                        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-semibold text-amber-800">Mogelijk duplicaat</p>
                          <p className="text-[11px] text-amber-600/80 mt-0.5 leading-relaxed">
                            Lijkt op {duplicateMap.get(selected.id)!.join(", ")} — zelfde klant en adres binnen {DUPLICATE_WINDOW_MINUTES} min.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Capacity warning */}
                  {capacityWarning.hasWarning && (
                    <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3.5">
                      <div className="flex items-start gap-2.5">
                        <TriangleAlert className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-semibold text-destructive">Capaciteit conflict</p>
                          <p className="text-[11px] text-destructive/80 mt-0.5 leading-relaxed">{capacityWarning.message}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </ResizablePanel>
        </>
      ) : (
        <ResizablePanel defaultSize={75} minSize={50}>
          <div className="flex-1 flex items-center justify-center bg-background h-full">
            <div className="text-center">
              <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4"><InboxIcon className="h-7 w-7 text-muted-foreground/30" /></div>
              <p className="text-sm font-semibold text-muted-foreground mb-1">Alles verwerkt</p>
              <p className="text-[11px] text-muted-foreground/60">Er zijn geen openstaande aanvragen</p>
            </div>
          </div>
        </ResizablePanel>
      )}
      </ResizablePanelGroup>
    </div>
  );
}
