import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Search, Upload, FlaskConical, CheckCircle2, Loader2, Inbox as InboxIcon, CircleAlert, Send, FileEdit } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useFleetVehicles } from "@/hooks/useFleet";
import { useAddressSuggestions } from "@/hooks/useAddressSuggestions";
import { type ClientRecord, type OrderDraft, type FormState } from "@/components/inbox/types";
import { SourcePanel } from "@/components/inbox/InboxSourcePanel";
import { InboxListItem } from "@/components/inbox/InboxListItem";
import { InboxReviewPanel } from "@/components/inbox/InboxReviewPanel";
import { orderToForm, normaliseRequirements, TEST_SCENARIOS, getDeadlineInfo, findDuplicates, getCapacityWarning, tryEnrichAddress, getFormErrors } from "@/components/inbox/utils";
import { saveCorrection } from "@/hooks/useAIFeedback";
import { useTenant } from "@/contexts/TenantContext";

// Keep local orderToForm for backwards compat
function _orderToForm(order: OrderDraft): FormState {
  return {
    transportType: order.transport_type?.toLowerCase().replace("_", "-") || "direct",
    pickupAddress: order.pickup_address || "",
    deliveryAddress: order.delivery_address || "",
    quantity: order.quantity || 0,
    unit: order.unit || "Pallets",
    weight: order.weight_kg ? order.weight_kg.toString() : "",
    dimensions: order.dimensions || "",
    requirements: normaliseRequirements(order.requirements || []),
    perUnit: order.is_weight_per_unit,
    internalNote: order.internal_note || "",
    fieldSources: {},
  };
}

// Normalise AI-extracted requirement names to match our defined IDs
const REQUIREMENT_ALIASES: Record<string, string> = {
  "klep": "Laadklep", "laadklep": "Laadklep",
  "koeling": "Koeling", "koel": "Koeling", "gekoeld": "Koeling",
  "adr": "ADR", "gevaarlijk": "ADR", "gevaarlijke stoffen": "ADR",
  "douane": "Douane", "customs": "Douane",
};

function normaliseRequirements(reqs: string[]): string[] {
  return reqs.map(r => REQUIREMENT_ALIASES[r.toLowerCase()] || r);
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
    return { label: "Urgent", urgency: "red", minutesLeft: 0 };
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
    <Badge variant="outline" className="text-xs h-4 py-0 font-normal border-primary/20 bg-primary/5 text-primary">
      {source.type === 'ai' ? 'AI' : 'Draft'}
    </Badge>
  );
}

function FormField({ label, icon: Icon, children, className, source, warning, confidence }: { label: string; icon?: any; children: React.ReactNode; className?: string; source?: FieldSource; warning?: string; confidence?: "high" | "medium" | "low" | "missing" }) {
  const hasIssue = warning || confidence === "low" || confidence === "missing";
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between gap-1">
        <Label className={cn("text-xs font-medium flex items-center gap-1.5", hasIssue ? "text-destructive font-semibold" : "text-muted-foreground")}>
          {Icon && <Icon className="h-3 w-3" />}
          {label}
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
        <p className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider flex items-center gap-1">
          <Clock className="h-2.5 w-2.5" /> Historische adressen
        </p>
      </div>
      {suggestions.map((s, i) => (
        <button
          key={i}
          className="w-full text-left px-3 py-2 hover:bg-primary/5 transition-colors border-b border-border/10 last:border-0"
          onClick={() => { onSelect(s.address); onClose(); }}
        >
          <p className="text-xs font-medium text-foreground truncate">{s.address}</p>
          <p className="text-xs text-muted-foreground/60">{s.frequency}× gebruikt</p>
        </button>
      ))}
    </motion.div>
  );
}

