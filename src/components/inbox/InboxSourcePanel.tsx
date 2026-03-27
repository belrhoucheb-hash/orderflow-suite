import { useState } from "react";
import { Mail, MailOpen, Paperclip, Loader2, Sparkles, FileText, Eye, Download, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import type { OrderDraft, FormState } from "./types";
import { FollowUpPanel } from "./InboxFollowUpPanel";
import { ExtractionSummary } from "./InboxExtractionSummary";

export function SourcePanel({ selected, form, onParseResult }: { selected: OrderDraft; form: FormState | null; onParseResult: (data: Partial<FormState>) => void }) {
  const [activeTab, setActiveTab] = useState<"email" | "attachment">("email");
  const [isParsing, setIsParsing] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const attachments = (selected.attachments || []) as { name: string; url: string; type: string }[];
  const hasAttachments = attachments.length > 0;
  const hasMissing = (selected.missing_fields || []).length > 0;
  const hasFollowUp = !!selected.follow_up_draft;
  const showSummary = !hasMissing && !hasFollowUp && form && selected.confidence_score && selected.confidence_score >= 60;

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
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden bg-card">
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
        
        {/* Follow-up Draft Panel */}
        <FollowUpPanel selected={selected} />

        {/* Extraction Summary */}
        {showSummary && form && <ExtractionSummary order={selected} form={form} />}
      </ScrollArea>
    </div>
  );
}
