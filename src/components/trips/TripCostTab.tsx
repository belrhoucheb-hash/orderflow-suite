import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wallet, TrendingUp, TrendingDown, Trash2 } from "lucide-react";
import { useTripCosts, useDeleteTripCost } from "@/hooks/useTripCosts";
import { formatCurrency } from "@/lib/invoiceUtils";
import { calculateMargin } from "@/lib/costEngine";
import type { MarginResult } from "@/types/costModels";
import { COST_CATEGORY_LABELS } from "@/types/costModels";
import { LoadingState } from "@/components/ui/LoadingState";

interface TripCostTabProps {
  tripId: string;
  revenue: number; // From invoice / F2 pricing
}

export function TripCostTab({ tripId, revenue }: TripCostTabProps) {
  const { data: costs, isLoading } = useTripCosts(tripId);
  const deleteCost = useDeleteTripCost();

  const totalCost = useMemo(() => {
    return (costs ?? []).reduce((sum, c) => sum + c.amount, 0);
  }, [costs]);

  const margin: MarginResult = useMemo(() => {
    return calculateMargin(revenue, totalCost);
  }, [revenue, totalCost]);

  if (isLoading) return <LoadingState message="Kosten laden..." />;

  const isPositiveMargin = margin.margin_euro >= 0;

  return (
    <div className="space-y-4">
      {/* Margin summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-sm text-muted-foreground">Opbrengst</p>
            <p className="text-xl font-bold text-green-600">{formatCurrency(revenue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-sm text-muted-foreground">Kosten</p>
            <p className="text-xl font-bold text-red-600">{formatCurrency(totalCost)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-sm text-muted-foreground">Marge</p>
            <div className="flex items-center justify-center gap-2">
              {isPositiveMargin ? (
                <TrendingUp className="h-5 w-5 text-green-600" />
              ) : (
                <TrendingDown className="h-5 w-5 text-red-600" />
              )}
              <p className={`text-xl font-bold ${isPositiveMargin ? "text-green-600" : "text-red-600"}`}>
                {formatCurrency(margin.margin_euro)} ({margin.margin_percentage}%)
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cost items */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="h-4 w-4" />
              Kostenoverzicht
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {(costs ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nog geen kosten geregistreerd voor deze rit.
            </p>
          ) : (
            <div className="space-y-2">
              {(costs ?? []).map((cost) => (
                <div key={cost.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div>
                      <span className="font-medium">
                        {cost.cost_type?.name ?? "Onbekend"}
                      </span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="outline" className="text-xs">
                          {cost.cost_type?.category
                            ? COST_CATEGORY_LABELS[cost.cost_type.category as keyof typeof COST_CATEGORY_LABELS]
                            : "Overig"}
                        </Badge>
                        <Badge
                          variant={cost.source === "AUTO" ? "secondary" : "default"}
                          className="text-xs"
                        >
                          {cost.source}
                        </Badge>
                        {cost.notes && (
                          <span className="text-xs text-muted-foreground">{cost.notes}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono tabular-nums font-medium">
                      {formatCurrency(cost.amount)}
                    </span>
                    {cost.source === "HANDMATIG" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteCost.mutateAsync({ id: cost.id, tripId })}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              {/* Total */}
              <div className="flex justify-between pt-3 border-t">
                <span className="font-bold">Totaal kosten</span>
                <span className="font-mono tabular-nums font-bold text-lg">
                  {formatCurrency(totalCost)}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
