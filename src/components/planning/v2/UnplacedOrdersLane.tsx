import { AlertTriangle, MapPin, PackageCheck } from "lucide-react";
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
      <div className="callout--luxe">
        <PackageCheck className="callout--luxe__icon h-5 w-5" />
        <div>
          <div className="callout--luxe__title">Alles is ingepland</div>
          <div className="callout--luxe__body">
            Geen open orders meer voor deze dag. Alle zendingen zitten in een cluster of zijn bewust verworpen.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card--luxe p-5 space-y-4">
      <div className="flex items-center justify-between pb-3 hairline border-b-0">
        <h3 className="section-title flex items-center gap-2 !m-0">
          <AlertTriangle className="h-4 w-4 text-[hsl(var(--gold-deep))]" />
          Open te plannen
        </h3>
        <span className="chiplet chiplet--warn">{orders.length} orders</span>
      </div>

      <div className="space-y-4">
        {regionKeys.map((region) => (
          <div key={region}>
            <div className="section-label mb-2">
              Regio {region}, {groupedByRegion.get(region)!.length} orders
            </div>
            <div className="space-y-2">
              {groupedByRegion.get(region)!.map((o) => {
                const hint = hintByOrderId.get(o.id);
                const hasIssue = !!hint;
                return (
                  <div
                    key={o.id}
                    className={cn(
                      "rounded-lg border p-3 text-sm transition-colors",
                      hasIssue
                        ? "border-red-300/70 bg-red-50/40"
                        : "border-[hsl(var(--gold)/0.15)] bg-[hsl(var(--gold-soft)/0.18)] hover:bg-[hsl(var(--gold-soft)/0.3)]",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold truncate">
                          #{o.order_number} {o.client_name}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground truncate mt-0.5">
                          <MapPin className="h-3 w-3 shrink-0 text-[hsl(var(--gold-deep))]" />
                          {o.delivery_address || "Geen adres"}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground shrink-0 text-right">
                        {o.weight_kg ?? 0} kg<br />
                        {o.quantity ?? 0} pal
                      </div>
                    </div>
                    {hint && (
                      <div className="mt-2 text-xs text-red-700">
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
    </div>
  );
}
