import { useState, useEffect } from "react";
import { CircleAlert, CheckCircle2, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import type { OrderDraft } from "./types";
import {
  buildSuggestedFollowUpDraft,
  buildSuggestedFollowUpSubject,
  getBlockingFollowUpRecommendations,
  getFollowUpRecommendations,
  getFollowUpReasonSummary,
  getRecommendedFollowUpAction,
} from "@/lib/followUpDraft";

export function FollowUpPanel({ selected }: { selected: OrderDraft }) {
  const queryClient = useQueryClient();
  const suggestedDraft = buildSuggestedFollowUpDraft(selected);
  const suggestedSubject = buildSuggestedFollowUpSubject(selected);
  const recommendations = getFollowUpRecommendations(selected);
  const blockingRecommendations = getBlockingFollowUpRecommendations(selected);
  const reasonSummary = getFollowUpReasonSummary(selected);
  const recommendedAction = getRecommendedFollowUpAction(selected);
  const [draft, setDraft] = useState(selected.follow_up_draft || suggestedDraft || "");
  const [isSending, setIsSending] = useState(false);
  
  const hasMissing = (selected.missing_fields || []).length > 0;
  const alreadySent = !!selected.follow_up_sent_at;

  useEffect(() => {
    setDraft(selected.follow_up_draft || buildSuggestedFollowUpDraft(selected) || "");
  }, [selected.id, selected.follow_up_draft, selected.missing_fields, selected.anomalies, selected.client_name]);

  if (!hasMissing && !draft) return null;

  const senderEmail = selected.source_email_from || "";
  const emailMatch = senderEmail.match(/<([^>]+)>/);
  const toEmail = emailMatch ? emailMatch[1] : senderEmail;

  const handleSend = async () => {
    if (!toEmail) {
      toast.error("Geen e-mailadres", { description: "Afzenderadres ontbreekt" });
      return;
    }
    setIsSending(true);
    try {
      const subject = encodeURIComponent(suggestedSubject);
      const body = encodeURIComponent(draft);

      // Try edge function first, fallback to mailto
      try {
        const { data, error } = await supabase.functions.invoke("send-follow-up", {
          body: { orderId: selected.id, toEmail, subject: decodeURIComponent(subject), body: draft },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        toast.success("Follow-up verzonden", { description: `E-mail gestuurd naar ${toEmail}` });
      } catch {
        // Fallback: open mailto link
        window.open(`mailto:${toEmail}?subject=${subject}&body=${body}`);
        toast.success("E-mail client geopend", { description: `Follow-up klaar om te versturen naar ${toEmail}` });
      }

      // Mark as sent
      await supabase.from("orders").update({ follow_up_sent_at: new Date().toISOString() }).eq("id", selected.id);
      queryClient.invalidateQueries({ queryKey: ["draft-orders"] });
    } catch (e: any) {
      console.error("Send follow-up error:", e);
      toast.error("Verzenden mislukt", { description: e.message });
    } finally {
      setIsSending(false);
    }
  };

  const saveDraft = async () => {
    await supabase.from("orders").update({ follow_up_draft: draft || null }).eq("id", selected.id);
  };

  return (
    <div className="border-t border-border/30" style={{ minWidth: 0, overflow: "hidden" }}>
      <div className="px-4 py-3" style={{ minWidth: 0 }}>
        <div className="flex items-center gap-2 mb-3">
          <div className="h-5 w-5 rounded-md bg-amber-500/10 flex items-center justify-center">
            <CircleAlert className="h-3 w-3 text-amber-600" />
          </div>
          <h4 className="text-xs font-bold text-foreground uppercase tracking-[0.08em]">Ontbrekende Gegevens</h4>
          {alreadySent && (
            <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md ml-auto flex items-center gap-1">
              <CheckCircle2 className="h-2.5 w-2.5" />
              Verzonden {new Date(selected.follow_up_sent_at!).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>

        {hasMissing && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {(selected.missing_fields || []).map((field) => (
              <span key={field} className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200/60">
                {field}
              </span>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <div className="rounded-lg border border-border/40 bg-background px-3 py-2">
            <p className="text-[11px] font-semibold text-foreground">Waarom dit voorstel</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {reasonSummary.map((reason) => (
                <span
                  key={reason}
                  className="inline-flex items-center rounded-full border border-border/50 bg-muted/30 px-2 py-1 text-[11px] text-foreground"
                >
                  {reason}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-blue-200/70 bg-blue-50/70 px-3 py-2">
            <p className="text-[11px] font-semibold text-blue-900">Aanbevolen vervolgstap</p>
            <p className="mt-1 text-xs font-medium text-blue-900">{recommendedAction.label}</p>
            <p className="mt-1 text-xs text-blue-800">{recommendedAction.description}</p>
          </div>
          {recommendations.length > 0 && (
            <div className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-foreground">Aanbevolen om op te vragen</p>
                {suggestedDraft && (
                  <button
                    type="button"
                    onClick={() => setDraft(suggestedDraft)}
                    className="text-[11px] font-medium text-primary hover:underline"
                  >
                    Gebruik slim voorstel
                  </button>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {recommendations.map((item) => (
                  <span
                    key={item}
                    className="inline-flex items-center rounded-full border border-border/50 bg-background px-2 py-1 text-[11px] text-foreground"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          )}
          {blockingRecommendations.length > 0 && (
            <div className="rounded-lg border border-amber-200/70 bg-amber-50/70 px-3 py-2">
              <p className="text-[11px] font-semibold text-amber-900">Eerst nodig voor bevestiging</p>
              <p className="mt-1 text-xs text-amber-800">
                Vraag eerst {blockingRecommendations.join(" en ")} op. Daarna kan de order sneller door naar bevestiging.
              </p>
            </div>
          )}
          <div className="rounded-lg border border-border/40 bg-background px-3 py-2">
            <p className="text-[11px] font-semibold text-foreground">Onderwerp</p>
            <p className="mt-1 text-xs text-muted-foreground">{suggestedSubject}</p>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground font-medium">Concept follow-up mail aan {toEmail || "onbekend"}</p>
            {suggestedDraft && draft !== suggestedDraft && (
              <button
                type="button"
                onClick={() => setDraft(suggestedDraft)}
                className="text-[11px] font-medium text-muted-foreground hover:text-foreground hover:underline"
              >
                Reset naar voorstel
              </button>
            )}
          </div>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={saveDraft}
            className="text-sm min-h-[120px] rounded-lg resize-none bg-background border-border/40 leading-relaxed"
            placeholder="Concept follow-up mail..."
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={handleSend}
              disabled={isSending || !draft || alreadySent}
            >
              {isSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              {alreadySent ? "Al verzonden" : "Verstuur Follow-up"}
            </Button>
            {alreadySent && (
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={handleSend} disabled={isSending}>
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
