import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useRateCards } from "@/hooks/useRateCards";
import { useSurcharges } from "@/hooks/useSurcharges";
import { calculateOrderPrice } from "@/lib/pricingEngine";
import type { PricingOrderInput } from "@/types/rateModels";

/**
 * Pricing-preview widget op de Tarieven-tab. Een admin kan een
 * voorbeeld-order intoetsen en ziet direct welke tariefregel matcht,
 * welke toeslagen eroverheen komen en wat het eindbedrag wordt. Een
 * debug-handvat zodat tarief-wijzigingen niet blind hoeven te zijn.
 */
export function PricingPreview() {
  const { data: rateCards = [], isLoading: loadingCards } = useRateCards({ activeOnly: true });
  const { data: surcharges = [], isLoading: loadingSurcharges } = useSurcharges(true);

  const [open, setOpen] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string>("");

  // Form-state met nuchtere defaults
  const [distance, setDistance] = useState("80");
  const [weight, setWeight] = useState("1000");
  const [stops, setStops] = useState("2");
  const [duration, setDuration] = useState("2");
  const [transportType, setTransportType] = useState("");
  const [diesel, setDiesel] = useState<"any" | "true" | "false">("any");
  const [purpose, setPurpose] = useState("");
  const [optionalScreening, setOptionalScreening] = useState(false);

  const defaultCards = useMemo(() => rateCards.filter((rc) => !rc.client_id), [rateCards]);
  const activeCard = selectedCardId
    ? defaultCards.find((c) => c.id === selectedCardId)
    : defaultCards[0];

  const breakdown = useMemo(() => {
    if (!activeCard) return null;
    const order: PricingOrderInput = {
      id: "preview",
      order_number: "preview",
      client_name: null,
      pickup_address: null,
      delivery_address: null,
      transport_type: transportType.trim() || null,
      weight_kg: parseFloat(weight) || 0,
      quantity: null,
      distance_km: parseFloat(distance) || 0,
      stop_count: parseInt(stops, 10) || 0,
      duration_hours: parseFloat(duration) || 0,
      requirements: [],
      day_of_week: new Date().getDay(),
      waiting_time_min: 0,
      diesel_included: diesel === "true" ? true : diesel === "false" ? false : undefined,
      include_optional_purposes: optionalScreening ? ["screening"] : purpose.trim() ? [purpose.trim()] : [],
    };
    try {
      return calculateOrderPrice(order, activeCard, surcharges);
    } catch (e) {
      return { error: (e as Error).message ?? "Berekening mislukt" };
    }
  }, [activeCard, distance, weight, stops, duration, transportType, diesel, purpose, optionalScreening, surcharges]);

  if (loadingCards || loadingSurcharges) return null;
  if (defaultCards.length === 0) return null;

  return (
    <div className="card--luxe overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between p-4 hover:bg-[hsl(var(--gold-soft)/0.2)] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div
            className="h-9 w-9 rounded-xl flex items-center justify-center border border-[hsl(var(--gold)/0.3)]"
            style={{ background: "linear-gradient(135deg, hsl(var(--gold-soft)/0.8), hsl(var(--gold-soft)/0.25))" }}
          >
            <Sparkles className="h-4 w-4 text-[hsl(var(--gold-deep))]" strokeWidth={1.5} />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-foreground">Pricing-proef</p>
            <p className="text-[11px] text-muted-foreground">
              Toets een voorbeeld-order en zie live welke tariefregel matcht.
            </p>
          </div>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-[hsl(var(--gold-deep))]" />
        ) : (
          <ChevronDown className="h-4 w-4 text-[hsl(var(--gold-deep))]" />
        )}
      </button>

      {open && (
        <div className="border-t border-[hsl(var(--gold)/0.15)] p-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Form */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Tariefkaart</Label>
              <Select value={activeCard?.id ?? ""} onValueChange={setSelectedCardId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {defaultCards.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Afstand (km)</Label>
                <Input type="number" step="1" value={distance} onChange={(e) => setDistance(e.target.value)} className="h-9 tabular-nums text-right" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Gewicht (kg)</Label>
                <Input type="number" step="1" value={weight} onChange={(e) => setWeight(e.target.value)} className="h-9 tabular-nums text-right" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Aantal stops</Label>
                <Input type="number" step="1" value={stops} onChange={(e) => setStops(e.target.value)} className="h-9 tabular-nums text-right" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Duur (uur)</Label>
                <Input type="number" step="0.5" value={duration} onChange={(e) => setDuration(e.target.value)} className="h-9 tabular-nums text-right" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Transporttype</Label>
              <Input value={transportType} onChange={(e) => setTransportType(e.target.value)} placeholder="Leeg = alle" className="h-9" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Diesel</Label>
              <Select value={diesel} onValueChange={(v) => setDiesel(v as typeof diesel)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Niet gespecificeerd</SelectItem>
                  <SelectItem value="true">Diesel inbegrepen</SelectItem>
                  <SelectItem value="false">Zonder diesel</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3 items-end">
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Doel</Label>
                <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Leeg = standaard" className="h-9" />
              </div>
              <div className="flex items-center justify-between rounded-md border border-[hsl(var(--gold)/0.2)] bg-[hsl(var(--gold-soft)/0.15)] px-3 h-9">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Screening</Label>
                <Switch checked={optionalScreening} onCheckedChange={setOptionalScreening} />
              </div>
            </div>
          </div>

          {/* Output */}
          <div className="rounded-lg border border-[hsl(var(--gold)/0.2)] bg-[hsl(var(--gold-soft)/0.12)] p-4 space-y-3">
            <p className="text-[11px] font-display font-semibold text-[hsl(var(--gold-deep))] uppercase tracking-[0.16em]">
              Resultaat
            </p>

            {!breakdown && <p className="text-xs text-muted-foreground">Kies een tariefkaart om te rekenen.</p>}

            {breakdown && "error" in breakdown && (
              <p className="text-xs text-destructive">Fout bij berekening: {String(breakdown.error)}</p>
            )}

            {breakdown && !("error" in breakdown) && (
              <>
                {breakdown.regels.length === 0 ? (
                  <div className="rounded-md border border-dashed border-[hsl(var(--gold)/0.3)] p-3 text-xs text-muted-foreground">
                    Geen enkele regel matcht met deze invoer. Controleer condities of voeg een passende regel toe.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {breakdown.regels.map((r, i) => (
                      <div key={i} className="flex items-center justify-between text-xs py-1.5 border-b border-[hsl(var(--gold)/0.12)] last:border-0">
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate">{r.description}</p>
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            {r.rule_type}
                            {r.quantity && r.unit ? `, ${r.quantity} ${r.unit} × € ${r.unit_price.toFixed(2)}` : ""}
                          </p>
                        </div>
                        <span className="tabular-nums font-medium text-foreground">
                          {"€ "}{r.total.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {breakdown.toeslagen.length > 0 && (
                  <div className="pt-2 space-y-1">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Toeslagen</p>
                    {breakdown.toeslagen.map((t, i) => (
                      <div key={i} className="flex items-center justify-between text-xs py-0.5">
                        <span className="text-muted-foreground">{t.name}</span>
                        <span className="tabular-nums">{"€ "}{t.amount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="pt-2 border-t border-[hsl(var(--gold)/0.25)] flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wide text-[hsl(var(--gold-deep))] font-semibold">Totaal</span>
                  <span className="text-lg font-semibold text-foreground tabular-nums">
                    {"€ "}{breakdown.totaal.toFixed(2)}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
