import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calculator, CircleSlash } from "lucide-react";
import { formatCurrency } from "@/lib/invoiceUtils";

type PricingDetails = Record<string, unknown> | null | undefined;

interface OrderPricePreviewProps {
  pricing: PricingDetails;
  totalCents: number | null | undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item))
    : [];
}

function asNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

function asText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function totalFromCents(totalCents: number | null | undefined, details: Record<string, unknown> | null): number | null {
  if (typeof totalCents === "number") return totalCents / 100;
  return asNumber(details?.total) ?? asNumber(details?.amount);
}

function modeLabel(mode: unknown): string {
  switch (mode) {
    case "client_rates":
      return "Klanttarief";
    case "engine":
      return "Tariefmotor";
    case "override":
      return "Afwijkend tarief";
    default:
      return "New Order";
  }
}

export function OrderPricePreview({ pricing, totalCents }: OrderPricePreviewProps) {
  const details = asRecord(pricing);
  const total = totalFromCents(totalCents, details);
  const mode = details?.mode;
  const lineItems = asArray(details?.line_items ?? details?.lines);
  const surcharges = asArray(details?.surcharges);
  const manualLine = asRecord(details?.manual_line);
  const manualAddOns = asRecord(details?.manual_add_ons);
  const tollAmount = asNumber(details?.toll_amount) ?? 0;
  const manualAddOnAmount = asNumber(manualAddOns?.base_amount) ?? 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calculator className="h-4 w-4" />
            Prijsberekening
          </CardTitle>
          <Badge variant="outline">{modeLabel(mode)}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {!details || total == null ? (
          <div className="flex items-start gap-2 rounded-md border border-dashed border-[hsl(var(--gold)/0.28)] bg-[hsl(var(--gold-soft)/0.22)] p-3 text-sm text-muted-foreground">
            <CircleSlash className="mt-0.5 h-4 w-4 text-[hsl(var(--gold-deep))]" />
            <span>Geen tarief vastgelegd in New Order.</span>
          </div>
        ) : (
          <div className="space-y-3">
            {lineItems.length > 0 && (
              <div className="space-y-1">
                {lineItems.map((line, idx) => {
                  const description = asText(line.description, `Tariefregel ${idx + 1}`);
                  const amount = asNumber(line.total) ?? 0;
                  const quantity = asNumber(line.quantity);
                  const unit = asText(line.unit, "");
                  const unitPrice = asNumber(line.unitPrice ?? line.unit_price);
                  const meta = quantity && unitPrice != null && unit
                    ? `${quantity} ${unit} x EUR ${unitPrice}`
                    : "";

                  return (
                    <div key={`${description}-${idx}`} className="flex justify-between gap-3 text-sm">
                      <span className="min-w-0 text-muted-foreground">
                        {description}
                        {meta && <span className="ml-1 text-xs text-muted-foreground/70">{meta}</span>}
                      </span>
                      <span className="shrink-0 font-mono tabular-nums">
                        {formatCurrency(amount)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {manualLine && (
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-muted-foreground">
                  {asText(manualLine.description, "Handmatige tariefregel")}
                </span>
                <span className="font-mono tabular-nums">
                  {formatCurrency(asNumber(manualLine.amount) ?? 0)}
                </span>
              </div>
            )}

            {mode === "override" && (
              <div className="rounded-md border border-[hsl(var(--gold)/0.16)] bg-[hsl(var(--gold-soft)/0.18)] px-3 py-2 text-sm">
                <div className="font-medium">Afwijkend tarief uit New Order</div>
                {typeof details.reason === "string" && details.reason.trim() && (
                  <div className="mt-1 text-muted-foreground">{details.reason}</div>
                )}
              </div>
            )}

            {(surcharges.length > 0 || manualAddOnAmount > 0 || tollAmount > 0) && (
              <div className="space-y-1 border-t pt-2">
                {surcharges.map((surcharge, idx) => (
                  <div key={`${asText(surcharge.name, "Toeslag")}-${idx}`} className="flex justify-between gap-3 text-sm text-amber-700">
                    <span>+ {asText(surcharge.name, "Toeslag")}</span>
                    <span className="font-mono tabular-nums">
                      {formatCurrency(asNumber(surcharge.amount) ?? 0)}
                    </span>
                  </div>
                ))}
                {manualAddOnAmount > 0 && (
                  <div className="flex justify-between gap-3 text-sm text-amber-700">
                    <span>+ Wacht- en stopkosten</span>
                    <span className="font-mono tabular-nums">{formatCurrency(manualAddOnAmount)}</span>
                  </div>
                )}
                {tollAmount > 0 && (
                  <div className="flex justify-between gap-3 text-sm text-amber-700">
                    <span>+ Tol</span>
                    <span className="font-mono tabular-nums">{formatCurrency(tollAmount)}</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-between border-t pt-2">
              <span className="font-bold">Totaal (excl. BTW)</span>
              <span className="font-mono tabular-nums text-lg font-bold">
                {formatCurrency(total)}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
