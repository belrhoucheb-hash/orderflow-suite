import { useState } from "react";
import { Truck, CheckCircle2, Loader2, Package, Scale, Plus, X, AlertTriangle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { cn } from "@/lib/utils";
import type { OrderDraft, FormState } from "./types";
import { requirementOptions } from "./types";

/** Renders a small colored confidence indicator per field with native tooltip */
function FieldConfidenceIndicator({ score }: { score: number | undefined }) {
  if (score === undefined || score === null) return null;
  if (score >= 90) {
    return <span title={`AI confidence: ${score}%`} className="inline-flex items-center cursor-help"><CheckCircle2 className="h-3.5 w-3.5 text-green-500" /></span>;
  }
  if (score >= 60) {
    return <span title={`AI confidence: ${score}%`} className="inline-flex items-center cursor-help"><AlertTriangle className="h-3.5 w-3.5 text-yellow-500" /></span>;
  }
  return <span title={`AI confidence: ${score}%`} className="inline-flex items-center cursor-help"><AlertTriangle className="h-3.5 w-3.5 text-red-500" /></span>;
}
import { getFilledCount, getTotalFields, getRequiredFilledCount, getFormErrors, formatDate } from "./utils";

interface Props {
  selected: OrderDraft;
  form: FormState;
  isCreatePending: boolean;
  addressSuggestions: any;
  onUpdateField: (field: keyof FormState, value: any) => void;
  onToggleRequirement: (req: string) => void;
  onAutoSave: () => void;
  onCreateOrder: () => void;
  onDelete: () => void;
}

export function InboxReviewPanel({ selected, form, isCreatePending, addressSuggestions, onUpdateField, onToggleRequirement, onAutoSave, onCreateOrder, onDelete }: Props) {
  const conf = selected.confidence_score || 0;
  const formErrors = getFormErrors(form);
  const filledCount = getFilledCount(form);
  const totalFields = getTotalFields();
  const requiredFilled = getRequiredFilledCount(form);
  const totalRequired = 4;
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [showConfidence, setShowConfidence] = useState(false);

  const receivedAgo = selected.received_at
    ? Math.floor((Date.now() - new Date(selected.received_at).getTime()) / 3600000)
    : 0;
  const timeClass = receivedAgo > 6 ? "bg-red-100 text-red-600" : receivedAgo > 3 ? "bg-amber-100 text-amber-600" : "bg-gray-100 text-gray-500";

  return (
    <div className="relative flex flex-col h-full bg-gray-50" style={{ minWidth: 0, overflow: "hidden" }}>
      {/* Scroll progress */}
      <div className="h-0.5 bg-green-500 sticky top-0 z-10 transition-all" style={{ width: "0%" }} id="review-progress" />

      {/* Header */}
      <div className="h-14 px-4 flex items-center justify-between border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-500">Review Order</h3>
          <span className={cn("text-[9px] px-1.5 py-0.5 rounded font-bold flex items-center gap-1", timeClass)}>
            ⏱ {receivedAgo}u geleden
          </span>
        </div>
        {/* Confidence ring with hover dropdown */}
        {conf > 0 && (
          <div className="relative cursor-help" onMouseEnter={() => setShowConfidence(true)} onMouseLeave={() => setShowConfidence(false)}>
            <div className="relative h-8 w-8">
              <svg className="h-8 w-8 -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="14" fill="none" stroke="#e5e7eb" strokeWidth="2.5" />
                <circle cx="18" cy="18" r="14" fill="none"
                  stroke={conf >= 80 ? "#16a34a" : conf >= 60 ? "#d97706" : "#dc2626"}
                  strokeWidth="2.5" strokeDasharray={`${conf * 0.88}, 88`} strokeLinecap="round" />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[9px] font-black tabular-nums">{conf}%</span>
            </div>
            {showConfidence && (
              <div className="absolute top-full right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg p-2 z-50">
                <p className="text-[10px] font-bold text-gray-500 mb-2 border-b pb-1">Per-veld Confidence</p>
                {[
                  { label: "Klantnaam", key: "client_name" },
                  { label: "Ophaaladres", key: "pickup_address" },
                  { label: "Afleveradres", key: "delivery_address" },
                  { label: "Aantal", key: "quantity" },
                  { label: "Gewicht", key: "weight_kg" },
                  { label: "Eenheid", key: "unit" },
                  { label: "Ophaaldatum", key: "pickup_date" },
                  { label: "Leverdatum", key: "delivery_date" },
                ].map(f => {
                  const fc = form.fieldConfidence || {};
                  const val = fc[f.key] ?? null;
                  return (
                    <div key={f.key} className="flex justify-between text-[10px] py-0.5">
                      <span>{f.label}</span>
                      {val !== null ? (
                        <span className={cn("font-bold", val >= 90 ? "text-green-600" : val >= 60 ? "text-amber-600" : "text-red-600")}>
                          {val}% {val >= 90 ? "✓" : val >= 60 ? "⚠" : "✗"}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Progress stepper */}
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center justify-between relative">
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-gray-200 -translate-y-1/2 z-0" />
          <div className="absolute top-1/2 left-0 w-1/2 h-0.5 bg-green-500 -translate-y-1/2 z-0" />
          {[
            { label: "Ontvangen", done: true, active: false },
            { label: "Review", done: false, active: true },
            { label: "Goedgekeurd", done: false, active: false },
          ].map((step, i) => (
            <div key={i} className="relative z-10 flex flex-col items-center gap-1">
              <div className={cn("w-4 h-4 rounded-full flex items-center justify-center",
                step.done ? "bg-green-500" : step.active ? "bg-green-500 ring-2 ring-green-500 ring-offset-2" : "bg-gray-200"
              )}>
                {step.done && <Check className="h-2.5 w-2.5 text-white" />}
              </div>
              <span className={cn("text-[9px] font-bold uppercase", step.done || step.active ? "text-green-600" : "text-gray-400")}>
                {step.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1" style={{ minWidth: 0 }}>
        <div className="p-4 space-y-6 pb-56">

          {/* AI Card */}
          {conf > 0 && (
            <div className="bg-gradient-to-br from-white to-green-50 border border-green-100 border-l-[3px] border-l-green-500 p-3 rounded-lg shadow-sm">
              <div className="flex items-start gap-3 mb-3">
                <span className="text-green-500 text-lg">✨</span>
                <div className="flex-1">
                  <div className="flex justify-between items-center mb-1">
                    <p className="text-[10px] font-bold text-green-600 uppercase tracking-wider">{filledCount} van {totalFields} velden herkend</p>
                    <span className="text-[10px] font-bold text-green-600">{Math.round(filledCount / totalFields * 100)}%</span>
                  </div>
                  <div className="w-full bg-green-100 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-green-500 h-full rounded-full transition-all" style={{ width: `${(filledCount / totalFields) * 100}%` }} />
                  </div>
                  <p className="text-[9px] text-green-600/70 mt-1 font-medium">
                    📧 {selected.attachments?.length ? `${filledCount > 1 ? filledCount - 1 : filledCount} uit e-mail · 📄 1 uit bijlage` : `${filledCount} uit e-mail`}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {form.pickupAddress && form.deliveryAddress && <span className="bg-white border border-green-200 text-green-600 text-[9px] px-2 py-0.5 rounded-full font-medium">📍 2 locaties</span>}
                {form.quantity > 0 && <span className="bg-white border border-green-200 text-green-600 text-[9px] px-2 py-0.5 rounded-full font-medium">📦 Lading{form.weight ? " + gewicht" : ""}</span>}
              </div>
              {!form.dimensions && (
                <div className="flex items-center gap-1.5 text-[10px] text-amber-600 font-bold bg-amber-50 p-1.5 rounded border border-amber-100">
                  <AlertTriangle className="h-3.5 w-3.5" /> Afmetingen ontbreekt
                </div>
              )}
            </div>
          )}

          {/* Route Details */}
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center after:content-[''] after:flex-1 after:h-px after:bg-gradient-to-r after:from-gray-200 after:to-transparent after:ml-3">
              Route Details
            </p>
            <div className="relative pl-6 space-y-4">
              <div className="absolute left-[9px] top-2 bottom-2 border-l-2 border-dashed border-gray-200" />
              {/* Distance indicator */}
              <div className="absolute left-0 top-[40%] bg-white p-1 rounded-full border border-gray-200 shadow-sm z-10">
                <Truck className="h-3 w-3 text-gray-400 animate-bounce" style={{ animationDuration: "2s" }} />
              </div>

              {/* Ophalen */}
              <div className="relative">
                <div className="absolute -left-[15px] top-1 h-2.5 w-2.5 rounded-full bg-primary border-2 border-white shadow-sm" />
                <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm group hover:border-primary/40 transition-colors">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] text-gray-400 font-medium flex items-center gap-1">Ophalen <FieldConfidenceIndicator score={form.fieldConfidence?.pickup_address} /></span>
                  </div>
                  <AddressAutocomplete value={form.pickupAddress} onChange={(v) => { onUpdateField("pickupAddress", v); onAutoSave(); }}
                    placeholder="Ophaaladres..." className={cn("h-auto border-0 shadow-none p-0 text-sm font-bold bg-transparent focus-visible:ring-0", !form.pickupAddress && "text-red-400 italic font-normal")} />
                  {selected.pickup_time_from && selected.pickup_time_to && (
                    <p className="text-xs text-gray-400 mt-1">{selected.pickup_time_from} - {selected.pickup_time_to}</p>
                  )}
                </div>
              </div>

              {/* Lossen */}
              <div className="relative">
                <div className="absolute -left-[15px] top-1 h-2.5 w-2.5 rounded-full bg-primary/70 border-2 border-white shadow-sm" />
                <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm group hover:border-primary/40 transition-colors">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] text-gray-400 font-medium flex items-center gap-1">Lossen <FieldConfidenceIndicator score={form.fieldConfidence?.delivery_address} /></span>
                  </div>
                  <AddressAutocomplete value={form.deliveryAddress} onChange={(v) => { onUpdateField("deliveryAddress", v); onAutoSave(); }}
                    placeholder="Afleveradres..." className={cn("h-auto border-0 shadow-none p-0 text-sm font-bold bg-transparent focus-visible:ring-0", !form.deliveryAddress && "text-red-400 italic font-normal")} />
                  {selected.delivery_time_from && selected.delivery_time_to && (
                    <p className="text-xs text-gray-400 mt-1">{selected.delivery_time_from} - {selected.delivery_time_to}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Lading & Goederen */}
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center after:content-[''] after:flex-1 after:h-px after:bg-gradient-to-r after:from-gray-200 after:to-transparent after:ml-3">
              Lading & Goederen
            </p>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              {/* Aantal */}
              <div className="flex justify-between items-center p-3 hover:bg-gray-50 transition-colors">
                <span className="text-xs text-gray-500 font-medium flex items-center gap-1">Aantal <FieldConfidenceIndicator score={form.fieldConfidence?.quantity} /></span>
                <div className="flex items-center gap-1.5">
                  <Input type="number" value={form.quantity} onChange={(e) => onUpdateField("quantity", Number(e.target.value))} onBlur={onAutoSave}
                    className="h-7 w-14 text-xs font-bold text-right border-0 shadow-none bg-transparent p-0 focus-visible:ring-0" />
                  <Select value={form.unit} onValueChange={(v) => { onUpdateField("unit", v); setTimeout(onAutoSave, 0); }}>
                    <SelectTrigger className="h-7 w-auto border-0 shadow-none bg-transparent p-0 text-xs font-bold gap-1 focus:ring-0"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="Pallets">Pallets</SelectItem><SelectItem value="Colli">Colli</SelectItem><SelectItem value="Box">Box</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              {/* Gewicht */}
              <div className="flex justify-between items-start p-3 bg-gray-50 hover:bg-gray-100 transition-colors border-y border-gray-200">
                <span className="text-xs text-gray-500 font-medium mt-0.5 flex items-center gap-1">Gewicht <FieldConfidenceIndicator score={form.fieldConfidence?.weight_kg} /></span>
                <div className="text-right">
                  <div className="flex items-center gap-1">
                    <Input value={form.weight} onChange={(e) => onUpdateField("weight", e.target.value)} onBlur={onAutoSave} placeholder="—"
                      className={cn("h-7 w-20 text-xs font-bold text-right border-0 shadow-none bg-transparent p-0 focus-visible:ring-0 tabular-nums", !form.weight && "text-red-400")} />
                    <span className="text-xs font-bold">kg</span>
                  </div>
                  {form.perUnit && form.weight && form.quantity > 0 && (
                    <p className="text-[10px] text-gray-400 tabular-nums">≈ {Math.round(Number(form.weight) / form.quantity)} kg/eenheid × {form.quantity}</p>
                  )}
                </div>
              </div>
              {/* Type */}
              <div className="flex justify-between items-center p-3 hover:bg-gray-50 transition-colors border-b border-gray-200">
                <span className="text-xs text-gray-500 font-medium">Type</span>
                <Select value={form.transportType} onValueChange={(v) => { onUpdateField("transportType", v); setTimeout(onAutoSave, 0); }}>
                  <SelectTrigger className="h-7 w-auto border-0 shadow-none bg-transparent p-0 text-xs font-bold gap-1 focus:ring-0"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="direct">Direct</SelectItem><SelectItem value="warehouse-air">Warehouse → Air</SelectItem></SelectContent>
                </Select>
              </div>
              {/* Afmetingen */}
              <div className={cn("flex justify-between items-center p-3 transition-colors", !form.dimensions ? "bg-amber-50 hover:bg-amber-100" : "hover:bg-gray-50")}>
                <span className={cn("text-xs font-medium", !form.dimensions ? "text-amber-600" : "text-gray-500")}>Afmetingen</span>
                <Input value={form.dimensions} onChange={(e) => onUpdateField("dimensions", e.target.value)} onBlur={onAutoSave}
                  placeholder={!form.dimensions ? "Niet opgegeven" : "LxBxH"}
                  className={cn("h-7 w-28 text-xs font-bold text-right border-0 shadow-none bg-transparent p-0 focus-visible:ring-0", !form.dimensions && "text-amber-600 italic")} />
              </div>
            </div>
          </div>

          {/* Extra Vereisten */}
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center after:content-[''] after:flex-1 after:h-px after:bg-gradient-to-r after:from-gray-200 after:to-transparent after:ml-3">
              Extra Vereisten
            </p>
            <div className="flex flex-wrap gap-2">
              {requirementOptions.map(req => {
                const active = form.requirements.includes(req.id);
                return (
                  <button key={req.id} onClick={() => onToggleRequirement(req.id)}
                    className={cn("text-[10px] px-2.5 py-1.5 rounded-full font-bold flex items-center gap-1 transition-all",
                      active ? "bg-primary text-white shadow-sm" : "bg-white text-gray-500 border border-gray-200 hover:border-primary/40"
                    )}>
                    {active && <Check className="h-3 w-3" />}
                    {!active && <Plus className="h-3 w-3" />}
                    {req.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </ScrollArea>

      {/* Sticky CTA */}
      <div className="absolute bottom-0 left-0 right-0 p-5 bg-white/95 backdrop-blur-md border-t border-gray-200 shadow-[0_-8px_30px_rgb(0,0,0,0.06)] z-50">
        <div className="flex items-center gap-2 mb-3 border-b border-gray-100 pb-3">
          <CheckCircle2 className={cn("h-4 w-4", formErrors ? "text-amber-500" : "text-green-500")} />
          <p className="text-[11px] font-medium text-gray-500">
            {formErrors ? `${requiredFilled} van ${totalRequired} verplichte velden ingevuld` : "Alle verplichte velden gecontroleerd ✓"}
          </p>
        </div>
        <label className="flex items-center gap-2 mb-3 cursor-pointer">
          <input type="checkbox" checked={autoAdvance} onChange={() => setAutoAdvance(!autoAdvance)}
            className="w-3.5 h-3.5 rounded border-gray-300 text-primary focus:ring-primary/20" />
          <span className="text-[11px] text-gray-500 font-medium">Spring naar volgende ongelezen na goedkeuring</span>
        </label>
        <Button
          className={cn("w-full py-3.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all",
            formErrors ? "bg-gray-200 text-gray-400" : "bg-primary hover:bg-red-700 text-white hover:scale-[1.01] hover:shadow-lg active:scale-95"
          )}
          onClick={onCreateOrder} disabled={isCreatePending || formErrors}
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          {isCreatePending ? <Loader2 className="h-4 w-4 animate-spin" /> : "MAAK DE ORDER AAN"}
        </Button>
        <div className="mt-3 text-center">
          <button onClick={onDelete} className="text-[11px] font-bold text-gray-400 hover:text-primary transition-colors hover:underline underline-offset-4">
            Afwijzen & archiveren
          </button>
        </div>
      </div>
    </div>
  );
}
