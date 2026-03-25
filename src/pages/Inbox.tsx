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
import { mockVehicles } from "@/data/mockData";

interface ClientRecord {
  id: string;
  name: string;
  address: string | null;
  zipcode: string | null;
  city: string | null;
  country: string;
}

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
  internal_note: string | null;
  missing_fields: string[] | null;
  follow_up_draft: string | null;
  follow_up_sent_at: string | null;
  thread_type: string;
  parent_order_id: string | null;
  changes_detected: { field: string; old_value: string; new_value: string }[] | null;
  anomalies: { field: string; value: number; avg_value: number; message: string }[] | null;
}

type FieldSource = "email" | "pdf" | "both";
type FieldSources = Record<string, FieldSource>;

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
  internalNote: string;
  fieldSources: FieldSources;
}

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

const THREAD_TYPE_CONFIG: Record<string, { label: string; color: string; icon: any; listLabel: string; listColor: string }> = {
  new: { label: "Nieuw", color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: Plus, listLabel: "Nieuw", listColor: "text-emerald-700 bg-emerald-500/15 border-emerald-500/25" },
  update: { label: "Wijziging", color: "bg-blue-50 text-blue-700 border-blue-200", icon: ArrowLeft, listLabel: "Update", listColor: "text-violet-700 bg-violet-500/15 border-violet-500/25" },
  cancellation: { label: "Annulering", color: "bg-destructive/10 text-destructive border-destructive/20", icon: Trash2, listLabel: "Annulering", listColor: "text-destructive bg-destructive/10 border-destructive/20" },
  confirmation: { label: "Bevestiging", color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2, listLabel: "Bevestiging", listColor: "text-emerald-700 bg-emerald-500/15 border-emerald-500/25" },
  question: { label: "Vraag", color: "bg-violet-50 text-violet-700 border-violet-200", icon: CircleAlert, listLabel: "Vraag", listColor: "text-violet-700 bg-violet-500/15 border-violet-500/25" },
};

function ThreadDiffBanner({ order }: { order: OrderDraft }) {
  if (order.thread_type === "new" || !order.thread_type) return null;
  const config = THREAD_TYPE_CONFIG[order.thread_type];
  if (!config) return null;
  const changes = (order.changes_detected || []) as { field: string; old_value: string; new_value: string }[];

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-blue-200/60 bg-blue-50/50 p-4 space-y-2.5"
    >
      <div className="flex items-center gap-2">
        <div className={cn("inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-md border", config.color)}>
          <config.icon className="h-3 w-3" />
          E-mail Thread: {config.label}
        </div>
        {order.parent_order_id && (
          <span className="text-[10px] text-muted-foreground">
            Reactie op bestaande order
          </span>
        )}
      </div>

      {changes.length > 0 && (
        <div className="space-y-1.5">
          {changes.map((change, i) => (
            <div key={i} className="flex items-center gap-2 text-[12px] rounded-lg bg-white/80 border border-blue-100/60 px-3 py-2">
              <span className="text-muted-foreground font-medium min-w-[80px]">{FIELD_LABELS[change.field] || change.field}</span>
              <span className="text-destructive/70 line-through">{change.old_value}</span>
              <span className="text-muted-foreground">→</span>
              <span className="text-emerald-700 font-semibold">{change.new_value}</span>
            </div>
          ))}
        </div>
      )}

      {order.thread_type === "cancellation" && (
        <p className="text-[11px] text-destructive/80 font-medium">
          ⚠ Klant wil deze order annuleren. Controleer en verwerk handmatig.
        </p>
      )}
    </motion.div>
  );
}

