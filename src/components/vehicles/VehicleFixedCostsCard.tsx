import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Wallet } from "lucide-react";
import {
  useVehicleMonthlyTotal,
  useCreateVehicleFixedCost,
  useDeleteVehicleFixedCost,
} from "@/hooks/useVehicleFixedCosts";
import { useCostTypes } from "@/hooks/useCostTypes";
import { useTenant } from "@/contexts/TenantContext";
import { formatCurrency } from "@/lib/invoiceUtils";
import { LoadingState } from "@/components/ui/LoadingState";

interface VehicleFixedCostsCardProps {
  vehicleId: string;
  vehicleName: string;
}

export function VehicleFixedCostsCard({ vehicleId, vehicleName }: VehicleFixedCostsCardProps) {
  const { tenant } = useTenant();
  const { data: monthlyData, isLoading } = useVehicleMonthlyTotal(vehicleId);
  const { data: costTypes } = useCostTypes(true);
  const createCost = useCreateVehicleFixedCost();
  const deleteCost = useDeleteVehicleFixedCost();

  const [newCostTypeId, setNewCostTypeId] = useState("");
  const [newAmount, setNewAmount] = useState("");

  if (isLoading) return <LoadingState message="Vaste kosten laden..." />;

  const vehicleCostTypes = (costTypes ?? []).filter((ct) => ct.category === "VOERTUIG");
  const costs = monthlyData?.costs ?? [];
  const monthlyTotal = monthlyData?.monthlyTotal ?? 0;

  const handleCreate = async () => {
    if (!newCostTypeId || !newAmount || !tenant?.id) return;
    await createCost.mutateAsync({
      tenant_id: tenant.id,
      vehicle_id: vehicleId,
      cost_type_id: newCostTypeId,
      monthly_amount: parseFloat(newAmount),
    });
    setNewCostTypeId("");
    setNewAmount("");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          Vaste Kosten — {vehicleName}
        </CardTitle>
        <CardDescription>
          Maandelijkse vaste kosten zoals lease, verzekering, afschrijving, wegenbelasting.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Create form */}
        <div className="grid grid-cols-12 gap-2 items-end">
          <div className="col-span-5">
            <Label className="text-xs">Kostensoort</Label>
            <Select value={newCostTypeId} onValueChange={setNewCostTypeId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Selecteer..." /></SelectTrigger>
              <SelectContent>
                {vehicleCostTypes.map((ct) => (
                  <SelectItem key={ct.id} value={ct.id}>{ct.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-4">
            <Label className="text-xs">Maandbedrag (EUR)</Label>
            <Input type="number" step="0.01" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} placeholder="0.00" className="h-9" />
          </div>
          <div className="col-span-3">
            <Button onClick={handleCreate} disabled={!newCostTypeId || !newAmount} className="h-9 w-full">
              <Plus className="h-4 w-4 mr-1" /> Toevoegen
            </Button>
          </div>
        </div>

        {/* List */}
        <div className="space-y-2">
          {costs.map((cost) => (
            <div key={cost.id} className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <span className="font-medium">{cost.cost_type?.name ?? "Onbekend"}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono tabular-nums">{formatCurrency(cost.monthly_amount)} / maand</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteCost.mutateAsync({ id: cost.id, vehicleId })}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* Total */}
        {costs.length > 0 && (
          <div className="flex justify-between pt-3 border-t">
            <span className="font-bold">Totaal maandkosten</span>
            <span className="font-mono tabular-nums font-bold">{formatCurrency(monthlyTotal)}</span>
          </div>
        )}

        {costs.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nog geen vaste kosten geconfigureerd voor dit voertuig.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
