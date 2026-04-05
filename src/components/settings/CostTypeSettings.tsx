import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2 } from "lucide-react";
import { useCostTypes, useCreateCostType, useUpdateCostType, useDeleteCostType } from "@/hooks/useCostTypes";
import { useTenant } from "@/contexts/TenantContext";
import type { CostCategory, CalculationMethod } from "@/types/costModels";
import { COST_CATEGORIES, COST_CATEGORY_LABELS, CALCULATION_METHODS, CALCULATION_METHOD_LABELS } from "@/types/costModels";
import { LoadingState } from "@/components/ui/LoadingState";

export function CostTypeSettings() {
  const { tenant } = useTenant();
  const { data: costTypes, isLoading } = useCostTypes(false);
  const createCostType = useCreateCostType();
  const updateCostType = useUpdateCostType();
  const deleteCostType = useDeleteCostType();

  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<CostCategory>("OVERIG");
  const [newMethod, setNewMethod] = useState<CalculationMethod>("HANDMATIG");
  const [newRate, setNewRate] = useState("");

  if (isLoading) return <LoadingState message="Kostensoorten laden..." />;

  const handleCreate = async () => {
    if (!newName.trim() || !tenant?.id) return;
    await createCostType.mutateAsync({
      tenant_id: tenant.id,
      name: newName.trim(),
      category: newCategory,
      calculation_method: newMethod,
      default_rate: newRate ? parseFloat(newRate) : null,
    });
    setNewName("");
    setNewRate("");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kostensoorten</CardTitle>
        <CardDescription>
          Configureer de soorten kosten die per rit worden bijgehouden.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Create form */}
        <div className="grid grid-cols-12 gap-2 items-end">
          <div className="col-span-3">
            <Label className="text-xs">Naam</Label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Bijv. Tolkosten" className="h-9" />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Categorie</Label>
            <Select value={newCategory} onValueChange={(v) => setNewCategory(v as CostCategory)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {COST_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{COST_CATEGORY_LABELS[c]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Berekeningswijze</Label>
            <Select value={newMethod} onValueChange={(v) => setNewMethod(v as CalculationMethod)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CALCULATION_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>{CALCULATION_METHOD_LABELS[m]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Standaard tarief</Label>
            <Input type="number" step="0.01" value={newRate} onChange={(e) => setNewRate(e.target.value)} placeholder="Optioneel" className="h-9" />
          </div>
          <div className="col-span-3">
            <Button onClick={handleCreate} disabled={!newName.trim()} className="h-9 w-full">
              <Plus className="h-4 w-4 mr-1" /> Toevoegen
            </Button>
          </div>
        </div>

        {/* List */}
        <div className="space-y-2">
          {(costTypes ?? []).map((ct) => (
            <div key={ct.id} className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                <Switch
                  checked={ct.is_active}
                  onCheckedChange={(checked) =>
                    updateCostType.mutateAsync({ id: ct.id, updates: { is_active: checked } })
                  }
                />
                <div>
                  <span className="font-medium">{ct.name}</span>
                  <span className="text-sm text-muted-foreground ml-2">
                    {COST_CATEGORY_LABELS[ct.category]} / {CALCULATION_METHOD_LABELS[ct.calculation_method]}
                    {ct.default_rate != null && ` — ${ct.default_rate}`}
                  </span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (confirm("Kostensoort verwijderen?")) {
                    deleteCostType.mutateAsync(ct.id);
                  }
                }}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>

        {(costTypes ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            Geen kostensoorten geconfigureerd.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
