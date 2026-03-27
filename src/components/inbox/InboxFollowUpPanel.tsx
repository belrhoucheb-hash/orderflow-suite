import { useState, useEffect } from "react";
import { CircleAlert, CheckCircle2, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import type { OrderDraft } from "./types";

export function FollowUpPanel({ selected }: { selected: OrderDraft }) {
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
