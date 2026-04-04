import { useState } from "react";
import {
  useVehicleMonthlyTotal,
  useCreateVehicleFixedCost,
  useDeleteVehicleFixedCost,
} from "@/hooks/useVehicleFixedCosts";
import { useCostTypes } from "@/hooks/useCostTypes";
import { useTenant } from "@/contexts/TenantContext";
import { formatCurrency } from "@/lib/invoiceUtils";
import { LoadingState } from "@/components/ui/LoadingState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";

interface VehicleFixedCostsCardProps {
  vehicleId: string;
  vehicleName: string;
}

export function VehicleFixedCostsCard({ vehicleId, vehicleName }: VehicleFixedCostsCardProps) {
  const { tenant } = useTenant();
  const { data: fixedCosts = [], isLoading, total } = useVehicleMonthlyTotal(vehicleId);
  const createFixedCost = useCreateVehicleFixedCost();
  const deleteFixedCost = useDeleteVehicleFixedCost();

  // Only VOERTUIG category cost types
  const { data: allCostTypes = [] } = useCostTypes({ activeOnly: true });
  const vehicleCostTypes = allCostTypes.filter((ct) => ct.category === "VOERTUIG");

  const [showForm, setShowForm] = useState(false);
  const [costTypeId, setCostTypeId] = useState("");
  const [monthlyAmount, setMonthlyAmount] = useState("");

  const handleCreate = async () => {
    if (!tenant?.id || !costTypeId || !monthlyAmount) return;
    const amount = parseFloat(monthlyAmount);
    if (isNaN(amount) || amount <= 0) return;

    await createFixedCost.mutateAsync({
      tenant_id: tenant.id,
      vehicle_id: vehicleId,
      cost_type_id: costTypeId,
      monthly_amount: amount,
    });
    setCostTypeId("");
    setMonthlyAmount("");
    setShowForm(false);
  };

  return (
    <Card className="rounded-2xl border-border/40">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-base font-semibold">Vaste kosten</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">{vehicleName}</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowForm((v) => !v)}
          className="gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          Toevoegen
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Create Form */}
        {showForm && (
          <div className="border border-border/60 rounded-xl p-4 space-y-4 bg-muted/20">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor={`vfc-type-${vehicleId}`}>Kostentype</Label>
                <Select value={costTypeId} onValueChange={setCostTypeId}>
                  <SelectTrigger id={`vfc-type-${vehicleId}`}>
                    <SelectValue placeholder="Selecteer type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {vehicleCostTypes.length === 0 ? (
                      <SelectItem value="_none" disabled>
                        Geen voertuigtypes beschikbaar
                      </SelectItem>
                    ) : (
                      vehicleCostTypes.map((ct) => (
                        <SelectItem key={ct.id} value={ct.id}>
                          {ct.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`vfc-amount-${vehicleId}`}>Maandbedrag (€)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    €
                  </span>
                  <Input
                    id={`vfc-amount-${vehicleId}`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={monthlyAmount}
                    onChange={(e) => setMonthlyAmount(e.target.value)}
                    placeholder="0.00"
                    className="pl-7"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowForm(false);
                  setCostTypeId("");
                  setMonthlyAmount("");
                }}
              >
                Annuleren
              </Button>
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={
                  createFixedCost.isPending ||
                  !costTypeId ||
                  !monthlyAmount ||
                  parseFloat(monthlyAmount) <= 0
                }
              >
                Opslaan
              </Button>
            </div>
          </div>
        )}

        {/* List */}
        {isLoading ? (
          <LoadingState message="Kosten laden..." />
        ) : fixedCosts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Geen vaste kosten voor dit voertuig.
          </p>
        ) : (
          <div className="divide-y divide-border/40 rounded-xl border border-border/40 overflow-hidden">
            {fixedCosts.map((cost) => (
              <div
                key={cost.id}
                className="flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {cost.cost_type?.name ?? "Onbekend"}
                  </p>
                  {(cost.valid_from || cost.valid_until) && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {cost.valid_from ?? "..."} — {cost.valid_until ?? "heden"}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 ml-4 shrink-0">
                  <span className="text-sm font-semibold tabular-nums">
                    {formatCurrency(cost.monthly_amount)} / mnd
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    disabled={deleteFixedCost.isPending}
                    onClick={() =>
                      deleteFixedCost.mutate({ id: cost.id, vehicleId })
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Total */}
        {fixedCosts.length > 0 && (
          <div className="flex items-center justify-between pt-2 border-t border-border/40">
            <span className="text-sm font-medium text-muted-foreground">
              Totaal per maand
            </span>
            <span className="text-base font-semibold tabular-nums">
              {formatCurrency(total)}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
