import React, { useState, useRef } from "react";
import { Mail, MailOpen, Paperclip, Loader2, Sparkles, FileText, Eye, Download, Image as ImageIcon, Send, Reply, Forward, Building2, Package, TrendingUp, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";

import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { OrderDraft, FormState } from "./types";
import { FollowUpPanel } from "./InboxFollowUpPanel";


// AI highlighting: find extracted values in email text and wrap with colored underlines
function highlightEmailBody(body: string, form: FormState | null, order: OrderDraft): React.ReactNode[] {
  if (!form || !body) return [body];

  const highlights: { text: string; color: string; tooltip: string; wordBoundary: boolean }[] = [];

  // Locations (red) — only match parts longer than 4 chars
  if (form.pickupAddress) {
    form.pickupAddress.split(",").map(p => p.trim()).filter(p => p.length > 4).forEach(p =>
      highlights.push({ text: p, color: "border-red-500 text-red-600", tooltip: "Ophaaladres", wordBoundary: false }));
  }
  if (form.deliveryAddress) {
    form.deliveryAddress.split(",").map(p => p.trim()).filter(p => p.length > 4).forEach(p =>
      highlights.push({ text: p, color: "border-red-500 text-red-600", tooltip: "Afleveradres", wordBoundary: false }));
  }

  // Quantities/weights (blue) — only match with context (e.g. "22.000 kg", "12 pallets")
  if (form.weight && form.weight.length >= 3) {
    highlights.push({ text: form.weight + " kg", color: "border-blue-500 text-blue-600", tooltip: "Gewicht", wordBoundary: false });
    highlights.push({ text: form.weight.replace(".", ",") + " kg", color: "border-blue-500 text-blue-600", tooltip: "Gewicht", wordBoundary: false });
    highlights.push({ text: form.weight, color: "border-blue-500 text-blue-600", tooltip: "Gewicht", wordBoundary: true });
    highlights.push({ text: form.weight.replace(".", ","), color: "border-blue-500 text-blue-600", tooltip: "Gewicht", wordBoundary: true });
  }
  // Only highlight quantity if it's more than 1 digit (avoid matching "1" everywhere)
  if (form.quantity > 1 || (form.quantity === 1 && body.includes("1x"))) {
    const qStr = String(form.quantity);
    if (qStr.length >= 2) {
      highlights.push({ text: qStr, color: "border-blue-500 text-blue-600", tooltip: "Aantal", wordBoundary: true });
    }
    // Match with unit context: "12 pallets", "1x 40ft"
    highlights.push({ text: `${qStr}x`, color: "border-blue-500 text-blue-600", tooltip: "Aantal", wordBoundary: false });
    highlights.push({ text: `${qStr} ${form.unit?.toLowerCase() || ""}`.trim(), color: "border-blue-500 text-blue-600", tooltip: "Aantal + eenheid", wordBoundary: false });
  }

  // Unit words (blue) — full words only
  ["pallets", "europallets", "pallet", "colli", "dozen", "stuks", "container", "containers"].forEach(u => {
    if (body.toLowerCase().includes(u)) highlights.push({ text: u, color: "border-blue-500 text-blue-600", tooltip: "Eenheid", wordBoundary: true });
  });

  // Requirements keywords (green) — full words only
  ["koeling", "gekoeld", "temperatuur", "ADR", "gevaarlijk", "laadklep", "douane"].forEach(kw => {
    if (body.toLowerCase().includes(kw.toLowerCase()))
      highlights.push({ text: kw, color: "border-emerald-500 text-emerald-600", tooltip: "Vereiste", wordBoundary: true });
  });

  // Sort by length descending
  highlights.sort((a, b) => b.text.length - a.text.length);

  // Remove duplicates and filter out too-short entries
  const seen = new Set<string>();
  const unique = highlights.filter(h => {
    if (h.text.length < 2) return false;
    const key = h.text.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (unique.length === 0) return [body];

  // Build regex with word boundaries where needed
  const patternParts = unique.map(h => {
    const escaped = h.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return h.wordBoundary ? `\\b${escaped}\\b` : escaped;
  });
  const pattern = new RegExp(`(${patternParts.join("|")})`, "gi");

  const parts = body.split(pattern);
  return parts.map((part, i) => {
    const match = unique.find(h => h.text.toLowerCase() === part.toLowerCase());
    if (match) {
      return (
        <span key={i} className={`relative border-b-2 border-dotted ${match.color} font-semibold px-0.5 cursor-help`} title={`Geëxtraheerd als: ${match.tooltip}`}>
          {part}
          <span className={`text-[7px] font-black align-super ml-0.5 opacity-60 ${match.color}`}>AI</span>
        </span>
      );
    }
    return part;
  });
}

export function SourcePanel({ selected, form, onParseResult }: { selected: OrderDraft; form: FormState | null; onParseResult: (data: Partial<FormState>) => void }) {
  const [activeTab, setActiveTab] = useState<"email" | "attachment">("email");
  const [replyMode, setReplyMode] = useState<"none" | "reply" | "forward">("none");
  const [replyText, setReplyText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const [isParsing, setIsParsing] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const attachments = (selected.attachments || []) as { name: string; url: string; type: string }[];
  const hasAttachments = attachments.length > 0;
  const hasMissing = (selected.missing_fields || []).length > 0;
  const hasFollowUp = !!selected.follow_up_draft;
  const clientName = selected.client_name;

  // Fetch client info + previous orders
  const { data: clientData } = useQuery({
    queryKey: ["client-card", clientName],
    queryFn: async () => {
      if (!clientName) return null;
      // Get client record
      const { data: clients } = await supabase.from("clients").select("id, name, email, phone, address, city").ilike("name", `%${clientName}%`).limit(1);
      // Get previous orders from this client
      const { data: orders } = await supabase.from("orders").select("id, order_number, status, pickup_address, delivery_address, weight_kg, quantity, unit, created_at")
        .ilike("client_name", `%${clientName}%`).neq("id", selected.id).order("created_at", { ascending: false }).limit(5);
      // Stats
      const totalOrders = orders?.length || 0;
      const avgWeight = totalOrders > 0 ? Math.round((orders || []).reduce((s, o) => s + (o.weight_kg || 0), 0) / totalOrders) : 0;
      return { client: clients?.[0] || null, previousOrders: orders || [], totalOrders, avgWeight };
    },
    enabled: !!clientName && clientName !== "Onbekend",
  });

  const handleParseWithAI = async () => {
    setIsParsing(true);
    try {
      // Call parse-order edge function for AI extraction
      const { data: parseResponse, error: parseError } = await supabase.functions.invoke("parse-order", {
        body: {
          emailBody: selected.source_email_body || "",
          pdfUrls: [],
          threadContext: null,
          tenantId: selected.tenant_id,
        },
      });
      if (parseError) throw new Error(`Parse-order fout: ${parseError.message}`);

      const data = parseResponse;
      const ext = data?.extracted || data;

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
        fieldSources: {},
        fieldConfidence: ext.field_confidence || {},
      });

      // Save extracted data to DB
      await supabase.from("orders").update({
        confidence_score: ext.confidence_score,
        client_name: ext.client_name || selected.client_name,
        transport_type: ext.transport_type,
        pickup_address: ext.pickup_address,
        delivery_address: ext.delivery_address,
        quantity: ext.quantity,
        unit: ext.unit,
        weight_kg: ext.weight_kg,
        is_weight_per_unit: ext.is_weight_per_unit,
        dimensions: ext.dimensions,
        requirements: ext.requirements,
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

  const handleReply = () => {
    setReplyMode("reply");
    const missingFields = selected.missing_fields || [];
    if (missingFields.length > 0 && selected.follow_up_draft) {
      // AI-generated follow-up for missing data
      setReplyText(selected.follow_up_draft);
    } else if (missingFields.length > 0) {
      // Generate a basic follow-up if no AI draft exists
      const fieldList = missingFields.map(f => `  • ${f}`).join("\n");
      const clientName = selected.client_name || "Geachte heer/mevrouw";
      setReplyText(`Beste ${clientName},\n\nBedankt voor uw transportaanvraag. Om deze correct in te plannen hebben wij nog het volgende nodig:\n\n${fieldList}\n\nKunt u deze informatie zo spoedig mogelijk aanleveren?\n\nMet vriendelijke groet,\nPlanning`);
    } else {
      setReplyText("");
    }
    setTimeout(() => replyRef.current?.focus(), 100);
  };

  const handleForward = () => {
    setReplyMode("forward");
    setReplyText(`\n\n---------- Doorgestuurd bericht ----------\nVan: ${selected.source_email_from}\nOnderwerp: ${selected.source_email_subject}\n\n${selected.source_email_body || ""}`);
    setTimeout(() => replyRef.current?.focus(), 100);
  };

  const handleSendReply = async () => {
    if (!replyText.trim()) return;
    setIsSending(true);
    try {
      const subject = replyMode === "forward"
        ? `FW: ${selected.source_email_subject}`
        : `RE: ${selected.source_email_subject}`;
      const toEmail = replyMode === "forward" ? "" : selected.source_email_from || "";

      // Try edge function, fallback to mailto
      try {
        const { error } = await supabase.functions.invoke("send-follow-up", {
          body: { orderId: selected.id, toEmail, subject, body: replyText },
        });
        if (error) throw error;
        toast({ title: replyMode === "forward" ? "Doorgestuurd" : "Antwoord verzonden" });
      } catch {
        const encodedSubject = encodeURIComponent(subject);
        const encodedBody = encodeURIComponent(replyText);
        window.open(`mailto:${toEmail}?subject=${encodedSubject}&body=${encodedBody}`);
        toast({ title: "E-mail client geopend", description: "Bericht klaar om te versturen" });
      }
      queryClient.invalidateQueries({ queryKey: ["draft-orders"] });
      setReplyMode("none");
      setReplyText("");
    } catch (e: any) {
      toast({ title: "Verzenden mislukt", description: e.message, variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-card" style={{ minWidth: 0, overflow: "hidden" }}>
      {/* Fixed header — h-14 to align with other panels */}
      <div className="h-14 px-4 flex items-center justify-between gap-3 border-b border-border/30 shrink-0" style={{ minWidth: 0 }}>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground truncate">{selected.source_email_subject || "Geen onderwerp"}</h3>
          <p className="text-xs text-muted-foreground truncate">{selected.source_email_from || "—"}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="inline-flex rounded-lg bg-muted/50 p-0.5 shrink-0">
            <button onClick={() => setActiveTab("email")} className={cn("px-2.5 py-1.5 rounded-md text-xs font-medium transition-all duration-200", activeTab === "email" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              <MailOpen className="h-3 w-3 inline mr-1 -mt-px" />Inhoud
            </button>
            <button onClick={() => setActiveTab("attachment")} className={cn("px-2.5 py-1.5 rounded-md text-xs font-medium transition-all duration-200 flex items-center gap-1", activeTab === "attachment" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              <Paperclip className="h-3 w-3" />Bijlagen
              {hasAttachments && <span className="bg-primary/10 text-primary text-xs font-bold px-1 rounded">{attachments.length}</span>}
            </button>
          </div>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1 ml-auto shrink-0 border-primary/20 text-primary hover:bg-primary/5" onClick={handleParseWithAI} disabled={isParsing}>
            {isParsing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {isParsing ? "Analyseert..." : "Extraheer"}
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1" style={{ minWidth: 0 }}>
        {activeTab === "email" ? (
          <div className="p-4" style={{ overflow: "hidden" }}>
            {selected.source_email_body ? (
              <div className="leading-[1.8] text-[15px] text-gray-600" style={{ overflowWrap: "break-word", wordBreak: "break-word" }}>
                {selected.source_email_body.split("\n").map((line, i) => {
                  const highlighted = highlightEmailBody(line, form, selected);
                  const hasHighlight = form && highlighted.length > 1;
                  return (
                    <p key={i} className={cn("mb-1", hasHighlight && "pl-3 border-l-2 border-primary/20")}>
                      {highlighted}
                    </p>
                  );
                })}
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
                          <p className="text-xs text-muted-foreground">{isPdf ? "PDF Document" : "Afbeelding"}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          {isPdf && <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => window.open(att.url, "_blank")}><Eye className="h-3 w-3" /> Bekijk</Button>}
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
        
        {/* Follow-up Draft Panel */}
        <FollowUpPanel selected={selected} />

        {/* Client Card + Previous Orders */}
        {clientData && (clientData.client || clientData.previousOrders.length > 0) && (
          <div className="border-t border-gray-200 p-4 space-y-4">

            {/* Client Card */}
            {clientData.client && (
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                    <Building2 className="h-5 w-5 text-gray-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">{clientData.client.name}</p>
                    {clientData.client.city && <p className="text-xs text-gray-500">{clientData.client.city}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center p-2 rounded-lg bg-gray-50">
                    <p className="text-lg font-bold text-gray-900" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{clientData.totalOrders}</p>
                    <p className="text-xs text-gray-400">Orders</p>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-gray-50">
                    <p className="text-lg font-bold text-gray-900" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{clientData.avgWeight > 0 ? `${clientData.avgWeight}` : "—"}</p>
                    <p className="text-xs text-gray-400">Gem. kg</p>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-gray-50">
                    <p className="text-lg font-bold text-gray-900" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                      {clientData.client.phone ? "✓" : clientData.client.email ? "✓" : "—"}
                    </p>
                    <p className="text-xs text-gray-400">Contact</p>
                  </div>
                </div>
              </div>
            )}

            {/* Previous Orders */}
            {clientData.previousOrders.length > 0 && (
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center after:content-[''] after:flex-1 after:h-px after:bg-gradient-to-r after:from-gray-200 after:to-transparent after:ml-3">
                  Eerdere orders
                </p>
                <div className="space-y-2">
                  {clientData.previousOrders.map((order: any) => {
                    const statusColors: Record<string, string> = {
                      DRAFT: "bg-gray-100 text-gray-600",
                      PENDING: "bg-blue-100 text-blue-700",
                      PLANNED: "bg-violet-100 text-violet-700",
                      IN_TRANSIT: "bg-amber-100 text-amber-700",
                      DELIVERED: "bg-green-100 text-green-700",
                      CANCELLED: "bg-red-100 text-red-700",
                    };
                    return (
                      <a key={order.id} href={`/orders/${order.id}`} className="block rounded-lg border border-gray-100 bg-white p-3 hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-mono font-bold text-gray-900">#{order.order_number}</span>
                          <span className={cn("text-xs font-medium px-1.5 py-0.5 rounded", statusColors[order.status] || "bg-gray-100 text-gray-600")}>
                            {order.status}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 truncate">
                          {order.pickup_address?.split(",")[0]} → {order.delivery_address?.split(",")[0]}
                        </p>
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                          {order.quantity > 0 && <span>{order.quantity} {order.unit}</span>}
                          {order.weight_kg > 0 && <span>{order.weight_kg} kg</span>}
                          <span className="ml-auto">{new Date(order.created_at).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}</span>
                        </div>
                      </a>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

      </ScrollArea>

      {/* Reply/Forward bar — sticky bottom */}
      {replyMode === "none" ? (
        <div className="border-t border-gray-200 p-3 flex gap-2 bg-white shrink-0">
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 font-semibold" onClick={handleReply}>
            <Reply className="h-3.5 w-3.5" /> Beantwoorden
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 font-semibold" onClick={handleForward}>
            <Forward className="h-3.5 w-3.5" /> Doorsturen
          </Button>
        </div>
      ) : (
        <div className="border-t border-gray-200 bg-white shrink-0">
          <div className="px-3 pt-3 pb-1 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <p className="text-xs font-semibold text-gray-500 truncate">
                {replyMode === "reply" ? `Aan: ${selected.source_email_from}` : "Doorsturen"}
              </p>
              {replyMode === "reply" && (selected.missing_fields || []).length > 0 && (
                <span className="text-[10px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded shrink-0 flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> AI concept
                </span>
              )}
            </div>
            <button onClick={() => { setReplyMode("none"); setReplyText(""); }} className="text-xs text-gray-400 hover:text-gray-600 shrink-0">
              Annuleren
            </button>
          </div>
          <div className="px-3 pb-3">
            <Textarea
              ref={replyRef}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder={replyMode === "reply" ? "Typ je antwoord..." : "Voeg een bericht toe..."}
              className="text-sm min-h-[80px] max-h-[200px] resize-none border-gray-200 focus-visible:ring-1 focus-visible:ring-primary"
            />
            <div className="flex justify-end mt-2">
              <Button size="sm" className="h-8 text-xs gap-1.5 bg-primary hover:bg-primary/90" onClick={handleSendReply} disabled={isSending || !replyText.trim()}>
                {isSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                {replyMode === "reply" ? "Verstuur" : "Doorsturen"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
