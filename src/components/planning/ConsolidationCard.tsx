import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Truck, Package, Weight, Clock, CheckCircle2, XCircle } from "lucide-react";
import type { ConsolidationGroup } from "@/types/consolidation";
import { CONSOLIDATION_STATUS_LABELS } from "@/types/consolidation";
import { cn } from "@/lib/utils";

interface Props {
  group: ConsolidationGroup;
  onApprove: (groupId: string) => void;
  onReject: (groupId: string) => void;
}

// NOTE: Parent should wrap `onApprove` and `onReject` in useCallback to preserve memo benefits.
function ConsolidationCardInner({ group, onApprove, onReject }: Props) {
  const statusInfo = CONSOLIDATION_STATUS_LABELS[group.status];
  const isProposal = group.status === "VOORSTEL";

  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">{group.name}</CardTitle>
          <Badge className={cn("text-xs", statusInfo.color)} variant="secondary">
            {statusInfo.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="flex items-center gap-1">
            <Weight className="h-3 w-3 text-muted-foreground" />
            <span>{group.total_weight_kg} kg</span>
          </div>
          <div className="flex items-center gap-1">
            <Package className="h-3 w-3 text-muted-foreground" />
            <span>{group.total_pallets} pallets</span>
          </div>
          <div className="flex items-center gap-1">
            <Truck className="h-3 w-3 text-muted-foreground" />
            <span>{group.utilization_pct}%</span>
          </div>
        </div>

        {group.total_distance_km != null && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{group.total_distance_km} km</span>
            {group.estimated_duration_min != null && (
              <span>/ ~{Math.round(group.estimated_duration_min / 60)}u {group.estimated_duration_min % 60}m</span>
            )}
          </div>
        )}

        {/* Utilization bar */}
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div
            className={cn(
              "h-2 rounded-full",
              (group.utilization_pct || 0) >= 80 ? "bg-green-500" :
              (group.utilization_pct || 0) >= 50 ? "bg-amber-400" : "bg-red-400"
            )}
            style={{ width: `${Math.min(100, group.utilization_pct || 0)}%` }}
          />
        </div>

        {/* Orders list */}
        {group.orders && group.orders.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">{group.orders.length} orders:</p>
            {group.orders.map((co) => (
              <div key={co.id} className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1">
                <span className="font-medium">#{co.order?.order_number} {co.order?.client_name}</span>
                <span className="text-muted-foreground">{co.order?.weight_kg} kg</span>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        {isProposal && (
          <div className="flex gap-2 pt-1">
            <Button size="sm" className="flex-1" onClick={() => onApprove(group.id)}>
              <CheckCircle2 className="h-3 w-3 mr-1" /> Goedkeuren
            </Button>
            <Button size="sm" variant="outline" className="flex-1" onClick={() => onReject(group.id)}>
              <XCircle className="h-3 w-3 mr-1" /> Verwerpen
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export const ConsolidationCard = React.memo(ConsolidationCardInner);
