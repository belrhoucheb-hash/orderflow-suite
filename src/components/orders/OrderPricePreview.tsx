import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calculator, AlertCircle } from "lucide-react";
import { useClientRateCard } from "@/hooks/useRateCards";
import { useSurcharges } from "@/hooks/useSurcharges";
import { calculateOrderPrice } from "@/lib/pricingEngine";
import { formatCurrency } from "@/lib/invoiceUtils";
import type { PricingOrderInput } from "@/types/rateModels";

interface OrderPricePreviewProps {
  clientId: string | null;
  order: {
    id: string;
    order_number: number | string;
    client_name: string | null;
    pickup_address: string | null;
    delivery_address: string | null;
    transport_type: string | null;
    weight_kg: number | null;
    quantity: number | null;
    requirements?: string[];
    distance_km?: number;
    stop_count?: number;
    duration_hours?: number;
  };
}

export function OrderPricePreview({ clientId, order }: OrderPricePreviewProps) {
  const { data: rateCard, isLoading: rcLoading } = useClientRateCard(clientId);
  const { data: surcharges, isLoading: sLoading } = useSurcharges(true);
  const isLoading = rcLoading || sLoading;

  const pricingInput: PricingOrderInput = useMemo(() => ({
    id: order.id, order_number: order.order_number, client_name: order.client_name,
    pickup_address: order.pickup_address, delivery_address: order.delivery_address,
    transport_type: order.transport_type, weight_kg: order.weight_kg, quantity: order.quantity,
    distance_km: order.distance_km ?? 150, stop_count: order.stop_count ?? 2,
    duration_hours: order.duration_hours ?? 3, requirements: order.requirements ?? [],
    day_of_week: new Date().getDay(), waiting_time_min: 0,
    pickup_country: "NL", delivery_country: "NL",
  }), [order]);

  const breakdown = useMemo(() => {
    if (!rateCard) return null;
    return calculateOrderPrice(pricingInput, rateCard, surcharges ?? []);
  }, [pricingInput, rateCard, surcharges]);

  if (isLoading) return <p className="text-sm text-muted-foreground">Prijs berekenen...</p>;

  if (!rateCard) {
    return (
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Calculator className="h-4 w-4" />Prijsberekening</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-amber-600 text-sm">
            <AlertCircle className="h-4 w-4" />
            Geen tariefkaart gevonden voor deze klant. Configureer een tarief in klantinstellingen of stel een standaardtarief in.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base"><Calculator className="h-4 w-4" />Prijsberekening</CardTitle>
          <Badge variant="outline">{rateCard.name}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {breakdown && breakdown.regels.length > 0 ? (
          <div className="space-y-3">
            <div className="space-y-1">
              {breakdown.regels.map((regel, idx) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{regel.description}</span>
                  <span className="font-mono tabular-nums">{formatCurrency(regel.total)}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-sm border-t pt-2">
              <span className="font-medium">Basisbedrag</span>
              <span className="font-mono tabular-nums font-medium">{formatCurrency(breakdown.basisbedrag)}</span>
            </div>
            {breakdown.toeslagen.length > 0 && (
              <div className="space-y-1">
                {breakdown.toeslagen.map((toeslag, idx) => (
                  <div key={idx} className="flex justify-between text-sm text-amber-700">
                    <span>+ {toeslag.name}</span>
                    <span className="font-mono tabular-nums">{formatCurrency(toeslag.amount)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-between border-t pt-2">
              <span className="font-bold">Totaal (excl. BTW)</span>
              <span className="font-mono tabular-nums font-bold text-lg">{formatCurrency(breakdown.totaal)}</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Geen tariefregels van toepassing op deze order.</p>
        )}
      </CardContent>
    </Card>
  );
}
