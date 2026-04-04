import { MapPin, Weight, Package, Route, Clock, CheckCircle2, XCircle, BarChart3 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ConsolidationGroup } from "@/types/consolidation";
import { CONSOLIDATION_STATUS_LABELS } from "@/types/consolidation";

interface ConsolidationCardProps {
  group: ConsolidationGroup;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

export function ConsolidationCard({ group, onApprove, onReject }: ConsolidationCardProps) {
  const statusMeta = CONSOLIDATION_STATUS_LABELS[group.status];
  const utilizationPct = group.utilization_pct != null ? Math.round(group.utilization_pct * 100) : null;

  const formatDuration = (min: number | null) => {
    if (min == null) return "-";
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? `${h}u ${m}m` : `${m}m`;
  };

  return (
    <Card className="flex flex-col rounded-xl border-border/40 shadow-sm">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold truncate">{group.name}</CardTitle>
          <Badge className={cn("text-xs shrink-0", statusMeta.color)}>{statusMeta.label}</Badge>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4 space-y-3">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="flex flex-col items-center rounded-lg bg-muted/40 py-2 px-1">
            <Weight className="h-3.5 w-3.5 text-muted-foreground mb-0.5" />
            <span className="font-semibold">{group.total_weight_kg ?? "-"} kg</span>
            <span className="text-muted-foreground">Gewicht</span>
          </div>
          <div className="flex flex-col items-center rounded-lg bg-muted/40 py-2 px-1">
            <Package className="h-3.5 w-3.5 text-muted-foreground mb-0.5" />
            <span className="font-semibold">{group.total_pallets ?? "-"}</span>
            <span className="text-muted-foreground">Pallets</span>
          </div>
          <div className="flex flex-col items-center rounded-lg bg-muted/40 py-2 px-1">
            <BarChart3 className="h-3.5 w-3.5 text-muted-foreground mb-0.5" />
            <span className={cn(
              "font-semibold",
              utilizationPct != null && utilizationPct > 90 ? "text-amber-600" : "text-foreground",
            )}>
              {utilizationPct != null ? `${utilizationPct}%` : "-"}
            </span>
            <span className="text-muted-foreground">Benutting</span>
          </div>
        </div>

        {/* Distance / Duration */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Route className="h-3 w-3" />
            {group.total_distance_km != null ? `${group.total_distance_km} km` : "-"}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDuration(group.estimated_duration_min)}
          </span>
        </div>

        {/* Utilization bar */}
        {utilizationPct != null && (
          <div>
            <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-300",
                  utilizationPct > 100 ? "bg-destructive" : utilizationPct > 90 ? "bg-amber-500" : "bg-emerald-500",
                )}
                style={{ width: `${Math.min(utilizationPct, 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Order list */}
        {group.orders && group.orders.length > 0 && (
          <div className="space-y-1">
            {group.orders.map((co) => (
              <div
                key={co.id}
                className="rounded-lg border border-border/30 bg-muted/20 px-2.5 py-1.5 text-xs"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-medium truncate">
                    {co.order?.client_name ?? `Order #${co.order?.order_number ?? co.order_id}`}
                  </span>
                  {co.order?.requirements && co.order.requirements.length > 0 && (
                    <span className="text-amber-600 text-[10px] shrink-0">
                      {co.order.requirements.join(", ")}
                    </span>
                  )}
                </div>
                {co.order?.delivery_address && (
                  <div className="flex items-center gap-1 text-muted-foreground mt-0.5">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">{co.order.delivery_address}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Approve / Reject buttons — only for VOORSTEL */}
        {group.status === "VOORSTEL" && (
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              className="flex-1 h-8 text-xs gap-1.5"
              onClick={() => onApprove(group.id)}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Goedkeuren
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-8 text-xs gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/5"
              onClick={() => onReject(group.id)}
            >
              <XCircle className="h-3.5 w-3.5" />
              Verwerpen
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