function AnomalyWarnings({ anomalies }: { anomalies: { field: string; value: number; avg_value: number; message: string }[] }) {
  if (!anomalies || anomalies.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {anomalies.map((a, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.1 }}
          className="flex items-start gap-2.5 rounded-lg border border-amber-200/50 bg-amber-50/40 px-3 py-2"
        >
          <Bot className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-amber-800 font-medium leading-snug">{a.message}</p>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-[10px] text-amber-600/70">Huidige waarde: <strong>{a.value}</strong></span>
              <span className="text-[10px] text-amber-600/70">Gemiddeld: <strong>{a.avg_value}</strong></span>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

const requirementOptions = [
  { id: "Koeling", label: "Koeling", icon: ThermometerSnowflake, color: "text-sky-600 bg-sky-50 border-sky-200" },
  { id: "ADR", label: "ADR", icon: AlertTriangle, color: "text-amber-600 bg-amber-50 border-amber-200" },
  { id: "Laadklep", label: "Laadklep", icon: Truck, color: "text-violet-600 bg-violet-50 border-violet-200" },
  { id: "Douane", label: "Douane", icon: FileCheck, color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
];

function ConfidenceDot({ score }: { score: number }) {
  const isHigh = score >= 80;
  const isMedium = score >= 60 && score < 80;
  return (
    <span className={cn(
      "inline-block h-[6px] w-[6px] rounded-full shrink-0",
      isHigh && "bg-emerald-500",
      isMedium && "bg-amber-500",
      !isHigh && !isMedium && "bg-destructive"
    )} />
  );
}

function ConfidenceRing({ score }: { score: number }) {
  const isHigh = score >= 80;
  const isMedium = score >= 60 && score < 80;
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const colorClass = isHigh ? "text-emerald-600" : isMedium ? "text-amber-500" : "text-destructive";
  const strokeColor = isHigh ? "#059669" : isMedium ? "#f59e0b" : "hsl(var(--destructive))";
  const bgColor = isHigh ? "bg-emerald-50" : isMedium ? "bg-amber-50" : "bg-destructive/5";

  return (
    <div className={cn("flex items-center gap-3 rounded-xl px-3 py-2", bgColor)}>
      <div className="relative h-11 w-11 shrink-0">
        <svg className="h-11 w-11 -rotate-90" viewBox="0 0 52 52">
          <circle cx="26" cy="26" r={radius} fill="none" stroke="hsl(var(--border))" strokeWidth="2.5" opacity="0.3" />
          <circle cx="26" cy="26" r={radius} fill="none" stroke={strokeColor} strokeWidth="2.5"
            strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
            className="transition-all duration-700 ease-out" />
        </svg>
        <span className={cn("absolute inset-0 flex items-center justify-center text-[13px] font-bold tabular-nums", colorClass)}>
          {score}
        </span>
      </div>
      <div>
        <p className="text-[11px] font-semibold text-foreground leading-tight">AI Score</p>
        <p className={cn("text-[10px] font-medium", colorClass)}>
          {isHigh ? "Hoge zekerheid" : isMedium ? "Controleer velden" : "Handmatig invoeren"}
        </p>
      </div>
    </div>
  );
}

// Mini confidence bar for individual fields
function FieldConfidence({ level }: { level: "high" | "medium" | "low" | "missing" }) {
  if (level === "high") return null; // Don't clutter high-confidence fields
  const config = {
    medium: { color: "bg-amber-500", label: "Controleer", textColor: "text-amber-600" },
    low: { color: "bg-destructive", label: "Onzeker", textColor: "text-destructive" },
    missing: { color: "bg-muted-foreground/30", label: "Ontbreekt", textColor: "text-muted-foreground" },
  };
  const c = config[level];
  return (
    <span className={cn("inline-flex items-center gap-1 text-[9px] font-medium", c.textColor)}>
      <span className={cn("h-1 w-3 rounded-full", c.color)} />
      {c.label}
    </span>
  );
}

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
function getCapacityWarning(): { hasWarning: boolean; message: string } {
  const totalVehicles = mockVehicles.length;
  const busy = mockVehicles.filter((v) => v.status !== "beschikbaar").length;
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
  const config = {
    email: { label: "E-mail", className: "bg-blue-50 text-blue-600 border-blue-200" },
    pdf: { label: "PDF", className: "bg-red-50 text-red-600 border-red-200" },
    both: { label: "E-mail + PDF", className: "bg-violet-50 text-violet-600 border-violet-200" },
  };
  const c = config[source];
  return (
    <span className={cn("inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded border", c.className)}>
      {source === "pdf" ? <FileType className="h-2.5 w-2.5" /> : <Mail className="h-2.5 w-2.5" />}
      {c.label}
    </span>
  );
}

function FollowUpPanel({ selected }: { selected: OrderDraft }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(selected.follow_up_draft || "");
  const [isSending, setIsSending] = useState(false);
  const hasMissing = (selected.missing_fields || []).length > 0;
  const alreadySent = !!selected.follow_up_sent_at;

  useEffect(() => {
    setDraft(selected.follow_up_draft || "");
  }, [selected.id, selected.follow_up_draft]);

  if (!hasMissing && !draft) return null;

  const senderEmail = selected.source_email_from || "";
  // Extract email from "Name <email>" format
  const emailMatch = senderEmail.match(/<([^>]+)>/);
  const toEmail = emailMatch ? emailMatch[1] : senderEmail;

  const handleSend = async () => {
    if (!toEmail) {
      toast({ title: "Geen e-mailadres", description: "Afzenderadres ontbreekt", variant: "destructive" });
      return;
    }
    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-follow-up", {
        body: {
          orderId: selected.id,
          toEmail,
          subject: `Re: ${selected.source_email_subject || "Uw transportaanvraag"} - Aanvullende informatie nodig`,
          body: draft,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Follow-up verzonden", description: `E-mail gestuurd naar ${toEmail}` });
      queryClient.invalidateQueries({ queryKey: ["draft-orders"] });
    } catch (e: any) {
      console.error("Send follow-up error:", e);
      toast({ title: "Verzenden mislukt", description: e.message || "Controleer SMTP configuratie", variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  // Save draft to DB on blur
  const saveDraft = async () => {
    await supabase.from("orders").update({ follow_up_draft: draft || null }).eq("id", selected.id);
  };

  return (
    <div className="border-t border-border/30">
      <div className="px-5 py-3">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-5 w-5 rounded-md bg-amber-500/10 flex items-center justify-center">
            <CircleAlert className="h-3 w-3 text-amber-600" />
          </div>
          <h4 className="text-[11px] font-bold text-foreground uppercase tracking-[0.08em]">Ontbrekende Gegevens</h4>
          {alreadySent && (
            <span className="text-[9px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md ml-auto flex items-center gap-1">
              <CheckCircle2 className="h-2.5 w-2.5" />
              Verzonden {new Date(selected.follow_up_sent_at!).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>

        {hasMissing && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {(selected.missing_fields || []).map((field) => (
              <span key={field} className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200/60">
                {field}
              </span>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground font-medium">Concept follow-up mail aan {toEmail || "onbekend"}</p>
          </div>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={saveDraft}
            className="text-[12px] min-h-[120px] rounded-lg resize-none bg-background border-border/40 leading-relaxed"
            placeholder="Concept follow-up mail..."
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="h-8 text-[11px] gap-1.5"
              onClick={handleSend}
              disabled={isSending || !draft || alreadySent}
            >
              {isSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              {alreadySent ? "Al verzonden" : "Verstuur Follow-up"}
            </Button>
            {alreadySent && (
              <Button variant="outline" size="sm" className="h-8 text-[11px] gap-1.5" onClick={handleSend} disabled={isSending}>
                <Send className="h-3.5 w-3.5" />
                Opnieuw versturen
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SourcePanel({ selected, onParseResult }: { selected: OrderDraft; onParseResult: (data: Partial<FormState>) => void }) {
  const [activeTab, setActiveTab] = useState<"email" | "attachment">("email");
  const [isParsing, setIsParsing] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const attachments = (selected.attachments || []) as { name: string; url: string; type: string }[];
  const hasAttachments = attachments.length > 0;

  const handleParseWithAI = async () => {
    setIsParsing(true);
    try {
      const pdfAttachments = attachments.filter(a => a.type === "application/pdf");
      const pdfUrls = pdfAttachments.map(a => a.url).filter(u => u && u !== "#");
      const { data, error } = await supabase.functions.invoke("parse-order", {
        body: { emailBody: selected.source_email_body || "", pdfUrls: pdfUrls.length > 0 ? pdfUrls : undefined },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const ext = data.extracted;
      onParseResult({
        transportType: ext.transport_type || "direct",
        pickupAddress: ext.pickup_address || "",
        deliveryAddress: ext.delivery_address || "",
        quantity: ext.quantity || 0,
        unit: ext.unit || "Pallets",
        weight: ext.weight_kg?.toString() || "",
        dimensions: ext.dimensions || "",
        requirements: ext.requirements || [],
        perUnit: ext.is_weight_per_unit || false,
        fieldSources: ext.field_sources || {},
      });

      // Save missing fields, follow-up draft, thread info, and anomalies to DB
      await supabase.from("orders").update({
        missing_fields: data.missing_fields || [],
        follow_up_draft: data.follow_up_draft || null,
        thread_type: data.thread_type || selected.thread_type || "new",
        changes_detected: data.changes_detected || [],
        anomalies: data.anomalies || [],
      }).eq("id", selected.id);
      queryClient.invalidateQueries({ queryKey: ["draft-orders"] });

      toast({ title: "AI Extractie voltooid", description: `Confidence: ${ext.confidence_score}%` });
    } catch (e: any) {
      console.error("Parse error:", e);
      toast({ title: "Fout bij AI extractie", description: e.message || "Probeer het opnieuw", variant: "destructive" });
    } finally {
      setIsParsing(false);
    }
  };

  return (
    <div className="flex-1 min-w-0 border-r border-border/30 flex flex-col overflow-hidden bg-card">
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-[0.1em] mb-1.5">Bron E-mail</p>
            <h3 className="text-sm font-semibold text-foreground leading-snug">{selected.source_email_subject || "Geen onderwerp"}</h3>
          </div>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground mb-4">
          <div className="flex items-center gap-1.5">
            <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center">
              <Mail className="h-2.5 w-2.5 text-primary" />
            </div>
            <span className="font-medium text-foreground">{selected.source_email_from || "—"}</span>
          </div>
          <span className="text-muted-foreground/40">→</span>
          <span>planning@royaltycargo.nl</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg bg-muted/50 p-0.5">
            <button onClick={() => setActiveTab("email")} className={cn("px-3 py-1.5 rounded-md text-[11px] font-medium transition-all duration-200", activeTab === "email" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              <MailOpen className="h-3 w-3 inline mr-1.5 -mt-px" />Inhoud
            </button>
            <button onClick={() => setActiveTab("attachment")} className={cn("px-3 py-1.5 rounded-md text-[11px] font-medium transition-all duration-200 flex items-center gap-1.5", activeTab === "attachment" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              <Paperclip className="h-3 w-3" />Bijlagen
              {hasAttachments && <span className="bg-primary/10 text-primary text-[9px] font-bold px-1 rounded">{attachments.length}</span>}
            </button>
          </div>
          <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1.5 ml-auto border-primary/20 text-primary hover:bg-primary/5 hover:text-primary" onClick={handleParseWithAI} disabled={isParsing}>
            {isParsing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {isParsing ? "Analyseren..." : "AI Extractie"}
          </Button>
        </div>
      </div>
      <Separator className="bg-border/30" />
      <ScrollArea className="flex-1">
        {activeTab === "email" ? (
          <div className="p-5">
            {selected.source_email_body ? (
              <div className="rounded-xl bg-muted/30 border border-border/20 p-4">
                <p className="text-[13px] text-foreground/80 leading-relaxed whitespace-pre-wrap">{selected.source_email_body}</p>
              </div>
            ) : (
              <div className="text-center py-16">
                <div className="h-12 w-12 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-3"><MailOpen className="h-5 w-5 text-muted-foreground/40" /></div>
                <p className="text-xs text-muted-foreground">Geen inhoud beschikbaar</p>
              </div>
            )}
          </div>
        ) : (
          <div className="p-5">
            {hasAttachments ? (
              <div className="space-y-2">
                {attachments.map((att, i) => {
                  const isPdf = att.type === "application/pdf";
                  const isImage = att.type.startsWith("image/");
                  return (
                    <div key={i} className="rounded-xl border border-border/30 p-3 hover:border-border/60 transition-colors">
                      {isImage && att.url !== "#" && (
                        <div className="mb-3 rounded-lg overflow-hidden border border-border/20"><img src={att.url} alt={att.name} className="w-full h-40 object-cover" /></div>
                      )}
                      <div className="flex items-center gap-3">
                        <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", isPdf ? "bg-red-50 border border-red-100" : "bg-primary/5 border border-primary/10")}>
                          {isPdf ? <FileText className="h-4 w-4 text-red-500" /> : <ImageIcon className="h-4 w-4 text-primary" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{att.name}</p>
                          <p className="text-[10px] text-muted-foreground">{isPdf ? "PDF Document" : "Afbeelding"}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          {isPdf && <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={() => window.open(att.url, "_blank")}><Eye className="h-3 w-3" /> Bekijk</Button>}
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.open(att.url, "_blank")}><Download className="h-3 w-3" /></Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-16">
                <div className="h-12 w-12 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-3"><Paperclip className="h-5 w-5 text-muted-foreground/40" /></div>
                <p className="text-xs text-muted-foreground">Geen bijlagen</p>
              </div>
            )}
          </div>
        )}
        
        {/* Follow-up Draft Panel - under source email */}
        <FollowUpPanel selected={selected} />
      </ScrollArea>
    </div>
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Capacity warning
  const capacityWarning = useMemo(() => getCapacityWarning(), []);

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
      const { data: newOrder, error } = await supabase.from("orders").insert({
        status: "DRAFT", source_email_from: "test@royaltycargo.nl", source_email_subject: `Test: ${scenario.label}`,
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
    onSuccess: (_, { id }) => {
      const order = drafts.find((d) => d.id === id);
      toast({ title: "Order opgeslagen", description: `Order #${order?.order_number} status gewijzigd naar OPEN` });
      queryClient.invalidateQueries({ queryKey: ["draft-orders"] });
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

    return (
      <motion.button
        key={draft.id}
        layoutId={draft.id}
        onClick={() => { setSelectedId(draft.id); setMobileView("source"); }}
        className={cn(
          "w-full text-left px-3 py-2 rounded-lg transition-all duration-150 group relative",
          isSelected ? "bg-primary/[0.06] ring-1 ring-primary/20" : "hover:bg-muted/30",
          deadline.urgency === "red" && !isSelected && "border-l-2 border-l-destructive"
        )}
      >
        {/* Row 1: Dot + Client + Thread Badge + SLA */}
        <div className="flex items-center gap-1.5 mb-0.5">
          {conf > 0 && <ConfidenceDot score={conf} />}
          <span className="text-[12px] font-semibold text-foreground truncate leading-tight flex-1">
            {draft.client_name || "Nieuwe aanvraag"}
          </span>
          {threadConfig && (
            <span className={cn("inline-flex items-center text-[9px] font-semibold px-1.5 py-0.5 rounded border shrink-0", threadConfig.listColor)}>
              {threadConfig.listLabel}
            </span>
          )}
        </div>

        {/* Row 2: Subject */}
        <p className="text-[11px] text-muted-foreground truncate mb-1 leading-snug">
          {draft.source_email_subject || "Geen onderwerp"}
        </p>

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
                {drafts.length} {drafts.length === 1 ? "aanvraag" : "aanvragen"} te verwerken
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
            <SourcePanel selected={selected} onParseResult={(data) => {
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
                    <FormField label="Transport Type" source={form.fieldSources?.transport_type} confidence={form.transportType ? "high" : "missing"}>
                      <Select value={form.transportType} onValueChange={(v) => updateField("transportType", v)}>
                        <SelectTrigger className="h-9 text-xs rounded-lg bg-card"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="direct">Direct Transport</SelectItem>
                          <SelectItem value="warehouse-air">Warehouse → Air</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormField>
                    
                    <FormField label="Ophaaladres" icon={MapPin} source={form.fieldSources?.pickup_address}
                      confidence={!form.pickupAddress ? "missing" : isAddressIncomplete(form.pickupAddress) ? "low" : "high"}>
                      <div className="relative">
                        <Input className={cn("h-9 text-xs pr-9 rounded-lg", !form.pickupAddress ? "bg-destructive/5 border-destructive ring-1 ring-destructive/30 placeholder:text-destructive/50" : isAddressIncomplete(form.pickupAddress) ? "bg-card border-destructive ring-1 ring-destructive/20" : "bg-card")}
                          value={form.pickupAddress} onChange={(e) => updateField("pickupAddress", e.target.value)} placeholder={!form.pickupAddress ? "⚠ Niet gevonden in bericht" : "Voer ophaaladres in..."} />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" className="absolute right-2.5 top-1/2 -translate-y-1/2"
                              onClick={() => {
                                const { enriched, matchedClient } = tryEnrichAddress(form.pickupAddress, clients);
                                if (matchedClient) { updateField("pickupAddress", enriched); toast({ title: "Adresboek", description: `Verrijkt via "${matchedClient}"` }); }
                                else toast({ title: "Adresboek", description: "Geen match gevonden", variant: "destructive" });
                              }}>
                              <DatabaseZap className="h-3.5 w-3.5 text-primary/40 hover:text-primary transition-colors" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="text-[10px]">Zoek in adresboek</TooltipContent>
                        </Tooltip>
                      </div>
                    </FormField>

                    <FormField label="Afleveradres" icon={MapPin} source={form.fieldSources?.delivery_address}
                      confidence={!form.deliveryAddress ? "missing" : isAddressIncomplete(form.deliveryAddress) ? "low" : "high"}>
                      <div className="relative">
                        <Input className={cn("h-9 text-xs pr-9 rounded-lg", !form.deliveryAddress ? "bg-destructive/5 border-destructive ring-1 ring-destructive/30 placeholder:text-destructive/50" : isAddressIncomplete(form.deliveryAddress) ? "bg-card border-destructive ring-1 ring-destructive/20" : "bg-card")}
                          value={form.deliveryAddress} onChange={(e) => updateField("deliveryAddress", e.target.value)} placeholder={!form.deliveryAddress ? "⚠ Niet gevonden in bericht" : "Voer afleveradres in..."} />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" className="absolute right-2.5 top-1/2 -translate-y-1/2"
                              onClick={() => {
                                const { enriched, matchedClient } = tryEnrichAddress(form.deliveryAddress, clients);
                                if (matchedClient) { updateField("deliveryAddress", enriched); toast({ title: "Adresboek", description: `Verrijkt via "${matchedClient}"` }); }
                                else toast({ title: "Adresboek", description: "Geen match gevonden", variant: "destructive" });
                              }}>
                              <DatabaseZap className="h-3.5 w-3.5 text-primary/40 hover:text-primary transition-colors" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="text-[10px]">Zoek in adresboek</TooltipContent>
                        </Tooltip>
                      </div>
                    </FormField>
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
                    <div className="grid grid-cols-2 gap-2">
                      {requirementOptions.map((req) => {
                        const active = form.requirements.includes(req.id);
                        return (
                          <button
                            key={req.id}
                            onClick={() => toggleRequirement(req.id)}
                            className={cn(
                              "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-all duration-200",
                              active
                                ? cn(req.color, "border-current/20 shadow-sm")
                                : "bg-card text-muted-foreground/50 border-border/20 hover:border-border/60 hover:text-muted-foreground"
                            )}
                          >
                            <req.icon className="h-3.5 w-3.5" />
                            {req.label}
                            {active && <CheckCircle2 className="h-3 w-3 ml-auto" />}
                          </button>
                        );
                      })}
                    </div>
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