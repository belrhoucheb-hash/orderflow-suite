import { CheckCircle2, Truck, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCapacityMatch } from "@/hooks/useCapacityMatch";
import { type OrderDraft, type FormState, requirementOptions } from "./types";

export function ExtractionSummary({ order, form }: { order: OrderDraft; form: FormState }) {
  const items = [
    { label: "Klant", value: order.client_name },
    { label: "Ophaaladres", value: form.pickupAddress },
    { label: "Afleveradres", value: form.deliveryAddress },
    { label: "Lading", value: form.quantity ? `${form.quantity} ${form.unit}` : null },
    { label: "Gewicht", value: form.weight ? `${form.weight} kg${form.perUnit ? " per eenheid" : ""}` : null },
    { label: "Afmetingen", value: form.dimensions },
    { label: "Vereisten", value: form.requirements.length > 0 ? form.requirements.map(r => {
      const opt = requirementOptions.find(o => o.id === r || o.id.toLowerCase().includes(r.toLowerCase()) || r.toLowerCase().includes(o.id.toLowerCase()));
      return opt ? opt.label : r;
    }).join(", ") : null },
    { label: "Type", value: form.transportType === "warehouse-air" ? "Warehouse → Air" : "Direct" },
  ].filter(i => i.value);

  if (items.length === 0) return null;

  const capacityInput = {
    requirements: form.requirements,
    weightKg: form.weight ? Number(form.weight) * (form.perUnit ? form.quantity : 1) : 0,
    quantity: form.quantity,
    unit: form.unit,
  };
  const capacityMatches = useCapacityMatch(capacityInput);

  return (
    <div className="p-4 space-y-1" style={{ minWidth: 0, overflow: "hidden" }}>
      {/* Phase 1: Extractie */}
      <div className="flex items-center gap-2 px-1 pt-1 pb-2">
        <span className="text-xs font-bold text-muted-foreground/50 uppercase tracking-[0.15em]">Fase 1 — Extractie</span>
        <div className="flex-1 h-px bg-border/30" />
      </div>
      <div className="rounded-xl border border-emerald-200/50 bg-emerald-50/30 p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <div className="h-5 w-5 rounded-md bg-emerald-500/10 flex items-center justify-center">
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
          </div>
          <h4 className="text-xs font-bold text-emerald-800 uppercase tracking-[0.08em]">Dit hebben we begrepen</h4>
        </div>
        <div className="grid gap-1.5">
          {items.map((item) => (
            <div key={item.label} className="flex items-baseline gap-2 text-sm min-w-0">
              <span className="text-emerald-600/70 font-medium shrink-0 text-xs">{item.label}</span>
              <span className="text-foreground font-semibold truncate">{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Phase 2: Planning — Capacity Match */}
      <div className="flex items-center gap-2 px-1 pt-4 pb-2">
        <span className="text-xs font-bold text-muted-foreground/50 uppercase tracking-[0.15em]">Fase 2 — Planning</span>
        <div className="flex-1 h-px bg-border/30" />
      </div>
      <div className="rounded-xl border border-primary/15 bg-primary/5 p-4 space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <Truck className="h-3.5 w-3.5 text-primary" />
          <h4 className="text-xs font-bold text-foreground uppercase tracking-[0.08em]">Beschikbare capaciteit</h4>
        </div>
        {capacityMatches.length > 0 ? (
          <div className="space-y-2">
            {capacityMatches.slice(0, 3).map((match) => (
              <div key={match.vehicle.id} className={cn(
                "rounded-lg border px-3 py-2.5 transition-colors",
                match.warnings.length > 0 ? "border-amber-200/40 bg-amber-50/20" : "border-border/20 bg-card"
              )}>
                <div className="flex items-center gap-2">
                  <Truck className="h-3 w-3 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-semibold text-foreground truncate">{match.vehicle.name}</span>
                      <span className="text-xs text-muted-foreground/60 shrink-0">({match.vehicle.plate})</span>
                      <span className={cn(
                        "text-xs font-bold px-1.5 py-0.5 rounded ml-auto",
                        match.score >= 70 ? "bg-emerald-500/10 text-emerald-600" : match.score >= 40 ? "bg-amber-500/10 text-amber-600" : "bg-destructive/10 text-destructive"
                      )}>
                        {match.score}%
                      </span>
                    </div>
                    {match.driver && <div className="flex items-center gap-1.5 mt-1">
                      <Users className="h-2.5 w-2.5 text-primary/50" />
                      <span className="text-xs font-medium text-foreground">{match.driver.name}</span>
                      {match.driver.certifications && match.driver.certifications.length > 0 && (
                        <span className="text-xs text-primary/70 font-medium">
                          ({match.driver.certifications.join(", ")})
                        </span>
                      )}
                    </div>}
                    {match.warnings.length > 0 && (
                      <div className="mt-1.5 pt-1.5 border-t border-amber-200/30 flex flex-col gap-0.5">
                        {match.warnings.map((w: string, i: number) => (
                          <span key={i} className="text-xs text-amber-600 font-medium flex items-center gap-1">
                            <Truck className="h-2 w-2" /> {w}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground bg-card rounded-lg p-3 border border-border/40 text-center">Geen geschikte voertuigen gevonden</p>
        )}
      </div>
    </div>
  );
}
