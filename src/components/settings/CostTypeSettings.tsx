import { useState } from "react";
import {
  useCostTypes,
  useCreateCostType,
  useUpdateCostType,
  useDeleteCostType,
} from "@/hooks/useCostTypes";
import { useTenant } from "@/contexts/TenantContext";
import {
  COST_CATEGORIES,
  COST_CATEGORY_LABELS,
  CALCULATION_METHODS,
  CALCULATION_METHOD_LABELS,
  type CostCategory,
  type CalculationMethod,
} from "@/types/costModels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";

const DEFAULT_FORM = {
  name: "",
  category: "OVERIG" as CostCategory,
  calculation_method: "HANDMATIG" as CalculationMethod,
  default_rate: "",
};

export function CostTypeSettings() {
  const { tenant } = useTenant();
  const { data: costTypes = [], isLoading } = useCostTypes({ activeOnly: false });
  const createCostType = useCreateCostType();
  const updateCostType = useUpdateCostType();
  const deleteCostType = useDeleteCostType();

  const [form, setForm] = useState(DEFAULT_FORM);
  const [showForm, setShowForm] = useState(false);

  const handleCreate = async () => {
    if (!tenant?.id || !form.name.trim()) return;
    await createCostType.mutateAsync({
      tenant_id: tenant.id,
      name: form.name.trim(),
      category: form.category,
      calculation_method: form.calculation_method,
      default_rate: form.default_rate ? parseFloat(form.default_rate) : null,
      is_active: true,
    });
    setForm(DEFAULT_FORM);
    setShowForm(false);
  };

  const handleToggleActive = (id: string, current: boolean) => {
    updateCostType.mutate({ id, updates: { is_active: !current } });
  };

  return (
    <Card className="rounded-2xl border-border/40">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base font-semibold">Kostentypes</CardTitle>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowForm((v) => !v)}
          className="gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          Nieuw type
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Create Form */}
        {showForm && (
          <div className="border border-border/60 rounded-xl p-4 space-y-4 bg-muted/20">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="ct-name">Naam</Label>
                <Input
                  id="ct-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="bv. Brandstof, Tol A1..."
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ct-category">Categorie</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, category: v as CostCategory }))
                  }
                >
                  <SelectTrigger id="ct-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COST_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {COST_CATEGORY_LABELS[cat]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ct-method">Berekeningswijze</Label>
                <Select
                  value={form.calculation_method}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, calculation_method: v as CalculationMethod }))
                  }
                >
                  <SelectTrigger id="ct-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CALCULATION_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {CALCULATION_METHOD_LABELS[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ct-rate">Standaard tarief (€)</Label>
                <Input
                  id="ct-rate"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.default_rate}
                  onChange={(e) => setForm((f) => ({ ...f, default_rate: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowForm(false);
                  setForm(DEFAULT_FORM);
                }}
              >
                Annuleren
              </Button>
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={createCostType.isPending || !form.name.trim()}
              >
                Opslaan
              </Button>
            </div>
          </div>
        )}

        {/* List */}
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Laden...</p>
        ) : costTypes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nog geen kostentypes aangemaakt.</p>
        ) : (
          <div className="divide-y divide-border/40 rounded-xl border border-border/40 overflow-hidden">
            {costTypes.map((ct) => (
              <div
                key={ct.id}
                className="flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{ct.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="secondary" className="text-xs h-4 px-1.5">
                        {COST_CATEGORY_LABELS[ct.category]}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {CALCULATION_METHOD_LABELS[ct.calculation_method]}
                      </span>
                      {ct.default_rate != null && (
                        <span className="text-xs text-muted-foreground">
                          € {ct.default_rate.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 ml-4 shrink-0">
                  <Switch
                    checked={ct.is_active}
                    onCheckedChange={() => handleToggleActive(ct.id, ct.is_active)}
                    disabled={updateCostType.isPending}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    disabled={deleteCostType.isPending}
                    onClick={() => {
                      if (confirm("Weet u zeker dat u deze kostensoort wilt verwijderen?")) {
                        deleteCostType.mutateAsync(ct.id);
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