export default function Inbox() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { tenant } = useTenant();
  const [selectedId, setSelectedId] = useState<string>("");
  const [formData, setFormData] = useState<Record<string, FormState>>({});
  const [search, setSearch] = useState("");
  const [sidebarFilter, setSidebarFilter] = useState<"alle" | "actie" | "klaar" | "verzonden" | "concepten">("alle");
  const [filterDate, setFilterDate] = useState("");
  const [filterClient, setFilterClient] = useState("");
  const [filterType, setFilterType] = useState("");
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
      const text = await file.text();

      // Parse EML headers
      const headerEnd = text.indexOf("\n\n") || text.indexOf("\r\n\r\n");
      const headerPart = text.slice(0, headerEnd);
      const bodyPart = text.slice(headerEnd).trim();

      const getHeader = (name: string) => {
        const match = headerPart.match(new RegExp(`^${name}:\\s*(.+)$`, "mi"));
        return match ? match[1].trim() : "";
      };

      const from = getHeader("From");
      const subject = getHeader("Subject");
      const emailFrom = from.match(/<(.+?)>/)?.[1] || from;
      const clientName = from.replace(/<.*>/, "").replace(/"/g, "").trim() || emailFrom;

      // Strip MIME headers from body if present
      let emailBody = bodyPart;
      if (emailBody.startsWith("Content-Type:") || emailBody.startsWith("--")) {
        // Simple MIME: find the text/plain part
        const plainMatch = emailBody.match(/Content-Type:\s*text\/plain[^]*?\n\n([\s\S]*?)(?=\n--|\n\nContent-Type:|$)/i);
        if (plainMatch) emailBody = plainMatch[1].trim();
        else emailBody = bodyPart.replace(/Content-[A-Za-z-]+:.*\n/g, "").trim();
      }

      const tenantId = tenant?.id || "00000000-0000-0000-0000-000000000001";
      const { data: newOrder, error } = await supabase.from("orders").insert({
        tenant_id: tenantId,
        status: "DRAFT",
        source_email_from: emailFrom,
        source_email_subject: subject,
        source_email_body: emailBody,
        client_name: clientName,
      }).select().single();

      if (error) throw error;
      toast({ title: "E-mail geïmporteerd", description: `"${subject}" van ${clientName}` });
      queryClient.invalidateQueries({ queryKey: ["draft-orders"] });
      setSelectedId(newOrder.id);
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
      const subjectLine = scenario.subject || `Test: ${scenario.label}`;
      const fromEmail = scenario.from || "test@royaltycargo.nl";
      const clientName = scenario.client || "Test Scenario";

      // Check for existing DRAFT with same subject to prevent duplicates
      const { data: existing } = await supabase
        .from("orders")
        .select("id")
        .eq("status", "DRAFT")
        .eq("source_email_subject", subjectLine)
        .limit(1);

      if (existing && existing.length > 0) {
        setSelectedId(existing[0].id);
        toast({ title: "Al aanwezig", description: `"${scenario.label}" staat al in de inbox.` });
        setLoadingScenario(null);
        return;
      }

      const tenantId = tenant?.id || "00000000-0000-0000-0000-000000000001";
      const { data: newOrder, error } = await supabase.from("orders").insert({
        tenant_id: tenantId,
        status: "DRAFT", source_email_from: fromEmail, source_email_subject: subjectLine,
        source_email_body: scenario.email, client_name: clientName,
      }).select().single();
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["draft-orders"] });
      setSelectedId(newOrder.id);
      toast({ title: "Test data geladen", description: `${scenario.label} - AI analyse wordt gestart...` });

      // Call parse-order edge function for AI extraction
      const { data: parseResponse, error: parseError } = await supabase.functions.invoke("parse-order", {
        body: { emailBody: scenario.email, pdfUrls: [], threadContext: null, tenantId },
      });
      if (parseError) throw new Error(`Parse-order fout: ${parseError.message}`);
      const parseData = parseResponse;
      const ext = parseData?.extracted || parseData;

      const parsedForm: FormState = {
        transportType: ext.transport_type || "direct", pickupAddress: ext.pickup_address || "", deliveryAddress: ext.delivery_address || "",
        quantity: ext.quantity || 0, unit: ext.unit || "Pallets", weight: ext.weight_kg?.toString() || "", dimensions: ext.dimensions || "",
        requirements: normaliseRequirements(ext.requirements || []), perUnit: ext.is_weight_per_unit || false, internalNote: "", fieldSources: {},
      };
      const { result: enriched, enrichments } = enrichAddresses(parsedForm);
      setFormData((prev) => ({ ...prev, [newOrder.id]: enriched as FormState }));
      if (enrichments.length > 0) toast({ title: "Adresboek verrijking", description: enrichments.join(". ") });
      const enrichedForm = enriched as FormState;
      await supabase.from("orders").update({
        confidence_score: ext.confidence_score, client_name: ext.client_name || clientName, transport_type: ext.transport_type,
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

  // Verzonden: orders met follow_up_sent_at of status != DRAFT
  const { data: sentOrders = [] } = useQuery({
    queryKey: ["sent-orders"],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("*")
        .not("follow_up_sent_at", "is", null)
        .order("follow_up_sent_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data as unknown as OrderDraft[];
    },
    enabled: sidebarFilter === "verzonden",
  });

  // Concepten: drafts met follow_up_draft (onverzonden follow-ups)
  const { data: conceptOrders = [] } = useQuery({
    queryKey: ["concept-orders"],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("*")
        .eq("status", "DRAFT").not("follow_up_draft", "is", null)
        .is("follow_up_sent_at", null)
        .order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data as unknown as OrderDraft[];
    },
    enabled: sidebarFilter === "concepten",
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
      // Try PENDING first (standard flow), fallback to OPEN
      const { error } = await supabase.from("orders").update({
        status: "PENDING", transport_type: form.transportType.toUpperCase().replace("-", "_"), pickup_address: form.pickupAddress,
        delivery_address: form.deliveryAddress, quantity: form.quantity, unit: form.unit,
        weight_kg: form.weight ? Number(form.weight) : null, is_weight_per_unit: form.perUnit, dimensions: form.dimensions || null,
        requirements: form.requirements, internal_note: form.internalNote || null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: async (_, { id }) => {
      const order = drafts.find((d) => d.id === id);
      toast({ title: "Order aangemaakt", description: `Order #${order?.order_number} is nu actief` });
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
            toast({ title: "Bevestiging verzonden", description: `Gestuurd naar ${order.source_email_from}` });
          }
        } catch (e: any) {
          console.error("Confirmation email error:", e);
        }
      }
    },
    onError: (error: any) => {
      console.error("Create order error:", error);
      toast({ title: "Order aanmaken mislukt", description: error.message || "Controleer de gegevens en probeer opnieuw", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("orders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["draft-orders"] }); },
  });

  const saveNoteMutation = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      const { error } = await supabase.from("orders").update({ internal_note: note || null }).eq("id", id);
      if (error) throw error;
    },
  });

  const saveFormMutation = useMutation({
    mutationFn: async ({ id, form: f }: { id: string; form: FormState }) => {
      const { error } = await supabase.from("orders").update({
        transport_type: f.transportType.toUpperCase().replace("-", "_"), pickup_address: f.pickupAddress,
        delivery_address: f.deliveryAddress, quantity: f.quantity, unit: f.unit,
        weight_kg: f.weight ? Number(f.weight) : null, is_weight_per_unit: f.perUnit,
        dimensions: f.dimensions || null, requirements: f.requirements, internal_note: f.internalNote || null,
      }).eq("id", id);
      if (error) throw error;
    },
  });

  const selected = drafts.find((d) => d.id === selectedId);
  const form = selected ? formData[selected.id] : null;

  // Address suggestions based on selected order's client
  const { data: addressSuggestions } = useAddressSuggestions(selected?.client_name || null);

  // Auto-extract disabled — use "Extraheer" button instead for stability

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
    // Save AI correction if this field was AI-extracted and the user changed it
    if (selected.confidence_score && selected.confidence_score > 0 && form) {
      const oldValue = String((form as any)[field] || "");
      const newValue = String(value || "");
      if (oldValue && newValue && oldValue !== newValue) {
        saveCorrection(selected.id, selected.client_name || "", field, oldValue, newValue);
      }
    }
    setFormData((prev) => ({ ...prev, [selected.id]: { ...prev[selected.id], [field]: value } }));
  };

  const toggleRequirement = (req: string) => {
    if (!form) return;
    const reqs = form.requirements.includes(req) ? form.requirements.filter((r) => r !== req) : [...form.requirements, req];
    updateField("requirements", reqs);
  };

  const formHasErrors = !form?.pickupAddress || !form?.deliveryAddress || !form?.quantity || !form?.weight;

  const handleAutoSave = useCallback(() => {
    if (!selected || !formData[selected.id]) return;
    saveFormMutation.mutate({ id: selected.id, form: formData[selected.id] });
  }, [selected, formData]);

  const handleDelete = () => { if (!selected) return; deleteMutation.mutate(selected.id); };

  // Pick source based on sidebar filter
  const sourceOrders = sidebarFilter === "verzonden" ? sentOrders : sidebarFilter === "concepten" ? conceptOrders : drafts;

  const filtered = useMemo(() => sourceOrders.filter((d) => {
    // Search filter
    const matchesSearch = !search || (d.client_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (d.source_email_subject || "").toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;

    // Date filter
    if (filterDate) {
      const orderDate = d.received_at ? new Date(d.received_at) : null;
      if (!orderDate) return false;
      const now = new Date();
      if (filterDate === "today" && orderDate.toDateString() !== now.toDateString()) return false;
      if (filterDate === "week") {
        const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
        if (orderDate < weekAgo) return false;
      }
      if (filterDate === "month") {
        const monthAgo = new Date(now); monthAgo.setMonth(monthAgo.getMonth() - 1);
        if (orderDate < monthAgo) return false;
      }
    }

    // Client filter
    if (filterClient && d.client_name !== filterClient) return false;

    // Type filter
    if (filterType && d.thread_type !== filterType) return false;

    // Sidebar filter
    if (sidebarFilter === "alle" || sidebarFilter === "verzonden" || sidebarFilter === "concepten") return true;
    const hasMissing = (d.missing_fields || []).length > 0;
    const score = d.confidence_score || 0;
    const isReady = !hasMissing && score >= 80;
    if (sidebarFilter === "klaar") return isReady;
    return !isReady;
  }), [sourceOrders, search, filterDate, filterClient, filterType, sidebarFilter]);

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

  // ─── Render ───

  // Split into action needed vs ready
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

  // handleCreateOrder — must be after filtered
  const handleCreateOrder = () => {
    if (!selected || !form || formHasErrors) return;
    const currentIdx = filtered.findIndex(d => d.id === selected.id);
    createOrderMutation.mutate({ id: selected.id, form }, {
      onSuccess: () => {
        toast({ title: "Order aangemaakt", description: `Order #${selected.order_number} is goedgekeurd` });
        const nextItem = filtered[currentIdx + 1] || filtered[currentIdx - 1];
        if (nextItem) setSelectedId(nextItem.id);
        else setSelectedId("");
      },
    });
  };

  // Keyboard navigation
  const filteredRef = useRef(filtered);
  filteredRef.current = filtered;
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const list = filteredRef.current;
      if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        const idx = list.findIndex(d => d.id === selectedId);
        if (idx > 0) setSelectedId(list[idx - 1].id);
      } else if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        const idx = list.findIndex(d => d.id === selectedId);
        if (idx < list.length - 1) setSelectedId(list[idx + 1].id);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedId]);

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

  return (
    <div className="flex h-[calc(100vh-5rem)] -m-4 md:-m-6 bg-background">
      <input ref={fileInputRef} type="file" accept=".eml,.msg" className="hidden"
        onChange={(e) => { const file = e.target.files?.[0]; if (file) handleImportEmail(file); }} />

      {/* ─── Left Sidebar ─── */}
      <div className="w-56 bg-white border-r border-gray-200 flex flex-col p-4 gap-2 shrink-0 hidden lg:flex">
        <div className="mb-4 px-2">
          <p className="text-primary font-black tracking-tighter text-sm uppercase">Dispatch Hub</p>
          <p className="text-[11px] text-gray-400">{tenant?.name || "Royalty Cargo"}</p>
        </div>
        <nav className="flex flex-col gap-0.5 flex-1">
          {[
            { key: "alle" as const, label: "Alle", icon: InboxIcon, count: drafts.length },
            { key: "actie" as const, label: "Actie nodig", icon: CircleAlert, count: needsAction.length },
            { key: "klaar" as const, label: "Klaar", icon: CheckCircle2, count: readyToGo.length },
            { key: "verzonden" as const, label: "Verzonden", icon: Send, count: 0 },
            { key: "concepten" as const, label: "Concepten", icon: FileEdit, count: 0 },
          ].map(item => (
            <button key={item.key} onClick={() => setSidebarFilter(item.key)}
              className={cn("rounded-lg flex items-center gap-2.5 px-3 py-2 text-sm font-medium transition-all w-full whitespace-nowrap",
                sidebarFilter === item.key ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:text-gray-900 hover:bg-gray-50")}>
              <item.icon className={cn("h-4 w-4 shrink-0", sidebarFilter === item.key && item.key === "actie" && "text-primary")} />
              <span className="flex-1 text-left truncate">{item.label}</span>
              {item.count > 0 && (
                <span className={cn("text-[10px] font-bold shrink-0 min-w-[20px] text-center",
                  item.key === "actie" && item.count > 0 ? "bg-primary text-white px-1.5 py-0.5 rounded-full" : "text-gray-400"
                )}>{item.count}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="mt-auto border-t border-gray-100 pt-4 space-y-1">
          <button className="text-gray-400 hover:text-gray-700 hover:bg-gray-50 rounded-lg flex items-center gap-3 px-3 py-2 text-xs font-medium transition-all w-full"
            onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" />
            Importeer .eml
          </button>
          <button className="text-gray-400 hover:text-primary hover:bg-primary/5 rounded-lg flex items-center gap-3 px-3 py-2 text-xs font-medium transition-all w-full"
            disabled={loadingScenario !== null}
            onClick={async () => {
              for (let i = 0; i < TEST_SCENARIOS.length; i++) {
                await handleLoadTestScenario(i);
              }
            }}>
            <FlaskConical className="h-3.5 w-3.5" />
            {loadingScenario !== null ? "Laden..." : "Laad testdata"}
          </button>
        </div>
      </div>

      {/* ─── Resizable 3-column content ─── */}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* Mail List */}
        <ResizablePanel defaultSize={22} minSize={15} maxSize={35}>
          <div className="flex flex-col h-full bg-white" style={{ minWidth: 0, overflow: "hidden" }}>
            <div className="h-14 px-4 flex items-center justify-between border-b border-gray-200 bg-white shrink-0">
              <div>
                <h3 className="text-lg font-bold tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Inbox</h3>
                <p className="text-[10px] text-gray-400">Laatst gesynchroniseerd: 2 min geleden</p>
              </div>
            </div>
            <div className="p-3 space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input placeholder="Zoek op order of klant..." value={search} onChange={(e) => setSearch(e.target.value)}
                  className="w-full h-9 pl-9 pr-3 rounded-lg border border-gray-200 bg-gray-50 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-primary focus:bg-white transition-all" />
              </div>
              {/* Filter dropdowns — controlled */}
              <div className="flex gap-1.5">
                <select value={filterDate} onChange={(e) => setFilterDate(e.target.value)}
                  className="h-7 text-xs border border-gray-200 rounded-md bg-white text-gray-600 px-2 focus:ring-1 focus:ring-primary focus:border-primary">
                  <option value="">Datum</option>
                  <option value="today">Vandaag</option>
                  <option value="week">Deze week</option>
                  <option value="month">Deze maand</option>
                </select>
                <select value={filterClient} onChange={(e) => setFilterClient(e.target.value)}
                  className="h-7 text-xs border border-gray-200 rounded-md bg-white text-gray-600 px-2 focus:ring-1 focus:ring-primary focus:border-primary">
                  <option value="">Klant</option>
                  {[...new Set(drafts.map(d => d.client_name).filter(Boolean))].map(name => (
                    <option key={name} value={name!}>{name}</option>
                  ))}
                </select>
                <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
                  className="h-7 text-xs border border-gray-200 rounded-md bg-white text-gray-600 px-2 focus:ring-1 focus:ring-primary focus:border-primary">
                  <option value="">Type</option>
                  <option value="new">Nieuw</option>
                  <option value="update">Update</option>
                  <option value="cancellation">Annulering</option>
                </select>
              </div>
            </div>
            {/* Bulk action bar */}
            {bulkSelected.size > 0 && (
              <div className="px-3 py-2 bg-primary/5 border-b border-primary/20 flex items-center justify-between">
                <span className="text-xs font-semibold text-primary">{bulkSelected.size} geselecteerd</span>
                <div className="flex gap-1.5">
                  <button onClick={() => {
                    Array.from(bulkSelected).forEach(id => { const f = formData[id]; if (f && !getFormErrors(f)) createOrderMutation.mutate({ id, form: f }); });
                    setBulkSelected(new Set());
                  }} className="text-xs font-semibold text-green-600 hover:underline">Goedkeuren</button>
                  <button onClick={() => {
                    Array.from(bulkSelected).forEach(id => deleteMutation.mutate(id));
                    setBulkSelected(new Set());
                  }} className="text-xs font-semibold text-red-600 hover:underline">Verwijder</button>
                  <button onClick={() => setBulkSelected(new Set())} className="text-xs text-gray-400 hover:underline">Annuleer</button>
                </div>
              </div>
            )}
            <ScrollArea className="flex-1" style={{ minWidth: 0 }}>
              <div>
                {filtered.map(draft => (
                  <InboxListItem key={draft.id} draft={draft} isSelected={selectedId === draft.id}
                    isBulkChecked={bulkSelected.has(draft.id)}
                    onBulkToggle={(id) => setBulkSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; })}
                    onClick={() => { setSelectedId(draft.id); setMobileView("source"); }} />
                ))}
                {filtered.length === 0 && (
                  <div className="text-center py-16 px-4">
                    <InboxIcon className="h-8 w-8 text-gray-200 mx-auto mb-2" />
                    <p className="text-sm font-medium text-gray-400">Geen berichten</p>
                    <p className="text-xs text-gray-300 mt-1">Pas je filters aan of importeer een e-mail</p>
                  </div>
                )}
              </div>
            </ScrollArea>
            <div className="bg-white border-t border-gray-100 p-2 text-center shrink-0 hidden lg:block">
              <p className="text-[10px] text-gray-400 font-medium font-mono">↑↓ navigeren · Enter openen · Del archiveren</p>
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Email Panel + Review Panel */}
        {selected && form ? (
          <>
            <ResizablePanel defaultSize={45} minSize={25}>
              <div className="flex flex-col h-full bg-white" style={{ minWidth: 0, overflow: "hidden" }}>
                <SourcePanel selected={selected} form={form} onParseResult={(data) => {
                  if (!selected) return;
                  const { result: enriched, enrichments } = enrichAddresses(data);
                  setFormData((prev) => ({ ...prev, [selected.id]: { ...prev[selected.id], ...enriched } }));
                  if (enrichments.length > 0) toast({ title: "Adresboek verrijking", description: enrichments.join(". ") });
                }} />
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel defaultSize={33} minSize={20}>
              <InboxReviewPanel
                selected={selected}
                form={form}
                isCreatePending={createOrderMutation.isPending}
                addressSuggestions={addressSuggestions}
                onUpdateField={updateField}
                onToggleRequirement={toggleRequirement}
                onAutoSave={handleAutoSave}
                onCreateOrder={handleCreateOrder}
                onDelete={handleDelete}
              />
            </ResizablePanel>
          </>
        ) : (
          <ResizablePanel defaultSize={78}>
            <div className="flex-1 flex items-center justify-center bg-gray-50 h-full">
              <div className="text-center max-w-xs">
                <div className="h-16 w-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                  <InboxIcon className="h-8 w-8 text-gray-300" />
                </div>
                <p className="text-base font-semibold text-gray-700 mb-1">Selecteer een e-mail</p>
                <p className="text-sm text-gray-400 leading-relaxed">Kies een bericht uit de lijst om de inhoud te bekijken en te reviewen voor orderverwerking.</p>
                <div className="flex items-center justify-center gap-4 mt-4 text-xs text-gray-300">
                  <span>↑↓ navigeer</span>
                  <span>·</span>
                  <span>Enter open</span>
                </div>
              </div>
            </div>
          </ResizablePanel>
        )}
      </ResizablePanelGroup>
    </div>
  );
}
