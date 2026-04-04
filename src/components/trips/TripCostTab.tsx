import { useTripCosts, useDeleteTripCost } from "@/hooks/useTripCosts";
import { calculateMargin } from "@/lib/costEngine";
import { formatCurrency } from "@/lib/invoiceUtils";
import { COST_CATEGORY_LABELS } from "@/types/costModels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface TripCostTabProps {
  tripId: string;
  revenue: number;
}

export function TripCostTab({ tripId, revenue }: TripCostTabProps) {
  const { data: costs = [], isLoading } = useTripCosts(tripId);
  const deleteCost = useDeleteTripCost();

  const totalCost = costs.reduce((sum, c) => sum + c.amount, 0);
  const margin = calculateMargin(revenue, totalCost);

  const marginColor =
    margin.margin_percentage >= 20
      ? "text-emerald-600"
      : margin.margin_percentage >= 0
      ? "text-amber-600"
      : "text-red-600";

  const MarginIcon =
    margin.margin_percentage > 0
      ? TrendingUp
      : margin.margin_percentage < 0
      ? TrendingDown
      : Minus;

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-4">Laden...</p>;
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="rounded-xl border-border/40">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Opbrengst
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-semibold text-foreground">
              {formatCurrency(revenue)}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-border/40">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Kosten
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-semibold text-foreground">
              {formatCurrency(totalCost)}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-border/40">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Marge
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="flex items-center gap-2">
              <p className={`text-2xl font-semibold ${marginColor}`}>
                {formatCurrency(margin.margin_euro)}
              </p>
              <div className={`flex items-center gap-0.5 ${marginColor}`}>
                <MarginIcon className="h-4 w-4" />
                <span className="text-sm font-medium">
                  {margin.margin_percentage.toFixed(1)}%
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cost Items List */}
      <Card className="rounded-xl border-border/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Kostenposten</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {costs.length === 0 ? (
            <p className="text-sm text-muted-foreground px-4 pb-4">
              Geen kosten gevonden voor deze rit.
            </p>
          ) : (
            <div className="divide-y divide-border/40">
              {costs.map((cost) => (
                <div
                  key={cost.id}
                  className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {cost.cost_type?.name ?? "Onbekend kostentype"}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {cost.cost_type?.category && (
                          <span className="text-xs text-muted-foreground">
                            {COST_CATEGORY_LABELS[cost.cost_type.category]}
                          </span>
                        )}
                        <Badge
                          variant={cost.source === "AUTO" ? "secondary" : "outline"}
                          className="text-xs h-4 px-1.5"
                        >
                          {cost.source}
                        </Badge>
                      </div>
                      {cost.notes && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {cost.notes}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 ml-4 shrink-0">
                    <span className="text-sm font-semibold tabular-nums">
                      {formatCurrency(cost.amount)}
                    </span>
                    {cost.source === "HANDMATIG" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        disabled={deleteCost.isPending}
                        onClick={() =>
                          deleteCost.mutate({ id: cost.id, tripId: cost.trip_id })
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
