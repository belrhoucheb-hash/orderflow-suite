import { AlertTriangle, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getPostcodeRegion } from "@/data/geoData";

export interface UnplacedOrderHint {
  order_id: string;
  reason: string;
  detail?: string;
}

interface UnplacedOrder {
  id: string;
  order_number: number;
  client_name: string | null;
  delivery_address: string | null;
  weight_kg: number | null;
  quantity: number | null;
  requirements: string[] | null;
}

interface UnplacedOrdersLaneProps {
  orders: UnplacedOrder[];
  hints: UnplacedOrderHint[];
}

const REASON_LABELS: Record<string, string> = {
  no_address: "Geen postcode in adres",
  no_vehicle_type: "Geen voertuigtype bepaald",
  no_matching_vehicle: "Geen passend voertuig vrij",
  no_matching_driver: "Geen chauffeur beschikbaar of contracturen op",
  over_capacity: "Zending te groot voor beschikbare voertuigen",
  over_contract_hours: "Contracturen overschreden",
};

export function UnplacedOrdersLane({ orders, hints }: UnplacedOrdersLaneProps) {
  const hintByOrderId = new Map(hints.map((h) => [h.order_id, h]));

  const groupedByRegion = new Map<string, UnplacedOrder[]>();
  for (const o of orders) {
    const region = getPostcodeRegion(o.delivery_address ?? "") || "onbekend";
    if (!groupedByRegion.has(region)) groupedByRegion.set(region, []);
    groupedByRegion.get(region)!.push(o);
  }
  const regionKeys = [...groupedByRegion.keys()].sort();

  if (orders.length === 0) {
    return (
      <Card className="p-4 bg-muted/20">
        <div className="text-sm text-muted-foreground italic">
          Geen open orders. Alle zendingen zijn ingepland of verworpen.
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 space-y-3 border-orange-200/60">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          Open te plannen
        </h3>
        <Badge variant="outline" className="bg-amber-100 text-amber-800">
          {orders.length} orders
        </Badge>
      </div>

      <div className="space-y-3">
        {regionKeys.map((region) => (
          <div key={region}>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
              Regio {region}, {groupedByRegion.get(region)!.length} orders
            </div>
            <div className="space-y-1.5">
              {groupedByRegion.get(region)!.map((o) => {
                const hint = hintByOrderId.get(o.id);
                const hasIssue = !!hint;
                return (
                  <div
                    key={o.id}
                    className={cn(
                      "rounded-md border p-2 text-sm",
                      hasIssue ? "border-red-300/70 bg-red-50/40" : "border-border/60 bg-background",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate">
                          #{o.order_number} {o.client_name}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {o.delivery_address || "Geen adres"}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground shrink-0">
                        {o.weight_kg ?? 0} kg, {o.quantity ?? 0} pal
                      </div>
                    </div>
                    {hint && (
                      <div className="mt-1 text-xs text-red-700">
                        {REASON_LABELS[hint.reason] ?? hint.reason}
                        {hint.detail && <span className="text-muted-foreground"> ({hint.detail})</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
