import React, { useState, useRef, useMemo } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Loader2,
  FileText,
  Image as ImageIcon,
  Send,
  Download,
  Link2,
  Link2Off,
  RotateCw,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import type { OrderDraft, FormState } from "./types";
import { FollowUpPanel } from "./InboxFollowUpPanel";

// Build highlight segments using field_confidence levels (ok/warn/err)
function buildHighlights(body: string, form: FormState | null, draft: OrderDraft): React.ReactNode[] {
  if (!form || !body) return [body];

  const fc = form.fieldConfidence || {};
  const conf = (k: string): number | null => {
    const v = fc[k];
    if (v == null) return null;
    return v <= 1 ? Math.round(v * 100) : Math.round(v);
  };
  const level = (score: number | null, filled: boolean): "ok" | "warn" | "err" => {
    if (!filled) return "err";
    if (score == null) return "ok";
    if (score >= 80) return "ok";
    if (score >= 60) return "warn";
    return "err";
  };

  type H = { text: string; level: "ok" | "warn" | "err"; field: string; tooltip: string; wb: boolean };
  const highlights: H[] = [];

  const push = (text: string, fld: string, confKey: string, tooltip: string, wb = false) => {
    if (!text || text.length < 3) return;
    highlights.push({ text, field: fld, level: level(conf(confKey), true), tooltip, wb });
  };

  if (form.pickupAddress) {
    form.pickupAddress.split(",").map((p) => p.trim()).filter((p) => p.length > 4).forEach((p) =>
      push(p, "pickup", "pickup_address", "Ophaaladres"),
    );
  }
  if (form.deliveryAddress) {
    form.deliveryAddress.split(",").map((p) => p.trim()).filter((p) => p.length > 4).forEach((p) =>
      push(p, "delivery", "delivery_address", "Afleveradres"),
    );
  }
  if (form.weight && form.weight.length >= 2) {
    push(form.weight + " kg", "weight", "weight_kg", "Gewicht");
    push(form.weight.replace(".", ",") + " kg", "weight", "weight_kg", "Gewicht");
  }
  if (form.quantity > 0) {
    const qStr = String(form.quantity);
    if (qStr.length >= 2) push(qStr, "qty", "quantity", "Aantal", true);
    push(`${qStr}x`, "qty", "quantity", "Aantal");
    if (form.unit) push(`${qStr} ${form.unit.toLowerCase()}`, "qty", "quantity", "Aantal en eenheid");
  }
  if (form.dimensions && form.dimensions.length >= 3) {
    push(form.dimensions, "dims", "dimensions", "Afmetingen");
    push(form.dimensions.replace(/x/gi, " × "), "dims", "dimensions", "Afmetingen");
  }
  ["pallets", "europallets", "pallet", "colli", "dozen", "container", "containers"].forEach((u) => {
    if (body.toLowerCase().includes(u)) {
      highlights.push({ text: u, level: "ok", field: "qty", tooltip: "Eenheid", wb: true });
    }
  });
  (form.requirements || []).forEach((req) => {
    ["koeling", "gekoeld", "ADR", "gevaarlijk", "laadklep", "douane"].forEach((kw) => {
      if (kw.toLowerCase().includes(req.toLowerCase()) || req.toLowerCase().includes(kw.toLowerCase())) {
        if (body.toLowerCase().includes(kw.toLowerCase())) {
          highlights.push({ text: kw, level: "ok", field: "req", tooltip: "Vereiste", wb: true });
        }
      }
    });
  });

  highlights.sort((a, b) => b.text.length - a.text.length);
  const seen = new Set<string>();
  const unique = highlights.filter((h) => {
    if (h.text.length < 2) return false;
    const k = h.text.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (unique.length === 0) return [body];

  const patternParts = unique.map((h) => {
    const e = h.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return h.wb ? `\\b${e}\\b` : e;
  });
  const pattern = new RegExp(`(${patternParts.join("|")})`, "gi");
  const parts = body.split(pattern);

  return parts.map((part, i) => {
    const match = unique.find((h) => h.text.toLowerCase() === part.toLowerCase());
    if (!match) return part;
    const cls =
      match.level === "ok"
        ? "inbox-hl inbox-hl--ok"
        : match.level === "warn"
          ? "inbox-hl inbox-hl--warn"
          : "inbox-hl inbox-hl--err";
    return (
      <span
        key={i}
        className={cls}
        data-field={match.field}
        title={match.tooltip}
        onMouseEnter={() => {
          document
            .querySelectorAll(`[data-inbox-field="${match.field}"]`)
            .forEach((el) => el.classList.add("inbox-field-linked"));
        }}
        onMouseLeave={() => {
          document
            .querySelectorAll(`[data-inbox-field="${match.field}"]`)
            .forEach((el) => el.classList.remove("inbox-field-linked"));
        }}
      >
        {part}
      </span>
    );
  });
}

function initials(name: string | null | undefined): string {
  if (!name) return "??";
  const parts = name.replace(/<.+>/, "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function SourcePanel({
  selected,
  form,
  onParseResult,
}: {
  selected: OrderDraft;
  form: FormState | null;
  onParseResult: (data: Partial<FormState>) => void;
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [linkageOn, setLinkageOn] = useState(true);
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();

  const attachments = (selected.attachments || []) as { name: string; url: string; type: string }[];
  const hasAttachments = attachments.length > 0;
  const threadType = selected.thread_type || "new";
  const isThreadFollow = threadType !== "new";

  const receivedAgo = selected.received_at
    ? Math.floor((Date.now() - new Date(selected.received_at).getTime()) / 3600000)
    : 0;

  const handleParseWithAI = async () => {
    setIsParsing(true);
    try {
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

      const unitVal = ext.unit || "Pallets";
      const qtyVal = ext.quantity || 0;
      let dimsVal = ext.dimensions || "";
      if (!dimsVal && unitVal) {
        const key = unitVal.toLowerCase();
        const stdDims: Record<string, string> = {
          europallet: "120x80x145",
          europallets: "120x80x145",
          pallet: "120x80x145",
          pallets: "120x80x145",
          blokpallet: "120x100x145",
          blokpallets: "120x100x145",
        };
        dimsVal = stdDims[key] || "";
      }
      let weightVal = ext.weight_kg?.toString() || "";
      if (!weightVal && unitVal && qtyVal > 0) {
        const stdWeight: Record<string, number> = {
          europallet: 25,
          europallets: 25,
          pallet: 25,
          pallets: 25,
          blokpallet: 25,
          blokpallets: 25,
        };
        const wpu = stdWeight[unitVal.toLowerCase()];
        if (wpu) weightVal = (wpu * qtyVal).toString();
      }

      onParseResult({
        transportType: ext.transport_type || "direct",
        pickupAddress: ext.pickup_address || "",
        deliveryAddress: ext.delivery_address || "",
        quantity: qtyVal,
        unit: unitVal,
        weight: weightVal,
        dimensions: dimsVal,
        requirements: ext.requirements || [],
        perUnit: ext.is_weight_per_unit || false,
        fieldSources: {},
        fieldConfidence: ext.field_confidence || {},
      });

      const normalizedConfidence =
        typeof ext.confidence_score === "number" && ext.confidence_score > 0 && ext.confidence_score <= 1
          ? Math.round(ext.confidence_score * 100)
          : ext.confidence_score;

      await supabase
        .from("orders")
        .update({
          confidence_score: normalizedConfidence,
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
        })
        .eq("id", selected.id);

      queryClient.invalidateQueries({ queryKey: ["draft-orders"] });
      toast.success("AI extractie voltooid", { description: `Zekerheid: ${ext.confidence_score}%` });
    } catch (e: any) {
      toast.error("Fout bij AI extractie", { description: e.message || "Probeer opnieuw" });
    } finally {
      setIsParsing(false);
    }
  };

  const handleSendReply = async () => {
    if (!replyText.trim()) return;
    setIsSending(true);
    try {
      const subject = `RE: ${selected.source_email_subject || ""}`;
      const toEmail = selected.source_email_from || "";
      try {
        const { error } = await supabase.functions.invoke("send-follow-up", {
          body: { orderId: selected.id, toEmail, subject, body: replyText },
        });
        if (error) throw error;
        toast.success("Antwoord verzonden");
      } catch {
        window.open(`mailto:${toEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(replyText)}`);
        toast.success("E-mail client geopend");
      }
      queryClient.invalidateQueries({ queryKey: ["draft-orders"] });
      setReplyOpen(false);
      setReplyText("");
    } catch (e: any) {
      toast.error("Verzenden mislukt", { description: e.message });
    } finally {
      setIsSending(false);
    }
  };

  const body = selected.source_email_body || "";
  const highlightedBody = useMemo(() => {
    if (!linkageOn) return [body];
    return body.split("\n").map((line, i) => ({ line, nodes: buildHighlights(line, form, selected), i }));
  }, [body, form, selected, linkageOn]);

  const replyPreview = replyText.trim().slice(0, 60);

  return (
    <div
      className="flex-1 flex flex-col bg-card"
      style={{ minWidth: 0, overflow: "hidden" }}
    >
      {/* Top bar */}
      <div
        className="shrink-0 flex items-center gap-2 px-4 h-11 border-b"
        style={{ borderColor: "hsl(var(--border) / 0.5)" }}
      >
        <button
          className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 lg:hidden"
          aria-label="Terug"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
        </button>
        <span
          className="text-[11px] tabular-nums px-2 py-[2px] rounded-full"
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            color: "hsl(var(--muted-foreground))",
            background: "hsl(var(--muted) / 0.5)",
          }}
        >
          #{selected.order_number}
        </span>
        {selected.confidence_score != null && (
          <span
            className="text-[11px] font-semibold px-2 py-[2px] rounded-full inline-flex items-center gap-1"
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              color: "hsl(var(--gold-deep))",
              background: "hsl(var(--gold-soft))",
            }}
          >
            ✓ ORD-{selected.order_number}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50"
            aria-label="Vorige (K)"
            title="Vorige (K)"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
          </button>
          <button
            className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50"
            aria-label="Volgende (J)"
            title="Volgende (J)"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
          </button>
          <div className="relative">
            <button
              onClick={() => setShowMenu((s) => !s)}
              className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50"
              aria-label="Meer"
            >
              <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} />
            </button>
            {showMenu && (
              <div
                className="absolute right-0 top-full mt-1 w-52 rounded-lg py-1 z-30 shadow-lg"
                style={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                }}
              >
                <button className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted/50">Doorsturen</button>
                <button className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted/50">Archiveer</button>
                <button className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted/50">Niet een order</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1" style={{ minWidth: 0 }}>
        {/* Header: subject + avatar row */}
        <div className="px-6 pt-5 pb-4">
          <h2
            className="text-[20px] font-semibold leading-tight mb-3"
            style={{ fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.01em" }}
          >
            {selected.source_email_subject || "Geen onderwerp"}
          </h2>
          <div className="flex items-center gap-3">
            <div
              className="h-9 w-9 rounded-full grid place-items-center text-white text-[12px] font-semibold shrink-0"
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                background: "linear-gradient(135deg, hsl(var(--gold)) 0%, hsl(var(--gold-deep)) 100%)",
              }}
            >
              {initials(selected.client_name || selected.source_email_from)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-foreground truncate">
                {selected.client_name || "Onbekend"}
              </p>
              <p className="text-[11.5px] text-muted-foreground truncate">
                {selected.source_email_from || "—"}
              </p>
            </div>
            <span
              className="text-[11px] tabular-nums px-2 py-[2px] rounded-full shrink-0"
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                color: "hsl(var(--muted-foreground))",
                background: "hsl(var(--muted) / 0.5)",
              }}
            >
              {receivedAgo > 0 ? `${receivedAgo}u geleden` : "zojuist"}
            </span>
          </div>
        </div>

        {/* Thread indicator */}
        {isThreadFollow && (
          <div
            className="mx-6 mb-4 rounded-lg px-3 py-2 flex items-center gap-2 text-[12px]"
            style={{
              background: "hsl(var(--gold-soft) / 0.35)",
              borderLeft: "2px solid hsl(var(--gold))",
              color: "hsl(var(--foreground))",
            }}
          >
            <span className="text-muted-foreground">Vervolg op thread,</span>
            <span className="font-medium">
              {threadType === "update" ? "update" : threadType === "cancellation" ? "annulering" : threadType === "confirmation" ? "bevestiging" : "vraag"}
            </span>
            <button
              className="ml-auto text-[11.5px] underline underline-offset-2"
              style={{ color: "hsl(var(--gold-deep))" }}
            >
              Toon eerdere berichten
            </button>
          </div>
        )}

        {/* Tools row */}
        <div className="px-6 mb-3 flex items-center gap-2 justify-end">
          <button
            onClick={() => setLinkageOn((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11.5px] border transition-colors",
              linkageOn
                ? "text-foreground border-[hsl(var(--gold)/0.4)] bg-[hsl(var(--gold-soft)/0.35)]"
                : "text-muted-foreground border-border hover:text-foreground",
            )}
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            title="Toggle koppeling met review-paneel"
          >
            {linkageOn ? <Link2 className="h-3 w-3" strokeWidth={1.75} /> : <Link2Off className="h-3 w-3" strokeWidth={1.75} />}
            {linkageOn ? "Gekoppeld" : "Ongekoppeld"}
          </button>
          <button
            onClick={handleParseWithAI}
            disabled={isParsing}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11.5px] border border-[hsl(var(--gold)/0.4)] text-[hsl(var(--gold-deep))] hover:bg-[hsl(var(--gold-soft)/0.5)] transition-colors disabled:opacity-60"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            {isParsing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCw className="h-3 w-3" strokeWidth={1.75} />}
            Re-extract
          </button>
        </div>

        {/* Email body */}
        <div className="px-6 pb-5 text-[14px] leading-[1.7]" style={{ color: "hsl(var(--foreground))" }}>
          {body ? (
            linkageOn && Array.isArray(highlightedBody) && typeof highlightedBody[0] !== "string" ? (
              (highlightedBody as any[]).map(({ nodes, i }) => (
                <p key={i} className="mb-3 last:mb-0">
                  {nodes}
                </p>
              ))
            ) : (
              body.split("\n").map((line, i) => (
                <p key={i} className="mb-3 last:mb-0">
                  {line}
                </p>
              ))
            )
          ) : (
            <p className="text-xs text-muted-foreground italic">Geen inhoud beschikbaar</p>
          )}
        </div>

        {/* Attachments */}
        {hasAttachments && (
          <div className="px-6 pb-5">
            <p
              className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-2"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Bijlagen, <strong className="text-foreground">{attachments.length}</strong>
            </p>
            <div className="flex flex-wrap gap-2">
              {attachments.map((att, i) => {
                const isPdf = att.type === "application/pdf";
                const isImage = att.type.startsWith("image/");
                if (isImage && att.url !== "#") {
                  return (
                    <button
                      key={i}
                      onClick={() => window.open(att.url, "_blank")}
                      className="w-[180px] rounded-[9px] overflow-hidden border bg-card hover:border-[hsl(var(--gold)/0.45)] transition-colors flex flex-col"
                      style={{ borderColor: "hsl(var(--border))" }}
                    >
                      <div className="aspect-[4/3] bg-[#f1ebdc] overflow-hidden">
                        <img src={att.url} alt={att.name} className="w-full h-full object-cover" />
                      </div>
                      <div
                        className="px-[10px] py-[6px] border-t flex flex-col gap-[1px] text-left"
                        style={{ borderColor: "hsl(var(--border))" }}
                      >
                        <span className="text-[12px] font-medium truncate">{att.name}</span>
                        <span className="text-[10px] tabular-nums text-muted-foreground">Afbeelding</span>
                      </div>
                    </button>
                  );
                }
                return (
                  <button
                    key={i}
                    onClick={() => window.open(att.url, "_blank")}
                    className="inline-flex items-center gap-2.5 pl-[10px] pr-[12px] py-[8px] rounded-[9px] border bg-card hover:border-[hsl(var(--gold)/0.4)] hover:bg-[hsl(var(--gold-soft)/0.3)] transition-colors"
                    style={{ borderColor: "hsl(var(--border))" }}
                  >
                    <span
                      className="w-[30px] h-[30px] rounded-[7px] grid place-items-center shrink-0"
                      style={{
                        background: "hsl(var(--gold-soft) / 0.8)",
                        border: "1px solid hsl(var(--gold) / 0.25)",
                        color: "hsl(var(--gold-deep))",
                      }}
                    >
                      {isPdf ? <FileText className="h-3.5 w-3.5" strokeWidth={1.75} /> : <ImageIcon className="h-3.5 w-3.5" strokeWidth={1.75} />}
                    </span>
                    <span className="min-w-0 text-left">
                      <span className="block text-[12.5px] font-medium truncate max-w-[160px]">{att.name}</span>
                      <span className="block text-[10.5px] tabular-nums text-muted-foreground">
                        {isPdf ? "PDF document" : "Bijlage"}
                      </span>
                    </span>
                    <Download className="h-3 w-3 text-muted-foreground ml-1" strokeWidth={1.75} />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Follow-up draft panel */}
        <FollowUpPanel selected={selected} />
      </ScrollArea>

      {/* Reply, collapsable */}
      <div
        className="shrink-0 border-t"
        style={{ borderColor: "hsl(var(--border) / 0.5)", background: "hsl(var(--card))" }}
      >
        {!replyOpen ? (
          <button
            onClick={() => {
              setReplyOpen(true);
              if (!replyText) setReplyText(selected.follow_up_draft || "");
              setTimeout(() => replyRef.current?.focus(), 50);
            }}
            className="w-full flex items-center gap-2 px-4 py-3 text-[12.5px] text-left hover:bg-muted/30 transition-colors"
          >
            <Send className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
            <span className="text-muted-foreground">
              {replyPreview ? (
                <>
                  Concept, <span className="text-foreground">{replyPreview}...</span>
                </>
              ) : (
                "Antwoord schrijven..."
              )}
            </span>
          </button>
        ) : (
          <div className="p-3">
            <div className="flex items-center justify-between mb-2 px-1">
              <p className="text-[11.5px] text-muted-foreground">
                Aan, <span className="text-foreground">{selected.source_email_from}</span>
              </p>
              <button
                onClick={() => {
                  setReplyOpen(false);
                }}
                className="text-[11.5px] text-muted-foreground hover:text-foreground"
              >
                Sluiten
              </button>
            </div>
            <Textarea
              ref={replyRef}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Typ je antwoord..."
              className="text-sm min-h-[80px] max-h-[200px] resize-none"
            />
            <div className="flex justify-end mt-2">
              <button
                onClick={handleSendReply}
                disabled={isSending || !replyText.trim()}
                className="h-8 px-3 rounded-md text-[12px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  background: "linear-gradient(180deg, hsl(var(--gold)), hsl(var(--gold-deep)))",
                  color: "white",
                }}
              >
                {isSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" strokeWidth={1.75} />}
                Verstuur
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
